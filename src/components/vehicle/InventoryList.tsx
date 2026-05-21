import { InventoryItem } from "@/types"
import { Badge } from "@/components/ui/Badge"
import { AlertCircle, CheckCircle2 } from "lucide-react"

function getEquipmentIcon(malzeme: string) {
  const name = (malzeme || "").toLowerCase();
  
  if (name.includes("hortum")) {
    // Hose (Hortum) - Neon Cyan
    return (
      <svg viewBox="0 0 24 24" className="w-5 h-5 text-cyan-400 drop-shadow-[0_0_6px_rgba(34,211,238,0.6)] shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2a10 10 0 1 0 10 10" />
        <path d="M12 6a6 6 0 1 0 6 6" />
        <circle cx="12" cy="12" r="2" fill="currentColor" />
        <path d="M18 12h4" />
      </svg>
    );
  } else if (name.includes("maske") || name.includes("scba") || name.includes("hava")) {
    // SCBA Mask (Maske) - Neon Gold/Amber
    return (
      <svg viewBox="0 0 24 24" className="w-5 h-5 text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.6)] shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M5 3h14l-2 9c0 4-3 7-5 9-2-2-5-5-5-9z" fill="currentColor" fillOpacity="0.15" />
        <circle cx="12" cy="10" r="4" strokeWidth="1.5" />
        <line x1="9" y1="18" x2="15" y2="18" />
        <line x1="10" y1="15" x2="14" y2="15" />
      </svg>
    );
  } else if (name.includes("kesici") || name.includes("ayırıcı") || name.includes("hilti") || name.includes("kesme")) {
    // Heavy Hydraulic Tool (Kesici) - Neon Rose
    return (
      <svg viewBox="0 0 24 24" className="w-5 h-5 text-rose-400 drop-shadow-[0_0_6px_rgba(251,113,133,0.6)] shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 12l4-4h10l2 4-2 4H8z" />
        <path d="M8 8l6-6 6 6" />
        <path d="M8 16l6 6 6-6" />
        <circle cx="12" cy="12" r="2" fill="currentColor" />
      </svg>
    );
  } else if (name.includes("balta") || name.includes("kazma") || name.includes("kürek")) {
    // Axe / Halligan / Tactical tools - Neon Emerald
    return (
      <svg viewBox="0 0 24 24" className="w-5 h-5 text-emerald-400 drop-shadow-[0_0_6px_rgba(52,211,153,0.6)] shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M15 4h5v5h-5l-3-3z" fill="currentColor" fillOpacity="0.15" />
        <path d="M12 6L4 20" />
        <path d="M15 4c-2 3-2 4 0 5" />
      </svg>
    );
  } else if (name.includes("jeneratör") || name.includes("motor") || name.includes("pompa") || name.includes("güç")) {
    // Engine / Generator - Neon Indigo
    return (
      <svg viewBox="0 0 24 24" className="w-5 h-5 text-indigo-400 drop-shadow-[0_0_6px_rgba(129,140,248,0.6)] shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <line x1="6" y1="6" x2="6" y2="18" />
        <line x1="18" y1="6" x2="18" y2="18" />
        <circle cx="12" cy="12" r="3" fill="currentColor" fillOpacity="0.1" />
        <line x1="12" y1="9" x2="12" y2="15" />
        <line x1="9" y1="12" x2="15" y2="12" />
      </svg>
    );
  } else if (name.includes("projektör") || name.includes("fener") || name.includes("lamba") || name.includes("aydınlatma")) {
    // Spotlight (Projektör) - Neon Yellow
    return (
      <svg viewBox="0 0 24 24" className="w-5 h-5 text-yellow-300 drop-shadow-[0_0_6px_rgba(253,224,71,0.6)] shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 8L6 12l12 4z" fill="currentColor" fillOpacity="0.15" />
        <rect x="2" y="10" width="4" height="4" rx="1" />
        <line x1="18" y1="8" x2="22" y2="6" strokeDasharray="2 2" />
        <line x1="18" y1="12" x2="23" y2="12" />
        <line x1="18" y1="16" x2="22" y2="18" strokeDasharray="2 2" />
      </svg>
    );
  } else {
    // General equipment - Neon Slate
    return (
      <svg viewBox="0 0 24 24" className="w-5 h-5 text-slate-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" fillOpacity="0.05" />
        <line x1="9" y1="3" x2="9" y2="21" />
        <line x1="15" y1="3" x2="15" y2="21" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="3" y1="15" x2="21" y2="15" />
      </svg>
    );
  }
}

export function InventoryList({ items }: { items: InventoryItem[] }) {
  if (!items || items.length === 0) {
    return <p className="text-slate-500 font-mono italic text-xs p-4">Bu bölmede kayıtlı taktik malzeme bulunmuyor.</p>
  }

  return (
    <ul className="divide-y divide-white/5 bg-slate-950/20 rounded-xl overflow-hidden border border-white/5">
      {items.map((item, idx) => {
        const isOk = item.durum === 'Tam'
        return (
          <li key={idx} className="flex items-center justify-between py-3 px-4 hover:bg-slate-800/30 transition-colors duration-200">
            <div className="flex items-center space-x-3.5 min-w-0">
              <div className="p-1 rounded bg-slate-900/60 border border-white/5 flex items-center justify-center">
                {getEquipmentIcon(item.malzeme)}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-200 tracking-tight truncate">{item.malzeme}</p>
                <p className="text-[10px] font-mono text-slate-400 mt-0.5">MİKTAR: <span className="font-bold text-cyan-400">{item.adet}</span></p>
              </div>
            </div>
            <div className="flex items-center space-x-2 shrink-0">
              {isOk ? (
                <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-bold font-mono px-1.5 py-0">TAM</Badge>
              ) : item.durum === 'Kayıp/Yok' ? (
                <Badge className="bg-rose-500/15 text-rose-400 border border-rose-500/25 text-[9px] font-bold font-mono px-1.5 py-0 animate-pulse">KAYIP</Badge>
              ) : (
                <Badge className="bg-amber-500/15 text-amber-400 border border-amber-500/25 text-[9px] font-bold font-mono px-1.5 py-0">EKSİK</Badge>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

