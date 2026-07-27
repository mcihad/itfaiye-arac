"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import jsPDF from "jspdf"
import { QRCodeCanvas } from "qrcode.react"
import imageCompression from "browser-image-compression"
import { api, unwrap, getAuthHeaders } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { Input } from "@/components/ui/Input"
import { ArrowLeft, User, Phone, MapPin, Calendar, Briefcase, FileText, Activity, Shield, ActivitySquare, LogOut, CheckCircle2, Clock, AlertTriangle, Pencil, X, Save, Loader2, Trash2, Camera } from "lucide-react"
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts"
import { useAuthStore } from "@/lib/authStore"
import { cn } from "@/lib/utils"
import { CertificatesTab } from "@/components/personnel/CertificatesTab"
import { toast } from "@/lib/toast"

// Types
type Personel = any; // TODO: Better typing

const fetchGeistFontBase64 = async (): Promise<string> => {
  const fontRes = await fetch('/Geist-Regular.ttf')
  const fontBuffer = await fontRes.arrayBuffer()
  return btoa(
    new Uint8Array(fontBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
  )
}

const loadHtmlImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.src = src
    img.onload = () => resolve(img)
    img.onerror = (err) => reject(err)
  })
}


export default function PersonelProfilPage() {
  const params = useParams()
  const router = useRouter()
  const sicil_no = params.id as string

  const [personel, setPersonel] = useState<Personel | null>(null)
  const [details, setDetails] = useState<any>(null)
  const [leaves, setLeaves] = useState<any[]>([])
  const [equipments, setEquipments] = useState<any[]>([])
  const [activities, setActivities] = useState<any[]>([])
  const [records, setRecords] = useState<any[]>([])

  const [activeTab, setActiveTab] = useState("ozet")
  const [loading, setLoading] = useState(true)

  const [stats, setStats] = useState<any[] | null>(null)
  const [totalMissions, setTotalMissions] = useState<number>(0)
  const [statsLoading, setStatsLoading] = useState(true)
  const [certInfo, setCertInfo] = useState<any | null>(null)

  // Faz 28.56: Kişisel İletişim Bilgileri Düzenleme State'leri
  const { user } = useAuthStore()
  const [isEditing, setIsEditing] = useState(false)
  const [editPhone, setEditPhone] = useState("")
  const [editAddress, setEditAddress] = useState("")
  const [editEmergencyName, setEditEmergencyName] = useState("")
  const [editEmergencyPhone, setEditEmergencyPhone] = useState("")
  const [savingDetails, setSavingDetails] = useState(false)

  // Yeni İzin/Görev Talebi Ekleme State'leri
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false)
  const [leaveType, setLeaveType] = useState("İzinli")
  const [leaveStartDate, setLeaveStartDate] = useState(new Date().toLocaleDateString('en-CA'))
  const [leaveEndDate, setLeaveEndDate] = useState(new Date().toLocaleDateString('en-CA'))
  const [leaveDescription, setLeaveDescription] = useState("")
  const [savingLeave, setSavingLeave] = useState(false)

  const leaveStats = useMemo(() => {
    let totalIzin = 0;
    let totalRapor = 0;
    let totalGeciciGorev = 0;
    let totalDisGorev = 0;

    leaves.forEach(l => {
      if (l.baslangic_tarihi && l.bitis_tarihi) {
        const start = new Date(l.baslangic_tarihi);
        const end = new Date(l.bitis_tarihi);
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

        const tLower = (l.izin_turu || '').toLowerCase();
        if (tLower.includes('izin')) {
          totalIzin += diffDays;
        } else if (tLower.includes('rapor')) {
          totalRapor += diffDays;
        } else if (tLower.includes('geçici') || tLower.includes('gecici')) {
          totalGeciciGorev += diffDays;
        } else if (tLower.includes('dış') || tLower.includes('dis')) {
          totalDisGorev += diffDays;
        }
      }
    });

    return {
      izin: totalIzin,
      rapor: totalRapor,
      gecici: totalGeciciGorev,
      dis: totalDisGorev
    };
  }, [leaves]);

  const canEdit = user && (user.sicilNo === sicil_no || user.rol === "Admin")

  // Vesikalık fotoğraf yükleme (kişinin kendisi veya Admin)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  // Fotoğrafa tıklayınca büyük önizleme
  const [photoPreviewOpen, setPhotoPreviewOpen] = useState(false)

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingPhoto(true)
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 800,
        useWebWorker: true,
        fileType: "image/jpeg",
      })

      const formData = new FormData()
      formData.append("file", compressed, `foto_${sicil_no}_${Date.now()}.jpg`)
      formData.append("folder", "personel-foto")

      const res = await fetch("/api/upload", {
        method: "POST",
        headers: getAuthHeaders(),
        body: formData,
      })
      const result = await res.json()
      if (!res.ok || result.error) throw new Error(result.error || "Dosya yüklenemedi")

      unwrap(await api.update("personnel", { foto_url: result.url }, { sicil_no }))
      setPersonel((prev: any) => (prev ? { ...prev, foto_url: result.url } : prev))
    } catch (err: any) {
      toast("Fotoğraf yüklenemedi: " + (err?.message || err))
    } finally {
      setUploadingPhoto(false)
      if (photoInputRef.current) photoInputRef.current.value = ""
    }
  }

  const handleStartEdit = () => {
    setEditPhone(details?.telefon || "")
    setEditAddress(details?.adres || "")
    setEditEmergencyName(details?.acil_durum_kisi_ad || "")
    setEditEmergencyPhone(details?.acil_durum_kisi_telefon || "")
    setIsEditing(true)
  }

  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingDetails(true)
    try {
      const payload = {
        sicil_no: sicil_no,
        telefon: editPhone,
        adres: editAddress,
        acil_durum_kisi_ad: editEmergencyName,
        acil_durum_kisi_telefon: editEmergencyPhone,
        updated_at: new Date().toISOString()
      }
      const { error } = await api.upsert('personnel_details', payload, 'sicil_no')
      if (error) throw error
      
      setDetails((prev: any) => prev ? ({ ...prev, ...payload }) : payload)
      setIsEditing(false)
    } catch (err: any) {
      toast("Bilgiler güncellenirken hata oluştu: " + err.message)
    } finally {
      setSavingDetails(false)
    }
  }
  const handleSaveLeave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!leaveStartDate || !leaveEndDate) {
      toast("Lütfen tarihleri doldurun.")
      return
    }
    setSavingLeave(true)
    try {
      // Merkezi izin ucu: izin kaydı + personel durumu + özlük kaydı sunucuda
      // tek transaction içinde yazılır; çakışan izin aralıkları reddedilir.
      const res = await fetch('/api/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          sicil_nos: [sicil_no],
          izin_turu: leaveType,
          baslangic_tarihi: leaveStartDate,
          bitis_tarihi: leaveEndDate,
          aciklama: leaveDescription,
          kaynak: 'Personel Özlük Sayfası'
        })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'İşlem başarısız oldu.')
      const fail = (json.results || []).find((r: any) => !r.ok)
      if (fail) throw new Error(fail.error)

      // Refresh Leaves list
      const { data: lData } = await api.from('personnel_leaves').select('*').eq('sicil_no', sicil_no).order('created_at', { ascending: false })
      if (lData) setLeaves(lData)

      // Audit Log insertion
      fetch('/api/audit-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action_type: 'leave_request_manual',
          actor_sicil_no: user?.sicilNo || 'unknown',
          actor_name: user ? `${user.ad} ${user.soyad}` : 'Bilinmeyen',
          target: sicil_no,
          details: { izin_turu: leaveType, baslangic: leaveStartDate, bitis: leaveEndDate },
        }),
      }).catch(err => console.error('[AuditLog] Izin ekleme logu gonderilemedi:', err))

      setIsLeaveModalOpen(false)
      setLeaveType("İzinli")
      setLeaveStartDate(new Date().toLocaleDateString('en-CA'))
      setLeaveEndDate(new Date().toLocaleDateString('en-CA'))
      setLeaveDescription("")
    } catch (err: any) {
      console.error("İzin ekleme hatası:", err)
      toast(`İzin eklenemedi: ${err.message || err}`)
    } finally {
      setSavingLeave(false)
    }
  }

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      setStatsLoading(true)
      
      try {
        // Fetch Main Personnel Info
        const { data: pData, error: pErr } = await api
          .from('personnel')
          .select('*')
          .eq('sicil_no', sicil_no)
          .single()
          
        if (pData) setPersonel(pData)

        // Fetch Details
        const { data: dData } = await api.from('personnel_details').select('*').eq('sicil_no', sicil_no).single()
        if (dData) setDetails(dData)

        // Fetch Leaves
        const { data: lData } = await api.from('personnel_leaves').select('*').eq('sicil_no', sicil_no).order('created_at', { ascending: false })
        if (lData) setLeaves(lData)

        // Fetch Equipments
        const { data: eData } = await api.from('personnel_equipment').select('*').eq('sicil_no', sicil_no).order('created_at', { ascending: false })
        if (eData) setEquipments(eData)

        // Fetch Activities
        const { data: aData } = await api.from('personnel_activities').select('*').eq('sicil_no', sicil_no).order('tarih', { ascending: false })
        if (aData) setActivities(aData)

        // Fetch Records
        const { data: rData } = await api.from('personnel_records').select('*').eq('sicil_no', sicil_no).order('tarih', { ascending: false })
        if (rData) setRecords(rData)

        // Fetch Personnel Operations Stats
        const sRes = await fetch(`/api/personnel/stats?personnel_id=${sicil_no}`)
        if (sRes.ok) {
          const sData = await sRes.json()
          if (sData.success) {
            setStats(sData.stats)
            setTotalMissions(sData.total || 0)
          }
        }

        // Fetch Certificate info
        const cRes = await fetch(`/api/personnel/certificate?id=${sicil_no}`)
        if (cRes.ok) {
          const cData = await cRes.json()
          if (cData.success) {
            setCertInfo(cData)
          }
        }

      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
        setStatsLoading(false)
      }
    }
    
    if (sicil_no) {
      fetchData()
    }
  }, [sicil_no])

  if (loading) {
    return <div className="p-8 text-center animate-pulse text-muted-foreground">Profil yükleniyor...</div>
  }

  if (!personel) {
    return <div className="p-8 text-center text-danger">Personel bulunamadı!</div>
  }

  const handlePrintIDCard = async () => {
    if (!personel) return

    // Get QR from canvas
    const canvas = document.getElementById("personnel-qr-canvas") as HTMLCanvasElement
    const qrDataUrl = canvas ? canvas.toDataURL("image/png") : ""

    // CR80 Standart Kredi Kartı Ebatları: 54mm x 86mm dikey format
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [54, 86] })

    try {
      const fontBase64 = await fetchGeistFontBase64()
      doc.addFileToVFS('Geist-Regular.ttf', fontBase64)
      doc.addFont('Geist-Regular.ttf', 'Geist', 'normal')
      doc.setFont('Geist', 'normal')
    } catch (err) {
      console.error("Geist font load error, using Helvetica", err)
      doc.setFont("Helvetica", "normal")
    }

    // --- SAYFA 1: KART ÖN YÜZÜ ---
    // Siber-mat koyu arka plan
    doc.setFillColor(15, 23, 42)
    doc.rect(0, 0, 54, 86, "F")

    // İnce altın sarısı/turuncu çerçeve
    doc.setDrawColor(245, 158, 11)
    doc.setLineWidth(0.8)
    doc.rect(1.5, 1.5, 51, 83)

    // Kurumsal Başlık
    doc.setFontSize(6.5)
    doc.setTextColor(255, 255, 255)
    doc.text("T.C.", 27, 6, { align: "center" })
    doc.text("SİVAS BELEDİYESİ", 27, 9, { align: "center" })
    
    doc.setTextColor(245, 158, 11)
    doc.setFontSize(5.5)
    doc.text("İTFAİYE MÜDÜRLÜĞÜ", 27, 12, { align: "center" })

    // Seperatör çizgi
    doc.setDrawColor(245, 158, 11)
    doc.setLineWidth(0.3)
    doc.line(10, 14, 44, 14)

    // Fotoğraf / İnitial Yuvarlağı
    doc.setFillColor(30, 41, 59)
    doc.setDrawColor(245, 158, 11)
    doc.setLineWidth(0.5)
    doc.circle(27, 26, 9, "FD")

    // Ad Soyad Baş Harfleri
    doc.setFontSize(9)
    doc.setTextColor(255, 255, 255)
    doc.text(`${personel.ad.charAt(0)}${personel.soyad.charAt(0)}`, 27, 29, { align: "center" })

    // Personel Kimlik Bilgileri
    doc.setFontSize(8.5)
    doc.text(`${personel.ad.toUpperCase()} ${personel.soyad.toUpperCase()}`, 27, 40, { align: "center" })
    
    doc.setFontSize(7)
    doc.setTextColor(245, 158, 11)
    doc.text(personel.unvan || "İtfaiye Eri", 27, 44, { align: "center" })

    doc.setFontSize(5.5)
    doc.setTextColor(203, 213, 225)
    doc.text(`Sicil: ${personel.sicil_no}`, 27, 47.5, { align: "center" })
    doc.text(`Yerleşke: ${personel.istasyon || "Merkez"}`, 27, 50.5, { align: "center" })
    doc.text("Kan Grubu: A Rh (+)", 27, 53.5, { align: "center" })

    // Kriptografik QR Kod Entegrasyonu
    if (qrDataUrl) {
      doc.addImage(qrDataUrl, "PNG", 17, 57, 20, 20)
    }

    // Alt Bilgi
    doc.setFontSize(4.5)
    doc.setTextColor(100, 116, 139)
    doc.text("DİJİTAL PDKS KİMLİK KARTI", 27, 81, { align: "center" })

    // --- SAYFA 2: KART ARKA YÜZÜ ---
    doc.addPage()
    
    // Siber-mat koyu arka plan
    doc.setFillColor(15, 23, 42)
    doc.rect(0, 0, 54, 86, "F")

    // İnce altın sarısı/turuncu çerçeve
    doc.setDrawColor(245, 158, 11)
    doc.setLineWidth(0.8)
    doc.rect(1.5, 1.5, 51, 83)

    // Acil Durum Bilgileri
    doc.setFontSize(7.5)
    doc.setTextColor(239, 68, 68)
    doc.text("ACİL DURUM HATLARI", 27, 18, { align: "center" })
    
    doc.setFontSize(6.5)
    doc.setTextColor(255, 255, 255)
    doc.text("YANGIN İHBAR: 112", 27, 23, { align: "center" })
    doc.text("SANTRAL: 0346 221 21 11", 27, 27, { align: "center" })

    // Seperatör
    doc.setDrawColor(245, 158, 11)
    doc.setLineWidth(0.3)
    doc.line(10, 32, 44, 32)

    // Yasal ve Entegrasyon İbareleri
    doc.setFontSize(5)
    doc.setTextColor(148, 163, 184)
    const backText = "Bu kart Sivas İtfaiye Müdürlüğü Dijital PDKS (Personel Devam Kontrol Sistemi) altyapısına entegredir. Kart sahibi görevli personeldir."
    const splitBack = doc.splitTextToSize(backText, 40)
    doc.text(splitBack, 27, 38, { align: "center" })

    doc.setFontSize(4.5)
    doc.text("Kayıp durumunda itfaiye müdürlüğüne", 27, 54, { align: "center" })
    doc.text("teslim edilmesi rica olunur.", 27, 57, { align: "center" })

    // İlgili Yönetim / Müdür İmzası
    doc.setFontSize(6)
    doc.setTextColor(255, 255, 255)
    doc.text("İtfaiye Müdürü", 27, 70, { align: "center" })
    
    doc.setFontSize(4.5)
    doc.text("İmza / Mühür", 27, 73, { align: "center" })

    // Save PDF
    const filename = `Sivas_Itfaiye_Kimlik_Karti_${personel.sicil_no}.pdf`
    doc.save(filename)
  }


  const handlePrintCertificate = async () => {
    if (!certInfo || !personel) return

    // Create a landscape PDF
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const pageW = 297
    const pageH = 210

    try {
      const fontBase64 = await fetchGeistFontBase64()
      doc.addFileToVFS('Geist-Regular.ttf', fontBase64)
      doc.addFont('Geist-Regular.ttf', 'Geist', 'normal')
      doc.setFont('Geist', 'normal')
    } catch (err) {
      console.error("Geist font load error, using Helvetica", err)
      doc.setFont("Helvetica", "normal")
    }

    try {
      const logoBelediye = await loadHtmlImage('/logo-belediye.png')
      const logoItfaiye = await loadHtmlImage('/logo-itfaiye.png')
      doc.addImage(logoBelediye, 'PNG', 22, 20, 24, 24)
      doc.addImage(logoItfaiye, 'PNG', 251, 20, 24, 24)
    } catch (err) {
      console.error("Logolar yüklenirken hata oluştu:", err)
    }

    // 1. Certificate Borders (Premium double frame)
    // Outer border (Gold/Bronze color)
    doc.setDrawColor(218, 165, 32) // Goldenrod
    doc.setLineWidth(1.5)
    doc.rect(10, 10, pageW - 20, pageH - 20)

    // Inner border
    doc.setDrawColor(30, 41, 59) // Slate-900
    doc.setLineWidth(0.5)
    doc.rect(12, 12, pageW - 24, pageH - 24)

    // Corner decorative mini-rectangles
    doc.setDrawColor(218, 165, 32)
    doc.setFillColor(218, 165, 32)
    doc.rect(11, 11, 4, 4, "FD")
    doc.rect(pageW - 15, 11, 4, 4, "FD")
    doc.rect(11, pageH - 15, 4, 4, "FD")
    doc.rect(pageW - 15, pageH - 15, 4, 4, "FD")

    // 2. Sivas Fire Department Branding
    doc.setFontSize(16)
    doc.setTextColor(30, 41, 59)
    doc.text("T.C.", pageW / 2, 28, { align: "center" })
    doc.text("SİVAS BELEDİYE BAŞKANLIĞI", pageW / 2, 35, { align: "center" })
    
    doc.setFontSize(13)
    doc.text("İTFAİYE MÜDÜRLÜĞÜ EĞİTİM VE TAHKİKAT AMİRLİĞİ", pageW / 2, 42, { align: "center" })

    // Decorative horizontal division lines
    doc.setDrawColor(218, 165, 32)
    doc.setLineWidth(0.6)
    doc.line(pageW / 2 - 40, 46, pageW / 2 + 40, 46)

    // 3. Main Title
    doc.setFontSize(26)
    doc.setTextColor(190, 24, 24) // Crimson Red
    doc.text("ÜSTÜN HİZMET VE EĞİTİCİ SERTİFİKASI", pageW / 2, 62, { align: "center" })

    // 4. Certificate Body Text
    doc.setFontSize(14)
    doc.setTextColor(51, 65, 85) // Slate-700
    doc.text("Sivas Belediyesi İtfaiye Müdürlüğü bünyesinde görev yapan;", pageW / 2, 78, { align: "center" })

    // Personnel Name & Unvan
    doc.setFontSize(20)
    doc.setTextColor(15, 23, 42) // Slate-900
    doc.text(`${personel.ad.toUpperCase()} ${personel.soyad.toUpperCase()}`, pageW / 2, 92, { align: "center" })
    
    doc.setFontSize(13)
    doc.setTextColor(100, 116, 139) // Slate-500
    doc.text(`Sicil No: ${personel.sicil_no}   |   Unvan: ${personel.unvan || "İtfaiye Eri"}`, pageW / 2, 100, { align: "center" })

    // Text about education hours
    doc.setFontSize(13)
    doc.setTextColor(51, 65, 85)
    
    const bodyText = 
      `Teftiş ve eğitim kuralları çerçevesinde, Sivas ili sınırları içerisindeki dış kurumlara ` +
      `yönelik icra edilen tamamlanmış resmi faaliyetlerde toplam ${certInfo.total_hours} saat eğitim verdiği ` +
      `tespit edilmiş ve Müdürlüğümüzce belirlenen 40 saatlik kurumsal barajı başarıyla aşarak bu sertifikayı ` +
      `almaya hak kazanmıştır.`;
    
    const splitText = doc.splitTextToSize(bodyText, pageW - 80)
    doc.text(splitText, pageW / 2, 116, { align: "center" })

    // Text on dedication
    doc.setFontSize(11)
    doc.text("Gösterdiği üstün eğitimci performansı, disiplin ve kurumsal katkılarından dolayı teşekkür ederiz.", pageW / 2, 140, { align: "center" })

    // 5. Signatures
    doc.setFontSize(11)
    doc.setTextColor(15, 23, 42)
    doc.text("Eğitim Şube Amiri", 50, 162, { align: "center" })
    doc.text("İtfaiye Müdürü", pageW - 50, 162, { align: "center" })

    doc.setFontSize(9)
    doc.setTextColor(71, 85, 105)
    doc.text("İmza / Mühür", 50, 167, { align: "center" })
    doc.text("İmza / Mühür", pageW - 50, 167, { align: "center" })

    // Date at bottom center
    const currentDate = new Date().toLocaleDateString("tr-TR")
    doc.setFontSize(10)
    doc.text(`Düzenleme Tarihi: ${currentDate}`, pageW / 2, 192, { align: "center" })

    // Save PDF
    const filename = `Sivas_Itfaiye_Egitici_Sertifikasi_${personel.sicil_no}.pdf`
    doc.save(filename)
  }


  const tabs = [
    { id: 'ozet', label: 'Özet', icon: User },
    { id: 'iletisim', label: 'İletişim', icon: Phone },
    { id: 'izinler', label: 'İzinler', icon: Calendar },
    { id: 'zimmet', label: 'Zimmet (Ekipman)', icon: Shield },
    { id: 'hizmet', label: 'Hizmet Dökümü', icon: Briefcase },
    { id: 'faaliyet', label: 'Faaliyetler', icon: ActivitySquare },
    { id: 'sertifikalar', label: 'Sertifikalar / Belgeler', icon: FileText },
  ]

  return (
    <div className="space-y-6 w-full max-w-full px-1.5 md:px-3 pb-12 animate-in fade-in zoom-in-95 duration-300">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-[var(--fd-border)] pb-4">
        <div className="flex items-center space-x-3">
          <button 
            onClick={() => router.push('/yonetim/personel')} 
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[var(--fd-accent-soft)] hover:text-[var(--fd-accent)] transition-colors shrink-0 text-[var(--fd-text3)] cursor-pointer"
            title="Personel Listesine Dön"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          
          <div className="relative shrink-0 group">
            {canEdit && (
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoSelect}
              />
            )}
            <div
              onClick={() => {
                if (uploadingPhoto) return
                if (personel.foto_url) setPhotoPreviewOpen(true)
                else if (canEdit) photoInputRef.current?.click()
              }}
              title={personel.foto_url ? "Büyütmek için tıklayın" : canEdit ? "Fotoğraf yükle" : undefined}
              className={`w-12 h-12 rounded-[var(--fd-r-sm)] bg-[var(--fd-accent-soft)] border border-[var(--fd-accent-soft2)] flex items-center justify-center text-[var(--fd-accent)] text-lg font-bold shadow-sm overflow-hidden ${personel.foto_url || canEdit ? "cursor-pointer" : ""}`}
            >
              {uploadingPhoto ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : personel.foto_url ? (
                <img src={personel.foto_url} alt={`${personel.ad} ${personel.soyad}`} className="w-full h-full object-cover" />
              ) : (
                <>{personel.ad.charAt(0)}{personel.soyad.charAt(0)}</>
              )}
            </div>
            {canEdit && !uploadingPhoto && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); photoInputRef.current?.click() }}
                title="Fotoğraf yükle / değiştir"
                className="absolute -bottom-1 -right-1 bg-[var(--fd-accent)] text-white rounded-full p-0.5 shadow border-none cursor-pointer group-hover:scale-110 transition-transform"
              >
                <Camera className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Fotoğraf büyük önizleme */}
          {photoPreviewOpen && personel.foto_url && (
            <div
              className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
              onClick={() => setPhotoPreviewOpen(false)}
            >
              <div className="relative max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
                <img
                  src={personel.foto_url}
                  alt={`${personel.ad} ${personel.soyad}`}
                  className="w-full max-h-[80vh] object-contain rounded-[var(--fd-r)] shadow-2xl bg-[var(--fd-surface)]"
                />
                <div className="absolute top-2 right-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPhotoPreviewOpen(false)}
                    className="bg-black/60 hover:bg-black/80 text-white rounded-full p-2 border-none cursor-pointer transition-colors"
                    title="Kapat"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="text-white text-sm font-semibold drop-shadow">
                    {personel.ad} {personel.soyad} <span className="opacity-70 font-mono text-xs">• {personel.sicil_no}</span>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => { setPhotoPreviewOpen(false); photoInputRef.current?.click() }}
                      className="flex items-center gap-1.5 bg-[var(--fd-accent)] hover:opacity-90 text-white text-xs font-bold px-3 py-1.5 rounded-[var(--fd-r-sm)] border-none cursor-pointer transition-opacity"
                    >
                      <Camera className="w-3.5 h-3.5" /> Fotoğrafı Değiştir
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
          
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-[var(--fd-text)]">{personel.ad} {personel.soyad}</h1>
              <Badge variant="outline" className="font-mono bg-[var(--fd-surface2)] text-[var(--fd-text)] border border-[var(--fd-border)]">{personel.sicil_no}</Badge>
              <Badge variant="outline" className="bg-[var(--fd-surface2)] text-[var(--fd-text2)] border border-[var(--fd-border)]">{personel.unvan}</Badge>
            </div>
            <div className="flex items-center gap-2.5 mt-1 text-[11px] text-[var(--fd-text3)] flex-wrap">
              <span className="flex items-center gap-1">
                <div className={`w-1.5 h-1.5 rounded-full ${personel.aktif ? 'bg-success' : 'bg-danger'}`} />
                {personel.aktif ? 'Aktif' : 'Pasif'}
              </span>
              <span className="opacity-40">|</span>
              <span className="flex items-center gap-1.5">
                <span>Günlük Durum:</span>
                {(() => {
                  const durumLower = (personel.durum || '').toLowerCase();
                  let variant: 'success' | 'danger' | 'warning' | 'outline' = 'success';
                  if (durumLower.includes('izinli') || durumLower.includes('raporlu')) {
                    variant = 'danger';
                  } else if (durumLower.includes('geçici') || durumLower.includes('gecici') || durumLower.includes('dış') || durumLower.includes('dis')) {
                    variant = 'warning';
                  }
                  return (
                    <Badge variant={variant} className="text-[10px] font-semibold px-1.5 py-0.5">
                      {personel.durum || 'Hazır'}
                    </Badge>
                  );
                })()}
              </span>
            </div>
          </div>
        </div>

        {/* Print/Certificate Area */}
        <div className="flex flex-row items-center gap-3 shrink-0 bg-[var(--fd-surface)] border border-[var(--fd-border)] p-2 rounded-[var(--fd-r)] shadow-[var(--fd-shadow-sm)]">
          {certInfo && (
            <div className="text-[11px] font-semibold text-[var(--fd-text2)] px-1">
              Eğitim: <span className={`font-black ${certInfo.eligible ? "text-emerald-400" : "text-amber-400"}`}>{certInfo.total_hours} sa</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            {/* Hidden Canvas for QR Generation */}
            <div style={{ display: 'none' }}>
              <QRCodeCanvas
                id="personnel-qr-canvas"
                value={`SIVAS-PDKS-ID: ${personel.sicil_no} | ${personel.ad} ${personel.soyad}`}
                size={150}
                level="H"
              />
            </div>
            <Button
              onClick={handlePrintIDCard}
              className="text-xs font-bold px-2.5 py-1.5 h-8 rounded-[var(--fd-r-sm)] flex items-center gap-1 bg-[var(--fd-accent)] hover:opacity-90 text-[#ffffff] shadow-[var(--fd-shadow-sm)] cursor-pointer"
            >
              🪪 Kimlik Kartı
            </Button>
            {certInfo && (
              <Button
                disabled={!certInfo.eligible}
                onClick={handlePrintCertificate}
                className={`text-xs font-bold px-2.5 py-1.5 h-8 rounded-[var(--fd-r-sm)] flex items-center gap-1 transition-all shadow-[var(--fd-shadow-sm)] cursor-pointer ${
                  certInfo.eligible ? "bg-[var(--fd-amber)] hover:opacity-90 text-[#ffffff]" : "bg-[var(--fd-surface3)] text-[var(--fd-text3)] border border-[var(--fd-border)] cursor-not-allowed"
                }`}
              >
                🎓 Sertifika Bas
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Custom Tabs Navigation */}
      <div className="flex overflow-x-auto hide-scrollbar gap-1 border-b border-[var(--fd-border)] pb-2 pt-1">
        <div className="flex bg-[var(--fd-surface2)] p-1 rounded-[var(--fd-r)] border border-[var(--fd-border)] gap-1">
          {tabs.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-[var(--fd-r-sm)] transition-all whitespace-nowrap cursor-pointer focus:outline-none",
                  isActive
                    ? "bg-[var(--fd-accent)] text-[#ffffff] shadow-[var(--fd-shadow-sm)]"
                    : "text-[var(--fd-text3)] hover:text-[var(--fd-text2)] hover:bg-[var(--fd-surface3)]/50"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab Content Area */}
      <div className="w-full max-w-full space-y-4">
        
        {/* ÖZET SEKMESİ */}
        {activeTab === 'ozet' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-xs font-bold text-[var(--fd-text)] uppercase">Genel Bilgiler</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] text-[var(--fd-text3)]">Sicil No</p>
                      <p className="font-semibold text-xs text-[var(--fd-text)]">{personel.sicil_no}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--fd-text3)]">Rol</p>
                      <p className="font-semibold text-xs text-[var(--fd-text)]">{personel.rol}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--fd-text3)]">E-posta</p>
                      <p className="font-semibold text-xs text-[var(--fd-text)]">{personel.posta || '-'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--fd-text3)]">Kan Grubu</p>
                      <p className="font-semibold text-xs text-[var(--fd-danger)]">{details?.kan_grubu || 'Belirtilmemiş'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--fd-text3)]">İşe Başlama Tarihi</p>
                      <p className="font-semibold text-xs text-[var(--fd-text)]">{details?.ise_baslama_tarihi ? new Date(details.ise_baslama_tarihi).toLocaleDateString('tr-TR') : '-'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--fd-text3)]">Doğum Tarihi</p>
                      <p className="font-semibold text-xs text-[var(--fd-text)]">{details?.dogum_tarihi ? new Date(details.dogum_tarihi).toLocaleDateString('tr-TR') : '-'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--fd-text3)]">Günlük Nöbet Durumu</p>
                      <p className="font-semibold text-xs text-[var(--fd-accent)]">{personel.durum || 'Hazır'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-xs font-bold text-[var(--fd-text)] uppercase">Sistem Yetkileri</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-2.5 border border-[var(--fd-border)] rounded-[var(--fd-r-sm)] bg-[var(--fd-surface2)]">
                    <div className="flex items-center gap-3">
                      <Activity className="w-5 h-5 text-muted-foreground" />
                      <span>Sadece Görüntüler</span>
                    </div>
                    <Badge variant={personel.view_only ? "success" : "outline"}>{personel.view_only ? 'Evet' : 'Hayır'}</Badge>
                  </div>
                  <div className="flex items-center justify-between p-2.5 border border-[var(--fd-border)] rounded-[var(--fd-r-sm)] bg-[var(--fd-surface2)]">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-muted-foreground" />
                      <span>Envanter Onaylayabilir</span>
                    </div>
                    <Badge variant={personel.can_approve ? "success" : "outline"}>{personel.can_approve ? 'Evet' : 'Hayır'}</Badge>
                  </div>
                  <div className="flex items-center justify-between p-2.5 border border-[var(--fd-border)] rounded-[var(--fd-r-sm)] bg-[var(--fd-surface2)]">
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-muted-foreground" />
                      <span>Barkod Basabilir</span>
                    </div>
                    <Badge variant={personel.can_print ? "success" : "outline"}>{personel.can_print ? 'Evet' : 'Hayır'}</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-[var(--fd-surface)] border border-[var(--fd-border)] shadow-[var(--fd-shadow-sm)] rounded-[var(--fd-r)]">
                <CardHeader>
                  <CardTitle className="text-xs font-bold text-[var(--fd-text)] uppercase flex items-center gap-1.5">
                    📊 İzin & Görev Durumu Özeti
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3.5">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 border border-[var(--fd-border)] rounded-[var(--fd-r-sm)] bg-[var(--fd-surface2)]/40 flex flex-col justify-between">
                      <div className="flex items-center gap-1.5 text-[10px] text-[var(--fd-text3)] font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-success" />
                        İzinli Gün
                      </div>
                      <p className="text-base font-black text-[var(--fd-text)] mt-1.5">
                        {leaveStats.izin} <span className="text-[10px] font-normal text-[var(--fd-text3)]">gün</span>
                      </p>
                    </div>

                    <div className="p-3 border border-[var(--fd-border)] rounded-[var(--fd-r-sm)] bg-[var(--fd-surface2)]/40 flex flex-col justify-between">
                      <div className="flex items-center gap-1.5 text-[10px] text-[var(--fd-text3)] font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-danger" />
                        Raporlu Gün
                      </div>
                      <p className="text-base font-black text-[var(--fd-text)] mt-1.5">
                        {leaveStats.rapor} <span className="text-[10px] font-normal text-[var(--fd-text3)]">gün</span>
                      </p>
                    </div>

                    <div className="p-3 border border-[var(--fd-border)] rounded-[var(--fd-r-sm)] bg-[var(--fd-surface2)]/40 flex flex-col justify-between">
                      <div className="flex items-center gap-1.5 text-[10px] text-[var(--fd-text3)] font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-info" />
                        Geçici Görev
                      </div>
                      <p className="text-base font-black text-[var(--fd-text)] mt-1.5">
                        {leaveStats.gecici} <span className="text-[10px] font-normal text-[var(--fd-text3)]">gün</span>
                      </p>
                    </div>

                    <div className="p-3 border border-[var(--fd-border)] rounded-[var(--fd-r-sm)] bg-[var(--fd-surface2)]/40 flex flex-col justify-between">
                      <div className="flex items-center gap-1.5 text-[10px] text-[var(--fd-text3)] font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        Dış Görev
                      </div>
                      <p className="text-base font-black text-[var(--fd-text)] mt-1.5">
                        {leaveStats.dis} <span className="text-[10px] font-normal text-[var(--fd-text3)]">gün</span>
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-[var(--fd-surface)] border border-[var(--fd-border)] shadow-[var(--fd-shadow-sm)] rounded-[var(--fd-r)] overflow-hidden">
              <CardHeader className="border-b border-slate-800/60 pb-3">
                <CardTitle className="text-xs font-bold flex items-center gap-1.5 text-[var(--fd-text)] uppercase">
                  <ActivitySquare className="w-4 h-4 text-[var(--fd-accent)]" />
                  Operasyonel Görev Dağılım Radarı
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 flex flex-col items-center justify-center min-h-[320px]">
                {statsLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground animate-pulse">
                    <Clock className="w-5 h-5 animate-spin" /> İstatistikler yükleniyor...
                  </div>
                ) : totalMissions === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center p-4 bg-[var(--fd-surface2)] border border-dashed border-[var(--fd-border)] rounded-[var(--fd-r)] space-y-2">
                    <AlertTriangle className="w-10 h-10 text-amber-500/80 animate-pulse" />
                    <h3 className="font-bold text-xs text-[var(--fd-text)]">Kayıtlı Vaka Görevi Bulunmuyor</h3>
                    <p className="text-[11px] text-[var(--fd-text3)] max-w-sm">
                      Bu personelin son dönemde katıldığı herhangi bir aktif itfaiye/kurtarma operasyonu veya dış lojistik görevi kayda geçmemiştir.
                    </p>
                  </div>
                ) : (
                  <div className="w-full h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="70%" data={stats || []}>
                        <PolarGrid stroke="var(--fd-border)" />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--fd-text2)', fontSize: 10, fontWeight: 'bold' }} />
                        <PolarRadiusAxis angle={30} domain={[0, 'auto']} tick={{ fill: 'var(--fd-text3)', fontSize: 9 }} />
                        <Radar
                          name="Görev Sayısı"
                          dataKey="value"
                          stroke="#06b6d4"
                          fill="#06b6d4"
                          fillOpacity={0.2}
                        />
                      </RadarChart>
                    </ResponsiveContainer>
                    <div className="text-center text-[11px] text-[var(--fd-text3)] mt-2">
                      Toplam Görev Sayısı: <span className="text-[var(--fd-accent)] font-bold">{totalMissions}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* İLETİŞİM SEKMESİ */}
        {activeTab === 'iletisim' && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 border-b border-[var(--fd-border)] bg-[var(--fd-surface2)] p-3">
              <CardTitle className="text-xs font-bold text-[var(--fd-text)] uppercase">İletişim & Acil Durum Bilgileri</CardTitle>
              {canEdit && (
                <Button 
                  onClick={handleStartEdit} 
                  variant="outline" 
                  size="sm"
                  className="border-[var(--fd-accent-soft2)] bg-[var(--fd-accent-soft)] hover:bg-[var(--fd-accent)] text-[var(--fd-accent)] hover:text-[#ffffff] text-xs font-semibold px-2.5 py-1 rounded-[var(--fd-r-sm)] transition"
                >
                  <Pencil className="w-4 h-4 mr-2" /> Bilgileri Düzenle
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="font-bold text-xs text-[var(--fd-text2)] border-b border-[var(--fd-border)] pb-1.5 uppercase">Kişisel İletişim</h3>
                  <div>
                    <p className="text-[10px] text-[var(--fd-text3)]">Telefon</p>
                    <p className="font-semibold text-xs text-[var(--fd-text)] text-lg">{details?.telefon || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[var(--fd-text3)]">Açık Adres</p>
                    <p className="font-semibold text-xs text-[var(--fd-text)]">{details?.adres || '-'}</p>
                  </div>
                </div>
                <div className="space-y-3 bg-[var(--fd-danger-soft)] border border-[var(--fd-danger-soft2)] p-3 rounded-[var(--fd-r)]">
                  <h3 className="font-bold text-xs text-[var(--fd-danger)] border-b border-[var(--fd-danger-soft2)] pb-1.5 flex items-center gap-1.5 uppercase">
                    <AlertTriangle className="w-4 h-4" /> Acil Durumda Ulaşılacak Kişi
                  </h3>
                  <div>
                    <p className="text-[10px] text-[var(--fd-text3)]">Kişi Adı Soyadı</p>
                    <p className="font-semibold text-xs text-[var(--fd-text)]">{details?.acil_durum_kisi_ad || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[var(--fd-text3)]">Telefon Numarası</p>
                    <p className="font-semibold text-xs text-[var(--fd-text)]">{details?.acil_durum_kisi_telefon || '-'}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* İZİNLER SEKMESİ */}
        {activeTab === 'izinler' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xs font-bold text-[var(--fd-text)] uppercase">İzin ve Görev Kayıtları</h2>
                <p className="text-[10px] text-[var(--fd-text3)] mt-0.5">Personelin bugüne kadar kullandığı tüm izin ve görevlerin dökümü.</p>
              </div>
              <Button onClick={() => setIsLeaveModalOpen(true)}>Yeni İzin Talebi</Button>
            </div>

            {/* İstatistik Özeti */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[var(--fd-surface2)]/50 p-4 border border-[var(--fd-border)] rounded-[var(--fd-r)] shadow-[var(--fd-shadow-sm)]">
              <div className="text-center sm:text-left border-r border-[var(--fd-border)]/50 last:border-0 pr-2">
                <span className="text-[10px] font-semibold text-[var(--fd-text3)] block uppercase tracking-wider">İzinli Toplam</span>
                <span className="text-base font-black text-[var(--fd-text)] mt-1 block">{leaveStats.izin} gün</span>
              </div>
              <div className="text-center sm:text-left border-r border-[var(--fd-border)]/50 last:border-0 pr-2">
                <span className="text-[10px] font-semibold text-[var(--fd-text3)] block uppercase tracking-wider">Raporlu Toplam</span>
                <span className="text-base font-black text-[var(--fd-text)] mt-1 block">{leaveStats.rapor} gün</span>
              </div>
              <div className="text-center sm:text-left border-r border-[var(--fd-border)]/50 last:border-0 pr-2">
                <span className="text-[10px] font-semibold text-[var(--fd-text3)] block uppercase tracking-wider">Geçici Görev</span>
                <span className="text-base font-black text-[var(--fd-text)] mt-1 block">{leaveStats.gecici} gün</span>
              </div>
              <div className="text-center sm:text-left last:border-0">
                <span className="text-[10px] font-semibold text-[var(--fd-text3)] block uppercase tracking-wider">Dış Görev</span>
                <span className="text-base font-black text-[var(--fd-text)] mt-1 block">{leaveStats.dis} gün</span>
              </div>
            </div>
            
            {leaves.length === 0 ? (
              <div className="text-center p-8 border border-dashed rounded-xl text-muted-foreground">
                Kayıtlı izin veya özel görev kaydı bulunmamaktadır.
              </div>
            ) : (
              <div className="space-y-4">
                {leaves.map(leave => {
                  const start = new Date(leave.baslangic_tarihi)
                  const end = new Date(leave.bitis_tarihi)
                  const diffTime = Math.abs(end.getTime() - start.getTime())
                  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
                  
                  return (
                    <div key={leave.id} className="p-3 px-4 border border-[var(--fd-border)] rounded-[var(--fd-r-sm)] bg-[var(--fd-surface2)]/60 flex flex-row items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={leave.durum === 'Onaylandı' ? 'success' : leave.durum === 'Reddedildi' ? 'danger' : 'warning'}>
                            {leave.durum}
                          </Badge>
                          <span className="font-bold text-xs text-[var(--fd-text)]">{leave.izin_turu}</span>
                          <span className="text-[11px] font-bold text-[var(--fd-text2)] bg-[var(--fd-surface3)] px-1.5 py-0.5 rounded-[var(--fd-r-sm)] border border-[var(--fd-border)]">
                            {diffDays} Gün
                          </span>
                        </div>
                        <div className="text-[10px] text-[var(--fd-text3)] mt-2">
                          {start.toLocaleDateString('tr-TR')} - {end.toLocaleDateString('tr-TR')}
                        </div>
                        <p className="text-xs text-[var(--fd-text2)] mt-0.5">{leave.aciklama}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        {leave.belge_url && (
                          <a href={leave.belge_url} target="_blank" rel="noreferrer" className="text-sm text-blue-500 hover:underline flex items-center gap-1">
                            <FileText className="w-4 h-4" /> Belge
                          </a>
                        )}
                        {canEdit && (
                          <button
                            onClick={async () => {
                              if (confirm('Bu izni silmek istediğinize emin misiniz?')) {
                                try {
                                  // Merkezi uç: kaydı siler, personel durumunu yeniden
                                  // hesaplar ve özlüğe iptal kaydı düşer.
                                  const res = await fetch('/api/leaves', {
                                    method: 'DELETE',
                                    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                                    body: JSON.stringify({ id: leave.id, kaynak: 'Personel Özlük Sayfası' })
                                  });
                                  const json = await res.json();
                                  if (!res.ok) throw new Error(json.error || 'Silme işlemi başarısız oldu.');
                                  setLeaves(prev => prev.filter(l => l.id !== leave.id));
                                } catch (e: any) {
                                  toast(`Silme işlemi başarısız oldu: ${e?.message || e}`);
                                }
                              }
                            }}
                            className="text-rose-500 hover:bg-rose-500/10 p-1.5 rounded-md transition-colors"
                            title="İzni Sil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ZİMMET SEKMESİ */}
        {activeTab === 'zimmet' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xs font-bold text-[var(--fd-text)] uppercase">Zimmetli Ekipmanlar</h2>
              <Button>Zimmet Ekle</Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {equipments.length === 0 ? (
                <div className="col-span-full text-center p-8 border border-dashed rounded-xl text-muted-foreground">
                  Zimmetli ekipman bulunmamaktadır.
                </div>
              ) : (
                equipments.map(eq => (
                  <Card key={eq.id}>
                    <CardContent className="p-3">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="font-bold text-xs text-[var(--fd-text)]">{eq.ekipman_adi}</h3>
                          <p className="text-[10px] text-[var(--fd-text3)] font-mono">Seri No: {eq.seri_no || '-'}</p>
                        </div>
                        <Badge variant={eq.durum === 'Aktif' ? 'success' : 'outline'}>{eq.durum}</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm mt-4">
                        <div>
                          <p className="text-muted-foreground text-xs">Veriliş Tarihi</p>
                          <p>{new Date(eq.verilis_tarihi).toLocaleDateString('tr-TR')}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Miad Tarihi</p>
                          <p className={eq.miad_tarihi && new Date(eq.miad_tarihi) < new Date() ? 'text-danger font-semibold' : ''}>
                            {eq.miad_tarihi ? new Date(eq.miad_tarihi).toLocaleDateString('tr-TR') : '-'}
                          </p>
                        </div>
                        {eq.beden && (
                          <div className="col-span-2">
                            <p className="text-muted-foreground text-xs">Beden / Ölçü</p>
                            <p>{eq.beden}</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        )}

        {/* FAALİYET VE HİZMET */}
        {activeTab === 'hizmet' && (
          <Card>
            <CardHeader>
              <CardTitle>Hizmet Dökümü & Kayıtlar</CardTitle>
            </CardHeader>
            <CardContent>
              {records.length === 0 ? (
                <div className="text-center p-8 border border-dashed rounded-xl text-muted-foreground">
                  Kayıt bulunamadı.
                </div>
              ) : (
                <div className="space-y-4">
                  {records.map(rec => (
                    <div key={rec.id} className="flex gap-3 p-2 px-3 border-b border-[var(--fd-border)] last:border-0 items-center">
                      <div className="w-24 shrink-0 text-[10px] text-[var(--fd-text3)] pt-1">
                        {new Date(rec.tarih).toLocaleDateString('tr-TR')}
                      </div>
                      <div>
                        <Badge className="mb-1" variant="outline">{rec.kayit_turu}</Badge>
                        <p className="text-xs text-[var(--fd-text2)]">{rec.aciklama}</p>
                        {rec.belge_no && <p className="text-[10px] text-[var(--fd-text3)] mt-0.5">Belge No: {rec.belge_no}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === 'faaliyet' && (
          <Card>
            <CardHeader>
              <CardTitle>Eğitim & Operasyon Faaliyetleri</CardTitle>
            </CardHeader>
            <CardContent>
              {activities.length === 0 ? (
                <div className="text-center p-8 border border-dashed rounded-xl text-muted-foreground">
                  Faaliyet kaydı bulunamadı.
                </div>
              ) : (
                <div className="space-y-4">
                  {activities.map(act => (
                    <div key={act.id} className="flex items-center gap-3 p-2.5 border border-[var(--fd-border)] rounded-[var(--fd-r-sm)] bg-[var(--fd-surface2)]/60">
                      <div className="w-9 h-9 rounded-full bg-[var(--fd-accent-soft)] flex items-center justify-center text-[var(--fd-accent)] shrink-0">
                        <ActivitySquare className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-bold text-xs text-[var(--fd-text)]">{act.faaliyet_turu}</h4>
                        <p className="text-[10px] text-[var(--fd-text3)]">{act.aciklama}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-xs text-[var(--fd-text)]">{new Date(act.tarih).toLocaleDateString('tr-TR')}</p>
                        <p className="text-[10px] text-[var(--fd-text3)] mt-0.5">{act.sure_dakika} dk</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* İLETİŞİM DÜZENLEME MODALI */}
        {isEditing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
            <Card className="w-full max-w-md bg-[var(--fd-surface)] border border-[var(--fd-border-strong)] shadow-[var(--fd-shadow-lg)] p-5 rounded-[var(--fd-r-lg)] animate-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-base font-bold text-[var(--fd-text)] flex items-center gap-1.5 uppercase">
                  <Pencil className="w-5 h-5 text-cyan-400" /> İletişim Bilgilerini Düzenle
                </h3>
                <button 
                  onClick={() => setIsEditing(false)} 
                  className="p-1 text-[var(--fd-text3)] hover:text-[var(--fd-text2)] rounded-[var(--fd-r-sm)] bg-[var(--fd-surface2)] border border-[var(--fd-border)] transition-all cursor-pointer"
                  title="Kapat"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleSaveDetails} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[var(--fd-text3)]">Telefon Numarası</label>
                  <Input 
                    type="tel" 
                    value={editPhone} 
                    onChange={e => setEditPhone(e.target.value)} 
                    placeholder="Örn: 0555 123 4567" 
                    className="bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] focus:border-[var(--fd-accent)] h-9 text-xs" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[var(--fd-text3)]">Açık Adres</label>
                  <textarea 
                    value={editAddress} 
                    onChange={e => setEditAddress(e.target.value)} 
                    placeholder="Ev adresi..." 
                    rows={3}
                    className="w-full rounded-[var(--fd-r-sm)] border border-[var(--fd-border)] bg-[var(--fd-surface2)] px-3 py-2 text-xs text-[var(--fd-text)] placeholder-[var(--fd-text3)] focus:border-[var(--fd-accent)] focus:outline-none" 
                  />
                </div>
                
                <div className="border-t border-slate-800 my-4 pt-4 space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--fd-danger)] flex items-center gap-1.5 border-b border-[var(--fd-border)] pb-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> Acil Durumda Ulaşılacak Kişi
                  </h4>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[var(--fd-text3)]">Adı Soyadı</label>
                    <Input 
                      value={editEmergencyName} 
                      onChange={e => setEditEmergencyName(e.target.value)} 
                      placeholder="Örn: Yakını, Eşi vb." 
                      className="bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] focus:border-[var(--fd-accent)] h-9 text-xs" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[var(--fd-text3)]">İrtibat Telefonu</label>
                    <Input 
                      type="tel" 
                      value={editEmergencyPhone} 
                      onChange={e => setEditEmergencyPhone(e.target.value)} 
                      placeholder="Örn: 0555 987 6543" 
                      className="bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] focus:border-[var(--fd-accent)] h-9 text-xs" 
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setIsEditing(false)} className="h-9 text-xs border border-[var(--fd-border)] hover:bg-[var(--fd-surface2)] text-[var(--fd-text2)] rounded-[var(--fd-r-sm)] px-4">İptal</Button>
                  <Button type="submit" disabled={savingDetails} className="bg-[var(--fd-accent)] hover:opacity-90 text-[#ffffff] font-bold text-xs h-9 rounded-[var(--fd-r-sm)] px-5">
                    {savingDetails ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />} Kaydet
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        )}

        {/* YENİ İZİN TALEBİ / EKLEME MODALI */}
        {isLeaveModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
            <Card className="w-full max-w-md bg-[var(--fd-surface)] border border-[var(--fd-border-strong)] shadow-[var(--fd-shadow-lg)] p-5 rounded-[var(--fd-r-lg)] animate-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-base font-bold text-[var(--fd-text)] flex items-center gap-1.5 uppercase">
                  <Calendar className="w-5 h-5 text-[var(--fd-accent)]" /> Yeni İzin veya Görev Kaydı Ekle
                </h3>
                <button 
                  onClick={() => setIsLeaveModalOpen(false)} 
                  className="p-1 text-[var(--fd-text3)] hover:text-[var(--fd-text2)] rounded-[var(--fd-r-sm)] bg-[var(--fd-surface2)] border border-[var(--fd-border)] transition-all cursor-pointer"
                  title="Kapat"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleSaveLeave} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[var(--fd-text3)]">Kayıt Türü</label>
                  <select 
                    value={leaveType}
                    onChange={e => setLeaveType(e.target.value)}
                    className="w-full h-9 px-3 rounded-[var(--fd-r-sm)] border border-[var(--fd-border)] bg-[var(--fd-surface2)] text-xs text-[var(--fd-text)] focus:border-[var(--fd-accent)] focus:outline-none"
                  >
                    <option value="İzinli">İzinli</option>
                    <option value="Raporlu">Raporlu</option>
                    <option value="Geçici Şube Görevi">Geçici Şube Görevi</option>
                    <option value="Dış Görev">Dış Görev</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[var(--fd-text3)]">Başlangıç Tarihi</label>
                    <Input 
                      type="date" 
                      value={leaveStartDate} 
                      onChange={e => setLeaveStartDate(e.target.value)} 
                      className="bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] focus:border-[var(--fd-accent)] h-9 text-xs" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[var(--fd-text3)]">Bitiş Tarihi</label>
                    <Input 
                      type="date" 
                      value={leaveEndDate} 
                      onChange={e => setLeaveEndDate(e.target.value)} 
                      className="bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] focus:border-[var(--fd-accent)] h-9 text-xs" 
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[var(--fd-text3)]">Açıklama / Detay</label>
                  <textarea 
                    value={leaveDescription} 
                    onChange={e => setLeaveDescription(e.target.value)} 
                    placeholder="İzin gerekçesi, rapor detayı, şube ismi veya dış görev konumu..." 
                    rows={3}
                    className="w-full rounded-[var(--fd-r-sm)] border border-[var(--fd-border)] bg-[var(--fd-surface2)] px-3 py-2 text-xs text-[var(--fd-text)] placeholder-[var(--fd-text3)] focus:border-[var(--fd-accent)] focus:outline-none" 
                  />
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setIsLeaveModalOpen(false)} className="h-9 text-xs border border-[var(--fd-border)] hover:bg-[var(--fd-surface2)] text-[var(--fd-text2)] rounded-[var(--fd-r-sm)] px-4">İptal</Button>
                  <Button type="submit" disabled={savingLeave} className="bg-[var(--fd-accent)] hover:opacity-90 text-[#ffffff] font-bold text-xs h-9 rounded-[var(--fd-r-sm)] px-5">
                    {savingLeave ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />} Ekle
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        )}
      </div>

      {/* Sertifikalar Sekmesi */}
      {activeTab === "sertifikalar" && (
        <div className="space-y-6">
          <CertificatesTab sicilNo={sicil_no} />
        </div>
      )}
    </div>
  )
}
