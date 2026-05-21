"use client"
import { useState } from "react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Badge } from "@/components/ui/Badge"
import { Loader2, X, AlertTriangle, Truck, PlusCircle, Sparkles } from "lucide-react"

interface VehicleAddModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

const VEHICLE_TYPES = [
  "Arazöz",
  "Hızlı Müdahale",
  "Kurtarma",
  "Merdivenli",
  "Lojistik",
  "Tanker"
]

const DEFAULT_STATIONS = [
  "Merkez İstasyonu",
  "Fatih İstasyonu",
  "Kılavuz İstasyonu",
  "Karşıyaka İstasyonu"
]

// Prepopulated default compartments based on vehicle types
const getPresetCompartments = (type: string) => {
  switch (type) {
    case "Arazöz":
      return {
        kabin_ici: [
          { malzeme: "Kriko", adet: 1, durum: "Tam" },
          { malzeme: "Lastik Şişirme Aparatı", adet: 1, durum: "Tam" },
          { malzeme: "Çeki Demiri", adet: 1, durum: "Tam" },
          { malzeme: "Şarjlı Projektör", adet: 1, durum: "Tam" }
        ],
        sag_on_kapak: [
          { malzeme: "Ayaklı Aydınlatma Lambası", adet: 1, durum: "Tam" },
          { malzeme: "Jeneratör", adet: 1, durum: "Tam" },
          { malzeme: "Hidrolik Güç Ünitesi", adet: 1, durum: "Tam" },
          { malzeme: "Hidrolik Kesici", adet: 1, durum: "Tam" },
          { malzeme: "Hidrolik Ayırıcı", adet: 2, durum: "Tam" }
        ],
        sol_arka_kapak: [
          { malzeme: "85'lik Hortum", adet: 5, durum: "Tam" },
          { malzeme: "85'lik Turbo Lans", adet: 2, durum: "Tam" },
          { malzeme: "85'lik Kollu Lans", adet: 2, durum: "Tam" },
          { malzeme: "Ağır Köpük Lansı", adet: 1, durum: "Tam" }
        ]
      }
    case "Hızlı Müdahale":
      return {
        sol_on_kapak: [
          { malzeme: "Holmatro Güç Ünitesi", adet: 1, durum: "Tam" },
          { malzeme: "Holmatro Kesici", adet: 1, durum: "Tam" },
          { malzeme: "Holmatro Ayırıcı", adet: 1, durum: "Tam" },
          { malzeme: "Hilti", adet: 1, durum: "Tam" },
          { malzeme: "Amir Baltası", adet: 1, durum: "Tam" }
        ],
        sol_arka_kapak: [
          { malzeme: "85'lik Hortum", adet: 5, durum: "Tam" },
          { malzeme: "85'lik Turbo Lans", adet: 2, durum: "Tam" },
          { malzeme: "Ala Hortum Süzgeci", adet: 1, durum: "Tam" }
        ],
        arac_ustu: [
          { malzeme: "Alıcı Hortum", adet: 2, durum: "Tam" },
          { malzeme: "Dalgıç Pompa", adet: 1, durum: "Tam" },
          { malzeme: "Seyyar Merdiven", adet: 1, durum: "Tam" }
        ]
      }
    case "Kurtarma":
      return {
        sol_on_kapak: [
          { malzeme: "Kaşık Sedye", adet: 1, durum: "Tam" },
          { malzeme: "Tripot", adet: 1, durum: "Tam" },
          { malzeme: "Jeneratör", adet: 2, durum: "Tam" }
        ],
        sol_orta_kapak: [
          { malzeme: "Hidrolik El Manueli ve Hortumu", adet: 1, durum: "Tam" },
          { malzeme: "Manuel Kapı Açma", adet: 1, durum: "Tam" },
          { malzeme: "Cam Kırma Aparatı", adet: 1, durum: "Tam" }
        ],
        sol_arka_kapak: [
          { malzeme: "Beton Kesme Motoru", adet: 1, durum: "Tam" },
          { malzeme: "Kıvılcımsız Testere", adet: 1, durum: "Tam" },
          { malzeme: "Trifor ve Halatı", adet: 1, durum: "Tam" }
        ],
        sag_on_kapak: [
          { malzeme: "Holmatro Ayırma Şarjlı", adet: 1, durum: "Tam" },
          { malzeme: "Holmatro Kesici Şarjlı", adet: 1, durum: "Tam" },
          { malzeme: "Tahta Takoz", adet: 4, durum: "Tam" },
          { malzeme: "Sapan", adet: 1, durum: "Tam" }
        ]
      }
    case "Merdivenli":
      return {
        arac_ici: [
          { malzeme: "El Feneri", adet: 3, durum: "Tam" },
          { malzeme: "Yangın Battaniyesi", adet: 1, durum: "Tam" },
          { malzeme: "Yaralı Sabitleme Sargısı", adet: 2, durum: "Tam" }
        ],
        sag_on_kapak: [
          { malzeme: "6 KG YSK Tüpü", adet: 2, durum: "Tam" },
          { malzeme: "Temiz Hava Solunum Cihazı", adet: 2, durum: "Tam" }
        ],
        sol_on_kapak: [
          { malzeme: "Büyük Amir Baltası", adet: 1, durum: "Tam" },
          { malzeme: "Büyük Balta", adet: 1, durum: "Tam" },
          { malzeme: "Duba", adet: 2, durum: "Tam" }
        ]
      }
    case "Lojistik":
    case "Tanker":
    default:
      return {
        kabin_ici: [
          { malzeme: "İlk Yardım Çantası", adet: 1, durum: "Tam" },
          { malzeme: "El Feneri", adet: 2, durum: "Tam" }
        ],
        arka_bolme: [
          { malzeme: "85'lik Hortum", adet: 4, durum: "Tam" },
          { malzeme: "Alıcı Hortum Süzgeci", adet: 1, durum: "Tam" },
          { malzeme: "85'lik Kollu Lans", adet: 2, durum: "Tam" }
        ]
      }
  }
}

export function VehicleAddModal({ isOpen, onClose, onSuccess }: VehicleAddModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    plaka: "",
    arac_tipi: "Arazöz",
    marka: "",
    durum: "aktif",
    sigortaBitis: "",
    muayeneBitis: "",
    km: "",
    motorSaatiPTO: "",
    istasyon: "Merkez İstasyonu",
    yil: new Date().getFullYear().toString(),
    model: ""
  })

  const handleSave = async () => {
    setLoading(true)
    setError(null)

    // Form validation
    const trimmedPlaka = formData.plaka.trim().toUpperCase().replace(/\s+/g, " ")
    if (!trimmedPlaka) {
      setError("Lütfen geçerli bir araç plakası girin.")
      setLoading(false)
      return
    }

    const plakaPattern = /^(0[1-9]|[1-8][0-9])\s?[A-Z]{1,3}\s?[0-9]{2,4}$/i
    if (!plakaPattern.test(trimmedPlaka.replace(/\s+/g, ""))) {
      setError("Geçersiz plaka formatı! Örn: 58 ACT 367")
      setLoading(false)
      return
    }

    try {
      const presetCompartments = getPresetCompartments(formData.arac_tipi)

      const payload = {
        data: {
          plaka: trimmedPlaka,
          arac_tipi: formData.arac_tipi,
          aracTipi: formData.arac_tipi,
          marka: formData.marka.trim().toUpperCase() || "S-ADD",
          durum: formData.durum,
          sigortaBitis: formData.sigortaBitis || null,
          muayeneBitis: formData.muayeneBitis || null,
          km: parseInt(formData.km, 10) || 0,
          motorSaatiPTO: parseInt(formData.motorSaatiPTO, 10) || 0,
          istasyon: formData.istasyon,
          yil: parseInt(formData.yil, 10) || new Date().getFullYear(),
          model: formData.model.trim() || `${formData.arac_tipi} Araç`,
          bolmeler: presetCompartments,
          aktifPersonel: []
        }
      }

      const { error: insertErr } = await api.insert('vehicles', payload.data)
      if (insertErr) throw insertErr

      // Reset form
      setFormData({
        plaka: "",
        arac_tipi: "Arazöz",
        marka: "",
        durum: "aktif",
        sigortaBitis: "",
        muayeneBitis: "",
        km: "",
        motorSaatiPTO: "",
        istasyon: "Merkez İstasyonu",
        yil: new Date().getFullYear().toString(),
        model: ""
      })
      onSuccess()
    } catch (err: any) {
      console.error(err)
      setError("Kaydetme işlemi başarısız: " + (err.message || "Bilinmeyen veritabanı hatası."))
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
      <div className="relative bg-slate-900/90 border border-white/10 w-full max-w-xl rounded-3xl shadow-[0_0_50px_-12px_rgba(34,211,238,0.3)] animate-in slide-in-from-bottom-6 duration-300 overflow-hidden">
        
        {/* Neon decorative highlights */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-500 via-cyan-500 to-indigo-500" />
        <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-32 h-32 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/5 bg-slate-950/40">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shadow-[0_0_15px_-3px_rgba(34,211,238,0.3)]">
              <Truck className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                <span>Yeni Taktik Araç Ekle</span>
                <Sparkles className="w-4 h-4 text-emerald-400 animate-pulse" />
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Sivas İtfaiyesi envanterine yeni taktik operasyon aracı tanımla.</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            disabled={loading} 
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {error && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400 text-xs flex items-start gap-2.5 animate-bounce">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <p className="font-semibold">{error}</p>
            </div>
          )}

          {/* Form Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 col-span-2 sm:col-span-1">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Araç Plakası</label>
              <Input 
                value={formData.plaka} 
                onChange={e => setFormData({...formData, plaka: e.target.value.toUpperCase()})} 
                placeholder="Örn: 58 ACT 367" 
                className="font-mono tracking-widest text-slate-100 uppercase border-white/10 focus:border-cyan-500/50 bg-slate-950/50"
              />
            </div>

            <div className="space-y-1.5 col-span-2 sm:col-span-1">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Taktik Kod (Marka/Kod)</label>
              <Input 
                value={formData.marka} 
                onChange={e => setFormData({...formData, marka: e.target.value})} 
                placeholder="Örn: S-A1, S-M2" 
                className="font-mono tracking-widest text-cyan-400 font-extrabold uppercase border-white/10 focus:border-cyan-500/50 bg-slate-950/50"
              />
            </div>

            <div className="space-y-1.5 col-span-2 sm:col-span-1">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Araç Tipi</label>
              <select 
                value={formData.arac_tipi} 
                onChange={e => setFormData({...formData, arac_tipi: e.target.value})}
                className="w-full h-10 px-3 py-2 rounded-xl border border-white/10 bg-slate-950/50 text-slate-100 text-sm font-semibold focus:outline-none focus:border-cyan-500/50"
              >
                {VEHICLE_TYPES.map(t => (
                  <option key={t} value={t} className="bg-slate-900 text-slate-200">{t}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5 col-span-2 sm:col-span-1">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Bağlı İstasyon</label>
              <select 
                value={formData.istasyon} 
                onChange={e => setFormData({...formData, istasyon: e.target.value})}
                className="w-full h-10 px-3 py-2 rounded-xl border border-white/10 bg-slate-950/50 text-slate-100 text-sm font-semibold focus:outline-none focus:border-cyan-500/50"
              >
                {DEFAULT_STATIONS.map(st => (
                  <option key={st} value={st} className="bg-slate-900 text-slate-200">{st}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Model / Model Yılı</label>
              <div className="flex gap-2">
                <Input 
                  type="number" 
                  value={formData.yil} 
                  onChange={e => setFormData({...formData, yil: e.target.value})} 
                  placeholder="Yıl" 
                  className="w-20 font-mono text-slate-100 border-white/10 bg-slate-950/50"
                />
                <Input 
                  value={formData.model} 
                  onChange={e => setFormData({...formData, model: e.target.value})} 
                  placeholder="Örn: Ford Cargo 2533" 
                  className="flex-1 text-slate-100 border-white/10 bg-slate-950/50"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Aktif Durum</label>
              <select 
                value={formData.durum} 
                onChange={e => setFormData({...formData, durum: e.target.value})}
                className="w-full h-10 px-3 py-2 rounded-xl border border-white/10 bg-slate-950/50 text-slate-100 text-sm font-semibold focus:outline-none focus:border-cyan-500/50"
              >
                <option value="aktif" className="bg-slate-900 text-emerald-400">Aktif (Operasyona Hazır)</option>
                <option value="bakimda" className="bg-slate-900 text-amber-400">Bakımda</option>
                <option value="arizali" className="bg-slate-900 text-rose-400">Arızalı (Grup Dışı)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Kilometre (KM)</label>
              <Input 
                type="number" 
                value={formData.km} 
                onChange={e => setFormData({...formData, km: e.target.value})} 
                placeholder="Örn: 45000"
                className="font-mono text-slate-100 border-white/10 bg-slate-950/50"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Motor Saati (PTO)</label>
              <Input 
                type="number" 
                value={formData.motorSaatiPTO} 
                onChange={e => setFormData({...formData, motorSaatiPTO: e.target.value})} 
                placeholder="Örn: 1200"
                className="font-mono text-slate-100 border-white/10 bg-slate-950/50"
              />
            </div>
          </div>

          {/* Legal / Expiring dates */}
          <div className="border-t border-white/5 pt-4 mt-2">
            <p className="text-xs font-black text-slate-300 mb-3 uppercase tracking-wider flex items-center gap-2">
              <Badge variant="outline" className="px-1.5 py-0 border-amber-500/30 bg-amber-500/5 text-amber-400 font-extrabold text-[9px]">Lojistik Uyarı</Badge>
              Ruhsat & Belge Tarih Takibi
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Sigorta Bitiş Tarihi</label>
                <Input 
                  type="date" 
                  value={formData.sigortaBitis} 
                  onChange={e => setFormData({...formData, sigortaBitis: e.target.value})} 
                  className="font-mono text-slate-100 border-white/10 bg-slate-950/50 focus:border-cyan-500/50"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Muayene Bitiş Tarihi</label>
                <Input 
                  type="date" 
                  value={formData.muayeneBitis} 
                  onChange={e => setFormData({...formData, muayeneBitis: e.target.value})} 
                  className="font-mono text-slate-100 border-white/10 bg-slate-950/50 focus:border-cyan-500/50"
                />
              </div>
            </div>
          </div>
          
          <div className="p-3 rounded-2xl bg-cyan-500/5 border border-cyan-500/10 text-[10px] text-cyan-400/80 leading-relaxed font-semibold">
            ⚡ Araç kaydedildiğinde, seçtiğiniz tipe özel ({formData.arac_tipi}) standart itfaiye iç donanım envanter bölmeleri ve ilk sayım ekipmanları (Holmatro kesiciler, lanslar, jeneratörler, fenerler) otomatik olarak oluşturularak CBS taktik şeması aktifleşecektir.
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-white/5 bg-slate-950/40 flex justify-end gap-3">
          <Button 
            variant="outline" 
            onClick={onClose} 
            disabled={loading}
            className="border-white/10 text-slate-300 hover:text-white hover:bg-white/5 rounded-xl font-bold"
          >
            İptal
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={loading} 
            className="rounded-xl font-bold bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_25px_rgba(16,185,129,0.5)] border-0 gap-2 px-5"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4" />}
            Yeni Araç Ekle
          </Button>
        </div>
      </div>
    </div>
  )
}
