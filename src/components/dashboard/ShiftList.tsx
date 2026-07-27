"use client"

import { useState, useEffect, useMemo } from 'react'
import { FileText, Table as TableIcon, Building2, MapPin, Loader2 } from 'lucide-react'
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { exportShiftListToPDF, exportShiftListToExcel } from "@/lib/exportUtils"
import { STATION_SHIFT_TIMES, normalizeStationName } from "@/lib/shiftUtils"
import { Personnel } from "@/types"
import { useAuthStore } from "@/lib/authStore"
import { api, unwrap } from "@/lib/api"

// ─── Hiyerarşik Rütbe Sıralaması ───────────────────────────
function getUnvanPriority(unvan: string): number {
  const u = (unvan || '').toLowerCase().replace(/\./g, '');
  if (u.includes('müdür')) return 0;
  if (u.includes('amir')) return 1;
  if (u.includes('başçavuş') || u.includes('baş çvş') || u === 'başçvş') return 2;
  if (u.includes('eğitim çavuşu')) return 3;
  if (u.includes('çavuş') || u.includes('çvş')) return 3;
  if (u.includes('santral')) return 4;
  if (u.includes('baş şoför') || u.includes('başşoför') || u.includes('posbaş şof') || u.includes('posbaş şoför') || u.includes('post baş şoför')) return 5;
  if (u.includes('şoför') || u.includes('şof')) return 6;
  if (u.includes('er') || u.includes('itfaiye eri') || u.includes('İtfaiye eri')) return 7;
  return 8;
}

function sortByHierarchy(list: Personnel[]): Personnel[] {
  return [...list].sort((a, b) => {
    // Raporlu, İzinli veya Dış Görev olanları listenin en altına grupla
    const durumA = (a.durum || '').toLowerCase();
    const durumB = (b.durum || '').toLowerCase();
    const isAbsentA = durumA.includes('izinli') || durumA.includes('raporlu') || durumA.includes('dış görev');
    const isAbsentB = durumB.includes('izinli') || durumB.includes('raporlu') || durumB.includes('dış görev');
    
    if (isAbsentA !== isAbsentB) {
      return isAbsentA ? 1 : -1;
    }

    const pa = getUnvanPriority(a.unvan);
    const pb = getUnvanPriority(b.unvan);
    if (pa !== pb) return pa - pb;
    return (a.ad || '').localeCompare(b.ad || '', 'tr');
  });
}

// ─── Station grouping config ──────────────────────────────
interface StationGroup {
  key: string
  label: string
  icon: React.ReactNode
  color: string
  borderColor: string
  bgColor: string
  match: (istasyon?: string) => boolean
}

const STATION_GROUPS: StationGroup[] = [
  {
    key: 'merkez',
    label: 'Merkez İtfaiye Müdürlüğü',
    icon: <Building2 className="w-4 h-4" />,
    color: 'text-cyan-400',
    borderColor: 'border-cyan-500/30',
    bgColor: 'bg-cyan-500/5',
    match: (ist) => !ist || ist.includes('Merkez'),
  },
  {
    key: 'esentepe',
    label: 'Esentepe Şubesi',
    icon: <MapPin className="w-4 h-4" />,
    color: 'text-amber-400',
    borderColor: 'border-amber-500/30',
    bgColor: 'bg-amber-500/5',
    match: (ist) => !!ist && ist.includes('Esentepe'),
  },
  {
    key: 'organize',
    label: 'Organize Sanayi Bölgesi Şubesi',
    icon: <MapPin className="w-4 h-4" />,
    color: 'text-emerald-400',
    borderColor: 'border-emerald-500/30',
    bgColor: 'bg-emerald-500/5',
    match: (ist) => !!ist && (ist.includes('Organize') || ist.includes('OSB')),
  },
]

export function ShiftList({ personnel, activePosta, onPersonnelUpdate, customTimes }: { personnel: Personnel[], activePosta: number, onPersonnelUpdate?: (sicilNo: string, finalStatus: string) => void, customTimes?: any }) {
  const { user } = useAuthStore()
  const canEdit = user?.rol === 'Admin' || user?.rol === 'Editor'
  const [list, setList] = useState<Personnel[]>(personnel)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [explanations, setExplanations] = useState<Record<string, string>>({})
  const [activeStationKey, setActiveStationKey] = useState<string>('merkez')

  useEffect(() => {
    setList(personnel)
  }, [personnel])

  useEffect(() => {
    const newExps: Record<string, string> = {};
    list.forEach(p => {
      const parts = (p.durum || '').split(' - ');
      newExps[p.sicil_no] = parts.slice(1).join(' - ');
    });
    setExplanations(newExps);
  }, [list])

  const isAuthorized = user && (
    user.rol === 'Admin' || 
    user.rol === 'Editor' ||
    (user.unvan || '').toLowerCase().includes('müdür') ||
    (user.unvan || '').toLowerCase().includes('amir') || 
    (user.unvan || '').toLowerCase().includes('çavuş') ||
    (user.unvan || '').toLowerCase().includes('çvş')
  ) && !(
    (user.unvan || '').toLowerCase() === 'er' || 
    (user.unvan || '').toLowerCase() === 'itfaiye eri'
  )

  // Durum açıklamasına göre personelin geçici görev yaptığı aktif istasyonu bulur
  const getActiveIstasyon = (p: Personnel): string => {
    if (p.durum && p.durum.startsWith('Geçici Şube Görevi')) {
      const parts = p.durum.split(' - ');
      if (parts.length > 1) {
        const branchName = parts[1].toLowerCase();
        if (branchName.includes('esentepe')) {
          return 'Esentepe Şubesi';
        }
        if (branchName.includes('organize') || branchName.includes('osb')) {
          return 'Organize Sanayi Bölgesi Şubesi';
        }
        if (branchName.includes('merkez')) {
          return 'Merkez İtfaiye Müdürlüğü';
        }
      }
    }
    return p.istasyon || '';
  };

  // Group personnel by station, then sort each group
  const groupedStations = useMemo(() => {
    return STATION_GROUPS.map(station => ({
      ...station,
      personnel: sortByHierarchy(list.filter(p => station.match(getActiveIstasyon(p)))),
    })).filter(g => g.personnel.length > 0)
  }, [list])

  useEffect(() => {
    if (groupedStations.length > 0 && !groupedStations.some(g => g.key === activeStationKey)) {
      setActiveStationKey(groupedStations[0].key)
    }
  }, [groupedStations, activeStationKey])

  const handleExportPDF = () => {
    if (!list || list.length === 0) {
      alert("Kayıtlı aktif nöbetçi posta listesi bulunamadı");
      return;
    }
    exportShiftListToPDF(list, activePosta);
  };

  const handleExportExcel = () => {
    if (!list || list.length === 0) {
      alert("Kayıtlı aktif nöbetçi posta listesi bulunamadı");
      return;
    }
    exportShiftListToExcel(list, activePosta);
  };

  const logPersonnelMovement = async (sicilNo: string, statusBase: string, explanation: string) => {
    const person = list.find(p => p.sicil_no === sicilNo);
    const stationName = person?.istasyon;
    const stationKey = normalizeStationName(stationName);
    const shiftTime = (customTimes && customTimes[stationKey]) || STATION_SHIFT_TIMES[stationKey];

    const shiftDate = new Date();
    if (shiftDate.getHours() < shiftTime.hours || 
       (shiftDate.getHours() === shiftTime.hours && shiftDate.getMinutes() < shiftTime.minutes)) {
      shiftDate.setDate(shiftDate.getDate() - 1);
    }
    const todayStr = shiftDate.toLocaleDateString("en-CA");
    
    // 1. Log in personnel_leaves if the status is leave, sick, temporary duty, or external duty
    const isTrackableStatus = statusBase === 'İzinli' || statusBase === 'Raporlu' || 
      statusBase === 'Geçici Şube Görevi' || statusBase.startsWith('Dış Görev');
    
    if (isTrackableStatus) {
      try {
        const izinTuru = statusBase.startsWith('Dış Görev') ? 'Dış Görev' : statusBase;
        const { data: existingLeaves } = await api.from('personnel_leaves')
          .select('id')
          .eq('sicil_no', sicilNo)
          .lte('baslangic_tarihi', todayStr)
          .gte('bitis_tarihi', todayStr)
          .eq('izin_turu', izinTuru);

        if (!existingLeaves || existingLeaves.length === 0) {
          unwrap(await api.insert('personnel_leaves', {
            sicil_no: sicilNo,
            izin_turu: izinTuru,
            baslangic_tarihi: todayStr,
            bitis_tarihi: todayStr,
            aciklama: explanation || `${statusBase} durumu seçildi.`,
            durum: 'Onaylandı'
          }));
        } else {
          unwrap(await api.update('personnel_leaves', {
            aciklama: explanation || `${statusBase} durumu seçildi.`
          }, { id: existingLeaves[0].id }));
        }
      } catch (e: any) {
        console.error("Failed to log leave movement:", e);
        alert(`Uyarı: Personel durumu güncellendi ancak izin defterine kayıt YAZILAMADI:\n${e?.message || e}\n\nİzin listesi ile nöbet listesi tutarsız kalabilir.`);
      }
    }

    // 2. Chronological movement log in personnel_records (Hizmet Dökümü)
    try {
      let logMessage = '';
      if (statusBase === 'Hazır') {
        logMessage = 'Günlük nöbet durumu "Hazır" olarak güncellendi.';
      } else if (statusBase === 'Geçici Şube Görevi') {
        logMessage = `Geçici şube görevi atandı. Şube: ${explanation || 'Belirtilmemiş'}`;
      } else {
        logMessage = `Günlük durumu "${statusBase}" olarak değiştirildi. Açıklama: ${explanation || 'Belirtilmemiş'}`;
      }

      unwrap(await api.insert('personnel_records', {
        sicil_no: sicilNo,
        kayit_turu: 'Nöbet Hareketi',
        tarih: todayStr,
        aciklama: logMessage
      }));
    } catch (e: any) {
      console.error("Failed to log personnel record movement:", e);
      alert(`Uyarı: Personel durumu güncellendi ancak hizmet dökümüne hareket kaydı YAZILAMADI:\n${e?.message || e}`);
    }
  };

  const handleStatusChange = async (sicilNo: string, newStatusBase: string, customExp?: string) => {
    setUpdatingId(sicilNo)
    try {
      const currentExp = customExp !== undefined ? customExp : (explanations[sicilNo] || '');
      let finalStatus = newStatusBase;
      if (newStatusBase !== 'Hazır' && currentExp.trim()) {
        finalStatus = `${newStatusBase} - ${currentExp.trim()}`;
      }

      const res = await api.update('personnel', { durum: finalStatus }, { sicil_no: sicilNo })
      if (res.error) {
        throw new Error(res.error)
      }
      
      setList(prev => prev.map(p => p.sicil_no === sicilNo ? { ...p, durum: finalStatus } : p))
      await logPersonnelMovement(sicilNo, newStatusBase, currentExp.trim());
      if (onPersonnelUpdate) {
        onPersonnelUpdate(sicilNo, finalStatus)
      }
    } catch (err: any) {
      console.error("Status update error:", err)
      alert(`Durum güncellenemedi: ${err.message || err}`)
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Station Pills & Export Buttons Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--fd-border)] pb-4">
        {/* Station Pills */}
        <div className="flex flex-wrap gap-2">
          {groupedStations.map((station) => {
            const isActive = activeStationKey === station.key;
            return (
              <button
                key={station.key}
                type="button"
                onClick={() => setActiveStationKey(station.key)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer bg-transparent ${
                  isActive
                    ? `border-[var(--fd-accent)] bg-[var(--fd-accent)]/10 text-[var(--fd-accent)] ring-1 ring-[var(--fd-accent)]/20`
                    : 'text-[var(--fd-text3)] border-[var(--fd-border)] hover:border-[var(--fd-text2)] hover:bg-[var(--fd-surface2)]/50'
                }`}
              >
                {station.icon}
                <span>{station.label.replace(' İtfaiye Müdürlüğü', '').replace(' Şubesi', '')}</span>
                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[9px] ${
                  isActive ? 'bg-[var(--fd-accent)] text-white' : 'bg-[var(--fd-surface3)] text-[var(--fd-text2)]'
                }`}>
                  {station.personnel.length}
                </span>
              </button>
            )
          })}
        </div>

        {/* Export Buttons */}
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={handleExportPDF} className="gap-2 text-[var(--fd-text2)] border-[var(--fd-border)] hover:bg-[var(--fd-surface2)] bg-[var(--fd-surface)]">
            <FileText className="w-4 h-4 text-[var(--fd-danger)]" />
            PDF İndir
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel} className="gap-2 text-[var(--fd-text2)] border-[var(--fd-border)] hover:bg-[var(--fd-surface2)] bg-[var(--fd-surface)]">
            <TableIcon className="w-4 h-4 text-[var(--fd-success)]" />
            Excel İndir
          </Button>
        </div>
      </div>

      {/* Selected Station Panel */}
      {(() => {
        const station = groupedStations.find(g => g.key === activeStationKey);
        if (!station) return null;

        return (
          <div className="rounded-xl border border-[var(--fd-border)] bg-[var(--fd-surface)] overflow-hidden shadow-[var(--fd-shadow-sm)]">
            {/* Station Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--fd-border)] bg-[var(--fd-surface2)]/40">
              <div className="flex items-center gap-2.5">
                <div className="text-[var(--fd-accent)]">{station.icon}</div>
                <h3 className="text-sm font-bold text-[var(--fd-text)]">{station.label}</h3>
              </div>
              <Badge variant="outline" className="text-[10px] bg-[var(--fd-surface3)] text-[var(--fd-text2)] border-[var(--fd-border)]">
                {station.personnel.length} Personel
              </Badge>
            </div>

            {/* Station Personnel Table */}
            <div className="w-full max-w-full overflow-x-auto -webkit-overflow-scrolling-touch box-border">
              <table className="w-full text-sm text-left border-collapse">
                <thead className="text-[10px] text-[var(--fd-text3)] uppercase bg-[var(--fd-surface2)]/60 border-b border-[var(--fd-border)] font-semibold tracking-wider">
                  <tr>
                    <th className="px-4 py-3 whitespace-nowrap">Sicil No</th>
                    <th className="px-4 py-3 whitespace-nowrap">Ad Soyad</th>
                    <th className="px-4 py-3 min-w-[120px] whitespace-nowrap">Unvan</th>
                    <th className="px-4 py-3 whitespace-nowrap">Durum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--fd-border)]/40">
                  {station.personnel.map((p) => {
                    const durumLower = (p.durum || '').toLowerCase()
                    const isAbsent = durumLower.includes('izinli') || durumLower.includes('raporlu') || durumLower.includes('dış görev')
                    const isLeader = p.unvan?.toLowerCase().includes('başçavuş') || 
                                     p.unvan?.toLowerCase().includes('çavuş') || 
                                     p.rol === 'Admin' || p.rol === 'Editor'
                    const isCellUpdating = updatingId === p.sicil_no

                    return (
                      <tr
                        key={p.sicil_no}
                        className={`transition-colors duration-150 ${
                          isAbsent
                            ? 'opacity-[0.55] text-[var(--fd-text3)] bg-[var(--fd-surface2)]/20 saturate-[0.5] hover:opacity-[0.95] hover:bg-[var(--fd-surface2)]/40'
                            : isLeader
                              ? 'bg-[var(--fd-accent)]/[0.04] hover:bg-[var(--fd-accent)]/[0.12] hover:text-[var(--fd-text)]'
                              : 'hover:bg-[var(--fd-surface2)]/80 hover:text-[var(--fd-text)]'
                        }`}
                      >
                        <td className="px-4 py-3 font-mono text-xs font-medium whitespace-nowrap text-[var(--fd-text3)]">{p.sicil_no}</td>
                        <td className="px-4 py-3 font-medium whitespace-nowrap">
                          <span className={
                            isAbsent 
                              ? 'text-[var(--fd-text3)] line-through font-normal' 
                              : 'text-[var(--fd-text)] font-semibold'
                          }>
                            {p.ad} {p.soyad}
                          </span>
                          {isLeader && (
                            <Badge variant="default" className="ml-2 scale-[0.85] text-[9px] px-1.5 py-0 bg-[var(--fd-accent)] text-white">{p.unvan}</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-[var(--fd-text3)] whitespace-nowrap">{p.unvan}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {isAuthorized ? (
                              (() => {
                                const parts = (p.durum || '').split(' - ');
                                const statusBase = parts[0] || 'Hazır';
                                
                                const selectValue = statusBase === 'Geçici Şube Görevi'
                                  ? 'Geçici Şube Görevi'
                                  : statusBase === 'İzinli'
                                    ? 'İzinli'
                                    : statusBase === 'Raporlu'
                                      ? 'Raporlu'
                                      : statusBase === 'Dış Görev' || statusBase.startsWith('Dış Görev')
                                        ? 'Dış Görev (Stadyum/Etkinlik)'
                                        : 'Hazır';
    
                                const getSelectClass = (status: string) => {
                                  const base = "rounded bg-[var(--fd-surface2)] border text-xs focus:ring-1 focus:outline-none p-1.5 font-semibold transition-colors text-[var(--fd-text)] border-[var(--fd-border)] cursor-pointer";
                                  if (status === 'Hazır' || !status) {
                                    return `${base} border-[var(--fd-success)]/30 text-[var(--fd-success)] focus:ring-[var(--fd-success)] bg-[var(--fd-success)]/5`;
                                  }
                                  if (status.startsWith('Geçici Şube Görevi')) {
                                    return `${base} border-[var(--fd-accent)]/30 text-[var(--fd-accent)] focus:ring-[var(--fd-accent)] bg-[var(--fd-accent)]/5`;
                                  }
                                  return `${base} border-[var(--fd-border)] text-[var(--fd-text3)] focus:ring-slate-600 bg-[var(--fd-surface3)]`;
                                };
    
                                return (
                                  <>
                                    <select
                                      value={selectValue}
                                      disabled={!canEdit || isCellUpdating}
                                      onChange={(e) => handleStatusChange(p.sicil_no, e.target.value)}
                                      className={getSelectClass(selectValue)}
                                    >
                                      <option value="Hazır" className="bg-[var(--fd-surface)] text-[var(--fd-success)]">Hazır</option>
                                      <option value="Geçici Şube Görevi" className="bg-[var(--fd-surface)] text-[var(--fd-accent)]">Geçici Şube Görevi</option>
                                      <option value="İzinli" className="bg-[var(--fd-surface)] text-[var(--fd-amber)]">İzinli</option>
                                      <option value="Raporlu" className="bg-[var(--fd-surface)] text-[var(--fd-danger)]">Raporlu</option>
                                      <option value="Dış Görev (Stadyum/Etkinlik)" className="bg-[var(--fd-surface)] text-blue-400">Dış Görev (Stadyum/Etkinlik)</option>
                                    </select>
    
                                    {statusBase !== 'Hazır' && (
                                      <input
                                        type="text"
                                        value={explanations[p.sicil_no] ?? ''}
                                        disabled={!canEdit || isCellUpdating}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setExplanations(prev => ({ ...prev, [p.sicil_no]: val }));
                                        }}
                                        onBlur={() => handleStatusChange(p.sicil_no, statusBase, explanations[p.sicil_no])}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            (e.target as HTMLInputElement).blur();
                                          }
                                        }}
                                        placeholder={statusBase === 'Geçici Şube Görevi' ? 'Şube adı (Örn: Esentepe)...' : 'Açıklama giriniz...'}
                                        className={`px-2 py-1.5 text-xs rounded border border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text)] focus:outline-none focus:ring-1 w-48 font-medium transition-colors focus:border-[var(--fd-accent)] focus:ring-[var(--fd-accent)]/30`}
                                      />
                                    )}
                                  </>
                                );
                              })()
                            ) : (
                              isAbsent ? (
                                <Badge variant="danger" className="scale-90 text-[10px]">{p.durum}</Badge>
                              ) : (
                                <Badge variant="success" className="scale-90 bg-[var(--fd-success)]/10 text-[var(--fd-success)] border-[var(--fd-success)]/20 text-[10px]">{p.durum || 'Hazır'}</Badge>
                              )
                            )}
                            {isCellUpdating && <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--fd-accent)]" />}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {list.length === 0 && (
        <div className="p-8 text-center text-[var(--fd-text3)] text-sm bg-[var(--fd-surface2)]/20 rounded-xl border border-[var(--fd-border)] border-dashed">
          Bu postada personel bulunmuyor.
        </div>
      )}
    </div>
  )
}
