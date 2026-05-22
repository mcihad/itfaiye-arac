"use client"

import { useParams, useSearchParams, useRouter } from "next/navigation"
import { COMPARTMENT_NAMES } from "@/lib/constants"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { 
  Truck, 
  PackageSearch, 
  ChevronRight, 
  ArrowLeft, 
  Gauge, 
  Clock, 
  ShieldCheck, 
  CalendarDays, 
  History, 
  Printer,
  Compass,
  Layers,
  Zap,
  Wrench,
  Droplet,
  Flame,
  Hammer,
  Activity,
  Maximize,
  Gauge as GaugeIcon,
  FolderOpen,
  Box,
  Plus,
  Search,
  X
} from "lucide-react"
import { InventoryList } from "@/components/vehicle/InventoryList"
import { Vehicle3DSchematic } from "@/components/vehicle/Vehicle3DSchematic"
import { AuditTimeline } from "@/components/inventory/AuditTimeline"
import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { api } from "@/lib/api"
import { QRCodeSVG } from "qrcode.react"
import { APP_BASE_URL } from "@/lib/constants"
import { useAuthStore } from "@/lib/authStore"
import { InventoryAddEditModal } from "@/components/inventory/InventoryAddEditModal"
import { InventoryItem, Vehicle } from "@/types"

function buildQrUrl(plaka: string, compartment: string): string {
  const slug = plaka.replace(/\s+/g, "-").toLowerCase()
  return `${APP_BASE_URL}/arac/${slug}/${compartment}`
}

const TACTICAL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  kabin_ici: Compass,
  arac_ici: Layers,
  sol_on_kapak: Zap,
  sol_orta_kapak: Wrench,
  sol_arka_kapak: Droplet,
  sag_on_kapak: Flame,
  sag_orta_kapak: Hammer,
  sag_arka_kapak: Activity,
  arac_ustu: Maximize,
  arka_bolme: GaugeIcon,
  arka_kapak: FolderOpen,
  sol_dolap: Box,
  sag_dolap: Box,
  bagaj_ici: Box,
  kasa_ici: Layers,
};

export default function VehicleDetailPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const idStr = params.id as string
  const { user } = useAuthStore()
  const isEr = user?.rol === 'User'

  const getCompartmentLabel = (key: string): string => {
    if (!key) return ""
    if (COMPARTMENT_NAMES[key]) return COMPARTMENT_NAMES[key]
    return key
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }
  
  const [vehicle, setVehicle] = useState<Vehicle | null>(null)
  const [allVehicles, setAllVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCompartment, setActiveCompartment] = useState<string | null>(null)
  const [showTimeline, setShowTimeline] = useState(false)

  // Arama Barı States
  const [searchQuery, setSearchQuery] = useState("")
  const [isSearchFocused, setIsSearchFocused] = useState(false)

  // Envanter Add/Edit modal states
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalItem, setModalItem] = useState<InventoryItem | null>(null)
  const [isEditingList, setIsEditingList] = useState(false)

  useEffect(() => {
    async function fetchVehicle() {
      try {
        const { data: vehicles } = await api.from<Vehicle>('vehicles').select('*') as { data: Vehicle[] | null; error: unknown }
        const vehiclesList = vehicles || []
        setAllVehicles(vehiclesList)
        const found = vehiclesList.find((v: Vehicle) => v.plaka.replace(/\s+/g, '-').toLowerCase() === idStr)
        setVehicle(found || null)
      } catch (err) {
        console.error("Error fetching vehicle:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchVehicle()
  }, [idStr])
  
  // Listen and sync searchParams (QR deep linking)
  useEffect(() => {
    if (!vehicle) return
    const bolmeParam = searchParams.get("bolme")
    const keys = Object.keys(vehicle.bolmeler || {})
    if (bolmeParam && (keys.includes(bolmeParam) || vehicle.bolmeler?.[bolmeParam])) {
      setActiveCompartment(bolmeParam)
    } else if (keys.length > 0) {
      setActiveCompartment(keys[0])
    }
  }, [searchParams, vehicle])

  const handleSaveEquipment = async (item: InventoryItem, targetCompartment: string) => {
    if (!vehicle) return

    const updatedBolmeler = JSON.parse(JSON.stringify(vehicle.bolmeler || {}))

    if (!updatedBolmeler[targetCompartment]) {
      updatedBolmeler[targetCompartment] = []
    }

    const isEdit = modalItem !== null

    if (isEdit && modalItem) {
      let foundOriginalComp: string | null = null
      let originalIndex = -1

      for (const compKey of Object.keys(updatedBolmeler)) {
        const idx = updatedBolmeler[compKey].findIndex((i: InventoryItem) => i.id === item.id || (i.malzeme === modalItem.malzeme && i.adet === modalItem.adet))
        if (idx !== -1) {
          foundOriginalComp = compKey
          originalIndex = idx
          break
        }
      }

      if (foundOriginalComp !== null && originalIndex !== -1) {
        if (foundOriginalComp === targetCompartment) {
          updatedBolmeler[targetCompartment][originalIndex] = {
            id: item.id,
            malzeme: item.malzeme,
            adet: item.adet,
            durum: item.durum
          }
        } else {
          updatedBolmeler[foundOriginalComp].splice(originalIndex, 1)
          updatedBolmeler[targetCompartment].push({
            id: item.id,
            malzeme: item.malzeme,
            adet: item.adet,
            durum: item.durum
          })
        }
      } else {
        updatedBolmeler[targetCompartment].push({
          id: item.id,
          malzeme: item.malzeme,
          adet: item.adet,
          durum: item.durum
        })
      }
    } else {
      updatedBolmeler[targetCompartment].push({
        id: item.id,
        malzeme: item.malzeme,
        adet: item.adet,
        durum: item.durum
      })
    }

    const { error: updateErr } = await api.update('vehicles', { bolmeler: updatedBolmeler }, { plaka: vehicle.plaka })

    if (updateErr) {
      throw updateErr
    }

    setVehicle({
      ...vehicle,
      bolmeler: updatedBolmeler
    })

    fetch('/api/audit-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action_type: isEdit ? 'inventory_update' : 'inventory_add',
        actor_sicil_no: user?.sicilNo || 'unknown',
        actor_name: user ? `${user.ad} ${user.soyad}` : 'Bilinmeyen',
        target: vehicle.plaka,
        details: {
          action: isEdit ? 'edit_item' : 'add_item',
          item: item,
          compartment: targetCompartment,
          original_compartment: isEdit ? modalItem.id : undefined
        },
      }),
    }).catch(err => console.error('[AuditLog] Envanter logu gönderilemedi:', err))
  }

  const handleDeleteEquipment = async (item: InventoryItem) => {
    if (!vehicle || !activeCompartment) return

    if (!window.confirm(`"${item.malzeme}" malzemesini envanterden silmek istediğinize emin misiniz?`)) {
      return
    }

    const updatedBolmeler = JSON.parse(JSON.stringify(vehicle.bolmeler || {}))
    if (!updatedBolmeler[activeCompartment]) return

    const idx = updatedBolmeler[activeCompartment].findIndex((i: InventoryItem) => i.id === item.id || (i.malzeme === item.malzeme && i.adet === item.adet))
    if (idx === -1) return

    updatedBolmeler[activeCompartment].splice(idx, 1)

    const { error: updateErr } = await api.update('vehicles', { bolmeler: updatedBolmeler }, { plaka: vehicle.plaka })

    if (updateErr) {
      alert("Hata: " + updateErr.message)
      return
    }

    setVehicle({
      ...vehicle,
      bolmeler: updatedBolmeler
    })

    fetch('/api/audit-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action_type: 'inventory_delete',
        actor_sicil_no: user?.sicilNo || 'unknown',
        actor_name: user ? `${user.ad} ${user.soyad}` : 'Bilinmeyen',
        target: vehicle.plaka,
        details: {
          action: 'delete_item',
          item: item,
          compartment: activeCompartment
        },
      }),
    }).catch(err => console.error('[AuditLog] Envanter silme logu gönderilemedi:', err))
  }

  const handleOpenAddModal = () => {
    setModalItem(null)
    setIsModalOpen(true)
  }

  const handleOpenEditModal = (item: InventoryItem) => {
    setModalItem(item)
    setIsModalOpen(true)
  }

  const handleSelectCompartment = (key: string) => {
    setActiveCompartment(key)
    const nextParams = new URLSearchParams(window.location.search)
    nextParams.set("bolme", key)
    router.replace(`${window.location.pathname}?${nextParams.toString()}`)
  }

  const handlePrint = () => {
    const printArea = document.getElementById('vehicle-print-area')
    if (!printArea) return

    const clone = printArea.cloneNode(true) as HTMLElement
    clone.className = 'print-area-container'
    clone.id = 'vehicle-print-area-live'
    document.body.appendChild(clone)

    setTimeout(() => {
      window.print()
      setTimeout(() => {
        const live = document.getElementById('vehicle-print-area-live')
        if (live) document.body.removeChild(live)
      }, 500)
    }, 400)
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="w-10 h-10 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
    </div>
  )
  if (!vehicle) return <div className="p-6">Araç bulunamadı.</div>

  const compartKeys = Object.keys(vehicle.bolmeler || {})

  const activeItems: InventoryItem[] = activeCompartment ? (vehicle.bolmeler?.[activeCompartment] || []) : []

  // Count total items and issues safely
  const totalItems = Object.values(vehicle.bolmeler || {}).flat().length
  const issueItems = Object.values(vehicle.bolmeler || {}).flat().filter((i: unknown) => (i as InventoryItem)?.durum !== "Tam").length

  // Plaka Filtreleme Logic
  const filteredVehicles = searchQuery.trim() === "" 
    ? [] 
    : allVehicles.filter(v => 
        v.plaka.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (v.aracTipi || "").toLowerCase().includes(searchQuery.toLowerCase())
      )

  // Telemetri Tipleri Logic
  const rawTipi = (vehicle.aracTipi || vehicle.arac_tipi || "").toUpperCase()
  const isArazoz = rawTipi.includes("ARAZÖZ") || rawTipi.includes("HIZLI") || rawTipi.includes("MÜDAHALE")
  const isKurtarma = rawTipi.includes("KURTARMA")
  const isMerdivenli = rawTipi.includes("MERDİVEN") || rawTipi.includes("METRE")

  const renderTelemetryCards = () => {
    const kmStr = `${(vehicle.km || 0).toLocaleString("tr-TR")} km`
    const ptoStr = `${(vehicle.motorSaatiPTO || 0).toLocaleString("tr-TR")} sa`

    if (isArazoz) {
      const isHizliMudahale = rawTipi.includes("HIZLI") || rawTipi.includes("MÜDAHALE")
      const suCapacity = isHizliMudahale ? 3000 : 10000
      const suVal = Math.round(suCapacity * 0.85) // 85% full
      const kopukCapacity = isHizliMudahale ? 300 : 500
      const kopukVal = Math.round(kopukCapacity * 0.90) // 90% full

      return (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 print:hidden">
          {/* Su Seviyesi */}
          <Card className="bg-slate-955/45 backdrop-blur-md border border-cyan-500/20 hover:border-cyan-500/40 transition-all shadow-[0_0_15px_rgba(6,182,212,0.03)]">
            <CardContent className="p-3 flex flex-col justify-between h-full min-h-[92px]">
              <div className="flex items-center gap-2">
                <Droplet className="w-4 h-4 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.4)] shrink-0" />
                <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Su Tankı</span>
              </div>
              <div className="mt-2 space-y-1">
                <div className="flex items-baseline justify-between text-xs font-mono font-bold text-cyan-400">
                  <span>{suVal.toLocaleString("tr-TR")} L</span>
                  <span className="text-[10px] text-slate-500">/ {suCapacity.toLocaleString("tr-TR")} L</span>
                </div>
                <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-cyan-500/10">
                  <div className="bg-gradient-to-r from-cyan-600 to-cyan-400 h-full rounded-full shadow-[0_0_8px_rgba(34,211,238,0.6)]" style={{ width: "85%" }} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Köpük Tankı */}
          <Card className="bg-slate-955/45 backdrop-blur-md border border-amber-500/20 hover:border-amber-500/40 transition-all shadow-[0_0_15px_rgba(245,158,11,0.03)]">
            <CardContent className="p-3 flex flex-col justify-between h-full min-h-[92px]">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-amber-400 drop-shadow-[0_0_4px_rgba(245,158,11,0.4)] shrink-0" />
                <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Köpük Tankı</span>
              </div>
              <div className="mt-2 space-y-1">
                <div className="flex items-baseline justify-between text-xs font-mono font-bold text-amber-400">
                  <span>{kopukVal.toLocaleString("tr-TR")} L</span>
                  <span className="text-[10px] text-slate-500">/ {kopukCapacity.toLocaleString("tr-TR")} L</span>
                </div>
                <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-amber-500/10">
                  <div className="bg-gradient-to-r from-amber-600 to-amber-400 h-full rounded-full shadow-[0_0_8px_rgba(245,158,11,0.6)]" style={{ width: "90%" }} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Yakıt Seviyesi */}
          <Card className="bg-slate-955/45 backdrop-blur-md border border-emerald-500/20 hover:border-emerald-500/40 transition-all shadow-[0_0_15px_rgba(16,185,129,0.03)]">
            <CardContent className="p-3 flex flex-col justify-between h-full min-h-[92px]">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-emerald-400 drop-shadow-[0_0_4px_rgba(16,185,129,0.4)] shrink-0" />
                <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Yakıt Durumu</span>
              </div>
              <div className="mt-2 space-y-1">
                <div className="flex items-baseline justify-between text-xs font-mono font-bold text-emerald-400">
                  <span>%75</span>
                  <span className="text-[10px] text-slate-500">3/4 Dolu</span>
                </div>
                <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-emerald-500/10">
                  <div className="bg-gradient-to-r from-emerald-600 to-emerald-400 h-full rounded-full shadow-[0_0_8px_rgba(16,185,129,0.6)]" style={{ width: "75%" }} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Kilometre */}
          <Card className="bg-slate-955/45 backdrop-blur-md border border-slate-500/10 hover:border-slate-500/30 transition-all">
            <CardContent className="p-3 flex flex-col justify-between h-full min-h-[92px]">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Odomotre</span>
              </div>
              <div className="mt-2 space-y-0.5">
                <span className="block text-[9px] text-slate-500 font-mono uppercase">Mevcut Kilometre</span>
                <span className="block text-sm font-bold font-mono text-slate-100">{kmStr}</span>
              </div>
            </CardContent>
          </Card>

          {/* Motor Saati */}
          <Card className="bg-slate-955/45 backdrop-blur-md border border-slate-500/10 hover:border-slate-500/30 transition-all">
            <CardContent className="p-3 flex flex-col justify-between h-full min-h-[92px]">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Motor PTO</span>
              </div>
              <div className="mt-2 space-y-0.5">
                <span className="block text-[9px] text-slate-500 font-mono uppercase">Çalışma Süresi</span>
                <span className="block text-sm font-bold font-mono text-slate-100">{ptoStr}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )
    }

    if (isKurtarma) {
      return (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 print:hidden">
          {/* Jeneratör Durumu */}
          <Card className="bg-slate-955/45 backdrop-blur-md border border-rose-500/20 hover:border-rose-500/40 transition-all shadow-[0_0_15px_rgba(244,63,94,0.03)]">
            <CardContent className="p-3 flex flex-col justify-between h-full min-h-[92px]">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-rose-400 drop-shadow-[0_0_4px_rgba(244,63,94,0.4)] shrink-0" />
                <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Jeneratör</span>
              </div>
              <div className="mt-2 space-y-1">
                <div className="flex items-baseline justify-between text-xs font-mono font-bold text-rose-400">
                  <span>%85 Kapasite</span>
                  <span className="text-[10px] text-slate-500">Stabil</span>
                </div>
                <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-rose-500/10">
                  <div className="bg-gradient-to-r from-rose-600 to-rose-400 h-full rounded-full shadow-[0_0_8px_rgba(244,63,94,0.6)]" style={{ width: "85%" }} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Ekipman Sağlığı */}
          <Card className="bg-slate-955/45 backdrop-blur-md border border-cyan-500/20 hover:border-cyan-500/40 transition-all shadow-[0_0_15px_rgba(6,182,212,0.03)]">
            <CardContent className="p-3 flex flex-col justify-between h-full min-h-[92px]">
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-cyan-400 drop-shadow-[0_0_4px_rgba(6,182,212,0.4)] shrink-0" />
                <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Ekipman Sağlığı</span>
              </div>
              <div className="mt-2 space-y-1">
                <div className="flex items-baseline justify-between text-xs font-mono font-bold text-cyan-400">
                  <span>%100</span>
                  <span className="text-[10px] text-slate-500">Kritik Hata Yok</span>
                </div>
                <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-cyan-500/10">
                  <div className="bg-gradient-to-r from-cyan-600 to-cyan-400 h-full rounded-full shadow-[0_0_8px_rgba(6,182,212,0.6)]" style={{ width: "100%" }} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Yakıt Seviyesi */}
          <Card className="bg-slate-955/45 backdrop-blur-md border border-emerald-500/20 hover:border-emerald-500/40 transition-all shadow-[0_0_15px_rgba(16,185,129,0.03)]">
            <CardContent className="p-3 flex flex-col justify-between h-full min-h-[92px]">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-emerald-400 drop-shadow-[0_0_4px_rgba(16,185,129,0.4)] shrink-0" />
                <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Yakıt Durumu</span>
              </div>
              <div className="mt-2 space-y-1">
                <div className="flex items-baseline justify-between text-xs font-mono font-bold text-emerald-400">
                  <span>%75</span>
                  <span className="text-[10px] text-slate-500">3/4 Dolu</span>
                </div>
                <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-emerald-500/10">
                  <div className="bg-gradient-to-r from-emerald-600 to-emerald-400 h-full rounded-full shadow-[0_0_8px_rgba(16,185,129,0.6)]" style={{ width: "75%" }} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Kilometre */}
          <Card className="bg-slate-955/45 backdrop-blur-md border border-slate-500/10 hover:border-slate-500/30 transition-all">
            <CardContent className="p-3 flex flex-col justify-between h-full min-h-[92px]">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Odomotre</span>
              </div>
              <div className="mt-2 space-y-0.5">
                <span className="block text-[9px] text-slate-500 font-mono uppercase">Mevcut Kilometre</span>
                <span className="block text-sm font-bold font-mono text-slate-100">{kmStr}</span>
              </div>
            </CardContent>
          </Card>

          {/* Motor Saati */}
          <Card className="bg-slate-955/45 backdrop-blur-md border-slate-500/10 hover:border-slate-500/30 transition-all">
            <CardContent className="p-3 flex flex-col justify-between h-full min-h-[92px]">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Motor PTO</span>
              </div>
              <div className="mt-2 space-y-0.5">
                <span className="block text-[9px] text-slate-500 font-mono uppercase">Çalışma Süresi</span>
                <span className="block text-sm font-bold font-mono text-slate-100">{ptoStr}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )
    }

    if (isMerdivenli) {
      return (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 print:hidden">
          {/* Bom Kontrolü */}
          <Card className="bg-slate-955/45 backdrop-blur-md border border-cyan-500/20 hover:border-cyan-500/40 transition-all shadow-[0_0_15px_rgba(6,182,212,0.03)]">
            <CardContent className="p-3 flex flex-col justify-between h-full min-h-[92px]">
              <div className="flex items-center gap-2">
                <Maximize className="w-4 h-4 text-cyan-400 drop-shadow-[0_0_4px_rgba(6,182,212,0.4)] shrink-0" />
                <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Bom Kontrolü</span>
              </div>
              <div className="mt-2 space-y-1">
                <div className="flex items-baseline justify-between text-xs font-mono font-bold text-cyan-400">
                  <span>%100 Stabil</span>
                  <span className="text-[9px] px-1 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded">OK</span>
                </div>
                <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-cyan-500/10">
                  <div className="bg-gradient-to-r from-cyan-600 to-cyan-400 h-full rounded-full shadow-[0_0_8px_rgba(6,182,212,0.6)]" style={{ width: "100%" }} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Hidrolik Basınç */}
          <Card className="bg-slate-955/45 backdrop-blur-md border border-amber-500/20 hover:border-amber-500/40 transition-all shadow-[0_0_15px_rgba(245,158,11,0.03)]">
            <CardContent className="p-3 flex flex-col justify-between h-full min-h-[92px]">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-amber-400 drop-shadow-[0_0_4px_rgba(245,158,11,0.4)] shrink-0" />
                <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Hidrolik Sistem</span>
              </div>
              <div className="mt-2 space-y-1">
                <div className="flex items-baseline justify-between text-xs font-mono font-bold text-amber-400">
                  <span>210 Bar</span>
                  <span className="text-[9px] px-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded">Güvenli</span>
                </div>
                <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-amber-500/10">
                  <div className="bg-gradient-to-r from-amber-600 to-amber-400 h-full rounded-full shadow-[0_0_8px_rgba(245,158,11,0.6)]" style={{ width: "84%" }} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Yakıt Seviyesi */}
          <Card className="bg-slate-955/45 backdrop-blur-md border border-emerald-500/20 hover:border-emerald-500/40 transition-all shadow-[0_0_15px_rgba(16,185,129,0.03)]">
            <CardContent className="p-3 flex flex-col justify-between h-full min-h-[92px]">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-emerald-400 drop-shadow-[0_0_4px_rgba(16,185,129,0.4)] shrink-0" />
                <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Yakıt Durumu</span>
              </div>
              <div className="mt-2 space-y-1">
                <div className="flex items-baseline justify-between text-xs font-mono font-bold text-emerald-400">
                  <span>%75</span>
                  <span className="text-[10px] text-slate-500">3/4 Dolu</span>
                </div>
                <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-emerald-500/10">
                  <div className="bg-gradient-to-r from-emerald-600 to-emerald-400 h-full rounded-full shadow-[0_0_8px_rgba(16,185,129,0.6)]" style={{ width: "75%" }} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Kilometre */}
          <Card className="bg-slate-955/45 backdrop-blur-md border border-slate-500/10 hover:border-slate-500/30 transition-all">
            <CardContent className="p-3 flex flex-col justify-between h-full min-h-[92px]">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Odomotre</span>
              </div>
              <div className="mt-2 space-y-0.5">
                <span className="block text-[9px] text-slate-500 font-mono uppercase">Mevcut Kilometre</span>
                <span className="block text-sm font-bold font-mono text-slate-100">{kmStr}</span>
              </div>
            </CardContent>
          </Card>

          {/* Motor Saati */}
          <Card className="bg-slate-955/45 backdrop-blur-md border-slate-500/10 hover:border-slate-500/30 transition-all">
            <CardContent className="p-3 flex flex-col justify-between h-full min-h-[92px]">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Motor PTO</span>
              </div>
              <div className="mt-2 space-y-0.5">
                <span className="block text-[9px] text-slate-500 font-mono uppercase">Çalışma Süresi</span>
                <span className="block text-sm font-bold font-mono text-slate-100">{ptoStr}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )
    }

    // Default / Diğer
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 print:hidden">
        {/* Kilometre */}
        <Card className="bg-slate-955/45 backdrop-blur-md border border-slate-500/10 hover:border-slate-500/30 transition-all">
          <CardContent className="p-3 flex flex-col justify-between h-full min-h-[92px]">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-cyan-400 shrink-0" />
              <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Kilometre</span>
            </div>
            <div className="mt-2 space-y-0.5">
              <span className="block text-[9px] text-slate-500 font-mono uppercase">Mevcut Kilometre</span>
              <span className="block text-sm font-bold font-mono text-slate-100">{kmStr}</span>
            </div>
          </CardContent>
        </Card>

        {/* Motor PTO */}
        <Card className="bg-slate-955/45 backdrop-blur-md border border-slate-500/10 hover:border-slate-500/30 transition-all">
          <CardContent className="p-3 flex flex-col justify-between h-full min-h-[92px]">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-warning shrink-0" />
              <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Motor PTO</span>
            </div>
            <div className="mt-2 space-y-0.5">
              <span className="block text-[9px] text-slate-500 font-mono uppercase font-bold">PTO Saati</span>
              <span className="block text-sm font-bold font-mono text-slate-100">{ptoStr}</span>
            </div>
          </CardContent>
        </Card>

        {/* Sigorta */}
        <Card className="bg-slate-955/45 backdrop-blur-md border border-slate-500/10 hover:border-slate-500/30 transition-all">
          <CardContent className="p-3 flex flex-col justify-between h-full min-h-[92px]">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-success shrink-0" />
              <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Sigorta</span>
            </div>
            <div className="mt-2 space-y-0.5">
              <span className="block text-[9px] text-slate-500 font-mono uppercase font-bold">Bitiş Tarihi</span>
              <span className="block text-xs font-bold font-mono text-slate-100">
                {vehicle.sigortaBitis ? new Date(vehicle.sigortaBitis).toLocaleDateString("tr-TR") : "—"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Muayene */}
        <Card className="bg-slate-955/45 backdrop-blur-md border border-slate-500/10 hover:border-slate-500/30 transition-all">
          <CardContent className="p-3 flex flex-col justify-between h-full min-h-[92px]">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-blue-500 shrink-0" />
              <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Muayene</span>
            </div>
            <div className="mt-2 space-y-0.5">
              <span className="block text-[9px] text-slate-500 font-mono uppercase font-bold">Bitiş Tarihi</span>
              <span className="block text-xs font-bold font-mono text-slate-100">
                {vehicle.muayeneBitis ? new Date(vehicle.muayeneBitis).toLocaleDateString("tr-TR") : "—"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Yakıt Durumu */}
        <Card className="bg-slate-955/45 backdrop-blur-md border border-emerald-500/20 hover:border-emerald-500/40 transition-all shadow-[0_0_15px_rgba(16,185,129,0.03)]">
          <CardContent className="p-3 flex flex-col justify-between h-full min-h-[92px]">
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-emerald-400 drop-shadow-[0_0_4px_rgba(16,185,129,0.4)] shrink-0" />
              <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Yakıt Durumu</span>
            </div>
            <div className="mt-2 space-y-1">
              <div className="flex items-baseline justify-between text-xs font-mono font-bold text-emerald-400">
                <span>%75</span>
                <span className="text-[10px] text-slate-500">3/4 Dolu</span>
              </div>
              <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-emerald-500/10">
                <div className="bg-gradient-to-r from-emerald-600 to-emerald-400 h-full rounded-full shadow-[0_0_8px_rgba(16,185,129,0.6)]" style={{ width: "75%" }} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Manuel Plaka / Kod Sorgulama Çubuğu (Glassmorphic HUD) */}
      <div className="relative w-full max-w-xl mx-auto z-40 print:hidden pt-2">
        <div className="relative flex items-center bg-slate-950/45 backdrop-blur-md border border-cyan-500/20 rounded-xl px-3 py-1 shadow-[0_0_15px_rgba(6,182,212,0.05)] focus-within:border-cyan-500/50 focus-within:shadow-[0_0_20px_rgba(6,182,212,0.15)] transition-all">
          <Search className="w-5 h-5 text-cyan-400 mr-2 shrink-0 drop-shadow-[0_0_4px_rgba(6,182,212,0.4)]" />
          <input
            type="text"
            placeholder="Manuel Plaka veya Araç Kodu Sorgula..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setTimeout(() => setIsSearchFocused(false), 250)}
            className="w-full bg-transparent border-0 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-0 h-10 font-mono tracking-wider"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="text-slate-400 hover:text-slate-200 p-1 rounded-full hover:bg-slate-800/50"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Canlı Filtreleme Sonuçları */}
        {isSearchFocused && filteredVehicles.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-slate-950/90 backdrop-blur-xl border border-cyan-500/30 rounded-xl shadow-[0_4px_25px_rgba(0,0,0,0.8)] overflow-hidden max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-150">
            {filteredVehicles.map((v) => (
              <button
                key={v.plaka}
                onClick={() => {
                  const slug = v.plaka.replace(/\s+/g, '-').toLowerCase()
                  router.push(`/araclar/${slug}`)
                  setSearchQuery("")
                }}
                className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-cyan-500/10 border-b border-cyan-500/5 last:border-b-0 transition-colors font-mono"
              >
                <div className="flex items-center gap-3">
                  <div className="p-1.5 bg-cyan-500/10 rounded-lg text-cyan-400 border border-cyan-500/20">
                    <Truck className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-slate-100 font-bold tracking-wider">{v.plaka}</span>
                    <span className="block text-[10px] text-slate-400 uppercase mt-0.5">{v.aracTipi}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={v.durum === "aktif" ? "success" : v.durum === "bakimda" ? "warning" : "danger"} className="text-[9px]">
                    {v.durum === "aktif" ? "Aktif" : v.durum === "bakimda" ? "Bakımda" : "Arızalı"}
                  </Badge>
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between space-y-4 sm:space-y-0 border-b border-border/50 pb-4 print:hidden">
        <div className="flex items-center space-x-4">
          <Link href="/araclar" className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-muted transition-colors sm:mr-2 shrink-0">
              <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="bg-primary/10 p-3 rounded-xl border border-primary/20 shrink-0 w-fit">
              <Truck className="w-8 h-8 text-primary" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight">{vehicle.plaka}</h1>
              <Badge variant={vehicle.durum === "aktif" ? "success" : vehicle.durum === "bakimda" ? "warning" : "danger"}>
                {vehicle.durum === "aktif" ? "Aktif" : vehicle.durum === "bakimda" ? "Bakımda" : "Arızalı"}
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm mt-1">{vehicle.aracTipi}</p>
          </div>
        </div>
        
        <button 
          onClick={handlePrint}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white font-bold rounded-lg hover:bg-primary/90 transition-colors shadow-md active:scale-95 shrink-0"
        >
          <Printer className="w-5 h-5" />
          <span>Toplu Etiket Yazdır</span>
        </button>
      </div>

      {/* Araç Taktiksel Telemetri HUD Kartları */}
      {renderTelemetryCards()}

      {/* İnteraktif Araç Şeması */}
      <Card className="border-cyan-500/10 overflow-hidden">
        <CardHeader className="pb-2 border-b border-border/50 bg-gradient-to-r from-cyan-500/[0.03] to-transparent">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_6px_2px_rgba(34,211,238,0.3)]" />
            İnteraktif Araç Şeması — Bölme Seçin
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 pb-2">
          <Vehicle3DSchematic
            compartmentKeys={compartKeys}
            activeCompartment={activeCompartment}
            onSelect={handleSelectCompartment}
            vehicleType={vehicle.aracTipi}
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative">
        {/* Bölme Listesi */}
        <Card className="lg:col-span-1 h-fit lg:sticky lg:top-4">
          <CardHeader className="pb-3 border-b border-border/50 bg-muted/10">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center space-x-2">
                <PackageSearch className="w-5 h-5 text-muted-foreground" />
                <span>Bölmeler</span>
              </span>
              <span className="text-xs text-muted-foreground font-normal">
                {totalItems} malzeme{issueItems > 0 && <span className="text-danger ml-1">({issueItems} sorunlu)</span>}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
             <div className="flex flex-col">
               {compartKeys.map(key => {
                 const isActive = activeCompartment === key
                 const itemCount = vehicle.bolmeler?.[key]?.length || 0
                 const issues = vehicle.bolmeler?.[key]?.filter((i: InventoryItem) => i?.durum !== "Tam")?.length || 0
                 const IconComponent = TACTICAL_ICONS[key] || Box
                 return (
                   <button
                     key={key}
                     onClick={() => handleSelectCompartment(key)}
                     className={cn(
                       "flex items-center justify-between px-5 py-3 border-b border-border/30 last:border-0 hover:bg-muted/50 transition-colors text-left w-full",
                       isActive && "bg-primary/5 text-primary border-l-4 border-l-primary font-bold shadow-sm"
                     )}
                   >
                     <div className="flex items-center gap-3">
                       <div className={cn(
                         "p-2 rounded-lg border transition-colors shrink-0",
                         isActive 
                           ? "bg-primary/10 border-primary/20 text-primary" 
                           : "bg-muted/40 border-border/50 text-muted-foreground"
                       )}>
                         <IconComponent className="w-4 h-4" />
                       </div>
                       <div>
                         <span className="block text-sm font-semibold tracking-tight">{getCompartmentLabel(key)}</span>
                         <span className="block text-[11px] text-muted-foreground mt-0.5">{itemCount} malzeme</span>
                       </div>
                     </div>
                     <div className="flex items-center gap-2">
                       {issues > 0 && <Badge variant="danger" className="text-[9px] px-1.5">{issues}</Badge>}
                       <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform", isActive && "text-primary translate-x-1")} />
                     </div>
                   </button>
                 )
               })}
             </div>
          </CardContent>
        </Card>

        {/* Envanter Listesi + Audit Trail */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="shadow-sm">
             <CardHeader className="pb-3 border-b border-border/50 bg-muted/10">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                    <span>{activeCompartment ? getCompartmentLabel(activeCompartment) : "Bölme Seçin"} Envanteri</span>
                  </CardTitle>
                  {activeCompartment && (
                    <div className="flex items-center gap-2">
                      {!isEr && (
                        <>
                          <button
                            onClick={handleOpenAddModal}
                            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Yeni Ekipman
                          </button>
                          <button
                            onClick={() => setIsEditingList(!isEditingList)}
                            className={cn(
                              "flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all",
                              isEditingList
                                ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                : "bg-muted/50 text-slate-300 border border-border/50 hover:bg-muted"
                            )}
                          >
                            <Wrench className="w-3.5 h-3.5" />
                            {isEditingList ? "Kapat" : "Düzenle"}
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => setShowTimeline(!showTimeline)}
                        className={cn(
                          "flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors",
                          showTimeline
                            ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/20"
                            : "bg-muted/50 text-muted-foreground hover:bg-muted border border-border/50"
                        )}
                      >
                        <History className="w-3.5 h-3.5" />
                        Geçmiş
                      </button>
                    </div>
                  )}
                </div>
             </CardHeader>
             <CardContent className="pt-0 px-0">
                {activeCompartment ? (
                   <InventoryList 
                     items={activeItems} 
                     isEditingList={isEditingList}
                     onEditItem={handleOpenEditModal}
                     onDeleteItem={handleDeleteEquipment}
                   />
                ) : (
                   <div className="p-8 text-center text-muted-foreground">Lütfen sol menüden veya şemadan bir araç bölmesi seçin.</div>
                )}
             </CardContent>
          </Card>

          {/* Audit Timeline */}
          {showTimeline && activeCompartment && (
            <Card className="border-cyan-500/10 animate-in fade-in slide-in-from-top-3">
              <CardHeader className="pb-3 border-b border-border/50 bg-gradient-to-r from-cyan-500/[0.03] to-transparent">
                <CardTitle className="text-sm flex items-center gap-2">
                  <History className="w-4 h-4 text-cyan-400" />
                  Vardiya Devir Logları — {getCompartmentLabel(activeCompartment)}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <AuditTimeline plaka={vehicle.plaka} compartmentKey={activeCompartment} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {vehicle && (
        <InventoryAddEditModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSaveEquipment}
          initialItem={modalItem}
          currentCompartment={activeCompartment || ""}
          availableCompartments={compartKeys}
        />
      )}

      {/* Hidden Print Area */}
      <div id="vehicle-print-area" className="hidden print:block print:w-full">
        <div className="print-header mb-8 text-center border-b-2 border-black pb-4">
          <h1 className="text-3xl font-black">{vehicle.plaka}</h1>
          <p className="text-xl font-bold mt-1">Araç İçi Envanter ve Barkod Sistemi</p>
          <p className="text-sm mt-2 text-gray-600">Bu QR kodları ilgili bölmelere yapıştırarak hızlı sayım yapabilirsiniz.</p>
        </div>

        <div className="print-grid grid grid-cols-2 gap-8 gap-y-12 place-items-center">
          {compartKeys.map((comp) => {
             const qrUrl = buildQrUrl(vehicle.plaka, comp)
             return (
               <div key={comp} className="print-qr-item flex flex-col items-center border-2 border-black p-6 rounded-2xl w-[85%] relative break-inside-avoid shadow-sm">
                 <div className="absolute -top-4 bg-white px-4">
                   <h3 className="text-xl font-black tracking-tight">{vehicle.plaka}</h3>
                 </div>
                 
                 <div className="bg-white p-2 rounded-xl mb-4 border border-gray-200 shadow-inner">
                   <QRCodeSVG 
                     value={qrUrl} 
                     size={220}
                     level="M"
                     includeMargin={false}
                   />
                 </div>
                 
                 <div className="text-center w-full bg-gray-100 py-3 rounded-lg border border-gray-300">
                   <p className="font-bold text-lg text-black">{getCompartmentLabel(comp)}</p>
                   <p className="text-xs text-gray-600 mt-1">{vehicle.bolmeler?.[comp]?.length || 0} Malzeme</p>
                 </div>
                 
                 <p className="text-[10px] text-gray-400 mt-4 text-center">Sivas İtfaiyesi Araç ve Envanter Yönetimi</p>
               </div>
             )
          })}
        </div>
      </div>
    </div>
  )
}
