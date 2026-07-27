import { query, withTransaction } from "@/lib/db";
import {
  STATION_SHIFT_TIMES,
  normalizeStationName,
  getActivePostaForStation,
} from "@/lib/shiftUtils";

/**
 * Sayım (günlük kontrol + envanter) uyarı motoru.
 *
 * Her şube için o şubenin POSTA DEĞİŞİM SAATİNDEN (system_settings'ten okunur,
 * şubeye göre farklı olabilir) 20 dk sonra, o vardiyada günlük araç kontrolü
 * ve/veya envanter sayımı yapılmamış araçların plakalarını tespit eder ve o günkü
 * aktif postanın başçavuşu + çavuşları + Amir Ahmet Yıldız'a plaka bazlı tek SMS
 * gönderir. Idempotent (istasyon+gün başına bir kez).
 *
 * Bu fonksiyon hem uygulama içi zamanlayıcı (instrumentation) hem de test/önizleme
 * endpoint'i (/api/cron/sayim-uyari) tarafından çağrılır. Harici cron GEREKMEZ.
 *
 * NOT: Saat hesabı sunucu yerel saatine göredir; Docker'da TZ=Europe/Istanbul ayarlı.
 */

const AMIR_SABIT_SICIL = "SB5803"; // Amir Ahmet Yıldız
const GECIKME_DK = 20;  // posta değişiminden kaç dk sonra kontrol edilir
const PENCERE_DK = 90;  // kontrol penceresi (tetik gecikse de yakalar; idempotency tekrarı önler)

const ISTASYON_GRUPLARI: Array<{ key: keyof typeof STATION_SHIFT_TIMES; label: string }> = [
  { key: "Merkez", label: "Merkez İstasyonu" },
  { key: "Esentepe", label: "Esentepe Şubesi" },
  { key: "Organize", label: "Organize (OSB) İstasyonu" },
];

interface ShiftTimes { [k: string]: { hours: number; minutes: number } }

async function getShiftTimes(): Promise<typeof STATION_SHIFT_TIMES> {
  const times: ShiftTimes = JSON.parse(JSON.stringify(STATION_SHIFT_TIMES));
  try {
    const res = await query(
      "SELECT key, value FROM system_settings WHERE key IN ('merkez_shift_time','esentepe_shift_time','organize_shift_time')"
    );
    const map: Record<string, string> = {};
    for (const r of res.rows) map[r.key] = r.value;
    const parse = (v?: string) => {
      if (!v || !/^\d{1,2}:\d{2}$/.test(v)) return null;
      const [h, m] = v.split(":").map(Number);
      return { hours: h, minutes: m };
    };
    if (parse(map.merkez_shift_time)) times.Merkez = parse(map.merkez_shift_time)!;
    if (parse(map.esentepe_shift_time)) times.Esentepe = parse(map.esentepe_shift_time)!;
    if (parse(map.organize_shift_time)) times.Organize = parse(map.organize_shift_time)!;
  } catch { /* sistem ayarları yoksa varsayılan saatler kullanılır */ }
  return times as typeof STATION_SHIFT_TIMES;
}

async function sendSms(phoneNumbers: string[], content: string): Promise<boolean> {
  if (!process.env.SMS_API_KEY || !process.env.SMS_API_SECRET) {
    console.warn("[sayim-uyari] SMS anahtarları yok — gönderim atlandı.");
    return false;
  }
  const res = await fetch("https://bildirim.sivas.bel.tr/api/v1/sms-send-bulk", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": process.env.SMS_API_KEY,
      "X-Api-Secret": process.env.SMS_API_SECRET,
    },
    body: JSON.stringify({ phoneNumbers, content }),
  });
  if (!res.ok) {
    console.error("[sayim-uyari] SMS API hatası:", res.status, await res.text());
    return false;
  }
  return true;
}

export interface SayimUyariResult {
  success: boolean;
  zaman: string;
  rapor: any[];
  error?: string;
}

/**
 * @param dryRun true ise SMS göndermez, damgalamaz ve zaman penceresi/idempotency
 *   kontrollerini atlar (önizleme). false ise gerçek çalışma: yalnızca posta+20dk
 *   penceresindeki şubeler için, günde bir kez SMS gönderir.
 */
export async function runSayimUyari(dryRun = false): Promise<SayimUyariResult> {
  const now = new Date(); // sunucu TZ = Europe/Istanbul
  const shiftTimes = await getShiftTimes();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const vehRes = await query("SELECT plaka, istasyon FROM vehicles WHERE plaka IS NOT NULL");
  const gruplar: Record<string, string[]> = { Merkez: [], Esentepe: [], Organize: [] };
  for (const v of vehRes.rows) {
    const g = normalizeStationName(v.istasyon);
    const key = g === "Default" ? "Merkez" : g;
    if (gruplar[key]) gruplar[key].push(v.plaka);
  }

  const rapor: any[] = [];

  for (const grup of ISTASYON_GRUPLARI) {
    const plakalar = gruplar[grup.key] || [];
    if (plakalar.length === 0) continue;

    const st = shiftTimes[grup.key];
    const shiftChange = new Date(now);
    shiftChange.setHours(st.hours, st.minutes, 0, 0);
    const kontrolAni = new Date(shiftChange.getTime() + GECIKME_DK * 60000);
    const pencereSonu = new Date(kontrolAni.getTime() + PENCERE_DK * 60000);

    // Her şube kendi posta+20dk penceresinde değerlendirilir (dryRun'da atlanır)
    if (!dryRun && (now < kontrolAni || now > pencereSonu)) {
      rapor.push({ istasyon: grup.label, atlandi: "zaman penceresi dışında" });
      continue;
    }

    const sinceIso = shiftChange.toISOString();
    const [dailyRes, invRes] = await Promise.all([
      query("SELECT DISTINCT plaka FROM daily_vehicle_checks WHERE created_at >= $1 AND plaka = ANY($2)", [sinceIso, plakalar]),
      query("SELECT DISTINCT plaka FROM inventory_checks WHERE created_at >= $1 AND plaka = ANY($2)", [sinceIso, plakalar]),
    ]);
    const gunlukYapilan = new Set(dailyRes.rows.map((r) => r.plaka));
    const envanterYapilan = new Set(invRes.rows.map((r) => r.plaka));

    const eksikGunluk = plakalar.filter((p) => !gunlukYapilan.has(p));
    const eksikEnvanter = plakalar.filter((p) => !envanterYapilan.has(p));

    if (eksikGunluk.length === 0 && eksikEnvanter.length === 0) {
      rapor.push({ istasyon: grup.label, durum: "tüm araçlar tamam" });
      continue;
    }

    // Idempotency ön kontrolü (hızlı yol; asıl güvence aşağıdaki kilitli bölümde)
    const damga = await query(
      `SELECT 1 FROM audit_logs WHERE action_type = 'sayim_uyari' AND target = $1 AND (details->>'gun') = $2 LIMIT 1`,
      [grup.label, today]
    );
    if (!dryRun && damga.rowCount && damga.rowCount > 0) {
      rapor.push({ istasyon: grup.label, atlandi: "bugün zaten gönderildi" });
      continue;
    }

    const aktifPosta = getActivePostaForStation(grup.label, now, shiftTimes);
    const postaLabel = `${aktifPosta}. Posta`;
    // Şubenin istasyon adı kalıpları (personnel.istasyon eşleştirmesi)
    const istPatterns =
      grup.key === "Merkez" ? ["%merkez%"]
      : grup.key === "Esentepe" ? ["%esentepe%"]
      : ["%organize%", "%osb%"];
    // Şube bazlı alıcılar:
    //  1) O şubedeki aktif postanın çavuş/başçavuşları
    //  2) O postanın başçavuşu (posta sorumlusu — şube farketmez)
    //  3) Sabit Amir Ahmet Yıldız
    const alRes = await query(
      `SELECT DISTINCT COALESCE(p.telefon, pd.telefon) AS tel
       FROM public.personnel p
       LEFT JOIN public.personnel_details pd ON p.sicil_no = pd.sicil_no
       WHERE p.aktif = true
         AND (
           (p.posta = $1 AND (p.unvan ILIKE '%çvş%' OR p.unvan ILIKE '%çavuş%') AND p.istasyon ILIKE ANY($2))
           OR (p.posta = $1 AND (p.unvan ILIKE '%baş%çvş%' OR p.unvan ILIKE '%başçavuş%' OR p.unvan ILIKE '%baş.çvş%'))
           OR p.sicil_no = $3
         )
         AND COALESCE(p.telefon, pd.telefon) IS NOT NULL AND COALESCE(p.telefon, pd.telefon) <> ''`,
      [postaLabel, istPatterns, AMIR_SABIT_SICIL]
    );
    const phones = alRes.rows.map((r) => String(r.tel).replace(/\s+/g, "")).filter((p) => p.length >= 10);

    let icerik = `[SAYIM UYARISI - ${grup.label} / ${postaLabel}]\n`;
    if (eksikGunluk.length > 0) icerik += `\nGünlük kontrolü YAPILMAYAN araçlar:\n${eksikGunluk.join(", ")}\n`;
    if (eksikEnvanter.length > 0) icerik += `\nEnvanter sayımı YAPILMAYAN araçlar:\n${eksikEnvanter.join(", ")}\n`;
    icerik += `\nLütfen ivedilikle tamamlatınız.`;

    if (dryRun) {
      rapor.push({ istasyon: grup.label, postaLabel, eksikGunluk, eksikEnvanter, aliciSayisi: phones.length, dryRun: true });
      continue;
    }

    // Gönderim + damga, advisory lock altında tek transaction'da yapılır:
    //  - Eşzamanlı iki tetik (çoklu instance / manuel + zamanlayıcı) birbirini bekler;
    //    kilidi alan ikinci tetik damgayı görüp gönderimi atlar → çift SMS olmaz.
    //  - Damga YALNIZCA SMS başarılıysa yazılır; başarısız gönderim pencere içindeki
    //    bir sonraki tetikte yeniden denenir (eskiden damga her koşulda atılıyordu).
    let smsOk = false;
    let atlandi = false;
    if (phones.length > 0) {
      await withTransaction(async (tx) => {
        await tx(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`sayim_uyari:${grup.label}:${today}`]);
        const yeniden = await tx(
          `SELECT 1 FROM audit_logs WHERE action_type = 'sayim_uyari' AND target = $1 AND (details->>'gun') = $2 LIMIT 1`,
          [grup.label, today]
        );
        if (yeniden.rowCount && yeniden.rowCount > 0) {
          atlandi = true;
          return;
        }
        smsOk = await sendSms(phones, icerik);
        if (smsOk) {
          await tx(
            `INSERT INTO audit_logs (action_type, actor_sicil_no, actor_name, target, details)
             VALUES ('sayim_uyari', 'SYSTEM', 'Otomatik Uyarı', $1, $2)`,
            [grup.label, JSON.stringify({ gun: today, posta: postaLabel, eksikGunluk, eksikEnvanter, aliciSayisi: phones.length, smsOk })]
          );
        }
      });
    }

    if (atlandi) {
      rapor.push({ istasyon: grup.label, atlandi: "bugün zaten gönderildi" });
    } else {
      rapor.push({ istasyon: grup.label, postaLabel, eksikGunluk, eksikEnvanter, aliciSayisi: phones.length, smsOk });
    }
  }

  return { success: true, zaman: now.toISOString(), rapor };
}
