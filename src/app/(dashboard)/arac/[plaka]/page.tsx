"use client"

import { useParams } from "next/navigation"
import { useState, useEffect } from "react"
import { api } from "@/lib/api"
import { COMPARTMENT_NAMES } from "@/lib/constants"
import { DailyVehicleCheckModal } from "@/components/inventory/DailyVehicleCheckModal"
import { InventoryCheckModal } from "@/components/inventory/InventoryCheckModal"
import { Card, CardContent } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import {
  Truck, ScanLine, CheckCircle2, ClipboardCheck, ChevronDown, Loader2, ArrowLeft, X, AlertTriangle
} from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { toast } from "@/lib/toast"

type PageMode = "loading" | "not-found" | "choose" | "inventory" | "daily" | "success"

export default function VehicleDeepLinkPage() {
  const params = useParams()
  const plakaSlug = params.plaka as string

  const [vehicle, setVehicle] = useState<any>(null)
  const [mode, setMode] = useState<PageMode>("loading")
  const [compartmentKey, setCompartmentKey] = useState("")
  const [successMsg, setSuccessMsg] = useState("")

  // 🚨 Arıza Bildirim State'leri
  const [isArizaOpen, setIsArizaOpen] = useState(false)
  const [arizaAciklama, setArizaAciklama] = useState("")
  const [arizaBolme, setArizaBolme] = useState("Genel Araç Gövdesi")
  const [isSavingAriza, setIsSavingAriza] = useState(false)

  useEffect(() => {
    async function fetchVehicle() {
      const { data: vehicles } = await api.from("vehicles").select("*")
      const found = (vehicles || []).find(
        (v: any) => v.plaka.replace(/\s+/g, "-").toLowerCase() === plakaSlug.toLowerCase()
      )
      if (found) {
        setVehicle(found)
        setMode("choose")
      } else {
        setMode("not-found")
      }
    }
    fetchVehicle()
  }, [plakaSlug])

  const vehicleCompartments = vehicle?.bolmeler
    ? Object.keys(vehicle.bolmeler).filter((k: string) => Array.isArray(vehicle.bolmeler[k]) && vehicle.bolmeler[k].length > 0)
    : []

  const handleCompartmentSelect = (key: string) => {
    setCompartmentKey(key)
    setMode("inventory")
  }

  const handleInventorySaved = async () => {
    setSuccessMsg(`${vehicle?.plaka} — ${COMPARTMENT_NAMES[compartmentKey] || compartmentKey} sayımı kaydedildi!`)
    setMode("success")
    // Not: Sayım yapıldığında artık SMS gönderilmez. Yerine, posta değişiminden
    // 20 dk sonra sayımı YAPILMAYAN araçlar için /api/cron/sayim-uyari uyarı gönderir.
  }

  const handleDailySaved = () => {
    setSuccessMsg(`${vehicle?.plaka} günlük kontrol raporu kaydedildi!`)
    setMode("success")
  }

  const handleArizaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!arizaAciklama.trim()) return;

    setIsSavingAriza(true);
    try {
      const formattedAciklama = `${arizaBolme} Arızası: ${arizaAciklama.trim()}`;

      const res = await fetch('/api/arac-ariza-bildir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plaka: vehicle.plaka,
          aciklama: formattedAciklama,
          durum: 'Bekliyor'
        })
      });
      const data = await res.json();
      if (data.success) {
        setIsArizaOpen(false);
        setArizaAciklama("");
        toast("Arıza kaydı başarıyla garaj merkezine iletildi.");
      } else {
        toast("Bildirim gönderilemedi: " + (data.error || "Bilinmeyen hata"));
      }
    } catch (err) {
      console.error("Ariza submit error:", err);
      toast("Bağlantı hatası oluştu.");
    } finally {
      setIsSavingAriza(false);
    }
  }

  // ─── Loading ─────────────────────────────────────────────
  if (mode === "loading") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <Loader2 className="w-12 h-12 animate-spin text-[var(--fd-accent)] mx-auto" />
          <p className="text-[var(--fd-text3)] text-sm">Araç bilgileri yükleniyor...</p>
        </div>
      </div>
    )
  }

  // ─── Not Found ───────────────────────────────────────────
  if (mode === "not-found") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full text-center">
          <CardContent className="p-8 space-y-4">
            <Truck className="w-16 h-16 text-[var(--fd-text3)]/30 mx-auto" />
            <h2 className="text-xl font-bold">Araç Bulunamadı</h2>
            <p className="text-sm text-[var(--fd-text3)]">
              <code className="bg-[var(--fd-surface3)] px-2 py-0.5 rounded">{plakaSlug}</code> plakasına sahip araç sistemde kayıtlı değil.
            </p>
            <Link href="/araclar" className="inline-flex items-center gap-2 text-[var(--fd-accent)] text-sm font-medium hover:underline">
              <ArrowLeft className="w-4 h-4" /> Araç Listesine Dön
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ─── Success ─────────────────────────────────────────────
  if (mode === "success") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full text-center border-[var(--fd-success)]/30">
          <CardContent className="p-8 space-y-4">
            <CheckCircle2 className="w-16 h-16 text-[var(--fd-success)] mx-auto" />
            <h2 className="text-xl font-bold text-[var(--fd-success)]">İşlem Başarılı!</h2>
            <p className="text-sm text-[var(--fd-text3)]">{successMsg}</p>
            <div className="flex gap-2 justify-center">
              <Link href="/araclar" className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--fd-surface3)] hover:opacity-80 rounded-[var(--fd-r-sm)] text-sm font-medium transition-colors">
                <Truck className="w-4 h-4" /> Araçlar
              </Link>
              <button
                onClick={() => setMode("choose")}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--fd-accent)] text-[#ffffff] rounded-[var(--fd-r-sm)] text-sm font-medium hover:opacity-90 transition-colors"
              >
                <ScanLine className="w-4 h-4" /> Tekrar Kontrol
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ─── Choose Mode ─────────────────────────────────────────
  return (
    <div className="flex flex-col items-center justify-start min-h-[60vh] pt-8 space-y-6 max-w-md mx-auto relative">
      {/* Vehicle Header */}
      <div className="text-center space-y-2">
        <Badge variant="success" className="text-xs mb-2">QR ile Açıldı</Badge>
        <div className="w-16 h-16 bg-[var(--fd-accent)]/10 rounded-[var(--fd-r-lg)] flex items-center justify-center mx-auto">
          <Truck className="w-8 h-8 text-[var(--fd-accent)]" />
        </div>
        <h1 className="text-2xl font-black tracking-wider text-[var(--fd-text)]">{vehicle.plaka}</h1>
        <p className="text-[var(--fd-text2)] text-sm">
          {vehicle.arac_tipi || vehicle.aracTipi}
          {vehicle.marka ? ` — ${vehicle.marka}` : ""}
        </p>
      </div>

      {/* Action Buttons */}
      <div className="w-full space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">
          Ne yapmak istiyorsunuz?
        </p>

        {/* Option 1: Compartment/Inventory */}
        <button
          onClick={() => {
            if (vehicleCompartments.length === 1) {
              handleCompartmentSelect(vehicleCompartments[0])
            } else if (vehicleCompartments.length > 0) {
              const el = document.getElementById("compartment-list-deep")
              if (el) el.classList.toggle("hidden")
            }
          }}
          disabled={vehicleCompartments.length === 0}
          className={cn(
            "w-full p-4 border-2 rounded-[var(--fd-r-lg)] flex items-center gap-4 transition-all group text-left",
            vehicleCompartments.length > 0
              ? "bg-[var(--fd-info)]/5 hover:bg-[var(--fd-info)]/10 border-[var(--fd-info)]/20 hover:border-[var(--fd-info)]/40"
              : "bg-[var(--fd-surface3)] border-[var(--fd-border)] opacity-50 cursor-not-allowed"
          )}
        >
          <div className="w-12 h-12 bg-[var(--fd-info)]/15 rounded-[var(--fd-r)] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
            <ClipboardCheck className="w-6 h-6 text-[var(--fd-info)]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-base text-[var(--fd-text)]">Bölme / Envanter Sayımı</p>
            <p className="text-xs text-[var(--fd-text3)] mt-0.5">
              {vehicleCompartments.length > 0
                ? `${vehicleCompartments.length} bölme mevcut`
                : "Bu araçta tanımlı bölme yok"}
            </p>
          </div>
          {vehicleCompartments.length > 1 && (
            <ChevronDown className="w-5 h-5 text-[var(--fd-text3)] shrink-0" />
          )}
        </button>

        {/* Compartment sub-list */}
        {vehicleCompartments.length > 1 && (
          <div id="compartment-list-deep" className="hidden space-y-1.5 pl-4 animate-in slide-in-from-top-2">
            {vehicleCompartments.map((key: string) => (
              <button
                key={key}
                onClick={() => handleCompartmentSelect(key)}
                className="w-full p-3 bg-[var(--fd-surface2)] hover:bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] text-left text-sm font-medium transition-colors flex items-center gap-2 text-[var(--fd-text2)] hover:text-[var(--fd-text)]"
              >
                <div className="w-2 h-2 rounded-full bg-[var(--fd-info)] shrink-0" />
                {COMPARTMENT_NAMES[key] || key}
              </button>
            ))}
          </div>
        )}

        {/* Option 2: Daily Check */}
        <button
          onClick={() => setMode("daily")}
          className="w-full p-4 bg-[var(--fd-success)]/5 hover:bg-[var(--fd-success)]/10 border-2 border-[var(--fd-success)]/20 hover:border-[var(--fd-success)]/40 rounded-[var(--fd-r-lg)] flex items-center gap-4 transition-all group text-left"
        >
          <div className="w-12 h-12 bg-[var(--fd-success)]/15 rounded-[var(--fd-r)] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
            <Truck className="w-6 h-6 text-[var(--fd-success)]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-base text-[var(--fd-text)]">Günlük Araç Kontrolü</p>
            <p className="text-xs text-[var(--fd-text3)] mt-0.5">
              Yakıt, su, köpük, pompa ve genel durum kontrolü
            </p>
          </div>
        </button>

        {/* Option 3: 🚨 Arıza / Hasar Raporla (min-h-44px touch friendly) */}
        <button
          onClick={() => setIsArizaOpen(true)}
          className="w-full p-4 bg-[var(--fd-danger)]/10 hover:bg-[var(--fd-danger)]/20 border-2 border-[var(--fd-danger)]/20 hover:border-[var(--fd-danger)]/40 rounded-[var(--fd-r-lg)] flex items-center gap-4 transition-all group text-left min-h-[44px]"
        >
          <div className="w-12 h-12 bg-[var(--fd-danger)]/15 rounded-[var(--fd-r)] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform border border-[var(--fd-danger)]/20">
            <AlertTriangle className="w-6 h-6 text-[var(--fd-danger)]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-base text-[var(--fd-danger)]">Arıza / Hasar Raporla</p>
            <p className="text-xs text-[var(--fd-text2)] mt-0.5">
              Saha başında tespit edilen hasarı anında garaja bildir
            </p>
          </div>
        </button>
      </div>

      {/* Cam Morfolojili Arıza Bildirim Pop-up Modalı */}
      {isArizaOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <Card className="w-full max-w-md bg-[var(--fd-surface)] border border-[var(--fd-border)] shadow-[var(--fd-shadow-lg)] overflow-hidden rounded-[var(--fd-r-lg)] p-6 relative">
            <button 
              onClick={() => setIsArizaOpen(false)}
              className="absolute top-4 right-4 text-[var(--fd-text3)] hover:text-[var(--fd-text)] rounded-lg h-9 w-9 p-0 flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-6 h-6 text-[var(--fd-danger)]" />
                <h3 className="text-lg font-black text-[var(--fd-danger)] tracking-wider">ARIZA / HASAR BİLDİRİMİ</h3>
              </div>
              <p className="text-xs text-[var(--fd-text2)] leading-relaxed">
                Bu bildirim Sivas Belediyesi İtfaiye Garajı arıza takip veritabanına anlık kayıt oluşturur.
              </p>

              <form onSubmit={handleArizaSubmit} className="space-y-4 pt-2">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[var(--fd-text3)] uppercase tracking-wider block">Araç Plakası / Bilgisi</label>
                  <input 
                    type="text" 
                    readOnly 
                    value={vehicle.plaka} 
                    className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text3)] rounded-xl px-3.5 py-2.5 text-sm cursor-not-allowed font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-[var(--fd-text3)] uppercase tracking-wider block">Arıza Yapılan Bölme / Kapak</label>
                  <select
                    value={arizaBolme}
                    onChange={(e) => setArizaBolme(e.target.value)}
                    className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-[var(--fd-danger)] font-semibold"
                  >
                    <option value="Genel Araç Gövdesi">Genel Araç Gövdesi</option>
                    {vehicleCompartments.map((key: string) => (
                      <option key={key} value={COMPARTMENT_NAMES[key] || key}>
                        {COMPARTMENT_NAMES[key] || key}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-[var(--fd-text3)] uppercase tracking-wider block">Arıza Tanımı / Açıklaması <span className="text-[var(--fd-danger)]">*</span></label>
                  <textarea
                    required
                    rows={3}
                    value={arizaAciklama}
                    onChange={(e) => setArizaAciklama(e.target.value)}
                    placeholder="Arıza detayını yazınız..."
                    className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-[var(--fd-danger)] font-medium resize-none"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={isSavingAriza || !arizaAciklama.trim()}
                  className="w-full bg-[var(--fd-danger)] hover:opacity-90 text-white font-bold rounded-xl h-11 flex items-center justify-center gap-1.5 shadow-md min-h-[44px]"
                >
                  {isSavingAriza ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>Arızayı Merkeze Raporla</>
                  )}
                </Button>
              </form>
            </div>
          </Card>
        </div>
      )}

      {/* Modals */}
      {mode === "inventory" && vehicle && compartmentKey && (
        <InventoryCheckModal
          isOpen={true}
          vehiclePlaka={vehicle.plaka}
          compartmentKey={compartmentKey}
          onClose={() => setMode("choose")}
          onSave={handleInventorySaved}
        />
      )}

      {mode === "daily" && vehicle && (
        <DailyVehicleCheckModal
          isOpen={true}
          vehiclePlaka={vehicle.plaka}
          vehicleType={vehicle.arac_tipi || vehicle.aracTipi || "Araç"}
          onClose={() => setMode("choose")}
          onSaved={handleDailySaved}
        />
      )}
    </div>
  )
}
