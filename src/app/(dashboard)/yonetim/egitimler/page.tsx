"use client"

import { useState, useEffect, useMemo } from "react"
import jsPDF from "jspdf"
import { api, unwrap } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { DataTable } from "@/components/ui/DataTable"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { useAuthStore } from "@/lib/authStore"
import PageGuard from "@/components/PageGuard"
import { toast } from "@/lib/toast"
import { 
  Loader2, 
  FileText, 
  CheckCircle, 
  Clock, 
  User, 
  Phone, 
  Brush,
  ShieldCheck,
  Calendar,
  X,
  FilePlus,
  AlertTriangle,
  Trash2,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Users,
  Ban,
  BarChart3,
  Info,
  Printer,
  Award,
  BookOpen,
  Edit3,
} from "lucide-react"
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, AreaChart, Area
} from "recharts"

// --- TypeScript Typings ---
interface CitizenRequest {
  id: string;
  talep_turu: string;
  basvuru_tarihi: string;
  basvuran_tc: string;
  basvuran_ad_soyad: string;
  irtibat_tel: string;
  adres: string;
  baca_detaylari?: Record<string, any>;
  isyeri_detaylari?: {
    faaliyet_konusu?: string;
    alan_m2?: number;
    yangin_dolabi?: string;
    acil_cikis?: string;
    kisi_sayisi?: number;
    egitim_tarihi?: string;
    egitim_turu?: string;
    yangin_nedeni?: string;
    bina_tipi?: string;
  };
  durum: string;
  created_at: string;
  updated_at?: string;
  islem_yapan_amir?: string;
  atanan_ekip?: string;
  islem_tarihi?: string;
  red_gerekcesi?: string;
  takip_kodu?: string;
}

interface BlacklistInstitution {
  id: string;
  kurum_adi: string;
  telefon: string;
  gerekce?: string;
  yasaklama_tarihi: string;
  aktif_durum: boolean;
  created_at: string;
}

interface ExternalEducation {
  id: string;
  kurum_id?: string | null;
  kurum_adi?: string;
  telefon?: string;
  kurum_tipi?: string;
  egitim_turu?: string;
  kisi_sayisi?: number;
  planlanan_tarih: string;
  saat_slot: string;
  egitimci_personel_ids: string[];
  durum: string;
  created_at?: string;
  mahalle?: string;
  yas_grubu?: string;
  teorik_sure_dk?: number;
  pratik_sure_dk?: number;
  tatbikat_sure_dk?: number;
  toplam_sure_saat?: number;
}

interface EgitimMufredati {
  id: string;
  tarih: string;
  posta: string;
  egitim_konusu: string;
  ay: number;
  yil: number;
}

// --- Helper Functions ---
function getMonday(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
}

function getYYYYMMDD(d: Date) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getDayName(d: Date) {
  return d.toLocaleDateString('tr-TR', { weekday: 'long' })
}

function formatDateLabel(d: Date) {
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })
}

function cleanTurkishChars(text: string): string {
  if (!text) return ""
  const charMap: Record<string, string> = {
    'ş': 's', 'Ş': 'S',
    'ı': 'i', 'İ': 'I',
    'ğ': 'g', 'Ğ': 'G',
    'ü': 'u', 'Ü': 'U',
    'ö': 'o', 'Ö': 'O',
    'ç': 'c', 'Ç': 'C',
  }
  return text.replace(/[şŞıİğĞüÜöÖçÇ]/g, match => charMap[match] || match)
}

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
};

const fetchGeistFontBase64 = async (): Promise<string> => {
  const fontRes = await fetch('/Geist-Regular.ttf')
  const fontBuffer = await fontRes.arrayBuffer()
  return btoa(
    new Uint8Array(fontBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
  )
}

const loadHtmlImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.src = src
    img.onload = () => resolve(img)
    img.onerror = (err) => reject(err)
  })
}


const CALENDAR_SLOTS = [
  "08:00 - 09:00",
  "09:00 - 10:00",
  "10:00 - 10:30",
  "10:30 - 11:15",
  "11:15 - 12:00",
  "12:00 - 13:30",
  "13:30 - 15:00",
  "15:00 - 15:30",
  "15:30 - 16:30",
  "16:30 - 16:45",
  "16:45 - 17:30",
  "17:30 - 18:30",
  "18:30 - 20:00",
  "20:00 - 21:00"
]

const GUNLUK_FAALIYET = [
  { saat: '08:00 – 09:00', faaliyet: 'Posta Devir Teslimi / Araç ve Malzeme Kontrolü', sure: '30 dk', uygulama: 'Tatbiki' },
  { saat: '09:00 – 10:00', faaliyet: 'Spor (Koşu, Kültür Fizik vs.)', sure: '60 dk', uygulama: 'Tatbiki' },
  { saat: '10:00 – 10:30', faaliyet: 'Spor Sonrası Duş, Eğitime Hazırlık', sure: '30 dk', uygulama: 'Tatbiki' },
  { saat: '10:30 – 11:15', faaliyet: 'Eğitim Konusu (Günün Konusu)', sure: '45 dk', uygulama: 'Nazari' },
  { saat: '11:15 – 12:00', faaliyet: 'Dinlenme ve Yemek Hazırlığı', sure: '15 dk', uygulama: '—' },
  { saat: '12:00 – 13:30', faaliyet: 'Yemek Saati', sure: '90 dk', uygulama: '—' },
  { saat: '13:30 – 15:00', faaliyet: 'Birey Eğitim Çalışması', sure: '90 dk', uygulama: 'Nazari / Tatbiki' },
  { saat: '15:00 – 15:30', faaliyet: 'Dinlenme', sure: '30 dk', uygulama: '—' },
  { saat: '15:30 – 16:30', faaliyet: 'Araç ve Malzeme Bakımı / Eksikliklerin Tamamlanması', sure: '60 dk', uygulama: 'Tatbiki' },
  { saat: '16:30 – 16:45', faaliyet: 'Dinlenme', sure: '15 dk', uygulama: '—' },
  { saat: '16:45 – 17:30', faaliyet: 'Eğitim Değerlendirmesi / Eksiklerin Belirlenmesi', sure: '45 dk', uygulama: 'Nazari / Tatbiki' },
  { saat: '17:30 – 18:30', faaliyet: 'Dinlenme (Serbest Zaman) / Yemek Hazırlığı', sure: '60 dk', uygulama: '—' },
  { saat: '18:30 – 20:00', faaliyet: 'Yemek Saati', sure: '90 dk', uygulama: '—' },
  { saat: '20:00 – 21:00', faaliyet: 'Görsel Sunumlar', sure: '60 dk', uygulama: 'Nazari' },
]

const POSTA_RENK: Record<string, { bg: string; text: string; border: string }> = {
  'A': { bg: 'bg-cyan-950/30', text: 'text-cyan-400', border: 'border-cyan-500/30' },
  'B': { bg: 'bg-amber-950/30', text: 'text-amber-400', border: 'border-amber-500/30' },
  'C': { bg: 'bg-emerald-950/30', text: 'text-emerald-500', border: 'border-emerald-500/30' },
}

export default function EgitimlerPage() {
  const { user } = useAuthStore()
  const isMudur = user?.rol === 'Admin' || user?.unvan === 'Müdür' || user?.unvan === 'Amir' || user?.rol?.toLowerCase() === 'admin' || user?.unvan?.toLowerCase() === 'müdür' || user?.unvan?.toLowerCase() === 'amir'

  const mufredatColumns = [
    {
      header: "Tarih",
      cell: (row: any) => {
        const d = new Date(row.tarih);
        return <span className="font-semibold text-[var(--fd-text)]">{`${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()} ${getDayName(d)}`}</span>;
      }
    },
    {
      header: "Posta",
      cell: (row: any) => (
        <Badge variant={row.posta === 'A' ? 'info' : row.posta === 'B' ? 'warning' : 'success'}>
          {row.posta} Postası
        </Badge>
      )
    },
    {
      header: "Eğitim Konusu",
      accessorKey: "egitim_konusu",
      className: "text-[var(--fd-text)] font-semibold"
    },
    ...(isMudur ? [{
      header: "İşlemler",
      headerClassName: "text-right",
      className: "text-right",
      cell: (row: any) => (
        <div className="flex justify-end gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="text-[var(--fd-accent)] hover:text-[var(--fd-text)] h-7 w-7 p-0 rounded-[var(--fd-r-sm)]"
            onClick={() => {
              setMufredatEditRow(row);
              setMufredatForm({
                tarih: row.tarih.split('T')[0],
                posta: row.posta,
                egitim_konusu: row.egitim_konusu
              });
            }}
          >
            <Edit3 className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-400 hover:text-red-300 h-7 w-7 p-0 rounded-[var(--fd-r-sm)] hover:bg-red-950/20"
            onClick={() => handleDeleteMufredat(row.id)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      )
    }] : [])
  ];

  const [activeTab, setActiveTab] = useState<'requests' | 'calendar' | 'blacklist' | 'analytics' | 'temel'>('requests')
  const [temelSubTab, setTemelSubTab] = useState<'cizelge' | 'mufredat' | 'sertifika'>('cizelge')

  // Data States
  const [requests, setRequests] = useState<CitizenRequest[]>([])
  const [educations, setEducations] = useState<ExternalEducation[]>([])
  const [blacklistList, setBlacklistList] = useState<BlacklistInstitution[]>([])
  const [personnelList, setPersonnelList] = useState<any[]>([])

  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)

  // Search filter
  const [requestSearch, setRequestSearch] = useState("")

  // Details Modal for Citizen Request
  const [selectedRequest, setSelectedRequest] = useState<CitizenRequest | null>(null)
  const [tacticalMode, setTacticalMode] = useState<'NONE' | 'RED' | 'EKIP'>('NONE')
  const [rejectionReason, setRejectionReason] = useState('')
  const [selectedCrew, setSelectedCrew] = useState('Merkez İstasyonu A Grubu')

  // Calendar Navigation
  const [currentWeekDate, setCurrentWeekDate] = useState<Date>(() => {
    const d = new Date()
    return getMonday(d)
  })

  const [selectedMobileDayIdx, setSelectedMobileDayIdx] = useState<number>(0)

  const daysOfWeek = useMemo<Date[]>(() => {
    const days: Date[] = []
    for (let i = 0; i < 7; i++) {
      const day = new Date(currentWeekDate)
      day.setDate(currentWeekDate.getDate() + i)
      days.push(day)
    }
    return days
  }, [currentWeekDate])

  // Education Planning / Edit Modal
  const [isProgramModalOpen, setIsProgramModalOpen] = useState(false)
  const [isSavingEdu, setIsSavingEdu] = useState(false)
  const [blacklistAcknowledged, setBlacklistAcknowledged] = useState(false)
  const [eduForm, setEduForm] = useState({
    id: '',
    kurum_id: '',
    kurum_adi: '',
    telefon: '',
    kurum_tipi: 'Isyeri',
    egitim_turu: 'Yangın Önleme ve Temel Yangın Eğitimi',
    kisi_sayisi: '20',
    planlanan_tarih: new Date().toISOString().split('T')[0],
    saat_slot: '08:00 - 09:00',
    egitimci_personel_ids: [] as string[],
    durum: 'Beklemede',
    mahalle: '',
    yas_grubu: 'Yetişkin',
    teorik_sure_dk: '45',
    pratik_sure_dk: '45'
  })

  // Blacklist Management
  const [isSavingBlacklist, setIsSavingBlacklist] = useState(false)
  const [blacklistForm, setBlacklistForm] = useState({
    kurum_adi: '',
    telefon: '',
    gerekce: ''
  })
  const [queryTelefon, setQueryTelefon] = useState("")
  const [queryResult, setQueryResult] = useState<BlacklistInstitution | null>(null)
  const [hasQueried, setHasQueried] = useState(false)

  // Temel Eğitim States
  const [mufredatList, setMufredatList] = useState<EgitimMufredati[]>([])
  const [mufredatMonth, setMufredatMonth] = useState(new Date().getMonth() + 1)
  const [mufredatYear, setMufredatYear] = useState(new Date().getFullYear())
  const [mufredatLoading, setMufredatLoading] = useState(false)
  const [mufredatEditRow, setMufredatEditRow] = useState<EgitimMufredati | null>(null)
  const [mufredatForm, setMufredatForm] = useState({ tarih: '', posta: 'A', egitim_konusu: '' })
  const [isSavingMufredat, setIsSavingMufredat] = useState(false)
  const [sertifikaPersonelId, setSertifikaPersonelId] = useState('')
  const [sertifikaSaat, setSertifikaSaat] = useState('240')
  const [cizelgeSearch, setCizelgeSearch] = useState('')
  const [cizelgePostaFilter, setCizelgePostaFilter] = useState('ALL')
  const [editingPersonel, setEditingPersonel] = useState<any | null>(null)
  const [newTrainingHours, setNewTrainingHours] = useState<number>(120)
  const [isUpdatingHours, setIsUpdatingHours] = useState(false)
  const [basariSiniri, setBasariSiniri] = useState<number>(240)


  // Role Checker


  // DataTable Column Definitions
  const cizelgeColumns = [
    {
      header: "Sicil No",
      accessorKey: "sicil_no",
      className: "font-mono font-bold text-[var(--fd-text3)]"
    },
    {
      header: "Ad Soyad",
      accessorFn: (p: any) => `${p.ad} ${p.soyad}`,
      className: "font-semibold text-[var(--fd-text)]"
    },
    {
      header: "Grup / Posta",
      cell: (p: any) => (
        <Badge variant={p.posta === 'A' ? 'info' : p.posta === 'B' ? 'warning' : 'success'}>
          {p.posta} Grubu
        </Badge>
      )
    },
    {
      header: "Unvan",
      accessorFn: (p: any) => p.unvan || 'İtfaiye Eri',
      className: "text-[var(--fd-text3)]"
    },
    {
      header: "Toplam Eğitim Saati",
      cell: (p: any) => <span className="font-mono font-bold text-[var(--fd-accent)]">{p.temel_egitim_saati || 0} Saat</span>
    },
    {
      header: "Durum",
      cell: (p: any) => {
        const hours = p.temel_egitim_saati || 0;
        const isEligible = hours >= basariSiniri;
        return isEligible ? (
          <Badge variant="success" className="gap-1.5 font-bold">
            <CheckCircle className="w-3.5 h-3.5" /> Sertifika Hak Kazandı
          </Badge>
        ) : (
          <Badge variant="warning" className="gap-1.5 font-bold">
            <Clock className="w-3.5 h-3.5" /> Devam Ediyor ({hours}/{basariSiniri})
          </Badge>
        );
      }
    },
    {
      header: "İşlemler",
      headerClassName: "text-right",
      className: "text-right",
      cell: (p: any) => {
        const hours = p.temel_egitim_saati || 0;
        const isEligible = hours >= basariSiniri;
        return (
          <div className="flex items-center justify-end gap-2">
            {isMudur && (
              <Button
                variant="ghost"
                size="sm"
                className="text-[var(--fd-accent)] hover:opacity-90 font-bold text-[11px] h-8 rounded-[var(--fd-r-sm)] hover:bg-[var(--fd-accent-soft)]"
                onClick={() => {
                  setEditingPersonel(p);
                  setNewTrainingHours(hours);
                }}
              >
                <Edit3 className="w-3.5 h-3.5 mr-1" /> Saat Güncelle
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={!isEligible}
              className={`font-bold text-[11px] h-8 rounded-[var(--fd-r-sm)] ${
                isEligible 
                  ? 'text-emerald-500 hover:text-emerald-600 hover:opacity-90/10' 
                  : 'text-[var(--fd-text3)] opacity-50 cursor-not-allowed'
              }`}
              onClick={() => {
                setSertifikaPersonelId(p.id);
                setSertifikaSaat(String(hours));
                setTemelSubTab('sertifika');
              }}
            >
              <Award className="w-3.5 h-3.5 mr-1" /> Sertifika
            </Button>
          </div>
        );
      }
    }
  ];



  // Fetch all databases
  const fetchAll = async () => {
    setLoading(true)
    try {
      const [reqRes, eduRes, blRes, perRes] = await Promise.all([
        fetch('/api/hizmet-yonetimi').then(r => r.json()),
        api.from('external_educations').select('*'),
        api.from('blacklist_institutions').select('*').order('created_at', { ascending: false }),
        api.from('personnel').select('*').eq('aktif', true).order('ad', { ascending: true })
      ])

      if (reqRes?.success && reqRes?.requests) {
        setRequests(reqRes.requests)
      }
      if (eduRes?.data) setEducations(eduRes.data)
      if (blRes?.data) setBlacklistList(blRes.data)
      if (perRes?.data) setPersonnelList(perRes.data)
    } catch (err) {
      console.error("Fetch all egitimler error:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
  }, [])

  // --- Temel Eğitim: Müfredat Fetch ---
  const fetchMufredat = async (ay: number, yil: number) => {
    setMufredatLoading(true)
    try {
      const { data } = await api.from('egitim_mufredati').select('*').eq('ay', ay).eq('yil', yil).order('tarih', { ascending: true })
      if (data) setMufredatList(data)
    } catch (err) {
      console.error("Müfredat fetch error:", err)
    } finally {
      setMufredatLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'temel') {
      fetchMufredat(mufredatMonth, mufredatYear)
    }
  }, [activeTab, mufredatMonth, mufredatYear])

  const handleSaveMufredat = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!mufredatForm.tarih || !mufredatForm.egitim_konusu) {
      toast("Tarih ve eğitim konusu zorunludur.")
      return
    }
    setIsSavingMufredat(true)
    try {
      const d = new Date(mufredatForm.tarih)
      const payload = {
        tarih: mufredatForm.tarih,
        posta: mufredatForm.posta,
        egitim_konusu: mufredatForm.egitim_konusu,
        ay: d.getMonth() + 1,
        yil: d.getFullYear()
      }
      if (mufredatEditRow) {
        unwrap(await api.update('egitim_mufredati', payload, { id: mufredatEditRow.id }))
      } else {
        unwrap(await api.insert('egitim_mufredati', [payload]))
        try {
          await fetch('/api/sms/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'training',
              date: payload.tarih,
              topic: payload.egitim_konusu
            })
          });
        } catch (smsErr) {
          console.error("Eğitim SMS gönderilemedi:", smsErr);
        }
      }
      setMufredatForm({ tarih: '', posta: 'A', egitim_konusu: '' })
      setMufredatEditRow(null)
      await fetchMufredat(mufredatMonth, mufredatYear)
    } catch (err) {
      console.error(err)
      toast("Kayıt sırasında hata oluştu.")
    } finally {
      setIsSavingMufredat(false)
    }
  }

  const handleDeleteMufredat = async (id: string) => {
    if (!window.confirm("Bu müfredat kaydını silmek istiyor musunuz?")) return
    try {
      unwrap(await api.remove('egitim_mufredati', { id }))
      await fetchMufredat(mufredatMonth, mufredatYear)
    } catch (err: any) {
      console.error(err)
      toast(`Müfredat kaydı silinemedi: ${err?.message || err}`)
    }
  }

  const AY_ISIMLERI = ['', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

  // --- PDF: Günlük Faaliyet Çizelgesi ---
  const handlePrintGunlukFaaliyet = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const clean = (txt: string) => cleanTurkishChars(txt || "")
    doc.rect(5, 5, 200, 287)
    doc.rect(6, 6, 198, 285)
    doc.setFont("Helvetica", "bold")
    doc.setFontSize(14)
    doc.text(clean("T.C. SIVAS BELEDIYE BASKANLIGI"), 105, 18, { align: "center" })
    doc.setFontSize(12)
    doc.text(clean("ITFAIYE MUDURLUGU"), 105, 24, { align: "center" })
    doc.setFont("Helvetica", "normal")
    doc.setFontSize(11)
    doc.text(clean("GUNLUK FAALIYET CIZELGESI"), 105, 30, { align: "center" })
    doc.line(15, 35, 195, 35)

    // Tablo basliklarini ciz
    doc.setFontSize(9)
    doc.setFont("Helvetica", "bold")
    doc.text(clean("SAAT"), 17, 42)
    doc.text(clean("YAPILACAK FAALIYETIN KONUSU"), 52, 42)
    doc.text(clean("SURE"), 140, 42)
    doc.text(clean("UYGULAMA"), 165, 42)
    doc.line(15, 45, 195, 45)

    doc.setFont("Helvetica", "normal")
    doc.setFontSize(8)
    let y = 51
    GUNLUK_FAALIYET.forEach(row => {
      doc.text(clean(row.saat.replace('–', '-')), 17, y)
      doc.text(clean(row.faaliyet), 52, y)
      doc.text(clean(row.sure), 142, y)
      doc.text(clean(row.uygulama), 168, y)
      y += 8
      doc.line(15, y - 3, 195, y - 3)
    })

    y += 5
    doc.setFontSize(7)
    doc.text(clean("Not: Nazari Egitimler Egitim Salonunda - Tatbiki Egitimler Egitim Sahasinda Yapilmaktadir."), 15, y)

    y += 12
    doc.setFont("Helvetica", "bold")
    doc.setFontSize(9)
    doc.text(clean("Seyfi Ali GUL"), 25, y)
    doc.text(clean("Ahmet YILDIZ"), 85, y)
    doc.text(clean("Ahmet CELIMLI"), 150, y)
    doc.setFont("Helvetica", "normal")
    doc.setFontSize(8)
    doc.text(clean("Egitim Amiri"), 28, y + 5)
    doc.text(clean("Mudahale Ekipler Amiri"), 82, y + 5)
    doc.text(clean("Personel Amiri"), 152, y + 5)

    y += 18
    doc.setFont("Helvetica", "bold")
    doc.setFontSize(10)
    doc.text(clean("ONAY"), 105, y, { align: "center" })
    doc.setFont("Helvetica", "normal")
    doc.setFontSize(9)
    doc.text(clean("Ibrahim ALACAM"), 105, y + 6, { align: "center" })
    doc.text(clean("Itfaiye Muduru"), 105, y + 11, { align: "center" })

    doc.save("Gunluk_Faaliyet_Cizelgesi.pdf")
  }

  // --- PDF: Aylık Müfredat ---
  const handlePrintAylikMufredat = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const clean = (txt: string) => cleanTurkishChars(txt || "")
    doc.rect(5, 5, 287, 200)
    doc.rect(6, 6, 285, 198)
    doc.setFont("Helvetica", "bold")
    doc.setFontSize(12)
    doc.text(clean("T.C. SIVAS BELEDIYE BASKANLIGI"), 148, 15, { align: "center" })
    doc.setFontSize(10)
    doc.text(clean("ITFAIYE MUDURLUGU"), 148, 21, { align: "center" })
    doc.setFont("Helvetica", "normal")
    doc.setFontSize(9)
    doc.text(clean(`${mufredatYear} YILI ${clean(AY_ISIMLERI[mufredatMonth]).toUpperCase()} AYI UYGULANACAK EGITIM KONULARI`), 148, 27, { align: "center" })
    doc.text(clean("GUNLUK EGITIM KONULARI"), 148, 32, { align: "center" })
    doc.line(10, 36, 287, 36)

    // Basliklar
    doc.setFont("Helvetica", "bold")
    doc.setFontSize(8)
    doc.text(clean("TARIH / GUN"), 14, 42)
    doc.text(clean("POSTA"), 60, 42)
    doc.text(clean("EGITIM KONUSU"), 80, 42)
    doc.line(10, 45, 287, 45)

    doc.setFont("Helvetica", "normal")
    doc.setFontSize(7)
    let y = 51
    const gunIsimleri = ['Pazar', 'Pazartesi', 'Sali', 'Carsamba', 'Persembe', 'Cuma', 'Cumartesi']
    mufredatList.forEach(row => {
      const d = new Date(row.tarih)
      const gunStr = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()} ${gunIsimleri[d.getDay()]}`
      doc.text(clean(gunStr), 14, y)
      doc.text(clean(row.posta), 64, y)
      doc.text(clean(row.egitim_konusu), 80, y)
      y += 5
      if (y > 190) {
        doc.addPage()
        y = 20
      }
    })

    doc.save(`Egitim_Mufredati_${AY_ISIMLERI[mufredatMonth]}_${mufredatYear}.pdf`)
  }

  // --- PDF: Sertifika ---
  const handlePrintSertifika = async () => {
    const p = personnelList.find((x: any) => x.id === sertifikaPersonelId || x.sicil_no === sertifikaPersonelId)
    if (!p) {
      toast("Lütfen geçerli bir personel seçiniz.")
      return
    }
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

    try {
      const fontBase64 = await fetchGeistFontBase64()
      doc.addFileToVFS('Geist-Regular.ttf', fontBase64)
      doc.addFont('Geist-Regular.ttf', 'Geist', 'normal')
      doc.setFont('Geist', 'normal')
    } catch (err) {
      console.error("Geist font load error, using Helvetica", err)
      doc.setFont("Helvetica", "normal")
    }

    try {
      const logoBelediye = await loadHtmlImage('/logo-belediye.png')
      const logoItfaiye = await loadHtmlImage('/logo-itfaiye.png')
      doc.addImage(logoBelediye, 'PNG', 22, 20, 24, 24)
      doc.addImage(logoItfaiye, 'PNG', 251, 20, 24, 24)
    } catch (err) {
      console.error("Logolar yüklenirken hata oluştu:", err)
    }

    // Sertifika Çerçevesi
    doc.setDrawColor(6, 182, 212)
    doc.setLineWidth(1.5)
    doc.rect(10, 10, 277, 190)
    doc.setLineWidth(0.5)
    doc.rect(14, 14, 269, 182)

    // Başlık
    doc.setFontSize(22)
    doc.text("T.C. SİVAS BELEDİYE BAŞKANLIĞI", 148, 38, { align: "center" })
    doc.setFontSize(16)
    doc.text("İTFAİYE MÜDÜRLÜĞÜ", 148, 48, { align: "center" })

    doc.setFontSize(24)
    doc.text("TEMEL İTFAİYE EĞİTİMİ", 148, 68, { align: "center" })
    doc.setFontSize(18)
    doc.text("BAŞARI SERTİFİKASI", 148, 78, { align: "center" })

    doc.line(60, 84, 237, 84)

    // Personel Bilgileri
    doc.setFontSize(14)
    doc.text(`${p.ad} ${p.soyad}`, 148, 100, { align: "center" })
    doc.setFontSize(11)
    doc.text(`Sicil No: ${p.sicil_no || '-'} | Unvan: ${p.unvan || 'İtfaiye Eri'}`, 148, 110, { align: "center" })

    doc.setFontSize(12)
    const sertText = `${p.ad} ${p.soyad}, ${sertifikaSaat} saatlik Temel İtfaiye Eğitimi programını başarıyla tamamlayarak bu sertifikayı almaya hak kazanmıştır.`
    const lines = doc.splitTextToSize(sertText, 200)
    doc.text(lines, 148, 126, { align: "center" })

    doc.setFontSize(10)
    doc.text(`Veriliş Tarihi: ${new Date().toLocaleDateString('tr-TR')}`, 148, 148, { align: "center" })

    // İmzalar
    doc.line(40, 170, 110, 170)
    doc.line(187, 170, 257, 170)
    doc.setFontSize(10)
    doc.text("Seyfi Ali GÜL", 75, 176, { align: "center" })
    doc.text("İbrahim ALAÇAM", 222, 176, { align: "center" })
    doc.setFontSize(9)
    doc.text("Eğitim Amiri", 75, 182, { align: "center" })
    doc.text("İtfaiye Müdürü", 222, 182, { align: "center" })

    doc.save(`Sertifika_${p.ad}_${p.soyad}.pdf`)
  }


  // --- Basic Training Functions ---
  const handleUpdateHours = async () => {
    if (!editingPersonel) return
    setIsUpdatingHours(true)
    try {
      const res = await api.update('personnel', { 
        temel_egitim_saati: Number(newTrainingHours) 
      }, { 
        id: editingPersonel.id 
      })
      if (res.error) {
        toast("Eğitim saati güncellenirken hata oluştu: " + res.error)
      } else {
        setPersonnelList(prev => prev.map(p => p.id === editingPersonel.id ? { ...p, temel_egitim_saati: Number(newTrainingHours) } : p))
        setEditingPersonel(null)
      }
    } catch (err: any) {
      console.error(err)
      toast("Hata: " + err.message)
    } finally {
      setIsUpdatingHours(false)
    }
  }

  const handlePrintYillikCizelge = async () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    try {
      const fontBase64 = await fetchGeistFontBase64()
      doc.addFileToVFS('Geist-Regular.ttf', fontBase64)
      doc.addFont('Geist-Regular.ttf', 'Geist', 'normal')
      doc.setFont('Geist', 'normal')
    } catch (err) {
      console.error("Geist font load error, using Helvetica", err)
      doc.setFont("Helvetica", "normal")
    }

    doc.rect(5, 5, 200, 287)
    doc.rect(6, 6, 198, 285)
    doc.setFontSize(14)
    doc.text("T.C. SİVAS BELEDİYE BAŞKANLIĞI", 105, 18, { align: "center" })
    doc.setFontSize(12)
    doc.text("İTFAİYE MÜDÜRLÜĞÜ", 105, 24, { align: "center" })
    doc.setFontSize(11)
    doc.text("PERSONEL TEMEL EĞİTİM YILLIK ÇİZELGESİ", 105, 30, { align: "center" })
    doc.line(15, 35, 195, 35)

    doc.setFontSize(9)
    doc.text("SİCİL NO", 17, 42)
    doc.text("AD SOYAD", 45, 42)
    doc.text("POSTA", 110, 42)
    doc.text("UNVAN", 135, 42)
    doc.text("EĞİTİM SAATİ", 170, 42)
    doc.line(15, 45, 195, 45)

    doc.setFontSize(9)
    let y = 51
    personnelList.forEach(p => {
      doc.text(p.sicil_no || '-', 17, y)
      doc.text(`${p.ad} ${p.soyad}`, 45, y)
      doc.text(p.posta || '-', 110, y)
      doc.text(p.unvan || '-', 135, y)
      doc.text(`${p.temel_egitim_saati || 0} Saat`, 170, y)
      y += 8
      if (y > 270) {
        doc.addPage()
        doc.rect(5, 5, 200, 287)
        doc.rect(6, 6, 198, 285)
        y = 20
        doc.text("SİCİL NO", 17, y)
        doc.text("AD SOYAD", 45, y)
        doc.text("POSTA", 110, y)
        doc.text("UNVAN", 135, y)
        doc.text("EĞİTİM SAATİ", 170, y)
        doc.line(15, y + 3, 195, y + 3)
        y += 10
      } else {
        doc.line(15, y - 3, 195, y - 3)
      }
    })

    doc.save("Personel_Temel_Egitim_Yillik_Cizelgesi.pdf")
  }


  // Filtered Training Citizen Requests
  const trainingRequests = useMemo(() => {
    return requests.filter(r => {
      const isTraining = normalizeTextForSearch(r.talep_turu).includes("egitim")
      if (!isTraining) return false

      if (requestSearch.trim() !== "") {
        const s = normalizeTextForSearch(requestSearch)
        return (
          normalizeTextForSearch(r.basvuran_ad_soyad).includes(s) ||
          (r.basvuran_tc || "").toLowerCase().includes(s) ||
          normalizeTextForSearch(r.adres).includes(s)
        )
      }
      return true
    })
  }, [requests, requestSearch])

  // --- Citizen Request Actions ---
  const handleTacticalAction = async (
    id: string, 
    newStatus: 'ONAYLANDI' | 'REDDEDİLDİ' | 'EKİP_ATANDI',
    extra?: { crew?: string; reason?: string }
  ) => {
    setUpdating(id)
    try {
      const amirStr = user ? `${user.ad} ${user.soyad} (${user.sicilNo || 'Amir'})` : 'Bilinmeyen Amir'
      const res = await fetch('/api/hizmet-onay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          durum: newStatus,
          islem_yapan_amir: amirStr,
          atanan_ekip: extra?.crew || null,
          red_gerekcesi: extra?.reason || null
        })
      });
      const data = await res.json();
      
      if (data.success) {
        await fetchAll();
        setSelectedRequest(prev => {
          if (prev && prev.id === id) {
            return {
              ...prev,
              durum: newStatus,
              islem_yapan_amir: amirStr,
              atanan_ekip: extra?.crew || undefined,
              red_gerekcesi: extra?.reason || undefined,
              islem_tarihi: new Date().toISOString()
            };
          }
          return prev;
        });

        setTacticalMode('NONE');
        setRejectionReason('');
      } else {
        toast('İşlem başarısız: ' + (data.error || 'Bilinmeyen Hata'));
      }
    } catch (err) {
      console.error('Tactical action error:', err)
      toast('Sistem bağlantı hatası oluştu.')
    } finally {
      setUpdating(null)
    }
  }

  const handleDeleteRequest = async (id: string) => {
    if (!window.confirm("Bu eğitim talebini kalıcı olarak silmek istediğinize emin misiniz?")) {
      return
    }
    setUpdating(id)
    try {
      const res = await fetch(`/api/hizmet-onay?id=${id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (data.success) {
        setRequests(prev => prev.filter(r => r.id !== id))
        if (selectedRequest?.id === id) {
          setSelectedRequest(null)
        }
      } else {
        toast('Silme işlemi başarısız: ' + (data.error || 'Bilinmeyen Hata'))
      }
    } catch (err) {
      console.error('Delete request error:', err)
    } finally {
      setUpdating(null)
    }
  }

  // --- Blacklist Check ---
  const activeBlacklistedInst = useMemo(() => {
    if (!eduForm.kurum_adi) return null
    if (eduForm.kurum_id) {
      const found = blacklistList.find(x => x.id === eduForm.kurum_id && x.aktif_durum === true)
      if (found) return found
    }
    const queryName = eduForm.kurum_adi.trim().toLowerCase()
    const foundByName = blacklistList.find(x => x.kurum_adi.trim().toLowerCase() === queryName && x.aktif_durum === true)
    return foundByName || null
  }, [eduForm.kurum_adi, eduForm.kurum_id, blacklistList])

  // --- External Education Handlers ---
  const handleSaveEducation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!eduForm.kurum_adi) {
      toast("Lütfen Kurum adını giriniz.")
      return
    }

    if (activeBlacklistedInst && !blacklistAcknowledged) {
      toast("Kara listedeki uyarılı kurum onay kutusunu işaretlemeniz gerekmektedir.")
      return
    }

    setIsSavingEdu(true)
    try {
      const teorik = Number(eduForm.teorik_sure_dk) || 0
      const pratik = Number(eduForm.pratik_sure_dk) || 0
      const toplamSaat = (teorik + pratik) / 60

      const payload = {
        kurum_id: eduForm.kurum_id || null,
        kurum_adi: eduForm.kurum_adi,
        telefon: eduForm.telefon,
        kurum_tipi: eduForm.kurum_tipi,
        egitim_turu: eduForm.egitim_turu,
        kisi_sayisi: Number(eduForm.kisi_sayisi) || 20,
        planlanan_tarih: new Date(eduForm.planlanan_tarih).toISOString(),
        saat_slot: eduForm.saat_slot,
        egitimci_personel_ids: eduForm.egitimci_personel_ids,
        durum: eduForm.durum,
        mahalle: eduForm.mahalle || 'Merkez',
        yas_grubu: eduForm.yas_grubu,
        teorik_sure_dk: teorik,
        pratik_sure_dk: pratik,
        tatbikat_sure_dk: pratik, // back-compat
        toplam_sure_saat: parseFloat(toplamSaat.toFixed(2))
      }

      let res
      if (eduForm.id) {
        // Update
        res = await api.update('external_educations', payload, { id: eduForm.id })
      } else {
        // Insert
        res = await api.insert('external_educations', [payload])
      }

      if (res && !res.error) {
        if (eduForm.durum === 'Onaylandı') {
          try {
            await fetch('/api/sms/notify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'training',
                date: payload.planlanan_tarih.split('T')[0],
                topic: payload.egitim_turu + " (" + payload.kurum_adi + ")",
                personnelIds: payload.egitimci_personel_ids
              })
            });
          } catch (smsErr) {
            console.error("Dış Eğitim SMS gönderilemedi:", smsErr);
          }
        }
        setIsProgramModalOpen(false)
        await fetchAll()
      } else {
        toast("Kayıt başarısız: " + (res?.error || 'Bilinmeyen Hata'))
      }
    } catch (err) {
      console.error(err)
      toast("İşlem sırasında hata oluştu.")
    } finally {
      setIsSavingEdu(false)
    }
  }

  const handleDeleteEducation = async (id: string) => {
    if (!window.confirm("Bu program kaydını kalıcı olarak silmek istiyor musunuz?")) return
    try {
      const res = await api.remove('external_educations', { id })
      if (res && !res.error) {
        setIsProgramModalOpen(false)
        await fetchAll()
      } else {
        toast("Silme hatası: " + (res?.error || 'Hata'))
      }
    } catch (err) {
      console.error(err)
    }
  }

  // --- Blacklist Handlers ---
  const handleAddBlacklist = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!blacklistForm.kurum_adi || !blacklistForm.telefon) {
      toast("Kurum Adı ve Vergi No/TC alanları zorunludur.")
      return
    }

    setIsSavingBlacklist(true)
    try {
      const payload = {
        kurum_adi: blacklistForm.kurum_adi,
        telefon: blacklistForm.telefon,
        gerekce: blacklistForm.gerekce || '',
        yasaklama_tarihi: new Date().toISOString().split('T')[0],
        aktif_durum: true
      }
      const res = await api.insert('blacklist_institutions', [payload])
      if (res && !res.error) {
        setBlacklistForm({ kurum_adi: '', telefon: '', gerekce: '' })
        await fetchAll()
        toast("Kurum başarıyla kırmızı bayraklı listeye eklendi.")
      } else {
        toast("Kurum ekleme başarısız: " + (res?.error || 'Hata'))
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsSavingBlacklist(false)
    }
  }

  const handleToggleBlacklist = async (id: string, currentStatus: boolean) => {
    try {
      const res = await api.update('blacklist_institutions', { aktif_durum: !currentStatus }, { id })
      if (res && !res.error) {
        await fetchAll()
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleDeleteBlacklist = async (id: string) => {
    if (!window.confirm("Bu kara liste kaydını kalıcı olarak silmek istiyor musunuz?")) return
    try {
      const res = await api.remove('blacklist_institutions', { id })
      if (res && !res.error) {
        await fetchAll()
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleQueryBlacklist = () => {
    if (!queryTelefon.trim()) {
      toast("Lütfen arama terimi girin.")
      return
    }
    const term = queryTelefon.trim().toLowerCase();
    const found = blacklistList.find(x => 
      (x.telefon && x.telefon.trim().toLowerCase().includes(term)) || 
      (x.kurum_adi && x.kurum_adi.trim().toLowerCase().includes(term)) ||
      (x.gerekce && x.gerekce.toLowerCase().includes(term))
    )
    setQueryResult(found || null)
    setHasQueried(true)
  }

  // --- jsPDF Official Document Generation (Aksiyon A & Aksiyon B) ---
  const fetchImageAsBase64 = async (url: string): Promise<string> => {
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      return new Promise((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.readAsDataURL(blob)
      })
    } catch (e) {
      return ''
    }
  }

  const handlePrintYanginEgitimRaporu = async (edu: any) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const clean = (txt: string) => txt || "" 

    try {
      const fontBase64 = await fetchGeistFontBase64()
      doc.addFileToVFS('Geist-Regular.ttf', fontBase64)
      doc.addFont('Geist-Regular.ttf', 'Geist', 'normal')
      doc.setFont('Geist', 'normal')
    } catch (err) {
      console.error("Geist font load error, using Helvetica", err)
      doc.setFont("Helvetica", "normal")
    }

    // A4 border outlines
    doc.rect(5, 5, 200, 287)
    doc.rect(6, 6, 198, 285)

    // Logolar
    const logoBelediye = await fetchImageAsBase64('/logo-belediye.png')
    const logoItfaiye = await fetchImageAsBase64('/logo-itfaiye.png')
    if (logoBelediye) doc.addImage(logoBelediye, 'PNG', 15, 12, 22, 22)
    if (logoItfaiye) doc.addImage(logoItfaiye, 'PNG', 173, 12, 22, 22)

    // Antetli Başlık
    doc.setFontSize(14)
    doc.text(clean("T.C. SİVAS BELEDİYESİ"), 105, 20, { align: "center" })
    doc.setFontSize(12)
    doc.text(clean("İTFAİYE MÜDÜRLÜĞÜ"), 105, 26, { align: "center" })
    doc.setFontSize(11)
    doc.text(clean("YANGIN EĞİTİMİ VE TATBİKAT SONUÇ RAPORU"), 105, 32, { align: "center" })

    doc.line(15, 38, 195, 38)

    // Detay Tablosu
    doc.setFontSize(10)
    doc.text(clean("EĞİTİM ALAN KURUM / İŞYERİ BİLGİLERİ:"), 15, 48)
    
    doc.text(clean("Kurum Adı:"), 15, 56)
    doc.text(clean(edu.kurum_adi), 55, 56)

    doc.text(clean("Kurum Tipi:"), 15, 62)
    doc.text(clean(edu.kurum_tipi), 55, 62)

    doc.text(clean("Eğitim Bölgesi / Mahalle:"), 15, 68)
    doc.text(clean(edu.mahalle || "Merkez"), 55, 68)

    doc.text(clean("Planlanan Tarih:"), 15, 74)
    doc.text(clean(new Date(edu.planlanan_tarih).toLocaleDateString('tr-TR')), 55, 74)

    doc.text(clean("Saat Dilimi:"), 15, 80)
    doc.text(clean(edu.saat_slot), 55, 80)

    doc.text(clean("Katılımcı Sayısı:"), 15, 86)
    doc.text(clean(`${edu.kisi_sayisi || 0} Kişi`), 55, 86)

    doc.text(clean("Teorik Süre (Dakika):"), 15, 92)
    doc.text(clean(`${edu.teorik_sure_dk || 0} dk`), 55, 92)

    doc.text(clean("Pratik Süre (Dakika):"), 15, 98)
    doc.text(clean(`${edu.pratik_sure_dk || 0} dk`), 55, 98)

    doc.text(clean("Toplam Süre:"), 15, 104)
    doc.text(clean(`${(((Number(edu.teorik_sure_dk || 0) + Number(edu.pratik_sure_dk || 0)) / 60)).toFixed(2)} Saat`), 55, 104)

    doc.line(15, 110, 195, 110)

    // Ders Planı checklist
    doc.text(clean("DERS PLANI VE EĞİTİM MADDELERİ:"), 15, 120)
    
    const curriculum = [
      "[X] 1. Yanma nedir, Yangın kimyası ve safhaları.",
      "[X] 2. Yangın sınıfları (A, B, C, D, F) ve söndürme metotları.",
      "[X] 3. Kimyasal, köpüklü ve sulu taşınabilir söndürücülerin tanıtımı.",
      "[X] 4. YSC kullanım yöntemi (PASS: Pim çek, Ateşte tut, Sık, Süpür).",
      "[X] 5. Acil durumlarda binadan tahliye, kriz yönetimi ve kaçış yolları.",
      "[X] 6. Uygulamalı açık alan yangın söndürme tatbikatının icrası."
    ]
    
    let y = 128
    curriculum.forEach(item => {
      doc.text(clean(item), 18, y)
      y += 8
    })

    doc.line(15, y + 4, 195, y + 4)

    // İmzalar
    doc.text(clean("GÖREVLİ EĞİTİMCİ PERSONELLER:"), 15, y + 14)
    const trainersStr = edu.egitimci_personel_ids && edu.egitimci_personel_ids.length > 0
      ? edu.egitimci_personel_ids.map((id: string) => {
          const p = personnelList.find(x => x.id === id || x.sicil_no === id)
          return p ? `${p.ad} ${p.soyad} (${p.unvan || 'İtfaiye Eri'})` : 'Görevli Personel'
        }).join(', ')
      : 'Görevli Personel Atanmadı'
    
    const splitTrainers = doc.splitTextToSize(clean(trainersStr), 90);
    doc.text(splitTrainers, 15, y + 22)

    doc.text(clean("NÖBETÇİ AMİR"), 120, y + 14)
    doc.text(clean("Seyfi Ali GÜL"), 120, y + 22)

    doc.text(clean("MÜDÜR"), 165, y + 14)
    doc.text(clean("İbrahim ALAÇAM"), 165, y + 22)

    doc.save(`Yangin_Egitim_Sonuc_Raporu_${clean(edu.kurum_adi).replace(/\s+/g, '_')}.pdf`)
  }

  const handlePrintZiyaretRaporu = (edu: any) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const clean = (txt: string) => cleanTurkishChars(txt || "")

    doc.rect(5, 5, 200, 287)
    doc.rect(6, 6, 198, 285)

    doc.setFont("Helvetica", "bold")
    doc.setFontSize(14)
    doc.text(clean("T.C. SIVAS BELEDIYESI"), 105, 20, { align: "center" })
    doc.setFontSize(12)
    doc.text(clean("ITFAIYE MUDURLUGU"), 105, 26, { align: "center" })
    doc.setFont("Helvetica", "normal")
    doc.setFontSize(11)
    doc.text(clean("ITFAIYE MERKEZI ZIYARET SONUC RAPORU"), 105, 32, { align: "center" })

    doc.line(15, 38, 195, 38)

    doc.setFontSize(10)
    doc.setFont("Helvetica", "bold")
    doc.text(clean("ZIYARETCI KURUM DETAYLARI:"), 15, 48)

    doc.setFont("Helvetica", "normal")
    doc.text(clean("Kurum / Ziyaretci Adi:"), 15, 56)
    doc.setFont("Helvetica", "bold")
    doc.text(clean(edu.kurum_adi), 55, 56)

    doc.setFont("Helvetica", "normal")
    doc.text(clean("Ziyaret Tarihi:"), 15, 62)
    doc.text(clean(new Date(edu.planlanan_tarih).toLocaleDateString('tr-TR')), 55, 62)

    doc.text(clean("Saat Slotu:"), 15, 68)
    doc.text(clean(edu.saat_slot), 55, 68)

    doc.text(clean("Katilimci Sayisi:"), 15, 74)
    doc.text(clean(`${edu.kisi_sayisi || 0} Kisi`), 55, 74)

    doc.text(clean("Yas Durumu / Grubu:"), 15, 80)
    doc.text(clean(edu.yas_grubu || "Karisik"), 55, 80)

    doc.text(clean("Ziyaret Suresi:"), 15, 86)
    doc.text(clean(`${(((Number(edu.teorik_sure_dk || 0) + Number(edu.pratik_sure_dk || 0)) / 60)).toFixed(2)} Saat`), 55, 86)

    doc.line(15, 92, 195, 92)

    doc.setFont("Helvetica", "bold")
    doc.text(clean("ZIYARET KAPSAMINDA YAPILAN FAALIYETLER VE ARAC TANITIMI:"), 15, 102)

    doc.setFont("Helvetica", "normal")
    const narrativeLines = [
      "Sivas Belediyesi Itfaiye Mudurlugu yerleskesinde agirlanan misafirlerimize yonelik,",
      "itfaiyenin calisma kosullari, acil durum bilincinin kazandirilmasi ve araclarin",
      "tanitimi amacıyla asagidaki resmi program icra edilmistir:",
      "",
      "1. Garaj bolumunde bulunan Arazor, Tanker ve Merdivenli Yangin araclarinin teknik",
      "   ozellikleri ve bu araclarda bulunan kurtarma techizati yerinde gosterilmistir.",
      "2. Yangina mudahale sirasinda kullanilan kisisel koruyucu elbiseler (mihfer, mont,",
      "   cizme) ve solunum cihazlari (SCBA) misafirlere pratik olarak tanitilmistir.",
      "3. Yas grubuna uygun acil durum bilinclendirme sunumu yapilmis, 112 Acil Cagri",
      "   numarasinin dogru kullanilmasi onemle vurgulanmistir."
    ]

    let yOffset = 112
    narrativeLines.forEach(l => {
      doc.text(clean(l), 15, yOffset)
      yOffset += 7
    })

    doc.line(15, yOffset + 4, 195, yOffset + 4)

    doc.setFont("Helvetica", "bold")
    doc.text(clean("REHBERLIK EDEN SAHA PERSONELLERI:"), 15, yOffset + 14)
    doc.setFont("Helvetica", "normal")
    const trainersStr = edu.egitimci_personel_ids && edu.egitimci_personel_ids.length > 0
      ? edu.egitimci_personel_ids.map((id: string) => {
          const p = personnelList.find(x => x.id === id || x.sicil_no === id)
          return p ? `${p.ad} ${p.soyad} (${p.unvan || 'Itfaiye Eri'})` : 'Gorevli Personel'
        }).join(', ')
      : 'Gorevli Personel Atanmadi'
    doc.text(clean(trainersStr), 15, yOffset + 22)

    doc.setFont("Helvetica", "bold")
    doc.text(clean("ONAYLAYAN NOBETCI AMIRI / MUDUR:"), 120, yOffset + 14)
    doc.setFont("Helvetica", "normal")
    doc.text(clean(user ? `${user.ad} ${user.soyad}` : "Itfaiye Yetkilisi"), 120, yOffset + 22)
    doc.text(clean("Sivas Belediyesi Itfaiyesi"), 120, yOffset + 27)

    doc.save(`Itfaiye_Ziyaret_Raporu_${clean(edu.kurum_adi).replace(/\s+/g, '_')}.pdf`)
  }

  const handlePrintClick = (edu: any) => {
    if (edu.kurum_tipi === 'Itfaiye Ziyaret') {
      handlePrintZiyaretRaporu(edu)
    } else {
      handlePrintYanginEgitimRaporu(edu)
    }
  }

  // --- Weeks Navigation ---
  const handlePrevWeek = () => {
    setCurrentWeekDate(prev => {
      const d = new Date(prev)
      d.setDate(d.getDate() - 7)
      return d
    })
  }

  const handleTodayWeek = () => {
    setCurrentWeekDate(getMonday(new Date()))
  }

  const handleNextWeek = () => {
    setCurrentWeekDate(prev => {
      const d = new Date(prev)
      d.setDate(d.getDate() + 7)
      return d
    })
  }

  // --- Analitik Dashboard Computations ---
  const analyticsData = useMemo(() => {
    const totalCount = educations.length
    const totalParticipants = educations.reduce((acc, curr) => acc + (curr.kisi_sayisi || 0), 0)
    const totalHours = educations.reduce((acc, curr) => acc + (Number(curr.toplam_sure_saat) || 0), 0)
    const pendingCount = trainingRequests.filter(x => x.durum === 'BEKLEMEDE' || x.durum === 'Bekliyor').length

    // Kurum Tipi Dağılımı
    const typeMap: Record<string, number> = {}
    educations.forEach(edu => {
      const t = edu.kurum_tipi || 'Diğer'
      typeMap[t] = (typeMap[t] || 0) + 1
    })
    const typeData = Object.keys(typeMap).map(key => ({
      name: key === 'Isyeri' ? 'İşyeri' : key === 'Kamu Kurumu' ? 'Kamu Kurumu' : key === 'Itfaiye Ziyaret' ? 'İtfaiye Ziyaret' : key === 'Ev-Site' ? 'Ev-Site' : key === 'Ekip Egitimi' ? 'Ekip Eğitimi' : key === 'Okul' ? 'Okul' : key,
      value: typeMap[key]
    }))

    // Mahalle bazında (Top 5)
    const mahalleMap: Record<string, number> = {}
    educations.forEach(edu => {
      const m = edu.mahalle || 'Belirtilmemiş'
      mahalleMap[m] = (mahalleMap[m] || 0) + 1
    })
    const mahalleData = Object.keys(mahalleMap)
      .map(key => ({ name: key, Adet: mahalleMap[key] }))
      .sort((a, b) => b.Adet - a.Adet)
      .slice(0, 5)

    // Aylık Trend
    const monthlyMap: Record<string, number> = {}
    educations.forEach(edu => {
      if (edu.planlanan_tarih) {
        const date = new Date(edu.planlanan_tarih)
        const month = date.toLocaleString('tr-TR', { month: 'long' })
        monthlyMap[month] = (monthlyMap[month] || 0) + 1
      }
    })
    const monthlyData = Object.keys(monthlyMap).map(key => ({
      name: key,
      'Eğitim Adeti': monthlyMap[key]
    }))

    return {
      totalCount,
      totalParticipants,
      totalHours: parseFloat(totalHours.toFixed(1)),
      pendingCount,
      typeData,
      mahalleData,
      monthlyData
    }
  }, [educations, trainingRequests])

  const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

  if (loading) {
    return (
      <div className="p-8 text-center animate-pulse flex items-center justify-center gap-2 min-h-[50vh]">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--fd-accent)]" />
        <span className="text-muted-foreground font-semibold">Eğitim Yönetim Sistemi Yükleniyor...</span>
      </div>
    )
  }

  return (
    <PageGuard pageId="egitimler">
      <div className="space-y-6 w-full max-w-full px-1.5 md:px-3 pb-12 animate-in fade-in zoom-in-95 duration-300">
        
        {/* Sayfa Üst Bilgi */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/50 pb-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Eğitim ve Faaliyet Komuta Merkezi</h1>
            <p className="text-muted-foreground text-sm mt-1">Sivas İtfaiyesi Kurumsal Eğitim Programları, Ziyaret ve Analitik Yönetimi</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              className="bg-[var(--fd-accent)] hover:opacity-90 text-white font-bold text-xs px-3.5 py-2 h-9 rounded-[var(--fd-r-sm)] flex items-center gap-1.5 shadow-lg"
              onClick={() => {
                setEduForm({
                  id: '',
                  kurum_id: '',
                  kurum_adi: '',
                                telefon: '',
                                kurum_tipi: 'Isyeri',
                  egitim_turu: 'Yangın Önleme ve Temel Yangın Eğitimi',
                  kisi_sayisi: '20',
                  planlanan_tarih: getYYYYMMDD(new Date()),
                  saat_slot: '08:00 - 09:00',
                  egitimci_personel_ids: [],
                  durum: 'Beklemede',
                  mahalle: '',
                  yas_grubu: 'Yetişkin',
                  teorik_sure_dk: '45',
                  pratik_sure_dk: '45'
                })
                setBlacklistAcknowledged(false)
                setIsProgramModalOpen(true)
              }}
            >
              <Plus className="w-4 h-4" /> Eğitim Planla
            </Button>
          </div>
        </div>

        {/* Sekme Butonları */}
        <div className="border-b border-[var(--fd-border)] pb-2 pt-1">
          <div className="flex flex-wrap bg-[var(--fd-surface2)] p-1 rounded-[var(--fd-r)] border border-[var(--fd-border)] gap-1 w-full">
            <Button
              onClick={() => setActiveTab('requests')}
              variant={activeTab === 'requests' ? 'default' : 'ghost'}
              className={cn(
                "flex-1 sm:flex-none flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 h-auto py-2 sm:h-9 sm:py-0 text-xs font-bold rounded-[var(--fd-r-sm)] transition-all cursor-pointer text-center",
                activeTab === 'requests'
                  ? "bg-[var(--fd-accent)] text-[#ffffff] shadow-[var(--fd-shadow-sm)]"
                  : "text-[var(--fd-text3)] hover:text-[var(--fd-text2)] hover:bg-[var(--fd-surface3)]/50"
              )}
            >
              <span>📋</span>
              <span><span className="hidden sm:inline">Kurumsal </span>Talepler ({trainingRequests.length})</span>
            </Button>
            <Button
              onClick={() => setActiveTab('calendar')}
              variant={activeTab === 'calendar' ? 'default' : 'ghost'}
              className={cn(
                "flex-1 sm:flex-none flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 h-auto py-2 sm:h-9 sm:py-0 text-xs font-bold rounded-[var(--fd-r-sm)] transition-all cursor-pointer text-center",
                activeTab === 'calendar'
                  ? "bg-[var(--fd-accent)] text-[#ffffff] shadow-[var(--fd-shadow-sm)]"
                  : "text-[var(--fd-text3)] hover:text-[var(--fd-text2)] hover:bg-[var(--fd-surface3)]/50"
              )}
            >
              <span>📅</span>
              <span><span className="hidden sm:inline">Teşkilat </span>Programı</span>
            </Button>
            <Button
              onClick={() => setActiveTab('blacklist')}
              variant={activeTab === 'blacklist' ? 'default' : 'ghost'}
              className={cn(
                "flex-1 sm:flex-none flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 h-auto py-2 sm:h-9 sm:py-0 text-xs font-bold rounded-[var(--fd-r-sm)] transition-all cursor-pointer text-center",
                activeTab === 'blacklist'
                  ? "bg-[var(--fd-accent)] text-[#ffffff] shadow-[var(--fd-shadow-sm)]"
                  : "text-[var(--fd-text3)] hover:text-[var(--fd-text2)] hover:bg-[var(--fd-surface3)]/50"
              )}
            >
              <span>🚫</span>
              <span>Kara Liste<span className="hidden sm:inline"> & Sorgu</span></span>
            </Button>
            <Button
              onClick={() => setActiveTab('analytics')}
              variant={activeTab === 'analytics' ? 'default' : 'ghost'}
              className={cn(
                "flex-1 sm:flex-none flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 h-auto py-2 sm:h-9 sm:py-0 text-xs font-bold rounded-[var(--fd-r-sm)] transition-all cursor-pointer text-center",
                activeTab === 'analytics'
                  ? "bg-[var(--fd-accent)] text-[#ffffff] shadow-[var(--fd-shadow-sm)]"
                  : "text-[var(--fd-text3)] hover:text-[var(--fd-text2)] hover:bg-[var(--fd-surface3)]/50"
              )}
            >
              <span>📊</span>
              <span>Analiz<span className="hidden sm:inline"> Paneli</span></span>
            </Button>
            <Button
              onClick={() => setActiveTab('temel')}
              variant={activeTab === 'temel' ? 'default' : 'ghost'}
              className={cn(
                "flex-1 sm:flex-none flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 h-auto py-2 sm:h-9 sm:py-0 text-xs font-bold rounded-[var(--fd-r-sm)] transition-all cursor-pointer text-center",
                activeTab === 'temel'
                  ? "bg-[var(--fd-accent)] text-[#ffffff] shadow-[var(--fd-shadow-sm)]"
                  : "text-[var(--fd-text3)] hover:text-[var(--fd-text2)] hover:bg-[var(--fd-surface3)]/50"
              )}
            >
              <span>🎓</span>
              <span><span className="hidden sm:inline">Personel </span>Temel Eğitim<span className="hidden sm:inline">i</span></span>
            </Button>
          </div>
        </div>

        {/* --- TAB 1: Kurumsal Eğitim Talepleri --- */}
        {activeTab === 'requests' && (
          <div className="space-y-4">
            <div className="flex items-center bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r-sm)] px-3.5 py-2">
              <Search className="w-4 h-4 text-[var(--fd-text3)] mr-2" />
              <input
                type="text"
                className="bg-transparent border-none outline-none text-[var(--fd-text)] placeholder-zinc-500 text-sm w-full"
                placeholder="Vatandaş adı, TC no, veya adresine göre egitim talebi arayın..."
                value={requestSearch}
                onChange={(e) => setRequestSearch(e.target.value)}
              />
            </div>

            <Card className="bg-[var(--fd-surface)] border border-[var(--fd-border)] overflow-hidden rounded-[var(--fd-r)]">
              <CardContent className="p-0">
                {trainingRequests.length === 0 ? (
                  <div className="text-center p-12 text-muted-foreground bg-[var(--fd-surface2)]/20">
                    Sistemde bekleyen veya işlenmiş bir kurumsal eğitim talebi bulunmamaktadır.
                  </div>
                ) : (
                  <>
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead>
                          <tr className="border-b border-[var(--fd-border)] bg-[var(--fd-surface2)]/30 text-[var(--fd-text3)] font-bold text-xs uppercase">
                            <th className="p-4">Talep Sahibi / Kurum</th>
                            <th className="p-4">Eğitim Türü</th>
                            <th className="p-4">Katılımcı / Tarih</th>
                            <th className="p-4">Görevli Ekip</th>
                            <th className="p-4">Durum</th>
                            <th className="p-4 text-right">Aksiyonlar</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--fd-border)]">
                          {trainingRequests.map(req => (
                            <tr key={req.id} className="hover:bg-[var(--fd-surface2)]/30 transition">
                              <td className="p-4">
                                <div className="font-bold text-[var(--fd-text)]">{req.basvuran_ad_soyad}</div>
                                <div className="text-[10px] text-[var(--fd-text3)] font-mono">TC: {req.basvuran_tc || 'Girilmemiş'}</div>
                              </td>
                              <td className="p-4 font-semibold text-[var(--fd-text2)]">
                                {req.isyeri_detaylari?.egitim_turu || req.talep_turu}
                              </td>
                              <td className="p-4 text-xs text-[var(--fd-text3)]">
                                <div className="font-bold">{req.isyeri_detaylari?.kisi_sayisi || 30} Kişi</div>
                                <div>Tarih: {req.isyeri_detaylari?.egitim_tarihi || 'Belirtilmemiş'}</div>
                              </td>
                              <td className="p-4 text-[var(--fd-text3)] font-medium text-xs">
                                {req.atanan_ekip || 'Atanmadı'}
                              </td>
                              <td className="p-4">
                                <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                  req.durum === 'ONAYLANDI' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-500' :
                                  req.durum === 'REDDEDİLDİ' ? 'bg-red-500/10 border border-red-500/20 text-red-400' :
                                  req.durum === 'EKİP_ATANDI' ? 'bg-blue-500/10 border border-blue-500/20 text-blue-400' :
                                  'bg-amber-500/10 border border-amber-500/20 text-amber-400'
                                }`}>
                                  {req.durum}
                                </span>
                              </td>
                              <td className="p-4 text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-[var(--fd-accent)] hover:text-[var(--fd-text)]"
                                  onClick={() => setSelectedRequest(req)}
                                >
                                  Detay / Karar
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobil list view */}
                    <div className="block md:hidden divide-y divide-[var(--fd-border)]">
                      {trainingRequests.map(req => (
                        <div key={req.id} className="p-4 space-y-3 hover:bg-[var(--fd-surface2)]/10">
                          <div className="flex items-start justify-between">
                            <div>
                              <span className="font-bold text-[var(--fd-text)] text-sm block">{req.basvuran_ad_soyad}</span>
                              <span className="text-[10px] text-[var(--fd-text3)] block">TC: {req.basvuran_tc}</span>
                            </div>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              req.durum === 'ONAYLANDI' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-500' :
                              req.durum === 'REDDEDİLDİ' ? 'bg-red-500/10 border border-red-500/20 text-red-400' :
                              req.durum === 'EKİP_ATANDI' ? 'bg-blue-500/10 border border-blue-500/20 text-blue-400' :
                              'bg-amber-500/10 border border-amber-500/20 text-amber-400'
                            }`}>
                              {req.durum}
                            </span>
                          </div>
                          <div className="text-xs text-[var(--fd-text3)]">
                            <strong>Eğitim:</strong> {req.isyeri_detaylari?.egitim_turu || req.talep_turu}
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-[var(--fd-text3)]">Kişi: {req.isyeri_detaylari?.kisi_sayisi || 30} | {req.isyeri_detaylari?.egitim_tarihi}</span>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 border-[var(--fd-border)] text-[var(--fd-text2)]"
                              onClick={() => setSelectedRequest(req)}
                            >
                              İncele
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* --- TAB 2: Saatli Teşkilat Programı --- */}
        {activeTab === 'calendar' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[var(--fd-surface)] border border-[var(--fd-border)] p-4 rounded-[var(--fd-r)] shadow-lg">
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 sm:flex-none justify-center border-[var(--fd-border)] text-[var(--fd-text2)] hover:text-[var(--fd-text)]"
                  onClick={handlePrevWeek}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" /> Önceki Hafta
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 sm:flex-none justify-center border-[var(--fd-border)] text-[var(--fd-text2)] hover:text-[var(--fd-text)] font-bold"
                  onClick={handleTodayWeek}
                >
                  Bu Hafta
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 sm:flex-none justify-center border-[var(--fd-border)] text-[var(--fd-text2)] hover:text-[var(--fd-text)]"
                  onClick={handleNextWeek}
                >
                  Sonraki Hafta <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
              <div className="text-[var(--fd-text)] font-extrabold text-sm sm:text-base w-full sm:w-auto text-center sm:text-left">
                📅 {formatDateLabel(daysOfWeek[0])} - {formatDateLabel(daysOfWeek[6])} {daysOfWeek[0].getFullYear()}
              </div>
              <div>
                <Button
                  className="bg-[var(--fd-accent)] hover:opacity-90 text-white font-bold text-xs px-3.5 py-2 h-9 rounded-[var(--fd-r-sm)] flex items-center gap-1.5 shadow-lg"
                  onClick={() => {
                    setEduForm({
                      id: '',
                      kurum_id: '',
                      kurum_adi: '',
                                telefon: '',
                                kurum_tipi: 'Isyeri',
                      egitim_turu: 'Yangın Önleme ve Temel Yangın Eğitimi',
                      kisi_sayisi: '20',
                      planlanan_tarih: getYYYYMMDD(new Date()),
                      saat_slot: '08:00 - 09:00',
                      egitimci_personel_ids: [],
                      durum: 'Beklemede',
                      mahalle: '',
                      yas_grubu: 'Yetişkin',
                      teorik_sure_dk: '45',
                      pratik_sure_dk: '45'
                    })
                    setBlacklistAcknowledged(false)
                    setIsProgramModalOpen(true)
                  }}
                >
                  <Plus className="w-4 h-4" /> Yeni Program Planla
                </Button>
              </div>
            </div>

            {/* Mobile Day Selector Tabs (Visible only on mobile/tablet, exactly fitting without scroll) */}
            <div className="grid md:hidden grid-cols-7 gap-1 bg-[var(--fd-surface2)] p-1 rounded-xl border border-[var(--fd-border)] shrink-0 mb-4">
              {daysOfWeek.map((day, idx) => {
                const isToday = getYYYYMMDD(day) === getYYYYMMDD(new Date())
                const isSelected = selectedMobileDayIdx === idx
                const shortDayName = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'][day.getDay()]
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedMobileDayIdx(idx)}
                    className={cn(
                      "w-full min-h-[38px] px-0.5 py-1 text-center rounded-[var(--fd-r-sm)] font-bold text-[10px] sm:text-[11px] cursor-pointer transition-all flex flex-col items-center justify-center gap-0.5",
                      isSelected
                        ? "bg-[var(--fd-accent)] text-white shadow-[var(--fd-shadow-sm)]"
                        : "text-[var(--fd-text3)] hover:bg-[var(--fd-surface3)]/50"
                    )}
                  >
                    <span className="opacity-75 text-[8px] sm:text-[9px] uppercase tracking-wider">{shortDayName}</span>
                    <span className="font-mono text-xs sm:text-sm">{day.getDate()}</span>
                    {isToday && !isSelected && <span className="w-1.5 h-1.5 rounded-full bg-[var(--fd-accent)] mt-0.5" />}
                  </button>
                )
              })}
            </div>

            {/* Mobile Timeline View (Visible only on mobile/tablet) */}
            <div className="md:hidden space-y-3.5 mb-4">
              {CALENDAR_SLOTS.map((slot) => {
                const activeDay = daysOfWeek[selectedMobileDayIdx]
                const dateStr = getYYYYMMDD(activeDay)
                const cellEdus = educations.filter(edu => {
                  const eduDateStr = getYYYYMMDD(new Date(edu.planlanan_tarih))
                  return eduDateStr === dateStr && edu.saat_slot === slot
                })

                return (
                  <div key={slot} className="border border-[var(--fd-border)] bg-[var(--fd-surface)] rounded-xl p-3 flex gap-3.5 items-start">
                    {/* Time Slot Label */}
                    <div className="w-20 shrink-0 font-mono font-bold text-[var(--fd-text3)] text-[10px] bg-[var(--fd-surface2)]/40 p-1 px-1.5 rounded border border-[var(--fd-border)] text-center">
                      {slot.split(" ")[0]}
                    </div>

                    {/* Planned Educations */}
                    <div className="flex-1 space-y-2">
                      {cellEdus.length === 0 ? (
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] text-[var(--fd-text3)] italic mt-1">Planlanmış program yok</p>
                          {isMudur && (
                            <button
                              onClick={() => {
                                setEduForm({
                                  id: '',
                                  kurum_id: '',
                                  kurum_adi: '',
                                telefon: '',
                                kurum_tipi: 'Isyeri',
                                  egitim_turu: 'Yangın Önleme ve Temel Yangın Eğitimi',
                                  kisi_sayisi: '20',
                                  planlanan_tarih: dateStr,
                                  saat_slot: slot,
                                  egitimci_personel_ids: [],
                                  durum: 'Beklemede',
                                  mahalle: '',
                                  yas_grubu: 'Yetişkin',
                                  teorik_sure_dk: '45',
                                  pratik_sure_dk: '45'
                                })
                                setBlacklistAcknowledged(false)
                                setIsProgramModalOpen(true)
                              }}
                              className="h-7 w-7 rounded-lg border border-dashed border-[var(--fd-border)] hover:border-[var(--fd-accent)] hover:bg-[var(--fd-surface2)] flex items-center justify-center text-[var(--fd-text3)] hover:text-[var(--fd-accent)] transition cursor-pointer"
                              title="Program Ekle"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ) : (
                        cellEdus.map(edu => {
                          const isBlacklisted = blacklistList.some(x => (x.kurum_adi.trim().toLowerCase() === edu.kurum_adi?.trim().toLowerCase() || x.id === edu.kurum_id) && x.aktif_durum)
                          return (
                            <div
                              key={edu.id}
                              onClick={() => {
                                setEduForm({
                                  id: edu.id,
                                  kurum_id: edu.kurum_id || '',
                                  kurum_adi: edu.kurum_adi || '',
                                telefon: edu.telefon || '',
                                kurum_tipi: edu.kurum_tipi || 'Isyeri',
                                  egitim_turu: edu.egitim_turu || 'Yangın Önleme ve Temel Yangın Eğitimi',
                                  kisi_sayisi: String(edu.kisi_sayisi || 20),
                                  planlanan_tarih: getYYYYMMDD(new Date(edu.planlanan_tarih)),
                                  saat_slot: edu.saat_slot,
                                  egitimci_personel_ids: edu.egitimci_personel_ids || [],
                                  durum: edu.durum,
                                  mahalle: edu.mahalle || '',
                                  yas_grubu: edu.yas_grubu || 'Yetişkin',
                                  teorik_sure_dk: String(edu.teorik_sure_dk || 0),
                                  pratik_sure_dk: String(edu.pratik_sure_dk || 0)
                                })
                                setBlacklistAcknowledged(false)
                                setIsProgramModalOpen(true)
                              }}
                              className={`p-2.5 rounded-lg border cursor-pointer hover:scale-[1.01] transition text-left space-y-1 ${
                                isBlacklisted ? 'bg-red-100 dark:bg-red-950/45 border-red-500/40 text-red-900 dark:text-red-200' :
                                edu.durum === 'Tamamlandı' ? 'bg-emerald-100 dark:bg-emerald-950/20 border-emerald-500/20 text-emerald-900 dark:text-emerald-500' :
                                edu.durum === 'Onaylandı' ? 'bg-blue-100 dark:bg-blue-950/30 border-blue-500/25 text-blue-900 dark:text-blue-400' :
                                'bg-amber-100 dark:bg-amber-950/30 border-amber-500/20 text-amber-900 dark:text-amber-400'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1.5 flex-wrap">
                                <span className="font-bold text-xs">{edu.kurum_adi}</span>
                                <span className="text-[9px] font-bold uppercase tracking-wider bg-black/20 px-1.5 py-0.5 rounded">
                                  {edu.durum}
                                </span>
                              </div>
                              <p className="text-[11px] opacity-90">{edu.egitim_turu}</p>
                              {isBlacklisted && <div className="text-[9px] bg-red-600 text-white px-1.5 py-0.5 rounded font-bold uppercase tracking-wider inline-block">KARA LİSTE</div>}
                              <div className="text-[10px] opacity-75 flex items-center justify-between gap-2 border-t border-white/5 pt-1 mt-1 font-mono">
                                <span>👥 {edu.kisi_sayisi} kişi • {edu.yas_grubu}</span>
                                <span>⏱️ {((Number(edu.teorik_sure_dk || 0) + Number(edu.pratik_sure_dk || 0)) / 60).toFixed(1)} sa</span>
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Desktop Matrix Table View (Visible only on desktop screens) */}
            <Card className="hidden md:block bg-[var(--fd-surface)] border border-[var(--fd-border)] overflow-hidden rounded-[var(--fd-r)]">
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full min-w-[1200px] border-collapse table-fixed">
                  <thead>
                    <tr className="border-b border-zinc-900 bg-[var(--fd-surface2)]/30 text-[var(--fd-text3)] font-bold text-xs uppercase h-14">
                      <th className="p-3 text-center border-r border-zinc-900/60 w-36">Saat Dilimi</th>
                      {daysOfWeek.map((day, idx) => {
                        const isToday = getYYYYMMDD(day) === getYYYYMMDD(new Date())
                        return (
                          <th key={idx} className={`p-3 text-center border-r border-zinc-900/60 ${isToday ? 'bg-indigo-950/20 text-[var(--fd-accent)] font-bold' : ''}`}>
                            <div className="text-[11px] font-bold opacity-75">{getDayName(day)}</div>
                            <div className="text-sm font-bold mt-0.5">{formatDateLabel(day)}</div>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--fd-border)] text-xs">
                    {CALENDAR_SLOTS.map((slot) => (
                      <tr key={slot} className="border-b border-zinc-900/80 min-h-[70px] hover:bg-[var(--fd-surface2)]/5 transition">
                        <td className="p-3 font-mono font-bold text-[var(--fd-text3)] border-r border-zinc-900/60 text-center bg-[var(--fd-surface2)]/10">
                          {slot}
                        </td>
                        {daysOfWeek.map((day, dIdx) => {
                          const dateStr = getYYYYMMDD(day)
                          const cellEdus = educations.filter(edu => {
                            const eduDateStr = getYYYYMMDD(new Date(edu.planlanan_tarih))
                            return eduDateStr === dateStr && edu.saat_slot === slot
                          })

                          return (
                            <td key={dIdx} className="p-2 border-r border-zinc-900/60 vertical-align-top relative group">
                              <div className="space-y-1.5 min-h-[50px] flex flex-col justify-center">
                                {cellEdus.map(edu => {
                                  // Check blacklist for red flag
                                  const isBlacklisted = blacklistList.some(x => (x.kurum_adi.trim().toLowerCase() === edu.kurum_adi?.trim().toLowerCase() || x.id === edu.kurum_id) && x.aktif_durum)
                                  return (
                                    <div
                                      key={edu.id}
                                      onClick={() => {
                                        setEduForm({
                                          id: edu.id,
                                          kurum_id: edu.kurum_id || '',
                                          kurum_adi: edu.kurum_adi || '',
                                telefon: edu.telefon || '',
                                kurum_tipi: edu.kurum_tipi || 'Isyeri',
                                          egitim_turu: edu.egitim_turu || 'Yangın Önleme ve Temel Yangın Eğitimi',
                                          kisi_sayisi: String(edu.kisi_sayisi || 20),
                                          planlanan_tarih: getYYYYMMDD(new Date(edu.planlanan_tarih)),
                                          saat_slot: edu.saat_slot,
                                          egitimci_personel_ids: edu.egitimci_personel_ids || [],
                                          durum: edu.durum,
                                          mahalle: edu.mahalle || '',
                                          yas_grubu: edu.yas_grubu || 'Yetişkin',
                                          teorik_sure_dk: String(edu.teorik_sure_dk || 0),
                                          pratik_sure_dk: String(edu.pratik_sure_dk || 0)
                                        })
                                        setBlacklistAcknowledged(false)
                                        setIsProgramModalOpen(true)
                                      }}
                                      className={`p-2 rounded-[var(--fd-r-sm)] border cursor-pointer hover:scale-[1.02] hover:shadow-md transition text-left space-y-1 ${
                                        isBlacklisted ? 'bg-red-100 dark:bg-red-950/45 border-red-500/40 text-red-900 dark:text-red-200' :
                                        edu.durum === 'Tamamlandı' ? 'bg-emerald-100 dark:bg-emerald-950/20 border-emerald-500/20 text-emerald-900 dark:text-emerald-500' :
                                        edu.durum === 'Onaylandı' ? 'bg-blue-100 dark:bg-blue-950/30 border-blue-500/25 text-blue-900 dark:text-blue-400' :
                                        'bg-amber-100 dark:bg-amber-950/20 border-amber-500/20 text-amber-900 dark:text-amber-400'
                                      }`}
                                    >
                                      <div className="font-bold flex items-center justify-between gap-1">
                                        <span className="line-clamp-1">{edu.kurum_adi}</span>
                                        {isBlacklisted && <span className="text-[9px] bg-red-600 dark:bg-red-500 text-white px-1 rounded font-semibold shrink-0">KARA LİSTE</span>}
                                      </div>
                                      <div className="text-[10px] opacity-75 line-clamp-1">{edu.egitim_turu}</div>
                                      <div className="flex items-center justify-between text-[9px] opacity-80 pt-0.5">
                                        <span>👥 {edu.kisi_sayisi} Kişi</span>
                                        <span>⏱️ {((Number(edu.teorik_sure_dk || 0) + Number(edu.pratik_sure_dk || 0)) / 60).toFixed(1)} sa</span>
                                      </div>
                                    </div>
                                  )
                                })}

                                {cellEdus.length === 0 && isMudur && (
                                  <button
                                    onClick={() => {
                                      setEduForm({
                                        id: '',
                                        kurum_id: '',
                                        kurum_adi: '',
                                telefon: '',
                                kurum_tipi: 'Isyeri',
                                        egitim_turu: 'Yangın Önleme ve Temel Yangın Eğitimi',
                                        kisi_sayisi: '20',
                                        planlanan_tarih: dateStr,
                                        saat_slot: slot,
                                        egitimci_personel_ids: [],
                                        durum: 'Beklemede',
                                        mahalle: '',
                                        yas_grubu: 'Yetişkin',
                                        teorik_sure_dk: '45',
                                        pratik_sure_dk: '45'
                                      })
                                      setBlacklistAcknowledged(false)
                                      setIsProgramModalOpen(true)
                                    }}
                                    className="w-full h-8 rounded-[var(--fd-r-sm)] border border-dashed border-[var(--fd-border)] hover:border-indigo-500/50 hover:bg-indigo-950/10 flex items-center justify-center text-[var(--fd-text3)] opacity-50 hover:text-[var(--fd-accent)] transition"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* --- TAB 3: Kara Liste ve Kurum Sorgu --- */}
        {activeTab === 'blacklist' && (
          <div className="space-y-6">
            
            {/* Kurum Sorgulama Paneli */}
            <Card className="bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] p-6 shadow-xl">
              <CardTitle className="text-base font-bold uppercase text-[var(--fd-text2)] border-b border-[var(--fd-border)] pb-3 flex items-center gap-2">
                <Search className="w-5 h-5 text-[var(--fd-accent)]" /> KURUMSAL RİSK / ENGEL SORGULAMA MOTORU
              </CardTitle>
              <div className="mt-4 flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  className="bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] px-4 py-2 text-sm focus:outline-none focus:border-[var(--fd-accent)] flex-1 font-semibold"
                  placeholder="Kurum Adı, Telefon veya Açıklama ile sorgulayın..."
                  value={queryTelefon}
                  onChange={(e) => setQueryTelefon(e.target.value)}
                />
                <Button
                  className="bg-[var(--fd-accent)] hover:opacity-90 text-white font-bold text-xs h-10 px-5 rounded-[var(--fd-r-sm)] flex items-center gap-1.5"
                  onClick={handleQueryBlacklist}
                >
                  Sorgula
                </Button>
              </div>

              {hasQueried && (
                <div className="mt-5 animate-in fade-in duration-200">
                  {queryResult ? (
                    queryResult.aktif_durum ? (
                      <div className="border border-red-500 bg-red-50 dark:bg-red-950/20 text-red-800 dark:text-red-200 p-4 rounded-[var(--fd-r-sm)] flex items-start gap-3 shadow-[0_0_15px_rgba(239,68,68,0.1)]">
                        <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-bold text-sm text-red-700 dark:text-red-400">⚠️ DİKKAT: KURUM KIRMIZI BÜLTEN KATEGORİSİNDEDİR!</h4>
                          <p className="text-xs text-red-700/80 dark:text-red-300/80 mt-1">
                            {queryResult.kurum_adi} (Telefon: {queryResult.telefon}) kurumu, son dakika iptalleri veya kurallara uymaması nedeniyle engellenmiştir.
                          </p>
                          <p className="text-xs font-mono text-red-700 dark:text-red-400 mt-2">
                            <strong>Kısıtlama Gerekçesi:</strong> {queryResult.gerekce || "Gerekçe belirtilmemiş."}
                          </p>
                          <p className="text-[10px] text-red-600 dark:text-red-500 mt-1">Yasaklama Tarihi: {new Date(queryResult.yasaklama_tarihi).toLocaleDateString('tr-TR')}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="border border-amber-500 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-200 p-4 rounded-[var(--fd-r-sm)] flex items-start gap-3">
                        <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-bold text-sm text-amber-700 dark:text-amber-400">Uyarılı Kurum (Aktif Engel Yok)</h4>
                          <p className="text-xs mt-1 text-amber-700/80 dark:text-amber-300/80">
                            {queryResult.kurum_adi} kurumu geçmişte listeye eklenmiş ancak şu an aktif engeli bulunmamaktadır.
                          </p>
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="border border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-200 p-4 rounded-[var(--fd-r-sm)] flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-500 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-bold text-sm text-emerald-700 dark:text-emerald-400">Temiz Sicil (Herhangi Bir Engel Yok)</h4>
                        <p className="text-xs mt-1 text-emerald-700/80 dark:text-emerald-300">
                          Verilen arama terimi ile eşleşen aktif bir idari engel bulunamamıştır. Eğitim faaliyet planı oluşturulabilir.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Kara Liste Oluşturma (Müdür) */}
              {isMudur && (
                <Card className="bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] p-5 shadow-xl space-y-4 h-fit">
                  <CardTitle className="text-sm font-semibold uppercase text-[var(--fd-text2)] border-b border-[var(--fd-border)] pb-2 flex items-center gap-1.5">
                    <Ban className="w-4.5 h-4.5 text-red-400" /> YENİ ENGEL EKLEME PANELİ
                  </CardTitle>
                  <form onSubmit={handleAddBlacklist} className="space-y-4 text-xs">
                    <div className="space-y-1">
                      <label className="text-[var(--fd-text3)] font-bold block">Kurum Adı <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] px-3 py-2 text-xs focus:outline-none focus:border-[var(--fd-accent)] font-semibold"
                        placeholder="Örn: X Fabrikası Sanayi Ltd."
                        value={blacklistForm.kurum_adi}
                        onChange={(e) => setBlacklistForm(prev => ({ ...prev, kurum_adi: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[var(--fd-text3)] font-bold block">Telefon Numarası <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] px-3 py-2 text-xs focus:outline-none focus:border-[var(--fd-accent)] font-medium"
                        placeholder="Örn: 0555 555 5555"
                        value={blacklistForm.telefon}
                        onChange={(e) => setBlacklistForm(prev => ({ ...prev, telefon: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[var(--fd-text3)] font-bold block">Kısıtlama / Engel İdari Gerekçesi</label>
                      <textarea
                        className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] p-3 text-xs focus:outline-none focus:border-[var(--fd-accent)] font-semibold"
                        rows={3}
                        placeholder="Eğitim saatinde personeli bekletme, haber vermeden son dakika iptali vb."
                        value={blacklistForm.gerekce}
                        onChange={(e) => setBlacklistForm(prev => ({ ...prev, gerekce: e.target.value }))}
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={isSavingBlacklist}
                      className="w-full bg-red-600 dark:bg-red-500 hover:opacity-90 text-white font-bold py-2 rounded-[var(--fd-r-sm)] flex items-center justify-center gap-1 shadow-lg shadow-red-600/10"
                    >
                      {isSavingBlacklist ? 'Kaydediliyor...' : 'Engellenenlere Ekle'}
                    </Button>
                  </form>
                </Card>
              )}

              {/* Kara Liste Listesi */}
              <div className="lg:col-span-2">
                <Card className="bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] overflow-hidden shadow-xl">
                  <div className="p-4 border-b border-[var(--fd-border)] bg-[var(--fd-surface2)]/10">
                    <CardTitle className="text-sm font-semibold uppercase text-[var(--fd-text2)]">
                      🚫 ENGELLENEN KURUMLAR VERİ TABANI ({blacklistList.length})
                    </CardTitle>
                  </div>
                  <CardContent className="p-0">
                    {blacklistList.length === 0 ? (
                      <div className="text-center p-8 text-[var(--fd-text3)] text-xs">
                        Sistemde kayıtlı uyarılı/engelli kurum bulunmamaktadır.
                      </div>
                    ) : (
                      <div className="divide-y divide-[var(--fd-border)]">
                        {blacklistList.map(bl => (
                          <div key={bl.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-[var(--fd-surface2)]/10 transition">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-[var(--fd-text)] text-sm">{bl.kurum_adi}</span>
                                <span className={`px-2 py-0.5 text-[9px] rounded font-semibold ${bl.aktif_durum ? 'bg-red-500/10 border border-red-500/20 text-red-400' : 'bg-zinc-800 text-[var(--fd-text3)]'}`}>
                                  {bl.aktif_durum ? 'AKTİF ENGEL' : 'Kaldırıldı'}
                                </span>
                              </div>
                              <div className="text-[var(--fd-text3)] font-mono text-[10px]">Telefon Numarası: {bl.telefon} &nbsp;|&nbsp; Tarih: {new Date(bl.yasaklama_tarihi).toLocaleDateString('tr-TR')}</div>
                              {bl.gerekce && <div className="text-[var(--fd-text3)] font-semibold bg-[var(--fd-surface2)]/50 p-2 rounded-[var(--fd-r-sm)] mt-1 border border-zinc-900">{bl.gerekce}</div>}
                            </div>
                            <div className="flex items-center gap-2 self-end sm:self-center">
                              {isMudur && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className={`h-8 border-[var(--fd-border)] text-[10px] font-bold ${bl.aktif_durum ? 'text-[var(--fd-text3)] hover:text-[var(--fd-text)]' : 'text-red-400 hover:text-[var(--fd-text)] hover:bg-red-600 dark:bg-red-500/10'}`}
                                    onClick={() => handleToggleBlacklist(bl.id, bl.aktif_durum)}
                                  >
                                    {bl.aktif_durum ? 'Engeli Pasife Al' : 'Engeli Aktifleştir'}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 text-red-500 hover:text-[var(--fd-text)] hover:bg-red-600 dark:bg-red-500/20"
                                    onClick={() => handleDeleteBlacklist(bl.id)}
                                  >
                                    Sil
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

            </div>

          </div>
        )}

        {/* --- TAB 4: Başkanlık Analiz Paneli --- */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <Card className="bg-[var(--fd-surface)] border border-[var(--fd-border)] p-4 rounded-[var(--fd-r-sm)] relative overflow-hidden group">
                <CardContent className="p-0 flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-xs text-[var(--fd-text3)] font-bold uppercase">Toplam Eğitim</span>
                    <h3 className="text-2xl font-bold text-[var(--fd-accent)]">{analyticsData.totalCount} Faaliyet</h3>
                  </div>
                  <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 text-[var(--fd-accent)] rounded-[var(--fd-r-sm)]">
                    <GraduationCap className="w-6 h-6" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-[var(--fd-surface)] border border-[var(--fd-border)] p-4 rounded-[var(--fd-r-sm)] relative overflow-hidden group">
                <CardContent className="p-0 flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-xs text-[var(--fd-text3)] font-bold uppercase">Eğitim Süresi</span>
                    <h3 className="text-2xl font-bold text-emerald-500">{analyticsData.totalHours} Saat</h3>
                  </div>
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-[var(--fd-r-sm)]">
                    <Clock className="w-6 h-6" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-[var(--fd-surface)] border border-[var(--fd-border)] p-4 rounded-[var(--fd-r-sm)] relative overflow-hidden group">
                <CardContent className="p-0 flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-xs text-[var(--fd-text3)] font-bold uppercase">Eğitilen Vatandaş</span>
                    <h3 className="text-2xl font-bold text-blue-400">{analyticsData.totalParticipants} Vatandaş</h3>
                  </div>
                  <div className="p-3 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-[var(--fd-r-sm)]">
                    <Users className="w-6 h-6" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-[var(--fd-surface)] border border-[var(--fd-border)] p-4 rounded-[var(--fd-r-sm)] relative overflow-hidden group">
                <CardContent className="p-0 flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-xs text-[var(--fd-text3)] font-bold uppercase">Bekleyen Başvuru</span>
                    <h3 className="text-2xl font-bold text-amber-400">{analyticsData.pendingCount} Başvuru</h3>
                  </div>
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-[var(--fd-r-sm)]">
                    <FileText className="w-6 h-6" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Graphs Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Kurum Tipi Dağılımı */}
              <Card className="bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] p-6 shadow-xl">
                <CardTitle className="text-sm font-semibold uppercase text-[var(--fd-text2)] border-b border-[var(--fd-border)] pb-3 flex items-center gap-1.5">
                  <Users className="w-4.5 h-4.5 text-[var(--fd-accent)]" /> KURUM TİPLERİNE GÖRE DAĞILIM
                </CardTitle>
                <div className="h-[250px] w-full mt-4 flex items-center justify-center">
                  {analyticsData.typeData.length === 0 ? (
                    <div className="text-[var(--fd-text3)] text-xs">Yeterli veri bulunmamaktadır.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={analyticsData.typeData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name} (${((percent || 0) * 100).toFixed(0)}%)`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {analyticsData.typeData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: 'var(--fd-surface2)', border: '1px solid var(--fd-border)', color: 'var(--fd-text)' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </Card>

              {/* Mahalle Dağılımı (Top 5) */}
              <Card className="bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] p-6 shadow-xl">
                <CardTitle className="text-sm font-semibold uppercase text-[var(--fd-text2)] border-b border-[var(--fd-border)] pb-3 flex items-center gap-1.5">
                  <BarChart3 className="w-4.5 h-4.5 text-[var(--fd-accent)]" /> EN ÇOK EĞİTİM VERİLEN TOP 5 MAHALLE
                </CardTitle>
                <div className="h-[250px] w-full mt-4">
                  {analyticsData.mahalleData.length === 0 ? (
                    <div className="text-[var(--fd-text3)] text-xs text-center pt-24">Yeterli veri bulunmamaktadır.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analyticsData.mahalleData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--fd-border)" />
                        <XAxis dataKey="name" stroke="var(--fd-text3)" style={{ fontSize: '10px' }} />
                        <YAxis stroke="var(--fd-text3)" style={{ fontSize: '10px' }} />
                        <Tooltip contentStyle={{ backgroundColor: 'var(--fd-surface2)', border: '1px solid var(--fd-border)', color: 'var(--fd-text)' }} />
                        <Bar dataKey="Adet" fill="var(--fd-accent)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </Card>

              {/* Aylık Eğitim Sayısı Trendi */}
              <Card className="bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] p-6 shadow-xl lg:col-span-2">
                <CardTitle className="text-sm font-semibold uppercase text-[var(--fd-text2)] border-b border-[var(--fd-border)] pb-3 flex items-center gap-1.5">
                  <Clock className="w-4.5 h-4.5 text-[var(--fd-accent)]" /> AYLIK EĞİTİM FAALİYET SAYILARI TRENDİ
                </CardTitle>
                <div className="h-[250px] w-full mt-4">
                  {analyticsData.monthlyData.length === 0 ? (
                    <div className="text-[var(--fd-text3)] text-xs text-center pt-24">Yeterli veri bulunmamaktadır.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={analyticsData.monthlyData}>
                        <defs>
                          <linearGradient id="colorEdu" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--fd-accent)" stopOpacity={0.4}/>
                            <stop offset="95%" stopColor="var(--fd-accent)" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--fd-border)" />
                        <XAxis dataKey="name" stroke="var(--fd-text3)" style={{ fontSize: '10px' }} />
                        <YAxis stroke="var(--fd-text3)" style={{ fontSize: '10px' }} />
                        <Tooltip contentStyle={{ backgroundColor: 'var(--fd-surface2)', border: '1px solid var(--fd-border)', color: 'var(--fd-text)' }} />
                        <Area type="monotone" dataKey="Eğitim Adeti" stroke="var(--fd-accent)" fillOpacity={1} fill="url(#colorEdu)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </Card>

            </div>

          </div>
        )}

        {/* --- TAB 5: Personel Temel Eğitimi --- */}
        {activeTab === 'temel' && (
          <div className="space-y-6">
            {/* Alt Sekmeler */}
            <div className="flex flex-wrap gap-2 border-b border-[var(--fd-border)] pb-3">
              <Button
                variant={temelSubTab === 'cizelge' ? 'default' : 'ghost'}
                className={`flex-1 sm:flex-none font-bold text-xs h-9 rounded-[var(--fd-r-sm)] justify-center text-center ${temelSubTab === 'cizelge' ? 'bg-[var(--fd-accent)] text-white' : 'text-[var(--fd-text3)]'}`}
                onClick={() => setTemelSubTab('cizelge')}
              >
                📊 Yıllık Eğitim Çizelgesi
              </Button>
              <Button
                variant={temelSubTab === 'mufredat' ? 'default' : 'ghost'}
                className={`flex-1 sm:flex-none font-bold text-xs h-9 rounded-[var(--fd-r-sm)] justify-center text-center ${temelSubTab === 'mufredat' ? 'bg-[var(--fd-accent)] text-white' : 'text-[var(--fd-text3)]'}`}
                onClick={() => setTemelSubTab('mufredat')}
              >
                📖 Eğitim Müfredatı
              </Button>
              <Button
                variant={temelSubTab === 'sertifika' ? 'default' : 'ghost'}
                className={`flex-1 sm:flex-none font-bold text-xs h-9 rounded-[var(--fd-r-sm)] justify-center text-center ${temelSubTab === 'sertifika' ? 'bg-[var(--fd-accent)] text-white' : 'text-[var(--fd-text3)]'}`}
                onClick={() => setTemelSubTab('sertifika')}
              >
                📜 Sertifika Basımı
              </Button>
            </div>

            {/* ALT SEKME 1: Yıllık Eğitim Çizelgesi */}
            {temelSubTab === 'cizelge' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                  <div className="flex flex-1 gap-2 w-full">
                    {/* Arama */}
                    <div className="flex items-center flex-1 bg-[var(--fd-surface2)]/40 border border-[var(--fd-border)] rounded-[var(--fd-r-sm)] px-3.5 py-2">
                      <Search className="w-4 h-4 text-[var(--fd-text3)] mr-2" />
                      <input
                        type="text"
                        className="bg-transparent border-none outline-none text-[var(--fd-text)] placeholder-zinc-500 text-sm w-full"
                        placeholder="Personel adına göre arayın..."
                        value={cizelgeSearch}
                        onChange={(e) => setCizelgeSearch(e.target.value)}
                      />
                    </div>
                    {/* Posta Filtresi */}
                    <select
                      className="bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text2)] rounded-[var(--fd-r-sm)] px-3 py-2 focus:outline-none focus:border-[var(--fd-accent)] font-semibold text-xs"
                      value={cizelgePostaFilter}
                      onChange={(e) => setCizelgePostaFilter(e.target.value)}
                    >
                      <option value="ALL">Tüm Postalar</option>
                      <option value="A">A Grubu</option>
                      <option value="B">B Grubu</option>
                      <option value="C">C Grubu</option>
                    </select>
                    {/* Başarı Barajı */}
                    <div className="flex items-center gap-1.5 bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text2)] rounded-[var(--fd-r-sm)] px-3.5 py-2 focus-within:border-indigo-500">
                      <span className="text-[10px] uppercase font-bold text-[var(--fd-text3)] tracking-wider whitespace-nowrap">Başarı Barajı:</span>
                      <input
                        type="number"
                        min="1"
                        max="1000"
                        className="bg-transparent border-none outline-none text-[var(--fd-text)] text-xs font-bold w-10 text-center"
                        value={basariSiniri}
                        onChange={(e) => {
                          const val = Math.max(1, Number(e.target.value) || 240);
                          setBasariSiniri(val);
                          setSertifikaSaat(String(val));
                        }}
                      />
                      <span className="text-[10px] text-[var(--fd-text3)] font-semibold">Saat</span>
                    </div>
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto justify-end">
                    <Button
                      variant="outline"
                      className="border-[var(--fd-border)] text-[var(--fd-text2)] hover:text-[var(--fd-text)] rounded-[var(--fd-r-sm)] text-xs font-bold gap-2"
                      onClick={handlePrintYillikCizelge}
                    >
                      <Printer className="w-4 h-4 text-[var(--fd-accent)]" /> PDF Rapor Çıktısı
                    </Button>
                  </div>
                </div>

                <DataTable
                  data={personnelList.filter(p => {
                    const matchSearch = normalizeTextForSearch(`${p.ad} ${p.soyad}`).includes(normalizeTextForSearch(cizelgeSearch)) || normalizeTextForSearch(p.sicil_no || '').includes(normalizeTextForSearch(cizelgeSearch));
                    const matchPosta = cizelgePostaFilter === 'ALL' || p.posta === cizelgePostaFilter;
                    return matchSearch && matchPosta;
                  })}
                  columns={cizelgeColumns}
                  emptyState="Eğitim çizelgesinde kayıtlı personel bulunmamaktadır."
                />
              </div>
            )}

            {/* ALT SEKME 2: Eğitim Müfredatı */}
            {temelSubTab === 'mufredat' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Müfredat Listesi (Sol/Orta) */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                    <div className="flex gap-2">
                      <select
                        className="bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text2)] rounded-[var(--fd-r-sm)] px-3 py-1.5 focus:outline-none focus:border-[var(--fd-accent)] font-semibold text-xs"
                        value={mufredatMonth}
                        onChange={(e) => setMufredatMonth(Number(e.target.value))}
                      >
                        {AY_ISIMLERI.map((name, index) => index > 0 && (
                          <option key={index} value={index}>{name}</option>
                        ))}
                      </select>
                      <select
                        className="bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text2)] rounded-[var(--fd-r-sm)] px-3 py-1.5 focus:outline-none focus:border-[var(--fd-accent)] font-semibold text-xs"
                        value={mufredatYear}
                        onChange={(e) => setMufredatYear(Number(e.target.value))}
                      >
                        {[2025, 2026, 2027].map(y => (
                          <option key={y} value={y}>{y} Yılı</option>
                        ))}
                      </select>
                    </div>
                    <Button
                      variant="outline"
                      className="border-[var(--fd-border)] text-[var(--fd-text2)] hover:text-[var(--fd-text)] rounded-[var(--fd-r-sm)] text-xs font-bold gap-2"
                      onClick={handlePrintAylikMufredat}
                    >
                      <Printer className="w-4 h-4 text-[var(--fd-accent)]" /> Müfredat PDF Yazdır
                    </Button>
                  </div>

                  {mufredatLoading ? (
                    <Card className="bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] p-8 text-center text-[var(--fd-text3)] font-semibold shadow-[var(--fd-shadow-sm)]">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-[var(--fd-accent)]" />
                      Müfredat Yükleniyor...
                    </Card>
                  ) : (
                    <DataTable
                      data={mufredatList}
                      columns={mufredatColumns}
                      emptyState={
                        <div className="flex flex-col items-center justify-center p-4">
                          <Info className="w-5 h-5 mx-auto mb-2 text-[var(--fd-text3)]" />
                          <span>Bu ay için eğitim müfredatı planlanmamış.</span>
                        </div>
                      }
                    />
                  )}
                </div>

                {/* Müfredat Formu (Sağ) */}
                <div>
                  {isMudur ? (
                    <Card className="bg-[var(--fd-surface2)]/40 border-[var(--fd-border)]/80 p-5 rounded-[var(--fd-r)] space-y-4">
                      <h3 className="text-sm font-bold text-[var(--fd-text)] uppercase tracking-wider flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-[var(--fd-accent)]" />
                        {mufredatEditRow ? "Müfredat Kaydını Düzenle" : "Yeni Müfredat Ekle"}
                      </h3>
                      <form onSubmit={handleSaveMufredat} className="space-y-4">
                        <div className="space-y-1.5">
                          <label className="text-[var(--fd-text3)] font-semibold block text-xs">Eğitim Tarihi</label>
                          <input
                            type="date"
                            className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] px-3 py-2 focus:outline-none focus:border-[var(--fd-accent)] font-medium text-xs"
                            value={mufredatForm.tarih}
                            onChange={(e) => setMufredatForm(prev => ({ ...prev, tarih: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[var(--fd-text3)] font-semibold block text-xs">Grup / Posta</label>
                          <select
                            className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] px-3 py-2 focus:outline-none focus:border-[var(--fd-accent)] font-semibold text-xs"
                            value={mufredatForm.posta}
                            onChange={(e) => setMufredatForm(prev => ({ ...prev, posta: e.target.value }))}
                          >
                            <option value="A">A Grubu</option>
                            <option value="B">B Grubu</option>
                            <option value="C">C Grubu</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[var(--fd-text3)] font-semibold block text-xs">Eğitim Konusu</label>
                          <textarea
                            rows={3}
                            placeholder="Eğitimin detaylı konusu..."
                            className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] px-3 py-2 focus:outline-none focus:border-[var(--fd-accent)] font-medium text-xs resize-none"
                            value={mufredatForm.egitim_konusu}
                            onChange={(e) => setMufredatForm(prev => ({ ...prev, egitim_konusu: e.target.value }))}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="submit"
                            disabled={isSavingMufredat}
                            className="flex-1 bg-[var(--fd-accent)] hover:opacity-90 text-white rounded-[var(--fd-r-sm)] text-xs font-bold"
                          >
                            {isSavingMufredat ? "Kaydediliyor..." : mufredatEditRow ? "Güncelle" : "Ekle"}
                          </Button>
                          {mufredatEditRow && (
                            <Button
                              type="button"
                              variant="ghost"
                              className="border border-[var(--fd-border)] text-[var(--fd-text3)] hover:text-[var(--fd-text)] rounded-[var(--fd-r-sm)] text-xs font-bold"
                              onClick={() => {
                                setMufredatEditRow(null);
                                setMufredatForm({ tarih: '', posta: 'A', egitim_konusu: '' });
                              }}
                            >
                              İptal
                            </Button>
                          )}
                        </div>
                      </form>
                    </Card>
                  ) : (
                    <Card className="bg-[var(--fd-surface2)]/20 border-[var(--fd-border)]/40 p-5 rounded-[var(--fd-r)] text-center">
                      <ShieldCheck className="w-8 h-8 text-[var(--fd-text3)] mx-auto mb-2" />
                      <h3 className="text-xs font-bold text-[var(--fd-text3)] uppercase">Yetki Kısıtlaması</h3>
                      <p className="text-[11px] text-[var(--fd-text3)] mt-1">Eğitim müfredatı planlama yetkisi sadece İtfaiye Müdürlüğü yetkililerine aittir.</p>
                    </Card>
                  )}
                </div>
              </div>
            )}

            {/* ALT SEKME 3: Sertifika Basımı */}
            {temelSubTab === 'sertifika' && (
              <Card className="bg-[var(--fd-surface2)]/40 border-[var(--fd-border)]/80 p-6 rounded-[var(--fd-r)] max-w-xl mx-auto space-y-6">
                <div className="text-center space-y-2">
                  <Award className="w-12 h-12 text-[var(--fd-accent)] mx-auto animate-bounce" />
                  <h3 className="text-lg font-bold text-[var(--fd-text)] uppercase tracking-wider">Temel İtfaiye Eğitimi Başarı Sertifikası</h3>
                  <p className="text-xs text-[var(--fd-text3)]">Yıllık {basariSiniri} saatlik temel itfaiye eğitimini tamamlayan personel için resmi sertifika baskı paneli.</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[var(--fd-text3)] font-semibold block text-xs">Sertifika Alacak Personel</label>
                    <select
                      className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] px-3 py-1.5 h-9 focus:outline-none focus:border-[var(--fd-accent)] font-semibold text-xs"
                      value={sertifikaPersonelId}
                      onChange={(e) => {
                        setSertifikaPersonelId(e.target.value);
                        const selected = personnelList.find(x => x.id === e.target.value);
                        if (selected) {
                          setSertifikaSaat(String(selected.temel_egitim_saati || basariSiniri));
                        }
                      }}
                    >
                      <option value="">-- Personel Seçiniz --</option>
                      {personnelList
                        .filter(p => (p.temel_egitim_saati || 0) >= basariSiniri)
                        .map(p => (
                          <option key={p.id} value={p.id}>
                            🏆 {p.ad} {p.soyad} ({p.temel_egitim_saati} Saat)
                          </option>
                        ))}
                    </select>
                    {sertifikaPersonelId && (
                      <p className="text-[10px] text-emerald-500 font-semibold mt-1">
                        ✓ Seçilen personel başarı sınırını ({basariSiniri} Saat) aşmıştır ve sertifika almaya hak kazanmıştır.
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[var(--fd-text3)] font-semibold block text-xs">Belgelenecek Eğitim Süresi (Saat)</label>
                    <input
                      type="number"
                      className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] px-3 py-2 focus:outline-none focus:border-[var(--fd-accent)] font-medium text-xs"
                      value={sertifikaSaat}
                      onChange={(e) => setSertifikaSaat(e.target.value)}
                    />
                  </div>

                  <Button
                    disabled={!sertifikaPersonelId}
                    className="w-full bg-emerald-600 dark:bg-emerald-500 hover:opacity-90 disabled:bg-[var(--fd-surface3)] disabled:text-[var(--fd-text3)] text-white rounded-[var(--fd-r-sm)] text-xs font-bold gap-2 py-2 h-9"
                    onClick={handlePrintSertifika}
                  >
                    <Award className="w-4 h-4" /> Sertifikayı PDF Olarak Bas ve İndir
                  </Button>
                </div>
              </Card>
            )}

            {/* Eğitim Saati Güncelleme Modalı */}
            {editingPersonel && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                <Card className="w-full max-w-md bg-[var(--fd-surface)] border border-[var(--fd-border)] shadow-2xl overflow-hidden rounded-[var(--fd-r)] animate-in zoom-in-95 duration-200">
                  <CardHeader className="bg-[var(--fd-surface2)]/40 border-b border-[var(--fd-border)]/80 p-4 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm font-bold text-[var(--fd-text)] flex items-center gap-2">
                      <Clock className="w-4 h-4 text-[var(--fd-accent)]" /> EĞİTİM SAATİ GÜNCELLE
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-[var(--fd-text3)] hover:text-[var(--fd-text)]"
                      onClick={() => setEditingPersonel(null)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </CardHeader>
                  <CardContent className="p-5 space-y-4">
                    <div className="bg-[var(--fd-surface2)]/50 p-3 rounded-[var(--fd-r-sm)] border border-[var(--fd-border)] text-xs space-y-1">
                      <p className="text-[var(--fd-text3)]">Personel: <span className="text-[var(--fd-text)] font-bold">{editingPersonel.ad} {editingPersonel.soyad}</span></p>
                      <p className="text-[var(--fd-text3)]">Sicil No: <span className="text-[var(--fd-text)] font-bold font-mono">{editingPersonel.sicil_no}</span></p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[var(--fd-text3)] font-semibold block text-xs">Mevcut Toplam Eğitim Saati (Yıllık)</label>
                      <input
                        type="number"
                        min={0}
                        className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] px-3 py-2 focus:outline-none focus:border-[var(--fd-accent)] font-medium text-xs"
                        value={newTrainingHours}
                        onChange={(e) => setNewTrainingHours(Number(e.target.value))}
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button
                        disabled={isUpdatingHours}
                        className="flex-1 bg-[var(--fd-accent)] hover:opacity-90 text-white rounded-[var(--fd-r-sm)] text-xs font-bold"
                        onClick={handleUpdateHours}
                      >
                        {isUpdatingHours ? "Güncelleniyor..." : "Kaydet"}
                      </Button>
                      <Button
                        variant="ghost"
                        className="border border-[var(--fd-border)] text-[var(--fd-text3)] hover:text-[var(--fd-text)] rounded-[var(--fd-r-sm)] text-xs font-bold"
                        onClick={() => setEditingPersonel(null)}
                      >
                        İptal
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}

        {/* --- CITIZEN REQUEST DETAIL & ACTION MODAL --- */}
        {selectedRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
            <Card className="w-full max-w-2xl bg-[var(--fd-surface)] border border-[var(--fd-border)] shadow-2xl overflow-hidden rounded-[var(--fd-r)] animate-in zoom-in-95 duration-200 my-auto">
              <CardHeader className="bg-[var(--fd-surface2)]/40 border-b border-[var(--fd-border)]/80 p-5 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2 font-bold text-[var(--fd-text)]">
                    <GraduationCap className="w-5 h-5 text-[var(--fd-accent)]" /> VATANDAŞ EĞİTİM TALEBİ DETAYLARI
                  </CardTitle>
                  <p className="text-xs text-[var(--fd-text3)] mt-1">Sivas Belediyesi İtfaiye Müdürlüğü Vatandaş Eğitim İnceleme Arayüzü</p>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-[var(--fd-text3)] hover:text-[var(--fd-text)]"
                  onClick={() => setSelectedRequest(null)}
                >
                  <X className="w-5 h-5" />
                </Button>
              </CardHeader>

              <CardContent className="p-6 space-y-5 max-h-[60vh] overflow-y-auto scrollbar-thin">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-xs text-[var(--fd-text3)] font-bold uppercase block">Başvuran Kurum / Kişi</span>
                    <span className="text-sm font-semibold text-[var(--fd-text)] block">{selectedRequest.basvuran_ad_soyad}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-[var(--fd-text3)] font-bold uppercase block">Vergi No / T.C. Kimlik</span>
                    <span className="text-sm font-semibold text-[var(--fd-text)] block">{selectedRequest.basvuran_tc || 'Girilmemiş'}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-[var(--fd-text3)] font-bold uppercase block">İrtibat Telefonu</span>
                    <span className="text-sm font-semibold text-[var(--fd-text)] block">{selectedRequest.irtibat_tel}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-[var(--fd-text3)] font-bold uppercase block">Talep Tarihi</span>
                    <span className="text-sm font-semibold text-[var(--fd-text)] block">
                      {new Date(selectedRequest.basvuru_tarihi).toLocaleString('tr-TR')}
                    </span>
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <span className="text-xs text-[var(--fd-text3)] font-bold uppercase block">Eğitim Talep Edilen Adres</span>
                    <span className="text-sm font-semibold text-[var(--fd-text)] block">{selectedRequest.adres}</span>
                  </div>
                </div>

                {/* Eğitim Detayları */}
                {selectedRequest.isyeri_detaylari && (
                  <div className="bg-indigo-500/5 border border-indigo-500/10 p-4 rounded-[var(--fd-r-sm)] space-y-2">
                    <h4 className="text-xs font-semibold text-[var(--fd-accent)] uppercase tracking-wider border-b border-indigo-500/10 pb-1 flex items-center gap-1.5">
                      <GraduationCap className="w-3.5 h-3.5" /> Talep Edilen Eğitim Detayları
                    </h4>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[var(--fd-text3)] block">Eğitim Türü:</span>
                        <span className="font-bold text-[var(--fd-text2)]">{selectedRequest.isyeri_detaylari.egitim_turu || 'Temel Yangın Eğitimi'}</span>
                      </div>
                      <div>
                        <span className="text-[var(--fd-text3)] block">Planlanan Tarih:</span>
                        <span className="font-bold text-[var(--fd-text2)]">{selectedRequest.isyeri_detaylari.egitim_tarihi || 'Belirtilmemiş'}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-[var(--fd-text3)] block">Tahmini Katılımcı Sayısı:</span>
                        <span className="font-bold text-[var(--fd-text2)]">{selectedRequest.isyeri_detaylari.kisi_sayisi || 30} Kişi</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Karar / Amir Audit Trail */}
                {selectedRequest.islem_yapan_amir && (
                  <div className="bg-[var(--fd-surface2)] border border-[var(--fd-border)] p-4 rounded-[var(--fd-r-sm)] space-y-1.5 text-xs">
                    <div className="flex items-center justify-between text-[var(--fd-text3)] font-semibold">
                      <span>İŞLEM YAPAN YETKİLİ</span>
                      <span>{selectedRequest.islem_tarihi ? new Date(selectedRequest.islem_tarihi).toLocaleString('tr-TR') : ''}</span>
                    </div>
                    <div className="text-[var(--fd-text2)] font-bold">
                      {selectedRequest.islem_yapan_amir}
                    </div>
                    {selectedRequest.red_gerekcesi && (
                      <div className="bg-red-950/20 border border-red-500/10 p-2.5 rounded-[var(--fd-r-sm)] text-red-400 mt-2 font-mono">
                        <span className="font-bold block text-[10px] uppercase text-red-500 mb-0.5">RED GEREKÇESİ:</span>
                        {selectedRequest.red_gerekcesi}
                      </div>
                    )}
                  </div>
                )}

                {/* Sub-Action Panels */}
                {tacticalMode === 'RED' && (
                  <div className="bg-red-950/20 border border-red-500/30 p-4 rounded-[var(--fd-r-sm)] space-y-3">
                    <label className="text-xs font-bold text-red-400 block">RED GEREKÇESİNİ YAZIN <span className="text-red-500">*</span></label>
                    <textarea
                      className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] rounded-[var(--fd-r-sm)] p-3 text-sm text-[var(--fd-text)] placeholder-zinc-600 focus:outline-none focus:border-red-500 font-semibold"
                      rows={3}
                      placeholder="Gerekçe girin..."
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        className="border-[var(--fd-border)] text-[var(--fd-text3)] text-xs px-3 py-1.5 h-8 font-semibold"
                        onClick={() => setTacticalMode('NONE')}
                      >
                        İptal
                      </Button>
                      <Button
                        className="bg-red-600 dark:bg-red-500 hover:opacity-90 text-white text-xs px-3.5 py-1.5 h-8 font-bold flex items-center gap-1"
                        onClick={() => handleTacticalAction(selectedRequest.id, 'REDDEDİLDİ', { reason: rejectionReason })}
                      >
                        Reddet
                      </Button>
                    </div>
                  </div>
                )}

                {tacticalMode === 'EKIP' && (
                  <div className="bg-blue-950/20 border border-blue-500/30 p-4 rounded-[var(--fd-r-sm)] space-y-3">
                    <label className="text-xs font-bold text-blue-400 block">GÖREVLENDİRİLECEK EKİBİ SEÇİN <span className="text-red-500">*</span></label>
                    <select
                      className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--fd-accent)] font-semibold"
                      value={selectedCrew}
                      onChange={(e) => setSelectedCrew(e.target.value)}
                    >
                      <option value="Eğitim & Önleme Şefliği">Eğitim & Önleme Şefliği</option>
                      <option value="Merkez İstasyonu A Grubu">Merkez İstasyonu A Grubu</option>
                      <option value="OSB İstasyonu Eğitim Grubu">OSB İstasyonu Eğitim Grubu</option>
                    </select>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        className="border-[var(--fd-border)] text-[var(--fd-text3)] text-xs px-3 py-1.5 h-8 font-semibold"
                        onClick={() => setTacticalMode('NONE')}
                      >
                        İptal
                      </Button>
                      <Button
                        className="bg-blue-600 dark:bg-blue-500 hover:opacity-90 text-white text-xs px-3.5 py-1.5 h-8 font-bold flex items-center gap-1"
                        onClick={() => handleTacticalAction(selectedRequest.id, 'EKİP_ATANDI', { crew: selectedCrew })}
                      >
                        Ekip Ata
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>

              <div className="bg-[var(--fd-surface2)]/40 border-t border-[var(--fd-border)]/80 p-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {isMudur && (
                    <Button
                      variant="ghost"
                      className="text-red-500 hover:text-[var(--fd-text)] hover:bg-red-600 dark:bg-red-500/10 text-xs font-bold px-3 py-2 h-9 rounded-[var(--fd-r-sm)] flex items-center gap-1.5"
                      disabled={updating !== null}
                      onClick={() => handleDeleteRequest(selectedRequest.id)}
                    >
                      <Trash2 className="w-4 h-4" /> Sil
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <Button 
                    variant="outline" 
                    className="border-[var(--fd-border)] text-[var(--fd-text2)] hover:text-[var(--fd-text)] hover:bg-[var(--fd-surface3)]/50 font-semibold px-4 py-2 h-9 rounded-[var(--fd-r-sm)] text-xs"
                    onClick={() => setSelectedRequest(null)}
                  >
                    Kapat
                  </Button>

                  {/* Place on Calendar Integration */}
                  {selectedRequest.durum === 'ONAYLANDI' && (
                    <Button
                      className="bg-[var(--fd-accent)] hover:opacity-90 text-white font-bold px-4 py-2 h-9 rounded-[var(--fd-r-sm)] flex items-center gap-1"
                      onClick={() => {
                        const tc = selectedRequest.basvuran_tc;
                        const matchBlacklist = blacklistList.find(x => x.telefon === tc);
                        
                        setEduForm({
                          id: '',
                          kurum_id: matchBlacklist ? matchBlacklist.id : '',
                          kurum_adi: selectedRequest.basvuran_ad_soyad,
                          telefon: selectedRequest.irtibat_tel || '',
                          kurum_tipi: 'Isyeri',
                          egitim_turu: selectedRequest.isyeri_detaylari?.egitim_turu || 'Yangın Önleme ve Temel Yangın Eğitimi',
                          kisi_sayisi: String(selectedRequest.isyeri_detaylari?.kisi_sayisi || 30),
                          planlanan_tarih: selectedRequest.isyeri_detaylari?.egitim_tarihi || getYYYYMMDD(new Date()),
                          saat_slot: '10:30 - 11:15',
                          egitimci_personel_ids: [],
                          durum: 'Onaylandı',
                          mahalle: 'Merkez',
                          yas_grubu: 'Yetişkin',
                          teorik_sure_dk: '45',
                          pratik_sure_dk: '45'
                        })
                        setBlacklistAcknowledged(false)
                        setSelectedRequest(null)
                        setActiveTab('calendar')
                        setIsProgramModalOpen(true)
                      }}
                    >
                      Takvime Yerleştir
                    </Button>
                  )}

                  {isMudur && selectedRequest.durum !== 'ONAYLANDI' && selectedRequest.durum !== 'REDDEDİLDİ' && (
                    <>
                      <Button
                        className="bg-red-600 dark:bg-red-500 hover:opacity-90 text-white font-bold px-4 py-2 h-9 rounded-[var(--fd-r-sm)] flex items-center gap-1"
                        disabled={updating !== null || tacticalMode === 'RED'}
                        onClick={() => setTacticalMode('RED')}
                      >
                        Reddet
                      </Button>
                      <Button
                        className="bg-blue-600 dark:bg-blue-500 hover:opacity-90 text-white font-bold px-4 py-2 h-9 rounded-[var(--fd-r-sm)] flex items-center gap-1"
                        disabled={updating !== null || tacticalMode === 'EKIP'}
                        onClick={() => setTacticalMode('EKIP')}
                      >
                        Ekip Ata
                      </Button>
                      <Button
                        className="bg-emerald-600 dark:bg-emerald-500 hover:opacity-90 text-white font-bold px-4 py-2 h-9 rounded-[var(--fd-r-sm)] flex items-center gap-1 shadow-md"
                        disabled={updating !== null}
                        onClick={() => handleTacticalAction(selectedRequest.id, 'ONAYLANDI')}
                      >
                        {updating === selectedRequest.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Talebi Onayla'}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* --- EDUCATION PROGRAM EDIT / NEW MODAL --- */}
        {isProgramModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
            <Card className="w-full max-w-2xl bg-[var(--fd-surface)] border border-[var(--fd-border)] shadow-[0_4px_30px_rgba(0,0,0,0.4)] overflow-hidden rounded-[var(--fd-r)] animate-in zoom-in-95 duration-200 my-auto">
              <CardHeader className="bg-[var(--fd-surface2)]/40 border-b border-[var(--fd-border)]/80 p-5 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2 font-bold text-[var(--fd-text)]">
                    <Calendar className="w-5 h-5 text-[var(--fd-accent)]" /> {eduForm.id ? 'PROGRAM DETAY & DÜZENLEME' : 'YENİ EĞİTİM / ZİYARET PROGRAMLA'}
                  </CardTitle>
                  <p className="text-xs text-[var(--fd-text3)] mt-1">Sivas İtfaiyesi Eğitim ve Ziyaret Program Planlama Sistemi</p>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-[var(--fd-text3)] hover:text-[var(--fd-text)]"
                  onClick={() => setIsProgramModalOpen(false)}
                >
                  <X className="w-5 h-5" />
                </Button>
              </CardHeader>
              
              <form onSubmit={handleSaveEducation}>
                <CardContent className="p-6 space-y-6 max-h-[60vh] overflow-y-auto scrollbar-thin">
                  
                  {/* Blacklist Warning */}
                  {activeBlacklistedInst && (
                    <div className="space-y-4 my-2">
                      <div className="border border-red-500/50 bg-red-950/35 text-red-200 p-4 rounded-[var(--fd-r-sm)] shadow-[0_0_15px_rgba(239,68,68,0.2)] animate-pulse flex flex-col gap-2">
                        <span className="font-bold text-xs sm:text-sm block">
                          ⚠️ RISK ALERTI: Bu kurum/vergi no kara listededir! Yasaklama Gerekçesi: {activeBlacklistedInst.gerekce}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 bg-red-950/10 border border-red-500/10 p-3 rounded-[var(--fd-r-sm)]">
                        <input
                          type="checkbox"
                          id="blacklist-acknowledge"
                          checked={blacklistAcknowledged}
                          onChange={(e) => setBlacklistAcknowledged(e.target.checked)}
                          className="w-4 h-4 rounded border-red-500/40 text-red-600 focus:ring-red-500 bg-[var(--fd-surface2)] cursor-pointer"
                        />
                        <label htmlFor="blacklist-acknowledge" className="text-xs font-semibold text-red-300 cursor-pointer select-none">
                          Kara Liste Uyarısını Okudum ve Onaylıyorum
                        </label>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    
                    {/* Kurum Adı */}
                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="text-[var(--fd-text3)] font-bold block">Eğitim Alacak Kurum / Grup Adı <span className="text-red-500">*</span></label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          required
                          disabled={!isMudur}
                          className="flex-1 bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] px-3.5 py-2 focus:outline-none focus:border-[var(--fd-accent)] font-semibold disabled:opacity-50"
                          placeholder="Örn: Organize Sanayi Fabrikası veya okul adı"
                          value={eduForm.kurum_adi}
                          onChange={(e) => setEduForm(prev => ({ ...prev, kurum_adi: e.target.value }))}
                        />
                        <select
                          disabled={!isMudur}
                          className="w-48 bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text2)] rounded-[var(--fd-r-sm)] px-2 py-2 focus:outline-none focus:border-[var(--fd-accent)] font-semibold disabled:opacity-50"
                          value={eduForm.kurum_id || ''}
                          onChange={(e) => {
                            const val = e.target.value
                            const match = blacklistList.find(x => x.id === val)
                            setEduForm(prev => ({
                              ...prev,
                              kurum_id: val,
                              kurum_adi: match ? match.kurum_adi : prev.kurum_adi
                            }))
                          }}
                        >
                          <option value="">Kayıtlı Kurum Seç...</option>
                          {blacklistList.filter(x => !x.aktif_durum).map(x => (
                            <option key={x.id} value={x.id}>{x.kurum_adi}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Telefon Numarası */}
                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="text-[var(--fd-text3)] font-bold block">İletişim / Telefon Numarası</label>
                      <input
                        disabled={!isMudur}
                        type="text"
                        className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] px-3 py-2 focus:outline-none focus:border-[var(--fd-accent)] font-semibold disabled:opacity-50"
                        placeholder="Örn: 0555 555 5555"
                        value={eduForm.telefon || ''}
                        onChange={(e) => setEduForm(prev => ({ ...prev, telefon: e.target.value }))}
                      />
                    </div>

                    {/* Kurum Tipi */}
                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="text-[var(--fd-text3)] font-bold block">Kurum Sınıflandırma Tipi <span className="text-red-500">*</span></label>
                      <select
                        disabled={!isMudur}
                        className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] px-3 py-2 focus:outline-none focus:border-[var(--fd-accent)] font-semibold disabled:opacity-50"
                        value={eduForm.kurum_tipi}
                        onChange={(e) => setEduForm(prev => ({ ...prev, kurum_tipi: e.target.value }))}
                      >
                        <option value="Isyeri">İşyeri</option>
                        <option value="Okul">Okul</option>
                        <option value="Kamu Kurumu">Kamu Kurumu</option>
                        <option value="Itfaiye Ziyaret">İtfaiye Ziyaret (Merkez Tesis Tanıtımı)</option>
                        <option value="Ev-Site">Ev-Site sakinleri</option>
                        <option value="Ekip Egitimi">Dahili Ekip Eğitimi / Tatbikatı</option>
                      </select>
                    </div>

                    {/* Eğitim Türü */}
                    <div className="space-y-1.5">
                      <label className="text-[var(--fd-text3)] font-bold block">Eğitim / Tatbikat Kapsamı</label>
                      <select
                        disabled={!isMudur}
                        className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] px-3 py-2 focus:outline-none focus:border-[var(--fd-accent)] font-semibold disabled:opacity-50"
                        value={eduForm.egitim_turu}
                        onChange={(e) => setEduForm(prev => ({ ...prev, egitim_turu: e.target.value }))}
                      >
                        <option value="Yangın Önleme ve Temel Yangın Eğitimi">Yangın Önleme ve Temel Yangın Eğitimi</option>
                        <option value="SCBA Maske ve Temiz Hava Cihazı Eğitimi">SCBA Maske ve Temiz Hava Cihazı Eğitimi</option>
                        <option value="Arama Kurtarma ve Tahliye Tatbikatı">Arama Kurtarma ve Tahliye Tatbikatı</option>
                        <option value="Endüstriyel Yangın Güvenliği Eğitimi">Endüstriyel Yangın Güvenliği Eğitimi</option>
                        <option value="Dahili Teşkilat Eğitimi / Tatbikatı">Dahili Teşkilat Eğitimi / Tatbikatı</option>
                      </select>
                    </div>

                    {/* Kişi Sayısı */}
                    <div className="space-y-1.5">
                      <label className="text-[var(--fd-text3)] font-bold block">Katılımcı Sayısı</label>
                      <input
                        type="number"
                        min={1}
                        disabled={!isMudur}
                        className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] px-3 py-2 focus:outline-none focus:border-[var(--fd-accent)] font-medium disabled:opacity-50"
                        value={eduForm.kisi_sayisi}
                        onChange={(e) => setEduForm(prev => ({ ...prev, kisi_sayisi: e.target.value }))}
                      />
                    </div>

                    {/* Tarih */}
                    <div className="space-y-1.5">
                      <label className="text-[var(--fd-text3)] font-bold block">Planlanan Tarih</label>
                      <input
                        type="date"
                        disabled={!isMudur}
                        className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] px-3 py-2 focus:outline-none focus:border-[var(--fd-accent)] font-semibold disabled:opacity-50"
                        value={eduForm.planlanan_tarih}
                        onChange={(e) => setEduForm(prev => ({ ...prev, planlanan_tarih: e.target.value }))}
                      />
                    </div>

                    {/* Saat Dilimi */}
                    <div className="space-y-1.5">
                      <label className="text-[var(--fd-text3)] font-bold block">Saat Dilimi</label>
                      <select
                        disabled={!isMudur}
                        className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] px-3 py-2 focus:outline-none focus:border-[var(--fd-accent)] font-semibold disabled:opacity-50"
                        value={eduForm.saat_slot}
                        onChange={(e) => setEduForm(prev => ({ ...prev, saat_slot: e.target.value }))}
                      >
                        {CALENDAR_SLOTS.map(slot => (
                          <option key={slot} value={slot}>{slot}</option>
                        ))}
                      </select>
                    </div>

                    {/* Mahalle */}
                    <div className="space-y-1.5">
                      <label className="text-[var(--fd-text3)] font-bold block">Eğitim Bölgesi / Mahalle</label>
                      <input
                        type="text"
                        disabled={!isMudur}
                        className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] px-3 py-2 focus:outline-none focus:border-[var(--fd-accent)] font-medium disabled:opacity-50"
                        placeholder="Örn: Esentepe"
                        value={eduForm.mahalle}
                        onChange={(e) => setEduForm(prev => ({ ...prev, mahalle: e.target.value }))}
                      />
                    </div>

                    {/* Yaş Grubu */}
                    <div className="space-y-1.5">
                      <label className="text-[var(--fd-text3)] font-bold block">Yaş Grubu</label>
                      <select
                        disabled={!isMudur}
                        className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] px-3 py-2 focus:outline-none focus:border-[var(--fd-accent)] font-semibold disabled:opacity-50"
                        value={eduForm.yas_grubu}
                        onChange={(e) => setEduForm(prev => ({ ...prev, yas_grubu: e.target.value }))}
                      >
                        <option value="Yetişkin">Yetişkin</option>
                        <option value="Genç">Genç</option>
                        <option value="Çocuk">Çocuk</option>
                        <option value="Karışık">Karışık</option>
                      </select>
                    </div>

                    {/* Süre Bilgileri */}
                    <div className="space-y-1.5">
                      <label className="text-[var(--fd-text3)] font-bold block">Teorik Eğitim Süresi (Dakika)</label>
                      <input
                        type="number"
                        min={0}
                        disabled={!isMudur}
                        className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] px-3 py-2 focus:outline-none focus:border-[var(--fd-accent)] font-medium disabled:opacity-50"
                        value={eduForm.teorik_sure_dk}
                        onChange={(e) => setEduForm(prev => ({ ...prev, teorik_sure_dk: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[var(--fd-text3)] font-bold block">Pratik / Tatbikat Süresi (Dakika)</label>
                      <input
                        type="number"
                        min={0}
                        disabled={!isMudur}
                        className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] px-3 py-2 focus:outline-none focus:border-[var(--fd-accent)] font-medium disabled:opacity-50"
                        value={eduForm.pratik_sure_dk}
                        onChange={(e) => setEduForm(prev => ({ ...prev, pratik_sure_dk: e.target.value }))}
                      />
                    </div>

                    {/* Toplam Süre */}
                    <div className="space-y-1.5 sm:col-span-2 bg-indigo-950/20 border border-indigo-900/30 p-3 rounded-[var(--fd-r-sm)] flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-indigo-300 block">Toplam Hesaplanan Süre</span>
                        <span className="text-[10px] text-[var(--fd-text3)]">Teorik ve pratik sürelerin saat cinsinden toplamı</span>
                      </div>
                      <span className="text-base font-bold text-[var(--fd-accent)] font-mono">
                        {((Number(eduForm.teorik_sure_dk || 0) + Number(eduForm.pratik_sure_dk || 0)) / 60).toFixed(2)} Saat
                      </span>
                    </div>

                    {/* Onay Durumu */}
                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="text-[var(--fd-text3)] font-bold block">Program Durumu</label>
                      <select
                        disabled={!isMudur}
                        className="w-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text)] rounded-[var(--fd-r-sm)] px-3 py-2 focus:outline-none focus:border-[var(--fd-accent)] font-semibold disabled:opacity-50"
                        value={eduForm.durum}
                        onChange={(e) => setEduForm(prev => ({ ...prev, durum: e.target.value }))}
                      >
                        <option value="Beklemede">Beklemede (Onay Bekliyor)</option>
                        <option value="Onaylandı">Onaylandı (Programlı)</option>
                        <option value="Tamamlandı">Tamamlandı (Eğitim Bitti)</option>
                        <option value="İptal">İptal Edildi</option>
                      </select>
                    </div>

                    {/* Çoklu Eğitmen Seçimi */}
                    <div className="space-y-2 sm:col-span-2">
                      <label className="text-[var(--fd-text3)] font-bold block uppercase tracking-wider">Görevli Eğitmen / Personel Seçimi</label>
                      <div className="bg-[var(--fd-surface2)]/50 border border-[var(--fd-border)] rounded-[var(--fd-r-sm)] p-3 max-h-40 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2 scrollbar-thin">
                        {personnelList.map(p => {
                          const isChecked = eduForm.egitimci_personel_ids.includes(p.id) || eduForm.egitimci_personel_ids.includes(p.sicil_no)
                          return (
                            <label key={p.id} className="flex items-center gap-2.5 p-2 rounded-[var(--fd-r-sm)] hover:bg-[var(--fd-surface2)] cursor-pointer select-none transition">
                              <input
                                type="checkbox"
                                disabled={!isMudur}
                                className="rounded bg-[var(--fd-surface2)] border-[var(--fd-border)] text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setEduForm(prev => ({
                                      ...prev,
                                      egitimci_personel_ids: [...prev.egitimci_personel_ids, p.id]
                                    }))
                                  } else {
                                    setEduForm(prev => ({
                                      ...prev,
                                      egitimci_personel_ids: prev.egitimci_personel_ids.filter(id => id !== p.id && id !== p.sicil_no)
                                    }))
                                  }
                                }}
                              />
                              <div className="text-xs font-semibold text-[var(--fd-text)]">
                                {p.ad} {p.soyad} <span className="text-[10px] text-[var(--fd-text3)]">({p.unvan || 'Er'})</span>
                              </div>
                            </label>
                          )
                        })}
                      </div>
                    </div>

                  </div>
                </CardContent>

                <div className="bg-[var(--fd-surface2)]/40 border-t border-[var(--fd-border)]/80 p-5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {eduForm.id && isMudur && (
                      <Button
                        type="button"
                        className="bg-red-600 dark:bg-red-500 hover:opacity-90 text-white font-bold text-xs px-3.5 py-2 h-9 rounded-[var(--fd-r-sm)] flex items-center gap-1.5"
                        onClick={() => handleDeleteEducation(eduForm.id)}
                      >
                        <Trash2 className="w-4 h-4" /> Sil
                      </Button>
                    )}
                    {eduForm.id && (
                      <Button
                        type="button"
                        className="bg-[var(--fd-accent)]/10 hover:bg-[var(--fd-accent)]/25 border border-indigo-500/20 text-[var(--fd-accent)] font-bold text-xs px-3.5 py-2 h-9 rounded-[var(--fd-r-sm)] flex items-center gap-1.5"
                        onClick={() => handlePrintClick(eduForm)}
                      >
                        <Printer className="w-4 h-4" /> Resmi Rapor Bas
                      </Button>
                    )}
                  </div>
                  
                  <div className="flex gap-2 text-xs">
                    <Button 
                      type="button"
                      variant="outline" 
                      className="border-[var(--fd-border)] text-[var(--fd-text2)] hover:text-[var(--fd-text)] hover:bg-[var(--fd-surface3)]/50 font-semibold px-4 py-2 h-9 rounded-[var(--fd-r-sm)] text-xs"
                      onClick={() => setIsProgramModalOpen(false)}
                    >
                      İptal
                    </Button>
                    {isMudur && (
                      <Button 
                        type="button"
                        className="bg-[var(--fd-accent)] hover:opacity-90 text-white font-bold px-4 py-2 h-9 rounded-[var(--fd-r-sm)] flex items-center gap-1.5 shadow-md"
                        disabled={isSavingEdu || (activeBlacklistedInst !== null && !blacklistAcknowledged)}
                        onClick={handleSaveEducation}
                      >
                        {isSavingEdu ? 'Kaydediliyor...' : 'Kaydet'}
                      </Button>
                    )}
                  </div>
                </div>
              </form>
            </Card>
          </div>
        )}

      </div>
    </PageGuard>
  )
}
