"use client"
import { useState, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { ScanLine, Camera, AlertTriangle, Search, Loader2, Keyboard, ArrowLeft } from "lucide-react"
import { Card, CardContent } from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"
import { Button } from "@/components/ui/Button"
import { api } from "@/lib/api"
import { COMPARTMENT_NAMES } from "@/lib/constants"
import { Scanner } from "@yudiel/react-qr-scanner"

type ScanMode = "scanning" | "error"

interface VehicleInfo {
  plaka: string
  arac_tipi: string
  bolmeler: Record<string, any>
}

export default function TarayiciPage() {
  const router = useRouter()
  const [mode, setMode] = useState<ScanMode>("scanning")
  const [errorMsg, setErrorMsg] = useState("")
  const [manualPlaka, setManualPlaka] = useState("")
  const [manualLoading, setManualLoading] = useState(false)
  const [cameraError, setCameraError] = useState(false)

  // Intercept and suppress Next.js DevOverlay popup for missing cameras
  useEffect(() => {
    if (typeof window !== "undefined") {
      const originalError = console.error;
      console.error = (...args: any[]) => {
        const errorStr = args.map(a => {
          if (a instanceof Error) return a.message + " " + a.stack;
          return String(a);
        }).join(" ");
        
        if (
          errorStr.includes("Requested device not found") || 
          errorStr.includes("NotFoundError") || 
          errorStr.includes("Devices not found") ||
          errorStr.includes("Permission denied")
        ) {
          console.warn("[Camera Interceptor] Camera error handled gracefully:", ...args);
          return;
        }
        originalError.apply(console, args);
      };
      return () => {
        console.error = originalError;
      };
    }
  }, []);

  // ─── QR Parse Logic ────────────────────────────────────────
  const parseQRContent = (raw: string): { plaka: string; compartment?: string } | null => {
    const trimmed = raw.trim()

    // 1. URL format: /arac/{plaka-slug}/{compartment}
    const urlPattern = /\/arac\/([^/]+)\/([^/?#]+)/
    const urlMatch = trimmed.match(urlPattern)
    if (urlMatch) {
      return {
        plaka: urlMatch[1].replace(/-/g, " ").toUpperCase(),
        compartment: urlMatch[2],
      }
    }

    // 2. Dash-separated compartment format: "58ACT367-kabin_ici" or "58 ACT 367-sol_on_kapak"
    const dashMatch = trimmed.match(/^(.+?)-(\w+_\w+.*)$/)
    if (dashMatch && COMPARTMENT_NAMES[dashMatch[2]]) {
      return {
        plaka: dashMatch[1].replace(/-/g, " ").replace(/\s+/g, " ").toUpperCase().trim(),
        compartment: dashMatch[2],
      }
    }

    // 3. Legacy JSON: {"p": "58 ACT 367", "c": "kabin_ici"}
    try {
      const json = JSON.parse(trimmed)
      if (json.p) {
        return { plaka: json.p.toUpperCase(), compartment: json.c || undefined }
      }
    } catch {}

    // 4. Plain plaka text (anything that looks like a Turkish plate)
    const plakaPattern = /^(\d{2})\s*([A-ZÇĞİÖŞÜ]+)\s*(\d+)$/i
    const plakaMatch = trimmed.toUpperCase().replace(/-/g, " ").replace(/\s+/g, " ").trim().match(plakaPattern)
    if (plakaMatch) {
      return { plaka: `${plakaMatch[1]} ${plakaMatch[2]} ${plakaMatch[3]}` }
    }

    // 5. Fallback: treat entire string as plaka
    if (trimmed.length >= 5 && trimmed.length <= 15) {
      return { plaka: trimmed.toUpperCase() }
    }

    return null
  }

  // ─── Vehicle Lookup & Redirect ──────────────────────────────
  const lookupVehicle = useCallback(async (plaka: string, compartment?: string) => {
    const { data: rawData, error } = await api.from("vehicles")
      .select("plaka,arac_tipi,bolmeler")
      .eq("plaka", plaka)
      .single()

    if (error || !rawData) {
      setErrorMsg(`"${plaka}" plakası sistemde bulunamadı.`)
      setMode("error")
      return
    }

    const data = rawData as VehicleInfo
    const plakaSlug = plaka.replace(/\s+/g, "-").toLowerCase()

    // Redirect to the target deep link immediately
    if (compartment && data.bolmeler?.[compartment]) {
      router.push(`/arac/${plakaSlug}/${compartment}`)
    } else {
      router.push(`/arac/${plakaSlug}`)
    }
  }, [router])

  // ─── QR Scan Handler ───────────────────────────────────────
  const handleScan = useCallback((results: any[]) => {
    if (!results?.length || mode !== "scanning") return

    const rawValue = results[0]?.rawValue
    if (!rawValue) return

    const parsed = parseQRContent(rawValue)
    if (!parsed) {
      setErrorMsg("Geçersiz QR kodu. Lütfen araç etiketini okutun.")
      setMode("error")
      return
    }

    // Vibrate on successful scan
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(100)
    }

    lookupVehicle(parsed.plaka, parsed.compartment)
  }, [mode, lookupVehicle])

  // ─── Manual Plaka Search ───────────────────────────────────
  const handleManualSearch = async () => {
    if (!manualPlaka.trim()) return
    setManualLoading(true)
    await lookupVehicle(manualPlaka.toUpperCase().trim())
    setManualLoading(false)
  }

  // ─── Reset to Scanner ──────────────────────────────────────
  const resetToScanner = () => {
    setMode("scanning")
    setErrorMsg("")
    setManualPlaka("")
  }

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] w-full items-center justify-start space-y-5 pt-4">
      
      {/* Title */}
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold flex items-center justify-center gap-2">
          <ScanLine className="w-6 h-6 text-primary" />
          Akıllı QR & Barkod Okuyucu
        </h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          Araç veya bölme QR kodunu taratarak envanter ve durum takip ekranına doğrudan geçiş yapın.
        </p>
      </div>

      {/* ═══ SCANNER VIEW ═══ */}
      {mode === "scanning" && (
        <>
          <Card className="w-full max-w-sm aspect-square bg-slate-900/50 border-2 border-white/10 relative overflow-hidden group shadow-[0_0_40px_-5px_rgba(34,211,238,0.25)] rounded-3xl">
            <CardContent className="p-0 w-full h-full flex flex-col items-center justify-center relative">
              <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20 pointer-events-none z-10" />

              {cameraError ? (
                <div className="flex flex-col items-center justify-center text-center p-6 space-y-4">
                  <Camera className="w-16 h-16 text-muted-foreground opacity-50" />
                  <p className="text-sm text-muted-foreground font-medium leading-relaxed">
                    Kamera erişimi sağlanamadı.<br />
                    Lütfen tarayıcı izinlerini kontrol edin veya aşağıdan manuel olarak arama yapın.
                  </p>
                </div>
              ) : (
                <div className="w-full h-full relative">
                  <Scanner
                    onScan={handleScan}
                    onError={() => setCameraError(true)}
                    components={{ finder: false }}
                  />

                  {/* Scan Frame Overlay */}
                  <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                    <div className="w-3/4 h-3/4 border border-cyan-500/30 rounded-2xl relative shadow-[0_0_15px_rgba(34,211,238,0.15)]">
                      <div className="absolute -top-[1.5px] -left-[1.5px] w-6 h-6 border-t-[3px] border-l-[3px] border-cyan-400 rounded-tl-xl" />
                      <div className="absolute -top-[1.5px] -right-[1.5px] w-6 h-6 border-t-[3px] border-r-[3px] border-cyan-400 rounded-tr-xl" />
                      <div className="absolute -bottom-[1.5px] -left-[1.5px] w-6 h-6 border-b-[3px] border-l-[3px] border-cyan-400 rounded-bl-xl" />
                      <div className="absolute -bottom-[1.5px] -right-[1.5px] w-6 h-6 border-b-[3px] border-r-[3px] border-cyan-400 rounded-br-xl" />
                      <div className="absolute left-0 right-0 h-[2px] bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)] animate-[scan_2.5s_ease-in-out_infinite]" />
                    </div>
                  </div>
                  <p className="absolute bottom-6 left-0 right-0 text-center text-xs font-semibold text-cyan-400/90 animate-pulse z-20">
                    QR Kodu Çerçevenin İçine Alın
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Manual Input */}
          <div className="w-full max-w-sm space-y-3">
            <div className="flex items-center gap-2 px-1">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-1.5">
                <Keyboard className="w-3 h-3 text-slate-500" /> veya Manuel Giriş
              </span>
              <div className="h-px flex-1 bg-white/10" />
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Plaka girin (Örn: 58 ACT 367)"
                value={manualPlaka}
                onChange={e => setManualPlaka(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleManualSearch()}
                className="font-mono tracking-wider bg-slate-950/50 border-white/10 text-white focus:border-cyan-500/50 rounded-xl"
              />
              <Button 
                onClick={handleManualSearch} 
                disabled={manualLoading || !manualPlaka.trim()}
                className="shrink-0 rounded-xl font-bold bg-cyan-600 hover:bg-cyan-500 text-white"
              >
                {manualLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </>
      )}

      {/* ═══ ERROR MODE ═══ */}
      {mode === "error" && (
        <div className="w-full max-w-sm animate-in zoom-in fade-in duration-300">
          <Card className="border-2 border-rose-500/20 bg-slate-900/90 shadow-2xl rounded-3xl">
            <CardContent className="p-6 text-center space-y-4">
              <div className="w-14 h-14 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto border border-rose-500/25">
                <AlertTriangle className="w-8 h-8 text-rose-500" />
              </div>
              <p className="font-black text-lg text-slate-200">Arama Bulunamadı</p>
              <p className="text-sm text-slate-400 leading-relaxed">{errorMsg}</p>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={resetToScanner} className="flex-1 rounded-xl border-white/10 text-white font-bold">
                  <ArrowLeft className="w-4 h-4 mr-2" /> Tekrar Tara
                </Button>
              </div>

              {/* Manual entry fallback */}
              <div className="pt-4 border-t border-white/5">
                <p className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Hızlı Plaka Arama:</p>
                <div className="flex gap-2">
                  <Input
                    placeholder="58 ACT 367"
                    value={manualPlaka}
                    onChange={e => setManualPlaka(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleManualSearch()}
                    className="font-mono bg-slate-950/50 border-white/10 text-white focus:border-cyan-500/50 rounded-xl"
                  />
                  <Button 
                    onClick={handleManualSearch} 
                    disabled={manualLoading || !manualPlaka.trim()}
                    className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl"
                  >
                    {manualLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
