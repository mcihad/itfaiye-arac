/**
 * Next.js instrumentation — sunucu açılışında bir kez çalışır.
 *
 * Sayım uyarısı için UYGULAMA İÇİ ZAMANLAYICI kurar: harici cron gerekmez.
 * Her ~10 dakikada bir runSayimUyari() çağrılır; hangi şubenin posta değişiminden
 * 20 dk geçtiğini (system_settings'ten okunan, şubeye göre farklı saatler)
 * fonksiyonun kendisi belirler ve yalnızca zamanı gelen şubeye SMS gönderir.
 * Idempotency (istasyon+gün) sayesinde aynı vardiyada tekrar gönderilmez.
 */
/**
 * Açılışta ortam değişkeni doğrulaması. Eksik yapılandırma eskiden ilk
 * kullanım anında anlaşılmaz hatalarla ortaya çıkıyordu; artık sunucu
 * açılır açılmaz net bir mesajla raporlanır.
 */
function validateEnv() {
  const eksikler: string[] = [];

  if (!process.env.DATABASE_URL) eksikler.push("DATABASE_URL (veritabanı bağlantısı — sistem çalışamaz)");
  if (!process.env.MINIO_ACCESS_KEY || !process.env.MINIO_SECRET_KEY) {
    eksikler.push("MINIO_ACCESS_KEY / MINIO_SECRET_KEY (dosya yüklemeleri başarısız olur)");
  }
  if (!process.env.SMS_API_KEY || !process.env.SMS_API_SECRET) {
    eksikler.push("SMS_API_KEY / SMS_API_SECRET (SMS bildirimleri ve sayım uyarıları gönderilemez)");
  }

  if (eksikler.length > 0) {
    const mesaj = `[env] Eksik ortam değişkenleri:\n  - ${eksikler.join("\n  - ")}`;
    if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL) {
      // DATABASE_URL olmadan uygulama tümüyle işlevsiz: ilk sorguda kriptik
      // hata vermek yerine açılışta net mesajla durdur.
      throw new Error(mesaj);
    }
    console.warn(mesaj);
  }
}

export async function register() {
  // Yalnızca Node.js runtime'da (edge/build değil) çalışsın.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  validateEnv();

  // Zamanlayıcı yalnızca üretimde kurulur.
  if (process.env.NODE_ENV !== "production") return;

  const g = globalThis as unknown as { __sayimUyariTimer?: ReturnType<typeof setInterval> };
  if (g.__sayimUyariTimer) return; // çift kurulmayı önle

  const { runSayimUyari } = await import("@/lib/sayimUyari");

  // Re-entrancy kilidi: önceki tick (ör. SMS API yavaşsa) bitmeden yenisi başlamaz.
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await runSayimUyari(false);
      const gonderilen = r.rapor.filter((x: any) => x.smsOk).length;
      if (gonderilen > 0) console.log(`[sayim-uyari] ${gonderilen} istasyon için uyarı gönderildi.`);
    } catch (e) {
      console.error("[sayim-uyari] Zamanlayıcı hatası:", e);
    } finally {
      running = false;
    }
  };

  // Açılıştan 30 sn sonra ilk kontrol, ardından her 10 dakikada bir.
  // unref(): zamanlayıcı, süreç kapanışını (graceful shutdown) engellemesin.
  setTimeout(tick, 30_000).unref?.();
  g.__sayimUyariTimer = setInterval(tick, 10 * 60 * 1000);
  g.__sayimUyariTimer.unref?.();
  console.log("[sayim-uyari] Uygulama içi zamanlayıcı kuruldu (10 dk aralık).");
}
