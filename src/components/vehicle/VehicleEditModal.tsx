"use client"
import { useState, useEffect } from "react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Badge } from "@/components/ui/Badge"
import { Loader2, X, AlertTriangle, Truck, Save } from "lucide-react"

interface VehicleEditModalProps {
  isOpen: boolean
  onClose: () => void
  vehicle: any
  onSuccess: () => void
}

export function VehicleEditModal({ isOpen, onClose, vehicle, onSuccess }: VehicleEditModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    arac_tipi: "",
    marka: "",
    durum: "",
    sigortaBitis: "",
    muayeneBitis: "",
    km: "",
    motorSaatiPTO: "",
  })

  useEffect(() => {
    if (vehicle) {
      setFormData({
        arac_tipi: vehicle.arac_tipi || "",
        marka: vehicle.marka || "",
        durum: vehicle.durum || "aktif",
        sigortaBitis: vehicle.sigortaBitis ? new Date(vehicle.sigortaBitis).toISOString().split('T')[0] : "",
        muayeneBitis: vehicle.muayeneBitis ? new Date(vehicle.muayeneBitis).toISOString().split('T')[0] : "",
        km: vehicle.km?.toString() || "0",
        motorSaatiPTO: vehicle.motorSaatiPTO?.toString() || "0",
      })
    }
  }, [vehicle, isOpen])

  const handleSave = async () => {
    setLoading(true)
    setError(null)
    try {
      const updates = {
        arac_tipi: formData.arac_tipi,
        marka: formData.marka,
        durum: formData.durum,
        sigortaBitis: formData.sigortaBitis || null,
        muayeneBitis: formData.muayeneBitis || null,
        km: parseInt(formData.km, 10) || 0,
        motorSaatiPTO: parseInt(formData.motorSaatiPTO, 10) || 0,
      }

      const { error: updErr } = await api.update('vehicles', updates, { plaka: vehicle.plaka })

      if (updErr) throw updErr

      onSuccess()
    } catch (err: any) {
      console.error(err)
      setError("Kaydetme işlemi başarısız: " + (err.message || ""))
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen || !vehicle) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-surface border border-border w-full max-w-lg rounded-2xl shadow-2xl animate-in slide-in-from-bottom-4 zoom-in-95 overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/50 bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Truck className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Araç Düzenle</h2>
              <p className="text-sm text-muted-foreground font-mono">{vehicle.plaka}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} disabled={loading} className="rounded-full">
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Form Body */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-danger/10 border border-danger/20 rounded-xl text-danger text-sm flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Araç Tipi</label>
              <Input value={formData.arac_tipi} onChange={e => setFormData({...formData, arac_tipi: e.target.value})} placeholder="Örn: Arazöz" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Marka</label>
              <Input value={formData.marka} onChange={e => setFormData({...formData, marka: e.target.value})} placeholder="Örn: Mercedes" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Kilometre</label>
              <Input type="number" value={formData.km} onChange={e => setFormData({...formData, km: e.target.value})} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Motor / PTO Saati</label>
              <Input type="number" value={formData.motorSaatiPTO} onChange={e => setFormData({...formData, motorSaatiPTO: e.target.value})} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Durum</label>
            <select 
              className="w-full h-10 px-3 py-2 rounded-xl border border-input bg-background text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={formData.durum} 
              onChange={e => setFormData({...formData, durum: e.target.value})}
            >
              <option value="aktif">Aktif</option>
              <option value="arizali">Arızalı</option>
              <option value="bakimda">Bakımda</option>
              <option value="gorevde">Görevde</option>
            </select>
          </div>

          <div className="border-t border-border/50 pt-4 mt-2">
            <p className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
              <Badge variant="warning" className="px-1.5 py-0">Önemli</Badge> Belge Geçerlilik Tarihleri
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Sigorta Bitiş</label>
                <Input type="date" value={formData.sigortaBitis} onChange={e => setFormData({...formData, sigortaBitis: e.target.value})} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Muayene Bitiş</label>
                <Input type="date" value={formData.muayeneBitis} onChange={e => setFormData({...formData, muayeneBitis: e.target.value})} />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border/50 bg-muted/10 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={loading}>İptal</Button>
          <Button onClick={handleSave} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Kaydet
          </Button>
        </div>
      </div>
    </div>
  )
}
