"use client"

import { useState, useEffect } from "react"
import { api } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Badge } from "@/components/ui/Badge"
import { Loader2, Calendar, Users, Plus, CheckCircle2, Search, GraduationCap, Printer, X } from "lucide-react"
import PageGuard from "@/components/PageGuard"
import { Personnel } from "@/types"

export interface Activity {
  id: string;
  faaliyet_turu: string;
  faaliyet_konusu: string;
  baslangic_tarihi: string;
  bitis_tarihi?: string;
  toplam_sure_saat: number;
  katilimci_sayisi: number;
  hedef_kitle?: string;
  aciklama?: string;
  created_at?: string;
}

export interface PersonnelActivity {
  id?: string;
  activity_id: string;
  sicil_no: string;
  rol: string;
  tarih?: string;
  created_at?: string;
}

const FAALIYET_TURLERI = ["Eğitim", "Ziyaret", "Tatbikat"]
const ROLLER = ["Eğitmen", "Katılımcı", "Görevli", "Koordinatör", "Denetmen"]

export default function EgitimlerPage() {
  const [activities, setActivities] = useState<Activity[]>([])
  const [personnelList, setPersonnelList] = useState<Personnel[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [personnelSearch, setPersonnelSearch] = useState("")
  
  // Array of {sicil_no, rol}
  const [selectedPersonnel, setSelectedPersonnel] = useState<{sicil_no: string, rol: string}[]>([])

  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null)
  const [selectedActivityAttendees, setSelectedActivityAttendees] = useState<(Personnel & { rol: string })[]>([])
  const [loadingAttendees, setLoadingAttendees] = useState(false)

  const [formData, setFormData] = useState({
    faaliyet_turu: "Eğitim",
    faaliyet_konusu: "",
    baslangic_tarihi: "",
    bitis_tarihi: "",
    toplam_sure_saat: "",
    katilimci_sayisi: "",
    hedef_kitle: "",
    aciklama: ""
  })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [actRes, perRes] = await Promise.all([
        api.from('activities_and_trainings').select('*').order('baslangic_tarihi', { ascending: false }),
        api.from('personnel').select('*').eq('aktif', true).order('ad', { ascending: true })
      ])
      if (actRes.data) setActivities(actRes.data)
      if (perRes.data) setPersonnelList(perRes.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleViewDetails = async (activity: Activity) => {
    setSelectedActivity(activity)
    setLoadingAttendees(true)
    try {
      const { data, error } = await api.from('personnel_activities')
        .select('*')
        .eq('activity_id', activity.id)

      if (error) throw error

      if (data) {
        // Map sicil_no to full personnel info plus role
        const attendees = data.map((pa: any) => {
          const match = personnelList.find(p => p.sicil_no === pa.sicil_no)
          return {
            sicil_no: pa.sicil_no,
            ad: match?.ad || "Bilinmeyen",
            soyad: match?.soyad || "Personel",
            unvan: match?.unvan || "Er",
            rol: pa.rol || "Katılımcı",
            posta: match?.posta || "",
            posta_no: match?.posta_no || 0,
            durum: match?.durum || "Görevde"
          }
        })
        setSelectedActivityAttendees(attendees)
      } else {
        setSelectedActivityAttendees([])
      }
    } catch (err) {
      console.error("Katılımcılar yüklenirken hata oluştu:", err)
    } finally {
      setLoadingAttendees(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const togglePersonnel = (sicil_no: string) => {
    const existing = selectedPersonnel.find(p => p.sicil_no === sicil_no)
    if (existing) {
      setSelectedPersonnel(selectedPersonnel.filter(p => p.sicil_no !== sicil_no))
    } else {
      setSelectedPersonnel([...selectedPersonnel, { sicil_no, rol: "Katılımcı" }])
    }
  }

  const updatePersonnelRole = (sicil_no: string, newRole: string) => {
    setSelectedPersonnel(selectedPersonnel.map(p => p.sicil_no === sicil_no ? { ...p, rol: newRole } : p))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const payload = {
        ...formData,
        toplam_sure_saat: Number(formData.toplam_sure_saat) || 0,
        katilimci_sayisi: Number(formData.katilimci_sayisi) || 0,
      }
      
      const { data: actData, error: actErr } = await api.insert('activities_and_trainings', payload)
        
      if (actErr) throw actErr

      if (selectedPersonnel.length > 0) {
        const pivotPayload = selectedPersonnel.map(p => ({
          activity_id: actData.id,
          sicil_no: p.sicil_no,
          rol: p.rol
        }))
        await api.insert('personnel_activities', pivotPayload)
      }

      setIsAdding(false)
      setSelectedPersonnel([])
      setFormData({
        faaliyet_turu: "Eğitim", faaliyet_konusu: "", baslangic_tarihi: "", bitis_tarihi: "",
        toplam_sure_saat: "", katilimci_sayisi: "", hedef_kitle: "", aciklama: ""
      })
      fetchData()
    } catch (error) {
      console.error(error)
      alert("Kayıt sırasında hata oluştu.")
    } finally {
      setSubmitting(false)
    }
  }

  const filteredPersonnel = personnelList.filter(p => 
    (p.ad + " " + p.soyad).toLowerCase().includes(personnelSearch.toLowerCase()) ||
    p.sicil_no.toLowerCase().includes(personnelSearch.toLowerCase())
  )

  if (loading) {
    return <div className="p-8 text-center animate-pulse flex items-center justify-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Yükleniyor...</div>
  }

  return (
    <PageGuard pageId="egitimler">
      <div className="print:hidden flex flex-col h-full space-y-6 max-w-6xl mx-auto pb-12">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Eğitim ve Faaliyetler</h1>
            <p className="text-muted-foreground text-sm">Kurum içi eğitimler, okul ziyaretleri ve tatbikat kayıtları</p>
          </div>
          {!isAdding && (
            <Button onClick={() => setIsAdding(true)} className="gap-2">
              <Plus className="w-4 h-4" /> Yeni Faaliyet Ekle
            </Button>
          )}
        </div>

        {isAdding ? (
          <Card className="border-border">
            <CardHeader className="bg-surface/30 border-b flex flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2"><GraduationCap className="w-5 h-5 text-primary" /> Yeni Faaliyet / Eğitim Formu</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setIsAdding(false)}>İptal</Button>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-8">
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Faaliyet Türü *</label>
                    <select name="faaliyet_turu" value={formData.faaliyet_turu} onChange={handleInputChange} required className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      {FAALIYET_TURLERI.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Faaliyet Konusu *</label>
                    <Input name="faaliyet_konusu" placeholder="Örn: Temel Yangın Eğitimi" value={formData.faaliyet_konusu} onChange={handleInputChange} required />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-4 border rounded-xl bg-surface/30">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Başlangıç Tarihi *</label>
                    <Input type="datetime-local" name="baslangic_tarihi" value={formData.baslangic_tarihi} onChange={handleInputChange} required />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Bitiş Tarihi</label>
                    <Input type="datetime-local" name="bitis_tarihi" value={formData.bitis_tarihi} onChange={handleInputChange} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Toplam Süre (Saat)</label>
                    <Input type="number" step="0.5" min="0" name="toplam_sure_saat" value={formData.toplam_sure_saat} onChange={handleInputChange} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 border rounded-xl bg-surface/30">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Dış Katılımcı / Ziyaretçi Sayısı</label>
                    <Input type="number" min="0" name="katilimci_sayisi" value={formData.katilimci_sayisi} onChange={handleInputChange} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Hedef Kitle / Kurum Adı</label>
                    <Input name="hedef_kitle" placeholder="Örn: Sivas Lisesi Öğrencileri" value={formData.hedef_kitle} onChange={handleInputChange} />
                  </div>
                  <div className="col-span-1 md:col-span-2 space-y-2">
                    <label className="text-sm font-semibold">Açıklama</label>
                    <textarea name="aciklama" rows={3} placeholder="Faaliyet detayları..." value={formData.aciklama} onChange={handleInputChange} className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                  </div>
                </div>

                {/* Personel Atama (Searchable Multi-Select) */}
                <div className="space-y-4 border rounded-xl flex flex-col min-h-[350px]">
                  <div className="p-3 bg-surface border-b flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="font-semibold text-sm">Personel Atama (Çoklu Seçim)</span>
                    <Badge variant="outline">{selectedPersonnel.length} Personel Seçildi</Badge>
                  </div>
                  <div className="p-2 border-b">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input placeholder="İsim veya Sicil No ile Ara..." className="h-9 pl-8 text-sm" value={personnelSearch} onChange={e => setPersonnelSearch(e.target.value)} />
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[400px]">
                    {filteredPersonnel.map(p => {
                      const sel = selectedPersonnel.find(sp => sp.sicil_no === p.sicil_no)
                      const isSelected = !!sel
                      return (
                        <div key={p.sicil_no} className={`p-3 text-sm rounded-lg border transition-all ${isSelected ? 'bg-primary/5 border-primary/40' : 'bg-background hover:bg-surface border-transparent'}`}>
                          <div className="flex items-center justify-between cursor-pointer" onClick={() => togglePersonnel(p.sicil_no)}>
                            <div className="flex items-center gap-2">
                              <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-primary border-primary text-white' : 'border-input'}`}>
                                {isSelected && <CheckCircle2 className="w-3 h-3" />}
                              </div>
                              <span className={isSelected ? 'font-medium text-primary' : ''}>{p.ad} {p.soyad}</span>
                              <span className="text-xs opacity-50 ml-1">({p.unvan})</span>
                            </div>
                          </div>
                          {isSelected && (
                            <div className="mt-3 pl-6">
                              <select 
                                value={sel.rol} 
                                onChange={(e) => updatePersonnelRole(p.sicil_no, e.target.value)}
                                className="h-8 w-full max-w-[200px] rounded-md border border-input bg-background px-2 text-xs"
                              >
                                {ROLLER.map(r => <option key={r} value={r}>{r}</option>)}
                              </select>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={submitting}>
                    {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Kaydediliyor...</> : 'Faaliyeti Kaydet'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {activities.length === 0 ? (
              <div className="text-center p-12 border border-dashed rounded-xl text-muted-foreground bg-surface/50">
                Sistemde henüz bir eğitim veya faaliyet kaydı bulunmamaktadır.
              </div>
            ) : (
              activities.map(act => (
                <Card key={act.id} className="hover:border-primary/50 transition-colors">
                  <CardContent className="p-4 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                        act.faaliyet_turu === 'Tatbikat' ? 'bg-danger/10 text-danger' : 
                        act.faaliyet_turu === 'Eğitim' ? 'bg-blue-500/10 text-blue-500' :
                        'bg-success/10 text-success'
                      }`}>
                        <Calendar className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline">{act.faaliyet_turu}</Badge>
                          <span className="font-semibold text-lg">{act.faaliyet_konusu}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">{act.hedef_kitle}</p>
                        <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-muted-foreground font-mono">
                          <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {new Date(act.baslangic_tarihi).toLocaleString('tr-TR')}</span>
                          {act.toplam_sure_saat > 0 && <span>Süre: {act.toplam_sure_saat} Saat</span>}
                          {act.katilimci_sayisi > 0 && <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {act.katilimci_sayisi} Katılımcı</span>}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex gap-2 items-center shrink-0">
                      <Button variant="outline" size="sm" onClick={() => handleViewDetails(act)}>
                        Detayları Gör
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}
      </div>

      {/* Details Modal */}
      {selectedActivity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 print:hidden">
          <div className="relative w-full max-w-4xl rounded-2xl border border-border bg-surface p-6 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b pb-4 mb-4">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-6 h-6 text-primary animate-pulse" />
                <div>
                  <h2 className="text-xl font-bold tracking-tight">Faaliyet / Eğitim Detayı</h2>
                  <p className="text-xs text-muted-foreground font-mono">ID: {selectedActivity.id}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button 
                  onClick={() => window.print()} 
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-2 shadow-lg shadow-emerald-950/20"
                >
                  <Printer className="w-4 h-4" />
                  <span>Resmi Rapor Yazdır</span>
                </Button>
                <button 
                  onClick={() => { setSelectedActivity(null); setSelectedActivityAttendees([]); }} 
                  className="rounded-full p-2 hover:bg-muted transition-colors border border-transparent hover:border-border"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto grid grid-cols-1 lg:grid-cols-5 gap-6 pr-2 pb-2">
              <div className="lg:col-span-3 space-y-4">
                <div className="p-4 border rounded-xl bg-zinc-950/40 space-y-4">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Faaliyet Konusu</span>
                    <h3 className="text-lg font-bold text-foreground mt-0.5">{selectedActivity.faaliyet_konusu}</h3>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Faaliyet Türü</span>
                      <p className="font-semibold text-primary mt-0.5">{selectedActivity.faaliyet_turu}</p>
                    </div>
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Hedef Kitle / Kurum</span>
                      <p className="font-semibold text-foreground mt-0.5">{selectedActivity.hedef_kitle || "İç Eğitim"}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border/40">
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Başlangıç Tarihi</span>
                      <p className="text-sm font-mono text-foreground mt-0.5">
                        {new Date(selectedActivity.baslangic_tarihi).toLocaleString('tr-TR')}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bitiş Tarihi</span>
                      <p className="text-sm font-mono text-foreground mt-0.5">
                        {selectedActivity.bitis_tarihi ? new Date(selectedActivity.bitis_tarihi).toLocaleString('tr-TR') : "-"}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border/40">
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Toplam Süre</span>
                      <p className="text-sm font-semibold text-foreground mt-0.5">{selectedActivity.toplam_sure_saat} Saat</p>
                    </div>
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dış Katılımcı Sayısı</span>
                      <p className="text-sm font-semibold text-foreground mt-0.5">{selectedActivity.katilimci_sayisi} Kişi</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 border rounded-xl bg-zinc-950/40">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Faaliyet Açıklaması / Notlar</span>
                  <p className="text-sm text-foreground/90 mt-1 whitespace-pre-wrap leading-relaxed">{selectedActivity.aciklama || "Faaliyet ile ilgili herhangi bir açıklama girilmemiştir."}</p>
                </div>
              </div>

              <div className="lg:col-span-2 space-y-4">
                <div className="p-4 border rounded-xl bg-zinc-950/40 h-full flex flex-col min-h-[250px]">
                  <div className="flex items-center justify-between border-b border-border/40 pb-2 mb-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Atanan Personel Listesi</span>
                    <Badge variant="outline">{selectedActivityAttendees.length} Personel</Badge>
                  </div>

                  {loadingAttendees ? (
                    <div className="flex-1 flex items-center justify-center">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    </div>
                  ) : selectedActivityAttendees.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground italic text-center p-4">
                      Seçili faaliyete atanmış personel bulunmamaktadır.
                    </div>
                  ) : (
                    <div className="flex-1 overflow-y-auto space-y-2 max-h-[40vh] pr-1">
                      {selectedActivityAttendees.map((att) => (
                        <div key={att.sicil_no} className="p-2.5 rounded-lg border border-border/60 bg-surface/50 text-xs flex items-center justify-between hover:border-primary/30 transition-all">
                          <div className="space-y-0.5">
                            <p className="font-semibold text-foreground">{att.ad} {att.soyad}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">Sicil: {att.sicil_no} | {att.unvan}</p>
                          </div>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">{att.rol}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Official A4 Printable Layout */}
      {selectedActivity && (
        <div className="hidden print:block text-black bg-white min-h-screen p-[15mm] font-serif print-container print:w-full print:h-auto text-[13px] leading-relaxed">
          {/* Header block with Sivas Logos */}
          <div className="flex items-center justify-between border-b-2 border-black pb-4 mb-6">
            <img src="/logo-belediye.png" alt="Sivas Belediyesi" className="w-[65px] h-[65px] object-contain" />
            <div className="text-center flex-1">
              <h2 className="text-[14px] font-bold tracking-wider leading-tight">T.C.</h2>
              <h1 className="text-[16px] font-extrabold tracking-widest leading-normal">SİVAS BELEDİYE BAŞKANLIĞI</h1>
              <h3 className="text-[13px] font-bold tracking-wider leading-tight">İtfaiye Müdürlüğü</h3>
            </div>
            <img src="/logo-itfaiye.png" alt="Sivas İtfaiyesi" className="w-[65px] h-[65px] object-contain" />
          </div>

          {/* Report Title */}
          <div className="text-center mb-8">
            <h2 className="text-[15px] font-extrabold underline decoration-double underline-offset-4 tracking-widest uppercase">
              {selectedActivity.faaliyet_konusu.toLocaleUpperCase("tr-TR")} {selectedActivity.faaliyet_turu.toLocaleUpperCase("tr-TR")} SONUÇ RAPORU
            </h2>
          </div>

          {/* Details Table */}
          <div className="mb-6">
            <table className="w-full border-collapse border border-black text-[13px]">
              <tbody>
                <tr>
                  <td className="border border-black px-3 py-2 font-bold w-1/3 bg-gray-50 text-left">Eğitimin / Faaliyetin Konusu</td>
                  <td className="border border-black px-3 py-2 w-2/3 text-left">{selectedActivity.faaliyet_konusu}</td>
                </tr>
                <tr>
                  <td className="border border-black px-3 py-2 font-bold bg-gray-50 text-left">Faaliyet Türü</td>
                  <td className="border border-black px-3 py-2 text-left">{selectedActivity.faaliyet_turu}</td>
                </tr>
                <tr>
                  <td className="border border-black px-3 py-2 font-bold bg-gray-50 text-left">Eğitim / Tatbikat Tarihi ve Saati</td>
                  <td className="border border-black px-3 py-2 text-left">
                    {new Date(selectedActivity.baslangic_tarihi).toLocaleString('tr-TR')}
                    {selectedActivity.bitis_tarihi && ` - ${new Date(selectedActivity.bitis_tarihi).toLocaleString('tr-TR')}`}
                  </td>
                </tr>
                <tr>
                  <td className="border border-black px-3 py-2 font-bold bg-gray-50 text-left">Süresi</td>
                  <td className="border border-black px-3 py-2 text-left">{selectedActivity.toplam_sure_saat} Saat</td>
                </tr>
                <tr>
                  <td className="border border-black px-3 py-2 font-bold bg-gray-50 text-left">Eğitim Konumu / Hedef Kitle</td>
                  <td className="border border-black px-3 py-2 text-left">{selectedActivity.hedef_kitle || "Sivas İtfaiye Müdürlüğü"}</td>
                </tr>
                <tr>
                  <td className="border border-black px-3 py-2 font-bold bg-gray-50 text-left">Eğitici Personel</td>
                  <td className="border border-black px-3 py-2 text-left">
                    {selectedActivityAttendees.filter(a => a.rol === "Eğitmen").map(a => `${a.ad} ${a.soyad} (${a.unvan})`).join(", ") || "Sivas İtfaiye Eğitici Personeli"}
                  </td>
                </tr>
                <tr>
                  <td className="border border-black px-3 py-2 font-bold bg-gray-50 text-left">Eğitime Katılım Sayısı</td>
                  <td className="border border-black px-3 py-2 text-left">
                    {selectedActivityAttendees.length > 0 ? `${selectedActivityAttendees.length} Personel` : ""}
                    {selectedActivity.katilimci_sayisi > 0 ? ` + ${selectedActivity.katilimci_sayisi} Dış Katılımcı` : ""}
                  </td>
                </tr>
                <tr>
                  <td className="border border-black px-3 py-2 font-bold bg-gray-50 text-left">Eğitimin İcrası ve Değerlendirmesi</td>
                  <td className="border border-black px-3 py-2 text-left whitespace-pre-wrap leading-relaxed min-h-[60px] align-top">
                    {selectedActivity.aciklama || "Belirtilen eğitim ve tatbikat faaliyeti, program çerçevesinde başarıyla tamamlanmış ve hedeflenen kazanımlar elde edilmiştir."}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Attendees table */}
          <div className="mb-8">
            <h3 className="text-[13px] font-bold mb-2 border-b border-black pb-1 uppercase tracking-wider text-left">KATILIMCI PERSONEL LİSTESİ</h3>
            <table className="w-full border-collapse border border-black text-[12px] text-center">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-black px-2 py-1 font-bold w-12 text-center">S.No</th>
                  <th className="border border-black px-2 py-1 font-bold w-28 text-center">Sicil No</th>
                  <th className="border border-black px-2 py-1 font-bold text-left pl-3">Adı Soyadı</th>
                  <th className="border border-black px-2 py-1 font-bold text-center">Unvanı</th>
                  <th className="border border-black px-2 py-1 font-bold w-36 text-center">İmza Sirküsü Rolü</th>
                </tr>
              </thead>
              <tbody>
                {selectedActivityAttendees.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="border border-black px-3 py-3 text-gray-500 italic">
                      Katılımcı personel kaydı bulunmamaktadır.
                    </td>
                  </tr>
                ) : (
                  selectedActivityAttendees.map((att, idx) => (
                    <tr key={att.sicil_no} className="h-6">
                      <td className="border border-black px-2 py-1 text-center">{idx + 1}</td>
                      <td className="border border-black px-2 py-1 font-mono text-center">{att.sicil_no}</td>
                      <td className="border border-black px-2 py-1 font-bold text-left pl-3">{att.ad} {att.soyad}</td>
                      <td className="border border-black px-2 py-1 text-center">{att.unvan}</td>
                      <td className="border border-black px-2 py-1 text-center">{att.rol}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Formal closure text */}
          <p className="text-[11px] text-gray-800 italic mb-10 leading-snug text-left">
            İşbu eğitim ve faaliyet sonuç raporu, yukarıda belirtilen şartlar dairesinde resmi evrak formatında tanzim edilmiş olup, 
            aşağıdaki yetkililerce imza altına alınarak resmiyete kavuşturulmuştur.
          </p>

          {/* Signature blocks - elegant 3 column layout */}
          <div className="grid grid-cols-3 gap-6 text-center pt-4 border-t border-dashed border-gray-400">
            <div className="flex flex-col justify-between h-[110px]">
              <div>
                <p className="font-bold underline text-[12px]">EĞİTİCİ PERSONEL</p>
                <p className="text-[10px] text-gray-600">İmza</p>
              </div>
              <div className="font-bold text-[12px] leading-tight">
                <p>
                  {selectedActivityAttendees.find(a => a.rol === "Eğitmen") 
                    ? `${selectedActivityAttendees.find(a => a.rol === "Eğitmen")?.ad} ${selectedActivityAttendees.find(a => a.rol === "Eğitmen")?.soyad}`
                    : "........................"}
                </p>
                <p className="text-[10px] text-gray-500 font-normal">
                  {selectedActivityAttendees.find(a => a.rol === "Eğitmen")?.unvan || "Eğitmen"}
                </p>
              </div>
            </div>

            <div className="flex flex-col justify-between h-[110px]">
              <div>
                <p className="font-bold underline text-[12px]">İSTASYON AMİRİ / ÇAVUŞ</p>
                <p className="text-[10px] text-gray-600">İmza</p>
              </div>
              <div className="font-bold text-[12px] leading-tight">
                <p>
                  {selectedActivityAttendees.find(a => a.unvan.includes("Çavuş") || a.unvan.includes("Amir"))
                    ? `${selectedActivityAttendees.find(a => a.unvan.includes("Çavuş") || a.unvan.includes("Amir"))?.ad} ${selectedActivityAttendees.find(a => a.unvan.includes("Çavuş") || a.unvan.includes("Amir"))?.soyad}`
                    : "........................"}
                </p>
                <p className="text-[10px] text-gray-500 font-normal">
                  {selectedActivityAttendees.find(a => a.unvan.includes("Çavuş") || a.unvan.includes("Amir"))?.unvan || "Nöbetçi Amiri / Çavuş"}
                </p>
              </div>
            </div>

            <div className="flex flex-col justify-between h-[110px]">
              <div>
                <p className="font-bold underline text-[12px]">İTFAİYE MÜDÜRÜ</p>
                <p className="text-[10px] text-gray-600">ONAY</p>
              </div>
              <div className="font-bold text-[12px] leading-tight">
                <p>Onur KAYA</p>
                <p className="text-[10px] text-gray-500 font-normal">İtfaiye Müdürü</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global CSS Style Tag for Print Media */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body, html {
            background-color: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
          }
          /* Hide all screen elements by default using visibility */
          body * {
            visibility: hidden !important;
          }
          /* Make the print container and all its children visible */
          .print-container,
          .print-container * {
            visibility: visible !important;
          }
          /* Position the print container at the top left of the printed page */
          .print-container {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background-color: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 15mm !important;
          }
        }
      `}} />
    </PageGuard>
  )
}
