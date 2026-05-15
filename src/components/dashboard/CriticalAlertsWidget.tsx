"use client"
import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { AlertTriangle, ShieldAlert, Package, Clock, Loader2, ChevronDown, ChevronUp } from "lucide-react"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import Link from "next/link"

interface CertAlert {
  id: string
  sicil_no: string
  ad: string
  soyad: string
  tip: string
  gecerlilik_tarihi: string
  kalan_gun: number
}

interface InventoryAlert {
  id: string
  plaka: string
  islem_tipi: string
  durum: string
  detaylar: string
  tarih: string
}

interface VehicleAlert {
  plaka: string
  arac_tipi: string
  alertType: 'Sigorta' | 'Muayene'
  tarih: string
  kalan_gun: number
}

export function CriticalAlertsWidget() {
  const [certAlerts, setCertAlerts] = useState<CertAlert[]>([])
  const [inventoryAlerts, setInventoryAlerts] = useState<InventoryAlert[]>([])
  const [vehicleAlerts, setVehicleAlerts] = useState<VehicleAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(true)

  useEffect(() => {
    async function fetchAlerts() {
      try {
        // 1. Expiring certifications (existing VIEW)
        const { data: certs } = await api
          .from("vw_expiring_certifications")
          .select("*")
          .order("kalan_gun", { ascending: true })
          .limit(10)

        setCertAlerts((certs || []) as CertAlert[])

        // 2. Recent problematic logs (last 24h)
        const yesterday = new Date()
        yesterday.setDate(yesterday.getDate() - 1)
        
        const { data: issues } = await api
          .from("unified_system_logs")
          .select("*")
          .eq("durum", "Sorunlu")
          .gte("tarih", yesterday.toISOString())
          .order("tarih", { ascending: false })
          .limit(10)

        setInventoryAlerts((issues || []) as InventoryAlert[])

        // 3. Vehicles (Sigorta / Muayene)
        const { data: vehData } = await api.from("vehicles").select("*")
        const vAlerts: VehicleAlert[] = []
        if (vehData) {
          const now = new Date()
          vehData.forEach((v: any) => {
            if (v.sigortaBitis) {
              const diffTime = new Date(v.sigortaBitis).getTime() - now.getTime()
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
              if (diffDays <= 15) {
                vAlerts.push({
                  plaka: v.plaka, arac_tipi: v.arac_tipi, alertType: 'Sigorta', tarih: v.sigortaBitis, kalan_gun: diffDays
                })
              }
            }
            if (v.muayeneBitis) {
              const diffTime = new Date(v.muayeneBitis).getTime() - now.getTime()
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
              if (diffDays <= 15) {
                vAlerts.push({
                  plaka: v.plaka, arac_tipi: v.arac_tipi, alertType: 'Muayene', tarih: v.muayeneBitis, kalan_gun: diffDays
                })
              }
            }
          })
          vAlerts.sort((a, b) => a.kalan_gun - b.kalan_gun)
          setVehicleAlerts(vAlerts)
        }
      } catch (err) {
        console.error("[CriticalAlerts] Error:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchAlerts()
  }, [])

  const totalAlerts = certAlerts.length + inventoryAlerts.length + vehicleAlerts.length

  if (loading) {
    return (
      <Card className="border-yellow-500/20 bg-yellow-500/[0.02]">
        <CardContent className="p-4 flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-yellow-500" />
          <span className="text-sm text-muted-foreground">Kritik uyarılar kontrol ediliyor...</span>
        </CardContent>
      </Card>
    )
  }

  if (totalAlerts === 0) return null

  return (
    <Card className={cn(
      "border-2 overflow-hidden transition-all",
      certAlerts.some(c => c.kalan_gun < 0) || vehicleAlerts.some(v => v.kalan_gun < 0)
        ? "border-danger/30 bg-danger/[0.02]" 
        : "border-warning/30 bg-warning/[0.02]"
    )}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-2 rounded-xl",
            (certAlerts.some(c => c.kalan_gun < 0) || vehicleAlerts.some(v => v.kalan_gun < 0)) ? "bg-danger/10" : "bg-warning/10"
          )}>
            <ShieldAlert className={cn(
              "w-5 h-5",
              (certAlerts.some(c => c.kalan_gun < 0) || vehicleAlerts.some(v => v.kalan_gun < 0)) ? "text-danger" : "text-warning"
            )} />
          </div>
          <div className="text-left">
            <p className="font-bold text-sm">🚨 Kritik Uyarılar</p>
            <p className="text-xs text-muted-foreground">{totalAlerts} dikkat gerektiren kayıt</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="danger" className="px-2 py-0.5 text-xs">{totalAlerts}</Badge>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {/* Content */}
      {expanded && (
        <div className="border-t border-border/50 divide-y divide-border/30">
          
          {/* Certificate Alerts */}
          {certAlerts.length > 0 && (
            <div className="p-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-danger flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Süresi Dolan / Dolmak Üzere Olan Belgeler
              </p>
              <div className="space-y-1.5">
                {certAlerts.map(cert => (
                  <div key={cert.id} className="flex items-center justify-between p-2.5 rounded-lg bg-surface/50 border border-border/50">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{cert.ad} {cert.soyad}</p>
                      <p className="text-xs text-muted-foreground">{cert.tip} — Sicil: {cert.sicil_no}</p>
                    </div>
                    <Badge 
                      variant={cert.kalan_gun < 0 ? "danger" : "outline"}
                      className={cn(
                        "shrink-0 text-xs",
                        cert.kalan_gun < 0 
                          ? "" 
                          : cert.kalan_gun <= 7 
                            ? "border-danger/50 text-danger bg-danger/5" 
                            : "border-warning/50 text-warning bg-warning/5"
                      )}
                    >
                      {cert.kalan_gun < 0 
                        ? `${Math.abs(cert.kalan_gun)} gün GEÇMİŞ` 
                        : `${cert.kalan_gun} gün kaldı`
                      }
                    </Badge>
                  </div>
                ))}
              </div>
              <Link href="/yonetim/personel" className="text-xs text-primary font-medium hover:underline">
                Personel Yönetimi →
              </Link>
            </div>
          )}

          {/* Vehicle Alerts */}
          {vehicleAlerts.length > 0 && (
            <div className="p-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-danger flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Süresi Dolan / Dolmak Üzere Olan Araç Belgeleri
              </p>
              <div className="space-y-1.5">
                {vehicleAlerts.map((v, i) => (
                  <div key={`${v.plaka}-${v.alertType}-${i}`} className="flex items-center justify-between p-2.5 rounded-lg bg-surface/50 border border-border/50">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{v.plaka}</p>
                      <p className="text-xs text-muted-foreground">{v.arac_tipi} — {v.alertType}</p>
                    </div>
                    <Badge 
                      variant={v.kalan_gun < 0 ? "danger" : "outline"}
                      className={cn(
                        "shrink-0 text-xs",
                        v.kalan_gun < 0 
                          ? "" 
                          : v.kalan_gun <= 7 
                            ? "border-danger/50 text-danger bg-danger/5" 
                            : "border-warning/50 text-warning bg-warning/5"
                      )}
                    >
                      {v.kalan_gun < 0 
                        ? `${Math.abs(v.kalan_gun)} gün GEÇMİŞ` 
                        : `${v.kalan_gun} gün kaldı`
                      }
                    </Badge>
                  </div>
                ))}
              </div>
              <Link href="/araclar" className="text-xs text-primary font-medium hover:underline">
                Araçlar Yönetimi →
              </Link>
            </div>
          )}

          {/* Inventory / Equipment Alerts */}
          {inventoryAlerts.length > 0 && (
            <div className="p-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-warning flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5" />
                Son 24 Saat — Sorunlu Kontrol Kayıtları
              </p>
              <div className="space-y-1.5">
                {inventoryAlerts.map(issue => (
                  <div key={issue.id} className="flex items-center justify-between p-2.5 rounded-lg bg-surface/50 border border-border/50">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-primary">{issue.plaka}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{issue.islem_tipi}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{issue.detaylar || "Detay yok"}</p>
                    </div>
                    <Badge variant="danger" className="shrink-0 text-xs gap-1">
                      <AlertTriangle className="w-3 h-3" /> Sorunlu
                    </Badge>
                  </div>
                ))}
              </div>
              <Link href="/yonetim/raporlar" className="text-xs text-primary font-medium hover:underline">
                Tüm Raporlar →
              </Link>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
