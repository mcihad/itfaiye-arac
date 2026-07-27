import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Printer, Edit2, MapPin, Calendar, Compass, Milestone, X } from "lucide-react"
import Link from "next/link"
import { Vehicle, Personnel } from "@/types"
import { api } from "@/lib/api"
import { useAuthStore } from "@/lib/authStore"
import { toast } from "@/lib/toast"

interface VehicleCardProps {
  vehicle: Vehicle
  onPrintQR?: (plaka: string, aracTipi: string, marka?: string) => void
  onEdit?: (vehicle: Vehicle) => void
  onReportFault?: (plaka: string) => void
  onChangeBranch?: (plaka: string) => void
  drivers?: Personnel[]
  ers?: Personnel[]
  onUpdateResponsibles?: (plaka: string, updateData: { sorumlu_sofor_id?: string | null, sorumlu_er_id?: string | null }) => Promise<void>
}

function getTacticalSilhouette(aracTipi: string, filoNo?: number | null) {
  const typeStr = (aracTipi || "").toLowerCase();
  
  if (filoNo === 1 || typeStr.includes("minibüs") || typeStr.includes("servis") || typeStr.includes("kılavuz") || typeStr.includes("klavuz")) {
    // Minibüs / Servis / Kılavuz (Mercedes Sprinter / Ford Transit)
    return (
      <svg viewBox="0 0 100 60" className="w-16 h-10 text-indigo-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.5)]" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="10" y="18" width="80" height="26" rx="6" />
        <rect x="18" y="22" width="10" height="9" rx="1.5" fill="currentColor" fillOpacity="0.15" />
        <rect x="32" y="22" width="10" height="9" rx="1.5" fill="currentColor" fillOpacity="0.15" />
        <rect x="46" y="22" width="10" height="9" rx="1.5" fill="currentColor" fillOpacity="0.15" />
        <path d="M60 22 L78 22 L84 27 L84 31 L60 31 Z" fill="currentColor" fillOpacity="0.15" />
        <circle cx="28" cy="46" r="7" fill="currentColor" />
        <circle cx="72" cy="46" r="7" fill="currentColor" />
      </svg>
    );
  }
  
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

function formatToTurkishDate(dateStr: string | undefined | null): string {
  if (!dateStr || dateStr === 'Tarih Girilmedi') return 'Tarih Girilmedi';
  try {
    const [year, month, day] = dateStr.split('-');
    if (!year || !month || !day) return dateStr;
    return `${day}.${month}.${year}`;
  } catch {
    return dateStr;
  }
}

function getInspectionStatus(nextInspectionDate: string | undefined | null) {
  if (!nextInspectionDate || nextInspectionDate === 'Tarih Girilmedi') {
    return {
      text: 'Tarih Girilmedi',
      badgeClass: 'bg-slate-900/60 text-slate-400 border border-slate-800'
    };
  }

  const inspectionDate = new Date(nextInspectionDate);
  if (isNaN(inspectionDate.getTime())) {
    return {
      text: 'Geçersiz Tarih',
      badgeClass: 'bg-slate-900/60 text-slate-400 border border-slate-800'
    };
  }

  const now = new Date();
  const d1 = Date.UTC(inspectionDate.getFullYear(), inspectionDate.getMonth(), inspectionDate.getDate());
  const d2 = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  
  const diffTime = d1 - d2;
  const remainingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (remainingDays <= 0) {
    return {
      text: '⚠️ Muayene Süresi Geçti!',
      badgeClass: 'bg-red-950/30 text-red-400 border border-red-500/30 shadow-[0_0_10px_rgba(239,68,68,0.1)] animate-pulse'
    };
  } else if (remainingDays <= 30) {
    return {
      text: `⏳ Son ${remainingDays} Gün`,
      badgeClass: 'bg-amber-950/30 text-amber-400 border border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.1)]'
    };
  } else {
    return {
      text: `✅ ${remainingDays} Gün Kaldı`,
      badgeClass: 'bg-emerald-950/30 text-emerald-400 border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.1)]'
    };
  }
}

export function VehicleCard({ vehicle, onPrintQR, onEdit, onReportFault, onChangeBranch, drivers, ers, onUpdateResponsibles }: VehicleCardProps) {
  const { user } = useAuthStore()
  const [inspectionDate, setInspectionDate] = useState(vehicle.next_inspection_date)
  const [isEditing, setIsEditing] = useState(false)
  const [newDate, setNewDate] = useState(vehicle.next_inspection_date || '')
  const [isUpdating, setIsUpdating] = useState(false)
  const [isUpdatingResponsibles, setIsUpdatingResponsibles] = useState(false)

  const canUpdateResponsibles = user ? (user.rol === 'Admin' || user.rol === 'Editor' || user.rol === 'Shift_Leader') : false

  const canUpdateInspection = (() => {
    if (!user) return false;
    const rol = user.rol || '';
    const unvan = user.unvan || '';
    
    // Müdür
    if (unvan === 'Müdür' || rol === 'Admin' || rol?.toLowerCase() === 'admin' || unvan?.toLowerCase() === 'müdür') return true;
    // Amir
    if (unvan === 'Amir' || rol === 'Editor' || rol?.toLowerCase() === 'editor' || unvan?.toLowerCase() === 'amir') return true;
    // Çavuş
    if (unvan === 'Başçavuş' || unvan === 'Çavuş' || rol === 'Shift_Leader') return true;
    // Karargah
    if (
      unvan.includes('Santral') || 
      unvan.includes('İhbar') || 
      unvan.includes('Memur') || 
      rol === 'Santral' ||
      unvan.toLowerCase().includes('santral') ||
      unvan.toLowerCase().includes('ihbar') ||
      unvan.toLowerCase().includes('memur')
    ) return true;
    
    return false;
  })();

  useEffect(() => {
    setInspectionDate(vehicle.next_inspection_date)
    setNewDate(vehicle.next_inspection_date || '')
  }, [vehicle.next_inspection_date])

  const handleUpdateDate = async () => {
    if (!newDate) {
      toast('Lütfen geçerli bir tarih seçin.');
      return;
    }
    setIsUpdating(true);
    try {
      const { error } = await api.update(
        'vehicles',
        { next_inspection_date: newDate },
        { plaka: vehicle.plaka }
      );
      if (error) throw new Error(error);
      setInspectionDate(newDate);
      setIsEditing(false);
    } catch (err: any) {
      console.error('Muayene tarihi güncellenirken hata oluştu:', err);
      toast('Güncelleme başarısız: ' + (err.message || err));
    } finally {
      setIsUpdating(false);
    }
  };

  const idStr = vehicle.plaka.replace(/\s+/g, '-').toLowerCase()
  const activeDurum = (vehicle.durum || "aktif").toLowerCase();

  const getStatusBadge = (durum: string) => {
    switch (durum) {
      case 'aktif':
        return <Badge className="bg-emerald-950/30 text-emerald-400 border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.05)] text-[10px] font-bold tracking-wide uppercase px-2 py-0.5">AKTİF</Badge>
      case 'bakimda':
        return <Badge className="bg-amber-950/30 text-amber-400 border border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.05)] text-[10px] font-bold tracking-wide uppercase px-2 py-0.5">BAKIMDA</Badge>
      case 'arizali':
        return <Badge className="bg-red-950/30 text-red-400 border border-red-500/30 shadow-[0_0_10px_rgba(239,68,68,0.05)] text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 animate-pulse">ARIZALI</Badge>
      default:
        return <Badge className="bg-slate-900/60 text-slate-400 border border-slate-800 text-[10px] font-bold tracking-wide uppercase px-2 py-0.5">PASİF</Badge>
    }
  }
  
  return (
    <Card className="bg-slate-950/75 backdrop-blur-lg border border-slate-800/60 shadow-[0_4px_30px_rgba(0,0,0,0.4)] hover:border-cyan-500/30 hover:shadow-[0_0_20px_-3px_rgba(34,211,238,0.25)] transition-all duration-300 group relative overflow-hidden rounded-2xl">
      {/* Decorative premium line */}
      <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent opacity-50 group-hover:opacity-100 transition-opacity" />
      
      {/* Kurumsal Siber Filo Numarası Rozeti */}
      {vehicle.filo_no && (
        <div 
          className="absolute top-3 left-3 w-8 h-8 rounded-full bg-slate-800 border border-slate-700/80 text-slate-100 font-extrabold text-sm flex items-center justify-center shadow-lg shadow-black/50 z-20 font-mono"
          title={`Filo Numarası: ${vehicle.filo_no}`}
        >
          {vehicle.filo_no}
        </div>
      )}
      
      <CardContent className="p-5 flex flex-col justify-between h-full">
        <div>
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <Link 
              href={`/araclar/${idStr}`} 
              className={`flex items-center space-x-3.5 flex-1 min-w-0 ${vehicle.filo_no ? 'pl-9' : ''}`}
            >
              <div className="p-2 rounded-xl bg-slate-800/80 border border-white/5 group-hover:bg-slate-800/100 group-hover:border-cyan-500/20 transition-all duration-300 flex items-center justify-center shrink-0">
                {getTacticalSilhouette(vehicle.arac_tipi || vehicle.aracTipi, vehicle.filo_no)}
              </div>
              <div className="min-w-0">
                 <h3 className="font-bold text-slate-100 tracking-wider text-sm md:text-base leading-tight break-words font-mono">
                   {vehicle.plaka}
                 </h3>
                 <div className="text-[10px] text-slate-400 font-semibold tracking-wider uppercase mt-0.5 leading-none">
                   {vehicle.arac_tipi || vehicle.aracTipi || ''}
                 </div>
                 {vehicle.marka && (
                   <Badge variant="outline" className="font-mono text-[9px] font-extrabold text-cyan-400 border-cyan-400/25 px-1 py-0 bg-cyan-400/5 uppercase mt-1.5">
                     {vehicle.marka}
                   </Badge>
                 )}
              </div>
            </Link>
            
            <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0 mt-1 sm:mt-0">
              {vehicle.current_branch !== 'Makine İkmal Müdürlüğü (Bakım-Onarım)' && onReportFault && (
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onReportFault(vehicle.plaka)
                  }}
                  className="px-2 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/40 text-orange-400 hover:bg-orange-500/20 hover:shadow-[0_0_10px_rgba(249,115,22,0.4)] text-[10px] font-bold tracking-wide transition-all duration-200 cursor-pointer flex items-center gap-1 shrink-0"
                  title="Arıza Bildir"
                >
                  <span>⚠️ Arıza Bildir</span>
                </button>
              )}
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
            {/* Faz 28.51: Mevcut Şube Rozeti */}
            {vehicle.current_branch && vehicle.current_branch !== 'Makine İkmal Müdürlüğü (Bakım-Onarım)' && (
              <div className="flex items-center gap-1.5 text-slate-400 col-span-2 border-t border-white/5 pt-1 mt-0.5">
                <span className="text-[10px]">🏢</span>
                <span>Şube:</span>
                <span className={`text-[10px] font-semibold ml-auto px-1.5 py-0.5 rounded ${
                  vehicle.current_branch === 'Merkez'
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/25'
                    : vehicle.current_branch === 'Esentepe'
                      ? 'bg-violet-500/10 text-violet-400 border border-violet-500/25'
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/25'
                }`}>{vehicle.current_branch}</span>
                {onChangeBranch && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onChangeBranch(vehicle.plaka);
                    }}
                    className="ml-1 px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-white/10 hover:border-cyan-500/30 text-slate-400 hover:text-cyan-400 text-[9px] font-bold transition-all cursor-pointer"
                    title="Şube Değiştir"
                  >
                    📍 Değiştir
                  </button>
                )}
              </div>
            )}
            {(vehicle.model || vehicle.aciklama) && (
              <div className="flex items-center gap-1.5 text-slate-400 col-span-2 border-t border-white/5 pt-1 mt-0.5">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <span>Model:</span>
                <span className="text-slate-200 font-bold ml-auto truncate max-w-[190px]" title={vehicle.aciklama || vehicle.model}>
                  {vehicle.yil ? `${vehicle.yil} - ` : ''}{vehicle.aciklama || vehicle.model}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Glasmorfik Muayene Takip Alanı */}
        {isEditing ? (
          <div className="mt-4 bg-slate-900/80 border border-slate-800/80 rounded-xl p-3 flex flex-col gap-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Muayene Tarihi Güncelle</p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="bg-slate-950 border border-slate-850 rounded-lg px-2 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500/50 flex-1 min-h-[32px]"
              />
              <button
                onClick={handleUpdateDate}
                disabled={isUpdating}
                className="bg-cyan-500 hover:bg-cyan-600 text-slate-950 px-2.5 py-1 rounded-lg text-[10px] font-extrabold flex items-center gap-1 transition disabled:opacity-50 min-h-[32px] cursor-pointer"
              >
                {isUpdating ? '...' : '💾 Güncelle'}
              </button>
              <button
                onClick={() => { setIsEditing(false); setNewDate(inspectionDate || '') }}
                className="bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-slate-200 p-1 rounded-lg text-xs transition cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center border border-white/5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 bg-slate-900/50 border border-slate-800/80 rounded-xl p-3 flex justify-between items-center relative group/inspection">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Muayene Geçerlilik</p>
              <p className="text-xs font-semibold text-slate-200 font-mono mt-0.5">
                📅 Son Geçerlilik: {formatToTurkishDate(inspectionDate)}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge className={`text-[10px] font-bold px-2 py-0.5 ${getInspectionStatus(inspectionDate).badgeClass}`}>
                {getInspectionStatus(inspectionDate).text}
              </Badge>
              {canUpdateInspection && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-1 rounded-lg bg-slate-800/60 hover:bg-cyan-500/10 border border-slate-700/50 hover:border-cyan-500/30 text-slate-350 hover:text-cyan-400 transition cursor-pointer flex items-center justify-center"
                  title="Muayene Tarihini Güncelle"
                >
                  <span className="text-[11px] leading-none">✏️</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Sorumlu Personel Dropdown Alanı */}
        {drivers && ers && (
          <div className="mt-4 pt-3.5 border-t border-white/5 space-y-2">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">🔒 Envanter Yetki Sorumluları</p>
            <div className="grid grid-cols-2 gap-3">
              {/* Sorumlu Şoför */}
              <div className="space-y-1">
                <label className="text-[9px] text-slate-400 font-bold uppercase block">Sorumlu Şoför</label>
                <select
                  disabled={!canUpdateResponsibles || isUpdatingResponsibles}
                  value={vehicle.sorumlu_sofor_id || ""}
                  onChange={async (e) => {
                    const val = e.target.value || null;
                    if (onUpdateResponsibles) {
                      setIsUpdatingResponsibles(true);
                      await onUpdateResponsibles(vehicle.plaka, { sorumlu_sofor_id: val });
                      setIsUpdatingResponsibles(false);
                    }
                  }}
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-200 font-sans focus:outline-none focus:border-cyan-500/50 disabled:opacity-50 h-8"
                >
                  <option value="">Seçilmedi</option>
                  {drivers.map(d => (
                    <option key={d.id} value={d.id} className="bg-slate-950 text-slate-200">
                      {d.ad} {d.soyad}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sorumlu Er */}
              <div className="space-y-1">
                <label className="text-[9px] text-slate-400 font-bold uppercase block">Sorumlu Er</label>
                <select
                  disabled={!canUpdateResponsibles || isUpdatingResponsibles}
                  value={vehicle.sorumlu_er_id || ""}
                  onChange={async (e) => {
                    const val = e.target.value || null;
                    if (onUpdateResponsibles) {
                      setIsUpdatingResponsibles(true);
                      await onUpdateResponsibles(vehicle.plaka, { sorumlu_er_id: val });
                      setIsUpdatingResponsibles(false);
                    }
                  }}
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-200 font-sans focus:outline-none focus:border-cyan-500/50 disabled:opacity-50 h-8"
                >
                  <option value="">Seçilmedi</option>
                  {ers.map(er => (
                    <option key={er.id} value={er.id} className="bg-slate-950 text-slate-200">
                      {er.ad} {er.soyad}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

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

