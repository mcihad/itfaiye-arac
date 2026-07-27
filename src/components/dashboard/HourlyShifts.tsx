"use client"

import { useState, useEffect, useMemo } from "react"
import { api } from "@/lib/api"
import { useAuthStore } from "@/lib/authStore"
import { Personnel } from "@/types"
import { Loader2, ShieldCheck, Clock, MapPin, Building, ShieldAlert, Shield, Printer } from "lucide-react"
import { toast } from "@/lib/toast"

interface HourlyShiftsProps {
  personnel: Personnel[]
  allPersonnel?: Personnel[]
  activePosta: number
  /** Sabit nizamiye görevlisinin sicili (system_settings.sabit_nizamiye_sicil) */
  sabitNizamiyeSicil?: string | null
}

const HOURS = [
  "08:00 - 10:00",
  "10:00 - 12:00",
  "12:00 - 14:00",
  "14:00 - 16:00",
  "16:00 - 18:00",
  "18:00 - 20:00",
  "20:00 - 22:00",
  "22:00 - 00:00",
  "00:00 - 02:00",
  "02:00 - 04:00",
  "04:00 - 06:00",
  "06:00 - 08:00"
]

const PLACES = ["NIZAMIYE"]

export function HourlyShifts({ personnel, allPersonnel, activePosta, sabitNizamiyeSicil }: HourlyShiftsProps) {
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [savingCell, setSavingCell] = useState<string | null>(null)
  
  // Matrix data state: { [hourRange]: { [place]: { id, sicil } } }
  const [matrix, setMatrix] = useState<Record<string, Record<string, { id?: number; sicil: string }>>>({})

  // Admin/Editor (müdür/amir) ve Shift_Leader (çavuş/başçavuş) saatlik nöbeti düzenleyebilir
  const isAuthorized = user?.rol === 'Admin' || user?.rol === 'Editor' || user?.rol === 'Shift_Leader'

  const todayStr = useMemo(() => {
    const shiftDate = new Date();
    // Nöbet değişimi 08:00'dedir. Saat 08:00'den önce ise önceki güne aittir.
    if (shiftDate.getHours() < 8) {
      shiftDate.setDate(shiftDate.getDate() - 1);
    }
    return shiftDate.toLocaleDateString("en-CA");
  }, []);

  useEffect(() => {
    fetchShifts()
  }, [activePosta, sabitNizamiyeSicil])

  const fetchShifts = async () => {
    setLoading(true)
    try {
      const { data } = await api.from("hourly_shifts")
        .select("*")
        .eq("tarih", todayStr)
        .eq("posta", activePosta)

      const newMatrix: typeof matrix = {}
      HOURS.forEach(h => {
        newMatrix[h] = {}
        PLACES.forEach(p => {
          newMatrix[h][p] = { sicil: "" }
        })
      })

      // Sabit 24 saatlik görevleri başlat
      newMatrix["TÜM GÜN"] = {
        "SANTRAL": { sicil: "" },
        "112": { sicil: "" }
      }

      if (data && Array.isArray(data)) {
        data.forEach((row: any) => {
          const gorev = row.gorev_yeri === "KULE" ? "112" : row.gorev_yeri
          
          if (row.saat_araligi === "TÜM GÜN") {
            if (!newMatrix["TÜM GÜN"]) {
              newMatrix["TÜM GÜN"] = {}
            }
            newMatrix["TÜM GÜN"][gorev] = {
              id: row.id,
              sicil: row.personel_sicil
            }
          } else {
            // Geriye dönük uyumluluk: eski saatlik kule veya santral kayıtları varsa tüm güne eşle
            if (gorev === "SANTRAL" || gorev === "112" || gorev.startsWith("SANTRAL_") || gorev.startsWith("112_")) {
              if (!newMatrix["TÜM GÜN"]) {
                newMatrix["TÜM GÜN"] = {}
              }
              newMatrix["TÜM GÜN"][gorev] = {
                id: row.id,
                sicil: row.personel_sicil
              }
            } else if (newMatrix[row.saat_araligi] && newMatrix[row.saat_araligi][gorev]) {
              newMatrix[row.saat_araligi][gorev] = {
                id: row.id,
                sicil: row.personel_sicil
              }
            }
          }
        })
      }

      // SABIT_NIZAMIYE (Sercan Karaca 08:00-17:00) Auto-Fill Logic
      const [year, month, day] = todayStr.split('-');
      const shiftDateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      const isWeekday = shiftDateObj.getDay() >= 1 && shiftDateObj.getDay() <= 5;
      
      const sourcePersonnel = allPersonnel || personnel;
      // Sabit görevli ayarlardan (sicil) bulunur; ayar yoksa eski isim-tabanlı
      // davranışa düşülür (geriye dönük uyumluluk).
      const sabitGorevli = sabitNizamiyeSicil
        ? sourcePersonnel.find(p => p.sicil_no === sabitNizamiyeSicil)
        : sourcePersonnel.find(p => p.ad?.trim().toLowerCase() === 'sercan' && p.soyad?.trim().toLowerCase() === 'karaca');
      const isSabitGorevliMusait = sabitGorevli && !sabitGorevli.durum?.toLowerCase().includes('izin') && !sabitGorevli.durum?.toLowerCase().includes('rapor');

      if (!newMatrix["TÜM GÜN"]["SABIT_NIZAMIYE"]) {
        newMatrix["TÜM GÜN"]["SABIT_NIZAMIYE"] = { sicil: "" };
      }

      if (isWeekday && isSabitGorevliMusait) {
        if (!newMatrix["TÜM GÜN"]["SABIT_NIZAMIYE"].sicil) {
           newMatrix["TÜM GÜN"]["SABIT_NIZAMIYE"].sicil = sabitGorevli.sicil_no;
        }
      }

      setMatrix(newMatrix)
    } catch (err) {
      console.error("Hourly shifts fetch error:", err)
    } finally {
      setSavingCell(null)
      setLoading(false)
    }
  }

  const handlePrint = () => {
    const formatPersonnel = (sicil: string) => {
      if (!sicil) return "-";
      const sourcePersonnel = allPersonnel || personnel;
      const p = sourcePersonnel.find(per => per.sicil_no === sicil);
      return p ? `${p.ad} ${p.soyad} (${p.unvan || 'Er'})` : sicil;
    };

    const tarih = new Date().toLocaleDateString("tr-TR", {
      day: "numeric",
      month: "long",
      year: "numeric"
    });

    const santralNames = santralKeys.map(key => formatPersonnel(matrix["TÜM GÜN"]?.[key]?.sicil || "")).join("<br/>");
    const representativeNames = representativeKeys.map(key => formatPersonnel(matrix["TÜM GÜN"]?.[key]?.sicil || "")).join("<br/>");
    const sabitNizamiyeName = formatPersonnel(matrix["TÜM GÜN"]?.["SABIT_NIZAMIYE"]?.sicil || "");

    const hoursRows = HOURS.map(hour => {
      const nizamiye = formatPersonnel(matrix[hour]?.["NIZAMIYE"]?.sicil || "");
      return `
        <tr>
          <td style="padding:10px;border:1px solid #000;font-family:monospace;font-size:14px;text-align:center;font-weight:bold;">${hour}</td>
          <td style="padding:10px;border:1px solid #000;font-size:14px;text-align:center;font-weight:bold;">${nizamiye}</td>
        </tr>
      `;
    }).join("");

    const html = `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>Saatlik Karargah Nöbet Çizelgesi - ${tarih}</title>
  <style>
    @page { size: A4 portrait; margin: 15mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Times New Roman', 'Noto Serif', serif;
      color: #000;
      padding: 10px;
      line-height: 1.4;
    }
    .header { text-align: center; margin-bottom: 25px; border-bottom: 2px solid #000; padding-bottom: 15px; }
    .header h1 { font-size: 16pt; font-weight: bold; text-transform: uppercase; margin-bottom: 5px; }
    .header h2 { font-size: 13pt; font-weight: bold; margin-bottom: 5px; }
    .header h3 { font-size: 12pt; font-weight: bold; letter-spacing: 1px; }
    
    .meta-table { width: 100%; margin-bottom: 20px; border-collapse: collapse; }
    .meta-table td { padding: 5px; font-size: 11pt; }
    .meta-table td.right { text-align: right; }
    
    .section-title { font-size: 12pt; font-weight: bold; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #000; padding-bottom: 3px; }
    
    .duty-table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
    .duty-table th { background: #f0f0f0; padding: 8px; border: 1px solid #000; font-size: 11pt; font-weight: bold; text-align: center; }
    .duty-table td { padding: 8px; border: 1px solid #000; font-size: 11pt; vertical-align: middle; }
    
    .signature-section { margin-top: 50px; display: flex; justify-content: space-between; }
    .signature-box { text-align: center; width: 180px; font-size: 11pt; }
    .signature-box .title { margin-bottom: 50px; font-weight: bold; }
    
    @media print {
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="text-align:center;margin-bottom:20px;">
    <button onclick="window.print()" style="padding:12px 32px;font-size:14px;font-weight:700;background:#1e40af;color:white;border:none;border-radius:8px;cursor:pointer;box-shadow: 0 4px 6px rgba(0,0,0,0.1);">🖨️ Yazdır / PDF Olarak Kaydet</button>
  </div>

  <div class="header">
    <h1>T.C. SİVAS BELEDİYESİ</h1>
    <h2>İtfaiye Müdürlüğü</h2>
    <h3>SAATLİK KARARGAH NÖBET ÇİZELGESİ</h3>
  </div>

  <table class="meta-table">
    <tr>
      <td><strong>Posta:</strong> ${activePosta}. Posta</td>
      <td class="right"><strong>Nöbet Tarihi:</strong> ${tarih}</td>
    </tr>
  </table>

  <div class="section-title">Sabit Görevler</div>
  <table class="duty-table">
    <thead>
      <tr>
        <th style="width: 33%;">Santral Operatörleri (24s)</th>
        <th style="width: 33%;">112 Temsilcileri (24s)</th>
        <th style="width: 33%;">Sabit Nizamiye (08:00-17:00)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="padding: 12px; font-weight: bold; line-height: 1.6; text-align: center;">${santralNames || "-"}</td>
        <td style="padding: 12px; font-weight: bold; line-height: 1.6; text-align: center;">${representativeNames || "-"}</td>
        <td style="padding: 12px; font-weight: bold; line-height: 1.6; text-align: center;">${sabitNizamiyeName || "-"}</td>
      </tr>
    </tbody>
  </table>

  <div class="section-title">2 Saatlik Saatlik Karargah Nöbet Döngüsü</div>
  <table class="duty-table">
    <thead>
      <tr>
        <th style="width: 30%;">Saat Aralığı</th>
        <th style="width: 70%;">Nizamiye Nöbetçisi</th>
      </tr>
    </thead>
    <tbody>
      ${hoursRows}
    </tbody>
  </table>

  <div class="signature-section">
    <div class="signature-box">
      <div class="title">Nöbetçi Amiri</div>
      <div>İmza</div>
    </div>
    <div class="signature-box">
      <div class="title">Grup Amiri</div>
      <div>İmza</div>
    </div>
    <div class="signature-box">
      <div class="title">İtfaiye Müdürü</div>
      <div>İmza</div>
    </div>
  </div>
</body>
</html>
    `;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (!w) {
      toast("Popup engelleyiciyi devre dışı bırakın.");
    }
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  // Get dynamic keys sorted logically
  const santralKeys = useMemo(() => {
    const keys = Object.keys(matrix["TÜM GÜN"] || {}).filter(k => k === "SANTRAL" || k.startsWith("SANTRAL_"))
    if (!keys.includes("SANTRAL")) {
      keys.push("SANTRAL")
    }
    return keys.sort((a, b) => {
      if (a === "SANTRAL") return -1
      if (b === "SANTRAL") return 1
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    })
  }, [matrix])

  const representativeKeys = useMemo(() => {
    const keys = Object.keys(matrix["TÜM GÜN"] || {}).filter(k => k === "112" || k.startsWith("112_"))
    if (!keys.includes("112")) {
      keys.push("112")
    }
    return keys.sort((a, b) => {
      if (a === "112") return -1
      if (b === "112") return 1
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    })
  }, [matrix])

  const handleAddSantralSlot = () => {
    let nextIndex = 2
    while (matrix["TÜM GÜN"]?.[`SANTRAL_${nextIndex}`]) {
      nextIndex++
    }
    const newKey = `SANTRAL_${nextIndex}`
    setMatrix(prev => ({
      ...prev,
      "TÜM GÜN": {
        ...prev["TÜM GÜN"],
        [newKey]: { sicil: "" }
      }
    }))
  }

  const handleAdd112Slot = () => {
    let nextIndex = 2
    while (matrix["TÜM GÜN"]?.[`112_${nextIndex}`]) {
      nextIndex++
    }
    const newKey = `112_${nextIndex}`
    setMatrix(prev => ({
      ...prev,
      "TÜM GÜN": {
        ...prev["TÜM GÜN"],
        [newKey]: { sicil: "" }
      }
    }))
  }

  const handleDeleteSlot = async (place: string) => {
    const cellKey = `TÜM GÜN-${place}`
    setSavingCell(cellKey)
    try {
      const currentCell = matrix["TÜM GÜN"]?.[place]
      if (currentCell && currentCell.id) {
        const res = await api.remove("hourly_shifts", { id: currentCell.id })
        if (res.error) {
          throw new Error(res.error)
        }
      }
      
      setMatrix(prev => {
        const copy = { ...prev }
        if (copy["TÜM GÜN"]) {
          const newWholeDay = { ...copy["TÜM GÜN"] }
          delete newWholeDay[place]
          copy["TÜM GÜN"] = newWholeDay
        }
        return copy
      })
    } catch (err: any) {
      console.error("Delete slot error:", err)
      toast(`Nöbetçi silinemedi: ${err.message || err}`)
    } finally {
      setSavingCell(null)
    }
  }

  const handleCellChange = async (hour: string, place: string, newSicil: string) => {
    const cellKey = `${hour}-${place}`
    setSavingCell(cellKey)
    try {
      const currentCell = matrix[hour]?.[place]
      
      if (newSicil === "") {
        // If empty selected and record exists, delete it
        if (currentCell && currentCell.id) {
          const res = await api.remove("hourly_shifts", { id: currentCell.id })
          if (res.error) {
            throw new Error(res.error)
          }
        }
        setMatrix(prev => ({
          ...prev,
          [hour]: {
            ...prev[hour],
            [place]: { sicil: "" }
          }
        }))
      } else {
        if (currentCell && currentCell.id) {
          // Update existing record
          const res = await api.update("hourly_shifts", { personel_sicil: newSicil }, { id: currentCell.id })
          if (res.error) {
            throw new Error(res.error)
          }
          setMatrix(prev => ({
            ...prev,
            [hour]: {
              ...prev[hour],
              [place]: { ...prev[hour][place], sicil: newSicil }
            }
          }))
        } else {
          // Create new record
          const insertRes = await api.insert("hourly_shifts", {
            tarih: todayStr,
            posta: activePosta,
            saat_araligi: hour,
            gorev_yeri: place,
            personel_sicil: newSicil
          })
          
          if (insertRes.error) {
            throw new Error(insertRes.error)
          }
          
          const insertedRow = Array.isArray(insertRes.data) ? insertRes.data[0] : insertRes.data
          const newId = insertedRow?.id

          setMatrix(prev => ({
            ...prev,
            [hour]: {
              ...prev[hour],
              [place]: { id: newId, sicil: newSicil }
            }
          }))
        }
      }
    } catch (err: any) {
      console.error("Shift save error:", err)
      toast(`Nöbet değişikliği kaydedilemedi: ${err.message || err}`)
    } finally {
      setSavingCell(null)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--fd-accent)]" />
        <span className="text-sm text-[var(--fd-text3)]">Saatlik Nöbet Çizelgesi Yükleniyor...</span>
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Date & Info Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-[var(--fd-border)] bg-[var(--fd-surface2)]/30 text-xs text-[var(--fd-text2)]">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-[var(--fd-accent)]" />
          <span>Saatlik Karargah Çizelgesi bugün için geçerlidir: <strong className="text-[var(--fd-text)]">{new Date().toLocaleDateString("tr-TR")}</strong></span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--fd-border)] text-[var(--fd-accent)] hover:bg-[var(--fd-surface2)] bg-[var(--fd-surface)] transition-colors font-bold cursor-pointer text-xs shrink-0"
          >
            <Printer className="w-3.5 h-3.5" /> Yazdır / PDF İndir
          </button>
          {isAuthorized ? (
            <span className="flex items-center gap-1 text-[var(--fd-success)] font-bold bg-[var(--fd-success)]/10 px-2.5 py-1 rounded-full border border-[var(--fd-success)]/20">
              <ShieldCheck className="w-3.5 h-3.5" /> Nöbet Düzenleme Yetkisi Var
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[var(--fd-amber)] font-medium bg-[var(--fd-amber)]/10 px-2.5 py-1 rounded-full border border-[var(--fd-amber)]/20">
              <ShieldAlert className="w-3.5 h-3.5" /> Sadece Görüntüleme Yetkisi
            </span>
          )}
        </div>
      </div>

      {/* Fixed Duties Panel */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-5 rounded-xl border border-[var(--fd-border)] bg-[var(--fd-surface)] shadow-[var(--fd-shadow-sm)]">
        {/* Santral Operators */}
        <div className="space-y-3">
          <label className="text-xs font-bold uppercase tracking-wider text-[var(--fd-text3)] flex items-center gap-2">
            <Building className="w-3.5 h-3.5 text-[var(--fd-accent)]" />
            <span>Nöbetçi Santral Operatörleri (24 Saat Nöbet)</span>
          </label>
          
          <div className="space-y-2">
            {santralKeys.map((key, index) => {
              const currentVal = matrix["TÜM GÜN"]?.[key]?.sicil || ""
              const isSaving = savingCell === `TÜM GÜN-${key}`
              const isExtra = key !== "SANTRAL"

              return (
                <div key={key} className="flex items-center gap-2">
                  <div className="relative flex-1">
                    {isAuthorized ? (
                      <select
                        value={currentVal}
                        disabled={isSaving}
                        onChange={(e) => handleCellChange("TÜM GÜN", key, e.target.value)}
                        className="w-full h-10 rounded-lg border border-[var(--fd-border)] bg-[var(--fd-surface2)] px-3 py-1.5 text-xs text-[var(--fd-text)] focus:outline-none focus:ring-1 focus:ring-[var(--fd-accent)]/30 font-semibold cursor-pointer"
                      >
                        <option value="">{index === 0 ? "Santral Operatorü Seçiniz" : `Ekstra Santral Operatörü #${index}`}</option>
                        {personnel.map(p => (
                          <option key={p.sicil_no} value={p.sicil_no}>
                            {p.ad} {p.soyad} ({p.unvan || 'Er'})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="h-10 flex items-center px-4 rounded-lg border border-dashed border-[var(--fd-border)] bg-[var(--fd-surface2)]/20 text-xs font-semibold text-[var(--fd-text3)]">
                        {currentVal ? (
                          (() => {
                            const p = personnel.find(per => per.sicil_no === currentVal)
                            return p ? `${p.ad} ${p.soyad} (${p.unvan})` : currentVal
                          })()
                        ) : (
                          "Atama Yok"
                        )}
                      </div>
                    )}
                    {isSaving && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Loader2 className="w-4 h-4 animate-spin text-[var(--fd-accent)]" />
                      </div>
                    )}
                  </div>
                  {isAuthorized && isExtra && (
                    <button
                      type="button"
                      onClick={() => handleDeleteSlot(key)}
                      disabled={isSaving}
                      className="h-10 px-3 flex items-center justify-center rounded-lg border border-[var(--fd-danger)]/25 bg-[var(--fd-danger)]/5 text-[var(--fd-danger)] hover:bg-[var(--fd-danger)]/15 transition-colors disabled:opacity-50 cursor-pointer shrink-0 text-xs font-bold"
                      title="Nöbetçiyi Sil"
                    >
                      Sil
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {isAuthorized && (
            <button
              type="button"
              onClick={handleAddSantralSlot}
              className="w-full py-2 px-3 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--fd-border)] text-[var(--fd-accent)] hover:bg-[var(--fd-surface2)]/40 bg-[var(--fd-surface)] text-xs font-bold transition-all cursor-pointer"
            >
              + Ekstra Santral Nöbetçisi Ekle
            </button>
          )}
        </div>

        {/* 112 Representatives */}
        <div className="space-y-3">
          <label className="text-xs font-bold uppercase tracking-wider text-[var(--fd-text3)] flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-[var(--fd-danger)]" />
            <span>Nöbetçi 112 Temsilcileri (24 Saat Nöbet)</span>
          </label>
          
          <div className="space-y-2">
            {representativeKeys.map((key, index) => {
              const currentVal = matrix["TÜM GÜN"]?.[key]?.sicil || ""
              const isSaving = savingCell === `TÜM GÜN-${key}`
              const isExtra = key !== "112"

              return (
                <div key={key} className="flex items-center gap-2">
                  <div className="relative flex-1">
                    {isAuthorized ? (
                      <select
                        value={currentVal}
                        disabled={isSaving}
                        onChange={(e) => handleCellChange("TÜM GÜN", key, e.target.value)}
                        className="w-full h-10 rounded-lg border border-[var(--fd-border)] bg-[var(--fd-surface2)] px-3 py-1.5 text-xs text-[var(--fd-text)] focus:outline-none focus:ring-1 focus:ring-[var(--fd-accent)]/30 font-semibold cursor-pointer"
                      >
                        <option value="">{index === 0 ? "112 Temsilcisi Seçiniz" : `Ekstra 112 Temsilcisi #${index}`}</option>
                        {personnel.map(p => (
                          <option key={p.sicil_no} value={p.sicil_no}>
                            {p.ad} {p.soyad} ({p.unvan || 'Er'})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="h-10 flex items-center px-4 rounded-lg border border-dashed border-[var(--fd-border)] bg-[var(--fd-surface2)]/20 text-xs font-semibold text-[var(--fd-text3)]">
                        {currentVal ? (
                          (() => {
                            const p = personnel.find(per => per.sicil_no === currentVal)
                            return p ? `${p.ad} ${p.soyad} (${p.unvan})` : currentVal
                          })()
                        ) : (
                          "Atama Yok"
                        )}
                      </div>
                    )}
                    {isSaving && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Loader2 className="w-4 h-4 animate-spin text-[var(--fd-accent)]" />
                      </div>
                    )}
                  </div>
                  {isAuthorized && isExtra && (
                    <button
                      type="button"
                      onClick={() => handleDeleteSlot(key)}
                      disabled={isSaving}
                      className="h-10 px-3 flex items-center justify-center rounded-lg border border-[var(--fd-danger)]/25 bg-[var(--fd-danger)]/5 text-[var(--fd-danger)] hover:bg-[var(--fd-danger)]/15 transition-colors disabled:opacity-50 cursor-pointer shrink-0 text-xs font-bold"
                      title="Nöbetçiyi Sil"
                    >
                      Sil
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {isAuthorized && (
            <button
              type="button"
              onClick={handleAdd112Slot}
              className="w-full py-2 px-3 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--fd-border)] text-[var(--fd-danger)] hover:bg-[var(--fd-danger)]/5 bg-[var(--fd-surface)] text-xs font-bold transition-all cursor-pointer"
            >
              + Ekstra 112 Temsilcisi Ekle
            </button>
          )}
        </div>

        {/* Sabit Nizamiye (08:00 - 17:00) */}
        <div className="space-y-3">
          <label className="text-xs font-bold uppercase tracking-wider text-[var(--fd-text3)] flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-[var(--fd-warning)]" />
            <span>Sabit Nizamiye Nöbetçisi (08:00-17:00)</span>
          </label>
          
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                {isAuthorized ? (
                  <select
                    value={matrix["TÜM GÜN"]?.["SABIT_NIZAMIYE"]?.sicil || ""}
                    disabled={savingCell === `TÜM GÜN-SABIT_NIZAMIYE`}
                    onChange={(e) => handleCellChange("TÜM GÜN", "SABIT_NIZAMIYE", e.target.value)}
                    className="w-full h-10 rounded-lg border border-[var(--fd-border)] bg-[var(--fd-surface2)] px-3 py-1.5 text-xs text-[var(--fd-text)] focus:outline-none focus:ring-1 focus:ring-[var(--fd-accent)]/30 font-semibold cursor-pointer"
                  >
                    <option value="">Nöbetçi Seçiniz</option>
                    {(allPersonnel || personnel).map(p => (
                      <option key={p.sicil_no} value={p.sicil_no}>
                        {p.ad} {p.soyad} ({p.unvan || 'Er'})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="h-10 flex items-center px-4 rounded-lg border border-dashed border-[var(--fd-border)] bg-[var(--fd-surface2)]/20 text-xs font-semibold text-[var(--fd-text3)]">
                    {matrix["TÜM GÜN"]?.["SABIT_NIZAMIYE"]?.sicil ? (
                      (() => {
                        const sourcePersonnel = allPersonnel || personnel;
                        const p = sourcePersonnel.find(per => per.sicil_no === matrix["TÜM GÜN"]["SABIT_NIZAMIYE"].sicil)
                        return p ? `${p.ad} ${p.soyad} (${p.unvan})` : matrix["TÜM GÜN"]["SABIT_NIZAMIYE"].sicil
                      })()
                    ) : (
                      "Atama Yok"
                    )}
                  </div>
                )}
                {savingCell === `TÜM GÜN-SABIT_NIZAMIYE` && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Loader2 className="w-4 h-4 animate-spin text-[var(--fd-accent)]" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid Matrix Table */}
      <div className="w-full overflow-x-auto rounded-xl border border-[var(--fd-border)] bg-[var(--fd-surface)] shadow-[var(--fd-shadow-sm)]">
        <table className="w-full border-collapse text-sm text-left">
          <thead className="text-[10px] text-[var(--fd-text3)] uppercase bg-[var(--fd-surface2)]/60 border-b border-[var(--fd-border)] font-semibold tracking-wider">
            <tr>
              <th className="px-4 py-3 text-center border-r border-[var(--fd-border)] w-[180px]">Saat Aralığı</th>
              <th className="px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-[var(--fd-accent)]" />
                  <span>Nizamiye Nöbeti (2 Saatlik Döngü)</span>
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--fd-border)]/40">
            {HOURS.map((hour) => (
              <tr key={hour} className="hover:bg-[var(--fd-surface2)]/40 transition-colors h-14">
                {/* Hour Cell */}
                <td className="px-4 py-2.5 font-mono text-xs font-semibold text-[var(--fd-text2)] text-center bg-[var(--fd-surface2)]/20 border-r border-[var(--fd-border)]">
                  {hour}
                </td>
                
                {/* Place Cells */}
                {PLACES.map((place) => {
                  const cellKey = `${hour}-${place}`
                  const currentVal = matrix[hour]?.[place]?.sicil || ""
                  const isSaving = savingCell === cellKey

                  return (
                    <td key={place} className="px-4 py-2 text-center">
                      <div className="relative w-full max-w-[240px] mx-auto">
                        {isAuthorized ? (
                          <select
                            value={currentVal}
                            disabled={isSaving}
                            onChange={(e) => handleCellChange(hour, place, e.target.value)}
                            className="w-full h-10 rounded-lg border border-[var(--fd-border)] bg-[var(--fd-surface2)] px-3 py-1.5 text-xs text-[var(--fd-text2)] focus:outline-none focus:ring-1 focus:ring-[var(--fd-accent)]/30 font-medium cursor-pointer"
                          >
                            <option value="">Nöbetçi Seçiniz</option>
                            {personnel.map(p => (
                              <option key={p.sicil_no} value={p.sicil_no}>
                                {p.ad} {p.soyad} ({p.unvan || 'Er'})
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="h-10 flex items-center justify-center text-xs font-semibold px-3 py-1.5 rounded-lg border border-dashed border-[var(--fd-border)] bg-[var(--fd-surface2)]/20 text-[var(--fd-text3)]">
                            {currentVal ? (
                              (() => {
                                const p = personnel.find(per => per.sicil_no === currentVal)
                                return p ? `${p.ad} ${p.soyad}` : currentVal
                              })()
                            ) : (
                              "Atama Yok"
                            )}
                          </div>
                        )}
                        {isSaving && (
                          <div className="absolute right-2 top-1/2 -translate-y-1/2">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--fd-accent)]" />
                          </div>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
