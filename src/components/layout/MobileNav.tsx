"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Truck, ScanLine, Menu, X, Users, ListChecks, Wrench, Wind, FileText, Camera, History, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { useAuthStore } from '@/lib/authStore'

export function MobileNav() {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const { user } = useAuthStore()
  const isEr = user?.rol === 'User'

  const isActive = (path: string) => {
    if (path === '/' && pathname !== '/') return false
    return pathname.startsWith(path)
  }

  const navLink = (href: string, icon: React.ReactNode, label: string) => (
    <Link
      href={href}
      onClick={() => setMenuOpen(false)}
      className={cn(
        "flex flex-col items-center justify-center w-full py-2 transition-colors relative min-h-[56px]",
        isActive(href) ? "text-primary" : "text-muted-foreground active:text-primary/70"
      )}
    >
      {icon}
      <span className="text-[10px] mt-1 font-medium leading-none">{label}</span>
      {isActive(href) && <div className="absolute top-0 w-10 h-1 bg-primary rounded-b-md" />}
    </Link>
  )

  return (
    <>
      {/* Expanded Menu Overlay */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMenuOpen(false)} />
          <div className="relative z-50 bg-surface border-t border-border rounded-t-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] space-y-2 animate-in slide-in-from-bottom duration-200">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold text-sm">Tüm Modüller</h3>
              <button onClick={() => setMenuOpen(false)} className="p-2 rounded-lg hover:bg-muted"><X className="w-5 h-5" /></button>
            </div>
            
            {!isEr && (
              <Link href="/scba" onClick={() => setMenuOpen(false)} className={cn("flex items-center gap-3 p-3 rounded-xl transition-colors min-h-[52px]", isActive('/scba') ? "bg-primary/10 text-primary" : "hover:bg-muted")}>
                <Wind className="w-5 h-5" /> <span className="font-medium">SCBA Tüp Takibi</span>
              </Link>
            )}
            
            <Link href="/gorevler" onClick={() => setMenuOpen(false)} className={cn("flex items-center gap-3 p-3 rounded-xl transition-colors min-h-[52px]", isActive('/gorevler') ? "bg-primary/10 text-primary" : "hover:bg-muted")}>
              <FileText className="w-5 h-5" /> <span className="font-medium">Görevler & Teslim</span>
            </Link>

            {!isEr && (
              <>
                <Link href="/yonetim/arac-bakim" onClick={() => setMenuOpen(false)} className={cn("flex items-center gap-3 p-3 rounded-xl transition-colors min-h-[52px]", isActive('/yonetim/arac-bakim') ? "bg-primary/10 text-primary" : "hover:bg-muted")}>
                  <Wrench className="w-5 h-5" /> <span className="font-medium">Bakım & Yakıt</span>
                </Link>
                <Link href="/yonetim/yetkiler" onClick={() => setMenuOpen(false)} className={cn("flex items-center gap-3 p-3 rounded-xl transition-colors min-h-[52px]", isActive('/yonetim/yetkiler') ? "bg-primary/10 text-primary" : "hover:bg-muted")}>
                  <Shield className="w-5 h-5 text-primary" /> <span className="font-medium">Yetki & Rol Matrisi</span>
                </Link>
                <Link href="/yonetim/personel" onClick={() => setMenuOpen(false)} className={cn("flex items-center gap-3 p-3 rounded-xl transition-colors min-h-[52px]", isActive('/yonetim/personel') ? "bg-primary/10 text-primary" : "hover:bg-muted")}>
                  <Users className="w-5 h-5" /> <span className="font-medium">Personel Yönetimi</span>
                </Link>
                <Link href="/yonetim/raporlar" onClick={() => setMenuOpen(false)} className={cn("flex items-center gap-3 p-3 rounded-xl transition-colors min-h-[52px]", isActive('/yonetim/raporlar') ? "bg-primary/10 text-primary" : "hover:bg-muted")}>
                  <History className="w-5 h-5" /> <span className="font-medium">Raporlar & Loglar</span>
                </Link>
                <Link href="/yonetim/sablonlar" onClick={() => setMenuOpen(false)} className={cn("flex items-center gap-3 p-3 rounded-xl transition-colors min-h-[52px]", isActive('/yonetim/sablonlar') ? "bg-primary/10 text-primary" : "hover:bg-muted")}>
                  <ListChecks className="w-5 h-5" /> <span className="font-medium">Görev Şablonları</span>
                </Link>
              </>
            )}

            <Link href="/yonetim/tarayici" onClick={() => setMenuOpen(false)} className={cn("flex items-center gap-3 p-3 rounded-xl transition-colors min-h-[52px] border border-orange-500/20", isActive('/yonetim/tarayici') ? "bg-orange-500/10 text-orange-500" : "hover:bg-orange-500/5 text-orange-500")}>
              <Camera className="w-5 h-5" /> <span className="font-medium">📷 QR Araç Tara</span>
            </Link>
          </div>
        </div>
      )}

      {/* Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-border bg-surface/95 backdrop-blur-md flex items-center justify-around z-50 shadow-[0_-4px_12px_rgba(0,0,0,0.12)]"
           style={{ height: 'calc(72px + env(safe-area-inset-bottom, 0px))', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {navLink("/", <Home size={22} />, "Ana Sayfa")}
        {!isEr && navLink("/araclar", <Truck size={22} />, "Araçlar")}
        
        {/* ★ Barkod Tarayıcı — Ortada Belirgin Yüzen Buton */}
        <Link
          href="/barkod"
          onClick={() => setMenuOpen(false)}
          className="flex flex-col items-center justify-center relative -mt-5"
        >
          <div className={cn(
            "w-14 h-14 rounded-full flex items-center justify-center shadow-lg shadow-primary/30 transition-all active:scale-95",
            isActive('/barkod')
              ? "bg-primary text-white ring-4 ring-primary/20"
              : "bg-primary/90 text-white hover:bg-primary"
          )}>
            <ScanLine size={26} />
          </div>
          <span className={cn(
            "text-[10px] mt-1 font-bold leading-none",
            isActive('/barkod') ? "text-primary" : "text-muted-foreground"
          )}>Barkod</span>
        </Link>

        {!isEr && navLink("/envanter-yonetimi", <Truck size={22} />, "Envanter")}
        
        <button 
          onClick={() => setMenuOpen(!menuOpen)}
          className={cn(
            "flex flex-col items-center justify-center w-full py-2 transition-colors min-h-[56px]",
            menuOpen ? "text-primary" : "text-muted-foreground active:text-primary/70"
          )}
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
          <span className="text-[10px] mt-1 font-medium leading-none">Menü</span>
        </button>
      </nav>
    </>
  )
}
