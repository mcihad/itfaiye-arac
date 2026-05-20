"use client"

import { useEffect, useRef, useCallback, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import * as turf from '@turf/turf'
import { Layers, Building2, Map as MapIcon, Milestone, Droplets } from 'lucide-react'
import { getTriageInfo } from '@/lib/utils'



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
  mode: 'idle' | 'add_incident' | 'add_hydrant'
  onMapClick: (lat: number, lng: number) => void
  focusLocation: [number, number] | null
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

export default function Map({ incidents, hydrants, mode, onMapClick, focusLocation }: MapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
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
            if (!map.getLayer('route-line-animated')) return
            step = (step + 1) % dashArraySeq.length
            map.setPaintProperty('route-line-animated', 'line-dasharray', dashArraySeq[step])
            routeAnimFrameRef.current = requestAnimationFrame(() => {
              setTimeout(animateDashArray, 50)
            })
          }
          animateDashArray()
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

    map.addControl(new maplibregl.NavigationControl(), 'bottom-right')

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
      
      const triage = getTriageInfo(inc.olay_turu)
      
      const el = document.createElement('div')
      el.className = `map-marker-incident ${triage.glowClass}`
      el.style.cssText = `
        width: 34px; height: 34px;
        background: ${triage.color};
        border: 2px solid #fff;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
      `
      el.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 3px rgba(255,255,255,0.8));">
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c-2.2 0-4-1.8-4-4a8 8 0 0 1 15 2.5A8 8 0 0 1 12 22a8 8 0 0 1-7-1.5"/>
        </svg>
      `

      const popup = new maplibregl.Popup({ offset: 18, maxWidth: '280px' }).setHTML(`
        <div style="font-family:system-ui;padding:4px 0">
          <div style="display:flex;align-items:center;justify-content:between;border-bottom:1px solid #eee;padding-bottom:4px;margin-bottom:4px;gap:8px">
            <h3 style="font-weight:700;color:${triage.color};font-size:13px;margin:0">${inc.olay_turu}</h3>
            <span style="font-size:9px;font-weight:800;padding:2px 6px;border-radius:9999px;background:${triage.color}20;color:${triage.color};border:1px solid ${triage.color}30">${triage.label}</span>
          </div>
          <p style="font-size:12px;margin:2px 0"><strong>Mahalle:</strong> ${inc.mahalle || '-'}</p>
          <p style="font-size:12px;margin:2px 0"><strong>Adres:</strong> ${inc.adres || '-'}</p>
          <p style="font-size:11px;color:#888;margin-top:4px">${inc.cikis_saati ? new Date(inc.cikis_saati).toLocaleString('tr-TR') : 'Zaman bilgisi yok'}</p>
        </div>
      `)

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat(coords)
        .setPopup(popup)
        .addTo(map)

      markersRef.current.push(marker)
    })

    hydrantElementsRef.current = []

    // Hydrant markers (durum-based green/red)
    if (showHidrantlar) {
      hydrants.forEach(hyd => {
        const coords = parseLocation(hyd.location)
        if (!coords) return

        const isMevcut = hyd.durum === 'MEVCUT'
        
        const el = document.createElement('div')
        el.className = `map-marker-hydrant ${isMevcut ? 'map-marker-hydrant-pulse-green' : 'map-marker-hydrant-pulse-red'}`
        el.style.cssText = `
          width: 32px; height: 32px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        `
        
        const gradientId = `hydrant-grad-${hyd.id}`
        
        el.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" style="width: 100%; height: 100%; filter: ${isMevcut ? 'drop-shadow(0 0 8px #22c55e)' : 'drop-shadow(0 0 10px #ef4444)'};">
            <circle cx="50" cy="50" r="42" fill="url(#${gradientId})" stroke="#ffffff" stroke-width="3"/>
            <path d="M35 42 L35 70 C35 76 65 76 65 70 L65 42 Z" fill="#ffffff" opacity="0.95"/>
            <path d="M30 32 H70 V42 H30 Z" fill="#ffffff"/>
            <circle cx="50" cy="22" r="8" fill="#ffffff"/>
            <path d="M50 48 C53 52 53 58 50 62 C47 58 47 52 50 48 Z" fill="${isMevcut ? '#15803d' : '#b91c1c'}"/>
            <defs>
              <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="${isMevcut ? '#22c55e' : '#ef4444'}" />
                <stop offset="100%" stop-color="${isMevcut ? '#15803d' : '#b91c1c'}" />
              </linearGradient>
            </defs>
          </svg>
        `

        const popup = new maplibregl.Popup({ offset: 16, maxWidth: '280px' }).setHTML(`
          <div style="font-family:system-ui;padding:4px;color:#1e293b;line-height:1.5;">
            <h3 style="font-weight:800;color:${isMevcut ? '#16a34a' : '#dc2626'};font-size:14px;border-bottom:1px solid #e2e8f0;padding-bottom:6px;margin:0 0 6px 0;display:flex;align-items:center;gap:6px;">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background-color:${isMevcut ? '#22c55e' : '#ef4444'};box-shadow:0 0 6px ${isMevcut ? '#22c55e' : '#ef4444'}"></span>
              Yangın Hidrantı #${hyd.no}
            </h3>
            <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 8px;font-size:12px;">
              <span style="color:#64748b;font-weight:500;">Durum:</span>
              <span style="font-weight:700;color:${isMevcut ? '#16a34a' : '#dc2626'}">${isMevcut ? 'MEVCUT (Çalışıyor)' : 'DEVRE_DIŞI (Arızalı)'}</span>
              
              <span style="color:#64748b;font-weight:500;">Kalite:</span>
              <span style="font-weight:600;color:#0f172a;">${hyd.kalite || 'Belirtilmemiş'}</span>
              
              <span style="color:#64748b;font-weight:500;">İmalatçı:</span>
              <span style="font-weight:600;color:#0f172a;">${hyd.imalatci || 'Sivas Belediyesi'}</span>
              
              ${hyd.proje_adi ? `
              <span style="color:#64748b;font-weight:500;grid-column:1/3;margin-top:4px;">Konum Detayı:</span>
              <span style="grid-column:1/3;color:#334155;background:#f8fafc;padding:6px;border-radius:4px;font-size:11px;line-height:1.4;border:1px solid #e2e8f0;word-break:break-word;">${hyd.proje_adi}</span>
              ` : ''}
            </div>
          </div>
        `)

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat(coords)
          .setPopup(popup)
          .addTo(map)

        markersRef.current.push(marker)
        hydrantElementsRef.current.push({ el, coords })
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
      <div style="font-family:system-ui;padding:4px 0">
        <h3 style="font-weight:700;color:#f97316;font-size:14px;border-bottom:1px solid #eee;padding-bottom:4px;margin-bottom:4px">Merkez İtfaiye İstasyonu</h3>
        <p style="font-size:12px;margin:2px 0">Sivas Belediyesi İtfaiye Müdürlüğü</p>
        <p style="font-size:11px;color:#888;margin-top:2px">Yenişehir, Merkez</p>
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

  }, [incidents, hydrants, showHidrantlar, mapReady])

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
        </div>
      </div>
      <style>{`
        @keyframes pulse-glow-red {
          0% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.8);
            filter: drop-shadow(0 0 4px #ef4444);
          }
          70% {
            transform: scale(1.08);
            box-shadow: 0 0 0 10px rgba(239, 68, 68, 0);
            filter: drop-shadow(0 0 12px #ef4444);
          }
          100% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
            filter: drop-shadow(0 0 4px #ef4444);
          }
        }
        @keyframes pulse-glow-yellow {
          0% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(234, 179, 8, 0.8);
            filter: drop-shadow(0 0 3px #eab308);
          }
          70% {
            transform: scale(1.06);
            box-shadow: 0 0 0 8px rgba(234, 179, 8, 0);
            filter: drop-shadow(0 0 10px #eab308);
          }
          100% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(234, 179, 8, 0);
            filter: drop-shadow(0 0 3px #eab308);
          }
        }
        @keyframes pulse-glow-green {
          0% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.8);
            filter: drop-shadow(0 0 3px #22c55e);
          }
          70% {
            transform: scale(1.04);
            box-shadow: 0 0 0 6px rgba(34, 197, 94, 0);
            filter: drop-shadow(0 0 8px #22c55e);
          }
          100% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(34, 197, 94, 0);
            filter: drop-shadow(0 0 3px #22c55e);
          }
        }
        .triage-critical-glow {
          animation: pulse-glow-red 1s infinite ease-in-out;
        }
        .triage-medium-glow {
          animation: pulse-glow-yellow 2s infinite ease-in-out;
        }
        .triage-low-glow {
          animation: pulse-glow-green 2.5s infinite ease-in-out;
        }
        @keyframes pulse-hydrant-green {
          0% { transform: scale(1); filter: drop-shadow(0 0 4px #22c55e); }
          50% { transform: scale(1.06); filter: drop-shadow(0 0 12px #22c55e); }
          100% { transform: scale(1); filter: drop-shadow(0 0 4px #22c55e); }
        }
        @keyframes pulse-hydrant-red {
          0% { transform: scale(1); filter: drop-shadow(0 0 5px #ef4444); }
          50% { transform: scale(1.08); filter: drop-shadow(0 0 15px #ef4444); }
          100% { transform: scale(1); filter: drop-shadow(0 0 5px #ef4444); }
        }
        .map-marker-hydrant-pulse-green {
          animation: pulse-hydrant-green 2.5s infinite ease-in-out;
        }
        .map-marker-hydrant-pulse-red {
          animation: pulse-hydrant-red 2s infinite ease-in-out;
        }
      `}</style>
    </div>
  )
}
