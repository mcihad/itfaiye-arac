"use client"

import { useState, useEffect, useMemo } from "react"
import { Personnel } from "@/types"
import { api, getAuthHeaders } from "@/lib/api"
import { isKarargah } from "@/lib/personnelUtils"
import { useAuthStore } from "@/lib/authStore"
import { Input } from "@/components/ui/Input"
import { Button } from "@/components/ui/Button"
import {
  Calendar, X, Loader2, Search, AlertTriangle,
  CheckCircle2, Users, Lock, FileText
} from "lucide-react"

interface LeaveManagementModalProps {
  isOpen: boolean
  onClose: () => void
  personnel: Personnel[]
  onLeaveUpdated?: () => void
}

const LEAVE_TYPES = [
  "İzinli",
  "Yıllık İzin",
  "Mazeret İzni",
  "Raporlu",
  "Geçici Görev",
  "Dış Görev"
]

const normalizeText = (str: string): string => {
  if (!str) return ""
  return str
    .replace(/İ/g, "i").replace(/I/g, "ı").replace(/ı/g, "i")
    .replace(/ğ/g, "g").replace(/Ğ/g, "g")
    .replace(/ü/g, "u").replace(/Ü/g, "u")
    .replace(/ş/g, "s").replace(/Ş/g, "s")
    .replace(/ö/g, "o").replace(/Ö/g, "o")
    .replace(/ç/g, "c").replace(/Ç/g, "c")
    .toLowerCase().trim()
}

export function LeaveManagementModal({ isOpen, onClose, personnel, onLeaveUpdated }: LeaveManagementModalProps) {
  const { user } = useAuthStore()
  const canEdit = user?.rol === 'Admin' || user?.rol === 'Editor'

  const [searchQuery, setSearchQuery] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [leaveType, setLeaveType] = useState("")
  const [leaveNote, setLeaveNote] = useState("")
  const [leaveDays, setLeaveDays] = useState(1)
  const [leaveDate, setLeaveDate] = useState(() => new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeLeaves, setActiveLeaves] = useState<Record<string, any>>({})
  const [stationFilter, setStationFilter] = useState<string>("all")

  // Fetch active leaves for the selected date
  useEffect(() => {
    if (!isOpen) return
    fetchLeaves()
  }, [isOpen, leaveDate])

  const fetchLeaves = async () => {
    setLoading(true)
    try {
      const { data } = await api.from('personnel_leaves')
        .select('*')
        .lte('baslangic_tarihi', leaveDate)
        .gte('bitis_tarihi', leaveDate)

      const map: Record<string, any> = {}
      if (data) {
        data.forEach((l: any) => { map[l.sicil_no] = l })
      }
      setActiveLeaves(map)
    } catch (err) {
      console.error("Leave fetch error:", err)
    } finally {
      setLoading(false)
    }
  }

  // Filter personnel
  const filteredPersonnel = useMemo(() => {
    let list = [...personnel]

    if (stationFilter !== "all") {
      list = list.filter(p => {
        const ist = (p.istasyon || '').toLowerCase()
        const u = (p.unvan || '').toLocaleLowerCase('tr-TR')
        // Karargah: birim alanı (yoksa ünvan tahmini) + merkezde konuşlu santral/112
        const karargahMatch = isKarargah(p) || u.includes('santral') || u.includes('112')
        if (stationFilter === "merkez") return !ist.includes('esentepe') && !ist.includes('organize') && !ist.includes('osb') && !karargahMatch
        if (stationFilter === "esentepe") return ist.includes('esentepe')
        if (stationFilter === "organize") return ist.includes('organize') || ist.includes('osb')
        if (stationFilter === "karargah") return karargahMatch
        return true
      })
    }

    if (searchQuery) {
      const q = normalizeText(searchQuery)
      list = list.filter(p =>
        normalizeText(p.ad).includes(q) ||
        normalizeText(p.soyad).includes(q) ||
        normalizeText(p.sicil_no).includes(q) ||
        normalizeText(p.unvan).includes(q)
      )
    }

    // Sort: on-leave personnel at the bottom
    list.sort((a, b) => {
      const aLeave = !!activeLeaves[a.sicil_no]
      const bLeave = !!activeLeaves[b.sicil_no]
      if (aLeave !== bLeave) return aLeave ? 1 : -1
      return `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, 'tr')
    })

    return list
  }, [personnel, searchQuery, stationFilter, activeLeaves])

  const toggleSelection = (sicilNo: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(sicilNo)) next.delete(sicilNo)
      else next.add(sicilNo)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedIds.size === filteredPersonnel.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredPersonnel.map(p => p.sicil_no)))
    }
  }

  const handleApply = async () => {
    if (!canEdit || selectedIds.size === 0 || !leaveType) return
    setSaving(true)

    try {
      // Tüm izin işlemleri merkezi uçtan yapılır: izin kaydı + personel durumu +
      // özlük kaydı sunucuda tek transaction içinde, her ekranda aynı şekilde yazılır.
      const isCancel = leaveType === "İptal"
      const res = await fetch('/api/leaves', {
        method: isCancel ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(isCancel
          ? { sicil_nos: Array.from(selectedIds), tarih: leaveDate, kaynak: 'Personel Yönetimi Modülü' }
          : {
              sicil_nos: Array.from(selectedIds),
              izin_turu: leaveType,
              baslangic_tarihi: leaveDate,
              gun: leaveDays,
              aciklama: leaveNote,
              kaynak: 'Personel Yönetimi Modülü'
            })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'İşlem başarısız oldu.')

      const failures = (json.results || []).filter((r: any) => !r.ok)
      if (failures.length > 0) {
        alert(`${json.okCount} personel kaydedildi, ${failures.length} personel için işlem BAŞARISIZ oldu.\n\nHata: ${failures[0].error}`)
      } else {
        alert("İzin işlemleri başarıyla kaydedildi.")
      }

      // Refresh (başarısız olanlar seçili kalır, tekrar denenebilir)
      if (failures.length === 0) {
        setSelectedIds(new Set())
        setLeaveType("")
        setLeaveNote("")
        setLeaveDays(1)
      }
      await fetchLeaves()

      if (onLeaveUpdated) {
        onLeaveUpdated()
      }
    } catch (err: any) {
      console.error("Leave save error:", err)
      alert(`Kayıt sırasında bir hata oluştu: ${err?.message || err}`)
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  const onLeaveCount = Object.keys(activeLeaves).length
  const totalCount = personnel.length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-5xl max-h-[92vh] flex flex-col bg-[var(--fd-surface)] rounded-[var(--fd-r-lg)] shadow-[var(--fd-shadow-lg)] border border-[var(--fd-border)] m-3 sm:m-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--fd-border)] bg-[var(--fd-surface2)]/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[var(--fd-accent)]/10 rounded-[var(--fd-r-sm)] text-[var(--fd-accent)]">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--fd-text)]">
                İzin Yönetim Paneli
              </h2>
              <p className="text-xs text-[var(--fd-text3)] mt-0.5">
                Tüm personel izin, rapor ve görevlendirme işlemleri.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {canEdit ? (
              <span className="hidden sm:flex items-center gap-1 text-[10px] font-bold text-[var(--fd-success)] bg-[var(--fd-success)]/10 px-2 py-1 rounded-full border border-[var(--fd-success)]/20">
                <CheckCircle2 className="w-3 h-3" /> Düzenleme Yetkisi
              </span>
            ) : (
              <span className="hidden sm:flex items-center gap-1 text-[10px] font-bold text-[var(--fd-amber)] bg-[var(--fd-amber)]/10 px-2 py-1 rounded-full border border-[var(--fd-amber)]/20">
                <Lock className="w-3 h-3" /> Sadece Görüntüleme
              </span>
            )}
            <button onClick={onClose} className="text-[var(--fd-text3)] hover:text-[var(--fd-text)] transition-colors p-1 bg-transparent border-none cursor-pointer">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Top Controls */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left: Action Panel */}
            <div className="lg:col-span-4 space-y-3">
              <div className="p-4 rounded-[var(--fd-r)] border border-[var(--fd-border)] bg-[var(--fd-surface2)]/30 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--fd-text3)] flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-[var(--fd-accent)]" />
                  İzin İşlemleri
                </h4>

                {/* Date */}
                <div>
                  <label className="text-[10px] font-semibold text-[var(--fd-text3)] uppercase tracking-wider mb-1 block">Tarih</label>
                  <Input
                    type="date"
                    value={leaveDate}
                    onChange={(e) => setLeaveDate(e.target.value)}
                    className="w-full font-mono text-sm"
                    disabled={!canEdit}
                  />
                </div>

                {/* Leave Type */}
                <div>
                  <label className="text-[10px] font-semibold text-[var(--fd-text3)] uppercase tracking-wider mb-1 block">İzin Türü</label>
                  <select
                    value={leaveType}
                    onChange={(e) => setLeaveType(e.target.value)}
                    disabled={!canEdit}
                    className="w-full text-sm h-10 px-3 rounded-[var(--fd-r-sm)] border border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text)] outline-none focus:ring-1 focus:ring-[var(--fd-accent)]/30 disabled:opacity-50 cursor-pointer"
                  >
                    <option value="" disabled>İzin Türü Seçin</option>
                    {LEAVE_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                    <option value="İptal">❌ İzni İptal Et (Hazır)</option>
                  </select>
                </div>

                {/* Days + Note */}
                <div className="flex gap-2">
                  <div className="w-20">
                    <label className="text-[10px] font-semibold text-[var(--fd-text3)] uppercase tracking-wider mb-1 block">Gün</label>
                    <Input
                      type="number"
                      min="1"
                      value={leaveDays}
                      onChange={(e) => setLeaveDays(parseInt(e.target.value) || 1)}
                      className="text-sm"
                      disabled={leaveType === "İptal" || !canEdit}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] font-semibold text-[var(--fd-text3)] uppercase tracking-wider mb-1 block">Açıklama</label>
                    <Input
                      placeholder="Opsiyonel"
                      value={leaveNote}
                      onChange={(e) => setLeaveNote(e.target.value)}
                      className="text-sm"
                      disabled={leaveType === "İptal" || !canEdit}
                    />
                  </div>
                </div>

                {/* Apply button */}
                <Button
                  className="w-full text-sm font-bold"
                  disabled={selectedIds.size === 0 || !leaveType || saving || !canEdit}
                  onClick={handleApply}
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {leaveType === "İptal" ? "İzni İptal Et" : "İzin Kaydet"} ({selectedIds.size} Personel)
                </Button>
              </div>

              {/* Stats Mini Cards */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 rounded-[var(--fd-r-sm)] border border-[var(--fd-border)] bg-[var(--fd-surface)]">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--fd-text3)]">Toplam Personel</div>
                  <div className="text-xl font-bold font-mono text-[var(--fd-text)] mt-1">{totalCount}</div>
                </div>
                <div className="p-3 rounded-[var(--fd-r-sm)] border border-[var(--fd-border)] bg-[var(--fd-surface)]">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--fd-amber)]">İzinli / Raporlu</div>
                  <div className="text-xl font-bold font-mono text-[var(--fd-amber)] mt-1">{onLeaveCount}</div>
                </div>
              </div>
            </div>

            {/* Right: Personnel Table */}
            <div className="lg:col-span-8 space-y-3">
              {/* Search + Station Filter */}
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--fd-text3)]" />
                  <Input
                    placeholder="Personel ara (ad, soyad, sicil no)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 text-sm"
                  />
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {[
                    { key: "all", label: "Tümü" },
                    { key: "merkez", label: "Merkez" },
                    { key: "esentepe", label: "Esentepe" },
                    { key: "organize", label: "Organize" },
                    { key: "karargah", label: "Karargah" },
                  ].map(f => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setStationFilter(f.key)}
                      className={`px-2.5 py-1.5 rounded-[var(--fd-r-sm)] text-[11px] font-bold border transition-all cursor-pointer bg-transparent ${
                        stationFilter === f.key
                          ? 'border-[var(--fd-accent)] bg-[var(--fd-accent)]/10 text-[var(--fd-accent)]'
                          : 'border-[var(--fd-border)] text-[var(--fd-text3)] hover:border-[var(--fd-text2)] hover:bg-[var(--fd-surface2)]'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Table */}
              <div className="rounded-[var(--fd-r)] border border-[var(--fd-border)] bg-[var(--fd-surface)] shadow-[var(--fd-shadow-sm)] overflow-hidden">
                <div className="max-h-[52vh] overflow-y-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-[10px] text-[var(--fd-text3)] uppercase bg-[var(--fd-surface2)]/60 border-b border-[var(--fd-border)] font-bold tracking-wider sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-2.5 w-10">
                          <input
                            type="checkbox"
                            disabled={!canEdit}
                            className="w-4 h-4 cursor-pointer accent-[var(--fd-accent)] disabled:opacity-50 disabled:cursor-not-allowed"
                            checked={selectedIds.size === filteredPersonnel.length && filteredPersonnel.length > 0}
                            onChange={toggleAll}
                          />
                        </th>
                        <th className="px-3 py-2.5">Personel</th>
                        <th className="px-3 py-2.5 hidden sm:table-cell">İstasyon</th>
                        <th className="px-3 py-2.5 hidden sm:table-cell text-center">Posta</th>
                        <th className="px-3 py-2.5">Durum ({leaveDate})</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--fd-border)]/40">
                      {loading ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-10 text-center text-[var(--fd-text3)]">
                            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[var(--fd-accent)]" />
                            <span className="text-xs">Veriler yükleniyor...</span>
                          </td>
                        </tr>
                      ) : filteredPersonnel.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-10 text-center text-[var(--fd-text3)] italic text-xs">
                            Personel bulunamadı.
                          </td>
                        </tr>
                      ) : (
                        filteredPersonnel.map(person => {
                          const hasLeave = !!activeLeaves[person.sicil_no]
                          const leaveData = activeLeaves[person.sicil_no]
                          const isSelected = selectedIds.has(person.sicil_no)

                          return (
                            <tr
                              key={person.sicil_no}
                              onClick={() => canEdit && toggleSelection(person.sicil_no)}
                              className={`transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-[var(--fd-accent)]/[0.06]'
                                  : hasLeave
                                    ? 'bg-[var(--fd-surface2)]/20 opacity-70 hover:opacity-100'
                                    : 'hover:bg-[var(--fd-surface2)]/40'
                              }`}
                            >
                              <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  disabled={!canEdit}
                                  className="w-4 h-4 cursor-pointer accent-[var(--fd-accent)] disabled:opacity-50 disabled:cursor-not-allowed"
                                  checked={isSelected}
                                  onChange={() => toggleSelection(person.sicil_no)}
                                />
                              </td>
                              <td className="px-3 py-2.5">
                                <div className={`font-semibold text-sm ${hasLeave ? 'text-[var(--fd-text3)] line-through' : 'text-[var(--fd-text)]'}`}>
                                  {person.ad} {person.soyad}
                                </div>
                                <div className="text-[10px] text-[var(--fd-text3)] font-mono">{person.unvan} · {person.sicil_no}</div>
                              </td>
                              <td className="px-3 py-2.5 hidden sm:table-cell text-xs text-[var(--fd-text2)]">
                                {(person.istasyon || 'Merkez İtfaiye Müdürlüğü').replace(' İtfaiye Müdürlüğü', '').replace(' Şubesi', '')}
                              </td>
                              <td className="px-3 py-2.5 hidden sm:table-cell text-center">
                                <span className="px-2 py-0.5 rounded-full bg-[var(--fd-surface3)] text-[10px] font-mono font-bold text-[var(--fd-text2)]">
                                  {person.posta_no}
                                </span>
                              </td>
                              <td className="px-3 py-2.5">
                                {hasLeave ? (
                                  <div className="flex flex-col">
                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--fd-amber)] bg-[var(--fd-amber)]/10 px-2 py-1 rounded-full w-fit border border-[var(--fd-amber)]/20">
                                      <AlertTriangle className="w-3 h-3" /> {leaveData.izin_turu}
                                    </span>
                                    {leaveData.aciklama && (
                                      <span className="text-[10px] text-[var(--fd-text3)] mt-1 ml-1 truncate max-w-[180px]">
                                        {leaveData.aciklama}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--fd-success)] bg-[var(--fd-success)]/10 px-2 py-1 rounded-full w-fit border border-[var(--fd-success)]/20">
                                    <CheckCircle2 className="w-3 h-3" /> Hazır
                                  </span>
                                )}
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="text-[10px] text-[var(--fd-text3)] flex items-center gap-1">
                <Users className="w-3 h-3" /> Listelenen: <strong className="text-[var(--fd-text2)]">{filteredPersonnel.length}</strong> personel
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-[var(--fd-surface2)]/40 border-t border-[var(--fd-border)] px-5 py-3 flex items-center justify-between shrink-0">
          <span className="text-[10px] text-[var(--fd-text3)]">
            Bu panelden yapılan tüm izin işlemleri personelin özlük bilgilerine, görevdeki mevcut listesine ve takvime otomatik yansır.
          </span>
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs border-[var(--fd-border)] bg-[var(--fd-surface)] text-[var(--fd-text2)]">
            Kapat
          </Button>
        </div>
      </div>
    </div>
  )
}
