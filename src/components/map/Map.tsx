"use client"

import { useEffect, useRef, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import * as turf from '@turf/turf'

// ─── Sivas Merkez İtfaiye İstasyonu (Yenişehir) ────────────
const STATION_COORDS: [number, number] = [37.0209312, 39.7339522] // [lng, lat]

// ─── Neon Renk Paleti (Karanlık Tema) ───────────────────────
const NEON = {
  route: '#ff6b2b',        // parlak turuncu rota
  routeGlow: 'rgba(255,107,43,0.35)',
  buffer: '#00e5ff',       // neon cyan buffer
  bufferFill: 'rgba(0,229,255,0.12)',
  hydrantActive: '#39ff14', // neon yeşil (buffer içi)
  hydrantGlow: 'rgba(57,255,20,0.8)',
}

interface Incident {
  id: string
  olay_turu: string
  mahalle: string
  adres: string
  cikis_saati: string
  location?: any
}

interface Hydrant {
  id: string
  no: string
  tip: string
  durum: string
  mahalle: string
  location?: any
}

interface MapProps {
  incidents: Incident[]
  hydrants: Hydrant[]
  mode: 'idle' | 'add_incident' | 'add_hydrant'
  onMapClick: (lat: number, lng: number) => void
  focusLocation: [number, number] | null
}

const parseLocation = (loc: any): [number, number] | null => {
  if (!loc) return null
  if (typeof loc === 'string') {
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
          'fill-color': NEON.buffer,
          'fill-opacity': 0.12
        }
      })
      map.addLayer({
        id: 'buffer-outline',
        type: 'line',
        source: 'buffer-source',
        paint: {
          'line-color': NEON.buffer,
          'line-width': 2.5,
          'line-dasharray': [2, 2]
        }
      })
    }

    // 2. Highlight Hydrants inside Buffer
    hydrantElementsRef.current.forEach(({ el, coords }) => {
      const pt = turf.point(coords)
      if (turf.booleanPointInPolygon(pt, buffer)) {
        el.style.background = NEON.hydrantActive
        el.style.boxShadow = `0 0 18px 6px ${NEON.hydrantGlow}`
        el.style.transform = 'scale(1.25)'
        el.style.transition = 'all 0.3s ease'
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

            // Glow background line
            map.addLayer({
              id: 'route-line-glow',
              type: 'line',
              source: 'route-source',
              paint: {
                'line-color': NEON.route,
                'line-width': 12,
                'line-opacity': 0.2,
                'line-blur': 8
              }
            })

            // Solid background line
            map.addLayer({
              id: 'route-line-bg',
              type: 'line',
              source: 'route-source',
              paint: {
                'line-color': NEON.route,
                'line-width': 5,
                'line-opacity': 0.4
              }
            })

            // Animated dashed line
            map.addLayer({
              id: 'route-line-animated',
              type: 'line',
              source: 'route-source',
              paint: {
                'line-color': '#ffffff',
                'line-width': 3,
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
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: STATION_COORDS,
      zoom: 14,
      pitch: 60,
      bearing: -15,
      maxZoom: 19,
      maxPitch: 85,
      attributionControl: {}
    })

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right')

    // ─── Canlı GPS Konum Bulucu (Geolocation) ───────────────
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true
      }),
      'top-right'
    )

    // ─── 3D Bina Katmanı (CartoDB vektör kaynağından) ───────
    map.on('load', () => {
      // CartoDB dark-matter uses 'carto' source with OpenMapTiles schema
      const sourceId = Object.keys(map.getStyle().sources).find(
        s => map.getSource(s)?.type === 'vector'
      )

      if (sourceId) {
        map.addLayer({
          id: '3d-buildings',
          source: sourceId,
          'source-layer': 'building',
          type: 'fill-extrusion',
          minzoom: 13,
          paint: {
            'fill-extrusion-color': '#1e293b',
            'fill-extrusion-height': [
              'interpolate', ['linear'], ['zoom'],
              13, 0,
              15.05, ['coalesce', ['get', 'render_height'], 12]
            ],
            'fill-extrusion-base': [
              'interpolate', ['linear'], ['zoom'],
              13, 0,
              15.05, ['coalesce', ['get', 'render_min_height'], 0]
            ],
            'fill-extrusion-opacity': 0.7
          }
        })
      }
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

    return () => {
      if (routeAnimFrameRef.current) {
        cancelAnimationFrame(routeAnimFrameRef.current)
      }
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Sync markers for incidents & hydrants ────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Clear old markers
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    // Incident markers (red pulse — all incidents from DB)
    incidents.forEach(inc => {
      const coords = parseLocation(inc.location)
      if (!coords) return
      
      const el = document.createElement('div')
      el.className = 'map-marker-incident'
      el.style.cssText = `
        width: 32px; height: 32px;
        background: #ef4444;
        border: 2px solid #fff;
        border-radius: 50%;
        box-shadow: 0 4px 12px rgba(239,68,68,0.5);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
      `
      el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c-2.2 0-4-1.8-4-4a8 8 0 0 1 15 2.5A8 8 0 0 1 12 22a8 8 0 0 1-7-1.5"/></svg>`


      const popup = new maplibregl.Popup({ offset: 18, maxWidth: '280px' }).setHTML(`
        <div style="font-family:system-ui;padding:4px 0">
          <h3 style="font-weight:700;color:#ef4444;font-size:13px;border-bottom:1px solid #eee;padding-bottom:4px;margin-bottom:4px">${inc.olay_turu}</h3>
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

    // Hydrant markers (blue)
    hydrants.forEach(hyd => {
      const coords = parseLocation(hyd.location)
      if (!coords) return

      const el = document.createElement('div')
      el.className = 'map-marker-hydrant'
      el.style.cssText = `
        width: 28px; height: 28px;
        background: #3b82f6;
        border: 2px solid #fff;
        border-radius: 50%;
        box-shadow: 0 4px 12px rgba(59,130,246,0.5);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
      `
      el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>`


      const popup = new maplibregl.Popup({ offset: 16, maxWidth: '260px' }).setHTML(`
        <div style="font-family:system-ui;padding:4px 0">
          <h3 style="font-weight:700;color:#3b82f6;font-size:13px;border-bottom:1px solid #eee;padding-bottom:4px;margin-bottom:4px">Yangın Hidrantı #${hyd.no}</h3>
          <p style="font-size:12px;margin:2px 0"><strong>Tip:</strong> ${hyd.tip}</p>
          <p style="font-size:12px;margin:2px 0"><strong>Durum:</strong> ${hyd.durum}</p>
          <p style="font-size:12px;margin:2px 0"><strong>Mahalle:</strong> ${hyd.mahalle || '-'}</p>
        </div>
      `)

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat(coords)
        .setPopup(popup)
        .addTo(map)

      markersRef.current.push(marker)
      hydrantElementsRef.current.push({ el, coords })
    })

    // Fixed Fire Station Marker
    const stationEl = document.createElement('div')
    stationEl.className = 'map-marker-station'
    stationEl.style.cssText = `
      width: 40px; height: 40px;
      background: #f97316;
      border: 3px solid #fff;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(249,115,22,0.6);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
    `
    stationEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>`

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

  }, [incidents, hydrants])

  // ─── Sinematik Drone FlyTo on search ──────────────────────
  // Search bar only pans the camera cinematically; user must click to target
  useEffect(() => {
    if (!mapRef.current || !focusLocation) return
    const map = mapRef.current
    const center = [focusLocation[1], focusLocation[0]] as [number, number]

    map.flyTo({
      center,
      zoom: 16,
      pitch: 65,
      bearing: 30,
      speed: 0.8,
      curve: 1.5,
      duration: 3500,
      essential: true
    })
  }, [focusLocation])

  return (
    <div
      ref={mapContainerRef}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }}
    />
  )
}
