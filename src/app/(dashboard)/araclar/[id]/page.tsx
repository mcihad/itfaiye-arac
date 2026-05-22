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

  // Siber Taktik Araç Yapılandırma HUD States
  const [isConfigPanelOpen, setIsConfigPanelOpen] = useState(false)
  const [tempSuKapasite, setTempSuKapasite] = useState<number>(0)
  const [tempKopukKapasite, setTempKopukKapasite] = useState<number>(0)
  const [tempBolmeler, setTempBolmeler] = useState<Record<string, InventoryItem[]>>({})
  const [newCompKey, setNewCompKey] = useState<string>("")
  const [newCompPreset, setNewCompPreset] = useState<string>("custom")
  const [renameInputs, setRenameInputs] = useState<Record<string, string>>({})
  const [savingConfig, setSavingConfig] = useState(false)

  // Sync temp states on vehicle load
  useEffect(() => {
    if (vehicle) {
      setTempSuKapasite(vehicle.su_kapasite || 0)
      setTempKopukKapasite(vehicle.kopuk_kapasite || 0)
      setTempBolmeler(JSON.parse(JSON.stringify(vehicle.bolmeler || {})))
    }
  }, [vehicle])

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

  // Renaming compartment key
  const handleRenameChange = (oldKey: string, val: string) => {
    setRenameInputs(prev => ({ ...prev, [oldKey]: val }))
  }

  const applyRename = (oldKey: string) => {
    const newKey = renameInputs[oldKey]?.trim()
    if (!newKey || newKey === oldKey) return

    if (tempBolmeler[newKey]) {
      alert(`"${newKey}" bölmesi zaten mevcut. Lütfen benzersiz bir isim girin.`)
      return
    }

    const updated = { ...tempBolmeler }
    updated[newKey] = updated[oldKey] || []
    delete updated[oldKey]

    setTempBolmeler(updated)

    if (activeCompartment === oldKey) {
      setActiveCompartment(newKey)
    }

    setRenameInputs(prev => {
      const next = { ...prev }
      delete next[oldKey]
      return next
    })
  }

  // Deleting compartment key
  const handleDeleteCompartment = (key: string) => {
    const itemsCount = tempBolmeler[key]?.length || 0
    if (itemsCount > 0) {
      const confirmDelete = window.confirm(`"${getCompartmentLabel(key)}" bölmesi içinde ${itemsCount} adet malzeme bulunmaktadır. Bu bölmeyi sildiğinizde İÇİNDEKİ TÜM MALZEMELER DE SİLİNECEKTİR. Emin misiniz?`)
      if (!confirmDelete) return
    } else {
      const confirmDelete = window.confirm(`"${getCompartmentLabel(key)}" bölmesini silmek istediğinize emin misiniz?`)
      if (!confirmDelete) return
    }

    const updated = { ...tempBolmeler }
    delete updated[key]
    setTempBolmeler(updated)

    if (activeCompartment === key) {
      const remainingKeys = Object.keys(updated)
      setActiveCompartment(remainingKeys.length > 0 ? remainingKeys[0] : null)
    }
  }

  // Adding new compartment key
  const handleAddCompartment = () => {
    let keyToAdd = ""
    if (newCompPreset === "custom") {
      keyToAdd = newCompKey.trim().toLowerCase().replace(/\s+/g, "_")
    } else {
      keyToAdd = newCompPreset
    }

    if (!keyToAdd) {
      alert("Lütfen geçerli bir bölme ismi veya anahtarı girin.")
      return
    }

    if (tempBolmeler[keyToAdd]) {
      alert(`"${keyToAdd}" bölmesi zaten ekli.`)
      return
    }

    const updated = { ...tempBolmeler, [keyToAdd]: [] }
    setTempBolmeler(updated)
    setNewCompKey("")
    setNewCompPreset("custom")

    setActiveCompartment(keyToAdd)
  }

  // Saving configuration
  const handleSaveConfig = async () => {
    if (!vehicle) return
    setSavingConfig(true)
    try {
      const { error: updateErr } = await api.update('vehicles', {
        su_kapasite: tempSuKapasite,
        kopuk_kapasite: tempKopukKapasite,
        bolmeler: tempBolmeler
      }, { plaka: vehicle.plaka })

      if (updateErr) {
        throw updateErr
      }

      setVehicle(prev => {
        if (!prev) return null
        return {
          ...prev,
          su_kapasite: tempSuKapasite,
          kopuk_kapasite: tempKopukKapasite,
          bolmeler: tempBolmeler
        }
      })

      await fetch('/api/audit-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action_type: 'vehicle_config_update',
          actor_sicil_no: user?.sicilNo || 'unknown',
          actor_name: user ? `${user.ad} ${user.soyad}` : 'Bilinmeyen',
          target: vehicle.plaka,
          details: {
            action: 'update_vehicle_configuration',
            su_kapasite: tempSuKapasite,
            kopuk_kapasite: tempKopukKapasite,
            bolmeler_keys: Object.keys(tempBolmeler)
          },
        }),
      }).catch(err => console.error('[AuditLog] Yapılandırma logu gönderilemedi:', err))

      alert("Araç yapılandırması başarıyla güncellendi!")
      setIsConfigPanelOpen(false)
    } catch (err: any) {
      console.error("Error saving configuration:", err)
      alert("Hata oluştu: " + err.message)
    } finally {
      setSavingConfig(false)
    }
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
    const suCapacity = vehicle.su_kapasite || 0
    const kopukCapacity = vehicle.kopuk_kapasite || 0

    // Dynamic calculations
    const suVal = Math.round(suCapacity * 0.85) // 85% simulated
    const kopukVal = Math.round(kopukCapacity * 0.90) // 90% simulated

    // Taktik Malzeme HUD card percentage
    const maxTaktikMalzeme = 150
    const totalItemsCount = totalItems || 0
    const taktikPercent = Math.min(Math.round((totalItemsCount / maxTaktikMalzeme) * 100), 100)

    // Sorunlu Malzeme HUD card percentage
    const issueItemsCount = issueItems || 0
    const sorunPercent = totalItemsCount > 0 ? Math.min(Math.round((issueItemsCount / totalItemsCount) * 100), 100) : 0

    const hasLiquidTanks = suCapacity > 0 || kopukCapacity > 0

    if (isArazoz || hasLiquidTanks) {
      return (
        <div className="flex flex-nowrap overflow-x-auto gap-3 pb-2 md:pb-0 print:hidden w-full max-w-full md:grid md:grid-cols-5 scrollbar-thin scrollbar-thumb-cyan-500/20" style={{ WebkitOverflowScrolling: "touch" }}>
          {/* Su Seviyesi or Taktik Malzeme HUD Kartı */}
          {suCapacity > 0 ? (
            <Card className="bg-slate-955/45 backdrop-blur-md border border-cyan-500/20 hover:border-cyan-500/40 transition-all shadow-[0_0_15px_rgba(6,182,212,0.03)] w-[165px] shrink-0 md:w-auto md:shrink">
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
          ) : (
            <Card className="bg-slate-955/45 backdrop-blur-md border border-cyan-500/20 hover:border-cyan-500/40 transition-all shadow-[0_0_15px_rgba(6,182,212,0.03)] w-[165px] shrink-0 md:w-auto md:shrink">
              <CardContent className="p-3 flex flex-col justify-between h-full min-h-[92px]">
                <div className="flex items-center gap-2">
                  <PackageSearch className="w-4 h-4 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.4)] shrink-0" />
                  <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider font-bold">Taktik Envanter</span>
                </div>
                <div className="mt-2 space-y-1">
                  <div className="flex items-baseline justify-between text-xs font-mono font-bold text-cyan-400">
                    <span>{totalItemsCount} Malzeme</span>
                    <span className="text-[10px] text-slate-500">/ {maxTaktikMalzeme} Max</span>
                  </div>
                  <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-cyan-500/10">
                    <div className="bg-gradient-to-r from-cyan-600 to-cyan-400 h-full rounded-full shadow-[0_0_8px_rgba(34,211,238,0.6)]" style={{ width: `${taktikPercent}%` }} />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Köpük Tankı or Sorunlu Malzeme Sayacı */}
          {kopukCapacity > 0 ? (
            <Card className="bg-slate-955/45 backdrop-blur-md border border-amber-500/20 hover:border-amber-500/40 transition-all shadow-[0_0_15px_rgba(245,158,11,0.03)] w-[165px] shrink-0 md:w-auto md:shrink">
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
          ) : (
            <Card className={cn(
              "backdrop-blur-md border transition-all h-full min-h-[92px] w-[165px] shrink-0 md:w-auto md:shrink",
              issueItemsCount > 0 
                ? "bg-rose-950/20 border-rose-500/30 hover:border-rose-500/50 shadow-[0_0_15px_rgba(239,68,68,0.05)] animate-pulse" 
                : "bg-slate-955/45 border-emerald-500/20 hover:border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.03)]"
            )}>
              <CardContent className="p-3 flex flex-col justify-between h-full min-h-[92px]">
                <div className="flex items-center gap-2">
                  <Wrench className={cn("w-4 h-4 shrink-0", issueItemsCount > 0 ? "text-rose-400 animate-pulse" : "text-emerald-400")} />
                  <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider font-bold">Sorunlu Malzeme</span>
                </div>
                <div className="mt-2 space-y-1">
                  <div className="flex items-baseline justify-between text-xs font-mono font-bold">
                    <span className={issueItemsCount > 0 ? "text-rose-400" : "text-emerald-400"}>
                      {issueItemsCount} Sorunlu
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {issueItemsCount > 0 ? `%${sorunPercent} Hasar` : "Sıfır Hata"}
                    </span>
                  </div>
                  <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-white/5">
                    <div 
                      className={cn(
                        "h-full rounded-full shadow-[0_0_8px]",
                        issueItemsCount > 0 ? "bg-gradient-to-r from-rose-600 to-rose-400 shadow-rose-500/60" : "bg-emerald-500 shadow-emerald-500/60"
                      )} 
                      style={{ width: `${issueItemsCount > 0 ? sorunPercent : 100}%` }} 
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Yakıt Seviyesi */}
          <Card className="bg-slate-955/45 backdrop-blur-md border border-emerald-500/20 hover:border-emerald-500/40 transition-all shadow-[0_0_15px_rgba(16,185,129,0.03)] w-[165px] shrink-0 md:w-auto md:shrink">
            <CardContent className="p-3 flex flex-col justify-between h-full min-h-[92px]">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-emerald-400 drop-shadow-[0_0_4px_rgba(16,185,129,0.4)] shrink-0" />
                <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider font-bold">Yakıt Durumu</span>
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
          <Card className="bg-slate-955/45 backdrop-blur-md border border-slate-500/10 hover:border-slate-500/30 transition-all w-[165px] shrink-0 md:w-auto md:shrink">
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
          <Card className="bg-slate-955/45 backdrop-blur-md border border-slate-500/10 hover:border-slate-500/30 transition-all w-[165px] shrink-0 md:w-auto md:shrink">
            <CardContent className="p-3 flex flex-col justify-between h-full min-h-[92px]">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider font-bold">Motor PTO</span>
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
        <div className="flex flex-nowrap overflow-x-auto gap-3 pb-2 md:pb-0 print:hidden w-full max-w-full md:grid md:grid-cols-5 scrollbar-thin scrollbar-thumb-cyan-500/20" style={{ WebkitOverflowScrolling: "touch" }}>
          {/* Jeneratör Durumu */}
          <Card className="bg-slate-955/45 backdrop-blur-md border border-rose-500/20 hover:border-rose-500/40 transition-all shadow-[0_0_15px_rgba(244,63,94,0.03)] w-[165px] shrink-0 md:w-auto md:shrink">
            <CardContent className="p-3 flex flex-col justify-between h-full min-h-[92px]">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-rose-400 drop-shadow-[0_0_4px_rgba(244,63,94,0.4)] shrink-0" />
                <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider font-bold">Jeneratör</span>
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
          <Card className="bg-slate-955/45 backdrop-blur-md border border-cyan-500/20 hover:border-cyan-500/40 transition-all shadow-[0_0_15px_rgba(6,182,212,0.03)] w-[165px] shrink-0 md:w-auto md:shrink">
            <CardContent className="p-3 flex flex-col justify-between h-full min-h-[92px]">
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-cyan-400 drop-shadow-[0_0_4px_rgba(6,182,212,0.4)] shrink-0" />
                <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider font-bold">Ekipman Sağlığı</span>
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
          <Card className="bg-slate-955/45 backdrop-blur-md border border-emerald-500/20 hover:border-emerald-500/40 transition-all shadow-[0_0_15px_rgba(16,185,129,0.03)] w-[165px] shrink-0 md:w-auto md:shrink">
            <CardContent className="p-3 flex flex-col justify-between h-full min-h-[92px]">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-emerald-400 drop-shadow-[0_0_4px_rgba(16,185,129,0.4)] shrink-0" />
                <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider font-bold">Yakıt Durumu</span>
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
          <Card className="bg-slate-955/45 backdrop-blur-md border border-slate-500/10 hover:border-slate-500/30 transition-all w-[165px] shrink-0 md:w-auto md:shrink">
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
          <Card className="bg-slate-955/45 backdrop-blur-md border-slate-500/10 hover:border-slate-500/30 transition-all w-[165px] shrink-0 md:w-auto md:shrink">
            <CardContent className="p-3 flex flex-col justify-between h-full min-h-[92px]">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider font-bold">Motor PTO</span>
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
        <div className="flex flex-nowrap overflow-x-auto md:grid md:grid-cols-5 gap-3 pb-2 md:pb-0 print:hidden scrollbar-thin scrollbar-thumb-cyan-500/20">
          {/* Bom Kontrolü */}
          <Card className="bg-slate-955/45 backdrop-blur-md border border-cyan-500/20 hover:border-cyan-500/40 transition-all shadow-[0_0_15px_rgba(6,182,212,0.03)] w-[165px] shrink-0 md:w-auto md:shrink">
            <CardContent className="p-3 flex flex-col justify-between h-full min-h-[92px]">
              <div className="flex items-center gap-2">
                <Maximize className="w-4 h-4 text-cyan-400 drop-shadow-[0_0_4px_rgba(6,182,212,0.4)] shrink-0" />
                <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider font-bold">Bom Kontrolü</span>
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
          <Card className="bg-slate-955/45 backdrop-blur-md border border-amber-500/20 hover:border-amber-500/40 transition-all shadow-[0_0_15px_rgba(245,158,11,0.03)] w-[165px] shrink-0 md:w-auto md:shrink">
            <CardContent className="p-3 flex flex-col justify-between h-full min-h-[92px]">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-amber-400 drop-shadow-[0_0_4px_rgba(245,158,11,0.4)] shrink-0" />
                <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider font-bold">Hidrolik Sistem</span>
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
          <Card className="bg-slate-955/45 backdrop-blur-md border border-emerald-500/20 hover:border-emerald-500/40 transition-all shadow-[0_0_15px_rgba(16,185,129,0.03)] w-[165px] shrink-0 md:w-auto md:shrink">
            <CardContent className="p-3 flex flex-col justify-between h-full min-h-[92px]">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-emerald-400 drop-shadow-[0_0_4px_rgba(16,185,129,0.4)] shrink-0" />
                <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider font-bold">Yakıt Durumu</span>
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
          <Card className="bg-slate-955/45 backdrop-blur-md border border-slate-500/10 hover:border-slate-500/30 transition-all w-[165px] shrink-0 md:w-auto md:shrink">
            <CardContent className="p-3 flex flex-col justify-between h-full min-h-[92px]">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider font-bold">Odomotre</span>
              </div>
              <div className="mt-2 space-y-0.5">
                <span className="block text-[9px] text-slate-500 font-mono uppercase">Mevcut Kilometre</span>
                <span className="block text-sm font-bold font-mono text-slate-100">{kmStr}</span>
              </div>
            </CardContent>
          </Card>

          {/* Motor Saati */}
          <Card className="bg-slate-955/45 backdrop-blur-md border border-slate-500/10 hover:border-slate-500/30 transition-all w-[165px] shrink-0 md:w-auto md:shrink">
            <CardContent className="p-3 flex flex-col justify-between h-full min-h-[92px]">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider font-bold">Motor PTO</span>
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

    // Default / Diğer (Siber Taktik HUD fallback)
    return (
      <div className="flex flex-nowrap overflow-x-auto gap-3 pb-2 md:pb-0 print:hidden w-full max-w-full md:grid md:grid-cols-5 scrollbar-thin scrollbar-thumb-cyan-500/20" style={{ WebkitOverflowScrolling: "touch" }}>
        {/* Ekipman Sağlığı */}
        <Card className="bg-slate-955/45 backdrop-blur-md border border-cyan-500/20 hover:border-cyan-500/40 transition-all shadow-[0_0_15px_rgba(6,182,212,0.03)] w-[165px] shrink-0 md:w-auto md:shrink">
          <CardContent className="p-3 flex flex-col justify-between h-full min-h-[92px]">
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-cyan-400 drop-shadow-[0_0_4px_rgba(6,182,212,0.4)] shrink-0" />
              <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider font-bold">Ekipman Sağlığı</span>
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

        {/* Jeneratör */}
        <Card className="bg-slate-955/45 backdrop-blur-md border border-rose-500/20 hover:border-rose-500/40 transition-all shadow-[0_0_15px_rgba(244,63,94,0.03)] w-[165px] shrink-0 md:w-auto md:shrink">
          <CardContent className="p-3 flex flex-col justify-between h-full min-h-[92px]">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-rose-400 drop-shadow-[0_0_4px_rgba(244,63,94,0.4)] shrink-0" />
              <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider font-bold">Jeneratör</span>
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

        {/* Yakıt Durumu */}
        <Card className="bg-slate-955/45 backdrop-blur-md border border-emerald-500/20 hover:border-emerald-500/40 transition-all shadow-[0_0_15px_rgba(16,185,129,0.03)] w-[165px] shrink-0 md:w-auto md:shrink">
          <CardContent className="p-3 flex flex-col justify-between h-full min-h-[92px]">
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-emerald-400 drop-shadow-[0_0_4px_rgba(16,185,129,0.4)] shrink-0" />
              <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider font-bold">Yakıt Durumu</span>
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
        <Card className="bg-slate-955/45 backdrop-blur-md border border-slate-500/10 hover:border-slate-500/30 transition-all w-[165px] shrink-0 md:w-auto md:shrink">
          <CardContent className="p-3 flex flex-col justify-between h-full min-h-[92px]">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider font-bold">Odomotre</span>
            </div>
            <div className="mt-2 space-y-0.5">
              <span className="block text-[9px] text-slate-500 font-mono uppercase">Mevcut Kilometre</span>
              <span className="block text-sm font-bold font-mono text-slate-100">{kmStr}</span>
            </div>
          </CardContent>
        </Card>

        {/* Motor Saati */}
        <Card className="bg-slate-955/45 backdrop-blur-md border border-slate-500/10 hover:border-slate-500/30 transition-all w-[165px] shrink-0 md:w-auto md:shrink">
          <CardContent className="p-3 flex flex-col justify-between h-full min-h-[92px]">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider font-bold">Motor PTO</span>
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between space-y-4 sm:space-y-0 border-b border-border/50 pb-4 print:hidden">
        <div className="flex items-center space-x-4">
          <Link href="/araclar" className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-muted transition-colors sm:mr-2 shrink-0 min-h-[44px] min-w-[44px]">
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
          className="min-h-[44px] flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white font-bold rounded-lg hover:bg-primary/90 transition-colors shadow-md active:scale-95 shrink-0"
        >
          <Printer className="w-5 h-5" />
          <span>Toplu Etiket Yazdır</span>
        </button>
      </div>

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
            className="w-full bg-transparent border-0 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-0 h-11 min-h-[44px] font-mono tracking-wider"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="text-slate-400 hover:text-slate-200 p-1.5 rounded-full hover:bg-slate-800/50 min-h-[44px] min-w-[44px] flex items-center justify-center"
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
            suKapasite={vehicle.su_kapasite}
            kopukKapasite={vehicle.kopuk_kapasite}
          />
        </CardContent>
      </Card>

      {/* Siber Taktik Araç Yapılandırma HUD */}
      {!isEr && (
        <Card className="bg-slate-955/45 backdrop-blur-md border border-cyan-500/20 shadow-[0_0_20px_rgba(6,182,212,0.05)] overflow-hidden transition-all duration-300 print:hidden">
          <CardHeader className="pb-3 border-b border-border/50 bg-gradient-to-r from-cyan-500/[0.03] to-transparent flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2 font-mono text-cyan-400">
              <Wrench className="w-5 h-5 text-cyan-400 drop-shadow-[0_0_4px_rgba(6,182,212,0.4)] animate-pulse" />
              <span>🔧 SİBER TAKTİK ARAÇ YAPILANDIRMA HUD</span>
            </CardTitle>
            <button
              onClick={() => setIsConfigPanelOpen(!isConfigPanelOpen)}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center px-4 py-1.5 text-xs font-bold border border-cyan-500/30 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 font-mono transition-all uppercase tracking-wider self-end sm:self-auto"
            >
              {isConfigPanelOpen ? "PANELİ KAPAT" : "PANELİ AÇ"}
            </button>
          </CardHeader>
          
          {isConfigPanelOpen && (
            <CardContent className="pt-4 space-y-6 animate-in fade-in duration-200">
              {/* Tank Kapasiteleri */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-900/30 border border-slate-800/80 rounded-xl p-4">
                <div className="space-y-1">
                  <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider font-bold">Su Tankı Kapasitesi (Litre)</label>
                  <input
                    type="number"
                    className="w-full bg-slate-950 border border-cyan-500/25 rounded-lg px-3 py-2 text-sm font-mono text-slate-200 focus:outline-none focus:border-cyan-500/50"
                    value={tempSuKapasite}
                    onChange={(e) => setTempSuKapasite(parseInt(e.target.value) || 0)}
                    min="0"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider font-bold">Köpük Tankı Kapasitesi (Litre)</label>
                  <input
                    type="number"
                    className="w-full bg-slate-950 border border-cyan-500/25 rounded-lg px-3 py-2 text-sm font-mono text-slate-200 focus:outline-none focus:border-cyan-500/50"
                    value={tempKopukKapasite}
                    onChange={(e) => setTempKopukKapasite(parseInt(e.target.value) || 0)}
                    min="0"
                  />
                </div>
              </div>

              {/* Yeni Bölme Ekleme */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 space-y-3">
                <h3 className="text-xs font-bold font-mono text-cyan-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-cyan-400" />
                  Yeni Lojistik Bölme Entegrasyonu
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-mono text-slate-400 uppercase font-bold">Şablon Seçin</label>
                    <select
                      value={newCompPreset}
                      onChange={(e) => {
                        setNewCompPreset(e.target.value)
                        if (e.target.value !== "custom") {
                          setNewCompKey(e.target.value)
                        } else {
                          setNewCompKey("")
                        }
                      }}
                      className="w-full bg-slate-950 border border-cyan-500/25 rounded-lg px-3 py-2 text-xs font-mono text-slate-300 focus:outline-none focus:border-cyan-500/50"
                    >
                      <option value="custom">-- Özel İsim (Kendin Tanımla) --</option>
                      {Object.entries(COMPARTMENT_NAMES).map(([key, label]) => (
                        <option key={key} value={key}>{label} ({key})</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] font-mono text-slate-400 uppercase font-bold">Bölme İsmi / Kodu</label>
                    <input
                      type="text"
                      disabled={newCompPreset !== "custom"}
                      placeholder={newCompPreset !== "custom" ? "Seçilen şablon ismi kullanılacak" : "Örn: Ön Bagaj, Tavan Sepeti"}
                      value={newCompPreset !== "custom" ? getCompartmentLabel(newCompPreset) : newCompKey}
                      onChange={(e) => setNewCompKey(e.target.value)}
                      className="w-full bg-slate-950 border border-cyan-500/25 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 disabled:opacity-50 focus:outline-none focus:border-cyan-500/50"
                    />
                  </div>
                  <button
                    onClick={handleAddCompartment}
                    className="px-4 py-2 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/40 text-cyan-300 font-bold rounded-lg text-xs font-mono tracking-wider transition-all min-h-[44px] h-auto flex items-center justify-center gap-1.5 shadow-[0_0_12px_rgba(6,182,212,0.1)]"
                  >
                    <Plus className="w-4 h-4 text-cyan-400" />
                    BÖLME EKLE
                  </button>
                </div>
              </div>

              {/* Mevcut Bölmeler Tablosu */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold font-mono text-cyan-400 uppercase tracking-widest">
                  Mevcut Bölme Konfigürasyonu
                </h3>
                <div className="w-full overflow-x-auto border border-cyan-500/10 rounded-xl bg-slate-950/60 max-h-72 overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>
                  <table className="w-full text-left border-collapse text-xs font-mono">
                    <thead>
                      <tr className="bg-slate-900/80 border-b border-cyan-500/10 text-slate-400 font-bold">
                        <th className="p-3">Bölme / Kapak</th>
                        <th className="p-3">Ekipman</th>
                        <th className="p-3">İsim Değiştir (Siber Aktarım)</th>
                        <th className="p-3 text-right">İşlemler</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900">
                      {Object.keys(tempBolmeler).map((key) => {
                        const itemsCount = tempBolmeler[key]?.length || 0;
                        const renameVal = renameInputs[key] ?? getCompartmentLabel(key);
                        return (
                          <tr key={key} className="hover:bg-cyan-500/[0.02] transition-colors">
                            <td className="p-3 font-bold text-slate-200">
                              <span className="block text-[10px] text-slate-500">{key}</span>
                              <span>{getCompartmentLabel(key)}</span>
                            </td>
                            <td className="p-3">
                              <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] text-slate-400 font-bold">
                                {itemsCount} Parça
                              </span>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-1.5 max-w-[240px]">
                                <input
                                  type="text"
                                  value={renameVal}
                                  onChange={(e) => handleRenameChange(key, e.target.value)}
                                  className="bg-slate-900 border border-cyan-500/25 rounded-lg px-2.5 py-1 text-xs text-slate-300 w-full focus:outline-none focus:border-cyan-500/50 font-mono"
                                />
                                <button
                                  onClick={() => applyRename(key)}
                                  disabled={renameVal.trim() === getCompartmentLabel(key) || !renameVal.trim()}
                                  className="min-h-[44px] min-w-[44px] flex items-center justify-center px-3 py-1 bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 rounded-lg text-[10px] font-bold hover:bg-emerald-500/30 transition-colors disabled:opacity-30 shrink-0"
                                >
                                  Uygula
                                </button>
                              </div>
                            </td>
                            <td className="p-3 text-right">
                              <button
                                onClick={() => handleDeleteCompartment(key)}
                                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-2 bg-rose-500/10 hover:bg-rose-500/25 border border-rose-500/30 text-rose-400 rounded-lg hover:text-rose-300 transition-colors"
                                title="Bölmeyi Tamamen Sil"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {Object.keys(tempBolmeler).length === 0 && (
                        <tr>
                          <td colSpan={4} className="p-4 text-center text-slate-500 italic">
                            Hiç tanımlı bölme bulunmamaktadır.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Kaydetme Butonları */}
              <div className="flex items-center justify-end gap-3 border-t border-cyan-500/10 pt-4">
                <button
                  onClick={() => {
                    if (window.confirm("Yaptığınız tüm değişiklikler sıfırlanacaktır. Emin misiniz?")) {
                      setTempSuKapasite(vehicle.su_kapasite || 0)
                      setTempKopukKapasite(vehicle.kopuk_kapasite || 0)
                      setTempBolmeler(JSON.parse(JSON.stringify(vehicle.bolmeler || {})))
                      setIsConfigPanelOpen(false)
                    }
                  }}
                  className="min-h-[44px] flex items-center justify-center px-4 py-2 border border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-slate-400 font-bold rounded-lg text-xs font-mono tracking-wider transition-all"
                >
                  İPTAL ET / SIFIRLA
                </button>
                <button
                  onClick={handleSaveConfig}
                  disabled={savingConfig}
                  className="min-h-[44px] flex items-center justify-center px-5 py-2 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-slate-100 font-bold rounded-lg text-xs font-mono tracking-wider transition-all shadow-[0_0_15px_rgba(6,182,212,0.3)] disabled:opacity-50 gap-2"
                >
                  {savingConfig ? (
                    <>
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      MÜHÜRLENİYOR...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4 text-cyan-200" />
                      YAPILANDIRMAYI MÜHÜRLE
                    </>
                  )}
                </button>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      <div className="flex flex-col md:grid md:grid-cols-3 gap-6 relative">
        {/* Bölme Listesi */}
        <Card className="md:col-span-1 h-fit md:sticky md:top-4">
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
          <CardContent className="p-0 max-h-[350px] md:max-h-[600px] overflow-y-auto scrollbar-thin scrollbar-thumb-cyan-500/20" style={{ WebkitOverflowScrolling: "touch" }}>
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
                       "flex items-center justify-between px-5 py-3 border-b border-border/30 last:border-0 hover:bg-muted/50 transition-colors text-left w-full min-h-[44px]",
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
        <div className="md:col-span-2 space-y-4">
          <Card className="shadow-sm">
             <CardHeader className="pb-3 border-b border-border/50 bg-slate-950/95 backdrop-blur-md sticky top-0 z-40 shadow-[0_4px_12px_rgba(0,0,0,0.4)]">
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
                            className="min-h-[44px] flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-cyan-500/15 text-cyan-300 border border-cyan-500/50 shadow-[0_0_12px_rgba(6,182,212,0.3)] hover:shadow-[0_0_20px_rgba(6,182,212,0.6)] hover:bg-cyan-500/30 hover:text-cyan-200 transition-all font-mono uppercase tracking-wider"
                          >
                            <Plus className="w-3.5 h-3.5 text-cyan-400 drop-shadow-[0_0_3px_rgba(6,182,212,0.6)]" />
                            Yeni Ekipman
                          </button>
                          <button
                            onClick={() => setIsEditingList(!isEditingList)}
                            className={cn(
                              "min-h-[44px] flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all font-mono uppercase tracking-wider border shadow-md",
                              isEditingList
                                ? "bg-amber-500/25 text-amber-300 border-amber-500/60 shadow-[0_0_12px_rgba(245,158,11,0.4)] hover:shadow-[0_0_20px_rgba(245,158,11,0.7)] hover:bg-amber-500/35 hover:text-amber-200"
                                : "bg-slate-900/60 text-slate-300 border-slate-700 hover:bg-slate-800 hover:border-slate-600 shadow-[0_0_8px_rgba(0,0,0,0.3)]"
                            )}
                          >
                            <Wrench className={cn("w-3.5 h-3.5", isEditingList ? "text-amber-400 drop-shadow-[0_0_3px_rgba(245,158,11,0.6)]" : "text-slate-400")} />
                            {isEditingList ? "Kapat" : "Düzenle"}
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => setShowTimeline(!showTimeline)}
                        className={cn(
                          "min-h-[44px] flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors",
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
