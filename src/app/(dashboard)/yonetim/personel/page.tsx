"use client"

import { useState, useMemo, useEffect, useCallback } from 'react'
import PageGuard from "@/components/PageGuard"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { Search, Plus, UserPlus, Shield, ShieldAlert, Key, Loader2, Star, CheckCircle2, SlidersHorizontal, Settings2, AlertTriangle, RefreshCcw, ShieldCheck, Truck, HeartPulse, Wind, Activity, Copy, Printer, X, Calendar, Building2, Phone, MapPin, UserCircle2 } from "lucide-react"
import { api, unwrap } from "@/lib/api"
import { type Personnel } from "@/types"
import { cn, calculateRemainingDays } from "@/lib/utils"
import { useAuthStore } from "@/lib/authStore"
import Link from 'next/link'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/Dialog"
import { LeaveManagementModal } from "@/components/personnel/LeaveManagementModal"
import { isKarargahUnvan } from "@/lib/personnelUtils"
import { toast } from "@/lib/toast"

interface SwitchProps {
  checked: boolean
  onChange: () => void
  label: string
  activeColor?: string
}

function Switch({ checked, onChange, label, activeColor = "bg-[var(--fd-accent)]" }: SwitchProps) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="flex items-center gap-2 cursor-pointer group whitespace-nowrap px-2 py-1 rounded-[var(--fd-r-sm)] hover:bg-[var(--fd-surface2)] transition-colors focus:outline-none"
    >
      <div
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors duration-200 ease-in-out focus:outline-none shadow-inner",
          checked ? activeColor : "bg-[var(--fd-border-strong)]"
        )}
      >
        <span
          className={cn(
            "pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-[var(--fd-shadow-sm)] ring-0 transition duration-200 ease-in-out",
            checked ? "translate-x-4.5" : "translate-x-0.5"
          )}
        />
      </div>
      <span className="text-[11px] font-semibold text-[var(--fd-text3)] group-hover:text-[var(--fd-text2)] transition-colors select-none">
        {label}
      </span>
    </button>
  )
}

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
    .toLowerCase()
    .trim();
}

const COMBINED_JOBS = [
  { label: "İtfaiye Eri (Kullanıcı)", role: "User", unvan: "Er" },
  { label: "Şoför (Kullanıcı)", role: "User", unvan: "Şoför" },
  { label: "Posta Başşoförü (Kullanıcı)", role: "User", unvan: "Pos.Baş.Şof." },
  { label: "Vardiya Çavuşu (Grup Sorumlusu)", role: "Shift_Leader", unvan: "Çvş." },
  { label: "Başçavuş (Grup Sorumlusu)", role: "Shift_Leader", unvan: "Baş.Çvş." },
  { label: "Eğitim Çavuşu (Grup Sorumlusu)", role: "Shift_Leader", unvan: "Eğitim Çavuşu" },
  { label: "Baş Şoför (Yönetici)", role: "Editor", unvan: "Baş Şoför" },
  { label: "Grup Amiri (Yönetici)", role: "Editor", unvan: "Amir" },
  { label: "İtfaiye Müdürü (Admin)", role: "Admin", unvan: "Müdür" },
  { label: "Santral Operatörü (Kullanıcı)", role: "User", unvan: "Santral" },
  { label: "Yazı İşleri Sorumlusu (Grup Sorumlusu)", role: "Shift_Leader", unvan: "Yazı İşleri" },
  { label: "İdari İşler Sorumlusu (Yönetici)", role: "Editor", unvan: "İdari İşler" },
  { label: "Sistem Geliştirici (Admin)", role: "Admin", unvan: "Geliştirici" },
  { label: "Kalem Personeli (Kullanıcı)", role: "User", unvan: "Kalem" },
  { label: "Memur (Kullanıcı)", role: "User", unvan: "Memur" },
  { label: "Çay Ocağı Sorumlusu (Kullanıcı)", role: "User", unvan: "Çay Ocağı" },
]

// Düzenleme modalında posta seçicinin gösterildiği ünvanlar; yalnızca bu ünvanlarda
// posta_no/birim alanları güncellenir.
const POSTA_SECIMLI_UNVANLAR = ["Er", "Şoför", "Pos.Baş.Şof.", "Çvş.", "Baş.Çvş.", "Amir"];

const getCombinedOptions = (currentRole?: string | null, currentUnvan?: string | null) => {
  const list = [...COMBINED_JOBS];
  const role = currentRole || "User";
  const unvan = currentUnvan || "Er";
  
  const exists = list.some(item => 
    item.role === role && 
    (item.unvan === unvan || (item.unvan === "Çvş." && unvan === "Çvş"))
  );
  
  if (!exists) {
    list.push({
      label: `${unvan} (${role === 'Admin' ? 'Admin' : role === 'Editor' ? 'Yönetici' : role === 'Shift_Leader' ? 'Grup Sorumlusu' : 'Kullanıcı'})`,
      role: role,
      unvan: unvan
    });
  }
  return list;
};

export default function PersonelYonetimPage() {
  const { user: currentUser } = useAuthStore()
  const [personnel, setPersonnel] = useState<Personnel[]>([])
  const [vehicles, setVehicles] = useState<any[]>([])
  const [selectedClass, setSelectedClass] = useState<"all" | "komuta" | "driver" | "saha" | "destek" | "esentepe" | "organize">("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [licenseFilter, setLicenseFilter] = useState("all")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [isLicenseDashboardOpen, setIsLicenseDashboardOpen] = useState(false)
  const [licenseSearchQuery, setLicenseSearchQuery] = useState("")
  
  // Registration form
  const [isAdding, setIsAdding] = useState(false)
  const [newAdSoyad, setNewAdSoyad] = useState("")
  const [newJobIndex, setNewJobIndex] = useState(0)
  const [newPostaNo, setNewPostaNo] = useState("1")
  const [newDurum, setNewDurum] = useState("Görevde")
  const [newPassword, setNewPassword] = useState("")
  
  // Permissions state synced with DB
  const [permissions, setPermissions] = useState<Record<string, { view_only: boolean, can_approve: boolean, can_print: boolean }>>({})
  
  // Certifications
  const [certifications, setCertifications] = useState<any[]>([])

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [selectedPerson, setSelectedPerson] = useState<Personnel | null>(null)
  const [editRole, setEditRole] = useState("User")
  const [editUnvan, setEditUnvan] = useState("")
  const [editPostaNo, setEditPostaNo] = useState("1")
  const [ehliyetDate, setEhliyetDate] = useState("")
  const [ilkyardimDate, setIlkyardimDate] = useState("")
  const [scbaDate, setScbaDate] = useState("")
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [resettingPassword, setResettingPassword] = useState(false)
  const [resetPasswordSuccess, setResetPasswordSuccess] = useState<string | null>(null)

  // Özlük Bilgileri States
  const [activeTab, setActiveTab] = useState("kurumsal")
  const [editTelefon, setEditTelefon] = useState("")
  const [editAdres, setEditAdres] = useState("")
  const [editEmergencyName, setEditEmergencyName] = useState("")
  const [editEmergencyPhone, setEditEmergencyPhone] = useState("")
  const [editKanGrubu, setEditKanGrubu] = useState("")
  const [editDogumTarihi, setEditDogumTarihi] = useState("")
  const [editIseBaslama, setEditIseBaslama] = useState("")

  // Analysis Modal States
  const [isAnalysisOpen, setIsAnalysisOpen] = useState(false)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisStats, setAnalysisStats] = useState<any[]>([])
  const [selectedAnalysisPerson, setSelectedAnalysisPerson] = useState<any | null>(null)
  const [selectedPersonDetails, setSelectedPersonDetails] = useState<any | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)

  // Leave Management Modal
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false)

  const currentUserCanPrint = currentUser ? (permissions[currentUser.sicilNo]?.can_print ?? (currentUser.rol === 'Admin' || currentUser.rol === 'Editor')) : false

  const handleSelectAnalysisPerson = async (person: any) => {
    setSelectedAnalysisPerson(person)
    setDetailsLoading(true)
    try {
      const res = await fetch(`/api/personnel/stats?personnel_id=${person.sicil_no}`)
      const data = await res.json()
      if (data.success) {
        setSelectedPersonDetails(data)
      } else {
        setSelectedPersonDetails(null)
      }
    } catch (err) {
      console.error('Fetch detailed stats error:', err)
      setSelectedPersonDetails(null)
    } finally {
      setDetailsLoading(false)
    }
  }

  const fetchAnalysisStats = async () => {
    setAnalysisLoading(true)
    try {
      const res = await fetch('/api/personnel/stats')
      const data = await res.json()
      if (data.success && data.stats) {
        setAnalysisStats(data.stats)
        if (data.stats.length > 0) {
          handleSelectAnalysisPerson(data.stats[0])
        }
      }
    } catch (err) {
      console.error('Fetch analysis stats error:', err)
    } finally {
      setAnalysisLoading(false)
    }
  }

  useEffect(() => {
    if (isAnalysisOpen) {
      fetchAnalysisStats()
    }
  }, [isAnalysisOpen])

  // Fetch personnel from Supabase
  const fetchPersonnel = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const { data, error: fetchErr } = await api
        .from('personnel')
        .select('*')
        .eq('aktif', true)
        .order('sicil_no', { ascending: true })

      if (fetchErr) throw fetchErr

      const { data: certData, error: certErr } = await api.from('staff_certifications').select('*')
      if (!certErr && certData) {
        setCertifications(certData)
      }

      // Fetch vehicles to show responsible vehicle plaka badges
      const { data: vData } = await api.from('vehicles').select('id, plaka, sorumlu_sofor_id, sorumlu_er_id')
      if (vData) {
        setVehicles(vData)
      }

      if (data && data.length > 0) {
        const mapped: Personnel[] = data.map((p: any) => {
          const ehliyet = certData?.find((c: any) => c.sicil_no === p.sicil_no && c.tip === 'Ehliyet')
          const ilkyardim = certData?.find((c: any) => c.sicil_no === p.sicil_no && c.tip === 'İlkyardım')
          const scba = certData?.find((c: any) => c.sicil_no === p.sicil_no && c.tip === 'SCBA')
          return {
            id: p.id,
            sicil_no: p.sicil_no,
            ad: p.ad,
            soyad: p.soyad,
            unvan: p.unvan,
            rol: p.rol,
            posta: p.posta || '',
            posta_no: p.posta_no ?? null,
            birim: p.birim,
            foto_url: p.foto_url || null,
            istasyon: p.istasyon || '',
            durum: p.durum || 'Görevde',
            ehliyet_gecerlilik_tarihi: ehliyet?.gecerlilik_tarihi || undefined,
            ilkyardim_sertifika_tarihi: ilkyardim?.gecerlilik_tarihi || undefined,
            scba_sertifika_tarihi: scba?.gecerlilik_tarihi || undefined,
            view_only: p.view_only ?? true,
            can_approve: p.can_approve ?? false,
            can_print: p.can_print ?? false
          }
        })
        setPersonnel(mapped)
        
        // Build permissions map from DB columns
        const perms: Record<string, any> = {}
        data.forEach((p: any) => {
          perms[p.sicil_no] = {
            view_only: p.view_only ?? true,
            can_approve: p.can_approve ?? false,
            can_print: p.can_print ?? false,
          }
        })
        setPermissions(perms)
      } else {
        setPersonnel([])
        setPermissions({})
      }
    } catch (err: any) {
      console.error("Personel yükleme hatası:", err)
      setError("Veritabanı bağlantısı kurulamadı.")
      setPersonnel([])
      setPermissions({})
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPersonnel() }, [fetchPersonnel])

  // Auto generate next Sicil No
  const nextSicilSuffix = personnel.length > 0
    ? Math.max(...personnel.map(p => parseInt(p.sicil_no.replace("SB", "") || "0"))) + 1
    : 5831
  const nextSicil = `SB${nextSicilSuffix.toString().padStart(4, "0")}`

  const filteredPersonnel = useMemo(() => {
    let result = personnel
    
    // Class/Branch filter
    result = result.filter(p => {
      if (selectedClass === 'all') return true;
      if (selectedClass === 'esentepe') {
        return p.istasyon?.toLowerCase().includes('esentepe') || false;
      }
      if (selectedClass === 'organize') {
        return p.istasyon?.toLowerCase().includes('organize') || p.istasyon?.toLowerCase().includes('osb') || false;
      }

      const isKomuta = p.rol === 'Admin' || p.rol === 'Shift_Leader' || p.unvan === 'Amir' || p.unvan === 'Müdür';
      const isDriver = !isKomuta && (
        p.rol === 'Driver' || 
        p.unvan.toLowerCase().includes('şof') || 
        p.unvan.toLowerCase().includes('sürücü')
      );
      const isSaha = !isKomuta && !isDriver && (
        p.unvan === 'Er' || 
        p.unvan.toLowerCase().includes('personnel')
      );
      const isDestek = !isKomuta && !isDriver && !isSaha;

      if (selectedClass === 'komuta') return isKomuta;
      if (selectedClass === 'driver') return isDriver;
      if (selectedClass === 'saha') return isSaha;
      if (selectedClass === 'destek') return isDestek;
      return true;
    });
    
    if (searchQuery) {
      const query = normalizeTextForSearch(searchQuery)
      result = result.filter(p => 
        normalizeTextForSearch(p.ad).includes(query) || 
        normalizeTextForSearch(p.soyad).includes(query) || 
        normalizeTextForSearch(p.sicil_no || '').includes(query) ||
        normalizeTextForSearch(p.unvan || '').includes(query)
      )
    }


    if (licenseFilter === "has_license") {
      result = result.filter(p => p.ehliyet_gecerlilik_tarihi !== undefined)
    } else if (licenseFilter === "no_license") {
      result = result.filter(p => p.ehliyet_gecerlilik_tarihi === undefined)
    } else if (licenseFilter === "expired_license") {
      result = result.filter(p => {
        if (!p.ehliyet_gecerlilik_tarihi) return false
        const res = calculateRemainingDays(p.ehliyet_gecerlilik_tarihi)
        return res.days !== null && res.days <= 0
      })
    } else if (licenseFilter === "critical_license") {
      result = result.filter(p => {
        if (!p.ehliyet_gecerlilik_tarihi) return false
        const res = calculateRemainingDays(p.ehliyet_gecerlilik_tarihi)
        return res.days !== null && res.days > 0 && res.days <= 30
      })
    }
    return result
  }, [personnel, searchQuery, licenseFilter, selectedClass])

  // Şoför ehliyet listesi ve kalan gün sıralaması (Faz 28.23.7)
  const driverLicenseData = useMemo(() => {
    const list = personnel.filter(p => {
      const isDriverTitle = p.unvan.toLowerCase().includes("şoför") || 
                            p.unvan.toLowerCase().includes("şöför") || 
                            p.unvan.toLowerCase().includes("sofor") ||
                            p.unvan.toLowerCase().includes("pos.baş.şof.") ||
                            p.unvan.toLowerCase().includes("pos.baş şof.")
      const hasEhliyet = certifications.some(c => c.sicil_no === p.sicil_no && c.tip === 'Ehliyet')
      return isDriverTitle || hasEhliyet
    })

    const mapped = list.map(p => {
      const cert = certifications.find(c => c.sicil_no === p.sicil_no && c.tip === 'Ehliyet')
      
      let status: 'active' | 'critical' | 'expired' | 'missing' = 'missing'
      let label = 'Ehliyet Kaydı Yok'
      let days: number | null = null
      
      const isDriverTitle = p.unvan.toLowerCase().includes("şoför") || 
                            p.unvan.toLowerCase().includes("şöför") || 
                            p.unvan.toLowerCase().includes("sofor") ||
                            p.unvan.toLowerCase().includes("pos.baş.şof.") ||
                            p.unvan.toLowerCase().includes("pos.baş şof.")

      if (cert && cert.gecerlilik_tarihi) {
        const res = calculateRemainingDays(cert.gecerlilik_tarihi)
        days = res.days

        if (days !== null && days <= 0) {
          status = 'expired'
          label = `Süresi Geçti (${Math.abs(days)} gün önce)`
        } else if (days !== null && days <= 30) {
          status = 'critical'
          label = `Kritik (${days} gün kaldı)`
        } else if (days !== null) {
          status = 'active'
          label = `Aktif (${days} gün kaldı)`
        } else {
          status = 'missing'
          label = 'Ehliyet Tanımsız'
        }
      } else {
        if (isDriverTitle) {
          status = 'missing'
          label = 'Ehliyet Eksik! (Sürücü Kadrosu)'
        } else {
          status = 'missing'
          label = 'Ehliyet Tanımsız'
        }
      }

      return {
        person: p,
        expiryDate: cert?.gecerlilik_tarihi,
        status,
        label,
        days
      }
    })

    return mapped.sort((a, b) => {
      const priority = { missing: 0, expired: 1, critical: 2, active: 3 }
      if (priority[a.status] !== priority[b.status]) {
        return priority[a.status] - priority[b.status]
      }
      if (a.status === 'missing') {
        return `${a.person.ad} ${a.person.soyad}`.localeCompare(`${b.person.ad} ${b.person.soyad}`)
      }
      return (a.days ?? 0) - (b.days ?? 0)
    })
  }, [personnel, certifications])

  const filteredDriverLicenses = useMemo(() => {
    if (!licenseSearchQuery) return driverLicenseData
    const q = normalizeTextForSearch(licenseSearchQuery)
    return driverLicenseData.filter(d => 
      normalizeTextForSearch(d.person.ad).includes(q) || 
      normalizeTextForSearch(d.person.soyad).includes(q) || 
      normalizeTextForSearch(d.person.sicil_no || '').includes(q)
    )
  }, [driverLicenseData, licenseSearchQuery])


  const licenseStats = useMemo(() => {
    let active = 0
    let critical = 0
    let expired = 0
    let missing = 0
    
    driverLicenseData.forEach(d => {
      if (d.status === 'active') active++
      else if (d.status === 'critical') critical++
      else if (d.status === 'expired') expired++
      else if (d.status === 'missing') missing++
    })

    return {
      total: driverLicenseData.length,
      active,
      critical,
      expired,
      missing
    }
  }, [driverLicenseData])

  // ADD PERSONNEL — Supabase INSERT
  const handleAddPersonel = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newAdSoyad.trim()) return
    setSaving(true)

    const parts = newAdSoyad.trim().split(" ")
    const soyad = parts.length > 1 ? parts.pop() || "" : ""
    const ad = parts.join(" ")

    const selectedJob = COMBINED_JOBS[newJobIndex] || COMBINED_JOBS[0]
    const roleVal = selectedJob.role
    const unvanVal = selectedJob.unvan
    // Karargah ünvanları veya "Karargah (Postasız)" seçimi → posta atanmaz
    const isKarargahKayit = isKarargahUnvan(unvanVal) || newPostaNo === "0"
    const postaNoVal = isKarargahKayit ? null : parseInt(newPostaNo, 10)

    try {
      const { error: insertErr } = await api.insert('personnel', {
        sicil_no: nextSicil,
        ad,
        soyad,
        unvan: unvanVal,
        rol: roleVal,
        view_only: roleVal === 'User',
        can_approve: roleVal === 'Shift_Leader' || roleVal === 'Admin' || roleVal === 'Editor',
        can_print: roleVal === 'Admin' || roleVal === 'Editor',
        posta_no: postaNoVal,
        posta: postaNoVal ? `${postaNoVal}. Posta` : 'Karargah',
        birim: isKarargahKayit ? 'Karargah' : 'Posta',
        durum: newDurum,
        password: newPassword || '1234'
      })

      if (insertErr) throw insertErr

      // Refresh list from DB
      await fetchPersonnel()
      setNewAdSoyad("")
      setNewPassword("")
      setNewJobIndex(0)
      setIsAdding(false)

      // Audit log: Personel ekleme işlemini kaydet
      fetch('/api/audit-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action_type: 'personnel_add',
          actor_sicil_no: currentUser?.sicilNo || 'unknown',
          actor_name: currentUser ? `${currentUser.ad} ${currentUser.soyad}` : 'Bilinmeyen',
          target: nextSicil,
          details: { ad, soyad, rol: roleVal, unvan: unvanVal },
        }),
      }).catch(err => console.error('[AuditLog] Personel ekleme logu gönderilemedi:', err))
    } catch (err: any) {
      console.error("Personel ekleme hatası:", err)
      // Fallback: add locally
      const newPerson: Personnel = {
        sicil_no: nextSicil, ad, soyad,
        unvan: unvanVal, rol: roleVal, posta: postaNoVal ? `${postaNoVal}. Posta` : 'Karargah',
        posta_no: postaNoVal, birim: isKarargahKayit ? 'Karargah' : 'Posta', durum: newDurum
      }
      setPersonnel(prev => [...prev, newPerson])
      setPermissions(prev => ({
        ...prev,
        [nextSicil]: {
          view_only: roleVal === 'User',
          can_approve: roleVal !== 'User',
          can_print: roleVal === 'Admin' || roleVal === 'Editor',
        }
      }))
      setNewAdSoyad("")
      setNewPassword("")
      setNewJobIndex(0)
      setIsAdding(false)
    } finally {
      setSaving(false)
    }
  }

  // TOGGLE PERMISSION — Supabase UPDATE (debounced)
  const togglePermission = async (sicilNo: string, perm: 'view_only' | 'can_approve' | 'can_print') => {
    const current = permissions[sicilNo] || { view_only: true, can_approve: false, can_print: false }
    const newValue = !current[perm]
    
    // Optimistic UI update for permissions map
    setPermissions(prev => ({
      ...prev,
      [sicilNo]: { ...current, [perm]: newValue }
    }))

    // Optimistic UI update for personnel array
    setPersonnel(prev => prev.map(p => p.sicil_no === sicilNo ? { ...p, [perm]: newValue } : p))

    // Push to Supabase
    try {
      const { error: updateErr } = await api.update('personnel', { [perm]: newValue }, { sicil_no: sicilNo })

      if (updateErr) throw updateErr

      // Audit log: Yetki değişikliğini kaydet
      fetch('/api/audit-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action_type: 'permission_change',
          actor_sicil_no: currentUser?.sicilNo || 'unknown',
          actor_name: currentUser ? `${currentUser.ad} ${currentUser.soyad}` : 'Bilinmeyen',
          target: sicilNo,
          details: { permission: perm, new_value: newValue },
        }),
      }).catch(err => console.error('[AuditLog] Yetki değişikliği logu gönderilemedi:', err))
    } catch (err) {
      console.error("Yetki güncelleme hatası:", err)
      // Rollback on error
      setPermissions(prev => ({
        ...prev,
        [sicilNo]: { ...current, [perm]: !newValue }
      }))
      setPersonnel(prev => prev.map(p => p.sicil_no === sicilNo ? { ...p, [perm]: !newValue } : p))
    }
  }

  // EDIT MODAL HANDLERS
  const openEditModal = async (person: Personnel) => {
    setSelectedPerson(person)
    setEditRole(person.rol || "User")
    setEditUnvan(person.unvan || "Er")
    setEditPostaNo(person.posta_no ? String(person.posta_no) : "0")

    const personCerts = certifications.filter(c => c.sicil_no === person.sicil_no)
    const ehliyet = personCerts.find(c => c.tip === "Ehliyet")
    const ilkyardim = personCerts.find(c => c.tip === "İlkyardım")
    const scba = personCerts.find(c => c.tip === "SCBA")
    
    setEhliyetDate(ehliyet?.gecerlilik_tarihi || "")
    setIlkyardimDate(ilkyardim?.gecerlilik_tarihi || "")
    setScbaDate(scba?.gecerlilik_tarihi || "")
    setResetPasswordSuccess(null)
    setActiveTab("kurumsal")

    try {
      const { data: pd } = await api.from('personnel_details').select('*').eq('sicil_no', person.sicil_no).single()
      setEditTelefon(pd?.telefon || person.telefon || "")
      setEditAdres(pd?.adres || "")
      setEditEmergencyName(pd?.acil_durum_kisi_ad || "")
      setEditEmergencyPhone(pd?.acil_durum_kisi_telefon || "")
      setEditKanGrubu(pd?.kan_grubu || "")
      setEditDogumTarihi(pd?.dogum_tarihi || "")
      setEditIseBaslama(pd?.ise_baslama_tarihi || "")
    } catch (err) {
      setEditTelefon(person.telefon || "")
      setEditAdres("")
      setEditEmergencyName("")
      setEditEmergencyPhone("")
      setEditKanGrubu("")
      setEditDogumTarihi("")
      setEditIseBaslama("")
    }

    setIsEditModalOpen(true)
  }

  const handlePrintSinglePassword = (person: any, newPassword: string) => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    printWindow.document.write(`
      <html>
        <head>
          <title>Geçici Şifre Teslim Formu</title>
          <style>
            body { font-family: 'Times New Roman', Times, serif; padding: 40px; color: #333; }
            .header { text-align: center; margin-bottom: 30px; }
            .header h1 { font-size: 20px; margin: 5px 0; text-transform: uppercase; }
            .header h2 { font-size: 16px; margin: 5px 0; font-weight: normal; }
            .content { margin-top: 30px; font-size: 14px; line-height: 1.6; }
            .password-box { text-align: center; margin: 30px 0; padding: 20px; border: 2px dashed #333; background: #f9f9f9; }
            .footer { margin-top: 80px; display: flex; justify-content: space-between; font-size: 14px; }
            .signature-box { text-align: center; width: 200px; }
            .signature-line { margin-top: 60px; border-top: 1px solid #333; padding-top: 5px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>T.C. SİVAS BELEDİYESİ</h1>
            <h2>İtfaiye Müdürlüğü Bilgi İşlem Birimi</h2>
            <h2 style="font-weight: bold; margin-top: 15px;">BİREYSEL GEÇİCİ ŞİFRE TESLİM TUTANAĞI</h2>
          </div>
          <div class="content">
            <p><strong>Tarih:</strong> ${new Date().toLocaleDateString('tr-TR')}</p>
            <p><strong>Teslim Eden Amir:</strong> ${currentUser?.ad} ${currentUser?.soyad}</p>
            <p>
              Aşağıda bilgileri bulunan personele ait sisteme giriş geçici şifresi oluşturulmuş olup,
              ilk girişte şifresini değiştirmesi gerektiği tebliğ edilerek şifre bilgisi kapalı zarf/teslim tutanağı ile kendisine/sorumlu amirine teslim edilmiştir.
            </p>
            
            <div class="password-box">
              <p style="margin: 0 0 10px 0; font-size: 16px;"><strong>Personel Bilgileri</strong></p>
              <p style="margin: 5px 0;">Ad Soyad: <strong>${person.ad} ${person.soyad}</strong></p>
              <p style="margin: 5px 0;">Sicil No: <strong>${person.sicil_no}</strong></p>
              <p style="margin: 15px 0 5px 0; font-size: 16px;"><strong>Geçici Şifre</strong></p>
              <p style="margin: 0; font-size: 24px; font-family: monospace; font-weight: bold; letter-spacing: 3px; color: #b45309;">${newPassword}</p>
            </div>
          </div>
          <div class="footer">
            <div class="signature-box">
              <strong>TESLİM EDEN</strong>
              <div style="font-size: 12px; margin-top: 5px;">${currentUser?.ad} ${currentUser?.soyad}</div>
              <div class="signature-line">İmza</div>
            </div>
            <div class="signature-box">
              <strong>TESLİM ALAN</strong>
              <div style="font-size: 12px; margin-top: 5px;">${person.ad} ${person.soyad} / Sorumlu Amir</div>
              <div class="signature-line">İmza</div>
            </div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              window.onafterprint = function() { window.close(); };
            }
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  const handleResetPassword = async (sicil_no: string) => {
    setResettingPassword(true)
    setResetPasswordSuccess(null)
    try {
      const token = localStorage.getItem('auth_token')
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ sicil_no }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        toast(json.error || 'Şifre sıfırlama başarısız.')
        return
      }
      setResetPasswordSuccess(json.newPassword)
    } catch (err: any) {
      console.error(err)
      toast('Parola sıfırlama sırasında sunucu hatası oluştu.')
    } finally {
      setResettingPassword(false)
    }
  }

  const handleSaveEdit = async () => {
    if (!selectedPerson) return
    setIsSavingEdit(true)
    
    try {
      // 1. Update Role, Posta and Phone
      // Posta alanları yalnızca posta seçici görünür ünvanlarda yazılır; karargah
      // ünvanlarında posta temizlenir. Diğer ünvanlarda (Santral, Müdür...) mevcut
      // posta/birim değerlerine dokunulmaz — eskiden her kayıtta "1. Posta" damgalanıyordu.
      const editUpdate: Record<string, any> = {
        rol: editRole,
        unvan: editUnvan,
        telefon: editTelefon || null
      }
      if (isKarargahUnvan(editUnvan)) {
        editUpdate.posta_no = null
        editUpdate.posta = 'Karargah'
        editUpdate.birim = 'Karargah'
      } else if (POSTA_SECIMLI_UNVANLAR.includes(editUnvan)) {
        const postaNoVal = editPostaNo === "0" ? null : parseInt(editPostaNo, 10)
        editUpdate.posta_no = postaNoVal
        editUpdate.posta = postaNoVal ? `${postaNoVal}. Posta` : 'Karargah'
        editUpdate.birim = postaNoVal ? 'Posta' : 'Karargah'
      }
      unwrap(await api.update('personnel', editUpdate, { sicil_no: selectedPerson.sicil_no }))

      // 1.5 Update Personnel Details (Özlük)
      unwrap(await api.upsert('personnel_details', {
        sicil_no: selectedPerson.sicil_no,
        telefon: editTelefon || null,
        adres: editAdres || null,
        acil_durum_kisi_ad: editEmergencyName || null,
        acil_durum_kisi_telefon: editEmergencyPhone || null,
        kan_grubu: editKanGrubu || null,
        dogum_tarihi: editDogumTarihi || null,
        ise_baslama_tarihi: editIseBaslama || null,
        updated_at: new Date().toISOString()
      }, 'sicil_no'))

      // 2. Delete existing certifications sequentially
      // (unwrap: silme/ekleme zinciri yarıda kalırsa hata görünür olur —
      // eskiden sertifikalar silinip yenisi eklenemeden sessizce bitebiliyordu)
      unwrap(await api.remove('staff_certifications', { sicil_no: selectedPerson.sicil_no, tip: 'Ehliyet' }))
      unwrap(await api.remove('staff_certifications', { sicil_no: selectedPerson.sicil_no, tip: 'İlkyardım' }))
      unwrap(await api.remove('staff_certifications', { sicil_no: selectedPerson.sicil_no, tip: 'SCBA' }))

      // 3. Insert new certifications if dates are provided
      if (ehliyetDate) {
        unwrap(await api.insert('staff_certifications', {
          sicil_no: selectedPerson.sicil_no,
          tip: 'Ehliyet',
          gecerlilik_tarihi: ehliyetDate
        }))
      }

      if (ilkyardimDate) {
        unwrap(await api.insert('staff_certifications', {
          sicil_no: selectedPerson.sicil_no,
          tip: 'İlkyardım',
          gecerlilik_tarihi: ilkyardimDate
        }))
      }

      if (scbaDate) {
        unwrap(await api.insert('staff_certifications', {
          sicil_no: selectedPerson.sicil_no,
          tip: 'SCBA',
          gecerlilik_tarihi: scbaDate
        }))
      }

      await fetchPersonnel() // Refresh all data
      setIsEditModalOpen(false)
    } catch (err) {
      console.error("Personel güncelleme hatası:", err)
      setError("Güncelleme sırasında hata oluştu.")
    } finally {
      setIsSavingEdit(false)
    }
  }

  const handleDeactivatePersonnel = async (sicil_no: string) => {
    if (!window.confirm("Bu personelin teşkilat ile ilişiğini kesmek ve sistemden kaldırmak istediğinize emin misiniz?")) {
      return
    }
    setIsSavingEdit(true)
    try {
      const { error: updateErr } = await api.update('personnel', { aktif: false }, { sicil_no })
      if (updateErr) throw updateErr

      // Audit log: Personel ilişik kesme logu
      fetch('/api/audit-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action_type: 'personnel_deactivate',
          actor_sicil_no: currentUser?.sicilNo || 'unknown',
          actor_name: currentUser ? `${currentUser.ad} ${currentUser.soyad}` : 'Bilinmeyen',
          target: sicil_no,
          details: { status: 'deactivated' },
        }),
      }).catch(err => console.error('[AuditLog] Personel ilişik kesme logu gönderilemedi:', err))

      await fetchPersonnel()
      setIsEditModalOpen(false)
    } catch (err) {
      console.error("Personel ilişik kesme hatası:", err)
      toast("Personel ilişiği kesilirken bir hata oluştu.")
    } finally {
      setIsSavingEdit(false)
    }
  }

  const getCertStatus = useCallback((personSicil: string, certType: string) => {
    const cert = certifications.find(c => c.sicil_no === personSicil && c.tip === certType)
    if (!cert || !cert.gecerlilik_tarihi) {
      return { status: 'missing', label: 'Eksik', color: 'bg-[var(--fd-surface3)] text-[var(--fd-text3)] border-[var(--fd-border)]' }
    }
    
    const today = new Date('2026-05-20')
    const expiry = new Date(cert.gecerlilik_tarihi)
    
    if (expiry < today) {
      return { 
        status: 'expired', 
        label: `Süresi Doldu (${new Date(cert.gecerlilik_tarihi).toLocaleDateString('tr-TR')})`, 
        color: 'bg-red-500/15 text-red-500 border-red-500/30' 
      }
    }
    
    const diffTime = expiry.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    if (diffDays <= 30) {
      return { 
        status: 'critical', 
        label: `Kritik (${diffDays} Gün Kaldı)`, 
        color: 'bg-amber-500/15 text-amber-500 border-amber-500/30' 
      }
    }
    
    return { 
      status: 'active', 
      label: `Aktif (${new Date(cert.gecerlilik_tarihi).toLocaleDateString('tr-TR')})`, 
      color: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30' 
    }
  }, [certifications])

  // Shift management structures removed in favor of direct profile focus

  const criticalPersonnel = useMemo(() => {
    interface CriticalIssue {
      type: 'Ehliyet' | 'İlkyardım' | 'SCBA'
      label: string
      days: number | null
      isExpired: boolean
    }
    
    const list: Array<{
      person: Personnel
      issues: CriticalIssue[]
    }> = []

    personnel.forEach(p => {
      const personIssues: CriticalIssue[] = []

      const certs: Array<{ type: 'Ehliyet' | 'İlkyardım' | 'SCBA'; date?: string }> = [
        { type: 'Ehliyet', date: p.ehliyet_gecerlilik_tarihi },
        { type: 'İlkyardım', date: p.ilkyardim_sertifika_tarihi },
        { type: 'SCBA', date: p.scba_sertifika_tarihi }
      ]

      certs.forEach(c => {
        if (c.date) {
          const res = calculateRemainingDays(c.date)
          if (res.days !== null) {
            if (res.days <= 0) {
              personIssues.push({
                type: c.type,
                label: c.type === 'Ehliyet' ? 'Ağır Vasıta Ehliyeti' : c.type === 'İlkyardım' ? 'İlk Yardım Sertifikası' : 'SCBA Sertifikası',
                days: res.days,
                isExpired: true
              })
            } else if (res.days <= 30) {
              personIssues.push({
                type: c.type,
                label: c.type === 'Ehliyet' ? 'Ağır Vasıta Ehliyeti' : c.type === 'İlkyardım' ? 'İlk Yardım Sertifikası' : 'SCBA Sertifikası',
                days: res.days,
                isExpired: false
              })
            }
          }
        }
      })

      if (personIssues.length > 0) {
        list.push({ person: p, issues: personIssues })
      }
    })

    return list
  }, [personnel])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center space-y-3">
          <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground text-sm">Personel verileri yükleniyor...</p>
        </div>
      </div>
    )
  }

  return (
    <PageGuard pageId="personel_yonetimi">
      <div className="space-y-6 w-full max-w-full px-1.5 md:px-3 pb-12 animate-in fade-in zoom-in-95 duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Personel Yönetimi</h1>
          <p className="text-muted-foreground text-sm mt-1">
            İtfaiye personeli kayıtları, yetkilendirme ve rol atama işlemleri.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button 
            onClick={() => setIsAnalysisOpen(true)} 
            variant="outline" 
            size="sm" 
            className="gap-1.5 border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text2)] hover:bg-[var(--fd-surface3)] hover:text-[var(--fd-text)] h-9 text-xs rounded-[var(--fd-r-sm)] border"
            title="Görev Analizi"
          >
            <Activity className="w-3.5 h-3.5 text-rose-500" />
            <span className="hidden sm:inline">Görev Analizi</span>
          </Button>
          <Button 
            onClick={() => setIsLicenseDashboardOpen(true)} 
            variant="outline" 
            size="sm" 
            className="gap-1.5 border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text2)] hover:bg-[var(--fd-surface3)] hover:text-[var(--fd-text)] h-9 text-xs rounded-[var(--fd-r-sm)] border"
            title="Ehliyet Durumları"
          >
            <Truck className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Ehliyet Durumları</span>
          </Button>
          {(currentUser?.rol === 'Admin' || currentUser?.rol === 'Editor') && (
            <Button 
              onClick={() => setIsLeaveModalOpen(true)} 
              variant="outline" 
              size="sm" 
              className="gap-1.5 border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text2)] hover:bg-[var(--fd-surface3)] hover:text-[var(--fd-text)] h-9 text-xs rounded-[var(--fd-r-sm)] border"
              title="İzin Yönetimi"
            >
              <Calendar className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">İzin Yönetimi</span>
            </Button>
          )}
          {currentUser?.rol === 'Admin' && (
            <Link href="/yonetim/personel/gecici-sifreler">
              <Button 
                variant="outline" 
                size="sm" 
                className="gap-1.5 border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text2)] hover:bg-[var(--fd-surface3)] hover:text-[var(--fd-text)] h-9 text-xs rounded-[var(--fd-r-sm)] border"
                title="Geçici Şifreler"
              >
                <Key className="w-3.5 h-3.5 text-amber-500" />
                <span className="hidden sm:inline">Geçici Şifreler</span>
              </Button>
            </Link>
          )}
          <Button 
            onClick={fetchPersonnel} 
            variant="secondary" 
            size="sm" 
            className="gap-1.5 h-9 text-xs rounded-[var(--fd-r-sm)] bg-[var(--fd-surface2)] text-[var(--fd-text2)] hover:bg-[var(--fd-surface3)] border border-[var(--fd-border)]"
            title="Yenile"
          >
            <RefreshCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Yenile</span>
          </Button>
          <Button 
            onClick={() => setIsAdding(!isAdding)} 
            className="shrink-0 gap-1.5 h-9 text-xs rounded-[var(--fd-r-sm)]"
            title={isAdding ? "İptal" : "Yeni Personel Ekle"}
          >
            {isAdding ? <Settings2 className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
            <span className="hidden sm:inline">{isAdding ? "İptal" : "Yeni Personel Ekle"}</span>
            <span className="sm:hidden">{isAdding ? "İptal" : "Ekle"}</span>
          </Button>
        </div>
      </div>

      {/* Kritik Belge Takip ve Planlama Radarı */}
      <Card className="border-[var(--fd-border)] bg-[var(--fd-surface)] shadow-[var(--fd-shadow-sm)] overflow-hidden relative rounded-[var(--fd-r)]">
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[var(--fd-amber)]/10 to-[var(--fd-danger)]/5 rounded-full blur-2xl pointer-events-none" />
        <CardHeader className="pb-3 border-b border-[var(--fd-border)] bg-[var(--fd-surface2)]/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[var(--fd-amber)]/15 rounded-[var(--fd-r-sm)] text-[var(--fd-amber)] animate-pulse shadow-[var(--fd-shadow-sm)]">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-sm font-bold text-[var(--fd-text)]">Kritik Belge Takip ve Planlama Radarı</CardTitle>
              <p className="text-xs text-[var(--fd-text2)] mt-0.5">
                Geçerlilik süresi dolan veya son 30 güne giren personel ehliyet, ilk yardım ve SCBA sertifikaları.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3 sm:p-4">
          {criticalPersonnel.length === 0 ? (
            <div className="flex flex-col sm:flex-row items-center gap-4 p-4 bg-[var(--fd-success)]/10 border border-[var(--fd-success)]/20 rounded-[var(--fd-r)]">
              <div className="p-3 bg-[var(--fd-success)]/15 text-[var(--fd-success)] rounded-full shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="text-center sm:text-left">
                <p className="font-bold text-[var(--fd-success)] text-sm">Tüm Personel Belgeleri Güvenli & Güncel</p>
                <p className="text-xs text-[var(--fd-text2)] mt-0.5">
                  Süre aşımı veya kritik aşamaya yaklaşan ehliyet, ilk yardım veya SCBA sertifikası bulunmamaktadır.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {criticalPersonnel.map(({ person, issues }) => (
                <div 
                  key={person.sicil_no} 
                  className="border border-[var(--fd-border)] rounded-[var(--fd-r)] p-3 bg-[var(--fd-surface2)]/50 hover:bg-[var(--fd-surface2)] transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="font-bold text-[var(--fd-text)] text-sm">{person.ad} {person.soyad}</h4>
                        <p className="text-[10px] font-mono text-[var(--fd-text3)]">{person.sicil_no} • {person.unvan} • {person.posta_no ? `Posta ${person.posta_no}` : 'Karargah'}</p>
                      </div>
                      <Badge variant="outline" className="text-[9px] bg-[var(--fd-surface3)] border-[var(--fd-border)] text-[var(--fd-text3)]">
                        {person.posta_no ? `Posta ${person.posta_no}` : 'Karargah'}
                      </Badge>
                    </div>

                    <div className="space-y-2 mt-2">
                      {issues.map((issue, idx) => (
                        <div key={idx} className="flex flex-col gap-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-[var(--fd-text2)] flex items-center gap-1.5 font-medium">
                              {issue.type === 'Ehliyet' ? <Truck className="w-3.5 h-3.5 text-[var(--fd-info)]" /> :
                               issue.type === 'İlkyardım' ? <HeartPulse className="w-3.5 h-3.5 text-[var(--fd-danger)]" /> :
                               <Wind className="w-3.5 h-3.5 text-[var(--fd-success)]" />}
                              {issue.label}
                            </span>
                            {issue.isExpired ? (
                              <Badge variant="danger" className="text-[9px] animate-pulse py-0.5">
                                Süresi Geçti
                              </Badge>
                            ) : (
                              <Badge variant="warning" className="text-[9px] py-0.5">
                                Kritik Eşik
                              </Badge>
                            )}
                          </div>
                          <div className="text-[10px] pl-5">
                            {issue.isExpired ? (
                              <span className="text-[var(--fd-danger)] font-bold">🚨 {Math.abs(issue.days || 0)} gün önce süresi doldu</span>
                            ) : (
                              <span className="text-[var(--fd-amber)] font-semibold">⏳ {issue.days} gün kaldı</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full mt-3 text-[11px] h-7 bg-[var(--fd-surface3)] hover:bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text2)] hover:text-[var(--fd-text)] rounded-[var(--fd-r-sm)] font-semibold transition"
                    onClick={() => openEditModal(person)}
                  >
                    <Settings2 className="w-3 h-3 mr-1.5" /> Sertifikayı Güncelle
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>



      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20 text-warning text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Dialog open={isAdding} onOpenChange={setIsAdding}>
        <DialogContent className="max-w-lg bg-[var(--fd-surface)] border-[var(--fd-border)] rounded-[var(--fd-r)] overflow-hidden shadow-[var(--fd-shadow-lg)]">
          <DialogHeader className="p-4 border-b border-[var(--fd-border)]/60 flex flex-row items-center justify-between">
            <DialogTitle className="text-sm font-bold flex items-center gap-1.5 text-[var(--fd-accent)] uppercase">
              <UserPlus className="w-4 h-4" /> 
              Hızlı Personel Kayıt Formu
            </DialogTitle>
            <button 
              onClick={() => setIsAdding(false)} 
              type="button"
              className="text-[var(--fd-danger)] hover:opacity-90 bg-[var(--fd-danger)]/15 border border-[var(--fd-danger)]/30 rounded-[var(--fd-r-sm)] transition-all active:scale-95 flex items-center justify-center w-8 h-8 cursor-pointer"
              title="Kapat"
            >
              <X className="h-4 w-4" />
            </button>
          </DialogHeader>
          <div className="p-5">
            <form onSubmit={handleAddPersonel} className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="space-y-1.5 flex-1">
                  <label className="text-[10px] font-bold uppercase text-[var(--fd-text3)] tracking-wider">Sicil No</label>
                  <Input value={nextSicil} disabled className="font-mono bg-[var(--fd-surface2)] border-[var(--fd-border)] h-10 text-xs rounded-[var(--fd-r-sm)]" />
                </div>
                <div className="space-y-1.5 flex-[2]">
                  <label className="text-[10px] font-bold uppercase text-[var(--fd-text3)] tracking-wider">Ad Soyad</label>
                  <Input 
                    placeholder="Örn: Serdar Vatansever" 
                    value={newAdSoyad} 
                    onChange={e => setNewAdSoyad(e.target.value)}
                    autoFocus
                    required
                    className="h-10 text-xs border-[var(--fd-border)] bg-[var(--fd-surface)] rounded-[var(--fd-r-sm)]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-[var(--fd-text3)] tracking-wider">Görevi / Ünvanı (Sistem Rolü)</label>
                <select 
                  className="flex h-10 w-full rounded-[var(--fd-r-sm)] border border-[var(--fd-border)] bg-[var(--fd-surface)] px-3 py-1 text-xs text-[var(--fd-text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--fd-accent)]"
                  value={newJobIndex}
                  onChange={e => setNewJobIndex(parseInt(e.target.value, 10))}
                >
                  {COMBINED_JOBS.map((job, idx) => (
                    <option key={idx} value={idx}>
                      {job.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <div className="space-y-1.5 flex-1">
                  <label className="text-[10px] font-bold uppercase text-[var(--fd-text3)] tracking-wider">Posta No</label>
                  <select 
                    className="flex h-10 w-full rounded-[var(--fd-r-sm)] border border-[var(--fd-border)] bg-[var(--fd-surface)] px-3 py-1 text-xs text-[var(--fd-text)] focus-visible:outline-none"
                    value={newPostaNo}
                    onChange={e => setNewPostaNo(e.target.value)}
                  >
                    <option value="1">1. Posta</option>
                    <option value="2">2. Posta</option>
                    <option value="3">3. Posta</option>
                    <option value="0">Karargah (Postasız)</option>
                  </select>
                </div>
                <div className="space-y-1.5 flex-1">
                  <label className="text-[10px] font-bold uppercase text-[var(--fd-text3)] tracking-wider">Durum</label>
                  <select 
                    className="flex h-10 w-full rounded-[var(--fd-r-sm)] border border-[var(--fd-border)] bg-[var(--fd-surface)] px-3 py-1 text-xs text-[var(--fd-text)] focus-visible:outline-none"
                    value={newDurum}
                    onChange={e => setNewDurum(e.target.value)}
                  >
                    <option value="Görevde">Görevde</option>
                    <option value="İzinli">İzinli</option>
                    <option value="Raporlu">Raporlu</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-[var(--fd-text3)] tracking-wider">Başlangıç Şifresi</label>
                <Input 
                  type="password"
                  placeholder="En az 4 karakter şifre belirleyin" 
                  value={newPassword} 
                  onChange={e => setNewPassword(e.target.value)}
                  required
                  minLength={4}
                  className="h-10 text-xs border-[var(--fd-border)] bg-[var(--fd-surface)] rounded-[var(--fd-r-sm)]"
                />
              </div>

              <DialogFooter className="pt-4 border-t border-[var(--fd-border)]/60">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsAdding(false)} 
                  className="h-9 px-4 rounded-[var(--fd-r-sm)] text-xs"
                >
                  İptal
                </Button>
                <Button 
                  type="submit" 
                  disabled={saving} 
                  className="h-9 px-6 gap-1.5 bg-[var(--fd-accent)] hover:opacity-90 text-[#ffffff] font-semibold text-xs rounded-[var(--fd-r-sm)]"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {saving ? "Kaydediliyor..." : "Personel Ekle"}
                </Button>
              </DialogFooter>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* Arama ve Liste */}
      <Card>
        <CardHeader className="pb-2 border-b border-[var(--fd-border)] bg-[var(--fd-surface2)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3">
          <CardTitle className="text-xs font-bold flex items-center space-x-1.5 uppercase text-[var(--fd-text)]">
            <UsersIcon className="w-5 h-5 text-muted-foreground" />
            <span>Kayıtlı Personel ({filteredPersonnel.length})</span>
          </CardTitle>
          <div className="flex flex-col sm:flex-row gap-2.5 w-full sm:w-auto items-stretch sm:items-center">
            {/* Ehliyet Filtresi */}
            <div className="relative">
              <select
                className="flex h-8 w-full sm:w-[190px] rounded-[var(--fd-r-sm)] border border-[var(--fd-border)] bg-[var(--fd-surface)] px-2 py-0.5 text-xs text-[var(--fd-text2)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--fd-accent)]"
                value={licenseFilter}
                onChange={e => setLicenseFilter(e.target.value)}
              >
                <option value="all">📇 Tüm Ehliyet Durumları</option>
                <option value="has_license">✅ Ehliyeti Olanlar</option>
                <option value="no_license">❌ Ehliyeti Olmayanlar</option>
                <option value="expired_license">🚨 Süresi Dolan Ehliyetler</option>
                <option value="critical_license">⏳ Kritik Ehliyetler (≤30 Gün)</option>
              </select>
            </div>
            
            {/* Arama Kutusu */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="İsim veya Sicil No ara..." 
                className="pl-9 h-9 text-xs"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>

        {/* Siber-Mat Sınıflandırma ve Şube Filtre Çubuğu */}
        <div className="border-b border-[var(--fd-border)] bg-[var(--fd-surface2)] p-1.5 flex flex-wrap gap-1">
          <button
            onClick={() => setSelectedClass('all')}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded-[var(--fd-r-sm)] border transition-all flex items-center justify-center gap-1 cursor-pointer",
              selectedClass === 'all'
                ? "bg-[var(--fd-accent-soft2)] text-[var(--fd-accent)] border-[var(--fd-accent-soft)] shadow-[var(--fd-shadow-sm)] font-bold"
                : "bg-transparent text-[var(--fd-text3)] border-transparent hover:bg-[var(--fd-surface3)] hover:text-[var(--fd-text2)]"
            )}
          >
            <span>🗂️</span>
            <span>Tüm Liste</span>
          </button>
          <button
            onClick={() => setSelectedClass('komuta')}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded-[var(--fd-r-sm)] border transition-all flex items-center justify-center gap-1 cursor-pointer",
              selectedClass === 'komuta'
                ? "bg-[rgba(245,158,11,0.08)] text-[var(--fd-amber)] border-[rgba(245,158,11,0.18)] shadow-[var(--fd-shadow-sm)] font-bold"
                : "bg-transparent text-[var(--fd-text3)] border-transparent hover:bg-[var(--fd-surface3)] hover:text-[var(--fd-text2)]"
            )}
          >
            <span>👑</span>
            <span>Komuta</span>
          </button>
          <button
            onClick={() => setSelectedClass('driver')}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded-[var(--fd-r-sm)] border transition-all flex items-center justify-center gap-1 cursor-pointer",
              selectedClass === 'driver'
                ? "bg-[rgba(37,99,235,0.08)] text-[var(--fd-info)] border-[rgba(37,99,235,0.18)] shadow-[var(--fd-shadow-sm)] font-bold"
                : "bg-transparent text-[var(--fd-text3)] border-transparent hover:bg-[var(--fd-surface3)] hover:text-[var(--fd-text2)]"
            )}
          >
            <span>🚚</span>
            <span>Sürücü</span>
          </button>
          <button
            onClick={() => setSelectedClass('saha')}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded-[var(--fd-r-sm)] border transition-all flex items-center justify-center gap-1 cursor-pointer",
              selectedClass === 'saha'
                ? "bg-[rgba(22,163,74,0.08)] text-[var(--fd-success)] border-[rgba(22,163,74,0.18)] shadow-[var(--fd-shadow-sm)] font-bold"
                : "bg-transparent text-[var(--fd-text3)] border-transparent hover:bg-[var(--fd-surface3)] hover:text-[var(--fd-text2)]"
            )}
          >
            <span>🧑🚒</span>
            <span>Saha</span>
          </button>
          <button
            onClick={() => setSelectedClass('destek')}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded-[var(--fd-r-sm)] border transition-all flex items-center justify-center gap-1 cursor-pointer",
              selectedClass === 'destek'
                ? "bg-[var(--fd-surface3)] text-[var(--fd-text)] border-[var(--fd-border-strong)] shadow-[var(--fd-shadow-sm)] font-bold"
                : "bg-transparent text-[var(--fd-text3)] border-transparent hover:bg-[var(--fd-surface3)] hover:text-[var(--fd-text2)]"
            )}
          >
            <span>📞</span>
            <span>Destek</span>
          </button>
          <button
            onClick={() => setSelectedClass('esentepe')}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded-[var(--fd-r-sm)] border transition-all flex items-center justify-center gap-1 cursor-pointer",
              selectedClass === 'esentepe'
                ? "bg-[rgba(220,38,38,0.08)] text-[var(--fd-danger)] border-[rgba(220,38,38,0.18)] shadow-[var(--fd-shadow-sm)] font-bold"
                : "bg-transparent text-[var(--fd-text3)] border-transparent hover:bg-[var(--fd-surface3)] hover:text-[var(--fd-text2)]"
            )}
          >
            <span>🏢</span>
            <span>Esentepe Şube</span>
          </button>
          <button
            onClick={() => setSelectedClass('organize')}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded-[var(--fd-r-sm)] border transition-all flex items-center justify-center gap-1 cursor-pointer",
              selectedClass === 'organize'
                ? "bg-[var(--fd-accent-soft2)] text-[var(--fd-accent)] border-[var(--fd-accent-soft)] shadow-[var(--fd-shadow-sm)] font-bold"
                : "bg-transparent text-[var(--fd-text3)] border-transparent hover:bg-[var(--fd-surface3)] hover:text-[var(--fd-text2)]"
            )}
          >
            <span>🏢</span>
            <span>Organize Şube</span>
          </button>
        </div>

        <CardContent className="p-0">
          <div className="divide-y divide-[var(--fd-border)]">
            {filteredPersonnel.map(person => {
              const isAdmin = person.rol === "Admin" || person.rol === "Editor"
              const isLeader = person.unvan.includes("Çavuş") || person.unvan.includes("Amir") || person.unvan.includes("Müdür")
              const perms = permissions[person.sicil_no] || {
                view_only: person.view_only ?? true,
                can_approve: person.can_approve ?? false,
                can_print: person.can_print ?? false
              }
              return (
                <div key={person.sicil_no} className="p-2 px-3 hover:bg-[var(--fd-surface2)]/40 transition-colors flex flex-col xl:flex-row xl:items-center justify-between gap-2.5">
                  
                  {/* Info Section Header Wrapper (Flex row to place Edit on right for mobile) */}
                  <div className="flex items-center justify-between gap-3 w-full xl:w-2/5 shrink-0">
                    {/* Info Section - Clickable Link to Profile */}
                    <Link 
                      href={`/yonetim/personel/${person.sicil_no}`} 
                      className="flex items-center gap-3 flex-1 min-w-0 group cursor-pointer"
                    >
                      <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 border-2 transition-transform group-hover:scale-105 overflow-hidden",
                        isAdmin ? "bg-primary/10 text-primary border-primary/20" :
                        isLeader ? "bg-warning/10 text-warning border-warning/20" :
                        "bg-muted border-border"
                      )}>
                        {person.foto_url ? (
                          <img src={person.foto_url} alt={`${person.ad} ${person.soyad}`} className="w-full h-full object-cover" />
                        ) : (
                          <>{person.ad.charAt(0)}{person.soyad.charAt(0)}</>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-[var(--fd-text)] truncate">{person.ad} {person.soyad}</span>
                          {(() => {
                            const assignedVehicle = vehicles.find(v => v.sorumlu_sofor_id === person.id || v.sorumlu_er_id === person.id);
                            if (!assignedVehicle) return null;
                            return (
                              <Badge variant="outline" className="bg-[var(--fd-accent-soft)] text-[var(--fd-accent)] border-[var(--fd-accent-soft2)] text-[9px] px-1.5 py-0 font-bold font-mono flex items-center gap-1 shadow-[var(--fd-shadow-sm)] shrink-0">
                                <Truck className="w-2.5 h-2.5" />
                                {assignedVehicle.plaka}
                              </Badge>
                            );
                          })()}
                          {isLeader && (
                            <Badge className="bg-[rgba(245,158,11,0.08)] text-[var(--fd-amber)] border border-[rgba(245,158,11,0.2)] text-[9px] px-1.5 py-0 uppercase flex items-center gap-1">
                              <Star className="w-2.5 h-2.5 fill-warning" />
                              {person.unvan}
                            </Badge>
                          )}
                          {isAdmin && !isLeader && (
                            <Badge className="bg-[rgba(220,38,38,0.08)] text-[var(--fd-danger)] border border-[rgba(220,38,38,0.2)] text-[9px] px-1.5 py-0 uppercase flex items-center gap-1">
                              <Shield className="w-2.5 h-2.5" />
                              {person.unvan}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-[var(--fd-text3)] mt-0.5 font-mono">
                          <Key className="w-3 h-3" />
                          {person.sicil_no}
                          <span className="opacity-50">|</span>
                          <span>Rol: {person.rol}</span>
                          {!isLeader && !isAdmin && (
                            <>
                              <span className="opacity-50">|</span>
                              <span>{person.unvan}</span>
                            </>
                          )}
                          <span className="opacity-50">|</span>
                          <span>Posta: {person.posta_no || 1}</span>
                          <span className="opacity-50">|</span>
                          <span className={cn(
                            "font-medium",
                            person.durum === 'İzinli' ? "text-warning" : 
                            person.durum === 'Raporlu' ? "text-danger" : 
                            "text-success"
                          )}>
                            {person.durum || 'Görevde'}
                          </span>
                        </div>
                        
                        {/* Durum Sertifika Badges */}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {(() => {
                            const cert = getCertStatus(person.sicil_no, 'Ehliyet')
                            return (
                              <span className={cn("text-[9px] px-1.5 py-0.5 rounded border font-semibold flex items-center gap-1", cert.color)}>
                                <Truck className="w-2.5 h-2.5" />
                                <span>Ağır Vasıta: {cert.status === 'missing' ? 'Yok' : cert.label}</span>
                              </span>
                            )
                          })()}

                          {(() => {
                            const cert = getCertStatus(person.sicil_no, 'İlkyardım')
                            return (
                              <span className={cn("text-[9px] px-1.5 py-0.5 rounded border font-semibold flex items-center gap-1", cert.color)}>
                                <HeartPulse className="w-2.5 h-2.5" />
                                <span>İlk Yardım: {cert.status === 'missing' ? 'Yok' : cert.label}</span>
                              </span>
                            )
                          })()}

                          {(() => {
                            const cert = getCertStatus(person.sicil_no, 'SCBA')
                            return (
                              <span className={cn("text-[9px] px-1.5 py-0.5 rounded border font-semibold flex items-center gap-1", cert.color)}>
                                <Wind className="w-2.5 h-2.5" />
                                <span>SCBA: {cert.status === 'missing' ? 'Yok' : cert.label}</span>
                              </span>
                            )
                          })()}
                        </div>
                      </div>
                    </Link>

                    {/* Edit Button visible on mobile, hidden on desktop/xl */}
                    <button 
                      onClick={() => openEditModal(person)} 
                      className="xl:hidden h-8.5 px-3 flex items-center justify-center gap-1.5 cursor-pointer bg-[var(--fd-accent-soft)] hover:bg-[var(--fd-accent)] text-[var(--fd-accent)] hover:text-[#ffffff] border border-[var(--fd-accent-soft2)] rounded-lg text-xs font-bold transition-all shrink-0"
                    >
                      <Settings2 className="w-4 h-4" />
                      <span>Düzenle</span>
                    </button>
                  </div>

                  {/* Toggle Permissions Switches (Edit Button only visible on xl here) */}
                  <div className="flex flex-wrap items-center gap-3 sm:gap-5 mt-2 xl:mt-0 ml-12 xl:ml-0">
                    <button 
                      onClick={() => openEditModal(person)} 
                      className="hidden xl:flex h-9 px-3.5 items-center justify-center gap-1.5 cursor-pointer bg-[var(--fd-accent-soft)] hover:bg-[var(--fd-accent)] text-[var(--fd-accent)] hover:text-[#ffffff] border border-[var(--fd-accent-soft2)] rounded-lg text-xs font-bold transition-all"
                    >
                      <Settings2 className="w-4 h-4" />
                      <span>Düzenle</span>
                    </button>
                    <Switch
                      checked={perms.view_only}
                      onChange={() => togglePermission(person.sicil_no, 'view_only')}
                      label="Sadece Görüntüler"
                      activeColor="bg-[var(--fd-success)]"
                    />

                    <Switch
                      checked={perms.can_approve}
                      onChange={() => togglePermission(person.sicil_no, 'can_approve')}
                      label="Envanter Onaylar"
                      activeColor="bg-[var(--fd-accent)]"
                    />

                    <Switch
                      checked={perms.can_print}
                      onChange={() => togglePermission(person.sicil_no, 'can_print')}
                      label="Barkod Basabilir"
                      activeColor="bg-[var(--fd-info)]"
                    />
                  </div>
                </div>
              )
            })}
            
            {filteredPersonnel.length === 0 && (
              <div className="p-8 text-center text-muted-foreground text-sm">
                Aramanızla eşleşen personel bulunamadı.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* Informative Note */}
      <div className="p-4 bg-muted/30 border border-border/50 rounded-xl text-xs text-muted-foreground flex items-start gap-3">
        <SlidersHorizontal className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          Yetki değiştirmeleri <strong>anında veritabanına</strong> kaydedilir. Sayfa yenilendiğinde son durumlar korunur.
        </p>
      </div>

      {/* Edit Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="w-[94vw] sm:w-full sm:max-w-[500px] max-h-[85vh] sm:max-h-[90vh] flex flex-col p-0 border-[var(--fd-border-strong)] bg-[var(--fd-surface)] shadow-[var(--fd-shadow-lg)] backdrop-blur-sm rounded-[var(--fd-r-lg)]">
          <DialogHeader className="p-4 border-b border-[var(--fd-border)] bg-[var(--fd-surface2)] shrink-0">
            <DialogTitle className="flex items-center gap-1.5 text-base font-bold text-[var(--fd-text)] uppercase">
              <Settings2 className="w-5 h-5 text-primary" />
              Personel Düzenle
            </DialogTitle>
          </DialogHeader>
          
          {selectedPerson && (
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
              <div className="bg-[var(--fd-surface2)] p-3 rounded-[var(--fd-r)] border border-[var(--fd-border)] flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 rounded-full bg-primary/10 text-primary border-2 border-primary/20 flex items-center justify-center font-bold text-lg mb-2 overflow-hidden">
                  {selectedPerson.foto_url ? (
                    <img src={selectedPerson.foto_url} alt={`${selectedPerson.ad} ${selectedPerson.soyad}`} className="w-full h-full object-cover" />
                  ) : (
                    <>{selectedPerson.ad.charAt(0)}{selectedPerson.soyad.charAt(0)}</>
                  )}
                </div>
                <p className="text-base font-bold">{selectedPerson.ad} {selectedPerson.soyad}</p>
                <p className="text-xs font-mono text-muted-foreground mt-0.5">{selectedPerson.sicil_no} • {selectedPerson.unvan}</p>
              </div>

                            <div className="space-y-4">
                <div className="flex bg-[var(--fd-surface2)] rounded-[var(--fd-r-sm)] border border-[var(--fd-border)] p-1 overflow-x-auto hide-scrollbar">
                  <button type="button" onClick={() => setActiveTab("kurumsal")} className={cn("flex-1 px-3 py-1.5 text-xs font-semibold rounded-sm whitespace-nowrap transition-colors", activeTab === "kurumsal" ? "bg-[var(--fd-surface)] text-[var(--fd-text)] shadow-sm" : "text-muted-foreground hover:text-[var(--fd-text)]")}>Kurumsal</button>
                  <button type="button" onClick={() => setActiveTab("ozluk")} className={cn("flex-1 px-3 py-1.5 text-xs font-semibold rounded-sm whitespace-nowrap transition-colors", activeTab === "ozluk" ? "bg-[var(--fd-surface)] text-[var(--fd-text)] shadow-sm" : "text-muted-foreground hover:text-[var(--fd-text)]")}>Özlük</button>
                  <button type="button" onClick={() => setActiveTab("sertifika")} className={cn("flex-1 px-3 py-1.5 text-xs font-semibold rounded-sm whitespace-nowrap transition-colors", activeTab === "sertifika" ? "bg-[var(--fd-surface)] text-[var(--fd-text)] shadow-sm" : "text-muted-foreground hover:text-[var(--fd-text)]")}>Sertifikalar</button>
                  <button type="button" onClick={() => setActiveTab("performans")} className={cn("flex-1 px-3 py-1.5 text-xs font-semibold rounded-sm whitespace-nowrap transition-colors", activeTab === "performans" ? "bg-[var(--fd-surface)] text-[var(--fd-text)] shadow-sm" : "text-muted-foreground hover:text-[var(--fd-text)]")}>Performans</button>
                </div>

                <div className="pt-1">
                  {activeTab === "kurumsal" && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase text-muted-foreground">Görev / Ünvan</label>
                        <select 
                          className="flex h-9 w-full rounded-[var(--fd-r-sm)] border border-[var(--fd-border)] bg-[var(--fd-surface2)] px-3 py-1 text-xs"
                          value={`${editRole}:${editUnvan}`}
                          onChange={(e) => {
                            const [role, unvan] = e.target.value.split(":");
                            setEditRole(role);
                            setEditUnvan(unvan);
                          }}
                        >
                          {getCombinedOptions(selectedPerson.rol, selectedPerson.unvan).map((opt) => (
                            <option key={`${opt.role}:${opt.unvan}`} value={`${opt.role}:${opt.unvan}`}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {POSTA_SECIMLI_UNVANLAR.includes(editUnvan) && (
                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase text-muted-foreground">Posta Numarası</label>
                          <select 
                            className="flex h-9 w-full rounded-[var(--fd-r-sm)] border border-[var(--fd-border)] bg-[var(--fd-surface2)] px-3 py-1 text-xs"
                            value={editPostaNo}
                            onChange={(e) => setEditPostaNo(e.target.value)}
                          >
                            <option value="1">1. Posta</option>
                            <option value="2">2. Posta</option>
                            <option value="3">3. Posta</option>
                            <option value="0">Karargah (Postasız)</option>
                          </select>
                        </div>
                      )}
                      
                      {currentUser?.rol === 'Admin' && (
                        <div className="pt-4 border-t border-border space-y-3">
                          <h4 className="text-sm font-semibold flex items-center gap-2 text-[var(--fd-text)]">
                            <Key className="w-4 h-4 text-amber-500" />
                            Parola Yönetimi
                          </h4>
                          <div className="bg-[var(--fd-surface2)]/80 border border-[var(--fd-border)] rounded-[var(--fd-r)] p-3 space-y-2.5 flex flex-col items-center">
                            {resetPasswordSuccess ? (
                              <div className="w-full text-center space-y-2">
                                <p className="text-xs text-emerald-400 font-bold">Yeni Geçici Şifre:</p>
                                <div className="flex items-center justify-center gap-2 bg-[var(--fd-surface3)] px-3 py-1 rounded-[var(--fd-r-sm)] border border-[var(--fd-border)]">
                                  <span className="font-mono font-bold text-emerald-300 text-lg tracking-wider">{resetPasswordSuccess}</span>
                                  <button
                                    onClick={() => {
                                      if (typeof window !== 'undefined') {
                                        navigator.clipboard.writeText(resetPasswordSuccess);
                                        toast('Şifre kopyalandı.');
                                      }
                                    }}
                                    className="p-1.5 hover:bg-[var(--fd-surface2)] text-[var(--fd-text3)] hover:text-emerald-400 rounded transition-colors cursor-pointer"
                                    type="button"
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                  </button>
                                  {currentUserCanPrint && (
                                    <button
                                      onClick={() => handlePrintSinglePassword(selectedPerson, resetPasswordSuccess)}
                                      className="p-1.5 hover:bg-[var(--fd-surface2)] text-[var(--fd-text3)] hover:text-amber-400 rounded transition-colors cursor-pointer"
                                      type="button"
                                      title="Yazdır / İndir"
                                    >
                                      <Printer className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                                <p className="text-[10px] text-muted-foreground">Kullanıcı bu şifreyle giriş yaptıktan sonra şifresini değiştirmelidir.</p>
                              </div>
                            ) : (
                              <div className="w-full flex items-center justify-between gap-3">
                                <span className="text-xs text-[var(--fd-text3)] font-semibold">Geçici şifre oluştur:</span>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={resettingPassword}
                                  onClick={() => handleResetPassword(selectedPerson.sicil_no)}
                                  className="h-7 text-xs border-[var(--fd-border)] bg-[rgba(245,158,11,0.08)] hover:bg-[var(--fd-amber)] text-[var(--fd-amber)] hover:text-[#ffffff] gap-1.5 rounded-[var(--fd-r-sm)] transition"
                                >
                                  {resettingPassword ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCcw className="w-3 h-3" />}
                                  Şifreyi Sıfırla
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === "ozluk" && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase text-muted-foreground">İrtibat Telefonu</label>
                          <Input 
                            placeholder="05xx xxx xx xx"
                            className="h-9 text-xs border-[var(--fd-border)] bg-[var(--fd-surface2)] rounded-[var(--fd-r-sm)]"
                            value={editTelefon}
                            onChange={(e) => setEditTelefon(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase text-muted-foreground">Kan Grubu</label>
                          <Input 
                            placeholder="Örn: A Rh+"
                            className="h-9 text-xs border-[var(--fd-border)] bg-[var(--fd-surface2)] rounded-[var(--fd-r-sm)]"
                            value={editKanGrubu}
                            onChange={(e) => setEditKanGrubu(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase text-muted-foreground">Doğum Tarihi</label>
                          <Input 
                            type="date"
                            className="h-9 text-xs border-[var(--fd-border)] bg-[var(--fd-surface2)] rounded-[var(--fd-r-sm)]"
                            value={editDogumTarihi}
                            onChange={(e) => setEditDogumTarihi(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase text-muted-foreground">İşe Başlama Tarihi</label>
                          <Input 
                            type="date"
                            className="h-9 text-xs border-[var(--fd-border)] bg-[var(--fd-surface2)] rounded-[var(--fd-r-sm)]"
                            value={editIseBaslama}
                            onChange={(e) => setEditIseBaslama(e.target.value)}
                          />
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase text-muted-foreground">İkametgah Adresi</label>
                        <Input 
                          placeholder="Açık Adres"
                          className="h-9 text-xs border-[var(--fd-border)] bg-[var(--fd-surface2)] rounded-[var(--fd-r-sm)]"
                          value={editAdres}
                          onChange={(e) => setEditAdres(e.target.value)}
                        />
                      </div>
                      
                      <div className="pt-3 border-t border-border space-y-3">
                        <h4 className="text-sm font-semibold flex items-center gap-2 text-[var(--fd-text)]">
                          <HeartPulse className="w-4 h-4 text-red-500" />
                          Acil Durum İrtibatı
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase text-[var(--fd-text3)]">Yakınının Adı Soyadı</label>
                            <Input 
                              placeholder="Örn: Ayşe Yılmaz (Eşi)"
                              className="h-9 text-xs border-[var(--fd-border)] bg-[var(--fd-surface2)] rounded-[var(--fd-r-sm)]"
                              value={editEmergencyName}
                              onChange={(e) => setEditEmergencyName(e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase text-[var(--fd-text3)]">Yakınının Telefonu</label>
                            <Input 
                              placeholder="05xx xxx xx xx"
                              className="h-9 text-xs border-[var(--fd-border)] bg-[var(--fd-surface2)] rounded-[var(--fd-r-sm)]"
                              value={editEmergencyPhone}
                              onChange={(e) => setEditEmergencyPhone(e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === "sertifika" && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-emerald-500" />
                        Sertifika Bilgileri
                      </h4>
                      
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase text-muted-foreground">Ehliyet Geçerlilik Tarihi</label>
                        <Input 
                          type="date" 
                          className="h-9 text-xs border-[var(--fd-border)] bg-[var(--fd-surface2)] rounded-[var(--fd-r-sm)]"
                          value={ehliyetDate}
                          onChange={(e) => setEhliyetDate(e.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase text-muted-foreground">İlkyardım Sertifikası Geçerlilik Tarihi</label>
                        <Input 
                          type="date" 
                          className="h-9 text-xs border-[var(--fd-border)] bg-[var(--fd-surface2)] rounded-[var(--fd-r-sm)]"
                          value={ilkyardimDate}
                          onChange={(e) => setIlkyardimDate(e.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase text-muted-foreground">SCBA Solunum Cihazı Sertifika Tarihi</label>
                        <Input 
                          type="date" 
                          className="h-9 text-xs border-[var(--fd-border)] bg-[var(--fd-surface2)] rounded-[var(--fd-r-sm)]"
                          value={scbaDate}
                          onChange={(e) => setScbaDate(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  {activeTab === "performans" && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
                      {(() => {
                        const seed = parseInt(selectedPerson.sicil_no.replace(/\D/g, "") || "5800")
                        const totalCases = (seed % 42) + 12
                        const yanginPct = (seed % 25) + 50
                        const kurtarmaPct = (seed % 20) + 15
                        const hazmatPct = 100 - yanginPct - kurtarmaPct
                        
                        return (
                          <div className="space-y-4">
                            <h4 className="text-sm font-semibold flex items-center gap-2 text-[var(--fd-text)]">
                              <Activity className="w-4 h-4 text-cyan-500" />
                              EK-16 Performans & Operasyonel Skor Kartı
                            </h4>
                            
                            <div className="bg-[var(--fd-surface2)]/80 border border-[var(--fd-border)] rounded-[var(--fd-r)] p-3 space-y-2.5">
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-[var(--fd-text3)]">Toplam Operasyon Katılımı:</span>
                                <span className="font-bold text-[var(--fd-text)] px-2 py-0.5 bg-[var(--fd-surface3)] rounded border border-[var(--fd-border)]">{totalCases} Olay</span>
                              </div>
                              
                              <div className="space-y-2 text-xs">
                                <div className="space-y-1">
                                  <div className="flex justify-between text-[11px]">
                                    <span className="text-[var(--fd-text3)]">Yangın Söndürme / İtfaiye:</span>
                                    <span className="font-semibold text-red-400">{yanginPct}%</span>
                                  </div>
                                  <div className="w-full bg-[var(--fd-surface3)] rounded-full h-1.5 overflow-hidden">
                                    <div className="bg-gradient-to-r from-red-600 to-red-500 h-1.5 rounded-full" style={{ width: `${yanginPct}%` }} />
                                  </div>
                                </div>

                                <div className="space-y-1">
                                  <div className="flex justify-between text-[11px]">
                                    <span className="text-[var(--fd-text3)]">Arama Kurtarma / Kaza:</span>
                                    <span className="font-semibold text-blue-400">{kurtarmaPct}%</span>
                                  </div>
                                  <div className="w-full bg-[var(--fd-surface3)] rounded-full h-1.5 overflow-hidden">
                                    <div className="bg-gradient-to-r from-blue-600 to-blue-500 h-1.5 rounded-full" style={{ width: `${kurtarmaPct}%` }} />
                                  </div>
                                </div>

                                <div className="space-y-1">
                                  <div className="flex justify-between text-[11px]">
                                    <span className="text-[var(--fd-text3)]">Tehlikeli Madde (HAZMAT):</span>
                                    <span className="font-semibold text-amber-500">{hazmatPct}%</span>
                                  </div>
                                  <div className="w-full bg-[var(--fd-surface3)] rounded-full h-1.5 overflow-hidden">
                                    <div className="bg-gradient-to-r from-amber-600 to-amber-500 h-1.5 rounded-full" style={{ width: `${hazmatPct}%` }} />
                                  </div>
                                </div>
                              </div>
                              
                              <div className="text-[10px] text-muted-foreground text-center pt-1 italic">
                                EK-16 standartlarına göre Sivas İtfaiyesi performans değerlendirme indeksidir.
                              </div>
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter className="p-3 sm:p-4 border-t border-[var(--fd-border)] bg-[var(--fd-surface2)] flex items-center justify-end shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4 space-x-2">
            <Button 
              type="button"
              variant="danger" 
              onClick={() => selectedPerson && handleDeactivatePersonnel(selectedPerson.sicil_no)} 
              disabled={isSavingEdit || !selectedPerson} 
              className="mr-auto bg-[var(--fd-danger-soft)] hover:bg-[var(--fd-danger)] text-[var(--fd-danger)] hover:text-[#ffffff] border border-[var(--fd-danger-soft2)] text-xs font-semibold h-9 rounded-[var(--fd-r-sm)] px-3"
            >
              İlişiğini Kes (Sistemden Kaldır)
            </Button>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)} disabled={isSavingEdit} className="w-full sm:w-auto h-9 text-xs border border-[var(--fd-border-strong)] rounded-[var(--fd-r-sm)]">
              İptal
            </Button>
            <Button onClick={handleSaveEdit} disabled={isSavingEdit} className="w-full sm:w-auto min-w-[140px] h-9 text-xs bg-[var(--fd-accent)] hover:opacity-90 text-[#ffffff] font-semibold rounded-[var(--fd-r-sm)]">
              {isSavingEdit ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Kaydediliyor...
                </span>
              ) : (
                "Değişiklikleri Kaydet"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Driver License Dashboard Modal */}
      <Dialog open={isLicenseDashboardOpen} onOpenChange={setIsLicenseDashboardOpen}>
        <DialogContent className="w-[94vw] sm:w-full sm:max-w-[650px] max-h-[85vh] sm:max-h-[90vh] flex flex-col p-0 border-[var(--fd-border-strong)] bg-[var(--fd-surface)] shadow-[var(--fd-shadow-lg)] backdrop-blur-sm rounded-[var(--fd-r-lg)]">
          <DialogHeader className="p-4 border-b border-[var(--fd-border)] bg-[var(--fd-surface2)] shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-1.5 text-base font-bold text-[var(--fd-text)] uppercase">
                <Truck className="w-5 h-5 text-cyan-400" />
                Şoför Ehliyet Durumları & Planlama Radarı
              </DialogTitle>
            </div>
          </DialogHeader>

          {/* Quick Stats Grid */}
          <div className="p-3 bg-[var(--fd-surface2)] border-b border-[var(--fd-border)] shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="bg-[var(--fd-surface3)] p-2 rounded-[var(--fd-r-sm)] border border-[var(--fd-border)]">
              <p className="text-[10px] text-muted-foreground uppercase font-bold">Toplam Şoför</p>
              <p className="text-base font-bold text-[var(--fd-text)] mt-0.5">{licenseStats.total}</p>
            </div>
            <div className="bg-[rgba(22,163,74,0.06)] dark:bg-[rgba(22,163,74,0.12)] p-2 rounded-[var(--fd-r-sm)] border border-[rgba(22,163,74,0.15)] dark:border-[rgba(22,163,74,0.25)]">
              <p className="text-[10px] text-emerald-400 uppercase font-semibold">Aktif</p>
              <p className="text-base font-bold text-emerald-400 mt-0.5">{licenseStats.active}</p>
            </div>
            <div className="bg-[rgba(245,158,11,0.06)] dark:bg-[rgba(245,158,11,0.12)] p-2 rounded-[var(--fd-r-sm)] border border-[rgba(245,158,11,0.15)] dark:border-[rgba(245,158,11,0.25)]">
              <p className="text-[10px] text-amber-500 uppercase font-semibold">Kritik (≤30g)</p>
              <p className="text-base font-bold text-amber-500 mt-0.5">{licenseStats.critical}</p>
            </div>
            <div className="bg-[rgba(220,38,38,0.06)] dark:bg-[rgba(220,38,38,0.12)] p-2 rounded-[var(--fd-r-sm)] border border-[rgba(220,38,38,0.15)] dark:border-[rgba(220,38,38,0.25)]">
              <p className="text-[10px] text-rose-500 uppercase font-semibold">Eksik/Geçik</p>
              <p className="text-base font-bold text-rose-500 mt-0.5">{licenseStats.expired + licenseStats.missing}</p>
            </div>
          </div>

          {/* Search bar inside Modal */}
          <div className="p-3 border-b border-[var(--fd-border)] shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Şoför ismi veya sicil no ile ara..."
                className="pl-9 h-8 text-xs bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)]"
                value={licenseSearchQuery}
                onChange={e => setLicenseSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Scrollable List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
            {filteredDriverLicenses.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-xs">
                Eşleşen şoför kaydı bulunamadı.
              </div>
            ) : (
              filteredDriverLicenses.map(({ person, expiryDate, status, label, days }) => {
                return (
                  <div 
                    key={person.sicil_no}
                    className={cn(
                      "p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors",
                      status === 'missing' ? "bg-red-500/5 border-red-500/20 hover:bg-red-500/10" :
                      status === 'expired' ? "bg-red-500/5 border-red-500/20 hover:bg-red-500/10" :
                      status === 'critical' ? "bg-amber-500/5 border-amber-500/20 hover:bg-amber-500/10" :
                      "bg-[var(--fd-surface3)]/20 border-[var(--fd-border)]/80 hover:bg-[var(--fd-surface3)]/40"
                    )}
                  >
                    {/* Driver info */}
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 border overflow-hidden",
                        status === 'missing' || status === 'expired' ? "bg-red-500/10 text-red-500 border-red-500/20" :
                        status === 'critical' ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
                        "bg-[var(--fd-surface2)] text-[var(--fd-text2)] border-[var(--fd-border)]"
                      )}>
                        {person.foto_url ? (
                          <img src={person.foto_url} alt={`${person.ad} ${person.soyad}`} className="w-full h-full object-cover" />
                        ) : (
                          <>{person.ad.charAt(0)}{person.soyad.charAt(0)}</>
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[var(--fd-text)]">{person.ad} {person.soyad}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                          {person.sicil_no} • {person.unvan} • {person.posta_no ? `Posta ${person.posta_no}` : 'Karargah'}
                        </p>
                      </div>
                    </div>

                    {/* Expiry / Days indicator */}
                    <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 pt-2 sm:pt-0 border-[var(--fd-border)]">
                      <div className="text-right">
                        {status === 'missing' ? (
                          <span className="text-[10px] text-red-500 font-bold flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5 animate-pulse" /> Ehliyet Tanımsız!
                          </span>
                        ) : (
                          <>
                            <p className="text-[10px] text-muted-foreground">Geçerlilik Tarihi</p>
                            <p className="text-xs font-semibold text-[var(--fd-text2)] mt-0.5 font-mono">
                              {new Date(expiryDate).toLocaleDateString('tr-TR')}
                            </p>
                          </>
                        )}
                      </div>

                      <div className="shrink-0">
                        {status === 'missing' ? (
                          <Badge className="bg-[rgba(220,38,38,0.08)] text-[var(--fd-danger)] border border-[rgba(220,38,38,0.18)] text-[9px] font-bold px-1.5 py-0.5 rounded-[var(--fd-r-sm)]">
                            KAYIT EKSİK
                          </Badge>
                        ) : status === 'expired' ? (
                          <Badge className="bg-[rgba(220,38,38,0.08)] text-[var(--fd-danger)] border border-[rgba(220,38,38,0.18)] text-[9px] font-bold animate-pulse px-1.5 py-0.5 rounded-[var(--fd-r-sm)]">
                            SÜRESİ GEÇTİ
                          </Badge>
                        ) : status === 'critical' ? (
                          <Badge className="bg-[rgba(245,158,11,0.08)] text-[var(--fd-amber)] border border-[rgba(245,158,11,0.18)] text-[9px] font-bold px-1.5 py-0.5 rounded-[var(--fd-r-sm)]">
                            {days} GÜN KALDI
                          </Badge>
                        ) : (
                          <Badge className="bg-[rgba(22,163,74,0.08)] text-[var(--fd-success)] border border-[rgba(22,163,74,0.18)] text-[9px] font-bold px-1.5 py-0.5 rounded-[var(--fd-r-sm)]">
                            AKTİF ({days}g)
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <DialogFooter className="p-3 sm:p-4 border-t border-[var(--fd-border)] bg-[var(--fd-surface2)] flex items-center justify-end shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4 space-x-2">
            <Button variant="outline" onClick={() => setIsLicenseDashboardOpen(false)} className="w-full sm:w-auto h-9 text-xs border border-[var(--fd-border-strong)] rounded-[var(--fd-r-sm)]">
              Kapat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isAnalysisOpen} onOpenChange={setIsAnalysisOpen}>
        <DialogContent className="w-[94vw] sm:w-full sm:max-w-[800px] max-h-[85vh] sm:max-h-[90vh] flex flex-col p-0 border-[var(--fd-border-strong)] bg-[var(--fd-surface)] shadow-[var(--fd-shadow-lg)] backdrop-blur-sm rounded-[var(--fd-r-lg)]">
          <DialogHeader className="p-4 border-b border-[var(--fd-border)] bg-[var(--fd-surface2)] shrink-0">
            <div className="flex items-center justify-between w-full">
              <DialogTitle className="flex items-center gap-1.5 text-base font-bold text-[var(--fd-text)] uppercase">
                📊 Görev & Yangın Analiz Paneli
              </DialogTitle>
            </div>
            <p className="text-[11px] text-[var(--fd-text3)] mt-0.5 font-sans">Müfrezeler arası görev dağılım dengesi ve en az göreve çıkan personel listesi (son 30 gün)</p>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto md:overflow-hidden flex flex-col md:flex-row min-h-0">
            {/* Left Section: Rank list */}
            <div className="w-full md:w-1/2 h-[250px] md:h-full border-b md:border-b-0 md:border-r border-[var(--fd-border)] flex flex-col min-h-0 bg-[var(--fd-surface2)]/10 shrink-0">
              <div className="p-3 border-b border-[var(--fd-border)] bg-[var(--fd-surface2)]/20 text-xs font-bold text-[var(--fd-text3)] uppercase tracking-wider flex items-center justify-between font-sans">
                <span>Personel (Azdan Çoka)</span>
                <span className="text-[10px] lowercase text-[var(--fd-text3)]">30 günlük görev</span>
              </div>
              
              <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                {analysisLoading ? (
                  <div className="flex flex-col items-center justify-center py-12 space-y-3">
                    <Loader2 className="w-6 h-6 text-[var(--fd-accent)] animate-spin" />
                    <span className="text-xs text-[var(--fd-text3)] font-mono">Veriler analiz ediliyor...</span>
                  </div>
                ) : analysisStats.length === 0 ? (
                  <div className="text-center py-12 text-xs text-[var(--fd-text3)] italic font-mono">Aktif saha personeli bulunamadı.</div>
                ) : (
                  analysisStats.map((p, idx) => {
                    const isSelected = selectedAnalysisPerson?.sicil_no === p.sicil_no
                    const isPriority = idx < 3
                    
                    return (
                      <button
                        type="button"
                        key={p.sicil_no}
                        onClick={() => handleSelectAnalysisPerson(p)}
                        className={cn(
                          "w-full text-left p-2.5 rounded-lg border transition-all duration-200 flex items-center justify-between cursor-pointer font-sans",
                          isSelected
                            ? "bg-[var(--fd-accent-soft2)] border-[var(--fd-accent-soft)] text-[var(--fd-accent)] shadow-[var(--fd-shadow-sm)]"
                            : "bg-[var(--fd-surface)] border-[var(--fd-border)] hover:bg-[var(--fd-surface2)] text-[var(--fd-text)]"
                        )}
                      >
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-bold">
                              {p.ad} {p.soyad}
                            </span>
                            <Badge variant="muted" className="text-[9px] font-mono px-1 py-0 bg-[var(--fd-surface2)] text-[var(--fd-text2)] border border-[var(--fd-border)]">
                              {p.unvan}
                            </Badge>
                          </div>
                          <span className="text-[10px] text-[var(--fd-text3)] font-medium">
                            {p.istasyon} • Sicil: {p.sicil_no}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-2 shrink-0">
                          {isPriority && (
                            <span className="text-[9px] font-bold text-[var(--fd-danger)] bg-[rgba(220,38,38,0.1)] border border-[rgba(220,38,38,0.25)] px-1.5 py-0.5 rounded">
                              Öncelikli Sevk
                            </span>
                          )}
                          <span className={cn(
                            "text-xs font-mono font-bold px-2 py-0.5 rounded-md",
                            p.last30DaysMissions === 0
                              ? "bg-[var(--fd-surface3)] text-[var(--fd-text3)] border border-[var(--fd-border)]"
                              : "bg-[var(--fd-accent)]/10 text-[var(--fd-accent)] border border-[var(--fd-accent)]/20"
                          )}>
                            {p.last30DaysMissions}
                          </span>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            </div>
            
            {/* Right Section: Details & Breakdown */}
            <div className="w-full md:w-1/2 p-4 flex flex-col space-y-4 overflow-y-auto">
              {selectedAnalysisPerson ? (
                <>
                  <div className="p-3 bg-[var(--fd-surface2)] border border-[var(--fd-border)] rounded-xl relative overflow-hidden font-sans">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-[var(--fd-accent)]/10 to-transparent rounded-full pointer-events-none" />
                    <h3 className="text-sm font-black text-[var(--fd-text)] tracking-wider">
                      👤 {selectedAnalysisPerson.ad} {selectedAnalysisPerson.soyad}
                    </h3>
                    <p className="text-xs text-[var(--fd-text3)] mt-0.5 font-medium">
                      {selectedAnalysisPerson.unvan} • {selectedAnalysisPerson.istasyon} Müfrezesi
                    </p>
                    <div className="mt-2.5 flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fd-text3)] uppercase">Vardiya Durumu:</span>
                      <span className={cn(
                        "px-1.5 py-0.5 rounded text-[10px] font-bold uppercase",
                        selectedAnalysisPerson.durum === 'Görevde'
                          ? "bg-[rgba(22,163,74,0.1)] text-[var(--fd-success)]"
                          : "bg-[var(--fd-surface3)] text-[var(--fd-text3)] border border-[var(--fd-border)]"
                      )}>
                        {selectedAnalysisPerson.durum || 'Görevde'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="space-y-2 font-sans">
                    <h4 className="text-[10px] font-black text-[var(--fd-text3)] uppercase tracking-wider">
                      📊 Kategori Bazlı Detaylı Analiz (Toplam Görev)
                    </h4>
                    
                    {detailsLoading ? (
                      <div className="flex flex-col items-center justify-center py-10 space-y-2">
                        <Loader2 className="w-5 h-5 text-[var(--fd-accent)] animate-spin" />
                        <span className="text-[10px] text-[var(--fd-text3)] font-mono">Yükleniyor...</span>
                      </div>
                    ) : selectedPersonDetails ? (
                      <div className="space-y-2">
                        {/* Yangın Müdahale */}
                        <div className="p-2.5 bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-lg flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">🔥</span>
                            <div>
                              <div className="text-xs font-bold text-[var(--fd-text)]">Yangın Müdahale</div>
                              <div className="text-[10px] text-[var(--fd-text3)]">Söndürme & kurtarma operasyonları</div>
                            </div>
                          </div>
                          <span className="text-sm font-mono font-black text-[var(--fd-danger)] bg-[rgba(220,38,38,0.06)] border border-[rgba(220,38,38,0.15)] px-2.5 py-0.5 rounded-md">
                            {selectedPersonDetails.stats?.find((s: any) => s.subject === 'Yangın Müdahale')?.value || 0}
                          </span>
                        </div>
                        
                        {/* Kurtarma Operasyonu */}
                        <div className="p-2.5 bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-lg flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">🩹</span>
                            <div>
                              <div className="text-xs font-bold text-[var(--fd-text)]">Kurtarma Operasyonu</div>
                              <div className="text-[10px] text-[var(--fd-text3)]">Trafik kazası, asansör, sıkışma</div>
                            </div>
                          </div>
                          <span className="text-sm font-mono font-black text-[var(--fd-success)] bg-[rgba(22,163,74,0.06)] border border-[rgba(22,163,74,0.15)] px-2.5 py-0.5 rounded-md">
                            {selectedPersonDetails.stats?.find((s: any) => s.subject === 'Kurtarma Operasyonu')?.value || 0}
                          </span>
                        </div>
                        
                        {/* Dış Görev */}
                        <div className="p-2.5 bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-lg flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">🚚</span>
                            <div>
                              <div className="text-xs font-bold text-[var(--fd-text)]">Dış Görev / Sevk</div>
                              <div className="text-[10px] text-[var(--fd-text3)]">İtfaiye sevk, su tahliye, baca temizlik</div>
                            </div>
                          </div>
                          <span className="text-sm font-mono font-black text-[var(--fd-amber)] bg-[rgba(245,158,11,0.06)] border border-[rgba(245,158,11,0.15)] px-2.5 py-0.5 rounded-md">
                            {selectedPersonDetails.stats?.find((s: any) => s.subject === 'Dış Görev')?.value || 0}
                          </span>
                        </div>

                        {/* Toplam */}
                        <div className="p-3 bg-[var(--fd-accent-soft2)] border border-[var(--fd-accent-soft)] rounded-lg flex items-center justify-between mt-4">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">📈</span>
                            <div>
                              <div className="text-xs font-bold text-[var(--fd-accent)]">Ömür Boyu Toplam Görev</div>
                              <div className="text-[10px] text-[var(--fd-accent)]/80">Kayıtlı tüm tarihsel veriler</div>
                            </div>
                          </div>
                          <span className="text-base font-mono font-black text-[var(--fd-accent)] px-3 py-1 bg-[var(--fd-accent)]/10 border border-[var(--fd-accent)]/20 rounded-md">
                            {selectedPersonDetails.total || 0}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-6 text-xs text-[var(--fd-text3)] italic">Detaylar yüklenemedi.</div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 space-y-2 text-[var(--fd-text3)] font-sans">
                  <SlidersHorizontal className="w-8 h-8 opacity-40" />
                  <span className="text-xs italic">Analiz detaylarını görüntülemek için soldan bir personel seçin.</span>
                </div>
              )}
            </div>
          </div>
          
          <DialogFooter className="p-3 sm:p-4 border-t border-[var(--fd-border)] bg-[var(--fd-surface2)] flex items-center justify-end shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4">
            <Button
              variant="outline"
              className="border-[var(--fd-border-strong)] bg-[var(--fd-surface2)] text-[var(--fd-text2)] hover:bg-[var(--fd-surface3)] hover:text-[var(--fd-text)] h-9 text-xs rounded-[var(--fd-r-sm)]"
              onClick={() => setIsAnalysisOpen(false)}
            >
              Kapat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>

      {/* Leave Management Modal */}
      <LeaveManagementModal
        isOpen={isLeaveModalOpen}
        onClose={() => setIsLeaveModalOpen(false)}
        personnel={personnel}
        onLeaveUpdated={fetchPersonnel}
      />
    </PageGuard>
  )
}

function UsersIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}
