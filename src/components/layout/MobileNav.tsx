"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  Home, 
  Truck, 
  ScanLine, 
  Menu, 
  X, 
  Users, 
  Wrench, 
  Wind, 
  ClipboardList, 
  History, 
  ShieldAlert, 
  LayoutDashboard, 
  Map, 
  Building, 
  FileText,
  GraduationCap,
  Combine
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { useAuthStore } from '@/lib/authStore'

interface NavItem {
  href: string
  label: string
  icon: any
  visible: boolean
  matchStart?: string
}

interface NavGroup {
  title: string
  items: NavItem[]
}

export function MobileNav() {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const { user } = useAuthStore()
  const isEr = user?.rol === 'User'

  // Dynamic status match helper
  const isActive = (href: string, matchStart?: string) => {
    if (href === '/' && pathname !== '/') return false
    if (matchStart && pathname.startsWith(matchStart)) return true
    return pathname === href || pathname.startsWith(href + '/')
  }

  // Structured strategic grouping (shared with Sidebar)
  const groups: NavGroup[] = [
    {
      title: "ANLIK DURUM & KOMUTA",
      items: [
        { href: "/", label: "Gösterge Paneli", icon: LayoutDashboard, visible: true },
        { href: "/yonetim/harita", label: "Komuta Haritası (CBS)", icon: Map, visible: !isEr },
      ]
    },
    {
      title: "FİLO & LOJİSTİK YÖNETİMİ",
      items: [
        { href: "/araclar", label: "Araç Filosu & Envanter", icon: Truck, visible: !isEr, matchStart: '/arac/' },
        { href: "/envanter-yonetimi", label: "Envanter Yönetimi", icon: Combine, visible: !isEr },
        { href: "/barkod", label: "Barkod Oku", icon: ScanLine, visible: true },
        { href: "/yonetim/arac-bakim", label: "Araç Bakım & Yakıt", icon: Wrench, visible: !isEr },
        { href: "/scba", label: "SCBA Tüp Takibi", icon: Wind, visible: !isEr },
      ]
    },
    {
      title: "KARARGÂH & İDARİ",
      items: [
        { href: "/yonetim/gorevler", label: "Görev & Devir-Teslim", icon: ClipboardList, visible: true },
        { href: "/yonetim/personel", label: "Personel Yönetimi", icon: Users, visible: !isEr },
        { href: "/yonetim/egitimler", label: "Eğitim & Faaliyetler", icon: GraduationCap, visible: !isEr },
      ]
    },
    {
      title: "RESMİ İŞLEMLER & SİSTEM",
      items: [
        { href: "/yonetim/hizmetler", label: "Hizmet Başvuruları", icon: Building, visible: !isEr },
        { href: "/yonetim/olaylar", label: "Olay & Vaka Raporları", icon: FileText, visible: !isEr },
        { href: "/yonetim/yetkiler", label: "Yetki & Rol Matrisi", icon: ShieldAlert, visible: user?.rol === 'Müdür' || user?.rol === 'Admin' },
        { href: "/yonetim/raporlar", label: "Sistem Raporları & Loglar", icon: History, visible: !isEr },
      ]
    }
  ]

  const navLink = (href: string, icon: React.ReactNode, label: string) => (
    <Link
      href={href}
      onClick={() => setMenuOpen(false)}
      className={cn(
        "flex flex-col items-center justify-center w-full py-2 transition-all duration-200 relative min-h-[56px]",
        isActive(href) ? "text-cyan-400 font-semibold" : "text-slate-400 hover:text-slate-200 active:text-cyan-400/80"
      )}
    >
      {icon}
      <span className="text-[10px] mt-1 font-medium leading-none">{label}</span>
      {isActive(href) && (
        <div className="absolute top-0 w-10 h-1 bg-cyan-500 rounded-b-md shadow-[0_2px_8px_rgba(6,182,212,0.5)]" />
      )}
    </Link>
  )

  return (
    <>
      {/* Expanded Menu Overlay (Drawer) */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex flex-col justify-end">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setMenuOpen(false)} />
          
          {/* Drawer Sheet */}
          <div className="relative z-50 bg-slate-950/95 border-t border-slate-900 rounded-t-2xl p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] max-h-[80vh] overflow-y-auto space-y-6 animate-in slide-in-from-bottom duration-300">
            {/* Header */}
            <div className="flex justify-between items-center border-b border-slate-900 pb-3">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
                <h3 className="font-bold text-xs text-cyan-400 tracking-wider uppercase">Taktiksel HUD Modülleri</h3>
              </div>
              <button 
                onClick={() => setMenuOpen(false)} 
                className="p-2 rounded-lg hover:bg-slate-900 text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Group Lists */}
            <div className="space-y-6">
              {groups.map((group, gIdx) => {
                const visibleItems = group.items.filter(item => item.visible)
                if (visibleItems.length === 0) return null
                
                return (
                  <div key={gIdx} className="space-y-2">
                    <span className="text-[12px] font-bold uppercase tracking-wider text-slate-400 px-3 block mb-2 mt-2">
                      {group.title}
                    </span>
                    <div className="grid grid-cols-1 gap-1">
                      {visibleItems.map((item, iIdx) => {
                        const Icon = item.icon
                        const active = isActive(item.href, item.matchStart)
                        return (
                          <Link
                            key={iIdx}
                            href={item.href}
                            onClick={() => setMenuOpen(false)}
                            className={cn(
                              "flex items-center gap-3 p-3 rounded-xl transition-all duration-200 min-h-[48px] border-l-2 text-sm font-medium",
                              active
                                ? "bg-cyan-500/10 text-cyan-400 border-cyan-500 shadow-[inset_10px_0_15px_-10px_rgba(6,182,212,0.15)] font-bold"
                                : "text-slate-200 border-transparent hover:bg-slate-900/50 hover:text-white"
                            )}
                          >
                            <Icon className="w-5 h-5" />
                            <span>{item.label}</span>
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation Bar */}
      <nav 
        className="md:hidden fixed bottom-0 left-0 right-0 border-t border-slate-900 bg-slate-950/95 backdrop-blur-xl flex items-center justify-around z-50 shadow-[0_-4px_12px_rgba(0,0,0,0.3)]"
        style={{ height: 'calc(72px + env(safe-area-inset-bottom, 0px))', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {navLink("/", <Home size={22} />, "Ana Sayfa")}
        {!isEr && navLink("/araclar", <Truck size={22} />, "Filo")}
        
        {/* ★ Barkod Tarayıcı — Ortada Belirgin Yüzen Buton */}
        <Link
          href="/barkod"
          onClick={() => setMenuOpen(false)}
          className="flex flex-col items-center justify-center relative -mt-5"
        >
          <div className={cn(
            "w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95",
            isActive('/barkod')
              ? "bg-cyan-500 text-slate-950 ring-4 ring-cyan-500/20 shadow-cyan-500/30"
              : "bg-cyan-500/90 text-slate-950 hover:bg-cyan-500 shadow-cyan-500/20"
          )}>
            <ScanLine size={26} />
          </div>
          <span className={cn(
            "text-[10px] mt-1 font-bold leading-none",
            isActive('/barkod') ? "text-cyan-400" : "text-slate-400"
          )}>Barkod</span>
        </Link>

        {!isEr && navLink("/envanter-yonetimi", <Combine size={22} />, "Envanter")}
        
        <button 
          onClick={() => setMenuOpen(!menuOpen)}
          className={cn(
            "flex flex-col items-center justify-center w-full py-2 transition-all duration-200 min-h-[56px]",
            menuOpen ? "text-cyan-400 font-semibold" : "text-slate-400 hover:text-slate-200 active:text-cyan-400/80"
          )}
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
          <span className="text-[10px] mt-1 font-medium leading-none">Menü</span>
        </button>
      </nav>
    </>
  )
}
