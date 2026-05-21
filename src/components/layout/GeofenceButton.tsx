"use client"

import { useState, useEffect } from 'react'
import { MapPin, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useAuthStore } from '@/lib/authStore'
import { api } from '@/lib/api'
import { DutyLog } from '@/types'

// Sivas Ana İtfaiye Binası Koordinatları (39.7388, 37.0025)
const STATION_LAT = 39.7388
const STATION_LNG = 37.0025
const MAX_DISTANCE_METERS = 50

export function GeofenceButton() {
  const { user } = useAuthStore()
  const [dutyStatus, setDutyStatus] = useState<'AKTIF' | 'TAMAMLANDI'>('TAMAMLANDI')
  const [loading, setLoading] = useState(true)
  const [btnLoading, setBtnLoading] = useState(false)
  const [distance, setDistance] = useState<number | null>(null)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle")
  const [message, setMessage] = useState("")

  // Haversine formula to calculate distance between two coordinates in meters
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
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
        const res = await api
          .from<DutyLog>('duty_logs')
          .select('*')
          .eq('sicil_no', user.sicilNo)
          .order('timestamp', { ascending: false })
          .limit(1);

        const logs = res.data as DutyLog[] | null;
        if (logs && Array.isArray(logs) && logs.length > 0) {
          const latest = logs[0];
          if (latest.action === 'START_DUTY') {
            setDutyStatus('AKTIF');
          } else {
            setDutyStatus('TAMAMLANDI');
          }
        } else {
          setDutyStatus('TAMAMLANDI');
        }
      } catch (err) {
        console.error('[GeofenceButton] Nöbet durumu sorgulama hatası:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchLatestDutyStatus();
  }, [user?.sicilNo]);

  // 2. Periodic location check every 15 seconds
  useEffect(() => {
    if (!navigator.geolocation) {
      setStatus("error");
      setMessage("Tarayıcınız konum servisini desteklemiyor.");
      return;
    }

    const checkLocation = () => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const lat = latitude || 0;
          const lng = longitude || 0;
          setCoords({ lat, lng });

          const dist = calculateDistance(lat, lng, STATION_LAT, STATION_LNG);
          setDistance(dist);

          if (dist > MAX_DISTANCE_METERS) {
            setStatus("error");
            setMessage(`Binaya çok uzaksınız (${Math.round(dist)}m). Nöbet butonları pasif!`);
          } else {
            setStatus("idle");
            setMessage("");
          }
        },
        (error) => {
          console.error('[GeofenceButton] Konum alma hatası:', error);
          setStatus("error");
          if (error.code === error.PERMISSION_DENIED) {
            setMessage("Konum izni verilmedi.");
          } else {
            setMessage("Konum alınamadı. Lütfen tekrar deneyin.");
          }
          setDistance(null);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    };

    // Run location check immediately on mount
    checkLocation();

    // Check location every 15 seconds
    const intervalId = setInterval(checkLocation, 15000);

    return () => clearInterval(intervalId);
  }, []);

  const handleToggleDuty = async () => {
    if (!user?.sicilNo) return;
    if (distance === null || distance > MAX_DISTANCE_METERS) {
      setStatus("error");
      setMessage("İstasyon sınırları dışında işlem yapılamaz!");
      return;
    }

    setBtnLoading(true);
    setStatus("idle");

    const nextAction = dutyStatus === 'AKTIF' ? 'END_DUTY' : 'START_DUTY';
    const nextStatus = dutyStatus === 'AKTIF' ? 'TAMAMLANDI' : 'AKTIF';
    const lat = coords?.lat || 0;
    const lng = coords?.lng || 0;

    try {
      const logData: DutyLog = {
        sicil_no: user.sicilNo,
        action: nextAction,
        timestamp: new Date().toISOString(),
        latitude: lat,
        longitude: lng
      };

      const res = await api.insert('duty_logs', logData);

      if (res.error) {
        setStatus("error");
        setMessage(`Kayıt hatası: ${res.error}`);
      } else {
        setDutyStatus(nextStatus);
        setStatus("success");
        setMessage(
          nextAction === 'START_DUTY'
            ? "Vardiyanız başarıyla başlatıldı. İyi nöbetler!"
            : "Vardiyanız başarıyla sonlandırıldı. İyi istirahatler!"
        );
      }
    } catch (err: any) {
      console.error('[GeofenceButton] Nöbet kaydı yazma hatası:', err);
      setStatus("error");
      setMessage(`Bağlantı hatası: ${err.message || err}`);
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

  const isOutOfRange = distance === null || distance > MAX_DISTANCE_METERS;
  const isButtonDisabled = loading || btnLoading || isOutOfRange;

  return (
    <div className="relative flex items-center space-x-2">
      {/* Dynamic Geofence Radar Status Badge */}
      {distance !== null && (
        <span className={`hidden lg:inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full border backdrop-blur-md transition-all duration-300 ${
          distance <= MAX_DISTANCE_METERS 
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
            : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
        }`}>
          <MapPin className="w-3.5 h-3.5 mr-1" />
          {distance <= MAX_DISTANCE_METERS 
            ? `İstasyondasınız (${Math.round(distance)}m)` 
            : `Mesafe: ${Math.round(distance)}m`
          }
        </span>
      )}

      {/* Glassmorphic Tactical Duty Button */}
      <Button 
        onClick={handleToggleDuty}
        disabled={isButtonDisabled}
        className={`hidden md:flex items-center space-x-2 rounded-full px-5 py-2 transition-all duration-300 font-bold shadow-lg border border-white/10 ${
          isButtonDisabled
            ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed opacity-60'
            : dutyStatus === 'AKTIF'
              ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/30'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30'
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
            ? 'bg-rose-950/90 text-rose-200 border-rose-800/40' 
            : 'bg-emerald-950/90 text-emerald-200 border-emerald-800/40'
        }`}>
          {message}
        </div>
      )}
    </div>
  )
}
