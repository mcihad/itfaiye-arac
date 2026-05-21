import { Card, CardContent } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Printer, Edit2, MapPin, Calendar, Compass, Milestone } from "lucide-react"
import Link from "next/link"
import { Vehicle } from "@/types"

interface VehicleCardProps {
  vehicle: Vehicle
  onPrintQR?: (plaka: string, aracTipi: string, marka?: string) => void
  onEdit?: (vehicle: Vehicle) => void
}

function getTacticalSilhouette(aracTipi: string) {
  const typeStr = (aracTipi || "").toLowerCase();
  
  if (typeStr.includes("arazöz")) {
    // Arazöz (Water Tanker / Pumper)
    return (
      <svg viewBox="0 0 100 60" className="w-16 h-10 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="10" y="15" width="80" height="30" rx="4" />
        <rect x="70" y="15" width="20" height="18" rx="2" fill="currentColor" fillOpacity="0.15" />
        <path d="M70 15 L70 45" />
        <line x1="20" y1="20" x2="60" y2="20" strokeDasharray="4 2" />
        <line x1="20" y1="25" x2="60" y2="25" />
        <line x1="20" y1="30" x2="60" y2="30" strokeDasharray="2 2" />
        <circle cx="40" cy="38" r="4" fill="currentColor" />
        <circle cx="50" cy="38" r="4" fill="currentColor" />
        <circle cx="25" cy="48" r="8" fill="currentColor" />
        <circle cx="38" cy="48" r="8" fill="currentColor" />
        <circle cx="75" cy="48" r="8" fill="currentColor" />
      </svg>
    );
  } else if (typeStr.includes("merdiven")) {
    // Merdivenli (Aerial Ladder)
    return (
      <svg viewBox="0 0 100 60" className="w-16 h-10 text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="10" y="20" width="80" height="25" rx="3" />
        <rect x="70" y="20" width="20" height="15" rx="2" fill="currentColor" fillOpacity="0.15" />
        <path d="M70 20 L70 45" />
        <path d="M15 14 L75 7" strokeWidth="3" strokeLinecap="round" />
        <line x1="22" y1="13" x2="23" y2="19" />
        <line x1="32" y1="12" x2="33" y2="18" />
        <line x1="42" y1="11" x2="43" y2="17" />
        <line x1="52" y1="10" x2="54" y2="16" />
        <line x1="62" y1="9" x2="64" y2="15" />
        <line x1="72" y1="8" x2="74" y2="14" />
        <circle cx="25" cy="48" r="8" fill="currentColor" />
        <circle cx="38" cy="48" r="8" fill="currentColor" />
        <circle cx="75" cy="48" r="8" fill="currentColor" />
      </svg>
    );
  } else if (typeStr.includes("kurtarma") || typeStr.includes("arama")) {
    // Kurtarma (Heavy Rescue)
    return (
      <svg viewBox="0 0 100 60" className="w-16 h-10 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="10" y="15" width="80" height="30" rx="4" />
        <rect x="70" y="15" width="20" height="18" rx="2" fill="currentColor" fillOpacity="0.15" />
        <path d="M15 20 L15 8 L35 4" strokeWidth="3" strokeLinecap="round" />
        <path d="M35 4 L45 10" />
        <rect x="25" y="22" width="10" height="12" rx="1" />
        <rect x="40" y="22" width="10" height="12" rx="1" />
        <rect x="55" y="22" width="10" height="12" rx="1" />
        <circle cx="25" cy="48" r="8" fill="currentColor" />
        <circle cx="75" cy="48" r="8" fill="currentColor" />
      </svg>
    );
  } else if (typeStr.includes("lojistik") || typeStr.includes("tanker")) {
    // Lojistik / Su Tankeri
    return (
      <svg viewBox="0 0 100 60" className="w-16 h-10 text-indigo-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.5)]" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M68 18 L88 18 L90 32 L90 45 L68 45 Z" fill="currentColor" fillOpacity="0.15" />
        <rect x="70" y="20" width="15" height="15" rx="1" />
        <rect x="10" y="15" width="55" height="30" rx="10" />
        <path d="M20 15 L20 45" strokeDasharray="3 3" />
        <path d="M40 15 L40 45" strokeDasharray="3 3" />
        <circle cx="20" cy="48" r="8" fill="currentColor" />
        <circle cx="32" cy="48" r="8" fill="currentColor" />
        <circle cx="44" cy="48" r="8" fill="currentColor" />
        <circle cx="78" cy="48" r="8" fill="currentColor" />
      </svg>
    );
  } else {
    // Hızlı Müdahale / Genel Tip (Fast Attack Pickup)
    return (
      <svg viewBox="0 0 100 60" className="w-16 h-10 text-rose-400 drop-shadow-[0_0_8px_rgba(251,113,133,0.5)]" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M10 25 L45 25 L45 20 L75 20 L90 30 L90 45 L10 45 Z" />
        <path d="M55 23 L72 23 L83 31 L55 31 Z" fill="currentColor" fillOpacity="0.15" strokeWidth="1.5" />
        <line x1="45" y1="20" x2="45" y2="15" strokeWidth="3" />
        <circle cx="45" cy="13" r="2" fill="currentColor" />
        <circle cx="25" cy="35" r="6" />
        <circle cx="25" cy="35" r="3" fill="currentColor" />
        <circle cx="25" cy="47" r="7" fill="currentColor" />
        <circle cx="75" cy="47" r="7" fill="currentColor" />
      </svg>
    );
  }
}

export function VehicleCard({ vehicle, onPrintQR, onEdit }: VehicleCardProps) {
  const idStr = vehicle.plaka.replace(/\s+/g, '-').toLowerCase()
  const activeDurum = (vehicle.durum || "aktif").toLowerCase();

  const getStatusBadge = (durum: string) => {
    switch (durum) {
      case 'aktif':
        return <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.15)] text-[10px] font-bold tracking-wide uppercase px-2 py-0.5">AKTİF</Badge>
      case 'bakimda':
        return <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.15)] text-[10px] font-bold tracking-wide uppercase px-2 py-0.5">BAKIMDA</Badge>
      case 'arizali':
        return <Badge className="bg-rose-500/10 text-rose-400 border border-rose-500/30 shadow-[0_0_12px_rgba(239,68,68,0.25)] text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 animate-pulse">ARIZALI</Badge>
      default:
        return <Badge className="bg-slate-500/10 text-slate-400 border border-slate-500/30 text-[10px] font-bold tracking-wide uppercase px-2 py-0.5">PASİF</Badge>
    }
  }
  
  return (
    <Card className="backdrop-blur-md bg-slate-900/70 border border-white/10 hover:border-cyan-500/30 hover:shadow-[0_0_20px_-3px_rgba(34,211,238,0.25)] transition-all duration-300 group relative overflow-hidden rounded-2xl shadow-[0_4px_30px_rgba(0,0,0,0.4)]">
      {/* Decorative premium line */}
      <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent opacity-50 group-hover:opacity-100 transition-opacity" />
      
      <CardContent className="p-5 flex flex-col justify-between h-full">
        <div>
          {/* Header */}
          <div className="flex items-start justify-between">
            <Link href={`/araclar/${idStr}`} className="flex items-center space-x-3.5 flex-1 min-w-0">
              <div className="p-2 rounded-xl bg-slate-800/80 border border-white/5 group-hover:bg-slate-800/100 group-hover:border-cyan-500/20 transition-all duration-300 flex items-center justify-center">
                {getTacticalSilhouette(vehicle.arac_tipi || vehicle.aracTipi)}
              </div>
              <div className="min-w-0">
                 <div className="flex items-center gap-1.5">
                   <h3 className="font-mono font-bold text-lg text-slate-100 tracking-tight">{vehicle.plaka}</h3>
                   {vehicle.marka && (
                     <Badge variant="outline" className="font-mono text-[9px] font-extrabold text-cyan-400 border-cyan-400/25 px-1 py-0 bg-cyan-400/5 uppercase">
                       {vehicle.marka}
                     </Badge>
                   )}
                 </div>
                 <p className="text-muted-foreground text-xs font-semibold">{vehicle.arac_tipi || vehicle.aracTipi}</p>
              </div>
            </Link>
            
            <div className="flex items-center gap-1.5 shrink-0">
              {onEdit && (
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onEdit(vehicle)
                  }}
                  className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/25 text-blue-400 hover:bg-blue-500/20 transition-colors cursor-pointer"
                  title="Aracı Düzenle"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              )}
              {onPrintQR && (
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onPrintQR(vehicle.plaka, vehicle.arac_tipi || vehicle.aracTipi || "Araç", vehicle.marka || "")
                  }}
                  className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 hover:bg-cyan-500/20 transition-colors cursor-pointer"
                  title="QR Etiket Yazdır"
                >
                  <Printer className="w-3.5 h-3.5" />
                </button>
              )}
              {getStatusBadge(activeDurum)}
            </div>
          </div>

          {/* Quick Technical Specs Grid */}
          <div className="grid grid-cols-2 gap-2.5 mt-4 p-2.5 rounded-xl bg-slate-950/40 border border-white/5 font-mono text-[10px]">
            <div className="flex items-center gap-1.5 text-slate-400">
              <Compass className="w-3.5 h-3.5 text-slate-500" />
              <span>KM:</span>
              <span className="text-slate-200 font-bold ml-auto">{vehicle.km?.toLocaleString() || "0"}</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-400">
              <Milestone className="w-3.5 h-3.5 text-slate-500" />
              <span>PTO:</span>
              <span className="text-slate-200 font-bold ml-auto">{vehicle.motorSaatiPTO || "0"} s</span>
            </div>
            {vehicle.istasyon && (
              <div className="flex items-center gap-1.5 text-slate-400 col-span-2">
                <MapPin className="w-3.5 h-3.5 text-slate-500" />
                <span>İstasyon:</span>
                <span className="text-slate-200 font-bold ml-auto truncate max-w-[150px]">{vehicle.istasyon}</span>
              </div>
            )}
            {vehicle.yil && vehicle.model && (
              <div className="flex items-center gap-1.5 text-slate-400 col-span-2 border-t border-white/5 pt-1 mt-0.5">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <span>Model:</span>
                <span className="text-slate-200 font-bold ml-auto truncate max-w-[150px]">{vehicle.yil} - {vehicle.model}</span>
              </div>
            )}
          </div>
        </div>

        {/* Zimmetli Personel Footer */}
        <div className="mt-4 pt-3.5 border-t border-white/5">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Aktif Personel / Mürettebat</p>
          <div className="flex flex-wrap gap-1.5">
            {((vehicle as any).aktifPersonel || (vehicle as any).aktif_personel || []).length > 0 ? (
              ((vehicle as any).aktifPersonel || (vehicle as any).aktif_personel).map((person: string) => (
                <Badge key={person} variant="outline" className="text-[9px] font-medium border-white/10 bg-slate-950/40 text-slate-300">
                  {person}
                </Badge>
              ))
            ) : (
              <span className="text-[10px] italic text-slate-600">Aktif nöbetçi atanmadı</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

