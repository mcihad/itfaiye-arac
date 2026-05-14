"use client"

import { useState, useMemo, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { Search, Plus, UserPlus, Shield, ShieldAlert, Key, Loader2, Star, CheckCircle2, SlidersHorizontal, Settings2, AlertTriangle, RefreshCcw, ShieldCheck } from "lucide-react"
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

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [selectedPerson, setSelectedPerson] = useState<Personnel | null>(null)
  const [editRole, setEditRole] = useState("User")
  const [editPostaNo, setEditPostaNo] = useState("1")
  const [ehliyetDate, setEhliyetDate] = useState("")
  const [ilkyardimDate, setIlkyardimDate] = useState("")
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
    
    setEhliyetDate(ehliyet?.gecerlilik_tarihi || "")
    setIlkyardimDate(ilkyardim?.gecerlilik_tarihi || "")

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

      await fetchPersonnel() // Refresh all data
      setIsEditModalOpen(false)
    } catch (err) {
      console.error("Personel güncelleme hatası:", err)
      setError("Güncelleme sırasında hata oluştu.")
    } finally {
      setIsSavingEdit(false)
    }
  }

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
                  
                  {/* Info Section - Clickable for Edit Modal */}
                  <div 
                    onClick={() => openEditModal(person)} 
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
                    </div>
                  </div>

                  {/* Toggle Permissions */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5 ml-12 xl:ml-0 overflow-x-auto pb-1 xl:pb-0 hide-scrollbar">
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
                    <option value="Er">Er (Er)</option>
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
                </div>
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
