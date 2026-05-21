"use client"

import { useState, useEffect } from "react"
import PageGuard from "@/components/PageGuard"
import { api } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { useAuthStore } from "@/lib/authStore"
import {
  Loader2,
  Wrench,
  Plus,
  Camera,
  Image as ImageIcon,
  Banknote,
  Check,
  Fuel,
  TrendingUp,
  Calendar,
  X,
  CheckCircle,
  Droplets,
  MapPin,
  User
} from "lucide-react"

// ─── Strongly-Typed Interfaces ────────────────────────────────────
interface VehicleMaintenance {
  id: string;
  plaka: string;
  islem_turu: string;
  kilometre: number;
  aciklama: string;
  maliyet: number;
  durum: string;
  tarih: string;
  kaydi_acan_sicil_no: string;
  fotograf_url: string | null;
  created_at: string;
}

interface VehicleFuelLog {
  id: string;
  plaka: string;
  litre: number;
  tutar: number;
  kmAt: number;
  istasyon: string;
  tarih: string;
  kayitEden: string;
}

interface MaintenanceLog {
  id: string;
  plaka: string;
  tip: string;
  kmAt: number;
  ptoAt: number;
  aciklama: string;
  maliyet: number;
  tarih: string;
}

interface Vehicle {
  plaka: string;
  marka: string;
  arac_tipi: string;
}

interface Personnel {
  sicil_no: string;
  ad: string;
  soyad: string;
  unvan: string;
}

// ─── Constants ────────────────────────────────────────────────────
const ISLEM_TURLERI = ['Periyodik Bakım', 'Arıza/Tamir', 'Yağ Değişimi', 'Lastik', 'Kaza/Hasar', 'Diğer']

const MAINTENANCE_TIP_LABEL: Record<string, string> = {
  periyodik: "Periyodik Bakım",
  ariza: "Arıza Onarımı",
  kaza: "Kaza Onarımı",
  revizyon: "Revizyon",
}

type ActiveTab = 'bakim' | 'yakit' | 'onay'

export default function AracBakimPage() {
  const { user } = useAuthStore()

  // ─── Data State ──────────────────────────────────────────────
  const [vehicleMaintenances, setVehicleMaintenances] = useState<VehicleMaintenance[]>([])
  const [maintenanceLogs, setMaintenanceLogs] = useState<MaintenanceLog[]>([])
  const [fuelLogs, setFuelLogs] = useState<VehicleFuelLog[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [personnel, setPersonnel] = useState<Personnel[]>([])
  const [loading, setLoading] = useState(true)

  // ─── UI State ────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>('bakim')
  const [selectedPlaka, setSelectedPlaka] = useState<string>('all')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  // ─── Form State ──────────────────────────────────────────────
  const [kayitTuru, setKayitTuru] = useState<'bakim' | 'yakit'>('bakim')
  const [bakimForm, setBakimForm] = useState({
    plaka: '',
    islem_turu: 'Arıza/Tamir',
    kilometre: '',
    aciklama: '',
    maliyet: '',
    kaydi_acan_sicil_no: ''
  })
  const [yakitForm, setYakitForm] = useState({
    plaka: '',
    litre: '',
    tutar: '',
    kmAt: '',
    istasyon: '',
    kayitEden: ''
  })

  // ─── Photo State ─────────────────────────────────────────────
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)

  // ─── Role Detection ──────────────────────────────────────────
  const isMudur = user?.rol === 'Admin' || user?.unvan === 'Müdür' || user?.rol?.toLowerCase() === 'admin' || user?.unvan?.toLowerCase() === 'müdür'

  useEffect(() => {
    fetchAllData()
  }, [])

  const fetchAllData = async () => {
    setLoading(true)
    try {
      // Her tablo bağımsız hata yönetimi ile çekilir — birinin başarısızlığı diğerlerini etkilemez
      const fetchOrNull = async (promise: any) => {
        try {
          return await promise
        } catch {
          return { data: null }
        }
      }

      const [vmRes, mlRes, flRes, vehRes, perRes] = await Promise.all([
        fetchOrNull(api.from('vehicle_maintenances').select('*').order('tarih', { ascending: false })),
        fetchOrNull(api.from('maintenance_logs').select('*').order('tarih', { ascending: false })),
        fetchOrNull(api.from('fuel_logs').select('*').order('tarih', { ascending: false })),
        fetchOrNull(api.from('vehicles').select('*').order('plaka', { ascending: true })),
        fetchOrNull(api.from('personnel').select('*').eq('aktif', true).order('ad', { ascending: true }))
      ])
      if (vmRes.data) setVehicleMaintenances(vmRes.data as VehicleMaintenance[])
      if (mlRes.data) setMaintenanceLogs(mlRes.data as MaintenanceLog[])
      if (flRes.data) setFuelLogs(flRes.data as VehicleFuelLog[])
      if (vehRes.data) setVehicles(vehRes.data as Vehicle[])
      if (perRes.data) setPersonnel(perRes.data as Personnel[])
    } catch (err) {
      console.error('Data fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  // ─── Approve Maintenance ─────────────────────────────────────
  const handleApprove = async (id: string) => {
    setUpdatingId(id)
    try {
      const { error } = await api.update('vehicle_maintenances', { durum: 'Onaylandı' }, { id })
      if (error) throw error
      setVehicleMaintenances(prev => prev.map(m => m.id === id ? { ...m, durum: 'Onaylandı' } : m))
    } catch (err) {
      console.error("Bakım onay hatası:", err)
      alert("Bakım onaylanırken bir hata oluştu.")
    } finally {
      setUpdatingId(null)
    }
  }

  // ─── Photo Upload ────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0]
      setFile(selectedFile)
      setPreviewUrl(URL.createObjectURL(selectedFile))
    }
  }

  const uploadImage = async (selectedFile: File): Promise<string | null> => {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('folder', 'arizalar')
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const result = await res.json()
      if (result.error) throw new Error(result.error)
      return result.url
    } catch (error) {
      console.error('Error uploading image:', error)
      alert('Fotoğraf yüklenirken hata oluştu!')
      return null
    } finally {
      setUploading(false)
    }
  }

  // ─── Create Record ──────────────────────────────────────────
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)

    try {
      if (kayitTuru === 'bakim') {
        if (!bakimForm.plaka) { alert("Lütfen araç plakası seçin."); setIsSaving(false); return }

        let finalPhotoUrl: string | null = null
        if (file) {
          finalPhotoUrl = await uploadImage(file)
          if (!finalPhotoUrl) { setIsSaving(false); return }
        }

        const payload = {
          plaka: bakimForm.plaka,
          islem_turu: bakimForm.islem_turu,
          kilometre: Number(bakimForm.kilometre) || 0,
          aciklama: bakimForm.aciklama,
          maliyet: Number(bakimForm.maliyet) || 0,
          kaydi_acan_sicil_no: bakimForm.kaydi_acan_sicil_no,
          fotograf_url: finalPhotoUrl
        }

        const { error } = await api.insert('vehicle_maintenances', payload)
        if (error) throw error
      } else {
        if (!yakitForm.plaka) { alert("Lütfen araç plakası seçin."); setIsSaving(false); return }
        if (!yakitForm.litre || !yakitForm.tutar) { alert("Lütfen litre ve tutar alanlarını doldurun."); setIsSaving(false); return }

        const payload = {
          plaka: yakitForm.plaka,
          litre: Number(yakitForm.litre) || 0,
          tutar: Number(yakitForm.tutar) || 0,
          kmAt: Number(yakitForm.kmAt) || 0,
          istasyon: yakitForm.istasyon || 'Sivas Belediyesi Akaryakıt İstasyonu',
          tarih: new Date().toISOString(),
          kayitEden: yakitForm.kayitEden || user?.ad || 'Sistem'
        }

        const { error } = await api.insert('fuel_logs', payload)
        if (error) throw error
      }

      // Reset
      setIsCreateOpen(false)
      resetForms()
      await fetchAllData()
    } catch (err) {
      console.error('Create record error:', err)
      alert("Kayıt sırasında hata oluştu.")
    } finally {
      setIsSaving(false)
    }
  }

  const resetForms = () => {
    setBakimForm({ plaka: '', islem_turu: 'Arıza/Tamir', kilometre: '', aciklama: '', maliyet: '', kaydi_acan_sicil_no: '' })
    setYakitForm({ plaka: '', litre: '', tutar: '', kmAt: '', istasyon: '', kayitEden: '' })
    setFile(null)
    setPreviewUrl(null)
    setKayitTuru('bakim')
  }

  // ─── Computed KPI Values ─────────────────────────────────────
  const totalBakimCount = vehicleMaintenances.length + maintenanceLogs.length
  const totalBakimMaliyet = vehicleMaintenances.reduce((s, m) => s + (Number(m.maliyet) || 0), 0) + maintenanceLogs.reduce((s, m) => s + (Number(m.maliyet) || 0), 0)
  const totalYakitCount = fuelLogs.length
  const totalYakitMaliyet = fuelLogs.reduce((s, f) => s + (Number(f.tutar) || 0), 0)

  // ─── Filter by Plaka ────────────────────────────────────────
  const filteredVehicleMaintenances = selectedPlaka === 'all'
    ? vehicleMaintenances
    : vehicleMaintenances.filter(m => m.plaka === selectedPlaka)

  const filteredMaintenanceLogs = selectedPlaka === 'all'
    ? maintenanceLogs
    : maintenanceLogs.filter(m => m.plaka === selectedPlaka)

  const filteredFuelLogs = selectedPlaka === 'all'
    ? fuelLogs
    : fuelLogs.filter(f => f.plaka === selectedPlaka)

  const pendingApprovals = vehicleMaintenances.filter(m => !m.durum || m.durum === 'Bekliyor')

  // ─── Status Badge ──────────────────────────────────────────
  const getStatusBadge = (durum: string) => {
    switch (durum) {
      case 'Onaylandı': return <Badge className="bg-green-950/40 border border-green-500/30 text-green-400 font-semibold px-2.5 py-1 rounded-lg">Onaylandı</Badge>
      case 'Tamamlandı': return <Badge className="bg-green-950/40 border border-green-500/30 text-green-400 font-semibold px-2.5 py-1 rounded-lg">Tamamlandı</Badge>
      case 'Serviste': return <Badge className="bg-amber-950/40 border border-amber-500/30 text-amber-400 font-semibold px-2.5 py-1 rounded-lg">Serviste</Badge>
      default: return <Badge className="bg-slate-800 text-slate-300 font-semibold px-2.5 py-1 rounded-lg">Bekliyor</Badge>
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center animate-pulse flex items-center justify-center gap-2 min-h-[50vh]">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="text-muted-foreground font-semibold">Araç Bakım & Yakıt Verileri Yükleniyor...</span>
      </div>
    )
  }

  return (
    <PageGuard pageId="arac_bakim">
      <div className="flex flex-col h-full space-y-6 max-w-7xl mx-auto pb-12 animate-in fade-in duration-300">

        {/* ═══ Sayfa Başlığı ═══ */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/50 pb-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight flex items-center gap-2">
              🚒 Araç Bakım & Yakıt Takibi
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Sivas İtfaiyesi araç filosunun bakım, arıza ve yakıt kayıtlarının merkezi yönetim paneli</p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3.5 py-2 h-9 rounded-xl flex items-center gap-1.5 shadow-lg shadow-indigo-600/10 hover:scale-[1.02] transition duration-150 shrink-0"
              onClick={() => setIsCreateOpen(true)}
            >
              <Plus className="w-4 h-4" /> Yeni Kayıt Ekle
            </Button>
            {isMudur ? (
              <Badge className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black px-3 py-1 text-xs">
                Müdür Yetki Modu
              </Badge>
            ) : (
              <Badge className="bg-zinc-800 border border-zinc-700 text-zinc-400 font-bold px-3 py-1 text-xs">
                Salt Okunur
              </Badge>
            )}
          </div>
        </div>

        {/* ═══ 1. KPI Kartları (Glassmorphism) ═══ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Toplam Bakım Sayısı */}
          <Card className="bg-slate-900/40 backdrop-blur-md border border-white/5 p-4 rounded-xl shadow-lg relative overflow-hidden group hover:border-orange-500/20 transition duration-300">
            <div className="absolute -right-4 -bottom-4 opacity-5 text-orange-500 group-hover:scale-110 transition duration-500">
              <Wrench className="w-24 h-24" />
            </div>
            <CardContent className="p-0 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs text-zinc-400 font-bold tracking-wider uppercase">Toplam Bakım</span>
                <h3 className="text-2xl font-black text-orange-400">{totalBakimCount} Kayıt</h3>
                <p className="text-[10px] text-zinc-500">Tüm araçların birleşik bakım/arıza geçmişi</p>
              </div>
              <div className="p-3 bg-orange-500/10 border border-orange-500/20 text-orange-400 rounded-xl">
                <Wrench className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>

          {/* Bakım Maliyeti */}
          <Card className="bg-slate-900/40 backdrop-blur-md border border-white/5 p-4 rounded-xl shadow-lg relative overflow-hidden group hover:border-amber-500/20 transition duration-300">
            <div className="absolute -right-4 -bottom-4 opacity-5 text-amber-500 group-hover:scale-110 transition duration-500">
              <TrendingUp className="w-24 h-24" />
            </div>
            <CardContent className="p-0 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs text-zinc-400 font-bold tracking-wider uppercase">Bakım Maliyeti</span>
                <h3 className="text-2xl font-black text-amber-400">₺{totalBakimMaliyet.toLocaleString('tr-TR')}</h3>
                <p className="text-[10px] text-zinc-500">Toplam onarım & yedek parça gideri</p>
              </div>
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl">
                <TrendingUp className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>

          {/* Yakıt Alım Sayısı */}
          <Card className="bg-slate-900/40 backdrop-blur-md border border-white/5 p-4 rounded-xl shadow-lg relative overflow-hidden group hover:border-emerald-500/20 transition duration-300">
            <div className="absolute -right-4 -bottom-4 opacity-5 text-emerald-500 group-hover:scale-110 transition duration-500">
              <Fuel className="w-24 h-24" />
            </div>
            <CardContent className="p-0 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs text-zinc-400 font-bold tracking-wider uppercase">Yakıt Alım</span>
                <h3 className="text-2xl font-black text-emerald-400">{totalYakitCount} Kayıt</h3>
                <p className="text-[10px] text-zinc-500">Toplam akaryakıt alım sayısı</p>
              </div>
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl">
                <Fuel className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>

          {/* Yakıt Maliyeti */}
          <Card className="bg-slate-900/40 backdrop-blur-md border border-white/5 p-4 rounded-xl shadow-lg relative overflow-hidden group hover:border-blue-500/20 transition duration-300">
            <div className="absolute -right-4 -bottom-4 opacity-5 text-blue-500 group-hover:scale-110 transition duration-500">
              <Banknote className="w-24 h-24" />
            </div>
            <CardContent className="p-0 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs text-zinc-400 font-bold tracking-wider uppercase">Yakıt Maliyeti</span>
                <h3 className="text-2xl font-black text-blue-400">₺{totalYakitMaliyet.toLocaleString('tr-TR')}</h3>
                <p className="text-[10px] text-zinc-500">Toplam akaryakıt harcaması</p>
              </div>
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl">
                <Banknote className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ═══ 2. Sekmeli Navigasyon + Araç Filtresi ═══ */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex bg-zinc-900/60 backdrop-blur-md rounded-xl p-1 border border-zinc-800">
            <button
              onClick={() => setActiveTab('bakim')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 flex items-center gap-1.5 ${
                activeTab === 'bakim'
                  ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/20'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" /> Bakım & Arıza Geçmişi
            </button>
            <button
              onClick={() => setActiveTab('yakit')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 flex items-center gap-1.5 ${
                activeTab === 'yakit'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Fuel className="w-3.5 h-3.5" /> Yakıt Günlükleri
            </button>
            <button
              onClick={() => setActiveTab('onay')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 flex items-center gap-1.5 ${
                activeTab === 'onay'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <CheckCircle className="w-3.5 h-3.5" /> Müdür Onay Alanı
              {pendingApprovals.length > 0 && (
                <span className="ml-1 bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full leading-none">
                  {pendingApprovals.length}
                </span>
              )}
            </button>
          </div>

          <select
            value={selectedPlaka}
            onChange={e => setSelectedPlaka(e.target.value)}
            className="h-9 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-200 px-3 text-xs font-semibold focus:outline-none focus:border-indigo-500 transition"
          >
            <option value="all">Tüm Araçlar</option>
            {vehicles.map(v => <option key={v.plaka} value={v.plaka}>{v.plaka} - {v.marka || ''}</option>)}
          </select>
        </div>

        {/* ═══ Sekme 1: Bakım & Arıza Geçmişi ═══ */}
        {activeTab === 'bakim' && (
          <Card className="border-zinc-800 bg-zinc-950/40 backdrop-blur-xl shadow-2xl overflow-hidden">
            <CardHeader className="border-b border-zinc-800 bg-zinc-900/10 pb-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-base font-black tracking-wider uppercase text-zinc-300 flex items-center gap-2">
                    <Wrench className="w-5 h-5 text-orange-400" /> BAKIM & ARIZA GEÇMİŞİ
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">Araç arıza, tamir ve periyodik bakım kayıtları</p>
                </div>
                <span className="text-[10px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-500 px-2.5 py-1 rounded-md">
                  KAYIT: {filteredVehicleMaintenances.length + filteredMaintenanceLogs.length}
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {(filteredVehicleMaintenances.length === 0 && filteredMaintenanceLogs.length === 0) ? (
                <div className="text-center p-12 text-muted-foreground bg-zinc-950/20">
                  Seçili filtre için bakım/arıza kaydı bulunmamaktadır.
                </div>
              ) : (
                <table className="w-full min-w-[900px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-zinc-900 bg-zinc-950/60 text-zinc-400 font-bold text-xs uppercase tracking-wider">
                      <th className="p-4 text-left">Araç Plakası</th>
                      <th className="p-4 text-left">İşlem Türü</th>
                      <th className="p-4 text-left">Tarih</th>
                      <th className="p-4 text-left">Kilometre</th>
                      <th className="p-4 text-left">Açıklama</th>
                      <th className="p-4 text-right">Maliyet</th>
                      <th className="p-4 text-center">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900">
                    {/* vehicle_maintenances tablosundan kayıtlar */}
                    {filteredVehicleMaintenances.map(m => (
                      <tr key={`vm-${m.id}`} className="hover:bg-zinc-900/30 transition duration-150 group">
                        <td className="p-4 align-middle">
                          <span className="font-bold text-zinc-200 bg-zinc-900/80 border border-zinc-800 px-2.5 py-1 rounded-md text-xs tracking-wider">
                            {m.plaka}
                          </span>
                        </td>
                        <td className="p-4 align-middle">
                          <Badge className="bg-orange-950/40 border border-orange-500/30 text-orange-400 font-semibold px-2 py-0.5 rounded-md text-[11px]">
                            {m.islem_turu}
                          </Badge>
                        </td>
                        <td className="p-4 align-middle text-zinc-400 font-medium text-xs">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-zinc-600" />
                            {new Date(m.tarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </div>
                        </td>
                        <td className="p-4 align-middle text-zinc-400 font-mono text-xs">
                          {Number(m.kilometre) > 0 ? `${Number(m.kilometre).toLocaleString('tr-TR')} KM` : '—'}
                        </td>
                        <td className="p-4 align-middle text-zinc-400 text-xs max-w-xs truncate">{m.aciklama || '—'}</td>
                        <td className="p-4 align-middle text-right font-bold text-sm">
                          {Number(m.maliyet) > 0 ? (
                            <span className="text-red-400">₺{Number(m.maliyet).toLocaleString('tr-TR')}</span>
                          ) : '—'}
                        </td>
                        <td className="p-4 align-middle text-center">{getStatusBadge(m.durum)}</td>
                      </tr>
                    ))}

                    {/* maintenance_logs tablosundan kayıtlar */}
                    {filteredMaintenanceLogs.map(log => (
                      <tr key={`ml-${log.id}`} className="hover:bg-zinc-900/30 transition duration-150 group">
                        <td className="p-4 align-middle">
                          <span className="font-bold text-zinc-200 bg-zinc-900/80 border border-zinc-800 px-2.5 py-1 rounded-md text-xs tracking-wider">
                            {log.plaka}
                          </span>
                        </td>
                        <td className="p-4 align-middle">
                          <Badge className="bg-blue-950/40 border border-blue-500/30 text-blue-400 font-semibold px-2 py-0.5 rounded-md text-[11px]">
                            {MAINTENANCE_TIP_LABEL[log.tip] || log.tip}
                          </Badge>
                        </td>
                        <td className="p-4 align-middle text-zinc-400 font-medium text-xs">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-zinc-600" />
                            {new Date(log.tarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </div>
                        </td>
                        <td className="p-4 align-middle text-zinc-400 font-mono text-xs">
                          {Number(log.kmAt) > 0 ? `${Number(log.kmAt).toLocaleString('tr-TR')} KM` : '—'}
                        </td>
                        <td className="p-4 align-middle text-zinc-400 text-xs max-w-xs truncate">{log.aciklama || '—'}</td>
                        <td className="p-4 align-middle text-right font-bold text-sm">
                          {Number(log.maliyet) > 0 ? (
                            <span className="text-red-400">₺{Number(log.maliyet).toLocaleString('tr-TR')}</span>
                          ) : '—'}
                        </td>
                        <td className="p-4 align-middle text-center">
                          <Badge className="bg-green-950/40 border border-green-500/30 text-green-400 font-semibold px-2.5 py-1 rounded-lg">Tamamlandı</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        )}

        {/* ═══ Sekme 2: Yakıt Günlükleri ═══ */}
        {activeTab === 'yakit' && (
          <Card className="border-zinc-800 bg-zinc-950/40 backdrop-blur-xl shadow-2xl overflow-hidden">
            <CardHeader className="border-b border-zinc-800 bg-zinc-900/10 pb-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-base font-black tracking-wider uppercase text-zinc-300 flex items-center gap-2">
                    <Fuel className="w-5 h-5 text-emerald-400" /> YAKIT ALIM GÜNLÜKLERİ
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">Araçların kronolojik akaryakıt alım detayları</p>
                </div>
                <span className="text-[10px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-500 px-2.5 py-1 rounded-md">
                  KAYIT: {filteredFuelLogs.length}
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {filteredFuelLogs.length === 0 ? (
                <div className="text-center p-12 text-muted-foreground bg-zinc-950/20">
                  Seçili filtre için yakıt alım kaydı bulunmamaktadır.
                </div>
              ) : (
                <table className="w-full min-w-[900px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-zinc-900 bg-zinc-950/60 text-zinc-400 font-bold text-xs uppercase tracking-wider">
                      <th className="p-4 text-left">Araç Plakası</th>
                      <th className="p-4 text-left">Tarih</th>
                      <th className="p-4 text-right">Litre</th>
                      <th className="p-4 text-right">Tutar (₺)</th>
                      <th className="p-4 text-left">Kilometre</th>
                      <th className="p-4 text-left">İstasyon</th>
                      <th className="p-4 text-left">Kayıt Eden</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900">
                    {filteredFuelLogs.map(log => (
                      <tr key={log.id} className="hover:bg-zinc-900/30 transition duration-150 group">
                        <td className="p-4 align-middle">
                          <span className="font-bold text-zinc-200 bg-zinc-900/80 border border-zinc-800 px-2.5 py-1 rounded-md text-xs tracking-wider">
                            {log.plaka}
                          </span>
                        </td>
                        <td className="p-4 align-middle text-zinc-400 font-medium text-xs">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-zinc-600" />
                            {new Date(log.tarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </div>
                        </td>
                        <td className="p-4 align-middle text-right font-bold text-emerald-400">
                          <div className="flex items-center justify-end gap-1">
                            <Droplets className="w-3.5 h-3.5" /> {log.litre} lt
                          </div>
                        </td>
                        <td className="p-4 align-middle text-right font-bold text-blue-400">
                          ₺{(Number(log.tutar) || 0).toLocaleString('tr-TR')}
                        </td>
                        <td className="p-4 align-middle text-zinc-400 font-mono text-xs">
                          {Number(log.kmAt) > 0 ? `${Number(log.kmAt).toLocaleString('tr-TR')} KM` : '—'}
                        </td>
                        <td className="p-4 align-middle text-zinc-400 text-xs">
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-zinc-600" />
                            {log.istasyon || '—'}
                          </div>
                        </td>
                        <td className="p-4 align-middle text-zinc-300 text-xs font-semibold">
                          <div className="flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-zinc-600" />
                            {log.kayitEden || '—'}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        )}

        {/* ═══ Sekme 3: Müdür Onay Alanı ═══ */}
        {activeTab === 'onay' && (
          <Card className="border-zinc-800 bg-zinc-950/40 backdrop-blur-xl shadow-2xl overflow-hidden">
            <CardHeader className="border-b border-zinc-800 bg-zinc-900/10 pb-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-base font-black tracking-wider uppercase text-zinc-300 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-indigo-400" /> MÜDÜR ONAY YÖNETİMİ
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">Durumu &quot;Bekliyor&quot; olan bakım/arıza kayıtlarının onay paneli</p>
                </div>
                {pendingApprovals.length > 0 && (
                  <Badge className="bg-red-950/40 border border-red-500/30 text-red-400 font-black px-3 py-1 text-xs animate-pulse">
                    {pendingApprovals.length} Onay Bekliyor
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {!isMudur ? (
                <div className="p-8 bg-zinc-950/20 flex items-start gap-3 border-t border-zinc-900">
                  <div className="p-2 bg-zinc-900 rounded-xl border border-zinc-800 shrink-0">
                    <CheckCircle className="w-5 h-5 text-zinc-600" />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-zinc-400">Yetki Kısıtlaması</span>
                    <p className="text-[11px] text-zinc-500 leading-relaxed">
                      Bakım onay işlemleri yalnızca Müdür yetkisiyle gerçekleştirilebilir. Bu panel salt okunur modda görüntülenmektedir.
                    </p>
                  </div>
                </div>
              ) : pendingApprovals.length === 0 ? (
                <div className="text-center p-12 text-muted-foreground bg-zinc-950/20">
                  <CheckCircle className="w-10 h-10 text-emerald-400/30 mx-auto mb-3" />
                  <p className="font-semibold text-zinc-400">Tüm bakım/arıza kayıtları onaylanmış durumda</p>
                  <p className="text-xs text-zinc-600 mt-1">Bekleyen onay bulunmamaktadır</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[800px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-zinc-900 bg-zinc-950/60 text-zinc-400 font-bold text-xs uppercase tracking-wider">
                        <th className="p-4 text-left">Araç Plakası</th>
                        <th className="p-4 text-left">İşlem Türü</th>
                        <th className="p-4 text-left">Tarih</th>
                        <th className="p-4 text-left">Açıklama</th>
                        <th className="p-4 text-right">Maliyet</th>
                        <th className="p-4 text-right">İşlem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900">
                      {pendingApprovals.map(m => (
                        <tr key={m.id} className="hover:bg-zinc-900/30 transition duration-150 group bg-amber-500/[0.02]">
                          <td className="p-4 align-middle">
                            <span className="font-bold text-zinc-200 bg-zinc-900/80 border border-zinc-800 px-2.5 py-1 rounded-md text-xs tracking-wider">
                              {m.plaka}
                            </span>
                          </td>
                          <td className="p-4 align-middle">
                            <Badge className="bg-orange-950/40 border border-orange-500/30 text-orange-400 font-semibold px-2 py-0.5 rounded-md text-[11px]">
                              {m.islem_turu}
                            </Badge>
                          </td>
                          <td className="p-4 align-middle text-zinc-400 font-medium text-xs">
                            {new Date(m.tarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="p-4 align-middle text-zinc-400 text-xs max-w-xs truncate">{m.aciklama || '—'}</td>
                          <td className="p-4 align-middle text-right font-bold text-sm text-red-400">
                            {Number(m.maliyet) > 0 ? `₺${Number(m.maliyet).toLocaleString('tr-TR')}` : '—'}
                          </td>
                          <td className="p-4 align-middle text-right">
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-1.5 h-8 rounded-lg flex items-center gap-1 shadow-md hover:scale-[1.02] transition ml-auto"
                              onClick={() => handleApprove(m.id)}
                              disabled={updatingId === m.id}
                            >
                              {updatingId === m.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                              Bakımı Onayla
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ═══ Yeni Kayıt Ekleme Modalı ═══ */}
        {isCreateOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
            <Card className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 shadow-2xl overflow-hidden rounded-2xl animate-in zoom-in-95 duration-200 my-8">
              <CardHeader className="bg-zinc-900/40 border-b border-zinc-800/80 p-5 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2 font-black text-indigo-100">
                    <Plus className="w-5 h-5 text-indigo-400" /> YENİ KAYIT OLUŞTURMA PANELİ
                  </CardTitle>
                  <p className="text-xs text-zinc-500 mt-1">Bakım/Arıza veya Yakıt Alımı kaydı girin</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-zinc-400 hover:text-white"
                  onClick={() => { setIsCreateOpen(false); resetForms() }}
                >
                  <X className="w-5 h-5" />
                </Button>
              </CardHeader>

              <form onSubmit={handleCreateSubmit}>
                <CardContent className="p-6 space-y-6 max-h-[65vh] overflow-y-auto">

                  {/* Kayıt Türü Seçimi */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">Kayıt Türü <span className="text-red-500">*</span></label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setKayitTuru('bakim')}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-xs border transition-all duration-200 ${
                          kayitTuru === 'bakim'
                            ? 'bg-orange-600/20 border-orange-500/40 text-orange-400 shadow-lg shadow-orange-600/10'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                        }`}
                      >
                        <Wrench className="w-4 h-4" /> Bakım / Arıza Kaydı
                      </button>
                      <button
                        type="button"
                        onClick={() => setKayitTuru('yakit')}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-xs border transition-all duration-200 ${
                          kayitTuru === 'yakit'
                            ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-400 shadow-lg shadow-emerald-600/10'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                        }`}
                      >
                        <Fuel className="w-4 h-4" /> Yakıt Alımı Kaydı
                      </button>
                    </div>
                  </div>

                  {/* ─── Bakım/Arıza Formu ─── */}
                  {kayitTuru === 'bakim' && (
                    <div className="space-y-4 bg-orange-500/5 p-4 rounded-xl border border-orange-500/10">
                      <h3 className="font-bold text-sm text-orange-400 border-b border-orange-500/20 pb-1.5 flex items-center gap-1.5">
                        <Wrench className="w-4 h-4" /> Bakım / Arıza Detayları
                      </h3>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-zinc-400 block">Araç Plakası <span className="text-red-500">*</span></label>
                          <select
                            className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition font-semibold"
                            value={bakimForm.plaka}
                            onChange={e => setBakimForm(prev => ({ ...prev, plaka: e.target.value }))}
                            required
                          >
                            <option value="">Araç Seçiniz...</option>
                            {vehicles.map(v => <option key={v.plaka} value={v.plaka}>{v.plaka} - {v.marka} {v.arac_tipi}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-zinc-400 block">İşlem Türü <span className="text-red-500">*</span></label>
                          <select
                            className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition font-semibold"
                            value={bakimForm.islem_turu}
                            onChange={e => setBakimForm(prev => ({ ...prev, islem_turu: e.target.value }))}
                          >
                            {ISLEM_TURLERI.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-zinc-400 block">Kilometre</label>
                          <input
                            type="number"
                            className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition font-medium"
                            placeholder="Örn: 125000"
                            value={bakimForm.kilometre}
                            onChange={e => setBakimForm(prev => ({ ...prev, kilometre: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-zinc-400 block">Maliyet (₺)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition font-medium"
                            placeholder="Örn: 4500"
                            value={bakimForm.maliyet}
                            onChange={e => setBakimForm(prev => ({ ...prev, maliyet: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1.5 sm:col-span-2">
                          <label className="text-xs font-bold text-zinc-400 block">Arıza / Yapılan İşlem Detayı</label>
                          <textarea
                            rows={3}
                            className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition font-medium resize-none"
                            placeholder="Sol ön lastik patlamış, stepne takıldı..."
                            value={bakimForm.aciklama}
                            onChange={e => setBakimForm(prev => ({ ...prev, aciklama: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1.5 sm:col-span-2">
                          <label className="text-xs font-bold text-zinc-400 block">Kaydı Açan Personel</label>
                          <select
                            className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition font-semibold"
                            value={bakimForm.kaydi_acan_sicil_no}
                            onChange={e => setBakimForm(prev => ({ ...prev, kaydi_acan_sicil_no: e.target.value }))}
                          >
                            <option value="">Personel Seçiniz...</option>
                            {personnel.map(p => <option key={p.sicil_no} value={p.sicil_no}>{p.ad} {p.soyad} ({p.unvan})</option>)}
                          </select>
                        </div>
                      </div>

                      {/* Fotoğraf Yükleme */}
                      <div className="p-3 border border-dashed border-orange-500/20 bg-orange-500/5 rounded-xl space-y-3">
                        <div className="flex items-center gap-2 text-xs">
                          <Camera className="w-4 h-4 text-orange-400" />
                          <span className="font-bold text-zinc-300">Fotoğraflı Kanıt (Opsiyonel)</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="relative group cursor-pointer border-2 border-zinc-800 hover:border-orange-500/50 transition-colors rounded-xl bg-zinc-900 w-32 h-20 flex items-center justify-center overflow-hidden">
                            {previewUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={previewUrl} alt="Önizleme" className="w-full h-full object-cover" />
                            ) : (
                              <ImageIcon className="w-6 h-6 text-zinc-600 group-hover:scale-110 transition-transform" />
                            )}
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              onChange={handleFileChange}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                          </div>
                          {previewUrl && (
                            <Button type="button" variant="outline" size="sm" className="border-zinc-800 text-zinc-400 text-xs rounded-lg" onClick={() => { setFile(null); setPreviewUrl(null) }}>
                              Kaldır
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ─── Yakıt Alımı Formu ─── */}
                  {kayitTuru === 'yakit' && (
                    <div className="space-y-4 bg-emerald-500/5 p-4 rounded-xl border border-emerald-500/10">
                      <h3 className="font-bold text-sm text-emerald-400 border-b border-emerald-500/20 pb-1.5 flex items-center gap-1.5">
                        <Fuel className="w-4 h-4" /> Yakıt Alım Detayları
                      </h3>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-zinc-400 block">Araç Plakası <span className="text-red-500">*</span></label>
                          <select
                            className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition font-semibold"
                            value={yakitForm.plaka}
                            onChange={e => setYakitForm(prev => ({ ...prev, plaka: e.target.value }))}
                            required
                          >
                            <option value="">Araç Seçiniz...</option>
                            {vehicles.map(v => <option key={v.plaka} value={v.plaka}>{v.plaka} - {v.marka} {v.arac_tipi}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-zinc-400 block">Alınan Litre <span className="text-red-500">*</span></label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition font-medium"
                            placeholder="Örn: 120"
                            value={yakitForm.litre}
                            onChange={e => setYakitForm(prev => ({ ...prev, litre: e.target.value }))}
                            required
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-zinc-400 block">Tutar (₺) <span className="text-red-500">*</span></label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition font-medium"
                            placeholder="Örn: 5340"
                            value={yakitForm.tutar}
                            onChange={e => setYakitForm(prev => ({ ...prev, tutar: e.target.value }))}
                            required
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-zinc-400 block">Kilometre</label>
                          <input
                            type="number"
                            className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition font-medium"
                            placeholder="Araç kilometre sayacı"
                            value={yakitForm.kmAt}
                            onChange={e => setYakitForm(prev => ({ ...prev, kmAt: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-zinc-400 block">Akaryakıt İstasyonu</label>
                          <input
                            type="text"
                            className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition font-medium"
                            placeholder="Örn: Sivas Belediyesi İstasyonu"
                            value={yakitForm.istasyon}
                            onChange={e => setYakitForm(prev => ({ ...prev, istasyon: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-zinc-400 block">Kayıt Eden Personel</label>
                          <input
                            type="text"
                            className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition font-medium"
                            placeholder="Personel ad soyad"
                            value={yakitForm.kayitEden}
                            onChange={e => setYakitForm(prev => ({ ...prev, kayitEden: e.target.value }))}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>

                <div className="bg-zinc-900/40 border-t border-zinc-800/80 p-5 flex items-center justify-end gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800/60 font-semibold px-4 py-2 rounded-xl text-xs"
                    onClick={() => { setIsCreateOpen(false); resetForms() }}
                  >
                    Vazgeç
                  </Button>
                  <Button
                    type="submit"
                    className={`font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-md transition text-white ${
                      kayitTuru === 'bakim'
                        ? 'bg-orange-600 hover:bg-orange-700'
                        : 'bg-emerald-600 hover:bg-emerald-700'
                    }`}
                    disabled={isSaving || uploading}
                  >
                    {isSaving || uploading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> {uploading ? 'Fotoğraf Yükleniyor...' : 'Kaydediliyor...'}
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-3.5 h-3.5" /> {kayitTuru === 'bakim' ? 'Bakım Kaydını Oluştur' : 'Yakıt Kaydını Oluştur'}
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        )}

      </div>
    </PageGuard>
  )
}
