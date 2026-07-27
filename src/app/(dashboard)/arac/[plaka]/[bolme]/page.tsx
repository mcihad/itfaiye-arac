"use client"

import { useParams, useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import { api } from "@/lib/api"
import { COMPARTMENT_NAMES } from "@/lib/constants"
import { InventoryCheckModal } from "@/components/inventory/InventoryCheckModal"
import { AuditTimeline } from "@/components/inventory/AuditTimeline"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { ArrowLeft, Truck, ScanLine, CheckCircle2, AlertTriangle, X, Loader2 } from "lucide-react"
import Link from "next/link"
import { toast } from "@/lib/toast"

export default function DeepLinkCompartmentPage() {
  const params = useParams()
  const router = useRouter()
  const plakaSlug = params.plaka as string
  const bolmeKey = params.bolme as string

  const [vehicle, setVehicle] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // 🚨 Arıza Raporlama Eklentileri
  const [isArizaOpen, setIsArizaOpen] = useState(false)
  const [arizaAciklama, setArizaAciklama] = useState("")
  const [isSavingAriza, setIsSavingAriza] = useState(false)

  // Parse plaka from slug: "58-act-367" -> try matching against DB
  useEffect(() => {
    async function fetchVehicle() {
      const { data: vehicles } = await api.from("vehicles").select("*")
      const found = (vehicles || []).find(
        (v: any) => v.plaka.replace(/\s+/g, "-").toLowerCase() === plakaSlug.toLowerCase()
      )
      setVehicle(found || null)
      setLoading(false)

      // Auto-open inventory modal after a brief delay
      if (found) {
        setTimeout(() => setModalOpen(true), 400)
      }
    }
    fetchVehicle()
  }, [plakaSlug])

  const handleSave = async (results: any[]) => {
    setModalOpen(false)
    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 4000)
    // Not: Sayım yapıldığında artık SMS gönderilmez. Yerine, posta değişiminden
    // 20 dk sonra sayımı YAPILMAYAN araçlar için /api/cron/sayim-uyari uyarı gönderir.
  }

  const compartmentName = COMPARTMENT_NAMES[bolmeKey] || bolmeKey

  const handleArizaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!arizaAciklama.trim()) return;

    setIsSavingAriza(true);
    try {
      const formattedAciklama = `${compartmentName} Arızası: ${arizaAciklama.trim()}`;

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-full border-4 border-primary/30 border-t-primary animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">Araç bilgileri yükleniyor...</p>
        </div>
      </div>
    )
  }

  if (!vehicle) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full text-center">
          <CardContent className="p-8 space-y-4">
            <Truck className="w-16 h-16 text-muted-foreground/30 mx-auto" />
            <h2 className="text-xl font-bold">Araç Bulunamadı</h2>
            <p className="text-sm text-muted-foreground">
              <code className="bg-muted px-2 py-0.5 rounded">{plakaSlug}</code> plakasına sahip araç sistemde kayıtlı değil.
            </p>
            <Link href="/araclar" className="inline-flex items-center gap-2 text-primary text-sm font-medium hover:underline">
              <ArrowLeft className="w-4 h-4" /> Araç Listesine Dön
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto relative">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-border/50 pb-4">
        <Link href={`/araclar/${plakaSlug}`} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-muted transition-colors shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold">{vehicle.plaka}</h1>
            <Badge variant="success" className="text-[10px]">QR Tarandı</Badge>
          </div>
          <p className="text-muted-foreground text-sm truncate">{vehicle.aracTipi || vehicle.arac_tipi} — {compartmentName}</p>
        </div>
        <div className="p-3 bg-cyan-500/10 rounded-xl border border-cyan-500/20 shrink-0">
          <ScanLine className="w-6 h-6 text-cyan-400" />
        </div>
      </div>

      {/* Success message */}
      {saveSuccess && (
        <div className="flex items-center gap-2 p-4 bg-success/10 border border-success/20 rounded-xl text-success animate-in fade-in slide-in-from-top-3">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <div>
            <p className="font-bold text-sm">Sayım başarıyla kaydedildi!</p>
            <p className="text-xs mt-0.5 opacity-80">{vehicle.plaka} — {compartmentName}</p>
          </div>
        </div>
      )}

      {/* Info Card */}
      <Card className="border-cyan-500/15 bg-cyan-500/[0.02]">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ScanLine className="w-4 h-4 text-cyan-400" />
            QR Derin Bağlantı
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Bu sayfa <strong className="text-foreground">{vehicle.plaka}</strong> aracının <strong className="text-foreground">{compartmentName}</strong> bölmesine doğrudan bağlantı ile açıldı.
          </p>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            {!modalOpen && !saveSuccess && (
              <button
                onClick={() => setModalOpen(true)}
                className="w-full bg-primary text-primary-foreground rounded-xl py-3 font-bold text-sm hover:bg-primary/90 transition-colors min-h-[44px]"
              >
                Sayımı Başlat
              </button>
            )}
            <button
              onClick={() => setIsArizaOpen(true)}
              className="w-full bg-red-950/20 hover:bg-red-950/30 text-red-400 hover:text-white border border-red-500/20 rounded-xl py-3 font-bold text-sm transition-all min-h-[44px] shadow-[0_0_12px_rgba(239,68,68,0.1)] flex items-center justify-center gap-1.5"
            >
              <AlertTriangle className="w-4 h-4 text-red-500" /> Arıza Bildir
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Audit Timeline */}
      <Card>
        <CardHeader className="pb-3 border-b border-border/50">
          <CardTitle className="text-base">Kontrol Geçmişi</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <AuditTimeline plaka={vehicle.plaka} compartmentKey={bolmeKey} />
        </CardContent>
      </Card>

      {/* Inventory Check Modal */}
      <InventoryCheckModal
        isOpen={modalOpen}
        vehiclePlaka={vehicle.plaka}
        compartmentKey={bolmeKey}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
      />

      {/* Cam Morfolojili Arıza Bildirim Pop-up Modalı */}
      {isArizaOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <Card className="w-full max-w-md bg-slate-950/90 backdrop-blur-md border border-red-900/50 shadow-[0_0_30px_rgba(239,68,68,0.25)] overflow-hidden rounded-2xl p-6 relative">
            <button 
              onClick={() => setIsArizaOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white rounded-lg h-9 w-9 p-0 flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-6 h-6 text-red-500" />
                <h3 className="text-lg font-black text-red-400 tracking-wider">BÖLME ARIZA BİLDİRİMİ</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Bu bildirim Sivas Belediyesi İtfaiye Garajı arıza takip veritabanına anlık kayıt oluşturur.
              </p>

              <form onSubmit={handleArizaSubmit} className="space-y-4 pt-2">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Araç Plakası / Bilgisi</label>
                  <input 
                    type="text" 
                    readOnly 
                    value={vehicle.plaka} 
                    className="w-full bg-slate-900 border border-slate-800 text-slate-400 rounded-xl px-3.5 py-2.5 text-sm cursor-not-allowed font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Arıza Yapılan Bölme / Kapak</label>
                  <input 
                    type="text" 
                    readOnly 
                    value={compartmentName} 
                    className="w-full bg-slate-900 border border-slate-800 text-slate-400 rounded-xl px-3.5 py-2.5 text-sm cursor-not-allowed font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Arıza Tanımı / Açıklaması <span className="text-red-500">*</span></label>
                  <textarea
                    required
                    rows={3}
                    value={arizaAciklama}
                    onChange={(e) => setArizaAciklama(e.target.value)}
                    placeholder="Arıza detayını yazınız..."
                    className="w-full bg-slate-900 border border-slate-800 text-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-red-500 font-medium resize-none"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={isSavingAriza || !arizaAciklama.trim()}
                  className="w-full bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl h-11 flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(239,68,68,0.3)] min-h-[44px]"
                >
                  {isSavingAriza ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>🚨 Arızayı Merkeze Raporla</>
                  )}
                </Button>
              </form>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
