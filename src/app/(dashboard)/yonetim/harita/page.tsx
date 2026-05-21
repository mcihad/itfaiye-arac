"use client"

import { useState, useEffect } from "react"
import PageGuard from "@/components/PageGuard"
import dynamic from "next/dynamic"
import { api } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Loader2, Map as MapIcon, Flame, Droplets, Target, Search, Plus, MapPin, X, Sparkles } from "lucide-react"
import { RouteAnalysisPanel } from "@/components/ai/RouteAnalysisPanel"
import { useAuthStore } from "@/lib/authStore"

const Map = dynamic(() => import("@/components/map/Map"), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center bg-surface/50 border rounded-xl border-dashed">
      <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
      <span className="text-sm font-medium text-muted-foreground">Harita Yükleniyor...</span>
    </div>
  )
})

type Incident = any
type Hydrant = any
type NominatimResult = {
  place_id: number
  display_name: string
  lat: string
  lon: string
  type: string
  class: string
}

export default function HaritaPage() {
  const { user } = useAuthStore()
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [hydrants, setHydrants] = useState<Hydrant[]>([])
  const [loading, setLoading] = useState(true)

  // Search Engine State
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [focusLocation, setFocusLocation] = useState<[number, number] | null>(null)
  const [hasFetchedAddress, setHasFetchedAddress] = useState(false)

  // Map Interactivity State
  const [interactionMode, setInteractionMode] = useState<'idle' | 'add_incident' | 'add_hydrant'>('idle')
  
  // Modals Data State
  const [showModal, setShowModal] = useState<'none' | 'incident' | 'hydrant'>('none')
  const [clickedCoords, setClickedCoords] = useState<{lat: number, lng: number} | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Incident Form
  const [incidentForm, setIncidentForm] = useState({ olay_turu: "Ev Yangını", mahalle: "", adres: "" })
  
  // Hydrant Form
  const [hydrantForm, setHydrantForm] = useState({ no: "", tip: "Yer üstü", durum: "Aktif", mahalle: "" })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const { data: incData } = await api.from('incidents').select('*').neq('location', null)
      const { data: hydData } = await api.from('fire_hydrants').select('*')

      if (incData) setIncidents(incData)
      if (hydData) setHydrants(hydData)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateHydrantStatus = async (id: string, newStatus: string) => {
    try {
      const { error } = await api.update('fire_hydrants', { durum: newStatus }, { id })
      if (error) throw error
      
      // Update state locally immediately
      setHydrants(prev => prev.map(hyd => hyd.id === id ? { ...hyd, durum: newStatus } : hyd))
      
      // Log event to audit logs
      fetch('/api/audit-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action_type: 'hydrant_status_change',
          actor_sicil_no: user?.sicilNo || 'unknown',
          actor_name: user ? `${user.ad} ${user.soyad}` : 'Bilinmeyen',
          target: id,
          details: { id, newStatus },
        }),
      }).catch(err => console.error('[AuditLog] Hidrant logu gönderilemedi:', err))

    } catch (error) {
      console.error("Hidrant durumu güncellenirken hata oluştu:", error)
      alert("Hidrant durumu güncellenemedi.")
    }
  }

  // Handle Nominatim (OSM) Search
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!searchQuery.trim() || searchQuery.length < 3) return
    
    setIsSearching(true)
    setHasSearched(false)
    try {
      const searchTerm = encodeURIComponent(`${searchQuery.trim()} Sivas`)
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${searchTerm}&addressdetails=1&limit=5`

      const response = await fetch(url, {
        headers: {
          'Accept-Language': 'tr-TR',
          'User-Agent': 'SivasItfaiyeKomuta/1.0'
        }
      })

      if (!response.ok) throw new Error(`Nominatim API hatası: ${response.status}`)
      
      const data: NominatimResult[] = await response.json()
      setSearchResults(data || [])
      setHasSearched(true)
    } catch (error) {
      console.error("Arama hatası:", error)
      setSearchResults([])
      setHasSearched(true)
    } finally {
      setIsSearching(false)
    }
  }

  // Enter key handler for search input
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSearch()
    }
  }

  const handleSelectAddress = (result: NominatimResult) => {
    const lat = parseFloat(result.lat)
    const lon = parseFloat(result.lon)
    if (!isNaN(lat) && !isNaN(lon)) {
      setFocusLocation([lat, lon])
      setSearchResults([])
      setHasSearched(false)
      setSearchQuery(result.display_name)
    }
  }

  // Map Click Handler
  const handleMapClick = async (lat: number, lng: number) => {
    setClickedCoords({ lat, lng })
    setHasFetchedAddress(false)
    
    let fetchedAddress = ""
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
      const data = await res.json()
      if (data && data.display_name) {
        fetchedAddress = data.display_name
        setHasFetchedAddress(true)
      }
    } catch (e) {
      console.error("Reverse geocoding error:", e)
    }

    if (interactionMode === 'add_incident') {
      setIncidentForm(prev => ({ ...prev, adres: fetchedAddress || "" }))
      setShowModal('incident')
    } else if (interactionMode === 'add_hydrant') {
      setShowModal('hydrant')
    }
    
    // Reset mode back to idle after click
    setInteractionMode('idle')
  }

  // Save to DB
  const handleSaveIncident = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!clickedCoords) return
    setIsSubmitting(true)
    try {
      // WKT format for inserting Point geometry
      const locationWKT = `POINT(${clickedCoords.lng} ${clickedCoords.lat})`
      
      const payload = {
        olay_turu: incidentForm.olay_turu,
        mahalle: incidentForm.mahalle,
        adres: incidentForm.adres,
        location: locationWKT,
        ihbar_saati: new Date().toISOString(),
        cikis_saati: new Date().toISOString(),
        kullanilan_su_ton: 0,
        kullanilan_kopuk_litre: 0,
        kullanilan_kkt_kg: 0
      }

      const { error } = await api.insert('incidents', payload)
      if (error) throw error

      setShowModal('none')
      setIncidentForm({ olay_turu: "Ev Yangını", mahalle: "", adres: "" })
      fetchData() // Refresh map
    } catch (error) {
      console.error(error)
      alert("Kayıt oluşturulurken hata oluştu.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSaveHydrant = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!clickedCoords) return
    setIsSubmitting(true)
    try {
      const locationWKT = `POINT(${clickedCoords.lng} ${clickedCoords.lat})`
      
      const payload = {
        no: hydrantForm.no,
        tip: hydrantForm.tip,
        durum: hydrantForm.durum,
        mahalle: hydrantForm.mahalle,
        location: locationWKT
      }

      const { error } = await api.insert('fire_hydrants', payload)
      if (error) throw error

      setShowModal('none')
      setHydrantForm({ no: "", tip: "Yer üstü", durum: "Aktif", mahalle: "" })
      fetchData() // Refresh map
    } catch (error) {
      console.error(error)
      alert("Kayıt oluşturulurken hata oluştu.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <PageGuard pageId="harita">
      <div className="flex flex-col h-[calc(100vh-8rem)] sm:space-y-4 space-y-2 max-w-[1600px] mx-auto w-full relative px-2 sm:px-0">
      {interactionMode === 'add_incident' && <div className="emergency-glow-overlay" />}
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 shrink-0 z-10 relative">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2"><MapIcon className="w-5 h-5 sm:w-6 sm:h-6 text-primary" /> Komuta Kontrol Haritası</h1>
          <p className="text-muted-foreground text-xs sm:text-sm hidden sm:block">İnteraktif mekansal analiz ve saha yönetimi</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <Button 
            variant={interactionMode === 'add_incident' ? 'default' : 'outline'}
            className={`min-h-[44px] text-xs sm:text-sm ${interactionMode === 'add_incident' ? 'bg-danger hover:bg-danger/90' : 'border-danger/50 text-danger hover:bg-danger/10'}`}
            onClick={() => setInteractionMode(interactionMode === 'add_incident' ? 'idle' : 'add_incident')}
          >
            <Flame className="w-4 h-4 mr-1 sm:mr-2" /> 
            {interactionMode === 'add_incident' ? 'Haritaya Tıklayın...' : 'Yeni Olay'}
          </Button>
          
          <Button 
            variant={interactionMode === 'add_hydrant' ? 'default' : 'outline'}
            className={`min-h-[44px] text-xs sm:text-sm ${interactionMode === 'add_hydrant' ? 'bg-blue-500 hover:bg-blue-600' : 'border-blue-500/50 text-blue-500 hover:bg-blue-500/10'}`}
            onClick={() => setInteractionMode(interactionMode === 'add_hydrant' ? 'idle' : 'add_hydrant')}
          >
            <Droplets className="w-4 h-4 mr-1 sm:mr-2" /> 
            {interactionMode === 'add_hydrant' ? 'Haritaya Tıklayın...' : 'Yeni Hidrant'}
          </Button>

          {interactionMode !== 'idle' && (
            <Button variant="ghost" size="icon" onClick={() => setInteractionMode('idle')} className="text-muted-foreground min-h-[44px] min-w-[44px]" title="İşlemi İptal Et">
              <X className="w-5 h-5" />
            </Button>
          )}
        </div>
      </div>

      <Card className="flex-1 border-border overflow-hidden shadow-md relative">
        <CardContent className="p-0 h-full w-full relative">
          
          {/* Arama Çubuğu (Search Engine) */}
          <div className="absolute top-2 sm:top-4 left-1/2 -translate-x-1/2 z-[400] w-full max-w-md px-3 sm:px-4">
            <form onSubmit={handleSearch} className="relative bg-background rounded-full shadow-lg border flex items-center overflow-hidden">
              <Search className="w-5 h-5 text-muted-foreground ml-4 shrink-0" />
              <input 
                type="text" 
                placeholder="Sivas içi Mahalle, Sokak veya Cadde Ara..." 
                className="w-full bg-transparent border-none focus:outline-none focus:ring-0 px-3 py-3 text-sm"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setHasSearched(false) }}
                onKeyDown={handleSearchKeyDown}
              />
              <Button type="button" variant="ghost" className="rounded-full mr-1 h-11 w-11 sm:h-10 sm:w-10 p-0 shrink-0" onClick={() => handleSearch()}>
                {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </form>

            {/* Yükleniyor durumu */}
            {isSearching && (
              <div className="absolute top-full left-4 right-4 mt-2 bg-background border shadow-xl rounded-xl overflow-hidden animate-in slide-in-from-top-2">
                <div className="flex items-center justify-center gap-2 px-4 py-4">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Aranıyor...</span>
                </div>
              </div>
            )}

            {/* Arama Sonuçları Modal/Dropdown */}
            {!isSearching && searchResults.length > 0 && (
              <div className="absolute top-full left-4 right-4 mt-2 bg-background border shadow-xl rounded-xl overflow-hidden max-h-64 overflow-y-auto animate-in slide-in-from-top-2">
                <div className="flex items-center justify-between px-3 py-2 border-b bg-surface/50">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Arama Sonuçları ({searchResults.length})</span>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => { setSearchResults([]); setHasSearched(false) }}>Kapat</Button>
                </div>
                {searchResults.map(res => (
                  <div 
                    key={res.place_id} 
                    className="px-4 py-3 hover:bg-surface cursor-pointer border-b last:border-0 transition-colors"
                    onClick={() => handleSelectAddress(res)}
                  >
                    <div className="font-medium text-sm flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="line-clamp-2">{res.display_name}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Sonuç bulunamadı geri bildirimi */}
            {!isSearching && hasSearched && searchResults.length === 0 && (
              <div className="absolute top-full left-4 right-4 mt-2 bg-background border shadow-xl rounded-xl overflow-hidden animate-in slide-in-from-top-2">
                <div className="flex flex-col items-center justify-center gap-1 px-4 py-4">
                  <Search className="w-5 h-5 text-muted-foreground/50" />
                  <span className="text-sm font-medium text-muted-foreground">Sonuç bulunamadı</span>
                  <span className="text-xs text-muted-foreground/70">Farklı bir mahalle veya sokak adı deneyin</span>
                </div>
              </div>
            )}
          </div>

          {/* Harita Katman ve Bilgi Kontrolü */}
          {/* AI Rota Analizi Paneli */}
          <RouteAnalysisPanel stationLocation="Sivas İtfaiye Müdürlüğü, Merkez" />

          <div className="absolute bottom-20 right-4 z-[400] flex-col gap-2 pointer-events-none hidden sm:flex">
            <div className="bg-background/90 backdrop-blur-md border shadow-lg rounded-xl p-3 space-y-2 w-48 pointer-events-auto">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b pb-1 mb-2">Canlı Katmanlar</h3>
              
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium flex items-center gap-2"><Flame className="w-4 h-4 text-danger" /> Vakalar</span>
                <Badge variant="outline" className="bg-danger/10 text-danger border-none">{incidents.length}</Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium flex items-center gap-2"><Droplets className="w-4 h-4 text-blue-500" /> Hidrantlar</span>
                <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-none">{hydrants.length}</Badge>
              </div>
            </div>
          </div>

          <Map 
            incidents={incidents} 
            hydrants={hydrants} 
            mode={interactionMode} 
            onMapClick={handleMapClick} 
            focusLocation={focusLocation}
            onUpdateHydrantStatus={handleUpdateHydrantStatus}
          />
          
        </CardContent>
      </Card>

      {/* ========================================================= */}
      {/* İNTERAKTİF İŞARETLEME (PIN DROPPING) FORMLARI / MODALLAR  */}
      {/* ========================================================= */}
      
      {showModal === 'incident' && (
        <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in">
          <Card className="w-full sm:max-w-md shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 rounded-t-2xl sm:rounded-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b px-4 sm:px-6 py-3 sm:py-4">
              <h2 className="text-base sm:text-lg font-bold flex items-center gap-2"><Flame className="w-5 h-5 text-danger" /> Olay İşaretle</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowModal('none')} className="min-h-[44px] min-w-[44px]"><X className="w-4 h-4" /></Button>
            </div>
            <form onSubmit={handleSaveIncident} className="p-4 sm:p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold">Olay Türü</label>
                <select name="olay_turu" value={incidentForm.olay_turu} onChange={(e) => setIncidentForm({...incidentForm, olay_turu: e.target.value})} required className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
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
                  </optgroup>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">Mahalle</label>
                <Input value={incidentForm.mahalle} onChange={(e) => setIncidentForm({...incidentForm, mahalle: e.target.value})} required placeholder="Örn: Alibaba" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold flex items-center justify-between w-full">
                  <span>Adres / Detay</span>
                  {hasFetchedAddress && (
                    <span className="flex items-center gap-1 text-[10px] sm:text-xs text-blue-500 font-medium bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                      <Sparkles className="w-3 h-3" />
                      Yapay Zeka Tarafından Doğrulandı
                    </span>
                  )}
                </label>
                <Input value={incidentForm.adres} onChange={(e) => setIncidentForm({...incidentForm, adres: e.target.value})} required placeholder="Sokak, Bina detayları..." />
              </div>
              
              <div className="text-xs text-muted-foreground font-mono bg-surface p-2 rounded border mt-4">
                Seçilen Konum: {clickedCoords?.lat.toFixed(6)}, {clickedCoords?.lng.toFixed(6)}
              </div>

              <div className="pt-4 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowModal('none')}>İptal</Button>
                <Button type="submit" className="bg-danger hover:bg-danger/90 text-white" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <MapPin className="w-4 h-4 mr-2" />}
                  Haritaya Kaydet
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {showModal === 'hydrant' && (
        <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in">
          <Card className="w-full sm:max-w-md shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 rounded-t-2xl sm:rounded-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b px-4 sm:px-6 py-3 sm:py-4">
              <h2 className="text-base sm:text-lg font-bold flex items-center gap-2"><Droplets className="w-5 h-5 text-blue-500" /> Yangın Hidrantı Ekle</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowModal('none')} className="min-h-[44px] min-w-[44px]"><X className="w-4 h-4" /></Button>
            </div>
            <form onSubmit={handleSaveHydrant} className="p-4 sm:p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold">Hidrant / Şube No</label>
                <Input value={hydrantForm.no} onChange={(e) => setHydrantForm({...hydrantForm, no: e.target.value})} required placeholder="Örn: H-128" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Tip</label>
                  <select value={hydrantForm.tip} onChange={(e) => setHydrantForm({...hydrantForm, tip: e.target.value})} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                    <option value="Yer üstü">Yer üstü</option>
                    <option value="Yer altı">Yer altı</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Durum</label>
                  <select value={hydrantForm.durum} onChange={(e) => setHydrantForm({...hydrantForm, durum: e.target.value})} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                    <option value="Aktif">Aktif</option>
                    <option value="Arızalı">Arızalı</option>
                    <option value="Bakımda">Bakımda</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">Bulunduğu Mahalle</label>
                <Input value={hydrantForm.mahalle} onChange={(e) => setHydrantForm({...hydrantForm, mahalle: e.target.value})} required placeholder="Örn: Esentepe" />
              </div>
              
              <div className="text-xs text-muted-foreground font-mono bg-surface p-2 rounded border mt-4">
                Seçilen Konum: {clickedCoords?.lat.toFixed(6)}, {clickedCoords?.lng.toFixed(6)}
              </div>

              <div className="pt-4 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowModal('none')}>İptal</Button>
                <Button type="submit" className="bg-blue-500 hover:bg-blue-600 text-white" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                  Sisteme Ekle
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
