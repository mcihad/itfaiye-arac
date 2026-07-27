"use client"

import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import * as turf from '@turf/turf'
import { Layers, Building2, Map as MapIcon, Milestone, Droplets, X, Flame, Edit, Trash2, Loader2 } from 'lucide-react'
import { getTriageInfo } from '@/lib/utils'
import { Vehicle } from '@/types'
import { api, unwrap } from '@/lib/api'
import { useAuthStore } from '@/lib/authStore'
import { Badge } from '@/components/ui/Badge'
import { useTheme } from 'next-themes'
import { toast } from "@/lib/toast"



// ─── Sivas Merkez İtfaiye İstasyonu (Yenişehir) ────────────
const STATION_COORDS: [number, number] = [37.0209312, 39.7339522] // [lng, lat]



interface Incident {
  id: string
  olay_turu: string
  mahalle: string
  adres: string
  cikis_saati: string
  location?: any
  aciliyet_seviyesi?: number
  durum?: string
  status?: string
}

interface Hydrant {
  id: string
  no: string
  tip: string
  durum: string
  mahalle: string
  location?: any
  kalite?: string | null
  imalatci?: string | null
  proje_adi?: string | null
}

interface MapProps {
  incidents: Incident[]
  hydrants: Hydrant[]
  vehicles?: Vehicle[]
  externalMissions?: any[]
  mode: 'idle' | 'add_incident' | 'add_hydrant' | 'add_external_mission'
  onMapClick: (lat: number, lng: number) => void
  focusLocation: [number, number] | null
  onUpdateHydrantStatus?: (id: string, newStatus: string) => void
  onDeleteIncident?: (id: string) => void
  onEditIncident?: (incident: Incident) => void
  showPersonnelLayer?: boolean
  /** Hidrant katmanının başlangıç görünürlüğü (varsayılan true — mevcut davranış). Saha Modu false verir. */
  defaultShowHydrants?: boolean
  onTogglePersonnelLayer?: (val: boolean) => void
  onCompleteExternalMission?: (id: string) => void
  isSimulation?: boolean
  simulationReason?: string
  onOpenCamera?: (vehicleId: string, plate: string) => void
}

const parseWKBPoint = (wkbHex: string): [number, number] | null => {
  if (!wkbHex || typeof wkbHex !== 'string') return null
  const cleanHex = wkbHex.trim()
  if (cleanHex.length < 42) return null
  
  const isLittleEndian = cleanHex.substring(0, 2) === '01'
  const type = cleanHex.substring(2, 10)
  
  let coordsHex = ''
  if (type === '01000020' || type === '20000001') {
    // EWKB Point (with SRID)
    coordsHex = cleanHex.substring(18)
  } else if (type === '01000000' || type === '00000001') {
    // Standard WKB Point
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
        // GeoJSON stores [lng, lat]
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

interface ClusterItem<T> {
  id: string
  coords: [number, number]
  isCluster: boolean
  pointCount: number
  points: T[]
}

function computeClusters<T extends { id: string }>(
  points: { id: string; coords: [number, number]; data: T }[],
  zoom: number,
  prefix: string
): ClusterItem<T>[] {
  // If zoom is close enough, do not cluster
  if (zoom >= 14.5) {
    return points.map(p => ({
      id: p.id,
      coords: p.coords,
      isCluster: false,
      pointCount: 1,
      points: [p.data]
    }))
  }

  // Calculate cluster radius in degrees based on zoom
  // Lower zoom = larger radius
  const radius = 0.08 / Math.pow(2.2, zoom - 10)

  const clusters: ClusterItem<T>[] = []
  const visited = new Set<string>()

  for (let i = 0; i < points.length; i++) {
    const p1 = points[i]
    if (visited.has(p1.id)) continue

    visited.add(p1.id)
    const clusterPoints = [p1]

    for (let j = i + 1; j < points.length; j++) {
      const p2 = points[j]
      if (visited.has(p2.id)) continue

      const dx = p1.coords[0] - p2.coords[0]
      const dy = p1.coords[1] - p2.coords[1]
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < radius) {
        visited.add(p2.id)
        clusterPoints.push(p2)
      }
    }

    if (clusterPoints.length > 1) {
      let sumLng = 0
      let sumLat = 0
      clusterPoints.forEach(cp => {
        sumLng += cp.coords[0]
        sumLat += cp.coords[1]
      })
      clusters.push({
        id: `cluster-${prefix}-${p1.id}`,
        coords: [sumLng / clusterPoints.length, sumLat / clusterPoints.length],
        isCluster: true,
        pointCount: clusterPoints.length,
        points: clusterPoints.map(cp => cp.data)
      })
    } else {
      clusters.push({
        id: p1.id,
        coords: p1.coords,
        isCluster: false,
        pointCount: 1,
        points: [p1.data]
      })
    }
  }

  return clusters
}

const BASE_MAPS = {
  carto_dark: {
    name: 'Siber Mat Karanlık',
    url: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CartoDB &copy; OpenStreetMap'
  },
  carto_light: {
    name: 'Siber Açık Harita',
    url: 'https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CartoDB &copy; OpenStreetMap'
  },
  google_road: {
    name: 'Google Yol Haritası',
    url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    attribution: '&copy; Google Maps'
  },
  google_satellite: {
    name: 'Google Uydu Görüntüsü',
    url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    attribution: '&copy; Google Maps'
  },
  google_hybrid: {
    name: 'Google Hibrit Harita',
    url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    attribution: '&copy; Google Maps'
  },
  osm_standart: {
    name: 'OpenStreetMap Standart (Varsayılan)',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap'
  }
}

export default function Map({ 
  incidents, 
  hydrants, 
  vehicles = [], 
  externalMissions = [], 
  mode, 
  onMapClick, 
  focusLocation, 
  onUpdateHydrantStatus, 
  onDeleteIncident, 
  onEditIncident,
  showPersonnelLayer = true,
  defaultShowHydrants = true,
  onTogglePersonnelLayer,
  onCompleteExternalMission,
  isSimulation = false,
  simulationReason,
  onOpenCamera
}: MapProps) {
  const { resolvedTheme } = useTheme()
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const vehicleMarkersRef = useRef<maplibregl.Marker[]>([])
  const personnelMarkersRef = useRef<maplibregl.Marker[]>([])
  const hydrantElementsRef = useRef<{el: HTMLDivElement, coords: [number, number]}[]>([])
  const modeRef = useRef(mode)
  const onMapClickRef = useRef(onMapClick)
  const routeAnimFrameRef = useRef<number | null>(null)

  const [mapReady, setMapReady] = useState(false)
  const [activeBaseMap, setActiveBaseMap] = useState<'carto_dark' | 'carto_light' | 'google_road' | 'google_satellite' | 'google_hybrid' | 'osm_standart'>('osm_standart')
  const hasFitBoundsRef = useRef(false)

  // resolvedTheme'e göre otomatik altlık senkronizasyonu (Design.md 10.8)
  useEffect(() => {
    if (resolvedTheme === 'dark') {
      setActiveBaseMap('carto_dark')
    } else {
      setActiveBaseMap('carto_light')
    }
  }, [resolvedTheme])

  const [showBinalar, setShowBinalar] = useState(false)
  const [showNumarataj, setShowNumarataj] = useState(false)
  const [showMahalleler, setShowMahalleler] = useState(false)
  const [showSokaklar, setShowSokaklar] = useState(false)
  const [showHidrantlar, setShowHidrantlar] = useState(defaultShowHydrants)
  const [showPasifVakalar, setShowPasifVakalar] = useState(false)
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [binalarOpacity, setBinalarOpacity] = useState(0.3)
  const [mahallelerOpacity, setMahallelerOpacity] = useState(1.0)
  const [isLayerDrawerOpen, setIsLayerDrawerOpen] = useState(false)
  const [personnelList, setPersonnelList] = useState<any[]>([])

  // HUD Filter States
  const [onlyActiveIncidents, setOnlyActiveIncidents] = useState(false)
  const [onlyArizaliHydrants, setOnlyArizaliHydrants] = useState(false)
  const [showFilo, setShowFilo] = useState(true)
  const [onlyRunningVehicles, setOnlyRunningVehicles] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(14)

  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null)
  const [routeDuration, setRouteDuration] = useState<number | null>(null)
  const selectedIncidentRouteAnimFrameRef = useRef<number | null>(null)

  const { user } = useAuthStore()
  const [dispatchedVehicles, setDispatchedVehicles] = useState<any[]>([])
  const [dispatchedPersonnel, setDispatchedPersonnel] = useState<any[]>([])
  const [detailsLoading, setDetailsLoading] = useState(false)

  useEffect(() => {
    (window as any).completeExternalMission = (id: string) => {
      if (onCompleteExternalMission) {
        onCompleteExternalMission(id)
      }
    }
    return () => {
      delete (window as any).completeExternalMission
    }
  }, [onCompleteExternalMission])

  const isAuthorized = user && (
    user.rol === 'Admin' || 
    user.rol === 'Santral' ||
    (user.unvan || '').toLowerCase().includes('amir') || 
    (user.unvan || '').toLowerCase().includes('çavuş') ||
    (user.unvan || '').toLowerCase().includes('santral')
  )

  // Faz 28.55: Canlı Personel GPS Konum Polling Motoru
  useEffect(() => {
    let active = true
    const fetchPersonnel = () => {
      api.from('personnel')
        .select('sicil_no,ad,soyad,unvan,rol,son_enlem,son_boylam,son_guncelleme')
        .eq('aktif', true)
        .then(
          res => {
            if (!active) return
            if (res.data) {
              const withCoords = (res.data as any[]).filter(p => p.son_enlem !== null && p.son_boylam !== null)
              setPersonnelList(withCoords)
            }
          },
          (err: any) => {
            console.error("Map: Personnel fetch error:", err)
          }
        )
    }

    fetchPersonnel()
    const interval = setInterval(fetchPersonnel, 15000)

    return () => {
      active = false
      clearInterval(interval)
    }
  }, [])

  // Faz 28.55: Canlı Personel Harita Katmanı Sync Motoru
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    // Eski personelleri temizle
    personnelMarkersRef.current.forEach(m => m.remove())
    personnelMarkersRef.current = []

    if (showPersonnelLayer && personnelList && personnelList.length > 0) {
      personnelList.forEach((pers) => {
        const coords: [number, number] = [pers.son_boylam, pers.son_enlem]

        const el = document.createElement('div')
        el.className = 'map-marker-personnel'
        el.style.width = '30px'
        el.style.height = '30px'
        el.style.cursor = 'pointer'

        const innerEl = document.createElement('div')
        innerEl.className = 'map-marker-personnel-inner'
        innerEl.style.cssText = `
          width: 100%; height: 100%;
          background: rgba(15, 23, 42, 0.9);
          border: 2px solid #10b981;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #10b981;
          box-shadow: 0 0 10px rgba(16, 185, 129, 0.4);
          transition: all 0.3s;
        `
        
        innerEl.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        `
        el.appendChild(innerEl)

        const timeStr = pers.son_guncelleme 
          ? new Date(pers.son_guncelleme).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          : 'Bilinmiyor'

        const popup = new maplibregl.Popup({ offset: 12, maxWidth: '280px' }).setHTML(`
          <div style="font-family:inherit;padding:4.2px;color:var(--fd-text);line-height:1.5;">
            <div style="border-bottom:1px solid var(--fd-border);padding-bottom:6px;margin-bottom:6px;">
              <h3 style="font-weight:800;color:var(--fd-success);font-size:13px;margin:0;">👥 ${pers.ad} ${pers.soyad}</h3>
              <span style="font-size:10px;color:var(--fd-text3);font-weight:600;">${pers.unvan || 'İtfaiye Eri'}</span>
            </div>
            
            <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 8px;font-size:11px;font-family:monospace;">
              <span style="color:var(--fd-text3);font-weight:500;">Sicil No:</span>
              <span style="font-weight:700;color:var(--fd-text);text-align:right;">${pers.sicil_no}</span>
              
              <span style="color:var(--fd-text3);font-weight:500;">Rol:</span>
              <span style="font-weight:700;color:var(--fd-text);text-align:right;">${pers.rol}</span>

              <span style="color:var(--fd-text3);font-weight:500;">Enlem:</span>
              <span style="font-weight:600;color:var(--fd-text2);text-align:right;">${pers.son_enlem.toFixed(6)}</span>

              <span style="color:var(--fd-text3);font-weight:500;">Boylam:</span>
              <span style="font-weight:600;color:var(--fd-text2);text-align:right;">${pers.son_boylam.toFixed(6)}</span>

              <span style="color:var(--fd-text3);font-weight:500;">Güncelleme:</span>
              <span style="font-weight:700;color:var(--fd-success);text-align:right;">${timeStr}</span>
            </div>
          </div>
        `)

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat(coords)
          .setPopup(popup)
          .addTo(map)

        personnelMarkersRef.current.push(marker)
      })
    }

    return () => {
      personnelMarkersRef.current.forEach(m => m.remove())
      personnelMarkersRef.current = []
    }
  }, [personnelList, showPersonnelLayer, mapReady])

  // Dinamik Altlık Değiştirici Motoru
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    try {
      const source = map.getSource('osm-raster')
      if (source && 'setTiles' in source) {
        (source as any).setTiles([BASE_MAPS[activeBaseMap].url])
      }
    } catch (err) {
      console.warn("Base map tiles could not be updated dynamically:", err)
    }
  }, [activeBaseMap, mapReady])

  useEffect(() => {
    if (!selectedIncident || !selectedIncident.id) {
      setDispatchedVehicles([]);
      setDispatchedPersonnel([]);
      return;
    }

    const fetchIncidentDetails = async () => {
      setDetailsLoading(true);
      try {
        // 1. Fetch Dispatched Vehicles
        const { data: vData } = await api.from("incident_vehicles")
          .select("*")
          .eq("incident_id", selectedIncident.id);
        
        if (vData && Array.isArray(vData)) {
          const matched = vData.map(v => {
            const vInfo = (vehicles || []).find(item => item.plaka === v.plaka);
            return {
              plaka: v.plaka,
              marka: vInfo?.marka || '',
              model: vInfo?.model || '',
              arac_tipi: vInfo?.arac_tipi || ''
            };
          });
          setDispatchedVehicles(matched);
        } else {
          setDispatchedVehicles([]);
        }

        // 2. Fetch Dispatched Personnel
        const { data: pData } = await api.from("incident_personnel")
          .select("*")
          .eq("incident_id", selectedIncident.id);

        if (pData && Array.isArray(pData) && pData.length > 0) {
          const sicilNos = pData.map(p => p.sicil_no);
          
          const { data: personnelList } = await api.from("personnel")
            .select("*")
            .in("sicil_no", sicilNos);
          
          if (personnelList && Array.isArray(personnelList)) {
            const matchedP = pData.map(p => {
              const pInfo = personnelList.find(item => item.sicil_no === p.sicil_no);
              return {
                sicil_no: p.sicil_no,
                ad: pInfo?.ad || '',
                soyad: pInfo?.soyad || '',
                unvan: pInfo?.unvan || ''
              };
            });
            setDispatchedPersonnel(matchedP);
          } else {
            setDispatchedPersonnel([]);
          }
        } else {
          setDispatchedPersonnel([]);
        }
      } catch (err) {
        console.error("Error fetching incident details:", err);
      } finally {
        setDetailsLoading(false);
      }
    };

    fetchIncidentDetails();
  }, [selectedIncident, vehicles]);

  // ─── Filtered Data using Memoization ────────────────
  const filteredIncidents = useMemo(() => {
    return incidents.filter(inc => {
      const isPasif = inc.durum === 'BİTTİ' || inc.durum === 'KONTROL ALTINDA' || inc.durum === 'PASİF' || inc.status === 'closed' || inc.status === 'Tamamlandı' || inc.durum === 'Tamamlandı';
      
      // If "Sadece Aktif Vakalar" is active, we only keep active incidents (not isPasif)
      if (onlyActiveIncidents) {
        return !isPasif;
      }
      
      // Otherwise, follow general showPasifVakalar
      if (isPasif && !showPasifVakalar) {
        return false;
      }
      return true;
    });
  }, [incidents, onlyActiveIncidents, showPasifVakalar]);

  const filteredExternalMissions = useMemo(() => {
    return (externalMissions || []).filter(mission => {
      const isPasif = mission.durum === 'Tamamlandı' || mission.durum === 'İptal' || mission.durum === 'iptal';
      
      if (onlyActiveIncidents) {
        return !isPasif;
      }
      
      if (isPasif && !showPasifVakalar) {
        return false;
      }
      return true;
    });
  }, [externalMissions, onlyActiveIncidents, showPasifVakalar]);

  const filteredHydrants = useMemo(() => {
    // If "Sadece Aktif Vakalar" is active, all hydrants are hidden
    if (onlyActiveIncidents) {
      return [];
    }
    
    return hydrants.filter(hyd => {
      const isMevcut = hyd.durum === 'MEVCUT' || hyd.durum === 'Aktif';
      
      // If "Sadece Arızalı Hidrantlar" is active, hide operational ones
      if (onlyArizaliHydrants) {
        return !isMevcut;
      }
      
      // Otherwise, check general showHidrantlar setting
      return showHidrantlar;
    });
  }, [hydrants, onlyActiveIncidents, onlyArizaliHydrants, showHidrantlar]);

  const filteredVehicles = useMemo(() => {
    // If "Sadece Aktif Vakalar" is active, or if showFilo is false, hide all vehicles
    if (onlyActiveIncidents || !showFilo) {
      return [];
    }
    // Haritada gizlenecek araçlar (Müdür Makam Aracı vb.)
    const HIDDEN_PLATES = ['58 TD 315'];
    let list = (vehicles || []).filter((v: any) => {
      const plaka = (v.plaka || '').replace(/\s+/g, '').toUpperCase();
      return !HIDDEN_PLATES.some(hp => hp.replace(/\s+/g, '').toUpperCase() === plaka);
    });
    if (onlyRunningVehicles) {
      list = list.filter((v: any) => {
        // Stale check (dataTime older than 5 mins)
        const dTime = v.sonGuncelleme || v.dataTime;
        if (dTime) {
          const diffMs = Date.now() - new Date(dTime).getTime();
          if (diffMs > 5 * 60 * 1000) return false;
        }
        return v.kontak === 'aktif' || Number(v.hiz || v.speed || 0) > 5;
      });
    }
    return list;
  }, [vehicles, onlyActiveIncidents, showFilo, onlyRunningVehicles]);

  // Find vehicle/station coordinates closest to targetLngLat
  const getStartCoords = useCallback((targetLngLat: [number, number]): [number, number] => {
    if (filteredVehicles && filteredVehicles.length > 0) {
      let nearestCoords: [number, number] = STATION_COORDS;
      let minDistance = Infinity;
      filteredVehicles.forEach((veh, i) => {
        const count = filteredVehicles.length;
        const angle = (i * 2 * Math.PI) / count;
        const radius = 0.00035;
        const coords: [number, number] = [
          STATION_COORDS[0] + Math.cos(angle) * radius,
          STATION_COORDS[1] + Math.sin(angle) * radius
        ];
        const dist = Math.pow(coords[0] - targetLngLat[0], 2) + Math.pow(coords[1] - targetLngLat[1], 2);
        if (dist < minDistance) {
          minDistance = dist;
          nearestCoords = coords;
        }
      });
      return nearestCoords;
    }
    return STATION_COORDS;
  }, [filteredVehicles]);

  // ─── Auto-select incident from focusLocation ───────────
  useEffect(() => {
    if (!focusLocation || filteredIncidents.length === 0) return
    const [focusLat, focusLng] = focusLocation
    const matchingInc = filteredIncidents.find(inc => {
      const coords = parseLocation(inc.location)
      if (!coords) return false
      const dist = Math.pow(coords[1] - focusLat, 2) + Math.pow(coords[0] - focusLng, 2)
      return dist < 0.00001
    })
    if (matchingInc) {
      setSelectedIncident(matchingInc)
    }
  }, [focusLocation, filteredIncidents])

  useEffect(() => {
    onMapClickRef.current = onMapClick
  }, [onMapClick])

  // Keep modeRef in sync so the click handler can read the latest value
  useEffect(() => {
    modeRef.current = mode
    if (mapRef.current) {
      mapRef.current.getCanvas().style.cursor = mode !== 'idle' ? 'crosshair' : ''
    }
  }, [mode])

  // Listen for hydrant status toggle clicks (event delegation on map container)
  useEffect(() => {
    const container = mapContainerRef.current
    if (!container) return

    const handlePopupClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const btn = target.closest('.toggle-hydrant-btn') as HTMLButtonElement
      if (btn) {
        const id = btn.getAttribute('data-id')
        const current = btn.getAttribute('data-current')
        if (id && current && onUpdateHydrantStatus) {
          const newStatus = (current === 'MEVCUT' || current === 'Aktif') ? 'DEVRE_DIŞI' : 'MEVCUT'
          onUpdateHydrantStatus(id, newStatus)
        }
        return
      }

      const camBtn = target.closest('.open-camera-btn') as HTMLButtonElement
      if (camBtn) {
        const vId = camBtn.getAttribute('data-id')
        const vPlate = camBtn.getAttribute('data-plate')
        if (vId && vPlate && onOpenCamera) {
          onOpenCamera(vId, vPlate)
        }
      }
    }

    container.addEventListener('click', handlePopupClick)
    return () => {
      container.removeEventListener('click', handlePopupClick)
    }
  }, [onUpdateHydrantStatus])

  // ─── Helper: draw buffer + highlight hydrants + route ─────
  const drawAnalysisLayers = useCallback((map: maplibregl.Map, targetLngLat: [number, number]) => {
    // 1. Draw 300m Buffer (neon cyan)
    const buffer = turf.circle(targetLngLat, 0.3, { steps: 64, units: 'kilometers' })
    if (map.getSource('buffer-source')) {
      (map.getSource('buffer-source') as maplibregl.GeoJSONSource).setData(buffer)
    } else {
      map.addSource('buffer-source', { type: 'geojson', data: buffer })
      map.addLayer({
        id: 'buffer-layer',
        type: 'fill',
        source: 'buffer-source',
        paint: {
          'fill-color': '#3b82f6',
          'fill-opacity': 0.15
        }
      })
      map.addLayer({
        id: 'buffer-outline',
        type: 'line',
        source: 'buffer-source',
        paint: {
          'line-color': '#3b82f6',
          'line-width': 2,
          'line-dasharray': [2, 2]
        }
      })
    }

    // 2. Highlight Hydrants inside Buffer
    hydrantElementsRef.current.forEach(({ el, coords }) => {
      const pt = turf.point(coords)
      if (turf.booleanPointInPolygon(pt, buffer)) {
        el.style.background = '#22c55e'
        el.style.boxShadow = '0 0 15px 5px rgba(34,197,94,0.8)'
        el.style.transform = 'scale(1.2)'
        el.style.transition = 'all 0.3s'
      } else {
        el.style.background = '#3b82f6'
        el.style.boxShadow = '0 4px 12px rgba(59,130,246,0.5)'
        el.style.transform = 'scale(1)'
      }
    })

    // 3. Animated OSRM Route from Station (neon orange)
    if (routeAnimFrameRef.current) {
      cancelAnimationFrame(routeAnimFrameRef.current)
      routeAnimFrameRef.current = null
    }

    fetch(`https://router.project-osrm.org/route/v1/driving/${STATION_COORDS[0]},${STATION_COORDS[1]};${targetLngLat[0]},${targetLngLat[1]}?overview=full&geometries=geojson`)
      .then(res => res.json())
      .then(data => {
        // Safe guard against map being removed/destroyed before fetch finishes
        if (!mapRef.current || mapRef.current !== map) return
        try {
          if (!map.getStyle || !map.getStyle()) return

          if (data.routes && data.routes[0]) {
            const routeGeojson = data.routes[0].geometry

            if (map.getSource('route-source')) {
              (map.getSource('route-source') as maplibregl.GeoJSONSource).setData(routeGeojson)
            } else {
              map.addSource('route-source', { type: 'geojson', data: routeGeojson })

              // Background line
              map.addLayer({
                id: 'route-line-bg',
                type: 'line',
                source: 'route-source',
                paint: {
                  'line-color': '#ef4444',
                  'line-width': 5,
                  'line-opacity': 0.3
                }
              })

              // Animated dashed line
              map.addLayer({
                id: 'route-line-animated',
                type: 'line',
                source: 'route-source',
                paint: {
                  'line-color': '#ef4444',
                  'line-width': 5,
                  'line-dasharray': [0, 4, 3]
                }
              })
            }

            // Setup dash animation
            const dashArraySeq = [
              [0, 4, 3],
              [0.5, 4, 2.5],
              [1, 4, 2],
              [1.5, 4, 1.5],
              [2, 4, 1],
              [2.5, 4, 0.5],
              [3, 4, 0],
              [0, 0, 3, 4],
              [0, 0.5, 3, 3.5],
              [0, 1, 3, 3],
              [0, 1.5, 3, 2.5],
              [0, 2, 3, 2],
              [0, 2.5, 3, 1.5],
              [0, 3, 3, 1],
              [0, 3.5, 3, 0.5]
            ]
            let step = 0

            const animateDashArray = () => {
              // Safe guard against map being removed or replaced
              if (!mapRef.current || mapRef.current !== map) return
              try {
                if (!map.getStyle || !map.getStyle() || !map.getLayer('route-line-animated')) return
                step = (step + 1) % dashArraySeq.length
                map.setPaintProperty('route-line-animated', 'line-dasharray', dashArraySeq[step])
                routeAnimFrameRef.current = requestAnimationFrame(() => {
                  setTimeout(animateDashArray, 50)
                })
              } catch (e) {
                console.warn("Map route animation safely stopped:", e)
              }
            }
            animateDashArray()
          }
        } catch (e) {
          console.error("Error drawing OSRM route analysis layers:", e)
        }
      })
      .catch(err => console.error("OSRM Route Error:", err))
  }, [])

  // ─── Initialize MapLibre GL (3D Dark Tactical View) ───────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8 as const,
        name: 'Sivas İtfaiye CBS',
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
          'osm-raster': {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap'
          }
        },
        layers: [
          {
            id: 'osm-base',
            type: 'raster',
            source: 'osm-raster',
            minzoom: 0,
            maxzoom: 19
          }
        ]
      },
      center: STATION_COORDS,
      zoom: 14,
      maxZoom: 19,
      attributionControl: {}
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')

    // ─── Canlı GPS Konum Bulucu (Geolocation) ───────────────
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true
      }),
      'top-right'
    )

    // ─── Sivas Akıllı Şehir Vektör Katmanları Entegrasyonu ───
    map.on('load', () => {
      // Binalar Vektör Kaynağı
      map.addSource('binalar', {
        type: 'vector',
        tiles: ['https://harita.sivas.bel.tr/binalar/{z}/{x}/{y}']
      })

      // Binalar Dolgu Katmanı
      map.addLayer({
        id: 'binalar-fill',
        type: 'fill',
        source: 'binalar',
        'source-layer': 'binalar',
        paint: {
          'fill-color': '#3b82f6',
          'fill-opacity': binalarOpacity
        },
        layout: {
          visibility: showBinalar ? 'visible' : 'none'
        }
      })

      // Binalar Dış Hat Çizgisi
      map.addLayer({
        id: 'binalar-outline',
        type: 'line',
        source: 'binalar',
        'source-layer': 'binalar',
        paint: {
          'line-color': '#3b82f6',
          'line-width': 0.8,
          'line-opacity': 0.6
        },
        layout: {
          visibility: showBinalar ? 'visible' : 'none'
        }
      })

      // Numarataj Vektör Kaynağı
      map.addSource('numarataj', {
        type: 'vector',
        tiles: ['https://harita.sivas.bel.tr/numarataj/{z}/{x}/{y}']
      })

      // Numarataj Metin Katmanı
      map.addLayer({
        id: 'numarataj-layer',
        type: 'symbol',
        source: 'numarataj',
        'source-layer': 'numarataj',
        layout: {
          'text-field': ['coalesce', ['get', 'kapino'], ['get', 'kapi_no'], ['get', 'kapiNo'], ''],
          'text-size': 11,
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
          'text-offset': [0, 0],
          'text-anchor': 'center',
          visibility: showNumarataj ? 'visible' : 'none'
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#0f172a',
          'text-halo-width': 1.5
        }
      })

      // Mahalleler Vektör Kaynağı
      map.addSource('mahalleler', {
        type: 'vector',
        tiles: ['https://harita.sivas.bel.tr/mahalleler/{z}/{x}/{y}']
      })

      // Mahalleler Çizgi Katmanı
      map.addLayer({
        id: 'mahalleler-layer',
        type: 'line',
        source: 'mahalleler',
        'source-layer': 'mahalleler',
        paint: {
          'line-color': '#0ea5e9',
          'line-width': 1.2,
          'line-dasharray': [4, 2],
          'line-opacity': mahallelerOpacity
        },
        layout: {
          visibility: showMahalleler ? 'visible' : 'none'
        }
      })

      // Sokaklar Vektör Kaynağı
      map.addSource('sokaklar', {
        type: 'vector',
        tiles: ['https://harita.sivas.bel.tr/sokaklar/{z}/{x}/{y}']
      })

      // Sokaklar Çizgi Katmanı
      map.addLayer({
        id: 'sokaklar-layer',
        type: 'line',
        source: 'sokaklar',
        'source-layer': 'sokaklar',
        paint: {
          'line-color': '#06b6d4',
          'line-width': 1.0,
          'line-opacity': 0.3
        },
        layout: {
          visibility: showSokaklar ? 'visible' : 'none'
        }
      })
    })



    // ─── Error handler for tile/source loading problems ─────
    map.on('error', (e) => {
      console.error('[MapLibre Hata]', {
        message: e.error?.message || e.message || 'Bilinmeyen hata',
        sourceId: (e as any).sourceId,
        error: e.error || e
      })
    })

    // Map click handler — uses modeRef so it always reads latest mode
    map.on('click', (e) => {
      if (modeRef.current !== 'idle') {
        const clickedLngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat]

        // Draw analysis layers from the exact click point
        drawAnalysisLayers(map, clickedLngLat)

        // Notify parent (opens modal, does reverse geocoding)
        onMapClickRef.current(e.lngLat.lat, e.lngLat.lng)
      }
    })

    mapRef.current = map
    setMapReady(true)

    // Track zoom level end for performance-optimized clustering
    map.on('zoomend', () => {
      setZoomLevel(map.getZoom())
    })

    return () => {
      if (routeAnimFrameRef.current) {
        cancelAnimationFrame(routeAnimFrameRef.current)
      }
      if (selectedIncidentRouteAnimFrameRef.current) {
        cancelAnimationFrame(selectedIncidentRouteAnimFrameRef.current)
      }
      map.remove()
      mapRef.current = null
      setMapReady(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Sync markers for incidents & hydrants ────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    console.log("Map: Syncing markers. Hydrants count:", filteredHydrants.length, "Incidents count:", filteredIncidents.length);

    // Clear old markers
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    // Helper: Render Cluster Marker (cyan-neon for hydrants, slate/grey for incidents)
    const renderClusterMarker = (coords: [number, number], count: number, type: 'hydrant' | 'incident') => {
      const el = document.createElement('div')
      el.style.width = '42px'
      el.style.height = '42px'
      el.style.cursor = 'pointer'

      const color = type === 'hydrant' ? '#22d3ee' : '#cbd5e1' // cyan-neon for hydrants, slate/grey for incidents
      const glowShadow = type === 'hydrant' 
        ? '0 0 15px rgba(34, 211, 238, 0.8), inset 0 0 10px rgba(34, 211, 238, 0.4)'
        : '0 0 15px rgba(148, 163, 184, 0.8), inset 0 0 10px rgba(148, 163, 184, 0.4)'

      el.className = 'map-marker-cluster-pulse'
      el.style.cssText = `
        width: 42px;
        height: 42px;
        border-radius: 50%;
        border: 2px solid ${color};
        background: rgba(15, 23, 42, 0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 800;
        font-size: 13px;
        color: ${color};
        box-shadow: ${glowShadow};
        font-family: monospace;
        transition: transform 0.2s ease;
      `
      el.innerHTML = `<span>${count}</span>`

      // Fly to cluster centroid on click
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        const currentZoom = map.getZoom()
        map.flyTo({
          center: coords,
          zoom: Math.min(currentZoom + 2, 16),
          essential: true
        })
      })

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat(coords)
        .addTo(map)

      markersRef.current.push(marker)
    }

    // Helper: Render Individual Incident Marker
    const renderIndividualIncident = (inc: Incident, coords: [number, number], isPasif: boolean) => {
      const triage = getTriageInfo(inc.olay_turu)
      
      const el = document.createElement('div')
      el.style.width = '34px'
      el.style.height = '34px'
      if (isPasif) {
        el.style.opacity = '0.4'
      }
      
      const innerEl = document.createElement('div')
      innerEl.className = `map-marker-incident${isPasif ? '' : ` ${triage.glowClass}`}`
      innerEl.style.cssText = `
        width: 100%; height: 100%;
        background: ${isPasif ? '#ffffff' : triage.color};
        border: 2px solid ${isPasif ? '#94a3b8' : '#fff'};
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: ${isPasif ? '#64748b' : 'white'};
      `
      innerEl.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="filter: ${isPasif ? 'none' : 'drop-shadow(0 0 2px rgba(0,0,0,0.3))'};">
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
        </svg>
      `
      innerEl.addEventListener('click', (e) => {
        e.stopPropagation()
        setSelectedIncident(inc)
      })
      el.appendChild(innerEl)

      const statusLabel = isPasif ? (inc.durum || 'PASİF / BİTTİ') : triage.label;
      const statusColor = isPasif ? '#94a3b8' : triage.color;

      const popup = new maplibregl.Popup({ offset: 18, maxWidth: '280px' }).setHTML(`
        <div style="font-family:inherit;padding:4px 0;color:var(--fd-text);">
          <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--fd-border);padding-bottom:6px;margin-bottom:6px;gap:8px">
            <h3 style="font-weight:700;color:${isPasif ? 'var(--fd-text2)' : triage.color};font-size:13.5px;margin:0">${inc.olay_turu}</h3>
            <span style="font-size:9.5px;font-weight:800;padding:2px 6px;border-radius:9999px;background:${statusColor}20;color:${statusColor};border:1px solid ${statusColor}40">${statusLabel}</span>
          </div>
          <p style="font-size:12px;margin:3px 0;color:var(--fd-text2);"><strong style="color:var(--fd-text3);font-weight:500;">Mahalle:</strong> ${inc.mahalle || '-'}</p>
          <p style="font-size:12px;margin:3px 0;color:var(--fd-text2);"><strong style="color:var(--fd-text3);font-weight:500;">Adres:</strong> ${inc.adres || '-'}</p>
          <p style="font-size:11px;color:var(--fd-text3);margin-top:6px;display:flex;align-items:center;gap:4px;">
            <span style="opacity:0.7">🕒</span>
            <span>${inc.cikis_saati ? new Date(inc.cikis_saati).toLocaleString('tr-TR') : 'Zaman bilgisi yok'}</span>
          </p>
        </div>
      `)

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat(coords)
        .setPopup(popup)
        .addTo(map)

      markersRef.current.push(marker)
    }

    // Helper: Render Individual External Mission Marker
    const renderIndividualExternalMission = (mission: any, coords: [number, number]) => {
      const isLojistik = mission.gorev_turu === 'Lojistik Sevk'
      const color = isLojistik ? '#22c55e' : '#3b82f6' // green for logistics, blue for social
      const bg = isLojistik ? 'rgba(34, 197, 94, 0.15)' : 'rgba(59, 130, 246, 0.15)'

      const el = document.createElement('div')
      el.style.width = '34px'
      el.style.height = '34px'

      const innerEl = document.createElement('div')
      innerEl.style.cssText = `
        width: 100%; height: 100%;
        background: ${bg};
        border: 2px solid ${color};
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: ${color};
        box-shadow: 0 0 10px ${color}80;
        transition: transform 0.2s;
      `

      const svgIcon = isLojistik
        ? `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6H5a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h13l4-3.5L18 6Z"/><path d="M12 13v9"/><path d="M12 2v4"/><path d="M8 22h8"/></svg>`

      innerEl.innerHTML = svgIcon
      el.appendChild(innerEl)

      const popup = new maplibregl.Popup({ offset: 18, maxWidth: '280px' }).setHTML(`
        <div style="font-family:inherit;padding:4px 0;color:var(--fd-text);">
          <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--fd-border);padding-bottom:6px;margin-bottom:6px;gap:8px">
            <h3 style="font-weight:700;color:${color};font-size:13.5px;margin:0">${mission.baslik}</h3>
            <span style="font-size:9.5px;font-weight:800;padding:2px 6px;border-radius:9999px;background:${color}20;color:${color};border:1px solid ${color}40">${mission.gorev_turu}</span>
          </div>
          <p style="font-size:12px;margin:3px 0;color:var(--fd-text2);"><strong style="color:var(--fd-text3);font-weight:500;">Adres:</strong> ${mission.adres || '-'}</p>
          <p style="font-size:12px;margin:3px 0;color:var(--fd-text2);"><strong style="color:var(--fd-text3);font-weight:500;">Detay:</strong> ${mission.detay || '-'}</p>
          <p style="font-size:12px;margin:3px 0;color:var(--fd-text2);"><strong style="color:var(--fd-text3);font-weight:500;">Araç:</strong> ${mission.plaka || '-'}</p>
          <p style="font-size:12px;margin:3px 0;color:var(--fd-text2);"><strong style="color:var(--fd-text3);font-weight:500;">Görevli Personel:</strong> ${mission.personnel_names || mission.sicil_no || '-'}</p>
          <p style="font-size:12px;margin:3px 0;color:var(--fd-text2);"><strong style="color:var(--fd-text3);font-weight:500;">Durum:</strong> ${mission.durum || 'Aktif'}</p>
          <p style="font-size:11px;color:var(--fd-text3);margin-top:6px;display:flex;align-items:center;gap:4px;">
            <span style="opacity:0.7">🕒</span>
            <span>Çıkış: ${mission.cikis_tarihi ? new Date(mission.cikis_tarihi).toLocaleString('tr-TR') : 'Zaman bilgisi yok'}</span>
          </p>
          ${mission.durum !== 'Tamamlandı' ? `
            <div style="margin-top:8px;border-top:1px solid var(--fd-border);padding-top:8px;text-align:right;">
              <button 
                onclick="window.completeExternalMission('${mission.id}')"
                style="background:var(--fd-danger);color:#fff;border:none;padding:5px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;transition:all 0.2s;"
                onmouseover="this.style.opacity='0.9'"
                onmouseout="this.style.opacity='1'"
              >
                Görevi Sonlandır
              </button>
            </div>
          ` : ''}
        </div>
      `)

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat(coords)
        .setPopup(popup)
        .addTo(map)

      markersRef.current.push(marker)
    }

    // Helper: Render Individual Hydrant Marker
    const renderIndividualHydrant = (hyd: Hydrant, coords: [number, number]) => {
      const isMevcut = hyd.durum === 'MEVCUT' || hyd.durum === 'Aktif'
      
      const el = document.createElement('div')
      el.style.width = '32px'
      el.style.height = '32px'
      
      const innerEl = document.createElement('div')
      innerEl.className = `map-marker-hydrant ${isMevcut ? 'map-marker-hydrant-pulse-green' : 'map-marker-hydrant-pulse-red'}`
      innerEl.style.cssText = `
        width: 100%; height: 100%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      `
      
      const gradientId = `hydrant-grad-${hyd.id}`
      
      innerEl.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" style="width: 100%; height: 100%; filter: ${isMevcut ? 'drop-shadow(0 0 8px rgba(34, 197, 94, 0.8))' : 'drop-shadow(0 0 8px rgba(239, 68, 68, 0.8))'};">
          <!-- Modern upward-tapering droplet/shield form for shape-coding -->
          <path d="M50 5 C50 5 82 45 82 68 A32 32 0 1 1 18 68 C18 45 50 5 50 5 Z" fill="url(#${gradientId})" stroke="#ffffff" stroke-width="3"/>
          <!-- Elegant premium fire hydrant graphics positioned perfectly inside the shape -->
          <g transform="translate(0, 10)">
            <path d="M35 42 L35 70 C35 76 65 76 65 70 L65 42 Z" fill="#ffffff" opacity="0.95"/>
            <path d="M30 32 H70 V42 H30 Z" fill="#ffffff"/>
            <circle cx="50" cy="22" r="8" fill="#ffffff"/>
            <path d="M50 48 C53 52 53 58 50 62 C47 58 47 52 50 48 Z" fill="${isMevcut ? '#22c55e' : '#ef4444'}"/>
          </g>
          <defs>
            <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="${isMevcut ? '#22c55e' : '#ef4444'}" />
              <stop offset="100%" stop-color="${isMevcut ? '#15803d' : '#b91c1c'}" />
            </linearGradient>
          </defs>
        </svg>
      `
      el.appendChild(innerEl)

      const popup = new maplibregl.Popup({ offset: 16, maxWidth: '280px' }).setHTML(`
        <div style="font-family:inherit;padding:4px;color:var(--fd-text);line-height:1.5;">
          <h3 style="font-weight:800;color:${isMevcut ? 'var(--fd-success)' : 'var(--fd-danger)'};font-size:14px;border-bottom:1px solid var(--fd-border);padding-bottom:6px;margin:0 0 6px 0;display:flex;align-items:center;gap:6px;">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background-color:${isMevcut ? 'var(--fd-success)' : 'var(--fd-danger)'};box-shadow:0 0 6px ${isMevcut ? 'var(--fd-success)' : 'var(--fd-danger)'}"></span>
            Yangın Hidrantı #${hyd.no}
          </h3>
          <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 8px;font-size:12px;">
            <span style="color:var(--fd-text3);font-weight:500;">Durum:</span>
            <span style="font-weight:700;color:${isMevcut ? 'var(--fd-success)' : 'var(--fd-danger)'}">${isMevcut ? 'MEVCUT (Çalışıyor)' : 'DEVRE_DIŞI (Arızalı)'}</span>
            
            <span style="color:var(--fd-text3);font-weight:500;">Kalite:</span>
            <span style="font-weight:600;color:var(--fd-text);">${hyd.kalite || 'Belirtilmemiş'}</span>
            
            <span style="color:var(--fd-text3);font-weight:500;">İmalatçı:</span>
            <span style="font-weight:600;color:var(--fd-text);">${hyd.imalatci || 'Sivas Belediyesi'}</span>
            
            ${hyd.proje_adi ? `
            <span style="color:var(--fd-text3);font-weight:500;grid-column:1/3;margin-top:4px;">Konum Detayı:</span>
            <span style="grid-column:1/3;color:var(--fd-text2);background:var(--fd-surface2);padding:6px;border-radius:4px;font-size:11px;line-height:1.4;border:1px solid var(--fd-border);word-break:break-word;">${hyd.proje_adi}</span>
            ` : ''}

            <div style="grid-column:1/3;margin-top:8px;">
              <button class="toggle-hydrant-btn" data-id="${hyd.id}" data-current="${hyd.durum}" style="width:100%;background:${isMevcut ? 'var(--fd-danger)' : 'var(--fd-success)'};color:#ffffff;border:none;border-radius:6px;padding:6px 12px;font-size:11px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;transition:all 0.2s;box-shadow:var(--fd-shadow-sm);">
                <span>🔧</span> ${isMevcut ? 'Arızalı / Devre Dışı Yap' : 'Çalışır / Mevcut Yap'}
              </button>
            </div>
          </div>
        </div>
      `)

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat(coords)
        .setPopup(popup)
        .addTo(map)

      markersRef.current.push(marker)
      hydrantElementsRef.current.push({ el: innerEl, coords })
    }

    // Helper: Render Fire Station Markers
    const renderFireStations = () => {
      const stations = [
        {
          name: "Merkez İstasyon Yerleşkesi",
          desc: "Sivas Belediyesi İtfaiye Müdürlüğü",
          addr: "Yenişehir, Merkez",
          coords: STATION_COORDS // [37.0209312, 39.7339522]
        },
        {
          name: "Esentepe Şubesi Yerleşkesi",
          desc: "Sivas Belediyesi İtfaiye Esentepe Şubesi",
          addr: "Tuzlugöl Mahallesi, Merkez",
          coords: [36.988576, 39.748762] as [number, number]
        },
        {
          name: "Organize Sanayi (OSB) Şubesi Yerleşkesi",
          desc: "Sivas Belediyesi İtfaiye OSB Şubesi",
          addr: "1. OSB, Kılavuz, Merkez",
          coords: [37.085315, 39.786707] as [number, number]
        }
      ]

      stations.forEach(station => {
        const stationEl = document.createElement('div')
        stationEl.className = 'map-marker-station'
        stationEl.style.cssText = `
          width: 44px; height: 44px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        `
        const gradientId = `station-grad-neon-${station.name.replace(/\s+/g, '-')}`
        stationEl.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" style="width: 100%; height: 100%; filter: drop-shadow(0 0 8px rgba(239,68,68,0.7));">
            <!-- Neon red outer ring with self-contained CSS spin animation -->
            <circle cx="50" cy="50" r="44" fill="none" stroke="#ef4444" stroke-width="3" class="station-neon-ring" style="stroke-dasharray: 4, 2;"/>
            <!-- Outer shield border -->
            <path d="M50 8 L86 22 L86 52 C86 70 73 85 50 90 C27 85 14 70 14 52 L14 22 Z" fill="url(#${gradientId})" stroke="#ffffff" stroke-width="2"/>
            <!-- Inner details -->
            <path d="M35 78 L35 48 L65 48 L65 78 Z" fill="#ffffff" opacity="0.15"/>
            <path d="M50 22 C58 34 58 50 50 62 C42 50 42 34 50 22 Z" fill="#ffffff"/>
            <path d="M50 30 C53 38 53 47 50 54 C47 47 47 38 50 30 Z" fill="#ef4444"/>
            <defs>
              <style>
                @keyframes station-spin {
                  from { transform: rotate(0deg); transform-origin: 50px 50px; }
                  to { transform: rotate(360deg); transform-origin: 50px 50px; }
                }
                .station-neon-ring {
                  animation: station-spin 12s linear infinite;
                }
              </style>
              <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#ef4444" />
                <stop offset="100%" stop-color="#991b1b" />
              </linearGradient>
            </defs>
          </svg>
        `

        const stationPopup = new maplibregl.Popup({ offset: 20 }).setHTML(`
          <div style="font-family:inherit;padding:6px;color:var(--fd-text);">
            <h3 style="font-weight:800;color:var(--fd-danger);font-size:14px;border-bottom:1px solid var(--fd-border);padding-bottom:4px;margin-bottom:4px">${station.name}</h3>
            <p style="font-size:12px;margin:2px 0;color:var(--fd-text2);font-weight:500;">${station.desc}</p>
            <p style="font-size:11px;color:var(--fd-text3);margin-top:2px;display:flex;align-items:center;gap:4px;">
              <span>📍</span>
              <span>${station.addr}</span>
            </p>
          </div>
        `)

        const stationMarker = new maplibregl.Marker({ element: stationEl })
          .setLngLat(station.coords)
          .setPopup(stationPopup)
          .addTo(map)

        markersRef.current.push(stationMarker)
      })
    }

    // ─── Render Incidents (Separating active/pasif for clustering) ───
    if (!showHeatmap) {
      const activeIncidents = filteredIncidents.filter(inc => {
        const isPasif = inc.durum === 'BİTTİ' || inc.durum === 'KONTROL ALTINDA' || inc.durum === 'PASİF' || inc.status === 'closed' || inc.status === 'Tamamlandı' || inc.durum === 'Tamamlandı';
        return !isPasif;
      });

      const pasifIncidents = filteredIncidents.filter(inc => {
        const isPasif = inc.durum === 'BİTTİ' || inc.durum === 'KONTROL ALTINDA' || inc.durum === 'PASİF' || inc.status === 'closed' || inc.status === 'Tamamlandı' || inc.durum === 'Tamamlandı';
        return isPasif;
      });

      // 1. Render active incidents (always individual, never clustered)
      activeIncidents.forEach(inc => {
        const coords = parseLocation(inc.location)
        if (!coords) return
        renderIndividualIncident(inc, coords, false)
      });

      // 2. Render pasif incidents (clustered)
      const pasifIncidentPoints = pasifIncidents.map(inc => {
        const coords = parseLocation(inc.location);
        return {
          id: inc.id,
          coords: coords || [0, 0] as [number, number],
          data: inc
        };
      }).filter(p => p.coords[0] !== 0 || p.coords[1] !== 0);

      const clusteredPasifIncidents = computeClusters(pasifIncidentPoints, zoomLevel, 'incident');

      clusteredPasifIncidents.forEach(item => {
        if (item.isCluster) {
          renderClusterMarker(item.coords, item.pointCount, 'incident');
        } else {
          const inc = item.points[0];
          const coords = item.coords;
          renderIndividualIncident(inc, coords, true);
        }
      });
    }

    // ─── Render Hydrants (Clustered) ───
    hydrantElementsRef.current = []

    const hydrantPoints = filteredHydrants.map(hyd => {
      const coords = parseLocation(hyd.location);
      return {
        id: hyd.id,
        coords: coords || [0, 0] as [number, number],
        data: hyd
      };
    }).filter(p => p.coords[0] !== 0 || p.coords[1] !== 0);

    const clusteredHydrants = computeClusters(hydrantPoints, zoomLevel, 'hydrant');

    clusteredHydrants.forEach(item => {
      if (item.isCluster) {
        renderClusterMarker(item.coords, item.pointCount, 'hydrant');
      } else {
        const hyd = item.points[0];
        const coords = item.coords;
        renderIndividualHydrant(hyd, coords);
      }
    });

    // ─── Render Fire Stations ───
    renderFireStations();

    // ─── Render External Missions ───
    (filteredExternalMissions || []).forEach((mission: any) => {
      const coords = parseLocation(mission.hedef_koordinat)
      if (coords) {
        renderIndividualExternalMission(mission, coords)
      }
    });

    // ─── Fit Bounds ───
    if (filteredHydrants.length > 0 && !hasFitBoundsRef.current) {
      const bounds = new maplibregl.LngLatBounds()
      let hasValidCoords = false
      filteredHydrants.forEach(hyd => {
        const coords = parseLocation(hyd.location)
        if (coords) {
          bounds.extend(coords)
          hasValidCoords = true
        }
      })
      if (hasValidCoords) {
        map.fitBounds(bounds, { padding: 80, maxZoom: 15 })
        hasFitBoundsRef.current = true
      }
    }

  }, [filteredIncidents, filteredHydrants, filteredExternalMissions, zoomLevel, mapReady, showHeatmap])

  // ─── Heatmap Layer Effect ───────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    const sourceId = 'incidents-heatmap-source'
    const layerId = 'incidents-heatmap-layer'

    if (showHeatmap) {
      const features = incidents.map(inc => {
        const coords = parseLocation(inc.location)
        if (!coords) return null
        return {
          type: 'Feature' as const,
          geometry: {
            type: 'Point' as const,
            coordinates: coords // [lng, lat]
          },
          properties: {
            id: inc.id,
            olay_turu: inc.olay_turu
          }
        }
      }).filter(Boolean) as any[]

      const geojson = {
        type: 'FeatureCollection' as const,
        features
      }

      if (map.getSource(sourceId)) {
        (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(geojson)
      } else {
        map.addSource(sourceId, { type: 'geojson', data: geojson })
      }

      if (!map.getLayer(layerId)) {
        map.addLayer({
          id: layerId,
          type: 'heatmap',
          source: sourceId,
          maxzoom: 18,
          paint: {
            'heatmap-weight': 1,
            'heatmap-intensity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              0, 1,
              18, 3
            ],
            'heatmap-color': [
              'interpolate',
              ['linear'],
              ['heatmap-density'],
              0, 'rgba(0, 0, 0, 0)',
              0.2, 'rgba(234, 179, 8, 0.4)', // Neon Yellow/Orange low density
              0.5, 'rgba(249, 115, 22, 0.7)', // Orange medium density
              0.8, 'rgba(239, 68, 68, 0.95)', // Matte Red high density
              1.0, 'rgba(220, 38, 38, 1.0)' // Crimson red very high
            ],
            'heatmap-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              0, 3,
              18, 25
            ],
            'heatmap-opacity': 0.85
          }
        })
      } else {
        map.setLayoutProperty(layerId, 'visibility', 'visible')
      }
    } else {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', 'none')
      }
    }
  }, [showHeatmap, incidents, mapReady])

  // ─── Selected Incident OSRM Route Effect ──────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    const sourceId = 'selected-incident-route-source'
    const layerBgId = 'selected-incident-route-line-bg'
    const layerAnimatedId = 'selected-incident-route-line-animated'

    if (selectedIncidentRouteAnimFrameRef.current) {
      cancelAnimationFrame(selectedIncidentRouteAnimFrameRef.current)
      selectedIncidentRouteAnimFrameRef.current = null
    }

    if (!selectedIncident) {
      if (map.getLayer(layerBgId)) map.setLayoutProperty(layerBgId, 'visibility', 'none')
      if (map.getLayer(layerAnimatedId)) map.setLayoutProperty(layerAnimatedId, 'visibility', 'none')
      setRouteDuration(null)
      return
    }

    const incidentCoords = parseLocation(selectedIncident.location)
    if (!incidentCoords) {
      setRouteDuration(null)
      return
    }

    const startCoords = getStartCoords(incidentCoords)

    fetch(`https://router.project-osrm.org/route/v1/driving/${startCoords[0]},${startCoords[1]};${incidentCoords[0]},${incidentCoords[1]}?overview=full&geometries=geojson`)
      .then(res => res.json())
      .then(data => {
        if (!mapRef.current) return
        try {
          if (!map.getStyle || !map.getStyle()) return

          if (data.routes && data.routes[0]) {
            const routeGeojson = data.routes[0].geometry
            const durationSec = data.routes[0].duration
            const durationMin = Math.max(1, Math.round(durationSec / 60))
            setRouteDuration(durationMin)

            if (map.getSource(sourceId)) {
              (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(routeGeojson)
            } else {
              map.addSource(sourceId, { type: 'geojson', data: routeGeojson })
            }

            if (!map.getLayer(layerBgId)) {
              map.addLayer({
                id: layerBgId,
                type: 'line',
                source: sourceId,
                paint: {
                  'line-color': '#06b6d4',
                  'line-width': 6,
                  'line-opacity': 0.25
                }
              })
            } else {
              map.setLayoutProperty(layerBgId, 'visibility', 'visible')
            }

            if (!map.getLayer(layerAnimatedId)) {
              map.addLayer({
                id: layerAnimatedId,
                type: 'line',
                source: sourceId,
                paint: {
                  'line-color': '#06b6d4',
                  'line-width': 4.5,
                  'line-opacity': 0.9,
                  'line-dasharray': [0, 4, 3]
                }
              })
            } else {
              map.setLayoutProperty(layerAnimatedId, 'visibility', 'visible')
            }

            const dashArraySeq = [
              [0, 4, 3],
              [0.5, 4, 2.5],
              [1, 4, 2],
              [1.5, 4, 1.5],
              [2, 4, 1],
              [2.5, 4, 0.5],
              [3, 4, 0],
              [0, 0, 3, 4],
              [0, 0.5, 3, 3.5],
              [0, 1, 3, 3],
              [0, 1.5, 3, 2.5],
              [0, 2, 3, 2],
              [0, 2.5, 3, 1.5],
              [0, 3, 3, 1],
              [0, 3.5, 3, 0.5]
            ]
            let step = 0

            const animateDashArray = () => {
              if (!mapRef.current) return
              try {
                if (!map.getStyle || !map.getStyle() || !map.getLayer(layerAnimatedId)) return
                step = (step + 1) % dashArraySeq.length
                map.setPaintProperty(layerAnimatedId, 'line-dasharray', dashArraySeq[step])
                selectedIncidentRouteAnimFrameRef.current = requestAnimationFrame(() => {
                  setTimeout(animateDashArray, 50)
                })
              } catch (e) {
                console.warn("Incident route animation safely stopped:", e)
              }
            }
            animateDashArray()
          }
        } catch (e) {
          console.error("Error drawing selected incident route:", e)
        }
      })
      .catch(err => console.error("Selected Incident OSRM Route Error:", err))
  }, [selectedIncident, mapReady, getStartCoords])

  // ─── Sync markers for vehicles ────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    // Clear old vehicle markers
    vehicleMarkersRef.current.forEach(m => m.remove())
    vehicleMarkersRef.current = []

    if (filteredVehicles && filteredVehicles.length > 0) {
      filteredVehicles.forEach((veh, i) => {
        const count = filteredVehicles.length
        const angle = (i * 2 * Math.PI) / count
        const radius = 0.00035 // cluster around Sivas fire station coordinates beautifully
        const lngOffset = Math.cos(angle) * radius
        const latOffset = Math.sin(angle) * radius
        
        const branchStr = (veh.current_branch || veh.istasyon || '').toLowerCase();
        let defaultCenter: [number, number] = STATION_COORDS; // Merkez
        if (branchStr.includes('esentepe')) {
          defaultCenter = [36.988576, 39.748762]; // Esentepe coordinates
        } else if (branchStr.includes('osb') || branchStr.includes('organize')) {
          defaultCenter = [37.085315, 39.786707]; // OSB coordinates
        }

        let coords: [number, number] = [defaultCenter[0] + lngOffset, defaultCenter[1] + latOffset]
        const vAny = veh as any
        const vLat = Number(vAny.enlem || vAny.latitude || vAny.lat)
        const vLng = Number(vAny.boylam || vAny.longitude || vAny.lon || vAny.lng)
        if (vLat && vLng && vLat !== 0 && vLng !== 0) {
          coords = [vLng, vLat]
        }

        const el = document.createElement('div')
        el.className = 'map-marker-vehicle'
        el.style.width = '38px'
        el.style.height = '38px'
        el.style.cursor = 'pointer'

        const typeStr = (veh.arac_tipi || veh.aracTipi || "").toLowerCase();
        const isMakineIkmal = veh.current_branch === 'Makine İkmal Müdürlüğü (Bakım-Onarım)';
        let color = '#10b981'; // Default green for aktif
        let glowClass = '';
        const activeDurum = (veh.durum || "aktif").toLowerCase();
        
        let isStale = false;
        const dTime = vAny.sonGuncelleme || vAny.dataTime;
        if (dTime) {
          const diffMs = Date.now() - new Date(dTime).getTime();
          isStale = diffMs > 5 * 60 * 1000;
        }

        const isRunning = !isStale && (vAny.kontak === 'aktif' || Number(vAny.hiz || vAny.speed || 0) > 5);

        if (isRunning) {
          color = '#10b981';
          glowClass = 'vehicle-aktif-glow'; // Pulsing green
        } else if (activeDurum === 'bakimda') {
          color = '#f59e0b';
          glowClass = 'vehicle-bakimda-glow'; // Amber/Yellow
        } else if (activeDurum === 'arizali') {
          color = '#ef4444';
          glowClass = 'vehicle-arizali-glow'; // Red
        } else {
          color = '#64748b'; // Grey for all other stationary, offline, passive, or Makine Ikmal vehicles
          glowClass = '';
        }

        if (isMakineIkmal) {
          const warningBadge = document.createElement('div');
          warningBadge.style.cssText = `
            position: absolute;
            bottom: -14px;
            left: 50%;
            transform: translateX(-50%);
            background: #1e293b;
            color: #cbd5e1;
            border: 1px solid #64748b;
            border-radius: 4px;
            font-size: 7.5px;
            font-weight: 850;
            padding: 1px 3px;
            white-space: nowrap;
            pointer-events: none;
            z-index: 10;
            font-family: monospace;
            box-shadow: 0 2px 4px rgba(0,0,0,0.5);
          `;
          warningBadge.innerText = '🔧 GÖREV DIŞI';
          el.appendChild(warningBadge);
        }

        const innerEl = document.createElement('div')
        innerEl.className = `map-marker-vehicle-inner ${glowClass}`
        
        const angleRad = Number(vAny.yon || vAny.direction || 0);
        const angleDeg = angleRad * (180 / Math.PI);

        innerEl.style.cssText = `
          width: 100%; height: 100%;
          background: rgba(15, 23, 42, 0.88);
          border: 2px solid ${color};
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: ${color};
          box-shadow: 0 0 10px ${color}33;
          transform: rotate(${angleDeg.toFixed(1)}deg);
          transition: transform 0.4s ease-out, border-color 0.3s;
          position: relative;
        `
        
        let silhouetteSvg = '';
        if (typeStr.includes("arazöz")) {
          silhouetteSvg = `
            <svg viewBox="0 0 40 60" width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" style="stroke-linecap:round; stroke-linejoin:round;">
              <path d="M6 18 L2 20 M34 18 L38 20" stroke-width="2.5" />
              <rect x="8" y="6" width="24" height="48" rx="3" fill="currentColor" fill-opacity="0.15" />
              <path d="M10 16 L30 16" />
              <rect x="12" y="24" width="16" height="24" rx="2" stroke-dasharray="2,3" />
            </svg>
          `;
        } else if (typeStr.includes("merdiven")) {
          silhouetteSvg = `
            <svg viewBox="0 0 40 60" width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" style="stroke-linecap:round; stroke-linejoin:round;">
              <path d="M6 18 L2 20 M34 18 L38 20" stroke-width="2.5" />
              <rect x="8" y="6" width="24" height="48" rx="3" fill="currentColor" fill-opacity="0.15" />
              <path d="M10 16 L30 16" />
              <rect x="15" y="20" width="10" height="30" rx="1" />
              <path d="M15 25 L25 25 M15 30 L25 30 M15 35 L25 35 M15 40 L25 40 M15 45 L25 45" />
            </svg>
          `;
        } else if (typeStr.includes("kurtarma") || typeStr.includes("arama")) {
          silhouetteSvg = `
            <svg viewBox="0 0 40 60" width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" style="stroke-linecap:round; stroke-linejoin:round;">
              <path d="M7 16 L3 18 M33 16 L37 18" stroke-width="2" />
              <rect x="9" y="8" width="22" height="44" rx="6" fill="currentColor" fill-opacity="0.15" />
              <path d="M11 20 L29 20" />
              <path d="M12 42 L28 42" />
              <rect x="13" y="24" width="14" height="4" rx="1" fill="currentColor" />
            </svg>
          `;
        } else if (typeStr.includes("lojistik") || typeStr.includes("tanker")) {
          silhouetteSvg = `
            <svg viewBox="0 0 40 60" width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" style="stroke-linecap:round; stroke-linejoin:round;">
              <path d="M6 18 L2 20 M34 18 L38 20" stroke-width="2.5" />
              <rect x="8" y="6" width="24" height="18" rx="3" fill="currentColor" fill-opacity="0.15" />
              <path d="M10 16 L30 16" />
              <rect x="9" y="26" width="22" height="28" rx="8" fill="currentColor" fill-opacity="0.25" />
            </svg>
          `;
        } else {
          silhouetteSvg = `
            <svg viewBox="0 0 40 60" width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" style="stroke-linecap:round; stroke-linejoin:round;">
              <path d="M7 18 L3 20 M33 18 L37 20" />
              <rect x="9" y="8" width="22" height="44" rx="5" fill="currentColor" fill-opacity="0.15" />
              <path d="M11 20 L29 20" />
            </svg>
          `;
        }

        innerEl.innerHTML = silhouetteSvg

        // Add beautiful glowing directional triangle pointer at the top of the circle
        const arrowEl = document.createElement('div')
        arrowEl.style.cssText = `
          position: absolute;
          top: -7px;
          left: 50%;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-left: 4px solid transparent;
          border-right: 4px solid transparent;
          border-bottom: 6px solid ${color};
          filter: drop-shadow(0 0 2px ${color});
          z-index: 5;
        `
        innerEl.appendChild(arrowEl)

        el.appendChild(innerEl)

        const idStr = veh.plaka.replace(/\s+/g, '-').toLowerCase()
        
        let personnelBadges = '';
        const crewList = (veh as any).aktifPersonel || (veh as any).aktif_personel || [];
        if (crewList.length > 0) {
          personnelBadges = crewList.map((p: string) => `
            <span style="font-size:9.5px;padding:2px 5px;background:var(--fd-surface2);border:1px solid var(--fd-border);color:var(--fd-text2);border-radius:4px;">${p}</span>
          `).join('')
        } else {
          personnelBadges = '<span style="font-size:10px;color:var(--fd-text3);font-style:italic;">Görevli Yok</span>';
        }

        const popup = new maplibregl.Popup({ offset: 18, maxWidth: '300px' }).setHTML(`
          <div style="font-family:inherit;padding:4px;color:var(--fd-text);line-height:1.5;">
            <div style="display:flex;align-items:center;justify-content:between;border-bottom:1px solid var(--fd-border);padding-bottom:6px;margin-bottom:6px;gap:8px;">
              <div>
                <h3 style="font-weight:800;color:${color};font-size:14px;margin:0;font-family:monospace;letter-spacing:-0.5px;">${veh.plaka}</h3>
                <span style="font-size:10.5px;color:var(--fd-text3);font-weight:600;">${veh.arac_tipi || veh.aracTipi}</span>
              </div>
              <div style="margin-left:auto;display:flex;flex-direction:column;align-items:end;gap:4px;">
                <span style="font-size:8.5px;font-weight:800;padding:2px 6px;border-radius:9999px;background:${color}15;color:${color};border:1px solid ${color}30;text-transform:uppercase;">${isMakineIkmal ? 'GÖREV DIŞI' : activeDurum}</span>
                ${isMakineIkmal ? `<span style="font-size:8.5px;font-weight:800;padding:2px 6px;border-radius:4px;background:rgba(239,68,68,0.1);color:var(--fd-danger);border:1px solid rgba(239,68,68,0.2);margin-top:2px;">🔧 MAKİNE İKMAL</span>` : ''}
                ${veh.marka ? `<span style="font-size:8.5px;font-weight:800;padding:1px 4px;border-radius:4px;background:rgba(34,211,238,0.1);color:#22d3ee;border:1px solid rgba(34,211,238,0.2);font-family:monospace;">${veh.marka}</span>` : ''}
              </div>
            </div>
            
            <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 8px;font-size:11.5px;margin-bottom:8px;font-family:monospace;">
              ${vAny.hiz !== undefined ? `
                <span style="color:var(--fd-text3);font-weight:500;">Hız:</span>
                <span style="font-weight:700;color:${vAny.hiz > 0 ? '#10b981' : 'var(--fd-text)'};text-align:right;">${vAny.hiz} km/s</span>
              ` : ''}

              <span style="color:var(--fd-text3);font-weight:500;">Kilometre:</span>
              <span style="font-weight:700;color:var(--fd-text);text-align:right;">${veh.km?.toLocaleString() || '0'} km</span>
              
              <span style="color:var(--fd-text3);font-weight:500;">Motor Saati:</span>
              <span style="font-weight:700;color:var(--fd-text);text-align:right;">${veh.motorSaatiPTO || '0'} saat</span>

              ${veh.istasyon ? `
                <span style="color:var(--fd-text3);font-weight:500;">İstasyon:</span>
                <span style="font-weight:600;color:var(--fd-text2);text-align:right;font-size:11px;">${veh.istasyon}</span>
              ` : ''}

              ${veh.yil && veh.model ? `
                <span style="color:var(--fd-text3);font-weight:500;">Model:</span>
                <span style="font-weight:600;color:var(--fd-text2);text-align:right;font-size:11px;">${veh.yil} - ${veh.model}</span>
              ` : ''}

              ${vAny.address ? `
                <span style="color:var(--fd-text3);font-weight:500;">Canlı Konum:</span>
                <span style="font-weight:600;color:var(--fd-text2);text-align:right;font-size:10px;line-height:1.2;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;" title="${vAny.address}">${vAny.address}</span>
              ` : ''}
            </div>

            <div style="border-top:1px solid var(--fd-border);padding-top:6px;margin-bottom:8px;">
              <span style="font-size:9.5px;font-weight:700;color:var(--fd-text3);text-transform:uppercase;display:block;margin-bottom:4px;letter-spacing:0.5px;">Aktif Mürettebat</span>
              <div style="display:flex;flex-wrap:wrap;gap:4px;">
                ${personnelBadges}
              </div>
            </div>

            <div style="margin-top:8px;">
              <a href="/araclar/${idStr}" style="text-decoration:none;display:flex;align-items:center;justify-content:center;width:100%;background:${color}20;color:${color};border:1px solid ${color}40;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer;transition:all 0.2s;text-align:center;box-sizing:border-box;">
                <span>🚒</span> &nbsp;Detaylı Envanter / Bölmeler
              </a>
            </div>
            
            ${vAny.vehicle_id ? `
            <div style="margin-top:6px;">
              <button type="button" class="open-camera-btn" data-id="${vAny.vehicle_id}" data-plate="${veh.plaka}" style="display:flex;align-items:center;justify-content:center;width:100%;background:rgba(59,130,246,0.15);color:#3b82f6;border:1px solid rgba(59,130,246,0.3);border-radius:6px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer;transition:all 0.2s;text-align:center;box-sizing:border-box;">
                <span>📹</span> &nbsp;Canlı Kamerayı İzle
              </button>
            </div>
            ` : ''}
          </div>
        `)

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat(coords)
          .setPopup(popup)
          .addTo(map)

        vehicleMarkersRef.current.push(marker)
      })
    }

    return () => {
      vehicleMarkersRef.current.forEach(m => m.remove())
      vehicleMarkersRef.current = []
    }
  }, [filteredVehicles, mapReady])

  // ─── Sync visibility of binalar & numarataj layers ───
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const updateVisibility = () => {
      if (map.getLayer('binalar-fill')) {
        map.setLayoutProperty('binalar-fill', 'visibility', showBinalar ? 'visible' : 'none')
      }
      if (map.getLayer('binalar-outline')) {
        map.setLayoutProperty('binalar-outline', 'visibility', showBinalar ? 'visible' : 'none')
      }
    }

    if (map.isStyleLoaded()) {
      updateVisibility()
    } else {
      map.once('idle', updateVisibility)
    }
  }, [showBinalar])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const updateOpacity = () => {
      if (map.getLayer('binalar-fill')) {
        map.setPaintProperty('binalar-fill', 'fill-opacity', binalarOpacity)
      }
    }

    if (map.isStyleLoaded()) {
      updateOpacity()
    } else {
      map.once('idle', updateOpacity)
    }
  }, [binalarOpacity])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const updateVisibility = () => {
      if (map.getLayer('numarataj-layer')) {
        map.setLayoutProperty('numarataj-layer', 'visibility', showNumarataj ? 'visible' : 'none')
      }
    }

    if (map.isStyleLoaded()) {
      updateVisibility()
    } else {
      map.once('idle', updateVisibility)
    }
  }, [showNumarataj])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const updateVisibility = () => {
      if (map.getLayer('mahalleler-layer')) {
        map.setLayoutProperty('mahalleler-layer', 'visibility', showMahalleler ? 'visible' : 'none')
      }
    }

    if (map.isStyleLoaded()) {
      updateVisibility()
    } else {
      map.once('idle', updateVisibility)
    }
  }, [showMahalleler])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const updateOpacity = () => {
      if (map.getLayer('mahalleler-layer')) {
        map.setPaintProperty('mahalleler-layer', 'line-opacity', mahallelerOpacity)
      }
    }

    if (map.isStyleLoaded()) {
      updateOpacity()
    } else {
      map.once('idle', updateOpacity)
    }
  }, [mahallelerOpacity])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const updateVisibility = () => {
      if (map.getLayer('sokaklar-layer')) {
        map.setLayoutProperty('sokaklar-layer', 'visibility', showSokaklar ? 'visible' : 'none')
      }
    }

    if (map.isStyleLoaded()) {
      updateVisibility()
    } else {
      map.once('idle', updateVisibility)
    }
  }, [showSokaklar])

  // ─── Sinematik Drone FlyTo on search ──────────────────────
  // Search bar only pans the camera cinematically; user must click to target
  useEffect(() => {
    if (!mapRef.current || !focusLocation) return
    const map = mapRef.current
    const center = [focusLocation[1], focusLocation[0]] as [number, number]

    map.flyTo({
      center,
      zoom: 17,
      duration: 1500
    })
  }, [focusLocation])

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }}>
      <div
        ref={mapContainerRef}
        style={{ width: '100%', height: '100%' }}
      />

      {isSimulation && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none flex flex-col items-center">
          <div className="bg-[var(--fd-warning)]/90 backdrop-blur-sm text-[var(--fd-warning-foreground)] px-4 py-2 rounded-full font-semibold shadow-[var(--fd-shadow-lg)] flex items-center gap-2 text-sm border border-[var(--fd-warning)]/50 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-white animate-ping"></span>
            Simülasyon Modu (Canlı Veri Alınamıyor)
          </div>
          {simulationReason && (
            <div className="mt-2 bg-black/70 backdrop-blur-md text-white text-[11px] px-3 py-1 rounded-md max-w-md text-center shadow-md">
              Sebep: {simulationReason}
            </div>
          )}
        </div>
      )}

      {/* Taktiksel Harita Lejantı Panel */}
      <div className="hidden sm:block absolute right-4 bottom-6 z-10 bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] p-4 w-60 shadow-[var(--fd-shadow-lg)] transition-all duration-300 text-xs text-[var(--fd-text2)]">
        <div className="font-bold text-[var(--fd-text)] mb-3 flex items-center gap-2 border-b border-[var(--fd-border)] pb-2">
          <span className="w-2 h-2 rounded-full bg-[var(--fd-info)] animate-pulse"></span>
          <span>Taktiksel Harita Lejantı</span>
        </div>

        {/* Taktiksel Aktif Durum Süzgeçleri */}
        <div className="mb-4 space-y-2 border-b border-[var(--fd-border)] pb-3">
          <span className="text-[10px] font-bold text-[var(--fd-accent)] uppercase tracking-wider block mb-1.5 opacity-80">
            Aktif Durum Süzgeçleri
          </span>
          
          {/* 🔥 Sadece Aktif Vakalar */}
          <button
            onClick={() => setOnlyActiveIncidents(!onlyActiveIncidents)}
            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg border text-left transition-all duration-300 min-h-[36px] cursor-pointer ${
              onlyActiveIncidents
                ? 'bg-[var(--fd-danger)]/10 border-[var(--fd-danger)]/60 text-[var(--fd-danger)] shadow-[var(--fd-shadow-sm)]'
                : 'bg-[var(--fd-surface2)]/60 border-[var(--fd-border)] text-[var(--fd-text2)] hover:border-[var(--fd-border-strong)]/50 hover:bg-[var(--fd-surface3)]/40'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm shrink-0">🔥</span>
              <span className="text-[11px] font-medium leading-none">Sadece Aktif Vakalar</span>
            </div>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${onlyActiveIncidents ? 'bg-[var(--fd-danger)] animate-ping' : 'bg-[var(--fd-text3)]'}`}></span>
          </button>

          {/* 💧 Sadece Arızalı Hidrantlar */}
          <button
            onClick={() => setOnlyArizaliHydrants(!onlyArizaliHydrants)}
            disabled={onlyActiveIncidents}
            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg border text-left transition-all duration-300 min-h-[36px] ${
              onlyActiveIncidents ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
            } ${
              onlyArizaliHydrants
                ? 'bg-[var(--fd-info)]/10 border-[var(--fd-info)]/60 text-[var(--fd-info)] shadow-[var(--fd-shadow-sm)]'
                : 'bg-[var(--fd-surface2)]/60 border-[var(--fd-border)] text-[var(--fd-text2)] hover:border-[var(--fd-border-strong)]/50 hover:bg-[var(--fd-surface3)]/40'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm shrink-0">💧</span>
              <span className="text-[11px] font-medium leading-none">Sadece Arızalı Hidrantlar</span>
            </div>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${onlyArizaliHydrants ? 'bg-[var(--fd-info)] animate-pulse' : 'bg-[var(--fd-text3)]'}`}></span>
          </button>

          {/* 🚛 Tüm Filoyu Göster / Gizle */}
          <button
            onClick={() => setShowFilo(!showFilo)}
            disabled={onlyActiveIncidents}
            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg border text-left transition-all duration-300 min-h-[36px] ${
              onlyActiveIncidents ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
            } ${
              showFilo
                ? 'bg-[var(--fd-success)]/10 border-[var(--fd-success)]/60 text-[var(--fd-success)] shadow-[var(--fd-shadow-sm)]'
                : 'bg-[var(--fd-surface2)]/60 border-[var(--fd-border)] text-[var(--fd-text3)] hover:border-[var(--fd-border-strong)]/50 hover:bg-[var(--fd-surface3)]/40'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm shrink-0">🚛</span>
              <span className="text-[11px] font-medium leading-none">Tüm Filoyu Göster</span>
            </div>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${showFilo ? 'bg-[var(--fd-success)]' : 'bg-[var(--fd-text3)]'}`}></span>
          </button>

          {/* ⚡ Sadece Çalışan Araçlar */}
          <button
            onClick={() => setOnlyRunningVehicles(!onlyRunningVehicles)}
            disabled={onlyActiveIncidents || !showFilo}
            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg border text-left transition-all duration-300 min-h-[36px] ${
              (onlyActiveIncidents || !showFilo) ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
            } ${
              onlyRunningVehicles
                ? 'bg-[var(--fd-amber)]/10 border-[var(--fd-amber)]/60 text-[var(--fd-amber)] shadow-[var(--fd-shadow-sm)]'
                : 'bg-[var(--fd-surface2)]/60 border-[var(--fd-border)] text-[var(--fd-text2)] hover:border-[var(--fd-border-strong)]/50 hover:bg-[var(--fd-surface3)]/40'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm shrink-0">⚡</span>
              <span className="text-[11px] font-medium leading-none">Sadece Çalışan Araçlar</span>
            </div>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${onlyRunningVehicles ? 'bg-[var(--fd-amber)] animate-pulse' : 'bg-[var(--fd-text3)]'}`}></span>
          </button>
        </div>

        <div className="space-y-2.5">
          {/* Kritik */}
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full bg-[var(--fd-danger)] border border-[var(--fd-surface)] flex items-center justify-center text-white relative shadow-[var(--fd-shadow-sm)]">
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5">
                <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
              </svg>
            </div>
            <span className="text-[var(--fd-text)]">Kritik Müdahale (Ev/Bina)</span>
          </div>

          {/* Orta */}
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full bg-[var(--fd-amber)] border border-[var(--fd-surface)] flex items-center justify-center text-white relative shadow-[var(--fd-shadow-sm)]">
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5">
                <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
              </svg>
            </div>
            <span className="text-[var(--fd-text)]">Orta Seviye (Araç/Kurtarma)</span>
          </div>

          {/* Düşük */}
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full bg-[var(--fd-success)] border border-[var(--fd-surface)] flex items-center justify-center text-white relative shadow-[var(--fd-shadow-sm)]">
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5">
                <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
              </svg>
            </div>
            <span className="text-[var(--fd-text)]">Düşük Seviye (Çöp/Ot)</span>
          </div>

          {/* Çalışır Hidrant */}
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="w-full h-full drop-shadow-[var(--fd-shadow-sm)]">
                <path d="M50 5 C50 5 82 45 82 68 A32 32 0 1 1 18 68 C18 45 50 5 50 5 Z" fill="var(--fd-success)" stroke="var(--fd-surface)" strokeWidth="6"/>
              </svg>
            </div>
            <span className="text-[var(--fd-text)]">Çulışır Hidrant (MEVCUT)</span>
          </div>

          {/* Arızalı Hidrant */}
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="w-full h-full drop-shadow-[var(--fd-shadow-sm)]">
                <path d="M50 5 C50 5 82 45 82 68 A32 32 0 1 1 18 68 C18 45 50 5 50 5 Z" fill="var(--fd-danger)" stroke="var(--fd-surface)" strokeWidth="6"/>
              </svg>
            </div>
            <span className="text-[var(--fd-text)]">Arızalı Hidrant (DEVRE_DIŞI)</span>
          </div>

          {/* Pasif Vakalar */}
          <div className="flex items-center gap-3">
            <span className="opacity-60">Biten / Pasif Vakalar (Opak)</span>
          </div>
        </div>
      </div>
      
      {/* Sleek Floating Control Panel for Sivas Kent Rehberi (Desktop Only) */}
      <div className="hidden md:block absolute top-24 left-4 z-10 bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] p-4 w-60 shadow-[var(--fd-shadow-lg)] transition-all duration-300">
        <div className="flex items-center gap-2 mb-2 text-[var(--fd-text)] font-bold text-xs tracking-wide">
          <Layers className="w-4 h-4 text-[var(--fd-accent)] animate-pulse shrink-0" />
          <span>AKILLI ŞEHİR KATMANLARI</span>
        </div>
        <div className="h-px bg-gradient-to-r from-[var(--fd-accent)]/20 via-[var(--fd-border)]/60 to-transparent my-1.5" />
        
        {/* Base Map Style Switcher (Desktop) */}
        <div className="mb-3 space-y-1">
          <span className="text-[10px] font-bold text-[var(--fd-accent)] uppercase tracking-wider block mb-1 opacity-85">
            Harita Altlığı (Base Map)
          </span>
          <select
            value={activeBaseMap}
            onChange={(e) => setActiveBaseMap(e.target.value as any)}
            className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] text-xs rounded-lg p-2 focus:ring-1 focus:ring-[var(--fd-accent)] focus:outline-none transition-all duration-200 font-semibold"
          >
            <option value="carto_dark">🌃 Siber Karanlık</option>
            <option value="carto_light">🌇 Siber Açık</option>
            <option value="google_road">🗺️ Google Yol Haritası</option>
            <option value="google_satellite">🛰️ Google Uydu Görüntüsü</option>
            <option value="google_hybrid">🗺️ Google Hibrit Harita</option>
            <option value="osm_standart">🌐 OpenStreetMap Standart (Varsayılan)</option>
          </select>
        </div>
        <div className="h-px border-b border-[var(--fd-border)] my-2" />

        <div className="space-y-2 mt-2">
          {/* Binalar Katmanı Toggle */}
          <div className="flex items-center justify-between py-1 px-1 rounded-lg hover:bg-[var(--fd-surface2)] transition-colors">
            <div className="flex items-center gap-2 select-none">
              <Building2 className="w-3.5 h-3.5 text-[var(--fd-text3)] shrink-0" />
              <span className="text-[11px] font-semibold text-[var(--fd-text2)]">Binalar (Vektör)</span>
            </div>
            <div
              onClick={() => setShowBinalar(!showBinalar)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border border-transparent transition-all duration-300 ease-in-out focus:outline-none items-center p-0.5 ${
                showBinalar ? 'bg-[var(--fd-accent)] shadow-[0_0_8px_rgba(6,182,212,0.4)]' : 'bg-[var(--fd-surface3)] border border-[var(--fd-border)]/50'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-300 ease-in-out ${
                  showBinalar ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </div>
          </div>

          {showBinalar && (
            <div className="pl-6 pr-2 py-0.5 space-y-1 transition-all duration-300 animate-in slide-in-from-top-1">
              <div className="flex justify-between text-[9px] text-[var(--fd-text3)]">
                <span>Bina Opaklığı</span>
                <span>{Math.round(binalarOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={binalarOpacity}
                onChange={(e) => setBinalarOpacity(parseFloat(e.target.value))}
                className="w-full h-1 bg-[var(--fd-surface3)] rounded-lg appearance-none cursor-pointer accent-[var(--fd-accent)]"
              />
            </div>
          )}

          {/* Numarataj Katmanı Toggle */}
          <div className="flex items-center justify-between py-1 px-1 rounded-lg hover:bg-[var(--fd-surface2)] transition-colors">
            <div className="flex items-center gap-2 select-none">
              <span className="text-[var(--fd-text3)] font-bold text-[11px] w-3.5 text-center shrink-0">#</span>
              <span className="text-[11px] font-semibold text-[var(--fd-text2)]">Numarataj</span>
            </div>
            <div
              onClick={() => setShowNumarataj(!showNumarataj)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border border-transparent transition-all duration-300 ease-in-out focus:outline-none items-center p-0.5 ${
                showNumarataj ? 'bg-[var(--fd-accent)] shadow-[0_0_8px_rgba(6,182,212,0.4)]' : 'bg-[var(--fd-surface3)] border border-[var(--fd-border)]/50'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-300 ease-in-out ${
                  showNumarataj ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </div>
          </div>

          {/* Mahalle Sınırları Toggle */}
          <div className="flex items-center justify-between py-1 px-1 rounded-lg hover:bg-[var(--fd-surface2)] transition-colors">
            <div className="flex items-center gap-2 select-none">
              <MapIcon className="w-3.5 h-3.5 text-[var(--fd-text3)] shrink-0" />
              <span className="text-[11px] font-semibold text-[var(--fd-text2)]">Mahalle Sınırları</span>
            </div>
            <div
              onClick={() => setShowMahalleler(!showMahalleler)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border border-transparent transition-all duration-300 ease-in-out focus:outline-none items-center p-0.5 ${
                showMahalleler ? 'bg-[var(--fd-accent)] shadow-[0_0_8px_rgba(6,182,212,0.4)]' : 'bg-[var(--fd-surface3)] border border-[var(--fd-border)]/50'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-300 ease-in-out ${
                  showMahalleler ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </div>
          </div>

          {showMahalleler && (
            <div className="pl-6 pr-2 py-0.5 space-y-1 transition-all duration-300 animate-in slide-in-from-top-1">
              <div className="flex justify-between text-[9px] text-[var(--fd-text3)]">
                <span>Mahalle Sın Opaklığı</span>
                <span>{Math.round(mahallelerOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={mahallelerOpacity}
                onChange={(e) => setMahallelerOpacity(parseFloat(e.target.value))}
                className="w-full h-1 bg-[var(--fd-surface3)] rounded-lg appearance-none cursor-pointer accent-[var(--fd-accent)]"
              />
            </div>
          )}

          {/* Sokak Aksları Toggle */}
          <div className="flex items-center justify-between py-1 px-1 rounded-lg hover:bg-[var(--fd-surface2)] transition-colors">
            <div className="flex items-center gap-2 select-none">
              <Milestone className="w-3.5 h-3.5 text-[var(--fd-text3)] shrink-0" />
              <span className="text-[11px] font-semibold text-[var(--fd-text2)]">Sokak Aksları</span>
            </div>
            <div
              onClick={() => setShowSokaklar(!showSokaklar)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border border-transparent transition-all duration-300 ease-in-out focus:outline-none items-center p-0.5 ${
                showSokaklar ? 'bg-[var(--fd-accent)] shadow-[0_0_8px_rgba(6,182,212,0.4)]' : 'bg-[var(--fd-surface3)] border border-[var(--fd-border)]/50'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-300 ease-in-out ${
                  showSokaklar ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </div>
          </div>

          {/* Yangın Hidrantları Toggle */}
          <div className="flex items-center justify-between py-1 px-1 rounded-lg hover:bg-[var(--fd-surface2)] transition-colors">
            <div className="flex items-center gap-2 select-none">
              <Droplets className="w-3.5 h-3.5 text-[var(--fd-text3)] shrink-0" />
              <span className="text-[11px] font-semibold text-[var(--fd-text2)]">Yangın Hidrantları</span>
            </div>
            <div
              onClick={() => setShowHidrantlar(!showHidrantlar)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border border-transparent transition-all duration-300 ease-in-out focus:outline-none items-center p-0.5 ${
                showHidrantlar ? 'bg-[var(--fd-accent)] shadow-[0_0_8px_rgba(6,182,212,0.4)]' : 'bg-[var(--fd-surface3)] border border-[var(--fd-border)]/50'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-300 ease-in-out ${
                  showHidrantlar ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </div>
          </div>

          {/* Biten/Pasif Vakalar Toggle */}
          <div className="flex items-center justify-between py-1 px-1 rounded-lg hover:bg-[var(--fd-surface2)] transition-colors">
            <div className="flex items-center gap-2 select-none">
              <span className="w-3.5 h-3.5 rounded-full bg-[var(--fd-surface3)] flex items-center justify-center text-[9px] text-[var(--fd-text2)] font-bold border border-[var(--fd-border)]/30 shrink-0">✓</span>
              <span className="text-[11px] font-semibold text-[var(--fd-text2)]">Biten/Pasif Vakalar</span>
            </div>
            <div
              onClick={() => setShowPasifVakalar(!showPasifVakalar)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border border-transparent transition-all duration-300 ease-in-out focus:outline-none items-center p-0.5 ${
                showPasifVakalar ? 'bg-[var(--fd-accent)] shadow-[0_0_8px_rgba(6,182,212,0.4)]' : 'bg-[var(--fd-surface3)] border border-[var(--fd-border)]/50'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-300 ease-in-out ${
                  showPasifVakalar ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </div>
          </div>

          {/* Yangın Yoğunluk Analizi (Heatmap) Toggle */}
          <div className="flex items-center justify-between py-1 px-1 rounded-lg hover:bg-[var(--fd-surface2)] transition-colors">
            <div className="flex items-center gap-2 select-none">
              <Flame className="w-3.5 h-3.5 text-[var(--fd-danger)] shrink-0 animate-pulse" />
              <span className="text-[11px] font-semibold text-[var(--fd-text2)]">Yoğunluk (Isı Haritası)</span>
            </div>
            <div
              onClick={() => setShowHeatmap(!showHeatmap)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border border-transparent transition-all duration-300 ease-in-out focus:outline-none items-center p-0.5 ${
                showHeatmap ? 'bg-[var(--fd-danger)] shadow-[0_0_8px_#ef4444]' : 'bg-[var(--fd-surface3)] border border-[var(--fd-border)]/50'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-300 ease-in-out ${
                  showHeatmap ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </div>
          </div>
        </div>

        <div className="h-px bg-gradient-to-r from-[var(--fd-accent)]/20 via-[var(--fd-border)]/60 to-transparent my-3" />
        
        {/* Canlı Katman İstatistikleri Entegrasyonu */}
        <div className="space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--fd-text3)] flex items-center gap-1.5 select-none">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--fd-success)] animate-pulse"></span>
            <span>Canlı Katmanlar</span>
          </div>
          
          {/* Faz 28.55: Aktif Personel Katmanı Toggle */}
          <div className="flex items-center justify-between py-1 px-1 rounded-lg hover:bg-[var(--fd-surface2)] transition-colors">
            <div className="flex items-center gap-2 select-none">
              <span className="text-[var(--fd-success)] font-bold text-[11px] shrink-0">👥</span>
              <span className="text-[11px] font-semibold text-[var(--fd-text2)]">Aktif Personel</span>
            </div>
            <div
              onClick={() => onTogglePersonnelLayer ? onTogglePersonnelLayer(!showPersonnelLayer) : {}}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border border-transparent transition-all duration-300 ease-in-out focus:outline-none items-center p-0.5 ${
                showPersonnelLayer ? 'bg-[var(--fd-success)] shadow-[0_0_8px_#10b981]' : 'bg-[var(--fd-surface3)] border border-[var(--fd-border)]/50'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-300 ease-in-out ${
                  showPersonnelLayer ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center justify-between bg-[var(--fd-surface2)]/40 border border-[var(--fd-border)]/60 rounded-lg p-2">
              <span className="text-[11px] font-semibold text-[var(--fd-text3)]">Vakalar</span>
              <span className="bg-[var(--fd-danger)]/10 text-[var(--fd-danger)] font-bold px-1.5 py-0.5 rounded text-[10px]">{incidents.length}</span>
            </div>
            <div className="flex items-center justify-between bg-[var(--fd-surface2)]/40 border border-[var(--fd-border)]/60 rounded-lg p-2">
              <span className="text-[11px] font-semibold text-[var(--fd-text3)]">Hidrantlar</span>
              <span className="bg-[var(--fd-info)]/10 text-[var(--fd-info)] font-bold px-1.5 py-0.5 rounded text-[10px]">{hydrants.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Layer Control Trigger Button (Hitbox: min 44px) */}
      <button
        onClick={() => setIsLayerDrawerOpen(true)}
        className="md:hidden fixed right-4 bottom-28 z-20 w-12 h-12 rounded-full bg-[var(--fd-surface)] border border-[var(--fd-border)] text-[var(--fd-accent)] flex items-center justify-center shadow-[var(--fd-shadow-md)] active:scale-95 transition-all min-h-[44px] min-w-[44px] cursor-pointer"
        title="Katman Yönetimi"
      >
        <Layers className="w-5 h-5 animate-pulse" />
      </button>

      {/* Mobile Drawer Backdrop */}
      {isLayerDrawerOpen && (
        <div 
          onClick={() => setIsLayerDrawerOpen(false)}
          className="md:hidden fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm transition-opacity duration-300"
        />
      )}

      {/* Mobile Collapsible Layer Drawer (Yüzen Siber Glasmorfik Drawer) */}
      <div 
        className={`md:hidden fixed bottom-0 left-0 right-0 z-[9999] rounded-t-3xl backdrop-blur-xl bg-[var(--fd-surface)] border-t border-[var(--fd-border)] p-6 shadow-[var(--fd-shadow-lg)] transition-transform duration-300 max-h-[85vh] overflow-y-auto box-border pb-12 ${
          isLayerDrawerOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        {/* Drawer Close Button */}
        <button
          onClick={() => setIsLayerDrawerOpen(false)}
          className="absolute top-4 right-4 text-[var(--fd-danger)] hover:opacity-90 bg-[var(--fd-danger)]/15 border border-[var(--fd-danger)]/30 rounded-xl transition-all active:scale-95 flex items-center justify-center min-h-[44px] min-w-[44px] cursor-pointer"
          title="Kapat"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center justify-between gap-2.5 mb-1 text-[var(--fd-text)] font-bold text-lg">
          <div className="flex items-center gap-2.5">
            <Layers className="w-5 h-5 text-[var(--fd-accent)]" />
            <span>Komuta Kontrol Haritası</span>
          </div>
          <button
            onClick={() => setIsLayerDrawerOpen(false)}
            className="text-[var(--fd-danger)] hover:opacity-90 bg-[var(--fd-danger)]/15 border border-[var(--fd-danger)]/30 rounded-xl transition-all active:scale-95 flex items-center justify-center min-h-[44px] min-w-[44px] cursor-pointer shadow-[var(--fd-shadow-sm)]"
            title="Kapat"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <div className="h-px bg-[var(--fd-border)]/60 my-2" />

        {/* Canlı Katman İstatistikleri (Mobile) */}
        <div className="space-y-2.5">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--fd-accent)] block">Canlı Katman İstatistikleri</span>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[var(--fd-surface2)] border border-[var(--fd-border)] rounded-xl p-3 flex items-center justify-between">
              <span className="text-xs font-semibold flex items-center gap-2 text-[var(--fd-text2)]">
                <Flame className="w-4 h-4 text-[var(--fd-danger)] animate-pulse" /> Vakalar
              </span>
              <span className="bg-[var(--fd-danger)]/10 text-[var(--fd-danger)] font-bold text-xs px-2 py-0.5 rounded-full">{incidents.length}</span>
            </div>
            <div className="bg-[var(--fd-surface2)] border border-[var(--fd-border)] rounded-xl p-3 flex items-center justify-between">
              <span className="text-xs font-semibold flex items-center gap-2 text-[var(--fd-text2)]">
                <Droplets className="w-4 h-4 text-[var(--fd-info)]" /> Hidrantlar
              </span>
              <span className="bg-[var(--fd-info)]/10 text-[var(--fd-info)] font-bold text-xs px-2 py-0.5 rounded-full">{hydrants.length}</span>
            </div>
          </div>
        </div>

        <div className="h-px bg-[var(--fd-border)]/60 my-2" />

        {/* Taktiksel Aktif Durum Süzgeçleri (Mobile) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between w-full">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--fd-accent)] block">Aktif Durum Süzgeçleri</span>
            <button
              onClick={() => setIsLayerDrawerOpen(false)}
              className="text-[var(--fd-danger)] hover:opacity-90 bg-[var(--fd-danger)]/15 border border-[var(--fd-danger)]/30 rounded-xl transition-all active:scale-95 flex items-center justify-center min-h-[44px] min-w-[44px] cursor-pointer shadow-[var(--fd-shadow-sm)]"
              title="Kapat"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2.5">
            {/* 🔥 Sadece Aktif Vakalar */}
            <button
              onClick={() => setOnlyActiveIncidents(!onlyActiveIncidents)}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl border text-left transition-all duration-300 min-h-[44px] cursor-pointer ${
                onlyActiveIncidents
                  ? 'bg-[var(--fd-danger)]/15 border-[var(--fd-danger)]/60 text-[var(--fd-danger)] shadow-[var(--fd-shadow-sm)]'
                  : 'bg-[var(--fd-surface2)]/60 border border-[var(--fd-border)] text-[var(--fd-text2)] hover:bg-[var(--fd-surface3)]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-base shrink-0">🔥</span>
                <span className="text-xs font-semibold leading-none">Sadece Aktif Vakalar</span>
              </div>
              <span className={`w-2 h-2 rounded-full shrink-0 ${onlyActiveIncidents ? 'bg-[var(--fd-danger)] animate-ping' : 'bg-[var(--fd-text3)]'}`}></span>
            </button>

            {/* 💧 Sadece Arızalı Hidrantlar */}
            <button
              onClick={() => setOnlyArizaliHydrants(!onlyArizaliHydrants)}
              disabled={onlyActiveIncidents}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl border text-left transition-all duration-300 min-h-[44px] ${
                onlyActiveIncidents ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
              } ${
                onlyArizaliHydrants
                  ? 'bg-[var(--fd-info)]/15 border-[var(--fd-info)]/60 text-[var(--fd-info)] shadow-[var(--fd-shadow-sm)]'
                  : 'bg-[var(--fd-surface2)]/60 border border-[var(--fd-border)] text-[var(--fd-text2)] hover:bg-[var(--fd-surface3)]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-base shrink-0">💧</span>
                <span className="text-xs font-semibold leading-none">Sadece Arızalı Hidrantlar</span>
              </div>
              <span className={`w-2 h-2 rounded-full shrink-0 ${onlyArizaliHydrants ? 'bg-[var(--fd-info)] animate-pulse' : 'bg-[var(--fd-text3)]'}`}></span>
            </button>

            {/* 🚛 Tüm Filoyu Göster / Gizle */}
            <button
              onClick={() => setShowFilo(!showFilo)}
              disabled={onlyActiveIncidents}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl border text-left transition-all duration-300 min-h-[44px] ${
                onlyActiveIncidents ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
              } ${
                showFilo
                  ? 'bg-[var(--fd-success)]/15 border-[var(--fd-success)]/60 text-[var(--fd-success)] shadow-[var(--fd-shadow-sm)]'
                  : 'bg-[var(--fd-surface2)]/60 border border-[var(--fd-border)] text-[var(--fd-text2)] hover:bg-[var(--fd-surface3)]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-base shrink-0">🚛</span>
                <span className="text-xs font-semibold leading-none">Tüm Filoyu Göster</span>
              </div>
              <span className={`w-2 h-2 rounded-full shrink-0 ${showFilo ? 'bg-[var(--fd-success)]' : 'bg-[var(--fd-text3)]'}`}></span>
            </button>

            {/* ⚡ Sadece Çalışan Araçlar */}
            <button
              onClick={() => setOnlyRunningVehicles(!onlyRunningVehicles)}
              disabled={onlyActiveIncidents || !showFilo}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl border text-left transition-all duration-300 min-h-[44px] ${
                (onlyActiveIncidents || !showFilo) ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
              } ${
                onlyRunningVehicles
                  ? 'bg-[var(--fd-amber)]/15 border-[var(--fd-amber)]/60 text-[var(--fd-amber)] shadow-[var(--fd-shadow-sm)]'
                  : 'bg-[var(--fd-surface2)]/60 border border-[var(--fd-border)] text-[var(--fd-text2)] hover:bg-[var(--fd-surface3)]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-base shrink-0">⚡</span>
                <span className="text-xs font-semibold leading-none">Sadece Çalışan Araçlar</span>
              </div>
              <span className={`w-2 h-2 rounded-full shrink-0 ${onlyRunningVehicles ? 'bg-[var(--fd-amber)] animate-pulse' : 'bg-[var(--fd-text3)]'}`}></span>
            </button>
            {/* Faz 28.55: Aktif Personel Katmanı Toggle (Mobile) */}
            <button
              onClick={() => onTogglePersonnelLayer ? onTogglePersonnelLayer(!showPersonnelLayer) : {}}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl border text-left transition-all duration-300 min-h-[44px] cursor-pointer ${
                showPersonnelLayer
                  ? 'bg-[var(--fd-success)]/15 border-[var(--fd-success)]/60 text-[var(--fd-success)] shadow-[var(--fd-shadow-sm)]'
                  : 'bg-[var(--fd-surface2)]/60 border border-[var(--fd-border)] text-[var(--fd-text2)] hover:bg-[var(--fd-surface3)]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-base shrink-0">👥</span>
                <span className="text-xs font-semibold leading-none">Aktif Personeli Göster</span>
              </div>
              <span className={`w-2 h-2 rounded-full shrink-0 ${showPersonnelLayer ? 'bg-[var(--fd-success)]' : 'bg-[var(--fd-text3)]'}`}></span>
            </button>
          </div>
        </div>

        <div className="h-px bg-[var(--fd-border)]/60 my-2" />
        
        <div className="space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--fd-accent)] block mb-2">Akıllı Şehir Katmanları</span>

          {/* Base Map Style Switcher (Mobile) */}
          <div className="mb-4 space-y-1.5">
            <span className="text-[10px] font-bold text-[var(--fd-accent)] uppercase tracking-wider block mb-1 opacity-85">
              Harita Altlığı (Base Map)
            </span>
            <select
              value={activeBaseMap}
              onChange={(e) => setActiveBaseMap(e.target.value as any)}
              className="w-full bg-[var(--fd-surface)] border border-[var(--fd-border)] text-[var(--fd-text2)] text-xs rounded-xl p-3 focus:ring-1 focus:ring-[var(--fd-accent)] focus:outline-none transition-all duration-200 font-semibold"
            >
              <option value="carto_dark">🌃 Siber Karanlık</option>
              <option value="carto_light">🌇 Siber Açık</option>
              <option value="google_road">🗺️ Google Yol Haritası</option>
              <option value="google_satellite">🛰️ Google Uydu Görüntüsü</option>
              <option value="google_hybrid">🗺️ Google Hibrit Harita</option>
              <option value="osm_standart">🌐 OpenStreetMap Standart (Varsayılan)</option>
            </select>
          </div>
          <div className="h-px bg-[var(--fd-border)]/60 my-3" />

          {/* Binalar Katmanı Toggle */}
          <div 
            onClick={() => setShowBinalar(!showBinalar)}
            className="min-h-[44px] flex items-center justify-between py-2 cursor-pointer w-full select-none"
          >
            <div className="flex items-center gap-3">
              <Building2 className="w-5 h-5 text-[var(--fd-text3)]" />
              <span className="text-sm font-semibold text-[var(--fd-text2)]">Binalar (Vektör)</span>
            </div>
            <div
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border border-transparent transition-all duration-300 ease-in-out items-center p-0.5 ${
                showBinalar ? 'bg-[var(--fd-accent)] shadow-[0_0_10px_rgba(6,182,212,0.4)]' : 'bg-[var(--fd-surface3)] border border-[var(--fd-border)]/50'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ease-in-out ${
                  showBinalar ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </div>
          </div>

          {showBinalar && (
            <div className="pl-8 pr-2 py-1 space-y-2 transition-all duration-300 animate-in slide-in-from-top-1" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between text-[11px] text-[var(--fd-text3)]">
                <span>Bina Opaklığı</span>
                <span>{Math.round(binalarOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={binalarOpacity}
                onChange={(e) => setBinalarOpacity(parseFloat(e.target.value))}
                className="w-full h-2 bg-[var(--fd-surface3)] rounded-lg appearance-none cursor-pointer accent-[var(--fd-accent)]"
              />
            </div>
          )}

          {/* Numarataj Katmanı Toggle */}
          <div 
            onClick={() => setShowNumarataj(!showNumarataj)}
            className="min-h-[44px] flex items-center justify-between py-2 cursor-pointer w-full select-none"
          >
            <div className="flex items-center gap-3">
              <span className="text-[var(--fd-text3)] font-bold text-sm w-5 text-center">#</span>
              <span className="text-sm font-semibold text-[var(--fd-text2)]">Numarataj</span>
            </div>
            <div
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border border-transparent transition-all duration-300 ease-in-out items-center p-0.5 ${
                showNumarataj ? 'bg-[var(--fd-accent)] shadow-[0_0_10px_rgba(6,182,212,0.4)]' : 'bg-[var(--fd-surface3)] border border-[var(--fd-border)]/50'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ease-in-out ${
                  showNumarataj ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </div>
          </div>

          {/* Mahalle Sınırları Toggle */}
          <div 
            onClick={() => setShowMahalleler(!showMahalleler)}
            className="min-h-[44px] flex items-center justify-between py-2 cursor-pointer w-full select-none"
          >
            <div className="flex items-center gap-3">
              <MapIcon className="w-5 h-5 text-[var(--fd-text3)]" />
              <span className="text-sm font-semibold text-[var(--fd-text2)]">Mahalle Sınırları</span>
            </div>
            <div
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border border-transparent transition-all duration-300 ease-in-out items-center p-0.5 ${
                showMahalleler ? 'bg-[var(--fd-accent)] shadow-[0_0_10px_rgba(6,182,212,0.4)]' : 'bg-[var(--fd-surface3)] border border-[var(--fd-border)]/50'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ease-in-out ${
                  showMahalleler ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </div>
          </div>

          {showMahalleler && (
            <div className="pl-8 pr-2 py-1 space-y-2 transition-all duration-300 animate-in slide-in-from-top-1" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between text-[11px] text-[var(--fd-text3)]">
                <span>Mahalle Sınır Opaklığı</span>
                <span>{Math.round(mahallelerOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={mahallelerOpacity}
                onChange={(e) => setMahallelerOpacity(parseFloat(e.target.value))}
                className="w-full h-2 bg-[var(--fd-surface3)] rounded-lg appearance-none cursor-pointer accent-[var(--fd-accent)]"
              />
            </div>
          )}

          {/* Sokak Aksları Toggle */}
          <div 
            onClick={() => setShowSokaklar(!showSokaklar)}
            className="min-h-[44px] flex items-center justify-between py-2 cursor-pointer w-full select-none"
          >
            <div className="flex items-center gap-3">
              <Milestone className="w-5 h-5 text-[var(--fd-text3)]" />
              <span className="text-sm font-semibold text-[var(--fd-text2)]">Sokak Aksları</span>
            </div>
            <div
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border border-transparent transition-all duration-300 ease-in-out items-center p-0.5 ${
                showSokaklar ? 'bg-[var(--fd-accent)] shadow-[0_0_10px_rgba(6,182,212,0.4)]' : 'bg-[var(--fd-surface3)] border border-[var(--fd-border)]/50'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ease-in-out ${
                  showSokaklar ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </div>
          </div>

          {/* Yangın Hidrantları Toggle */}
          <div 
            onClick={() => setShowHidrantlar(!showHidrantlar)}
            className="min-h-[44px] flex items-center justify-between py-2 cursor-pointer w-full select-none"
          >
            <div className="flex items-center gap-3">
              <Droplets className="w-5 h-5 text-[var(--fd-text3)]" />
              <span className="text-sm font-semibold text-[var(--fd-text2)]">Yangın Hidrantları</span>
            </div>
            <div
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border border-transparent transition-all duration-300 ease-in-out items-center p-0.5 ${
                showHidrantlar ? 'bg-[var(--fd-accent)] shadow-[0_0_10px_rgba(6,182,212,0.4)]' : 'bg-[var(--fd-surface3)] border border-[var(--fd-border)]/50'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ease-in-out ${
                  showHidrantlar ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </div>
          </div>

          {/* Biten/Pasif Vakalar Toggle */}
          <div 
            onClick={() => setShowPasifVakalar(!showPasifVakalar)}
            className="min-h-[44px] flex items-center justify-between py-2 cursor-pointer w-full select-none"
          >
            <div className="flex items-center gap-3">
              <span className="w-5 h-5 rounded-full bg-[var(--fd-surface3)] flex items-center justify-center text-[10px] text-[var(--fd-text2)] font-bold border border-[var(--fd-border)]/30">✓</span>
              <span className="text-sm font-semibold text-[var(--fd-text2)]">Biten/Pasif Vakalar</span>
            </div>
            <div
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border border-transparent transition-all duration-300 ease-in-out items-center p-0.5 ${
                showPasifVakalar ? 'bg-[var(--fd-accent)] shadow-[0_0_10px_rgba(6,182,212,0.4)]' : 'bg-[var(--fd-surface3)] border border-[var(--fd-border)]/50'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ease-in-out ${
                  showPasifVakalar ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </div>
          </div>

          {/* Yangın Yoğunluk Analizi (Heatmap) Toggle (Mobile) */}
          <div 
            onClick={() => setShowHeatmap(!showHeatmap)}
            className="min-h-[44px] flex items-center justify-between py-2 cursor-pointer w-full select-none"
          >
            <div className="flex items-center gap-3">
              <Flame className="w-5 h-5 text-[var(--fd-danger)] animate-pulse shrink-0" />
              <span className="text-sm font-semibold text-[var(--fd-text2)]">Yoğunluk (Isı Haritası)</span>
            </div>
            <div
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border border-transparent transition-all duration-300 ease-in-out items-center p-0.5 ${
                showHeatmap ? 'bg-[var(--fd-danger)] shadow-[0_0_8px_#ef4444]' : 'bg-[var(--fd-surface3)] border border-[var(--fd-border)]/50'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ease-in-out ${
                  showHeatmap ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </div>
          </div>
        </div>

        <div className="h-px bg-[var(--fd-border)]/60 my-2" />
        
        {/* Taktiksel Harita Lejantı (Mobile Drawer Entegrasyonu) */}
        <div className="space-y-3">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--fd-accent)] block">Harita İşaret Lejantı</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[var(--fd-text2)]">
            <div className="flex items-center gap-2.5 py-1">
              <div className="w-5 h-5 rounded-full bg-[var(--fd-danger)] border border-[var(--fd-border)] flex items-center justify-center text-white relative shadow-[var(--fd-shadow-sm)] shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5">
                  <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
                </svg>
              </div>
              <span>Kritik Müdahale (Ev/Bina)</span>
            </div>

            <div className="flex items-center gap-2.5 py-1">
              <div className="w-5 h-5 rounded-full bg-[var(--fd-amber)] border border-[var(--fd-border)] flex items-center justify-center text-white relative shadow-[var(--fd-shadow-sm)] shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5">
                  <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
                </svg>
              </div>
              <span>Orta Seviye (Araç/Kurtarma)</span>
            </div>

            <div className="flex items-center gap-2.5 py-1">
              <div className="w-5 h-5 rounded-full bg-[var(--fd-success)] border border-[var(--fd-border)] flex items-center justify-center text-white relative shadow-[var(--fd-shadow-sm)] shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5">
                  <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
                </svg>
              </div>
              <span>Düşük Seviye (Çöp/Ot)</span>
            </div>

            <div className="flex items-center gap-2.5 py-1">
              <div className="w-5 h-5 flex items-center justify-center shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="w-full h-full drop-shadow-[var(--fd-shadow-sm)]">
                  <path d="M50 5 C50 5 82 45 82 68 A32 32 0 1 1 18 68 C18 45 50 5 50 5 Z" fill="var(--fd-success)" stroke="var(--fd-surface)" strokeWidth="6"/>
                </svg>
              </div>
              <span>Çalışır Hidrant (MEVCUT)</span>
            </div>

            <div className="flex items-center gap-2.5 py-1">
              <div className="w-5 h-5 flex items-center justify-center shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="w-full h-full drop-shadow-[var(--fd-shadow-sm)]">
                  <path d="M50 5 C50 5 82 45 82 68 A32 32 0 1 1 18 68 C18 45 50 5 50 5 Z" fill="var(--fd-danger)" stroke="var(--fd-surface)" strokeWidth="6"/>
                </svg>
              </div>
              <span>Arızalı Hidrant (DEVRE_DIŞI)</span>
            </div>

            <div className="flex items-center gap-2.5 py-1">
              <div className="w-5 h-5 rounded-full bg-white border border-slate-400 flex items-center justify-center text-slate-500 relative opacity-40 shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5">
                  <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
                </svg>
              </div>
              <span className="opacity-60">Biten / Pasif Vakalar</span>
            </div>
          </div>
        </div>
      </div>
      <style>{`
        /* MapLibre Theme-Aware Control Buttons Overrides */
        .maplibregl-ctrl-group {
          background: var(--fd-surface) !important;
          backdrop-filter: blur(8px) !important;
          -webkit-backdrop-filter: blur(8px) !important;
          border: 1px solid var(--fd-border) !important;
          box-shadow: var(--fd-shadow-sm) !important;
          border-radius: 10px !important;
          overflow: hidden !important;
        }
        .maplibregl-ctrl-group button {
          width: 32px !important;
          height: 32px !important;
          border: 0 !important;
          border-bottom: 1px solid var(--fd-border) !important;
          background: transparent !important;
          color: var(--fd-text2) !important;
          transition: all 0.2s ease-out !important;
        }
        .maplibregl-ctrl-group button:last-child {
          border-bottom: none !important;
        }
        .maplibregl-ctrl-group button:hover {
          background: var(--fd-surface2) !important;
          color: var(--fd-accent) !important;
        }
        .maplibregl-ctrl-icon {
          /* Add subtle adjustments to icons */
          opacity: 0.8 !important;
        }

        /* MapLibre Theme-Aware Popup Overrides */
        .maplibregl-popup-content {
          background: var(--fd-surface) !important;
          backdrop-filter: blur(8px) !important;
          -webkit-backdrop-filter: blur(8px) !important;
          border: 1px solid var(--fd-border) !important;
          box-shadow: var(--fd-shadow-lg) !important;
          border-radius: 12px !important;
          padding: 12px 16px !important;
          color: var(--fd-text) !important;
        }

        .maplibregl-popup-close-button {
          color: var(--fd-text3) !important;
          border: 0 !important;
          background: transparent !important;
          font-size: 16px !important;
          padding: 4px 8px !important;
          top: 6px !important;
          right: 6px !important;
          outline: none !important;
          transition: all 0.2s ease !important;
        }
        .maplibregl-popup-close-button:hover {
          color: var(--fd-text) !important;
          background: var(--fd-surface2) !important;
          border-radius: 4px !important;
        }

        /* Seamless Tip Alignment for all maplibre directions */
        .maplibregl-popup-anchor-top .maplibregl-popup-tip {
          border-bottom-color: var(--fd-surface) !important;
        }
        .maplibregl-popup-anchor-bottom .maplibregl-popup-tip {
          border-top-color: var(--fd-surface) !important;
        }
        .maplibregl-popup-anchor-left .maplibregl-popup-tip {
          border-right-color: var(--fd-surface) !important;
        }
        .maplibregl-popup-anchor-right .maplibregl-popup-tip {
          border-left-color: var(--fd-surface) !important;
        }
        .maplibregl-popup-anchor-top-left .maplibregl-popup-tip {
          border-bottom-color: var(--fd-surface) !important;
        }
        .maplibregl-popup-anchor-top-right .maplibregl-popup-tip {
          border-bottom-color: var(--fd-surface) !important;
        }
        .maplibregl-popup-anchor-bottom-left .maplibregl-popup-tip {
          border-top-color: var(--fd-surface) !important;
        }
        .maplibregl-popup-anchor-bottom-right .maplibregl-popup-tip {
          border-top-color: var(--fd-surface) !important;
        }

        /* @keyframes incidentPulse: Expanding transparent wave box-shadow effect per severity */
        @keyframes incidentPulseRed {
          0% {
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.8);
            transform: scale(1);
          }
          70% {
            box-shadow: 0 0 0 14px rgba(239, 68, 68, 0);
            transform: scale(1.06);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
            transform: scale(1);
          }
        }
        @keyframes incidentPulseYellow {
          0% {
            box-shadow: 0 0 0 0 rgba(234, 179, 8, 0.8);
            transform: scale(1);
          }
          70% {
            box-shadow: 0 0 0 12px rgba(234, 179, 8, 0);
            transform: scale(1.05);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(234, 179, 8, 0);
            transform: scale(1);
          }
        }
        @keyframes incidentPulseGreen {
          0% {
            box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.8);
            transform: scale(1);
          }
          70% {
            box-shadow: 0 0 0 10px rgba(34, 197, 94, 0);
            transform: scale(1.04);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(34, 197, 94, 0);
            transform: scale(1);
          }
        }

        /* Classes mapped to triage.glowClass */
        .triage-critical-glow {
          animation: incidentPulseRed 1.6s infinite ease-in-out !important;
        }
        .triage-medium-glow {
          animation: incidentPulseYellow 2s infinite ease-in-out !important;
        }
        .triage-low-glow {
          animation: incidentPulseGreen 2.4s infinite ease-in-out !important;
        }

        /* Hydrant Pulse Keyframes: soft green & sharp red neon glows */
        @keyframes pulse-hydrant-green {
          0% {
            transform: scale(1);
            filter: drop-shadow(0 0 4px rgba(34, 197, 94, 0.65));
          }
          50% {
            transform: scale(1.08);
            filter: drop-shadow(0 0 14px rgba(34, 197, 94, 0.95));
          }
          100% {
            transform: scale(1);
            filter: drop-shadow(0 0 4px rgba(34, 197, 94, 0.65));
          }
        }
        @keyframes pulse-hydrant-red {
          0% {
            transform: scale(1);
            filter: drop-shadow(0 0 4px rgba(239, 68, 68, 0.65));
          }
          50% {
            transform: scale(1.1);
            filter: drop-shadow(0 0 16px rgba(239, 68, 68, 0.95));
          }
          100% {
            transform: scale(1);
            filter: drop-shadow(0 0 4px rgba(239, 68, 68, 0.65));
          }
        }
        .map-marker-hydrant-pulse-green {
          animation: pulse-hydrant-green 2.5s infinite ease-in-out;
        }
        .map-marker-hydrant-pulse-red {
          animation: pulse-hydrant-red 2s infinite ease-in-out;
        }

        /* Vehicle Pulse Keyframes */
        @keyframes pulse-vehicle-aktif {
          0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.6); }
          70% { box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); }
          100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
        @keyframes pulse-vehicle-bakimda {
          0% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.6); }
          70% { box-shadow: 0 0 0 8px rgba(245, 158, 11, 0); }
          100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
        }
        @keyframes pulse-vehicle-arizali {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
          70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }

        .vehicle-aktif-glow {
          animation: pulse-vehicle-aktif 2s infinite ease-in-out;
        }
        .vehicle-bakimda-glow {
          animation: pulse-vehicle-bakimda 2s infinite ease-in-out;
        }
        .vehicle-arizali-glow {
          animation: pulse-vehicle-arizali 1.5s infinite ease-in-out;
        }
      `}</style>

      {/* Premium Glassmorphic Incident Detail & OSRM Route Info Card */}
      {selectedIncident && (
        <div className="absolute bottom-4 left-4 right-4 sm:right-auto sm:w-80 z-10 bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] p-4 shadow-[var(--fd-shadow-lg)] animate-in slide-in-from-bottom-4 transition-all duration-300 select-none">
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base animate-pulse">🚨</span>
                <h3 className="font-extrabold text-[var(--fd-text)] text-sm leading-snug">{selectedIncident.olay_turu}</h3>
              </div>
              <p className="text-[10px] text-[var(--fd-accent)] font-mono tracking-wider mt-0.5">VAKA DETAY & CBS ROTA</p>
            </div>
            <button 
              onClick={() => setSelectedIncident(null)}
              className="text-[var(--fd-text3)] hover:text-[var(--fd-danger)] transition-colors p-1 cursor-pointer"
              title="Kapat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="h-px bg-[var(--fd-border)] my-2" />
          <div className="space-y-1.5 text-xs text-[var(--fd-text2)]">
            <div className="flex justify-between">
              <span className="text-[var(--fd-text3)]">Mahalle:</span>
              <span className="font-semibold text-[var(--fd-text)]">{selectedIncident.mahalle || '-'}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[var(--fd-text3)]">Adres:</span>
              <span className="text-[var(--fd-text)] font-medium leading-relaxed">{selectedIncident.adres || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--fd-text3)]">Çıkış Zamanı:</span>
              <span className="text-[var(--fd-text)] font-mono">
                {selectedIncident.cikis_saati ? new Date(selectedIncident.cikis_saati).toLocaleString('tr-TR') : 'Zaman bilgisi yok'}
              </span>
            </div>
            {/* Sevk Edilen Araçlar ve Personeller */}
            <div className="h-px bg-[var(--fd-border)]/50 my-2" />
            <div className="space-y-2">
              <div className="text-[11px] font-bold text-[var(--fd-accent)] uppercase tracking-wide">Görevli Ekip & Araçlar:</div>
              {detailsLoading ? (
                <div className="flex items-center gap-1.5 text-[var(--fd-text3)] py-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--fd-accent)]" />
                  <span>Bilgiler Yükleniyor...</span>
                </div>
              ) : (
                <div className="max-h-[140px] overflow-y-auto space-y-2 pr-1 select-text">
                  {/* Araçlar */}
                  {dispatchedVehicles.length > 0 ? (
                    <div>
                      <div className="text-[10px] text-[var(--fd-text3)] font-semibold mb-1">Araçlar:</div>
                      <div className="flex flex-wrap gap-1.5">
                        {dispatchedVehicles.map(v => (
                          <Badge key={v.plaka} variant="outline" className="text-[10px] border-[var(--fd-info)]/20 text-[var(--fd-info)] bg-[var(--fd-info)]/10 py-0.5 font-mono">
                            {v.plaka} {v.arac_tipi ? `(${v.arac_tipi})` : ''}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-[10px] text-[var(--fd-text3)]/60 italic">Sevk edilen araç yok.</div>
                  )}

                  {/* Personeller */}
                  {dispatchedPersonnel.length > 0 ? (
                    <div>
                      <div className="text-[10px] text-[var(--fd-text3)] font-semibold mb-1">Personel:</div>
                      <div className="flex flex-col gap-1 bg-[var(--fd-surface2)] p-1.5 rounded-lg border border-[var(--fd-border)]/50">
                        {dispatchedPersonnel.map(p => (
                          <div key={p.sicil_no} className="text-[11px] text-[var(--fd-text2)] flex justify-between">
                            <span>{p.ad} {p.soyad}</span>
                            <span className="text-[var(--fd-text3)] text-[10px]">{p.unvan || 'Er'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-[10px] text-[var(--fd-text3)]/60 italic">Sevk edilen personel yok.</div>
                  )}
                </div>
              )}
            </div>

            <div className="h-px bg-[var(--fd-border)]/50 my-2" />
            
            {/* Lojistik Sayaç */}
            <div className="bg-[var(--fd-info)]/10 border border-[var(--fd-info)]/30 rounded-xl p-2.5 flex items-center justify-between shadow-[var(--fd-shadow-sm)] mb-2">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-[var(--fd-success)] animate-ping"></div>
                <span className="text-[11px] font-bold text-[var(--fd-info)] uppercase tracking-wide">Müdahale Süresi:</span>
              </div>
              <span className="text-sm font-black text-[var(--fd-success)] font-mono">
                {routeDuration !== null ? `${routeDuration} Dk` : 'Hesaplanıyor...'}
              </span>
            </div>

            {/* Düzenle & Sil Butonları */}
            {isAuthorized && (
              <>
                <div className="h-px bg-[var(--fd-border)]/50 my-2" />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (onEditIncident) {
                        onEditIncident(selectedIncident);
                      }
                    }}
                    className="flex-1 py-2 px-3 flex items-center justify-center gap-1.5 rounded-lg border border-[var(--fd-info)]/20 bg-[var(--fd-info)]/10 text-[var(--fd-info)] hover:opacity-90 text-xs font-bold transition-all cursor-pointer"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    Düzenle
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!window.confirm("Bu vaka kaydını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.")) return;
                      try {
                        // Delete child records first to satisfy foreign key constraints
                        // (unwrap: biri başarısız olursa ana vaka silinmeden işlem durur)
                        await Promise.all([
                          api.remove('incident_vehicles', { incident_id: selectedIncident.id }).then(unwrap),
                          api.remove('incident_personnel', { incident_id: selectedIncident.id }).then(unwrap),
                          api.remove('incident_media', { incident_id: selectedIncident.id }).then(unwrap)
                        ]);
                        
                        // Delete main incident record
                        const { error } = await api.remove('incidents', { id: selectedIncident.id });
                        if (error) throw error;
                        
                        if (onDeleteIncident) {
                          onDeleteIncident(selectedIncident.id);
                        }
                        setSelectedIncident(null);
                      } catch (err) {
                        console.error("Incident delete error:", err);
                        toast("Vaka silinemedi.");
                      }
                    }}
                    className="py-2 px-3 flex items-center justify-center gap-1.5 rounded-lg border border-[var(--fd-danger)]/20 bg-[var(--fd-danger)]/10 text-[var(--fd-danger)] hover:opacity-90 text-xs font-bold transition-all cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Sil
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
