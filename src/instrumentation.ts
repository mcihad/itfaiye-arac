/**
 * Next.js instrumentation — sunucu açılışında bir kez çalışır.
 *
 * Sayım uyarısı için UYGULAMA İÇİ ZAMANLAYICI kurar: harici cron gerekmez.
 * Her ~10 dakikada bir runSayimUyari() çağrılır; hangi şubenin posta değişiminden
 * 20 dk geçtiğini (system_settings'ten okunan, şubeye göre farklı saatler)
 * fonksiyonun kendisi belirler ve yalnızca zamanı gelen şubeye SMS gönderir.
 * Idempotency (istasyon+gün) sayesinde aynı vardiyada tekrar gönderilmez.
 */
export async function register() {
  // Yalnızca Node.js runtime'da (edge/build değil) ve üretimde çalışsın.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
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
