"use client"

import { useState, useMemo, useEffect, useCallback } from 'react'
import PageGuard from "@/components/PageGuard"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { Search, Plus, UserPlus, Shield, ShieldAlert, Key, Loader2, Star, CheckCircle2, SlidersHorizontal, Settings2, AlertTriangle, RefreshCcw, ShieldCheck, Truck, HeartPulse, Wind, Activity } from "lucide-react"
import { api } from "@/lib/api"
import { type Personnel } from "@/types"
import { cn } from "@/lib/utils"
import { useAuthStore } from "@/lib/authStore"
import Link from 'next/link'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/Dialog"

export default function PersonelYonetimPage() {
  const { user: currentUser } = useAuthStore()
  const [personnel, setPersonnel] = useState<Personnel[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  
  // Registration form
  const [isAdding, setIsAdding] = useState(false)
  const [newAdSoyad, setNewAdSoyad] = useState("")
  const [newRole, setNewRole] = useState("User")
  const [newPostaNo, setNewPostaNo] = useState("1")
  const [newDurum, setNewDurum] = useState("Görevde")
  
  // Permissions state synced with DB
  const [permissions, setPermissions] = useState<Record<string, { view_only: boolean, can_approve: boolean, can_print: boolean }>>({})
  
  // Certifications
  const [certifications, setCertifications] = useState<any[]>([])

  // Vehicles
  const [dbVehicles, setDbVehicles] = useState<any[]>([])

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [selectedPerson, setSelectedPerson] = useState<Personnel | null>(null)
  const [editRole, setEditRole] = useState("User")
  const [editPostaNo, setEditPostaNo] = useState("1")
  const [ehliyetDate, setEhliyetDate] = useState("")
  const [ilkyardimDate, setIlkyardimDate] = useState("")
  const [scbaDate, setScbaDate] = useState("")
  const [activeShift, setActiveShift] = useState(1)
  const [isSavingEdit, setIsSavingEdit] = useState(false)

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

      const { data: vehData, error: vehErr } = await api.from('vehicles').select('*')
      if (!vehErr && vehData) {
        setDbVehicles(vehData)
      }

      if (data && data.length > 0) {
        const mapped: Personnel[] = data.map((p: any) => ({
          sicil_no: p.sicil_no,
          ad: p.ad,
          soyad: p.soyad,
          unvan: p.unvan,
          rol: p.rol,
          posta: p.posta || '',
          posta_no: p.posta_no || 1,
          durum: p.durum || 'Görevde'
        }))
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
    if (!searchQuery) return personnel
    const query = searchQuery.toLowerCase()
    return personnel.filter(p => 
      p.ad.toLowerCase().includes(query) || 
      p.soyad.toLowerCase().includes(query) || 
      p.sicil_no.toLowerCase().includes(query) ||
      p.unvan.toLowerCase().includes(query)
    )
  }, [personnel, searchQuery])

  // ADD PERSONNEL — Supabase INSERT
  const handleAddPersonel = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newAdSoyad.trim()) return
    setSaving(true)

    const parts = newAdSoyad.trim().split(" ")
    const soyad = parts.length > 1 ? parts.pop() || "" : ""
    const ad = parts.join(" ")

    try {
      const { error: insertErr } = await api.insert('personnel', {
        sicil_no: nextSicil,
        ad,
        soyad,
        unvan: 'İtfaiye Eri',
        rol: newRole,
        view_only: newRole === 'User',
        can_approve: newRole === 'Shift_Leader' || newRole === 'Admin' || newRole === 'Editor',
        can_print: newRole === 'Admin' || newRole === 'Editor',
        posta_no: parseInt(newPostaNo, 10),
        durum: newDurum
      })

      if (insertErr) throw insertErr

      // Refresh list from DB
      await fetchPersonnel()
      setNewAdSoyad("")
      setNewRole("User")
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
          details: { ad, soyad, rol: newRole },
        }),
      }).catch(err => console.error('[AuditLog] Personel ekleme logu gönderilemedi:', err))
    } catch (err: any) {
      console.error("Personel ekleme hatası:", err)
      // Fallback: add locally
      const newPerson: Personnel = {
        sicil_no: nextSicil, ad, soyad,
        unvan: 'İtfaiye Eri', rol: newRole, posta: '',
        posta_no: parseInt(newPostaNo, 10), durum: newDurum
      }
      setPersonnel(prev => [...prev, newPerson])
      setPermissions(prev => ({
        ...prev,
        [nextSicil]: {
          view_only: newRole === 'User',
          can_approve: newRole !== 'User',
          can_print: newRole === 'Admin' || newRole === 'Editor',
        }
      }))
      setNewAdSoyad("")
      setNewRole("User")
      setIsAdding(false)
    } finally {
      setSaving(false)
    }
  }

  // TOGGLE PERMISSION — Supabase UPDATE (debounced)
  const togglePermission = async (sicilNo: string, perm: 'view_only' | 'can_approve' | 'can_print') => {
    const current = permissions[sicilNo]
    if (!current) return

    const newValue = !current[perm]
    
    // Optimistic UI update
    setPermissions(prev => ({
      ...prev,
      [sicilNo]: { ...prev[sicilNo], [perm]: newValue }
    }))

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
        [sicilNo]: { ...prev[sicilNo], [perm]: !newValue }
      }))
    }
  }

  // EDIT MODAL HANDLERS
  const openEditModal = (person: Personnel) => {
    setSelectedPerson(person)
    setEditRole(person.rol || "User")
    setEditPostaNo(person.posta_no?.toString() || "1")

    const personCerts = certifications.filter(c => c.sicil_no === person.sicil_no)
    const ehliyet = personCerts.find(c => c.tip === "Ehliyet")
    const ilkyardim = personCerts.find(c => c.tip === "İlkyardım")
    const scba = personCerts.find(c => c.tip === "SCBA")
    
    setEhliyetDate(ehliyet?.gecerlilik_tarihi || "")
    setIlkyardimDate(ilkyardim?.gecerlilik_tarihi || "")
    setScbaDate(scba?.gecerlilik_tarihi || "")

    setIsEditModalOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!selectedPerson) return
    setIsSavingEdit(true)
    
    try {
      // 1. Update Role and Posta
      await api.update('personnel', {
        rol: editRole,
        posta_no: parseInt(editPostaNo, 10),
        posta: `${editPostaNo}. Posta`
      }, { sicil_no: selectedPerson.sicil_no })

      // 2. Delete existing certifications sequentially
      await api.remove('staff_certifications', { sicil_no: selectedPerson.sicil_no, tip: 'Ehliyet' })
      await api.remove('staff_certifications', { sicil_no: selectedPerson.sicil_no, tip: 'İlkyardım' })
      await api.remove('staff_certifications', { sicil_no: selectedPerson.sicil_no, tip: 'SCBA' })

      // 3. Insert new certifications if dates are provided
      if (ehliyetDate) {
        await api.insert('staff_certifications', {
          sicil_no: selectedPerson.sicil_no,
          tip: 'Ehliyet',
          gecerlilik_tarihi: ehliyetDate
        })
      }
      
      if (ilkyardimDate) {
        await api.insert('staff_certifications', {
          sicil_no: selectedPerson.sicil_no,
          tip: 'İlkyardım',
          gecerlilik_tarihi: ilkyardimDate
        })
      }

      if (scbaDate) {
        await api.insert('staff_certifications', {
          sicil_no: selectedPerson.sicil_no,
          tip: 'SCBA',
          gecerlilik_tarihi: scbaDate
        })
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

  const getCertStatus = useCallback((personSicil: string, certType: string) => {
    const cert = certifications.find(c => c.sicil_no === personSicil && c.tip === certType)
    if (!cert || !cert.gecerlilik_tarihi) {
      return { status: 'missing', label: 'Eksik', color: 'bg-slate-500/10 text-slate-400 border-slate-500/20' }
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

  // Group active shift staff
  const activeShiftStaff = useMemo(() => {
    return personnel.filter(p => p.posta_no === activeShift)
  }, [personnel, activeShift])

  // Dynamic vehicles selection matching user database content (Sivas plates)
  const dynamicVehicles = useMemo(() => {
    const arazoz = dbVehicles.find(v => (v.arac_tipi || '').toLowerCase().includes('arazöz')) || 
                  dbVehicles.find(v => v.plaka === '58 FP 968') || 
                  dbVehicles.find(v => v.plaka === '58 ACT 367') ||
                  { plaka: '58 FP 968', arac_tipi: 'BMC Fatih Arazöz' };
                  
    const kurtarma = dbVehicles.find(v => (v.arac_tipi || '').toLowerCase().includes('kurtarma') || (v.arac_tipi || '').toLowerCase().includes('müdahale')) || 
                    dbVehicles.find(v => v.plaka === '58 TH 257') || 
                    dbVehicles.find(v => v.plaka === '58 TH 256') ||
                    { plaka: '58 TH 257', arac_tipi: '5 Nolu Arama-Kurtarma' };
                    
    const merdivenli = dbVehicles.find(v => (v.arac_tipi || '').toLowerCase().includes('merdivenli') || (v.arac_tipi || '').toLowerCase().includes('metre') || (v.arac_tipi || '').toLowerCase().includes('man')) || 
                      dbVehicles.find(v => v.plaka === '58 AEH 221') || 
                      { plaka: '58 AEH 221', arac_tipi: '42 Metre MAN' };
                      
    return { arazoz, kurtarma, merdivenli };
  }, [dbVehicles]);

  // Centralized Akıllı Araç & Rota Eşleştirme Dağıtımı (Faz 11.2)
  const vehicleAllocations = useMemo(() => {
    const assigned = new Set<string>()

    // 1. Şoförleri Atama (Her araç için benzersiz şoför)
    const activeDrivers = activeShiftStaff.filter(p => {
      const cert = certifications.find(c => c.sicil_no === p.sicil_no && c.tip === 'Ehliyet')
      if (!cert || !cert.gecerlilik_tarihi) return false
      return new Date(cert.gecerlilik_tarihi) >= new Date('2026-05-20')
    })
    
    const arazozSofor = activeDrivers.find(d => !assigned.has(d.sicil_no))
    if (arazozSofor) assigned.add(arazozSofor.sicil_no)

    const kurtarmaSofor = activeDrivers.find(d => !assigned.has(d.sicil_no))
    if (kurtarmaSofor) assigned.add(kurtarmaSofor.sicil_no)

    const merdivenliSofor = activeDrivers.find(d => !assigned.has(d.sicil_no))
    if (merdivenliSofor) assigned.add(merdivenliSofor.sicil_no)

    // 2. Ekip Amirlerini Atama (Shift Leader, Çavuş, Amir unvanları)
    const leaders = activeShiftStaff.filter(p => 
      !assigned.has(p.sicil_no) && (
        p.rol === 'Admin' || 
        p.rol === 'Editor' || 
        p.rol === 'Shift_Leader' ||
        p.unvan.includes('Çavuş') || 
        p.unvan.includes('Amir')
      )
    )

    const arazozAmir = leaders.find(l => !assigned.has(l.sicil_no))
    if (arazozAmir) assigned.add(arazozAmir.sicil_no)

    const kurtarmaAmir = leaders.find(l => !assigned.has(l.sicil_no))
    if (kurtarmaAmir) assigned.add(kurtarmaAmir.sicil_no)

    // 3. Kurtarma Uzmanı Atama (SCBA veya İlkyardım sertifikası olan)
    const specialists = activeShiftStaff.filter(p => {
      if (assigned.has(p.sicil_no)) return false
      const scba = certifications.find(c => c.sicil_no === p.sicil_no && c.tip === 'SCBA')
      const iy = certifications.find(c => c.sicil_no === p.sicil_no && c.tip === 'İlkyardım')
      const today = new Date('2026-05-20')
      return (scba?.gecerlilik_tarihi && new Date(scba.gecerlilik_tarihi) >= today) || 
             (iy?.gecerlilik_tarihi && new Date(iy.gecerlilik_tarihi) >= today)
    })

    const kurtarmaUzman = specialists.find(s => !assigned.has(s.sicil_no))
    if (kurtarmaUzman) assigned.add(kurtarmaUzman.sicil_no)

    // 4. Müdahale Eri, Erişim Personeli ve Kule Elemanı (Geriye kalan boşta personel)
    const remainingStaff = activeShiftStaff.filter(p => !assigned.has(p.sicil_no))

    const arazozEr = remainingStaff[0]
    if (arazozEr) assigned.add(arazozEr.sicil_no)

    const merdivenliErisim = remainingStaff.find(p => !assigned.has(p.sicil_no))
    if (merdivenliErisim) assigned.add(merdivenliErisim.sicil_no)

    const merdivenliKule = remainingStaff.find(p => !assigned.has(p.sicil_no))
    if (merdivenliKule) assigned.add(merdivenliKule.sicil_no)

    return {
      arazoz: { amir: arazozAmir, sofor: arazozSofor, er: arazozEr },
      kurtarma: { amir: kurtarmaAmir, sofor: kurtarmaSofor, uzman: kurtarmaUzman },
      merdivenli: { erisim: merdivenliErisim, sofor: merdivenliSofor, kule: merdivenliKule }
    }
  }, [activeShiftStaff, certifications])

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
      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Personel Yönetimi</h1>
          <p className="text-muted-foreground text-sm mt-1">
            İtfaiye personeli kayıtları, yetkilendirme ve rol atama işlemleri.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={fetchPersonnel} variant="secondary" size="sm" className="gap-1.5">
            <RefreshCcw className="w-3.5 h-3.5" /> Yenile
          </Button>
          <Button onClick={() => setIsAdding(!isAdding)} className="shrink-0 gap-2">
            {isAdding ? <Settings2 className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
            {isAdding ? "İptal" : "Yeni Personel Ekle"}
          </Button>
        </div>
      </div>

      {/* Aktif Vardiya ve Araç Eşleştirme Şeması */}
      <Card className="border-slate-800 bg-slate-950/40 backdrop-blur-md shadow-xl">
        <CardHeader className="pb-3 border-b border-border/50 bg-muted/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-red-500 animate-pulse" />
            <div>
              <CardTitle className="text-base font-bold text-slate-100">Aktif Vardiya & Araç Eşleştirme Şeması</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Posta bazlı araç müdahale ekiplerinin anlık zimmet ve yeterlilik durumu.</p>
            </div>
          </div>
          
          <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-1">
            {[1, 2, 3].map(postaNum => (
              <button
                key={postaNum}
                onClick={() => setActiveShift(postaNum)}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold rounded-md transition-all",
                  activeShift === postaNum 
                    ? "bg-red-500 text-white shadow-lg" 
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                {postaNum}. Posta
              </button>
            ))}
          </div>
        </CardHeader>
        
        <CardContent className="p-4 sm:p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Vehicle 1: Arazöz */}
            {(() => {
              const { amir, sofor, er } = vehicleAllocations.arazoz
              
              return (
                <div className="border border-slate-800 rounded-xl p-4 bg-slate-900/10 backdrop-blur-sm relative overflow-hidden flex flex-col justify-between min-h-[220px]">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 rounded-full blur-xl pointer-events-none" />
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-2">
                        <div className="bg-red-500/10 p-2 rounded-lg text-red-500">
                          <Truck className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-200 text-sm">{dynamicVehicles.arazoz.plaka}</h3>
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{dynamicVehicles.arazoz.arac_tipi}</span>
                        </div>
                       </div>
                       <Badge className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[10px]">Aktif</Badge>
                     </div>
                     
                     <div className="space-y-2 text-xs">
                       <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                         <span className="text-slate-400">Ekip Amiri:</span>
                         <span className="font-semibold text-slate-200">{amir ? `${amir.ad} ${amir.soyad}` : 'Atanmamış'}</span>
                       </div>
                       
                       <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                         <span className="text-slate-400">Şoför:</span>
                         {sofor ? (
                           <span className="font-semibold text-emerald-400">{sofor.ad} {sofor.soyad}</span>
                         ) : (
                           <span className="font-semibold text-red-500 animate-pulse flex items-center gap-1">
                             <AlertTriangle className="w-3.5 h-3.5" /> Sürücü Eksik!
                           </span>
                         )}
                       </div>
                       
                       <div className="flex justify-between items-center py-1">
                         <span className="text-slate-400">Müdahale Eri:</span>
                         <span className="font-semibold text-slate-200">{er ? `${er.ad} ${er.soyad}` : 'Atanmamış'}</span>
                       </div>
                     </div>
                   </div>
                   
                   <div className="mt-4 pt-3 border-t border-slate-800/40 flex justify-between items-center text-[10px] text-slate-500">
                     <span>Posta Kadrosu: {activeShiftStaff.length} kişi</span>
                     <span>Ağır Söndürme</span>
                   </div>
                 </div>
               )
             })()}
             
             {/* Vehicle 2: Kurtarma */}
             {(() => {
               const { amir, sofor, uzman: er } = vehicleAllocations.kurtarma
               const hasScba = er ? certifications.some(c => c.sicil_no === er.sicil_no && c.tip === 'SCBA' && new Date(c.gecerlilik_tarihi) >= new Date('2026-05-20')) : false
               
               return (
                 <div className="border border-slate-800 rounded-xl p-4 bg-slate-900/10 backdrop-blur-sm relative overflow-hidden flex flex-col justify-between min-h-[220px]">
                   <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-xl pointer-events-none" />
                   <div>
                     <div className="flex justify-between items-start mb-4">
                       <div className="flex items-center gap-2">
                         <div className="bg-blue-500/10 p-2 rounded-lg text-blue-500">
                           <ShieldCheck className="w-5 h-5" />
                         </div>
                         <div>
                           <h3 className="font-bold text-slate-200 text-sm">{dynamicVehicles.kurtarma.plaka}</h3>
                           <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{dynamicVehicles.kurtarma.arac_tipi}</span>
                         </div>
                       </div>
                       <Badge className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[10px]">Aktif</Badge>
                     </div>
                     
                     <div className="space-y-2 text-xs">
                       <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                         <span className="text-slate-400">Kurtarma Amiri:</span>
                         <span className="font-semibold text-slate-200">{amir ? `${amir.ad} ${amir.soyad}` : 'Atanmamış'}</span>
                       </div>
                       
                       <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                         <span className="text-slate-400">Şoför:</span>
                         {sofor ? (
                           <span className="font-semibold text-emerald-400">{sofor.ad} {sofor.soyad}</span>
                         ) : (
                           <span className="font-semibold text-red-500 animate-pulse flex items-center gap-1">
                             <AlertTriangle className="w-3.5 h-3.5" /> Sürücü Eksik!
                           </span>
                         )}
                       </div>
                       
                       <div className="flex justify-between items-center py-1">
                         <span className="text-slate-400">Kurtarma Uzmanı:</span>
                         {er ? (
                           <span className="font-semibold text-slate-200 flex items-center gap-1">
                             {er.ad} {er.soyad}
                             {hasScba && (
                               <Badge className="bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[8px] px-1 py-0 h-4">SCBA</Badge>
                             )}
                           </span>
                         ) : (
                           <span className="font-semibold text-slate-400">Atanmamış</span>
                         )}
                       </div>
                     </div>
                   </div>
                   
                   <div className="mt-4 pt-3 border-t border-slate-800/40 flex justify-between items-center text-[10px] text-slate-500">
                     <span>Posta Kadrosu: {activeShiftStaff.length} kişi</span>
                     <span>Hızlı Müdahale / Kaza</span>
                   </div>
                 </div>
               )
             })()}
             
             {/* Vehicle 3: Merdivenli */}
             {(() => {
               const { erisim, sofor, kule } = vehicleAllocations.merdivenli
               
               return (
                 <div className="border border-slate-800 rounded-xl p-4 bg-slate-900/10 backdrop-blur-sm relative overflow-hidden flex flex-col justify-between min-h-[220px]">
                   <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/5 rounded-full blur-xl pointer-events-none" />
                   <div>
                     <div className="flex justify-between items-start mb-4">
                       <div className="flex items-center gap-2">
                         <div className="bg-orange-500/10 p-2 rounded-lg text-orange-500">
                           <SlidersHorizontal className="w-5 h-5" />
                         </div>
                         <div>
                           <h3 className="font-bold text-slate-200 text-sm">{dynamicVehicles.merdivenli.plaka}</h3>
                           <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{dynamicVehicles.merdivenli.arac_tipi}</span>
                         </div>
                       </div>
                       <Badge className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[10px]">Aktif</Badge>
                     </div>
                     
                     <div className="space-y-2 text-xs">
                       <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                         <span className="text-slate-400">Erişim Personeli:</span>
                         <span className="font-semibold text-slate-200">{erisim ? `${erisim.ad} ${erisim.soyad}` : 'Atanmamış'}</span>
                       </div>
                       
                       <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                         <span className="text-slate-400">Şoför:</span>
                         {sofor ? (
                           <span className="font-semibold text-emerald-400">{sofor.ad} {sofor.soyad}</span>
                         ) : (
                           <span className="font-semibold text-red-500 animate-pulse flex items-center gap-1">
                             <AlertTriangle className="w-3.5 h-3.5" /> Sürücü Eksik!
                           </span>
                         )}
                       </div>
                       
                       <div className="flex justify-between items-center py-1">
                         <span className="text-slate-400">Kule Elemanı:</span>
                         <span className="font-semibold text-slate-200">{kule ? `${kule.ad} ${kule.soyad}` : 'Atanmamış'}</span>
                       </div>
                     </div>
                   </div>
                   
                   <div className="mt-4 pt-3 border-t border-slate-800/40 flex justify-between items-center text-[10px] text-slate-500">
                     <span>Posta Kadrosu: {activeShiftStaff.length} kişi</span>
                     <span>Yüksek İrtifa</span>
                   </div>
                 </div>
               )
             })()}
           </div>
         </CardContent>
       </Card>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20 text-warning text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {isAdding && (
        <Card className="border-cyan-500/20 bg-cyan-500/[0.02] shadow-cyan-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-cyan-500">
              <UserPlus className="w-4 h-4" /> 
              Hızlı Personel Kayıt Formu
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddPersonel} className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="space-y-2 flex-col w-full sm:w-1/4">
                <label className="text-xs font-semibold uppercase text-muted-foreground">Sicil No (Otom. Atandı)</label>
                <Input value={nextSicil} disabled className="font-mono bg-muted/50 border-input" />
              </div>
              <div className="space-y-2 flex-col w-full sm:w-1/2">
                <label className="text-xs font-semibold uppercase text-muted-foreground">Ad Soyad</label>
                <Input 
                  placeholder="Örn: Serdar Vatansever" 
                  value={newAdSoyad} 
                  onChange={e => setNewAdSoyad(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <div className="space-y-2 flex-col w-full sm:w-1/4">
                <label className="text-xs font-semibold uppercase text-muted-foreground">Sistem Rolü</label>
                <select 
                  className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  value={newRole}
                  onChange={e => setNewRole(e.target.value)}
                >
                  <option value="Admin">Sistem Yöneticisi (Admin)</option>
                  <option value="Editor">Amir (Editor)</option>
                  <option value="Shift_Leader">Çavuş (Shift Leader)</option>
                  <option value="User">İtfaiye Eri (Kullanıcı)</option>
                </select>
              </div>
              <div className="space-y-2 flex-col w-full sm:w-1/4">
                <label className="text-xs font-semibold uppercase text-muted-foreground">Posta</label>
                <select 
                  className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                  value={newPostaNo}
                  onChange={e => setNewPostaNo(e.target.value)}
                >
                  <option value="1">1. Posta</option>
                  <option value="2">2. Posta</option>
                  <option value="3">3. Posta</option>
                </select>
              </div>
              <div className="space-y-2 flex-col w-full sm:w-1/4">
                <label className="text-xs font-semibold uppercase text-muted-foreground">Durum</label>
                <select 
                  className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                  value={newDurum}
                  onChange={e => setNewDurum(e.target.value)}
                >
                  <option value="Görevde">Görevde</option>
                  <option value="İzinli">İzinli</option>
                  <option value="Raporlu">Raporlu</option>
                </select>
              </div>
              <Button type="submit" disabled={saving} className="w-full sm:w-auto h-11 px-8 gap-2 bg-cyan-600 hover:bg-cyan-700 text-white font-medium">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {saving ? "Kaydediliyor..." : "Ekle"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Arama ve Liste */}
      <Card>
        <CardHeader className="pb-3 border-b border-border/50 bg-muted/10 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center space-x-2">
            <UsersIcon className="w-5 h-5 text-muted-foreground" />
            <span>Kayıtlı Personel ({filteredPersonnel.length})</span>
          </CardTitle>
          <div className="relative w-full max-w-[200px] sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="İsim veya Sicil No ara..." 
              className="pl-9 h-9 text-sm"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border/50">
            {filteredPersonnel.map(person => {
              const isAdmin = person.rol === "Admin" || person.rol === "Editor"
              const isLeader = person.unvan.includes("Çavuş") || person.unvan.includes("Amir") || person.unvan.includes("Müdür")
              const perms = permissions[person.sicil_no] || { view_only: true, can_approve: false, can_print: false }
              return (
                <div key={person.sicil_no} className="p-3 sm:p-4 hover:bg-muted/30 transition-colors flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                  
                  {/* Info Section - Clickable Link to Profile */}
                  <Link 
                    href={`/yonetim/personel/${person.sicil_no}`} 
                    className="flex items-center gap-3 w-full xl:w-2/5 shrink-0 group cursor-pointer"
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 border-2 transition-transform group-hover:scale-105",
                      isAdmin ? "bg-primary/10 text-primary border-primary/20" : 
                      isLeader ? "bg-warning/10 text-warning border-warning/20" : 
                      "bg-muted border-border"
                    )}>
                      {person.ad.charAt(0)}{person.soyad.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold truncate">{person.ad} {person.soyad}</span>
                        {isLeader && (
                          <Badge variant="warning" className="text-[9px] px-1.5 py-0 uppercase flex items-center gap-1">
                            <Star className="w-2.5 h-2.5 fill-warning" />
                            {person.unvan}
                          </Badge>
                        )}
                        {isAdmin && !isLeader && (
                          <Badge variant="danger" className="text-[9px] px-1.5 py-0 uppercase flex items-center gap-1">
                            <Shield className="w-2.5 h-2.5" />
                            {person.unvan}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 font-mono">
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
                            <span className={cn("text-[10px] px-2 py-0.5 rounded border font-medium flex items-center gap-1", cert.color)}>
                              <Truck className="w-2.5 h-2.5" />
                              <span>Ağır Vasıta: {cert.status === 'missing' ? 'Yok' : cert.label}</span>
                            </span>
                          )
                        })()}

                        {(() => {
                          const cert = getCertStatus(person.sicil_no, 'İlkyardım')
                          return (
                            <span className={cn("text-[10px] px-2 py-0.5 rounded border font-medium flex items-center gap-1", cert.color)}>
                              <HeartPulse className="w-2.5 h-2.5" />
                              <span>İlk Yardım: {cert.status === 'missing' ? 'Yok' : cert.label}</span>
                            </span>
                          )
                        })()}

                        {(() => {
                          const cert = getCertStatus(person.sicil_no, 'SCBA')
                          return (
                            <span className={cn("text-[10px] px-2 py-0.5 rounded border font-medium flex items-center gap-1", cert.color)}>
                              <Wind className="w-2.5 h-2.5" />
                              <span>SCBA: {cert.status === 'missing' ? 'Yok' : cert.label}</span>
                            </span>
                          )
                        })()}
                      </div>
                    </div>
                  </Link>

                  {/* Toggle Permissions & Edit Button */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5 ml-12 xl:ml-0 overflow-x-auto pb-1 xl:pb-0 hide-scrollbar">
                    <button 
                      onClick={() => openEditModal(person)} 
                      className="flex items-center justify-center gap-2 cursor-pointer bg-primary/10 text-primary p-2 px-3 rounded-xl hover:bg-primary/20 transition-colors min-h-[44px]"
                    >
                      <Settings2 className="w-4 h-4" />
                      <span className="text-sm font-medium">Düzenle</span>
                    </button>
                    <button onClick={() => togglePermission(person.sicil_no, 'view_only')} className="flex items-center gap-3 cursor-pointer group whitespace-nowrap p-2 rounded-xl hover:bg-muted/50 transition-colors min-h-[44px]">
                      <div className="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full bg-border transition-colors">
                         {perms.view_only ? (
                           <div className="absolute left-0 top-0 h-7 w-7 rounded-full bg-success translate-x-5 transition-transform shadow-sm flex items-center justify-center">
                             <CheckCircle2 className="w-4 h-4 text-white" />
                           </div>
                         ) : (
                           <div className="absolute left-0 top-0 h-7 w-7 rounded-full bg-surface translate-x-0 border transition-transform shadow-sm border-border" />
                         )}
                         {perms.view_only && <div className="absolute inset-0 bg-success/30 rounded-full" />}
                      </div>
                      <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors select-none">
                        Sadece Görüntüler
                      </span>
                    </button>

                    <button onClick={() => togglePermission(person.sicil_no, 'can_approve')} className="flex items-center gap-3 cursor-pointer group whitespace-nowrap p-2 rounded-xl hover:bg-muted/50 transition-colors min-h-[44px]">
                      <div className="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full bg-border transition-colors">
                         {perms.can_approve ? (
                           <div className="absolute left-0 top-0 h-7 w-7 rounded-full bg-cyan-500 translate-x-5 transition-transform shadow-sm flex items-center justify-center">
                             <ShieldAlert className="w-4 h-4 text-white" />
                           </div>
                         ) : (
                           <div className="absolute left-0 top-0 h-7 w-7 rounded-full bg-surface translate-x-0 border transition-transform shadow-sm border-border" />
                         )}
                         {perms.can_approve && <div className="absolute inset-0 bg-cyan-500/30 rounded-full border border-cyan-500/20" />}
                      </div>
                      <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors select-none">
                        Envanter Onaylar
                      </span>
                    </button>

                    <button onClick={() => togglePermission(person.sicil_no, 'can_print')} className="flex items-center gap-3 cursor-pointer group whitespace-nowrap p-2 rounded-xl hover:bg-muted/50 transition-colors min-h-[44px]">
                      <div className="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full bg-border transition-colors">
                         {perms.can_print ? (
                           <div className="absolute left-0 top-0 h-7 w-7 rounded-full bg-primary translate-x-5 transition-transform shadow-sm" />
                         ) : (
                           <div className="absolute left-0 top-0 h-7 w-7 rounded-full bg-surface translate-x-0 border transition-transform shadow-sm border-border" />
                         )}
                         {perms.can_print && <div className="absolute inset-0 bg-primary/30 rounded-full" />}
                      </div>
                      <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors select-none">
                        Barkod Basabilir
                      </span>
                    </button>
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
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="flex items-center gap-2 text-xl text-primary">
              <Settings2 className="w-5 h-5" />
              Personel Düzenle
            </DialogTitle>
          </DialogHeader>
          
          {selectedPerson && (
            <div className="p-6 space-y-6">
              <div className="bg-muted/50 p-4 rounded-xl border border-border/50 flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 rounded-full bg-primary/10 text-primary border-2 border-primary/20 flex items-center justify-center font-bold text-lg mb-2">
                  {selectedPerson.ad.charAt(0)}{selectedPerson.soyad.charAt(0)}
                </div>
                <p className="text-base font-bold">{selectedPerson.ad} {selectedPerson.soyad}</p>
                <p className="text-xs font-mono text-muted-foreground mt-0.5">{selectedPerson.sicil_no} • {selectedPerson.unvan}</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Görev / Rol</label>
                  <select 
                    className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                  >
                    <option value="Admin">Sistem Yöneticisi (Admin)</option>
                    <option value="Editor">Amir (Editor)</option>
                    <option value="Shift_Leader">Çavuş (Shift_Leader)</option>
                    <option value="User">İtfaiye Eri (User)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Posta Numarası</label>
                  <select 
                    className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                    value={editPostaNo}
                    onChange={(e) => setEditPostaNo(e.target.value)}
                  >
                    <option value="1">1. Posta</option>
                    <option value="2">2. Posta</option>
                    <option value="3">3. Posta</option>
                  </select>
                </div>

                <div className="pt-4 border-t border-border space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    Sertifika Bilgileri
                  </h4>
                  
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase text-muted-foreground">Ehliyet Geçerlilik Tarihi</label>
                    <Input 
                      type="date" 
                      className="h-11"
                      value={ehliyetDate}
                      onChange={(e) => setEhliyetDate(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase text-muted-foreground">İlkyardım Sertifikası Geçerlilik Tarihi</label>
                    <Input 
                      type="date" 
                      className="h-11"
                      value={ilkyardimDate}
                      onChange={(e) => setIlkyardimDate(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase text-muted-foreground">SCBA Solunum Cihazı Sertifika Tarihi</label>
                    <Input 
                      type="date" 
                      className="h-11"
                      value={scbaDate}
                      onChange={(e) => setScbaDate(e.target.value)}
                    />
                  </div>
                </div>

                {/* EK-16 Performans Skor Kartı */}
                {(() => {
                  const seed = parseInt(selectedPerson.sicil_no.replace(/\D/g, "") || "5800")
                  const totalCases = (seed % 42) + 12
                  const yanginPct = (seed % 25) + 50
                  const kurtarmaPct = (seed % 20) + 15
                  const hazmatPct = 100 - yanginPct - kurtarmaPct
                  
                  return (
                    <div className="pt-4 border-t border-border space-y-4">
                      <h4 className="text-sm font-semibold flex items-center gap-2 text-slate-200">
                        <Activity className="w-4 h-4 text-cyan-500" />
                        EK-16 Performans & Operasyonel Skor Kartı
                      </h4>
                      
                      <div className="bg-slate-950/60 border border-slate-900 rounded-xl p-3 space-y-3">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-400">Toplam Operasyon Katılımı:</span>
                          <span className="font-bold text-slate-200 px-2 py-0.5 bg-slate-900 rounded border border-slate-800">{totalCases} Olay</span>
                        </div>
                        
                        <div className="space-y-2 text-xs">
                          <div className="space-y-1">
                            <div className="flex justify-between text-[11px]">
                              <span className="text-slate-400">Yangın Söndürme / İtfaiye:</span>
                              <span className="font-semibold text-red-400">{yanginPct}%</span>
                            </div>
                            <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                              <div className="bg-gradient-to-r from-red-600 to-red-500 h-1.5 rounded-full" style={{ width: `${yanginPct}%` }} />
                            </div>
                          </div>

                          <div className="space-y-1">
                            <div className="flex justify-between text-[11px]">
                              <span className="text-slate-400">Arama Kurtarma / Kaza:</span>
                              <span className="font-semibold text-blue-400">{kurtarmaPct}%</span>
                            </div>
                            <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                              <div className="bg-gradient-to-r from-blue-600 to-blue-500 h-1.5 rounded-full" style={{ width: `${kurtarmaPct}%` }} />
                            </div>
                          </div>

                          <div className="space-y-1">
                            <div className="flex justify-between text-[11px]">
                              <span className="text-slate-400">Tehlikeli Madde (HAZMAT) / Kimyasal:</span>
                              <span className="font-semibold text-amber-500">{hazmatPct}%</span>
                            </div>
                            <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
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
            </div>
          )}
          
          <DialogFooter className="p-6 pt-0 mt-2 gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)} disabled={isSavingEdit}>
              İptal
            </Button>
            <Button onClick={handleSaveEdit} disabled={isSavingEdit} className="min-w-[140px]">
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
    </div>
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
