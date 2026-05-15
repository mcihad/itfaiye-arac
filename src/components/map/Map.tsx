"use client"

import { useEffect, useRef, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

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
  const modeRef = useRef(mode)

  // Keep modeRef in sync so the click handler can read the latest value
  useEffect(() => {
    modeRef.current = mode
    if (mapRef.current) {
      mapRef.current.getCanvas().style.cursor = mode !== 'idle' ? 'crosshair' : ''
    }
  }, [mode])

  // ─── Initialize MapLibre GL ───────────────────────────────
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
      center: [37.016, 39.750], // Sivas merkez [lng, lat]
      zoom: 13,
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
        onMapClick(e.lngLat.lat, e.lngLat.lng)
      }
    })

    mapRef.current = map

    return () => {
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

    // Incident markers (red)
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
      </div>
    `)

    const stationMarker = new maplibregl.Marker({ element: stationEl })
      .setLngLat([37.016, 39.750]) // Sivas center
      .setPopup(stationPopup)
      .addTo(map)

    markersRef.current.push(stationMarker)

  }, [incidents, hydrants])

  // ─── Focus / flyTo on search result ───────────────────────
  useEffect(() => {
    if (!mapRef.current || !focusLocation) return
    // focusLocation is [lat, lng] from the parent — convert to [lng, lat]
    mapRef.current.flyTo({
      center: [focusLocation[1], focusLocation[0]],
      zoom: 16,
      duration: 1500
    })
  }, [focusLocation])

  return (
    <div
      ref={mapContainerRef}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }}
    />
  )
}
