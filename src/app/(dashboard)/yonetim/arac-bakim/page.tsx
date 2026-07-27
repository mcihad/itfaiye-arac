"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import PageGuard from "@/components/PageGuard"
import { api, getAuthHeaders } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { useAuthStore } from "@/lib/authStore"
import {
  Loader2,
  Wrench,
  Plus,
  Camera,
  Image as ImageIcon,
  Banknote,
  Check,
  Fuel,
  TrendingUp,
  Calendar,
  X,
  CheckCircle,
  Droplets,
  MapPin,
  User,
  Search,
  AlertTriangle,
  Clock
} from "lucide-react"
import { Vehicle, AracBakimGecmisi, FuelLog, Personnel } from "@/types"

const normalizeTextForSearch = (str: string): string => {
  if (!str) return "";
  return str
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g").replace(/Ğ/g, "g")
    .replace(/ü/g, "u").replace(/Ü/g, "u")
    .replace(/ş/g, "s").replace(/Ş/g, "s")
    .replace(/ö/g, "o").replace(/Ö/g, "o")
    .replace(/ç/g, "c").replace(/Ç/g, "c")
    .toLowerCase();
}

// ─── Constants ────────────────────────────────────────────────────
const ISLEM_TURLERI = ['Periyodik Bakım', 'Arıza/Tamir', 'Yağ Değişimi', 'Lastik', 'Kaza/Hasar', 'Diğer']

type ActiveTab = 'bakim' | 'yakit' | 'onay' | 'sarf' | 'muayene'

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
      badgeClass: 'bg-[var(--fd-surface2)]/60 text-[var(--fd-text3)] border border-[var(--fd-border)]'
    };
  }

  const inspectionDate = new Date(nextInspectionDate);
  if (isNaN(inspectionDate.getTime())) {
    return {
      text: 'Geçersiz Tarih',
      badgeClass: 'bg-[var(--fd-surface2)]/60 text-[var(--fd-text3)] border border-[var(--fd-border)]'
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
      badgeClass: 'bg-[rgba(220,38,38,0.08)] dark:bg-[rgba(220,38,38,0.15)] text-[var(--fd-danger)] border border-[rgba(220,38,38,0.15)] dark:border-[rgba(220,38,38,0.25)] shadow-[0_0_10px_rgba(239,68,68,0.1)] animate-pulse'
    };
  } else if (remainingDays <= 30) {
    return {
      text: `⏳ Son ${remainingDays} Gün`,
      badgeClass: 'bg-[rgba(245,158,11,0.08)] dark:bg-[rgba(245,158,11,0.15)] text-[var(--fd-amber)] border border-[rgba(245,158,11,0.15)] dark:border-[rgba(245,158,11,0.25)] shadow-[0_0_10px_rgba(245,158,11,0.1)]'
    };
  } else {
    return {
      text: `✅ ${remainingDays} Gün Kaldı`,
      badgeClass: 'bg-[rgba(22,163,74,0.08)] dark:bg-[rgba(22,163,74,0.15)] text-[var(--fd-success)] border border-[rgba(22,163,74,0.15)] dark:border-[rgba(22,163,74,0.25)] shadow-[0_0_10px_rgba(16,185,129,0.1)]'
    };
  }
}

export default function AracBakimPage() {
  const router = useRouter()
  const { user } = useAuthStore()

  // ─── Data State ──────────────────────────────────────────────
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [allLogs, setAllLogs] = useState<AracBakimGecmisi[]>([])
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([])
  const [personnel, setPersonnel] = useState<Personnel[]>([])
  const [loading, setLoading] = useState(true)

  // ─── UI State ────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>('bakim')
  const [selectedPlaka, setSelectedPlaka] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [updatingId, setUpdatingId] = useState<number | string | null>(null)

  // ─── Inline Edit State for Vehicle Inspection ─────────────────
  const [editingPlaka, setEditingPlaka] = useState<string | null>(null)
  const [editingNewDate, setEditingNewDate] = useState<string>('')
  const [isEditingUpdating, setIsEditingUpdating] = useState<boolean>(false)

  // ─── Form State ──────────────────────────────────────────────
  const [kayitTuru, setKayitTuru] = useState<'bakim' | 'yakit'>('bakim')
  const [bakimForm, setBakimForm] = useState({
    plaka: '',
    islem_turu: 'Arıza/Tamir',
    kilometre: '',
    aciklama: '',
    maliyet: '',
    kaydi_acan_sicil_no: ''
  })
  const [yakitForm, setYakitForm] = useState({
    plaka: '',
    litre: '',
    tutar: '',
    kmAt: '',
    istasyon: '',
    kayitEden: ''
  })

  // ─── Photo State ─────────────────────────────────────────────
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)

  // ─── Role Detection ──────────────────────────────────────────
  const isMudur = user?.rol === 'Admin' || user?.unvan === 'Müdür' || user?.rol?.toLowerCase() === 'admin' || user?.unvan?.toLowerCase() === 'müdür'

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
    fetchAllData()
    fetchPersonnel()
  }, [])

  const fetchAllData = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/bakim', {
        headers: getAuthHeaders()
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      
      // Filodan (vehicles tablosundan) doğrudan veri çekilerek güncel ve tam araç listesi sağlanır
      const { data: fleetVehicles } = await api.from('vehicles').select('*')
      const filteredVehicles = (fleetVehicles || []).filter((v: Vehicle) => v.plaka !== 'GARAJ')
      filteredVehicles.sort((a: Vehicle, b: Vehicle) => (a.filo_no || 999) - (b.filo_no || 999))
      setVehicles(filteredVehicles)

      setAllLogs(data.logs || [])
      setFuelLogs(data.fuelLogs || [])
    } catch (err) {
      console.error('Data fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchPersonnel = async () => {
    try {
      const { data } = await api.from('personnel').select('*').eq('aktif', true).order('ad', { ascending: true })
      if (data) {
        setPersonnel(data as Personnel[])
      }
    } catch (err) {
      console.error('Personnel fetch error:', err)
    }
  }

  // ─── Approve Maintenance ─────────────────────────────────────
  const handleApprove = async (id: number | string) => {
    setUpdatingId(id)
    try {
      const { error } = await api.update('vehicle_maintenances', { durum: 'Onaylandı' }, { id })
      if (error) throw error
      setAllLogs(prev => prev.map(m => m.id === id ? { ...m, durum: 'Onaylandı' } : m))

      // Simultaneously update corresponding maintenance_logs record if it exists!
      // (api.* reject etmez; .catch hiç tetiklenmiyordu — error alanı kontrol edilir)
      const mSync = await api.update('maintenance_logs', { durum: 'Taburcu Edildi' }, { id })
      if (mSync.error) console.error('[Sync] maintenance_logs güncellenemedi:', mSync.error)

      // Update vehicle status to 'aktif' and its current_branch to its original branch
      const matchedLog = allLogs.find(m => m.id === id)
      if (matchedLog) {
        const { data: mLogs } = await api.from('maintenance_logs').eq('id', id)
        const mLog = mLogs?.[0]
        const targetBranch = mLog?.eski_sube || 'Merkez'

        const vSync = await api.update(
          'vehicles',
          { current_branch: targetBranch, durum: 'aktif' },
          { plaka: matchedLog.plaka }
        )
        if (vSync.error) {
          alert(`Bakım onaylandı ancak aracın durumu 'aktif' yapılamadı: ${vSync.error}\nAraç listede 'Bakımda' görünmeye devam edebilir.`)
        }
      }
    } catch (err) {
      console.error("Bakım onay hatası:", err)
      alert("Bakım onaylanırken bir hata oluştu.")
    } finally {
      setUpdatingId(null)
    }
  }

  // ─── Inline Update Inspection Date ───────────────────────────
  const handleUpdateInspectionDate = async (plaka: string) => {
    if (!editingNewDate) {
      alert('Lütfen geçerli bir tarih seçin.');
      return;
    }
    setIsEditingUpdating(true);
    try {
      const { error } = await api.update(
        'vehicles',
        { next_inspection_date: editingNewDate },
        { plaka }
      );
      if (error) throw error;
      setVehicles(prev => prev.map(v => v.plaka === plaka ? { ...v, next_inspection_date: editingNewDate } : v));
      setEditingPlaka(null);
    } catch (err: any) {
      console.error('Muayene tarihi güncellenirken hata oluştu:', err);
      alert('Güncelleme başarısız: ' + (err.message || err));
    } finally {
      setIsEditingUpdating(false);
    }
  }

  // ─── Photo Upload ────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0]
      setFile(selectedFile)
      setPreviewUrl(URL.createObjectURL(selectedFile))
    }
  }

  const uploadImage = async (selectedFile: File): Promise<string | null> => {
    setUploading(true)
    try {
      const { url, error } = await api.upload(selectedFile, 'arizalar')
      if (error) throw new Error(error)
      return url
    } catch (error) {
      console.error('Error uploading image:', error)
      alert('Fotoğraf yüklenirken hata oluştu!')
      return null
    } finally {
      setUploading(false)
    }
  }

  // ─── Create Record ──────────────────────────────────────────
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)

    try {
      if (kayitTuru === 'bakim') {
        if (!bakimForm.plaka) { alert("Lütfen araç plakası seçin."); setIsSaving(false); return }

        let finalPhotoUrl: string | null = null
        if (file) {
          finalPhotoUrl = await uploadImage(file)
          if (!finalPhotoUrl) { setIsSaving(false); return }
        }

        const formattedDesc = `${bakimForm.islem_turu}: ${bakimForm.aciklama} ${bakimForm.kilometre ? `(KM: ${bakimForm.kilometre})` : ''} ${finalPhotoUrl ? `[Görsel kanıt: ${finalPhotoUrl}]` : ''}`

        const payload = {
          plaka: bakimForm.plaka,
          islem_turu: bakimForm.islem_turu,
          tarih: new Date().toISOString().split('T')[0],
          kilometre: Number(bakimForm.kilometre) || 0,
          aciklama: formattedDesc,
          maliyet: Number(bakimForm.maliyet) || 0,
          durum: isMudur ? 'Onaylandı' : 'Bekliyor',
          kaydi_acan_sicil_no: user?.sicilNo || 'Sistem',
          fotograf_url: finalPhotoUrl || null
        }

        const { error } = await api.insert('vehicle_maintenances', payload)
        if (error) throw error
      } else {
        if (!yakitForm.plaka) { alert("Lütfen araç plakası seçin."); setIsSaving(false); return }
        if (!yakitForm.litre || !yakitForm.tutar) { alert("Lütfen litre ve tutar alanlarını doldurun."); setIsSaving(false); return }

        const payload = {
          plaka: yakitForm.plaka,
          litre: Number(yakitForm.litre) || 0,
          tutar: Number(yakitForm.tutar) || 0,
          kmAt: Number(yakitForm.kmAt) || 0,
          istasyon: yakitForm.istasyon || 'Sivas Belediyesi Akaryakıt İstasyonu',
          tarih: new Date().toISOString().split('T')[0],
          kayitEden: yakitForm.kayitEden || user?.ad || 'Sistem'
        }

        const { error } = await api.insert('fuel_logs', payload)
        if (error) throw error
      }

      setIsCreateOpen(false)
      resetForms()
      await fetchAllData()
    } catch (err) {
      console.error('Create record error:', err)
      alert("Kayıt sırasında hata oluştu.")
    } finally {
      setIsSaving(false)
    }
  }

  const resetForms = () => {
    setBakimForm({ plaka: '', islem_turu: 'Arıza/Tamir', kilometre: '', aciklama: '', maliyet: '', kaydi_acan_sicil_no: '' })
    setYakitForm({ plaka: '', litre: '', tutar: '', kmAt: '', istasyon: '', kayitEden: '' })
    setFile(null)
    setPreviewUrl(null)
    setKayitTuru('bakim')
  }

  // ─── Computed KPI Scorecard Logic ─────────────────────────────
  
  // 1. Antifreeze Temperature Danger Checklist (Warm point > -25°C is risky)
  const antifreezeRiskList = useMemo(() => {
    return vehicles.map(v => {
      const vLogs = allLogs.filter(l => l.plaka === v.plaka)
      const antifreezeLog = vLogs.find(l => {
        const desc = l.aciklama.toUpperCase()
        return desc.includes("RADYATÖR") || desc.includes("ANTİFRİZ") || desc.includes("ANTIFRIZ") || desc.includes("DERECE") || desc.includes("ÖLÇÜM")
      })
      let deg = -35 // Fallback nominal system standard
      let hasRecord = false
      if (antifreezeLog) {
        const match = antifreezeLog.aciklama.match(/-?\d+/)
        if (match) {
          deg = parseInt(match[0], 10)
          hasRecord = true
        }
      }
      return {
        plaka: v.plaka,
        model: `${v.marka || ''} ${v.model || ''}`,
        deg,
        hasRecord,
        isRisk: hasRecord && deg > -25
      }
    }).filter(item => item.isRisk)
  }, [vehicles, allLogs])

  // 2. Kuru Bakım Countdown Tracker (< 15 days remaining)
  const dryMaintRiskList = useMemo(() => {
    return vehicles.map(v => {
      const vLogs = allLogs.filter(l => l.plaka === v.plaka)
      const dryLog = vLogs.find(l => {
        const desc = l.aciklama.toUpperCase()
        return desc.includes("ŞAFT") || desc.includes("YAĞLAMA") || desc.includes("YAĞLANDI") || desc.includes("ALT TAKIM") || desc.includes("KURU YAĞLAMA") || desc.includes("GRES") || desc.includes("YAĞ") || desc.includes("YAG") || desc.includes("FİLTRE") || desc.includes("FILTRE")
      })

      const period = 180
      let daysLeft = 180
      let hasRecord = false
      if (dryLog) {
        const lastDate = new Date(dryLog.tarih)
        const today = new Date()
        const diffTime = today.getTime() - lastDate.getTime()
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
        daysLeft = Math.max(period - diffDays, 0)
        hasRecord = true
      } else {
        const hash = v.plaka.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
        daysLeft = 30 + (hash % 110) // simulated default 30-140 days
      }

      return {
        plaka: v.plaka,
        model: `${v.marka || ''} ${v.model || ''}`,
        daysLeft,
        hasRecord,
        isRisk: daysLeft < 15
      }
    }).filter(item => item.isRisk)
  }, [vehicles, allLogs])

  // 2b. Muayene Countdown Tracker (<= 30 days remaining)
  const inspectionRiskList = useMemo(() => {
    return vehicles.map(v => {
      const nextDate = v.next_inspection_date;
      if (!nextDate || nextDate === 'Tarih Girilmedi') {
        return {
          plaka: v.plaka,
          model: `${v.marka || ''} ${v.model || ''}`,
          remainingDays: 9999,
          isRisk: false
        };
      }
      const inspectionDate = new Date(nextDate);
      if (isNaN(inspectionDate.getTime())) {
        return {
          plaka: v.plaka,
          model: `${v.marka || ''} ${v.model || ''}`,
          remainingDays: 9999,
          isRisk: false
        };
      }
      const now = new Date();
      const d1 = Date.UTC(inspectionDate.getFullYear(), inspectionDate.getMonth(), inspectionDate.getDate());
      const d2 = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
      const diffTime = d1 - d2;
      const remainingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return {
        plaka: v.plaka,
        model: `${v.marka || ''} ${v.model || ''}`,
        remainingDays,
        isRisk: remainingDays <= 30
      };
    }).filter(item => item.isRisk);
  }, [vehicles])

  // 3. Active Unresolved Arıza Bildirimleri Banner
  const activeUnresolvedAlerts = useMemo(() => {
    const dbAlerts = allLogs.filter(l => {
      if (l.tip !== 'tamir') return false
      const txt = l.aciklama.toUpperCase()
      const isProblem = txt.includes("GEVŞEK") || 
                        txt.includes("KAÇAK") || 
                        txt.includes("KAÇIRIYOR") || 
                        txt.includes("ARIZALI") || 
                        txt.includes("KIRIK") || 
                        txt.includes("ÇALIŞMIYOR") || 
                        txt.includes("HASAR") || 
                        txt.includes("ÇATLAK") || 
                        txt.includes("BOZUK") ||
                        txt.includes("HİDROLİK")
      const isResolved = txt.includes("DEĞİŞTİRİLDİ") || 
                         txt.includes("YAPILDI") || 
                         txt.includes("ONARILDI") || 
                         txt.includes("YENİLENDİ") || 
                         txt.includes("GİDERİLDİ") || 
                         txt.includes("DÜZELTİLDİ") || 
                         txt.includes("BAKIMI YAPILDI") ||
                         txt.includes("TAKILDI")
      return isProblem && !isResolved
    })

    return dbAlerts
  }, [allLogs])

  // 4. Motor Yağı & Antifriz Sarf Malzeme Takip İstatistikleri
  const sarfStats = useMemo(() => {
    const stats: Record<string, { plaka: string; model: string; yag: number; antifriz: number; count: number }> = {}

    vehicles.forEach(v => {
      stats[v.plaka] = {
        plaka: v.plaka,
        model: `${v.marka || ''} ${v.model || ''}`,
        yag: 0,
        antifriz: 0,
        count: 0
      }
    })

    allLogs.forEach(l => {
      const text = l.aciklama.toUpperCase()
      let yagLitre = 0
      let antifrizLitre = 0

      // Search for "7 Litre motor yağı" or "15 LT motor yağı" or "yağı 7lt" etc.
      // High-precision regex requiring volume unit (LİTRE, LT, L) to avoid license plate codes (e.g., 58) or years (e.g., 2025)
      const yagMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(LİTRE|LT|L)\s*(?:MOT[OR]*\.?\s*)?YAĞ/i) || 
                       text.match(/(?:MOTOR\s*)?YAĞ[I]?[\s:]*(\d+(?:[.,]\d+)?)\s*(LİTRE|LT|L)/i)
      if (yagMatch) {
        const valStr = yagMatch[1].replace(',', '.')
        const val = parseFloat(valStr)
        if (val > 0 && val <= 80) {
          yagLitre = val
        } else {
          // If value is unreasonably high (>80), standard fallback for change/addition
          yagLitre = (text.includes("DEĞİŞİMİ") || text.includes("EKLENDİ")) ? 15 : 0
        }
      } else if (text.includes("YAĞ DEĞİŞİMİ") || text.includes("YAĞ EKLENDİ")) {
        yagLitre = 15 // standard fallback for heavy trucks
      }

      // Search for "5 Litre antifriz" or "3 L ANTİFRİZ" etc.
      const antiMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(LİTRE|LT|L)\s*(?:ANTİFRİZ|ANTIFRIZ)/i) || 
                        text.match(/(?:ANTİFRİZ|ANTIFRIZ)[\s:]*(\d+(?:[.,]\d+)?)\s*(LİTRE|LT|L)/i)
      if (antiMatch) {
        const valStr = antiMatch[1].replace(',', '.')
        const val = parseFloat(valStr)
        if (val > 0 && val <= 80) {
          antifrizLitre = val
        } else {
          antifrizLitre = (text.includes("DEĞİŞİMİ") || text.includes("EKLENDİ") || text.includes("KONULDU")) ? 10 : 0
        }
      } else if (text.includes("ANTİFRİZ EKLENDİ") || text.includes("ANTİFRİZ KONULDU") || text.includes("ANTİFRİZ DEĞİŞİMİ")) {
        antifrizLitre = 10 // standard fallback
      }

      if (yagLitre > 0 || antifrizLitre > 0) {
        if (!stats[l.plaka]) {
          stats[l.plaka] = {
            plaka: l.plaka,
            model: 'Filo Aracı',
            yag: 0,
            antifriz: 0,
            count: 0
          }
        }
        stats[l.plaka].yag += yagLitre
        stats[l.plaka].antifriz += antifrizLitre
        stats[l.plaka].count += 1
      }
    })

    return Object.values(stats)
      .filter(item => item.yag > 0 || item.antifriz > 0)
      .sort((a, b) => (b.yag + b.antifriz) - (a.yag + a.antifriz))
  }, [vehicles, allLogs])

  // ─── Financial Calculations ──────────────────────────────────
  const approvedLogs = useMemo(() => allLogs.filter(l => l.durum === 'Onaylandı'), [allLogs])
  const totalBakimCount = approvedLogs.length
  const totalBakimMaliyet = approvedLogs.reduce((s, m) => s + (Number(m.maliyet) || 0), 0)
  const totalYakitCount = fuelLogs.length
  const totalYakitMaliyet = fuelLogs.reduce((s, f) => s + (Number(f.tutar) || 0), 0)

  // ─── Client Filter Logic ─────────────────────────────────────
  const filteredApprovedLogs = useMemo(() => {
    let result = approvedLogs

    if (selectedPlaka !== 'all') {
      result = result.filter(m => m.plaka === selectedPlaka)
    }

    if (searchQuery.trim() !== '') {
      const q = normalizeTextForSearch(searchQuery)
      result = result.filter(m => 
        normalizeTextForSearch(m.plaka).includes(q) || 
        normalizeTextForSearch(m.aciklama || '').includes(q) || 
        normalizeTextForSearch(m.tip === 'tamir' ? 'tamir arıza' : 'yağ bakım').includes(q)
      )
    }

    return result
  }, [approvedLogs, selectedPlaka, searchQuery])

  const filteredFuelLogs = useMemo(() => {
    let result = fuelLogs

    if (selectedPlaka !== 'all') {
      result = result.filter(f => f.plaka === selectedPlaka)
    }

    if (searchQuery.trim() !== '') {
      const q = normalizeTextForSearch(searchQuery)
      result = result.filter(f => 
        normalizeTextForSearch(f.plaka).includes(q) || 
        normalizeTextForSearch(f.istasyon || '').includes(q) || 
        normalizeTextForSearch(f.kayitEden || '').includes(q)
      )
    }

    return result
  }, [fuelLogs, selectedPlaka, searchQuery])


  const pendingApprovals = useMemo(() => allLogs.filter(m => m.durum === 'Bekliyor'), [allLogs])

  // ─── Rota Zıplama / Cross-Linking slug helper ───────────────────
  const jumpToVehicle = (plaka: string) => {
    const slug = plaka.replace(/\s+/g, '-').toLowerCase()
    router.push(`/araclar/${slug}`)
  }

  // ─── Status Badge Generator ──────────────────────────────────
  const getStatusBadge = (durum: string) => {
    switch (durum) {
      case 'Onaylandı': 
        return <Badge className="bg-[rgba(22,163,74,0.08)] dark:bg-[rgba(22,163,74,0.15)] border border-[rgba(22,163,74,0.15)] dark:border-[rgba(22,163,74,0.25)] text-[var(--fd-success)] font-semibold px-2.5 py-1 rounded-[var(--fd-r-sm)]">Onaylandı</Badge>
      case 'Bekliyor':
        return <Badge className="bg-[rgba(245,158,11,0.08)] dark:bg-[rgba(245,158,11,0.15)] border border-[rgba(245,158,11,0.15)] dark:border-[rgba(245,158,11,0.25)] text-[var(--fd-amber)] font-semibold px-2.5 py-1 rounded-[var(--fd-r-sm)]">Onay Bekliyor</Badge>
      default: 
        return <Badge className="bg-slate-800 text-[var(--fd-text2)] font-semibold px-2.5 py-1 rounded-[var(--fd-r-sm)]">Tamamlandı</Badge>
    }
  }
  const handleMudahaleEt = () => {
    const firstAlert = activeUnresolvedAlerts[0]
    if (firstAlert) {
      setBakimForm({
        plaka: firstAlert.plaka,
        islem_turu: 'Arıza/Tamir',
        kilometre: '',
        aciklama: `ONARILDI: ${firstAlert.aciklama}`,
        maliyet: '',
        kaydi_acan_sicil_no: user?.sicilNo || ''
      })
      setKayitTuru('bakim')
      setIsCreateOpen(true)
    } else {
      setIsCreateOpen(true)
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center animate-pulse flex items-center justify-center gap-2 min-h-[50vh]">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--fd-accent)]" />
        <span className="text-[var(--fd-accent)]/80 font-bold tracking-wider">Taktik Bakım & Yakıt Veritabanı Sorgulanıyor...</span>
      </div>
    )
  }

  return (
    <PageGuard pageId="arac_bakim">
      <div className="flex flex-col min-h-full space-y-6 w-full max-w-full px-4 md:px-8 pb-12 animate-in fade-in duration-300">

        {/* 🚨 Cyber Neon Active Unresolved Alerts Banner */}
        {activeUnresolvedAlerts.length > 0 && (
          <div className="w-full bg-[rgba(220,38,38,0.06)] dark:bg-[rgba(220,38,38,0.12)] border border-[rgba(220,38,38,0.15)] dark:border-[rgba(220,38,38,0.25)] rounded-[var(--fd-r)] p-[calc(var(--fd-sp)*1.2)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-[var(--fd-shadow-sm)]">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
              <span className="text-[var(--fd-text)] text-xs font-bold tracking-wider uppercase">AKTİF KRİTİK ARIZA UYARILARI</span>
            </div>
            
            <div className="flex-1 overflow-hidden px-4">
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-6">
                {activeUnresolvedAlerts.slice(0, 3).map((alertItem) => (
                  <div key={alertItem.id} className="text-xs text-[var(--fd-text)] font-semibold flex items-center gap-1.5">
                    <span className="border border-[var(--fd-border-strong)] rounded bg-[var(--fd-surface2)] px-1.5 py-0.5 text-[10px] font-mono font-bold text-[var(--fd-text2)]">{alertItem.plaka}</span>
                    <span className="truncate max-w-[250px] text-[var(--fd-text2)] font-medium">{alertItem.aciklama}</span>
                  </div>
                ))}
              </div>
            </div>

            <Button
              onClick={handleMudahaleEt}
              className="bg-[rgba(220,38,38,0.08)] dark:bg-[rgba(220,38,38,0.15)] hover:bg-[var(--fd-danger)] text-[var(--fd-danger)] hover:text-[#ffffff] border border-[rgba(220,38,38,0.15)] dark:border-[rgba(220,38,38,0.25)] text-xs px-3 py-1.5 min-h-[44px] rounded-[var(--fd-r-sm)] font-bold transition-all duration-200 ease-out active:scale-95 shrink-0"
            >
              Müdahale Et
            </Button>
          </div>
        )}

        {/* ═══ Sayfa Başlığı ═══ */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--fd-border)] pb-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2 text-[var(--fd-text)]">
              🚒 Araç Bakım & Yakıt Takibi
            </h1>
            <p className="text-[var(--fd-text3)] text-sm mt-1">Sivas İtfaiyesi araç filosunun bakım, arıza ve yakıt kayıtlarının yerel kurumsal veritabanı paneli</p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              className="bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-bold text-xs px-4 py-3 min-h-[44px] rounded-xl flex items-center gap-1.5 shadow-lg shadow-cyan-500/10 hover:scale-[1.02] transition-all duration-200 ease-out shrink-0"
              onClick={() => setIsCreateOpen(true)}
            >
              <Plus className="w-4 h-4" /> Yeni Kayıt Ekle
            </Button>
            {isMudur ? (
              <Badge className="bg-[var(--fd-accent-soft)] border border-[var(--fd-accent-soft2)] text-[var(--fd-accent)] font-semibold px-3 py-1 text-xs">
                Müdür Yetki Modu
              </Badge>
            ) : (
              <Badge className="bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text3)] font-bold px-3 py-1 text-xs">
                Salt Okunur
              </Badge>
            )}
          </div>
        </div>

        {/* ═══ 1. Cam Morfolojili 4 Taktik Skorbord ═══ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          
          {/* Skorbord 1: Kritik Antifriz Alarmı */}
          <Card className="bg-[var(--fd-surface)] border border-[var(--fd-border)] border-t-4 border-t-[var(--fd-danger)] p-[calc(var(--fd-sp)*1.5)] rounded-[var(--fd-r)] shadow-[var(--fd-shadow-sm)] relative overflow-hidden group hover:border-[var(--fd-border-strong)] transition-all duration-200 ease-out">
            <div className="absolute -right-4 -bottom-4 opacity-5 text-[var(--fd-danger)] group-hover:scale-110 transition duration-500">
              <Droplets className="w-24 h-24" />
            </div>
            <CardContent className="p-0 flex flex-col justify-between h-full space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--fd-danger)] font-semibold tracking-wider uppercase">KRİTİK ANTİFRİZ ALARMI</span>
                <div className="p-2 bg-red-500/10 border border-red-500/20 text-[var(--fd-danger)] rounded-xl">
                  <AlertTriangle className="w-5 h-5" />
                </div>
              </div>
              <div>
                <h3 className="text-3xl font-bold text-[var(--fd-danger)]">{antifreezeRiskList.length} Riskli Araç</h3>
                <p className="text-[10px] text-[var(--fd-text3)] mt-1">Sivas kış şartları (-25°C altı koruma yetersiz) ölçümleri</p>
              </div>

              {antifreezeRiskList.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {antifreezeRiskList.map(item => (
                    <button
                      key={item.plaka}
                      onClick={() => jumpToVehicle(item.plaka)}
                      className="bg-[rgba(220,38,38,0.08)] dark:bg-[rgba(220,38,38,0.15)] hover:bg-[var(--fd-danger)] text-[var(--fd-danger)] hover:text-[#ffffff] border border-[rgba(220,38,38,0.15)] dark:border-[rgba(220,38,38,0.25)] px-2.5 py-0.5 rounded-[var(--fd-r-sm)] text-xs font-bold transition flex items-center gap-1"
                      title={`${item.model} (${item.deg}°C)`}
                    >
                      {item.plaka} <span className="text-[10px] opacity-80">{item.deg}°C</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-[var(--fd-success)] font-bold pt-2 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" /> Tüm araçlar kış şartlarına dayanıklı
                </div>
              )}
            </CardContent>
          </Card>

          {/* Skorbord 2: Kuru Bakım Sayaç Risk Grubu */}
          <Card className="bg-[var(--fd-surface)] border border-[var(--fd-border)] border-t-4 border-t-[var(--fd-amber)] p-[calc(var(--fd-sp)*1.5)] rounded-[var(--fd-r)] shadow-[var(--fd-shadow-sm)] relative overflow-hidden group hover:border-[var(--fd-border-strong)] transition duration-300">
            <div className="absolute -right-4 -bottom-4 opacity-5 text-amber-500 group-hover:scale-110 transition duration-500">
              <Clock className="w-24 h-24" />
            </div>
            <CardContent className="p-0 flex flex-col justify-between h-full space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--fd-amber)] font-semibold tracking-wider uppercase">KURU BAKIM SAYACI</span>
                <div className="p-2 bg-amber-500/10 border border-amber-500/20 text-[var(--fd-amber)] rounded-xl">
                  <Clock className="w-5 h-5" />
                </div>
              </div>
              <div>
                <h3 className="text-3xl font-bold text-[var(--fd-amber)]">{dryMaintRiskList.length} Araç</h3>
                <p className="text-[10px] text-[var(--fd-text3)] mt-1">6 aylık şaft/gres yağlama sayacı 15 günden az kalanlar</p>
              </div>

              {dryMaintRiskList.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {dryMaintRiskList.map(item => (
                    <button
                      key={item.plaka}
                      onClick={() => jumpToVehicle(item.plaka)}
                      className="bg-[rgba(245,158,11,0.08)] dark:bg-[rgba(245,158,11,0.15)] hover:bg-[var(--fd-amber)] text-[var(--fd-amber)] hover:text-[#ffffff] border border-[rgba(245,158,11,0.15)] dark:border-[rgba(245,158,11,0.25)] px-2.5 py-0.5 rounded-[var(--fd-r-sm)] text-xs font-bold transition flex items-center gap-1"
                      title={`${item.model} (${item.daysLeft} gün kaldı)`}
                    >
                      {item.plaka} <span className="text-[10px] opacity-80">{item.daysLeft}g</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-[var(--fd-success)] font-bold pt-2 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" /> Tüm gres şaft yağlama periyotları nominal
                </div>
              )}
            </CardContent>
          </Card>

          {/* Skorbord 3: Müdür Onayı Bekleyen Talepler */}
          <Card 
            onClick={() => setActiveTab('onay')}
            className="bg-[var(--fd-surface)] border border-[var(--fd-border)] border-t-4 border-t-[var(--fd-info)] p-[calc(var(--fd-sp)*1.5)] rounded-[var(--fd-r)] shadow-[var(--fd-shadow-sm)] relative overflow-hidden group hover:border-[var(--fd-border-strong)] transition duration-300 cursor-pointer"
          >
            <div className="absolute -right-4 -bottom-4 opacity-5 text-[var(--fd-info)] group-hover:scale-110 transition duration-500">
              <CheckCircle className="w-24 h-24" />
            </div>
            <CardContent className="p-0 flex flex-col justify-between h-full space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--fd-info)] font-semibold tracking-wider uppercase">ONAY BEKLEYEN TALEPLER</span>
                <div className="p-2 bg-blue-500/10 border border-blue-500/20 text-[var(--fd-info)] rounded-xl">
                  <CheckCircle className="w-5 h-5" />
                </div>
              </div>
              <div>
                <h3 className="text-3xl font-bold text-[var(--fd-info)]">{pendingApprovals.length} İstek</h3>
                <p className="text-[10px] text-[var(--fd-text3)] mt-1">Müdür veya admin yetkilendirmesi bekleyen arıza/bakım kayıtları</p>
              </div>

              {pendingApprovals.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {pendingApprovals.slice(0, 3).map(item => (
                    <span
                      key={item.id}
                      className="bg-blue-500/10 text-[var(--fd-info)] border border-blue-500/20 px-2 py-0.5 rounded-[var(--fd-r-sm)] text-xs font-bold font-mono"
                      title={item.aciklama}
                    >
                      {item.plaka}
                    </span>
                  ))}
                  {pendingApprovals.length > 3 && (
                    <span className="text-[10px] text-[var(--fd-text3)] font-mono self-center font-bold">
                      +{pendingApprovals.length - 3} daha
                    </span>
                  )}
                </div>
              ) : (
                <div className="text-[11px] text-[var(--fd-success)] font-bold pt-2 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" /> Tüm talepler onaylanmış durumda
                </div>
              )}
            </CardContent>
          </Card>

          {/* Skorbord 4: Muayene Takip Alarmı */}
          <Card className="bg-[var(--fd-surface)] border border-[var(--fd-border)] border-t-4 border-t-[var(--fd-info)] p-[calc(var(--fd-sp)*1.5)] rounded-[var(--fd-r)] shadow-[var(--fd-shadow-sm)] relative overflow-hidden group hover:border-[var(--fd-border-strong)] transition duration-300">
            <div className="absolute -right-4 -bottom-4 opacity-5 text-[var(--fd-accent)] group-hover:scale-110 transition duration-500">
              <Calendar className="w-24 h-24" />
            </div>
            <CardContent className="p-0 flex flex-col justify-between h-full space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--fd-accent)] font-semibold tracking-wider uppercase">MUAYENE PLANI ALARMI</span>
                <div className="p-2 bg-[var(--fd-accent-soft)] border border-[var(--fd-accent-soft2)] text-[var(--fd-accent)] rounded-xl">
                  <Calendar className="w-5 h-5" />
                </div>
              </div>
              <div>
                <h3 className="text-3xl font-bold text-[var(--fd-accent)]">{inspectionRiskList.length} Risk Sınırında</h3>
                <p className="text-[10px] text-[var(--fd-text3)] mt-1">Muayene süresi geçmiş veya 30 günden az kalmış araçlar</p>
              </div>

              {inspectionRiskList.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {inspectionRiskList.map(item => (
                    <button
                      key={item.plaka}
                      onClick={() => jumpToVehicle(item.plaka)}
                      className="bg-[var(--fd-accent-soft)] hover:bg-[var(--fd-accent)] text-[var(--fd-accent)] hover:text-[#ffffff] border border-[var(--fd-accent-soft2)] px-2.5 py-0.5 rounded-[var(--fd-r-sm)] text-xs font-bold transition flex items-center gap-1"
                      title={`${item.model} (${item.remainingDays <= 0 ? 'Süre Geçti' : `${item.remainingDays} gün`})`}
                    >
                      {item.plaka} <span className="text-[10px] opacity-80">{item.remainingDays <= 0 ? 'Geçti' : `${item.remainingDays}g`}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-[var(--fd-success)] font-bold pt-2 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" /> Tüm araç muayeneleri güncel
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ═══ 2. Taktik Filtre Paneli & Sekmeler ═══ */}
        <div className="flex flex-col gap-4 bg-[var(--fd-surface)] border border-[var(--fd-border)] p-[calc(var(--fd-sp)*1.5)] rounded-[var(--fd-r)] backdrop-blur-xl">
          
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
            
            {/* Sekmeli Navigasyon */}
            <div className="flex flex-wrap bg-[var(--fd-surface2)] rounded-[var(--fd-r)] p-1 border border-[var(--fd-border)] self-stretch lg:self-start gap-1">
              <button
                onClick={() => setActiveTab('bakim')}
                className={`px-2.5 py-1.5 sm:px-4 sm:py-2.5 min-h-[38px] sm:min-h-[44px] rounded-[var(--fd-r-sm)] text-[10px] sm:text-xs font-bold transition-all duration-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  activeTab === 'bakim'
                    ? 'bg-[var(--fd-accent)] text-[#ffffff] shadow-[var(--fd-shadow-sm)] font-black'
                    : 'text-[var(--fd-text3)] hover:text-[var(--fd-text2)]'
                }`}
              >
                <Wrench className="w-3.5 h-3.5" /> Bakım & Arıza ({totalBakimCount})
              </button>
              <button
                onClick={() => setActiveTab('yakit')}
                className={`px-2.5 py-1.5 sm:px-4 sm:py-2.5 min-h-[38px] sm:min-h-[44px] rounded-[var(--fd-r-sm)] text-[10px] sm:text-xs font-bold transition-all duration-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  activeTab === 'yakit'
                    ? 'bg-[var(--fd-accent)] text-[#ffffff] shadow-[var(--fd-shadow-sm)] font-black'
                    : 'text-[var(--fd-text3)] hover:text-[var(--fd-text2)]'
                }`}
              >
                <Fuel className="w-3.5 h-3.5" /> Yakıt Günlükleri ({totalYakitCount})
              </button>
              <button
                onClick={() => setActiveTab('sarf')}
                className={`px-2.5 py-1.5 sm:px-4 sm:py-2.5 min-h-[38px] sm:min-h-[44px] rounded-[var(--fd-r-sm)] text-[10px] sm:text-xs font-bold transition-all duration-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  activeTab === 'sarf'
                    ? 'bg-[var(--fd-accent)] text-[#ffffff] shadow-[var(--fd-shadow-sm)] font-black'
                    : 'text-[var(--fd-text3)] hover:text-[var(--fd-text2)]'
                }`}
              >
                <Droplets className="w-3.5 h-3.5" /> Sarf İstatistikleri ({sarfStats.length})
              </button>
              <button
                onClick={() => setActiveTab('muayene')}
                className={`px-2.5 py-1.5 sm:px-4 sm:py-2.5 min-h-[38px] sm:min-h-[44px] rounded-[var(--fd-r-sm)] text-[10px] sm:text-xs font-bold transition-all duration-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  activeTab === 'muayene'
                    ? 'bg-[var(--fd-accent)] text-[#ffffff] shadow-[var(--fd-shadow-sm)] font-black'
                    : 'text-[var(--fd-text3)] hover:text-[var(--fd-text2)]'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" /> Muayene Takip Sayaçları ({vehicles.length})
              </button>
              <button
                onClick={() => setActiveTab('onay')}
                className={`px-2.5 py-1.5 sm:px-4 sm:py-2.5 min-h-[38px] sm:min-h-[44px] rounded-[var(--fd-r-sm)] text-[10px] sm:text-xs font-bold transition-all duration-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  activeTab === 'onay'
                    ? 'bg-[var(--fd-info)] text-[#ffffff] shadow-[var(--fd-shadow-sm)] font-black'
                    : 'text-[var(--fd-text3)] hover:text-[var(--fd-text2)]'
                }`}
              >
                <CheckCircle className="w-3.5 h-3.5" /> Müdür Onayı
                {pendingApprovals.length > 0 && (
                  <span className="ml-1 bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full leading-none animate-pulse">
                    {pendingApprovals.length}
                  </span>
                )}
              </button>
            </div>

            {/* Arama & Seçim Filtre Barı */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="relative flex-1 sm:w-64 min-h-[44px]">
                <input
                  type="text"
                  placeholder="Plaka, işlem veya açıklama ara..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] rounded-[var(--fd-r)] px-3 pl-9 py-2 min-h-[44px] text-sm text-[var(--fd-text)] focus:outline-none focus:border-[var(--fd-accent)] transition font-medium"
                />
                <Search className="absolute left-3 top-3 w-4 h-4 text-[var(--fd-text3)]" />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-3 top-3.5 text-[var(--fd-text3)] hover:text-[var(--fd-text2)]">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <select
                value={selectedPlaka}
                onChange={e => setSelectedPlaka(e.target.value)}
                className="min-h-[44px] rounded-[var(--fd-r)] border border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text)] px-3 text-xs font-semibold focus:outline-none focus:border-[var(--fd-accent)] transition"
              >
                <option value="all">Tüm Araçlar</option>
                {vehicles.map(v => (
                  <option key={v.plaka} value={v.plaka}>
                    {v.filo_no ? `${v.filo_no} NOLU ${v.aciklama || ''} (${v.plaka})` : `${v.plaka} - ${v.marka}`}
                  </option>
                ))}
              </select>
            </div>

          </div>

        </div>

        {/* ═══ Sekme 1: Bakım & Arıza Geçmişi (570+ Kayıt) ═══ */}
        {activeTab === 'bakim' && (
          <Card className="border-[var(--fd-border)] bg-[var(--fd-surface)] backdrop-blur-md shadow-[var(--fd-shadow-sm)] overflow-hidden rounded-[var(--fd-r)]">
            <CardHeader className="border-b border-[var(--fd-border)] bg-[var(--fd-surface2)]/50 pb-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-base font-black tracking-wider uppercase text-[var(--fd-text2)] flex items-center gap-2">
                    <Wrench className="w-5 h-5 text-[var(--fd-accent)]" /> BAKIM & ARIZA GEÇMİŞİ
                  </CardTitle>
                  <p className="text-xs text-[var(--fd-text3)] mt-1">Belediye Postgres DB üzerinden anlık çekilen gerçek itfaiye bakım günlükleri</p>
                </div>
                <span className="text-[10px] font-mono bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text3)] px-2.5 py-1 rounded-md">
                  KAYIT: {filteredApprovedLogs.length}
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {filteredApprovedLogs.length === 0 ? (
                <div className="text-center p-12 text-[var(--fd-text3)] bg-[var(--fd-surface2)]/20">
                  Arama kriterlerinize veya seçili filtreye uygun onaylı bakım kaydı bulunamadı.
                </div>
              ) : (
                <div className="w-full max-w-full overflow-x-auto -webkit-overflow-scrolling-touch box-border rounded-b-xl scrollbar-thin scrollbar-thumb-slate-800">
                  <table className="w-full min-w-[900px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-[var(--fd-border)] bg-[var(--fd-surface2)]/60 text-[var(--fd-text3)] font-bold text-xs uppercase tracking-wider">
                        <th className="p-4 text-left">Araç Plakası</th>
                        <th className="p-4 text-left">İşlem Kategori</th>
                        <th className="p-4 text-left">Tarih</th>
                        <th className="p-4 text-left">Yapılan İşlem Açıklaması</th>
                        <th className="p-4 text-right">Maliyet</th>
                        <th className="p-4 text-center">Durum</th>
                        <th className="p-4 text-right">Aksiyon</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--fd-border)]/50">
                      {filteredApprovedLogs.map(m => (
                        <tr key={`vm-${m.id}`} className="hover:bg-[var(--fd-surface2)]/40 transition duration-150 group">
                          <td className="p-4 align-middle">
                            <span className="font-bold text-[var(--fd-text)] bg-[var(--fd-surface2)] border border-[var(--fd-border)] px-2.5 py-1 rounded-[var(--fd-r-sm)] text-xs tracking-wider">
                              {m.plaka}
                            </span>
                          </td>
                          <td className="p-4 align-middle">
                            <Badge className={`font-semibold px-2 py-0.5 rounded-md text-[11px] ${
                              m.tip === 'tamir' 
                                ? 'bg-[rgba(220,38,38,0.08)] dark:bg-[rgba(220,38,38,0.15)] border border-[rgba(220,38,38,0.15)] dark:border-[rgba(220,38,38,0.25)] text-[var(--fd-danger)]' 
                                : 'bg-[var(--fd-accent-soft)] border border-[var(--fd-accent-soft2)] text-[var(--fd-accent)]'
                            }`}>
                              {m.tip === 'tamir' ? 'TAMİR / ARIZA' : 'YAĞ BAKIMI'}
                            </Badge>
                          </td>
                          <td className="p-4 align-middle text-[var(--fd-text3)] font-medium text-xs">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-[var(--fd-text3)]" />
                              {new Date(m.tarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </div>
                          </td>
                          <td className="p-4 align-middle text-[var(--fd-text2)] text-xs max-w-sm truncate" title={m.aciklama}>
                            {m.aciklama}
                          </td>
                          <td className="p-4 align-middle text-right font-mono font-bold text-sm">
                            {Number(m.maliyet) > 0 ? (
                              <span className="text-[var(--fd-danger)]">₺{Number(m.maliyet).toLocaleString('tr-TR')}</span>
                            ) : (
                              <span className="text-[var(--fd-text3)]">—</span>
                            )}
                          </td>
                          <td className="p-4 align-middle text-center">{getStatusBadge(m.durum || 'Onaylandı')}</td>
                          <td className="p-4 align-middle text-right">
                            <Button
                              onClick={() => jumpToVehicle(m.plaka)}
                              className="bg-cyan-500/10 hover:bg-cyan-500 text-[var(--fd-accent)] hover:text-slate-950 font-bold text-xs min-h-[44px] min-w-[100px] rounded-[var(--fd-r-sm)] transition duration-150 active:scale-95 ml-auto flex items-center justify-center gap-1 border border-cyan-500/20"
                            >
                              🔍 Aracı İncele
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ═══ Sekme 2: Yakıt Günlükleri ═══ */}
        {activeTab === 'yakit' && (
          <Card className="border-[var(--fd-border)] bg-[var(--fd-surface)] backdrop-blur-md shadow-[var(--fd-shadow-sm)] overflow-hidden rounded-[var(--fd-r)]">
            <CardHeader className="border-b border-[var(--fd-border)] bg-[var(--fd-surface2)]/50 pb-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-base font-black tracking-wider uppercase text-[var(--fd-text2)] flex items-center gap-2">
                    <Fuel className="w-5 h-5 text-[var(--fd-accent)]" /> YAKIT ALIM GÜNLÜKLERİ
                  </CardTitle>
                  <p className="text-xs text-[var(--fd-text3)] mt-1">Sivas Belediyesi İtfaiye filosu yakıt ikmal geçmişi</p>
                </div>
                <span className="text-[10px] font-mono bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text3)] px-2.5 py-1 rounded-md">
                  KAYIT: {filteredFuelLogs.length}
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {filteredFuelLogs.length === 0 ? (
                <div className="text-center p-12 text-[var(--fd-text3)] bg-[var(--fd-surface2)]/20">
                  Arama kriterlerinize veya seçili filtreye uygun yakıt kaydı bulunamadı.
                </div>
              ) : (
                <div className="w-full max-w-full overflow-x-auto -webkit-overflow-scrolling-touch box-border rounded-b-xl scrollbar-thin scrollbar-thumb-slate-800">
                  <table className="w-full min-w-[900px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-[var(--fd-border)] bg-[var(--fd-surface2)]/60 text-[var(--fd-text3)] font-bold text-xs uppercase tracking-wider">
                        <th className="p-4 text-left">Araç Plakası</th>
                        <th className="p-4 text-left">Tarih</th>
                        <th className="p-4 text-right">Litre</th>
                        <th className="p-4 text-right">Tutar (₺)</th>
                        <th className="p-4 text-left">Kilometre</th>
                        <th className="p-4 text-left">İstasyon</th>
                        <th className="p-4 text-left">Kayıt Eden</th>
                        <th className="p-4 text-right">Aksiyon</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--fd-border)]/50">
                      {filteredFuelLogs.map(log => (
                        <tr key={log.id} className="hover:bg-[var(--fd-surface2)]/40 transition duration-150 group">
                          <td className="p-4 align-middle">
                            <span className="font-bold text-[var(--fd-text)] bg-[var(--fd-surface2)] border border-[var(--fd-border)] px-2.5 py-1 rounded-[var(--fd-r-sm)] text-xs tracking-wider">
                              {log.plaka}
                            </span>
                          </td>
                          <td className="p-4 align-middle text-[var(--fd-text3)] font-medium text-xs">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-[var(--fd-text3)]" />
                              {new Date(log.tarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </div>
                          </td>
                          <td className="p-4 align-middle text-right font-bold text-[var(--fd-accent)]">
                            <div className="flex items-center justify-end gap-1 font-mono">
                              <Droplets className="w-3.5 h-3.5 text-[var(--fd-accent)]" /> {log.litre} lt
                            </div>
                          </td>
                          <td className="p-4 align-middle text-right font-mono font-bold text-[var(--fd-text)]">
                            ₺{(Number(log.tutar) || 0).toLocaleString('tr-TR')}
                          </td>
                          <td className="p-4 align-middle text-[var(--fd-text3)] font-mono text-xs">
                            {Number(log.kmAt) > 0 ? `${Number(log.kmAt).toLocaleString('tr-TR')} KM` : '—'}
                          </td>
                          <td className="p-4 align-middle text-[var(--fd-text3)] text-xs">
                            <div className="flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-[var(--fd-text3)]" />
                              {log.istasyon || '—'}
                            </div>
                          </td>
                          <td className="p-4 align-middle text-[var(--fd-text2)] text-xs font-semibold">
                            <div className="flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 text-[var(--fd-text3)]" />
                              {log.kayitEden || '—'}
                            </div>
                          </td>
                          <td className="p-4 align-middle text-right">
                            <Button
                              onClick={() => jumpToVehicle(log.plaka)}
                              className="bg-cyan-500/10 hover:bg-cyan-500 text-[var(--fd-accent)] hover:text-slate-950 font-bold text-xs min-h-[44px] min-w-[100px] rounded-[var(--fd-r-sm)] transition duration-150 active:scale-95 ml-auto flex items-center justify-center gap-1 border border-cyan-500/20"
                            >
                              🔍 Aracı İncele
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ═══ Sekme 3: Sarf Malzeme Takip Entegrasyonu ═══ */}
        {activeTab === 'sarf' && (
          <Card className="border-[var(--fd-border)] bg-[var(--fd-surface)] backdrop-blur-md shadow-[var(--fd-shadow-sm)] overflow-hidden rounded-[var(--fd-r)]">
            <CardHeader className="border-b border-[var(--fd-border)] bg-[var(--fd-surface2)]/50 pb-4">
              <div>
                <CardTitle className="text-base font-black tracking-wider uppercase text-[var(--fd-text2)] flex items-center gap-2">
                  <Droplets className="w-5 h-5 text-[var(--fd-accent)]" /> MOTOR YAĞI & ANTİFRİZ TOPLAM SARF İSTATİSTİKLERİ
                </CardTitle>
                <p className="text-xs text-[var(--fd-text3)] mt-1">İlgili araçların bakım geçmişindeki motor yağı ekleme ve radyatör antifriz takviye verilerinin dynamic analizi</p>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {sarfStats.length === 0 ? (
                <div className="text-center p-12 text-[var(--fd-text3)] bg-[var(--fd-surface2)]/20">
                  Henüz yağ veya antifriz sarfiyatına dair veri kaydı bulunmamaktadır.
                </div>
              ) : (
                <div className="w-full max-w-full overflow-x-auto -webkit-overflow-scrolling-touch box-border rounded-b-xl scrollbar-thin scrollbar-thumb-slate-800">
                  <table className="w-full min-w-[700px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-[var(--fd-border)] bg-[var(--fd-surface2)]/60 text-[var(--fd-text3)] font-bold text-xs uppercase tracking-wider">
                        <th className="p-4 text-left">Araç Plakası</th>
                        <th className="p-4 text-left">Marka / Model</th>
                        <th className="p-4 text-right">Toplam Motor Yağı İlavesi</th>
                        <th className="p-4 text-right">Toplam Radyatör Antifrizi</th>
                        <th className="p-4 text-center">Analiz Edilen Kayıt</th>
                        <th className="p-4 text-right">Aksiyon</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--fd-border)]/50">
                      {sarfStats.map(item => (
                        <tr key={item.plaka} className="hover:bg-[var(--fd-surface2)]/40 transition duration-150">
                          <td className="p-4 align-middle">
                            <span className="font-bold text-[var(--fd-text)] bg-[var(--fd-surface2)] border border-[var(--fd-border)] px-2.5 py-1 rounded-[var(--fd-r-sm)] text-xs tracking-wider">
                              {item.plaka}
                            </span>
                          </td>
                          <td className="p-4 align-middle text-[var(--fd-text2)] font-semibold">{item.model}</td>
                          <td className="p-4 align-middle text-right font-mono font-bold text-[var(--fd-amber)]">
                            {item.yag > 0 ? `${item.yag} Litre` : '—'}
                          </td>
                          <td className="p-4 align-middle text-right font-mono font-bold text-[var(--fd-accent)]">
                            {item.antifriz > 0 ? `${item.antifriz} Litre` : '—'}
                          </td>
                          <td className="p-4 align-middle text-center text-xs text-[var(--fd-text3)] font-medium">
                            {item.count} Kez Yağ/Sıvı İşlemi
                          </td>
                          <td className="p-4 align-middle text-right">
                            <Button
                              onClick={() => jumpToVehicle(item.plaka)}
                              className="bg-cyan-500/10 hover:bg-cyan-500 text-[var(--fd-accent)] hover:text-slate-950 font-bold text-xs min-h-[44px] min-w-[100px] rounded-[var(--fd-r-sm)] transition duration-150 active:scale-95 ml-auto flex items-center justify-center gap-1 border border-cyan-500/20"
                            >
                              🔍 Aracı İncele
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ═══ Sekme 4: Müdür Onay Alanı ═══ */}
        {activeTab === 'onay' && (
          <Card className="border-[var(--fd-border)] bg-[var(--fd-surface)] backdrop-blur-md shadow-[var(--fd-shadow-sm)] overflow-hidden rounded-[var(--fd-r)]">
            <CardHeader className="border-b border-[var(--fd-border)] bg-[var(--fd-surface2)]/50 pb-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-base font-black tracking-wider uppercase text-[var(--fd-text2)] flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-[var(--fd-accent)]" /> MÜDÜR ONAY YÖNETİMİ
                  </CardTitle>
                  <p className="text-xs text-[var(--fd-text3)] mt-1">Durumu &quot;Bekliyor&quot; olan itfaiye arıza ve bakım girişlerinin onay paneli</p>
                </div>
                {pendingApprovals.length > 0 && (
                  <Badge className="bg-red-950/40 border border-red-500/30 text-[var(--fd-danger)] font-black px-3 py-1 text-xs animate-pulse">
                    {pendingApprovals.length} İstek Bekliyor
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {!isMudur ? (
                <div className="p-8 bg-[var(--fd-surface2)]/20 flex items-start gap-3 border-t border-[var(--fd-border)]">
                  <div className="p-2 bg-[var(--fd-surface2)] rounded-xl border border-[var(--fd-border)] shrink-0">
                    <CheckCircle className="w-5 h-5 text-[var(--fd-text3)]" />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-[var(--fd-text3)]">Taktik Yetki Kısıtlaması</span>
                    <p className="text-[11px] text-[var(--fd-text3)] leading-relaxed">
                      Bakım onay işlemleri yalnızca Müdür veya Admin yetkileriyle gerçekleştirilebilir. Bu ekran şu anda salt okunur moddadır.
                    </p>
                  </div>
                </div>
              ) : pendingApprovals.length === 0 ? (
                <div className="text-center p-12 text-[var(--fd-text3)] bg-[var(--fd-surface2)]/20 flex flex-col items-center">
                  <CheckCircle className="w-10 h-10 text-[var(--fd-accent)]/30 mb-3" />
                  <p className="font-semibold text-[var(--fd-text2)]">Tüm arıza/bakım kayıtları onaylanmış durumda</p>
                  <p className="text-xs text-[var(--fd-text3)] mt-1">Bekleyen yetkilendirme isteği bulunmamaktadır.</p>
                </div>
              ) : (
                <div className="w-full max-w-full overflow-x-auto -webkit-overflow-scrolling-touch box-border rounded-b-xl scrollbar-thin scrollbar-thumb-slate-800">
                  <table className="w-full min-w-[800px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-[var(--fd-border)] bg-[var(--fd-surface2)]/60 text-[var(--fd-text3)] font-bold text-xs uppercase tracking-wider">
                        <th className="p-4 text-left">Araç Plakası</th>
                        <th className="p-4 text-left">İşlem Kategori</th>
                        <th className="p-4 text-left">Tarih</th>
                        <th className="p-4 text-left">Açıklama</th>
                        <th className="p-4 text-right">Maliyet</th>
                        <th className="p-4 text-right">Aksiyonlar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--fd-border)]/50">
                      {pendingApprovals.map(m => (
                        <tr key={m.id} className="hover:bg-[var(--fd-surface2)]/40 transition duration-150 bg-amber-500/[0.01]">
                          <td className="p-4 align-middle">
                            <span className="font-bold text-[var(--fd-text)] bg-[var(--fd-surface2)] border border-[var(--fd-border)] px-2.5 py-1 rounded-[var(--fd-r-sm)] text-xs tracking-wider">
                              {m.plaka}
                            </span>
                          </td>
                          <td className="p-4 align-middle">
                            <Badge className="bg-[rgba(245,158,11,0.08)] dark:bg-[rgba(245,158,11,0.15)] border border-[rgba(245,158,11,0.15)] dark:border-[rgba(245,158,11,0.25)] text-[var(--fd-amber)] font-semibold px-2 py-0.5 rounded-md text-[11px]">
                              {m.tip === 'tamir' ? 'TAMİR / ARIZA' : 'YAĞ BAKIMI'}
                            </Badge>
                          </td>
                          <td className="p-4 align-middle text-[var(--fd-text3)] font-medium text-xs">
                            {new Date(m.tarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="p-4 align-middle text-[var(--fd-text2)] text-xs max-w-xs truncate">{m.aciklama}</td>
                          <td className="p-4 align-middle text-right font-mono font-bold text-[var(--fd-danger)]">
                            {Number(m.maliyet) > 0 ? `₺${Number(m.maliyet).toLocaleString('tr-TR')}` : '—'}
                          </td>
                          <td className="p-4 align-middle text-right flex items-center justify-end gap-2">
                            <Button
                              onClick={() => jumpToVehicle(m.plaka)}
                              className="bg-[var(--fd-surface2)] hover:bg-slate-850 text-[var(--fd-text2)] border border-[var(--fd-border)] text-xs px-3 py-1.5 min-h-[44px] rounded-[var(--fd-r-sm)] font-bold transition duration-150 active:scale-95 shrink-0"
                            >
                              🔍 Detay
                            </Button>
                            <Button
                              className="bg-[var(--fd-success)] hover:opacity-90 text-slate-950 font-black text-xs px-3.5 py-1.5 min-h-[44px] rounded-[var(--fd-r-sm)] flex items-center gap-1 shadow-md hover:scale-[1.02] transition"
                              onClick={() => handleApprove(m.id)}
                              disabled={updatingId === m.id}
                            >
                              {updatingId === m.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                              Bakımı Onayla
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ═══ Sekme 5: Muayene Takip Sayaçları Grid İçeriği ═══ */}
        {activeTab === 'muayene' && (
          <div className="space-y-6">
            <Card className="border-[var(--fd-border)] bg-[var(--fd-surface)] backdrop-blur-md shadow-[var(--fd-shadow-sm)] overflow-hidden rounded-[var(--fd-r)]">
              <CardHeader className="border-b border-[var(--fd-border)] bg-[var(--fd-surface2)]/50 pb-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-base font-black tracking-wider uppercase text-[var(--fd-text2)] flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-[var(--fd-accent)]" /> TÜVTÜRK ARAÇ MUAYENE GEÇERLİLİK TAKİBİ
                    </CardTitle>
                    <p className="text-xs text-[var(--fd-text3)] mt-1">İtfaiye filosundaki araçların TÜVTÜRK muayene geçerlilik süreleri ve kalan gün sayaçları</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {vehicles.map(v => {
                    const inspectionStatus = getInspectionStatus(v.next_inspection_date);
                    const isEditingThis = editingPlaka === v.plaka;
                    return (
                      <div 
                        key={v.plaka}
                        className="bg-[var(--fd-surface2)]/75 backdrop-blur-md border border-[var(--fd-border)]/60 p-4 rounded-2xl flex flex-col justify-between hover:border-cyan-500/30 transition duration-300 shadow-[0_4px_30px_rgba(0,0,0,0.4)]"
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <h3 className="font-mono font-bold text-[var(--fd-text2)] tracking-tight">{v.plaka}</h3>
                            <p className="text-[11px] text-[var(--fd-text3)] font-semibold">{v.marka} {v.model || ''} - {v.arac_tipi || v.aracTipi}</p>
                          </div>
                          <Button
                            onClick={() => jumpToVehicle(v.plaka)}
                            size="sm"
                            className="bg-cyan-500/10 hover:bg-cyan-500 text-[var(--fd-accent)] hover:text-slate-950 font-bold text-[10px] px-2 py-1 h-7 rounded-md transition duration-150 active:scale-95 animate-in fade-in"
                          >
                            Detay
                          </Button>
                        </div>
                        
                        {/* Glasmorfik Muayene Takip Bileşeni */}
                        {isEditingThis ? (
                          <div className="bg-[var(--fd-surface2)]/80 border border-[var(--fd-border)]/80 rounded-xl p-3 flex flex-col gap-2 w-full">
                            <p className="text-[10px] font-bold text-[var(--fd-text3)] uppercase tracking-wider">Muayene Tarihi Güncelle</p>
                            <div className="flex items-center gap-2">
                              <input
                                type="date"
                                value={editingNewDate}
                                onChange={(e) => setEditingNewDate(e.target.value)}
                                className="bg-[var(--fd-surface2)] border border-[var(--fd-border)] rounded-[var(--fd-r-sm)] px-2 py-1 text-xs text-[var(--fd-text2)] font-mono focus:outline-none focus:border-cyan-500/50 flex-1 min-h-[32px]"
                              />
                              <Button
                                onClick={() => handleUpdateInspectionDate(v.plaka)}
                                disabled={isEditingUpdating}
                                className="bg-cyan-500 hover:bg-cyan-600 text-slate-950 px-2.5 py-1 h-8 rounded-[var(--fd-r-sm)] text-[10px] font-extrabold flex items-center gap-1 transition disabled:opacity-50 cursor-pointer"
                              >
                                {isEditingUpdating ? '...' : '💾 Güncelle'}
                              </Button>
                              <button
                                onClick={() => { setEditingPlaka(null); setEditingNewDate('') }}
                                className="bg-[var(--fd-surface3)] hover:bg-[var(--fd-surface2)] text-[var(--fd-text3)] hover:text-[var(--fd-text2)] p-1.5 rounded-[var(--fd-r-sm)] text-xs transition cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center border border-[var(--fd-border)]"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-[var(--fd-surface2)]/50 border border-[var(--fd-border)]/80 rounded-xl p-3 flex justify-between items-center relative group/inspection w-full">
                            <div>
                              <p className="text-[9px] font-bold text-[var(--fd-text3)] uppercase tracking-wider">Muayene Geçerlilik</p>
                              <p className="text-xs font-semibold text-[var(--fd-text2)] font-mono mt-0.5">
                                📅 Son Geçerlilik: {formatToTurkishDate(v.next_inspection_date)}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Badge className={`text-[10px] font-bold px-2 py-0.5 ${inspectionStatus.badgeClass}`}>
                                {inspectionStatus.text}
                              </Badge>
                              {canUpdateInspection && (
                                <button
                                  onClick={() => {
                                    setEditingPlaka(v.plaka);
                                    setEditingNewDate(v.next_inspection_date || '');
                                  }}
                                  className="p-1 rounded-[var(--fd-r-sm)] bg-slate-800/60 hover:bg-cyan-500/10 border border-slate-700/50 hover:border-cyan-500/30 text-slate-350 hover:text-[var(--fd-accent)] transition cursor-pointer flex items-center justify-center"
                                  title="Muayene Tarihini Güncelle"
                                >
                                  <span className="text-[11px] leading-none">✏️</span>
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ═══ Yeni Kayıt Ekleme Modalı ═══ */}
        {isCreateOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
            <Card className="w-full max-w-2xl bg-[var(--fd-surface)] border border-[var(--fd-border-strong)] shadow-[var(--fd-shadow-lg)] overflow-hidden rounded-[var(--fd-r-lg)] animate-in zoom-in-95 duration-200 my-8">
              <CardHeader className="bg-[var(--fd-surface2)] border-b border-[var(--fd-border)] p-5 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2 font-black text-[var(--fd-accent)] tracking-wider">
                    <Plus className="w-5 h-5 text-[var(--fd-accent)]" /> TAKTİK KAYIT PANELİ
                  </CardTitle>
                  <p className="text-xs text-[var(--fd-text3)] mt-1">Filoya yeni bakım/arıza veya yakıt alımı kaydı girin</p>
                </div>
                <Button
                  variant="ghost"
                  className="text-[var(--fd-text3)] hover:text-white min-h-[44px] min-w-[44px]"
                  onClick={() => { setIsCreateOpen(false); resetForms() }}
                >
                  <X className="w-5 h-5" />
                </Button>
              </CardHeader>

              <form onSubmit={handleCreateSubmit}>
                <CardContent className="p-6 space-y-6 max-h-[65vh] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">

                  {/* Kayıt Türü Seçimi */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-[var(--fd-text3)] uppercase tracking-wider block">Kayıt Türü <span className="text-[var(--fd-danger)]">*</span></label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setKayitTuru('bakim')}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] rounded-xl font-bold text-xs border transition-all duration-200 ${
                          kayitTuru === 'bakim'
                            ? 'bg-[var(--fd-accent-soft2)] border-[var(--fd-accent-soft)] text-[var(--fd-accent)] shadow-[var(--fd-shadow-sm)] font-bold'
                            : 'bg-[var(--fd-surface2)] border-[var(--fd-border)] text-[var(--fd-text3)] hover:border-slate-700'
                        }`}
                      >
                        <Wrench className="w-4 h-4" /> Bakım / Arıza Kaydı
                      </button>
                      <button
                        type="button"
                        onClick={() => setKayitTuru('yakit')}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] rounded-xl font-bold text-xs border transition-all duration-200 ${
                          kayitTuru === 'yakit'
                            ? 'bg-[var(--fd-accent-soft2)] border-[var(--fd-accent-soft)] text-[var(--fd-accent)] shadow-[var(--fd-shadow-sm)] font-bold'
                            : 'bg-[var(--fd-surface2)] border-[var(--fd-border)] text-[var(--fd-text3)] hover:border-slate-700'
                        }`}
                      >
                        <Fuel className="w-4 h-4" /> Yakıt Alımı Kaydı
                      </button>
                    </div>
                  </div>

                  {/* ─── Bakım/Arıza Formu ─── */}
                  {kayitTuru === 'bakim' && (
                    <div className="space-y-4 bg-[var(--fd-surface2)]/50 p-4 rounded-[var(--fd-r)] border border-[var(--fd-border)]">
                      <h3 className="font-bold text-sm text-[var(--fd-accent)] border-b border-[var(--fd-border)] pb-1.5 flex items-center gap-1.5">
                        <Wrench className="w-4 h-4" /> Bakım / Arıza Detayları
                      </h3>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-[var(--fd-text3)] block">Araç Plakası <span className="text-[var(--fd-danger)]">*</span></label>
                          <select
                            className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r)] px-3 py-2 min-h-[44px] text-sm focus:outline-none focus:border-[var(--fd-accent)] transition font-semibold"
                            value={bakimForm.plaka}
                            onChange={e => setBakimForm(prev => ({ ...prev, plaka: e.target.value }))}
                            required
                          >
                            <option value="">Araç Seçiniz...</option>
                            {vehicles.map(v => (
                              <option key={v.plaka} value={v.plaka}>
                                {v.filo_no ? `${v.filo_no} NOLU ${v.aciklama || ''} (${v.plaka})` : `${v.plaka} - ${v.marka}`}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-[var(--fd-text3)] block">İşlem Türü <span className="text-[var(--fd-danger)]">*</span></label>
                          <select
                            className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r)] px-3 py-2 min-h-[44px] text-sm focus:outline-none focus:border-[var(--fd-accent)] transition font-semibold"
                            value={bakimForm.islem_turu}
                            onChange={e => setBakimForm(prev => ({ ...prev, islem_turu: e.target.value }))}
                          >
                            {ISLEM_TURLERI.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-[var(--fd-text3)] block">Kilometre (KM)</label>
                          <input
                            type="number"
                            className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r)] px-3 py-2 min-h-[44px] text-sm focus:outline-none focus:border-[var(--fd-accent)] transition font-medium"
                            placeholder="Örn: 125000"
                            value={bakimForm.kilometre}
                            onChange={e => setBakimForm(prev => ({ ...prev, kilometre: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-[var(--fd-text3)] block">Maliyet (₺)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r)] px-3 py-2 min-h-[44px] text-sm focus:outline-none focus:border-[var(--fd-accent)] transition font-medium"
                            placeholder="Örn: 4500"
                            value={bakimForm.maliyet}
                            onChange={e => setBakimForm(prev => ({ ...prev, maliyet: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1.5 sm:col-span-2">
                          <label className="text-xs font-bold text-[var(--fd-text3)] block">Yapılan İşlem Detayı / Sarfiyat Bildirimi</label>
                          <textarea
                            rows={3}
                            className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--fd-accent)] transition font-medium resize-none"
                            placeholder="Örn: 7 Litre motor yağı eklendi, yağ filtresi yenilendi..."
                            value={bakimForm.aciklama}
                            onChange={e => setBakimForm(prev => ({ ...prev, aciklama: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1.5 sm:col-span-2">
                          <label className="text-xs font-bold text-[var(--fd-text3)] block">Kaydı Açan Personel</label>
                          <select
                            className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r)] px-3 py-2 min-h-[44px] text-sm focus:outline-none focus:border-[var(--fd-accent)] transition font-semibold"
                            value={bakimForm.kaydi_acan_sicil_no}
                            onChange={e => setBakimForm(prev => ({ ...prev, kaydi_acan_sicil_no: e.target.value }))}
                          >
                            <option value="">Personel Seçiniz...</option>
                            {personnel.map(p => <option key={p.sicil_no} value={p.sicil_no}>{p.ad} {p.soyad} ({p.unvan})</option>)}
                          </select>
                        </div>
                      </div>

                      {/* Fotoğraf Yükleme */}
                      <div className="p-3 border border-dashed border-[var(--fd-border)] bg-[var(--fd-surface2)]/50 rounded-[var(--fd-r)] space-y-3">
                        <div className="flex items-center gap-2 text-xs">
                          <Camera className="w-4 h-4 text-[var(--fd-accent)]" />
                          <span className="font-bold text-slate-350">Fotoğraflı Siber Kanıt (Opsiyonel)</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="relative group cursor-pointer border border-[var(--fd-border)] hover:border-[var(--fd-accent)] transition-colors rounded-[var(--fd-r)] bg-[var(--fd-surface2)] w-32 h-20 flex items-center justify-center overflow-hidden">
                            {previewUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={previewUrl} alt="Önizleme" className="w-full h-full object-cover" />
                            ) : (
                              <ImageIcon className="w-6 h-6 text-[var(--fd-text3)] group-hover:scale-110 transition-transform" />
                            )}
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              onChange={handleFileChange}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                          </div>
                          {previewUrl && (
                            <Button type="button" variant="outline" className="border-[var(--fd-border)] text-[var(--fd-text3)] text-xs rounded-[var(--fd-r-sm)] min-h-[44px]" onClick={() => { setFile(null); setPreviewUrl(null) }}>
                              Kaldır
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ─── Yakıt Alımı Formu ─── */}
                  {kayitTuru === 'yakit' && (
                    <div className="space-y-4 bg-[var(--fd-surface2)]/50 p-4 rounded-[var(--fd-r)] border border-[var(--fd-border)]">
                      <h3 className="font-bold text-sm text-[var(--fd-accent)] border-b border-[var(--fd-border)] pb-1.5 flex items-center gap-1.5">
                        <Fuel className="w-4 h-4" /> Yakıt Alım Detayları
                      </h3>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-[var(--fd-text3)] block">Araç Plakası <span className="text-[var(--fd-danger)]">*</span></label>
                          <select
                            className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r)] px-3 py-2 min-h-[44px] text-sm focus:outline-none focus:border-[var(--fd-accent)] transition font-semibold"
                            value={yakitForm.plaka}
                            onChange={e => setYakitForm(prev => ({ ...prev, plaka: e.target.value }))}
                            required
                          >
                            <option value="">Araç Seçiniz...</option>
                            {vehicles.map(v => (
                              <option key={v.plaka} value={v.plaka}>
                                {v.filo_no ? `${v.filo_no} NOLU ${v.aciklama || ''} (${v.plaka})` : `${v.plaka} - ${v.marka}`}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-[var(--fd-text3)] block">Alınan Litre <span className="text-[var(--fd-danger)]">*</span></label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r)] px-3 py-2 min-h-[44px] text-sm focus:outline-none focus:border-[var(--fd-accent)] transition font-medium"
                            placeholder="Örn: 120"
                            value={yakitForm.litre}
                            onChange={e => setYakitForm(prev => ({ ...prev, litre: e.target.value }))}
                            required
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-[var(--fd-text3)] block">Tutar (₺) <span className="text-[var(--fd-danger)]">*</span></label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r)] px-3 py-2 min-h-[44px] text-sm focus:outline-none focus:border-[var(--fd-accent)] transition font-medium"
                            placeholder="Örn: 5340"
                            value={yakitForm.tutar}
                            onChange={e => setYakitForm(prev => ({ ...prev, tutar: e.target.value }))}
                            required
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-[var(--fd-text3)] block">İkmal Kilometresi</label>
                          <input
                            type="number"
                            className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r)] px-3 py-2 min-h-[44px] text-sm focus:outline-none focus:border-[var(--fd-accent)] transition font-medium"
                            placeholder="Sayaç Kilometresi"
                            value={yakitForm.kmAt}
                            onChange={e => setYakitForm(prev => ({ ...prev, kmAt: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-[var(--fd-text3)] block">Akaryakıt İstasyonu</label>
                          <input
                            type="text"
                            className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r)] px-3 py-2 min-h-[44px] text-sm focus:outline-none focus:border-[var(--fd-accent)] transition font-medium"
                            placeholder="Örn: Sivas Belediyesi Akaryakıt İstasyonu"
                            value={yakitForm.istasyon}
                            onChange={e => setYakitForm(prev => ({ ...prev, istasyon: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-[var(--fd-text3)] block">Kayıt Eden Personel</label>
                          <input
                            type="text"
                            className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r)] px-3 py-2 min-h-[44px] text-sm focus:outline-none focus:border-[var(--fd-accent)] transition font-medium"
                            placeholder="Personel Ad Soyad"
                            value={yakitForm.kayitEden}
                            onChange={e => setYakitForm(prev => ({ ...prev, kayitEden: e.target.value }))}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>

                <div className="bg-[var(--fd-surface2)] border-t border-[var(--fd-border)] p-5 flex items-center justify-end gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="border border-[var(--fd-border-strong)] text-[var(--fd-text2)] hover:bg-[var(--fd-surface3)] font-semibold px-4 py-2 min-h-[44px] rounded-[var(--fd-r-sm)] text-xs"
                    onClick={() => { setIsCreateOpen(false); resetForms() }}
                  >
                    Vazgeç
                  </Button>
                  <Button
                    type="submit"
                    className="font-black text-xs px-4 py-3 min-h-[44px] rounded-[var(--fd-r-sm)] flex items-center gap-1.5 shadow-[var(--fd-shadow-sm)] transition text-[#ffffff] bg-[var(--fd-accent)] hover:opacity-90"
                    disabled={isSaving || uploading}
                  >
                    {isSaving || uploading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> {uploading ? 'Görsel Yükleniyor...' : 'Kayıt Yapılıyor...'}
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-3.5 h-3.5" /> {kayitTuru === 'bakim' ? 'Bakım Kaydını Mühürle' : 'Yakıt Kaydını Mühürle'}
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        )}

      </div>
    </PageGuard>
  )
}
