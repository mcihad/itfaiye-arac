"use client"

import { useState, useRef, useEffect } from "react"
import { api, unwrap } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Badge } from "@/components/ui/Badge"
import { 
  CheckCircle2, Loader2, Search, Flame, Droplets, 
  Activity, ArrowRight, UserPlus, Phone, Home as HomeIcon,
  HeartPulse, Shield, Crosshair, UploadCloud, FileText, Printer, MapPin, AlertTriangle
} from "lucide-react"
import dynamic from "next/dynamic"
import { toast } from "@/lib/toast"

const Map = dynamic(() => import("@/components/map/Map"), { ssr: false })

const KURUMLAR = ["Polis 112", "Jandarma 112", "Acil Sağlık 112", "Elektrik 186", "Doğalgaz 187", "AFAD", "Orman 177"]
const BINA_TURLERI = ["Betonarme", "Ahşap", "Çelik", "Yığma", "Prefabrik", "Karma", "Belirtilmemiş / Diğer"]
const CIKIS_SEBEPLERI = ["Bilinmiyor", "Elektrik Kontağı", "Baca Kurumu", "Kasıt / Sabotaj", "Açık Ateş / Soba", "Doğalgaz / LPG Sızıntısı", "Sigara İzmariti", "Yıldırım Düşmesi", "Diğer"]

interface IncidentWizardProps {
  personnelList: any[]
  vehicleList: any[]
  mode: 'add' | 'edit' | 'readonly'
  initialData?: any | null
  onCancel: () => void
  onSuccess: () => void
}

export function IncidentWizard({
  personnelList, vehicleList, mode, initialData, onCancel, onSuccess
}: IncidentWizardProps) {
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [timeErrors, setTimeErrors] = useState<Record<string, string>>({})
  const printRef = useRef<HTMLDivElement>(null)

  const isClosed = mode === 'readonly'

  // Parse location
  let initLat = 39.750, initLng = 37.016
  if (initialData?.location && typeof initialData.location === 'string') {
    const match = initialData.location.match(/POINT\(([\d.]+) ([\d.]+)\)/)
    if (match) {
      initLng = parseFloat(match[1])
      initLat = parseFloat(match[2])
    }
  }

  // Pre-fill formData
  const [formData, setFormData] = useState({
    olay_turu: initialData?.olay_turu || "Ev Yangını",
    ihbar_saati: initialData?.ihbar_saati ? new Date(initialData.ihbar_saati).toISOString().slice(0, 16) : "",
    cikis_saati: initialData?.cikis_saati ? new Date(initialData.cikis_saati).toISOString().slice(0, 16) : "",
    varis_saati: initialData?.varis_saati ? new Date(initialData.varis_saati).toISOString().slice(0, 16) : "",
    donus_saati: initialData?.donus_saati ? new Date(initialData.donus_saati).toISOString().slice(0, 16) : "",
    ihbar_eden_ad_soyad: initialData?.ihbar_eden_ad_soyad || "",
    ihbar_eden_tel: initialData?.ihbar_eden_tel || "",
    bildirilen_kurumlar: initialData?.bildirilen_kurumlar 
      ? (typeof initialData.bildirilen_kurumlar === 'string' ? JSON.parse(initialData.bildirilen_kurumlar) : initialData.bildirilen_kurumlar) 
      : [],
    mahalle: initialData?.mahalle || "",
    adres: initialData?.adres || "",
    bina_yapi_malzemesi: initialData?.bina_yapi_malzemesi || "Belirtilmemiş / Diğer",
    yangin_baslangic_yeri: initialData?.yangin_baslangic_yeri || "",
    sigorta_durumu: initialData?.sigorta_durumu || "",
    kullanilan_su_ton: String(initialData?.kullanilan_su_ton || initialData?.ek16_su || ""),
    kullanilan_kopuk_litre: String(initialData?.kullanilan_kopuk_litre || initialData?.ek16_kopuk || ""),
    kullanilan_kkt_kg: String(initialData?.kullanilan_kkt_kg || ""),
    cikis_sebebi: initialData?.ek16_cikis_nedeni || initialData?.cikis_sebebi || "Bilinmiyor",
    hasar_durumu: initialData?.hasar_durumu || "Yok",
    olay_teslim_edilen_kisi: initialData?.olay_teslim_edilen_kisi || "",
    aciklama: initialData?.ek16_hasar_aciklama || initialData?.aciklama || "",
    olu_halk: String(initialData?.olu_halk || "0"),
    yarali_halk: String(initialData?.yarali_halk || "0"),
    kurtarilan_halk: String(initialData?.kurtarilan_halk || "0"),
    olu_itfaiye: String(initialData?.olu_itfaiye || "0"),
    yarali_itfaiye: String(initialData?.yarali_itfaiye || "0"),
    kurtarilan_hayvan: String(initialData?.kurtarilan_hayvan || "0"),
    olen_hayvan: String(initialData?.olen_hayvan || "0"),
    yoldan_donuldu: initialData?.yoldan_donuldu || false,
    location_lat: initLat,
    location_lng: initLng
  })

  const [selectedPersonnel, setSelectedPersonnel] = useState<string[]>(
    initialData?.ek16_personel ? JSON.parse(initialData.ek16_personel) : []
  )
  const [selectedVehicles, setSelectedVehicles] = useState<string[]>(
    initialData?.ek16_araclar ? JSON.parse(initialData.ek16_araclar) : []
  )

  const [personnelSearch, setPersonnelSearch] = useState("")
  const [vehicleSearch, setVehicleSearch] = useState("")
  const [mediaFiles, setMediaFiles] = useState<File[]>([])

  // ─── Kronolojik Saat Doğrulaması ─────────────────────────
  // Mantıksal sıra: İhbar ≤ Çıkış ≤ Varış ≤ Dönüş
  const validateTimes = (data: typeof formData): Record<string, string> => {
    const errors: Record<string, string> = {}
    const ihbar = data.ihbar_saati ? new Date(data.ihbar_saati).getTime() : 0
    const cikis = data.cikis_saati ? new Date(data.cikis_saati).getTime() : 0
    const varis = data.varis_saati ? new Date(data.varis_saati).getTime() : 0
    const donus = data.donus_saati ? new Date(data.donus_saati).getTime() : 0

    if (ihbar && cikis && cikis < ihbar) {
      errors.cikis_saati = 'İstasyondan çıkış, ihbar saatinden önce olamaz.'
    }
    if (cikis && varis && varis < cikis) {
      errors.varis_saati = 'Olay yerine varış, istasyon çıkışından önce olamaz.'
    }
    if (ihbar && varis && varis < ihbar) {
      errors.varis_saati = 'Olay yerine varış, ihbar saatinden önce olamaz.'
    }
    if (varis && donus && donus < varis) {
      errors.donus_saati = 'İstasyona dönüş, olay yerine varıştan önce olamaz.'
    }
    if (cikis && donus && donus < cikis) {
      errors.donus_saati = 'İstasyona dönüş, istasyon çıkışından önce olamaz.'
    }
    return errors
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    if (isClosed) return
    const updated = { ...formData, [e.target.name]: e.target.value }
    setFormData(updated)
    // Saat alanları değiştiğinde doğrulama yap
    if (['ihbar_saati', 'cikis_saati', 'varis_saati', 'donus_saati'].includes(e.target.name)) {
      setTimeErrors(validateTimes(updated))
    }
  }

  const toggleKurum = (kurum: string) => {
    if (isClosed) return
    if (formData.bildirilen_kurumlar.includes(kurum)) {
      setFormData({ ...formData, bildirilen_kurumlar: formData.bildirilen_kurumlar.filter((k: string) => k !== kurum) })
    } else {
      setFormData({ ...formData, bildirilen_kurumlar: [...formData.bildirilen_kurumlar, kurum] })
    }
  }

  const togglePersonnel = (sicil_no: string) => {
    if (isClosed) return
    if (selectedPersonnel.includes(sicil_no)) {
      setSelectedPersonnel(selectedPersonnel.filter(id => id !== sicil_no))
    } else {
      setSelectedPersonnel([...selectedPersonnel, sicil_no])
    }
  }

  const toggleVehicle = (plaka: string) => {
    if (isClosed) return
    if (selectedVehicles.includes(plaka)) {
      setSelectedVehicles(selectedVehicles.filter(id => id !== plaka))
    } else {
      setSelectedVehicles([...selectedVehicles, plaka])
    }
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (isClosed) return

    // Son doğrulama kontrolü
    const errors = validateTimes(formData)
    setTimeErrors(errors)
    if (Object.keys(errors).length > 0) {
      setStep(1) // Hatalı adıma geri dön
      return
    }

    setSubmitting(true)
    try {
      const { location_lat, location_lng, ...restFormData } = formData;
      const payload = {
        ...restFormData,
        bildirilen_kurumlar: JSON.stringify(formData.bildirilen_kurumlar),
        kullanilan_su_ton: Number(formData.kullanilan_su_ton) || 0,
        kullanilan_kopuk_litre: Number(formData.kullanilan_kopuk_litre) || 0,
        kullanilan_kkt_kg: Number(formData.kullanilan_kkt_kg) || 0,
        olu_halk: Number(formData.olu_halk) || 0,
        yarali_halk: Number(formData.yarali_halk) || 0,
        kurtarilan_halk: Number(formData.kurtarilan_halk) || 0,
        olu_itfaiye: Number(formData.olu_itfaiye) || 0,
        yarali_itfaiye: Number(formData.yarali_itfaiye) || 0,
        kurtarilan_hayvan: Number(formData.kurtarilan_hayvan) || 0,
        olen_hayvan: Number(formData.olen_hayvan) || 0,
        yoldan_donuldu: formData.yoldan_donuldu,
        location: `POINT(${location_lng} ${location_lat})`,
        
        // Kapanış ekstra alanları
        status: mode === 'edit' ? 'closed' : 'active',
        ek16_personel: JSON.stringify(selectedPersonnel),
        ek16_araclar: JSON.stringify(selectedVehicles),
        ek16_cikis_nedeni: formData.cikis_sebebi,
        ek16_hasar_aciklama: formData.aciklama,
        ek16_kapatis_tarihi: mode === 'edit' ? new Date().toISOString() : null
      }
      
      let incidentId = initialData?.id

      if (mode === 'edit' && incidentId) {
        // Düzenleme / Kapatma işlemi
        const { error: updErr } = await api.update('incidents', payload, { id: incidentId })
        if (updErr) throw updErr
      } else {
        // Yeni kayıt oluşturma
        const { data: incData, error: incErr } = await api.insert('incidents', payload)
        if (incErr) throw incErr
        incidentId = incData.id

        // Sadece yeni kayıtta insert_personnel vs yapıyoruz. 
        // Kapama ekranında seçili olanlar zaten ek16_personel JSON array'inde tutuluyor.
        if (selectedPersonnel.length > 0) {
          const pPayload = selectedPersonnel.map(sicil_no => ({ incident_id: incidentId, sicil_no, gorev: "Müdahale Personeli" }))
          unwrap(await api.insert('incident_personnel', pPayload))
        }

        if (selectedVehicles.length > 0) {
          const vPayload = selectedVehicles.map(plaka => ({ incident_id: incidentId, plaka, gorev_turu: "Müdahale Aracı" }))
          unwrap(await api.insert('incident_vehicles', vPayload))
        }

        // SMS Tetikleme (Sadece yeni kayıtta)
        try {
          await fetch('/api/sms/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'incident',
              missionType: payload.olay_turu,
              missionTitle: payload.olay_turu,
              missionAddress: payload.adres,
              detail: formData.aciklama
            })
          })
        } catch (smsErr) {
          console.error("Olay SMS gonderilemedi:", smsErr)
        }
      }

      // Upload Media Files
      if (mediaFiles.length > 0) {
        for (const file of mediaFiles) {
          const mFormData = new FormData()
          mFormData.append('file', file)
          mFormData.append('folder', 'incidents')

          const uploadRes = await fetch('/api/upload', { method: 'POST', body: mFormData })
          const uploadResult = await uploadRes.json()
            
          if (!uploadResult.error) {
            const fileType = file.type.startsWith('video/') ? 'video' : 'fotoğraf'

            unwrap(await api.insert('incident_media', {
              incident_id: incidentId,
              url: uploadResult.url,
              tip: fileType
            }))
          } else {
            throw new Error(`Medya dosyası yüklenemedi (${file.name}): ${uploadResult.error}`)
          }
        }
      }

      onSuccess()
    } catch (error) {
      console.error(error)
      toast("Kayıt sırasında bir hata oluştu.")
    } finally {
      setSubmitting(false)
    }
  }

  const handlePrint = () => {
    // Helper formatters
    const formatDate = (dateStr: string) => {
      if (!dateStr) return '-'
      try {
        const d = new Date(dateStr)
        if (isNaN(d.getTime())) return dateStr
        const day = String(d.getDate()).padStart(2, '0')
        const month = String(d.getMonth() + 1).padStart(2, '0')
        const year = d.getFullYear()
        const hours = String(d.getHours()).padStart(2, '0')
        const minutes = String(d.getMinutes()).padStart(2, '0')
        return `${day}.${month}.${year} ${hours}:${minutes}`
      } catch (e) {
        return dateStr
      }
    }

    const formatDateOnly = (dateStr: string) => {
      if (!dateStr) return '-'
      try {
        const d = new Date(dateStr)
        if (isNaN(d.getTime())) return dateStr
        const day = String(d.getDate()).padStart(2, '0')
        const month = String(d.getMonth() + 1).padStart(2, '0')
        const year = d.getFullYear()
        return `${day}.${month}.${year}`
      } catch (e) {
        return dateStr
      }
    }

    const formatTimeOnly = (dateStr: string) => {
      if (!dateStr) return '-'
      try {
        const d = new Date(dateStr)
        if (isNaN(d.getTime())) return dateStr
        const hours = String(d.getHours()).padStart(2, '0')
        const minutes = String(d.getMinutes()).padStart(2, '0')
        return `${hours}:${minutes}`
      } catch (e) {
        return dateStr
      }
    }

    const logoBelediye = `${window.location.origin}/logo-belediye.png`
    const logoItfaiye = `${window.location.origin}/logo-itfaiye.png`

    const personnelRows = selectedPersonnel.map((sicil, idx) => {
      const p = personnelList.find(x => x.sicil_no === sicil)
      return p ? `${idx + 1}. ${p.ad} ${p.soyad} (${p.unvan || 'İtfaiye Eri'} - Sicil: ${p.sicil_no})` : `${idx + 1}. Sicil: ${sicil}`
    }).join('<br/>')

    const vehicleRows = selectedVehicles.map((plaka, idx) => {
      const v = vehicleList.find(x => x.plaka === plaka)
      return v ? `${idx + 1}. ${v.plaka} (${v.arac_tipi || 'Arazöz'})` : `${idx + 1}. ${plaka}`
    }).join('<br/>')

    const ustAmirler = selectedPersonnel.map(sicil => {
      const p = personnelList.find(x => x.sicil_no === sicil)
      if (p && (
        p.unvan?.toLowerCase().includes('amir') || 
        p.unvan?.toLowerCase().includes('müdür') || 
        p.unvan?.toLowerCase().includes('başkan') ||
        p.unvan?.toLowerCase().includes('çavuş')
      )) {
        return `${p.ad} ${p.soyad} (${p.unvan})`
      }
      return null
    }).filter(Boolean).join(', ') || 'Nöbetçi Ekip Amiri'

    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    printWindow.document.write(`
      <html>
        <head>
          <title>EK-16 Raporu - ${formData.mahalle}</title>
          <style>
            body {
              font-family: 'Times New Roman', Times, serif;
              margin: 0;
              padding: 0;
              color: #000;
              background-color: #fff;
              font-size: 11px;
              line-height: 1.3;
            }

            @page {
              size: A4;
              margin: 12mm 15mm 12mm 15mm;
            }

            .page {
              width: 100%;
              box-sizing: border-box;
              page-break-after: always;
              background: white;
              position: relative;
            }

            .page:last-child {
              page-break-after: avoid;
            }

            /* Header styles */
            .header-table {
              width: 100%;
              border-collapse: collapse;
              border: none;
              margin-bottom: 10px;
            }

            .header-logo-cell {
              width: 70px;
              text-align: center;
              vertical-align: middle;
            }

            .header-text-cell {
              text-align: center;
              vertical-align: middle;
            }

            .header-title-main {
              font-size: 13px;
              font-weight: bold;
              letter-spacing: 0.5px;
              margin: 0;
            }

            .header-subtitle {
              font-size: 11px;
              font-weight: bold;
              margin: 2px 0;
            }

            .header-report-title {
              font-size: 12px;
              font-weight: bold;
              margin-top: 5px;
              text-decoration: underline;
            }

            /* Metadata columns under header */
            .meta-table {
              width: 100%;
              border-collapse: collapse;
              border: none;
              margin-bottom: 8px;
              font-size: 10px;
            }

            .meta-cell-left {
              text-align: left;
              width: 50%;
              vertical-align: top;
            }

            .meta-cell-right {
              text-align: right;
              width: 50%;
              vertical-align: top;
            }

            /* Main report table styling */
            .report-table {
              width: 100%;
              border-collapse: collapse;
              border: 2px solid #000;
            }

            .report-table th, .report-table td {
              border: 1px solid #000;
              padding: 4px 6px;
              vertical-align: middle;
            }

            .label-cell {
              background-color: #f2f2f2;
              font-weight: bold;
              width: 32%;
              font-size: 10px;
            }

            .value-cell {
              font-size: 10.5px;
            }

            /* Inner nested table styling */
            .inner-table {
              width: 100%;
              border-collapse: collapse;
              border: none;
            }

            .inner-table td {
              border: none;
              padding: 2px 4px;
            }

            .inner-table-grid {
              width: 100%;
              border-collapse: collapse;
              border: none;
              text-align: center;
            }

            .inner-table-grid th, .inner-table-grid td {
              border: none;
              border-bottom: 1px solid #000;
              border-right: 1px solid #000;
              padding: 3px;
            }

            .inner-table-grid th {
              background-color: #f9f9f9;
              font-weight: bold;
              font-size: 9.5px;
            }

            .inner-table-grid tr:last-child td {
              border-bottom: none;
            }

            .inner-table-grid td:last-child, .inner-table-grid th:last-child {
              border-right: none;
            }

            /* Signature block */
            .signature-section {
              margin-top: 30px;
              width: 100%;
            }

            .signature-table {
              width: 100%;
              border-collapse: collapse;
              border: none;
            }

            .signature-cell {
              width: 33.33%;
              text-align: center;
              vertical-align: top;
              font-size: 11px;
            }

            .signature-line {
              margin-top: 45px;
              border-top: 1px dashed #000;
              width: 75%;
              margin-left: auto;
              margin-right: auto;
            }
          </style>
        </head>
        <body>
          
          <!-- 1. SAYFA -->
          <div class="page">
            <table class="header-table">
              <tr>
                <td class="header-logo-cell">
                  <img src="${logoBelediye}" alt="Sivas Belediyesi" style="max-height: 52px; max-width: 52px; object-fit: contain;" />
                </td>
                <td class="header-text-cell">
                  <div class="header-title-main">T.C.</div>
                  <div class="header-title-main">SİVAS BELEDİYE BAŞKANLIĞI</div>
                  <div class="header-subtitle">İTFAİYE MÜDÜRLÜĞÜ</div>
                  <div class="header-report-title">İTFAİYE OLAY RAPORU (EK-16)</div>
                </td>
                <td class="header-logo-cell">
                  <img src="${logoItfaiye}" alt="Sivas İtfaiyesi" style="max-height: 52px; max-width: 52px; object-fit: contain;" />
                </td>
              </tr>
            </table>

            <table class="meta-table">
              <tr>
                <td class="meta-cell-left">
                  <div><strong>Sayı:</strong> SVS-İTF-${initialData?.id || 'YENİ'}</div>
                  <div><strong>Konu:</strong> İtfaiye Olay Raporu (EK-16)</div>
                </td>
                <td class="meta-cell-right">
                  <div><strong>İlçesi (Olay Yeri):</strong> Merkez / SİVAS</div>
                  <div><strong>Kayıt Tarihi:</strong> ${formatDate(initialData?.ek16_kapatis_tarihi || new Date().toISOString())}</div>
                  <div><strong>Bildirim No:</strong> ${initialData?.id || '-'}</div>
                </td>
              </tr>
            </table>

            <table class="report-table">
              <tr>
                <td class="label-cell">Olayı ihbar edenin telefonu/adresi</td>
                <td class="value-cell">${formData.ihbar_eden_ad_soyad || '-'} / ${formData.ihbar_eden_tel || '-'}</td>
              </tr>
              <tr>
                <td class="label-cell">Olay yerinin adresi</td>
                <td class="value-cell"><strong>${formData.adres || '-'}</strong> - Mahalle: <strong>${formData.mahalle || '-'}</strong> / SİVAS</td>
              </tr>
              <tr>
                <td class="label-cell">Olayın meydana geldiği tarih</td>
                <td class="value-cell" style="padding: 0;">
                  <table class="inner-table">
                    <tr>
                      <td style="width: 50%;">Tarih: <strong>${formatDateOnly(formData.ihbar_saati)}</strong></td>
                      <td style="border-left: 1px solid #000;">Saat: <strong>${formatTimeOnly(formData.ihbar_saati)}</strong></td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td class="label-cell">İlk müdahale eden birim</td>
                <td class="value-cell" style="padding: 0;">
                  <table class="inner-table-grid">
                    <tr>
                      <th>Çıkış Saati</th>
                      <th>Varış Saati</th>
                      <th>Müdahale Ekipleri</th>
                      <th>Personel Sayısı</th>
                    </tr>
                    <tr>
                      <td>${formatTimeOnly(formData.cikis_saati)}</td>
                      <td>${formatTimeOnly(formData.varis_saati)}</td>
                      <td>${selectedVehicles.join(', ') || '-'}</td>
                      <td>${selectedPersonnel.length} personel</td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td class="label-cell">Olayın sona eriş-dönüş tarih saati</td>
                <td class="value-cell" style="padding: 0;">
                  <table class="inner-table">
                    <tr>
                      <td style="width: 50%;">Sona Eriş: <strong>${formatDate(formData.donus_saati)}</strong></td>
                      <td style="border-left: 1px solid #000;">Dönüş: <strong>${formatDate(formData.donus_saati)}</strong></td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td class="label-cell">Müdahale şekli</td>
                <td class="value-cell">${formData.yoldan_donuldu ? 'Asılsız ihbar / Yoldan dönüldü' : formData.olay_turu + ' müdahale prosedürleri uygulanarak olaya müdahale edilmiş ve soğutma çalışması ile kontrol altına alınmıştır.'}</td>
              </tr>
              <tr>
                <td class="label-cell">Yardımcı birimler, araç, personel sayısı</td>
                <td class="value-cell">${formData.bildirilen_kurumlar.join(', ') || 'Yardımcı kurum bildirilmedi.'}</td>
              </tr>
              <tr>
                <td class="label-cell">Olaya müdahalede kullanılan madde ve miktarı</td>
                <td class="value-cell">
                  Su: <strong>${formData.kullanilan_su_ton || '0'} Ton</strong> | 
                  Köpük: <strong>${formData.kullanilan_kopuk_litre || '0'} Litre</strong> | 
                  KKT (Kuru Kimyevi Toz): <strong>${formData.kullanilan_kkt_kg || '0'} Kg</strong>
                </td>
              </tr>
              <tr>
                <td class="label-cell">Zarar gören bina ve eşyalar sigortalı mı?</td>
                <td class="value-cell">${formData.sigorta_durumu ? 'Evet' : 'Hayır / Belirtilmemiş'}</td>
              </tr>
              <tr>
                <td class="label-cell">Şirketin adı, sigorta miktarı, poliçe no</td>
                <td class="value-cell">${formData.sigorta_durumu || 'Sigorta bilgisi bulunmuyor / Sigortasız'}</td>
              </tr>
              <tr>
                <td class="label-cell">Olaya müdahale eden araç plakaları</td>
                <td class="value-cell"><strong>${selectedVehicles.join(', ') || '-'}</strong></td>
              </tr>
              <tr>
                <td class="label-cell">Olay yerini kullananların hukuki durumu</td>
                <td class="value-cell">Mülk Sahibi / Kiracı</td>
              </tr>
              <tr>
                <td class="label-cell">Olay yerini kullananların adları</td>
                <td class="value-cell">${formData.ihbar_eden_ad_soyad || '-'}</td>
              </tr>
              <tr>
                <td class="label-cell">Olayın olduğu yerin yasal sahipleri</td>
                <td class="value-cell">${formData.ihbar_eden_ad_soyad || '-'}</td>
              </tr>
              <tr>
                <td class="label-cell">Varsa olayda zarar gören araç, gereç ve malzemenin durumu</td>
                <td class="value-cell">Hasar Derecesi: <strong>${formData.hasar_durumu}</strong></td>
              </tr>
              <tr>
                <td class="label-cell">Olayda ölen veya yaralanan olmuş ise görevleri, ad ve soyadları</td>
                <td class="value-cell" style="padding: 0;">
                  <table class="inner-table-grid">
                    <tr>
                      <th>Kayıp / Yaralı Sınıfı</th>
                      <th>Siviller (Halk)</th>
                      <th>İtfaiye Personeli</th>
                    </tr>
                    <tr>
                      <td><strong>Ölü / Vefat</strong></td>
                      <td>${formData.olu_halk} kişi</td>
                      <td>${formData.olu_itfaiye} personel</td>
                    </tr>
                    <tr>
                      <td><strong>Yaralı</strong></td>
                      <td>${formData.yarali_halk} kişi</td>
                      <td>${formData.yarali_itfaiye} personel</td>
                    </tr>
                    <tr>
                      <td><strong>Kurtarılan</strong></td>
                      <td>${formData.kurtarilan_halk} kişi</td>
                      <td>-</td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td class="label-cell">Olayda kurtarılan ve ölen hayvan sayısı</td>
                <td class="value-cell" style="padding: 0;">
                  <table class="inner-table">
                    <tr>
                      <td style="width: 50%;">Kurtarılan Hayvan: <strong>${formData.kurtarilan_hayvan}</strong></td>
                      <td style="border-left: 1px solid #000;">Ölen Hayvan: <strong>${formData.olen_hayvan}</strong></td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td class="label-cell">Olaya katılan üst amirler</td>
                <td class="value-cell">${ustAmirler}</td>
              </tr>
              <tr>
                <td class="label-cell">Olay yerinin kime teslim edildiği</td>
                <td class="value-cell">${formData.olay_teslim_edilen_kisi || 'Mülk Sahibi / Emniyet Güçleri'}</td>
              </tr>
              <tr>
                <td class="label-cell">Olay yeri bina ise; yapı malzemesi, kat ve daire sayısı, kullanım amacı</td>
                <td class="value-cell">Yapı Cinsi: <strong>${formData.bina_yapi_malzemesi}</strong> | Başlangıç Noktası: <strong>${formData.yangin_baslangic_yeri || 'Belirtilmemiş'}</strong></td>
              </tr>
              <tr>
                <td class="label-cell">Olay yerinin kullanım amacı</td>
                <td class="value-cell">Konut / Sosyal Donatı / Diğer</td>
              </tr>
              <tr>
                <td class="label-cell">Müdahaleden önce olayın durumu</td>
                <td class="value-cell">Aktif yangın ve yoğun duman yayılımı mevcut durumdaydı.</td>
              </tr>
              <tr>
                <td class="label-cell">Yapılan çalışma ve hasar durumu</td>
                <td class="value-cell">${formData.aciklama || 'Söndürme ve soğutma çalışması tamamlandı. Maddi hasar meydana geldi.'}</td>
              </tr>
            </table>
          </div>

          <!-- 2. SAYFA -->
          <div class="page" style="margin-top: 15mm;">
            <table class="header-table" style="margin-bottom: 15px; border-bottom: 2px solid #000; padding-bottom: 5px;">
              <tr>
                <td style="text-align: left; font-weight: bold; font-size: 10px;">
                  T.C. SİVAS BELEDİYESİ | İTFAİYE OLAY RAPORU (EK-16 DEVAMI)
                </td>
                <td style="text-align: right; font-weight: bold; font-size: 10px;">
                  Bildirim No: ${initialData?.id || '-'} | Sayfa: 2 / 2
                </td>
              </tr>
            </table>

            <table class="report-table" style="margin-bottom: 20px;">
              <tr>
                <td class="label-cell" style="width: 32%; height: 80px;">Olayın oluş şekli ve çıkış sebebi</td>
                <td class="value-cell" style="vertical-align: top; padding-top: 8px;">
                  Çıkış Sebebi: <strong>${formData.cikis_sebebi}</strong>
                  <p style="margin: 8px 0 0 0; font-size: 10.5px; line-height: 1.4;">
                    ${formData.aciklama || 'Sivas İtfaiye Komuta Merkezi ihbarı üzerine ekipler sevk edilerek müdahalede bulunulmuş, maddi hasarlı / can kayıpsız şekilde olay kontrol altına alınmıştır.'}
                  </p>
                </td>
              </tr>
              <tr>
                <td class="label-cell" style="vertical-align: top; padding-top: 8px;">Olaya müdahale eden personel</td>
                <td class="value-cell" style="line-height: 1.6; padding: 8px;">
                  ${personnelRows || 'Müdahale personel kaydı bulunmuyor.'}
                </td>
              </tr>
              <tr>
                <td class="label-cell" style="vertical-align: top; padding-top: 8px;">Olaya katılan araç detayları</td>
                <td class="value-cell" style="line-height: 1.6; padding: 8px;">
                  ${vehicleRows || 'Müdahale araç kaydı bulunmuyor.'}
                </td>
              </tr>
              <tr>
                <td class="label-cell">Yazıcı</td>
                <td class="value-cell">Sivas İtfaiye Komuta Merkezi Otomasyon Sistemi ve Nöbetçi Yazıcı Eri</td>
              </tr>
            </table>

            <!-- Signature Section -->
            <div class="signature-section">
              <div style="text-align: center; font-weight: bold; margin-bottom: 25px; font-size: 11px; text-decoration: underline;">
                İTFAİYE OLAY RAPORU İMZA SİRKÜSÜ
              </div>
              
              <table class="signature-table">
                <tr>
                  <td class="signature-cell">
                    <strong>Müdahale Eden Ekip Amiri</strong>
                    <div style="font-size: 9px; margin-top: 4px; color: #444;">
                      Ad Soyad / Unvan / İmza
                    </div>
                    <div class="signature-line"></div>
                    <div style="font-size: 10px; margin-top: 10px; font-weight: bold;">
                      ${ustAmirler.split(',')[0] || 'Ekip Amiri'}
                    </div>
                  </td>
                  <td class="signature-cell">
                    <strong>İncelendi</strong>
                    <div style="font-size: 9px; margin-top: 4px; color: #444;">
                      Nöbetçi Amir / İmza
                    </div>
                    <div class="signature-line"></div>
                    <div style="font-size: 10px; margin-top: 10px; font-weight: bold;">
                      Nöbetçi Amiri
                    </div>
                  </td>
                  <td class="signature-cell">
                    <strong>ONAY</strong>
                    <div style="font-size: 9px; margin-top: 4px; color: #444;">
                      İtfaiye Müdürü / İmza
                    </div>
                    <div class="signature-line"></div>
                    <div style="font-size: 10px; margin-top: 8px; font-weight: bold;">
                      .... / .... / 20...
                    </div>
                  </td>
                </tr>
              </table>
            </div>
          </div>

        </body>
      </html>
    `)
    printWindow.document.close()
    setTimeout(() => {
      printWindow.print()
    }, 500)
  }

  const filteredPersonnel = personnelList.filter(p => 
    (p.ad + " " + p.soyad).toLowerCase().includes(personnelSearch.toLowerCase()) ||
    p.sicil_no.toLowerCase().includes(personnelSearch.toLowerCase())
  )

  const filteredVehicles = vehicleList.filter(v => 
    v.plaka.toLowerCase().includes(vehicleSearch.toLowerCase()) ||
    v.arac_tipi?.toLowerCase().includes(vehicleSearch.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Stepper Header */}
      <div className="flex items-center justify-between overflow-x-auto hide-scrollbar border-b pb-4 gap-2">
        {[1, 2, 3, 4].map(num => (
          <div 
            key={num} 
            className={`flex items-center gap-2 px-3 py-2 rounded-full border transition-colors whitespace-nowrap cursor-pointer ${
              step === num ? 'bg-primary text-primary-foreground border-primary' : 
              step > num ? 'bg-primary/10 text-primary border-primary/20' : 'bg-surface border-border text-muted-foreground'
            }`}
            onClick={() => setStep(num)}
          >
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-background/20 shrink-0">
              {step > num ? <CheckCircle2 className="w-4 h-4" /> : num}
            </div>
            <span className="text-sm font-medium pr-1">
              {num === 1 ? 'İhbar & Zaman' : num === 2 ? 'Olay Yeri & Bina' : num === 3 ? 'Ekipler & Sarfiyat' : 'Sonuç & Rapor'}
            </span>
          </div>
        ))}
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader className="bg-surface/30 border-b hidden-print">
          <CardTitle className="text-lg flex items-center gap-2">
            {step === 1 && <><Phone className="w-5 h-5 text-primary" /> Adım 1: İhbar ve Zaman Bilgileri</>}
            {step === 2 && <><HomeIcon className="w-5 h-5 text-primary" /> Adım 2: Olay Yeri ve Bina Detayları</>}
            {step === 3 && <><Crosshair className="w-5 h-5 text-primary" /> Adım 3: Müdahale, Ekipler ve Sarfiyat</>}
            {step === 4 && <><FileText className="w-5 h-5 text-primary" /> Adım 4: Kayıplar ve Sonuç Raporu</>}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div ref={printRef}>
          <form onSubmit={handleSubmit}>
            <fieldset disabled={isClosed} className="group">
            
            {/* STEP 1 */}
            {step === 1 && (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Olay Türü *</label>
                    <select name="olay_turu" value={formData.olay_turu} onChange={handleInputChange} required className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                      <optgroup label="🔴 Kritik (Seviye 3)">
                        <option value="Ev Yangını">Ev Yangını</option>
                        <option value="Bina/Fabrika Yangını">Bina/Fabrika Yangını</option>
                        <option value="Sıkışmalı Trafik Kazası">Sıkışmalı Trafik Kazası</option>
                        <option value="KBRN Sızıntısı">KBRN Sızıntısı</option>
                      </optgroup>
                      <optgroup label="🟡 Orta (Seviye 2)">
                        <option value="Araç Yangını">Araç Yangını</option>
                        <option value="İşyeri Yangını">İşyeri Yangını</option>
                        <option value="Kurtarma Operasyonları">Kurtarma Operasyonları</option>
                      </optgroup>
                      <optgroup label="🟢 Düşük (Seviye 1)">
                        <option value="Çöp Yangını">Çöp Yangını</option>
                        <option value="Ot/Anız Yangını">Ot/Anız Yangını</option>
                        <option value="Kapı Açma">Kapı Açma</option>
                        <option value="Hayvan Kurtarma">Hayvan Kurtarma</option>
                        <option value="Asılsız İhbar">Asılsız İhbar</option>
                        <option value="Eğitim/Tatbikat">Eğitim/Tatbikat</option>
                        <option value="Diğer">Diğer</option>
                      </optgroup>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 border rounded-xl bg-surface/30">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-muted-foreground">İhbar Eden Kişi</label>
                    <Input name="ihbar_eden_ad_soyad" placeholder="Ad Soyad" value={formData.ihbar_eden_ad_soyad} onChange={handleInputChange} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-muted-foreground">İhbar Eden Tel</label>
                    <Input name="ihbar_eden_tel" placeholder="05XX XXX XX XX" value={formData.ihbar_eden_tel} onChange={handleInputChange} />
                  </div>
                  <div className="col-span-1 md:col-span-2 space-y-2">
                    <label className="text-sm font-semibold text-muted-foreground">Bilgi Verilen Diğer Kurumlar (Çoklu Seçim)</label>
                    <div className="flex flex-wrap gap-2">
                      {KURUMLAR.map(kurum => {
                        const isSelected = formData.bildirilen_kurumlar.includes(kurum)
                        return (
                          <Badge 
                            key={kurum} 
                            variant={isSelected ? "default" : "outline"}
                            className={`cursor-pointer ${isSelected ? 'bg-primary text-white' : 'hover:bg-muted'}`}
                            onClick={() => toggleKurum(kurum)}
                          >
                            {kurum}
                          </Badge>
                        )
                      })}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 border rounded-xl bg-surface/30">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">İhbar Saati</label>
                    <Input type="datetime-local" name="ihbar_saati" value={formData.ihbar_saati} onChange={handleInputChange} required className={timeErrors.ihbar_saati ? 'border-red-500 ring-1 ring-red-500/30' : ''} />
                    {timeErrors.ihbar_saati && <p className="text-[11px] text-red-500 flex items-center gap-1 mt-1"><AlertTriangle className="w-3 h-3" />{timeErrors.ihbar_saati}</p>}
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">İstasyondan Çıkış</label>
                    <Input type="datetime-local" name="cikis_saati" value={formData.cikis_saati} onChange={handleInputChange} required className={timeErrors.cikis_saati ? 'border-red-500 ring-1 ring-red-500/30' : ''} />
                    {timeErrors.cikis_saati && <p className="text-[11px] text-red-500 flex items-center gap-1 mt-1"><AlertTriangle className="w-3 h-3" />{timeErrors.cikis_saati}</p>}
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">Olay Yerine Varış</label>
                    <Input type="datetime-local" name="varis_saati" value={formData.varis_saati} onChange={handleInputChange} required className={timeErrors.varis_saati ? 'border-red-500 ring-1 ring-red-500/30' : ''} />
                    {timeErrors.varis_saati && <p className="text-[11px] text-red-500 flex items-center gap-1 mt-1"><AlertTriangle className="w-3 h-3" />{timeErrors.varis_saati}</p>}
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">İstasyona Dönüş</label>
                    <Input type="datetime-local" name="donus_saati" value={formData.donus_saati} onChange={handleInputChange} required className={timeErrors.donus_saati ? 'border-red-500 ring-1 ring-red-500/30' : ''} />
                    {timeErrors.donus_saati && <p className="text-[11px] text-red-500 flex items-center gap-1 mt-1"><AlertTriangle className="w-3 h-3" />{timeErrors.donus_saati}</p>}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2 */}
            {step === 2 && (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 border rounded-xl bg-surface/30">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold">Mahalle *</label>
                      <Input name="mahalle" placeholder="Örn: Alibaba" value={formData.mahalle} onChange={handleInputChange} required />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold">Açık Adres *</label>
                      <Input name="adres" placeholder="Sokak, Cadde, Bina No..." value={formData.adres} onChange={handleInputChange} required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-primary" />
                      Haritada Seç (İsteğe Bağlı)
                    </label>
                    <div className="h-[250px] relative rounded-xl overflow-hidden border border-border shadow-sm">
                      <Map 
                        incidents={[{ id: 'new', olay_turu: 'Seçili Konum', mahalle: formData.mahalle, adres: formData.adres, cikis_saati: new Date().toISOString(), location: { coordinates: [formData.location_lng, formData.location_lat] } }]} 
                        hydrants={[]} 
                        mode={isClosed ? "idle" : "add_incident"}
                        onMapClick={(lat: number, lng: number) => {
                          if (isClosed) return;
                          setFormData({ ...formData, location_lat: lat, location_lng: lng })
                        }}
                        focusLocation={null}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">Konumu seçmek için haritaya tıklayın veya sürükleyin.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 border rounded-xl bg-surface/30">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-muted-foreground">Bina Yapı Malzemesi</label>
                    <select name="bina_yapi_malzemesi" value={formData.bina_yapi_malzemesi} onChange={handleInputChange} className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                      {BINA_TURLERI.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-muted-foreground">Sigorta Durumu</label>
                    <Input name="sigorta_durumu" placeholder="Örn: Sigortalı (Anadolu Sigorta)" value={formData.sigorta_durumu} onChange={handleInputChange} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-semibold text-muted-foreground">Yangın / Olay Başlangıç Yeri</label>
                    <Input name="yangin_baslangic_yeri" placeholder="Örn: 2. Kat Mutfak, Bina Çatısı..." value={formData.yangin_baslangic_yeri} onChange={handleInputChange} />
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3 */}
            {step === 3 && (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Araçlar */}
                  <div className="border rounded-xl flex flex-col h-[350px]">
                    <div className="p-3 bg-surface border-b flex items-center justify-between">
                      <span className="font-semibold text-sm">Sevk Edilen Araçlar</span>
                      <Badge variant="outline">{selectedVehicles.length} Seçili</Badge>
                    </div>
                    {!isClosed && (
                      <div className="p-2 border-b">
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input placeholder="Araç Ara..." className="h-8 pl-8 text-xs" value={vehicleSearch} onChange={e => setVehicleSearch(e.target.value)} />
                        </div>
                      </div>
                    )}
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                      {isClosed ? (
                        selectedVehicles.map(vPlaka => (
                          <div key={vPlaka} className="p-2 text-sm rounded-lg flex items-center justify-between border bg-primary/10 border-primary/30 text-primary font-medium">
                            <span>{vPlaka}</span>
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                        ))
                      ) : (
                        filteredVehicles.map(v => {
                          const isMaint = v.current_branch === 'Makine İkmal Müdürlüğü (Bakım-Onarım)';
                          return (
                            <div 
                              key={v.plaka} 
                              onClick={() => { if (!isMaint) toggleVehicle(v.plaka); }} 
                              className={`p-2 text-sm rounded-lg flex items-center justify-between border ${
                                isMaint 
                                  ? 'opacity-40 cursor-not-allowed bg-slate-900 border-transparent text-slate-500' 
                                  : 'cursor-pointer'
                              } ${
                                selectedVehicles.includes(v.plaka) 
                                  ? 'bg-primary/10 border-primary/30 text-primary font-medium' 
                                  : 'bg-background hover:bg-surface border-transparent'
                              }`}
                            >
                              <span>
                                {v.plaka} <span className="text-xs opacity-60 ml-1">({v.arac_tipi})</span>
                                {isMaint && <span className="text-[10px] font-bold text-amber-500 ml-2">🔧 BAKIMDA</span>}
                              </span>
                              {selectedVehicles.includes(v.plaka) && <CheckCircle2 className="w-4 h-4" />}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Personel */}
                  <div className="border rounded-xl flex flex-col h-[350px]">
                    <div className="p-3 bg-surface border-b flex items-center justify-between">
                      <span className="font-semibold text-sm">Müdahale Eden Ekipler</span>
                      <Badge variant="outline">{selectedPersonnel.length} Seçili</Badge>
                    </div>
                    {!isClosed && (
                      <div className="p-2 border-b">
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input placeholder="Personel Ara..." className="h-8 pl-8 text-xs" value={personnelSearch} onChange={e => setPersonnelSearch(e.target.value)} />
                        </div>
                      </div>
                    )}
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                      {isClosed ? (
                        selectedPersonnel.map(sicil => {
                          const p = personnelList.find(pr => pr.sicil_no === sicil)
                          return (
                            <div key={sicil} className="p-2 text-sm rounded-lg flex items-center justify-between border bg-primary/10 border-primary/30 text-primary font-medium">
                              <span>{p ? `${p.ad} ${p.soyad}` : sicil}</span>
                              <CheckCircle2 className="w-4 h-4" />
                            </div>
                          )
                        })
                      ) : (
                        filteredPersonnel.map(p => (
                          <div key={p.sicil_no} onClick={() => togglePersonnel(p.sicil_no)} className={`p-2 text-sm rounded-lg cursor-pointer flex items-center justify-between border ${selectedPersonnel.includes(p.sicil_no) ? 'bg-primary/10 border-primary/30 text-primary font-medium' : 'bg-background hover:bg-surface border-transparent'}`}>
                            <span>{p.ad} {p.soyad} <span className="text-xs opacity-60 ml-1">({p.unvan})</span></span>
                            {selectedPersonnel.includes(p.sicil_no) && <CheckCircle2 className="w-4 h-4" />}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {(formData.olay_turu === 'Yangın' || formData.olay_turu === 'Trafik Kazası') && (
                  <div className="p-4 border border-danger/20 bg-danger/5 rounded-xl">
                    <h3 className="font-semibold text-danger flex items-center gap-2 mb-4"><Flame className="w-4 h-4" /> Sarfiyat Miktarları</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1"><Droplets className="w-3 h-3 text-blue-500" /> Su (Ton)</label>
                        <Input type="number" min="0" step="0.1" name="kullanilan_su_ton" value={formData.kullanilan_su_ton} onChange={handleInputChange} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1"><Activity className="w-3 h-3 text-warning" /> Köpük (Litre)</label>
                        <Input type="number" min="0" step="0.1" name="kullanilan_kopuk_litre" value={formData.kullanilan_kopuk_litre} onChange={handleInputChange} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-muted-foreground">KKT (Kg)</label>
                        <Input type="number" min="0" step="0.1" name="kullanilan_kkt_kg" value={formData.kullanilan_kkt_kg} onChange={handleInputChange} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 4 */}
            {step === 4 && (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                
                <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      id="yoldanDonuldu" 
                      name="yoldan_donuldu"
                      checked={formData.yoldan_donuldu}
                      onChange={(e) => setFormData({ ...formData, yoldan_donuldu: e.target.checked })}
                      className="w-4 h-4 rounded text-orange-500 bg-surface/50 border-orange-500/30"
                    />
                    <label htmlFor="yoldanDonuldu" className="text-sm font-bold text-orange-500 cursor-pointer select-none">
                      Asılsız İhbar / Yoldan Dönüldü
                    </label>
                  </div>
                  <p className="text-xs text-orange-500/70 ml-2 border-l border-orange-500/20 pl-3">
                    Ekipler olay yerine ulaşmadan görev iptal edildiyse veya ihbar asılsız çıktıysa işaretleyin.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Çıkış Sebebi</label>
                    <select name="cikis_sebebi" value={formData.cikis_sebebi} onChange={handleInputChange} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      {CIKIS_SEBEPLERI.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Hasar Durumu</label>
                    <select name="hasar_durumu" value={formData.hasar_durumu} onChange={handleInputChange} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="Yok">Yok</option>
                      <option value="Maddi Hasarlı">Maddi Hasarlı</option>
                      <option value="Yaralanmalı">Yaralanmalı</option>
                      <option value="Can Kayıplı">Can Kayıplı</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-4 border rounded-xl bg-surface/30">
                  <div className="space-y-4">
                    <h4 className="font-semibold text-sm border-b pb-2 flex items-center gap-2"><UserPlus className="w-4 h-4" /> Siviller (Halk)</h4>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div><label className="text-[10px] uppercase text-muted-foreground">Ölü</label><Input type="number" min="0" name="olu_halk" value={formData.olu_halk} onChange={handleInputChange} className="text-center" /></div>
                      <div><label className="text-[10px] uppercase text-muted-foreground">Yaralı</label><Input type="number" min="0" name="yarali_halk" value={formData.yarali_halk} onChange={handleInputChange} className="text-center" /></div>
                      <div><label className="text-[10px] uppercase text-muted-foreground">Kurtarılan</label><Input type="number" min="0" name="kurtarilan_halk" value={formData.kurtarilan_halk} onChange={handleInputChange} className="text-center" /></div>
                    </div>
                  </div>
                  <div className="space-y-4 border-l pl-6">
                    <h4 className="font-semibold text-sm border-b pb-2 flex items-center gap-2"><Shield className="w-4 h-4" /> İtfaiye Personeli</h4>
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div><label className="text-[10px] uppercase text-muted-foreground">Ölü</label><Input type="number" min="0" name="olu_itfaiye" value={formData.olu_itfaiye} onChange={handleInputChange} className="text-center" /></div>
                      <div><label className="text-[10px] uppercase text-muted-foreground">Yaralı</label><Input type="number" min="0" name="yarali_itfaiye" value={formData.yarali_itfaiye} onChange={handleInputChange} className="text-center" /></div>
                    </div>
                  </div>
                  <div className="space-y-4 border-l pl-6">
                    <h4 className="font-semibold text-sm border-b pb-2 flex items-center gap-2"><HeartPulse className="w-4 h-4" /> Hayvanlar</h4>
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div><label className="text-[10px] uppercase text-muted-foreground">Ölen</label><Input type="number" min="0" name="olen_hayvan" value={formData.olen_hayvan} onChange={handleInputChange} className="text-center" /></div>
                      <div><label className="text-[10px] uppercase text-muted-foreground">Kurtarılan</label><Input type="number" min="0" name="kurtarilan_hayvan" value={formData.kurtarilan_hayvan} onChange={handleInputChange} className="text-center" /></div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold">Olay Yeri Kime Teslim Edildi?</label>
                  <Input name="olay_teslim_edilen_kisi" placeholder="Örn: Ev sahibi Ahmet Yılmaz, Polis Memuru..." value={formData.olay_teslim_edilen_kisi} onChange={handleInputChange} />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold">Detaylı Sonuç Raporu / Açıklama</label>
                  <textarea 
                    name="aciklama" rows={4}
                    placeholder="Olayın seyrini ve müdahale şeklini detaylıca yazınız..." 
                    value={formData.aciklama} onChange={handleInputChange} 
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {!isClosed && (
                  <div className="space-y-2 p-4 border border-dashed border-primary/50 rounded-xl bg-primary/5 hidden-print">
                    <label className="text-sm font-semibold flex items-center gap-2 text-primary">
                      <UploadCloud className="w-5 h-5" /> Olay Medya Arşivi (Fotoğraf / Video)
                    </label>
                    <p className="text-xs text-muted-foreground mb-2">Çoklu dosya seçebilirsiniz. Rapor kaydedildiğinde bulut arşive yüklenecektir.</p>
                    <Input 
                      type="file" multiple accept="image/*,video/*"
                      onChange={(e) => setMediaFiles(Array.from(e.target.files || []))}
                      className="bg-background cursor-pointer"
                    />
                    {mediaFiles.length > 0 && (
                      <div className="mt-2 text-sm text-primary font-medium">{mediaFiles.length} dosya seçildi.</div>
                    )}
                  </div>
                )}
              </div>
            )}
            
            </fieldset>
          </form>
          </div>

          {/* Footer Navigation */}
          <div className="flex items-center justify-between mt-8 pt-4 border-t hidden-print">
            <Button type="button" variant="outline" onClick={() => step > 1 ? setStep(step - 1) : onCancel()}>
              {step > 1 ? 'Önceki Adım' : 'İptal'}
            </Button>
            
            {step < 4 ? (
              <Button type="button" onClick={() => {
                // Adım 1'den çıkarken saat doğrulaması yap
                if (step === 1) {
                  const errors = validateTimes(formData)
                  setTimeErrors(errors)
                  if (Object.keys(errors).length > 0) return
                }
                setStep(step + 1)
              }}>
                Sonraki Adım <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : isClosed ? (
              <Button type="button" onClick={handlePrint} className="bg-blue-500 hover:bg-blue-600 text-white gap-2">
                <Printer className="w-4 h-4" /> EK-16 Yazdır
              </Button>
            ) : (
              <Button type="button" onClick={handleSubmit} disabled={submitting} className={mode === 'edit' ? "bg-danger hover:bg-danger/90 text-white gap-2" : "gap-2"}>
                {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Kaydediliyor...</> : (
                  mode === 'edit' ? <><CheckCircle2 className="w-4 h-4" /> Tümünü Onayla ve Vakayı Kapat</> : "Yeni Vakayı Kaydet"
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
