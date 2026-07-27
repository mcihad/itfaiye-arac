"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { api, unwrap, getAuthHeaders } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import {
  Flame,
  Truck,
  Droplets,
  GraduationCap,
  TrendingUp,
  TrendingDown,
  Activity,
  Clock,
  AlertTriangle,
  Wrench,
  Shield,
  Loader2,
  BarChart3,
  ArrowRight,
  Target,
  Map as MapIcon,
  Users,
  Search,
  MapPin,
  Info,
  X,
  Settings
} from "lucide-react"
import Link from "next/link"
import { CriticalAlertsWidget } from "@/components/dashboard/CriticalAlertsWidget"
import { ShiftList } from "@/components/dashboard/ShiftList"
import { HourlyShifts } from "@/components/dashboard/HourlyShifts"
import { ShiftCountdown } from "@/components/dashboard/ShiftCountdown"
import { FutureShiftCalendar } from "@/components/personnel/FutureShiftCalendar"
import { DailyWorkSchedule } from "@/components/dashboard/DailyWorkSchedule"
import { Personnel } from "@/types"
import { Input } from "@/components/ui/Input"
import { useAuthStore } from "@/lib/authStore"
import { getActivePostaForStation } from "@/lib/shiftUtils"
import { isIdariUnvan, isKarargah } from "@/lib/personnelUtils"
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
} from "recharts"

const normalizeTextForSearch = (str: string): string => {
  if (!str) return "";
  return str
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g").replace(/Ğ/g, "g")
    .replace(/ü/g, "u").replace(/Ü/g, "u")
    .replace(/ş/g, "s").replace(/Ş/g, "s")
    .replace(/ö/g, "o").replace(/Ö/g, "o")
    .replace(/ç/g, "c").replace(/Ç/g, "c")
    .toLowerCase();
}

const DAILY_SCHEDULE_SLOTS = [
  { start: "08:00", end: "09:00", label: "Posta Devir Teslimi", type: "Tatbiki", icon: "🔧" },
  { start: "09:00", end: "10:00", label: "Kültür Fizik (Spor)", type: "Tatbiki", icon: "🏃" },
  { start: "10:00", end: "10:30", label: "Eğitime Hazırlık", type: "Tatbiki", icon: "🚿" },
  { start: "10:30", end: "11:15", label: "Eğitim Konusu", type: "Nazari", icon: "📖" },
  { start: "11:15", end: "12:00", label: "Dinlenme & Hazırlık", type: "Mola", icon: "☕" },
  { start: "12:00", end: "13:30", label: "Öğle Yemeği", type: "Mola", icon: "🍽️" },
  { start: "13:30", end: "15:00", label: "Birey Eğitimi", type: "Nazari/Tatbiki", icon: "📋" },
  { start: "15:00", end: "15:30", label: "Dinlenme", type: "Mola", icon: "☕" },
  { start: "15:30", end: "16:30", label: "Araç & Malzeme Bakımı", type: "Tatbiki", icon: "🛠️" },
  { start: "16:30", end: "16:45", label: "Dinlenme", type: "Mola", icon: "☕" },
  { start: "16:45", end: "17:30", label: "Eğitim Değerlendirmesi", type: "Nazari/Tatbiki", icon: "📝" },
  { start: "17:30", end: "18:30", label: "Serbest Zaman", type: "Mola", icon: "🏠" },
  { start: "18:30", end: "20:00", label: "Akşam Yemeği", type: "Mola", icon: "🍽️" },
  { start: "20:00", end: "21:00", label: "Görsel Sunumlar", type: "Nazari", icon: "📺" }
]

// ─── Types ──────────────────────────────────────────────────
interface KPIData {
  activeIncidents: number
  vehiclesInMaintenance: number
  faultyHydrants: number
  upcomingTraining: { count: number; nextDate: string | null; nextTopic: string | null }
}

interface DailyIncident {
  date: string
  label: string
  count: number
}

interface ActivityItem {
  id: string
  type: "incident" | "maintenance" | "hydrant" | "training"
  title: string
  detail: string
  time: string
  rawTime: string
  status?: string
}

interface IncidentInfo {
  created_at: string
}

interface IncidentDetail {
  id: string | number
  olay_turu: string
  mahalle: string | null
  created_at: string
  status?: string
}

interface VehicleMaintenance {
  id: number
  plaka: string
  islem_turu: string
  created_at: string
}

interface FireHydrant {
  id: string | number
  no: string | null
  durum: string
  created_at: string
}

interface ActivityAndTraining {
  id: number
  faaliyet_turu: string
  faaliyet_konusu: string
  created_at: string
}

interface DashboardTooltipProps {
  active?: boolean
  payload?: Array<{ value: number; name?: string; color?: string }>
  label?: string
}

interface VehicleInfo {
  plaka: string
  arac_tipi: string
  istasyon?: string
  durum?: string
  status?: string
  current_branch?: string
  sorumlu_sofor_id?: string | null
  sorumlu_er_id?: string | null
}

interface ActiveIncidentDetail {
  id: string
  olay_turu: string
  ihbar_saati: string | null
  cikis_saati: string | null
  varis_saati: string | null
  donus_saati: string | null
  mahalle: string | null
  adres: string | null
  location: string | null
  status: string
  ek16_araclar: string | null
  created_at: string
}

interface ActiveMission {
  plaka: string
  arac_tipi: string
  olay_turu: string
  mahalle: string
  adres: string
  cikis_saati: string
  coords: [number, number] | null
  personnel?: string[]
}

// ─── Helpers ────────────────────────────────────────────────
function formatRelativeTime(dateStr: string): string {
  const now = new Date()
  const d = new Date(dateStr)
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return "Az önce"
  if (diffMin < 60) return `${diffMin} dk önce`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr} saat önce`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay === 1) return "Dün"
  return `${diffDay} gün önce`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function LiveDuration({ cikisSaati }: { cikisSaati: string }) {
  const [durationStr, setDurationStr] = useState("00:00:00")

  useEffect(() => {
    const calculate = () => {
      const diffMs = Date.now() - new Date(cikisSaati).getTime()
      if (diffMs < 0) {
        setDurationStr("00:00:00")
        return
      }
      const totalSecs = Math.floor(diffMs / 1000)
      const hrs = Math.floor(totalSecs / 3600)
      const mins = Math.floor((totalSecs % 3600) / 60)
      const secs = totalSecs % 60

      const pad = (n: number) => String(n).padStart(2, "0")
      setDurationStr(`${pad(hrs)}:${pad(mins)}:${pad(secs)}`)
    }

    calculate()
    const interval = setInterval(calculate, 1000)
    return () => clearInterval(interval)
  }, [cikisSaati])

  return <span className="font-mono text-cyan-400 font-bold">{durationStr}</span>
}

const activityIcon = (type: ActivityItem["type"]) => {
  switch (type) {
    case "incident":
      return <Flame className="w-4 h-4 text-red-500" />
    case "maintenance":
      return <Wrench className="w-4 h-4 text-orange-500" />
    case "hydrant":
      return <Droplets className="w-4 h-4 text-blue-500" />
    case "training":
      return <GraduationCap className="w-4 h-4 text-emerald-500" />
  }
}

export default function DashboardPage() {
  const router = useRouter()
  const { user } = useAuthStore()

  const showCriticalAlerts = useMemo(() => {
    if (!user) return false
    const role = user.rol || ""
    const title = user.unvan || ""

    if (role === "Admin" || role === "Editor" || role === "Shift_Leader") {
      return true
    }

    const normalizedTitle = title.toLowerCase()
      .replace(/ı/g, "i")
      .replace(/ş/g, "s")
      .replace(/ğ/g, "g")
      .replace(/ç/g, "c")
      .replace(/ü/g, "u")
      .replace(/ö/g, "o")

    const managerKeywords = ["mudur", "amir", "cavus", "cvs", "bas.cvs", "bas sofor", "bas.sofor", "pos.bas"]
    return managerKeywords.some(keyword => normalizedTitle.includes(keyword))
  }, [user])

  const [programInfo, setProgramInfo] = useState({ 
    isOffDuty: true, 
    text: "🔵 Karargah Nöbetçi Postası Hazır Kıta Beklemededir",
    timeLeft: "--:--",
    icon: "🔵",
    label: "Bekleme",
    type: "Hazır Kıta"
  })
  const [currentTime, setCurrentTime] = useState("")

  // Faz 28.55: Batarya Dostu Mobil GPS İzleme Motoru
  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation || !user?.sicilNo) return

    const sendCoords = (position: GeolocationPosition) => {
      const lat = position.coords.latitude
      const lng = position.coords.longitude
      api.update('personnel', {
        son_enlem: lat,
        son_boylam: lng,
        son_guncelleme: new Date().toISOString()
      }, { sicil_no: user.sicilNo })
      .then(res => {
        if (res.error) {
          console.error('[GPS Motoru] Konum güncelleme hatası:', res.error)
        }
      })
      .catch(err => {
        console.error('[GPS Motoru] Konum gönderim hatası:', err)
      })
    }

    // İlk konum bilgisini hemen çek ve gönder
    navigator.geolocation.getCurrentPosition(
      sendCoords,
      (err) => console.warn('[GPS Motoru] İlk konum alınamadı:', err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )

    // 30 saniyede bir güncelle (interval tabanlı)
    const gpsInterval = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        sendCoords,
        (err) => console.warn('[GPS Motoru] Konum güncellemesi başarısız:', err),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      )
    }, 30000)

    return () => clearInterval(gpsInterval)
  }, [user?.sicilNo])

  useEffect(() => {
    const checkProgram = () => {
      const now = new Date()
      setCurrentTime(now.toLocaleTimeString("tr-TR"))
      const day = now.getDay() // 0: Sunday, 6: Saturday
      if (day === 0) {
        setProgramInfo({ 
          isOffDuty: true, 
          text: "🔵 Karargah Nöbetçi Postası Hazır Kıta Beklemededir",
          timeLeft: "--:--", icon: "🔵", label: "Pazar İzni / Hazır Kıta", type: "Bekleme"
        })
        return
      }

      const hours = now.getHours()
      const minutes = now.getMinutes()
      const totalMinutesNow = hours * 60 + minutes

      const slots = DAILY_SCHEDULE_SLOTS

      let matched = false
      for (const slot of slots) {
        const [startH, startM] = slot.start.split(":").map(Number)
        const [endH, endM] = slot.end.split(":").map(Number)
        const startTotal = startH * 60 + startM
        const endTotal = endH * 60 + endM

        if (totalMinutesNow >= startTotal && totalMinutesNow < endTotal) {
           const targetTime = new Date(now)
           targetTime.setHours(endH, endM, 0, 0)
           const diffMs = targetTime.getTime() - now.getTime()
           
           const m = Math.floor((diffMs / 1000) / 60)
           const s = Math.floor((diffMs / 1000) % 60)
           const timeLeftStr = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`

          if (slot.start === "10:30" && slot.end === "11:15") {
            setProgramInfo({
              isOffDuty: false,
              text: "🟢 ŞU ANKİ PROGRAM: 10:30 - 11:15 İtfaiye Teorik ve Pratik Eğitimi",
              timeLeft: timeLeftStr, icon: "📖", label: "Pratik Eğitim", type: "Eğitimdesiniz"
            })
          } else {
            setProgramInfo({
              isOffDuty: slot.type === 'Mola',
              text: `${slot.icon} ${slot.start}-${slot.end} | ${slot.label} [${slot.type}]`,
              timeLeft: timeLeftStr, icon: slot.icon, label: slot.label, type: slot.type
            })
          }
          matched = true
          break
        }
      }

      if (!matched) {
        if (totalMinutesNow >= 21 * 60 || totalMinutesNow < 8 * 60) {
          setProgramInfo({ 
            isOffDuty: true, 
            text: "🌙 Nöbetçi Posta — Gece Vardiyası (Hazır Kıta Beklemede)",
            timeLeft: "--:--", icon: "🌙", label: "Gece Vardiyası", type: "Hazır Kıta"
          })
        } else {
          setProgramInfo({ 
            isOffDuty: true, 
            text: "🔵 Karargah Nöbetçi Postası Hazır Kıta Beklemededir",
            timeLeft: "--:--", icon: "🔵", label: "Bekleme", type: "Hazır Kıta"
          })
        }
      }
    }

    checkProgram()
    const interval = setInterval(checkProgram, 1000)
    return () => clearInterval(interval)
  }, [])

  const [loading, setLoading] = useState(true)
  const [customShiftTimes, setCustomShiftTimes] = useState<any>(null)
  const [isShiftEditModalOpen, setIsShiftEditModalOpen] = useState(false)
  const [editMerkezTime, setEditMerkezTime] = useState("08:00")
  const [editEsentepeTime, setEditEsentepeTime] = useState("08:45")
  const [editOrganizeTime, setEditOrganizeTime] = useState("09:15")
  const [isSavingShiftTimes, setIsSavingShiftTimes] = useState(false)
  // Ayarlardan okunan sabit görevliler (eskiden koda gömülüydü)
  const [sabitNizamiyeSicil, setSabitNizamiyeSicil] = useState<string | null>(null)
  const [sayimUyariSicil, setSayimUyariSicil] = useState<string | null>(null)
  const [editSabitNizamiye, setEditSabitNizamiye] = useState("")
  const [editSayimUyari, setEditSayimUyari] = useState("")

  useEffect(() => {
    if (isShiftEditModalOpen) {
      const getFormatted = (station: string, def: string) => {
        if (customShiftTimes && customShiftTimes[station]) {
          const { hours, minutes } = customShiftTimes[station]
          return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
        }
        return def
      }
      setEditMerkezTime(getFormatted('Merkez', '08:00'))
      setEditEsentepeTime(getFormatted('Esentepe', '08:45'))
      setEditOrganizeTime(getFormatted('Organize', '09:15'))
      setEditSabitNizamiye(sabitNizamiyeSicil || "")
      setEditSayimUyari(sayimUyariSicil || "")
    }
  }, [isShiftEditModalOpen, customShiftTimes, sabitNizamiyeSicil, sayimUyariSicil])

  const handleSaveShiftTimes = async () => {
    setIsSavingShiftTimes(true)
    try {
      unwrap(await api.update('system_settings', { value: editMerkezTime }, { key: 'merkez_shift_time' }))
      unwrap(await api.update('system_settings', { value: editEsentepeTime }, { key: 'esentepe_shift_time' }))
      unwrap(await api.update('system_settings', { value: editOrganizeTime }, { key: 'organize_shift_time' }))
      // Sabit görevli ayarları (satır yoksa oluşturulur)
      unwrap(await api.upsert('system_settings', { key: 'sabit_nizamiye_sicil', value: editSabitNizamiye }, 'key'))
      unwrap(await api.upsert('system_settings', { key: 'sayim_uyari_sabit_sicil', value: editSayimUyari }, 'key'))

      await fetchDashboardData()
      setIsShiftEditModalOpen(false)
    } catch (e) {
      console.error("Error saving shift times:", e)
      alert("Saatler kaydedilirken bir hata oluştu.")
    } finally {
      setIsSavingShiftTimes(false)
    }
  }

  const [kpi, setKpi] = useState<KPIData>({
    activeIncidents: 0,
    vehiclesInMaintenance: 0,
    faultyHydrants: 0,
    upcomingTraining: { count: 0, nextDate: null, nextTopic: null },
  })
  const [dailyData, setDailyData] = useState<DailyIncident[]>([])
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [vehicles, setVehicles] = useState<VehicleInfo[]>([])
  const [activeIncidentsList, setActiveIncidentsList] = useState<ActiveIncidentDetail[]>([])
  const [activeExternalMissions, setActiveExternalMissions] = useState<any[]>([])
  const [personnelList, setPersonnelList] = useState<Personnel[]>([])
  const [staffCertifications, setStaffCertifications] = useState<any[]>([])
  const [isMissionModalOpen, setIsMissionModalOpen] = useState(false)
  const [isPersonnelModalOpen, setIsPersonnelModalOpen] = useState(false)
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false)
  const [isAlertsModalOpen, setIsAlertsModalOpen] = useState(false)
  const [activeAlertsTab, setActiveAlertsTab] = useState<'vehicles' | 'licenses' | 'assignments'>('vehicles')
  const [activeShiftTab, setActiveShiftTab] = useState<'daily' | 'hourly' | 'schedule' | 'calendar'>('daily')
  const [overdueAssignments, setOverdueAssignments] = useState<any[]>([])
  const [monthlyTrendData, setMonthlyTrendData] = useState<{ date: string; label: string; count: number }[]>([])
  const [distributionData, setDistributionData] = useState<{
    total: number
    list: { type: string; count: number; percentage: number; color: string }[]
  }>({
    total: 0,
    list: []
  })
  const [avgResponseTime, setAvgResponseTime] = useState<number>(6.4)

  const [justiceStats, setJusticeStats] = useState<any[]>([])
  const [justiceLoading, setJusticeLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedPersonnelStats, setSelectedPersonnelStats] = useState<any | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)

  const filteredJusticeStats = useMemo(() => {
    const allowedUnvans = ['Er', 'Şoför', 'Baş Şoför', 'Pos.Baş.Şof.']
    return justiceStats.filter((p: any) => allowedUnvans.includes(p.unvan))
  }, [justiceStats])

  const conicGradientStyle = useMemo(() => {
    let accum = 0
    const parts = distributionData.list.map((item) => {
      const start = accum
      accum += item.percentage
      const end = accum
      return `${item.color} ${start}% ${end}%`
    })
    return parts.length > 0 ? { background: `conic-gradient(${parts.join(', ')})` } : { background: 'var(--fd-surface2)' }
  }, [distributionData])

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

  const fetchJusticeStats = async () => {
    try {
      setJusticeLoading(true)
      const res = await fetch("/api/personnel/stats")
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setJusticeStats(data.stats || [])
        }
      }
    } catch (err) {
      console.error("Error fetching justice stats:", err)
    } finally {
      setJusticeLoading(false)
    }
  }

  const handleSelectPersonnel = async (sicilNo: string) => {
    setLookupLoading(true)
    try {
      const res = await fetch(`/api/personnel/stats?personnel_id=${sicilNo}`)
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setSelectedPersonnelStats(data)
        }
      }
    } catch (err) {
      console.error("Error looking up personnel:", err)
    } finally {
      setLookupLoading(false)
    }
  }

  useEffect(() => {
    fetchDashboardData()
    fetchJusticeStats()
  }, [])

  const fetchDashboardData = async () => {
    setLoading(true)
    try {
      // ── 1. KPI: Active Incidents ──────────────────────────
      const { count: incidentCount } = await api
        .from("incidents")
        .select("*")
        .eq("status", "active")
        
      const { count: activeExtCount } = await api
        .from("external_missions")
        .select("*")
        .eq("durum", "Aktif")

      // ── 2. KPI: Vehicles in Maintenance ───────────────────
      const { count: maintCount } = await api
        .from("vehicles")
        .select("*")
        .eq("status", "maintenance")

      // ── 3. KPI: Faulty Hydrants ───────────────────────────
      const { count: hydrantCount } = await api
        .from("fire_hydrants")
        .select("*")
        .eq("status", "broken")

      // ── 4. KPI: Upcoming Trainings ────────────────────────
      const now = new Date().toISOString()
      const { data: trainings, count: trainingCount } = await api
        .from("activities_and_trainings")
        .select("faaliyet_konusu,baslangic_tarihi")
        .gte("baslangic_tarihi", now)
        .order("baslangic_tarihi", { ascending: true })
        .limit(1)

      setKpi({
        activeIncidents: (incidentCount ?? 0) + (activeExtCount ?? 0),
        vehiclesInMaintenance: maintCount ?? 0,
        faultyHydrants: hydrantCount ?? 0,
        upcomingTraining: {
          count: trainingCount ?? 0,
          nextDate: trainings?.[0]?.baslangic_tarihi ?? null,
          nextTopic: trainings?.[0]?.faaliyet_konusu ?? null,
        },
      })

      // ── 5. Last 7 Days Incident Trend ─────────────────────
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
      sevenDaysAgo.setHours(0, 0, 0, 0)

      const { data: recentIncidents } = await api
        .from("incidents")
        .select("created_at")
        .gte("created_at", sevenDaysAgo.toISOString())
        .order("created_at", { ascending: true })

      // Build 7-day buckets
      const buckets: DailyIncident[] = []
      const dayNames = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"]
      for (let i = 0; i < 7; i++) {
        const d = new Date(sevenDaysAgo)
        d.setDate(d.getDate() + i)
        const dateStr = d.toISOString().split("T")[0]
        buckets.push({
          date: dateStr,
          label: dayNames[d.getDay()],
          count: 0,
        })
      }

      recentIncidents?.forEach((inc: IncidentInfo) => {
        const dateStr = new Date(inc.created_at).toISOString().split("T")[0]
        const bucket = buckets.find((b) => b.date === dateStr)
        if (bucket) bucket.count++
      })

      setDailyData(buckets)

      // ── 5b. Monthly Incident Trend & Type Distribution ────
      const twelveMonthsAgo = new Date()
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11)
      twelveMonthsAgo.setDate(1)
      twelveMonthsAgo.setHours(0, 0, 0, 0)

      const { data: allIncidents } = await api
        .from("incidents")
        .select("created_at, olay_turu")

      // --- Monthly Trend Calculation ---
      const trendBuckets: { date: string; label: string; count: number }[] = []
      const monthNames = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"]
      
      for (let i = 0; i < 12; i++) {
        const d = new Date(twelveMonthsAgo)
        d.setMonth(d.getMonth() + i)
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        trendBuckets.push({
          date: monthKey,
          label: `${monthNames[d.getMonth()]} ${String(d.getFullYear()).substring(2)}`,
          count: 0
        })
      }

      allIncidents?.forEach((inc: any) => {
        const dateObj = new Date(inc.created_at)
        const monthKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`
        const bucket = trendBuckets.find((b) => b.date === monthKey)
        if (bucket) bucket.count++
      })
      setMonthlyTrendData(trendBuckets)

      // --- Type Distribution Calculation ---
      const typeCounts: { [key: string]: number } = {}
      let distTotalCount = 0

      allIncidents?.forEach((inc: any) => {
        const rawType = inc.olay_turu || "Diğer"
        let normalizedType = "Diğer"
        
        if (rawType.includes("Konut") || rawType.includes("Ev") || rawType.includes("Daire") || rawType.includes("Bina")) {
          normalizedType = "Konut Yangını"
        } else if (rawType.includes("Trafik") || rawType.includes("Kaza") || rawType.includes("Çarpışma")) {
          normalizedType = "Trafik Kazası"
        } else if (rawType.includes("Araç") || rawType.includes("Otomobil") || rawType.includes("Otobüs") || rawType.includes("Kamyon")) {
          normalizedType = "Araç Yangını"
        } else if (rawType.includes("Kurtarma") || rawType.includes("Mahsur")) {
          normalizedType = "Kurtarma"
        } else if (rawType.includes("Su") || rawType.includes("Baskın") || rawType.includes("Sel")) {
          normalizedType = "Su Baskını"
        } else if (rawType.includes("Yangın") || rawType.includes("Anız") || rawType.includes("Orman") || rawType.includes("Çöp")) {
          normalizedType = "Diğer Yangınlar"
        } else {
          normalizedType = "Diğer"
        }

        typeCounts[normalizedType] = (typeCounts[normalizedType] || 0) + 1
        distTotalCount++
      })

      // Map to array with colors
      const colorMap: { [key: string]: string } = {
        "Konut Yangını": "#dc2626",
        "Trafik Kazası": "#f59e0b",
        "Araç Yangını": "#ea580c",
        "Kurtarma": "#2563eb",
        "Su Baskını": "#0891b2",
        "Diğer Yangınlar": "#84cc16",
        "Diğer": "#94a3b8"
      }

      // Pre-populate all standard types to ensure they always render in the legend even if count is 0
      const standardTypes = ["Konut Yangını", "Trafik Kazası", "Araç Yangını", "Kurtarma", "Su Baskını", "Diğer"]
      standardTypes.forEach(t => {
        if (typeCounts[t] === undefined) {
          typeCounts[t] = 0
        }
      })

      const dist = Object.entries(typeCounts).map(([type, count]) => {
        const percentage = distTotalCount > 0 ? Math.round((count / distTotalCount) * 100) : 0
        return {
          type,
          count,
          percentage,
          color: colorMap[type] || "#94a3b8"
        }
      }).sort((a, b) => b.count - a.count)

      setDistributionData({
        total: distTotalCount,
        list: dist
      })

      // ── 6. Activity Feed (last 5 from each table) ─────────
      const feed: ActivityItem[] = []

      const { data: recentInc } = await api
        .from("incidents")
        .select("id,olay_turu,mahalle,created_at,status")
        .order("created_at", { ascending: false })
        .limit(5)

      recentInc?.forEach((r: IncidentDetail) =>
        feed.push({
          id: `inc-${r.id}`,
          type: "incident",
          title: `Yeni olay: ${r.olay_turu}`,
          detail: r.mahalle || "Konum belirtilmedi",
          time: formatRelativeTime(r.created_at),
          rawTime: r.created_at,
          status: r.status
        })
      )
      
      const { data: recentExt } = await api
        .from("external_missions")
        .select("id,gorev_turu,mahalle,baslik,created_at,durum")
        .order("created_at", { ascending: false })
        .limit(5)

      recentExt?.forEach((r: any) =>
        feed.push({
          id: `ext-${r.id}`,
          type: "incident", // render as incident for visibility
          title: `Dış Görev: ${r.gorev_turu}`,
          detail: `${r.baslik} - ${r.mahalle || "Adres yok"}`,
          time: formatRelativeTime(r.created_at),
          rawTime: r.created_at,
          status: r.durum
        })
      )



      // Sort by raw time descending, take top 8
      feed.sort((a, b) => new Date(b.rawTime).getTime() - new Date(a.rawTime).getTime())
      setActivities(feed.slice(0, 8))

      // ── 7. Filo & Aktif Görevler Sorgulaması ───────────────
      const { data: vehiclesData } = await api
        .from<any>("vehicles")
        .select("plaka,arac_tipi,istasyon,durum,status,current_branch,sorumlu_sofor_id,sorumlu_er_id,sigortaBitis,muayeneBitis")
      if (Array.isArray(vehiclesData)) {
        setVehicles(vehiclesData.filter(v => v.plaka !== 'GARAJ'))
      }

      const { data: activeIncs } = await api
        .from<ActiveIncidentDetail>("incidents")
        .select("*")
        .eq("status", "active")
      if (Array.isArray(activeIncs)) {
        setActiveIncidentsList(activeIncs)
      }

      const { data: activeExts } = await api
        .from("external_missions")
        .select("*")
        .eq("durum", "Aktif")
      if (Array.isArray(activeExts)) {
        setActiveExternalMissions(activeExts)
      }

      // ── 8. Nöbetçi Personel Sorgulaması ───────────────────
      const { data: persData } = await api
        .from<Personnel>("personnel")
        .select("*")
        .eq("aktif", true)
        
      if (Array.isArray(persData)) {
        // Personel izinlerini çek ve bugünkü durumlarıyla eşleştir
        const todayStr = new Date().toISOString().split('T')[0]
        const { data: activeLeaves } = await api
          .from('personnel_leaves')
          .select('*')
          .lte('baslangic_tarihi', todayStr)
          .gte('bitis_tarihi', todayStr)
          
        if (activeLeaves && activeLeaves.length > 0) {
          const leaveMap = new Map()
          activeLeaves.forEach((l: any) => {
            leaveMap.set(l.sicil_no, l)
          })
          
          const mergedPersData = persData.map(p => {
            if (leaveMap.has(p.sicil_no)) {
              const leave = leaveMap.get(p.sicil_no)
              const newStatus = leave.aciklama ? `${leave.izin_turu} - ${leave.aciklama}` : leave.izin_turu
              return { ...p, durum: newStatus }
            }
            return p
          })
          setPersonnelList(mergedPersData)
        } else {
          setPersonnelList(persData)
        }
      }

      // ── 9. Gecikmiş Geçici Zimmet Sorgulaması ───────────────────
      const { data: overdueData } = await api
        .from("temporary_assignments")
        .select("*")
        .eq("durum", "GECIKTI")
      
      const { data: invData } = await api.from("inventory").select("id,malzeme_adi")
      const invMap = new Map((invData || []).map((i: any) => [i.id, i.malzeme_adi]))
      
      const mappedOverdue = (overdueData || []).map((item: any) => ({
        ...item,
        materialName: invMap.get(item.malzeme_id) || `Bilinmeyen Malzeme (ID: ${item.malzeme_id})`
      }))
      setOverdueAssignments(mappedOverdue)

      // ── 10. Sertifika / Ehliyet Sorgulaması ───────────────────
      const { data: certsData } = await api
        .from("staff_certifications")
        .select("*")
      if (Array.isArray(certsData)) {
        setStaffCertifications(certsData)
      }

      // ── 11. Rapor İstatistiklerinden Ort. Varış Süresini Çek ───────────────────
      const statsRes = await fetch('/api/reports/stats', {
        headers: getAuthHeaders()
      })
      const statsData = await statsRes.json()
      if (statsData?.success && statsData?.stats) {
        setAvgResponseTime(statsData.stats.avg_response_time || 0)
      }

      // ── 12. Sistem Ayarları (Posta Değişim Saatleri) Sorgulaması ──
      const { data: settingsData } = await api
        .from("system_settings")
        .select("*")
      
      if (Array.isArray(settingsData) && settingsData.length > 0) {
        const times: any = {
          Merkez: { hours: 8, minutes: 0 },
          Esentepe: { hours: 8, minutes: 45 },
          Organize: { hours: 9, minutes: 15 },
          Default: { hours: 8, minutes: 0 }
        }
        settingsData.forEach((s: any) => {
          if (s.key === 'sabit_nizamiye_sicil') { setSabitNizamiyeSicil(s.value || null); return }
          if (s.key === 'sayim_uyari_sabit_sicil') { setSayimUyariSicil(s.value || null); return }
          const [h, m] = s.value.split(':').map(Number)
          if (s.key === 'merkez_shift_time') times.Merkez = { hours: h, minutes: m }
          if (s.key === 'esentepe_shift_time') times.Esentepe = { hours: h, minutes: m }
          if (s.key === 'organize_shift_time') times.Organize = { hours: h, minutes: m }
        })
        times.Default = times.Merkez
        setCustomShiftTimes(times)
      }
    } catch (err) {
      console.error("Dashboard veri hatası:", err)
    } finally {
      setLoading(false)
    }
  }

  // ─── Trend indicator ─────────────────────────────────────
  const trend = useMemo(() => {
    if (dailyData.length < 2) return 0
    const lastTwo = dailyData.slice(-2)
    return lastTwo[1].count - lastTwo[0].count
  }, [dailyData])

  const totalWeekIncidents = useMemo(
    () => dailyData.reduce((s, d) => s + d.count, 0),
    [dailyData]
  )

  const activeMissions = useMemo<ActiveMission[]>(() => {
    const list: ActiveMission[] = []

    if (activeIncidentsList.length > 0) {
      activeIncidentsList.forEach((inc) => {
        let plates: string[] = []
        if (inc.ek16_araclar) {
          try {
            plates = JSON.parse(inc.ek16_araclar)
          } catch {
            if (typeof inc.ek16_araclar === 'string') {
              plates = inc.ek16_araclar.split(',').map((p) => p.trim())
            }
          }
        }

        const coords = parseLocation(inc.location) || [37.0209312, 39.7339522]

        plates.forEach((plaka) => {
          const matchedVeh = vehicles.find((v) => v.plaka === plaka)
          let pList: string[] = []
          if (matchedVeh) {
            if (matchedVeh.sorumlu_sofor_id) {
               const sofor = personnelList.find(p => p.id === matchedVeh.sorumlu_sofor_id)
               if (sofor) pList.push(`${sofor.unvan} ${sofor.ad} ${sofor.soyad}`)
            }
            if (matchedVeh.sorumlu_er_id) {
               const er = personnelList.find(p => p.id === matchedVeh.sorumlu_er_id)
               if (er) pList.push(`${er.unvan} ${er.ad} ${er.soyad}`)
            }
          }
          list.push({
            plaka,
            arac_tipi: matchedVeh?.arac_tipi || "Arazöz",
            olay_turu: inc.olay_turu || "Bilinmeyen Olay",
            mahalle: inc.mahalle || "Bilinmeyen Mahalle",
            adres: inc.adres || "Adres belirtilmemiş",
            cikis_saati: inc.cikis_saati || inc.created_at || new Date().toISOString(),
            coords,
            personnel: pList
          })
        })
      })
    }

    if (activeExternalMissions.length > 0) {
      activeExternalMissions.forEach((mission) => {
        const coords = parseLocation(mission.hedef_koordinat) || [37.0209312, 39.7339522]
        const matchedVeh = vehicles.find((v) => v.plaka === mission.plaka)
        let pList: string[] = []
        if (matchedVeh) {
          if (matchedVeh.sorumlu_sofor_id) {
             const sofor = personnelList.find(p => p.id === matchedVeh.sorumlu_sofor_id)
             if (sofor) pList.push(`${sofor.unvan} ${sofor.ad} ${sofor.soyad}`)
          }
          if (matchedVeh.sorumlu_er_id) {
             const er = personnelList.find(p => p.id === matchedVeh.sorumlu_er_id)
             if (er) pList.push(`${er.unvan} ${er.ad} ${er.soyad}`)
          }
        }
        list.push({
          plaka: mission.plaka || "Araçsız",
          arac_tipi: matchedVeh?.arac_tipi || "Dış Görev",
          olay_turu: `Dış Görev: ${mission.gorev_turu} - ${mission.baslik}`,
          mahalle: mission.mahalle || "",
          adres: mission.adres || "Adres belirtilmemiş",
          cikis_saati: mission.cikis_tarihi || mission.created_at || new Date().toISOString(),
          coords,
          personnel: pList
        })
      })
    }

    return list
  }, [activeIncidentsList, activeExternalMissions, vehicles, personnelList])

  const vehicleStats = useMemo(() => {
    const defaultStats = {
      total: 0,
      active: 0,
      maintenance: 0,
      available: 0,
      stations: {} as Record<string, { total: number, available: number }>
    }

    if (!vehicles || vehicles.length === 0) return defaultStats;

    let active = 0;
    let maintenance = 0;
    let available = 0;

    vehicles.forEach(v => {
      // Default istasyon logic if not set: Merkez
      const station = v.istasyon || v.current_branch || "Merkez";
      const normalizedStation = station.toLowerCase().includes("organize") || station.toLowerCase().includes("osb") 
        ? "3. İstasyon · OSB" 
        : station.toLowerCase().includes("esentepe") || station.toLowerCase().includes("kümbet")
        ? "2. İstasyon · Kümbet"
        : "Merkez İstasyon";

      if (!defaultStats.stations[normalizedStation]) {
        defaultStats.stations[normalizedStation] = { total: 0, available: 0 };
      }

      defaultStats.stations[normalizedStation].total++;
      
      const isArizali = v.durum === "arizali" || v.durum === "arızalı" || v.status === "maintenance" || v.status === "arızalı" || v.status === "Arızalı";
      if (isArizali) {
        maintenance++;
      } else {
        const isMission = activeMissions.some(am => am.plaka === v.plaka);
        if (isMission) {
          active++;
        } else {
          available++;
          defaultStats.stations[normalizedStation].available++;
        }
      }
    });

    return {
      total: vehicles.length,
      active,
      maintenance,
      available,
      stations: defaultStats.stations
    }
  }, [vehicles, activeMissions]);

  const sortedPersonnel = useMemo<Personnel[]>(() => {
    if (personnelList.length === 0) return []
    // Filter to active posta only, based on station-specific shift times.
    // Karargah (gündüz mesaili idari kadro) nöbetçi listesine girmez.
    return personnelList.filter(p => {
      const activePosta = getActivePostaForStation(p.istasyon, new Date(), customShiftTimes);
      return p.posta_no === activePosta && !isIdariUnvan(p.unvan) && !isKarargah(p);
    });
  }, [personnelList, customShiftTimes])

  const handlePersonnelUpdate = (sicilNo: string, finalStatus: string) => {
    setPersonnelList(prev => prev.map(p => p.sicil_no === sicilNo ? { ...p, durum: finalStatus } : p))
  }

  const criticalAlerts = useMemo(() => {
    const alerts: {
      vehicles: Array<{ plaka: string; type: 'Muayene' | 'Sigorta'; date: string; remainingDays: number }>;
      licenses: Array<{ name: string; date: string; remainingDays: number }>;
      assignments: Array<{ name: string; material: string; date: string; delayDays: number }>;
    } = { vehicles: [], licenses: [], assignments: [] }

    const now = new Date()

    // 1. Vehicle Insurance & Inspection Alerts
    vehicles.forEach((v: any) => {
      if (v.sigortaBitis) {
        const diffTime = new Date(v.sigortaBitis).getTime() - now.getTime()
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
        if (diffDays <= 30) {
          alerts.vehicles.push({
            plaka: v.plaka,
            type: 'Sigorta',
            date: v.sigortaBitis,
            remainingDays: diffDays
          })
        }
      }
      if (v.muayeneBitis) {
        const diffTime = new Date(v.muayeneBitis).getTime() - now.getTime()
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
        if (diffDays <= 30) {
          alerts.vehicles.push({
            plaka: v.plaka,
            type: 'Muayene',
            date: v.muayeneBitis,
            remainingDays: diffDays
          })
        }
      }
    })

    // 2. Expiring driver licenses (using staffCertifications)
    staffCertifications.forEach((c) => {
      if (c.tip === 'Ehliyet' && c.gecerlilik_tarihi) {
        const diffTime = new Date(c.gecerlilik_tarihi).getTime() - now.getTime()
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
        // Expand validity search window to 180 days (6 months) so upcoming licenses are warning-logged
        if (diffDays <= 180) {
          const p = personnelList.find(per => per.sicil_no === c.sicil_no)
          alerts.licenses.push({
            name: p ? `${p.ad} ${p.soyad} (${p.unvan})` : `Personel (Sicil: ${c.sicil_no})`,
            date: c.gecerlilik_tarihi,
            remainingDays: diffDays
          })
        }
      }
    })

    // 3. Overdue Assignments
    overdueAssignments.forEach((a) => {
      const diffTime = now.getTime() - new Date(a.iade_tarihi || a.created_at).getTime()
      const diffDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)))
      alerts.assignments.push({
        name: a.zimmet_alan_ad_soyad || a.personel_sicil || "Bilinmeyen Personel",
        material: a.materialName || "Malzeme",
        date: a.iade_tarihi || a.created_at,
        delayDays: diffDays
      })
    })

    // Sort by urgency
    alerts.vehicles.sort((a, b) => a.remainingDays - b.remainingDays)
    alerts.licenses.sort((a, b) => a.remainingDays - b.remainingDays)
    alerts.assignments.sort((a, b) => b.delayDays - a.delayDays)

    return alerts
  }, [vehicles, personnelList, staffCertifications, overdueAssignments])

  const totalAlertsCount = useMemo(() => {
    return criticalAlerts.vehicles.length + criticalAlerts.licenses.length + criticalAlerts.assignments.length;
  }, [criticalAlerts])

  // ─── Loading State ────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center space-y-3">
          <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground font-medium">Yönetim ve Gösterge Paneli yükleniyor…</p>
        </div>
      </div>
    )
  }

  // ─── KPI Card Component ───────────────────────────────────
  const KPICard = ({
    icon,
    label,
    value,
    subtitle,
    href,
    iconColor,
  }: {
    icon: React.ReactNode
    label: string
    value: number | string
    subtitle: string
    href: string
    iconColor: string
  }) => (
    <Link href={href}>
      <Card className="group relative overflow-hidden hover:border-[var(--fd-border-strong)] transition-all duration-200 ease-out hover:shadow-[var(--fd-shadow)] cursor-pointer">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <p className="text-xs sm:text-sm font-medium text-[var(--fd-text3)] uppercase tracking-wider">
                {label}
              </p>
              <p className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--fd-text)]">{value}</p>
              <p className="text-xs text-[var(--fd-text2)] line-clamp-1">{subtitle}</p>
            </div>
            <div
              className={`p-2.5 rounded-[var(--fd-r-sm)] bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text2)] shadow-inner group-hover:scale-105 transition-transform duration-300 ${iconColor}`}
            >
              {icon}
            </div>
          </div>
          <div className="flex items-center mt-3 pt-3 border-t border-[var(--fd-border)]">
            <span className="text-xs text-[var(--fd-text3)] font-medium group-hover:text-[var(--fd-text)] transition-colors flex items-center gap-1">
              Detay Görüntüle <ArrowRight className="w-3 h-3 text-[var(--fd-text3)] group-hover:translate-x-0.5 transition-transform" />
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )

  // ─── Custom Tooltip for Chart ─────────────────────────────
  const CustomTooltip = ({ active, payload, label }: DashboardTooltipProps) => {
    if (!active || !payload?.length) return null
    return (
      <div className="bg-[var(--fd-surface)] border border-[var(--fd-border)] shadow-[var(--fd-shadow-lg)] rounded-[var(--fd-r-sm)] px-3 py-2">
        <p className="text-xs font-semibold text-[var(--fd-text)]">{label}</p>
        <p className="text-sm font-bold text-[var(--fd-accent)]">{payload[0].value} olay</p>
      </div>
    )
  }

  const handleExportCSV = () => {
    if (activities.length === 0) {
      alert("Dışa aktarılacak vaka veya aktivite verisi bulunmuyor.");
      return;
    }
    const headers = ["Baslik", "Detay", "Zaman", "Tip", "Durum"];
    const rows = activities.map(act => [
      act.title || "",
      act.detail || "",
      act.time || "",
      act.type || "",
      act.status || (act as any).durum || "Aktif"
    ]);
    const csvContent = "\uFEFF" + [
      headers.join(","),
      ...rows.map(e => e.map(val => `"${val.replace(/"/g, '""')}"`).join(","))
    ].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `itfaiye_dashboard_raporu_${new Date().toLocaleDateString("tr-TR")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ─── Render ───────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-[calc(var(--fd-sp)*3)] pb-20 fade-in-up">
      
      {/* 1. Header Row */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--fd-text)] tracking-tight">Genel Bakış</h1>
          <p className="text-[var(--fd-text2)] text-sm mt-1">
            Operasyon merkezinin canlı durumu, vaka istatistikleri ve kaynak doluluğu.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleExportCSV}
            className="flex items-center gap-2 bg-[var(--fd-surface)] border border-[var(--fd-border-strong)] text-[var(--fd-text)] px-4 py-2 rounded-[var(--fd-r-sm)] font-semibold text-sm hover:bg-[var(--fd-surface2)] transition-colors shadow-sm cursor-pointer"
          >
            <span>↑ Dışa Aktar</span>
          </button>
          <Link 
            href="/yonetim/olaylar?action=add" 
            className="flex items-center gap-2 bg-[var(--fd-accent)] text-white px-4 py-2 rounded-[var(--fd-r-sm)] font-semibold text-sm hover:opacity-90 transition-opacity shadow-sm cursor-pointer"
          >
            <span>+ Yeni Vaka</span>
          </Link>
        </div>
      </div>

      {/* 2. Stat Cards (5 columns) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-[calc(var(--fd-sp)*2)]">
        {/* Aktif Vaka */}
        <div onClick={() => setIsMissionModalOpen(true)} className="block outline-none cursor-pointer">
          <div className="bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] p-[calc(var(--fd-sp)*2.2)] shadow-[var(--fd-shadow-sm)] flex flex-col justify-between min-h-[130px] hover:-translate-y-1 hover:border-[var(--fd-accent)]/40 transition-all h-full">
            <div className="flex justify-between items-start">
              <span className="text-[var(--fd-text2)] text-xs font-semibold">Aktif Vaka</span>
              <div className="bg-[var(--fd-danger)]/10 text-[var(--fd-danger)] p-1.5 rounded-[var(--fd-r-sm)]">
                 <Flame size={14} strokeWidth={2.5} />
              </div>
            </div>
            <div className="mt-2">
              <div className="text-3xl font-bold font-mono text-[var(--fd-text)]">{kpi.activeIncidents}</div>
              <div className="text-[10px] text-[var(--fd-danger)] font-semibold mt-1 flex items-center gap-1">
                +2 son 1 saat
              </div>
            </div>
          </div>
        </div>

        {/* Anlık Program (Eskiden Bugünkü Çağrı idi) */}
        <div onClick={() => setIsScheduleModalOpen(true)} className="block outline-none cursor-pointer">
          <div className="bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] p-[calc(var(--fd-sp)*2.2)] shadow-[var(--fd-shadow-sm)] flex flex-col justify-between min-h-[130px] hover:-translate-y-1 hover:border-[var(--fd-accent)]/40 transition-all h-full relative overflow-hidden">
            {/* Soft highlight behind the timer for visual pop */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--fd-accent)] opacity-[0.03] rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />
            
            <div className="flex justify-between items-start relative z-10">
              <span className="text-[var(--fd-text2)] text-xs font-semibold">Anlık Program</span>
              <div className="bg-[var(--fd-info)]/10 text-[var(--fd-info)] p-1.5 rounded-[var(--fd-r-sm)]">
                 <Clock size={14} strokeWidth={2.5} /> 
              </div>
            </div>
            <div className="mt-2 relative z-10">
              <div className="text-3xl font-bold font-mono text-[var(--fd-text)] truncate" title={programInfo.label}>
                {programInfo.timeLeft === "--:--" ? currentTime.substring(0, 5) : programInfo.timeLeft}
              </div>
              <div className="text-[10px] text-[var(--fd-accent)] font-semibold mt-1 flex items-center gap-1 line-clamp-1">
                {programInfo.icon} {programInfo.label}
              </div>
            </div>
          </div>
        </div>

        {/* Müsait Araç */}
        <Link href="/araclar" className="block outline-none cursor-pointer">
          <div className="bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] p-[calc(var(--fd-sp)*2.2)] shadow-[var(--fd-shadow-sm)] flex flex-col justify-between min-h-[130px] hover:-translate-y-1 hover:border-[var(--fd-accent)]/40 transition-all h-full">
            <div className="flex justify-between items-start">
              <span className="text-[var(--fd-text2)] text-xs font-semibold">Müsait Araç</span>
              <div className="bg-[var(--fd-success)]/10 text-[var(--fd-success)] p-1.5 rounded-[var(--fd-r-sm)]">
                 <Truck size={14} strokeWidth={2.5} />
              </div>
            </div>
            <div className="mt-2">
              <div className="text-3xl font-bold font-mono text-[var(--fd-text)]">{vehicleStats.available} <span className="text-sm text-[var(--fd-text3)] font-sans font-medium">/ {vehicleStats.total}</span></div>
              <div className="text-[10px] text-[var(--fd-info)] font-semibold mt-1 flex items-center gap-1">
                {vehicleStats.total > 0 ? Math.round((vehicleStats.available / vehicleStats.total) * 100) : 0}% müsait ({vehicleStats.active} görevde)
              </div>
            </div>
          </div>
        </Link>

        {/* Görevdeki Personel */}
        <div onClick={() => setIsPersonnelModalOpen(true)} className="block outline-none cursor-pointer">
          <div className="bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] p-[calc(var(--fd-sp)*2.2)] shadow-[var(--fd-shadow-sm)] flex flex-col justify-between min-h-[130px] hover:-translate-y-1 hover:border-[var(--fd-accent)]/40 transition-all h-full">
            <div className="flex justify-between items-start">
              <span className="text-[var(--fd-text2)] text-xs font-semibold">Görevdeki Personel</span>
              <div className="bg-[var(--fd-info)]/10 text-[var(--fd-info)] p-1.5 rounded-[var(--fd-r-sm)]">
                 <Users size={14} strokeWidth={2.5} />
              </div>
            </div>
            <div className="mt-2">
              <div className="text-3xl font-bold font-mono text-[var(--fd-text)]">{sortedPersonnel.length || personnelList.length || 47}</div>
              <div className="text-[10px] text-[var(--fd-text3)] font-semibold mt-1 flex items-center gap-1">
                Bugün itibariyle göreve hazır personel sayısı.
              </div>
            </div>
          </div>
        </div>

        {/* Ort. Varış Süresi */}
        <Link href="/yonetim/istatistikler" className="block outline-none">
          <div className="bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] p-[calc(var(--fd-sp)*2.2)] shadow-[var(--fd-shadow-sm)] flex flex-col justify-between min-h-[130px] hover:-translate-y-1 hover:border-[var(--fd-accent)]/40 transition-all cursor-pointer h-full">
            <div className="flex justify-between items-start">
              <span className="text-[var(--fd-text2)] text-xs font-semibold">Ort. Varış Süresi</span>
              <div className="bg-purple-500/10 text-purple-500 p-1.5 rounded-[var(--fd-r-sm)]">
                 <MapIcon size={14} strokeWidth={2.5} />
              </div>
            </div>
            <div className="mt-2">
              <div className="text-3xl font-bold font-mono text-[var(--fd-text)]">
                {avgResponseTime > 0 ? avgResponseTime.toFixed(1) : "6.4"} <span className="text-sm text-[var(--fd-text3)] font-sans font-medium">dk</span>
              </div>
              <div className="text-[10px] text-[var(--fd-success)] font-semibold mt-1 flex items-center gap-1">
                {avgResponseTime > 0 ? (avgResponseTime - 8.0).toFixed(1) : "-1.6"} hedef 8 dk
              </div>
            </div>
          </div>
        </Link>
      </div>

      {/* 3. Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-[calc(var(--fd-sp)*2)]">
        {/* Aylık Vaka Trendi */}
        <div className="lg:col-span-2 bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] p-[calc(var(--fd-sp)*2.5)] shadow-[var(--fd-shadow-sm)] flex flex-col">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-[calc(var(--fd-fs)*1.02)] font-bold text-[var(--fd-text)]">Aylık Vaka Trendi</h2>
              <p className="text-[calc(var(--fd-fs)*0.85)] text-[var(--fd-text3)] mt-0.5">Son 12 ay · toplam müdahale sayısı</p>
            </div>
            <div className="bg-[var(--fd-surface3)] px-3 py-1 rounded-[var(--fd-r-sm)] text-[calc(var(--fd-fs)*0.8)] font-semibold text-[var(--fd-text2)] border border-[var(--fd-border)]">
              2025-26
            </div>
          </div>
          
          <div className="flex-1 min-h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyTrendData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="incidentGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--fd-accent)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--fd-accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--fd-border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--fd-text3)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--fd-text3)" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="count" stroke="var(--fd-accent)" strokeWidth={2.5} fill="url(#incidentGradient)" />
                </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Vaka Türü Dağılımı */}
        <div className="bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] p-[calc(var(--fd-sp)*2.5)] shadow-[var(--fd-shadow-sm)] flex flex-col justify-between">
          <h2 className="text-[calc(var(--fd-fs)*1.02)] font-bold text-[var(--fd-text)] mb-8">Vaka Türü Dağılımı</h2>
          
          <div className="flex items-center justify-center gap-6 flex-1">
             {distributionData.total === 0 ? (
               <div className="text-center text-xs text-[var(--fd-text3)] py-8 flex-1">
                 Veriler yükleniyor...
               </div>
             ) : (
               <>
                  <div className="relative w-28 h-28 lg:w-32 lg:h-32 shrink-0 rounded-full flex items-center justify-center shadow-sm" style={conicGradientStyle}>
                    <div className="w-[74px] h-[74px] lg:w-[84px] lg:h-[84px] bg-[var(--fd-surface)] rounded-full flex flex-col items-center justify-center z-10 shadow-sm select-none">
                       <span className="text-lg lg:text-[calc(var(--fd-fs)*1.5)] font-bold font-mono text-[var(--fd-text)] leading-none">{distributionData.total}</span>
                       <span className="text-[9px] font-bold text-[var(--fd-text3)] uppercase mt-1 tracking-widest">Toplam</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2.5 text-[11px] lg:text-xs text-[var(--fd-text2)] flex-1 overflow-y-auto max-h-[140px] pr-1 scrollbar-thin">
                     {distributionData.list.map((item, idx) => (
                       <div key={idx} className="flex justify-between items-center">
                         <div className="flex items-center gap-2 truncate">
                           <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: item.color }} />
                           <span className="truncate">{item.type}</span>
                         </div>
                         <span className="font-mono font-semibold text-[var(--fd-text)] ml-1.5">{item.percentage}%</span>
                       </div>
                     ))}
                  </div>
               </>
             )}
          </div>
        </div>
      </div>

      {/* 4. Lists & Status Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-[calc(var(--fd-sp)*2)]">
        
        {/* Son Vakalar */}
        <div className="lg:col-span-2 bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] p-[calc(var(--fd-sp)*2.5)] shadow-[var(--fd-shadow-sm)] flex flex-col">
          <div className="flex justify-between items-center mb-4 pb-3 border-b border-[var(--fd-border)]">
             <h2 className="text-[calc(var(--fd-fs)*1.02)] font-bold text-[var(--fd-text)]">Son Vakalar</h2>
             <Link href="/yonetim/olaylar" className="text-[calc(var(--fd-fs)*0.85)] font-semibold text-[var(--fd-danger)] hover:underline">Tümünü Gör →</Link>
          </div>
          
          <div className="flex flex-col">
             {activities.length > 0 ? activities.slice(0, 4).map((activity, i) => {
               const isIncident = activity.type === 'incident';
               
               // Determine status label based on actual status
               let statusLabel = 'Tamamlandı';
               let statusColor = 'text-[var(--fd-success)] bg-[var(--fd-success)]/10';
               let dotColor = 'bg-[var(--fd-success)]';

               if (isIncident) {
                 const isClosed = activity.status === 'closed' || activity.status === 'Tamamlandı';
                 if (isClosed) {
                   statusLabel = 'Tamamlandı';
                   statusColor = 'text-[var(--fd-success)] bg-[var(--fd-success)]/10';
                   dotColor = 'bg-[var(--fd-success)]';
                 } else {
                   // Active incident
                   statusLabel = i === 0 ? 'Müdahale Ediliyor' : 'Aktif';
                   statusColor = i === 0 ? 'text-[var(--fd-amber)] bg-[var(--fd-amber)]/10' : 'text-[var(--fd-danger)] bg-[var(--fd-danger)]/10';
                   dotColor = i === 0 ? 'bg-[var(--fd-amber)]' : 'bg-[var(--fd-danger)]';
                 }
               }

               let href = "/yonetim/olaylar";
               if (activity.id.startsWith("ext-")) {
                 href = "/yonetim/gorevler";
               } else if (activity.id.startsWith("mnt-")) {
                 href = "/yonetim/arac-bakim";
               } else if (activity.id.startsWith("hyd-")) {
                 href = "/yonetim/harita";
               } else if (activity.id.startsWith("trn-")) {
                 href = "/yonetim/egitimler";
               }

               return (
                 <Link key={i} href={href} className="flex justify-between items-center py-3.5 border-b border-[var(--fd-border-strong)]/30 last:border-0 hover:bg-[var(--fd-surface2)] transition-colors -mx-[calc(var(--fd-sp)*2.5)] px-[calc(var(--fd-sp)*2.5)] cursor-pointer">
                    <div className="flex items-center gap-3">
                       <span className={`w-2 h-2 rounded-full ${dotColor}`}></span>
                       <div>
                         <p className="text-[calc(var(--fd-fs)*0.95)] font-bold text-[var(--fd-text)] leading-snug">{activity.title}</p>
                         <p className="text-[calc(var(--fd-fs)*0.85)] text-[var(--fd-text3)] truncate max-w-[200px] sm:max-w-xs">{activity.detail}</p>
                       </div>
                    </div>
                    <div className="flex items-center gap-5">
                       <span className={`text-[calc(var(--fd-fs)*0.74)] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${statusColor}`}>
                         {statusLabel}
                       </span>
                       <span className="text-[calc(var(--fd-fs)*0.85)] font-mono text-[var(--fd-text3)] w-12 text-right">{activity.time.split(' ')[0]}</span>
                    </div>
                 </Link>
                )
             }) : (
               <div className="text-xs text-center py-8 text-[var(--fd-text3)] bg-[var(--fd-surface2)]/50 rounded-lg border border-[var(--fd-border)] border-dashed">
                 Henüz vaka veya aktivite kaydı bulunmuyor.
               </div>
             )}
          </div>
        </div>

        {/* Araç Durumu & İstasyon Doluluk */}
        <div className="flex flex-col gap-[calc(var(--fd-sp)*2)]">
          {/* Araç Durumu */}
          <div className="bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] p-[calc(var(--fd-sp)*2.5)] shadow-[var(--fd-shadow-sm)]">
            <h2 className="text-[calc(var(--fd-fs)*1.02)] font-bold text-[var(--fd-text)] mb-5">Araç Durumu</h2>
            
            {/* Progress Bar Stack */}
            <div className="w-full h-3.5 rounded-full flex overflow-hidden mb-5 bg-[var(--fd-surface3)]">
               <div className="h-full bg-[var(--fd-success)]" style={{ width: `${vehicleStats.total > 0 ? (vehicleStats.available / vehicleStats.total) * 100 : 0}%` }}></div>
               <div className="h-full bg-[var(--fd-amber)]" style={{ width: `${vehicleStats.total > 0 ? (vehicleStats.active / vehicleStats.total) * 100 : 0}%` }}></div>
               <div className="h-full bg-[var(--fd-info)]" style={{ width: `${vehicleStats.total > 0 ? (vehicleStats.maintenance / vehicleStats.total) * 100 : 0}%` }}></div>
            </div>
            
            <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-[calc(var(--fd-fs)*0.85)]">
              <div className="flex justify-between items-center"><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-sm bg-[var(--fd-success)]"></span><span className="text-[var(--fd-text2)]">Müsait</span></div><span className="font-mono font-bold text-[var(--fd-text)]">{vehicleStats.available}</span></div>
              <div className="flex justify-between items-center"><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-sm bg-[var(--fd-amber)]"></span><span className="text-[var(--fd-text2)]">Görevde</span></div><span className="font-mono font-bold text-[var(--fd-text)]">{vehicleStats.active}</span></div>
              <div className="flex justify-between items-center"><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-sm bg-[var(--fd-info)]"></span><span className="text-[var(--fd-text2)]">Bakımda/Arızalı</span></div><span className="font-mono font-bold text-[var(--fd-text)]">{vehicleStats.maintenance}</span></div>
            </div>
          </div>

          {/* Kritik Uyarılar */}
          <div onClick={() => setIsAlertsModalOpen(true)} className="bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] p-[calc(var(--fd-sp)*2.5)] shadow-[var(--fd-shadow-sm)] flex-1 cursor-pointer hover:border-[var(--fd-danger)]/30 transition-all flex flex-col justify-between min-h-[180px]">
            <div>
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-[calc(var(--fd-fs)*1.02)] font-bold text-[var(--fd-text)] flex items-center gap-2">
                  <AlertTriangle className="text-[var(--fd-danger)] animate-pulse w-5 h-5" />
                  Kritik Uyarılar
                </h2>
                {totalAlertsCount > 0 ? (
                  <span className="bg-[var(--fd-danger)] text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-bounce">
                    {totalAlertsCount} Alarm
                  </span>
                ) : (
                  <span className="bg-[var(--fd-success)]/10 text-[var(--fd-success)] text-[10px] font-bold px-2 py-0.5 rounded-full">
                    Sistem Temiz
                  </span>
                )}
              </div>
              
              <div className="space-y-3">
                {totalAlertsCount === 0 ? (
                  <div className="py-6 text-center text-xs text-[var(--fd-text3)]">
                    🟢 Yaklaşan muayene, ehliyet süresi dolan şoför veya gecikmiş zimmet kaydı bulunmuyor.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {criticalAlerts.vehicles.length > 0 && (
                      <div className="flex items-center justify-between text-xs p-2 rounded bg-[var(--fd-surface2)]/50 border border-[var(--fd-border)]/50">
                        <span className="text-[var(--fd-text2)]">Araç Muayene/Sigorta Alarmları</span>
                        <span className="font-mono font-bold text-[var(--fd-danger)]">+{criticalAlerts.vehicles.length}</span>
                      </div>
                    )}
                    {criticalAlerts.licenses.length > 0 && (
                      <div className="flex items-center justify-between text-xs p-2 rounded bg-[var(--fd-surface2)]/50 border border-[var(--fd-border)]/50">
                        <span className="text-[var(--fd-text2)]">Ehliyet Geçerlilik Alarmları</span>
                        <span className="font-mono font-bold text-[var(--fd-amber)]">+{criticalAlerts.licenses.length}</span>
                      </div>
                    )}
                    {criticalAlerts.assignments.length > 0 && (
                      <div className="flex items-center justify-between text-xs p-2 rounded bg-[var(--fd-surface2)]/50 border border-[var(--fd-border)]/50">
                        <span className="text-[var(--fd-text2)]">Gecikmiş Geçici Zimmetler</span>
                        <span className="font-mono font-bold text-orange-400">+{criticalAlerts.assignments.length}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            {totalAlertsCount > 0 && (
              <div className="mt-5 pt-3 border-t border-[var(--fd-border)]/50 flex justify-between items-center text-[10px] text-[var(--fd-text3)] font-semibold uppercase">
                <span>Detayları görmek için tıklayın</span>
                <span className="text-[var(--fd-accent)]">İncele →</span>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Active Missions Modal */}
      {isMissionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-4xl bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] shadow-[var(--fd-shadow-lg)] overflow-hidden animate-in zoom-in-95 duration-200 my-auto">
            <div className="bg-[var(--fd-surface2)]/40 border-b border-[var(--fd-border)] p-5 flex flex-row items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-[var(--fd-text)] flex items-center gap-2">
                  <Flame size={20} className="text-[var(--fd-danger)] animate-pulse" />
                  Aktif Vakalar & Görevdeki Araçlar ({activeMissions.length})
                </h2>
                <p className="text-sm text-[var(--fd-text3)] mt-1">Aktif vakalarda veya dış görevlerde bulunan araçların ve personelin anlık durum bilgileri.</p>
              </div>
              <button onClick={() => setIsMissionModalOpen(false)} className="text-[var(--fd-text3)] hover:text-[var(--fd-text)] transition-colors p-1 bg-transparent border-none cursor-pointer">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 max-h-[70vh] overflow-y-auto space-y-4">
              {activeMissions.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-[var(--fd-text3)]">
                  <Truck size={48} className="mb-4 opacity-20" />
                  <p>Şu anda görevde olan araç bulunmuyor.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {activeMissions.map((mission, idx) => (
                    <div key={idx} className="bg-[var(--fd-surface2)]/30 border border-[var(--fd-border)] rounded-[var(--fd-r)] p-4 flex flex-col gap-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono font-bold text-lg text-[var(--fd-accent)]">{mission.plaka}</span>
                            <span className="text-xs bg-[var(--fd-surface3)] px-2 py-0.5 rounded text-[var(--fd-text2)]">{mission.arac_tipi}</span>
                          </div>
                          <p className="text-[var(--fd-text)] font-semibold text-sm">{mission.olay_turu}</p>
                        </div>
                        <span className="text-xs font-mono bg-[var(--fd-amber)]/10 text-[var(--fd-amber)] px-2 py-1 rounded flex items-center gap-1 border border-[var(--fd-amber)]/20 shadow-sm">
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--fd-amber)] animate-pulse"></span>
                          Görevde
                        </span>
                      </div>
                      
                      <div className="text-sm text-[var(--fd-text2)] space-y-1.5 border-t border-[var(--fd-border)]/50 pt-3">
                        <div className="flex items-start gap-2">
                          <MapPin size={14} className="text-[var(--fd-text3)] mt-0.5 shrink-0" />
                          <span className="leading-tight">{mission.mahalle}{mission.mahalle && mission.adres ? " - " : ""}{mission.adres}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock size={14} className="text-[var(--fd-text3)]" />
                          <span>Çıkış: <span className="font-mono text-[var(--fd-text)]">{mission.cikis_saati ? new Date(mission.cikis_saati).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : "Bilinmiyor"}</span></span>
                        </div>
                        
                        <div className="pt-2 mt-2 border-t border-[var(--fd-border)]/50">
                          <p className="text-xs text-[var(--fd-text3)] mb-1.5 font-semibold">Görevli Personel:</p>
                          {mission.personnel && mission.personnel.length > 0 ? (
                            <ul className="space-y-1">
                              {mission.personnel.map((p, i) => (
                                <li key={i} className="flex items-center gap-1.5 text-sm text-[var(--fd-text)]">
                                  <Users size={12} className="text-[var(--fd-accent)]" /> {p}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-sm text-[var(--fd-text3)] italic">Personel ataması bulunamadı.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-[var(--fd-surface2)]/40 border-t border-[var(--fd-border)] p-4 flex items-center justify-between">
              <span className="text-xs text-[var(--fd-text3)] flex items-center gap-1">
                <Info size={12} /> Bilgiler anlık olarak güncellenmektedir
              </span>
              <div className="flex gap-2">
                <button onClick={() => setIsMissionModalOpen(false)} className="px-4 py-2 rounded-[var(--fd-r)] bg-[var(--fd-surface3)] hover:bg-[var(--fd-surface3)]/80 text-[var(--fd-text)] text-sm font-medium transition-colors border border-transparent cursor-pointer">
                  Kapat
                </button>
                <Link href="/yonetim/harita" className="px-4 py-2 rounded-[var(--fd-r)] bg-[var(--fd-accent)] hover:opacity-90 text-white text-sm font-medium transition-opacity flex items-center gap-2 no-underline">
                  <MapPin size={16} /> Haritada Gör
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Personnel Duty Modal */}
      {isPersonnelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-5xl bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] shadow-[var(--fd-shadow-lg)] overflow-hidden animate-in zoom-in-95 duration-200 my-auto flex flex-col max-h-[90vh]">
            <div className="bg-[var(--fd-surface2)]/40 border-b border-[var(--fd-border)] p-5 flex flex-row items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-[var(--fd-text)] flex items-center gap-2">
                  <Users size={20} className="text-[var(--fd-info)]" />
                  Nöbetçi Vardiya Personel Listesi
                </h2>
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <ShiftCountdown customTimes={customShiftTimes} />
                  {user?.rol === 'Admin' && (
                    <button
                      onClick={() => setIsShiftEditModalOpen(true)}
                      className="mt-2 sm:mt-0 flex items-center gap-1 bg-[var(--fd-accent)] hover:opacity-90 text-white text-xs font-semibold px-2.5 py-1.5 rounded-[var(--fd-r-sm)] border-none cursor-pointer transition-opacity flex-shrink-0"
                    >
                      <Settings size={12} /> Saatleri Düzenle
                    </button>
                  )}
                </div>
              </div>
              <button onClick={() => setIsPersonnelModalOpen(false)} className="text-[var(--fd-text3)] hover:text-[var(--fd-text)] transition-colors p-1 bg-transparent border-none cursor-pointer">
                <X size={20} />
              </button>
            </div>
            
            {/* Tabs Selector */}
            <div className="border-b border-[var(--fd-border)] bg-[var(--fd-surface2)]/20 px-6 py-2 flex gap-4">
              <button 
                onClick={() => setActiveShiftTab('daily')} 
                className={`pb-2 pt-1 border-b-2 font-semibold text-sm transition-colors cursor-pointer bg-transparent border-none ${activeShiftTab === 'daily' ? 'border-[var(--fd-accent)] text-[var(--fd-accent)]' : 'border-transparent text-[var(--fd-text3)] hover:text-[var(--fd-text)]'}`}
              >
                Günlük Nöbet Listesi
              </button>
              <button 
                onClick={() => setActiveShiftTab('hourly')} 
                className={`pb-2 pt-1 border-b-2 font-semibold text-sm transition-colors cursor-pointer bg-transparent border-none ${activeShiftTab === 'hourly' ? 'border-[var(--fd-accent)] text-[var(--fd-accent)]' : 'border-transparent text-[var(--fd-text3)] hover:text-[var(--fd-text)]'}`}
              >
                Saatlik Karargah Nöbet Çizelgesi
              </button>
              <button 
                onClick={() => setActiveShiftTab('schedule')} 
                className={`pb-2 pt-1 border-b-2 font-semibold text-sm transition-colors cursor-pointer bg-transparent border-none ${activeShiftTab === 'schedule' ? 'border-[var(--fd-accent)] text-[var(--fd-accent)]' : 'border-transparent text-[var(--fd-text3)] hover:text-[var(--fd-text)]'}`}
              >
                Mesai Çizelgesi
              </button>
              <button 
                onClick={() => setActiveShiftTab('calendar')} 
                className={`pb-2 pt-1 border-b-2 font-semibold text-sm transition-colors cursor-pointer bg-transparent border-none ${activeShiftTab === 'calendar' ? 'border-[var(--fd-accent)] text-[var(--fd-accent)]' : 'border-transparent text-[var(--fd-text3)] hover:text-[var(--fd-text)]'}`}
              >
                Takvim
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {activeShiftTab === 'daily' ? (
                <ShiftList personnel={sortedPersonnel} activePosta={0} onPersonnelUpdate={handlePersonnelUpdate} customTimes={customShiftTimes} />
              ) : activeShiftTab === 'hourly' ? (
                <HourlyShifts personnel={sortedPersonnel} allPersonnel={personnelList} activePosta={0} sabitNizamiyeSicil={sabitNizamiyeSicil} />
              ) : activeShiftTab === 'schedule' ? (
                <DailyWorkSchedule personnel={sortedPersonnel} allPersonnel={personnelList} sabitNizamiyeSicil={sabitNizamiyeSicil} />
              ) : (
                <FutureShiftCalendar personnelList={personnelList} onLeaveUpdated={fetchDashboardData} />
              )}
            </div>

            <div className="bg-[var(--fd-surface2)]/40 border-t border-[var(--fd-border)] p-4 flex items-center justify-between shrink-0">
              <span className="text-xs text-[var(--fd-text3)] flex items-center gap-1">
                <Info size={12} /> Personel durum güncellemeleri otomatik olarak kaydedilir.
              </span>
              <div className="flex gap-2">
                <button onClick={() => setIsPersonnelModalOpen(false)} className="px-4 py-2 rounded-[var(--fd-r)] bg-[var(--fd-surface3)] hover:bg-[var(--fd-surface3)]/80 text-[var(--fd-text)] text-sm font-medium transition-colors border border-transparent cursor-pointer">
                  Kapat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Shift Swap Hours Edit Modal */}
      {isShiftEditModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] shadow-[var(--fd-shadow-lg)] overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-[var(--fd-surface2)]/40 border-b border-[var(--fd-border)] p-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-[var(--fd-text)] flex items-center gap-2">
                <Settings size={18} className="text-[var(--fd-accent)]" />
                Posta Değişim Saatlerini Düzenle
              </h3>
              <button 
                onClick={() => setIsShiftEditModalOpen(false)} 
                className="text-[var(--fd-text3)] hover:text-[var(--fd-text)] p-1 bg-transparent border-none cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--fd-text2)] uppercase tracking-wider">🚒 Merkez İtfaiye Müdürlüğü</label>
                <input 
                  type="time" 
                  value={editMerkezTime} 
                  onChange={(e) => setEditMerkezTime(e.target.value)}
                  className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] px-3 py-2 rounded-[var(--fd-r-sm)] font-mono text-sm focus:border-[var(--fd-accent)] focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--fd-text2)] uppercase tracking-wider">🚒 Esentepe Şubesi</label>
                <input 
                  type="time" 
                  value={editEsentepeTime} 
                  onChange={(e) => setEditEsentepeTime(e.target.value)}
                  className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] px-3 py-2 rounded-[var(--fd-r-sm)] font-mono text-sm focus:border-[var(--fd-accent)] focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--fd-text2)] uppercase tracking-wider">🚒 Organize Sanayi Şubesi (OSB)</label>
                <input
                  type="time"
                  value={editOrganizeTime}
                  onChange={(e) => setEditOrganizeTime(e.target.value)}
                  className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] px-3 py-2 rounded-[var(--fd-r-sm)] font-mono text-sm focus:border-[var(--fd-accent)] focus:outline-none"
                />
              </div>

              <div className="border-t border-[var(--fd-border)] pt-4 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--fd-text2)] uppercase tracking-wider">👮 Sabit Nizamiye Görevlisi</label>
                  <select
                    value={editSabitNizamiye}
                    onChange={(e) => setEditSabitNizamiye(e.target.value)}
                    className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] px-3 py-2 rounded-[var(--fd-r-sm)] text-sm focus:border-[var(--fd-accent)] focus:outline-none cursor-pointer"
                  >
                    <option value="">— Seçilmedi —</option>
                    {[...personnelList]
                      .sort((a, b) => `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, 'tr'))
                      .map(p => (
                        <option key={p.sicil_no} value={p.sicil_no}>{p.ad} {p.soyad} ({p.unvan})</option>
                      ))}
                  </select>
                  <p className="text-[10px] text-[var(--fd-text3)]">Hafta içi 08:00-17:00 nizamiye çizelgesine otomatik yazılır.</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--fd-text2)] uppercase tracking-wider">📱 Sayım Uyarısı Sabit Alıcısı</label>
                  <select
                    value={editSayimUyari}
                    onChange={(e) => setEditSayimUyari(e.target.value)}
                    className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] px-3 py-2 rounded-[var(--fd-r-sm)] text-sm focus:border-[var(--fd-accent)] focus:outline-none cursor-pointer"
                  >
                    <option value="">— Seçilmedi —</option>
                    {[...personnelList]
                      .sort((a, b) => `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, 'tr'))
                      .map(p => (
                        <option key={p.sicil_no} value={p.sicil_no}>{p.ad} {p.soyad} ({p.unvan})</option>
                      ))}
                  </select>
                  <p className="text-[10px] text-[var(--fd-text3)]">Araç sayımı yapılmadığında gönderilen SMS'i posta çavuşlarına ek olarak alır.</p>
                </div>
              </div>
            </div>

            <div className="bg-[var(--fd-surface2)]/40 border-t border-[var(--fd-border)] p-4 flex justify-end gap-2">
              <button 
                onClick={() => setIsShiftEditModalOpen(false)}
                className="px-4 py-2 rounded-[var(--fd-r-sm)] bg-[var(--fd-surface3)] hover:bg-[var(--fd-surface3)]/80 text-[var(--fd-text)] text-sm font-medium transition-colors border border-transparent cursor-pointer"
                disabled={isSavingShiftTimes}
              >
                İptal
              </button>
              <button 
                onClick={handleSaveShiftTimes}
                className="px-4 py-2 rounded-[var(--fd-r-sm)] bg-[var(--fd-accent)] hover:opacity-90 text-white text-sm font-medium transition-opacity border-none cursor-pointer flex items-center gap-1.5"
                disabled={isSavingShiftTimes}
              >
                {isSavingShiftTimes ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Kaydediliyor...
                  </>
                ) : (
                  'Kaydet'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Critical Alerts Modal */}
      {isAlertsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-4xl bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] shadow-[var(--fd-shadow-lg)] overflow-hidden animate-in zoom-in-95 duration-200 my-auto flex flex-col max-h-[90vh]">
            <div className="bg-[var(--fd-surface2)]/40 border-b border-[var(--fd-border)] p-5 flex flex-row items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-[var(--fd-text)] flex items-center gap-2">
                  <AlertTriangle size={20} className="text-[var(--fd-danger)]" />
                  Sistem Kritik Uyarı Raporu
                </h2>
                <p className="text-sm text-[var(--fd-text3)] mt-1">Süresi yaklaşan/geçen resmi evraklar ve geçici zimmet takip alarmları.</p>
              </div>
              <button onClick={() => setIsAlertsModalOpen(false)} className="text-[var(--fd-text3)] hover:text-[var(--fd-text)] transition-colors p-1 bg-transparent border-none cursor-pointer">
                <X size={20} />
              </button>
            </div>
            
            {/* Tabs Selector */}
            <div className="border-b border-[var(--fd-border)] bg-[var(--fd-surface2)]/20 px-6 py-2 flex gap-4">
              <button 
                onClick={() => setActiveAlertsTab('vehicles')} 
                className={`pb-2 pt-1 border-b-2 font-semibold text-sm transition-colors cursor-pointer bg-transparent border-none ${activeAlertsTab === 'vehicles' ? 'border-[var(--fd-danger)] text-[var(--fd-danger)]' : 'border-transparent text-[var(--fd-text3)] hover:text-[var(--fd-text)]'}`}
              >
                Araç Muayene/Sigorta ({criticalAlerts.vehicles.length})
              </button>
              <button 
                onClick={() => setActiveAlertsTab('licenses')} 
                className={`pb-2 pt-1 border-b-2 font-semibold text-sm transition-colors cursor-pointer bg-transparent border-none ${activeAlertsTab === 'licenses' ? 'border-[var(--fd-amber)] text-[var(--fd-amber)]' : 'border-transparent text-[var(--fd-text3)] hover:text-[var(--fd-text)]'}`}
              >
                Şoför Ehliyet Süreleri ({criticalAlerts.licenses.length})
              </button>
              <button 
                onClick={() => setActiveAlertsTab('assignments')} 
                className={`pb-2 pt-1 border-b-2 font-semibold text-sm transition-colors cursor-pointer bg-transparent border-none ${activeAlertsTab === 'assignments' ? 'border-orange-400 text-orange-400' : 'border-transparent text-[var(--fd-text3)] hover:text-[var(--fd-text)]'}`}
              >
                Gecikmiş Zimmet Alarmları ({criticalAlerts.assignments.length})
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {activeAlertsTab === 'vehicles' && (
                <div className="space-y-4">
                  {criticalAlerts.vehicles.length === 0 ? (
                    <div className="py-8 text-center text-[var(--fd-text3)] text-sm">
                      Muayenesi veya sigorta süresi yaklaşan araç bulunmuyor.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {criticalAlerts.vehicles.map((v, i) => (
                        <div key={i} className="p-4 rounded-xl border border-[var(--fd-border)] bg-[var(--fd-surface2)]/20 flex justify-between items-center">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-mono font-bold text-base text-[var(--fd-text)]">{v.plaka}</span>
                              <span className="text-[10px] bg-[var(--fd-surface3)] text-[var(--fd-text2)] px-2 py-0.5 rounded">{v.type}</span>
                            </div>
                            <p className="text-xs text-[var(--fd-text3)]">Geçerlilik Bitiş: {new Date(v.date).toLocaleDateString("tr-TR")}</p>
                          </div>
                          <span className={`text-xs font-mono font-bold px-2.5 py-1 rounded ${
                            v.remainingDays <= 0 
                              ? 'bg-[var(--fd-danger)]/15 text-[var(--fd-danger)] border border-[var(--fd-danger)]/30' 
                              : 'bg-[var(--fd-amber)]/15 text-[var(--fd-amber)] border border-[var(--fd-amber)]/30'
                          }`}>
                            {v.remainingDays <= 0 ? "SÜRESİ GEÇTİ" : `${v.remainingDays} gün kaldı`}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="pt-2 border-t border-[var(--fd-border)]/50 mt-4">
                    <Link href="/yonetim/arac-bakim" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--fd-accent)]/10 text-[var(--fd-accent)] hover:bg-[var(--fd-accent)]/20 transition-colors text-xs font-bold">
                      🚗 Araç Muayene ve Bakım Ekranına Git →
                    </Link>
                  </div>
                </div>
              )}

              {activeAlertsTab === 'licenses' && (
                <div className="space-y-4">
                  {criticalAlerts.licenses.length === 0 ? (
                    <div className="py-8 text-center text-[var(--fd-text3)] text-sm">
                      Ehliyet geçerlilik süresi yaklaşan personel bulunmuyor.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {criticalAlerts.licenses.map((l, i) => (
                        <div key={i} className="p-4 rounded-xl border border-[var(--fd-border)] bg-[var(--fd-surface2)]/20 flex justify-between items-center">
                          <div>
                            <h4 className="font-bold text-[var(--fd-text)] text-sm mb-1">{l.name}</h4>
                            <p className="text-xs text-[var(--fd-text3)]">Ehliyet Bitiş: {new Date(l.date).toLocaleDateString("tr-TR")}</p>
                          </div>
                          <span className={`text-xs font-mono font-bold px-2.5 py-1 rounded ${
                            l.remainingDays <= 0 
                              ? 'bg-[var(--fd-danger)]/15 text-[var(--fd-danger)] border border-[var(--fd-danger)]/30' 
                              : 'bg-[var(--fd-amber)]/15 text-[var(--fd-amber)] border border-[var(--fd-amber)]/30'
                          }`}>
                            {l.remainingDays <= 0 ? "SÜRESİ GEÇTİ" : `${l.remainingDays} gün kaldı`}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="pt-2 border-t border-[var(--fd-border)]/50 mt-4">
                    <Link href="/yonetim/personel" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--fd-accent)]/10 text-[var(--fd-accent)] hover:bg-[var(--fd-accent)]/20 transition-colors text-xs font-bold">
                      👤 Personel Yönetimi Modülüne Git →
                    </Link>
                  </div>
                </div>
              )}

              {activeAlertsTab === 'assignments' && (
                <div className="space-y-4">
                  {criticalAlerts.assignments.length === 0 ? (
                    <div className="py-8 text-center text-[var(--fd-text3)] text-sm">
                      Gecikmiş geçici zimmet kaydı bulunmuyor.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {criticalAlerts.assignments.map((a, i) => (
                        <div key={i} className="p-4 rounded-xl border border-[var(--fd-border)] bg-[var(--fd-surface2)]/20 flex justify-between items-start">
                          <div className="space-y-1">
                            <h4 className="font-bold text-[var(--fd-text)] text-sm">{a.name}</h4>
                            <p className="text-xs text-[var(--fd-text2)]">Zimmetli Cihaz: <span className="font-semibold">{a.material}</span></p>
                            <p className="text-xs text-[var(--fd-text3)]">Planlanan İade: {new Date(a.date).toLocaleDateString("tr-TR")}</p>
                          </div>
                          <span className="text-xs font-mono font-bold px-2.5 py-1 rounded bg-orange-500/15 text-orange-500 border border-orange-500/30 whitespace-nowrap">
                            {a.delayDays} GÜN GECİKTİ
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="pt-2 border-t border-[var(--fd-border)]/50 mt-4">
                    <Link href="/yonetim/envanter" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--fd-accent)]/10 text-[var(--fd-accent)] hover:bg-[var(--fd-accent)]/20 transition-colors text-xs font-bold">
                      📦 Envanter ve Zimmet Modülüne Git →
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-[var(--fd-surface2)]/40 border-t border-[var(--fd-border)] p-4 flex items-center justify-between shrink-0">
              <span className="text-xs text-[var(--fd-text3)] flex items-center gap-1">
                <Info size={12} /> Bilgiler veri tabanından anlık olarak hesaplanır.
              </span>
              <div className="flex gap-2">
                <button onClick={() => setIsAlertsModalOpen(false)} className="px-4 py-2 rounded-[var(--fd-r)] bg-[var(--fd-surface3)] hover:bg-[var(--fd-surface3)]/80 text-[var(--fd-text)] text-sm font-medium transition-colors border border-transparent cursor-pointer">
                  Kapat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Daily Schedule Modal */}
      {isScheduleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] shadow-[var(--fd-shadow-lg)] overflow-hidden animate-in zoom-in-95 duration-200 my-auto flex flex-col max-h-[90vh]">
            <div className="bg-[var(--fd-surface2)]/40 border-b border-[var(--fd-border)] p-5 flex flex-row items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-[var(--fd-text)] flex items-center gap-2">
                  📅 Günlük Teşkilat Çalışma Programı
                </h2>
                <p className="text-xs text-[var(--fd-text3)] mt-1">24 saatlik nöbet süresince uygulanacak resmi saatlik faaliyet planı.</p>
              </div>
              <button onClick={() => setIsScheduleModalOpen(false)} className="text-[var(--fd-text3)] hover:text-[var(--fd-text)] transition-colors p-1 bg-transparent border-none cursor-pointer">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              <div className="rounded-xl border border-[var(--fd-border)] bg-[var(--fd-surface2)]/10 overflow-hidden">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="bg-[var(--fd-surface2)]/50 border-b border-[var(--fd-border)] text-xs text-[var(--fd-text3)] font-bold uppercase tracking-wider">
                      <th className="p-3 pl-4">Saat</th>
                      <th className="p-3">Faaliyet</th>
                      <th className="p-3">Tür</th>
                      <th className="p-3 text-right pr-4">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--fd-border)]">
                    {DAILY_SCHEDULE_SLOTS.map((slot, index) => {
                      const isActive = programInfo.label === slot.label
                      return (
                        <tr 
                          key={index} 
                          className={`transition-colors ${
                            isActive 
                              ? 'bg-[var(--fd-accent)]/10 font-semibold border-l-4 border-l-[var(--fd-accent)]' 
                              : 'hover:bg-[var(--fd-surface2)]/30'
                          }`}
                        >
                          <td className="p-3 pl-4 font-mono text-xs text-[var(--fd-text2)]">{slot.start} - {slot.end}</td>
                          <td className="p-3 text-[var(--fd-text)] flex items-center gap-2">
                            <span>{slot.icon}</span>
                            <span>{slot.label}</span>
                          </td>
                          <td className="p-3">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              slot.type === 'Mola' 
                                ? 'bg-orange-500/10 text-orange-500' 
                                : slot.type === 'Nazari'
                                ? 'bg-blue-500/10 text-blue-500'
                                : 'bg-[var(--fd-success)]/10 text-[var(--fd-success)]'
                            }`}>
                              {slot.type}
                            </span>
                          </td>
                          <td className="p-3 text-right pr-4">
                            {isActive ? (
                              <span className="inline-flex items-center gap-1 text-xs text-[var(--fd-accent)] font-extrabold animate-pulse">
                                <span className="w-2.5 h-2.5 rounded-full bg-[var(--fd-accent)]" /> ŞİMDİ
                              </span>
                            ) : (
                              <span className="text-xs text-[var(--fd-text3)] font-medium">Beklemede</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-[var(--fd-surface2)]/40 border-t border-[var(--fd-border)] p-4 flex items-center justify-between shrink-0">
              <span className="text-xs text-[var(--fd-text3)] flex items-center gap-1 select-none">
                <Info size={12} strokeWidth={2.5} /> Program saatleri otomatik güncellenir.
              </span>
              <div className="flex gap-2">
                <button onClick={() => setIsScheduleModalOpen(false)} className="px-4 py-2 rounded-[var(--fd-r)] bg-[var(--fd-surface3)] hover:bg-[var(--fd-surface3)]/80 text-[var(--fd-text)] text-sm font-medium transition-colors border border-transparent cursor-pointer">
                  Kapat
                </button>
                <Link 
                  href="/yonetim/gorevler" 
                  onClick={() => setIsScheduleModalOpen(false)}
                  className="px-4 py-2 rounded-[var(--fd-r)] bg-[var(--fd-accent)] hover:opacity-90 text-white text-sm font-medium transition-opacity flex items-center gap-2 no-underline"
                >
                  Tüm Program & Görevleri Yönet →
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
      
    </div>
  )
}
