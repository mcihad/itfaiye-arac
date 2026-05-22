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
  Box
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

function buildQrUrl(plaka: string, compartment: string): string {
  const slug = plaka.replace(/\s+/g, "-").toLowerCase()
  return `${APP_BASE_URL}/arac/${slug}/${compartment}`
}

const STANDARD_11_COMPARTMENTS = [
  "sol_on_kapak",
  "sol_orta_kapak",
  "sol_arka_kapak",
  "sag_on_kapak",
  "sag_orta_kapak",
  "sag_arka_kapak",
  "arac_ustu",
  "kabin_ici",
  "arac_ici",
  "arka_bolme",
  "arka_kapak"
];

const TACTICAL_ICONS: Record<string, any> = {
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
  
  const [vehicle, setVehicle] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeCompartment, setActiveCompartment] = useState<string | null>(null)
  const [showTimeline, setShowTimeline] = useState(false)

  useEffect(() => {
    async function fetchVehicle() {
      const { data: vehicles } = await api.from('vehicles').select('*')
      const found = (vehicles || []).find((v: any) => v.plaka.replace(/\s+/g, '-').toLowerCase() === idStr)
      setVehicle(found)
      setLoading(false)
    }
    fetchVehicle()
  }, [idStr])
  
  // Listen and sync searchParams (QR deep linking)
  useEffect(() => {
    if (!vehicle) return
    const bolmeParam = searchParams.get("bolme")
    const keys = Array.from(new Set([
      ...STANDARD_11_COMPARTMENTS,
      ...Object.keys(vehicle.bolmeler || {})
    ]))
    if (bolmeParam && (keys.includes(bolmeParam) || vehicle.bolmeler?.[bolmeParam])) {
      setActiveCompartment(bolmeParam)
    } else if (keys.length > 0) {
      setActiveCompartment(keys[0])
    }
  }, [searchParams, vehicle])

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

  const compartKeys = Array.from(new Set([
    ...STANDARD_11_COMPARTMENTS,
    ...Object.keys(vehicle.bolmeler || {})
  ]))

  const activeItems: any[] = activeCompartment ? (vehicle.bolmeler?.[activeCompartment] || []) : []

  // Count total items and issues safely
  const totalItems = Object.values(vehicle.bolmeler || {}).flat().length
  const issueItems = Object.values(vehicle.bolmeler || {}).flat().filter((i: any) => i?.durum !== "Tam").length

  return (
    <div className="space-y-6">
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

      {/* Araç Bilgi Kartları */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-3 flex items-center gap-2.5">
          <Gauge className="w-4 h-4 text-primary shrink-0" />
          <div><p className="text-[10px] text-muted-foreground uppercase">Kilometre</p><p className="text-sm font-bold">{(vehicle.km || 0).toLocaleString("tr-TR")} km</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-3 flex items-center gap-2.5">
          <Clock className="w-4 h-4 text-warning shrink-0" />
          <div><p className="text-[10px] text-muted-foreground uppercase">Motor (PTO)</p><p className="text-sm font-bold">{(vehicle.motorSaatiPTO || 0).toLocaleString("tr-TR")} sa</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-3 flex items-center gap-2.5">
          <ShieldCheck className="w-4 h-4 text-success shrink-0" />
          <div><p className="text-[10px] text-muted-foreground uppercase">Sigorta</p><p className="text-sm font-bold">{vehicle.sigortaBitis ? new Date(vehicle.sigortaBitis).toLocaleDateString("tr-TR") : "—"}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-3 flex items-center gap-2.5">
          <CalendarDays className="w-4 h-4 text-blue-500 shrink-0" />
          <div><p className="text-[10px] text-muted-foreground uppercase">Muayene</p><p className="text-sm font-bold">{vehicle.muayeneBitis ? new Date(vehicle.muayeneBitis).toLocaleDateString("tr-TR") : "—"}</p></div>
        </CardContent></Card>
      </div>

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
                 const issues = vehicle.bolmeler?.[key]?.filter((i: any) => i?.durum !== "Tam")?.length || 0
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
                         <span className="block text-sm font-semibold tracking-tight">{COMPARTMENT_NAMES[key] || key}</span>
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
                   <span>{activeCompartment ? COMPARTMENT_NAMES[activeCompartment] || activeCompartment : "Bölme Seçin"} Envanteri</span>
                 </CardTitle>
                 {activeCompartment && (
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
                 )}
               </div>
             </CardHeader>
             <CardContent className="pt-0 px-0">
                {activeCompartment ? (
                  <InventoryList items={activeItems} />
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
                  Vardiya Devir Logları — {COMPARTMENT_NAMES[activeCompartment] || activeCompartment}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <AuditTimeline plaka={vehicle.plaka} compartmentKey={activeCompartment} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>

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
                   <p className="font-bold text-lg text-black">{COMPARTMENT_NAMES[comp] || comp}</p>
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
