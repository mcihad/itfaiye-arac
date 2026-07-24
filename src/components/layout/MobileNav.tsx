"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  Home, 
  Truck, 
  Menu, 
  X, 
  Users, 
  Wrench, 
  Wind, 
  ClipboardList, 
  Camera, 
  History, 
  ShieldAlert, 
  LayoutDashboard, 
  Map, 
  Building, 
  FileText,
  GraduationCap,
  Combine,
  BookOpen,
  Radio
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { useAuthStore } from '@/lib/authStore'
import { GeofenceButton } from './GeofenceButton'

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string; size?: number }>
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
  const isEr = user?.rol === 'User' || user?.unvan === 'İtfaiye Eri' || user?.unvan?.toLowerCase().includes('er')
  // Şoförler (Şoför, Pos.Baş.Şof.) "Er" olsalar bile Komuta Haritası'nı görebilir
  const isSofor = !!user?.unvan?.toLowerCase().includes('şof')
  const isManager = !!(user?.rol === 'Admin' || user?.rol === 'Editor' || user?.rol === 'Shift_Leader' || 
                    user?.unvan === 'Müdür' || user?.unvan === 'Amir' || 
                    user?.unvan?.toLowerCase().includes('çavuş') || 
                    user?.unvan?.toLowerCase().includes('çvş') || 
                    user?.unvan?.toLowerCase().includes('baş'))

  // Dynamic status match helper
  const isActive = (href: string, matchStart?: string) => {
    if (href === '/yonetim' && pathname !== '/yonetim') return false
    if (matchStart && pathname.startsWith(matchStart)) return true
    return pathname === href || pathname.startsWith(href + '/')
  }

  // Structured strategic grouping (shared with Sidebar)
  const groups: NavGroup[] = [
    {
      title: "ANLIK DURUM & KOMUTA",
      items: [
        { href: "/yonetim", label: "Gösterge Paneli", icon: LayoutDashboard, visible: true },
        { href: "/yonetim/harita", label: "Komuta Haritası (CBS)", icon: Map, visible: !isEr || isSofor },
        { href: "/yonetim/telsiz", label: "Dijital Telsiz", icon: Radio, visible: true },
      ]
    },
    {
      title: "FİLO & LOJİSTİK YÖNETİMİ",
      items: [
        { href: "/araclar", label: "Araç Filosu & Envanter", icon: Truck, visible: true, matchStart: '/arac/' },
        { href: "/yonetim/tarayici", label: "QR Araç Tara", icon: Camera, visible: true },
        { href: "/yonetim/envanter", label: "Envanter Yönetimi", icon: Combine, visible: true },
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
        { href: "/yonetim/yetkiler", label: "Yetki & Rol Matrisi", icon: ShieldAlert, visible: user?.rol === 'Admin' || user?.unvan === 'Müdür' },
        { href: "/yonetim/raporlar", label: "Sistem Raporları & Loglar", icon: History, visible: isManager },
        { href: "/yonetim/kilavuz", label: "Kullanım Kılavuzu", icon: BookOpen, visible: true },
      ]
    }
  ]

  const navLink = (href: string, icon: React.ReactNode, label: string) => (
    <Link
      href={href}
      onClick={() => setMenuOpen(false)}
      className={cn(
        "flex flex-col items-center justify-center w-full py-2 transition-all duration-200 relative min-h-[56px]",
        isActive(href) ? "text-[var(--fd-accent)] font-semibold" : "text-[var(--fd-text3)] hover:text-[var(--fd-text)] active:text-[var(--fd-accent)]/80"
      )}
    >
      {icon}
      <span className="text-[10px] mt-1 font-medium leading-none font-sans">{label}</span>
      {isActive(href) && (
        <div className="absolute top-0 w-10 h-1 bg-[var(--fd-accent)] rounded-b-md shadow-[0_2px_8px_var(--fd-accent-soft2)]" />
      )}
    </Link>
  )

  return (
    <>
      {/* Expanded Menu Overlay (Drawer) */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex flex-col justify-end">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMenuOpen(false)} />
          
          {/* Drawer Sheet */}
          <div className="relative z-50 bg-[var(--fd-surface)] border-t border-[var(--fd-border)] shadow-[var(--fd-shadow-lg)] rounded-t-2xl p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] max-h-[90vh] overflow-hidden flex flex-col space-y-4 animate-in slide-in-from-bottom duration-300">
            {/* Header */}
            <div className="flex justify-between items-center border-b border-[var(--fd-border)] pb-3">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 rounded-full bg-[var(--fd-accent)] animate-pulse" />
                <h3 className="font-bold text-xs text-[var(--fd-accent)] tracking-wider uppercase font-sans">Taktiksel HUD Modülleri</h3>
              </div>
              <button 
                onClick={() => setMenuOpen(false)} 
                className="p-2 rounded-lg hover:bg-[var(--fd-surface2)] text-[var(--fd-text3)] hover:text-[var(--fd-text)] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Görev Başlat / Bitir Geofence Mobil Kontrol Butonu Enjeksiyonu */}
            <div className="w-full animate-in slide-in-from-top-2 duration-300">
              <GeofenceButton isMobile={true} />
            </div>
            
            {/* Group Lists */}
            <div className="space-y-6 overflow-y-auto max-h-[calc(100vh-160px)] pb-[calc(8rem+env(safe-area-inset-bottom))] flex-1">
              {groups.map((group, gIdx) => {
                const visibleItems = group.items.filter(item => item.visible)
                if (visibleItems.length === 0) return null
                
                return (
                  <div key={gIdx} className="space-y-2">
                    <span className="text-[12px] font-bold uppercase tracking-wider text-[var(--fd-text3)] px-3 block mb-2 mt-2 font-sans">
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
                              "flex items-center gap-3 p-3 rounded-xl transition-all duration-200 min-h-[48px] border-l-2 text-sm font-medium font-sans",
                              active
                                ? "bg-[var(--fd-accent-soft2)] text-[var(--fd-accent)] border-[var(--fd-accent)] font-bold"
                                : "text-[var(--fd-text2)] border-transparent hover:bg-[var(--fd-surface2)] hover:text-[var(--fd-text)]"
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

              {/* Menü Alt Bar Taşma Kalkanı */}
              <div 
                className="w-full block pointer-events-none clear-both" 
                style={{ height: 'calc(7rem + env(safe-area-inset-bottom))' }} 
                aria-hidden="true" 
              />
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation Bar */}
      <nav 
        className="md:hidden fixed bottom-0 left-0 right-0 border-t border-[var(--fd-border)] bg-[var(--fd-surface)]/95 backdrop-blur-md flex items-center justify-around z-50 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]"
        style={{ minHeight: 'calc(72px + env(safe-area-inset-bottom, 0px))', height: 'auto', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {navLink("/yonetim", <Home size={22} />, "Ana Sayfa")}
        {navLink("/araclar", <Truck size={22} />, "Filo")}
        
        {/* ★ QR Tarayıcı — Ortada Belirgin Yüzen Buton */}
        <Link
          href="/yonetim/tarayici"
          onClick={() => setMenuOpen(false)}
          className="flex flex-col items-center justify-center relative -mt-5"
        >
          <div className={cn(
            "w-14 h-14 rounded-full flex items-center justify-center shadow-[var(--fd-shadow)] transition-all active:scale-95",
            isActive('/yonetim/tarayici')
              ? "bg-[var(--fd-accent)] text-white ring-2 ring-[var(--fd-accent)]/20 shadow-[0_4px_12px_var(--fd-accent-soft2)]"
              : "bg-[var(--fd-accent)]/90 text-white hover:bg-[var(--fd-accent)] shadow-[0_4px_12px_var(--fd-accent-soft)]"
          )}>
            <Camera size={26} />
          </div>
          <span className={cn(
            "text-[10px] mt-1 font-bold leading-none font-sans",
            isActive('/yonetim/tarayici') ? "text-[var(--fd-accent)]" : "text-[var(--fd-text3)]"
          )}>QR Tara</span>
        </Link>

        {navLink("/yonetim/envanter", <Combine size={22} />, "Envanter")}
        
        <button 
          onClick={() => setMenuOpen(!menuOpen)}
          className={cn(
            "flex flex-col items-center justify-center w-full py-2 transition-all duration-200 min-h-[56px] cursor-pointer",
            menuOpen ? "text-[var(--fd-accent)] font-semibold" : "text-[var(--fd-text3)] hover:text-[var(--fd-text)] active:text-[var(--fd-accent)]/80"
          )}
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
          <span className="text-[10px] mt-1 font-medium leading-none font-sans">Menü</span>
        </button>
      </nav>
    </>
  )
}
