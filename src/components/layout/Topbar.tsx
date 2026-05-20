"use client"
import { useState, useEffect, useRef } from 'react'
import { Bell, LogOut, ScanLine, AlertTriangle, ShieldAlert, CheckCircle2, Info, Flame, Trash2, Check } from 'lucide-react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/authStore'
import { api } from '@/lib/api'
import Link from 'next/link'
import { GeofenceButton } from './GeofenceButton'

interface NotificationItem {
  id: string
  title: string
  description: string
  type: 'urgent' | 'warning' | 'info' | 'success'
  time: string
  read: boolean
  actionUrl?: string
}

export function Topbar() {
  const { user, isAuthenticated, logout } = useAuthStore()
  const router = useRouter()
  
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const displayName = user ? `${user.ad} ${user.soyad}` : "Misafir"
  const initials = user?.initials || "?"
  const rolLabel = user?.unvan || (user?.rol === 'Admin' ? 'Yönetici' : user?.rol === 'Editor' ? 'Amir' : user?.rol === 'Shift_Leader' ? 'Vardiya Çavuşu' : 'İtfaiye Eri')

  const handleLogout = async () => {
    await logout()
  }

  // Fetch dynamic notifications and tasks
  useEffect(() => {
    const fetchNotificationsAndTasks = async () => {
      const items: NotificationItem[] = []
      const systemDate = new Date('2026-05-20')

      // 1. Role-specific Dynamic Tasks
      if (isAuthenticated && user) {
        if (user.rol === 'Admin' || user.rol === 'Editor' || user.rol === 'Shift_Leader') {
          items.push({
            id: 'task-leader-1',
            title: '📋 Denetim Görevi',
            description: '1. Posta araç envanter kontrollerini onaylayın.',
            type: 'warning',
            time: 'Vardiya Görevi',
            read: false,
            actionUrl: '/yonetim/personel'
          })
          items.push({
            id: 'task-leader-2',
            title: '💨 SCBA Maske Kontrolü',
            description: 'Solunum cihazı maske sızdırmazlık testlerini sisteme girin.',
            type: 'info',
            time: 'Haftalık Plan',
            read: false,
            actionUrl: '/scba'
          })
        } else {
          items.push({
            id: 'task-er-1',
            title: '📋 Malzeme Testi',
            description: 'Bugün zimmetli olduğunuz aracın ekipmanlarını kontrol edip onaylayın.',
            type: 'info',
            time: 'Vardiya Görevi',
            read: false,
            actionUrl: '/barkod'
          })
          items.push({
            id: 'task-er-2',
            title: '💨 SCBA Tüp Kontrolü',
            description: 'Solunum tüpünüzün basınç değerini ölçüp kaydedin (hedef >280 bar).',
            type: 'warning',
            time: 'Bugün',
            read: false,
            actionUrl: '/scba'
          })
        }
      }

      try {
        // 2. Fetch User-Specific Certifications Alert (SUPABASE)
        if (isAuthenticated && user?.sicilNo) {
          const { data: certs } = await api
            .from('staff_certifications')
            .select('*')
            .eq('sicil_no', user.sicilNo)

          if (certs && certs.length > 0) {
            certs.forEach((c: any) => {
              if (c.gecerlilik_tarihi) {
                const expiry = new Date(c.gecerlilik_tarihi)
                if (expiry < systemDate) {
                  items.push({
                    id: `cert-expired-${c.id}`,
                    title: `⚠️ Süresi Dolan Belge (${c.tip})`,
                    description: `${c.tip} belgenizin geçerlilik süresi dolmuştur! Lütfen en kısa sürede yenileyin.`,
                    type: 'urgent',
                    time: 'Kritik Uyarı',
                    read: false,
                    actionUrl: '/yonetim/personel'
                  })
                } else {
                  const diffTime = expiry.getTime() - systemDate.getTime()
                  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
                  if (diffDays <= 30) {
                    items.push({
                      id: `cert-warning-${c.id}`,
                      title: `⚠️ Belge Yenileme Uyarısı (${c.tip})`,
                      description: `${c.tip} geçerliliğine ${diffDays} gün kaldı. Lütfen yenileme işlemlerini başlatın.`,
                      type: 'warning',
                      time: `${diffDays} Gün Kaldı`,
                      read: false,
                      actionUrl: '/yonetim/personel'
                    })
                  }
                }
              }
            })
          }
        }

        // 3. Fetch Active Emergency Incidents (SUPABASE)
        const { data: incidents } = await api
          .from('incidents')
          .select('*')
          .order('cikis_saati', { ascending: false })
          .limit(2)

        if (incidents && incidents.length > 0) {
          incidents.forEach((inc: any) => {
            items.push({
              id: `inc-${inc.id}`,
              title: `🚨 Canlı Olay İhbarı: ${inc.olay_turu}`,
              description: `${inc.mahalle || 'Sivas'} Mah. adresinde olay raporlandı. Ekipler çıkış yaptı!`,
              type: 'urgent',
              time: inc.cikis_saati ? new Date(inc.cikis_saati).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : 'Az Önce',
              read: false,
              actionUrl: '/yonetim/harita'
            })
          })
        }
      } catch (err) {
        console.error('[Topbar] Canlı bildirimler yüklenirken hata oluştu:', err)
      }

      setNotifications(items)
    }

    fetchNotificationsAndTasks()
    
    // Auto-refresh notifications every 30 seconds to keep incidents live
    const interval = setInterval(fetchNotificationsAndTasks, 30000)
    return () => clearInterval(interval)
  }, [isAuthenticated, user])

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const unreadCount = notifications.filter(n => !n.read).length

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  const toggleRead = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: !n.read } : n))
  }

  const removeNotification = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  const handleNotificationClick = (item: NotificationItem) => {
    // Mark as read
    setNotifications(prev => prev.map(n => n.id === item.id ? { ...n, read: true } : n))
    setIsOpen(false)
    if (item.actionUrl) {
      router.push(item.actionUrl)
    }
  }

  return (
    <header className="flex items-center justify-between border-b border-border bg-surface px-3 sm:px-4 md:px-6 z-10 min-h-14 sm:min-h-16 relative">
      <div className="flex items-center md:hidden space-x-2">
        <Image src="/logo-itfaiye.png" alt="Logo" width={28} height={28} className="object-contain" />
        <h1 className="text-lg font-bold tracking-tight">Sivas İtfaiyesi</h1>
      </div>
      <div className="hidden md:flex flex-1"></div>
      <div className="flex items-center space-x-3">
        
        {/* Desktop Quick Scan Button */}
        <Link 
          href="/barkod" 
          className="hidden md:flex items-center space-x-2 bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1.5 rounded-full transition-colors mr-2"
        >
          <ScanLine size={18} />
          <span className="text-sm font-bold">Barkod Oku</span>
        </Link>
        
        <GeofenceButton />

        {/* Notifications & Tasks Bell Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button 
            onClick={() => setIsOpen(!isOpen)}
            className={`rounded-full p-2 hover:bg-muted relative transition-colors focus:outline-none focus:ring-2 focus:ring-primary ${
              isOpen ? 'bg-muted text-primary' : 'text-muted-foreground'
            }`}
            aria-label="Bildirimler"
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 h-4 w-4 rounded-full bg-red-600 border border-slate-900 text-[10px] font-bold text-white flex items-center justify-center animate-pulse">
                {unreadCount}
              </span>
            )}
          </button>

          {isOpen && (
            <div className={`absolute mt-3 w-[calc(100vw-2rem)] sm:w-96 max-w-sm bg-slate-950/95 backdrop-blur-xl border border-slate-800/80 shadow-2xl rounded-2xl overflow-hidden z-50 transition-all duration-300 animate-in fade-in slide-in-from-top-3 ${
              isAuthenticated ? 'right-[-4.5rem] sm:right-0' : 'right-[-6.5rem] sm:right-0'
            }`}>
              {/* Dropdown Header */}
              <div className="flex items-center justify-between p-4 border-b border-slate-800/60 bg-slate-900/40">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-primary" />
                  <span className="font-bold text-sm text-slate-100">Bildirimler ve Görevler</span>
                </div>
                {unreadCount > 0 && (
                  <button 
                    onClick={markAllAsRead}
                    className="text-[11px] text-primary hover:text-primary-hover font-semibold transition-colors flex items-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" /> Tümünü Oku
                  </button>
                )}
              </div>

              {/* Notifications List */}
              <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-900/60">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 space-y-2">
                    <CheckCircle2 className="w-8 h-8 text-slate-600 mx-auto" />
                    <p className="text-xs">Yeni bir bildirim veya göreviniz yok.</p>
                  </div>
                ) : (
                  notifications.map((item) => (
                    <div 
                      key={item.id}
                      onClick={() => handleNotificationClick(item)}
                      className={`p-3.5 flex gap-3 transition-colors cursor-pointer group hover:bg-slate-900/50 relative ${
                        !item.read ? 'bg-slate-900/20' : ''
                      }`}
                    >
                      {/* Left Dot or Icon Indicator */}
                      <div className="mt-1">
                        {item.type === 'urgent' && (
                          <div className="bg-red-500/10 p-1.5 rounded-lg text-red-500">
                            <Flame className="w-4 h-4 text-red-500 animate-pulse" />
                          </div>
                        )}
                        {item.type === 'warning' && (
                          <div className="bg-amber-500/10 p-1.5 rounded-lg text-amber-500">
                            <AlertTriangle className="w-4 h-4" />
                          </div>
                        )}
                        {item.type === 'info' && (
                          <div className="bg-blue-500/10 p-1.5 rounded-lg text-blue-500">
                            <Info className="w-4 h-4" />
                          </div>
                        )}
                        {item.type === 'success' && (
                          <div className="bg-emerald-500/10 p-1.5 rounded-lg text-emerald-500">
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-xs font-bold leading-tight ${!item.read ? 'text-slate-100' : 'text-slate-400'}`}>
                            {item.title}
                          </p>
                          <span className="text-[9px] text-slate-500 shrink-0 font-medium">{item.time}</span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-slate-400">
                          {item.description}
                        </p>
                      </div>

                      {/* Right Control Overlay */}
                      <div className="absolute right-2 bottom-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => toggleRead(item.id, e)}
                          title={item.read ? "Okunmadı İşaretle" : "Okundu İşaretle"}
                          className="bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded p-1 text-slate-400 hover:text-slate-200 transition-colors"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => removeNotification(item.id, e)}
                          title="Sil"
                          className="bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded p-1 text-slate-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Footer View Map shortcut */}
              {notifications.length > 0 && (
                <div className="p-2.5 border-t border-slate-800/60 bg-slate-950 text-center">
                  <Link 
                    href="/yonetim/harita" 
                    onClick={() => setIsOpen(false)}
                    className="text-xs text-primary font-semibold hover:underline block"
                  >
                    Canlı CBS Haritasını Görüntüle
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
        
        {isAuthenticated ? (
          <button 
            onClick={handleLogout}
            title="Çıkış Yap"
            className="flex items-center space-x-3 bg-muted/50 rounded-full py-1.5 px-3 hover:bg-muted cursor-pointer transition-colors group"
          >
            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
              {initials}
            </div>
            <div className="hidden md:block text-sm pr-2 text-left">
              <p className="font-semibold leading-none text-foreground">{displayName}</p>
              <p className="text-muted-foreground text-[11px] mt-0.5 uppercase tracking-wide flex items-center gap-1">
                {rolLabel} 
                <LogOut className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-danger" />
              </p>
            </div>
          </button>
        ) : (
          <button 
            onClick={() => router.push('/login')} 
            className="flex items-center space-x-2 bg-primary/10 rounded-full py-1.5 px-4 hover:bg-primary/20 text-primary text-sm font-semibold transition-colors"
          >
            Giriş Yap
          </button>
        )}
      </div>
    </header>
  )
}
