"use client"

import { useMemo } from "react"
import { Personnel } from "@/types"
import { trLower } from "@/lib/personnelUtils"
import { Printer, Users } from "lucide-react"

interface DailyWorkScheduleProps {
  personnel: Personnel[] // Active shift personnel (sortedPersonnel)
  allPersonnel?: Personnel[] // Sabit nizamiye görevlisini bulmak için
  /** Sabit nizamiye görevlisinin sicili (system_settings.sabit_nizamiye_sicil) */
  sabitNizamiyeSicil?: string | null
}

type RoleCounts = {
  Amir: number;
  Çavuş: number;
  Şoför: number;
  Er: number;
  Santral: number;
  "112": number;
  Toplam: number;
  Names: string[]; // For absences
}

const emptyCounts = (): RoleCounts => ({
  Amir: 0, Çavuş: 0, Şoför: 0, Er: 0, Santral: 0, "112": 0, Toplam: 0, Names: []
})

const getRoleKey = (unvan: string | undefined): keyof Omit<RoleCounts, "Toplam" | "Names"> => {
  const u = (unvan || '').toLowerCase();
  if (u.includes('amir') || u.includes('müdür') || u.includes('başkan')) return 'Amir';
  if (u.includes('çavuş') || u.includes('cavus')) return 'Çavuş';
  if (u.includes('şoför') || u.includes('sofor') || u.includes('operatör')) return 'Şoför';
  if (u.includes('santral')) return 'Santral';
  if (u.includes('112') || u.includes('komuta')) return '112';
  return 'Er';
}

const getStationKey = (istasyon: string | undefined): string => {
  const i = (istasyon || '').toLowerCase();
  if (i.includes('esentepe')) return 'Esentepe Şube';
  if (i.includes('organize')) return 'Organize Şube';
  return 'Merkez Şube';
}

export function DailyWorkSchedule({ personnel, allPersonnel, sabitNizamiyeSicil }: DailyWorkScheduleProps) {
  const stats = useMemo(() => {
    // Sabit nizamiye görevlisi listede yoksa ekle (ayarlardan sicil; ayar yoksa
    // eski isim-tabanlı davranışa düşülür — geriye dönük uyumluluk)
    const activePersonnel = [...personnel];

    if (allPersonnel) {
      const sabitGorevli = sabitNizamiyeSicil
        ? allPersonnel.find(p => p.sicil_no === sabitNizamiyeSicil)
        : allPersonnel.find(p => p.ad?.trim().toLowerCase() === 'sercan' && p.soyad?.trim().toLowerCase() === 'karaca');
      if (sabitGorevli && !activePersonnel.find(p => p.sicil_no === sabitGorevli.sicil_no)) {
        activePersonnel.push(sabitGorevli);
      }
    }

    const rows: Record<string, RoleCounts> = {
      "Merkez Şube": emptyCounts(),
      "Esentepe Şube": emptyCounts(),
      "Organize Şube": emptyCounts(),
      "Raporlu": emptyCounts(),
      "İzinli": emptyCounts(),
      "Dış Görev": emptyCounts(),
    }

    activePersonnel.forEach(p => {
      const role = getRoleKey(p.unvan);
      // trLower: 'İzinli'.toLowerCase() Türkçe İ yüzünden 'izin' ile eşleşmiyordu;
      // izinli personel yanlışlıkla şube mevcuduna sayılıyordu.
      const durum = trLower(p.durum);
      
      let targetRow = "";
      
      // 'izni' kalıbı 'Mazeret İzni' için gerekli ('izin' ile eşleşmez)
      if (durum.includes('izin') || durum.includes('izni') || durum.includes('mazeret') || durum.includes('yıllık')) {
        targetRow = "İzinli";
      } else if (durum.includes('rapor')) {
        targetRow = "Raporlu";
      } else if (durum.includes('dış') || durum.includes('dis') || durum.includes('geçici') || durum.includes('gecici')) {
        targetRow = "Dış Görev";
      } else {
        targetRow = getStationKey(p.istasyon);
      }

      if (rows[targetRow]) {
        rows[targetRow][role]++;
        rows[targetRow].Toplam++;
        if (targetRow === "İzinli" || targetRow === "Raporlu" || targetRow === "Dış Görev") {
          rows[targetRow].Names.push(`${p.ad} ${p.soyad}`);
        }
      }
    });

    const hazirMevcut = emptyCounts();
    ["Merkez Şube", "Esentepe Şube", "Organize Şube"].forEach(station => {
      hazirMevcut.Amir += rows[station].Amir;
      hazirMevcut.Çavuş += rows[station].Çavuş;
      hazirMevcut.Şoför += rows[station].Şoför;
      hazirMevcut.Er += rows[station].Er;
      hazirMevcut.Santral += rows[station].Santral;
      hazirMevcut["112"] += rows[station]["112"];
      hazirMevcut.Toplam += rows[station].Toplam;
    });

    const genelMevcut = emptyCounts();
    ["Amir", "Çavuş", "Şoför", "Er", "Santral", "112", "Toplam"].forEach(key => {
      const k = key as keyof Omit<RoleCounts, "Names">;
      genelMevcut[k] = hazirMevcut[k] + rows["Raporlu"][k] + rows["İzinli"][k] + rows["Dış Görev"][k];
    });

    return { rows, hazirMevcut, genelMevcut };
  }, [personnel, allPersonnel, sabitNizamiyeSicil]);

  const handlePrint = () => {
    // Create print HTML similar to HourlyShifts
    const tarih = new Date().toLocaleDateString("tr-TR");
    
    const renderRow = (title: string, data: RoleCounts, isBold: boolean = false) => `
      <tr>
        <td style="padding: 10px; border: 1px solid #000; font-weight: ${isBold ? 'bold' : 'normal'};">${title}</td>
        <td style="padding: 10px; border: 1px solid #000; text-align: center; font-weight: ${isBold ? 'bold' : 'normal'};">${data.Amir || ''}</td>
        <td style="padding: 10px; border: 1px solid #000; text-align: center; font-weight: ${isBold ? 'bold' : 'normal'};">${data.Çavuş || ''}</td>
        <td style="padding: 10px; border: 1px solid #000; text-align: center; font-weight: ${isBold ? 'bold' : 'normal'};">${data.Şoför || ''}</td>
        <td style="padding: 10px; border: 1px solid #000; text-align: center; font-weight: ${isBold ? 'bold' : 'normal'};">${data.Er || ''}</td>
        <td style="padding: 10px; border: 1px solid #000; text-align: center; font-weight: ${isBold ? 'bold' : 'normal'};">${data.Santral || ''}</td>
        <td style="padding: 10px; border: 1px solid #000; text-align: center; font-weight: ${isBold ? 'bold' : 'normal'};">${data["112"] || ''}</td>
        <td style="padding: 10px; border: 1px solid #000; text-align: center; font-weight: bold;">${data.Toplam || ''}</td>
        <td style="padding: 10px; border: 1px solid #000; font-size: 11px;">${data.Names ? data.Names.join(", ") : ''}</td>
      </tr>
    `;

    const html = `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>Günlük Mesai Çizelgesi - ${tarih}</title>
  <style>
    @page { size: A4 landscape; margin: 15mm; }
    body { font-family: 'Times New Roman', serif; padding: 20px; color: #000; }
    h1, h2 { text-align: center; margin-bottom: 5px; }
    h1 { font-size: 18pt; text-transform: uppercase; }
    h2 { font-size: 14pt; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th { border: 1px solid #000; padding: 10px; background-color: #f5f5f5; font-size: 14px; }
    td { border: 1px solid #000; padding: 10px; font-size: 14px; }
    @media print { .no-print { display: none !important; } }
  </style>
</head>
<body>
  <div class="no-print" style="text-align:center;margin-bottom:20px;">
    <button onclick="window.print()" style="padding:12px 32px;font-size:14px;font-weight:bold;background:#1e40af;color:white;border:none;border-radius:8px;cursor:pointer;">🖨️ Yazdır / PDF İndir</button>
  </div>
  
  <h1>T.C. SİVAS BELEDİYESİ İTFAİYE MÜDÜRLÜĞÜ</h1>
  <h2>GÜNLÜK MESAİ ÇİZELGESİ (${tarih})</h2>
  
  <table>
    <thead>
      <tr>
        <th style="width: 15%;">Durum</th>
        <th style="width: 8%;">Amir</th>
        <th style="width: 8%;">Çavuş</th>
        <th style="width: 8%;">Şoför</th>
        <th style="width: 8%;">Er</th>
        <th style="width: 8%;">Santral</th>
        <th style="width: 8%;">112</th>
        <th style="width: 10%;">Toplam</th>
        <th style="width: 27%;">İsimler (Sadece İzin/Rapor/Görev)</th>
      </tr>
    </thead>
    <tbody>
      ${renderRow("Merkez Şube", stats.rows["Merkez Şube"])}
      ${renderRow("Esentepe Şube", stats.rows["Esentepe Şube"])}
      ${renderRow("Organize Şube", stats.rows["Organize Şube"])}
      ${renderRow("HAZIR MEVCUT", stats.hazirMevcut, true)}
      ${renderRow("Raporlu", stats.rows["Raporlu"])}
      ${renderRow("İzinli", stats.rows["İzinli"])}
      ${renderRow("Dış Görev", stats.rows["Dış Görev"])}
      ${renderRow("GENEL MEVCUT", stats.genelMevcut, true)}
    </tbody>
  </table>
  
  <div style="margin-top: 50px; display: flex; justify-content: space-between;">
    <div style="text-align: center; width: 200px;">
      <p style="font-weight: bold; margin-bottom: 40px;">Vardiya Amiri</p>
      <p>İmza</p>
    </div>
    <div style="text-align: center; width: 200px;">
      <p style="font-weight: bold; margin-bottom: 40px;">İtfaiye Müdürü</p>
      <p>İmza</p>
    </div>
  </div>
</body>
</html>`;

    const printWin = window.open("", "_blank");
    if (printWin) {
      printWin.document.write(html);
      printWin.document.close();
    }
  }

  const renderTableRow = (title: string, data: RoleCounts, isBold: boolean = false, highlight: boolean = false) => (
    <tr key={title} className={`border-b border-[var(--fd-border)] ${isBold ? 'bg-[var(--fd-surface2)] font-bold' : ''} ${highlight ? 'bg-[var(--fd-accent)]/5' : 'hover:bg-[var(--fd-surface2)]/40'}`}>
      <td className={`px-4 py-3 text-sm ${isBold ? 'text-[var(--fd-text)]' : 'text-[var(--fd-text2)]'}`}>{title}</td>
      <td className="px-4 py-3 text-center text-sm">{data.Amir || '-'}</td>
      <td className="px-4 py-3 text-center text-sm">{data.Çavuş || '-'}</td>
      <td className="px-4 py-3 text-center text-sm">{data.Şoför || '-'}</td>
      <td className="px-4 py-3 text-center text-sm">{data.Er || '-'}</td>
      <td className="px-4 py-3 text-center text-sm">{data.Santral || '-'}</td>
      <td className="px-4 py-3 text-center text-sm">{data["112"] || '-'}</td>
      <td className="px-4 py-3 text-center text-sm font-bold text-[var(--fd-text)]">{data.Toplam || '-'}</td>
      <td className="px-4 py-3 text-xs text-[var(--fd-text3)]">{data.Names.join(", ")}</td>
    </tr>
  )

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-[var(--fd-border)] bg-[var(--fd-surface2)]/30 text-xs text-[var(--fd-text2)]">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-[var(--fd-accent)]" />
          <span>Günlük Mesai Çizelgesi bugün için geçerlidir: <strong className="text-[var(--fd-text)]">{new Date().toLocaleDateString("tr-TR")}</strong></span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--fd-border)] text-[var(--fd-accent)] hover:bg-[var(--fd-surface2)] bg-[var(--fd-surface)] transition-colors font-bold cursor-pointer text-xs shrink-0"
          >
            <Printer className="w-3.5 h-3.5" /> Yazdır / PDF İndir
          </button>
        </div>
      </div>

      <div className="w-full overflow-x-auto rounded-xl border border-[var(--fd-border)] bg-[var(--fd-surface)] shadow-[var(--fd-shadow-sm)]">
        <table className="w-full border-collapse text-left">
          <thead className="text-xs text-[var(--fd-text3)] uppercase bg-[var(--fd-surface2)]/60 border-b border-[var(--fd-border)] font-bold tracking-wider">
            <tr>
              <th className="px-4 py-3 w-[15%]">Durum</th>
              <th className="px-4 py-3 text-center w-[8%]">Amir</th>
              <th className="px-4 py-3 text-center w-[8%]">Çavuş</th>
              <th className="px-4 py-3 text-center w-[8%]">Şoför</th>
              <th className="px-4 py-3 text-center w-[8%]">Er</th>
              <th className="px-4 py-3 text-center w-[8%]">Santral</th>
              <th className="px-4 py-3 text-center w-[8%]">112</th>
              <th className="px-4 py-3 text-center w-[10%] text-[var(--fd-accent)]">Toplam</th>
              <th className="px-4 py-3 w-[27%]">İsimler</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--fd-border)]/40">
            {renderTableRow("Merkez Şube", stats.rows["Merkez Şube"])}
            {renderTableRow("Esentepe Şube", stats.rows["Esentepe Şube"])}
            {renderTableRow("Organize Şube", stats.rows["Organize Şube"])}
            {renderTableRow("HAZIR MEVCUT", stats.hazirMevcut, true, true)}
            {renderTableRow("Raporlu", stats.rows["Raporlu"])}
            {renderTableRow("İzinli", stats.rows["İzinli"])}
            {renderTableRow("Dış Görev", stats.rows["Dış Görev"])}
            {renderTableRow("GENEL MEVCUT", stats.genelMevcut, true, true)}
          </tbody>
        </table>
      </div>
    </div>
  )
}
