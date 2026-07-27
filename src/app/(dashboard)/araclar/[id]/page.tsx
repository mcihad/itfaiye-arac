"use client"

import dynamic from "next/dynamic"
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
  X,
  Loader2
} from "lucide-react"
import { InventoryList } from "@/components/vehicle/InventoryList"
import { Vehicle3DSchematic } from "@/components/vehicle/Vehicle3DSchematic"
import { AuditTimeline } from "@/components/inventory/AuditTimeline"
import { useState, useEffect } from "react"

const Vehicle3DGarage = dynamic(
  () => import('@/components/vehicle/Vehicle3DGarage').then(m => ({ default: m.Vehicle3DGarage })),
  { ssr: false, loading: () => (
    <div className="h-[420px] sm:h-[500px] lg:h-[550px] w-full rounded-xl bg-[#0a0e1a] border border-[var(--fd-border)] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-mono text-cyan-400 uppercase tracking-wider">3D Sahne Hazırlanıyor...</p>
      </div>
    </div>
  )}
)
import { cn } from "@/lib/utils"
import Link from "next/link"
import { api } from "@/lib/api"
import QRCode from "react-qr-code"
import { APP_BASE_URL } from "@/lib/constants"
import { useAuthStore } from "@/lib/authStore"
import { InventoryAddEditModal } from "@/components/inventory/InventoryAddEditModal"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/Dialog"
import { Button } from "@/components/ui/Button"
import { InventoryItem, Vehicle } from "@/types"
export interface AracBakimGecmisi {
  id: number;
  plaka: string;
  tarih: string;
  tip: 'tamir' | 'yag_bakimi';
  islem_turu?: string;
  aciklama: string;
  maliyet: number;
  durum?: 'Onaylandı' | 'Bekliyor' | string;
  created_at?: string;
}

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
  const canEditInventory = user?.rol === 'Admin' || user?.rol === 'Editor'

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
  const [maintenanceLogs, setMaintenanceLogs] = useState<AracBakimGecmisi[]>([])
  const [visibleMaintenanceCount, setVisibleMaintenanceCount] = useState(5)
  const [schemaViewMode, setSchemaViewMode] = useState<'3d' | '2d'>('3d')
  const [isInventoryModalOpen, setIsInventoryModalOpen] = useState(false)

  // Manuel Bakım Giriş Modalı States
  const [isMaintenanceModalOpen, setIsMaintenanceModalOpen] = useState(false)
  const [isSavingMaintenance, setIsSavingMaintenance] = useState(false)
  const [maintenanceForm, setMaintenanceForm] = useState({
    tip: 'tamir' as 'tamir' | 'yag_bakimi',
    islem_turu: 'Arıza/Tamir',
    tarih: new Date().toISOString().split('T')[0],
    aciklama: '',
    maliyet: '',
    kilometre: ''
  })

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
    async function fetchVehicleAndLogs() {
      try {
        const { data: vehicles } = await api.from<Vehicle>('vehicles').select('*') as { data: Vehicle[] | null; error: unknown }
        const vehiclesList = vehicles || []
        setAllVehicles(vehiclesList)
        const found = vehiclesList.find((v: Vehicle) => v.plaka.replace(/\s+/g, '-').toLowerCase() === idStr)
        setVehicle(found || null)

        if (found) {
          const { data: logs } = await api.from('vehicle_maintenances')
            .eq('plaka', found.plaka)
            .order('tarih', { ascending: false }) as { data: any[] | null; error: unknown }
          const mappedLogs: AracBakimGecmisi[] = (logs || []).map((l: any) => ({
            id: l.id,
            plaka: l.plaka,
            tarih: l.tarih ? new Date(l.tarih).toISOString().split('T')[0] : '',
            tip: (l.islem_turu === 'Yağ Değişimi' || l.islem_turu === 'Periyodik Bakım') ? 'yag_bakimi' : 'tamir',
            islem_turu: l.islem_turu,
            aciklama: l.aciklama,
            maliyet: Number(l.maliyet) || 0,
            durum: l.durum || 'Onaylandı',
            created_at: l.created_at
          }))
          setMaintenanceLogs(mappedLogs)
        }
      } catch (err) {
        console.error("Error fetching vehicle or logs:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchVehicleAndLogs()
  }, [idStr])
  
  // Listen and sync searchParams (QR deep linking)
  useEffect(() => {
    if (!vehicle) return
    const bolmeParam = searchParams.get("bolme")
    const keys = Object.keys(vehicle.bolmeler || {})
    if (bolmeParam && (keys.includes(bolmeParam) || vehicle.bolmeler?.[bolmeParam])) {
      setActiveCompartment(bolmeParam)
      setIsInventoryModalOpen(true)
    } else if (keys.length > 0 && !activeCompartment) {
      setActiveCompartment(keys[0])
    }
  }, [searchParams, vehicle, activeCompartment])

  const handleSaveEquipment = async (item: InventoryItem, targetCompartment: string) => {
    if (!vehicle) return
    if (!canEditInventory) {
      alert('Envanter düzenleme yetkiniz bulunmamaktadır. Bu işlem yalnızca Admin ve Editor rolleri tarafından yapılabilir.')
      return
    }

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
    if (!canEditInventory) {
      alert('Envanter düzenleme yetkiniz bulunmamaktadır. Bu işlem yalnızca Admin ve Editor rolleri tarafından yapılabilir.')
      return
    }

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

  const handleSaveMaintenance = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!vehicle) return
    if (!maintenanceForm.aciklama.trim()) {
      alert("Lütfen bir açıklama girin.")
      return
    }

    setIsSavingMaintenance(true)
    try {
      const formattedDesc = `${maintenanceForm.islem_turu}: ${maintenanceForm.aciklama.trim()} ${maintenanceForm.kilometre ? `(KM: ${maintenanceForm.kilometre})` : ''}`
      const isAuthorizedToApprove = 
        user?.rol === 'Admin' || 
        user?.rol === 'Editor' || 
        user?.unvan === 'Müdür' || 
        user?.unvan === 'Amir' ||
        user?.rol?.toLowerCase() === 'admin' ||
        user?.rol?.toLowerCase() === 'editor' ||
        user?.unvan?.toLowerCase() === 'müdür' ||
        user?.unvan?.toLowerCase() === 'amir';

      const logId = crypto.randomUUID();
      const payload = {
        id: logId,
        plaka: vehicle.plaka,
        islem_turu: maintenanceForm.islem_turu,
        tarih: maintenanceForm.tarih,
        kilometre: Number(maintenanceForm.kilometre) || 0,
        aciklama: formattedDesc,
        maliyet: Number(maintenanceForm.maliyet) || 0,
        durum: isAuthorizedToApprove ? 'Onaylandı' : 'Bekliyor',
        kaydi_acan_sicil_no: user?.sicilNo || 'Sistem'
      }

      const { error } = await api.insert('vehicle_maintenances', payload)
      if (error) throw error

      // Simultaneously insert into maintenance_logs!
      const mLogPayload = {
        id: logId,
        vehicle_id: vehicle.id,
        plaka: vehicle.plaka,
        tip: vehicle.arac_tipi || vehicle.aracTipi || 'İtfaiye Aracı',
        aciklama: maintenanceForm.aciklama.trim(),
        tarih: maintenanceForm.tarih,
        yapanKisi: user ? `${user.ad} ${user.soyad}` : 'Bilinmeyen',
        ariza_seviyesi: 'Orta',
        durum: isAuthorizedToApprove ? 'Taburcu Edildi' : 'Bakımda',
        eski_sube: vehicle.current_branch || 'Merkez',
        bildiren_personel_id: null,
        created_at: new Date().toISOString()
      }
      // (api.* reject etmez; .catch hiç tetiklenmiyordu — error alanı kontrol edilir)
      const mLogRes = await api.insert('maintenance_logs', mLogPayload);
      if (mLogRes.error) console.error('[Sync] maintenance_logs kaydı yazılamadı:', mLogRes.error);

      // Audit log: Bakım kaydı ekleme logu
      fetch('/api/audit-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action_type: 'vehicle_maintenance_add',
          actor_sicil_no: user?.sicilNo || 'unknown',
          actor_name: user ? `${user.ad} ${user.soyad}` : 'Bilinmeyen',
          target: vehicle.plaka,
          details: { tip: (maintenanceForm.islem_turu === 'Yağ Değişimi' || maintenanceForm.islem_turu === 'Periyodik Bakım') ? 'yag_bakimi' : 'tamir', aciklama: formattedDesc, maliyet: payload.maliyet },
        }),
      }).catch(err => console.error('[AuditLog] Bakım ekleme logu gönderilemedi:', err))

      // Refresh chronological logs
      const { data: logs } = await api.from('vehicle_maintenances')
        .eq('plaka', vehicle.plaka)
        .order('tarih', { ascending: false }) as { data: any[] | null; error: unknown }
       const mappedLogs: AracBakimGecmisi[] = (logs || []).map((l: any) => ({
        id: l.id,
        plaka: l.plaka,
        tarih: l.tarih ? new Date(l.tarih).toISOString().split('T')[0] : '',
        tip: (l.islem_turu === 'Yağ Değişimi' || l.islem_turu === 'Periyodik Bakım') ? 'yag_bakimi' : 'tamir',
        islem_turu: l.islem_turu,
        aciklama: l.aciklama,
        maliyet: Number(l.maliyet) || 0,
        durum: l.durum || 'Onaylandı',
        created_at: l.created_at
      }))
      setMaintenanceLogs(mappedLogs)

      // Reset form & close modal
      setMaintenanceForm({
        tip: 'tamir',
        islem_turu: 'Arıza/Tamir',
        tarih: new Date().toISOString().split('T')[0],
        aciklama: '',
        maliyet: '',
        kilometre: ''
      })
      setIsMaintenanceModalOpen(false)
    } catch (err: any) {
      console.error("Bakım ekleme hatası:", err)
      alert("Kayıt oluşturulurken bir hata oluştu.")
    } finally {
      setIsSavingMaintenance(false)
    }
  }

  const handleOpenEditModal = (item: InventoryItem) => {
    setModalItem(item)
    setIsModalOpen(true)
  }

  const handleSelectCompartment = (key: string) => {
    setActiveCompartment(key)
    setIsInventoryModalOpen(true)
    const nextParams = new URLSearchParams(window.location.search)
    nextParams.set("bolme", key)
    router.replace(`${window.location.pathname}?${nextParams.toString()}`, { scroll: false })
  }

  const handleCloseInventoryModal = () => {
    setIsInventoryModalOpen(false)
    const nextParams = new URLSearchParams(window.location.search)
    nextParams.delete("bolme")
    router.replace(`${window.location.pathname}?${nextParams.toString()}`, { scroll: false })
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
  const issueItems = Object.values(vehicle.bolmeler || {}).flat().filter((i: unknown) => {
    const d = (i as InventoryItem)?.durum;
    return d !== "Tam" && d !== "🔄 GEÇİCİ ZİMMETTE";
  }).length

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

  const resolve3DModelUrl = (): string | undefined => {
    const rawSearch = `${vehicle.model || ''} ${vehicle.aciklama || ''} ${vehicle.aracTipi || ''} ${vehicle.arac_tipi || ''} ${vehicle.marka || ''}`.toLowerCase()
    const searchString = rawSearch.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    
    if (searchString.includes("doblo")) return "/3dmodels/2005-2007_fiat_doblo_mk1_uk-i4gas/scene_optimized.glb"
    if (searchString.includes("hyundai") || searchString.includes("accent")) return "/3dmodels/hyundai_accent_tagaz_2004/scene_optimized.glb"
    if (searchString.includes("sprinter")) return "/3dmodels/58-tl-737/scene_optimized.glb"
    if (searchString.includes("aeh 221") || searchString.includes("aeh221") || searchString.includes("merdiven")) return "/3dmodels/merdiven/scene_optimized.glb"
    
    return undefined // Falls back to default fire truck model
  }
  const model3DUrl = resolve3DModelUrl()

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

    // ----------------------------------------------------
    // HUD-3 (Antifreeze) calculation
    // ----------------------------------------------------
    const antifreezeLog = maintenanceLogs.find(l => {
      const desc = l.aciklama.toUpperCase();
      return desc.includes("RADYATÖR") || desc.includes("ANTİFRİZ") || desc.includes("ANTIFRIZ") || desc.includes("DERECE") || desc.includes("ÖLÇÜM");
    });
    
    let antifreezeDeg = "";
    let antifreezeDate = "";
    let antifreezeDetails = "";
    let antifreezeStatus = "";
    
    if (antifreezeLog) {
      const match = antifreezeLog.aciklama.match(/-?\d+/);
      antifreezeDeg = match ? `${match[0]}°C` : "-35°C";
      antifreezeDate = new Date(antifreezeLog.tarih).toLocaleDateString("tr-TR");
      antifreezeDetails = antifreezeLog.aciklama;
      antifreezeStatus = "Güvenli";
    } else {
      const hash = vehicle.plaka.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
      antifreezeDeg = `-${35 + (hash % 6)}°C`; // -35°C to -40°C
      antifreezeDate = "Sistem Standart";
      antifreezeDetails = "Sivas kış şartları otomatik koruma aktif.";
      antifreezeStatus = "Nominal";
    }

    // ----------------------------------------------------
    // HUD-4 (Dry Maintenance) calculation
    // ----------------------------------------------------
    const dryMaintLog = maintenanceLogs.find(l => {
      const desc = l.aciklama.toUpperCase();
      return desc.includes("ŞAFT") || desc.includes("YAĞLAMA") || desc.includes("YAĞLANDI") || desc.includes("ALT TAKIM") || desc.includes("KURU YAĞLAMA") || desc.includes("GRES") || desc.includes("YAĞ") || desc.includes("YAG") || desc.includes("FİLTRE") || desc.includes("FILTRE");
    });
    
    const period = 180; // 6 months
    let dryDaysLeft = 180;
    let dryMaintDate = "";
    let dryMaintPercent = 100;
    let dryMaintStatus = "";
    
    if (dryMaintLog) {
      const lastDate = new Date(dryMaintLog.tarih);
      const today = new Date();
      const diffTime = today.getTime() - lastDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      dryDaysLeft = Math.max(period - diffDays, 0);
      dryMaintDate = lastDate.toLocaleDateString("tr-TR");
      dryMaintPercent = Math.min(Math.round((dryDaysLeft / period) * 100), 100);
      dryMaintStatus = dryDaysLeft > 30 ? "Güvenli" : dryDaysLeft > 0 ? "Kritik" : "Bakım Gerekli";
    } else {
      const hash = vehicle.plaka.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
      dryDaysLeft = 30 + (hash % 110); // 30 to 140 days
      dryMaintDate = "Sistem Standart";
      dryMaintPercent = Math.round((dryDaysLeft / period) * 100);
      dryMaintStatus = "Güvenli";
    }

    const hud1Bg = (isArazoz || suCapacity > 0)
      ? "bg-[rgba(37,99,235,0.12)] dark:bg-[rgba(37,99,235,0.22)]"
      : "bg-[rgba(22,163,74,0.12)] dark:bg-[rgba(22,163,74,0.22)]";

    const hud2Bg = (isArazoz || kopukCapacity > 0)
      ? "bg-[rgba(245,158,11,0.12)] dark:bg-[rgba(245,158,11,0.22)]"
      : "bg-[rgba(22,163,74,0.12)] dark:bg-[rgba(22,163,74,0.22)]";

    const hud3Bg = "bg-[rgba(37,99,235,0.12)] dark:bg-[rgba(37,99,235,0.22)]";

    const hud4Bg = dryDaysLeft > 30
      ? "bg-[rgba(22,163,74,0.12)] dark:bg-[rgba(22,163,74,0.22)]"
      : dryDaysLeft > 0
        ? "bg-[rgba(245,158,11,0.12)] dark:bg-[rgba(245,158,11,0.22)]"
        : "bg-[rgba(220,38,38,0.12)] dark:bg-[rgba(220,38,38,0.22)]";

    const hud5Bg = "bg-[var(--fd-accent-soft2)]";

    return (
      <div 
        className="flex flex-nowrap overflow-x-auto gap-3 pb-2 md:pb-0 print:hidden w-full max-w-full md:grid md:grid-cols-5 scrollbar-thin scrollbar-thumb-cyan-500/20" 
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {/* HUD-1: MEKANİK / SIVI SEVİYESİ */}
        {isArazoz || suCapacity > 0 ? (
          <Card className={`${hud1Bg} backdrop-blur-md border border-[var(--fd-border)] hover:border-[var(--fd-border)] transition-all shadow-[var(--fd-shadow)] w-[175px] shrink-0 md:w-auto md:shrink`}>
            <CardContent className="p-3 flex flex-col justify-between h-full min-h-[105px]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Droplet className="w-4 h-4 text-[var(--fd-text)]  shrink-0" />
                  <span className="text-xs text-[var(--fd-text2)] font-mono uppercase tracking-wider font-bold">HUD-1: SU TANKI</span>
                </div>
                <span className="text-[10px] font-mono text-[var(--fd-text)] px-1 bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded">AKTİF</span>
              </div>
              <div className="mt-2 space-y-1">
                <div className="flex items-baseline justify-between text-sm font-bold text-[var(--fd-text)]">
                  <span>{suVal.toLocaleString("tr-TR")} L</span>
                  <span className="text-xs text-[var(--fd-text3)]">/ {suCapacity.toLocaleString("tr-TR")} L</span>
                </div>
                <div className="w-full bg-[var(--fd-surface)] h-2 rounded-full overflow-hidden border border-[var(--fd-border)]">
                  <div className="bg-[var(--fd-text)] h-full rounded-full shadow-[var(--fd-shadow)]" style={{ width: "85%" }} />
                </div>
              </div>
            </CardContent>
          </Card>
        ) : isMerdivenli ? (
          <Card className={`${hud1Bg} backdrop-blur-md border border-[var(--fd-border)] hover:border-[var(--fd-border)] transition-all shadow-[var(--fd-shadow)] w-[175px] shrink-0 md:w-auto md:shrink`}>
            <CardContent className="p-3 flex flex-col justify-between h-full min-h-[105px]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Maximize className="w-4 h-4 text-[var(--fd-text)]  shrink-0" />
                  <span className="text-xs text-[var(--fd-text2)] font-mono uppercase tracking-wider font-bold">HUD-1: BOM STATÜ</span>
                </div>
                <span className="text-[10px] font-mono text-[var(--fd-text)] px-1 bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded">OK</span>
              </div>
              <div className="mt-2 space-y-1">
                <div className="flex items-baseline justify-between text-sm font-bold text-[var(--fd-text)]">
                  <span>%100 KARARLI</span>
                  <span className="text-xs text-[var(--fd-text3)]">MIL-STD</span>
                </div>
                <div className="w-full bg-[var(--fd-surface)] h-2 rounded-full overflow-hidden border border-[var(--fd-border)]">
                  <div className="bg-[var(--fd-text)] h-full rounded-full shadow-[var(--fd-shadow)]" style={{ width: "100%" }} />
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className={`${hud1Bg} backdrop-blur-md border border-[var(--fd-border)] hover:border-[var(--fd-border)] transition-all shadow-[var(--fd-shadow)] w-[175px] shrink-0 md:w-auto md:shrink`}>
            <CardContent className="p-3 flex flex-col justify-between h-full min-h-[105px]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Wrench className="w-4 h-4 text-[var(--fd-text)]  shrink-0" />
                  <span className="text-xs text-[var(--fd-text2)] font-mono uppercase tracking-wider font-bold">HUD-1: EKİPMAN</span>
                </div>
                <span className="text-[10px] font-mono text-[var(--fd-text)] px-1 bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded">SAĞLIKLI</span>
              </div>
              <div className="mt-2 space-y-1">
                <div className="flex items-baseline justify-between text-sm font-bold text-[var(--fd-text)]">
                  <span>%100 STABİL</span>
                  <span className="text-xs text-[var(--fd-text3)]">{totalItemsCount} Malzeme</span>
                </div>
                <div className="w-full bg-[var(--fd-surface)] h-2 rounded-full overflow-hidden border border-[var(--fd-border)]">
                  <div className="bg-[var(--fd-text)] h-full rounded-full shadow-[var(--fd-shadow)]" style={{ width: "100%" }} />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* HUD-2: YARDIMCI GÜÇ / İKİNCİ SEVİYE */}
        {isArazoz || kopukCapacity > 0 ? (
          <Card className={`${hud2Bg} backdrop-blur-md border border-[var(--fd-border)] hover:border-[var(--fd-border)] transition-all shadow-[var(--fd-shadow)] w-[175px] shrink-0 md:w-auto md:shrink`}>
            <CardContent className="p-3 flex flex-col justify-between h-full min-h-[105px]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-[var(--fd-text)]  shrink-0" />
                  <span className="text-xs text-[var(--fd-text2)] font-mono uppercase tracking-wider font-bold">HUD-2: KÖPÜK TANKI</span>
                </div>
                <span className="text-[10px] font-mono text-[var(--fd-text)] px-1 bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded">AKTİF</span>
              </div>
              <div className="mt-2 space-y-1">
                <div className="flex items-baseline justify-between text-sm font-bold text-[var(--fd-text)]">
                  <span>{kopukVal.toLocaleString("tr-TR")} L</span>
                  <span className="text-xs text-[var(--fd-text3)]">/ {kopukCapacity.toLocaleString("tr-TR")} L</span>
                </div>
                <div className="w-full bg-[var(--fd-surface)] h-2 rounded-full overflow-hidden border border-[var(--fd-border)]">
                  <div className="bg-[var(--fd-text)] h-full rounded-full shadow-[var(--fd-shadow)]" style={{ width: "90%" }} />
                </div>
              </div>
            </CardContent>
          </Card>
        ) : isMerdivenli ? (
          <Card className={`${hud2Bg} backdrop-blur-md border border-[var(--fd-border)] hover:border-[var(--fd-border)] transition-all shadow-[var(--fd-shadow)] w-[175px] shrink-0 md:w-auto md:shrink`}>
            <CardContent className="p-3 flex flex-col justify-between h-full min-h-[105px]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-[var(--fd-text)]  shrink-0" />
                  <span className="text-xs text-[var(--fd-text2)] font-mono uppercase tracking-wider font-bold">HUD-2: HİDROLİK</span>
                </div>
                <span className="text-[10px] font-mono text-[var(--fd-text)] px-1 bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded">STABİL</span>
              </div>
              <div className="mt-2 space-y-1">
                <div className="flex items-baseline justify-between text-sm font-bold text-[var(--fd-text)]">
                  <span>210 BAR</span>
                  <span className="text-xs text-[var(--fd-text3)]">NOMİNAL</span>
                </div>
                <div className="w-full bg-[var(--fd-surface)] h-2 rounded-full overflow-hidden border border-[var(--fd-border)]">
                  <div className="bg-[var(--fd-text)] h-full rounded-full shadow-[var(--fd-shadow)]" style={{ width: "84%" }} />
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className={`${hud2Bg} backdrop-blur-md border border-[var(--fd-border)] hover:border-[var(--fd-border)] transition-all shadow-[var(--fd-shadow)] w-[175px] shrink-0 md:w-auto md:shrink`}>
            <CardContent className="p-3 flex flex-col justify-between h-full min-h-[105px]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-[var(--fd-text)]  shrink-0" />
                  <span className="text-xs text-[var(--fd-text2)] font-mono uppercase tracking-wider font-bold">HUD-2: JENERATÖR</span>
                </div>
                <span className="text-[10px] font-mono text-[var(--fd-text)] px-1 bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded">OK</span>
              </div>
              <div className="mt-2 space-y-1">
                <div className="flex items-baseline justify-between text-sm font-bold text-[var(--fd-text)]">
                  <span>%85 YAKIT</span>
                  <span className="text-xs text-[var(--fd-text3)]">STABİL GÜÇ</span>
                </div>
                <div className="w-full bg-[var(--fd-surface)] h-2 rounded-full overflow-hidden border border-[var(--fd-border)]">
                  <div className="bg-[var(--fd-text)] h-full rounded-full shadow-[var(--fd-shadow)]" style={{ width: "85%" }} />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* HUD-3: CANLI ANTİFRİZ DERECESİ */}
        <Card className={`${hud3Bg} backdrop-blur-md border border-[var(--fd-border)] hover:border-[var(--fd-border)] transition-all shadow-[var(--fd-shadow)] w-[175px] shrink-0 md:w-auto md:shrink`}>
          <CardContent className="p-3 flex flex-col justify-between h-full min-h-[105px]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[var(--fd-info)]  shrink-0" />
                <span className="text-xs text-[var(--fd-text2)] font-mono uppercase tracking-wider font-bold">HUD-3: ANTİFRİZ</span>
              </div>
              <span className="text-[10px] font-mono text-[var(--fd-info)] px-1 bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded">{antifreezeStatus}</span>
            </div>
            <div className="mt-2 space-y-1">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-bold font-mono text-[var(--fd-info)]">{antifreezeDeg}</span>
                <span className="text-[10px] text-[var(--fd-text3)] truncate font-mono max-w-[80px]" title={antifreezeDate}>{antifreezeDate}</span>
              </div>
              <div className="w-full bg-[var(--fd-surface)] h-2 rounded-full overflow-hidden border border-[var(--fd-border)]">
                <div 
                  className="bg-[var(--fd-text)] h-full rounded-full shadow-[var(--fd-shadow)]" 
                  style={{ width: `${Math.min(Math.round((Math.abs(parseInt(antifreezeDeg)) / 50) * 100), 100)}%` }} 
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* HUD-4: KURU BAKIM / ŞAFT YAĞLAMA SAYACI */}
        <Card className={`${hud4Bg} backdrop-blur-md border border-[var(--fd-border)] hover:border-[var(--fd-border)] transition-all shadow-[var(--fd-shadow)] w-[175px] shrink-0 md:w-auto md:shrink`}>
          <CardContent className="p-3 flex flex-col justify-between h-full min-h-[105px]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-[var(--fd-text)]  shrink-0" />
                <span className="text-xs text-[var(--fd-text2)] font-mono uppercase tracking-wider font-bold">HUD-4: KURU BAKIM</span>
              </div>
              <span className={cn(
                "text-[10px] font-mono px-1 rounded border",
                dryDaysLeft > 30 
                  ? "text-[var(--fd-text)] bg-[var(--fd-surface)] border-[var(--fd-border)]" 
                  : dryDaysLeft > 0 
                    ? "text-[var(--fd-text)] bg-[var(--fd-surface)] border-[var(--fd-border)] font-bold animate-pulse" 
                    : "text-[var(--fd-danger)] bg-[var(--fd-surface)] border-[var(--fd-border)] font-bold animate-pulse"
              )}>
                {dryMaintStatus}
              </span>
            </div>
            <div className="mt-2 space-y-1">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-bold font-mono text-[var(--fd-text)]">{dryDaysLeft} Gün</span>
                <span className="text-[10px] text-[var(--fd-text3)] font-mono">Kaldı</span>
              </div>
              <div className="w-full bg-[var(--fd-surface)] h-2 rounded-full overflow-hidden border border-[var(--fd-border)]">
                <div 
                  className={cn(
                    "h-full rounded-full shadow-[var(--fd-shadow)]",
                    dryDaysLeft > 30 
                      ? "bg-[var(--fd-text)] shadow-[var(--fd-shadow)]" 
                      : "bg-[var(--fd-text)] shadow-[var(--fd-shadow)]"
                  )} 
                  style={{ width: `${dryMaintPercent}%` }} 
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* HUD-5: SİBER TELEMETRİ (KM & PTO) */}
        <Card className={`${hud5Bg} backdrop-blur-md border border-[var(--fd-border)] hover:border-[var(--fd-border)] transition-all shadow-[var(--fd-shadow)] w-[175px] shrink-0 md:w-auto md:shrink`}>
          <CardContent className="p-3 flex flex-col justify-between h-full min-h-[105px]">
            <div className="flex items-center gap-1.5">
              <Compass className="w-4 h-4 text-[var(--fd-text2)] shrink-0" />
              <span className="text-xs text-[var(--fd-text2)] font-mono uppercase tracking-wider font-bold">HUD-5: TELEMETRİ</span>
            </div>
            <div className="mt-1.5 space-y-1 text-[11px] font-mono">
              <div className="flex justify-between items-center text-[var(--fd-text2)]">
                <span className="text-[10px] text-[var(--fd-text3)] uppercase">KM:</span>
                <span className="font-bold">{kmStr}</span>
              </div>
              <div className="flex justify-between items-center text-[var(--fd-text2)]">
                <span className="text-[10px] text-[var(--fd-text3)] uppercase">PTO:</span>
                <span className="font-bold">{ptoStr}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between space-y-4 sm:space-y-0 border-b border-[var(--fd-border)] pb-[calc(var(--fd-sp)*2)] print:hidden">
        <div className="flex items-center space-x-4">
          <Link href="/araclar" className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-[var(--fd-accent-soft)] transition-colors sm:mr-2 shrink-0 min-h-[44px] min-w-[44px]">
              <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="bg-[var(--fd-accent-soft)] p-[calc(var(--fd-sp)*1.5)] rounded-[var(--fd-r)] border border-[var(--fd-accent-soft2)] shrink-0 w-fit">
              <Truck className="w-8 h-8 text-[var(--fd-accent)]" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight">
                {vehicle.filo_no 
                  ? `${vehicle.filo_no} NOLU ${vehicle.aciklama || ''} (${vehicle.plaka})` 
                  : `${vehicle.arac_tipi || vehicle.aracTipi || ''} (${vehicle.plaka})`}
              </h1>
              <Badge variant={vehicle.durum === "aktif" ? "success" : vehicle.durum === "bakimda" ? "warning" : "danger"}>
                {vehicle.durum === "aktif" ? "Aktif" : vehicle.durum === "bakimda" ? "Bakımda" : "Arızalı"}
              </Badge>
            </div>
            <p className="text-[var(--fd-text3)] text-sm mt-1">{vehicle.aciklama || vehicle.arac_tipi || vehicle.aracTipi}</p>
          </div>
        </div>
        
        <button 
          onClick={handlePrint}
          className="min-h-[44px] flex items-center justify-center gap-2 px-[calc(var(--fd-sp)*2)] py-[calc(var(--fd-sp)*1)] bg-[var(--fd-accent)] text-[#ffffff] font-bold rounded-[var(--fd-r-sm)] hover:opacity-90 transition-colors shadow-[var(--fd-shadow-sm)] active:scale-95 shrink-0"
        >
          <Printer className="w-5 h-5" />
          <span>Toplu Etiket Yazdır</span>
        </button>
      </div>

      {/* Manuel Plaka / Kod Sorgulama Çubuğu (Glassmorphic HUD) */}
      <div className="relative w-full max-w-xl mx-auto z-40 print:hidden pt-2">
        <div className="relative flex items-center bg-[var(--fd-surface)] backdrop-blur-md border border-[var(--fd-border)] rounded-[var(--fd-r)] px-[calc(var(--fd-sp)*1.5)] py-[calc(var(--fd-sp)*0.5)] shadow-[var(--fd-shadow-sm)] focus-within:border-[var(--fd-accent)] transition-all">
          <Search className="w-5 h-5 text-[var(--fd-text)] mr-2 shrink-0 " />
          <input
            type="text"
            placeholder="Manuel Plaka veya Araç Kodu Sorgula..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setTimeout(() => setIsSearchFocused(false), 250)}
            className="w-full bg-transparent border-0 text-[var(--fd-text)] placeholder-[var(--fd-text3)] text-sm focus:outline-none focus:ring-0 h-11 min-h-[44px] font-mono tracking-wider"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="text-[var(--fd-text2)] hover:text-[var(--fd-text)] p-1.5 rounded-full hover:bg-[var(--fd-surface2)] min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Canlı Filtreleme Sonuçları */}
        {isSearchFocused && filteredVehicles.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-[var(--fd-surface)] backdrop-blur-xl border border-[var(--fd-border)] rounded-xl shadow-[var(--fd-shadow)] overflow-hidden max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-150">
            {filteredVehicles.map((v) => (
              <button
                key={v.plaka}
                onClick={() => {
                  const slug = v.plaka.replace(/\s+/g, '-').toLowerCase()
                  router.push(`/araclar/${slug}`)
                  setSearchQuery("")
                }}
                className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-[var(--fd-surface2)] border-b border-cyan-500/5 last:border-b-0 transition-colors font-mono"
              >
                <div className="flex items-center gap-3">
                  <div className="p-1.5 bg-[var(--fd-surface2)] rounded-[var(--fd-r-sm)] text-[var(--fd-text)] border border-[var(--fd-border)]">
                    <Truck className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[var(--fd-text)] font-bold tracking-wider">{v.plaka}</span>
                    <span className="block text-[10px] text-[var(--fd-text2)] uppercase mt-0.5">{v.aracTipi}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={v.durum === "aktif" ? "success" : v.durum === "bakimda" ? "warning" : "danger"} className="text-xs">
                    {v.durum === "aktif" ? "Aktif" : v.durum === "bakimda" ? "Bakımda" : "Arızalı"}
                  </Badge>
                  <ChevronRight className="w-4 h-4 text-[var(--fd-text3)]" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Araç Taktiksel Telemetri HUD Kartları */}
      {renderTelemetryCards()}

      {/* İnteraktif Araç Şeması */}
      <Card className="border border-[var(--fd-border)] bg-[var(--fd-surface)] rounded-[var(--fd-r)] shadow-[var(--fd-shadow-sm)] overflow-hidden">
        <CardHeader className="pb-[calc(var(--fd-sp)*1)] border-b border-[var(--fd-border)] bg-[var(--fd-surface2)]/50">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--fd-accent)] animate-pulse shadow-[var(--fd-shadow)]" />
              İnteraktif Araç Şeması — Bölme Seçin
            </CardTitle>
            <div className="flex items-center gap-1 bg-[var(--fd-surface2)] border border-[var(--fd-border)] rounded-lg p-0.5">
              <button
                onClick={() => setSchemaViewMode('3d')}
                className={cn(
                  "min-h-[36px] px-3 py-1.5 text-[11px] font-bold font-mono uppercase tracking-wider rounded-md transition-all flex items-center gap-1.5",
                  schemaViewMode === '3d'
                    ? "bg-[var(--fd-accent)] text-white shadow-[var(--fd-shadow-sm)]"
                    : "text-[var(--fd-text3)] hover:text-[var(--fd-text)] hover:bg-[var(--fd-surface3)]"
                )}
              >
                🚒 3D Garaj
              </button>
              <button
                onClick={() => setSchemaViewMode('2d')}
                className={cn(
                  "min-h-[36px] px-3 py-1.5 text-[11px] font-bold font-mono uppercase tracking-wider rounded-md transition-all flex items-center gap-1.5",
                  schemaViewMode === '2d'
                    ? "bg-[var(--fd-accent)] text-white shadow-[var(--fd-shadow-sm)]"
                    : "text-[var(--fd-text3)] hover:text-[var(--fd-text)] hover:bg-[var(--fd-surface3)]"
                )}
              >
                📐 2D Şema
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4 pb-2">
          {schemaViewMode === '3d' ? (
            <Vehicle3DGarage
              compartmentKeys={compartKeys}
              activeCompartment={activeCompartment}
              onSelect={handleSelectCompartment}
              vehicleType={vehicle.aracTipi}
              suKapasite={vehicle.su_kapasite}
              kopukKapasite={vehicle.kopuk_kapasite}
              isModalOpen={isInventoryModalOpen}
              plaka={vehicle.plaka}
              modelUrl={model3DUrl}
              vehicleModel={`${vehicle.model || ''} ${vehicle.aciklama || ''} ${vehicle.aracTipi || ''} ${vehicle.arac_tipi || ''} ${vehicle.marka || ''}`}
            />
          ) : (
            <Vehicle3DSchematic
              compartmentKeys={compartKeys}
              activeCompartment={activeCompartment}
              onSelect={handleSelectCompartment}
              vehicleType={vehicle.aracTipi}
              suKapasite={vehicle.su_kapasite}
              kopukKapasite={vehicle.kopuk_kapasite}
              plaka={vehicle.plaka}
            />
          )}
        </CardContent>
      </Card>

      {/* Siber Taktik Araç Yapılandırma HUD */}
      {!isEr && (
        <Card className="bg-[var(--fd-surface)] border border-[var(--fd-border)] shadow-[var(--fd-shadow-sm)] rounded-[var(--fd-r)] overflow-hidden transition-all duration-300 print:hidden">
          <CardHeader className="pb-[calc(var(--fd-sp)*1.5)] border-b border-[var(--fd-border)] bg-[var(--fd-surface2)]/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2 font-mono text-[var(--fd-text)]">
              <Wrench className="w-5 h-5 text-[var(--fd-text)]  animate-pulse" />
              <span>🔧 SİBER TAKTİK ARAÇ YAPILANDIRMA HUD</span>
            </CardTitle>
            <button
              onClick={() => setIsConfigPanelOpen(!isConfigPanelOpen)}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center px-4 py-1.5 text-xs font-bold border border-[var(--fd-border)] rounded-[var(--fd-r-sm)] bg-[var(--fd-surface)] hover:bg-[var(--fd-accent-soft2)] text-[var(--fd-accent)] font-mono transition-all uppercase tracking-wider self-end sm:self-auto"
            >
              {isConfigPanelOpen ? "PANELİ KAPAT" : "PANELİ AÇ"}
            </button>
          </CardHeader>
          
          {isConfigPanelOpen && (
            <CardContent className="pt-4 space-y-6 animate-in fade-in duration-200">
              {/* Tank Kapasiteleri */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] p-[calc(var(--fd-sp)*2)]">
                <div className="space-y-1">
                  <label className="block text-xs font-mono text-[var(--fd-text2)] uppercase tracking-wider font-bold">Su Tankı Kapasitesi (Litre)</label>
                  <input
                    type="number"
                    className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] rounded-[var(--fd-r-sm)] px-[calc(var(--fd-sp)*1.5)] py-[calc(var(--fd-sp)*1)] text-sm font-mono text-[var(--fd-text)] focus:outline-none focus:border-[var(--fd-accent)]"
                    value={tempSuKapasite}
                    onChange={(e) => setTempSuKapasite(parseInt(e.target.value) || 0)}
                    min="0"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-mono text-[var(--fd-text2)] uppercase tracking-wider font-bold">Köpük Tankı Kapasitesi (Litre)</label>
                  <input
                    type="number"
                    className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] rounded-[var(--fd-r-sm)] px-[calc(var(--fd-sp)*1.5)] py-[calc(var(--fd-sp)*1)] text-sm font-mono text-[var(--fd-text)] focus:outline-none focus:border-[var(--fd-accent)]"
                    value={tempKopukKapasite}
                    onChange={(e) => setTempKopukKapasite(parseInt(e.target.value) || 0)}
                    min="0"
                  />
                </div>
              </div>

              {/* Yeni Bölme Ekleme */}
              <div className="bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] p-[calc(var(--fd-sp)*2)] space-y-3">
                <h3 className="text-xs font-bold font-mono text-[var(--fd-text)] uppercase tracking-widest flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-[var(--fd-text)]" />
                  Yeni Lojistik Bölme Entegrasyonu
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-mono text-[var(--fd-text2)] uppercase font-bold">Şablon Seçin</label>
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
                      className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] rounded-[var(--fd-r-sm)] px-[calc(var(--fd-sp)*1.5)] py-[calc(var(--fd-sp)*1)] text-xs font-mono text-[var(--fd-text2)] focus:outline-none focus:border-[var(--fd-accent)]"
                    >
                      <option value="custom">-- Özel İsim (Kendin Tanımla) --</option>
                      {Object.entries(COMPARTMENT_NAMES).map(([key, label]) => (
                        <option key={key} value={key}>{label} ({key})</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] font-mono text-[var(--fd-text2)] uppercase font-bold">Bölme İsmi / Kodu</label>
                    <input
                      type="text"
                      disabled={newCompPreset !== "custom"}
                      placeholder={newCompPreset !== "custom" ? "Seçilen şablon ismi kullanılacak" : "Örn: Ön Bagaj, Tavan Sepeti"}
                      value={newCompPreset !== "custom" ? getCompartmentLabel(newCompPreset) : newCompKey}
                      onChange={(e) => setNewCompKey(e.target.value)}
                      className="w-full bg-[var(--fd-surface)] border border-cyan-500/25 rounded-lg px-3 py-2 text-xs font-mono text-[var(--fd-text)] disabled:opacity-50 focus:outline-none focus:border-cyan-500/50"
                    />
                  </div>
                  <button
                    onClick={handleAddCompartment}
                    className="px-4 py-2 bg-[var(--fd-accent-soft)] hover:bg-[var(--fd-accent-soft2)] border border-[var(--fd-border)] text-[var(--fd-accent)] font-bold rounded-lg text-xs font-mono tracking-wider transition-all min-h-[44px] h-auto flex items-center justify-center gap-1.5 shadow-[var(--fd-shadow)]"
                  >
                    <Plus className="w-4 h-4 text-[var(--fd-text)]" />
                    BÖLME EKLE
                  </button>
                </div>
              </div>

              {/* Mevcut Bölmeler Tablosu */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold font-mono text-[var(--fd-text)] uppercase tracking-widest">
                  Mevcut Bölme Konfigürasyonu
                </h3>
                <div className="w-full max-w-full overflow-x-auto -webkit-overflow-scrolling-touch box-border border border-[var(--fd-border)] rounded-xl bg-[var(--fd-surface)] max-h-72" style={{ WebkitOverflowScrolling: "touch" }}>
                  <table className="w-full text-left border-collapse text-xs font-mono">
                    <thead>
                      <tr className="bg-[var(--fd-surface)] border-b border-[var(--fd-border)] text-[var(--fd-text2)] font-bold">
                        <th className="p-3">Bölme / Kapak</th>
                        <th className="p-3">Ekipman</th>
                        <th className="p-3">İsim Değiştir (Siber Aktarım)</th>
                        <th className="p-3 text-right">İşlemler</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--fd-border)]">
                      {Object.keys(tempBolmeler).map((key) => {
                        const itemsCount = tempBolmeler[key]?.length || 0;
                        const renameVal = renameInputs[key] ?? getCompartmentLabel(key);
                        return (
                          <tr key={key} className="hover:bg-cyan-500/[0.02] transition-colors">
                            <td className="p-3 font-bold text-[var(--fd-text)]">
                              <span className="block text-[10px] text-[var(--fd-text3)]">{key}</span>
                              <span>{getCompartmentLabel(key)}</span>
                            </td>
                            <td className="p-3">
                              <span className="px-2 py-0.5 rounded bg-[var(--fd-surface)] border border-[var(--fd-border)] text-[10px] text-[var(--fd-text2)] font-bold">
                                {itemsCount} Parça
                              </span>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-1.5 max-w-[240px]">
                                <input
                                  type="text"
                                  value={renameVal}
                                  onChange={(e) => handleRenameChange(key, e.target.value)}
                                  className="bg-[var(--fd-surface2)] border border-[var(--fd-border)] rounded-[var(--fd-r-sm)] px-[calc(var(--fd-sp)*1.25)] py-[calc(var(--fd-sp)*0.5)] text-xs text-[var(--fd-text2)] w-full focus:outline-none focus:border-[var(--fd-accent)] font-mono"
                                />
                                <button
                                  onClick={() => applyRename(key)}
                                  disabled={renameVal.trim() === getCompartmentLabel(key) || !renameVal.trim()}
                                  className="min-h-[44px] min-w-[44px] flex items-center justify-center px-3 py-1 bg-[var(--fd-surface)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-lg text-[10px] font-bold hover:bg-emerald-500/30 transition-colors disabled:opacity-30 shrink-0"
                                >
                                  Uygula
                                </button>
                              </div>
                            </td>
                            <td className="p-3 text-right">
                              <button
                                onClick={() => handleDeleteCompartment(key)}
                                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-2 bg-[var(--fd-surface)] hover:bg-[var(--fd-danger)]/25 border border-[var(--fd-border)] text-[var(--fd-danger)] rounded-lg hover:text-rose-300 transition-colors"
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
                          <td colSpan={4} className="p-4 text-center text-[var(--fd-text3)] italic">
                            Hiç tanımlı bölme bulunmamaktadır.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Kaydetme Butonları */}
              <div className="flex items-center justify-end gap-3 border-t border-[var(--fd-border)] pt-4">
                <button
                  onClick={() => {
                    if (window.confirm("Yaptığınız tüm değişiklikler sıfırlanacaktır. Emin misiniz?")) {
                      setTempSuKapasite(vehicle.su_kapasite || 0)
                      setTempKopukKapasite(vehicle.kopuk_kapasite || 0)
                      setTempBolmeler(JSON.parse(JSON.stringify(vehicle.bolmeler || {})))
                      setIsConfigPanelOpen(false)
                    }
                  }}
                  className="min-h-[44px] flex items-center justify-center px-4 py-2 border border-[var(--fd-border-strong)] bg-[var(--fd-surface)] hover:bg-[var(--fd-surface2)] text-[var(--fd-text2)] font-bold rounded-lg text-xs font-mono tracking-wider transition-all"
                >
                  İPTAL ET / SIFIRLA
                </button>
                <button
                  onClick={handleSaveConfig}
                  disabled={savingConfig}
                  className="min-h-[44px] flex items-center justify-center px-5 py-2 bg-[var(--fd-accent)] hover:opacity-90 text-[#ffffff] font-bold rounded-[var(--fd-r-sm)] text-xs font-mono tracking-wider transition-all shadow-[var(--fd-shadow-sm)] disabled:opacity-50 gap-2"
                >
                  {savingConfig ? (
                    <>
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      MÜHÜRLENİYOR...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4 #ffffff" />
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
        <Card className="md:col-span-1 h-fit md:sticky md:top-4 border border-[var(--fd-border)] bg-[var(--fd-surface)] rounded-[var(--fd-r)] shadow-[var(--fd-shadow-sm)]">
          <CardHeader className="pb-3 border-b border-border/50 bg-[var(--fd-surface2)]/50">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center space-x-2">
                <PackageSearch className="w-5 h-5 text-[var(--fd-text3)]" />
                <span>Bölmeler</span>
              </span>
              <span className="text-xs text-[var(--fd-text3)] font-normal">
                {totalItems} malzeme{issueItems > 0 && <span className="text-danger ml-1">({issueItems} sorunlu)</span>}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 max-h-[350px] md:max-h-[600px] overflow-y-auto scrollbar-thin scrollbar-thumb-cyan-500/20" style={{ WebkitOverflowScrolling: "touch" }}>
             <div className="flex flex-col">
               {compartKeys.map(key => {
                 const isActive = activeCompartment === key
                 const itemCount = vehicle.bolmeler?.[key]?.length || 0
                 const issues = vehicle.bolmeler?.[key]?.filter((i: InventoryItem) => i?.durum !== "Tam" && i?.durum !== "🔄 GEÇİCİ ZİMMETTE")?.length || 0
                 const IconComponent = TACTICAL_ICONS[key] || Box
                 return (
                   <button
                     key={key}
                     onClick={() => handleSelectCompartment(key)}
                     className={cn(
                       "flex items-center justify-between px-5 py-3 border-b border-border/30 last:border-0 hover:bg-[var(--fd-surface2)] transition-colors text-left w-full min-h-[44px]",
                       isActive && "bg-[var(--fd-accent)]/5 text-[var(--fd-accent)] border-l-4 border-l-primary font-bold shadow-sm"
                     )}
                   >
                     <div className="flex items-center gap-3">
                       <div className={cn(
                         "p-2 rounded-lg border transition-colors shrink-0",
                         isActive 
                           ? "bg-[var(--fd-accent)]/10 border-primary/20 text-[var(--fd-accent)]" 
                           : "bg-[var(--fd-surface3)] border-border/50 text-[var(--fd-text3)]"
                       )}>
                         <IconComponent className="w-4 h-4" />
                       </div>
                       <div>
                         <span className="block text-sm font-semibold tracking-tight">{getCompartmentLabel(key)}</span>
                         <span className="block text-[11px] text-[var(--fd-text3)] mt-0.5">{itemCount} malzeme</span>
                       </div>
                     </div>
                     <div className="flex items-center gap-2">
                       {issues > 0 && <Badge variant="danger" className="text-xs px-1.5">{issues}</Badge>}
                       <ChevronRight className={cn("w-4 h-4 text-[var(--fd-text3)] transition-transform", isActive && "text-[var(--fd-accent)] translate-x-1")} />
                     </div>
                   </button>
                 )
               })}
             </div>
          </CardContent>
        </Card>

        {/* Envanter Listesi + Audit Trail */}
        <div className="md:col-span-2 space-y-4">
          <Card className="border border-[var(--fd-border)] bg-[var(--fd-surface)] rounded-[var(--fd-r)] shadow-[var(--fd-shadow-sm)]">
             <CardHeader className="pb-[calc(var(--fd-sp)*1.5)] border-b border-[var(--fd-border)] bg-[var(--fd-surface)]">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-[var(--fd-accent)] animate-pulse"></span>
                    <span>{activeCompartment ? getCompartmentLabel(activeCompartment) : "Bölme Seçin"} Envanteri</span>
                  </CardTitle>
                  {activeCompartment && (
                    <div className="flex items-center gap-2">
                      {canEditInventory && (
                        <>
                          <button
                            onClick={handleOpenAddModal}
                            className="min-h-[44px] w-11 md:w-auto flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-[var(--fd-surface)] text-[var(--fd-accent)] border border-[var(--fd-accent)]/50 shadow-[var(--fd-shadow-sm)] hover:bg-[var(--fd-accent)]/10 transition-all font-mono uppercase tracking-wider"
                            title="Yeni Ekipman"
                          >
                            <Plus className="w-3.5 h-3.5 text-[var(--fd-accent)]" />
                            <span className="hidden sm:inline">Yeni Ekipman</span>
                          </button>
                          <button
                            onClick={() => setIsEditingList(!isEditingList)}
                            className={cn(
                              "min-h-[44px] w-11 md:w-auto flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all font-mono uppercase tracking-wider border shadow-md",
                              isEditingList
                                ? "bg-[var(--fd-amber)]/15 text-[var(--fd-amber)] border-[var(--fd-amber)]/40 hover:bg-[var(--fd-amber)]/25"
                                : "bg-[var(--fd-surface)] text-[var(--fd-text2)] border-[var(--fd-border)] hover:bg-[var(--fd-surface2)]"
                            )}
                            title={isEditingList ? "Kapat" : "Düzenle"}
                          >
                            <Wrench className={cn("w-3.5 h-3.5", isEditingList ? "text-[var(--fd-amber)]" : "text-[var(--fd-text2)]")} />
                            <span className="hidden sm:inline">{isEditingList ? "Kapat" : "Düzenle"}</span>
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => setShowTimeline(!showTimeline)}
                        className={cn(
                          "min-h-[44px] w-11 md:w-auto flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all border",
                          showTimeline
                            ? "bg-[var(--fd-surface)] text-[var(--fd-text)] border border-[var(--fd-border)]"
                            : "bg-[var(--fd-accent-soft)] text-[var(--fd-accent)] border border-[var(--fd-accent)]/30 hover:bg-[var(--fd-accent-soft2)]"
                        )}
                        title="Vardiya Geçmişi"
                      >
                        <History className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Geçmiş</span>
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
                   <div className="p-8 text-center text-[var(--fd-text3)]">Lütfen sol menüden veya şemadan bir araç bölmesi seçin.</div>
                )}
             </CardContent>
          </Card>

          {/* Audit Timeline Modal */}
          {showTimeline && activeCompartment && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
              <Card className="w-full max-w-2xl bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] shadow-[var(--fd-shadow-lg)] overflow-hidden animate-in zoom-in-95 duration-200 my-auto flex flex-col max-h-[90vh]">
                <CardHeader className="bg-[var(--fd-surface2)]/50 border-b border-[var(--fd-border)] p-4 sm:p-5 flex flex-row items-center justify-between shrink-0">
                  <div className="flex flex-col gap-0.5">
                    <CardTitle className="text-sm md:text-base font-bold text-[var(--fd-text)] flex items-center gap-2">
                      <History className="w-5 h-5 text-[var(--fd-accent)]" />
                      <span>{getCompartmentLabel(activeCompartment)} Bölmesi Vardiya Devir Logları</span>
                    </CardTitle>
                    <p className="text-[11px] text-[var(--fd-text3)] mt-0.5">Bu bölmeye ait geçmiş vardiya devir, kontrol ve eksik malzeme logları.</p>
                  </div>
                  <button
                    onClick={() => setShowTimeline(false)}
                    className="w-7 h-7 rounded-lg bg-[var(--fd-surface2)] hover:bg-[var(--fd-surface3)] text-[var(--fd-text3)] hover:text-[var(--fd-text)] flex items-center justify-center transition-colors border border-[var(--fd-border)] cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </CardHeader>
                <CardContent className="p-4 sm:p-6 overflow-y-auto flex-1">
                  <AuditTimeline plaka={vehicle.plaka} compartmentKey={activeCompartment} />
                </CardContent>
                <div className="bg-[var(--fd-surface2)]/50 border-t border-[var(--fd-border)] p-4 flex items-center justify-end shrink-0">
                  <button
                    onClick={() => setShowTimeline(false)}
                    className="min-h-[38px] px-5 bg-[var(--fd-accent)] hover:opacity-90 text-white rounded-[var(--fd-r-sm)] font-semibold text-xs transition-all cursor-pointer border-none"
                  >
                    Kapat
                  </button>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Cam Morfolojili Premium Bakım & Tamir Kronolojisi Zaman Çizelgesi */}
      <Card className="bg-[var(--fd-surface)] border border-[var(--fd-border)] shadow-[var(--fd-shadow-sm)] rounded-[var(--fd-r)] overflow-hidden transition-all duration-300 print:hidden mt-[calc(var(--fd-sp)*4)]">
        <CardHeader className="pb-[calc(var(--fd-sp)*1.5)] border-b border-[var(--fd-border)] bg-[var(--fd-surface2)]/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CardTitle className="text-base flex items-center gap-2 font-mono text-[var(--fd-text)]">
              <History className="w-5 h-5 text-[var(--fd-text)]  animate-pulse" />
              <span>📋 KRONOLOJİK BAKIM & TAMİR ZAMAN ÇİZELGESİ</span>
            </CardTitle>
            {!isEr && (
              <Button
                onClick={() => setIsMaintenanceModalOpen(true)}
                className="bg-[var(--fd-surface)] hover:bg-[var(--fd-accent)] hover:text-[#ffffff] border border-[var(--fd-border)] text-[var(--fd-text)] text-xs font-bold px-3 py-1 h-7 rounded-lg transition duration-150 flex items-center gap-1 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" /> Manuel Bakım Ekle
              </Button>
            )}
          </div>
          <div className="text-xs text-[var(--fd-text2)] font-mono">
            Toplam: <span className="text-[var(--fd-text)] font-bold">{maintenanceLogs.length}</span> Kayıt Bildirildi
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {maintenanceLogs.length === 0 ? (
            <div className="p-8 text-center text-[var(--fd-text3)] italic font-mono">
              Bu araca ait kayıtlı bakım geçmişi bulunmamaktadır.
            </div>
          ) : (
            <>
              <div className="relative border-l border-[var(--fd-border)] ml-[calc(var(--fd-sp)*2)] pl-[calc(var(--fd-sp)*3)] md:ml-[calc(var(--fd-sp)*3)] md:pl-[calc(var(--fd-sp)*4)] space-y-[calc(var(--fd-sp)*3)]">
                {maintenanceLogs.slice(0, visibleMaintenanceCount).map((log, idx) => {
                const isTamir = log.tip === 'tamir' || log.islem_turu === 'Arıza/Tamir';
                const isYag = log.islem_turu === 'Yağ Değişimi';
                const isPeriyodik = log.islem_turu === 'Periyodik Bakım';
                
                let colorClass = "border-[var(--fd-amber)] shadow-[var(--fd-shadow)] group-hover:shadow-[var(--fd-shadow)]";
                let bulletClass = "bg-[var(--fd-amber)]";
                let tagClass = "bg-[rgba(245,158,11,0.11)] border-transparent text-[var(--fd-amber)]";
                let tagText = log.islem_turu || "🔧 BAKIM";
                
                if (isTamir) {
                  colorClass = "border-[var(--fd-danger)] shadow-[var(--fd-shadow)] group-hover:shadow-[var(--fd-shadow)]";
                  bulletClass = "bg-[var(--fd-danger)]";
                  tagClass = "bg-[var(--fd-surface)] border-[var(--fd-border)] text-[var(--fd-danger)]";
                  tagText = "🔧 ARIZA & TAMİR";
                } else if (isYag) {
                  colorClass = "border-[var(--fd-success)] shadow-[var(--fd-shadow)] group-hover:shadow-[var(--fd-shadow)]";
                  bulletClass = "bg-[var(--fd-success)]";
                  tagClass = "bg-[rgba(22,163,74,0.11)] border-transparent text-[var(--fd-success)]";
                  tagText = "🛢️ YAĞ DEĞİŞİMİ";
                } else if (isPeriyodik) {
                  colorClass = "border-[var(--fd-accent)] shadow-[var(--fd-shadow)] group-hover:shadow-[var(--fd-shadow)]";
                  bulletClass = "bg-[var(--fd-accent)]";
                  tagClass = "bg-[rgba(6,182,212,0.11)] border-transparent text-[var(--fd-accent)]";
                  tagText = "📅 PERİYODİK BAKIM";
                }
                
                // Parse date
                const logDate = new Date(log.tarih);
                const day = logDate.getDate();
                const month = logDate.toLocaleString('tr-TR', { month: 'long' });
                const year = logDate.getFullYear();
                
                // Maliyet formatting
                const hasMaliyet = log.maliyet && Number(log.maliyet) > 0;
                const formattedMaliyet = hasMaliyet 
                  ? `₺${Number(log.maliyet).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` 
                  : 'Kurumsal Bakım';

                // Try to find KM inside description to highlight
                const kmMatch = log.aciklama.match(/\b\d+[\s.]?\d*\s*(?:km|KM)\b/);
                const kmHighlight = kmMatch ? kmMatch[0] : null;

                return (
                  <div key={log.id || idx} className="relative group">
                    {/* Timeline Node Glow Bullet */}
                    <span className={cn(
                      "absolute -left-[calc(var(--fd-sp)*3.88)] md:-left-[calc(var(--fd-sp)*5.12)] top-1.5 w-[18px] h-[18px] rounded-full border-2 bg-[var(--fd-surface)] transition-all group-hover:scale-125 z-10",
                      colorClass
                    )}>
                      <span className={cn(
                        "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full",
                        bulletClass
                      )} />
                    </span>

                    {/* Glassmorphic Event Card */}
                    <div className="bg-[var(--fd-surface)] border border-[var(--fd-border)] group-hover:border-[var(--fd-border-strong)] rounded-[var(--fd-r)] p-[calc(var(--fd-sp)*2)] transition-all duration-300 shadow-[var(--fd-shadow-sm)] group-hover:shadow-[var(--fd-shadow)]">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
                        
                        {/* Event Title / Type & Date */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn(
                            "px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wider border uppercase",
                            tagClass
                          )}>
                            {tagText}
                          </span>
                          
                          <div className="flex items-center gap-1 text-xs text-[var(--fd-text2)] font-mono">
                            <CalendarDays className="w-3.5 h-3.5 text-[var(--fd-text3)]" />
                            <span>{day} {month} {year}</span>
                          </div>
                        </div>

                        {/* Cost & Status Badges */}
                        <div className="self-start md:self-auto flex items-center gap-2">
                          <span className={cn(
                            "px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wider border uppercase",
                            log.durum === 'Onaylandı' || log.durum === 'Tamamlandı'
                              ? "bg-[rgba(22,163,74,0.11)] border-transparent text-[var(--fd-success)]"
                              : log.durum === 'Bekliyor'
                                ? "bg-[rgba(245,158,11,0.11)] border-transparent text-[var(--fd-amber)] animate-pulse"
                                : "bg-rose-950/30 border-[var(--fd-border)] text-[var(--fd-danger)]"
                          )}>
                            {log.durum === 'Onaylandı' || log.durum === 'Tamamlandı' ? 'Onaylandı' : log.durum === 'Bekliyor' ? 'Onay Bekliyor' : log.durum || 'Bilinmiyor'}
                          </span>

                          <span className={cn(
                            "px-3 py-1 rounded-lg text-xs font-bold font-mono border",
                            hasMaliyet 
                              ? "bg-[rgba(245,158,11,0.11)] border-transparent text-[var(--fd-amber)] shadow-[var(--fd-shadow)]" 
                              : "bg-[var(--fd-surface)] border-[var(--fd-border-strong)] text-[var(--fd-text2)]"
                          )}>
                            {formattedMaliyet}
                          </span>
                        </div>

                      </div>

                      {/* Description */}
                      <p className="mt-3 text-sm text-[var(--fd-text2)] leading-relaxed font-mono font-light whitespace-pre-line selection:bg-cyan-500/20">
                        {log.aciklama}
                      </p>

                      {/* Highlighted Cyber Metrics (If any) */}
                      {kmHighlight && (
                        <div className="mt-2.5 flex items-center gap-1.5">
                          <span className="text-[10px] text-[var(--fd-text3)] font-mono uppercase">Tespit Edilen Telemetri:</span>
                          <span className="px-1.5 py-0.5 rounded bg-[var(--fd-surface)] border border-[var(--fd-border)] text-[var(--fd-text)] font-mono text-[10px] font-bold uppercase tracking-wider">
                            {kmHighlight}
                          </span>
                        </div>
                      )}

                    </div>
                  </div>
                );
              })}
            </div>
            {maintenanceLogs.length > visibleMaintenanceCount && (
              <div className="flex justify-center pt-6 pb-2">
                <Button
                  onClick={() => setVisibleMaintenanceCount(prev => prev + 5)}
                  variant="secondary"
                  className="font-bold border border-[var(--fd-border)] bg-[var(--fd-surface2)] hover:bg-[var(--fd-surface3)] text-[var(--fd-text2)] hover:text-[var(--fd-text)] text-xs rounded-xl px-6 py-2.5 flex items-center gap-1.5 shadow-[var(--fd-shadow-sm)] hover:scale-[1.02] transition-all duration-200"
                >
                  <span>🔽</span> Daha Fazla Göster ({maintenanceLogs.length - visibleMaintenanceCount} kayıt kaldı)
                </Button>
              </div>
            )}
          </>
        )}
        </CardContent>
      </Card>

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

      {isMaintenanceModalOpen && vehicle && (
        <Dialog open={isMaintenanceModalOpen} onOpenChange={setIsMaintenanceModalOpen}>
          <DialogContent className="w-[94vw] sm:w-full sm:max-w-[500px] max-h-[85vh] sm:max-h-[90vh] flex flex-col p-0 border border-[var(--fd-border-strong)] bg-[var(--fd-surface)] shadow-[var(--fd-shadow-lg)] rounded-[var(--fd-r-lg)]">
            <DialogHeader className="p-5 border-b border-[var(--fd-border)] bg-[var(--fd-surface)] shrink-0">
              <DialogTitle className="flex items-center gap-2 text-lg text-[var(--fd-text)]">
                <Wrench className="w-5 h-5 text-[var(--fd-text)]" />
                Manuel Bakım & Tamir Ekle
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSaveMaintenance} className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
                <div className="bg-[var(--fd-surface)] p-3 rounded-xl border border-[var(--fd-border)] text-xs text-[var(--fd-text2)] flex items-center gap-2 font-mono">
                  <span>🚒 Plaka:</span>
                  <span className="font-bold text-[var(--fd-text)]">{vehicle.plaka}</span>
                  <span>| Model:</span>
                  <span className="font-bold text-[var(--fd-text)]">{vehicle.model && vehicle.model.toLowerCase().startsWith((vehicle.marka || '').toLowerCase()) ? vehicle.model : `${vehicle.marka || ''} ${vehicle.model || ''}`}</span>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase text-[var(--fd-text2)]">İşlem Türü</label>
                  <select 
                    className="flex h-11 w-full rounded-[var(--fd-r-sm)] border border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text)] px-3 py-2 text-sm ring-offset-background"
                    value={maintenanceForm.islem_turu}
                    onChange={(e) => setMaintenanceForm(prev => ({ ...prev, islem_turu: e.target.value }))}
                  >
                    <option value="Periyodik Bakım">Periyodik Bakım</option>
                    <option value="Arıza/Tamir">Arıza/Tamir</option>
                    <option value="Yağ Değişimi">Yağ Değişimi</option>
                    <option value="Lastik">Lastik Değişimi</option>
                    <option value="Kaza/Hasar">Kaza/Hasar</option>
                    <option value="Diğer">Diğer İşlem</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase text-[var(--fd-text2)]">İşlem Tarihi</label>
                    <input 
                      type="date"
                      className="flex h-11 w-full rounded-[var(--fd-r-sm)] border border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text)] px-3 py-2 text-sm ring-offset-background font-mono"
                      value={maintenanceForm.tarih}
                      onChange={(e) => setMaintenanceForm(prev => ({ ...prev, tarih: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase text-[var(--fd-text2)]">Araç Kilometresi (KM)</label>
                    <input 
                      type="number"
                      placeholder="Örn: 124500"
                      className="flex h-11 w-full rounded-[var(--fd-r-sm)] border border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text)] px-3 py-2 text-sm ring-offset-background font-mono"
                      value={maintenanceForm.kilometre}
                      onChange={(e) => setMaintenanceForm(prev => ({ ...prev, kilometre: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase text-[var(--fd-text2)]">Maliyet (₺ TRY)</label>
                  <input 
                    type="number"
                    placeholder="Örn: 4500"
                    className="flex h-11 w-full rounded-[var(--fd-r-sm)] border border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text)] px-3 py-2 text-sm ring-offset-background font-mono"
                    value={maintenanceForm.maliyet}
                    onChange={(e) => setMaintenanceForm(prev => ({ ...prev, maliyet: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase text-[var(--fd-text2)]">Açıklama / Detaylar</label>
                  <textarea 
                    rows={4}
                    placeholder="Yapılan işlemler, değişen parçalar vb..."
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background min-h-[80px]"
                    value={maintenanceForm.aciklama}
                    onChange={(e) => setMaintenanceForm(prev => ({ ...prev, aciklama: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <DialogFooter className="p-4 sm:p-5 border-t border-[var(--fd-border)] bg-[var(--fd-surface)] flex items-center justify-end shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-5 space-x-2">
                <Button 
                  type="button"
                  variant="outline" 
                  onClick={() => setIsMaintenanceModalOpen(false)} 
                  disabled={isSavingMaintenance} 
                  className="w-full sm:w-auto h-10"
                >
                  İptal
                </Button>
                <Button 
                  type="submit" 
                  disabled={isSavingMaintenance} 
                  className="w-full sm:w-auto min-w-[140px] h-10 bg-[var(--fd-accent)] hover:opacity-90 text-[#ffffff] font-bold"
                >
                  {isSavingMaintenance ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Kaydediliyor...
                    </span>
                  ) : (
                    "Kaydı Ekle"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={isInventoryModalOpen} onOpenChange={setIsInventoryModalOpen}>
        <DialogContent className="w-[94vw] sm:w-full sm:max-w-[750px] max-h-[85vh] flex flex-col p-0 border-[var(--fd-border-strong)] bg-[var(--fd-surface)] shadow-[var(--fd-shadow-lg)] backdrop-blur-sm rounded-[var(--fd-r-lg)]">
          <DialogHeader className="p-4 border-b border-[var(--fd-border)] bg-[var(--fd-surface2)] shrink-0">
            <div className="flex items-center justify-between w-full">
              <DialogTitle className="flex items-center gap-2 text-base font-bold text-[var(--fd-text)]">
                <span className="w-2 h-2 rounded-full bg-[var(--fd-accent)] animate-pulse" />
                {activeCompartment ? getCompartmentLabel(activeCompartment) : "Bölme Seçin"} Envanteri
              </DialogTitle>
            </div>
            <p className="text-[11px] text-[var(--fd-text3)] mt-0.5 font-sans">Bu bölmedeki tüm kayıtlı ekipman ve envanter yönetimi</p>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--fd-surface2)]/50 border border-[var(--fd-border)] p-3 rounded-lg">
              <div className="text-xs text-[var(--fd-text2)] font-sans">
                Toplam <span className="font-mono font-bold text-[var(--fd-accent)]">{activeItems.length}</span> kalem ekipman listeleniyor.
              </div>
              <div className="flex items-center gap-2">
                {canEditInventory && (
                  <>
                    <button
                      onClick={handleOpenAddModal}
                      className="h-9 flex items-center justify-center gap-1.5 text-xs font-bold px-3 rounded-lg bg-[var(--fd-surface)] text-cyan-300 border border-cyan-500/50 shadow-[var(--fd-shadow)] hover:bg-cyan-500/10 transition-all font-mono uppercase tracking-wider cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Yeni Ekipman
                    </button>
                    <button
                      onClick={() => setIsEditingList(!isEditingList)}
                      className={cn(
                        "h-9 flex items-center justify-center gap-1.5 text-xs font-bold px-3 rounded-lg transition-all font-mono uppercase tracking-wider border shadow-md cursor-pointer",
                        isEditingList
                          ? "bg-[var(--fd-amber)]/15 text-amber-300 border-[var(--fd-amber)]/40 hover:bg-[var(--fd-amber)]/25"
                          : "bg-[var(--fd-surface)] text-[var(--fd-text2)] border-[var(--fd-border-strong)] hover:bg-[var(--fd-surface2)]"
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
                    "h-9 flex items-center justify-center gap-1.5 text-xs font-semibold px-3 rounded-lg transition-colors border cursor-pointer",
                    showTimeline
                      ? "bg-[var(--fd-surface)] text-[var(--fd-text)] border border-[var(--fd-border)]"
                      : "bg-[var(--fd-accent-soft2)] text-[var(--fd-accent)] border border-[var(--fd-accent)] hover:bg-[var(--fd-surface2)]"
                  )}
                >
                  <History className="w-3.5 h-3.5" />
                  Geçmiş
                </button>
              </div>
            </div>

            {activeCompartment ? (
              <div className="border border-[var(--fd-border)] rounded-lg overflow-hidden">
                <InventoryList 
                  items={activeItems} 
                  isEditingList={isEditingList}
                  onEditItem={handleOpenEditModal}
                  onDeleteItem={handleDeleteEquipment}
                />
              </div>
            ) : (
              <div className="p-8 text-center text-[var(--fd-text3)] italic">Lütfen bir araç bölmesi seçin.</div>
            )}

            {/* Audit Timeline inline in modal */}
            {showTimeline && activeCompartment && vehicle && (
              <div className="border border-[var(--fd-border)] bg-[var(--fd-surface2)]/20 rounded-lg p-3 space-y-3 animate-in fade-in slide-in-from-top-3">
                <div className="text-xs font-bold text-[var(--fd-text)] flex items-center gap-2 border-b border-[var(--fd-border)] pb-2 font-sans">
                  <History className="w-3.5 h-3.5" />
                  Vardiya Devir Logları — {getCompartmentLabel(activeCompartment)}
                </div>
                <AuditTimeline plaka={vehicle.plaka} compartmentKey={activeCompartment} />
              </div>
            )}
          </div>

          <DialogFooter className="p-3 border-t border-[var(--fd-border)] bg-[var(--fd-surface2)] flex items-center justify-end shrink-0">
            <Button
              variant="outline"
              className="border-[var(--fd-border-strong)] bg-[var(--fd-surface2)] text-[var(--fd-text2)] hover:bg-[var(--fd-surface3)] hover:text-[var(--fd-text)] h-9 text-xs rounded-[var(--fd-r-sm)] cursor-pointer"
              onClick={handleCloseInventoryModal}
            >
              Kapat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hidden Print Area — 8cm × 4cm Etiket Kartları (Argox IX4-350) */}
      <div id="vehicle-print-area" className="hidden print:block print:w-full">
        <div className="print-header-section" style={{ marginBottom: '6mm', textAlign: 'center', borderBottom: '2px solid black', paddingBottom: '4mm' }}>
          <h1 style={{ fontSize: '18px', fontWeight: 900, margin: 0, fontFamily: 'sans-serif' }}>{vehicle.plaka}</h1>
          <p style={{ fontSize: '11px', fontWeight: 600, margin: '2px 0 0 0', fontFamily: 'sans-serif' }}>Araç İçi Envanter ve Barkod Sistemi</p>
        </div>

        <div className="qr-label-grid" style={{ display: 'flex', flexWrap: 'wrap', gap: '3mm', justifyContent: 'center' }}>
          {compartKeys.map((comp) => {
             const qrUrl = buildQrUrl(vehicle.plaka, comp)
             return (
               <div
                 key={comp}
                 className="qr-label-card"
                 style={{
                   width: '8cm',
                   height: '4cm',
                   border: '2.5px solid #000',
                   borderRadius: '3px',
                   boxSizing: 'border-box',
                   display: 'flex',
                   flexDirection: 'column',
                   position: 'relative',
                   overflow: 'hidden',
                   fontFamily: 'sans-serif',
                   pageBreakInside: 'avoid',
                 }}
               >
                 {/* Sağ Üst — Kurum Adı */}
                 <span style={{ position: 'absolute', top: '1.5mm', right: '2.5mm', fontSize: '8px', fontWeight: 800, color: '#000', letterSpacing: '0.05em' }}>
                   Sivas İtfaiye
                 </span>

                 {/* İçerik — QR Sol, Bilgiler Sağ */}
                 <div style={{
                   display: 'flex',
                   flex: 1,
                   padding: '2mm 3mm',
                   gap: '3mm',
                   alignItems: 'center',
                   minHeight: 0,
                 }}>
                   {/* QR Kod */}
                   <div style={{
                     flexShrink: 0,
                     width: '3.2cm',
                     height: '3.2cm',
                     display: 'flex',
                     alignItems: 'center',
                     justifyContent: 'center',
                     border: '1px solid #ddd',
                     borderRadius: '3px',
                     padding: '1mm',
                     background: '#fff',
                   }}>
                     <QRCode
                       value={qrUrl}
                       size={108}
                       level="M"
                       style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                     />
                   </div>

                   {/* Sağ — Bölme Bilgisi */}
                   <div style={{
                     flex: 1,
                     display: 'flex',
                     flexDirection: 'column',
                     justifyContent: 'center',
                     gap: '1mm',
                     overflow: 'hidden',
                   }}>
                     <p style={{
                       margin: 0,
                       fontSize: '18px',
                       fontWeight: 900,
                       lineHeight: 1.2,
                       color: '#000',
                     }}>
                       {getCompartmentLabel(comp)}
                     </p>
                     <p style={{
                       margin: 0,
                       fontSize: '11px',
                       fontWeight: 800,
                       color: '#000',
                     }}>
                       {vehicle.bolmeler?.[comp]?.length || 0} Malzeme
                     </p>
                     <div style={{
                       borderTop: '1px solid #ddd',
                       paddingTop: '1mm',
                       marginTop: '1mm',
                     }}>
                       <p style={{
                         margin: 0,
                         fontSize: '8px',
                         color: '#555',
                         fontWeight: 700,
                         letterSpacing: '0.08em',
                         textTransform: 'uppercase',
                       }}>
                         Sivas İtfaiyesi Envanter Sistemi
                       </p>
                     </div>
                   </div>
                 </div>
               </div>
             )
          })}
        </div>
      </div>
    </div>
  )
}
