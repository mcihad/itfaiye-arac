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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/Dialog"
import { toast } from "@/lib/toast"
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
  Image as ImageIcon,
  Milestone,
  MapPin
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
  filo_no?: number | null;
  aciklama?: string;
}

interface Personnel {
  sicil_no: string;
  ad: string;
  soyad: string;
}

// Status Badges mapping
const DURUM_BADGE: Record<string, { label: string; bgClass: string; borderClass: string; textClass: string }> = {
  tamamlandi: { label: "Teslim Alındı", bgClass: "bg-emerald-950/40", borderClass: "border-emerald-500/30", textClass: "text-emerald-400" },
  devam_ediyor: { label: "Devam Ediyor", bgClass: "bg-amber-950/40", borderClass: "border-amber-500/30", textClass: "text-amber-400" },
  beklemede: { label: "Bekliyor", bgClass: "bg-slate-950/40", borderClass: "border-slate-500/30", textClass: "text-slate-400" },
  iptal: { label: "İptal Edildi", bgClass: "bg-red-950/40", borderClass: "border-red-500/30", textClass: "text-red-400" },
}

export default function UnifiedGorevlerPage() {
  const { user } = useAuthStore()
  
  // Role Detection (Müdür / Yönetici)
  const isMudur = user?.rol === 'Admin' || user?.unvan === 'Müdür' || user?.rol?.toLowerCase() === 'admin' || user?.unvan?.toLowerCase() === 'müdür'
  
  // Tab State
  const [activeTab, setActiveTab] = useState<'gorevler' | 'sablonlar' | 'dis_gorevler'>('gorevler')

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

  // --- Tab 3: Dış Görevler States ---
  const [externalMissions, setExternalMissions] = useState<any[]>([])
  const [showAddMissionForm, setShowAddMissionForm] = useState(false)
  const [addMissionForm, setAddMissionForm] = useState({
    gorev_turu: "Sosyal Görev",
    baslik: "",
    detay: "",
    mahalle: "",
    adres: "",
    plaka: "",
    sicil_nos: [] as string[]
  })
  const [addMissionSaving, setAddMissionSaving] = useState(false)

  // Edit Mission states
  const [editingMission, setEditingMission] = useState<any | null>(null)
  const [editMissionModalOpen, setEditMissionModalOpen] = useState(false)
  const [editMissionForm, setEditMissionForm] = useState({
    gorev_turu: "Sosyal Görev",
    baslik: "",
    detay: "",
    mahalle: "",
    adres: "",
    plaka: "",
    sicil_nos: [] as string[]
  })
  const [editMissionSaving, setEditMissionSaving] = useState(false)

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
      
      const [tasksRes, templatesRes, vRes, pRes, extRes] = await Promise.all([
        fetchOrNull(api.from('tasks').select('*').order('created_at', { ascending: false })),
        // If not manager, only fetch active templates, else fetch all to let manager edit/toggle
        fetchOrNull(api.from('task_templates').select('*').order('created_at', { ascending: false })),
        fetchOrNull(api.from('vehicles').select('plaka, filo_no, aciklama')),
        fetchOrNull(api.from('personnel').select('sicil_no, ad, soyad').eq('aktif', true)),
        fetchOrNull(api.from('external_missions').select('*').order('created_at', { ascending: false })),
      ])

      if (tasksRes.data) setTasks(tasksRes.data as TaskItem[])
      if (templatesRes.data) setTemplates(templatesRes.data as TaskTemplate[])
      if (vRes.data) {
        const sortedV = [...(vRes.data || [])].sort((a: any, b: any) => (a.filo_no || 999) - (b.filo_no || 999));
        setVehicles(sortedV as Vehicle[])
      }
      if (pRes.data) setPersonnel(pRes.data as Personnel[])
      if (extRes.data) setExternalMissions(extRes.data)
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
        tarih: new Date().toISOString().split('T')[0],
        notlar: newNotlar || null,
        atanan: newAtanan,
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
      toast("Görev oluşturulurken bir hata meydana geldi.")
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
            toast(`Zorunlu alan eksik: ${c.soru}`)
            return
          }
          if ((c.tip === 'text' || c.tip === 'numeric') && (filledValues[c.id] === undefined || filledValues[c.id] === "")) {
            toast(`Zorunlu alan doldurulmalı: ${c.soru}`)
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
      toast("Görev kaydedilirken bir hata oluştu.")
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
      toast("Lütfen şablon başlığını ve tüm kontrol maddelerini doldurun.")
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
      toast("Şablon kaydedilirken bir hata oluştu.")
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
      toast("Şablon durumu değiştirilemedi.")
    }
  }

  // ─── EXTERNAL MISSIONS HELPERS (Müdür & Personnel) ───────────────────
  const handleCreateExternalMission = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addMissionForm.baslik) {
      toast("Lütfen bir başlık giriniz.")
      return
    }
    if (addMissionForm.sicil_nos.length === 0) {
      toast("Lütfen en az bir personel seçiniz.")
      return
    }
    
    setAddMissionSaving(true)
    try {
      const defaultCoords = `POINT(37.0209312 39.7339522)`
      const hours = 2
      const tahminiDonus = new Date()
      tahminiDonus.setHours(tahminiDonus.getHours() + hours)

      const payload = {
        gorev_turu: addMissionForm.gorev_turu,
        baslik: addMissionForm.baslik,
        detay: addMissionForm.detay || null,
        mahalle: addMissionForm.mahalle || null,
        adres: addMissionForm.adres || null,
        hedef_koordinat: defaultCoords,
        cikis_tarihi: new Date().toISOString(),
        tahmini_donus: tahminiDonus.toISOString(),
        durum: "Aktif",
        plaka: addMissionForm.plaka || null,
        sicil_nos: addMissionForm.sicil_nos
      }

      const { error } = await api.insert('external_missions', payload)
      if (error) throw error

      // Tetikle SMS API
      try {
        await fetch('/api/sms/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            missionTitle: payload.baslik,
            missionAddress: (payload.mahalle || '') + ' ' + (payload.adres || ''),
            missionType: payload.gorev_turu,
            detail: payload.detay
          })
        });
      } catch (smsErr) {
        console.error("SMS Gönderim Hatası:", smsErr);
      }

      toast("Dış görev başarıyla başlatıldı ve personele SMS gönderimi tetiklendi.")
      setShowAddMissionForm(false)
      setAddMissionForm({
        gorev_turu: "Sosyal Görev",
        baslik: "",
        detay: "",
        mahalle: "",
        adres: "",
        plaka: "",
        sicil_nos: []
      })
      await fetchAllData()
    } catch (err: any) {
      console.error(err)
      toast("Dış görev oluşturulurken hata oluştu: " + err.message)
    } finally {
      setAddMissionSaving(false)
    }
  }

  const handleCompleteExternalMission = async (id: string) => {
    if (!confirm("Bu dış görevi sonlandırmak istediğinize emin misiniz?")) return
    try {
      const { error } = await api.update('external_missions', { durum: 'Tamamlandı' }, { id })
      if (error) throw error
      toast("Dış görev başarıyla tamamlandı.")
      await fetchAllData()
    } catch (err: any) {
      console.error(err)
      toast("Hata oluştu: " + err.message)
    }
  }

  const handleDeleteExternalMission = async (id: string) => {
    if (!confirm("Bu dış görevi silmek istediğinize emin misiniz? Bu işlem geri alınamaz.")) return
    try {
      const { error } = await api.remove('external_missions', { id })
      if (error) throw error
      toast("Dış görev başarıyla silindi.")
      await fetchAllData()
    } catch (err: any) {
      console.error(err)
      toast("Silme hatası: " + err.message)
    }
  }

  const handleStartEditMission = (mission: any) => {
    setEditingMission(mission)
    setEditMissionForm({
      gorev_turu: mission.gorev_turu || "Sosyal Görev",
      baslik: mission.baslik || "",
      detay: mission.detay || "",
      mahalle: mission.mahalle || "",
      adres: mission.adres || "",
      plaka: mission.plaka || "",
      sicil_nos: mission.sicil_nos || []
    })
    setEditMissionModalOpen(true)
  }

  const handleCloseEditMissionModal = () => {
    setEditingMission(null)
    setEditMissionModalOpen(false)
  }

  const handleSaveMissionEdit = async () => {
    if (!editingMission) return
    if (!editMissionForm.baslik) {
      toast("Lütfen başlık giriniz.")
      return
    }
    if (editMissionForm.sicil_nos.length === 0) {
      toast("Lütfen en az bir personel seçiniz.")
      return
    }

    setEditMissionSaving(true)
    try {
      const { error } = await api.update('external_missions', {
        gorev_turu: editMissionForm.gorev_turu,
        baslik: editMissionForm.baslik,
        detay: editMissionForm.detay || null,
        mahalle: editMissionForm.mahalle || null,
        adres: editMissionForm.adres || null,
        plaka: editMissionForm.plaka || null,
        sicil_nos: editMissionForm.sicil_nos
      }, { id: editingMission.id })

      if (error) throw error

      toast("Dış görev başarıyla güncellendi.")
      setEditMissionModalOpen(false)
      setEditingMission(null)
      await fetchAllData()
    } catch (err: any) {
      console.error(err)
      toast("Güncelleme hatası: " + err.message)
    } finally {
      setEditMissionSaving(false)
    }
  }

  // Filter Tasks
  const pendingTasks = (tasks || []).filter(t => t.durum !== "tamamlandi" && t.durum !== "iptal")
  const completedTasks = (tasks || []).filter(t => t.durum === "tamamlandi" || t.durum === "iptal")

  // Filter External Missions
  const activeMissions = (externalMissions || []).filter(m => m.durum !== "Tamamlandı" && m.durum !== "iptal")
  const completedMissions = (externalMissions || []).filter(m => m.durum === "Tamamlandı" || m.durum === "iptal")

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
      <div className="space-y-6 w-full max-w-full px-1.5 md:px-3 pb-12 animate-in fade-in duration-300">
        
        {/* ═══ Sayfa Başlığı ═══ */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--fd-border)] pb-4">
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-[var(--fd-text)] flex items-center gap-2">
              📋 Görev & Devir-Teslim Yönetimi
            </h1>
            <p className="text-[var(--fd-text2)] text-xs mt-1">
              Sivas İtfaiyesi araç devir-teslim formları, istasyon kontrol listeleri ve dinamik görev şablonları
            </p>
          </div>
          <div className="flex items-center gap-3">
            {isMudur ? (
              <Badge className="bg-[rgba(22,163,74,0.1)] border border-[rgba(22,163,74,0.2)] text-[var(--fd-success)] font-bold px-3 py-1 text-xs">
                Müdür Yetki Modu
              </Badge>
            ) : (
              <Badge className="bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text2)] font-bold px-3 py-1 text-xs">
                Personel Girişi
              </Badge>
            )}
          </div>
        </div>

        {/* ═══ Glassmorphism Tabs Trigger ═══ */}
        <div className="flex flex-wrap bg-[var(--fd-surface2)] p-1 rounded-[var(--fd-r)] border border-[var(--fd-border)] gap-1 w-full sm:w-fit">
          <Button
            onClick={() => setActiveTab('gorevler')}
            variant={activeTab === 'gorevler' ? 'default' : 'ghost'}
            className={`flex-1 sm:flex-none flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 h-auto py-2 sm:h-9 sm:py-0 text-xs font-bold rounded-[var(--fd-r-sm)] transition-all cursor-pointer text-center ${
              activeTab === 'gorevler'
                ? "bg-[var(--fd-accent)] text-[#ffffff] shadow-[var(--fd-shadow-sm)]"
                : "text-[var(--fd-text3)] hover:text-[var(--fd-text2)] hover:bg-[var(--fd-surface3)]/50"
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            <span><span className="hidden sm:inline">Vardiya </span>Görevler<span className="hidden sm:inline">i</span> ({pendingTasks.length + completedTasks.length})</span>
          </Button>
          <Button
            onClick={() => setActiveTab('dis_gorevler')}
            variant={activeTab === 'dis_gorevler' ? 'default' : 'ghost'}
            className={`flex-1 sm:flex-none flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 h-auto py-2 sm:h-9 sm:py-0 text-xs font-bold rounded-[var(--fd-r-sm)] transition-all cursor-pointer text-center ${
              activeTab === 'dis_gorevler'
                ? "bg-[var(--fd-accent)] text-[#ffffff] shadow-[var(--fd-shadow-sm)]"
                : "text-[var(--fd-text3)] hover:text-[var(--fd-text2)] hover:bg-[var(--fd-surface3)]/50"
            }`}
          >
            <Milestone className="w-4 h-4" />
            <span>Dış Görevler ({activeMissions.length})</span>
          </Button>
          <Button
            onClick={() => setActiveTab('sablonlar')}
            variant={activeTab === 'sablonlar' ? 'default' : 'ghost'}
            className={`flex-1 sm:flex-none flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 h-auto py-2 sm:h-9 sm:py-0 text-xs font-bold rounded-[var(--fd-r-sm)] transition-all cursor-pointer text-center ${
              activeTab === 'sablonlar'
                ? "bg-[var(--fd-accent)] text-[#ffffff] shadow-[var(--fd-shadow-sm)]"
                : "text-[var(--fd-text3)] hover:text-[var(--fd-text2)] hover:bg-[var(--fd-surface3)]/50"
            }`}
          >
            <ListChecks className="w-4 h-4" />
            <span><span className="hidden sm:inline">Görev </span>Şablonlar<span className="hidden sm:inline">ı</span> ({templates.length})</span>
          </Button>
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
                    className="bg-[var(--fd-accent)] hover:opacity-90 text-white font-bold text-xs px-3.5 py-2 h-9 rounded-[var(--fd-r-sm)] flex items-center gap-1.5 shadow-[var(--fd-shadow-sm)] hover:scale-[1.02] transition duration-150 shrink-0"
                  >
                    {showTaskForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    {showTaskForm ? "Görev Atamayı İptal Et" : "Yeni Görev Ata"}
                  </Button>
                </div>

                {showTaskForm && (
                  <Card className="border-[var(--fd-border)] bg-[var(--fd-surface)] border p-4 rounded-[var(--fd-r)] shadow-[var(--fd-shadow-sm)] animate-in slide-in-from-top duration-200">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-bold text-[var(--fd-accent)] flex items-center gap-2">
                        <ClipboardList className="w-4 h-4" /> İstasyon / Araç Görevi Atama Paneli
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <form onSubmit={handleCreateTask} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-[var(--fd-text2)]">Görev Şablonu</label>
                          <select
                            value={selectedTemplateId}
                            onChange={e => setSelectedTemplateId(e.target.value)}
                            required
                            className="flex h-10 w-full rounded-[var(--fd-r-sm)] border border-[var(--fd-border)] bg-[var(--fd-surface2)] px-3 py-2 text-sm text-[var(--fd-text)] outline-none focus:border-[var(--fd-accent)]"
                          >
                            <option value="">Şablon Seçiniz</option>
                            {(templates || []).filter(t => t.aktif).map(t => (
                              <option key={t.id} value={t.id}>{t.baslik} ({t.periyot === 'gunluk' ? 'Günlük' : t.periyot === 'haftalik' ? 'Haftalık' : 'Aylık'})</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-[var(--fd-text2)]">Hedef İtfaiye Aracı</label>
                          <select
                            value={newPlaka}
                            onChange={e => setNewPlaka(e.target.value)}
                            required
                            className="flex h-10 w-full rounded-[var(--fd-r-sm)] border border-[var(--fd-border)] bg-[var(--fd-surface2)] px-3 py-2 text-sm text-[var(--fd-text)] outline-none focus:border-[var(--fd-accent)]"
                          >
                            <option value="">Araç Plakası Seçin</option>
                            {(vehicles || []).map(v => (
                              <option key={v.plaka} value={v.plaka}>
                                {v.filo_no ? `${v.filo_no} NOLU ${v.aciklama || ''} (${v.plaka})` : v.plaka}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-[var(--fd-text2)]">Atanan Personel</label>
                          <select
                            value={newAtanan}
                            onChange={e => setNewAtanan(e.target.value)}
                            required
                            className="flex h-10 w-full rounded-[var(--fd-r-sm)] border border-[var(--fd-border)] bg-[var(--fd-surface2)] px-3 py-2 text-sm text-[var(--fd-text)] outline-none focus:border-[var(--fd-accent)]"
                          >
                            <option value="">Görevli Personel</option>
                            {(personnel || []).map(p => (
                              <option key={p.sicil_no} value={p.sicil_no}>{p.ad} {p.soyad} ({p.sicil_no})</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2 md:col-span-2 lg:col-span-1">
                          <label className="text-xs font-semibold text-[var(--fd-text2)]">Ek Not / Açıklama</label>
                          <Input
                            placeholder="Vardiya notu, eksik uyarısı vb..."
                            value={newNotlar}
                            onChange={e => setNewNotlar(e.target.value)}
                            className="h-10 border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text)] focus:border-[var(--fd-accent)] rounded-[var(--fd-r-sm)]"
                          />
                        </div>
                        <div className="md:col-span-2 lg:col-span-4 flex justify-end pt-2">
                          <Button
                            type="submit"
                            disabled={formSaving}
                            className="bg-[var(--fd-accent)] hover:opacity-90 text-white h-10 px-6 font-bold text-sm shadow-[var(--fd-shadow-sm)] rounded-[var(--fd-r-sm)]"
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
              <h2 className="text-lg font-bold text-[var(--fd-text)] flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--fd-amber)] animate-pulse"></span>
                Aktif & Devam Eden Görevler ({pendingTasks.length})
              </h2>
              
              <div className="grid grid-cols-1 gap-3">
                {pendingTasks.map(task => {
                  const isOpen = expandedId === task.id
                  const isFilling = fillingTaskId === task.id
                  const badgeInfo = DURUM_BADGE[task.durum] || { label: "Beklemede", bgClass: "bg-[var(--fd-surface2)]", borderClass: "border-[var(--fd-border)]", textClass: "text-[var(--fd-text3)]" }

                  return (
                    <Card key={task.id} className="border-l-4 border-l-[var(--fd-amber)] bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] transition hover:border-[var(--fd-border)]/80">
                      <button
                        onClick={() => toggleTaskCollapse(task.id)}
                        className="w-full text-left focus:outline-none p-4 flex items-center justify-between"
                      >
                        <div>
                          <p className="font-extrabold text-sm text-[var(--fd-text)]">
                            {task.tip} — <span className="text-[var(--fd-accent)] font-[var(--fd-fontmono)]">{task.plaka}</span>
                          </p>
                          <p className="text-xs text-[var(--fd-text2)] mt-1">
                            Atanan Sicil: <span className="font-[var(--fd-fontmono)] text-[var(--fd-text)]">{task.atanan}</span> · {new Date(task.tarih).toLocaleDateString("tr-TR")}
                          </p>
                          {task.notlar && (
                            <p className="text-xs text-[var(--fd-amber)] italic mt-1 font-medium">Not: {task.notlar}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge className={`${badgeInfo.bgClass} ${badgeInfo.borderClass} ${badgeInfo.textClass} border px-2 py-0.5 rounded-lg text-xs`}>
                            {badgeInfo.label}
                          </Badge>
                          {isOpen ? <ChevronUp className="w-4 h-4 text-[var(--fd-text2)]" /> : <ChevronDown className="w-4 h-4 text-[var(--fd-text2)]" />}
                        </div>
                      </button>

                      {isOpen && (
                        <CardContent className="pt-0 px-4 pb-4 border-t border-[var(--fd-border)]/50 pt-4">
                          {!isFilling ? (
                            <div className="space-y-4">
                              <div className="bg-[var(--fd-surface2)]/60 p-4 rounded-xl border border-[var(--fd-border)]/50 space-y-2.5">
                                <p className="text-xs font-semibold text-[var(--fd-accent)] uppercase tracking-wider">Kontrol Edilecek Maddeler:</p>
                                {(task.checklist || []).map((c, i) => (
                                  <div key={i} className="flex items-center gap-2 text-sm text-[var(--fd-text)]">
                                    <span className="text-[var(--fd-text2)] font-bold">•</span>
                                    <span>{c.soru}</span>
                                    <Badge variant="outline" className="scale-75 origin-left text-[var(--fd-text2)] border-[var(--fd-border)]">
                                      {c.tip === 'boolean' ? 'Checklist' : c.tip === 'numeric' ? 'Sayısal' : c.tip === 'text' ? 'Açıklama' : 'Fotoğraf'}
                                    </Badge>
                                    {c.zorunlu && <span className="text-[10px] text-[var(--fd-danger)] font-extrabold bg-[rgba(220,38,38,0.1)] px-1 border border-[rgba(220,38,38,0.2)] rounded">Zorunlu</span>}
                                  </div>
                                ))}
                              </div>
                              <Button
                                onClick={() => startFilling(task)}
                                className="w-full bg-[var(--fd-accent)] hover:opacity-90 text-white font-bold h-10 rounded-[var(--fd-r-sm)]"
                              >
                                Görevi Gerçekleştir / Formu Doldur
                              </Button>
                            </div>
                          ) : (
                            <div className="space-y-5 bg-[var(--fd-surface2)]/30 p-5 rounded-xl border border-[var(--fd-border)]/50">
                              <h3 className="font-bold text-sm text-[var(--fd-accent)] border-b border-[var(--fd-border)]/50 pb-3">Devir-Teslim / Kontrol Giriş Formu</h3>
                              {(task.checklist || []).map(c => (
                                <div key={c.id} className="space-y-2 border-b border-[var(--fd-border)]/30 pb-4 last:border-0 last:pb-0">
                                  <p className="text-xs font-bold text-[var(--fd-text)] flex items-center gap-1.5">
                                    {c.soru}
                                    {c.zorunlu && <span className="text-[9px] font-bold bg-[rgba(220,38,38,0.1)] text-[var(--fd-danger)] border border-[rgba(220,38,38,0.2)] rounded px-1.5 py-0.5">ZORUNLU</span>}
                                  </p>

                                  {c.tip === 'boolean' && (
                                    <div className="grid grid-cols-2 gap-3 max-w-sm pt-1">
                                      <button
                                        type="button"
                                        onClick={() => setFilledValues({...filledValues, [c.id]: true})}
                                        className={`flex items-center justify-center gap-2 min-h-[44px] rounded-lg border font-bold text-xs transition-all active:scale-[0.97] ${
                                          filledValues[c.id] === true
                                            ? 'bg-[rgba(22,163,74,0.1)] border-[rgba(22,163,74,0.3)] text-[var(--fd-success)]'
                                            : 'border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text2)] hover:border-[var(--fd-success)]/20'
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
                                            ? 'bg-[rgba(220,38,38,0.1)] border-[rgba(220,38,38,0.3)] text-[var(--fd-danger)]'
                                            : 'border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text2)] hover:border-[var(--fd-danger)]/20'
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
                                      className="max-w-sm border-[var(--fd-border)] bg-[var(--fd-surface2)] rounded-[var(--fd-r-sm)] text-[var(--fd-text)] h-9"
                                    />
                                  )}

                                  {c.tip === 'text' && (
                                    <Input
                                      type="text"
                                      placeholder="Açıklama, tespit notu..."
                                      value={filledValues[c.id] || ''}
                                      onChange={e => setFilledValues({...filledValues, [c.id]: e.target.value})}
                                      className="border-[var(--fd-border)] bg-[var(--fd-surface2)] rounded-[var(--fd-r-sm)] text-[var(--fd-text)] h-9"
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

                              <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-[var(--fd-border)]/50">
                                <Button
                                  variant="ghost"
                                  onClick={() => setFillingTaskId(null)}
                                  className="text-[var(--fd-text2)] hover:text-[var(--fd-text)] hover:bg-[var(--fd-surface2)]"
                                >
                                  İptal Et
                                </Button>
                                <Button
                                  onClick={() => handleFillSubmit(task.id)}
                                  className="bg-[var(--fd-success)] hover:opacity-90 text-white font-bold h-10 px-5 rounded-[var(--fd-r-sm)] shadow-[var(--fd-shadow-sm)]"
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
                  <p className="text-[var(--fd-text2)] text-xs italic py-6 text-center border border-dashed border-[var(--fd-border)] rounded-[var(--fd-r)] bg-[var(--fd-surface2)]/20">
                    Şu anda aktif görev veya beklemede olan devir-teslim kaydı bulunmamaktadır.
                  </p>
                )}
              </div>
            </div>

            {/* Tamamlanan Görevler */}
            <div className="space-y-3 pt-4">
              <h2 className="text-lg font-bold text-[var(--fd-text)] flex items-center gap-2">
                <CheckSquare className="w-4.5 h-4.5 text-[var(--fd-success)]" />
                Tamamlanan / Teslim Alınan Görevler ({completedTasks.length})
              </h2>

              <div className="grid grid-cols-1 gap-3">
                {completedTasks.map(task => {
                  const isOpen = expandedId === task.id
                  const badgeInfo = DURUM_BADGE[task.durum] || { label: "Tamamlandı", bgClass: "bg-[rgba(22,163,74,0.1)]", borderClass: "border-[rgba(22,163,74,0.2)]", textClass: "text-[var(--fd-success)]" }

                  return (
                    <Card key={task.id} className="opacity-80 hover:opacity-100 transition-opacity bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)]">
                      <button
                        onClick={() => toggleTaskCollapse(task.id)}
                        className="w-full text-left p-4 flex items-center justify-between"
                      >
                        <div>
                          <p className="font-extrabold text-sm text-[var(--fd-text)]">
                            {task.tip} — <span className="text-[var(--fd-accent)] font-[var(--fd-fontmono)]">{task.plaka}</span>
                          </p>
                          <p className="text-xs text-[var(--fd-text2)] mt-1">
                            Atanan Personel: <span className="font-[var(--fd-fontmono)] text-[var(--fd-text2)]">{task.atanan}</span> · {new Date(task.tarih).toLocaleDateString("tr-TR")}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge className={`${badgeInfo.bgClass} ${badgeInfo.borderClass} ${badgeInfo.textClass} border px-2 py-0.5 rounded-lg text-xs`}>
                            {badgeInfo.label}
                          </Badge>
                          {isOpen ? <ChevronUp className="w-4 h-4 text-[var(--fd-text2)]" /> : <ChevronDown className="w-4 h-4 text-[var(--fd-text2)]" />}
                        </div>
                      </button>

                      {isOpen && (
                        <CardContent className="pt-0 px-4 pb-4 border-t border-[var(--fd-border)]/50 pt-4">
                          <div className="bg-[var(--fd-surface2)]/60 p-4 rounded-xl border border-[var(--fd-border)]/50 space-y-2">
                            {(task.checklist || []).map((c, idx) => (
                              <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[var(--fd-border)]/30 last:border-0 pb-2 last:pb-0 gap-1.5">
                                <span className="text-xs font-bold text-[var(--fd-text2)]">{c.soru}</span>
                                <span>
                                  {c.tip === 'boolean' ? (
                                    c.deger === true ? (
                                      <Badge variant="success" className="font-bold px-2 py-0.5 rounded">Evet</Badge>
                                    ) : (
                                      <Badge variant="danger" className="font-bold px-2 py-0.5 rounded">Hayır</Badge>
                                    )
                                  ) : c.tip === 'image' ? (
                                    c.deger ? (
                                      <a
                                        href={c.deger}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-xs text-[var(--fd-accent)] hover:underline flex items-center gap-1 font-bold"
                                      >
                                        <ImageIcon className="w-3.5 h-3.5" /> Fotoğrafı Görüntüle
                                      </a>
                                    ) : (
                                      <span className="text-xs text-[var(--fd-text2)] font-medium">Fotoğraf Eklenmedi</span>
                                    )
                                  ) : (
                                    <span className="font-[var(--fd-fontmono)] bg-[var(--fd-surface2)] border border-[var(--fd-border)] px-2 py-0.5 rounded text-xs text-[var(--fd-text2)]">
                                      {c.deger || '—'}
                                    </span>
                                  )}
                                </span>
                              </div>
                            ))}
                          </div>
                          {task.tamamlanma_tarihi && (
                            <p className="text-[10px] text-[var(--fd-text2)] text-right mt-2 font-[var(--fd-fontmono)]">
                              Tamamlanma: {new Date(task.tamamlanma_tarihi).toLocaleString("tr-TR")}
                            </p>
                          )}
                        </CardContent>
                      )}
                    </Card>
                  )
                })}

                {completedTasks.length === 0 && (
                  <p className="text-[var(--fd-text3)] text-xs italic py-6 text-center border border-dashed border-[var(--fd-border)] rounded-[var(--fd-r)] bg-[var(--fd-surface2)]/20">
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
                    className="bg-[var(--fd-accent)] hover:opacity-90 text-white font-bold text-xs px-3.5 py-2 h-9 rounded-[var(--fd-r-sm)] flex items-center gap-1.5 shadow-[var(--fd-shadow-sm)] hover:scale-[1.02] transition duration-150 shrink-0"
                  >
                    {isBuilding ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    {isBuilding ? "Şablon Oluşturucuyu Kapat" : "Yeni Görev Şablonu Oluştur"}
                  </Button>
                </div>

                {isBuilding && (
                  <Card className="border-[var(--fd-border)] bg-[var(--fd-surface)] border p-4 rounded-[var(--fd-r)] shadow-[var(--fd-shadow-sm)] animate-in slide-in-from-top duration-200">
                    <CardHeader className="pb-4 border-b border-[var(--fd-border)]/50">
                      <CardTitle className="text-sm font-bold flex items-center gap-2 text-[var(--fd-accent)]">
                        <ListChecks className="w-4 h-4" /> Yeni Görev / Kontrol Listesi Şablonu Oluşturucu
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase text-[var(--fd-text2)]">Şablon Başlığı</label>
                          <Input
                            value={baslik}
                            onChange={e => setBaslik(e.target.value)}
                            placeholder="Örn: Arazöz Malzeme Kontrol Listesi"
                            className="h-10 border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text)] focus:border-[var(--fd-accent)] rounded-[var(--fd-r-sm)]"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase text-[var(--fd-text2)]">Görev Tipi</label>
                          <select
                            value={tplTip}
                            onChange={e => setTplTip(e.target.value)}
                            className="flex h-10 w-full rounded-[var(--fd-r-sm)] border border-[var(--fd-border)] bg-[var(--fd-surface2)] px-3 py-2 text-sm text-[var(--fd-text)] outline-none focus:border-[var(--fd-accent)]"
                          >
                            <option value="devir_teslim">Devir Teslim Formu</option>
                            <option value="gunluk_kontrol">Periyodik Kontrol Formu</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase text-[var(--fd-text2)]">Raporlama Periyodu</label>
                          <select
                            value={periyot}
                            onChange={e => setPeriyot(e.target.value)}
                            className="flex h-10 w-full rounded-[var(--fd-r-sm)] border border-[var(--fd-border)] bg-[var(--fd-surface2)] px-3 py-2 text-sm text-[var(--fd-text)] outline-none focus:border-[var(--fd-accent)]"
                          >
                            <option value="gunluk">Günlük Kontrol</option>
                            <option value="haftalik">Haftalık Kontrol</option>
                            <option value="aylik">Aylık Kontrol</option>
                          </select>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h3 className="font-extrabold text-sm text-[var(--fd-text)] border-b border-[var(--fd-border)]/50 pb-2">Kontrol Maddeleri (Sorular)</h3>
                        {sorular.map((s, idx) => (
                          <div key={s.id} className="flex flex-col sm:flex-row gap-3 items-start sm:items-center p-3 border border-[var(--fd-border)]/50 rounded-lg bg-[var(--fd-surface2)]/40">
                            <span className="font-[var(--fd-fontmono)] text-[var(--fd-text2)] font-bold w-6 text-sm">{idx + 1}.</span>
                            
                            <Input
                              className="flex-1 h-9 border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text)] focus:border-[var(--fd-accent)] rounded-[var(--fd-r-sm)] text-sm"
                              placeholder="Örn: Su tankı vana kontrolleri yapıldı mı? Kılavuz feneri yerinde mi?"
                              value={s.soru}
                              onChange={e => handleSoruChange(s.id, 'soru', e.target.value)}
                            />
                            
                            <div className="flex items-center gap-2 w-full sm:w-auto">
                              <select
                                value={s.tip}
                                onChange={e => handleSoruChange(s.id, 'tip', e.target.value)}
                                className="h-9 rounded-lg border border-[var(--fd-border)] bg-[var(--fd-surface2)] px-3 py-1 text-xs text-[var(--fd-text)] outline-none focus:border-[var(--fd-accent)]"
                              >
                                <option value="boolean">Checkbox (Evet/Hayır)</option>
                                <option value="numeric">Sayısal Veri (Örn: KM, Basınç)</option>
                                <option value="text">Serbest Metin Notu</option>
                                <option value="image">Fotoğraf Kanıtı Yükleme</option>
                              </select>

                              <label className="flex items-center gap-2 text-xs cursor-pointer border border-[var(--fd-border)] p-2 h-9 rounded-lg whitespace-nowrap bg-[var(--fd-surface2)] text-[var(--fd-text2)]">
                                <input
                                  type="checkbox"
                                  checked={s.zorunlu}
                                  onChange={e => handleSoruChange(s.id, 'zorunlu', e.target.checked)}
                                  className="accent-[var(--fd-accent)] rounded"
                                />
                                Zorunlu
                              </label>

                              {sorular.length > 1 && (
                                <Button
                                  variant="danger"
                                  size="icon"
                                  onClick={() => handleRemoveSoru(s.id)}
                                  className="h-9 w-9 shrink-0 bg-[var(--fd-danger)] hover:opacity-90 text-white rounded-lg"
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
                          className="border-dashed border-[var(--fd-border)] text-[var(--fd-accent)] hover:bg-[var(--fd-surface2)] w-full rounded-[var(--fd-r)]"
                        >
                          <Plus className="w-4 h-4 mr-1.5" /> Kontrol Maddesi Ekle
                        </Button>
                      </div>

                      <div className="flex justify-end gap-3 pt-4 border-t border-[var(--fd-border)]/50">
                        <Button
                          variant="ghost"
                          onClick={() => setIsBuilding(false)}
                          className="text-[var(--fd-text2)] hover:text-[var(--fd-text)] hover:bg-[var(--fd-surface2)]"
                        >
                          İptal
                        </Button>
                        <Button
                          onClick={handleSaveTemplate}
                          disabled={savingTemplate}
                          className="bg-[var(--fd-accent)] hover:opacity-90 text-white font-bold h-10 px-6 rounded-[var(--fd-r-sm)]"
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
              <div className="bg-[var(--fd-surface2)]/20 border border-[var(--fd-border)] rounded-[var(--fd-r)] p-4 text-center">
                <p className="text-[var(--fd-text2)] text-xs italic">
                  💡 Personel yetki modundasınız. Yeni şablon oluşturma adımları ve aktif/pasif kilitleri sadece <b>Müdür</b> yetkisinde olup, bu alanı salt-okunur modda inceliyorsunuz.
                </p>
              </div>
            )}

            {/* Şablon Kart Listesi */}
            <div className="grid gap-4 md:grid-cols-2">
              {(templates || []).map(t => (
                <Card
                  key={t.id}
                  className={`bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] p-5 ${
                    t.aktif
                      ? "border-l-4 border-l-[var(--fd-success)]"
                      : "opacity-75 border-l-4 border-l-[var(--fd-border-strong)]"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-extrabold text-base text-[var(--fd-text)]">{t.baslik}</h3>
                      <div className="flex gap-2 mt-2">
                        <Badge variant="outline" className="text-[var(--fd-text2)] border-[var(--fd-border)] font-bold scale-90 origin-left">
                          {t.tip === 'devir_teslim' ? 'Devir Teslim' : 'Periyodik Kontrol'}
                        </Badge>
                        <Badge variant="outline" className="text-[var(--fd-text2)] border-[var(--fd-border)] font-bold scale-90 origin-left">
                          {t.periyot === 'gunluk' ? 'Günlük' : t.periyot === 'haftalik' ? 'Haftalık' : 'Aylık'}
                        </Badge>
                        <Badge className={`${t.aktif ? 'bg-[rgba(22,163,74,0.1)] text-[var(--fd-success)] border-[rgba(22,163,74,0.2)]' : 'bg-[var(--fd-surface2)] text-[var(--fd-text2)] border-[var(--fd-border)]'} border font-bold scale-90 origin-left`}>
                          {t.aktif ? "Aktif" : "Pasif"}
                        </Badge>
                      </div>
                    </div>
                    {isMudur && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleTemplateActive(t.id, t.aktif)}
                        className={`text-xs font-bold rounded-lg ${t.aktif ? 'text-[var(--fd-danger)] hover:bg-[rgba(220,38,38,0.1)]' : 'text-[var(--fd-success)] hover:bg-[rgba(22,163,74,0.1)]'}`}
                      >
                        {t.aktif ? "Devre Dışı Bırak" : "Aktifleştir"}
                      </Button>
                    )}
                  </div>

                  <div className="mt-4 pt-4 border-t border-[var(--fd-border)]/50 space-y-2">
                    <p className="text-xs font-semibold text-[var(--fd-accent)] uppercase tracking-wider mb-2.5">
                      {t.sorular ? t.sorular.length : 0} Adet Madde Girişi:
                    </p>
                    {(t.sorular || []).slice(0, 4).map((s, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs text-[var(--fd-text2)]">
                        <span className="text-[var(--fd-text2)]">•</span>
                        <span className="truncate flex-1">{s.soru}</span>
                        <Badge variant="outline" className="scale-75 origin-right border-[var(--fd-border)] text-[var(--fd-text2)]">
                          {s.tip === 'boolean' ? 'Checkbox' : s.tip === 'numeric' ? 'Sayısal' : s.tip === 'text' ? 'Metin' : 'Fotoğraf'}
                        </Badge>
                        {s.zorunlu && <span className="text-[9px] text-[var(--fd-danger)] font-extrabold border border-[var(--fd-danger)]/20 bg-[rgba(220,38,38,0.1)] px-1 rounded">Zorunlu</span>}
                      </div>
                    ))}
                    {t.sorular && t.sorular.length > 4 && (
                      <p className="text-[10px] text-[var(--fd-text2)] italic mt-2.5">+ {t.sorular.length - 4} kontrol maddesi daha mevcuttur.</p>
                    )}
                  </div>
                </Card>
              ))}

              {templates.length === 0 && (
                <div className="col-span-full py-12 text-center border border-dashed border-[var(--fd-border)] rounded-[var(--fd-r)] bg-[var(--fd-surface2)]/20 text-[var(--fd-text2)] text-sm">
                  Kayıtlı aktif bir görev kontrol şablonu bulunmamaktadır.
                </div>
              )}
            </div>

          </div>
        )}

        {/* ═══ TAB 3: DIŞ GÖREVLER (HARİTA & HAVA GÖREVLERİ) ═══ */}
        {activeTab === 'dis_gorevler' && (
          <div className="space-y-6">
            {/* Müdür Hızlı Dış Görev Ekle Butonu */}
            {isMudur && (
              <div className="space-y-4">
                <div className="flex justify-end">
                  <Button
                    onClick={() => setShowAddMissionForm(!showAddMissionForm)}
                    className="bg-[var(--fd-accent)] hover:opacity-90 text-white font-bold text-xs px-3.5 py-2 h-9 rounded-[var(--fd-r-sm)] flex items-center gap-1.5 shadow-[var(--fd-shadow-sm)] hover:scale-[1.02] transition duration-150 shrink-0"
                  >
                    {showAddMissionForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    {showAddMissionForm ? "Görevi İptal Et" : "Yeni Dış Görev Ata"}
                  </Button>
                </div>

                {showAddMissionForm && (
                  <Card className="border-[var(--fd-border)] bg-[var(--fd-surface)] border p-4 rounded-[var(--fd-r)] shadow-[var(--fd-shadow-sm)] animate-in slide-in-from-top duration-200">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-bold text-[var(--fd-accent)] flex items-center gap-2">
                        <ClipboardList className="w-4 h-4" /> Yeni Dış Görev Atama Paneli
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <form onSubmit={handleCreateExternalMission} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-[var(--fd-text3)]">Görev Türü</label>
                            <select
                               value={addMissionForm.gorev_turu}
                               onChange={e => setAddMissionForm({...addMissionForm, gorev_turu: e.target.value})}
                               required
                               className="flex h-10 w-full rounded-[var(--fd-r-sm)] border border-[var(--fd-border)] bg-[var(--fd-surface2)] px-3 py-2 text-sm text-[var(--fd-text2)] outline-none focus:border-[var(--fd-accent)]"
                            >
                              <option value="Sosyal Görev">Sosyal Görev</option>
                              <option value="Lojistik Sevk">Lojistik Sevk</option>
                              <option value="Yangın / Arazöz Görevi">Yangın / Arazöz Görevi</option>
                              <option value="Arama Kurtarma Sevk">Arama Kurtarma Sevk</option>
                              <option value="Eğitim / Tatbikat">Eğitim / Tatbikat</option>
                              <option value="Refakat / Protokol">Refakat / Protokol</option>
                              <option value="Diğer Dış Görev">Diğer Dış Görev</option>
                            </select>
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-[var(--fd-text3)]">Görev Başlığı</label>
                            <Input
                              placeholder="Örn: Kent Meydanı Sosyal Çadır Refakatı"
                              value={addMissionForm.baslik}
                              onChange={e => setAddMissionForm({...addMissionForm, baslik: e.target.value})}
                              required
                              className="h-10 border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text)] focus:border-[var(--fd-accent)] rounded-[var(--fd-r-sm)]"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-[var(--fd-text3)]">Görevli Araç (Plaka)</label>
                            <select
                               value={addMissionForm.plaka}
                               onChange={e => setAddMissionForm({...addMissionForm, plaka: e.target.value})}
                               className="flex h-10 w-full rounded-[var(--fd-r-sm)] border border-[var(--fd-border)] bg-[var(--fd-surface2)] px-3 py-2 text-sm text-[var(--fd-text2)] outline-none focus:border-[var(--fd-accent)]"
                            >
                              <option value="">Araç Seçiniz (Opsiyonel)</option>
                              {(vehicles || []).map(v => (
                                <option key={v.plaka} value={v.plaka}>
                                  {v.filo_no ? `${v.filo_no} NOLU - ${v.plaka}` : v.plaka}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-[var(--fd-text3)]">Mahalle</label>
                            <Input
                              placeholder="Örn: Yenişehir"
                              value={addMissionForm.mahalle}
                              onChange={e => setAddMissionForm({...addMissionForm, mahalle: e.target.value})}
                              className="h-10 border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text)] focus:border-[var(--fd-accent)] rounded-[var(--fd-r-sm)]"
                            />
                          </div>
                          <div className="space-y-1.5 md:col-span-2">
                            <label className="text-xs font-semibold text-[var(--fd-text3)]">Tam Adres</label>
                            <Input
                              placeholder="Örn: Kent Meydanı Etkinlik Alanı No: 5"
                              value={addMissionForm.adres}
                              onChange={e => setAddMissionForm({...addMissionForm, adres: e.target.value})}
                              className="h-10 border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text)] focus:border-[var(--fd-accent)] rounded-[var(--fd-r-sm)]"
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-[var(--fd-text3)]">Görev Detayı / Açıklama</label>
                          <textarea
                            placeholder="Görevin amacı, personelin yapacağı çalışmalar vb..."
                            value={addMissionForm.detay}
                            onChange={e => setAddMissionForm({...addMissionForm, detay: e.target.value})}
                            className="flex min-h-[80px] w-full rounded-[var(--fd-r-sm)] border border-[var(--fd-border)] bg-[var(--fd-surface2)] px-3 py-2 text-sm text-[var(--fd-text)] outline-none focus:border-[var(--fd-accent)] resize-y"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-[var(--fd-text3)] block mb-1">Görevlendirilecek Personeller</label>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-[160px] overflow-y-auto p-3 bg-[var(--fd-surface2)] border border-[var(--fd-border)] rounded-[var(--fd-r)]">
                            {(personnel || []).map(p => {
                              const isChecked = addMissionForm.sicil_nos.includes(p.sicil_no)
                              return (
                                <label key={p.sicil_no} className="flex items-center gap-2 cursor-pointer select-none text-xs text-[var(--fd-text2)] py-1 hover:text-[var(--fd-text)]">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => {
                                      const newStaff = isChecked 
                                        ? addMissionForm.sicil_nos.filter(s => s !== p.sicil_no)
                                        : [...addMissionForm.sicil_nos, p.sicil_no]
                                      setAddMissionForm({...addMissionForm, sicil_nos: newStaff})
                                    }}
                                    className="rounded border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-accent)] focus:ring-[var(--fd-accent)]"
                                  />
                                  <span>{p.ad} {p.soyad}</span>
                                </label>
                              )
                            })}
                          </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-2">
                          <Button
                            type="submit"
                            disabled={addMissionSaving}
                            className="bg-[var(--fd-accent)] hover:opacity-90 text-white h-10 px-6 font-bold text-sm shadow-[var(--fd-shadow-sm)] rounded-[var(--fd-r-sm)]"
                          >
                            {addMissionSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                            Dış Görevi Başlat
                          </Button>
                        </div>
                      </form>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* List of Active External Missions */}
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-[var(--fd-text)] flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--fd-accent)] animate-pulse"></span>
                Aktif Dış Görevler ({activeMissions.length})
              </h2>

              <div className="grid grid-cols-1 gap-3">
                {activeMissions.map(m => {
                  const names = (m.sicil_nos || [])
                    .map((s: string) => {
                      const p = personnel.find(per => per.sicil_no === s)
                      return p ? `${p.ad} ${p.soyad}` : s
                    })
                    .join(', ')

                  return (
                    <Card key={m.id} className="border-l-4 border-l-[var(--fd-accent)] bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-extrabold text-base text-[var(--fd-text)]">{m.baslik}</h3>
                          <Badge className="bg-[var(--fd-accent)]/10 text-[var(--fd-accent)] border border-[var(--fd-accent)]/20 font-bold text-xs py-0.5">
                            {m.gorev_turu}
                          </Badge>
                          {m.plaka && (
                            <Badge className="bg-[var(--fd-surface2)] text-[var(--fd-text2)] border border-[var(--fd-border)] font-bold text-xs py-0.5">
                              🚒 Araç: {m.plaka}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-[var(--fd-text2)] font-medium line-clamp-2">{m.detay || "Detay girilmemiş."}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-y-1 gap-x-4 text-[11px] text-[var(--fd-text2)] font-semibold mt-2 pt-2 border-t border-[var(--fd-border)]/50">
                          <div>📍 Mahalle/Adres: <span className="text-[var(--fd-text)] font-bold">{m.mahalle || '-'}{m.adres ? `, ${m.adres}` : ''}</span></div>
                          <div>🧑🚒 Personel: <span className="text-[var(--fd-text)] font-bold">{names || '-'}</span></div>
                          <div>🕒 Çıkış: <span className="text-[var(--fd-text)] font-bold">{m.cikis_tarihi ? new Date(m.cikis_tarihi).toLocaleString('tr-TR') : '-'}</span></div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                        <Button
                          onClick={() => handleCompleteExternalMission(m.id)}
                          className="bg-[var(--fd-success)] hover:opacity-90 text-white font-bold text-xs h-9 px-3 rounded-[var(--fd-r-sm)] shadow-[var(--fd-shadow-sm)]"
                        >
                          <CheckCircle2 className="w-4 h-4 mr-1" /> Görevi Sonlandır
                        </Button>
                        {isMudur && (
                          <>
                            <Button
                              onClick={() => handleStartEditMission(m)}
                              className="bg-[var(--fd-surface2)] hover:bg-[var(--fd-surface3)] text-[var(--fd-text2)] font-bold text-xs h-9 px-3 rounded-[var(--fd-r-sm)] border border-[var(--fd-border)]"
                            >
                              Düzenle
                            </Button>
                            <Button
                              variant="danger"
                              onClick={() => handleDeleteExternalMission(m.id)}
                              className="font-bold text-xs h-9 px-3 rounded-[var(--fd-r-sm)]"
                            >
                              Sil
                            </Button>
                          </>
                        )}
                      </div>
                    </Card>
                  )
                })}

                {activeMissions.length === 0 && (
                  <p className="text-[var(--fd-text2)] text-xs italic py-6 text-center border border-dashed border-[var(--fd-border)] rounded-[var(--fd-r)] bg-[var(--fd-surface2)]/20">
                    Şu anda aktif devam eden bir dış görev bulunmamaktadır.
                  </p>
                )}
              </div>
            </div>

            {/* List of Completed External Missions */}
            <div className="space-y-3 pt-4">
              <h2 className="text-lg font-bold text-[var(--fd-text)] flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--fd-success)]"></span>
                Tamamlanan Dış Görevler ({completedMissions.length})
              </h2>

              <div className="grid grid-cols-1 gap-3 max-h-[400px] overflow-y-auto pr-1">
                {completedMissions.map(m => {
                  const names = (m.sicil_nos || [])
                    .map((s: string) => {
                      const p = personnel.find(per => per.sicil_no === s)
                      return p ? `${p.ad} ${p.soyad}` : s
                    })
                    .join(', ')

                  return (
                    <Card key={m.id} className="border-l-4 border-l-[var(--fd-success)] bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 opacity-80">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-extrabold text-sm text-[var(--fd-text2)] line-through decoration-[var(--fd-border)]">{m.baslik}</h3>
                          <Badge className="bg-[var(--fd-success)]/10 text-[var(--fd-success)] border border-[var(--fd-success)]/20 font-bold text-[10px] py-0.5">
                            {m.gorev_turu}
                          </Badge>
                          {m.plaka && (
                            <Badge className="bg-[var(--fd-surface2)] text-[var(--fd-text2)] border border-[var(--fd-border)] font-bold text-[10px] py-0.5">
                              🚒 Araç: {m.plaka}
                            </Badge>
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-y-1 gap-x-4 text-[10px] text-[var(--fd-text2)] font-semibold mt-1">
                          <div>📍 Adres: <span className="text-[var(--fd-text2)] font-bold">{m.mahalle || '-'}{m.adres ? `, ${m.adres}` : ''}</span></div>
                          <div>🧑🚒 Personel: <span className="text-[var(--fd-text2)] font-bold">{names || '-'}</span></div>
                          <div>🕒 Çıkış: <span className="text-[var(--fd-text2)] font-bold">{m.cikis_tarihi ? new Date(m.cikis_tarihi).toLocaleString('tr-TR') : '-'}</span></div>
                        </div>
                      </div>
                      {isMudur && (
                        <div className="shrink-0 self-end md:self-center">
                          <Button
                            variant="danger"
                            onClick={() => handleDeleteExternalMission(m.id)}
                            className="font-bold text-[10px] h-7 px-2 rounded-lg"
                          >
                            Sil
                          </Button>
                        </div>
                      )}
                    </Card>
                  )
                })}

                {completedMissions.length === 0 && (
                  <p className="text-[var(--fd-text2)] text-xs italic py-4 text-center">
                    Henüz tamamlanmış bir dış görev kaydı bulunmamaktadır.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ═══ DIŞ GÖREV DÜZENLEME MODAL ═══ */}
      {editMissionModalOpen && editingMission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <Card className="w-full max-w-xl bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] shadow-[var(--fd-shadow-lg)] overflow-hidden my-auto animate-in zoom-in-95 duration-200">
            <CardHeader className="bg-[var(--fd-surface2)]/40 border-b border-[var(--fd-border)] p-4 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-bold text-[var(--fd-text)] flex items-center gap-2">
                ✏️ Dış Görevi Düzenle
              </CardTitle>
              <Button variant="ghost" size="icon" className="text-[var(--fd-text3)] hover:text-[var(--fd-text)]" onClick={handleCloseEditMissionModal}>
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--fd-text3)]">Görev Türü</label>
                  <select
                    value={editMissionForm.gorev_turu}
                    onChange={e => setEditMissionForm({...editMissionForm, gorev_turu: e.target.value})}
                    required
                    className="flex h-10 w-full rounded-[var(--fd-r-sm)] border border-[var(--fd-border)] bg-[var(--fd-surface2)] px-3 py-2 text-sm text-[var(--fd-text2)] outline-none focus:border-[var(--fd-accent)]"
                  >
                    <option value="Sosyal Görev">Sosyal Görev</option>
                    <option value="Lojistik Sevk">Lojistik Sevk</option>
                    <option value="Yangın / Arazöz Görevi">Yangın / Arazöz Görevi</option>
                    <option value="Arama Kurtarma Sevk">Arama Kurtarma Sevk</option>
                    <option value="Eğitim / Tatbikat">Eğitim / Tatbikat</option>
                    <option value="Refakat / Protokol">Refakat / Protokol</option>
                    <option value="Diğer Dış Görev">Diğer Dış Görev</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--fd-text3)]">Görev Başlığı</label>
                  <Input
                    placeholder="Örn: Sosyal Çadır Görevi"
                    value={editMissionForm.baslik}
                    onChange={e => setEditMissionForm({...editMissionForm, baslik: e.target.value})}
                    required
                    className="h-10 border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text)] focus:border-[var(--fd-accent)] rounded-[var(--fd-r-sm)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--fd-text3)]">Görevli Araç (Plaka)</label>
                  <select
                    value={editMissionForm.plaka}
                    onChange={e => setEditMissionForm({...editMissionForm, plaka: e.target.value})}
                    className="flex h-10 w-full rounded-[var(--fd-r-sm)] border border-[var(--fd-border)] bg-[var(--fd-surface2)] px-3 py-2 text-sm text-[var(--fd-text2)] outline-none focus:border-[var(--fd-accent)]"
                  >
                    <option value="">Araç Seçiniz (Opsiyonel)</option>
                    {(vehicles || []).map(v => (
                      <option key={v.plaka} value={v.plaka}>
                        {v.filo_no ? `${v.filo_no} NOLU - ${v.plaka}` : v.plaka}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--fd-text3)]">Mahalle</label>
                  <Input
                    placeholder="Örn: Yenişehir"
                    value={editMissionForm.mahalle}
                    onChange={e => setEditMissionForm({...editMissionForm, mahalle: e.target.value})}
                    className="h-10 border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text)] focus:border-[var(--fd-accent)] rounded-[var(--fd-r-sm)]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[var(--fd-text3)]">Tam Adres</label>
                <Input
                  placeholder="Örn: Kent Meydanı No: 5"
                  value={editMissionForm.adres}
                  onChange={e => setEditMissionForm({...editMissionForm, adres: e.target.value})}
                  className="h-10 border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text)] focus:border-[var(--fd-accent)] rounded-[var(--fd-r-sm)]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[var(--fd-text3)]">Görev Detayı</label>
                <textarea
                  placeholder="Açıklama..."
                  value={editMissionForm.detay}
                  onChange={e => setEditMissionForm({...editMissionForm, detay: e.target.value})}
                  className="flex min-h-[80px] w-full rounded-[var(--fd-r-sm)] border border-[var(--fd-border)] bg-[var(--fd-surface2)] px-3 py-2 text-sm text-[var(--fd-text)] outline-none focus:border-[var(--fd-accent)] resize-y"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[var(--fd-text3)] block mb-1">Görevli Personeller</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[140px] overflow-y-auto p-3 bg-[var(--fd-surface2)] border border-[var(--fd-border)] rounded-[var(--fd-r)]">
                  {(personnel || []).map(p => {
                    const isChecked = editMissionForm.sicil_nos.includes(p.sicil_no)
                    return (
                      <label key={p.sicil_no} className="flex items-center gap-2 cursor-pointer select-none text-xs text-[var(--fd-text2)] py-0.5 hover:text-[var(--fd-text)]">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            const newStaff = isChecked 
                              ? editMissionForm.sicil_nos.filter(s => s !== p.sicil_no)
                              : [...editMissionForm.sicil_nos, p.sicil_no]
                            setEditMissionForm({...editMissionForm, sicil_nos: newStaff})
                          }}
                          className="rounded border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-accent)] focus:ring-[var(--fd-accent)]"
                        />
                        <span>{p.ad} {p.soyad}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            </CardContent>
            <div className="bg-[var(--fd-surface2)]/40 border-t border-[var(--fd-border)] p-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={handleCloseEditMissionModal} className="text-[var(--fd-text3)] hover:text-[var(--fd-text)]">
                Vazgeç
              </Button>
              <Button onClick={handleSaveMissionEdit} disabled={editMissionSaving} className="bg-[var(--fd-accent)] hover:opacity-90 text-white font-bold h-9 px-4 rounded-[var(--fd-r-sm)]">
                {editMissionSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                Değişiklikleri Kaydet
              </Button>
            </div>
          </Card>
        </div>
      )}
    </PageGuard>
  )
}
