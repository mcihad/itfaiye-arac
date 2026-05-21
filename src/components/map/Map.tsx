"use client"

import { useEffect, useRef, useCallback, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import * as turf from '@turf/turf'
import { Layers, Building2, Map as MapIcon, Milestone, Droplets } from 'lucide-react'
import { getTriageInfo } from '@/lib/utils'
import { Vehicle } from '@/types'



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
  mode: 'idle' | 'add_incident' | 'add_hydrant'
  onMapClick: (lat: number, lng: number) => void
  focusLocation: [number, number] | null
  onUpdateHydrantStatus?: (id: string, newStatus: string) => void
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

export default function Map({ incidents, hydrants, vehicles, mode, onMapClick, focusLocation, onUpdateHydrantStatus }: MapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const vehicleMarkersRef = useRef<maplibregl.Marker[]>([])
  const hydrantElementsRef = useRef<{el: HTMLDivElement, coords: [number, number]}[]>([])
  const modeRef = useRef(mode)
  const onMapClickRef = useRef(onMapClick)
  const routeAnimFrameRef = useRef<number | null>(null)

  const [mapReady, setMapReady] = useState(false)
  const hasFitBoundsRef = useRef(false)

  const [showBinalar, setShowBinalar] = useState(true)
  const [showNumarataj, setShowNumarataj] = useState(true)
  const [showMahalleler, setShowMahalleler] = useState(false)
  const [showSokaklar, setShowSokaklar] = useState(false)
  const [showHidrantlar, setShowHidrantlar] = useState(true)
  const [showPasifVakalar, setShowPasifVakalar] = useState(false)
  const [binalarOpacity, setBinalarOpacity] = useState(0.3)
  const [mahallelerOpacity, setMahallelerOpacity] = useState(1.0)

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
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
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
          'line-color': '#4b5563',
          'line-width': 1.8,
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
          'line-color': '#0284c7',
          'line-width': 1.2
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

    return () => {
      if (routeAnimFrameRef.current) {
        cancelAnimationFrame(routeAnimFrameRef.current)
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

    console.log("Map: Syncing markers. Hydrants count:", hydrants.length, "Incidents count:", incidents.length);


    // Clear old markers
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    // Incident markers (dynamic triage pulse — all incidents from DB)
    incidents.forEach(inc => {
      const coords = parseLocation(inc.location)
      if (!coords) return

      // Biten / Pasif Vakaların Yönetimi (State & Filtre)
      const isPasif = inc.durum === 'BİTTİ' || inc.durum === 'KONTROL ALTINDA' || inc.durum === 'PASİF' || inc.status === 'closed';
      if (isPasif && !showPasifVakalar) return;
      
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
      el.appendChild(innerEl)

      const statusLabel = isPasif ? (inc.durum || 'PASİF / BİTTİ') : triage.label;
      const statusColor = isPasif ? '#94a3b8' : triage.color;

      const popup = new maplibregl.Popup({ offset: 18, maxWidth: '280px' }).setHTML(`
        <div style="font-family:system-ui;padding:4px 0;color:#e2e8f0;">
          <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:6px;margin-bottom:6px;gap:8px">
            <h3 style="font-weight:700;color:${isPasif ? '#cbd5e1' : triage.color};font-size:13.5px;margin:0">${inc.olay_turu}</h3>
            <span style="font-size:9.5px;font-weight:800;padding:2px 6px;border-radius:9999px;background:${statusColor}20;color:${statusColor};border:1px solid ${statusColor}40">${statusLabel}</span>
          </div>
          <p style="font-size:12px;margin:3px 0;color:#cbd5e1;"><strong style="color:#94a3b8;font-weight:500;">Mahalle:</strong> ${inc.mahalle || '-'}</p>
          <p style="font-size:12px;margin:3px 0;color:#cbd5e1;"><strong style="color:#94a3b8;font-weight:500;">Adres:</strong> ${inc.adres || '-'}</p>
          <p style="font-size:11px;color:#94a3b8;margin-top:6px;display:flex;align-items:center;gap:4px;">
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
    })

    hydrantElementsRef.current = []

    // Hydrant markers (durum-based green/red with modern custom droplet/shield SVG shape-coding)
    if (showHidrantlar) {
      hydrants.forEach(hyd => {
        const coords = parseLocation(hyd.location)
        if (!coords) return

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
          <div style="font-family:system-ui;padding:4px;color:#e2e8f0;line-height:1.5;">
            <h3 style="font-weight:800;color:${isMevcut ? '#22c55e' : '#ef4444'};font-size:14px;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:6px;margin:0 0 6px 0;display:flex;align-items:center;gap:6px;">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background-color:${isMevcut ? '#22c55e' : '#ef4444'};box-shadow:0 0 6px ${isMevcut ? '#22c55e' : '#ef4444'}"></span>
              Yangın Hidrantı #${hyd.no}
            </h3>
            <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 8px;font-size:12px;">
              <span style="color:#94a3b8;font-weight:500;">Durum:</span>
              <span style="font-weight:700;color:${isMevcut ? '#22c55e' : '#ef4444'}">${isMevcut ? 'MEVCUT (Çalışıyor)' : 'DEVRE_DIŞI (Arızalı)'}</span>
              
              <span style="color:#94a3b8;font-weight:500;">Kalite:</span>
              <span style="font-weight:600;color:#f1f5f9;">${hyd.kalite || 'Belirtilmemiş'}</span>
              
              <span style="color:#94a3b8;font-weight:500;">İmalatçı:</span>
              <span style="font-weight:600;color:#f1f5f9;">${hyd.imalatci || 'Sivas Belediyesi'}</span>
              
              ${hyd.proje_adi ? `
              <span style="color:#94a3b8;font-weight:500;grid-column:1/3;margin-top:4px;">Konum Detayı:</span>
              <span style="grid-column:1/3;color:#cbd5e1;background:rgba(255,255,255,0.05);padding:6px;border-radius:4px;font-size:11px;line-height:1.4;border:1px solid rgba(255,255,255,0.08);word-break:break-word;">${hyd.proje_adi}</span>
              ` : ''}

              <div style="grid-column:1/3;margin-top:8px;">
                <button class="toggle-hydrant-btn" data-id="${hyd.id}" data-current="${hyd.durum}" style="width:100%;background:${isMevcut ? '#ef4444' : '#22c55e'};color:#ffffff;border:none;border-radius:6px;padding:6px 12px;font-size:11px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;transition:all 0.2s;box-shadow:0 2px 4px rgba(0,0,0,0.2);">
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
      })
    }

    // Fixed Fire Station Marker
    const stationEl = document.createElement('div')
    stationEl.className = 'map-marker-station'
    stationEl.style.cssText = `
      width: 44px; height: 44px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    `
    stationEl.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" style="width: 100%; height: 100%; filter: drop-shadow(0 0 8px rgba(249,115,22,0.6));">
        <path d="M50 5 L90 20 L90 55 C90 75 75 90 50 95 C25 90 10 75 10 55 L10 20 Z" fill="url(#station-grad)" stroke="#ffffff" stroke-width="3"/>
        <path d="M35 80 L35 45 L65 45 L65 80 Z" fill="#ffffff" opacity="0.2"/>
        <path d="M50 25 C60 38 60 55 50 68 C40 55 40 38 50 25 Z" fill="#ffffff"/>
        <path d="M50 35 C55 45 55 55 50 62 C45 55 45 45 50 35 Z" fill="#f97316"/>
        <defs>
          <linearGradient id="station-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#ea580c" />
            <stop offset="100%" stop-color="#b91c1c" />
          </linearGradient>
        </defs>
      </svg>
    `

    const stationPopup = new maplibregl.Popup({ offset: 20 }).setHTML(`
      <div style="font-family:system-ui;padding:4px 0;color:#e2e8f0;">
        <h3 style="font-weight:700;color:#f97316;font-size:14px;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:4px;margin-bottom:4px">Merkez İtfaiye İstasyonu</h3>
        <p style="font-size:12px;margin:2px 0;color:#cbd5e1;">Sivas Belediyesi İtfaiye Müdürlüğü</p>
        <p style="font-size:11px;color:#94a3b8;margin-top:2px">Yenişehir, Merkez</p>
      </div>
    `)

    const stationMarker = new maplibregl.Marker({ element: stationEl })
      .setLngLat(STATION_COORDS)
      .setPopup(stationPopup)
      .addTo(map)

    markersRef.current.push(stationMarker)

    // Otomatik Sivas hidrant kadrajına uydurma (fitBounds)
    if (hydrants.length > 0 && !hasFitBoundsRef.current) {
      const bounds = new maplibregl.LngLatBounds()
      let hasValidCoords = false
      hydrants.forEach(hyd => {
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

  }, [incidents, hydrants, showHidrantlar, showPasifVakalar, mapReady])

  // ─── Sync markers for vehicles ────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    // Clear old vehicle markers
    vehicleMarkersRef.current.forEach(m => m.remove())
    vehicleMarkersRef.current = []

    if (vehicles && vehicles.length > 0) {
      vehicles.forEach((veh, i) => {
        const count = vehicles.length
        const angle = (i * 2 * Math.PI) / count
        const radius = 0.00035 // cluster around Sivas fire station coordinates beautifully
        const lngOffset = Math.cos(angle) * radius
        const latOffset = Math.sin(angle) * radius
        const coords: [number, number] = [STATION_COORDS[0] + lngOffset, STATION_COORDS[1] + latOffset]

        const el = document.createElement('div')
        el.className = 'map-marker-vehicle'
        el.style.width = '38px'
        el.style.height = '38px'
        el.style.cursor = 'pointer'

        const typeStr = (veh.arac_tipi || veh.aracTipi || "").toLowerCase();
        let color = '#10b981'; // Default green for aktif
        let glowClass = 'vehicle-aktif-glow';
        const activeDurum = (veh.durum || "aktif").toLowerCase();
        if (activeDurum === 'bakimda') {
          color = '#f59e0b';
          glowClass = 'vehicle-bakimda-glow';
        } else if (activeDurum === 'arizali') {
          color = '#ef4444';
          glowClass = 'vehicle-arizali-glow';
        } else if (activeDurum === 'pasif') {
          color = '#64748b';
          glowClass = '';
        }

        const innerEl = document.createElement('div')
        innerEl.className = `map-marker-vehicle-inner ${glowClass}`
        innerEl.style.cssText = `
          width: 100%; height: 100%;
          background: rgba(15, 23, 42, 0.85);
          border: 2px solid ${color};
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: ${color};
          box-shadow: 0 0 10px ${color}33;
          transition: all 0.3s;
        `
        
        let silhouetteSvg = '';
        if (typeStr.includes("arazöz")) {
          silhouetteSvg = `
            <svg viewBox="0 0 100 60" width="22" height="15" fill="none" stroke="currentColor" stroke-width="3" style="stroke-linecap:round;">
              <rect x="10" y="15" width="80" height="30" rx="4" />
              <rect x="70" y="15" width="20" height="18" rx="2" fill="currentColor" fill-opacity="0.2" />
              <circle cx="25" cy="48" r="8" fill="currentColor" />
              <circle cx="75" cy="48" r="8" fill="currentColor" />
            </svg>
          `;
        } else if (typeStr.includes("merdiven")) {
          silhouetteSvg = `
            <svg viewBox="0 0 100 60" width="22" height="15" fill="none" stroke="currentColor" stroke-width="3" style="stroke-linecap:round;">
              <rect x="10" y="20" width="80" height="25" rx="3" />
              <path d="M15 14 L75 7" stroke-width="4" />
              <circle cx="25" cy="48" r="8" fill="currentColor" />
              <circle cx="75" cy="48" r="8" fill="currentColor" />
            </svg>
          `;
        } else if (typeStr.includes("kurtarma") || typeStr.includes("arama")) {
          silhouetteSvg = `
            <svg viewBox="0 0 100 60" width="22" height="15" fill="none" stroke="currentColor" stroke-width="3" style="stroke-linecap:round;">
              <rect x="10" y="15" width="80" height="30" rx="4" />
              <path d="M15 20 L15 8 L35 4" stroke-width="4" />
              <circle cx="25" cy="48" r="8" fill="currentColor" />
              <circle cx="75" cy="48" r="8" fill="currentColor" />
            </svg>
          `;
        } else if (typeStr.includes("lojistik") || typeStr.includes("tanker")) {
          silhouetteSvg = `
            <svg viewBox="0 0 100 60" width="22" height="15" fill="none" stroke="currentColor" stroke-width="3" style="stroke-linecap:round;">
              <path d="M68 18 L88 18 L90 45 L68 45 Z" fill="currentColor" fill-opacity="0.2" />
              <rect x="10" y="15" width="55" height="30" rx="10" />
              <circle cx="20" cy="48" r="8" fill="currentColor" />
              <circle cx="78" cy="48" r="8" fill="currentColor" />
            </svg>
          `;
        } else {
          silhouetteSvg = `
            <svg viewBox="0 0 100 60" width="22" height="15" fill="none" stroke="currentColor" stroke-width="3" style="stroke-linecap:round;">
              <path d="M10 25 L45 25 L45 20 L75 20 L90 30 L90 45 L10 45 Z" />
              <circle cx="25" cy="47" r="7" fill="currentColor" />
              <circle cx="75" cy="47" r="7" fill="currentColor" />
            </svg>
          `;
        }

        innerEl.innerHTML = silhouetteSvg
        el.appendChild(innerEl)

        const idStr = veh.plaka.replace(/\s+/g, '-').toLowerCase()
        
        let personnelBadges = '';
        const crewList = (veh as any).aktifPersonel || (veh as any).aktif_personel || [];
        if (crewList.length > 0) {
          personnelBadges = crewList.map((p: string) => `
            <span style="font-size:9.5px;padding:2px 5px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:#e2e8f0;border-radius:4px;">${p}</span>
          `).join('')
        } else {
          personnelBadges = '<span style="font-size:10px;color:#64748b;font-style:italic;">Görevli Yok</span>';
        }

        const popup = new maplibregl.Popup({ offset: 18, maxWidth: '300px' }).setHTML(`
          <div style="font-family:system-ui;padding:4px;color:#e2e8f0;line-height:1.5;">
            <div style="display:flex;align-items:center;justify-content:between;border-bottom:1px solid rgba(255,255,255,0.12);padding-bottom:6px;margin-bottom:6px;gap:8px;">
              <div>
                <h3 style="font-weight:800;color:${color};font-size:14px;margin:0;font-family:monospace;letter-spacing:-0.5px;">${veh.plaka}</h3>
                <span style="font-size:10.5px;color:#94a3b8;font-weight:600;">${veh.arac_tipi || veh.aracTipi}</span>
              </div>
              <div style="margin-left:auto;display:flex;flex-direction:column;align-items:end;gap:4px;">
                <span style="font-size:8.5px;font-weight:800;padding:2px 6px;border-radius:9999px;background:${color}15;color:${color};border:1px solid ${color}30;text-transform:uppercase;">${activeDurum}</span>
                ${veh.marka ? `<span style="font-size:8.5px;font-weight:800;padding:1px 4px;border-radius:4px;background:rgba(34,211,238,0.1);color:#22d3ee;border:1px solid rgba(34,211,238,0.2);font-family:monospace;">${veh.marka}</span>` : ''}
              </div>
            </div>
            
            <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 8px;font-size:11.5px;margin-bottom:8px;font-family:monospace;">
              <span style="color:#64748b;font-weight:500;">Kilometre:</span>
              <span style="font-weight:700;color:#f1f5f9;text-align:right;">${veh.km?.toLocaleString() || '0'} km</span>
              
              <span style="color:#64748b;font-weight:500;">Motor Saati:</span>
              <span style="font-weight:700;color:#f1f5f9;text-align:right;">${veh.motorSaatiPTO || '0'} saat</span>

              ${veh.istasyon ? `
                <span style="color:#64748b;font-weight:500;">İstasyon:</span>
                <span style="font-weight:600;color:#cbd5e1;text-align:right;font-size:11px;">${veh.istasyon}</span>
              ` : ''}

              ${veh.yil && veh.model ? `
                <span style="color:#64748b;font-weight:500;">Model:</span>
                <span style="font-weight:600;color:#cbd5e1;text-align:right;font-size:11px;">${veh.yil} - ${veh.model}</span>
              ` : ''}
            </div>

            <div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:6px;margin-bottom:8px;">
              <span style="font-size:9.5px;font-weight:700;color:#64748b;text-transform:uppercase;display:block;margin-bottom:4px;letter-spacing:0.5px;">Aktif Mürettebat</span>
              <div style="display:flex;flex-wrap:wrap;gap:4px;">
                ${personnelBadges}
              </div>
            </div>

            <div style="margin-top:8px;">
              <a href="/araclar/${idStr}" style="text-decoration:none;display:flex;align-items:center;justify-content:center;width:100%;background:${color}20;color:${color};border:1px solid ${color}40;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer;transition:all 0.2s;text-align:center;box-sizing:border-box;">
                <span>🚒</span> &nbsp;Detaylı Envanter / Bölmeler
              </a>
            </div>
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
  }, [vehicles, mapReady])

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

      {/* Taktiksel Harita Lejantı Panel */}
      <div className="absolute bottom-4 left-4 z-10 bg-slate-950/85 backdrop-blur-md border border-white/10 rounded-xl p-4 w-60 shadow-2xl transition-all duration-300 text-xs text-slate-200">
        <div className="font-semibold text-slate-100 mb-3 flex items-center gap-2 border-b border-white/10 pb-2">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
          <span>Taktiksel Harita Lejantı</span>
        </div>
        <div className="space-y-2.5">
          {/* Kritik */}
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full bg-[#ef4444] border border-white flex items-center justify-center text-white relative shadow-[0_0_8px_rgba(239,68,68,0.8)]">
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5">
                <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
              </svg>
            </div>
            <span>Kritik Müdahale (Ev/Bina)</span>
          </div>

          {/* Orta */}
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full bg-[#eab308] border border-white flex items-center justify-center text-white relative shadow-[0_0_6px_rgba(234,179,8,0.8)]">
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5">
                <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
              </svg>
            </div>
            <span>Orta Seviye (Araç/Kurtarma)</span>
          </div>

          {/* Düşük */}
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full bg-[#22c55e] border border-white flex items-center justify-center text-white relative shadow-[0_0_6px_rgba(34,197,94,0.8)]">
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5">
                <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
              </svg>
            </div>
            <span>Düşük Seviye (Çöp/Ot)</span>
          </div>

          {/* Çalışır Hidrant */}
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_0_4px_rgba(34,197,94,0.8)]">
                <path d="M50 5 C50 5 82 45 82 68 A32 32 0 1 1 18 68 C18 45 50 5 50 5 Z" fill="#22c55e" stroke="#ffffff" strokeWidth="6"/>
              </svg>
            </div>
            <span>Çalışır Hidrant (MEVCUT)</span>
          </div>

          {/* Arızalı Hidrant */}
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_0_4px_rgba(239,68,68,0.8)]">
                <path d="M50 5 C50 5 82 45 82 68 A32 32 0 1 1 18 68 C18 45 50 5 50 5 Z" fill="#ef4444" stroke="#ffffff" strokeWidth="6"/>
              </svg>
            </div>
            <span>Arızalı Hidrant (DEVRE_DIŞI)</span>
          </div>

          {/* Pasif Vakalar */}
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full bg-white border border-slate-400 flex items-center justify-center text-slate-500 relative opacity-40">
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5">
                <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
              </svg>
            </div>
            <span className="opacity-60">Biten / Pasif Vakalar (Opak)</span>
          </div>
        </div>
      </div>
      
      {/* Sleek Floating Control Panel for Sivas Kent Rehberi */}
      <div className="absolute top-4 left-4 z-10 bg-slate-950/80 backdrop-blur-md border border-slate-800/80 rounded-xl p-4 w-64 shadow-2xl transition-all duration-300">
        <div className="flex items-center gap-2 mb-3 text-slate-100 font-semibold text-sm">
          <Layers className="w-4 h-4 text-blue-400" />
          <span>Akıllı Şehir Katmanları</span>
        </div>
        <div className="h-px bg-slate-800/60 my-2" />
        <div className="space-y-3 mt-3">
          {/* Binalar Katmanı Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 select-none">
              <Building2 className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-medium text-slate-200">Binalar (Vektör)</span>
            </div>
            <button
              onClick={() => setShowBinalar(!showBinalar)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                showBinalar ? 'bg-blue-500' : 'bg-slate-700'
              }`}
              type="button"
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  showBinalar ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {showBinalar && (
            <div className="pl-6 pr-2 py-1 space-y-1 transition-all duration-300 animate-in slide-in-from-top-1">
              <div className="flex justify-between text-[10px] text-slate-400">
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
                className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>
          )}

          {/* Numarataj Katmanı Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 select-none">
              <span className="text-slate-400 font-bold text-xs w-4 text-center">#</span>
              <span className="text-xs font-medium text-slate-200">Numarataj</span>
            </div>
            <button
              onClick={() => setShowNumarataj(!showNumarataj)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                showNumarataj ? 'bg-blue-500' : 'bg-slate-700'
              }`}
              type="button"
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  showNumarataj ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Mahalle Sınırları Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 select-none">
              <MapIcon className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-medium text-slate-200">Mahalle Sınırları</span>
            </div>
            <button
              onClick={() => setShowMahalleler(!showMahalleler)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                showMahalleler ? 'bg-blue-500' : 'bg-slate-700'
              }`}
              type="button"
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  showMahalleler ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {showMahalleler && (
            <div className="pl-6 pr-2 py-1 space-y-1 transition-all duration-300 animate-in slide-in-from-top-1">
              <div className="flex justify-between text-[10px] text-slate-400">
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
                className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>
          )}

          {/* Sokak Aksları Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 select-none">
              <Milestone className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-medium text-slate-200">Sokak Aksları</span>
            </div>
            <button
              onClick={() => setShowSokaklar(!showSokaklar)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                showSokaklar ? 'bg-blue-500' : 'bg-slate-700'
              }`}
              type="button"
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  showSokaklar ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Yangın Hidrantları Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 select-none">
              <Droplets className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-medium text-slate-200">Yangın Hidrantları</span>
            </div>
            <button
              onClick={() => setShowHidrantlar(!showHidrantlar)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                showHidrantlar ? 'bg-blue-500' : 'bg-slate-700'
              }`}
              type="button"
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  showHidrantlar ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Biten/Pasif Vakalar Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 select-none">
              <span className="w-4 h-4 rounded-full bg-slate-400/20 flex items-center justify-center text-[10px] text-slate-300 font-bold border border-slate-500/30">✓</span>
              <span className="text-xs font-medium text-slate-200">Biten/Pasif Vakalar</span>
            </div>
            <button
              onClick={() => setShowPasifVakalar(!showPasifVakalar)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                showPasifVakalar ? 'bg-blue-500' : 'bg-slate-700'
              }`}
              type="button"
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  showPasifVakalar ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>
      <style>{`
        /* MapLibre Premium Glassmorphic Dark Theme Popup Overrides */
        .maplibregl-popup-content {
          background: rgba(15, 23, 42, 0.85) !important;
          backdrop-filter: blur(8px) !important;
          -webkit-backdrop-filter: blur(8px) !important;
          border: 1px solid rgba(255, 255, 255, 0.12) !important;
          box-shadow: 0 12px 30px -5px rgba(0, 0, 0, 0.55) !important;
          border-radius: 12px !important;
          padding: 12px 16px !important;
        }

        .maplibregl-popup-close-button {
          color: rgba(255, 255, 255, 0.6) !important;
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
          color: #ffffff !important;
          background: rgba(255, 255, 255, 0.1) !important;
          border-radius: 4px !important;
        }

        /* Seamless Tip Alignment for all maplibre directions */
        .maplibregl-popup-anchor-top .maplibregl-popup-tip {
          border-bottom-color: rgba(15, 23, 42, 0.85) !important;
        }
        .maplibregl-popup-anchor-bottom .maplibregl-popup-tip {
          border-top-color: rgba(15, 23, 42, 0.85) !important;
        }
        .maplibregl-popup-anchor-left .maplibregl-popup-tip {
          border-right-color: rgba(15, 23, 42, 0.85) !important;
        }
        .maplibregl-popup-anchor-right .maplibregl-popup-tip {
          border-left-color: rgba(15, 23, 42, 0.85) !important;
        }
        .maplibregl-popup-anchor-top-left .maplibregl-popup-tip {
          border-bottom-color: rgba(15, 23, 42, 0.85) !important;
        }
        .maplibregl-popup-anchor-top-right .maplibregl-popup-tip {
          border-bottom-color: rgba(15, 23, 42, 0.85) !important;
        }
        .maplibregl-popup-anchor-bottom-left .maplibregl-popup-tip {
          border-top-color: rgba(15, 23, 42, 0.85) !important;
        }
        .maplibregl-popup-anchor-bottom-right .maplibregl-popup-tip {
          border-top-color: rgba(15, 23, 42, 0.85) !important;
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
    </div>
  )
}
