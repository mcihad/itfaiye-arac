"use client"
import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Loader2, X, AlertTriangle, Save, Package } from "lucide-react"
import { InventoryItem } from "@/types"
import { COMPARTMENT_NAMES } from "@/lib/constants"

interface InventoryAddEditModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (item: InventoryItem, targetCompartment: string) => Promise<void>
  initialItem?: InventoryItem | null
  currentCompartment: string
  availableCompartments?: string[]
}

const TACTICAL_COMPARTMENTS = [
  { key: "sol_on_kapak", label: "Sol Ön Kapak" },
  { key: "sol_orta_kapak", label: "Sol Orta Kapak" },
  { key: "sol_arka_kapak", label: "Sol Arka Kapak" },
  { key: "sag_on_kapak", label: "Sağ Ön Kapak" },
  { key: "sag_orta_kapak", label: "Sağ Orta Kapak" },
  { key: "sag_arka_kapak", label: "Sağ Arka Kapak" },
  { key: "arac_ustu", label: "Araç Üstü" },
  { key: "kabin_ici", label: "Kabin İçi" },
  { key: "arac_ici", label: "Araç İçi" },
  { key: "arka_bolme", label: "Arka Bölme" },
  { key: "arka_kapak", label: "Arka Kapak" }
]

export function InventoryAddEditModal({
  isOpen,
  onClose,
  onSave,
  initialItem,
  currentCompartment,
  availableCompartments = []
}: InventoryAddEditModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getCompartmentLabel = (key: string): string => {
    if (!key) return ""
    if (COMPARTMENT_NAMES[key]) return COMPARTMENT_NAMES[key]
    return key
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  const [formData, setFormData] = useState({
    malzeme: "",
    adet: 1,
    durum: "Tam",
    bolme: ""
  })

  const compartmentList = availableCompartments.length > 0 
    ? availableCompartments 
    : TACTICAL_COMPARTMENTS.map(c => c.key)

  useEffect(() => {
    if (isOpen) {
      setError(null)
      const defaultCompartment = currentCompartment || compartmentList[0] || ""
      if (initialItem) {
        setFormData({
          malzeme: initialItem.malzeme || "",
          adet: initialItem.adet || 1,
          durum: initialItem.durum || "Tam",
          bolme: defaultCompartment
        })
      } else {
        setFormData({
          malzeme: "",
          adet: 1,
          durum: "Tam",
          bolme: defaultCompartment
        })
      }
    }
  }, [isOpen, initialItem, currentCompartment, compartmentList])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.malzeme.trim()) {
      setError("Lütfen malzeme adını boş bırakmayın.")
      return
    }

    setLoading(true)
    setError(null)
    try {
      const savedItem: InventoryItem = {
        id: initialItem?.id || Math.floor(Math.random() * 100000).toString(),
        malzeme: formData.malzeme.trim(),
        adet: Number(formData.adet) || 1,
        durum: formData.durum
      }
      await onSave(savedItem, formData.bolme)
      onClose()
    } catch (err: unknown) {
      console.error(err)
      const errMsg = err instanceof Error ? err.message : "Bilinmeyen hata"
      setError("İşlem gerçekleştirilemedi: " + errMsg)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  const isEdit = !!initialItem

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-950/90 border border-cyan-500/20 w-full max-w-md rounded-2xl shadow-[0_0_50px_rgba(6,182,212,0.15)] animate-in slide-in-from-bottom-4 zoom-in-95 overflow-hidden">
        
        {/* Cyber Neon Glow Header */}
        <div className="flex items-center justify-between p-5 border-b border-cyan-500/10 bg-slate-900/30 relative">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-500 to-transparent shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20">
              <Package className="w-5 h-5 text-cyan-400 drop-shadow-[0_0_6px_rgba(6,182,212,0.5)]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100 font-mono tracking-wide">
                {isEdit ? "Ekipman Düzenle" : "Yeni Ekipman Ekle"}
              </h2>
              <p className="text-[10px] text-cyan-400 font-mono uppercase tracking-widest mt-0.5">
                {isEdit ? "Mevcut kaydı güncelle" : "Taktik envantere malzeme ekle"}
              </p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onClose} 
            disabled={loading} 
            className="rounded-full hover:bg-slate-800 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs flex items-start gap-2 animate-shake">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <p className="font-medium font-mono">{error}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-400 font-mono uppercase tracking-wider">Malzeme Adı</label>
            <Input 
              value={formData.malzeme} 
              onChange={e => setFormData({...formData, malzeme: e.target.value})} 
              placeholder="Örn: Hortum 20m, SCBA Maskesi vb." 
              className="bg-slate-900/50 border-cyan-500/10 text-slate-200 placeholder-slate-600 focus:border-cyan-500/50 rounded-xl h-11"
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 font-mono uppercase tracking-wider">Miktar (Adet)</label>
              <Input 
                type="number" 
                min="1"
                value={formData.adet} 
                onChange={e => setFormData({...formData, adet: Math.max(1, parseInt(e.target.value, 10) || 1)})} 
                className="bg-slate-900/50 border-cyan-500/10 text-slate-200 focus:border-cyan-500/50 rounded-xl h-11"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 font-mono uppercase tracking-wider">Durum</label>
              <select 
                className="w-full h-11 px-3 py-2 rounded-xl border border-cyan-500/10 bg-slate-900/80 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                value={formData.durum} 
                onChange={e => setFormData({...formData, durum: e.target.value})}
              >
                <option value="Tam">Tam (Kullanılabilir)</option>
                <option value="Eksik">Eksik (Arızalı/Hasarlı)</option>
                <option value="Kayıp/Yok">Kayıp / Yok</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-cyan-500/5">
            <label className="text-xs font-bold text-slate-400 font-mono uppercase tracking-wider">Atandığı Bölme</label>
            <select 
              className="w-full h-11 px-3 py-2 rounded-xl border border-cyan-500/10 bg-slate-900/80 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 font-mono"
              value={formData.bolme} 
              onChange={e => setFormData({...formData, bolme: e.target.value})}
            >
              {compartmentList.map(key => (
                <option key={key} value={key}>{getCompartmentLabel(key)}</option>
              ))}
            </select>
            <p className="text-[10px] text-slate-500 font-mono leading-relaxed mt-1">
              * Bölme değişikliği yapıldığında ekipman otomatik olarak yeni bölmenin envanterine transfer edilecektir.
            </p>
          </div>

          {/* Footer Buttons */}
          <div className="p-4 bg-slate-900/20 border-t border-cyan-500/5 -mx-5 -mb-5 flex justify-end gap-3">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose} 
              disabled={loading}
              className="rounded-xl border-cyan-500/10 bg-slate-950 hover:bg-slate-900 text-slate-300 font-mono"
            >
              İptal
            </Button>
            <Button 
              type="submit" 
              disabled={loading} 
              className="rounded-xl font-bold bg-cyan-600 hover:bg-cyan-500 text-white font-mono gap-2 border border-cyan-500/30"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{isEdit ? "Güncelle" : "Ekle"}</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

