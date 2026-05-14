"use client"
import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/Dialog"
import { Button } from "@/components/ui/Button"
import { Loader2, CheckCircle2, Fuel, Droplets, FlaskConical, Cog, CircleDot, Lightbulb, Sparkles } from "lucide-react"
import { api } from "@/lib/api"
import { useAuthStore } from "@/lib/authStore"
import { cn } from "@/lib/utils"

interface DailyVehicleCheckModalProps {
  isOpen: boolean
  vehiclePlaka: string
  vehicleType: string
  onClose: () => void
  onSaved: () => void
}

type StatusOption = { value: string; label: string; color: string }

const LEVEL_OPTIONS: StatusOption[] = [
  { value: "Tam", label: "Tam", color: "bg-success text-success-foreground" },
  { value: "Yarı", label: "Yarı", color: "bg-warning text-warning-foreground" },
  { value: "Az", label: "Az", color: "bg-orange-500 text-white" },
  { value: "Boş", label: "Boş", color: "bg-danger text-danger-foreground" },
]

const CONDITION_OPTIONS: StatusOption[] = [
  { value: "Çalışıyor", label: "Çalışıyor", color: "bg-success text-success-foreground" },
  { value: "Arızalı", label: "Arızalı", color: "bg-danger text-danger-foreground" },
]

const QUALITY_OPTIONS: StatusOption[] = [
  { value: "İyi", label: "İyi", color: "bg-success text-success-foreground" },
  { value: "Sorunlu", label: "Sorunlu", color: "bg-danger text-danger-foreground" },
]

const CLEAN_OPTIONS: StatusOption[] = [
  { value: "İyi", label: "İyi", color: "bg-success text-success-foreground" },
  { value: "Kötü", label: "Kötü", color: "bg-warning text-warning-foreground" },
]

interface CheckField {
  key: string
  label: string
  icon: React.ReactNode
  options: StatusOption[]
}

const CHECK_FIELDS: CheckField[] = [
  { key: "yakit_durumu", label: "Yakıt Durumu", icon: <Fuel className="w-5 h-5" />, options: LEVEL_OPTIONS },
  { key: "su_durumu", label: "Su Tankı", icon: <Droplets className="w-5 h-5" />, options: LEVEL_OPTIONS },
  { key: "kopuk_durumu", label: "Köpük Tankı", icon: <FlaskConical className="w-5 h-5" />, options: LEVEL_OPTIONS },
  { key: "pompa_durumu", label: "Pompa", icon: <Cog className="w-5 h-5" />, options: CONDITION_OPTIONS },
  { key: "lastik_durumu", label: "Lastikler", icon: <CircleDot className="w-5 h-5" />, options: QUALITY_OPTIONS },
  { key: "far_durumu", label: "Farlar & Işıklar", icon: <Lightbulb className="w-5 h-5" />, options: CONDITION_OPTIONS },
  { key: "genel_temizlik", label: "Genel Temizlik", icon: <Sparkles className="w-5 h-5" />, options: CLEAN_OPTIONS },
]

export function DailyVehicleCheckModal({ isOpen, vehiclePlaka, vehicleType, onClose, onSaved }: DailyVehicleCheckModalProps) {
  const { user } = useAuthStore()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const [form, setForm] = useState<Record<string, string>>({
    yakit_durumu: "",
    su_durumu: "",
    kopuk_durumu: "",
    pompa_durumu: "",
    lastik_durumu: "",
    far_durumu: "",
    genel_temizlik: "",
  })
  const [notlar, setNotlar] = useState("")

  const setField = (key: string, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const allFilled = CHECK_FIELDS.every(f => form[f.key] !== "")

  const handleSave = async () => {
    if (!allFilled) return
    setSaving(true)
    setError("")

    try {
      const result = await api.insert("daily_vehicle_checks", {
        plaka: vehiclePlaka,
        kontrol_eden_sicil: user?.sicilNo || "unknown",
        kontrol_eden_ad: user ? `${user.ad} ${user.soyad}` : "Bilinmeyen",
        ...form,
        notlar: notlar || null,
      })

      if (result.error) {
        throw new Error(typeof result.error === 'string' ? result.error : 'Kayıt başarısız.')
      }

      onSaved()
    } catch (err: any) {
      console.error("[DailyCheck] Kayıt hatası:", err)
      setError(err.message || "Kayıt sırasında hata oluştu.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] sm:max-h-[90vh] flex flex-col gap-0 p-0 border-primary/20 mb-[80px] sm:mb-0">
        <DialogHeader className="p-5 pb-4 border-b border-border bg-muted/30">
          <DialogTitle className="text-xl flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-primary" />
            Günlük Araç Kontrolü
          </DialogTitle>
          <DialogDescription className="text-sm mt-1">
            <strong className="text-foreground">{vehiclePlaka}</strong> — {vehicleType}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm animate-in fade-in">
              {error}
            </div>
          )}

          {CHECK_FIELDS.map(field => (
            <div key={field.key} className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                {field.icon}
                {field.label}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {field.options.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setField(field.key, opt.value)}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-semibold transition-all border-2",
                      form[field.key] === opt.value
                        ? `${opt.color} border-transparent shadow-md scale-105`
                        : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted hover:border-border"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Notes */}
          <div className="space-y-2 pt-2 border-t border-border/50">
            <label className="text-sm font-semibold text-muted-foreground">Notlar (Opsiyonel)</label>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              placeholder="Ek notlarınızı buraya yazın..."
              value={notlar}
              onChange={e => setNotlar(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="p-5 border-t border-border bg-muted/10">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto" disabled={saving}>İptal</Button>
          <Button 
            onClick={handleSave} 
            className="w-full sm:w-auto" 
            disabled={saving || !allFilled}
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Kaydediliyor...
              </span>
            ) : (
              "Kontrolü Kaydet"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
