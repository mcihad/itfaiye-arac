"use client"

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { 
  LayoutDashboard, 
  Map, 
  Truck, 
  Camera, 
  ScanLine, 
  Wrench, 
  Wind, 
  ClipboardList, 
  Users, 
  GraduationCap, 
  Building, 
  FileText, 
  ShieldAlert, 
  History 
} from 'lucide-react'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { useAuthStore } from '@/lib/authStore'
import { cn } from '@/lib/utils'

export function Sidebar() {
  const pathname = usePathname()
  const { user } = useAuthStore()
  const isEr = user?.rol === 'User'

  // Dynamic status match helper
  const isActive = (href: string, matchStart?: string) => {
    if (href === '/' && pathname !== '/') return false
    if (matchStart && pathname.startsWith(matchStart)) return true
    return pathname === href || pathname.startsWith(href + '/')
  }

  // Structured strategic grouping
  const groups = [
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
        { href: "/yonetim/tarayici", label: "QR Araç Tara", icon: Camera, visible: true },
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

  return (
    <aside className="hidden w-64 flex-col border-r border-slate-900 bg-slate-950/80 backdrop-blur-xl md:flex">
      {/* Brand Header */}
      <div className="flex h-16 items-center px-6 border-b border-slate-900 space-x-3">
         <Image src="/logo-itfaiye.png" alt="Logo" width={32} height={32} className="object-contain" />
         <div className="flex flex-col">
           <h1 className="text-sm font-bold tracking-wider text-slate-100 uppercase">Sivas İtfaiyesi</h1>
           <span className="text-[9px] text-cyan-500 font-semibold tracking-widest uppercase">Komuta Merkezi</span>
         </div>
      </div>

      {/* Navigation Groups */}
      <nav className="flex-1 p-4 overflow-y-auto space-y-6 scrollbar-thin scrollbar-thumb-slate-800">
        {groups.map((group, gIdx) => {
          const visibleItems = group.items.filter(item => item.visible)
          if (visibleItems.length === 0) return null

          return (
            <div key={gIdx} className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 block mb-2">
                {group.title}
              </span>
              <div className="space-y-1">
                {visibleItems.map((item, iIdx) => {
                  const Icon = item.icon
                  const active = isActive(item.href, item.matchStart)

                  return (
                    <Link
                      key={iIdx}
                      href={item.href}
                      className={cn(
                        "flex items-center space-x-3 rounded-md px-3 py-2 text-xs font-medium transition-all duration-200 border-l-2",
                        active
                          ? "bg-cyan-500/10 text-cyan-400 border-cyan-500 shadow-[inset_10px_0_15px_-10px_rgba(6,182,212,0.15)] font-semibold"
                          : "text-slate-400 border-transparent hover:bg-slate-900/50 hover:text-slate-200"
                      )}
                    >
                      <Icon size={16} />
                      <span>{item.label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
      </nav>

      {/* Theme Toggle & Bottom Info */}
      <div className="p-4 border-t border-slate-900 flex items-center justify-between bg-slate-950/50">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">HUD Arayüzü</span>
        <ThemeToggle />
      </div>
    </aside>
  )
}
