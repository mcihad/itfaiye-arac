"use client"

import { useState, useEffect, useRef, Suspense, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import PageGuard from "@/components/PageGuard"
import dynamic from "next/dynamic"
import { api, unwrap } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Loader2, Map as MapIcon, Flame, Droplets, Target, Search, Plus, MapPin, X, Sparkles } from "lucide-react"
import { useAuthStore } from "@/lib/authStore"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/Dialog"

const Map = dynamic(() => import("@/components/map/Map"), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center bg-surface/50 border rounded-xl border-dashed">
      <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
      <span className="text-sm font-medium text-muted-foreground">Harita Yükleniyor...</span>
    </div>
  )
}) as any

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

// ─── PostGIS WKB parser helpers for real-time focus ─────────
const parseWKBPoint = (wkbHex: string): [number, number] | null => {
  if (!wkbHex || typeof wkbHex !== 'string') return null
  const cleanHex = wkbHex.trim()
  if (cleanHex.length < 42) return null
  
  const isLittleEndian = cleanHex.substring(0, 2) === '01'
  const type = cleanHex.substring(2, 10)
  
  let coordsHex = ''
  if (type === '01000020' || type === '20000001') {
    coordsHex = cleanHex.substring(18)
  } else if (type === '01000000' || type === '00000001') {
    coordsHex = cleanHex.substring(10)
  } else {
    if (cleanHex.length === 50) {
      coordsHex = cleanHex.substring(18)
    } else if (cleanHex.length === 42) {
      coordsHex = cleanHex.substring(10)
    } else {
      return null
    }
  }

  if (coordsHex.length < 32) return null

  const xHex = coordsHex.substring(0, 16)
  const yHex = coordsHex.substring(16, 32)

  const hexToDouble = (hexStr: string): number => {
    const bytes = new Uint8Array(8)
    for (let i = 0; i < 8; i++) {
      const byteHex = hexStr.substring(i * 2, i * 2 + 2)
      bytes[isLittleEndian ? i : 7 - i] = parseInt(byteHex, 16)
    }
    const view = new DataView(bytes.buffer)
    return view.getFloat64(0, true)
  }

  const x = hexToDouble(xHex)
  const y = hexToDouble(yHex)

  return [x, y]
}

const parseLocation = (loc: any): [number, number] | null => {
  if (!loc) return null
  if (typeof loc === 'string') {
    const trimmed = loc.trim()
    if (/^[0-9a-fA-F]+$/.test(trimmed)) {
      const parsed = parseWKBPoint(trimmed)
      if (parsed) return parsed
    }
    try {
      const parsed = JSON.parse(loc)
      if (parsed.coordinates) {
        return [parsed.coordinates[0], parsed.coordinates[1]]
      }
    } catch {
      return null
    }
  }
  if (loc.coordinates) {
    return [loc.coordinates[0], loc.coordinates[1]]
  }
  return null
}

// Türkçe karakterleri her ortamda (locale desteği eksik sunucularda dahi) doğru şekilde büyük harfe dönüştüren yardımcı fonksiyon
function toTurkishUpperCase(str: string): string {
  const map: { [key: string]: string } = {
    'i': 'İ',
    'ı': 'I',
    'ş': 'Ş',
    'ğ': 'Ğ',
    'ç': 'Ç',
    'ö': 'Ö',
    'ü': 'Ü'
  };
  return str.split('').map(char => map[char] || char.toUpperCase()).join('');
}

// Plaka normalizasyonu (İ/I uyuşmazlıklarını çözer)
export const normalizePlate = (p: string) => {
  if (!p) return ''
  return p.replace(/\s+/g, '')
    .replace(/İ/g, 'I')
    .replace(/i/g, 'I')
    .replace(/ı/g, 'I')
    .toUpperCase()
}

function HaritaContent() {
  const { user } = useAuthStore()
  const searchParams = useSearchParams()
  const incidentId = searchParams.get('incidentId')
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [hydrants, setHydrants] = useState<Hydrant[]>([])
  const [vehicles, setVehicles] = useState<any[]>([])
  const [personnelList, setPersonnelList] = useState<any[]>([])
  const [externalMissions, setExternalMissions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showPersonnelLayer, setShowPersonnelLayer] = useState(true)
  const [isSimulation, setIsSimulation] = useState(false)
  const [simulationReason, setSimulationReason] = useState<string | undefined>(undefined)

  // Search Engine State
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [focusLocation, setFocusLocation] = useState<[number, number] | null>(null)
  const [hasFetchedAddress, setHasFetchedAddress] = useState(false)

  // Map Interactivity State
  const [interactionMode, setInteractionMode] = useState<'idle' | 'add_incident' | 'add_hydrant' | 'add_external_mission'>('idle')
  
  // Modals Data State
  const [showModal, setShowModal] = useState<'none' | 'incident' | 'hydrant' | 'mufreze_cikis' | 'external_mission'>('none')
  const [clickedCoords, setClickedCoords] = useState<{lat: number, lng: number} | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Incident Form & Dispatch States
  const [incidentForm, setIncidentForm] = useState({ olay_turu: "Ev Yangını", mahalle: "", adres: "" })
  const [activeIncidentId, setActiveIncidentId] = useState<string | null>(null)
  const [selectedVehiclePlakas, setSelectedVehiclePlakas] = useState<string[]>([])
  const [checkedPersonnel, setCheckedPersonnel] = useState<string[]>([])
  const [personnelSearch, setPersonnelSearch] = useState("")
  
  // Hydrant Form
  const [hydrantForm, setHydrantForm] = useState({ no: "", tip: "Yer üstü", durum: "Aktif", mahalle: "" })

  // External Mission Form
  const [externalMissionForm, setExternalMissionForm] = useState({
    gorev_turu: "Sosyal Görev",
    baslik: "",
    detay: "",
    mahalle: "",
    adres: "",
    tahmini_donus_saat: "2",
    plaka: ""
  })
  const [checkedExternalPersonnel, setCheckedExternalPersonnel] = useState<string[]>([])
  const [externalPersonnelSearch, setExternalPersonnelSearch] = useState("")

  // Camera Integration State
  const [cameraModalOpen, setCameraModalOpen] = useState(false)
  const [cameraVehicle, setCameraVehicle] = useState<{ id: string, plate: string } | null>(null)
  const [cameraIps, setCameraIps] = useState<string[]>([])
  const [loadingCamera, setLoadingCamera] = useState(false)
  const [activeChannelIndex, setActiveChannelIndex] = useState(0)

  // ─── İnteraktif Adres Arama (Geocoding) State ─────────
  const [incidentSearchQuery, setIncidentSearchQuery] = useState("")
  const [incidentSearchResults, setIncidentSearchResults] = useState<NominatimResult[]>([])
  const [isIncidentSearching, setIsIncidentSearching] = useState(false)
  const [hasIncidentSearched, setHasIncidentSearched] = useState(false)
  const incidentSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─── Nöbetçi Posta & Personel Hesaplama ───────────────────
  const activePostaNumber = useMemo(() => {
    const referenceDate = new Date("2026-06-04");
    referenceDate.setHours(0, 0, 0, 0);

    const today = new Date();
    // Nöbet değişimi 08:00'dedir. Saat 08:00'den önce ise önceki güne aittir.
    if (today.getHours() < 8) {
      today.setDate(today.getDate() - 1);
    }
    today.setHours(0, 0, 0, 0);

    const diffTime = today.getTime() - referenceDate.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    const index = ((1 + (diffDays % 3) + 3) % 3) + 1;
    return index;
  }, []);

  const activePostaPersonnel = useMemo(() => {
    return personnelList.filter(p => {
      const isIdari = ['Müdür', 'Amir', 'Baş Şoför', 'Eğitim Çavuşu'].includes(p.unvan || '');
      return p.posta_no === activePostaNumber && p.aktif !== false && !isIdari;
    });
  }, [personnelList, activePostaNumber]);

  const sortedMufrezePersonnel = useMemo(() => {
    const activeStations = vehicles
      .filter(v => selectedVehiclePlakas.includes(v.plaka))
      .map(v => v.istasyon || "")
      .filter(Boolean)
      .map(s => s.toLowerCase().split(' ')[0]);
    
    return [...activePostaPersonnel].sort((a, b) => {
      const stationA = (a.istasyon || '').toLowerCase().split(' ')[0];
      const stationB = (b.istasyon || '').toLowerCase().split(' ')[0];
      
      const matchA = activeStations.includes(stationA);
      const matchB = activeStations.includes(stationB);
      
      if (matchA !== matchB) {
        return matchA ? -1 : 1;
      }
      return (a.ad || '').localeCompare(b.ad || '', 'tr');
    });
  }, [activePostaPersonnel, selectedVehiclePlakas, vehicles]);

  const filteredPersonnel = useMemo(() => {
    if (!personnelSearch.trim()) return sortedMufrezePersonnel;
    const q = toTurkishUpperCase(personnelSearch.trim());
    return sortedMufrezePersonnel.filter(p => {
      const fullName = toTurkishUpperCase(`${p.ad || ''} ${p.soyad || ''}`);
      const sicil = toTurkishUpperCase(p.sicil_no || '');
      return fullName.includes(q) || sicil.includes(q);
    });
  }, [sortedMufrezePersonnel, personnelSearch]);

  const filteredExternalPersonnel = useMemo(() => {
    const sorted = [...activePostaPersonnel].sort((a, b) => (a.ad || '').localeCompare(b.ad || '', 'tr'));
    if (!externalPersonnelSearch.trim()) return sorted;
    const q = toTurkishUpperCase(externalPersonnelSearch.trim());
    return sorted.filter(p => {
      const fullName = toTurkishUpperCase(`${p.ad || ''} ${p.soyad || ''}`);
      const sicil = toTurkishUpperCase(p.sicil_no || '');
      return fullName.includes(q) || sicil.includes(q);
    });
  }, [activePostaPersonnel, externalPersonnelSearch]);

  useEffect(() => {
    fetchData()

    // ─── Real-Time Canlı Vaka & Araç Takip Polling Dinleyicisi ─────────
    const intervalId = setInterval(async () => {
      try {
        const res = await fetch('/api/harita-canli-vaka')
        const data = await res.json()
        if (data.success && data.incidents) {
          const newIncidents = data.incidents as Incident[]
          
          setIncidents(prev => {
            const currentIds = new Set(prev.map(i => String(i.id)))
            let newlyDetectedIncident: Incident | null = null
            
            for (const inc of newIncidents) {
              if (!currentIds.has(String(inc.id))) {
                newlyDetectedIncident = inc
                break
              }
            }
            
            if (newlyDetectedIncident) {
              const coords = parseLocation(newlyDetectedIncident.location)
              if (coords) {
                // Focus on new incident: [lat, lng] -> [coords[1], coords[0]]
                setFocusLocation([coords[1], coords[0]])
                console.log('[Real-Time] Yeni Vaka Tespit Edildi, Odaklanılıyor:', newlyDetectedIncident)
              }
            }
            
            return newIncidents
          })
        }
      } catch (err) {
        console.warn('[Real-Time] Canlı vaka sorgulama hatası:', err)
      }

      try {
        const resVeh = await fetch(`/api/mobiliz/live?t=${Date.now()}`);
        let camMap: Record<string, any> = {}; 
        
        /* N2 Mobil şimdilik iptal edildi
        const [resVeh, resCamVeh] = await Promise.all([
          fetch(`/api/mobiliz/live?t=${Date.now()}`),
          fetch(`/api/n2mobil/live?t=${Date.now()}`)
        ]);
        if (resCamVeh.ok) {
          const dataCam = await resCamVeh.json();
          if (dataCam?.vehicles) {
            dataCam.vehicles.forEach((v: any) => {
              if (v.plate && v.vehicle_id) camMap[normalizePlate(v.plate)] = v.vehicle_id;
            });
          }
        }
        */

        if (resVeh.ok) {
          const dataVeh = await resVeh.json()
          if (dataVeh && dataVeh.success && Array.isArray(dataVeh.vehicles)) {
            setIsSimulation(dataVeh.mode === 'simulation')
            setSimulationReason(dataVeh.fallbackReason)
            setVehicles(prevVehicles => {
              const liveMap: Record<string, any> = {}
              dataVeh.vehicles.forEach((v: any) => {
                if (v.plate) {
                  const normKey = normalizePlate(v.plate)
                  liveMap[normKey] = v
                }
              })
              return prevVehicles.map((v: any) => {
                const normKey = normalizePlate(v.plaka)
                const live = liveMap[normKey]
                const camId = camMap[normKey] || v.vehicle_id
                if (live) {
                  return {
                    ...v,
                    enlem: live.latitude,
                    boylam: live.longitude,
                    latitude: live.latitude,
                    longitude: live.longitude,
                    hiz: live.speed,
                    kontak: live.ignition,
                    yon: live.direction,
                    sonGuncelleme: live.dataTime,
                    address: live.address,
                    vehicle_id: camId
                  }
                }
                return { ...v, vehicle_id: camId }
              })
            })
          }
        }
      } catch (err) {
        console.warn('[Real-Time] Canlı araç takip sorgulama hatası:', err)
      }
    }, 5000) // 5 saniyede bir sorgula

    return () => clearInterval(intervalId)
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const { data: incData } = await api.from('incidents').select('*').neq('location', null)
      const { data: hydData } = await api.from('fire_hydrants').select('*')
      const { data: vehData } = await api.from('vehicles').select('*')
      const { data: persData } = await api.from('personnel').select('*').eq('aktif', true)
      const { data: extData } = await api.from('external_missions').select('*')

      let initialVehicles = vehData || []

      try {
        const resVeh = await fetch(`/api/mobiliz/live?t=${Date.now()}`);
        let camMap: Record<string, any> = {};

        /* N2 Mobil şimdilik iptal edildi
        const [resVeh, resCamVeh] = await Promise.all([
          fetch(`/api/mobiliz/live?t=${Date.now()}`),
          fetch(`/api/n2mobil/live?t=${Date.now()}`)
        ]);
        if (resCamVeh.ok) {
          const dataCam = await resCamVeh.json();
          if (dataCam?.vehicles) {
            dataCam.vehicles.forEach((v: any) => {
              if (v.plate && v.vehicle_id) camMap[normalizePlate(v.plate)] = v.vehicle_id;
            });
          }
        }
        */

        if (resVeh.ok) {
          const dataVeh = await resVeh.json()
          if (dataVeh && dataVeh.success && Array.isArray(dataVeh.vehicles)) {
            setIsSimulation(dataVeh.mode === 'simulation')
            setSimulationReason(dataVeh.fallbackReason)
            const liveMap: Record<string, any> = {}
            dataVeh.vehicles.forEach((v: any) => {
              if (v.plate) {
                const normKey = normalizePlate(v.plate)
                liveMap[normKey] = v
              }
            })
            initialVehicles = initialVehicles.map((v: any) => {
              const normKey = normalizePlate(v.plaka)
              const live = liveMap[normKey]
              const camId = camMap[normKey] || v.vehicle_id
              if (live) {
                return {
                  ...v,
                  enlem: live.latitude,
                  boylam: live.longitude,
                  latitude: live.latitude,
                  longitude: live.longitude,
                  hiz: live.speed,
                  kontak: live.ignition,
                  yon: live.direction,
                  sonGuncelleme: live.dataTime,
                  address: live.address,
                  vehicle_id: camId
                }
              }
              return { ...v, vehicle_id: camId }
            })
          }
        }
      } catch (err) {
        console.warn('[Initial Load] Canlı araç takip sorgulama hatası:', err)
      }

      if (incData) setIncidents(incData)
      if (hydData) setHydrants(hydData)
      if (initialVehicles) setVehicles(initialVehicles)

      // ─── Posta Devir Filtresi (08:00) ───────────────────
      // Sadece aktif nöbet dönemindeki görevler haritada gösterilir.
      // Posta devri saat 08:00'da gerçekleşir; bu saatten sonra
      // bir önceki nöbetin görevleri otomatik olarak haritadan kalkar.
      const getShiftStart = (): Date => {
        const now = new Date()
        const shiftStart = new Date(now)
        shiftStart.setHours(8, 0, 0, 0)
        // Eğer şu an saat 08:00'dan önceyse, nöbet dünden başlamıştır
        if (now.getHours() < 8) {
          shiftStart.setDate(shiftStart.getDate() - 1)
        }
        return shiftStart
      }

      const shiftStart = getShiftStart()

      const filterByShift = (missions: any[]): any[] => {
        return missions.filter((m: any) => {
          // Eğer görev tamamlanmamış veya iptal edilmemişse (yani aktifse), haritada kalmalıdır.
          if (m.durum !== 'Tamamlandı' && m.durum !== 'iptal') return true;
          // Tamamlanan/iptal edilen görevler ise sadece bu nöbet vardiyasında (shiftStart sonrasında) yapılmışsa kalabilir.
          const missionDate = new Date(m.cikis_tarihi || m.created_at)
          return missionDate >= shiftStart
        })
      }

      if (persData) {
        setPersonnelList(persData)
        if (extData) {
          const persMap: Record<string, string> = {}
          persData.forEach((p: any) => {
            persMap[p.sicil_no] = `${p.ad} ${p.soyad}`
          })
          const filteredExt = filterByShift(extData)
          const enrichedExt = filteredExt.map((m: any) => {
            const names = (m.sicil_nos || [])
              .map((s: string) => persMap[s] || s)
              .join(', ')
            return {
              ...m,
              personnel_names: names || m.sicil_no || '-'
            }
          })
          setExternalMissions(enrichedExt)
        }
      } else {
        if (extData) setExternalMissions(filterByShift(extData))
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleCompleteExternalMission = async (id: string) => {
    if (!confirm("Bu dış görevi sonlandırmak istediğinize emin misiniz?")) return
    try {
      const { error } = await api.update('external_missions', { durum: 'Tamamlandı' }, { id })
      if (error) throw error
      alert("Görev başarıyla sonlandırıldı.")
      fetchData()
    } catch (err: any) {
      console.error(err)
      alert("Görev sonlandırılırken hata oluştu: " + err.message)
    }
  }

  // Focus on incident if incidentId is passed in URL query params
  useEffect(() => {
    if (incidentId && incidents.length > 0) {
      const targetInc = incidents.find(i => String(i.id) === String(incidentId))
      if (targetInc) {
        const coords = parseLocation(targetInc.location)
        if (coords) {
          // Focus on target incident: [lat, lng] -> [coords[1], coords[0]]
          setFocusLocation([coords[1], coords[0]])
          console.log('[URL Param] Fokuslanılan Vaka:', targetInc)
        }
      }
    }
  }, [incidentId, incidents])

  const handleUpdateHydrantStatus = async (id: string, newStatus: string) => {
    try {
      const { error } = await api.update('fire_hydrants', { durum: newStatus }, { id })
      if (error) throw error
      
      // Update state locally immediately
      setHydrants(prev => prev.map(hyd => hyd.id === id ? { ...hyd, durum: newStatus } : hyd))
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

  // ─── İnteraktif Adres Arama (Geocoding) - İhbar Formu İçi ────────
  const handleIncidentSearch = async (query: string) => {
    if (!query.trim() || query.trim().length < 3) {
      setIncidentSearchResults([])
      setHasIncidentSearched(false)
      return
    }
    
    setIsIncidentSearching(true)
    setHasIncidentSearched(false)
    try {
      const searchTerm = encodeURIComponent(`${query.trim()} Sivas`)
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${searchTerm}&addressdetails=1&limit=5`
      const response = await fetch(url, {
        headers: {
          'Accept-Language': 'tr-TR',
          'User-Agent': 'SivasItfaiyeKomuta/1.0'
        }
      })
      if (!response.ok) throw new Error(`Nominatim API hatası: ${response.status}`)
      const data: NominatimResult[] = await response.json()
      setIncidentSearchResults(data || [])
      setHasIncidentSearched(true)
    } catch (error) {
      console.error('[Geocoding] İhbar arama hatası:', error)
      setIncidentSearchResults([])
      setHasIncidentSearched(true)
    } finally {
      setIsIncidentSearching(false)
    }
  }

  const handleIncidentSearchInput = (value: string) => {
    setIncidentSearchQuery(value)
    setHasIncidentSearched(false)
    
    // Debounce: 400ms sonra otomatik arama tetikle
    if (incidentSearchTimerRef.current) {
      clearTimeout(incidentSearchTimerRef.current)
    }
    incidentSearchTimerRef.current = setTimeout(() => {
      handleIncidentSearch(value)
    }, 400)
  }

  const handleIncidentSelectAddress = (result: NominatimResult) => {
    const lat = parseFloat(result.lat)
    const lon = parseFloat(result.lon)
    if (!isNaN(lat) && !isNaN(lon)) {
      // 1. Harita kamerasını sinematik flyTo ile odakla
      setFocusLocation([lat, lon])
      // 2. Koordinatları formun lat/lng alanına yaz
      setClickedCoords({ lat, lng: lon })
      // 3. Adres alanını otomatik doldur
      setIncidentForm(prev => ({ ...prev, adres: result.display_name }))
      setHasFetchedAddress(true)
      // 4. Arama sonuçlarını temizle
      setIncidentSearchResults([])
      setHasIncidentSearched(false)
      setIncidentSearchQuery(result.display_name.split(',')[0] || '')
    }
  }

  // Map Click Handler
  const handleMapClick = async (lat: number, lng: number) => {
    setClickedCoords({ lat, lng })
    setHasFetchedAddress(false)
    
    let fetchedAddress = ""
    let fetchedMahalle = ""
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
      const data = await res.json()
      if (data) {
        fetchedAddress = data.display_name || ""
        if (data.address) {
          fetchedMahalle = data.address.suburb || data.address.neighbourhood || data.address.village || data.address.quarter || data.address.district || ""
          fetchedMahalle = fetchedMahalle.replace(/\s*Mahallesi$/i, "").trim()
        }
        setHasFetchedAddress(true)
      }
    } catch (e) {
      console.error("Reverse geocoding error:", e)
    }

    if (interactionMode === 'add_incident') {
      try {
        const locationWKT = `POINT(${lng} ${lat})`
        const draftPayload = {
          olay_turu: "Müfreze Çıkışı (Hazırlanıyor)",
          mahalle: fetchedMahalle || "Alibaba",
          adres: fetchedAddress || "İhbar Konumu",
          location: locationWKT,
          ihbar_saati: new Date().toISOString(),
          cikis_saati: new Date().toISOString(),
          status: "active",
          kullanilan_su_ton: 0,
          kullanilan_kopuk_litre: 0,
          kullanilan_kkt_kg: 0
        }
        const res = await api.insert('incidents', draftPayload)
        if (res && res.data) {
          const insertedRow = Array.isArray(res.data) ? res.data[0] : res.data
          if (insertedRow && insertedRow.id) {
            setActiveIncidentId(insertedRow.id)
            setIncidentForm({
              olay_turu: "Ev Yangını",
              mahalle: fetchedMahalle || "Alibaba",
              adres: fetchedAddress || "İhbar Konumu"
            })
            
            // Auto-select first active vehicle if available
            if (vehicles.length > 0) {
              const activeVeh = vehicles.find(v => (v.durum || '').toLowerCase() === 'aktif') || vehicles[0]
              setSelectedVehiclePlakas([activeVeh.plaka])
              
              // Filter personnel of the same station
              const station = activeVeh.istasyon || ""
              const defChecked = personnelList
                .filter(p => {
                  const isIdari = ['Müdür', 'Amir', 'Baş Şoför', 'Eğitim Çavuşu'].includes(p.unvan || '');
                  return p.posta_no === activePostaNumber && p.aktif !== false && !isIdari;
                })
                .filter(p => {
                  if (!station) return true
                  const vStationWord = station.toLowerCase().split(' ')[0]
                  const pStationWord = (p.istasyon || '').toLowerCase().split(' ')[0]
                  return vStationWord === pStationWord
                })
                .map(p => p.sicil_no)
              setCheckedPersonnel(defChecked)
            } else {
              setSelectedVehiclePlakas([])
              setCheckedPersonnel([])
            }
            
            setShowModal('mufreze_cikis')
          }
        }
      } catch (err) {
        console.error("Draft incident creation error:", err)
        alert("Konum işaretlenirken hata oluştu.")
      }
    } else if (interactionMode === 'add_hydrant') {
      setShowModal('hydrant')
    } else if (interactionMode === 'add_external_mission') {
      setExternalMissionForm({
        gorev_turu: "Sosyal Görev",
        baslik: "",
        detay: "",
        mahalle: fetchedMahalle || "Alibaba",
        adres: fetchedAddress || "Dış Görev Konumu",
        tahmini_donus_saat: "2",
        plaka: vehicles.length > 0 ? vehicles[0].plaka : ""
      })
      setCheckedExternalPersonnel([])
      setExternalPersonnelSearch("")
      setShowModal('external_mission')
    }
    
    // Reset mode back to idle after click
    setInteractionMode('idle')
  }

  const handleVehicleToggle = (plaka: string, checked: boolean) => {
    let newPlakas: string[] = []
    if (checked) {
      newPlakas = [...selectedVehiclePlakas, plaka]
    } else {
      newPlakas = selectedVehiclePlakas.filter(p => p !== plaka)
    }
    setSelectedVehiclePlakas(newPlakas)

    // Auto-update personnel based on matching stations of selected vehicles
    const stations = vehicles
      .filter(v => newPlakas.includes(v.plaka))
      .map(v => v.istasyon || "")
      .filter(Boolean)
    const stationWords = stations.map(s => s.toLowerCase().split(' ')[0])

    const defChecked = activePostaPersonnel
      .filter(p => {
        if (stationWords.length === 0) return false
        const pStationWord = (p.istasyon || '').toLowerCase().split(' ')[0]
        return stationWords.includes(pStationWord)
      })
      .map(p => p.sicil_no)
    setCheckedPersonnel(defChecked)
  }

  const handleSaveMufrezeCikis = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeIncidentId) return
    setIsSubmitting(true)
    try {
      const payload = {
        olay_turu: incidentForm.olay_turu,
        mahalle: incidentForm.mahalle,
        adres: incidentForm.adres,
        ek16_araclar: JSON.stringify(selectedVehiclePlakas),
        ek16_personel: JSON.stringify(checkedPersonnel),
        cikis_saati: new Date().toISOString()
      }

      const { error: updErr } = await api.update('incidents', payload, { id: activeIncidentId })
      if (updErr) throw updErr

      // Delete existing vehicles and personnel linkages first to prevent unique constraint violations
      // (unwrap: silme veya yeniden ekleme başarısız olursa işlem hatayla durur —
      // eskiden sessizce yutulup olayın araç/personel bağı kaybolabiliyordu)
      await Promise.all([
        api.remove('incident_vehicles', { incident_id: activeIncidentId }).then(unwrap),
        api.remove('incident_personnel', { incident_id: activeIncidentId }).then(unwrap)
      ]);

      // Link vehicles to incident
      if (selectedVehiclePlakas.length > 0) {
        const vPayload = selectedVehiclePlakas.map(plaka => ({
          incident_id: activeIncidentId,
          plaka,
          gorev_turu: "Müdahale Aracı"
        }))
        unwrap(await api.insert('incident_vehicles', vPayload))
      }

      // Link personnel to incident
      if (checkedPersonnel.length > 0) {
        const pPayload = checkedPersonnel.map(sicil_no => ({
          incident_id: activeIncidentId,
          sicil_no,
          gorev: "Müdahale Personeli"
        }))
        unwrap(await api.insert('incident_personnel', pPayload))
      }

      // SMS Tetikleme (Müfreze Çıkışı başlatıldığında)
      try {
        await fetch('/api/sms/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'incident',
            missionType: payload.olay_turu,
            missionTitle: payload.olay_turu,
            missionAddress: payload.adres,
            detail: "Müfreze Çıkışı Başlatıldı"
          })
        })
      } catch (smsErr) {
        console.error("Müfreze Çıkışı SMS gonderilemedi:", smsErr)
      }

      setShowModal('none')
      setActiveIncidentId(null)
      setPersonnelSearch("")
      fetchData() // Refresh map data
    } catch (err) {
      console.error("Mufreze cikis error:", err)
      alert("Müfreze çıkış kaydı oluşturulurken hata oluştu.")
    } finally {
      setIsSubmitting(false)
    }
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

      // Hızlı ihbarda SMS Tetikleme
      try {
        await fetch('/api/sms/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'incident',
            missionType: payload.olay_turu,
            missionTitle: payload.olay_turu,
            missionAddress: payload.adres,
            detail: "Hızlı Olay/İhbar"
          })
        })
      } catch (smsErr) {
        console.error("Hızlı Olay SMS gonderilemedi:", smsErr)
      }

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

  const handleOpenCamera = async (vehicleId: string, plate: string) => {
    setCameraVehicle({ id: vehicleId, plate })
    setCameraIps([])
    setActiveChannelIndex(0)
    setLoadingCamera(true)
    setCameraModalOpen(true)
    try {
      const res = await fetch(`/api/n2mobil/camera?vehicle_id=${vehicleId}`)
      if (res.ok) {
        const data = await res.json()
        if (data.status && data.devIp) {
          setCameraIps(data.devIp)
        }
      }
    } catch (err) {
      console.error("Camera fetch error:", err)
    } finally {
      setLoadingCamera(false)
    }
  }

  const handleDeleteIncident = (id: string) => {
    setIncidents(prev => prev.filter(inc => String(inc.id) !== String(id)))
  }

  const handleEditIncident = async (incident: Incident) => {
    setActiveIncidentId(incident.id)
    setIncidentForm({
      olay_turu: incident.olay_turu || "Ev Yangını",
      mahalle: incident.mahalle || "",
      adres: incident.adres || ""
    })

    try {
      // Fetch currently linked vehicles
      const { data: vData } = await api.from('incident_vehicles')
        .select('plaka')
        .eq('incident_id', incident.id)
      
      if (vData && Array.isArray(vData)) {
        setSelectedVehiclePlakas(vData.map(v => v.plaka))
      } else {
        setSelectedVehiclePlakas([])
      }

      // Fetch currently linked personnel
      const { data: pData } = await api.from('incident_personnel')
        .select('sicil_no')
        .eq('incident_id', incident.id)

      if (pData && Array.isArray(pData)) {
        setCheckedPersonnel(pData.map(p => p.sicil_no))
      } else {
        setCheckedPersonnel([])
      }

      // Open the dispatch/mufreze_cikis modal
      setShowModal('mufreze_cikis')
    } catch (err) {
      console.error("Error loading incident links for edit:", err)
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

  const handleSaveExternalMission = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!clickedCoords) return
    if (checkedExternalPersonnel.length === 0) {
      alert("Lütfen en az bir personel seçiniz.")
      return
    }
    setIsSubmitting(true)
    try {
      const locationWKT = `POINT(${clickedCoords.lng} ${clickedCoords.lat})`
      
      const hours = parseInt(externalMissionForm.tahmini_donus_saat, 10) || 2
      const tahminiDonus = new Date()
      tahminiDonus.setHours(tahminiDonus.getHours() + hours)

      const payload = {
        gorev_turu: externalMissionForm.gorev_turu,
        baslik: externalMissionForm.baslik,
        detay: externalMissionForm.detay,
        mahalle: externalMissionForm.mahalle,
        adres: externalMissionForm.adres,
        hedef_koordinat: locationWKT,
        cikis_tarihi: new Date().toISOString(),
        tahmini_donus: tahminiDonus.toISOString(),
        durum: "Aktif",
        plaka: externalMissionForm.plaka,
        sicil_nos: checkedExternalPersonnel
      }

      const { error } = await api.insert('external_missions', payload)
      if (error) throw error

      setShowModal('none')
      setExternalMissionForm({
        gorev_turu: "Sosyal Görev",
        baslik: "",
        detay: "",
        mahalle: "",
        adres: "",
        tahmini_donus_saat: "2",
        plaka: ""
      })
      setCheckedExternalPersonnel([])
      fetchData() // Refresh map
    } catch (error) {
      console.error(error)
      alert("Dış görev kaydı oluşturulurken hata oluştu.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <PageGuard pageId="harita">
      <div className="flex flex-col h-[calc(100vh-8rem)] sm:space-y-4 space-y-2 max-w-[1600px] mx-auto w-full relative px-2 sm:px-0">
      {interactionMode === 'add_incident' && <div className="emergency-glow-overlay" />}
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-[var(--fd-r)] bg-[var(--fd-surface)] border border-[var(--fd-border)] shadow-[var(--fd-shadow-sm)] shrink-0 z-10 relative">
        <div className="flex-1 min-w-0">
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-3 text-[var(--fd-text)]">
            <MapIcon className="w-5 h-5 sm:w-6 sm:h-6 text-[var(--fd-accent)] shrink-0" />
            Komuta Kontrol Haritası
          </h1>
          <p className="text-[var(--fd-text2)] text-xs sm:text-sm mt-1 font-medium hidden sm:block whitespace-nowrap">
            İnteraktif mekansal analiz ve saha yönetimi
          </p>
        </div>
        
        <div className="flex flex-row flex-wrap items-center gap-2 shrink-0">
          <Button 
            variant={interactionMode === 'add_incident' ? 'default' : 'outline'}
            className={`min-h-[44px] text-xs sm:text-sm whitespace-nowrap cursor-pointer ${
              interactionMode === 'add_incident' 
                ? 'bg-[var(--fd-danger)] text-white hover:opacity-90' 
                : 'border-[var(--fd-danger)]/50 text-[var(--fd-danger)] hover:bg-[var(--fd-danger)]/10'
            }`}
            onClick={() => setInteractionMode(interactionMode === 'add_incident' ? 'idle' : 'add_incident')}
          >
            <Flame className="w-4 h-4 mr-1 sm:mr-2" /> 
            {interactionMode === 'add_incident' ? 'Haritaya Tıklayın...' : 'Yeni Olay'}
          </Button>

          <Button 
            variant={interactionMode === 'add_external_mission' ? 'default' : 'outline'}
            className={`min-h-[44px] text-xs sm:text-sm whitespace-nowrap cursor-pointer ${
              interactionMode === 'add_external_mission' 
                ? 'bg-[var(--fd-amber)] text-white hover:opacity-90' 
                : 'border-[var(--fd-amber)]/50 text-[var(--fd-amber)] hover:bg-[var(--fd-amber)]/10'
            }`}
            onClick={() => setInteractionMode(interactionMode === 'add_external_mission' ? 'idle' : 'add_external_mission')}
          >
            <MapPin className="w-4 h-4 mr-1 sm:mr-2" /> 
            {interactionMode === 'add_external_mission' ? 'Haritaya Tıklayın...' : 'Yeni Dış Görev'}
          </Button>
          
          <Button 
            variant={interactionMode === 'add_hydrant' ? 'default' : 'outline'}
            className={`min-h-[44px] text-xs sm:text-sm whitespace-nowrap cursor-pointer ${
              interactionMode === 'add_hydrant' 
                ? 'bg-[var(--fd-info)] text-white hover:opacity-90' 
                : 'border-[var(--fd-info)]/50 text-[var(--fd-info)] hover:bg-[var(--fd-info)]/10'
            }`}
            onClick={() => setInteractionMode(interactionMode === 'add_hydrant' ? 'idle' : 'add_hydrant')}
          >
            <Droplets className="w-4 h-4 mr-1 sm:mr-2" /> 
            {interactionMode === 'add_hydrant' ? 'Haritaya Tıklayın...' : 'Yeni Hidrant'}
          </Button>

          <Button 
            variant={showPersonnelLayer ? 'default' : 'outline'}
            className={`min-h-[44px] text-xs sm:text-sm whitespace-nowrap cursor-pointer ${
              showPersonnelLayer 
                ? 'bg-[var(--fd-success)] text-white hover:opacity-90 border-[var(--fd-success)] shadow-[var(--fd-shadow-sm)]' 
                : 'border-[var(--fd-success)]/50 text-[var(--fd-success)] hover:bg-[var(--fd-success)]/10'
            }`}
            onClick={() => setShowPersonnelLayer(!showPersonnelLayer)}
          >
            👥 Personel Katmanı
          </Button>

          {interactionMode !== 'idle' && (
            <Button variant="ghost" size="icon" onClick={() => setInteractionMode('idle')} className="text-[var(--fd-text2)] hover:text-[var(--fd-text)] min-h-[44px] min-w-[44px] whitespace-nowrap cursor-pointer" title="İşlemi İptal Et">
              <X className="w-5 h-5" />
            </Button>
          )}
        </div>
      </div>

       <Card className="flex-1 overflow-hidden relative">
        <CardContent className="p-0 h-full w-full relative">
          
          {/* Arama Çubuğu (Search Engine) */}
          <div className="absolute top-2 sm:top-4 left-1/2 -translate-x-1/2 z-10 w-[95%] sm:w-full sm:max-w-md sm:px-4">
            <form onSubmit={handleSearch} className="relative bg-[var(--fd-surface)] rounded-[var(--fd-r-lg)] shadow-[var(--fd-shadow)] border border-[var(--fd-border)] flex items-center overflow-hidden">
              <Search className="w-5 h-5 text-[var(--fd-text3)] ml-4 shrink-0" />
              <input 
                type="text" 
                placeholder="Sivas içi Mahalle, Sokak veya Cadde Ara..." 
                className="w-full bg-transparent border-none focus:outline-none focus:ring-0 text-[var(--fd-text)] px-3 py-3 text-sm placeholder-[var(--fd-text3)]"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setHasSearched(false) }}
                onKeyDown={handleSearchKeyDown}
              />
              <Button type="button" variant="ghost" className="rounded-[var(--fd-r-sm)] mr-1 h-11 w-11 sm:h-10 sm:w-10 p-0 shrink-0 text-[var(--fd-text2)] hover:text-[var(--fd-text)] cursor-pointer" onClick={() => handleSearch()}>
                {isSearching ? <Loader2 className="w-4 h-4 animate-spin text-[var(--fd-accent)]" /> : <Search className="w-4 h-4" />}
              </Button>
            </form>

            {/* Yükleniyor durumu */}
            {isSearching && (
              <div className="absolute top-full left-4 right-4 mt-2 bg-[var(--fd-surface)] border border-[var(--fd-border)] shadow-[var(--fd-shadow-lg)] rounded-[var(--fd-r)] overflow-hidden animate-in slide-in-from-top-2">
                <div className="flex items-center justify-center gap-2 px-4 py-4">
                  <Loader2 className="w-4 h-4 animate-spin text-[var(--fd-accent)]" />
                  <span className="text-sm text-[var(--fd-text2)]">Aranıyor...</span>
                </div>
              </div>
            )}

            {/* Arama Sonuçları Modal/Dropdown */}
            {!isSearching && searchResults.length > 0 && (
              <div className="absolute top-full left-4 right-4 mt-2 bg-[var(--fd-surface)] border border-[var(--fd-border)] shadow-[var(--fd-shadow-lg)] rounded-[var(--fd-r)] overflow-hidden max-h-64 overflow-y-auto animate-in slide-in-from-top-2">
                <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--fd-border)] bg-[var(--fd-surface2)]/50">
                  <span className="text-xs font-semibold text-[var(--fd-text2)] uppercase tracking-wider">Arama Sonuçları ({searchResults.length})</span>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-[var(--fd-text2)] hover:text-[var(--fd-text)] cursor-pointer" onClick={() => { setSearchResults([]); setHasSearched(false) }}>Kapat</Button>
                </div>
                {searchResults.map(res => (
                  <div 
                    key={res.place_id} 
                    className="px-4 py-3 hover:bg-[var(--fd-surface2)] cursor-pointer border-b border-[var(--fd-border)] last:border-0 transition-colors"
                    onClick={() => handleSelectAddress(res)}
                  >
                    <div className="font-medium text-sm flex items-center gap-2 text-[var(--fd-text)]">
                      <MapPin className="w-3.5 h-3.5 text-[var(--fd-accent)] shrink-0" />
                      <span className="line-clamp-2">{res.display_name}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Sonuç bulunamadı geri bildirimi */}
            {!isSearching && hasSearched && searchResults.length === 0 && (
              <div className="absolute top-full left-4 right-4 mt-2 bg-[var(--fd-surface)] border border-[var(--fd-border)] shadow-[var(--fd-shadow-lg)] rounded-[var(--fd-r)] overflow-hidden animate-in slide-in-from-top-2">
                <div className="flex flex-col items-center justify-center gap-1 px-4 py-4">
                  <Search className="w-5 h-5 text-[var(--fd-text3)]" />
                  <span className="text-sm font-medium text-[var(--fd-text2)]">Sonuç bulunamadı</span>
                  <span className="text-xs text-[var(--fd-text3)]">Farklı bir mahalle veya sokak adı deneyin</span>
                </div>
              </div>
            )}
          </div>

          {/* Harita Katman ve Bilgi Kontrolü - Sol panele (Map.tsx) entegre edildi */}

          <Map 
            incidents={incidents} 
            hydrants={hydrants} 
            vehicles={vehicles}
            externalMissions={externalMissions}
            mode={interactionMode} 
            onMapClick={handleMapClick} 
            focusLocation={focusLocation}
            onUpdateHydrantStatus={handleUpdateHydrantStatus}
            onDeleteIncident={handleDeleteIncident}
            onEditIncident={handleEditIncident}
            showPersonnelLayer={showPersonnelLayer}
            onTogglePersonnelLayer={setShowPersonnelLayer}
            onCompleteExternalMission={handleCompleteExternalMission}
            isSimulation={isSimulation}
            simulationReason={simulationReason}
            onOpenCamera={handleOpenCamera}
          />
          
        </CardContent>
      </Card>

      {/* ========================================================= */}
      {/* İNTERAKTİF İŞARETLEME (PIN DROPPING) FORMLARI / MODALLAR  */}
      {/* ========================================================= */}
      
      {showModal === 'external_mission' && (
        <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in">
          <Card className="w-full sm:w-[450px] shadow-[var(--fd-shadow-lg)] animate-in slide-in-from-bottom-4 sm:zoom-in-95 rounded-t-[var(--fd-r)] sm:rounded-[var(--fd-r)] max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[var(--fd-border)] px-4 sm:px-5 py-3 sm:py-3.5">
              <h2 className="text-base sm:text-lg font-bold flex items-center gap-2 text-[var(--fd-amber)]">
                <MapPin className="w-5 h-5" /> 
                Yeni Dış Görev Planla
              </h2>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setShowModal('none')} 
                className="min-h-[44px] min-w-[44px] text-[var(--fd-text2)] hover:text-[var(--fd-text)] hover:bg-[var(--fd-surface2)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            <form onSubmit={handleSaveExternalMission} className="p-4 sm:p-5 space-y-3.5 bg-[var(--fd-surface)]">
              {/* Görev Türü */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--fd-text2)]">Görev Türü</label>
                <select 
                  className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] text-sm rounded-[var(--fd-r-sm)] focus:ring-[var(--fd-accent)] focus:border-[var(--fd-accent)] p-2.5"
                  value={externalMissionForm.gorev_turu}
                  onChange={(e) => setExternalMissionForm(prev => ({ ...prev, gorev_turu: e.target.value }))}
                >
                  <option value="Sosyal Görev">Sosyal Görev (Su Dağıtımı, Baca Temizliği vs.)</option>
                  <option value="Lojistik Sevk">Lojistik Sevk</option>
                </select>
              </div>

              {/* Başlık */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--fd-text2)]">Görev Başlığı</label>
                <Input
                  required
                  placeholder="Görev Başlığı Girin..."
                  value={externalMissionForm.baslik}
                  onChange={(e) => setExternalMissionForm(prev => ({ ...prev, baslik: e.target.value }))}
                  className="bg-[var(--fd-surface2)] border-[var(--fd-border)] text-[var(--fd-text)] placeholder-[var(--fd-text3)] focus:ring-[var(--fd-accent)] focus:border-[var(--fd-accent)] rounded-[var(--fd-r-sm)]"
                />
              </div>

              {/* Detay */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--fd-text2)]">Detaylar / Açıklama</label>
                <textarea
                  placeholder="Görev Detayları Girin..."
                  value={externalMissionForm.detay}
                  onChange={(e) => setExternalMissionForm(prev => ({ ...prev, detay: e.target.value }))}
                  rows={3}
                  className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] placeholder-[var(--fd-text3)] text-sm rounded-[var(--fd-r-sm)] focus:ring-[var(--fd-accent)] focus:border-[var(--fd-accent)] p-2.5"
                />
              </div>

              {/* Mahalle & Adres */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--fd-text2)]">Mahalle</label>
                  <Input
                    placeholder="Mahalle..."
                    value={externalMissionForm.mahalle}
                    onChange={(e) => setExternalMissionForm(prev => ({ ...prev, mahalle: e.target.value }))}
                    className="bg-[var(--fd-surface2)] border-[var(--fd-border)] text-[var(--fd-text)] placeholder-[var(--fd-text3)] text-xs rounded-[var(--fd-r-sm)]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--fd-text2)]">Adres</label>
                  <Input
                    placeholder="Adres..."
                    value={externalMissionForm.adres}
                    onChange={(e) => setExternalMissionForm(prev => ({ ...prev, adres: e.target.value }))}
                    className="bg-[var(--fd-surface2)] border-[var(--fd-border)] text-[var(--fd-text)] placeholder-[var(--fd-text3)] text-xs rounded-[var(--fd-r-sm)]"
                  />
                </div>
              </div>

              {/* Tahmini Dönüş Süresi */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--fd-text2)]">Tahmini Dönüş Süresi (Saat)</label>
                <select 
                  className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] text-sm rounded-[var(--fd-r-sm)] focus:ring-[var(--fd-accent)] focus:border-[var(--fd-accent)] p-2.5"
                  value={externalMissionForm.tahmini_donus_saat}
                  onChange={(e) => setExternalMissionForm(prev => ({ ...prev, tahmini_donus_saat: e.target.value }))}
                >
                  <option value="1">1 Saat</option>
                  <option value="2">2 Saat</option>
                  <option value="4">4 Saat</option>
                  <option value="8">8 Saat</option>
                  <option value="12">12 Saat</option>
                  <option value="24">24 Saat</option>
                </select>
              </div>

              {/* Araç */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--fd-text2)]">Görevlendirilecek İtfaiye Aracı</label>
                <select 
                  className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] text-sm rounded-[var(--fd-r-sm)] focus:ring-[var(--fd-accent)] focus:border-[var(--fd-accent)] p-2.5"
                  value={externalMissionForm.plaka}
                  onChange={(e) => setExternalMissionForm(prev => ({ ...prev, plaka: e.target.value }))}
                >
                  <option value="">Araç Seçilmedi</option>
                  {vehicles.map(v => (
                    <option key={v.plaka} value={v.plaka}>
                      {v.plaka} - {v.marka} {v.model} ({v.istasyon}) [{v.durum}]
                    </option>
                  ))}
                </select>
              </div>

              {/* Sorumlu Personel (Çoklu Seçim) */}
              <div className="space-y-2 flex flex-col min-h-[220px]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-[var(--fd-text3)] flex items-center gap-2">
                    <span>Görevli Personeller (Posta {activePostaNumber})</span>
                    <span className="text-[10px] bg-[var(--fd-surface2)] border border-[var(--fd-border)] px-2 py-0.5 rounded-full text-[var(--fd-text2)]">
                      Seçili: {checkedExternalPersonnel.length}
                    </span>
                  </label>
                  <div className="flex items-center gap-1.5 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={() => {
                        const allSicils = filteredExternalPersonnel.map(p => p.sicil_no);
                        setCheckedExternalPersonnel(allSicils);
                      }}
                      className="text-[10px] font-bold text-[var(--fd-amber)] hover:opacity-85 transition-colors bg-[var(--fd-surface2)] px-2 py-1 rounded border border-[var(--fd-amber)]/20 cursor-pointer"
                    >
                      Tümünü Seç
                    </button>
                    <button
                      type="button"
                      onClick={() => setCheckedExternalPersonnel([])}
                      className="text-[10px] font-bold text-[var(--fd-danger)] hover:opacity-85 transition-colors bg-[var(--fd-surface2)] px-2 py-1 rounded border border-[var(--fd-danger)]/20 cursor-pointer"
                    >
                      Temizle
                    </button>
                  </div>
                </div>

                {/* Personel Arama Kutusu */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--fd-text3)]" />
                  <input
                    type="text"
                    placeholder="Personel ara (İsim, soyisim veya sicil no)..."
                    value={externalPersonnelSearch}
                    onChange={(e) => setExternalPersonnelSearch(e.target.value)}
                    className="w-full h-9 rounded-xl border border-[var(--fd-border)] bg-[var(--fd-surface2)] pl-9 pr-8 text-xs text-[var(--fd-text)] focus:outline-none focus:ring-1 focus:ring-[var(--fd-accent)] placeholder-[var(--fd-text3)]"
                  />
                  {externalPersonnelSearch && (
                    <button
                      type="button"
                      onClick={() => setExternalPersonnelSearch("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--fd-text3)] hover:text-[var(--fd-text)] text-xs border-0 bg-transparent cursor-pointer"
                    >
                      Temizle
                    </button>
                  )}
                </div>
                
                <div className="flex-1 overflow-y-auto border border-[var(--fd-border)] rounded-xl bg-[var(--fd-surface2)]/40 p-2 space-y-1.5 max-h-[220px]">
                  {filteredExternalPersonnel.length === 0 ? (
                    <div className="text-center text-xs text-[var(--fd-text3)] py-6">
                      {externalPersonnelSearch ? 'Arama kriterine uygun personel bulunamadı.' : 'Aktif posta personeli bulunamadı.'}
                    </div>
                  ) : (
                    filteredExternalPersonnel.map(p => {
                      const isChecked = checkedExternalPersonnel.includes(p.sicil_no);
                      return (
                        <label 
                          key={p.id} 
                          className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all border ${
                            isChecked 
                              ? 'bg-[var(--fd-amber)]/10 border-[var(--fd-amber)]/40 text-[var(--fd-text)]' 
                              : 'bg-transparent border-transparent hover:bg-[var(--fd-surface3)] text-[var(--fd-text2)]'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input 
                              type="checkbox" 
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setCheckedExternalPersonnel(prev => [...prev, p.sicil_no]);
                                } else {
                                  setCheckedExternalPersonnel(prev => prev.filter(s => s !== p.sicil_no));
                                }
                              }}
                              className="rounded border-[var(--fd-border)] text-[var(--fd-accent)] focus:ring-[var(--fd-accent)] bg-[var(--fd-surface2)]"
                            />
                            <div>
                              <span className="text-xs font-semibold block text-[var(--fd-text)]">
                                {p.ad} {p.soyad}
                              </span>
                              <span className="text-[10px] text-[var(--fd-text3)] font-mono">
                                Sicil: {p.sicil_no} | {p.unvan} | {p.istasyon}
                              </span>
                            </div>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Form Buttons */}
              <div className="pt-4 border-t border-[var(--fd-border)] flex justify-end gap-2 shrink-0">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setShowModal('none')} 
                  className="border-[var(--fd-border)] text-[var(--fd-text2)] hover:bg-[var(--fd-surface2)] cursor-pointer"
                >
                  İptal
                </Button>
                <Button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-semibold"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <MapPin className="w-4 h-4 mr-2" />}
                  Görevi Başlat
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {showModal === 'incident' && (
        <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in">
          <Card className="w-full sm:w-[450px] shadow-[var(--fd-shadow-lg)] animate-in slide-in-from-bottom-4 sm:zoom-in-95 rounded-t-[var(--fd-r)] sm:rounded-[var(--fd-r)] max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[var(--fd-border)] px-4 sm:px-5 py-3 sm:py-3.5">
              <h2 className="text-base sm:text-lg font-bold flex items-center gap-2 text-[var(--fd-text)]"><Flame className="w-5 h-5 text-[var(--fd-danger)]" /> Olay İşaretle</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowModal('none')} className="min-h-[44px] min-w-[44px] text-[var(--fd-text2)] hover:text-[var(--fd-text)] hover:bg-[var(--fd-surface2)] cursor-pointer"><X className="w-4 h-4" /></Button>
            </div>
            <form onSubmit={handleSaveIncident} className="p-4 sm:p-5 space-y-3.5 bg-[var(--fd-surface)]">
              {/* ─── İnteraktif Adres Arama Motoru (Geocoding) ─────── */}
              <div className="space-y-2 relative">
                <label className="text-sm font-semibold flex items-center gap-2 text-[var(--fd-text)]">
                  <Search className="w-3.5 h-3.5 text-[var(--fd-accent)]" />
                  <span>Adres veya Önemli Yer Ara</span>
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fd-accent)]/70 pointer-events-none">
                    {isIncidentSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <span className="text-base">🔍</span>}
                  </div>
                  <input
                    type="text"
                    placeholder="Adres veya Önemli Yer Ara..."
                    value={incidentSearchQuery}
                    onChange={(e) => handleIncidentSearchInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleIncidentSearch(incidentSearchQuery); } }}
                    className="w-full h-11 rounded-xl border border-[var(--fd-border)] bg-[var(--fd-surface2)] pl-10 pr-4 text-sm text-[var(--fd-text)] placeholder-[var(--fd-text3)] focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]/50 focus:border-[var(--fd-accent)]/60 transition-all shadow-[var(--fd-shadow-sm)]"
                  />
                </div>

                {/* Geocoding Sonuç Dropdown */}
                {!isIncidentSearching && incidentSearchResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-xl shadow-[var(--fd-shadow-lg)] max-h-52 overflow-y-auto">
                    <div className="px-3 py-1.5 border-b border-[var(--fd-border)] flex items-center justify-between bg-[var(--fd-surface2)]/50">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--fd-accent)]/80">Bulunan Adresler ({incidentSearchResults.length})</span>
                      <button type="button" onClick={() => { setIncidentSearchResults([]); setHasIncidentSearched(false); }} className="text-[10px] text-[var(--fd-text3)] hover:text-[var(--fd-text)] transition-colors cursor-pointer">Kapat</button>
                    </div>
                    {incidentSearchResults.map(res => (
                      <button
                        key={res.place_id}
                        type="button"
                        className="w-full text-left px-3 py-2.5 hover:bg-[var(--fd-surface2)] border-b border-[var(--fd-border)] last:border-0 transition-colors flex items-start gap-2 min-h-[44px] cursor-pointer"
                        onClick={() => handleIncidentSelectAddress(res)}
                      >
                        <MapPin className="w-3.5 h-3.5 text-[var(--fd-accent)] shrink-0 mt-0.5" />
                        <span className="text-xs text-[var(--fd-text)] leading-snug line-clamp-2">{res.display_name}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Sonuç bulunamadı */}
                {!isIncidentSearching && hasIncidentSearched && incidentSearchResults.length === 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-xl shadow-lg">
                    <div className="flex items-center justify-center gap-2 px-4 py-3">
                      <Search className="w-4 h-4 text-[var(--fd-text3)]" />
                      <span className="text-xs text-[var(--fd-text3)]">Sonuç bulunamadı — farklı bir adres deneyin</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="h-px bg-gradient-to-r from-[var(--fd-accent)]/20 via-[var(--fd-border)]/40 to-transparent" />

              <div className="space-y-2">
                <label className="text-sm font-semibold text-[var(--fd-text)]">Olay Türü</label>
                <select name="olay_turu" value={incidentForm.olay_turu} onChange={(e) => setIncidentForm({...incidentForm, olay_turu: e.target.value})} required className="flex h-10 w-full rounded-md border border-[var(--fd-border)] bg-[var(--fd-surface2)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]">
                  <optgroup label="🔴 Kritik (Seviye 3)" className="text-[var(--fd-danger)] bg-[var(--fd-surface2)]">
                    <option value="Ev Yangını">Ev Yangını</option>
                    <option value="Bina/Fabrika Yangını">Bina/Fabrika Yangını</option>
                    <option value="Sıkışmalı Trafik Kazası">Sıkışmalı Trafik Kazası</option>
                    <option value="KBRN Sızıntısı">KBRN Sızıntısı</option>
                  </optgroup>
                  <optgroup label="🟡 Orta (Seviye 2)" className="text-[var(--fd-amber)] bg-[var(--fd-surface2)]">
                    <option value="Araç Yangını">Araç Yangını</option>
                    <option value="İşyeri Yangını">İşyeri Yangını</option>
                    <option value="Kurtarma Operasyonları">Kurtarma Operasyonları</option>
                  </optgroup>
                  <optgroup label="🟢 Düşük (Seviye 1)" className="text-[var(--fd-success)] bg-[var(--fd-surface2)]">
                    <option value="Çöp Yangını">Çöp Yangını</option>
                    <option value="Ot/Anız Yangını">Ot/Anız Yangını</option>
                    <option value="Kapı Açma">Kapı Açma</option>
                    <option value="Hayvan Kurtarma">Hayvan Kurtarma</option>
                  </optgroup>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-[var(--fd-text)]">Mahalle</label>
                <Input value={incidentForm.mahalle} onChange={(e) => setIncidentForm({...incidentForm, mahalle: e.target.value})} required placeholder="Örn: Alibaba" className="bg-[var(--fd-surface2)] border-[var(--fd-border)] text-[var(--fd-text)] placeholder-[var(--fd-text3)] focus:ring-[var(--fd-accent)]" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold flex items-center justify-between w-full text-[var(--fd-text)]">
                  <span>Adres / Detay</span>
                  {hasFetchedAddress && (
                    <span className="flex items-center gap-1 text-[10px] sm:text-xs text-[var(--fd-info)] font-medium bg-[var(--fd-info)]/10 px-2 py-0.5 rounded-full border border-[var(--fd-info)]/20">
                      <Sparkles className="w-3 h-3" />
                      Yapay Zeka Tarafından Doğrulandı
                    </span>
                  )}
                </label>
                <Input value={incidentForm.adres} onChange={(e) => setIncidentForm({...incidentForm, adres: e.target.value})} required placeholder="Sokak, Bina detayları..." className="bg-[var(--fd-surface2)] border-[var(--fd-border)] text-[var(--fd-text)] placeholder-[var(--fd-text3)] focus:ring-[var(--fd-accent)]" />
              </div>
              
              <div className="text-xs text-[var(--fd-text2)] font-mono bg-[var(--fd-surface2)] p-2 rounded border border-[var(--fd-border)] mt-4">
                Seçilen Konum: {clickedCoords?.lat.toFixed(6)}, {clickedCoords?.lng.toFixed(6)}
              </div>

              <div className="pt-4 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowModal('none')} className="border-[var(--fd-border)] text-[var(--fd-text2)] hover:bg-[var(--fd-surface2)] cursor-pointer">İtal</Button>
                <Button type="submit" className="bg-[var(--fd-danger)] hover:opacity-90 text-white cursor-pointer" disabled={isSubmitting}>
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
          <Card className="w-full sm:w-[450px] shadow-[var(--fd-shadow-lg)] animate-in slide-in-from-bottom-4 sm:zoom-in-95 rounded-t-[var(--fd-r)] sm:rounded-[var(--fd-r)] max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[var(--fd-border)] px-4 sm:px-5 py-3 sm:py-3.5">
              <h2 className="text-base sm:text-lg font-bold flex items-center gap-2 text-[var(--fd-text)]"><Droplets className="w-5 h-5 text-[var(--fd-info)]" /> Yangın Hidrantı Ekle</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowModal('none')} className="min-h-[44px] min-w-[44px] text-[var(--fd-text2)] hover:text-[var(--fd-text)] hover:bg-[var(--fd-surface2)] cursor-pointer"><X className="w-4 h-4" /></Button>
            </div>
            <form onSubmit={handleSaveHydrant} className="p-4 sm:p-5 space-y-3.5 bg-[var(--fd-surface)]">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-[var(--fd-text)]">Hidrant / Şube No</label>
                <Input value={hydrantForm.no} onChange={(e) => setHydrantForm({...hydrantForm, no: e.target.value})} required placeholder="Örn: H-128" className="bg-[var(--fd-surface2)] border-[var(--fd-border)] text-[var(--fd-text)] placeholder-[var(--fd-text3)] focus:ring-[var(--fd-accent)] rounded-[var(--fd-r-sm)]" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-[var(--fd-text)]">Tip</label>
                  <select value={hydrantForm.tip} onChange={(e) => setHydrantForm({...hydrantForm, tip: e.target.value})} className="flex h-10 w-full rounded-[var(--fd-r-sm)] border border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]">
                    <option value="Yer üstü">Yer üstü</option>
                    <option value="Yer altı">Yer altı</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-[var(--fd-text)]">Durum</label>
                  <select value={hydrantForm.durum} onChange={(e) => setHydrantForm({...hydrantForm, durum: e.target.value})} className="flex h-10 w-full rounded-[var(--fd-r-sm)] border border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]">
                    <option value="Aktif">Aktif</option>
                    <option value="Arızalı">Arızalı</option>
                    <option value="Bakımda">Bakımda</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-[var(--fd-text)]">Bulunduğu Mahalle</label>
                <Input value={hydrantForm.mahalle} onChange={(e) => setHydrantForm({...hydrantForm, mahalle: e.target.value})} required placeholder="Örn: Esentepe" className="bg-[var(--fd-surface2)] border-[var(--fd-border)] text-[var(--fd-text)] placeholder-[var(--fd-text3)] focus:ring-[var(--fd-accent)] rounded-[var(--fd-r-sm)]" />
              </div>
              
              <div className="text-xs text-[var(--fd-text2)] font-mono bg-[var(--fd-surface2)] p-2 rounded border border-[var(--fd-border)] mt-4">
                Seçilen Konum: {clickedCoords?.lat.toFixed(6)}, {clickedCoords?.lng.toFixed(6)}
              </div>

              <div className="pt-4 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowModal('none')} className="border-[var(--fd-border)] text-[var(--fd-text2)] hover:bg-[var(--fd-surface2)] cursor-pointer">İptal</Button>
                <Button type="submit" className="bg-[var(--fd-info)] hover:opacity-90 text-white cursor-pointer" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                  Sisteme Ekle
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
      
      {showModal === 'mufreze_cikis' && (
        <div className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in">
          <Card className="w-full sm:w-[500px] shadow-[var(--fd-shadow-lg)] animate-in slide-in-from-bottom-4 sm:zoom-in-95 rounded-t-[var(--fd-r)] sm:rounded-[var(--fd-r)] max-h-[85vh] flex flex-col border border-[var(--fd-border)] bg-[var(--fd-surface)] text-[var(--fd-text)]">
            <div className="flex items-center justify-between border-b border-[var(--fd-border)] px-4 sm:px-5 py-3.5 bg-[var(--fd-surface2)]/50">
              <h2 className="text-base sm:text-lg font-bold flex items-center gap-2 text-[var(--fd-danger)]">
                <Flame className="w-5 h-5 animate-pulse text-[var(--fd-danger)]" /> 
                Müfreze Çıkış Paneli (Vaka No: {activeIncidentId})
              </h2>
              <Button variant="ghost" size="icon" onClick={() => setShowModal('none')} className="min-h-[44px] min-w-[44px] hover:bg-[var(--fd-surface3)] text-[var(--fd-text2)] hover:text-[var(--fd-text)] cursor-pointer">
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            <form onSubmit={handleSaveMufrezeCikis} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5 bg-[var(--fd-surface)]">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[var(--fd-text3)]">Olay Türü</label>
                <select 
                  name="olay_turu" 
                  value={incidentForm.olay_turu} 
                  onChange={(e) => setIncidentForm({...incidentForm, olay_turu: e.target.value})} 
                  required 
                  className="flex h-11 w-full rounded-xl border border-[var(--fd-border)] bg-[var(--fd-surface2)] px-3 py-2 text-sm text-[var(--fd-text)] focus:outline-none focus:ring-2 focus:ring-[var(--fd-danger)] focus:border-transparent"
                >
                  <optgroup label="🔴 Kritik (Seviye 3)" className="bg-[var(--fd-surface2)] text-[var(--fd-danger)]">
                    <option value="Ev Yangını">Ev Yangını</option>
                    <option value="Bina/Fabrika Yangını">Bina/Fabrika Yangını</option>
                    <option value="Sıkışmalı Trafik Kazası">Sıkışmalı Trafik Kazası</option>
                    <option value="KBRN Sızıntısı">KBRN Sızıntısı</option>
                  </optgroup>
                  <optgroup label="🟡 Orta (Seviye 2)" className="bg-[var(--fd-surface2)] text-[var(--fd-amber)]">
                    <option value="Araç Yangını">Araç Yangını</option>
                    <option value="İşyeri Yangını">İşyeri Yangını</option>
                    <option value="Kurtarma Operasyonları">Kurtarma Operasyonları</option>
                  </optgroup>
                  <optgroup label="🟢 Düşük (Seviye 1)" className="bg-[var(--fd-surface2)] text-[var(--fd-success)]">
                    <option value="Çöp Yangını">Çöp Yangını</option>
                    <option value="Ot/Anız Yangını">Ot/Anız Yangını</option>
                    <option value="Kapı Açma">Kapı Açma</option>
                    <option value="Hayvan Kurtarma">Hayvan Kurtarma</option>
                  </optgroup>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-[var(--fd-text3)]">Mahalle</label>
                  <Input 
                    value={incidentForm.mahalle} 
                    onChange={(e) => setIncidentForm({...incidentForm, mahalle: e.target.value})} 
                    required 
                    className="h-11 rounded-xl bg-[var(--fd-surface2)] border-[var(--fd-border)] text-[var(--fd-text)] placeholder-[var(--fd-text3)] focus:ring-[var(--fd-danger)]" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-[var(--fd-text3)]">Adres / Konum Detayı</label>
                  <Input 
                    value={incidentForm.adres} 
                    onChange={(e) => setIncidentForm({...incidentForm, adres: e.target.value})} 
                    required 
                    className="h-11 rounded-xl bg-[var(--fd-surface2)] border-[var(--fd-border)] text-[var(--fd-text)] placeholder-[var(--fd-text3)] focus:ring-[var(--fd-danger)]" 
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[var(--fd-text3)]">Çıkış Yapacak Araçlar (Birden fazla seçilebilir)</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border border-[var(--fd-border)] rounded-xl bg-[var(--fd-surface2)]/60 p-2 max-h-[140px] overflow-y-auto">
                  {vehicles.map(v => {
                    const isSelected = selectedVehiclePlakas.includes(v.plaka);
                    const isMaint = v.current_branch === 'Makine İkmal Müdürlüğü (Bakım-Onarım)';
                    return (
                      <label
                        key={v.plaka}
                        className={`flex items-center justify-between p-2 rounded-lg transition-all border text-xs ${
                          isMaint
                            ? 'opacity-40 cursor-not-allowed bg-[var(--fd-surface2)] border-transparent text-[var(--fd-text3)]'
                            : isSelected
                              ? 'bg-[var(--fd-danger)]/10 border-[var(--fd-danger)]/40 text-[var(--fd-text)] cursor-pointer'
                              : 'bg-transparent border-transparent hover:bg-[var(--fd-surface3)] text-[var(--fd-text2)] cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={isMaint}
                            onChange={(e) => {
                              if (!isMaint) {
                                handleVehicleToggle(v.plaka, e.target.checked);
                              }
                            }}
                            className="rounded border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-danger)] focus:ring-[var(--fd-danger)] w-3.5 h-3.5"
                          />
                          <div className="flex flex-col">
                            <span className="font-bold">{v.plaka}</span>
                            <span className="text-[10px] opacity-75">{v.arac_tipi}</span>
                          </div>
                        </div>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                          isMaint
                            ? 'bg-[var(--fd-surface3)] text-[var(--fd-text2)] border border-[var(--fd-border)]/30'
                            : v.durum === 'Bakımda' || v.status === 'maintenance'
                              ? 'bg-[var(--fd-danger)]/20 text-[var(--fd-danger)] border border-[var(--fd-danger)]/30'
                              : 'bg-[var(--fd-success)]/20 text-[var(--fd-success)] border border-[var(--fd-success)]/30'
                        }`}>
                          {isMaint ? 'MAKİNE İKMAL' : (v.durum === 'Bakımda' || v.status === 'maintenance') ? 'BAKIMDA' : 'AKTİF'}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2 flex-1 flex flex-col min-h-[220px]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-[var(--fd-text3)] flex items-center gap-2">
                    <span>Aktif Nöbetçi Personeller (Posta {activePostaNumber})</span>
                    <span className="text-[10px] bg-[var(--fd-surface2)] border border-[var(--fd-border)] px-2 py-0.5 rounded-full text-[var(--fd-text2)]">
                      Seçili: {checkedPersonnel.length}
                    </span>
                  </label>
                  <div className="flex items-center gap-1.5 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={() => {
                        const allSicils = sortedMufrezePersonnel.map(p => p.sicil_no);
                        setCheckedPersonnel(allSicils);
                      }}
                      className="text-[10px] font-bold text-[var(--fd-info)] hover:opacity-85 transition-colors bg-[var(--fd-surface2)] px-2 py-1 rounded border border-[var(--fd-info)]/20 cursor-pointer"
                    >
                      Tümünü Seç
                    </button>
                    <button
                      type="button"
                      onClick={() => setCheckedPersonnel([])}
                      className="text-[10px] font-bold text-[var(--fd-danger)] hover:opacity-85 transition-colors bg-[var(--fd-surface2)] px-2 py-1 rounded border border-[var(--fd-danger)]/20 cursor-pointer"
                    >
                      Temizle
                    </button>
                  </div>
                </div>

                {/* Personel Arama Kutusu */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--fd-text3)]" />
                  <input
                    type="text"
                    placeholder="Personel ara (İsim, soyisim veya sicil no)..."
                    value={personnelSearch}
                    onChange={(e) => setPersonnelSearch(e.target.value)}
                    className="w-full h-9 rounded-xl border border-[var(--fd-border)] bg-[var(--fd-surface2)] pl-9 pr-8 text-xs text-[var(--fd-text)] placeholder-[var(--fd-text3)] focus:outline-none focus:ring-1 focus:ring-[var(--fd-danger)]"
                  />
                  {personnelSearch && (
                    <button
                      type="button"
                      onClick={() => setPersonnelSearch("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--fd-text3)] hover:text-[var(--fd-text)] text-xs border-0 bg-transparent cursor-pointer"
                    >
                      Temizle
                    </button>
                  )}
                </div>
                
                <div className="flex-1 overflow-y-auto border border-[var(--fd-border)] rounded-xl bg-[var(--fd-surface2)]/40 p-2 space-y-1.5 max-h-[220px]">
                  {filteredPersonnel.length === 0 ? (
                    <div className="text-center text-xs text-[var(--fd-text3)] py-6">
                      {personnelSearch ? 'Arama kriterine uygun nöbetçi personel bulunamadı.' : 'Aktif nöbetçi posta personeli bulunamadı.'}
                    </div>
                  ) : (
                    filteredPersonnel.map(p => {
                      const isChecked = checkedPersonnel.includes(p.sicil_no);
                      const activeStations = vehicles
                        .filter(v => selectedVehiclePlakas.includes(v.plaka))
                        .map(v => v.istasyon || "")
                        .filter(Boolean)
                        .map(s => s.toLowerCase().split(' ')[0]);
                      
                      const isSameStation = p.istasyon && activeStations.includes(p.istasyon.toLowerCase().split(' ')[0]);
                      
                      return (
                        <label 
                          key={p.id} 
                          className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all border ${
                            isChecked 
                              ? 'bg-[var(--fd-danger)]/10 border-[var(--fd-danger)]/40 text-[var(--fd-text)]' 
                              : isSameStation 
                                ? 'bg-[var(--fd-surface3)] border border-[var(--fd-border)]/30 hover:bg-[var(--fd-surface3)]/80 text-[var(--fd-text)]' 
                                : 'bg-transparent border-transparent hover:bg-[var(--fd-surface3)] text-[var(--fd-text2)]'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input 
                              type="checkbox" 
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setCheckedPersonnel(prev => [...prev, p.sicil_no]);
                                } else {
                                  setCheckedPersonnel(prev => prev.filter(id => id !== p.sicil_no));
                                }
                              }}
                              className="rounded border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-danger)] focus:ring-[var(--fd-danger)] w-4 h-4"
                            />
                            <div className="flex flex-col">
                              <span className="text-xs font-semibold">{p.ad} {p.soyad}</span>
                              <span className="text-[10px] opacity-75">{p.sicil_no} - {p.rol}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--fd-surface2)] border border-[var(--fd-border)]">
                              {p.istasyon || 'İstasyon Belirtilmemiş'}
                            </span>
                            {isSameStation && (
                              <span className="text-[9px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded bg-[var(--fd-success)]/20 text-[var(--fd-success)] border border-[var(--fd-success)]/30">
                                Aynı Şube
                              </span>
                            )}
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-[var(--fd-border)] flex justify-end gap-2 shrink-0">
                <Button type="button" variant="outline" onClick={() => setShowModal('none')} className="border-[var(--fd-border)] text-[var(--fd-text2)] hover:bg-[var(--fd-surface2)] cursor-pointer">
                  İptal
                </Button>
                <Button type="submit" className="bg-[var(--fd-danger)] hover:opacity-90 text-white font-semibold cursor-pointer" disabled={isSubmitting || selectedVehiclePlakas.length === 0}>
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Flame className="w-4 h-4 mr-2" />}
                  Müfreze Çıkışını Başlat
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* --- CAMERA MODAL --- */}
      <Dialog open={cameraModalOpen} onOpenChange={setCameraModalOpen}>
        <DialogContent className="sm:max-w-2xl bg-[var(--fd-surface)] border-[var(--fd-border)]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-[var(--fd-text)]">
              <span className="text-blue-500">📹</span> {cameraVehicle?.plate} - Canlı Kamera
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {loadingCamera ? (
              <div className="flex flex-col items-center justify-center py-12 text-[var(--fd-text3)]">
                <Loader2 className="w-8 h-8 animate-spin mb-4 text-blue-500" />
                <p>N2 Mobil kamera bağlantısı kuruluyor...</p>
              </div>
            ) : cameraIps.length > 0 ? (
              <div className="space-y-4">
                <div className="flex gap-2 mb-2 overflow-x-auto pb-2 scrollbar-hide">
                  {cameraIps.map((ip, i) => (
                    <Button 
                      key={i} 
                      variant={activeChannelIndex === i ? 'default' : 'outline'}
                      onClick={() => setActiveChannelIndex(i)}
                      className={activeChannelIndex === i ? 'bg-blue-600 hover:bg-blue-700 shadow-md' : 'text-[var(--fd-text2)]'}
                      size="sm"
                    >
                      Kamera Kanalı {i + 1}
                    </Button>
                  ))}
                </div>
                
                <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden shadow-2xl border border-[var(--fd-border)] flex items-center justify-center">
                   {/* Loader Background */}
                   <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
                     <Loader2 className="w-8 h-8 animate-spin mb-2 opacity-50" />
                     <p className="text-xs">Yayın Yükleniyor...</p>
                   </div>
                   
                   <img 
                     key={cameraIps[activeChannelIndex]}
                     src={`/api/n2mobil/stream?url=${encodeURIComponent(cameraIps[activeChannelIndex])}`}
                     alt="Canlı Kamera Yayını"
                     className="relative z-10 w-full h-full object-contain"
                     onError={(e) => {
                       e.currentTarget.style.display = 'none';
                       const errDiv = document.getElementById('cam-error');
                       if (errDiv) errDiv.style.display = 'flex';
                     }}
                     onLoad={(e) => {
                       const errDiv = document.getElementById('cam-error');
                       if (errDiv) errDiv.style.display = 'none';
                     }}
                   />
                   
                   <div id="cam-error" className="absolute inset-0 z-20 hidden flex-col items-center justify-center text-red-400 bg-black/90">
                      <X className="w-12 h-12 mb-2 opacity-80" />
                      <p className="font-semibold">Kamera yayınına ulaşılamadı.</p>
                      <p className="text-xs mt-1 text-gray-400">Araç kapalı olabilir veya bağlantı zayıf.</p>
                   </div>
                   
                   <div className="absolute top-3 right-3 z-30 flex items-center gap-2">
                     <div className="bg-black/60 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1.5 rounded border border-white/10 flex items-center gap-2 shadow-lg tracking-wider">
                       <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]"></span>
                       CANLI - {cameraVehicle?.plate}
                     </div>
                   </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-10 text-[var(--fd-text3)] border border-dashed border-[var(--fd-border)] rounded-xl bg-[var(--fd-surface2)]">
                <span className="text-3xl mb-2 block opacity-50">📷</span>
                Bu araç için N2 Mobil sisteminde aktif kamera yayını bulunamadı.
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setCameraModalOpen(false)}>Kapat</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PageGuard>
  )
}

export default function HaritaPage() {
  return (
    <Suspense fallback={
      <div className="w-full h-[calc(100vh-8rem)] flex flex-col items-center justify-center bg-[var(--fd-surface2)]/50 border border-[var(--fd-border)] rounded-[var(--fd-r)] border-dashed">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--fd-accent)] mb-2" />
        <span className="text-sm font-medium text-[var(--fd-text2)]">Harita Yükleniyor...</span>
      </div>
    }>
      <HaritaContent />
    </Suspense>
  )
}
