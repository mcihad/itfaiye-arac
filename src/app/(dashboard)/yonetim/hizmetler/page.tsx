"use client"

import { useState, useEffect } from "react"
import { api } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { useAuthStore } from "@/lib/authStore"
import PageGuard from "@/components/PageGuard"
import { 
  Loader2, 
  FileText, 
  CheckCircle, 
  Clock, 
  MapPin, 
  User, 
  Phone, 
  Info,
  Brush,
  ShieldCheck,
  GraduationCap,
  CreditCard,
  UserCheck,
  Building,
  Calendar,
  HelpCircle
} from "lucide-react"

// Strict TypeScript structure for Sivas Fire Department Citizen Service requests
interface CitizenRequest {
  id: string;
  talep_turu: string;
  basvuru_tarihi: string;
  basvuran_tc: string;
  basvuran_ad_soyad: string;
  irtibat_tel: string;
  adres: string;
  baca_detaylari?: {
    kat_sayisi?: number;
    daire_sayisi?: number;
    yakit_tipi?: string;
    baca_tipi?: string;
  };
  isyeri_detaylari?: {
    faaliyet_konusu?: string;
    alan_m2?: number;
    yangin_dolabi?: string;
    acil_cikis?: string;
    kisi_sayisi?: number;
    egitim_tarihi?: string;
    egitim_turu?: string;
  };
  durum: 'Bekliyor' | 'Ekip Atandı' | 'Ödeme Bekliyor' | 'Onaylandı' | 'Reddedildi';
  created_at: string;
  updated_at?: string;
}

export default function HizmetlerPage() {
  const { user } = useAuthStore()
  const [requests, setRequests] = useState<CitizenRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)

  // Details Modal State
  const [selectedRequest, setSelectedRequest] = useState<CitizenRequest | null>(null)

  // Detect Müdür / Admin role
  const isMudur = user?.rol === 'Admin' || user?.unvan === 'Müdür' || user?.rol?.toLowerCase() === 'admin' || user?.unvan?.toLowerCase() === 'müdür'

  useEffect(() => {
    fetchRequests()
  }, [])

  const fetchRequests = async () => {
    setLoading(true)
    try {
      const { data, error } = await api
        .from('citizen_requests')
        .select('*')
        .order('basvuru_tarihi', { ascending: false })
      
      if (data && data.length > 0) {
        setRequests(data as CitizenRequest[])
      } else if (data && data.length === 0) {
        // Auto-seeding: populate realistic test data if database is empty
        const mockRequests = [
          {
            talep_turu: 'Baca Temizliği',
            basvuru_tarihi: new Date(Date.now() - 24 * 60 * 60 * 1000 * 2).toISOString(), // 2 days ago
            basvuran_tc: '12345678901',
            basvuran_ad_soyad: 'Ahmet Yılmaz (Kat Malikleri Birliği)',
            irtibat_tel: '0532 555 1234',
            adres: 'Atatürk Caddesi, Huzur Apartmanı No: 12, Sivas Merkez',
            baca_detaylari: { kat_sayisi: 4, daire_sayisi: 8, yakit_tipi: 'Doğalgaz' },
            durum: 'Bekliyor'
          },
          {
            talep_turu: 'İtfaiye Uygunluk Raporu',
            basvuru_tarihi: new Date(Date.now() - 24 * 60 * 60 * 1000 * 5).toISOString(), // 5 days ago
            basvuran_tc: '98765432100',
            basvuran_ad_soyad: 'Sivas Yıldız Gıda ve Unlu Mamüller San. Tic. Ltd. Şti.',
            irtibat_tel: '0346 221 4567',
            adres: 'Organize Sanayi Bölgesi, 3. Cadde, No: 8, Sivas',
            isyeri_detaylari: { faaliyet_konusu: 'Fırın & Unlu Mamüller', alan_m2: 320, yangin_dolabi: 'Mevcut', acil_cikis: '2 Adet' },
            durum: 'Ödeme Bekliyor'
          },
          {
            talep_turu: 'Eğitim Talebi',
            basvuru_tarihi: new Date(Date.now() - 24 * 60 * 60 * 1000 * 1).toISOString(), // 1 day ago
            basvuran_tc: '11122233344',
            basvuran_ad_soyad: 'Sivas Cumhuriyet Anadolu Lisesi (Müdürlük)',
            irtibat_tel: '0544 654 3210',
            adres: 'Yenişehir Mahallesi, Okul Yolu Sokak, No: 3, Sivas',
            isyeri_detaylari: { egitim_tarihi: '2026-05-25', kisi_sayisi: 150, egitim_turu: 'Yangın Tahliye ve Temiz Hava Cihazı Kullanımı' },
            durum: 'Ekip Atandı'
          },
          {
            talep_turu: 'Baca Temizliği',
            basvuru_tarihi: new Date(Date.now() - 24 * 60 * 60 * 1000 * 10).toISOString(), // 10 days ago
            basvuran_tc: '55566677788',
            basvuran_ad_soyad: 'Mehmet Özdemir (Köşk Lokantası)',
            irtibat_tel: '0535 987 6543',
            adres: 'Çarşı Mahallesi, İstasyon Caddesi, No: 45, Sivas Merkez',
            baca_detaylari: { kat_sayisi: 1, baca_tipi: 'Endüstriyel Davlumbaz Bacanın Temizliği', yakit_tipi: 'Kömür / Odun' },
            durum: 'Onaylandı'
          }
        ]
        
        const seedResult = await api.insert('citizen_requests', mockRequests)
        if (seedResult && !seedResult.error) {
          const { data: refetched } = await api
            .from('citizen_requests')
            .select('*')
            .order('basvuru_tarihi', { ascending: false })
          if (refetched) setRequests(refetched as CitizenRequest[])
        }
      }
    } catch (err) {
      console.error('Fetch requests error:', err)
    } finally {
      setLoading(false)
    }
  }

  const updateStatus = async (id: string, newStatus: string) => {
    setUpdating(id)
    try {
      const { error } = await api.update('citizen_requests', { durum: newStatus }, { id: id })
      
      if (!error) {
        setRequests(prev => prev.map(req => req.id === id ? { ...req, durum: newStatus as CitizenRequest['durum'] } : req))
        if (selectedRequest && selectedRequest.id === id) {
          setSelectedRequest(prev => prev ? { ...prev, durum: newStatus as CitizenRequest['durum'] } : null)
        }
      }
    } catch (err) {
      console.error('Update status error:', err)
    } finally {
      setUpdating(null)
    }
  }

  // Calculated values for KPI Metrics
  const bacaCount = requests.filter(r => r.talep_turu.includes('Baca')).length
  const yanginCount = requests.filter(r => r.talep_turu.includes('Uygunluk') || r.talep_turu.includes('Ruhsat')).length
  const egitimCount = requests.filter(r => r.talep_turu.includes('Eğitim')).length
  
  // Total simulated revenue based on approved applications
  const revenue = requests
    .filter(r => r.durum === 'Onaylandı')
    .reduce((sum, r) => {
      if (r.talep_turu.includes('Baca')) return sum + 650
      if (r.talep_turu.includes('Eğitim')) return sum + 1200
      return sum + 2450 // İtfaiye Uygunluk Raporu / Ruhsat
    }, 0)

  // Simulated Assigned Crew
  const getGorevliEkip = (req: CitizenRequest) => {
    if (req.durum === 'Bekliyor') return 'Atanmadı'
    if (req.talep_turu.includes('Baca')) return 'B-Grubu Baca Ekibi'
    if (req.talep_turu.includes('Eğitim')) return 'Eğitim & Önleme Şefliği'
    return '1. Grup Denetim Ekibi'
  }

  // Simulated Fees and payment statuses
  const getHarcDurumu = (req: CitizenRequest) => {
    let fee = 2450
    if (req.talep_turu.includes('Baca')) fee = 650
    else if (req.talep_turu.includes('Eğitim')) fee = 1200

    if (req.durum === 'Bekliyor') {
      return { text: `Hesaplanmadı (₺${fee})`, color: 'text-slate-400 bg-slate-900/40 border-white/5' }
    }
    if (req.durum === 'Ekip Atandı') {
      return { text: `Hesaplandı (₺${fee})`, color: 'text-blue-400 bg-blue-950/40 border-blue-500/30' }
    }
    if (req.durum === 'Ödeme Bekliyor') {
      return { text: `Ödeme Bekliyor (₺${fee})`, color: 'text-amber-400 bg-amber-950/40 border-amber-500/30' }
    }
    if (req.durum === 'Onaylandı') {
      return { text: `Ödendi (₺${fee})`, color: 'text-emerald-400 bg-emerald-950/40 border-emerald-500/30' }
    }
    return { text: `Muaf`, color: 'text-slate-400 bg-slate-900/40' }
  }

  // Tactical badge render mapping
  const getStatusBadge = (durum: string) => {
    switch (durum) {
      case 'Onaylandı': 
        return <Badge className="bg-green-950/40 border border-green-500/30 text-green-400 font-semibold px-2.5 py-1 rounded-lg">Onaylandı</Badge>
      case 'Ödeme Bekliyor': 
        return <Badge className="bg-amber-950/40 border border-amber-500/30 text-amber-400 font-semibold px-2.5 py-1 rounded-lg">Ödeme Bekliyor</Badge>
      case 'Ekip Atandı': 
        return <Badge className="bg-blue-950/40 border border-blue-500/30 text-blue-400 font-semibold px-2.5 py-1 rounded-lg">Ekip Atandı</Badge>
      case 'Bekliyor':
      default: 
        return <Badge className="bg-slate-800 text-slate-300 font-semibold px-2.5 py-1 rounded-lg">Bekliyor</Badge>
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center animate-pulse flex items-center justify-center gap-2 min-h-[50vh]">
        <Loader2 className="w-6 h-6 animate-spin text-primary" /> 
        <span className="text-muted-foreground font-semibold">Vatandaş Hizmetleri Yükleniyor...</span>
      </div>
    )
  }

  return (
    <PageGuard pageId="hizmet_basvurulari">
      <div className="flex flex-col h-full space-y-6 max-w-7xl mx-auto pb-12 animate-in fade-in duration-300">
        
        {/* Sayfa Başlığı */}
        <div className="flex items-center justify-between border-b border-border/50 pb-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Vatandaş Hizmetleri ve Başvuru Yönetimi</h1>
            <p className="text-muted-foreground text-sm mt-1">Sivas İtfaiyesi Baca Temizliği, İtfaiye Uygunluk Raporu ve Eğitim Talepleri Resmi İş Akışı</p>
          </div>
          {isMudur ? (
            <Badge className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black px-3 py-1 text-xs">
              Müdür Yetki Modu
            </Badge>
          ) : (
            <Badge className="bg-zinc-800 border border-zinc-700 text-zinc-400 font-bold px-3 py-1 text-xs">
              Salt Okunur (Read-Only)
            </Badge>
          )}
        </div>

        {/* 1. Üst Özet KPI Kartları (Glassmorphic) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Baca Temizliği */}
          <Card className="bg-slate-900/40 backdrop-blur-md border border-white/5 p-4 rounded-xl shadow-lg relative overflow-hidden group hover:border-blue-500/20 transition duration-300">
            <div className="absolute -right-4 -bottom-4 opacity-5 text-blue-500 group-hover:scale-110 transition duration-500">
              <Brush className="w-24 h-24" />
            </div>
            <CardContent className="p-0 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs text-zinc-400 font-bold tracking-wider uppercase">Baca Temizliği</span>
                <h3 className="text-2xl font-black text-blue-400">{bacaCount} Başvuru</h3>
                <p className="text-[10px] text-zinc-500">Sivas geneli konut/ticari baca talepleri</p>
              </div>
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl">
                <Brush className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>

          {/* Yangın Önlem / Ruhsat */}
          <Card className="bg-slate-900/40 backdrop-blur-md border border-white/5 p-4 rounded-xl shadow-lg relative overflow-hidden group hover:border-yellow-500/20 transition duration-300">
            <div className="absolute -right-4 -bottom-4 opacity-5 text-yellow-500 group-hover:scale-110 transition duration-500">
              <ShieldCheck className="w-24 h-24" />
            </div>
            <CardContent className="p-0 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs text-zinc-400 font-bold tracking-wider uppercase">Yangın Önlem / Ruhsat</span>
                <h3 className="text-2xl font-black text-yellow-400">{yanginCount} Rapor</h3>
                <p className="text-[10px] text-zinc-500">İtfaiye uygunluk ve ruhsat onay süreci</p>
              </div>
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded-xl">
                <ShieldCheck className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>

          {/* Eğitim Talepleri */}
          <Card className="bg-slate-900/40 backdrop-blur-md border border-white/5 p-4 rounded-xl shadow-lg relative overflow-hidden group hover:border-purple-500/20 transition duration-300">
            <div className="absolute -right-4 -bottom-4 opacity-5 text-purple-500 group-hover:scale-110 transition duration-500">
              <GraduationCap className="w-24 h-24" />
            </div>
            <CardContent className="p-0 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs text-zinc-400 font-bold tracking-wider uppercase">Eğitim Talepleri</span>
                <h3 className="text-2xl font-black text-purple-400">{egitimCount} Talep</h3>
                <p className="text-[10px] text-zinc-500">Kurumsal ve okul afet bilinç eğitimleri</p>
              </div>
              <div className="p-3 bg-purple-500/10 border border-purple-500/20 text-purple-400 rounded-xl">
                <GraduationCap className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>

          {/* Vezne / Tahsilat */}
          <Card className="bg-slate-900/40 backdrop-blur-md border border-white/5 p-4 rounded-xl shadow-lg relative overflow-hidden group hover:border-emerald-500/20 transition duration-300">
            <div className="absolute -right-4 -bottom-4 opacity-5 text-emerald-500 group-hover:scale-110 transition duration-500">
              <CreditCard className="w-24 h-24" />
            </div>
            <CardContent className="p-0 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs text-zinc-400 font-bold tracking-wider uppercase">Vezne / Tahsilat</span>
                <h3 className="text-2xl font-black text-emerald-400">₺{revenue.toLocaleString('tr-TR')}</h3>
                <p className="text-[10px] text-zinc-500">Onaylanan başvurulardan tahsil edilen harç</p>
              </div>
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl">
                <CreditCard className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 3. Resmi İş Akışı ve Kurumsal Tablo Düzenlemesi */}
        <Card className="border-zinc-800 bg-zinc-950/40 backdrop-blur-xl shadow-2xl overflow-hidden">
          <CardHeader className="border-b border-zinc-800 bg-zinc-900/10 pb-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-base font-black tracking-wider uppercase text-zinc-300 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-400" /> AKTİF BAŞVURULAR VERİ GRİDİ
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">Veritabanından anlık çekilen resmi vatandaş/kurum hizmet kayıtları</p>
              </div>
              <span className="text-[10px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-500 px-2.5 py-1 rounded-md">
                TOPLAM KAYIT: {requests.length}
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {requests.length === 0 ? (
              <div className="text-center p-12 text-muted-foreground bg-zinc-950/20">
                Sistemde henüz bir hizmet başvurusu bulunmamaktadır.
              </div>
            ) : (
              <table className="w-full min-w-[1000px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-zinc-900 bg-zinc-950/60 text-zinc-400 font-bold text-xs uppercase tracking-wider">
                    <th className="p-4 text-left">Başvuran / Kurum Adı</th>
                    <th className="p-4 text-left">Hizmet Türü</th>
                    <th className="p-4 text-left">Başvuru Tarihi</th>
                    <th className="p-4 text-left">Görevli Ekip</th>
                    <th className="p-4 text-left">Harç Durumu</th>
                    <th className="p-4 text-left">İşlem Durumu</th>
                    <th className="p-4 text-right">İşlemler / Aksiyonlar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900">
                  {requests.map(req => {
                    const feeObj = getHarcDurumu(req)
                    return (
                      <tr key={req.id} className="hover:bg-zinc-900/30 transition duration-150 group">
                        <td className="p-4 align-middle">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-zinc-900/80 border border-zinc-800 flex items-center justify-center text-zinc-400 group-hover:scale-105 transition shrink-0">
                              <User className="w-4 h-4" />
                            </div>
                            <div className="space-y-0.5">
                              <span className="font-bold text-zinc-200 block text-sm line-clamp-1">{req.basvuran_ad_soyad}</span>
                              <span className="text-[10px] text-zinc-500 font-mono block">TC: {req.basvuran_tc || 'Girilmemeş'}</span>
                            </div>
                          </div>
                        </td>
                        
                        <td className="p-4 align-middle">
                          <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-md ${
                              req.talep_turu.includes('Baca') ? 'text-blue-400 bg-blue-500/10' :
                              req.talep_turu.includes('Eğitim') ? 'text-purple-400 bg-purple-500/10' :
                              'text-yellow-400 bg-yellow-500/10'
                            }`}>
                              {req.talep_turu.includes('Baca') ? <Brush className="w-3.5 h-3.5" /> :
                               req.talep_turu.includes('Eğitim') ? <GraduationCap className="w-3.5 h-3.5" /> :
                               <ShieldCheck className="w-3.5 h-3.5" />}
                            </div>
                            <span className="font-semibold text-zinc-300">{req.talep_turu}</span>
                          </div>
                        </td>

                        <td className="p-4 align-middle text-zinc-400 font-medium">
                          <div className="flex items-center gap-1.5 text-xs">
                            <Calendar className="w-3.5 h-3.5 text-zinc-600" />
                            {new Date(req.basvuru_tarihi).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </div>
                        </td>

                        <td className="p-4 align-middle font-bold text-xs text-zinc-400">
                          <span className={req.durum === 'Bekliyor' ? 'text-zinc-600 font-normal italic' : 'text-zinc-300'}>
                            {getGorevliEkip(req)}
                          </span>
                        </td>

                        <td className="p-4 align-middle">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border ${feeObj.color}`}>
                            {feeObj.text}
                          </span>
                        </td>

                        <td className="p-4 align-middle">
                          {getStatusBadge(req.durum)}
                        </td>

                        <td className="p-4 align-middle text-right">
                          <div className="flex items-center justify-end gap-2">
                            {/* 4. Müdür Yetkili Dinamik Aksiyonlar */}
                            {isMudur && req.durum === 'Bekliyor' && (
                              <Button 
                                size="sm" 
                                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-2.5 py-1.5 h-8 rounded-lg flex items-center gap-1 shadow-md hover:scale-[1.02] transition"
                                onClick={() => updateStatus(req.id, 'Ekip Atandı')}
                                disabled={updating === req.id}
                              >
                                <UserCheck className="w-3.5 h-3.5" /> Ekip Ata
                              </Button>
                            )}
                            {isMudur && req.durum === 'Ödeme Bekliyor' && (
                              <Button 
                                size="sm" 
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-2.5 py-1.5 h-8 rounded-lg flex items-center gap-1 shadow-md hover:scale-[1.02] transition"
                                onClick={() => updateStatus(req.id, 'Onaylandı')}
                                disabled={updating === req.id}
                              >
                                <CheckCircle className="w-3.5 h-3.5" /> Raporu Onayla
                              </Button>
                            )}
                            
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800/60 font-semibold px-3 py-1.5 rounded-lg text-xs"
                              onClick={() => setSelectedRequest(req)}
                            >
                              Detayları Gör
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* Details Modal */}
        {selectedRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <Card className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 shadow-2xl overflow-hidden rounded-2xl animate-in zoom-in-95 duration-200">
              <CardHeader className="bg-zinc-900/40 border-b border-zinc-800/80 p-5 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2 font-black text-indigo-100">
                    <Info className="w-5 h-5 text-indigo-400" /> BAŞVURU DETAY PANELİ
                  </CardTitle>
                  <p className="text-xs text-zinc-500 mt-1">
                    Kayıt ID: <span className="font-mono text-zinc-400">{selectedRequest.id}</span>
                  </p>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-zinc-400 hover:text-white"
                  onClick={() => setSelectedRequest(null)}
                >
                  Kapat
                </Button>
              </CardHeader>
              
              <CardContent className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
                {/* Genel Durum Bilgilendirmesi */}
                <div className="flex items-center justify-between bg-zinc-900/50 p-4 rounded-xl border border-zinc-800/50">
                  <div className="space-y-1">
                    <span className="text-xs text-zinc-500 block">Mevcut İşlem Durumu</span>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(selectedRequest.durum)}
                      <span className="text-xs text-zinc-400 font-medium">
                        Görevli: {getGorevliEkip(selectedRequest)}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-zinc-500 block">Harç Hesap Tipi</span>
                    <span className="text-sm font-black text-emerald-400">
                      {getHarcDurumu(selectedRequest).text}
                    </span>
                  </div>
                </div>

                {/* Vatandaş Bilgileri */}
                <div className="space-y-3">
                  <h3 className="font-bold text-sm text-zinc-200 border-b border-zinc-800 pb-1.5 flex items-center gap-1.5">
                    <User className="w-4 h-4 text-indigo-400" /> Vatandaş / Başvuran Bilgileri
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-zinc-500 block text-xs">T.C. / Vergi Numarası</span>
                      <span className="font-bold text-zinc-300">{selectedRequest.basvuran_tc || '-'}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-xs">Ad Soyad / Ticari Unvan</span>
                      <span className="font-bold text-zinc-300">{selectedRequest.basvuran_ad_soyad}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-xs">İrtibat Numarası</span>
                      <span className="font-bold text-zinc-300 flex items-center gap-1"><Phone className="w-3.5 h-3.5 text-zinc-500" /> {selectedRequest.irtibat_tel}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-xs">Başvuru Oluşturma Tarihi</span>
                      <span className="font-bold text-zinc-300">{new Date(selectedRequest.basvuru_tarihi).toLocaleString('tr-TR')}</span>
                    </div>
                    <div className="col-span-1 sm:col-span-2">
                      <span className="text-zinc-500 block text-xs">Açık Müdahale / Hizmet Adresi</span>
                      <span className="font-bold text-zinc-300 flex items-start gap-1 mt-0.5"><MapPin className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" /> {selectedRequest.adres}</span>
                    </div>
                  </div>
                </div>

                {/* JSONB Detayları */}
                {selectedRequest.talep_turu === 'Baca Temizliği' && selectedRequest.baca_detaylari && (
                  <div className="space-y-3 bg-blue-500/5 p-4 rounded-xl border border-blue-500/10">
                    <h3 className="font-bold text-sm text-blue-400 border-b border-blue-500/20 pb-1.5 flex items-center gap-1.5">
                      <Brush className="w-4 h-4" /> Baca Temizlik İşlemi Teknik Detayları
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                      {Object.entries(selectedRequest.baca_detaylari).map(([key, val]) => (
                        <div key={key} className="bg-zinc-900/50 p-2.5 rounded-lg border border-zinc-800/80">
                          <span className="text-zinc-500 block text-xs capitalize">{key.replace('_', ' ')}</span>
                          <span className="font-bold text-zinc-300">{String(val)}</span>
                        </div>
                      ))}
                      {Object.keys(selectedRequest.baca_detaylari).length === 0 && (
                        <span className="text-muted-foreground text-xs col-span-3">Detaylı baca verisi girilmemiş.</span>
                      )}
                    </div>
                  </div>
                )}

                {selectedRequest.talep_turu === 'İtfaiye Uygunluk Raporu' && selectedRequest.isyeri_detaylari && (
                  <div className="space-y-3 bg-yellow-500/5 p-4 rounded-xl border border-yellow-500/10">
                    <h3 className="font-bold text-sm text-yellow-400 border-b border-yellow-500/20 pb-1.5 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4" /> İşyeri Yangın Güvenlik & Faaliyet Detayları
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                      {Object.entries(selectedRequest.isyeri_detaylari).map(([key, val]) => (
                        <div key={key} className="bg-zinc-900/50 p-2.5 rounded-lg border border-zinc-800/80">
                          <span className="text-zinc-500 block text-xs capitalize">{key.replace('_', ' ')}</span>
                          <span className="font-bold text-zinc-300">{String(val)}</span>
                        </div>
                      ))}
                      {Object.keys(selectedRequest.isyeri_detaylari).length === 0 && (
                        <span className="text-muted-foreground text-xs col-span-3">Detaylı işyeri yangın önlem verisi girilmemiş.</span>
                      )}
                    </div>
                  </div>
                )}

                {selectedRequest.talep_turu === 'Eğitim Talebi' && selectedRequest.isyeri_detaylari && (
                  <div className="space-y-3 bg-purple-500/5 p-4 rounded-xl border border-purple-500/10">
                    <h3 className="font-bold text-sm text-purple-400 border-b border-purple-500/20 pb-1.5 flex items-center gap-1.5">
                      <GraduationCap className="w-4 h-4" /> Eğitim ve Tatbikat Organizasyon Detayları
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                      {Object.entries(selectedRequest.isyeri_detaylari).map(([key, val]) => (
                        <div key={key} className="bg-zinc-900/50 p-2.5 rounded-lg border border-zinc-800/80">
                          <span className="text-zinc-500 block text-xs capitalize">{key.replace('_', ' ')}</span>
                          <span className="font-bold text-zinc-300">{String(val)}</span>
                        </div>
                      ))}
                      {Object.keys(selectedRequest.isyeri_detaylari).length === 0 && (
                        <span className="text-muted-foreground text-xs col-span-3">Detaylı eğitim planlama verisi girilmemiş.</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Müdür İşlem Güncelleme Alanı */}
                {isMudur ? (
                  <div className="space-y-3 pt-5 border-t border-zinc-900">
                    <h3 className="font-bold text-sm text-indigo-100 flex items-center gap-1.5">
                      <CheckCircle className="w-4 h-4 text-indigo-400" /> Müdür Hızlı Operasyon Menüsü
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 bg-zinc-900/20 p-3 rounded-xl border border-zinc-900">
                      <Button 
                        variant={selectedRequest.durum === 'Bekliyor' ? 'default' : 'outline'} 
                        size="sm" 
                        className={`font-semibold rounded-lg text-xs ${selectedRequest.durum === 'Bekliyor' ? 'bg-slate-800 text-white border-zinc-700' : 'border-zinc-800'}`}
                        onClick={() => updateStatus(selectedRequest.id, 'Bekliyor')}
                        disabled={updating === selectedRequest.id}
                      >
                        Bekliyor Yap
                      </Button>
                      
                      <Button 
                        variant={selectedRequest.durum === 'Ekip Atandı' ? 'default' : 'outline'} 
                        size="sm" 
                        className={`font-semibold rounded-lg text-xs ${selectedRequest.durum === 'Ekip Atandı' ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'border-zinc-800'}`}
                        onClick={() => updateStatus(selectedRequest.id, 'Ekip Atandı')}
                        disabled={updating === selectedRequest.id}
                      >
                        Ekip Atandı Yap
                      </Button>
                      
                      <Button 
                        variant={selectedRequest.durum === 'Ödeme Bekliyor' ? 'default' : 'outline'} 
                        size="sm" 
                        className={`font-semibold rounded-lg text-xs ${selectedRequest.durum === 'Ödeme Bekliyor' ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'border-zinc-800'}`}
                        onClick={() => updateStatus(selectedRequest.id, 'Ödeme Bekliyor')}
                        disabled={updating === selectedRequest.id}
                      >
                        Ödeme Bekliyor Yap
                      </Button>
                      
                      <Button 
                        variant={selectedRequest.durum === 'Onaylandı' ? 'default' : 'outline'} 
                        size="sm" 
                        className={`font-semibold rounded-lg text-xs ${selectedRequest.durum === 'Onaylandı' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'border-zinc-800'}`}
                        onClick={() => updateStatus(selectedRequest.id, 'Onaylandı')}
                        disabled={updating === selectedRequest.id}
                      >
                        Raporu Onayla & Kapat
                      </Button>

                      <Button 
                        variant={selectedRequest.durum === 'Reddedildi' ? 'default' : 'outline'} 
                        size="sm" 
                        className={`font-semibold rounded-lg text-xs ${selectedRequest.durum === 'Reddedildi' ? 'bg-red-600 hover:bg-red-700 text-white' : 'border-zinc-800'}`}
                        onClick={() => updateStatus(selectedRequest.id, 'Reddedildi')}
                        disabled={updating === selectedRequest.id}
                      >
                        Talebi Reddet
                      </Button>
                      
                      {updating === selectedRequest.id && (
                        <div className="flex items-center gap-1 text-xs text-zinc-500 font-bold ml-2">
                          <Loader2 className="w-4 h-4 animate-spin text-indigo-400" /> Güncelleniyor...
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="pt-4 border-t border-zinc-900 bg-zinc-950/20 p-4 rounded-xl flex items-start gap-2.5 border border-zinc-900">
                    <HelpCircle className="w-5 h-5 text-zinc-500 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-zinc-400">Salt Okunur Bilgi Modu</span>
                      <p className="text-[11px] text-zinc-500 leading-relaxed">
                        Müdür / İbrahim Alaçam dışındaki personel yetki seviyeleri sadece başvuru detaylarını görüntüleyebilir. 
                        Herhangi bir onaylama, ekip atama veya harç durumu değişikliği yetkiniz bulunmamaktadır.
                      </p>
                    </div>
                  </div>
                )}

              </CardContent>
            </Card>
          </div>
        )}

      </div>
    </PageGuard>
  )
}
