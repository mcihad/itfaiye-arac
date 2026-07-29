"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Siren, Navigation, Truck, Users, MapPin, Loader2, X } from "lucide-react"
import { useAuthStore } from "@/lib/authStore"
import { api, getAuthHeaders } from "@/lib/api"
import { toast } from "@/lib/toast"

interface AlarmPayload {
  title?: string
  body?: string
  olay_turu?: string
  adres?: string
  mahalle?: string
  plaka?: string
  posta?: string
  mesafe?: string
  url?: string
  /** Olay kimliği — "Yola Çıktım" kaydının olaya bağlanması için (yeni bildirimlerde gelir) */
  incidentId?: string
}

interface AracSecenek {
  plaka: string
  arac_tipi?: string
  istasyon?: string
  durum?: string
}

/**
 * Tam ekran vaka alarm katmanı.
 * Root layout'a eklenir; normalde görünmezdir. Şunları dinler:
 *  - Service Worker push mesajı ({ type: 'INCIDENT_ALARM', payload }) — uygulama açıkken
 *  - window 'saha:alarm' CustomEvent — test/manuel tetik
 *
 * "Yola Çıktım" akışı: bildirimde olay kimliği varsa araç seçim adımı açılır;
 * personel hangi araçla çıktığını seçer ve /api/incidents/yola-cikis üzerinden
 * personel + araç olaya otomatik işlenir. Olay kimliği yoksa (eski bildirimler)
 * yalnızca saha haritasına yönlendirilir (eski davranış).
 */
export function AlarmOverlay() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [alarm, setAlarm] = useState<AlarmPayload | null>(null)
  const [muted, setMuted] = useState(false)
  const [step, setStep] = useState<"alarm" | "arac">("alarm")
  const [vehicles, setVehicles] = useState<AracSecenek[]>([])
  const [vehiclesLoading, setVehiclesLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const sirenTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const beep = useCallback((freq: number, dur: number, when = 0) => {
    try {
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext)
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx()
      const a = audioCtxRef.current!
      const o = a.createOscillator(), g = a.createGain()
      o.type = "square"; o.frequency.value = freq
      g.gain.setValueAtTime(0.06, a.currentTime + when)
      g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + when + dur)
      o.connect(g).connect(a.destination)
      o.start(a.currentTime + when); o.stop(a.currentTime + when + dur + 0.05)
    } catch { /* ses engellendi, yok say */ }
  }, [])

  const stopSiren = useCallback(() => {
    if (sirenTimer.current) { clearInterval(sirenTimer.current); sirenTimer.current = null }
  }, [])

  const startSiren = useCallback(() => {
    stopSiren()
    const once = () => { if (!muted) { beep(700, 0.38, 0); beep(950, 0.38, 0.4) } }
    once()
    sirenTimer.current = setInterval(once, 900)
    if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300])
  }, [beep, muted, stopSiren])

  const trigger = useCallback((p: AlarmPayload) => {
    setMuted(false)
    setStep("alarm")
    setVehicles([])
    setAlarm(p)
  }, [])

  // Alarm açılınca siren başlat; kapanınca veya araç seçim adımına geçince durdur
  useEffect(() => {
    if (alarm && step === "alarm") startSiren()
    else stopSiren()
    return stopSiren
  }, [alarm, step, startSiren, stopSiren])

  // Dinleyiciler
  useEffect(() => {
    const onSwMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === "INCIDENT_ALARM") trigger(e.data.payload || {})
    }
    const onTest = (e: Event) => trigger((e as CustomEvent).detail || {})
    navigator.serviceWorker?.addEventListener("message", onSwMessage)
    window.addEventListener("saha:alarm", onTest as EventListener)
    // Test kolaylığı: konsoldan window.__sahaTestAlarm()
    ;(window as any).__sahaTestAlarm = (p?: AlarmPayload) =>
      trigger(p || { olay_turu: "Yangın — İşyeri", adres: "Test Mahallesi, Örnek Cad. No:1", plaka: "58 AEL 289", posta: "2. Posta", mesafe: "3.4 km" })
    return () => {
      navigator.serviceWorker?.removeEventListener("message", onSwMessage)
      window.removeEventListener("saha:alarm", onTest as EventListener)
    }
  }, [trigger])

  /** Araç listesini yükler: kişinin istasyonundaki aktif araçlar önde sıralanır. */
  const loadVehicles = useCallback(async () => {
    if (!user?.sicilNo) return
    setVehiclesLoading(true)
    try {
      const [pRes, vRes] = await Promise.all([
        api.from("personnel").select("istasyon").eq("sicil_no", user.sicilNo).single(),
        api.from("vehicles").select("plaka,arac_tipi,istasyon,durum").order("plaka"),
      ])
      const kendiIstasyon = String((pRes.data as any)?.istasyon || "").toLocaleLowerCase("tr-TR")
      const istKey = kendiIstasyon.includes("esentepe") ? "esentepe"
        : (kendiIstasyon.includes("organize") || kendiIstasyon.includes("osb")) ? "organize"
        : "merkez"
      const istasyonPuani = (v: AracSecenek) => {
        const ist = String(v.istasyon || "").toLocaleLowerCase("tr-TR")
        const vKey = ist.includes("esentepe") ? "esentepe"
          : (ist.includes("organize") || ist.includes("osb")) ? "organize"
          : "merkez"
        return vKey === istKey ? 0 : 1
      }
      const list = ((vRes.data as AracSecenek[]) || [])
        .filter(v => v.plaka)
        .sort((a, b) => {
          // 1) Bildirimde sevk edilen araç en üstte
          const sevkA = alarm?.plaka && a.plaka === alarm.plaka ? 0 : 1
          const sevkB = alarm?.plaka && b.plaka === alarm.plaka ? 0 : 1
          if (sevkA !== sevkB) return sevkA - sevkB
          // 2) Kendi istasyonundaki araçlar önce
          const iA = istasyonPuani(a), iB = istasyonPuani(b)
          if (iA !== iB) return iA - iB
          // 3) Aktif araçlar önce
          const dA = String(a.durum || "").toLocaleLowerCase("tr-TR") === "aktif" ? 0 : 1
          const dB = String(b.durum || "").toLocaleLowerCase("tr-TR") === "aktif" ? 0 : 1
          if (dA !== dB) return dA - dB
          return a.plaka.localeCompare(b.plaka, "tr")
        })
      setVehicles(list)
    } catch (err) {
      console.error("[AlarmOverlay] Araç listesi yüklenemedi:", err)
      setVehicles([])
    } finally {
      setVehiclesLoading(false)
    }
  }, [user?.sicilNo, alarm?.plaka])

  const kapatVeHaritayaGit = useCallback(() => {
    stopSiren()
    setAlarm(null)
    setStep("alarm")
    router.push("/saha/harita")
  }, [router, stopSiren])

  /** "Yola Çıktım": olay kimliği + oturum varsa araç seçim adımına geç; yoksa eski davranış. */
  const accept = () => {
    stopSiren()
    if (navigator.vibrate) navigator.vibrate([80, 40, 120])
    if (alarm?.incidentId && user?.sicilNo) {
      setStep("arac")
      loadVehicles()
    } else {
      kapatVeHaritayaGit()
    }
  }

  /** Seçilen araçla (veya araçsız) çıkışı sunucuya işler. */
  const yolaCikisiKaydet = async (plaka: string | null) => {
    if (!alarm?.incidentId || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/incidents/yola-cikis", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ incident_id: alarm.incidentId, plaka }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error || "Kayıt başarısız oldu.")
      toast(json.message || "Çıkışınız kaydedildi.")
      kapatVeHaritayaGit()
    } catch (err: any) {
      console.error("[AlarmOverlay] Yola çıkış kaydı hatası:", err)
      toast(`Çıkış kaydı yazılamadı: ${err?.message || err}`)
      // Ekranda kal — personel tekrar deneyebilir veya araçsız/iptal ile çıkabilir
    } finally {
      setSubmitting(false)
    }
  }

  const openRoute = () => {
    if (alarm?.url) { window.open(alarm.url, "_blank", "noopener"); return }
    accept()
  }

  if (!alarm) return null

  const tur = (alarm.olay_turu || alarm.title || "Canlı İhbar")
  const adres = alarm.adres || alarm.mahalle || alarm.body || "Konum haritada"

  // ── Adım 2: Araç seçimi ─────────────────────────────────────────────
  if (step === "arac") {
    return (
      <div
        role="dialog"
        aria-label="Araç seçimi"
        className="fixed inset-0 z-[9999] flex flex-col text-white"
        style={{ background: "#641414" }}
      >
        <div className="flex items-start justify-between px-6 pt-[calc(env(safe-area-inset-top)+20px)]">
          <div>
            <div className="text-[calc(var(--fd-fs)*0.74)] font-bold tracking-[0.2em]" style={{ color: "#fecaca" }}>YOLA ÇIKTINIZ</div>
            <h2 className="text-[calc(var(--fd-fs)*1.35)] font-bold leading-tight mt-1">Hangi araçla çıkıyorsunuz?</h2>
            <div className="text-[calc(var(--fd-fs)*0.85)] mt-1" style={{ color: "#fecaca" }}>{String(tur)} — {adres}</div>
          </div>
          <button
            onClick={kapatVeHaritayaGit}
            aria-label="Kaydetmeden kapat"
            className="p-2 -m-1 rounded-full"
            style={{ background: "rgba(255,255,255,.12)" }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {vehiclesLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3" style={{ color: "#fecaca" }}>
              <Loader2 className="w-8 h-8 animate-spin" />
              <span className="text-sm font-semibold">Araçlar yükleniyor...</span>
            </div>
          ) : vehicles.length === 0 ? (
            <div className="flex items-center justify-center h-full text-sm font-semibold" style={{ color: "#fecaca" }}>
              Araç listesi alınamadı — araçsız devam edebilirsiniz.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 max-w-md mx-auto">
              {vehicles.map(v => (
                <button
                  key={v.plaka}
                  disabled={submitting}
                  onClick={() => yolaCikisiKaydet(v.plaka)}
                  className="flex items-center gap-3 px-4 py-4 rounded-[var(--fd-r)] text-left transition-transform active:scale-[0.98] disabled:opacity-50"
                  style={{
                    background: alarm.plaka === v.plaka ? "rgba(255,255,255,.22)" : "rgba(255,255,255,.10)",
                    border: alarm.plaka === v.plaka ? "2px solid rgba(255,255,255,.7)" : "1px solid rgba(255,255,255,.25)",
                  }}
                >
                  <Truck size={20} strokeWidth={1.8} className="shrink-0" />
                  <span className="font-mono font-bold text-[calc(var(--fd-fs)*1.1)]">{v.plaka}</span>
                  <span className="text-[calc(var(--fd-fs)*0.8)] font-semibold flex-1 truncate" style={{ color: "#fecaca" }}>
                    {v.arac_tipi || ""}
                    {alarm.plaka === v.plaka ? " • Sevk edilen araç" : ""}
                  </span>
                  {submitting && <Loader2 size={16} className="animate-spin shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 pb-[calc(env(safe-area-inset-bottom)+20px)] flex flex-col gap-2 max-w-md mx-auto w-full">
          <button
            disabled={submitting}
            onClick={() => yolaCikisiKaydet(null)}
            className="py-3.5 rounded-[var(--fd-r)] border-2 font-bold text-[calc(var(--fd-fs)*0.9)] disabled:opacity-50"
            style={{ borderColor: "rgba(255,255,255,0.5)" }}
          >
            Araç Seçmeden Devam Et
          </button>
        </div>
      </div>
    )
  }

  // ── Adım 1: Alarm ekranı ────────────────────────────────────────────
  return (
    <div
      role="alertdialog"
      aria-label="Vaka alarmı"
      className="fixed inset-0 z-[9999] flex flex-col text-white"
      style={{ background: "#641414" }}
    >
      <div className="pointer-events-none absolute inset-0 alarm-edge" />
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 px-8 pt-16">
        <span className="w-20 h-20 rounded-full grid place-items-center alarm-siren" style={{ background: "var(--fd-danger)" }}>
          <Siren size={40} strokeWidth={1.8} />
        </span>
        <span className="text-[calc(var(--fd-fs)*0.74)] font-bold tracking-[0.2em]" style={{ color: "#fecaca" }}>CANLI İHBAR</span>
        <h2 className="text-[calc(var(--fd-fs)*2)] font-bold leading-tight text-balance">{String(tur).toLocaleUpperCase("tr-TR")}</h2>
        <div className="text-[calc(var(--fd-fs)*1.05)] font-semibold leading-snug max-w-[30ch]" style={{ color: "#fecaca" }}>{adres}</div>
        <div className="flex flex-wrap gap-2 justify-center mt-2 font-mono text-[calc(var(--fd-fs)*0.78)] font-bold">
          {alarm.plaka && <span className="alarm-chip"><Truck size={13} strokeWidth={1.8} />{alarm.plaka}</span>}
          {alarm.posta && <span className="alarm-chip"><Users size={13} strokeWidth={1.8} />{alarm.posta}</span>}
          {alarm.mesafe && <span className="alarm-chip"><MapPin size={13} strokeWidth={1.8} />{alarm.mesafe}</span>}
        </div>
      </div>
      <div className="px-6 pb-[calc(env(safe-area-inset-bottom)+24px)] flex flex-col gap-3">
        <button onClick={accept} className="py-6 rounded-[var(--fd-r-lg)] bg-white font-bold text-[calc(var(--fd-fs)*1.35)]" style={{ color: "#7f1d1d" }}>
          Yola Çıktım
        </button>
        <button onClick={openRoute} className="py-4 rounded-[var(--fd-r)] border-2 font-bold text-[calc(var(--fd-fs)*0.95)] flex items-center justify-center gap-2" style={{ borderColor: "rgba(255,255,255,0.5)" }}>
          <Navigation size={16} strokeWidth={1.8} /> Rotayı Aç
        </button>
        <button onClick={() => setMuted((m) => !m)} className="self-center mt-0.5 text-[calc(var(--fd-fs)*0.8)] underline" style={{ color: "#fca5a5" }}>
          {muted ? "sesi aç" : "sesi kapat"}
        </button>
      </div>

      <style>{`
        .alarm-edge { border: 5px solid var(--fd-danger); border-radius: 0; animation: alarmEdge 1s ease-in-out infinite; }
        @keyframes alarmEdge { 0%,100% { opacity: 1; } 50% { opacity: .25; } }
        .alarm-siren { animation: alarmSiren 1s ease-in-out infinite; }
        @keyframes alarmSiren { 0%,100% { box-shadow: 0 0 0 0 rgba(220,38,38,.65); } 50% { box-shadow: 0 0 0 24px rgba(220,38,38,0); } }
        .alarm-chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 999px; background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.25); }
        @media (prefers-reduced-motion: reduce) { .alarm-edge, .alarm-siren { animation: none; } }
      `}</style>
    </div>
  )
}
