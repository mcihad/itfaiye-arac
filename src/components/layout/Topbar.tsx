"use client"
import { useState, useEffect, useRef } from 'react'
import { Bell, LogOut, Camera, AlertTriangle, ShieldAlert, CheckCircle2, Info, Flame, Trash2, Check, Key, X, BookOpen, Sliders, Menu, ChevronRight, LayoutGrid } from 'lucide-react'
import Image from 'next/image'
import { useRouter, usePathname } from 'next/navigation'
import { useAuthStore } from '@/lib/authStore'
import { useThemeStore } from '@/lib/themeStore'
import { api } from '@/lib/api'
import Link from 'next/link'
import { GeofenceButton } from './GeofenceButton'
import { ThemeDrawer } from '../theme/ThemeDrawer'
import { toast } from "@/lib/toast"

interface NotificationItem {
  id: string
  title: string
  description: string
  type: 'urgent' | 'warning' | 'info' | 'success'
  time: string
  read: boolean
  actionUrl?: string
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
// ─── Sayfa yolu → breadcrumb eşleme tablosu ─────────────────
const BREADCRUMB_LABELS: Record<string, string> = {
  yonetim: 'Yönetim',
  personel: 'Personel',
  araclar: 'Araçlar',
  'arac-bakim': 'Araç Bakım',
  envanter: 'Envanter',
  telsiz: 'Telsiz',
  olaylar: 'Olaylar',
  raporlar: 'Raporlar',
  hizmetler: 'Hizmetler',
  istatistikler: 'İstatistikler',
  gorevler: 'Görevler',
  egitimler: 'Eğitimler',
  yetkiler: 'Yetkiler',
  sablonlar: 'Şablonlar',
  kilavuz: 'Kılavuz',
  tarayici: 'QR Tarayıcı',
  harita: 'Harita',
  scba: 'SCBA',
  bakim: 'Bakım',
  'envanter-yonetimi': 'Envanter Yönetimi',
  'sifre-degistir': 'Şifre Değiştir',
  'gecici-sifreler': 'Geçici Şifreler',
  403: 'Yetkisiz Erişim',
}

function Breadcrumb() {
  const pathname = usePathname()
  if (!pathname || pathname === '/') return null

  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) return null

  // İlk segment "yonetim" ise kök olarak "Genel" göster
  const crumbs = segments.map((seg) => BREADCRUMB_LABELS[seg] || seg)

  return (
    <nav className="flex items-center gap-1.5 text-[calc(var(--fd-fs)*0.78)] font-semibold tracking-[0.03em] truncate">
      {crumbs.map((label, i) => {
        const isLast = i === crumbs.length - 1
        return (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight size={12} className="text-[var(--fd-text3)] shrink-0" />}
            <span className={isLast ? 'text-[var(--fd-text)]' : 'text-[var(--fd-text3)]'}>
              {label}
            </span>
          </span>
        )
      })}
    </nav>
  )
}

export function Topbar() {
  const { user, isAuthenticated, logout } = useAuthStore()
  const { sidebarCollapsed, setSidebarCollapsed } = useThemeStore()
  const router = useRouter()
  
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [mounted, setMounted] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)
  const themeRef = useRef<HTMLDivElement>(null)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isThemeDrawerOpen, setIsThemeDrawerOpen] = useState(false)
  const [isPushSubscribed, setIsPushSubscribed] = useState(false)

  const [readIds, setReadIds] = useState<string[]>([])
  const [deletedIds, setDeletedIds] = useState<string[]>([])

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && user) {
      navigator.serviceWorker.ready.then(reg => {
        reg.pushManager.getSubscription().then(sub => {
          setIsPushSubscribed(!!sub);
        }).catch(err => console.error('Subscription check error:', err));
      });
    }
  }, [user]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedRead = localStorage.getItem('itfaiye-read-notifications')
      const storedDeleted = localStorage.getItem('itfaiye-deleted-notifications')
      if (storedRead) setReadIds(JSON.parse(storedRead))
      if (storedDeleted) setDeletedIds(JSON.parse(storedDeleted))
    }
  }, [])

  // Track window size for responsive layout and set mounted to true
  useEffect(() => {
    setMounted(true)
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640)
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const handlePushToggle = async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      toast('Bu tarayıcı anlık bildirimleri desteklemiyor.');
      return;
    }

    try {
      if (isPushSubscribed) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
        }
        if (user?.sicilNo) {
          await api.update('personnel', { push_subscription_token: null }, { sicil_no: user.sicilNo });
        }
        setIsPushSubscribed(false);
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast('Bildirim izni reddedildi. Lütfen tarayıcı ayarlarından bildirim iznini etkinleştirin.');
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array('BGijonw6gf_TxWXTfukZCAc_bHPYE11lBPQF6CvGiVuAis5tVPiCFZ0A1y9Q7E7yV9fjiw5JnJWBQsun_Jj7PYM')
      });

      if (user?.sicilNo) {
        const subJson = JSON.stringify(sub);
        const res = await api.update('personnel', { push_subscription_token: subJson }, { sicil_no: user.sicilNo });
        if (res.error) {
          console.error('Push token save error:', res.error);
          toast('Bildirim aboneliği kaydedilemedi: ' + res.error);
        } else {
          setIsPushSubscribed(true);
        }
      }
    } catch (err) {
      console.error('Push bildirim abonelik hatası:', err);
      toast('Bildirim aboneliği oluşturulurken bir hata oluştu.');
    }
  };

  // Helper to determine notification triage styling
  const getNotificationTriage = (item: NotificationItem) => {
    const text = `${item.title} ${item.description}`.toLowerCase()
    
    // Critical Cases: Bina/Ev Yangını, Süresi Dolan Belge, Kritik
    if (
      text.includes('bina') || 
      text.includes('ev yang') || 
      text.includes('fabrika') || 
      text.includes('sıkışmalı') || 
      text.includes('kbrn') || 
      text.includes('süresi dolan') ||
      text.includes('kritik')
    ) {
      return 'critical'
    }
    
    // Medium Cases: Araç Yangını, Kurtarma Operasyonları, Denetim Görevi, SCBA Tüp/Maske Kontrolü, Belge Yenileme Uyarısı
    if (
      text.includes('araç') || 
      text.includes('kurtarma') || 
      text.includes('işyeri') ||
      text.includes('denetim') ||
      text.includes('scba tüp') ||
      text.includes('scba maske') ||
      text.includes('yenileme uyarısı')
    ) {
      return 'medium'
    }
    
    // Low Cases: Çöp/Ot Yangını, Malzeme Testi, normal tasks
    return 'low'
  }

  const renderNotificationsList = () => {
    if (notifications.length === 0) {
      return (
        <div className="p-8 text-center text-[var(--fd-text3)] flex flex-col items-center justify-center gap-2 bg-[var(--fd-surface)]">
          <CheckCircle2 className="w-8 h-8 text-[var(--fd-text3)] opacity-60" />
          <p className="text-[12px] font-medium">Yeni bir bildirim veya göreviniz yok.</p>
        </div>
      )
    }

    return notifications.map((item) => {
      const triage = getNotificationTriage(item)
      let triageClass = ""
      let triageDot = null

      if (triage === 'critical') {
        triageClass = "border-l-[3px] border-l-[var(--fd-danger)] bg-[rgba(220,38,38,0.04)]"
        triageDot = (
          <span className="relative flex h-2 w-2 shrink-0 self-center">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--fd-danger)] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--fd-danger)]"></span>
          </span>
        )
      } else if (triage === 'medium') {
        triageClass = "border-l-[3px] border-l-[var(--fd-amber)] bg-[rgba(245,158,11,0.03)]"
      } else {
        triageClass = "border-l-[3px] border-l-[var(--fd-info)] bg-[rgba(37,99,235,0.03)]"
      }

      return (
        <div 
          key={item.id}
          onClick={() => handleNotificationClick(item)}
          className={`p-3.5 flex items-start justify-between gap-3.5 transition-colors cursor-pointer group hover:bg-[var(--fd-surface2)] relative border-b border-[var(--fd-border)] ${triageClass} ${
            !item.read ? 'opacity-100 font-semibold' : 'opacity-70'
          }`}
        >
          {/* Left Icon Indicator */}
          <div className="mt-0.5 shrink-0">
            {item.type === 'urgent' && (
              <div className="bg-[rgba(220,38,38,0.11)] p-1.5 rounded-[var(--fd-r-sm)] text-[var(--fd-danger)]">
                <Flame className="w-4 h-4 text-[var(--fd-danger)] animate-pulse" strokeWidth={1.8} />
              </div>
            )}
            {item.type === 'warning' && (
              <div className="bg-[rgba(245,158,11,0.11)] p-1.5 rounded-[var(--fd-r-sm)] text-[var(--fd-amber)]">
                <AlertTriangle className="w-4 h-4" strokeWidth={1.8} />
              </div>
            )}
            {item.type === 'info' && (
              <div className="bg-[rgba(37,99,235,0.11)] p-1.5 rounded-[var(--fd-r-sm)] text-[var(--fd-info)]">
                <Info className="w-4 h-4" strokeWidth={1.8} />
              </div>
            )}
            {item.type === 'success' && (
              <div className="bg-[rgba(22,163,74,0.11)] p-1.5 rounded-[var(--fd-r-sm)] text-[var(--fd-success)]">
                <CheckCircle2 className="w-4 h-4" strokeWidth={1.8} />
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 flex flex-col gap-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                {triageDot}
                <p className={`text-[12.5px] font-bold leading-tight truncate ${!item.read ? 'text-[var(--fd-text)]' : 'text-[var(--fd-text2)]'}`}>
                  {item.title}
                </p>
              </div>
              <span className="text-[10px] text-[var(--fd-text3)] shrink-0 font-medium font-mono">{item.time}</span>
            </div>
            <p className="text-[12px] leading-relaxed text-[var(--fd-text2)] line-clamp-2">
              {item.description}
            </p>

            {/* Emergency Live Incident Map Call To Action */}
            {item.type === 'urgent' && item.id.startsWith('inc-') && (
              <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                <Link
                  href={item.actionUrl || '/yonetim/harita'}
                  onClick={() => setIsOpen(false)}
                  className="inline-flex items-center text-[10.5px] font-bold text-white bg-[var(--fd-danger)] hover:opacity-90 px-2.5 py-1 rounded-[var(--fd-r-sm)] transition-all shadow-sm border-none cursor-pointer"
                >
                  Canlı CBS Haritasını Görüntüle
                </Link>
              </div>
            )}
          </div>

          {/* Control Actions */}
          <div className="flex flex-col gap-1 shrink-0 self-start mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => removeNotification(item.id, e)}
              title="Sil"
              className="text-[var(--fd-text3)] hover:text-[var(--fd-danger)] transition-colors p-1 rounded hover:bg-[var(--fd-surface3)] border-none bg-transparent cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            
            <button
              onClick={(e) => toggleRead(item.id, e)}
              title={item.read ? "Okunmadı İşaretle" : "Okundu İşaretle"}
              className="text-[var(--fd-text3)] hover:text-[var(--fd-accent)] transition-colors p-1 rounded hover:bg-[var(--fd-surface3)] border-none bg-transparent cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )
    })
  }

  const displayName = user ? `${user.ad} ${user.soyad}` : "Misafir"
  const initials = user?.initials || "?"
  const rolLabel = user?.unvan || (user?.rol === 'Admin' ? 'Yönetici' : user?.rol === 'Editor' ? 'Amir' : user?.rol === 'Shift_Leader' ? 'Vardiya Çavuşu' : 'İtfaiye Eri')

  const handleLogout = async () => {
    await logout()
  }

  // Fetch dynamic notifications and tasks
  useEffect(() => {
    const fetchNotificationsAndTasks = async () => {
      if (!isAuthenticated || !user) {
        setNotifications([])
        return
      }

      const items: NotificationItem[] = []
      const now = new Date()

      // Read read & deleted notifications from localStorage
      let storedRead: string[] = []
      let storedDeleted: string[] = []
      if (typeof window !== 'undefined') {
        try {
          storedRead = JSON.parse(localStorage.getItem('itfaiye-read-notifications') || '[]')
          storedDeleted = JSON.parse(localStorage.getItem('itfaiye-deleted-notifications') || '[]')
        } catch (e) {
          console.error(e)
        }
      }

      try {
        // 1. Fetch Active Emergency Incidents (SUPABASE)
        const { data: incidents } = await api
          .from('incidents')
          .select('*')
          .eq('status', 'active')
          .order('cikis_saati', { ascending: false })

        if (incidents && incidents.length > 0) {
          incidents.forEach((inc: any) => {
            const itemId = `inc-${inc.id}`
            if (!storedDeleted.includes(itemId)) {
              items.push({
                id: itemId,
                title: `🚨 Canlı Olay İhbarı: ${inc.olay_turu}`,
                description: `${inc.mahalle || 'Sivas'} Adresinde ekipler çıkış yaptı!`,
                type: 'urgent',
                time: inc.cikis_saati ? new Date(inc.cikis_saati).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : 'Az Önce',
                read: storedRead.includes(itemId),
                actionUrl: `/yonetim/harita?incidentId=${inc.id}`
              })
            }
          })
        }

        // 2. Fetch Vehicle Inspections (SUPABASE)
        const { data: vehicles } = await api
          .from('vehicles')
          .select('*')

        if (vehicles && vehicles.length > 0) {
          vehicles.forEach((v: any) => {
            const dateVal = v.muayeneBitis || v.next_inspection_date
            if (dateVal) {
              const expiry = new Date(dateVal)
              const diffTime = expiry.getTime() - now.getTime()
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

              if (diffDays <= 30) {
                const itemId = `vehicle-ins-${v.plaka}`
                if (!storedDeleted.includes(itemId)) {
                  items.push({
                    id: itemId,
                    title: `⚠️ Muayene Gecikmesi: ${v.plaka}`,
                    description: `Muayene Gecikmesi: ${v.plaka} muayene süresi geçti / dolmak üzere!`,
                    type: 'warning',
                    time: diffDays < 0 ? 'Gecikti' : `${diffDays} Gün Kaldı`,
                    read: storedRead.includes(itemId),
                    actionUrl: '/araclar'
                  })
                }
              }
            }

            // 2b. Sigorta bitişi (aynı araç verisi üzerinden)
            if (v.sigortaBitis) {
              const expiry = new Date(v.sigortaBitis)
              const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
              if (diffDays <= 30) {
                const itemId = `vehicle-sig-${v.plaka}`
                if (!storedDeleted.includes(itemId)) {
                  items.push({
                    id: itemId,
                    title: `🛡️ Sigorta Bitişi: ${v.plaka}`,
                    description: `${v.plaka} aracının zorunlu sigortası ${diffDays < 0 ? 'doldu' : 'dolmak üzere'}!`,
                    type: 'warning',
                    time: diffDays < 0 ? 'Gecikti' : `${diffDays} Gün Kaldı`,
                    read: storedRead.includes(itemId),
                    actionUrl: '/araclar'
                  })
                }
              }
            }
          })
        }

        // 3. Fetch Staff Certifications (SUPABASE) — tüm belge türleri
        const { data: certs } = await api
          .from('staff_certifications')
          .select('*')

        const { data: personnel } = await api
          .from('personnel')
          .select('*')

        const personnelMap = new Map()
        if (personnel) {
          personnel.forEach((p: any) => {
            personnelMap.set(p.sicil_no, `${p.ad} ${p.soyad}`)
          })
        }

        if (certs && certs.length > 0) {
          certs.forEach((c: any) => {
            if (c.gecerlilik_tarihi) {
              const expiry = new Date(c.gecerlilik_tarihi)
              const diffTime = expiry.getTime() - now.getTime()
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

              // Ehliyette 90 gün (mevcut davranış), diğer belge türlerinde 30 gün eşik
              const esik = c.tip === 'Ehliyet' ? 90 : 30
              if (diffDays <= esik) {
                const itemId = `cert-license-${c.id}`
                if (!storedDeleted.includes(itemId)) {
                  const fullName = personnelMap.get(c.sicil_no) || c.sicil_no
                  const tipLabel = c.tip === 'Ehliyet' ? 'sürücü belgesi' : `${c.tip} belgesi`
                  items.push({
                    id: itemId,
                    title: `🪪 ${c.tip || 'Belge'} Geçerlilik: ${fullName}`,
                    description: `${fullName} ${tipLabel} süresi ${diffDays < 0 ? 'doldu' : 'yaklaşıyor'}!`,
                    type: 'info',
                    time: diffDays < 0 ? 'Süresi Doldu' : `${diffDays} Gün Kaldı`,
                    read: storedRead.includes(itemId),
                    actionUrl: '/yonetim/personel'
                  })
                }
              }
            }
          })
        }

        // 4. Geciken geçici zimmetler
        const { data: gecikenZimmet } = await api
          .from('temporary_assignments')
          .select('*')
          .eq('durum', 'GECIKTI')

        if (gecikenZimmet && gecikenZimmet.length > 0) {
          gecikenZimmet.forEach((t: any) => {
            const itemId = `zimmet-${t.id}`
            if (!storedDeleted.includes(itemId)) {
              items.push({
                id: itemId,
                title: `📦 Geciken Zimmet: ${t.birim_adi || 'Bilinmeyen birim'}`,
                description: `Geçici zimmet iade tarihi geçti${t.tahmini_iade_tarihi ? ` (${new Date(t.tahmini_iade_tarihi).toLocaleDateString('tr-TR')})` : ''}!`,
                type: 'warning',
                time: 'Gecikti',
                read: storedRead.includes(itemId),
                actionUrl: '/yonetim/envanter'
              })
            }
          })
        }

        // 5-6. Yönetici bildirimleri (yalnızca karar verebilecek roller görür)
        const isYonetici = ['Admin', 'Editor', 'Shift_Leader'].includes(user.rol || '')
        if (isYonetici) {
          // 5. Onay bekleyen bakım kayıtları
          const { data: bekleyenBakim } = await api
            .from('vehicle_maintenances')
            .select('*')
            .eq('durum', 'Bekliyor')

          if (bekleyenBakim && bekleyenBakim.length > 0) {
            const itemId = `bakim-bekleyen-${bekleyenBakim.length}`
            if (!storedDeleted.includes(itemId)) {
              items.push({
                id: itemId,
                title: `🔧 Onay Bekleyen Bakım: ${bekleyenBakim.length} kayıt`,
                description: `${bekleyenBakim.length} araç bakım kaydı onay bekliyor.`,
                type: 'info',
                time: 'Bekliyor',
                read: storedRead.includes(itemId),
                actionUrl: '/yonetim/arac-bakim'
              })
            }
          }

          // 6. Bekleyen vatandaş başvuruları
          const { data: bekleyenBasvuru } = await api
            .from('citizen_requests')
            .select('id')
            .eq('durum', 'BEKLEMEDE')

          if (bekleyenBasvuru && bekleyenBasvuru.length > 0) {
            const itemId = `basvuru-bekleyen-${bekleyenBasvuru.length}`
            if (!storedDeleted.includes(itemId)) {
              items.push({
                id: itemId,
                title: `📋 Bekleyen Başvuru: ${bekleyenBasvuru.length} adet`,
                description: `${bekleyenBasvuru.length} vatandaş hizmet başvurusu değerlendirme bekliyor.`,
                type: 'info',
                time: 'Bekliyor',
                read: storedRead.includes(itemId),
                actionUrl: '/yonetim/hizmetler'
              })
            }
          }
        }

      } catch (err) {
        console.error('[Topbar] Canlı bildirimler yüklenirken hata oluştu:', err)
      }

      // Sort notifications so that:
      // 1. Unread notifications are at the top, then read.
      // 2. Urgent (incidents) are at the top, then Warning (inspections), then Info (certifications).
      items.sort((a, b) => {
        if (a.read !== b.read) {
          return a.read ? 1 : -1
        }
        const priority = { urgent: 0, warning: 1, info: 2, success: 3 }
        return priority[a.type] - priority[b.type]
      })

      setNotifications(items)
    }

    fetchNotificationsAndTasks()
    
    // Auto-refresh notifications every 30 seconds to keep incidents live
    const interval = setInterval(fetchNotificationsAndTasks, 30000)
    return () => clearInterval(interval)
  }, [isAuthenticated, user, readIds, deletedIds])

  // Click outside to close dropdowns
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false)
      }
      if (themeRef.current && !themeRef.current.contains(event.target as Node)) {
        setIsThemeDrawerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const unreadCount = notifications.filter(n => !n.read).length

  const markAllAsRead = () => {
    setNotifications(prev => {
      const updated = prev.map(n => ({ ...n, read: true }))
      const allIds = updated.map(n => n.id)
      if (typeof window !== 'undefined') {
        const storedRead = JSON.parse(localStorage.getItem('itfaiye-read-notifications') || '[]')
        const newRead = Array.from(new Set([...storedRead, ...allIds]))
        localStorage.setItem('itfaiye-read-notifications', JSON.stringify(newRead))
        setReadIds(newRead)
      }
      return updated
    })
  }

  const toggleRead = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setNotifications(prev => {
      const item = prev.find(n => n.id === id)
      if (!item) return prev
      const willBeRead = !item.read
      if (typeof window !== 'undefined') {
        let storedRead = JSON.parse(localStorage.getItem('itfaiye-read-notifications') || '[]')
        if (willBeRead) {
          storedRead = Array.from(new Set([...storedRead, id]))
        } else {
          storedRead = storedRead.filter((x: string) => x !== id)
        }
        localStorage.setItem('itfaiye-read-notifications', JSON.stringify(storedRead))
        setReadIds(storedRead)
      }
      return prev.map(n => n.id === id ? { ...n, read: willBeRead } : n)
    })
  }

  const removeNotification = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setNotifications(prev => prev.filter(n => n.id !== id))
    if (typeof window !== 'undefined') {
      const storedDeleted = JSON.parse(localStorage.getItem('itfaiye-deleted-notifications') || '[]')
      const newDeleted = Array.from(new Set([...storedDeleted, id]))
      localStorage.setItem('itfaiye-deleted-notifications', JSON.stringify(newDeleted))
      setDeletedIds(newDeleted)
    }
  }

  const handleNotificationClick = (item: NotificationItem) => {
    // Mark as read
    setNotifications(prev => {
      const updated = prev.map(n => n.id === item.id ? { ...n, read: true } : n)
      if (typeof window !== 'undefined') {
        const storedRead = JSON.parse(localStorage.getItem('itfaiye-read-notifications') || '[]')
        const newRead = Array.from(new Set([...storedRead, item.id]))
        localStorage.setItem('itfaiye-read-notifications', JSON.stringify(newRead))
        setReadIds(newRead)
      }
      return updated
    })
    setIsOpen(false)
    if (item.actionUrl) {
      router.push(item.actionUrl)
    }
  }

  return (
    <header 
      className="flex items-center justify-between border-b border-[var(--fd-border)] bg-[var(--fd-surface)] px-[calc(var(--fd-sp)*3)] z-30 relative shadow-sm"
      style={{
        height: 'calc(60px + env(safe-area-inset-top, 0px))',
        paddingTop: 'env(safe-area-inset-top, 0px)'
      }}
    >
      <div className="flex items-center gap-3.5 shrink-0">
        {/* Mobile Title */}
        <div className="flex items-center md:hidden space-x-2 shrink-0">
          <Image src="/logo-itfaiye.png" alt="Sivas İtfaiyesi" width={24} height={24} className="object-contain rounded-full" />
          <h1 className="text-[14px] font-bold tracking-tight text-[var(--fd-text)]">Sivas İtfaiyesi</h1>
        </div>

        {/* Desktop Hamburger menu */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="hidden md:flex items-center justify-center w-9 h-9 border border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text2)] rounded-[var(--fd-r-sm)] cursor-pointer hover:bg-[var(--fd-surface3)] hover:text-[var(--fd-text)] transition-colors"
          title={sidebarCollapsed ? "Menüyü Genişlet" : "Menüyü Daralt"}
        >
          <Menu size={18} />
        </button>
      </div>
      <div className="hidden md:flex flex-1 items-center ml-4 min-w-0">
        <Breadcrumb />
      </div>
      <div className="flex items-center space-x-[calc(var(--fd-sp)*1.5)] shrink-0">

        {/* Saha Modu — sade mobil ekran (mevcut panel değişmez) */}
        <Link
          href="/saha"
          title="Saha Modu"
          aria-label="Saha Modu"
          className="flex items-center justify-center gap-1.5 bg-[var(--fd-accent)] hover:brightness-110 text-white w-8 h-8 sm:w-auto sm:h-auto sm:px-[calc(var(--fd-sp)*1.5)] sm:py-[calc(var(--fd-sp)*0.8)] rounded-[var(--fd-r-sm)] transition-all shrink-0"
        >
          <LayoutGrid size={15} strokeWidth={2} />
          <span className="hidden sm:inline text-[calc(var(--fd-fs)*0.85)] font-bold">Saha Modu</span>
        </Link>

        {/* Desktop Quick Scan Button */}
        <Link
          href="/yonetim/tarayici"
          className="hidden md:flex items-center space-x-[calc(var(--fd-sp)*1)] bg-[var(--fd-accent-soft)] hover:bg-[var(--fd-accent-soft2)] text-[var(--fd-accent)] px-[calc(var(--fd-sp)*1.5)] py-[calc(var(--fd-sp)*0.8)] rounded-[var(--fd-r-sm)] transition-colors mr-2"
        >
          <Camera size={16} strokeWidth={2} />
          <span className="text-[calc(var(--fd-fs)*0.85)] font-bold">QR Tara</span>
        </Link>
        
        <GeofenceButton />
        {/* Theme Drawer/Popup Button */}
        <div className="relative" ref={themeRef}>
          <button 
            onClick={() => setIsThemeDrawerOpen(!isThemeDrawerOpen)}
            className="flex items-center justify-center w-9 h-9 md:w-auto md:h-9 md:px-3.5 border border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text2)] rounded-[var(--fd-r-sm)] cursor-pointer hover:bg-[var(--fd-surface3)] hover:text-[var(--fd-text)] transition-colors"
            title="Görünümü özelleştir"
          >
            <Sliders size={16} />
            <span className="hidden md:inline md:ml-1.5 text-[calc(var(--fd-fs)*0.85)] font-semibold">Tema</span>
          </button>
          {isThemeDrawerOpen && (
            <ThemeDrawer onClose={() => setIsThemeDrawerOpen(false)} />
          )}
        </div>
 
        {/* Notifications & Tasks Bell Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button 
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center justify-center w-9 h-9 border border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text2)] rounded-[var(--fd-r-sm)] cursor-pointer hover:bg-[var(--fd-surface3)] hover:text-[var(--fd-text)] transition-colors relative"
            aria-label="Bildirimler"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 h-4 w-4 rounded-full bg-red-600 border border-slate-900 light:border-white text-[10px] font-bold text-white flex items-center justify-center animate-pulse">
                {unreadCount}
              </span>
            )}
          </button>

          {isOpen && mounted && isMobile && (
            <>
              {/* Backdrop Overlay */}
              <div 
                className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 transition-opacity duration-300 animate-in fade-in"
                onClick={() => setIsOpen(false)}
              />
              {/* Sliding Drawer Panel */}
              <div className="fixed inset-y-0 right-0 w-full max-w-[320px] bg-slate-950 border-l border-slate-800/80 shadow-2xl z-50 flex flex-col transition-transform duration-300 animate-in slide-in-from-right">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-800/60 bg-slate-900/40 shrink-0">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-primary" />
                    <span className="font-bold text-sm text-slate-100">Bildirimler</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {unreadCount > 0 && (
                      <button 
                        onClick={markAllAsRead}
                        className="text-[11px] text-red-500 hover:text-red-400 font-bold transition-all flex items-center gap-1 shrink-0 drop-shadow-[0_0_8px_rgba(239,68,68,0.5)] border border-red-500/20 hover:border-red-500/50 bg-red-950/20 px-2.5 py-1 rounded-md"
                      >
                        <Check className="w-3.5 h-3.5" /> Tümünü Okundu İşaretle
                      </button>
                    )}
                    <button 
                      onClick={() => setIsOpen(false)}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors font-semibold"
                      aria-label="Kapat"
                    >
                      <span className="text-xl leading-none">&times;</span>
                    </button>
                  </div>
                </div>
                
                {/* Content Container */}
                <div className="flex-1 overflow-y-auto divide-y divide-slate-900/60">
                  {renderNotificationsList()}
                </div>

                {/* Footer view CBS Map shortcut */}
                {notifications.length > 0 && (
                  <div className="p-3 border-t border-slate-800/60 bg-slate-950 text-center shrink-0">
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
            </>
          )}

          {isOpen && mounted && !isMobile && (
            <div className="absolute right-0 top-[120%] mt-2 w-96 origin-top-right bg-[var(--fd-surface)] backdrop-blur-xl border border-[var(--fd-border)] shadow-[var(--fd-shadow-lg)] rounded-[var(--fd-r-lg)] overflow-hidden z-50 transition-all duration-300 animate-in fade-in slide-in-from-top-3">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-[var(--fd-border)] bg-[var(--fd-surface2)]">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-[var(--fd-accent)]" />
                  <span className="font-bold text-sm text-[var(--fd-text)]">Bildirimler ve Görevler</span>
                </div>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button 
                      onClick={markAllAsRead}
                      className="text-[11px] text-[var(--fd-accent)] hover:opacity-80 font-bold transition-all flex items-center gap-1 border border-[var(--fd-border)] bg-[var(--fd-surface)] px-2.5 py-1 rounded-md cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" /> Tümünü Okundu İşaretle
                    </button>
                  )}
                  <button 
                    onClick={() => setIsOpen(false)}
                    className="p-1 rounded-lg text-[var(--fd-text3)] hover:text-[var(--fd-text)] hover:bg-[var(--fd-surface3)] transition-colors font-semibold cursor-pointer border-none bg-transparent"
                    aria-label="Kapat"
                  >
                    <span className="text-xl leading-none">&times;</span>
                  </button>
                </div>
              </div>
              
              {/* Content Container */}
              <div className="max-h-[450px] overflow-y-auto divide-y divide-[var(--fd-border)] bg-[var(--fd-surface)]">
                {renderNotificationsList()}
              </div>

              {/* Footer view CBS Map shortcut */}
              {notifications.length > 0 && (
                <div className="p-2.5 border-t border-[var(--fd-border)] bg-[var(--fd-surface2)] text-center">
                  <Link 
                    href="/yonetim/harita" 
                    onClick={() => setIsOpen(false)}
                    className="text-xs text-[var(--fd-accent)] font-semibold hover:underline block"
                  >
                    Canlı CBS Haritasını Görüntüle
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
        
        {isAuthenticated ? (
          <div className="relative border-l border-[var(--fd-border)] pl-[calc(var(--fd-sp)*1.25)] ml-[calc(var(--fd-sp)*1.25)] flex items-center gap-[10px]" ref={profileRef}>
            <div className="w-[34px] h-[34px] rounded-full bg-[var(--fd-side-bg2)] text-[var(--fd-side-text)] flex items-center justify-center font-bold text-[calc(var(--fd-fs)*0.82)] shrink-0 shadow-sm border border-[var(--fd-border)]">
              {initials}
            </div>
            <button 
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="flex flex-col justify-center text-left cursor-pointer hover:opacity-80 transition-opacity bg-transparent border-none p-0 min-h-[34px]"
            >
              <span className="text-[calc(var(--fd-fs)*0.85)] font-semibold text-[var(--fd-text)] leading-[1.2]">{displayName}</span>
              <span className="text-[calc(var(--fd-fs)*0.72)] text-[var(--fd-text3)] font-medium leading-[1.2] truncate max-w-[120px]">{rolLabel}</span>
            </button>

            {isProfileOpen && (
              <div className="absolute right-0 top-[120%] mt-2 w-52 origin-top-right bg-[var(--fd-surface)] border border-[var(--fd-border)] shadow-[var(--fd-shadow)] rounded-[var(--fd-r)] overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
                <div className="p-3 border-b border-[var(--fd-border)] bg-[var(--fd-surface2)]">
                  <p className="text-[11px] font-bold text-[var(--fd-text3)] uppercase tracking-wider">Hesap İşlemleri</p>
                </div>
                <div className="p-1.5 space-y-1">
                  <Link 
                    href="/yonetim/kilavuz"
                    onClick={() => setIsProfileOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-[var(--fd-r-sm)] text-[13px] text-[var(--fd-text2)] hover:text-[var(--fd-text)] hover:bg-[var(--fd-surface2)] transition-colors w-full text-left font-medium"
                  >
                    <BookOpen size={16} className="text-[var(--fd-accent)]" />
                    <span>Kullanım Kılavuzu</span>
                  </Link>
                  <Link 
                    href="/sifre-degistir"
                    onClick={() => setIsProfileOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-[var(--fd-r-sm)] text-[13px] text-[var(--fd-text2)] hover:text-[var(--fd-text)] hover:bg-[var(--fd-surface2)] transition-colors w-full text-left font-medium"
                  >
                    <Key size={16} />
                    <span>Şifremi Değiştir</span>
                  </Link>
                  <button 
                    onClick={() => {
                      setIsProfileOpen(false);
                      handlePushToggle();
                    }}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-[var(--fd-r-sm)] text-[13px] text-[var(--fd-text2)] hover:text-[var(--fd-text)] hover:bg-[var(--fd-surface2)] transition-colors w-full text-left font-medium border-none cursor-pointer bg-transparent"
                  >
                    <Bell size={16} className={isPushSubscribed ? 'text-green-500 animate-pulse' : 'text-[var(--fd-text3)]'} />
                    <span>{isPushSubscribed ? 'Bildirimleri Kapat' : 'Bildirimleri Aç'}</span>
                  </button>
                  <button 
                    onClick={() => {
                      setIsProfileOpen(false)
                      handleLogout()
                    }}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-[var(--fd-r-sm)] text-[13px] text-red-500 hover:text-white hover:bg-red-500 transition-colors w-full text-left font-medium border-none cursor-pointer bg-transparent mt-1"
                  >
                    <LogOut size={16} />
                    <span>Çıkış Yap</span>
                  </button>
                </div>
              </div>
            )}
          </div>
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
