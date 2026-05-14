"use client"
import { useState, useCallback } from "react"
import { ScanLine, Camera, Check, AlertTriangle, Truck, ClipboardCheck, Search, X, ChevronDown, Loader2, Keyboard } from "lucide-react"
import { Card, CardContent } from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"
import { Button } from "@/components/ui/Button"
import { InventoryCheckModal } from "@/components/inventory/InventoryCheckModal"
import { DailyVehicleCheckModal } from "@/components/inventory/DailyVehicleCheckModal"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import { COMPARTMENT_NAMES } from "@/lib/constants"

import { Scanner } from "@yudiel/react-qr-scanner"

type ScanMode = "scanning" | "choosing" | "inventory" | "daily" | "error"

interface VehicleInfo {
  plaka: string
  arac_tipi: string
  bolmeler: Record<string, any>
}

export default function TarayiciPage() {
  const [mode, setMode] = useState<ScanMode>("scanning")
  const [vehicle, setVehicle] = useState<VehicleInfo | null>(null)
  const [compartmentKey, setCompartmentKey] = useState("")
  const [errorMsg, setErrorMsg] = useState("")
  const [successMsg, setSuccessMsg] = useState("")
  const [manualPlaka, setManualPlaka] = useState("")
  const [manualLoading, setManualLoading] = useState(false)
  const [cameraError, setCameraError] = useState(false)

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

  // ─── Vehicle Lookup ────────────────────────────────────────
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
    setVehicle(data)

    // Smart routing: if compartment provided, go directly to inventory
    if (compartment && data.bolmeler?.[compartment]) {
      setCompartmentKey(compartment)
      setMode("inventory")
    } else {
      // Show chooser bottom sheet
      setMode("choosing")
    }
  }, [])

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

  // ─── Compartment Selection ─────────────────────────────────
  const handleCompartmentSelect = (key: string) => {
    setCompartmentKey(key)
    setMode("inventory")
  }

  // ─── Reset to Scanner ──────────────────────────────────────
  const resetToScanner = () => {
    setMode("scanning")
    setVehicle(null)
    setCompartmentKey("")
    setErrorMsg("")
    setManualPlaka("")
  }

  // ─── Save Callbacks ────────────────────────────────────────
  const handleInventorySaved = () => {
    setSuccessMsg(`${vehicle?.plaka} — ${COMPARTMENT_NAMES[compartmentKey] || compartmentKey} sayımı başarıyla kaydedildi!`)
    resetToScanner()
    setTimeout(() => setSuccessMsg(""), 4000)
  }

  const handleDailySaved = () => {
    setSuccessMsg(`${vehicle?.plaka} günlük kontrol raporu kaydedildi!`)
    resetToScanner()
    setTimeout(() => setSuccessMsg(""), 4000)
  }

  // ─── Available compartments for the vehicle ────────────────
  const vehicleCompartments = vehicle?.bolmeler
    ? Object.keys(vehicle.bolmeler).filter(k => Array.isArray(vehicle.bolmeler[k]) && vehicle.bolmeler[k].length > 0)
    : []

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] w-full items-center justify-start space-y-5 pt-4">
      
      {/* Title */}
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold flex items-center justify-center gap-2">
          <ScanLine className="w-6 h-6 text-primary" />
          Akıllı Tarayıcı
        </h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          QR kod okutarak envanter sayımı veya günlük araç kontrolü yapın.
        </p>
      </div>

      {/* Success Message */}
      {successMsg && (
        <div className="bg-success/10 text-success px-4 py-3 rounded-xl flex items-center justify-center gap-2 w-full max-w-sm animate-in fade-in slide-in-from-top-4 shadow-lg border border-success/20">
          <Check className="w-5 h-5" />
          <span className="text-sm font-semibold">{successMsg}</span>
        </div>
      )}

      {/* ═══ SCANNER VIEW ═══ */}
      {mode === "scanning" && (
        <>
          <Card className="w-full max-w-sm aspect-square bg-surface border-2 border-border/50 relative overflow-hidden group shadow-lg">
            <CardContent className="p-0 w-full h-full flex flex-col items-center justify-center relative">
              <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20 pointer-events-none z-10" />

              {cameraError ? (
                <div className="flex flex-col items-center justify-center text-center p-6 space-y-4">
                  <Camera className="w-16 h-16 text-muted-foreground opacity-50" />
                  <p className="text-sm text-muted-foreground font-medium">
                    Kamera erişimi sağlanamadı.<br />
                    Tarayıcı izinlerini kontrol edin veya aşağıdan manuel giriş yapın.
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
                    <div className="w-3/4 h-3/4 border-2 border-primary/40 rounded-xl relative">
                      <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-primary rounded-tl-xl" />
                      <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-primary rounded-tr-xl" />
                      <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-primary rounded-bl-xl" />
                      <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-primary rounded-br-xl" />
                      <div className="absolute left-0 right-0 h-0.5 bg-primary shadow-[0_0_8px_2px_rgba(var(--primary),0.6)] animate-[scan_2s_ease-in-out_infinite]" />
                    </div>
                  </div>
                  <p className="absolute bottom-6 left-0 right-0 text-center text-xs font-semibold text-primary/80 animate-pulse z-20">
                    QR kodu vizöre ortalayın
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Manual Input */}
          <div className="w-full max-w-sm space-y-3">
            <div className="flex items-center gap-2 px-1">
              <div className="h-px flex-1 bg-border/50" />
              <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest flex items-center gap-1.5">
                <Keyboard className="w-3 h-3" /> veya Manuel Giriş
              </span>
              <div className="h-px flex-1 bg-border/50" />
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Plaka girin (Örn: 58 ACT 367)"
                value={manualPlaka}
                onChange={e => setManualPlaka(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleManualSearch()}
                className="font-mono tracking-wider"
              />
              <Button 
                onClick={handleManualSearch} 
                disabled={manualLoading || !manualPlaka.trim()}
                className="shrink-0"
              >
                {manualLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </>
      )}

      {/* ═══ CHOOSING MODE — Bottom Sheet ═══ */}
      {mode === "choosing" && vehicle && (
        <div className="w-full max-w-sm animate-in slide-in-from-bottom-8 fade-in duration-300">
          <Card className="border-2 border-primary/20 shadow-2xl overflow-hidden">
            <CardContent className="p-0">
              {/* Vehicle Header */}
              <div className="bg-primary/5 border-b border-primary/10 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
                    <Truck className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-bold text-lg">{vehicle.plaka}</p>
                    <p className="text-xs text-muted-foreground">{vehicle.arac_tipi}</p>
                  </div>
                </div>
                <button onClick={resetToScanner} className="p-2 hover:bg-muted rounded-lg transition-colors">
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>

              {/* Action Buttons */}
              <div className="p-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center mb-1">
                  Ne yapmak istiyorsunuz?
                </p>

                {/* Option 1: Compartment/Inventory */}
                <button
                  onClick={() => {
                    if (vehicleCompartments.length === 1) {
                      handleCompartmentSelect(vehicleCompartments[0])
                    } else if (vehicleCompartments.length > 0) {
                      // Show compartment list inline
                      const el = document.getElementById("compartment-list")
                      if (el) el.classList.toggle("hidden")
                    }
                  }}
                  className="w-full p-4 bg-cyan-500/5 hover:bg-cyan-500/10 border-2 border-cyan-500/20 hover:border-cyan-500/40 rounded-2xl flex items-center gap-4 transition-all group text-left"
                >
                  <div className="w-12 h-12 bg-cyan-500/15 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <ClipboardCheck className="w-6 h-6 text-cyan-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-base">📋 Bölme / Envanter Sayımı</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Aracın bölmelerindeki malzemeleri kontrol edin
                    </p>
                  </div>
                  {vehicleCompartments.length > 1 && (
                    <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />
                  )}
                </button>

                {/* Compartment sub-list (hidden by default) */}
                {vehicleCompartments.length > 1 && (
                  <div id="compartment-list" className="hidden space-y-1.5 pl-4 animate-in slide-in-from-top-2">
                    {vehicleCompartments.map(key => (
                      <button
                        key={key}
                        onClick={() => handleCompartmentSelect(key)}
                        className="w-full p-3 bg-muted/40 hover:bg-muted border border-border/50 rounded-xl text-left text-sm font-medium transition-colors flex items-center gap-2"
                      >
                        <div className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
                        {COMPARTMENT_NAMES[key] || key}
                      </button>
                    ))}
                  </div>
                )}

                {vehicleCompartments.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-1 italic">
                    Bu araçta tanımlı bölme bulunmuyor.
                  </p>
                )}

                {/* Option 2: Daily Check */}
                <button
                  onClick={() => setMode("daily")}
                  className="w-full p-4 bg-emerald-500/5 hover:bg-emerald-500/10 border-2 border-emerald-500/20 hover:border-emerald-500/40 rounded-2xl flex items-center gap-4 transition-all group text-left"
                >
                  <div className="w-12 h-12 bg-emerald-500/15 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <Truck className="w-6 h-6 text-emerald-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-base">🚒 Günlük Araç Kontrolü</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Yakıt, su, köpük, pompa ve genel durum kontrolü
                    </p>
                  </div>
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══ ERROR MODE ═══ */}
      {mode === "error" && (
        <div className="w-full max-w-sm animate-in zoom-in fade-in">
          <Card className="border-2 border-danger/20 shadow-lg">
            <CardContent className="p-6 text-center space-y-4">
              <AlertTriangle className="w-14 h-14 text-danger mx-auto" />
              <p className="font-bold text-lg">Tarama Başarısız</p>
              <p className="text-sm text-muted-foreground">{errorMsg}</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={resetToScanner} className="flex-1">
                  Tekrar Tara
                </Button>
              </div>

              {/* Manual entry fallback */}
              <div className="pt-3 border-t border-border/50">
                <p className="text-xs text-muted-foreground mb-2">Plaka ile arama:</p>
                <div className="flex gap-2">
                  <Input
                    placeholder="58 ACT 367"
                    value={manualPlaka}
                    onChange={e => setManualPlaka(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleManualSearch()}
                    className="font-mono"
                  />
                  <Button onClick={handleManualSearch} disabled={manualLoading || !manualPlaka.trim()}>
                    {manualLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══ MODALS ═══ */}
      {mode === "inventory" && vehicle && compartmentKey && (
        <InventoryCheckModal
          isOpen={true}
          vehiclePlaka={vehicle.plaka}
          compartmentKey={compartmentKey}
          onClose={resetToScanner}
          onSave={handleInventorySaved}
        />
      )}

      {mode === "daily" && vehicle && (
        <DailyVehicleCheckModal
          isOpen={true}
          vehiclePlaka={vehicle.plaka}
          vehicleType={vehicle.arac_tipi}
          onClose={resetToScanner}
          onSaved={handleDailySaved}
        />
      )}
    </div>
  )
}
