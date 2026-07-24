"use client"

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { 
  LayoutDashboard, 
  Map, 
  Truck, 
  Camera, 
  Wrench, 
  Wind, 
  ClipboardList, 
  Users, 
  GraduationCap, 
  Building, 
  FileText, 
  ShieldAlert, 
  History,
  Combine,
  BookOpen,
  Radio,
  ChevronDown,
  ChevronRight
} from 'lucide-react'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { useAuthStore } from '@/lib/authStore'
import { useThemeStore } from '@/lib/themeStore'
import { cn } from '@/lib/utils'

interface SubMenuItem {
  href: string
  label: string
  icon: any
  visible: boolean
  matchStart?: string
}

interface MenuItem {
  label: string
  icon: any
  visible: boolean
  href?: string
  matchStart?: string
  subItems?: SubMenuItem[]
}

interface MenuGroup {
  title: string
  items: MenuItem[]
}

export function Sidebar() {
  const pathname = usePathname()
  const { user } = useAuthStore()
  const { sidebarCollapsed } = useThemeStore()
  const isEr = user?.rol === 'User' || user?.unvan === 'İtfaiye Eri' || user?.unvan?.toLowerCase().includes('er')
  // Şoförler (Şoför, Pos.Baş.Şof.) "Er" olsalar bile Komuta Haritası'nı görebilir
  const isSofor = !!user?.unvan?.toLowerCase().includes('şof')
  const isManager = !!(user?.rol === 'Admin' || user?.rol === 'Editor' || user?.rol === 'Shift_Leader' || 
                    user?.unvan === 'Müdür' || user?.unvan === 'Amir' || 
                    user?.unvan?.toLowerCase().includes('çavuş') || 
                    user?.unvan?.toLowerCase().includes('çvş') || 
                    user?.unvan?.toLowerCase().includes('baş'))

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const [isHovered, setIsHovered] = useState(false)

  // Combined expanded status (either explicitly opened, or hovered while collapsed)
  const isExpanded = !sidebarCollapsed || isHovered

  // Dynamic status match helper
  const isActive = (href: string, matchStart?: string) => {
    if (href === '/yonetim' && pathname !== '/yonetim') return false
    if (matchStart && pathname.startsWith(matchStart)) return true
    return pathname === href || pathname.startsWith(href + '/')
  }

  // Structured strategic grouping (3-level hierarchy with icons)
  const groups: MenuGroup[] = [
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
        {
          label: "Araç & Envanter İşlemleri",
          icon: Truck,
          visible: true,
          subItems: [
            { href: "/araclar", label: "Araç Filosu & Envanter", icon: Truck, visible: true, matchStart: '/arac/' },
            { href: "/yonetim/tarayici", label: "QR Araç Tara", icon: Camera, visible: true },
            { href: "/yonetim/envanter", label: "Envanter Yönetimi", icon: Combine, visible: true },
            { href: "/yonetim/arac-bakim", label: "Araç Bakım & Yakıt", icon: Wrench, visible: !isEr },
            { href: "/scba", label: "SCBA Tüp Takibi", icon: Wind, visible: !isEr },
          ]
        }
      ]
    },
    {
      title: "KARARGÂH & İDARİ",
      items: [
        {
          label: "İdari İşlemler",
          icon: Users,
          visible: true,
          subItems: [
            { href: "/yonetim/gorevler", label: "Görev & Devir-Teslim", icon: ClipboardList, visible: true },
            { href: "/yonetim/personel", label: "Personel Yönetimi", icon: Users, visible: !isEr },
            { href: "/yonetim/egitimler", label: "Eğitim & Faaliyetler", icon: GraduationCap, visible: !isEr },
          ]
        }
      ]
    },
    {
      title: "RESMİ İŞLEMLER & SİSTEM",
      items: [
        {
          label: "Sistem & Kayıtlar",
          icon: FileText,
          visible: true,
          subItems: [
            { href: "/yonetim/hizmetler", label: "Hizmet Başvuruları", icon: Building, visible: !isEr },
            { href: "/yonetim/olaylar", label: "Olay & Vaka Raporları", icon: FileText, visible: !isEr },
            { href: "/yonetim/yetkiler", label: "Yetki & Rol Matrisi", icon: ShieldAlert, visible: user?.rol === 'Admin' || user?.unvan === 'Müdür' },
            { href: "/yonetim/raporlar", label: "Sistem Raporları & Loglar", icon: History, visible: isManager },
            { href: "/yonetim/kilavuz", label: "Kullanım Kılavuzu", icon: BookOpen, visible: true },
          ]
        }
      ]
    }
  ]

  // Automatically open groups if a child is active (only in expanded state)
  useEffect(() => {
    if (!isExpanded) return
    const nextOpenGroups = { ...openGroups }
    let changed = false
    groups.forEach(group => {
      group.items.forEach(item => {
        if (item.subItems) {
          const hasActiveChild = item.subItems.some(sub => isActive(sub.href, sub.matchStart))
          if (hasActiveChild && !openGroups[item.label]) {
            nextOpenGroups[item.label] = true
            changed = true
          }
        }
      })
    })
    if (changed) {
      setOpenGroups(nextOpenGroups)
    }
  }, [pathname, isExpanded])

  const toggleGroup = (label: string) => {
    setOpenGroups(prev => ({
      ...prev,
      [label]: !prev[label]
    }))
  }

  return (
    <>
      {/* Spacer layout placeholder to prevent main content layout shifting on hover open */}
      <div className={cn(
        "hidden md:block shrink-0 transition-all duration-300",
        sidebarCollapsed ? "w-[74px]" : "w-[266px]"
      )} />

      {/* Floating / fixed Sidebar with Hover Reveal */}
      <aside 
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={cn(
          "hidden flex-col border-r border-[var(--fd-side-border)] bg-[var(--fd-side-bg)] md:flex shadow-2xl z-40 transition-all duration-300 h-screen fixed top-0 left-0 overflow-y-auto overflow-x-hidden",
          isExpanded ? "w-[266px]" : "w-[74px]"
        )}
      >
        {/* Brand Header */}
        <div className={cn(
          "flex h-[60px] items-center border-b border-[var(--fd-side-border)] shrink-0 transition-all duration-300",
          isExpanded ? "px-[calc(var(--fd-sp)*3)] space-x-3" : "px-0 justify-center"
        )}>
           <div className="w-8 h-8 rounded-full overflow-hidden bg-white flex items-center justify-center p-0.5 shadow-[var(--fd-shadow)] border border-[var(--fd-side-border)] shrink-0">
             <Image src="/logo-itfaiye.png" alt="Sivas İtfaiyesi" width={28} height={28} className="object-contain rounded-full" />
           </div>
           {isExpanded && (
             <div className="flex flex-col animate-in fade-in duration-200">
               <h1 className="text-[14px] font-bold tracking-tight text-white leading-tight">Sivas İtfaiyesi</h1>
               <span className="text-[10px] text-[var(--fd-side-dim)] font-semibold uppercase tracking-widest leading-none mt-0.5">Yönetim Bilgi Sistemi</span>
             </div>
           )}
        </div>

        {/* Navigation Groups */}
        <nav className={cn(
          "flex-1 overflow-y-auto space-y-[calc(var(--fd-sp)*2)] scrollbar-thin scrollbar-thumb-[var(--fd-side-border)] overflow-x-hidden transition-all duration-300",
          isExpanded ? "p-[calc(var(--fd-sp)*2)]" : "p-3 space-y-4"
        )}>
          {groups.map((group, gIdx) => {
            const visibleItems = group.items.filter(item => item.visible)
            if (visibleItems.length === 0) return null

            return (
              <div key={gIdx} className="space-y-1">
                {/* Module Header (Level 1) */}
                {!isExpanded ? (
                  <div className="border-t border-[var(--fd-side-border)] my-3 mx-1" />
                ) : (
                  <div className="flex items-center space-x-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--fd-side-dim)] px-2.5 mb-1.5 mt-1">
                    <span className="truncate">{group.title}</span>
                  </div>
                )}
                
                {/* Branches (Level 2 & 3) */}
                <div className={cn("space-y-1", !isExpanded && "flex flex-col items-center")}>
                  {visibleItems.map((item, iIdx) => {
                    const Icon = item.icon
                    
                    // Render Accordion Group Item
                    if (item.subItems) {
                      const visibleSubs = item.subItems.filter(sub => sub.visible)
                      if (visibleSubs.length === 0) return null

                      const isOpen = !!openGroups[item.label]
                      const hasActiveChild = visibleSubs.some(sub => isActive(sub.href, sub.matchStart))

                      if (!isExpanded) {
                        // Collapsed non-hovered Sidebar View: Show only group icon
                        return (
                          <div key={iIdx} className="relative">
                            <button
                              className={cn(
                                "flex items-center justify-center h-10 w-10 rounded-[var(--fd-r-sm)] border-none bg-transparent cursor-pointer transition-all duration-150",
                                hasActiveChild 
                                  ? "bg-[var(--fd-accent)] text-white shadow-sm" 
                                  : "text-[var(--fd-side-text)] hover:bg-[var(--fd-side-bg2)] hover:text-white"
                              )}
                              title={item.label}
                            >
                              <Icon size={18} strokeWidth={2} />
                            </button>
                          </div>
                        )
                      }

                      // Expanded / Hovered Sidebar View: Show group label and accordion content
                      return (
                        <div key={iIdx} className="space-y-1 w-full animate-in fade-in duration-200">
                          <button
                            onClick={() => toggleGroup(item.label)}
                            className={cn(
                              "group flex items-center justify-between w-full rounded-[var(--fd-r-sm)] px-2.5 py-1.5 text-[13px] font-medium transition-all duration-150 border-none bg-transparent cursor-pointer text-[var(--fd-side-text)] hover:bg-[var(--fd-side-bg2)] hover:text-white",
                              hasActiveChild && "text-white font-semibold"
                            )}
                          >
                            <div className="flex items-center space-x-2.5">
                              <Icon 
                                size={16} 
                                strokeWidth={2} 
                                className={cn("transition-colors shrink-0", hasActiveChild ? "text-[var(--fd-accent)]" : "text-[var(--fd-side-text)] group-hover:text-white")} 
                              />
                              <span className="tracking-tight">{item.label}</span>
                            </div>
                            {isOpen ? <ChevronDown size={14} className="text-[var(--fd-side-dim)]" /> : <ChevronRight size={14} className="text-[var(--fd-side-dim)]" />}
                          </button>

                          {/* Collapsible Subitems List (Level 3) */}
                          {isOpen && (
                            <div className="ml-[18px] pl-3.5 border-l border-[var(--fd-side-border)] space-y-1 py-1 relative">
                              {visibleSubs.map((sub, sIdx) => {
                                const SubIcon = sub.icon
                                const active = isActive(sub.href, sub.matchStart)
                                return (
                                  <Link
                                    key={sIdx}
                                    href={sub.href}
                                    className={cn(
                                      "group flex items-center space-x-2 rounded-[var(--fd-r-sm)] px-3 py-1.5 text-[12.5px] font-medium transition-all duration-150 relative text-[var(--fd-side-text)] hover:bg-[var(--fd-side-bg2)] hover:text-white",
                                      active && "bg-[var(--fd-accent-soft2)] text-white font-semibold before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[var(--fd-accent)]"
                                    )}
                                  >
                                    <SubIcon 
                                      size={13} 
                                      className={cn("transition-colors shrink-0", active ? "text-white" : "text-[var(--fd-side-dim)] group-hover:text-white")} 
                                    />
                                    <span className="tracking-tight">{sub.label}</span>
                                  </Link>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    }

                    // Render Single Page Link
                    const active = item.href ? isActive(item.href, item.matchStart) : false

                    if (!isExpanded) {
                      // Collapsed non-hovered Sidebar View: Tooltip/Icon only
                      return (
                        <div key={iIdx} className="relative">
                          <Link
                            href={item.href || '#'}
                            className={cn(
                              "flex items-center justify-center h-10 w-10 rounded-[var(--fd-r-sm)] transition-all duration-150",
                              active 
                                ? "bg-[var(--fd-accent)] text-white shadow-sm" 
                                : "text-[var(--fd-side-text)] hover:bg-[var(--fd-side-bg2)] hover:text-white"
                            )}
                            title={item.label}
                          >
                            <Icon size={18} strokeWidth={2} />
                          </Link>
                        </div>
                      )
                    }

                    // Expanded / Hovered Sidebar View: Standard text link
                    return (
                      <Link
                        key={iIdx}
                        href={item.href || '#'}
                        className={cn(
                          "group flex items-center space-x-2.5 rounded-[var(--fd-r-sm)] px-2.5 py-1.5 text-[13px] font-medium transition-all duration-150 w-full relative",
                          active
                            ? "bg-[var(--fd-accent)] text-white shadow-sm font-semibold"
                            : "text-[var(--fd-side-text)] hover:bg-[var(--fd-side-bg2)] hover:text-white"
                        )}
                      >
                        <Icon 
                          size={16} 
                          strokeWidth={active ? 2.5 : 2} 
                          className={cn("transition-colors shrink-0", active ? "text-white" : "text-[var(--fd-side-text)] group-hover:text-white")} 
                        />
                        <span className="tracking-tight">{item.label}</span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </nav>

        {/* Theme Toggle & Bottom Info */}
        <div className={cn(
          "p-[calc(var(--fd-sp)*2)] border-t border-[var(--fd-side-border)] flex items-center justify-between bg-[var(--fd-side-bg2)] shrink-0 transition-all duration-300",
          isExpanded ? "" : "p-3 justify-center"
        )}>
          {isExpanded && (
            <span className="text-[10px] font-bold text-[var(--fd-side-dim)] uppercase tracking-[0.05em] animate-in fade-in duration-200">HUD Arayüzü</span>
          )}
          <ThemeToggle />
        </div>
      </aside>
    </>
  )
}
