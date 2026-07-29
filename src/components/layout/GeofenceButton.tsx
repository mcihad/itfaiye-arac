"use client"

import { useState, useEffect } from 'react'
import { MapPin, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useAuthStore } from '@/lib/authStore'
import { api } from '@/lib/api'
import { DutyLog } from '@/types'
import { cn } from '@/lib/utils'

// Sivas İtfaiyesi Resmi İstasyon Koordinatları (Geofence Matrix)
// OSB koordinatı 29.07.2026'da düzeltildi: eski nokta (39.786707, 37.085315)
// gerçek yerleşkeden 1.2 km uzaktaydı ve OSB personeli görev başlatamıyordu.
// Yeni nokta, OSB personelinin vardiya saatlerindeki GPS kayıtlarının merkezidir.
const STATIONS = [
  { name: "Merkez İstasyon Yerleşkesi", lat: 39.7339522, lng: 37.0209312 },
  { name: "Esentepe Şubesi Yerleşkesi", lat: 39.748762, lng: 36.988576 },
  { name: "Organize Sanayi (OSB) Şubesi Yerleşkesi", lat: 39.796105, lng: 37.091510 }
]
const MAX_DISTANCE_METERS = 150

interface GeofenceButtonProps {
  isMobile?: boolean
}

export function GeofenceButton({ isMobile = false }: GeofenceButtonProps) {
  const { user } = useAuthStore()
  const [dutyStatus, setDutyStatus] = useState<'AKTIF' | 'TAMAMLANDI'>('TAMAMLANDI')
  const [loading, setLoading] = useState(true)
  const [btnLoading, setBtnLoading] = useState(false)
  const [distance, setDistance] = useState<number | null>(null)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle")
  const [message, setMessage] = useState("")
  const [permissionDenied, setPermissionDenied] = useState(false)

  // Haversine formula to calculate distance between two coordinates in meters
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI / 180; // φ, λ in radians
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // in metres
  }

  // 1. Fetch the latest duty log of the user to determine their status
  useEffect(() => {
    if (!user?.sicilNo) {
      setLoading(false);
      return;
    }

    const fetchLatestDutyStatus = async () => {
      try {
        // Query the personnel ID first
        const personnelRes = await api
          .from('personnel')
          .select('id')
          .eq('sicil_no', user.sicilNo)
          .single();

        if (personnelRes.data?.id) {
          const res = await api
            .from('personnel_shifts_log')
            .select('*')
            .eq('personnel_id', personnelRes.data.id)
            .order('giris_tarihi', { ascending: false })
            .limit(1);

          const logs = res.data as any[] | null;
          if (logs && Array.isArray(logs) && logs.length > 0) {
            const latest = logs[0];
            if (latest.durum === 'GÖREVDE' && !latest.cikis_tarihi) {
              setDutyStatus('AKTIF');
            } else {
              setDutyStatus('TAMAMLANDI');
            }
          } else {
            setDutyStatus('TAMAMLANDI');
          }
        } else {
          setDutyStatus('TAMAMLANDI');
        }
      } catch (err: unknown) {
        console.error('[GeofenceButton] Nöbet durumu sorgulama hatası:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchLatestDutyStatus();
  }, [user?.sicilNo]);

  // 2. Continuous GPS Tracking and 3-Station Geofence Matrix
  useEffect(() => {
    if (!navigator.geolocation) {
      setStatus("error");
      setMessage("Tarayıcınız konum servisini desteklemiyor.");
      return;
    }

    const geoOptions = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    };

    const handleSuccess = (position: GeolocationPosition) => {
      const { latitude, longitude } = position.coords;
      const lat = latitude || 0;
      const lng = longitude || 0;
      setCoords({ lat, lng });

      // Find the nearest fire station in the geofence matrix
      let minDistance = Infinity;
      STATIONS.forEach(station => {
        const dist = calculateDistance(lat, lng, station.lat, station.lng);
        if (dist < minDistance) {
          minDistance = dist;
        }
      });

      setDistance(minDistance);
      setPermissionDenied(false);

      if (minDistance > MAX_DISTANCE_METERS) {
        setStatus("error");
        const formattedDist = minDistance >= 1000 ? `${(minDistance / 1000).toFixed(1)} km` : `${Math.round(minDistance)}m`;
        setMessage(`Yerleşke Dışındasınız (${formattedDist})`);
      } else {
        setStatus("idle");
        setMessage("");
      }
    };

    const handleError = (error: GeolocationPositionError) => {
      console.error('[GeofenceButton] Konum alma hatası:', error?.message || `Hata Kodu: ${error?.code}` || error);
      setStatus("error");
      if (error.code === error.PERMISSION_DENIED) {
        setMessage("Konum izni verilmedi.");
        setPermissionDenied(true);
      } else {
        setMessage("Konum alınamadı. Sinyal aranıyor...");
      }
      setDistance(null);
    };

    // First instant check
    navigator.geolocation.getCurrentPosition(handleSuccess, handleError, geoOptions);

    // Continuous real-time tracking
    const watchId = navigator.geolocation.watchPosition(handleSuccess, handleError, geoOptions);

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  const handleToggleDuty = async () => {
    if (!user?.sicilNo) return;
    if (distance === null || distance > MAX_DISTANCE_METERS) {
      setStatus("error");
      const formattedDist = distance !== null 
        ? (distance >= 1000 ? `${(distance / 1000).toFixed(1)} km` : `${Math.round(distance)}m`)
        : "Bilinmiyor";
      setMessage(`Yerleşke Dışındasınız (${formattedDist})`);
      return;
    }

    setBtnLoading(true);
    setStatus("idle");

    const endpoint = dutyStatus === 'AKTIF' ? '/api/shift-log/end' : '/api/shift-log/start';
    const nextStatus = dutyStatus === 'AKTIF' ? 'TAMAMLANDI' : 'AKTIF';

    try {
      const authHeaders: Record<string, string> = {};
      const authData = localStorage.getItem('sivas-itfaiye-auth');
      if (authData) {
        const parsed = JSON.parse(authData);
        if (parsed.state?.token) {
          authHeaders['Authorization'] = `Bearer ${parsed.state.token}`;
        }
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        }
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setStatus("error");
        setMessage(`Kayıt hatası: ${data.error || 'Bilinmeyen hata'}`);
      } else {
        setDutyStatus(nextStatus);
        setStatus("success");
        setMessage(
          dutyStatus !== 'AKTIF'
            ? "Vardiyanız başarıyla başlatıldı. İyi nöbetler!"
            : "Vardiyanız başarıyla sonlandırıldı. İyi istirahatler!"
        );
      }
    } catch (err: unknown) {
      console.error('[GeofenceButton] Nöbet kaydı yazma hatası:', err);
      setStatus("error");
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessage(`Bağlantı hatası: ${errMsg}`);
    } finally {
      setBtnLoading(false);
      setTimeout(() => {
        setStatus("idle");
        setMessage("");
      }, 5000);
    }
  }

  // Hide component completely if user info is not loaded yet
  if (!user) return null;

  // Render for mobile nav sheet menu enjection
  if (isMobile) {
    if (permissionDenied) {
      return (
        <button
          type="button"
          disabled
          className="bg-slate-900 border border-amber-500/30 text-amber-500/70 opacity-60 w-full min-h-[48px] rounded-xl flex items-center justify-center gap-2 font-semibold cursor-not-allowed text-sm"
        >
          <span>⚠️</span>
          <span>
            {dutyStatus === 'AKTIF'
              ? 'Görevi Bitir (Konum İzni Gerekli)'
              : 'Görevi Başlat (Konum İzni Gerekli)'}
          </span>
        </button>
      )
    }

    if (distance === null || distance > MAX_DISTANCE_METERS) {
      const formattedDist = distance !== null 
        ? (distance >= 1000 ? `${(distance / 1000).toFixed(1)} km` : `${Math.round(distance)}m`)
        : "Bilinmiyor";
      return (
        <button
          type="button"
          disabled
          className="bg-slate-900 border border-red-500/20 text-slate-500/80 opacity-70 w-full min-h-[48px] rounded-xl flex items-center justify-center gap-2 font-semibold cursor-not-allowed text-sm"
        >
          <span>🛑</span>
          <span>
            Yerleşke Dışındasınız ({formattedDist})
          </span>
        </button>
      )
    }

    return (
      <button
        type="button"
        disabled={loading || btnLoading}
        onClick={handleToggleDuty}
        className={cn(
          "w-full min-h-[48px] rounded-xl flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.97] ease-[cubic-bezier(0.4,0,0.2,1)] font-bold text-sm shadow-md",
          dutyStatus === 'AKTIF'
            ? "bg-rose-950/20 border border-rose-500/40 text-rose-400 hover:bg-rose-950/40 shadow-[0_0_15px_rgba(244,63,94,0.1)]"
            : "bg-emerald-950/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-950/40 shadow-[0_0_15px_rgba(16,185,129,0.1)]"
        )}
      >
        {loading || btnLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <>
            <span>{dutyStatus === 'AKTIF' ? '🛑' : '🚪'}</span>
            <span>{dutyStatus === 'AKTIF' ? 'Görevi Bitir' : 'Görevi Başlat'}</span>
          </>
        )}
      </button>
    )
  }

  const isOutOfRange = distance === null || distance > MAX_DISTANCE_METERS;
  const isButtonDisabled = loading || btnLoading || isOutOfRange || permissionDenied;

  return (
    <div className="relative flex items-center space-x-2">
      {/* Dynamic Geofence Radar Status Badge */}
      {distance !== null && (
        <span className={`hidden lg:inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full border backdrop-blur-md transition-all duration-300 ${
          distance <= MAX_DISTANCE_METERS 
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 light:bg-emerald-50 light:text-emerald-800 light:border-emerald-200' 
            : 'bg-rose-500/10 text-rose-400 border-rose-500/20 light:bg-rose-50 light:text-rose-800 light:border-rose-200'
        }`}>
          <MapPin className="w-3.5 h-3.5 mr-1" />
          {distance <= MAX_DISTANCE_METERS 
            ? `İstasyondasınız (${Math.round(distance)}m)` 
            : `Yerleşke Dışındasınız (${distance >= 1000 ? `${(distance / 1000).toFixed(1)} km` : `${Math.round(distance)}m`})`
          }
        </span>
      )}

      {/* Glassmorphic Tactical Duty Button */}
      <Button 
        onClick={handleToggleDuty}
        disabled={isButtonDisabled}
        className={`hidden md:flex items-center space-x-2 rounded-full px-5 py-2 transition-all duration-200 active:scale-[0.97] ease-[cubic-bezier(0.4,0,0.2,1)] font-bold shadow-lg border border-white/10 ${
          isButtonDisabled
            ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed opacity-60 light:bg-slate-100 light:text-slate-400 light:border-slate-200'
            : dutyStatus === 'AKTIF'
              ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/30 light:bg-rose-100 light:text-rose-900 light:border-rose-200 light:hover:bg-rose-200 light:shadow-sm'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30 light:bg-emerald-100 light:text-emerald-900 light:border-emerald-200 light:hover:bg-emerald-200 light:shadow-sm'
        }`}
      >
        {loading || btnLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <span className="flex items-center justify-center">
            {dutyStatus === 'AKTIF' ? '🛑' : '🚒'}
          </span>
        )}
        <span className="text-sm">
          {dutyStatus === 'AKTIF' ? 'Görevi Bitir' : 'Görevi Başlat'}
        </span>
      </Button>
      
      {/* Toast-like tactical notification banner */}
      {status !== 'idle' && message && (
        <div className={`absolute top-full mt-2 right-0 px-4 py-2.5 rounded-xl shadow-2xl border text-xs font-semibold backdrop-blur-lg whitespace-nowrap z-50 animate-in fade-in slide-in-from-top-2 duration-200 ${
          status === 'error' 
            ? 'bg-rose-950/90 text-rose-200 border-rose-800/40 light:bg-rose-50 light:text-rose-900 light:border-rose-200' 
            : 'bg-emerald-950/90 text-emerald-200 border-emerald-800/40 light:bg-emerald-50 light:text-emerald-900 light:border-emerald-200'
        }`}>
          {message}
        </div>
      )}
    </div>
  )
}
