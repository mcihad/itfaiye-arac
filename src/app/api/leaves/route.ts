import { NextRequest, NextResponse } from 'next/server';
import { withTransaction } from '@/lib/db';
import { getSessionFromRequest, isManagerSession } from '@/lib/auth';

/**
 * Merkezi izin ucu.
 *
 * İzin yazma mantığı eskiden dört ekranda bağımsız kopyalanmıştı
 * (LeaveManagementModal, FutureShiftCalendar, ShiftList, personel/[id]) ve her
 * biri farklı yan etkiler üretiyordu: kimi personel durumunu güncelliyor, kimi
 * özlük kaydı yazmıyordu. Artık tüm ekranlar bu uca istek atar; izin kaydı,
 * personel durumu ve özlük (hizmet dökümü) kaydı HER ZAMAN birlikte ve tek
 * transaction içinde yazılır.
 *
 * POST  — izin oluştur/güncelle (toplu):
 *   { sicil_nos: string[], izin_turu, baslangic_tarihi: 'YYYY-MM-DD',
 *     gun?: number, bitis_tarihi?: 'YYYY-MM-DD', aciklama?, kaynak? }
 *   Başlangıç gününü kapsayan mevcut izin varsa o kayıt güncellenir; aralıkla
 *   çakışan BAŞKA bir izin varsa o personel için işlem reddedilir (çakışma).
 *
 * DELETE — izin iptali:
 *   { sicil_nos: string[], tarih: 'YYYY-MM-DD', kaynak? }  → o gün aktif izni siler
 *   { id: <izin kaydı id>, kaynak? }                        → belirli kaydı siler
 *   Her iki durumda da personelin bugünkü durumu yeniden hesaplanır (bugünü
 *   kapsayan başka izin varsa o izne, yoksa 'Hazır'a çekilir).
 *
 * Yanıt: { results: [{ sicil_no, ok, error? }], okCount, failCount }
 * Toplu istekte her personel kendi transaction'ında işlenir: birinin hatası
 * diğerlerini geri almaz; sonuç kişi bazında raporlanır.
 */

const IZIN_TURLERI = new Set([
  'İzinli', 'Yıllık İzin', 'Mazeret İzni', 'Raporlu',
  'Geçici Görev', 'Dış Görev', 'Geçici Şube Görevi',
]);

const TARIH_REGEX = /^\d{4}-\d{2}-\d{2}$/;

type Tx = <R extends import('pg').QueryResultRow = any>(text: string, params?: any[]) => Promise<import('pg').QueryResult<R>>;

function addDaysISO(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function todayISO(): string {
  // Sunucu TZ = Europe/Istanbul (Docker); yerel takvim günü
  return new Date().toLocaleDateString('en-CA');
}

interface PersonResult {
  sicil_no: string;
  ok: boolean;
  error?: string;
}

/** Personelin verilen gündeki durumunu izin defterine göre günceller. */
async function refreshPersonnelDurum(tx: Tx, sicilNo: string, today: string) {
  const aktif = await tx<{ izin_turu: string; aciklama: string | null }>(
    `SELECT izin_turu, aciklama FROM personnel_leaves
     WHERE sicil_no = $1 AND baslangic_tarihi <= $2::date AND bitis_tarihi >= $2::date
     ORDER BY created_at DESC LIMIT 1`,
    [sicilNo, today]
  );
  const row = aktif.rows[0];
  const yeniDurum = row
    ? (row.aciklama && !row.aciklama.endsWith('eklendi.') ? `${row.izin_turu} - ${row.aciklama}` : row.izin_turu)
    : 'Hazır';
  await tx(`UPDATE personnel SET durum = $1 WHERE sicil_no = $2`, [yeniDurum, sicilNo]);
}

export async function POST(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'Oturum açmanız gerekiyor.' }, { status: 401 });
    }
    if (!isManagerSession(session)) {
      return NextResponse.json({ error: 'İzin işlemleri için yönetici yetkisi gereklidir.' }, { status: 403 });
    }

    const body = await request.json();
    const sicilNos: string[] = Array.isArray(body.sicil_nos) ? body.sicil_nos.map(String) : [];
    const izinTuru: string = String(body.izin_turu || '');
    const baslangic: string = String(body.baslangic_tarihi || '');
    const aciklama: string = String(body.aciklama || '').slice(0, 500);
    const kaynak: string = String(body.kaynak || 'İzin Modülü').slice(0, 100);

    if (sicilNos.length === 0 || sicilNos.length > 200) {
      return NextResponse.json({ error: 'En az 1, en fazla 200 personel seçilmelidir.' }, { status: 400 });
    }
    if (!IZIN_TURLERI.has(izinTuru)) {
      return NextResponse.json({ error: `Geçersiz izin türü: ${izinTuru}` }, { status: 400 });
    }
    if (!TARIH_REGEX.test(baslangic)) {
      return NextResponse.json({ error: 'Geçersiz başlangıç tarihi.' }, { status: 400 });
    }

    let bitis: string;
    if (body.bitis_tarihi) {
      bitis = String(body.bitis_tarihi);
      if (!TARIH_REGEX.test(bitis) || bitis < baslangic) {
        return NextResponse.json({ error: 'Geçersiz bitiş tarihi.' }, { status: 400 });
      }
    } else {
      const gun = parseInt(String(body.gun ?? 1), 10);
      if (!Number.isFinite(gun) || gun < 1 || gun > 365) {
        return NextResponse.json({ error: 'Gün sayısı 1-365 aralığında olmalıdır.' }, { status: 400 });
      }
      bitis = addDaysISO(baslangic, gun - 1);
    }

    const today = todayISO();
    const kayitAciklama = aciklama || `${izinTuru} eklendi.`;
    const results: PersonResult[] = [];

    for (const sicilNo of sicilNos) {
      try {
        await withTransaction(async (tx) => {
          // 1) Başlangıç gününü kapsayan mevcut izin → güncelle
          const aktif = await tx<{ id: number }>(
            `SELECT id FROM personnel_leaves
             WHERE sicil_no = $1 AND baslangic_tarihi <= $2::date AND bitis_tarihi >= $2::date
             LIMIT 1`,
            [sicilNo, baslangic]
          );

          if (aktif.rows[0]) {
            await tx(
              `UPDATE personnel_leaves
               SET izin_turu = $1, bitis_tarihi = $2::date, aciklama = $3,
                   durum = 'Onaylandı', onaylayan_sicil = $4, updated_at = NOW()
               WHERE id = $5`,
              [izinTuru, bitis, kayitAciklama, session.sicilNo, aktif.rows[0].id]
            );
          } else {
            // 2) Aralıkla çakışan başka izin → reddet
            const cakisan = await tx<{ c: string }>(
              `SELECT COUNT(*) AS c FROM personnel_leaves
               WHERE sicil_no = $1 AND baslangic_tarihi <= $3::date AND bitis_tarihi >= $2::date`,
              [sicilNo, baslangic, bitis]
            );
            if (parseInt(cakisan.rows[0].c, 10) > 0) {
              throw new Error(`Seçilen aralıkta (${baslangic} - ${bitis}) çakışan başka bir izin kaydı var.`);
            }
            // 3) Yeni kayıt
            await tx(
              `INSERT INTO personnel_leaves
                 (sicil_no, izin_turu, baslangic_tarihi, bitis_tarihi, aciklama, durum, onaylayan_sicil)
               VALUES ($1, $2, $3::date, $4::date, $5, 'Onaylandı', $6)`,
              [sicilNo, izinTuru, baslangic, bitis, kayitAciklama, session.sicilNo]
            );
          }

          // 4) Bugünü kapsıyorsa personel durumunu güncelle
          if (baslangic <= today && bitis >= today) {
            const yeniDurum = aciklama ? `${izinTuru} - ${aciklama}` : izinTuru;
            await tx(`UPDATE personnel SET durum = $1 WHERE sicil_no = $2`, [yeniDurum, sicilNo]);
          }

          // 5) Özlük (hizmet dökümü) kaydı
          const gunSayisi = Math.round((new Date(bitis).getTime() - new Date(baslangic).getTime()) / 86400000) + 1;
          await tx(
            `INSERT INTO personnel_records (sicil_no, kayit_turu, tarih, aciklama)
             VALUES ($1, 'İzin Kaydı', $2::date, $3)`,
            [sicilNo, baslangic, `${izinTuru} (${gunSayisi} gün: ${baslangic} - ${bitis}). ${aciklama || ''} (${kaynak})`]
          );
        });
        results.push({ sicil_no: sicilNo, ok: true });
      } catch (err: any) {
        console.error(`[leaves/POST] ${sicilNo} için hata:`, err);
        const isPgError = typeof err?.code === 'string';
        results.push({
          sicil_no: sicilNo,
          ok: false,
          error: !isPgError && err instanceof Error ? err.message : 'Kayıt sırasında sunucu hatası oluştu.',
        });
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    return NextResponse.json({ results, okCount, failCount: results.length - okCount });
  } catch (err) {
    console.error('[leaves/POST] Genel hata:', err);
    return NextResponse.json({ error: 'İşlem tamamlanamadı. Ayrıntılar sistem loguna kaydedildi.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'Oturum açmanız gerekiyor.' }, { status: 401 });
    }
    if (!isManagerSession(session)) {
      return NextResponse.json({ error: 'İzin işlemleri için yönetici yetkisi gereklidir.' }, { status: 403 });
    }

    const body = await request.json();
    const kaynak: string = String(body.kaynak || 'İzin Modülü').slice(0, 100);
    const today = todayISO();
    const results: PersonResult[] = [];

    // Varyant A: belirli bir izin kaydını id ile sil (özlük sayfası listesi)
    if (body.id !== undefined && body.id !== null) {
      try {
        await withTransaction(async (tx) => {
          const silinen = await tx<{ sicil_no: string; izin_turu: string }>(
            `DELETE FROM personnel_leaves WHERE id = $1 RETURNING sicil_no, izin_turu`,
            [body.id]
          );
          if (!silinen.rows[0]) {
            throw new Error('Silinecek izin kaydı bulunamadı.');
          }
          const sicilNo = silinen.rows[0].sicil_no;
          await refreshPersonnelDurum(tx, sicilNo, today);
          await tx(
            `INSERT INTO personnel_records (sicil_no, kayit_turu, tarih, aciklama)
             VALUES ($1, 'İzin İptali', $2::date, $3)`,
            [sicilNo, today, `${silinen.rows[0].izin_turu} kaydı silindi. (${kaynak})`]
          );
          results.push({ sicil_no: sicilNo, ok: true });
        });
      } catch (err: any) {
        console.error('[leaves/DELETE] id ile silme hatası:', err);
        const isPgError = typeof err?.code === 'string';
        return NextResponse.json({
          error: !isPgError && err instanceof Error ? err.message : 'Silme sırasında sunucu hatası oluştu.',
        }, { status: 400 });
      }
      return NextResponse.json({ results, okCount: results.length, failCount: 0 });
    }

    // Varyant B: verilen günde aktif izni olan personellerin iznini iptal et
    const sicilNos: string[] = Array.isArray(body.sicil_nos) ? body.sicil_nos.map(String) : [];
    const tarih: string = String(body.tarih || '');
    if (sicilNos.length === 0 || sicilNos.length > 200) {
      return NextResponse.json({ error: 'En az 1, en fazla 200 personel seçilmelidir.' }, { status: 400 });
    }
    if (!TARIH_REGEX.test(tarih)) {
      return NextResponse.json({ error: 'Geçersiz tarih.' }, { status: 400 });
    }

    for (const sicilNo of sicilNos) {
      try {
        await withTransaction(async (tx) => {
          await tx(
            `DELETE FROM personnel_leaves
             WHERE sicil_no = $1 AND baslangic_tarihi <= $2::date AND bitis_tarihi >= $2::date`,
            [sicilNo, tarih]
          );
          await refreshPersonnelDurum(tx, sicilNo, today);
          await tx(
            `INSERT INTO personnel_records (sicil_no, kayit_turu, tarih, aciklama)
             VALUES ($1, 'İzin İptali', $2::date, $3)`,
            [sicilNo, tarih, `İzin iptal edildi. (${kaynak})`]
          );
        });
        results.push({ sicil_no: sicilNo, ok: true });
      } catch (err: any) {
        console.error(`[leaves/DELETE] ${sicilNo} için hata:`, err);
        const isPgError = typeof err?.code === 'string';
        results.push({
          sicil_no: sicilNo,
          ok: false,
          error: !isPgError && err instanceof Error ? err.message : 'İptal sırasında sunucu hatası oluştu.',
        });
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    return NextResponse.json({ results, okCount, failCount: results.length - okCount });
  } catch (err) {
    console.error('[leaves/DELETE] Genel hata:', err);
    return NextResponse.json({ error: 'İşlem tamamlanamadı. Ayrıntılar sistem loguna kaydedildi.' }, { status: 500 });
  }
}
