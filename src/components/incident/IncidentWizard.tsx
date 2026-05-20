"use client"

import { useState, useRef, useEffect } from "react"
import { api } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Badge } from "@/components/ui/Badge"
import { 
  CheckCircle2, Loader2, Search, Flame, Droplets, 
  Activity, ArrowRight, UserPlus, Phone, Home as HomeIcon,
  HeartPulse, Shield, Crosshair, UploadCloud, FileText, Printer, MapPin
} from "lucide-react"
import dynamic from "next/dynamic"

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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    if (isClosed) return
    setFormData({ ...formData, [e.target.name]: e.target.value })
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
          await api.insert('incident_personnel', pPayload)
        }

        if (selectedVehicles.length > 0) {
          const vPayload = selectedVehicles.map(plaka => ({ incident_id: incidentId, plaka, gorev_turu: "Müdahale Aracı" }))
          await api.insert('incident_vehicles', vPayload)
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
            
            await api.insert('incident_media', {
              incident_id: incidentId,
              url: uploadResult.url,
              tip: fileType
            })
          }
        }
      }

      onSuccess()
    } catch (error) {
      console.error(error)
      alert("Kayıt sırasında bir hata oluştu.")
    } finally {
      setSubmitting(false)
    }
  }

  const handlePrint = () => {
    if (!printRef.current) return
    const printContents = printRef.current.innerHTML
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    printWindow.document.write(`
      <html>
        <head>
          <title>EK-16 Raporu - ${formData.mahalle}</title>
          <style>
            body { font-family: system-ui, sans-serif; padding: 20mm; color: #000; font-size: 13px; }
            h1, h2, h3, h4 { color: #000; }
            input, select, textarea { border: none !important; border-bottom: 1px solid #000 !important; border-radius: 0 !important; background: transparent !important; padding: 0 !important; font-weight: bold; width: auto !important; appearance: none; -moz-appearance: none; -webkit-appearance: none; }
            .hidden-print { display: none !important; }
            .badge { border: 1px solid #000 !important; border-radius: 4px; padding: 2px 6px; display: inline-block; }
            @media print {
              body { padding: 0; }
              @page { size: A4; margin: 15mm; }
            }
          </style>
        </head>
        <body>
          <h2 style="text-align:center; border-bottom:2px solid #000; padding-bottom:10px; margin-bottom:20px;">
            İTFAİYE OLAY RAPORU (EK-16)
          </h2>
          ${printContents}
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
                    <Input type="datetime-local" name="ihbar_saati" value={formData.ihbar_saati} onChange={handleInputChange} required />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">İstasyondan Çıkış</label>
                    <Input type="datetime-local" name="cikis_saati" value={formData.cikis_saati} onChange={handleInputChange} required />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">Olay Yerine Varış</label>
                    <Input type="datetime-local" name="varis_saati" value={formData.varis_saati} onChange={handleInputChange} required />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">İstasyona Dönüş</label>
                    <Input type="datetime-local" name="donus_saati" value={formData.donus_saati} onChange={handleInputChange} required />
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
                        filteredVehicles.map(v => (
                          <div key={v.plaka} onClick={() => toggleVehicle(v.plaka)} className={`p-2 text-sm rounded-lg cursor-pointer flex items-center justify-between border ${selectedVehicles.includes(v.plaka) ? 'bg-primary/10 border-primary/30 text-primary font-medium' : 'bg-background hover:bg-surface border-transparent'}`}>
                            <span>{v.plaka} <span className="text-xs opacity-60 ml-1">({v.arac_tipi})</span></span>
                            {selectedVehicles.includes(v.plaka) && <CheckCircle2 className="w-4 h-4" />}
                          </div>
                        ))
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
              <Button type="button" onClick={() => setStep(step + 1)}>
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
