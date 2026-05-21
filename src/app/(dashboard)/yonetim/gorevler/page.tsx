"use client"

import { useState, useEffect, useCallback } from "react"
import { api } from "@/lib/api"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Input } from "@/components/ui/Input"
import { Button } from "@/components/ui/Button"
import { useAuthStore } from "@/lib/authStore"
import { ImageUpload } from "@/components/ui/ImageUpload"
import PageGuard from "@/components/PageGuard"
import {
  CheckSquare,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  Plus,
  X,
  Loader2,
  Save,
  CheckCircle2,
  XCircle,
  ListChecks,
  Trash2,
  Type,
  Hash,
  RefreshCcw,
  Camera,
  Image as ImageIcon
} from "lucide-react"

// ─── Strongly-Typed Interfaces ────────────────────────────────────
interface ChecklistItem {
  id: string;
  soru: string;
  tip: 'boolean' | 'numeric' | 'text' | 'image' | string;
  zorunlu: boolean;
  deger?: any;
}

interface TaskItem {
  id: string;
  plaka: string;
  tip: string;
  checklist: ChecklistItem[];
  durum: string;
  notlar?: string | null;
  atanan: string;
  tarih: string;
  tamamlanma_tarihi?: string | null;
  created_by?: string | null;
}

interface TaskTemplate {
  id: string;
  baslik: string;
  tip: string;
  periyot: string;
  sorular: { id: string; soru: string; tip: string; zorunlu: boolean }[];
  aktif: boolean;
  created_at?: string;
  olusturan_sicil: string | null;
}

interface Vehicle {
  plaka: string;
}

interface Personnel {
  sicil_no: string;
  ad: string;
  soyad: string;
}

// Status Badges mapping
const DURUM_BADGE: Record<string, { label: string; bgClass: string; borderClass: string; textClass: string }> = {
  tamamlandi: { label: "Teslim Alındı", bgClass: "bg-green-950/40", borderClass: "border-green-500/30", textClass: "text-green-400" },
  devam_ediyor: { label: "Devam Ediyor", bgClass: "bg-amber-950/40", borderClass: "border-amber-500/30", textClass: "text-amber-400" },
  beklemede: { label: "Bekliyor", bgClass: "bg-slate-950/40", borderClass: "border-slate-500/30", textClass: "text-slate-400" },
  iptal: { label: "İptal Edildi", bgClass: "bg-red-950/40", borderClass: "border-red-500/30", textClass: "text-red-400" },
}

export default function UnifiedGorevlerPage() {
  const { user } = useAuthStore()
  
  // Role Detection (Müdür / Yönetici)
  const isMudur = user?.rol === 'Admin' || user?.unvan === 'Müdür' || user?.rol?.toLowerCase() === 'admin' || user?.unvan?.toLowerCase() === 'müdür'
  
  // Tab State
  const [activeTab, setActiveTab] = useState<'gorevler' | 'sablonlar'>('gorevler')

  // Shared Data States
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [templates, setTemplates] = useState<TaskTemplate[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [personnel, setPersonnel] = useState<Personnel[]>([])
  const [loading, setLoading] = useState(true)
  
  // --- Tab 1: Gorevler States ---
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState("")
  const [newPlaka, setNewPlaka] = useState("")
  const [newAtanan, setNewAtanan] = useState("")
  const [newNotlar, setNewNotlar] = useState("")
  const [formSaving, setFormSaving] = useState(false)
  const [fillingTaskId, setFillingTaskId] = useState<string | null>(null)
  const [filledValues, setFilledValues] = useState<Record<string, any>>({})

  // --- Tab 2: Sablonlar Builder States ---
  const [isBuilding, setIsBuilding] = useState(false)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [baslik, setBaslik] = useState("")
  const [tplTip, setTplTip] = useState("devir_teslim")
  const [periyot, setPeriyot] = useState("gunluk")
  const [sorular, setSorular] = useState<{ id: string; soru: string; tip: string; zorunlu: boolean }[]>([
    { id: crypto.randomUUID(), soru: "", tip: "boolean", zorunlu: true }
  ])

  const fetchAllData = useCallback(async () => {
    setLoading(true)
    try {
      const fetchOrNull = async (promise: any) => {
        try {
          return await promise
        } catch {
          return { data: null }
        }
      }
      
      const [tasksRes, templatesRes, vRes, pRes] = await Promise.all([
        fetchOrNull(api.from('tasks').select('*').order('created_at', { ascending: false })),
        // If not manager, only fetch active templates, else fetch all to let manager edit/toggle
        fetchOrNull(api.from('task_templates').select('*').order('created_at', { ascending: false })),
        fetchOrNull(api.from('vehicles').select('plaka')),
        fetchOrNull(api.from('personnel').select('sicil_no, ad, soyad').eq('aktif', true)),
      ])

      if (tasksRes.data) setTasks(tasksRes.data as TaskItem[])
      if (templatesRes.data) setTemplates(templatesRes.data as TaskTemplate[])
      if (vRes.data) setVehicles(vRes.data as Vehicle[])
      if (pRes.data) setPersonnel(pRes.data as Personnel[])
    } catch (err) {
      console.error("Data fetch error:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAllData()
  }, [fetchAllData])

  const toggleTaskCollapse = (id: string) => {
    setExpandedId(prev => prev === id ? null : id)
    setFillingTaskId(null)
  }

  // ─── TASK ASSIGNMENT (Müdür Only) ───────────────────────────────────
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPlaka || !newAtanan || !selectedTemplateId) return
    setFormSaving(true)

    const tpl = (templates || []).find(t => t.id === selectedTemplateId)
    if (!tpl) {
      setFormSaving(false)
      return
    }

    // Convert template questions to checklist items with null safety
    const checklist: ChecklistItem[] = (tpl.sorular || []).map((s: any) => ({
      id: s.id || crypto.randomUUID(),
      soru: s.soru || '',
      tip: s.tip || 'boolean',
      zorunlu: !!s.zorunlu,
      deger: null
    }))

    try {
      const { error } = await api.insert('tasks', {
        plaka: newPlaka,
        tip: tpl.baslik || 'Genel Kontrol',
        checklist,
        durum: 'beklemede',
        notlar: newNotlar || null,
        atanan: newAtanan,
        created_by: user?.sicilNo || null,
      })

      if (error) throw error
      
      await fetchAllData()
      setShowTaskForm(false)
      setSelectedTemplateId("")
      setNewPlaka("")
      setNewAtanan("")
      setNewNotlar("")
    } catch (err) {
      console.error("Görev oluşturma hatası:", err)
      alert("Görev oluşturulurken bir hata meydana geldi.")
    } finally {
      setFormSaving(false)
    }
  }

  // ─── TASK CHECKLIST FILLING (All Roles) ─────────────────────────────
  const startFilling = (task: TaskItem) => {
    setFillingTaskId(task.id)
    const initial: Record<string, any> = {}
    if (task.checklist) {
      task.checklist.forEach(c => {
        initial[c.id] = c.deger ?? (c.tip === 'boolean' ? false : "")
      })
    }
    setFilledValues(initial)
  }

  const handleFillSubmit = async (taskId: string) => {
    const task = (tasks || []).find(t => t.id === taskId)
    if (!task) return

    // Check required fields with null safety
    if (task.checklist) {
      for (const c of task.checklist) {
        if (c.zorunlu) {
          if (c.tip === 'boolean' && filledValues[c.id] === null) {
            alert(`Zorunlu alan eksik: ${c.soru}`)
            return
          }
          if ((c.tip === 'text' || c.tip === 'numeric') && (filledValues[c.id] === undefined || filledValues[c.id] === "")) {
            alert(`Zorunlu alan doldurulmalı: ${c.soru}`)
            return
          }
        }
      }
    }

    const updatedChecklist = (task.checklist || []).map(c => ({
      ...c,
      deger: filledValues[c.id]
    }))

    try {
      const { error } = await api.update('tasks', {
        checklist: updatedChecklist,
        durum: 'tamamlandi',
        tamamlanma_tarihi: new Date().toISOString()
      }, { id: taskId })

      if (error) throw error
      setFillingTaskId(null)
      await fetchAllData()
    } catch (err) {
      console.error("Görev tamamlama hatası:", err)
      alert("Görev kaydedilirken bir hata oluştu.")
    }
  }

  // ─── DYNAMIC TEMPLATE BUILDER (Müdür Only) ──────────────────────────
  const handleAddSoru = () => {
    setSorular([...sorular, { id: crypto.randomUUID(), soru: "", tip: "boolean", zorunlu: true }])
  }

  const handleSoruChange = (id: string, field: string, value: any) => {
    setSorular(sorular.map(s => s.id === id ? { ...s, [field]: value } : s))
  }

  const handleRemoveSoru = (id: string) => {
    setSorular(sorular.filter(s => s.id !== id))
  }

  const handleSaveTemplate = async () => {
    if (!baslik.trim() || sorular.some(s => !s.soru.trim())) {
      alert("Lütfen şablon başlığını ve tüm kontrol maddelerini doldurun.")
      return
    }

    setSavingTemplate(true)

    try {
      const { error } = await api.insert('task_templates', {
        baslik,
        tip: tplTip,
        periyot,
        sorular,
        aktif: true,
        olusturan_sicil: user?.sicilNo || null
      })

      if (error) throw error
      
      setIsBuilding(false)
      setBaslik("")
      setSorular([{ id: crypto.randomUUID(), soru: "", tip: "boolean", zorunlu: true }])
      await fetchAllData()
    } catch (err) {
      console.error("Şablon kayıt hatası:", err)
      alert("Şablon kaydedilirken bir hata oluştu.")
    } finally {
      setSavingTemplate(false)
    }
  }

  const toggleTemplateActive = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await api.update('task_templates', { aktif: !currentStatus }, { id })
      if (error) throw error
      await fetchAllData()
    } catch (err) {
      console.error("Şablon durum değiştirme hatası:", err)
      alert("Şablon durumu değiştirilemedi.")
    }
  }

  // Filter Tasks
  const pendingTasks = (tasks || []).filter(t => t.durum !== "tamamlandi" && t.durum !== "iptal")
  const completedTasks = (tasks || []).filter(t => t.durum === "tamamlandi" || t.durum === "iptal")

  if (loading && tasks.length === 0) {
    return (
      <div className="p-8 text-center animate-pulse flex items-center justify-center gap-2 min-h-[50vh]">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="text-muted-foreground font-semibold">Görev & Şablon Verileri Yükleniyor...</span>
      </div>
    )
  }

  return (
    <PageGuard pageId="gorevler">
      <div className="flex flex-col h-full space-y-6 max-w-7xl mx-auto pb-12 animate-in fade-in duration-300">
        
        {/* ═══ Sayfa Başlığı ═══ */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/50 pb-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight flex items-center gap-2">
              📋 Görev & Devir-Teslim Yönetimi
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Sivas İtfaiyesi araç devir-teslim formları, istasyon kontrol listeleri ve dinamik görev şablonları
            </p>
          </div>
          <div className="flex items-center gap-3">
            {isMudur ? (
              <Badge className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black px-3 py-1 text-xs">
                Müdür Yetki Modu
              </Badge>
            ) : (
              <Badge className="bg-zinc-800 border border-zinc-700 text-zinc-400 font-bold px-3 py-1 text-xs">
                Personel Girişi
              </Badge>
            )}
          </div>
        </div>

        {/* ═══ Glassmorphism Tabs Trigger ═══ */}
        <div className="flex border-b border-white/5 bg-slate-900/30 backdrop-blur-md p-1 rounded-xl w-full sm:w-fit border border-white/5">
          <button
            onClick={() => setActiveTab('gorevler')}
            className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 ${
              activeTab === 'gorevler'
                ? 'bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            Vardiya Görevleri ({pendingTasks.length + completedTasks.length})
          </button>
          <button
            onClick={() => setActiveTab('sablonlar')}
            className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 ${
              activeTab === 'sablonlar'
                ? 'bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <ListChecks className="w-4 h-4" />
            Görev Şablonları ({templates.length})
          </button>
        </div>

        {/* ═══ TAB 1: GÖREVLER & TESLİM KONTROLLERİ ═══ */}
        {activeTab === 'gorevler' && (
          <div className="space-y-6">
            
            {/* Müdür Hızlı Görev Atama Butonu & Formu */}
            {isMudur && (
              <div className="space-y-4">
                <div className="flex justify-end">
                  <Button
                    onClick={() => setShowTaskForm(!showTaskForm)}
                    className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs px-3.5 py-2 h-9 rounded-xl flex items-center gap-1.5 shadow-lg shadow-cyan-600/10 hover:scale-[1.02] transition duration-150 shrink-0"
                  >
                    {showTaskForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    {showTaskForm ? "Görev Atamayı İptal Et" : "Yeni Görev Ata"}
                  </Button>
                </div>

                {showTaskForm && (
                  <Card className="border-cyan-500/20 bg-slate-900/30 backdrop-blur-md border border-white/5 p-4 rounded-xl animate-in slide-in-from-top duration-200">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-bold text-cyan-400 flex items-center gap-2">
                        <ClipboardList className="w-4 h-4" /> İstasyon / Araç Görevi Atama Paneli
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <form onSubmit={handleCreateTask} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-zinc-400">Görev Şablonu</label>
                          <select
                            value={selectedTemplateId}
                            onChange={e => setSelectedTemplateId(e.target.value)}
                            required
                            className="flex h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-cyan-500/50"
                          >
                            <option value="">Şablon Seçiniz</option>
                            {(templates || []).filter(t => t.aktif).map(t => (
                              <option key={t.id} value={t.id}>{t.baslik} ({t.periyot === 'gunluk' ? 'Günlük' : t.periyot === 'haftalik' ? 'Haftalık' : 'Aylık'})</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-zinc-400">Hedef İtfaiye Aracı</label>
                          <select
                            value={newPlaka}
                            onChange={e => setNewPlaka(e.target.value)}
                            required
                            className="flex h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-cyan-500/50"
                          >
                            <option value="">Araç Plakası Seçin</option>
                            {(vehicles || []).map(v => (
                              <option key={v.plaka} value={v.plaka}>{v.plaka}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-zinc-400">Atanan Personel</label>
                          <select
                            value={newAtanan}
                            onChange={e => setNewAtanan(e.target.value)}
                            required
                            className="flex h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-cyan-500/50"
                          >
                            <option value="">Görevli Personel</option>
                            {(personnel || []).map(p => (
                              <option key={p.sicil_no} value={p.sicil_no}>{p.ad} {p.soyad} ({p.sicil_no})</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2 md:col-span-2 lg:col-span-1">
                          <label className="text-xs font-semibold text-zinc-400">Ek Not / Açıklama</label>
                          <Input
                            placeholder="Vardiya notu, eksik uyarısı vb..."
                            value={newNotlar}
                            onChange={e => setNewNotlar(e.target.value)}
                            className="h-10 border-white/10 bg-slate-950 focus:border-cyan-500/50 rounded-lg text-zinc-200"
                          />
                        </div>
                        <div className="md:col-span-2 lg:col-span-4 flex justify-end pt-2">
                          <Button
                            type="submit"
                            disabled={formSaving}
                            className="bg-cyan-600 hover:bg-cyan-700 h-10 px-6 font-bold text-sm shadow-md"
                          >
                            {formSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                            Görevi Vardiyaya Gönder
                          </Button>
                        </div>
                      </form>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Aktif Görevler */}
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
                Aktif & Devam Eden Görevler ({pendingTasks.length})
              </h2>
              
              <div className="grid grid-cols-1 gap-3">
                {pendingTasks.map(task => {
                  const isOpen = expandedId === task.id
                  const isFilling = fillingTaskId === task.id
                  const badgeInfo = DURUM_BADGE[task.durum] || { label: "Beklemede", bgClass: "bg-slate-900/40", borderClass: "border-white/5", textClass: "text-zinc-400" }

                  return (
                    <Card key={task.id} className="border-l-4 border-l-amber-500 bg-slate-900/40 backdrop-blur-md border border-white/5 rounded-xl transition hover:border-white/10">
                      <button
                        onClick={() => toggleTaskCollapse(task.id)}
                        className="w-full text-left focus:outline-none p-4 flex items-center justify-between"
                      >
                        <div>
                          <p className="font-extrabold text-sm text-zinc-100">
                            {task.tip} — <span className="text-cyan-400 font-mono">{task.plaka}</span>
                          </p>
                          <p className="text-xs text-zinc-400 mt-1">
                            Atanan Sicil: <span className="font-mono text-zinc-300">{task.atanan}</span> · {new Date(task.tarih).toLocaleDateString("tr-TR")}
                          </p>
                          {task.notlar && (
                            <p className="text-xs text-amber-500/80 italic mt-1 font-medium">Not: {task.notlar}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge className={`${badgeInfo.bgClass} ${badgeInfo.borderClass} ${badgeInfo.textClass} border px-2 py-0.5 rounded-lg text-xs`}>
                            {badgeInfo.label}
                          </Badge>
                          {isOpen ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
                        </div>
                      </button>

                      {isOpen && (
                        <CardContent className="pt-0 px-4 pb-4 border-t border-white/5 pt-4">
                          {!isFilling ? (
                            <div className="space-y-4">
                              <div className="bg-slate-950/60 p-4 rounded-xl border border-white/5 space-y-2.5">
                                <p className="text-xs font-black text-cyan-400 uppercase tracking-wider">Kontrol Edilecek Maddeler:</p>
                                {(task.checklist || []).map((c, i) => (
                                  <div key={i} className="flex items-center gap-2 text-sm text-zinc-300">
                                    <span className="text-zinc-500 font-bold">•</span>
                                    <span>{c.soru}</span>
                                    <Badge variant="outline" className="scale-75 origin-left text-zinc-400 border-zinc-700">
                                      {c.tip === 'boolean' ? 'Checklist' : c.tip === 'numeric' ? 'Sayısal' : c.tip === 'text' ? 'Açıklama' : 'Fotoğraf'}
                                    </Badge>
                                    {c.zorunlu && <span className="text-[10px] text-red-400 font-extrabold bg-red-950/30 px-1 border border-red-500/20 rounded">Zorunlu</span>}
                                  </div>
                                ))}
                              </div>
                              <Button
                                onClick={() => startFilling(task)}
                                className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-bold h-10 rounded-xl"
                              >
                                Görevi Gerçekleştir / Formu Doldur
                              </Button>
                            </div>
                          ) : (
                            <div className="space-y-5 bg-slate-950 p-5 rounded-xl border border-white/5 shadow-inner">
                              <h3 className="font-extrabold text-sm text-cyan-400 border-b border-white/5 pb-3">Devir-Teslim / Kontrol Giriş Formu</h3>
                              {(task.checklist || []).map(c => (
                                <div key={c.id} className="space-y-2 border-b border-white/5 pb-4 last:border-0 last:pb-0">
                                  <p className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                                    {c.soru}
                                    {c.zorunlu && <span className="text-[9px] font-black bg-red-950/40 text-red-400 border border-red-500/30 rounded px-1.5 py-0.5">ZORUNLU</span>}
                                  </p>

                                  {c.tip === 'boolean' && (
                                    <div className="grid grid-cols-2 gap-3 max-w-sm pt-1">
                                      <button
                                        type="button"
                                        onClick={() => setFilledValues({...filledValues, [c.id]: true})}
                                        className={`flex items-center justify-center gap-2 min-h-[44px] rounded-lg border font-bold text-xs transition-all active:scale-[0.97] ${
                                          filledValues[c.id] === true
                                            ? 'bg-green-500/10 border-green-500/30 text-green-400'
                                            : 'border-white/5 bg-slate-900 text-zinc-400 hover:border-green-500/20'
                                        }`}
                                      >
                                        <CheckCircle2 className="w-4 h-4" />
                                        Evet / Sorun Yok
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setFilledValues({...filledValues, [c.id]: false})}
                                        className={`flex items-center justify-center gap-2 min-h-[44px] rounded-lg border font-bold text-xs transition-all active:scale-[0.97] ${
                                          filledValues[c.id] === false
                                            ? 'bg-red-500/10 border-red-500/30 text-red-400'
                                            : 'border-white/5 bg-slate-900 text-zinc-400 hover:border-red-500/20'
                                        }`}
                                      >
                                        <XCircle className="w-4 h-4" />
                                        Hayır / Hatalı
                                      </button>
                                    </div>
                                  )}

                                  {c.tip === 'numeric' && (
                                    <Input
                                      type="number"
                                      inputMode="numeric"
                                      placeholder="Sayısal değer giriniz (Örn: Kilometre, Basınç)..."
                                      value={filledValues[c.id] || ''}
                                      onChange={e => setFilledValues({...filledValues, [c.id]: e.target.value})}
                                      className="max-w-sm border-white/10 bg-slate-900 rounded-lg text-zinc-200 h-9"
                                    />
                                  )}

                                  {c.tip === 'text' && (
                                    <Input
                                      type="text"
                                      placeholder="Açıklama, tespit notu..."
                                      value={filledValues[c.id] || ''}
                                      onChange={e => setFilledValues({...filledValues, [c.id]: e.target.value})}
                                      className="border-white/10 bg-slate-900 rounded-lg text-zinc-200 h-9"
                                    />
                                  )}

                                  {c.tip === 'image' && (
                                    <div className="max-w-sm">
                                      <ImageUpload
                                        fieldId={`task_${task.id}_${c.id}`}
                                        value={filledValues[c.id] || null}
                                        onUploaded={(path) => setFilledValues({...filledValues, [c.id]: path})}
                                        onRemoved={() => {
                                          const newValues = {...filledValues};
                                          delete newValues[c.id];
                                          setFilledValues(newValues);
                                        }}
                                      />
                                    </div>
                                  )}
                                </div>
                              ))}

                              <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-white/5">
                                <Button
                                  variant="ghost"
                                  onClick={() => setFillingTaskId(null)}
                                  className="text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
                                >
                                  İptal Et
                                </Button>
                                <Button
                                  onClick={() => handleFillSubmit(task.id)}
                                  className="bg-green-600 hover:bg-green-700 text-white font-bold h-10 px-5 rounded-xl shadow-lg shadow-green-600/10"
                                >
                                  <Save className="w-4 h-4 mr-1.5" /> Kontrolü Tamamla ve Teslim Et
                                </Button>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      )}
                    </Card>
                  )
                })}

                {pendingTasks.length === 0 && (
                  <p className="text-zinc-400 text-xs italic py-6 text-center border border-dashed border-white/5 rounded-xl bg-slate-900/10">
                    Şu anda aktif görev veya beklemede olan devir-teslim kaydı bulunmamaktadır.
                  </p>
                )}
              </div>
            </div>

            {/* Tamamlanan Görevler */}
            <div className="space-y-3 pt-4">
              <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                <CheckSquare className="w-4.5 h-4.5 text-green-400" />
                Tamamlanan / Teslim Alınan Görevler ({completedTasks.length})
              </h2>

              <div className="grid grid-cols-1 gap-3">
                {completedTasks.map(task => {
                  const isOpen = expandedId === task.id
                  const badgeInfo = DURUM_BADGE[task.durum] || { label: "Tamamlandı", bgClass: "bg-green-950/40", borderClass: "border-green-500/30", textClass: "text-green-400" }

                  return (
                    <Card key={task.id} className="opacity-80 hover:opacity-100 transition-opacity bg-slate-900/30 backdrop-blur-md border border-white/5 rounded-xl">
                      <button
                        onClick={() => toggleTaskCollapse(task.id)}
                        className="w-full text-left p-4 flex items-center justify-between"
                      >
                        <div>
                          <p className="font-extrabold text-sm text-zinc-100">
                            {task.tip} — <span className="text-cyan-400 font-mono">{task.plaka}</span>
                          </p>
                          <p className="text-xs text-zinc-400 mt-1">
                            Atanan Personel: <span className="font-mono text-zinc-300">{task.atanan}</span> · {new Date(task.tarih).toLocaleDateString("tr-TR")}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge className={`${badgeInfo.bgClass} ${badgeInfo.borderClass} ${badgeInfo.textClass} border px-2 py-0.5 rounded-lg text-xs`}>
                            {badgeInfo.label}
                          </Badge>
                          {isOpen ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
                        </div>
                      </button>

                      {isOpen && (
                        <CardContent className="pt-0 px-4 pb-4 border-t border-white/5 pt-4">
                          <div className="bg-slate-950/60 p-4 rounded-xl border border-white/5 space-y-2">
                            {(task.checklist || []).map((c, idx) => (
                              <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/5 last:border-0 pb-2 last:pb-0 gap-1.5">
                                <span className="text-xs font-bold text-zinc-300">{c.soru}</span>
                                <span>
                                  {c.tip === 'boolean' ? (
                                    c.deger === true ? (
                                      <Badge className="bg-green-950/40 border border-green-500/30 text-green-400 font-bold px-2 py-0.5 rounded">Evet</Badge>
                                    ) : (
                                      <Badge className="bg-red-950/40 border border-red-500/30 text-red-400 font-bold px-2 py-0.5 rounded">Hayır</Badge>
                                    )
                                  ) : c.tip === 'image' ? (
                                    c.deger ? (
                                      <a
                                        href={c.deger}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-xs text-cyan-400 hover:underline flex items-center gap-1 font-bold"
                                      >
                                        <ImageIcon className="w-3.5 h-3.5" /> Fotoğrafı Görüntüle
                                      </a>
                                    ) : (
                                      <span className="text-xs text-zinc-500 font-medium">Fotoğraf Eklenmedi</span>
                                    )
                                  ) : (
                                    <span className="font-mono bg-slate-900 border border-white/5 px-2 py-0.5 rounded text-xs text-zinc-200">
                                      {c.deger || '—'}
                                    </span>
                                  )}
                                </span>
                              </div>
                            ))}
                          </div>
                          {task.tamamlanma_tarihi && (
                            <p className="text-[10px] text-zinc-400 text-right mt-2 font-mono">
                              Tamamlanma: {new Date(task.tamamlanma_tarihi).toLocaleString("tr-TR")}
                            </p>
                          )}
                        </CardContent>
                      )}
                    </Card>
                  )
                })}

                {completedTasks.length === 0 && (
                  <p className="text-zinc-400 text-xs italic py-6 text-center border border-dashed border-white/5 rounded-xl bg-slate-900/10">
                    Henüz tamamlanan bir devir-teslim işlemi bulunmamaktadır.
                  </p>
                )}
              </div>
            </div>

          </div>
        )}

        {/* ═══ TAB 2: GÖREV & DEVİR-TESLİM ŞABLONLARI ═══ */}
        {activeTab === 'sablonlar' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            
            {/* Müdür Şablon Oluşturucu Paneli */}
            {isMudur ? (
              <div className="space-y-4">
                <div className="flex justify-end gap-2">
                  <Button
                    onClick={() => setIsBuilding(!isBuilding)}
                    className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs px-3.5 py-2 h-9 rounded-xl flex items-center gap-1.5 shadow-lg shadow-cyan-600/10 hover:scale-[1.02] transition duration-150 shrink-0"
                  >
                    {isBuilding ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    {isBuilding ? "Şablon Oluşturucuyu Kapat" : "Yeni Görev Şablonu Oluştur"}
                  </Button>
                </div>

                {isBuilding && (
                  <Card className="border-cyan-500/20 bg-slate-900/30 backdrop-blur-md border border-white/5 p-4 rounded-xl animate-in slide-in-from-top duration-200">
                    <CardHeader className="pb-4 border-b border-white/5">
                      <CardTitle className="text-sm font-bold flex items-center gap-2 text-cyan-400">
                        <ListChecks className="w-4 h-4" /> Yeni Görev / Kontrol Listesi Şablonu Oluşturucu
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase text-zinc-400">Şablon Başlığı</label>
                          <Input
                            value={baslik}
                            onChange={e => setBaslik(e.target.value)}
                            placeholder="Örn: Arazöz Malzeme Kontrol Listesi"
                            className="h-10 border-white/10 bg-slate-950 focus:border-cyan-500/50 rounded-lg text-zinc-200"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase text-zinc-400">Görev Tipi</label>
                          <select
                            value={tplTip}
                            onChange={e => setTplTip(e.target.value)}
                            className="flex h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-cyan-500/50"
                          >
                            <option value="devir_teslim">Devir Teslim Formu</option>
                            <option value="gunluk_kontrol">Periyodik Kontrol Formu</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase text-zinc-400">Raporlama Periyodu</label>
                          <select
                            value={periyot}
                            onChange={e => setPeriyot(e.target.value)}
                            className="flex h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-cyan-500/50"
                          >
                            <option value="gunluk">Günlük Kontrol</option>
                            <option value="haftalik">Haftalık Kontrol</option>
                            <option value="aylik">Aylık Kontrol</option>
                          </select>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h3 className="font-extrabold text-sm text-zinc-200 border-b border-white/5 pb-2">Kontrol Maddeleri (Sorular)</h3>
                        {sorular.map((s, idx) => (
                          <div key={s.id} className="flex flex-col sm:flex-row gap-3 items-start sm:items-center p-3 border border-white/5 rounded-lg bg-slate-950/60">
                            <span className="font-mono text-zinc-500 font-bold w-6 text-sm">{idx + 1}.</span>
                            
                            <Input
                              className="flex-1 h-9 border-white/10 bg-slate-900 focus:border-cyan-500/50 rounded-lg text-zinc-200 text-sm"
                              placeholder="Örn: Su tankı vana kontrolleri yapıldı mı? Kılavuz feneri yerinde mi?"
                              value={s.soru}
                              onChange={e => handleSoruChange(s.id, 'soru', e.target.value)}
                            />
                            
                            <div className="flex items-center gap-2 w-full sm:w-auto">
                              <select
                                value={s.tip}
                                onChange={e => handleSoruChange(s.id, 'tip', e.target.value)}
                                className="h-9 rounded-lg border border-white/10 bg-slate-900 px-3 py-1 text-xs text-zinc-200 outline-none focus:border-cyan-500/50"
                              >
                                <option value="boolean">Checkbox (Evet/Hayır)</option>
                                <option value="numeric">Sayısal Veri (Örn: KM, Basınç)</option>
                                <option value="text">Serbest Metin Notu</option>
                                <option value="image">Fotoğraf Kanıtı Yükleme</option>
                              </select>

                              <label className="flex items-center gap-2 text-xs cursor-pointer border border-white/10 p-2 h-9 rounded-lg whitespace-nowrap bg-slate-900 text-zinc-400">
                                <input
                                  type="checkbox"
                                  checked={s.zorunlu}
                                  onChange={e => handleSoruChange(s.id, 'zorunlu', e.target.checked)}
                                  className="accent-cyan-500"
                                />
                                Zorunlu
                              </label>

                              {sorular.length > 1 && (
                                <Button
                                  variant="danger"
                                  size="icon"
                                  onClick={() => handleRemoveSoru(s.id)}
                                  className="h-9 w-9 shrink-0 bg-red-650 hover:bg-red-750 text-white rounded-lg"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}

                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleAddSoru}
                          className="border-dashed border-white/10 text-cyan-400 hover:text-cyan-300 hover:bg-white/5 w-full rounded-xl"
                        >
                          <Plus className="w-4 h-4 mr-1.5" /> Kontrol Maddesi Ekle
                        </Button>
                      </div>

                      <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                        <Button
                          variant="ghost"
                          onClick={() => setIsBuilding(false)}
                          className="text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
                        >
                          İptal
                        </Button>
                        <Button
                          onClick={handleSaveTemplate}
                          disabled={savingTemplate}
                          className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold h-10 px-6 rounded-xl"
                        >
                          {savingTemplate ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ListChecks className="w-4 h-4 mr-2" />}
                          Şablonu Tamamla ve Yayınla
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <div className="bg-slate-900/20 border border-white/5 rounded-xl p-4 text-center">
                <p className="text-zinc-400 text-xs italic">
                  💡 Personel yetki modundasınız. Yeni şablon oluşturma adımları ve aktif/pasif kilitleri sadece <b>Müdür</b> yetkisinde olup, bu alanı salt-okunur modda inceliyorsunuz.
                </p>
              </div>
            )}

            {/* Şablon Kart Listesi */}
            <div className="grid gap-4 md:grid-cols-2">
              {(templates || []).map(t => (
                <Card
                  key={t.id}
                  className={`bg-slate-900/30 backdrop-blur-md border rounded-xl p-5 ${
                    t.aktif
                      ? "border-l-4 border-l-green-500 border-white/5"
                      : "opacity-75 border-l-4 border-l-zinc-700 border-white/5"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-extrabold text-base text-zinc-100">{t.baslik}</h3>
                      <div className="flex gap-2 mt-2">
                        <Badge variant="outline" className="text-zinc-400 border-zinc-700 font-bold scale-90 origin-left">
                          {t.tip === 'devir_teslim' ? 'Devir Teslim' : 'Periyodik Kontrol'}
                        </Badge>
                        <Badge variant="outline" className="text-zinc-400 border-zinc-700 font-bold scale-90 origin-left">
                          {t.periyot === 'gunluk' ? 'Günlük' : t.periyot === 'haftalik' ? 'Haftalık' : 'Aylık'}
                        </Badge>
                        <Badge className={`${t.aktif ? 'bg-green-950/40 text-green-400 border-green-500/20' : 'bg-zinc-950/40 text-zinc-400 border-zinc-700'} border font-bold scale-90 origin-left`}>
                          {t.aktif ? "Aktif" : "Pasif"}
                        </Badge>
                      </div>
                    </div>
                    {isMudur && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleTemplateActive(t.id, t.aktif)}
                        className={`text-xs font-bold rounded-lg ${t.aktif ? 'text-red-400 hover:text-red-300 hover:bg-red-950/20' : 'text-green-400 hover:text-green-300 hover:bg-green-950/20'}`}
                      >
                        {t.aktif ? "Devre Dışı Bırak" : "Aktifleştir"}
                      </Button>
                    )}
                  </div>

                  <div className="mt-4 pt-4 border-t border-white/5 space-y-2">
                    <p className="text-xs font-black text-cyan-400 uppercase tracking-wider mb-2.5">
                      {t.sorular ? t.sorular.length : 0} Adet Madde Girişi:
                    </p>
                    {(t.sorular || []).slice(0, 4).map((s, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs text-zinc-300">
                        <span className="text-zinc-500">•</span>
                        <span className="truncate flex-1">{s.soru}</span>
                        <Badge variant="outline" className="scale-75 origin-right border-zinc-700 text-zinc-500">
                          {s.tip === 'boolean' ? 'Checkbox' : s.tip === 'numeric' ? 'Sayısal' : s.tip === 'text' ? 'Metin' : 'Fotoğraf'}
                        </Badge>
                        {s.zorunlu && <span className="text-[9px] text-red-400 font-extrabold border border-red-500/20 bg-red-950/20 px-1 rounded">Zorunlu</span>}
                      </div>
                    ))}
                    {t.sorular && t.sorular.length > 4 && (
                      <p className="text-[10px] text-zinc-500 italic mt-2.5">+ {t.sorular.length - 4} kontrol maddesi daha mevcuttur.</p>
                    )}
                  </div>
                </Card>
              ))}

              {templates.length === 0 && (
                <div className="col-span-full py-12 text-center border border-dashed border-white/5 rounded-xl bg-slate-900/10 text-zinc-400 text-sm">
                  Kayıtlı aktif bir görev kontrol şablonu bulunmamaktadır.
                </div>
              )}
            </div>

          </div>
        )}

      </div>
    </PageGuard>
  )
}
