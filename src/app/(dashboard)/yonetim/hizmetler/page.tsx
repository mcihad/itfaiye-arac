"use client"

import { useState, useEffect, useMemo } from "react"
import { api } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { DataTable } from "@/components/ui/DataTable"
import { cn } from "@/lib/utils"
import { useAuthStore } from "@/lib/authStore"
import PageGuard from "@/components/PageGuard"
import { toast } from "@/lib/toast"
import { 
  Loader2, 
  FileText, 
  CheckCircle, 
  Clock, 
  User, 
  Phone, 
  Brush,
  ShieldCheck,
  CreditCard,
  Calendar,
  X,
  FilePlus,
  AlertTriangle,
  Trash2,
  Plus,
  Search,
} from "lucide-react"

const normalizeTextForSearch = (str: string): string => {
  if (!str) return "";
  return str
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g").replace(/Ğ/g, "g")
    .replace(/ü/g, "u").replace(/Ü/g, "u")
    .replace(/ş/g, "s").replace(/Ş/g, "s")
    .replace(/ö/g, "o").replace(/Ö/g, "o")
    .replace(/ç/g, "c").replace(/Ç/g, "c")
    .toLowerCase();
}

interface CitizenRequest {
  id: string;
  talep_turu: string;
  basvuru_tarihi: string;
  basvuran_tc: string;
  basvuran_ad_soyad: string;
  irtibat_tel: string;
  adres: string;
  baca_detaylari?: {
    kat_sayisi?: number;
    daire_sayisi?: number;
    yakit_tipi?: string;
    baca_tipi?: string;
  };
  isyeri_detaylari?: {
    faaliyet_konusu?: string;
    alan_m2?: number;
    yangin_dolabi?: string;
    acil_cikis?: string;
    kisi_sayisi?: number;
    egitim_tarihi?: string;
    egitim_turu?: string;
    yangin_nedeni?: string;
    bina_tipi?: string;
  };
  durum: string;
  created_at: string;
  updated_at?: string;
  islem_yapan_amir?: string;
  atanan_ekip?: string;
  islem_tarihi?: string;
  red_gerekcesi?: string;
  takip_kodu?: string;
}

export default function HizmetlerPage() {
  const { user } = useAuthStore()
  const isMudur = user?.rol === 'Admin' || user?.unvan === 'Müdür' || user?.unvan === 'Amir' || user?.rol?.toLowerCase() === 'admin' || user?.unvan?.toLowerCase() === 'müdür' || user?.unvan?.toLowerCase() === 'amir'

  const hizmetlerColumns = [
    {
      header: "Başvuran / Kurum Adı",
      cell: (req: any) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-[var(--fd-r-sm)] bg-[var(--fd-surface2)]/80 border border-[var(--fd-border)] flex items-center justify-center text-[var(--fd-text3)] shrink-0">
            <User className="w-4 h-4" />
          </div>
          <div className="space-y-0.5">
            <span className="font-bold text-[var(--fd-text)] block text-sm">{req.basvuran_ad_soyad}</span>
            <span className="text-[10px] text-[var(--fd-text3)] font-mono block">TC: {req.basvuran_tc || 'Girilmemiş'}</span>
          </div>
        </div>
      )
    },
    {
      header: "Hizmet Türü",
      cell: (req: any) => (
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-[var(--fd-r-sm)] ${req.talep_turu.includes('Baca') ? 'text-[var(--fd-info)] bg-[rgba(37,99,235,0.1)]' : 'text-[var(--fd-amber)] bg-[rgba(245,158,11,0.1)]'}`}>
            {req.talep_turu.includes('Baca') ? <Brush className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
          </div>
          <span className="font-semibold text-[var(--fd-text2)]">{req.talep_turu}</span>
        </div>
      )
    },
    {
      header: "Başvuru Tarihi",
      cell: (req: any) => (
        <div className="flex items-center gap-1.5 text-xs text-[var(--fd-text3)]">
          <Calendar className="w-3.5 h-3.5 text-[var(--fd-text3)]/60" />
          {new Date(req.basvuru_tarihi).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
        </div>
      )
    },
    {
      header: "Görevli Ekip",
      cell: (req: any) => (
        <span className={(!req.atanan_ekip && (req.durum === 'BEKLEMEDE' || req.durum === 'Bekliyor')) ? 'text-[var(--fd-text3)] font-normal italic' : 'text-[var(--fd-text2)] font-bold'}>
          {getGorevliEkip(req)}
        </span>
      )
    },
    {
      header: "Harç Durumu",
      cell: (req: any) => {
        const feeObj = getHarcDurumu(req);
        let badgeVariant = "outline";
        const d = req.durum ? req.durum.toUpperCase() : 'BEKLEMEDE';
        if (d === 'ONAYLANDI') badgeVariant = "success";
        else if (d === 'REDDEDİLDİ') badgeVariant = "danger";
        else if (d === 'EKİP ATANDI' || d === 'EKİP_ATANDI') badgeVariant = "info";
        return (
          <Badge variant={badgeVariant as any}>
            {feeObj.text}
          </Badge>
        );
      }
    },
    {
      header: "İşlem Durumu",
      cell: (req: any) => {
        const d = req.durum ? req.durum.toUpperCase() : 'BEKLEMEDE';
        switch (d) {
          case 'ONAYLANDI':
            return <Badge variant="success">Onaylandı</Badge>;
          case 'EKİP ATANDI':
          case 'EKİP_ATANDI':
            return <Badge variant="info">Ekip Atandı</Badge>;
          case 'REDDEDİLDİ':
            return <Badge variant="danger">Reddedildi</Badge>;
          case 'BEKLIYOR':
          case 'BEKLEMEDE':
          default:
            return <Badge variant="warning">Bekliyor</Badge>;
        }
      }
    },
    {
      header: "İşlemler",
      headerClassName: "text-right",
      className: "text-right",
      cell: (req: any) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-[11px] font-bold text-[var(--fd-accent)] hover:bg-[var(--fd-accent-soft)] hover:text-[var(--fd-accent)] rounded-[var(--fd-r-sm)]"
            onClick={() => setSelectedRequest(req)}
          >
            Detay & Karar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-[11px] font-semibold text-[var(--fd-text3)] hover:text-[var(--fd-text)] rounded-[var(--fd-r-sm)]"
            onClick={() => generateDilekce(req)}
          >
            Dilekçe PDF
          </Button>
        </div>
      )
    }
  ];

  const [requests, setRequests] = useState<CitizenRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")

  // Details & Action Modal State
  const [selectedRequest, setSelectedRequest] = useState<CitizenRequest | null>(null)
  
  // Tactical action states inside modal
  const [tacticalMode, setTacticalMode] = useState<'NONE' | 'RED' | 'EKIP'>('NONE')
  const [rejectionReason, setRejectionReason] = useState('')
  const [selectedCrew, setSelectedCrew] = useState('Merkez İstasyonu A Grubu')

  // Create Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [newRequestForm, setNewRequestForm] = useState({
    talep_turu: 'Baca Temizliği',
    basvuran_ad_soyad: '',
    basvuran_tc: '',
    irtibat_tel: '',
    adres: '',
    // Baca detayları
    baca_kat_sayisi: '1',
    baca_daire_sayisi: '1',
    baca_yakit_tipi: 'Doğalgaz',
    baca_tipi: 'Standart Konut Bacası',
    // İşyeri detayları
    isyeri_faaliyet_konusu: '',
    isyeri_alan_m2: '100',
    isyeri_yangin_dolabi: 'Mevcut',
    isyeri_acil_cikis: '1 Adet',
  })

  // Filter out any Training (Eğitim) requests
  const filteredRequests = useMemo(() => {
    return requests.filter(r => {
      // Must not contain "Eğitim" in talep_turu
      const isTraining = normalizeTextForSearch(r.talep_turu).includes("egitim")
      if (isTraining) return false

      if (searchTerm.trim() !== '') {
        const s = normalizeTextForSearch(searchTerm)
        return (
          normalizeTextForSearch(r.basvuran_ad_soyad).includes(s) ||
          normalizeTextForSearch(r.basvuran_tc || '').includes(s) ||
          normalizeTextForSearch(r.talep_turu).includes(s) ||
          normalizeTextForSearch(r.adres).includes(s)
        )
      }
      return true
    })
  }, [requests, searchTerm])


  // Detect Müdür / Admin / Amir role

  // Reset tactical menu when selectedRequest changes
  useEffect(() => {
    setTacticalMode('NONE')
    setRejectionReason('')
    setSelectedCrew('Merkez İstasyonu A Grubu')
  }, [selectedRequest])

  const resetForm = () => {
    setNewRequestForm({
      talep_turu: 'Baca Temizliği',
      basvuran_ad_soyad: '',
      basvuran_tc: '',
      irtibat_tel: '',
      adres: '',
      baca_kat_sayisi: '1',
      baca_daire_sayisi: '1',
      baca_yakit_tipi: 'Doğalgaz',
      baca_tipi: 'Standart Konut Bacası',
      isyeri_faaliyet_konusu: '',
      isyeri_alan_m2: '100',
      isyeri_yangin_dolabi: 'Mevcut',
      isyeri_acil_cikis: '1 Adet',
    })
  }

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newRequestForm.basvuran_ad_soyad || !newRequestForm.irtibat_tel || !newRequestForm.adres) {
      toast("Lütfen Ad Soyad, İrtibat Telefonu ve Adres alanlarını doldurun.")
      return
    }

    setIsSaving(true)
    try {
      const payload = {
        talep_turu: newRequestForm.talep_turu,
        basvuru_tarihi: new Date().toISOString(),
        basvuran_tc: newRequestForm.basvuran_tc || '11111111111',
        basvuran_ad_soyad: newRequestForm.basvuran_ad_soyad,
        irtibat_tel: newRequestForm.irtibat_tel,
        adres: newRequestForm.adres,
        durum: 'BEKLEMEDE' as const,
        baca_detaylari: newRequestForm.talep_turu === 'Baca Temizliği' ? {
          kat_sayisi: Number(newRequestForm.baca_kat_sayisi) || 1,
          daire_sayisi: Number(newRequestForm.baca_daire_sayisi) || 1,
          yakit_tipi: newRequestForm.baca_yakit_tipi,
          baca_tipi: newRequestForm.baca_tipi
        } : undefined,
        isyeri_detaylari: newRequestForm.talep_turu === 'İtfaiye Uygunluk Raporu' ? {
          faaliyet_konusu: newRequestForm.isyeri_faaliyet_konusu || 'Genel Ticari Faaliyet',
          alan_m2: Number(newRequestForm.isyeri_alan_m2) || 100,
          yangin_dolabi: newRequestForm.isyeri_yangin_dolabi,
          acil_cikis: newRequestForm.isyeri_acil_cikis
        } : undefined
      }

      const seedResult = await api.insert('citizen_requests', [payload])
      if (seedResult && !seedResult.error) {
        setIsCreateOpen(false)
        resetForm()
        await fetchRequests()
      } else {
        toast("Başvuru eklenirken bir veritabanı hatası oluştu: " + (seedResult?.error || 'Bilinmeyen Hata'))
      }
    } catch (err) {
      console.error('Create request error:', err)
      toast("Sistemsel bir hata oluştu.")
    } finally {
      setIsSaving(false)
    }
  }

  const fetchRequests = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/hizmet-yonetimi')
      const json = await res.json()
      if (json.success && json.requests) {
        setRequests(json.requests as CitizenRequest[])
      } else {
        console.error('Fetch requests error:', json.error)
      }
    } catch (err) {
      console.error('Fetch requests error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRequests()
  }, [])

  const handleTacticalAction = async (
    id: string, 
    newStatus: 'ONAYLANDI' | 'REDDEDİLDİ' | 'EKİP_ATANDI',
    extra?: { crew?: string; reason?: string }
  ) => {
    setUpdating(id)
    try {
      const amirStr = user ? `${user.ad} ${user.soyad} (${user.sicilNo || 'Amir'})` : 'Bilinmeyen Amir'
      const res = await fetch('/api/hizmet-onay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          durum: newStatus,
          islem_yapan_amir: amirStr,
          atanan_ekip: extra?.crew || null,
          red_gerekcesi: extra?.reason || null
        })
      });
      const data = await res.json();
      
      if (data.success) {
        await fetchRequests();
        setSelectedRequest(prev => {
          if (prev && prev.id === id) {
            return {
              ...prev,
              durum: newStatus,
              islem_yapan_amir: amirStr,
              atanan_ekip: extra?.crew || undefined,
              red_gerekcesi: extra?.reason || undefined,
              islem_tarihi: new Date().toISOString()
            };
          }
          return prev;
        });

        setTacticalMode('NONE');
        setRejectionReason('');
      } else {
        toast('İşlem başarısız: ' + (data.error || 'Bilinmeyen Hata'));
      }
    } catch (err) {
      console.error('Tactical action error:', err)
      toast('Sistem bağlantı hatası oluştu.')
    } finally {
      setUpdating(null)
    }
  }

  const handleDeleteRequest = async (id: string) => {
    if (!window.confirm("Bu başvuruyu kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz.")) {
      return
    }
    setUpdating(id)
    try {
      const res = await fetch(`/api/hizmet-onay?id=${id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (data.success) {
        setRequests(prev => prev.filter(r => r.id !== id))
        if (selectedRequest?.id === id) {
          setSelectedRequest(null)
        }
      } else {
        toast('Silme işlemi başarısız: ' + (data.error || 'Bilinmeyen Hata'))
      }
    } catch (err) {
      console.error('Delete request error:', err)
      toast('Silme işlemi sırasında sistemsel bir hata oluştu.')
    } finally {
      setUpdating(null)
    }
  }

  // Calculated values for KPI Metrics (excluding training)
  const bacaCount = useMemo(() => requests.filter(r => r.talep_turu.includes('Baca')).length, [requests])
  const yanginCount = useMemo(() => requests.filter(r => r.talep_turu.includes('Uygunluk') || r.talep_turu.includes('Ruhsat') || r.talep_turu.includes('Yangın Raporu')).length, [requests])
  
  // Total simulated revenue based on approved applications
  const revenue = useMemo(() => {
    return requests
      .filter(r => {
        const d = r.durum ? r.durum.toUpperCase() : '';
        return d === 'ONAYLANDI';
      })
      .reduce((sum, r) => {
        if (r.talep_turu.includes('Baca')) return sum + 650
        return sum + 2450 // İtfaiye Uygunluk Raporu / Ruhsat
      }, 0)
  }, [requests])

  // Assigned Crew mapping
  const getGorevliEkip = (req: CitizenRequest) => {
    if (req.atanan_ekip) return req.atanan_ekip;
    const d = req.durum ? req.durum.toUpperCase() : 'BEKLEMEDE';
    if (d === 'BEKLEMEDE' || d === 'BEKLIYOR') return 'Atanmadı'
    if (req.talep_turu.includes('Baca')) return 'B-Grubu Baca Ekibi'
    return '1. Grup Denetim Ekibi'
  }

  // Fees and payment statuses
  const getHarcDurumu = (req: CitizenRequest) => {
    let fee = 2450
    if (req.talep_turu.includes('Baca')) fee = 650

    const d = req.durum ? req.durum.toUpperCase() : 'BEKLEMEDE';
    if (d === 'BEKLEMEDE' || d === 'BEKLIYOR') {
      return { text: `Hesaplanmadı (₺${fee})`, variant: 'muted' as const }
    }
    if (d === 'EKİP ATANDI' || d === 'EKİP_ATANDI') {
      return { text: `Hesaplandı (₺${fee})`, variant: 'info' as const }
    }
    if (d === 'ONAYLANDI') {
      return { text: `Ödendi (₺${fee})`, variant: 'success' as const }
    }
    if (d === 'REDDEDİLDİ') {
      return { text: `Red/İptal`, variant: 'danger' as const }
    }
    return { text: `Muaf`, variant: 'muted' as const }
  }

  // Tactical badge render mapping
  const getStatusBadge = (durum: string) => {
    const d = durum ? durum.toUpperCase() : 'BEKLEMEDE';
    switch (d) {
      case 'ONAYLANDI': 
        return <Badge variant="success">Onaylandı</Badge>
      case 'EKİP ATANDI': 
      case 'EKİP_ATANDI':
        return <Badge variant="info">Ekip Atandı</Badge>
      case 'REDDEDİLDİ':
        return <Badge variant="danger">Reddedildi</Badge>
      case 'BEKLIYOR':
      case 'BEKLEMEDE':
      default: 
        return <Badge variant="warning">Bekliyor</Badge>
    }
  }

  // Dilekçe Generator
  const generateDilekce = (req: CitizenRequest) => {
    const tarih = new Date(req.basvuru_tarihi).toLocaleDateString('tr-TR', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
    const now = new Date().toLocaleDateString('tr-TR', {
      day: 'numeric', month: 'long', year: 'numeric'
    });

    let konuText = '';
    let govdeText = '';
    let teknikBilgi = '';

    if (req.talep_turu.includes('Baca')) {
      konuText = 'Baca Temizliği Hizmet Talebi Hk.';
      govdeText = `Aşağıda bilgileri verilen adresimde bulunan binanın baca temizliğinin yapılmasını talep ediyorum. Gerekli harç bedelinin tarafıma bildirilmesi halinde ödemeyi yapmayı kabul ve taahhüt ederim.`;
      if (req.baca_detaylari) {
        const bd = req.baca_detaylari;
        teknikBilgi = `
          <tr><td style="padding:6px 12px;border:1px solid #ccc;font-weight:600;">Kat Sayısı</td><td style="padding:6px 12px;border:1px solid #ccc;">${bd.kat_sayisi || '-'}</td></tr>
          <tr><td style="padding:6px 12px;border:1px solid #ccc;font-weight:600;">Daire Sayısı</td><td style="padding:6px 12px;border:1px solid #ccc;">${bd.daire_sayisi || '-'}</td></tr>
          <tr><td style="padding:6px 12px;border:1px solid #ccc;font-weight:600;">Yakıt Tipi</td><td style="padding:6px 12px;border:1px solid #ccc;">${bd.yakit_tipi || '-'}</td></tr>
          <tr><td style="padding:6px 12px;border:1px solid #ccc;font-weight:600;">Baca Tipi</td><td style="padding:6px 12px;border:1px solid #ccc;">${bd.baca_tipi || '-'}</td></tr>
        `;
      }
    } else {
      konuText = 'İtfaiye Uygunluk (Olur) Raporu Talebi Hk.';
      govdeText = `Aşağıda bilgileri verilen işyerimiz için İtfaiye Uygunluk (Olur) Raporu düzenlenmesini talep ediyorum. Ruhsat işlemleri kapsamında gerekli denetimlerin yapılmasını ve raporun tarafıma teslim edilmesini arz ederim.`;
      if (req.isyeri_detaylari) {
        const id = req.isyeri_detaylari;
        teknikBilgi = `
          <tr><td style="padding:6px 12px;border:1px solid #ccc;font-weight:600;">Faaliyet Konusu</td><td style="padding:6px 12px;border:1px solid #ccc;">${id.faaliyet_konusu || '-'}</td></tr>
          <tr><td style="padding:6px 12px;border:1px solid #ccc;font-weight:600;">Kapalı Alan (m²)</td><td style="padding:6px 12px;border:1px solid #ccc;">${id.alan_m2 || '-'}</td></tr>
          <tr><td style="padding:6px 12px;border:1px solid #ccc;font-weight:600;">Yangın Dolabı</td><td style="padding:6px 12px;border:1px solid #ccc;">${id.yangin_dolabi || '-'}</td></tr>
          <tr><td style="padding:6px 12px;border:1px solid #ccc;font-weight:600;">Acil Çıkış</td><td style="padding:6px 12px;border:1px solid #ccc;">${id.acil_cikis || '-'}</td></tr>
        `;
      }
    }

    const html = `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>Dilekçe - ${req.basvuran_ad_soyad} - ${req.talep_turu}</title>
  <style>
    @page { size: A4; margin: 25mm 20mm 25mm 20mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Times New Roman', 'Noto Serif', serif;
      font-size: 13pt;
      line-height: 1.7;
      color: #1a1a1a;
      padding: 60px 50px;
      max-width: 800px;
      margin: 0 auto;
    }
    .header { text-align: center; margin-bottom: 40px; border-bottom: 3px double #333; padding-bottom: 20px; }
    .header h1 { font-size: 16pt; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 4px; }
    .header h2 { font-size: 13pt; font-weight: 700; color: #444; }
    .meta-row { display: flex; justify-content: space-between; margin-bottom: 30px; font-size: 11pt; }
    .meta-row .left { text-align: left; }
    .meta-row .right { text-align: right; }
    .konu { margin-bottom: 25px; }
    .konu strong { font-size: 12pt; text-decoration: underline; }
    .govde { text-align: justify; text-indent: 40px; margin-bottom: 30px; }
    .bilgi-tablosu { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 11pt; }
    .bilgi-tablosu th { background: #f0f0f0; padding: 8px 12px; border: 1px solid #ccc; text-align: left; font-weight: 700; }
    .bilgi-tablosu td { padding: 6px 12px; border: 1px solid #ccc; }
    .section-title { font-size: 11pt; font-weight: 700; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
    .imza { margin-top: 60px; text-align: right; }
    .imza p { margin-bottom: 4px; }
    .imza .ad { font-weight: 700; font-size: 13pt; }
    .ek-bilgi { margin-top: 50px; font-size: 10pt; color: #888; border-top: 1px solid #ddd; padding-top: 15px; }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="text-align:center;margin-bottom:20px;">
    <button onclick="window.print()" style="padding:12px 32px;font-size:14px;font-weight:700;background:#1e40af;color:white;border:none;border-radius:8px;cursor:pointer;">🖨️ Yazdır / PDF Olarak Kaydet</button>
  </div>

  <div class="header">
    <h1>T.C. SİVAS BELEDİYESİ</h1>
    <h2>İtfaiye Müdürlüğü'ne</h2>
  </div>

  <div class="meta-row">
    <div class="left">
      <strong>Takip Kodu:</strong> ${req.takip_kodu || req.basvuran_tc || req.id}<br/>
      <strong>Başvuru Tarihi:</strong> ${tarih}
    </div>
    <div class="right">
      <strong>Belge Tarihi:</strong> ${now}
    </div>
  </div>

  <div class="konu">
    <strong>Konu:</strong> ${konuText}
  </div>

  <div class="govde">
    <p>${govdeText}</p>
    <p style="margin-top:10px;">Gereğini saygılarımla arz ederim.</p>
  </div>

  <p class="section-title">Başvuran Bilgileri</p>
  <table class="bilgi-tablosu">
    <tr><td style="padding:6px 12px;border:1px solid #ccc;font-weight:600;width:200px;">Ad Soyad</td><td style="padding:6px 12px;border:1px solid #ccc;">${req.basvuran_ad_soyad}</td></tr>
    <tr><td style="padding:6px 12px;border:1px solid #ccc;font-weight:600;">Takip Kodu</td><td style="padding:6px 12px;border:1px solid #ccc;">${req.takip_kodu || req.basvuran_tc || req.id}</td></tr>
    <tr><td style="padding:6px 12px;border:1px solid #ccc;font-weight:600;">T.C. Kimlik No</td><td style="padding:6px 12px;border:1px solid #ccc;">${(req.basvuran_tc && !req.basvuran_tc.startsWith('SVS-')) ? req.basvuran_tc : 'Girilmemiş'}</td></tr>
    <tr><td style="padding:6px 12px;border:1px solid #ccc;font-weight:600;">İrtibat Telefonu</td><td style="padding:6px 12px;border:1px solid #ccc;">${req.irtibat_tel}</td></tr>
    <tr><td style="padding:6px 12px;border:1px solid #ccc;font-weight:600;">Hizmet Adresi</td><td style="padding:6px 12px;border:1px solid #ccc;">${req.adres}</td></tr>
    <tr><td style="padding:6px 12px;border:1px solid #ccc;font-weight:600;">Hizmet Türü</td><td style="padding:6px 12px;border:1px solid #ccc;">${req.talep_turu}</td></tr>
  </table>

  ${teknikBilgi ? `
  <p class="section-title">Teknik Detaylar</p>
  <table class="bilgi-tablosu">
    ${teknikBilgi}
  </table>
  ` : ''}

  <div class="imza">
    <p>${tarih}</p>
    <p class="ad">${req.basvuran_ad_soyad}</p>
    <p style="font-size:10pt;color:#666;">İmza</p>
  </div>

  <div class="ek-bilgi">
    <strong>Not:</strong> Bu dilekçe, Sivas Belediyesi İtfaiye Müdürlüğü Bilgi Yönetim Sistemi üzerinden
    otomatik olarak oluşturulmuştur. Başvuru kaydı veritabanında saklanmaktadır.
    <br/><strong>Sistem Kayıt ID:</strong> ${req.id} &nbsp;|&nbsp; <strong>Oluşturma:</strong> ${new Date(req.created_at || req.basvuru_tarihi).toLocaleString('tr-TR')}
  </div>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (!w) {
      const a = document.createElement('a');
      a.href = url;
      a.download = `Dilekce_${req.basvuran_ad_soyad.replace(/\s+/g, '_')}_${req.talep_turu.replace(/\s+/g, '_')}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  if (loading) {
    return (
      <div className="p-8 text-center animate-pulse flex items-center justify-center gap-2 min-h-[50vh]">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--fd-accent)]" /> 
        <span className="text-[var(--fd-text3)] font-semibold">Vatandaş Hizmetleri Yükleniyor...</span>
      </div>
    )
  }

  return (
    <PageGuard pageId="hizmet_basvurulari">
      <div className="space-y-6 w-full max-w-full px-1.5 md:px-3 pb-12 animate-in fade-in zoom-in-95 duration-300">
        
        {/* Sayfa Başlığı */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--fd-border)] pb-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Vatandaş Hizmetleri ve Başvuru Yönetimi</h1>
            <p className="text-[var(--fd-text3)] text-sm mt-1">Sivas İtfaiyesi Baca Temizliği ve İtfaiye Uygunluk Raporu Resmi İş Akışı</p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              className="bg-[var(--fd-accent)] hover:opacity-90 text-white font-bold text-xs px-3.5 py-2 h-9 rounded-[var(--fd-r-sm)] flex items-center gap-1.5 shadow-[var(--fd-shadow-sm)] hover:scale-[1.02] transition duration-150 shrink-0"
              onClick={() => setIsCreateOpen(true)}
            >
              <FilePlus className="w-4 h-4" /> Yeni Başvuru Ekle
            </Button>
            {isMudur ? (
              <Badge variant="success" className="px-3 py-1 text-[10px]">
                Müdür Yetki Modu
              </Badge>
            ) : (
              <Badge variant="muted" className="px-3 py-1 text-[10px]">
                Salt Okunur (Read-Only)
              </Badge>
            )}
          </div>
        </div>

        {/* 1. Üst Özet KPI Kartları (Glassmorphic) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Baca Temizliği */}
          <Card className="bg-[var(--fd-surface)] border border-[var(--fd-border)] shadow-[var(--fd-shadow-sm)] p-4 rounded-[var(--fd-r)] relative overflow-hidden group hover:border-[var(--fd-info)]/30 transition-all duration-200 ease-out">
            <div className="absolute -right-4 -bottom-4 opacity-[0.04] text-[var(--fd-info)] group-hover:scale-110 transition duration-500">
              <Brush className="w-24 h-24" />
            </div>
            <CardContent className="p-0 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] text-[var(--fd-text3)] font-bold tracking-[.04em] uppercase">Baca Temizliği</span>
                <h3 className="text-2xl font-bold text-[var(--fd-info)] font-[var(--fd-fontmono)]">{bacaCount} Başvuru</h3>
                <p className="text-[10px] text-[var(--fd-text3)]">Sivas geneli konut/ticari baca talepleri</p>
              </div>
              <div className="p-3 bg-[rgba(37,99,235,0.1)] border border-[rgba(37,99,235,0.15)] text-[var(--fd-info)] rounded-[var(--fd-r-sm)]">
                <Brush className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>

          {/* Yangın Önlem / Ruhsat */}
          <Card className="bg-[var(--fd-surface)] border border-[var(--fd-border)] shadow-[var(--fd-shadow-sm)] p-4 rounded-[var(--fd-r)] relative overflow-hidden group hover:border-[var(--fd-amber)]/30 transition-all duration-200 ease-out">
            <div className="absolute -right-4 -bottom-4 opacity-[0.04] text-[var(--fd-amber)] group-hover:scale-110 transition duration-500">
              <ShieldCheck className="w-24 h-24" />
            </div>
            <CardContent className="p-0 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] text-[var(--fd-text3)] font-bold tracking-[.04em] uppercase">Yangın Önlem / Ruhsat</span>
                <h3 className="text-2xl font-bold text-[var(--fd-amber)] font-[var(--fd-fontmono)]">{yanginCount} Rapor</h3>
                <p className="text-[10px] text-[var(--fd-text3)]">İtfaiye uygunluk ve ruhsat onay süreci</p>
              </div>
              <div className="p-3 bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.15)] text-[var(--fd-amber)] rounded-[var(--fd-r-sm)]">
                <ShieldCheck className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>

          {/* Vezne / Tahsilat */}
          <Card className="bg-[var(--fd-surface)] border border-[var(--fd-border)] shadow-[var(--fd-shadow-sm)] p-4 rounded-[var(--fd-r)] relative overflow-hidden group hover:border-[var(--fd-success)]/30 transition-all duration-200 ease-out">
            <div className="absolute -right-4 -bottom-4 opacity-[0.04] text-[var(--fd-success)] group-hover:scale-110 transition duration-500">
              <CreditCard className="w-24 h-24" />
            </div>
            <CardContent className="p-0 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] text-[var(--fd-text3)] font-bold tracking-[.04em] uppercase">Vezne / Tahsilat</span>
                <h3 className="text-2xl font-bold text-[var(--fd-success)] font-[var(--fd-fontmono)]">₺{revenue.toLocaleString('tr-TR')}</h3>
                <p className="text-[10px] text-[var(--fd-text3)]">Onaylanan başvurulardan tahsil edilen harç</p>
              </div>
              <div className="p-3 bg-[rgba(22,163,74,0.1)] border border-[rgba(22,163,74,0.15)] text-[var(--fd-success)] rounded-[var(--fd-r-sm)]">
                <CreditCard className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Arama Barı */}
        <div className="flex items-center bg-[var(--fd-surface)] border border-[var(--fd-border)]/80 rounded-[var(--fd-r-sm)] px-3.5 py-2">
          <Search className="w-4 h-4 text-[var(--fd-text3)] mr-2" />
          <input
            type="text"
            className="bg-transparent border-none outline-none text-[var(--fd-text)] placeholder:text-[var(--fd-text3)] text-sm w-full"
            placeholder="Başvuran adı, TC no, adres veya hizmet türüne göre arayın..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* 3. Başvurular Veri Gridi */}
        <Card className="bg-[var(--fd-surface)] border border-[var(--fd-border)] shadow-[var(--fd-shadow-sm)] overflow-hidden rounded-[var(--fd-r)]">
          <CardHeader className="border-b border-[var(--fd-border)] bg-[var(--fd-surface2)]/20 pb-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-base font-bold tracking-wider uppercase text-[var(--fd-text2)] flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[var(--fd-accent)]" /> AKTİF BAŞVURULAR VERİ GRİDİ
                </CardTitle>
                <p className="text-xs text-[var(--fd-text3)] mt-1">Veritabanından anlık çekilen resmi vatandaş hizmet kayıtları</p>
              </div>
              <span className="text-[10px] font-mono bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text3)] px-2.5 py-1 rounded-md">
                FİLTRELENMİŞ KAYIT: {filteredRequests.length}
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {filteredRequests.length === 0 ? (
              <div className="text-center p-12 text-[var(--fd-text3)] bg-[var(--fd-surface2)]/20">
                Sistemde uygun bir hizmet başvurusu bulunmamaktadır.
              </div>
            ) : (
              <>
                {/* Desktop Tablo Görünümü */}
                <div className="hidden md:block overflow-x-auto scrollbar-thin">
                  <table className="w-full min-w-[1000px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-[var(--fd-border)] bg-[var(--fd-surface2)]/40 text-[var(--fd-text3)] font-bold text-[10px] uppercase tracking-[.04em]">
                        <th className="p-4 text-left">Başvuran / Kurum Adı</th>
                        <th className="p-4 text-left">Hizmet Türü</th>
                        <th className="p-4 text-left">Başvuru Tarihi</th>
                        <th className="p-4 text-left">Görevli Ekip</th>
                        <th className="p-4 text-left">Harç Durumu</th>
                        <th className="p-4 text-left">İşlem Durumu</th>
                        <th className="p-4 text-right">İşlemler</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--fd-border)]/50">
                      {filteredRequests.map(req => {
                        const feeObj = getHarcDurumu(req)
                        return (
                          <tr key={req.id} className="hover:bg-[var(--fd-surface2)]/30 transition duration-150 group">
                            <td className="p-4 align-middle whitespace-nowrap">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-lg bg-[var(--fd-surface2)]/80 border border-[var(--fd-border)] flex items-center justify-center text-[var(--fd-text3)] group-hover:scale-105 transition shrink-0">
                                  <User className="w-4 h-4" />
                                </div>
                                <div className="space-y-0.5">
                                  <span className="font-bold text-[var(--fd-text)] block text-sm line-clamp-1">{req.basvuran_ad_soyad}</span>
                                  <span className="text-[10px] text-[var(--fd-text3)] font-mono block">TC: {req.basvuran_tc || 'Girilmemiş'}</span>
                                </div>
                              </div>
                            </td>
                            <td className="p-4 align-middle whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <div className={`p-1.5 rounded-[var(--fd-r-sm)] ${req.talep_turu.includes('Baca') ? 'text-[var(--fd-info)] bg-[rgba(37,99,235,0.1)]' : 'text-[var(--fd-amber)] bg-[rgba(245,158,11,0.1)]'}`}>
                                  {req.talep_turu.includes('Baca') ? <Brush className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                                </div>
                                <span className="font-semibold text-[var(--fd-text2)]">{req.talep_turu}</span>
                              </div>
                            </td>
                            <td className="p-4 align-middle text-[var(--fd-text3)] font-medium whitespace-nowrap">
                              <div className="flex items-center gap-1.5 text-xs">
                                <Calendar className="w-3.5 h-3.5 text-[var(--fd-text3)]" />
                                {new Date(req.basvuru_tarihi).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </div>
                            </td>
                            <td className="p-4 align-middle font-bold text-xs text-[var(--fd-text3)] whitespace-nowrap">
                              <span className={(!req.atanan_ekip && (req.durum === 'BEKLEMEDE' || req.durum === 'Bekliyor')) ? 'text-[var(--fd-text3)] font-normal italic' : 'text-[var(--fd-text2)]'}>
                                {getGorevliEkip(req)}
                              </span>
                            </td>
                            <td className="p-4 align-middle whitespace-nowrap">
                              <Badge variant={feeObj.variant}>
                                {feeObj.text}
                              </Badge>
                            </td>
                            <td className="p-4 align-middle whitespace-nowrap">
                              {getStatusBadge(req.durum)}
                            </td>
                            <td className="p-4 align-middle text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 text-[11px] font-bold text-[var(--fd-accent)] hover:text-[var(--fd-text)] hover:bg-[var(--fd-accent)]/15"
                                  onClick={() => setSelectedRequest(req)}
                                >
                                  Detay & Karar
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 text-[11px] font-semibold text-[var(--fd-text3)] hover:text-[var(--fd-text)]"
                                  onClick={() => generateDilekce(req)}
                                >
                                  Dilekçe PDF
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Kart Görünümü */}
                <div className="block md:hidden divide-y divide-[var(--fd-border)]/50">
                  {filteredRequests.map(req => {
                    const feeObj = getHarcDurumu(req)
                    return (
                      <div key={req.id} className="p-4 space-y-3 hover:bg-[var(--fd-surface2)]/40">
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-0.5">
                            <span className="font-bold text-[var(--fd-text)] text-sm block">{req.basvuran_ad_soyad}</span>
                            <span className="text-[10px] text-[var(--fd-text3)] font-mono block">TC: {req.basvuran_tc || 'Girilmemiş'}</span>
                          </div>
                          <div className="text-right">
                            {getStatusBadge(req.durum)}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <div className="flex items-center gap-1 text-[var(--fd-text3)] bg-[var(--fd-surface2)] px-2 py-1 rounded">
                            {req.talep_turu.includes('Baca') ? <Brush className="w-3 h-3 text-[var(--fd-info)]" /> : <ShieldCheck className="w-3 h-3 text-[var(--fd-amber)]" />}
                            <span>{req.talep_turu}</span>
                          </div>
                          <div className="text-[var(--fd-text3)] font-mono bg-[var(--fd-surface2)] px-2 py-1 rounded">
                            {new Date(req.basvuru_tarihi).toLocaleDateString('tr-TR')}
                          </div>
                        </div>

                        <div className="flex items-center justify-between border-t border-[var(--fd-border)]/50 pt-2 text-xs">
                          <div className="text-[var(--fd-text3)] font-semibold">
                            Ekip: <span className="text-[var(--fd-text2)]">{getGorevliEkip(req)}</span>
                          </div>
                          <div>
                            <Badge variant={feeObj.variant} className="text-[10px] px-1.5 py-0">
                              {feeObj.text}
                            </Badge>
                          </div>
                        </div>

                        <div className="flex gap-2 pt-1.5">
                          <Button
                            className="flex-1 bg-[var(--fd-surface2)] hover:bg-[var(--fd-surface3)] text-[var(--fd-text2)] font-bold py-2 h-9 text-xs rounded-[var(--fd-r-sm)]"
                            onClick={() => setSelectedRequest(req)}
                          >
                            İncele / Karar
                          </Button>
                          <Button
                            className="bg-[var(--fd-accent)]/10 hover:bg-[var(--fd-accent)]/20 text-[var(--fd-accent)] font-bold px-3 py-2 h-9 text-xs rounded-[var(--fd-r-sm)]"
                            onClick={() => generateDilekce(req)}
                          >
                            Dilekçe
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Detay & Karar Yönetim Modalı */}
        {selectedRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
            <Card className="w-full max-w-2xl bg-[var(--fd-surface)] backdrop-blur-lg border border-[var(--fd-border)]/80 shadow-2xl overflow-hidden rounded-[var(--fd-r)] animate-in zoom-in-95 duration-200 my-auto">
              <CardHeader className="bg-[var(--fd-surface2)]/40 border-b border-[var(--fd-border)]/80 p-5 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2 font-bold text-[var(--fd-text)]">
                    {selectedRequest.talep_turu.includes('Baca') ? <Brush className="w-5 h-5 text-[var(--fd-info)]" /> : <ShieldCheck className="w-5 h-5 text-[var(--fd-amber)]" />}
                    BAŞVURU YÖNETİM & TEKNİK DETAY DETAYI
                  </CardTitle>
                  <p className="text-xs text-[var(--fd-text3)] mt-1">Sivas Belediyesi İtfaiye Müdürlüğü Resmi Karar Değerlendirme Arayüzü</p>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-[var(--fd-text3)] hover:text-[var(--fd-text)]"
                  onClick={() => setSelectedRequest(null)}
                >
                  <X className="w-5 h-5" />
                </Button>
              </CardHeader>

              <CardContent className="p-6 space-y-6 max-h-[60vh] overflow-y-auto scrollbar-thin">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-xs text-[var(--fd-text3)] font-bold uppercase tracking-wider block">Başvuran Vatandaş / Kurum</span>
                    <span className="text-sm font-semibold text-[var(--fd-text)] block">{selectedRequest.basvuran_ad_soyad}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-[var(--fd-text3)] font-bold uppercase tracking-wider block">T.C. Kimlik / Vergi No</span>
                    <span className="text-sm font-semibold text-[var(--fd-text)] block">{selectedRequest.basvuran_tc || 'Girilmemiş'}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-[var(--fd-text3)] font-bold uppercase tracking-wider block">İrtibat Numarası</span>
                    <span className="text-sm font-semibold text-[var(--fd-text)] block">{selectedRequest.irtibat_tel}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-[var(--fd-text3)] font-bold uppercase tracking-wider block">Başvuru Tarihi</span>
                    <span className="text-sm font-semibold text-[var(--fd-text)] block">
                      {new Date(selectedRequest.basvuru_tarihi).toLocaleString('tr-TR')}
                    </span>
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <span className="text-xs text-[var(--fd-text3)] font-bold uppercase tracking-wider block">Hizmet Adresi</span>
                    <span className="text-sm font-semibold text-[var(--fd-text)] block">{selectedRequest.adres}</span>
                  </div>
                </div>

                {/* Baca Detayları */}
                {selectedRequest.talep_turu.includes('Baca') && selectedRequest.baca_detaylari && (
                  <div className="bg-[rgba(37,99,235,0.05)] border border-[rgba(37,99,235,0.1)] p-4 rounded-[var(--fd-r-sm)] space-y-2">
                    <h4 className="text-xs font-semibold text-[var(--fd-info)] uppercase tracking-[.04em] border-b border-[rgba(37,99,235,0.1)] pb-1 flex items-center gap-1.5">
                      <Brush className="w-3.5 h-3.5" /> Teknik Baca Parametreleri
                    </h4>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[var(--fd-text3)] block">Bina Kat Sayısı:</span>
                        <span className="font-bold text-[var(--fd-text2)]">{selectedRequest.baca_detaylari.kat_sayisi || 1} Kat</span>
                      </div>
                      <div>
                        <span className="text-[var(--fd-text3)] block">Bağımsız Bölüm (Daire) Sayısı:</span>
                        <span className="font-bold text-[var(--fd-text2)]">{selectedRequest.baca_detaylari.daire_sayisi || 1} Daire</span>
                      </div>
                      <div>
                        <span className="text-[var(--fd-text3)] block">Yakıt Tipi:</span>
                        <span className="font-bold text-[var(--fd-text2)]">{selectedRequest.baca_detaylari.yakit_tipi || 'Doğalgaz'}</span>
                      </div>
                      <div>
                        <span className="text-[var(--fd-text3)] block">Baca Konstrüksiyon Tipi:</span>
                        <span className="font-bold text-[var(--fd-text2)]">{selectedRequest.baca_detaylari.baca_tipi || 'Konut Bacası'}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* İşyeri Uygunluk Raporu Detayları */}
                {!selectedRequest.talep_turu.includes('Baca') && selectedRequest.isyeri_detaylari && (
                  <div className="bg-[rgba(245,158,11,0.05)] border border-[rgba(245,158,11,0.1)] p-4 rounded-[var(--fd-r-sm)] space-y-2">
                    <h4 className="text-xs font-semibold text-[var(--fd-amber)] uppercase tracking-[.04em] border-b border-[rgba(245,158,11,0.1)] pb-1 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5" /> İşyeri Yangın Güvenlik Detayları
                    </h4>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[var(--fd-text3)] block">Faaliyet Konusu:</span>
                        <span className="font-bold text-[var(--fd-text2)]">{selectedRequest.isyeri_detaylari.faaliyet_konusu || 'Belirtilmemiş'}</span>
                      </div>
                      <div>
                        <span className="text-[var(--fd-text3)] block">Kapalı Alan (m²):</span>
                        <span className="font-bold text-[var(--fd-text2)]">{selectedRequest.isyeri_detaylari.alan_m2 || 100} m²</span>
                      </div>
                      <div>
                        <span className="text-[var(--fd-text3)] block">Yangın Dolabı Durumu:</span>
                        <span className="font-bold text-[var(--fd-text2)]">{selectedRequest.isyeri_detaylari.yangin_dolabi || 'Mevcut'}</span>
                      </div>
                      <div>
                        <span className="text-[var(--fd-text3)] block">Acil Çıkış İmkanları:</span>
                        <span className="font-bold text-[var(--fd-text2)]">{selectedRequest.isyeri_detaylari.acil_cikis || '1 Adet'}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Amir İşlem Geçmişi (Karar Trail) */}
                {selectedRequest.islem_yapan_amir && (
                  <div className="bg-[var(--fd-surface2)] border border-[var(--fd-border)] p-4 rounded-[var(--fd-r-sm)] space-y-1.5 text-xs">
                    <div className="flex items-center justify-between text-[var(--fd-text3)] font-semibold">
                      <span>İŞLEM YAPAN AMİR</span>
                      <span>{selectedRequest.islem_tarihi ? new Date(selectedRequest.islem_tarihi).toLocaleString('tr-TR') : ''}</span>
                    </div>
                    <div className="text-[var(--fd-text2)] font-bold">
                      {selectedRequest.islem_yapan_amir}
                    </div>
                    {selectedRequest.red_gerekcesi && (
                      <div className="bg-[rgba(220,38,38,0.08)] border border-[rgba(220,38,38,0.12)] p-2.5 rounded-[var(--fd-r-sm)] text-[var(--fd-danger)] mt-2 font-[var(--fd-fontmono)]">
                        <span className="font-bold block text-[10px] uppercase text-[var(--fd-danger)] mb-0.5">RED GEREKÇESİ:</span>
                        {selectedRequest.red_gerekcesi}
                      </div>
                    )}
                  </div>
                )}

                {/* Tactical Actions Panels */}
                {tacticalMode === 'RED' && (
                  <div className="bg-[rgba(220,38,38,0.06)] border border-[rgba(220,38,38,0.15)] p-4 rounded-[var(--fd-r-sm)] space-y-3">
                    <label className="text-xs font-bold text-[var(--fd-danger)] block">LÜTFEN RESMİ RED GEREKÇESİNİ YAZIN <span className="text-[var(--fd-danger)]">*</span></label>
                    <textarea
                      className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] rounded-[var(--fd-r-sm)] p-3 text-sm text-[var(--fd-text)] placeholder:text-[var(--fd-text3)] focus:outline-none focus:border-[var(--fd-danger)] font-semibold"
                      rows={3}
                      placeholder="Tesisat eksiklikleri, harç ödemesi yapılmaması vb. idari/teknik gerekçeler..."
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        className="border-[var(--fd-border)] text-[var(--fd-text3)] text-xs px-3 py-1.5 h-8 font-semibold"
                        onClick={() => setTacticalMode('NONE')}
                      >
                        İptal
                      </Button>
                      <Button
                        className="bg-[var(--fd-danger)] hover:opacity-90 text-white text-xs px-3.5 py-1.5 h-8 font-bold flex items-center gap-1 rounded-[var(--fd-r-sm)]"
                        onClick={() => handleTacticalAction(selectedRequest.id, 'REDDEDİLDİ', { reason: rejectionReason })}
                      >
                        Reddi Tamamla
                      </Button>
                    </div>
                  </div>
                )}

                {tacticalMode === 'EKIP' && (
                  <div className="bg-[rgba(37,99,235,0.06)] border border-[rgba(37,99,235,0.15)] p-4 rounded-[var(--fd-r-sm)] space-y-3">
                    <label className="text-xs font-bold text-[var(--fd-info)] block">GÖREVLENDİRİLECEK SAHA EKİBİNİ SEÇİN <span className="text-[var(--fd-danger)]">*</span></label>
                    <select
                      className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--fd-accent)] font-semibold"
                      value={selectedCrew}
                      onChange={(e) => setSelectedCrew(e.target.value)}
                    >
                      {selectedRequest.talep_turu.includes('Baca') ? (
                        <>
                          <option value="B-Grubu Baca Ekibi">B-Grubu Baca Ekibi</option>
                          <option value="A-Grubu Baca Temizlik Timi">A-Grubu Baca Temizlik Timi</option>
                        </>
                      ) : (
                        <>
                          <option value="1. Grup Denetim Ekibi">1. Grup Denetim Ekibi</option>
                          <option value="2. Grup Ruhsat Denetçileri">2. Grup Ruhsat Denetçileri</option>
                          <option value="Merkez İstasyonu A Grubu">Merkez İstasyonu A Grubu</option>
                        </>
                      )}
                    </select>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        className="border-[var(--fd-border)] text-[var(--fd-text3)] text-xs px-3 py-1.5 h-8 font-semibold"
                        onClick={() => setTacticalMode('NONE')}
                      >
                        İptal
                      </Button>
                      <Button
                        className="bg-[var(--fd-info)] hover:opacity-90 text-white text-xs px-3.5 py-1.5 h-8 font-bold flex items-center gap-1 rounded-[var(--fd-r-sm)]"
                        onClick={() => handleTacticalAction(selectedRequest.id, 'EKİP_ATANDI', { crew: selectedCrew })}
                      >
                        Ekibi Ata
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>

              <div className="bg-[var(--fd-surface2)]/40 border-t border-[var(--fd-border)]/80 p-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {isMudur && (
                    <Button
                      variant="ghost"
                      className="text-[var(--fd-danger)] hover:text-[var(--fd-text)] hover:bg-[rgba(220,38,38,0.1)] text-xs font-bold px-3 py-2 h-9 rounded-[var(--fd-r-sm)] flex items-center gap-1.5"
                      disabled={updating !== null}
                      onClick={() => handleDeleteRequest(selectedRequest.id)}
                    >
                      <Trash2 className="w-4 h-4" /> Kalıcı Olarak Sil
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    className="border-[var(--fd-border)] text-[var(--fd-text2)] hover:text-[var(--fd-text)] hover:bg-[var(--fd-surface3)]/50 font-semibold px-4 py-2 h-9 rounded-[var(--fd-r-sm)] text-xs"
                    onClick={() => setSelectedRequest(null)}
                  >
                    Kapat
                  </Button>

                  {isMudur && selectedRequest.durum !== 'ONAYLANDI' && selectedRequest.durum !== 'REDDEDİLDİ' && (
                    <>
                      <Button
                        className="bg-[var(--fd-danger)] hover:opacity-90 text-white font-bold text-xs px-4 py-2 h-9 rounded-[var(--fd-r-sm)] flex items-center gap-1"
                        disabled={updating !== null || tacticalMode === 'RED'}
                        onClick={() => setTacticalMode('RED')}
                      >
                        Reddet
                      </Button>
                      <Button
                        className="bg-[var(--fd-info)] hover:opacity-90 text-white font-bold text-xs px-4 py-2 h-9 rounded-[var(--fd-r-sm)] flex items-center gap-1"
                        disabled={updating !== null || tacticalMode === 'EKIP'}
                        onClick={() => setTacticalMode('EKIP')}
                      >
                        Ekip Görevlendir
                      </Button>
                      <Button
                        className="bg-[var(--fd-success)] hover:opacity-90 text-white font-bold text-xs px-4 py-2 h-9 rounded-[var(--fd-r-sm)] flex items-center gap-1 shadow-[var(--fd-shadow-sm)]"
                        disabled={updating !== null}
                        onClick={() => handleTacticalAction(selectedRequest.id, 'ONAYLANDI')}
                      >
                        {updating === selectedRequest.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Resmen Onayla'}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Yeni Başvuru Ekle Modalı */}
        {isCreateOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
            <Card className="w-full max-w-2xl bg-[var(--fd-surface)] backdrop-blur-lg border border-[var(--fd-border)]/80 shadow-2xl overflow-hidden rounded-[var(--fd-r)] animate-in zoom-in-95 duration-200 my-auto">
              <CardHeader className="bg-[var(--fd-surface2)]/40 border-b border-[var(--fd-border)]/80 p-5 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2 font-bold text-[var(--fd-text)]">
                    <FilePlus className="w-5 h-5 text-[var(--fd-accent)]" /> YENİ VATANDAŞ BAŞVURUSU KAYDI
                  </CardTitle>
                  <p className="text-xs text-[var(--fd-text3)] mt-1">Sivas Belediyesi İtfaiye Müdürlüğü Vatandaş Hizmet Kaydı</p>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-[var(--fd-text3)] hover:text-[var(--fd-text)]"
                  onClick={() => setIsCreateOpen(false)}
                >
                  <X className="w-5 h-5" />
                </Button>
              </CardHeader>
              
              <form onSubmit={handleCreateRequest}>
                <CardContent className="p-6 space-y-4 max-h-[60vh] overflow-y-auto scrollbar-thin">
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Hizmet Türü */}
                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="text-xs font-bold text-[var(--fd-text3)] block">Talep Edilen Hizmet Türü <span className="text-[var(--fd-danger)]">*</span></label>
                      <select
                        className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--fd-accent)] font-semibold"
                        value={newRequestForm.talep_turu}
                        onChange={(e) => setNewRequestForm(prev => ({ ...prev, talep_turu: e.target.value }))}
                      >
                        <option value="Baca Temizliği">Baca Temizliği (Ev/Konut/Sanayi)</option>
                        <option value="İtfaiye Uygunluk Raporu">İtfaiye Uygunluk (Olur) Raporu (Ruhsat Öncesi)</option>
                      </select>
                    </div>

                    {/* Başvuran Ad Soyad */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-[var(--fd-text3)] block">Başvuran Adı Soyadı <span className="text-[var(--fd-danger)]">*</span></label>
                      <input
                        type="text"
                        required
                        className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] px-3.5 py-2 text-sm focus:outline-none focus:border-[var(--fd-accent)] transition font-semibold"
                        placeholder="Örn: Ahmet Yılmaz"
                        value={newRequestForm.basvuran_ad_soyad}
                        onChange={(e) => setNewRequestForm(prev => ({ ...prev, basvuran_ad_soyad: e.target.value }))}
                      />
                    </div>

                    {/* T.C. Kimlik / Vergi No */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-[var(--fd-text3)] block">T.C. Kimlik No / Vergi No</label>
                      <input
                        type="text"
                        maxLength={11}
                        className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] px-3.5 py-2 text-sm focus:outline-none focus:border-[var(--fd-accent)] transition font-medium"
                        placeholder="11 haneli T.C. veya Vergi No"
                        value={newRequestForm.basvuran_tc}
                        onChange={(e) => setNewRequestForm(prev => ({ ...prev, basvuran_tc: e.target.value }))}
                      />
                    </div>

                    {/* İrtibat Tel */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-[var(--fd-text3)] block">İrtibat Telefon Numarası <span className="text-[var(--fd-danger)]">*</span></label>
                      <input
                        type="tel"
                        required
                        className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] px-3.5 py-2 text-sm focus:outline-none focus:border-[var(--fd-accent)] transition font-medium"
                        placeholder="05xx xxx xx xx"
                        value={newRequestForm.irtibat_tel}
                        onChange={(e) => setNewRequestForm(prev => ({ ...prev, irtibat_tel: e.target.value }))}
                      />
                    </div>

                    {/* Adres */}
                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="text-xs font-bold text-[var(--fd-text3)] block">Hizmet Adresi <span className="text-[var(--fd-danger)]">*</span></label>
                      <input
                        type="text"
                        required
                        className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] px-3.5 py-2 text-sm focus:outline-none focus:border-[var(--fd-accent)] transition font-semibold"
                        placeholder="Örn: Esentepe Mah. Şehitler Cad. No:12/4 Merkez/Sivas"
                        value={newRequestForm.adres}
                        onChange={(e) => setNewRequestForm(prev => ({ ...prev, adres: e.target.value }))}
                      />
                    </div>
                  </div>

                  {/* Baca Detayları Form Katmanı */}
                  {newRequestForm.talep_turu === 'Baca Temizliği' && (
                    <div className="space-y-4 bg-[rgba(37,99,235,0.05)] p-4 rounded-[var(--fd-r-sm)] border border-[rgba(37,99,235,0.1)]">
                      <h3 className="font-bold text-sm text-[var(--fd-info)] border-b border-[rgba(37,99,235,0.15)] pb-1.5 flex items-center gap-1.5">
                        <Brush className="w-4 h-4" /> Teknik Baca Detayları
                      </h3>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-[var(--fd-text3)] block">Bina Kat Sayısı</label>
                          <input
                            type="number"
                            min={1}
                            className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--fd-accent)] transition font-medium"
                            value={newRequestForm.baca_kat_sayisi}
                            onChange={(e) => setNewRequestForm(prev => ({ ...prev, baca_kat_sayisi: e.target.value }))}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-[var(--fd-text3)] block">Daire Sayısı</label>
                          <input
                            type="number"
                            min={1}
                            className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--fd-accent)] transition font-medium"
                            value={newRequestForm.baca_daire_sayisi}
                            onChange={(e) => setNewRequestForm(prev => ({ ...prev, baca_daire_sayisi: e.target.value }))}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-[var(--fd-text3)] block">Kullanılan Yakıt Tipi</label>
                          <select
                            className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--fd-accent)] transition font-semibold"
                            value={newRequestForm.baca_yakit_tipi}
                            onChange={(e) => setNewRequestForm(prev => ({ ...prev, baca_yakit_tipi: e.target.value }))}
                          >
                            <option value="Doğalgaz">Doğalgaz</option>
                            <option value="Kömür / Odun">Kömür / Odun</option>
                            <option value="Fuel-Oil">Fuel-Oil / Sıvı Yakıt</option>
                            <option value="Elektrik">Elektrik</option>
                          </select>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-[var(--fd-text3)] block">Baca Konstrüksiyon Tipi</label>
                          <select
                            className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--fd-accent)] transition font-semibold"
                            value={newRequestForm.baca_tipi}
                            onChange={(e) => setNewRequestForm(prev => ({ ...prev, baca_tipi: e.target.value }))}
                          >
                            <option value="Standart Konut Bacası">Standart Konut Bacası</option>
                            <option value="Sanayi / Fabrika Bacası">Sanayi / Fabrika Bacası</option>
                            <option value="Kazan Dairesi Bacası">Kazan Dairesi Bacası</option>
                            <option value="Şömine / Barbekü Bacası">Şömine / Barbekü Bacası</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* İşyeri Detayları Form Katmanı */}
                  {newRequestForm.talep_turu === 'İtfaiye Uygunluk Raporu' && (
                    <div className="space-y-4 bg-[rgba(245,158,11,0.05)] p-4 rounded-[var(--fd-r-sm)] border border-[rgba(245,158,11,0.1)]">
                      <h3 className="font-bold text-sm text-[var(--fd-amber)] border-b border-[rgba(245,158,11,0.15)] pb-1.5 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4" /> İşyeri Yangın Güvenlik Detayları
                      </h3>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-[var(--fd-text3)] block">Faaliyet Konusu</label>
                          <input
                            type="text"
                            className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] px-3.5 py-2 text-sm focus:outline-none focus:border-[var(--fd-accent)] transition font-semibold"
                            placeholder="Fırın, İmalathane, Kafe vb."
                            value={newRequestForm.isyeri_faaliyet_konusu}
                            onChange={(e) => setNewRequestForm(prev => ({ ...prev, isyeri_faaliyet_konusu: e.target.value }))}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-[var(--fd-text3)] block">Kapalı Alan (m²)</label>
                          <input
                            type="number"
                            min={1}
                            className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--fd-accent)] transition font-medium"
                            value={newRequestForm.isyeri_alan_m2}
                            onChange={(e) => setNewRequestForm(prev => ({ ...prev, isyeri_alan_m2: e.target.value }))}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-[var(--fd-text3)] block">Yangın Dolabı Durumu</label>
                          <select
                            className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--fd-accent)] transition font-semibold"
                            value={newRequestForm.isyeri_yangin_dolabi}
                            onChange={(e) => setNewRequestForm(prev => ({ ...prev, isyeri_yangin_dolabi: e.target.value }))}
                          >
                            <option value="Mevcut">Mevcut</option>
                            <option value="Mevcut Değil / Eksik">Mevcut Değil / Eksik</option>
                          </select>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-[var(--fd-text3)] block">Acil Çıkış Kapısı Sayısı</label>
                          <input
                            type="text"
                            className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] px-3.5 py-2 text-sm focus:outline-none focus:border-[var(--fd-accent)] transition font-medium"
                            placeholder="Örn: 2 Adet Yangın Kapısı"
                            value={newRequestForm.isyeri_acil_cikis}
                            onChange={(e) => setNewRequestForm(prev => ({ ...prev, isyeri_acil_cikis: e.target.value }))}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>

                <div className="bg-[var(--fd-surface2)]/40 border-t border-[var(--fd-border)]/80 p-5 flex items-center justify-end gap-3">
                  <Button 
                    type="button"
                    variant="outline" 
                    className="border-[var(--fd-border)] text-[var(--fd-text2)] hover:text-[var(--fd-text)] hover:bg-[var(--fd-surface3)]/50 font-semibold px-4 py-2 rounded-[var(--fd-r-sm)] text-xs"
                    onClick={() => {
                      setIsCreateOpen(false)
                      resetForm()
                    }}
                  >
                    Vazgeç
                  </Button>
                  <Button 
                    type="submit"
                    className="bg-[var(--fd-accent)] hover:opacity-90 text-white font-bold text-xs px-4 py-2 rounded-[var(--fd-r-sm)] flex items-center gap-1.5 shadow-md transition"
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Kaydediliyor...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-3.5 h-3.5" /> Başvuruyu Kaydet
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        )}

      </div>
    </PageGuard>
  )
}
