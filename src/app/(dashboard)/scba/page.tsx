"use client"
import { useState, useEffect, useCallback, useMemo } from "react"
import { api, unwrap } from "@/lib/api"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { useAuthStore } from "@/lib/authStore"
import { ScanBarcode, Activity, Wind, AlertTriangle, Plus, Battery, Loader2, Save, Pencil, Trash2, X } from "lucide-react"
import { calculateRemainingDays } from "@/lib/utils"

interface SCBACylinder {
  id: string
  seri_no: string
  marka: string
  kapasite_lt: number
  basinc_bar: number
  uretim_tarihi: string
  son_hidrostatik_test: string
  sonraki_test_tarihi: string
  durum: string
  guncel_basinc: number
}

export default function SCBAModulePage() {
  const { user } = useAuthStore()
  const isAdminOrEditor = user?.rol === "Admin" || user?.rol === "Editor" || user?.rol === "Shift_Leader"
  
  const [cylinders, setCylinders] = useState<SCBACylinder[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  
  // Fill Modal State
  const [selectedCyl, setSelectedCyl] = useState<SCBACylinder | null>(null)
  const [fillBasinc, setFillBasinc] = useState("")
  const [fillNotlar, setFillNotlar] = useState("")
  const [savingFill, setSavingFill] = useState(false)

  // Add Modal State
  const [showAddForm, setShowAddForm] = useState(false)
  const [newCyl, setNewCyl] = useState({
    seri_no: "", marka: "", kapasite_lt: "6.8", basinc_bar: "300", 
    uretim_tarihi: "", son_hidrostatik_test: "", sonraki_test_tarihi: ""
  })
  const [savingNew, setSavingNew] = useState(false)

  // Edit State
  const [editingCyl, setEditingCyl] = useState<SCBACylinder | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)

  // Delete State
  const [deletingCyl, setDeletingCyl] = useState<SCBACylinder | null>(null)
  const [deletingState, setDeletingState] = useState(false)

  const fetchCylinders = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await api.from('scba_cylinders').select('*').order('created_at', { ascending: false })
      if (error) throw error
      if (data) setCylinders(data)
    } catch (err) {
      console.error('SCBA veri çekme hatası:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchCylinders() }, [fetchCylinders])

  const handleCalculateNextTest = (dateStr: string) => {
    if (!dateStr) return
    const d = new Date(dateStr)
    d.setFullYear(d.getFullYear() + 5) // Default 5 years
    setNewCyl(prev => ({ ...prev, son_hidrostatik_test: dateStr, sonraki_test_tarihi: d.toISOString().split('T')[0] }))
  }

  const handleAddNew = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingNew(true)
    const { error } = await api.insert('scba_cylinders', {
      seri_no: newCyl.seri_no,
      marka: newCyl.marka,
      kapasite_lt: parseFloat(newCyl.kapasite_lt),
      basinc_bar: parseInt(newCyl.basinc_bar),
      uretim_tarihi: newCyl.uretim_tarihi || null,
      son_hidrostatik_test: newCyl.son_hidrostatik_test,
      sonraki_test_tarihi: newCyl.sonraki_test_tarihi,
      guncel_basinc: 0
    })

    if (error) {
      alert("Tüp eklenirken hata: " + error.message)
    } else {
      setShowAddForm(false)
      fetchCylinders()
    }
    setSavingNew(false)
  }

  const handleFillSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCyl || !fillBasinc) return
    setSavingFill(true)
    // Insert Fill Log
    const { error: logError } = await api.insert('scba_fill_logs', {
      cylinder_id: selectedCyl.id,
      dolduran_sicil: user?.sicilNo,
      basilan_bar: parseInt(fillBasinc),
      notlar: fillNotlar || null
    })

    if (!logError) {
      // Update cylinder current pressure
      const upd = await api.update('scba_cylinders', { guncel_basinc: parseInt(fillBasinc) }, { id: selectedCyl.id })
      if (upd.error) {
        alert(`Dolum kaydedildi ancak tüpün güncel basıncı GÜNCELLENEMEDİ: ${upd.error}`)
      }
      setSelectedCyl(null)
      setFillBasinc("")
      setFillNotlar("")
      fetchCylinders()
    } else {
      alert("Dolum kaydedilemedi.")
    }
    setSavingFill(false)
  }

  const handleCalculateEditNextTest = (dateStr: string) => {
    if (!dateStr || !editingCyl) return
    const d = new Date(dateStr)
    d.setFullYear(d.getFullYear() + 5) // Default 5 years
    setEditingCyl(prev => prev ? ({ ...prev, son_hidrostatik_test: dateStr, sonraki_test_tarihi: d.toISOString().split('T')[0] }) : null)
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingCyl) return
    setSavingEdit(true)
    const { error } = await api.update('scba_cylinders', {
      seri_no: editingCyl.seri_no,
      marka: editingCyl.marka,
      kapasite_lt: editingCyl.kapasite_lt,
      basinc_bar: editingCyl.basinc_bar,
      uretim_tarihi: editingCyl.uretim_tarihi || null,
      son_hidrostatik_test: editingCyl.son_hidrostatik_test,
      sonraki_test_tarihi: editingCyl.sonraki_test_tarihi,
      guncel_basinc: editingCyl.guncel_basinc
    }, { id: editingCyl.id })

    if (error) {
      alert("Tüp güncellenirken hata: " + error.message)
    } else {
      setEditingCyl(null)
      fetchCylinders()
    }
    setSavingEdit(false)
  }

  const handleDeleteConfirm = async () => {
    if (!deletingCyl) return
    setDeletingState(true)
    try {
      // First delete fill logs associated with this cylinder
      unwrap(await api.remove('scba_fill_logs', { cylinder_id: deletingCyl.id }))
      
      // Then delete the cylinder
      const { error } = await api.remove('scba_cylinders', { id: deletingCyl.id })
      
      if (error) {
        alert("Tüp silinirken hata: " + error.message)
      } else {
        setDeletingCyl(null)
        fetchCylinders()
      }
    } catch (err: any) {
      alert("Bir hata oluştu: " + err.message)
    } finally {
      setDeletingState(false)
    }
  }

  // Filter & Status Calculation
  const filteredCylinders = useMemo(() => {
    if (!searchQuery) return cylinders
    const q = searchQuery.toLowerCase()
    return cylinders.filter(c => c.seri_no.toLowerCase().includes(q) || c.marka.toLowerCase().includes(q))
  }, [cylinders, searchQuery])

  // Is test close? (6 months = ~180 days)
  const isTestWarning = (nextTestDate: string) => {
    const res = calculateRemainingDays(nextTestDate)
    return res.days !== null && res.days > 0 && res.days <= 180
  }

  const isTestExpired = (nextTestDate: string) => {
    const res = calculateRemainingDays(nextTestDate)
    return res.days !== null && res.days <= 0
  }

  const warningCount = cylinders.filter(c => isTestWarning(c.sonraki_test_tarihi)).length
  const expiredCount = cylinders.filter(c => isTestExpired(c.sonraki_test_tarihi)).length

  return (
    <div className="min-h-screen flex flex-col overflow-y-auto pb-[calc(8rem+env(safe-area-inset-bottom))] space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">SCBA İstasyon Takibi</h1>
          <p className="text-muted-foreground text-sm mt-1">Temiz hava solunum cihazları (oksijen tüpleri) test ve dolum yönetimi.</p>
        </div>
        {isAdminOrEditor && (
          <Button onClick={() => setShowAddForm(!showAddForm)} className="bg-cyan-600 hover:bg-cyan-700">
            {showAddForm ? "İptal" : <><Plus className="w-4 h-4 mr-2" /> Yeni Tüp Kaydı</>}
          </Button>
        )}
      </div>

      {/* DASHBOARD SUMMARY */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-cyan-500/10 to-transparent border-cyan-500/20">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-4 bg-cyan-500/20 text-cyan-600 rounded-xl"><Wind className="w-8 h-8" /></div>
            <div>
              <p className="text-3xl font-bold">{cylinders.length}</p>
              <p className="text-sm font-medium text-muted-foreground">Kayıtlı SCBA Tüpü</p>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-warning/10 to-transparent border-warning/20">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-4 bg-warning/20 text-warning rounded-xl"><AlertTriangle className="w-8 h-8" /></div>
            <div>
              <p className="text-3xl font-bold">{warningCount}</p>
              <p className="text-sm font-medium text-muted-foreground">Testi Yaklaşanlar (&lt; 6 Ay)</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-danger/10 to-transparent border-danger/20">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-4 bg-danger/20 text-danger rounded-xl"><Activity className="w-8 h-8" /></div>
            <div>
              <p className="text-3xl font-bold">{expiredCount}</p>
              <p className="text-sm font-medium text-muted-foreground">Test Tarihi Geçmiş (Risk)</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {showAddForm && isAdminOrEditor && (
        <Card className="border-cyan-500/30">
          <CardHeader className="border-b bg-muted/20">
            <CardTitle className="text-lg">Yeni SCBA Tüpü Envantere Ekle</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleAddNew} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                 <label className="text-xs font-semibold text-muted-foreground">Seri No / Barkod</label>
                 <Input required value={newCyl.seri_no} onChange={e => setNewCyl({...newCyl, seri_no: e.target.value})} placeholder="Örn: SCBA-10023" />
              </div>
              <div className="space-y-2">
                 <label className="text-xs font-semibold text-muted-foreground">Marka / Model</label>
                 <Input required value={newCyl.marka} onChange={e => setNewCyl({...newCyl, marka: e.target.value})} placeholder="Örn: Dräger" />
              </div>
              <div className="space-y-2">
                 <label className="text-xs font-semibold text-muted-foreground">Kapasite (Litre)</label>
                 <Input type="number" step="0.1" required value={newCyl.kapasite_lt} onChange={e => setNewCyl({...newCyl, kapasite_lt: e.target.value})} />
              </div>
              <div className="space-y-2">
                 <label className="text-xs font-semibold text-muted-foreground">Maks Basınç (Bar)</label>
                 <Input type="number" required value={newCyl.basinc_bar} onChange={e => setNewCyl({...newCyl, basinc_bar: e.target.value})} />
              </div>
              <div className="space-y-2">
                 <label className="text-xs font-semibold text-muted-foreground">Son Hidrostatik Test</label>
                 <Input type="date" required value={newCyl.son_hidrostatik_test} onChange={e => handleCalculateNextTest(e.target.value)} />
              </div>
              <div className="space-y-2">
                 <label className="text-xs font-semibold text-muted-foreground">Sonraki Test (Otomatik 5 Yıl)</label>
                 <Input type="date" required value={newCyl.sonraki_test_tarihi} onChange={e => setNewCyl({...newCyl, sonraki_test_tarihi: e.target.value})} />
              </div>
              <div className="col-span-1 lg:col-span-2 flex items-end">
                <Button type="submit" disabled={savingNew} className="w-full">
                  {savingNew ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                  Envantere Kaydet
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* SEARCH AND SCAN */}
      <div className="flex gap-2 relative max-w-xl">
        <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <Input 
          autoFocus
          className="pl-10 h-12 text-lg shadow-sm"
          placeholder="Barkod okutun veya Seri No arayın..." 
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="py-12 flex justify-center"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredCylinders.map(cyl => {
             const expired = isTestExpired(cyl.sonraki_test_tarihi)
             const warning = !expired && isTestWarning(cyl.sonraki_test_tarihi)
             const pressurePct = (cyl.guncel_basinc / cyl.basinc_bar) * 100
             const rem = calculateRemainingDays(cyl.sonraki_test_tarihi)
             
             return (
               <Card key={cyl.id} className={`overflow-hidden border-l-4 bg-slate-950/75 backdrop-blur-lg border border-slate-800/60 shadow-[0_4px_30px_rgba(0,0,0,0.4)] ${expired ? 'border-l-danger bg-danger/5' : warning ? 'border-l-warning' : 'border-l-success'}`}>
                 <CardContent className="p-5">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-lg font-mono text-zinc-100 uppercase tracking-wider">{cyl.seri_no}</h3>
                          {isAdminOrEditor && (
                            <div className="flex items-center gap-1">
                              <button 
                                onClick={() => setEditingCyl(cyl)} 
                                className="p-1 text-slate-400 hover:text-cyan-400 rounded transition-all active:scale-95"
                                title="Düzenle"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={() => setDeletingCyl(cyl)} 
                                className="p-1 text-slate-400 hover:text-red-400 rounded transition-all active:scale-95"
                                title="Sil"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{cyl.marka} — {cyl.kapasite_lt}L / {cyl.basinc_bar} Bar</p>
                      </div>
                      {expired ? <Badge className="bg-red-950/30 text-red-400 border border-red-500/30 shadow-[0_0_10px_rgba(239,68,68,0.05)]">TEST GEÇMİŞ!</Badge> : warning ? <Badge className="bg-amber-950/30 text-amber-400 border border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.05)]">Test Yaklaşıyor</Badge> : <Badge className="bg-emerald-950/30 text-emerald-400 border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.05)]">Test Geçerli</Badge>}
                    </div>

                   <div className="grid grid-cols-2 gap-4 text-sm mb-4 bg-background p-3 rounded-lg border">
                     <div>
                       <p className="text-muted-foreground text-xs uppercase font-semibold">Son Test</p>
                       <p className="font-medium">{new Date(cyl.son_hidrostatik_test).toLocaleDateString("tr-TR")}</p>
                     </div>
                     <div>
                       <p className={`text-xs uppercase font-semibold ${expired ? 'text-danger' : 'text-muted-foreground'}`}>Sonraki Test</p>
                       <p className={`font-bold ${expired ? 'text-danger' : ''}`}>{new Date(cyl.sonraki_test_tarihi).toLocaleDateString("tr-TR")}</p>
                       {rem.days !== null && (
                         rem.days > 180 ? (
                           <p className="text-xs text-emerald-400 mt-1">⏳ {rem.days} gün kaldı</p>
                         ) : rem.days > 0 ? (
                           <p className="text-xs text-amber-500 font-semibold mt-1">⚠️ {rem.days} gün kaldı - Yenileme Yaklaştı</p>
                         ) : (
                           <p className="text-xs text-rose-500 animate-pulse font-bold mt-1">🚨 SÜRESİ GEÇTİ - KULLANIM DIŞI</p>
                         )
                       )}
                     </div>
                   </div>

                   {/* Pressure Indicator */}
                   <div className="space-y-1.5 mb-4">
                     <div className="flex justify-between text-xs font-semibold">
                       <span className="text-muted-foreground flex items-center gap-1"><Battery className="w-3 h-3" /> Güncel Basınç</span>
                       <span>{cyl.guncel_basinc} Bar</span>
                     </div>
                     <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                       <div 
                         className={`h-full ${pressurePct > 80 ? 'bg-success' : pressurePct > 30 ? 'bg-warning' : 'bg-danger'}`} 
                         style={{ width: `${Math.min(pressurePct, 100)}%` }} 
                       />
                     </div>
                   </div>

                   {selectedCyl?.id === cyl.id ? (
                     <div className="bg-background border-2 p-4 rounded-xl space-y-3 mt-4">
                       <h4 className="font-semibold">Dolum Kaydı Gir</h4>
                       <Input type="number" inputMode="numeric" placeholder="Basılan Bar Değeri..." value={fillBasinc} onChange={e => setFillBasinc(e.target.value)} />
                       <Input placeholder="Ek Notlar (İsteğe bağlı)" value={fillNotlar} onChange={e => setFillNotlar(e.target.value)} />
                       <div className="flex flex-col sm:flex-row justify-end gap-2">
                         <Button variant="ghost" onClick={() => setSelectedCyl(null)}>İptal</Button>
                         <Button onClick={handleFillSubmit} disabled={savingFill} className="bg-success hover:bg-success/90 text-white">
                           {savingFill ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />} Kaydet
                         </Button>
                       </div>
                     </div>
                   ) : (
                     <Button 
                       variant="outline" 
                       className="w-full mt-3 min-h-[52px] transition-all duration-200 active:scale-[0.97] ease-[cubic-bezier(0.4,0,0.2,1)]" 
                       disabled={expired && !isAdminOrEditor} 
                       onClick={() => setSelectedCyl(cyl)}
                     >
                       <Activity className="w-5 h-5 mr-2" />
                       Yeni Dolum / Basınç Gir
                     </Button>
                   )}
                 </CardContent>
               </Card>
             )
          })}
          {filteredCylinders.length === 0 && (
             <div className="col-span-full py-12 text-center border-2 border-dashed rounded-xl text-muted-foreground">
               {searchQuery ? "Arama kriterine uygun tüp bulunamadı." : "Sistemde henüz kayıtlı SCBA tüpü bulunmuyor."}
             </div>
          )}
        </div>
      )}

      {/* SCBA Cylinder Edit Modal */}
      {editingCyl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))] pl-[calc(1rem+env(safe-area-inset-left))] pr-[calc(1rem+env(safe-area-inset-right))] bg-slate-950/85 backdrop-blur-md overflow-x-hidden overflow-y-auto box-border animate-in fade-in duration-200">
          <Card className="w-full max-w-md bg-slate-900/95 border border-cyan-500/25 p-6 rounded-xl shadow-2xl flex flex-col text-slate-100 overflow-y-auto max-h-[calc(100vh-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] my-auto box-border scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Pencil className="w-5 h-5 text-cyan-400" /> SCBA Tüp Düzenle
              </h3>
              <button 
                onClick={() => setEditingCyl(null)} 
                className="p-1 text-slate-400 hover:text-white rounded-lg bg-slate-950 border border-slate-800 transition-all cursor-pointer"
                title="Kapat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400">Seri No / Barkod</label>
                <Input required value={editingCyl.seri_no} onChange={e => setEditingCyl({...editingCyl, seri_no: e.target.value})} className="h-10 bg-slate-950/60 border-slate-800 focus:border-cyan-500" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400">Marka / Model</label>
                <Input required value={editingCyl.marka} onChange={e => setEditingCyl({...editingCyl, marka: e.target.value})} className="h-10 bg-slate-950/60 border-slate-800 focus:border-cyan-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-400">Kapasite (Litre)</label>
                  <Input type="number" step="0.1" required value={editingCyl.kapasite_lt} onChange={e => setEditingCyl({...editingCyl, kapasite_lt: parseFloat(e.target.value)})} className="h-10 bg-slate-950/60 border-slate-800 focus:border-cyan-500" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-400">Maks Basınç (Bar)</label>
                  <Input type="number" required value={editingCyl.basinc_bar} onChange={e => setEditingCyl({...editingCyl, basinc_bar: parseInt(e.target.value)})} className="h-10 bg-slate-950/60 border-slate-800 focus:border-cyan-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-400">Güncel Basınç (Bar)</label>
                  <Input type="number" required value={editingCyl.guncel_basinc} onChange={e => setEditingCyl({...editingCyl, guncel_basinc: parseInt(e.target.value)})} className="h-10 bg-slate-950/60 border-slate-800 focus:border-cyan-500" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-400">Son Hidrostatik Test</label>
                  <Input type="date" required value={editingCyl.son_hidrostatik_test ? editingCyl.son_hidrostatik_test.split('T')[0] : ''} onChange={e => handleCalculateEditNextTest(e.target.value)} className="h-10 bg-slate-950/60 border-slate-800 focus:border-cyan-500" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400">Sonraki Test Tarihi</label>
                <Input type="date" required value={editingCyl.sonraki_test_tarihi ? editingCyl.sonraki_test_tarihi.split('T')[0] : ''} onChange={e => setEditingCyl({...editingCyl, sonraki_test_tarihi: e.target.value})} className="h-10 bg-slate-950/60 border-slate-800 focus:border-cyan-500" />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setEditingCyl(null)}>İptal</Button>
                <Button type="submit" disabled={savingEdit} className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold px-5">
                  {savingEdit ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />} Güncelle
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* SCBA Cylinder Delete Confirmation Modal */}
      {deletingCyl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))] pl-[calc(1rem+env(safe-area-inset-left))] pr-[calc(1rem+env(safe-area-inset-right))] bg-slate-950/85 backdrop-blur-md overflow-x-hidden overflow-y-auto box-border animate-in fade-in duration-200">
          <Card className="w-full max-w-sm bg-slate-900/95 border border-red-500/25 p-6 rounded-xl shadow-2xl flex flex-col text-slate-100 my-auto box-border animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-red-500 mb-4">
              <div className="p-2 bg-red-500/10 rounded-lg"><AlertTriangle className="w-6 h-6" /></div>
              <h3 className="text-lg font-bold text-white">SCBA Tüpünü Sil</h3>
            </div>
            
            <p className="text-sm text-slate-300 leading-relaxed mb-6">
              <strong className="text-white font-mono">{deletingCyl.seri_no}</strong> seri numaralı tüp envanterden kalıcı olarak silinecektir. Bu işlem geri alınamaz. Devam etmek istiyor musunuz?
            </p>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setDeletingCyl(null)}>İptal</Button>
              <Button type="button" onClick={handleDeleteConfirm} disabled={deletingState} className="bg-red-600 hover:bg-red-700 text-white font-bold px-5">
                {deletingState ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />} Evet, Sil
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Mobil Alt Bar Maskeleme Kalkanı - Spacer */}
      <div 
        className="w-full block md:hidden pointer-events-none clear-both" 
        style={{ height: 'calc(7rem + env(safe-area-inset-bottom))' }} 
        aria-hidden="true" 
      />
    </div>
  )
}
