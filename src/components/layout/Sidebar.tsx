"use client"

import Link from 'next/link'
import Image from 'next/image'
import { Home, Truck, Users, Wrench, FileText, ScanLine, Wind, ListChecks, BarChart3, GraduationCap, Map, Camera, History } from 'lucide-react'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { useAuthStore } from '@/lib/authStore'

export function Sidebar() {
  const { user } = useAuthStore()
  const isEr = user?.rol === 'User'

  return (
    <aside className="hidden w-64 flex-col border-r border-border bg-surface md:flex">
      <div className="flex h-16 items-center px-6 border-b border-border space-x-3">
         <Image src="/logo-itfaiye.png" alt="Logo" width={32} height={32} className="object-contain" />
         <h1 className="text-lg font-bold tracking-tight text-foreground">Sivas İtfaiyesi</h1>
      </div>
      <nav className="flex-1 space-y-2 p-4 overflow-y-auto">
        <Link href="/" className="flex items-center space-x-3 rounded-md px-3 py-2 bg-primary/10 text-primary font-medium">
          <Home size={20} />
          <span>Dashboard</span>
        </Link>
        
        {!isEr && (
          <Link href="/araclar" className="flex items-center space-x-3 rounded-md px-3 py-2 hover:bg-muted text-muted-foreground hover:text-foreground">
            <Truck size={20} />
            <span>Araçlar</span>
          </Link>
        )}

        <Link href="/barkod" className="flex items-center space-x-3 rounded-md px-3 py-2 bg-primary/10 text-primary font-bold shadow-sm">
          <ScanLine size={20} />
          <span>Barkod Oku</span>
        </Link>
        <Link href="/yonetim/tarayici" className="flex items-center space-x-3 rounded-md px-3 py-2 bg-orange-500/10 text-orange-500 font-bold shadow-sm">
          <Camera size={20} />
          <span>📷 QR Araç Tara</span>
        </Link>

        {!isEr && (
          <>
            <Link href="/envanter-yonetimi" className="flex items-center space-x-3 rounded-md px-3 py-2 hover:bg-muted text-muted-foreground hover:text-foreground">
              <ScanLine size={20} className="opacity-0" />
              <span>Envanter Yönetimi</span>
            </Link>
            <Link href="/bakim" className="flex items-center space-x-3 rounded-md px-3 py-2 hover:bg-muted text-muted-foreground hover:text-foreground">
              <Wrench size={20} />
              <span>Bakım & Yakıt</span>
            </Link>
            <Link href="/scba" className="flex items-center space-x-3 rounded-md px-3 py-2 hover:bg-cyan-500/10 text-cyan-600 font-medium">
              <Wind size={20} />
              <span>SCBA Tüp Takibi</span>
            </Link>
          </>
        )}

        <Link href="/gorevler" className="flex items-center space-x-3 rounded-md px-3 py-2 hover:bg-muted text-muted-foreground hover:text-foreground">
          <FileText size={20} />
          <span>Görevler & Teslim</span>
        </Link>

        {!isEr && (
          <div className="pt-4 mt-2 border-t border-border/50">
            <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Yönetim Paneli</p>
            <Link href="/yonetim/harita" className="flex items-center space-x-3 rounded-md px-3 py-2 hover:bg-muted text-muted-foreground hover:text-foreground">
              <Map size={20} />
              <span>Komuta Haritası (CBS)</span>
            </Link>
            <Link href="/yonetim/istatistikler" className="flex items-center space-x-3 rounded-md px-3 py-2 hover:bg-muted text-muted-foreground hover:text-foreground">
              <BarChart3 size={20} />
              <span>Olay İstatistikleri</span>
            </Link>
            <Link href="/yonetim/arac-bakim" className="flex items-center space-x-3 rounded-md px-3 py-2 hover:bg-muted text-muted-foreground hover:text-foreground">
              <Wrench size={20} />
              <span>Araç Bakım & Arıza</span>
            </Link>
            <Link href="/yonetim/hizmetler" className="flex items-center space-x-3 rounded-md px-3 py-2 hover:bg-muted text-muted-foreground hover:text-foreground">
              <FileText size={20} />
              <span>Hizmet Başvuruları</span>
            </Link>
            <Link href="/yonetim/egitimler" className="flex items-center space-x-3 rounded-md px-3 py-2 hover:bg-muted text-muted-foreground hover:text-foreground">
              <GraduationCap size={20} />
              <span>Eğitim & Faaliyetler</span>
            </Link>
            <Link href="/yonetim/olaylar" className="flex items-center space-x-3 rounded-md px-3 py-2 hover:bg-muted text-muted-foreground hover:text-foreground">
              <FileText size={20} />
              <span>Olay & Vaka Raporları</span>
            </Link>
            <Link href="/yonetim/personel" className="flex items-center space-x-3 rounded-md px-3 py-2 hover:bg-muted text-muted-foreground hover:text-foreground">
              <Users size={20} />
              <span>Personel Yönetimi</span>
            </Link>
            <Link href="/yonetim/raporlar" className="flex items-center space-x-3 rounded-md px-3 py-2 hover:bg-muted text-muted-foreground hover:text-foreground">
              <History size={20} />
              <span>Raporlar & Loglar</span>
            </Link>
            <Link href="/yonetim/sablonlar" className="flex items-center space-x-3 rounded-md px-3 py-2 hover:bg-muted text-muted-foreground hover:text-foreground">
              <ListChecks size={20} />
              <span>Görev Şablonları</span>
            </Link>
          </div>
        )}
      </nav>
      <div className="p-4 border-t border-border flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">Tema Ayarı</span>
        <ThemeToggle />
      </div>
    </aside>
  )
}
