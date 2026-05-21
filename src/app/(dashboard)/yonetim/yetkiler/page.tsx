"use client"

import React, { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/authStore';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Shield, Lock, Unlock, Flame, Users, Wrench, Combine, FileText, Loader2, Sparkles, ShieldAlert, Check, AlertTriangle, GraduationCap, ListChecks } from 'lucide-react';

interface PermissionRow {
  id?: number;
  rol: string;
  sayfa_id: string;
  izinli: boolean;
}

const PAGE_METADATA = [
  { id: 'harita', title: 'Komuta Kontrol Haritası', desc: 'Saha yönetimi, yangın hidrantı ve anlık olay tespiti', icon: Flame, color: 'text-red-500 bg-red-500/10' },
  { id: 'personel_yonetimi', title: 'Personel Yönetimi', desc: 'Sicil kayıtları, aktif vardiya ve yeterlilik atamaları', icon: Users, color: 'text-cyan-500 bg-cyan-500/10' },
  { id: 'arac_bakim', title: 'Araç Bakım & Garaj', desc: 'Arıza ihbarları, teknik raporlama ve müdür onay adımları', icon: Wrench, color: 'text-emerald-500 bg-emerald-500/10' },
  { id: 'envanter', title: 'Malzeme Envanteri', desc: 'QR kod üretimi, araç malzeme zimmetleri ve durum sayımları', icon: Combine, color: 'text-amber-500 bg-amber-500/10' },
  { id: 'raporlar', title: 'EK-16 Raporları', desc: 'Merkezi log sistemi, geçmiş denetimler ve sorun analizleri', icon: FileText, color: 'text-purple-500 bg-purple-500/10' },
  { id: 'egitimler', title: 'Eğitim & Faaliyetler', desc: 'Resmi imza sirkülü eğitim raporları, tatbikat ve ziyaret kayıtları', icon: GraduationCap, color: 'text-blue-500 bg-blue-500/10' },
  { id: 'hizmet_basvurulari', title: 'Vatandaş Hizmetleri', desc: 'Baca temizliği, yangın önlem ruhsatları ve eğitim talepleri onay süreci', icon: Sparkles, color: 'text-indigo-500 bg-indigo-500/10' },
  { id: 'gorevler', title: 'Görev & Devir-Teslim', desc: 'Dinamik araç devir-teslim, malzeme kontrol ve şablon oluşturma', icon: ListChecks, color: 'text-rose-500 bg-rose-500/10' },
];

const ROLES = [
  { id: 'Müdür', title: 'Müdür / Yönetici', desc: 'SB5801 İbrahim Alaçam seviyesi en üst komuta' },
  { id: 'Amir', title: 'Grup Amiri / Başamir', desc: 'İstasyon ve operasyon grup amirleri' },
  { id: 'Çavuş', title: 'Vardiya Amiri / Çavuş', desc: 'Saha sevk sorumlusu ve ekip çavuşları' },
  { id: 'Santral', title: 'Santral / İhbar Memuru', desc: 'Kriz masası ve olay veri girişi operatörü' },
  { id: 'Er', title: 'Müdahale Eri / Personel', desc: 'Saha operasyon ekibi ve araç müdahale kadrosu' },
];

export default function YetkilerPage() {
  const { user } = useAuthStore();
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Check if current user is Müdür/Admin
  const isMudur = user?.rol === 'Admin' || user?.rol?.toLowerCase() === 'admin' || user?.unvan === 'Müdür' || user?.unvan?.toLowerCase() === 'müdür';

  useEffect(() => {
    fetchPermissions();
  }, []);

  const fetchPermissions = async () => {
    setLoading(true);
    try {
      const { data, error } = await api.from('role_permissions').select('*');
      if (error) throw error;
      if (data) {
        setPermissions(data as PermissionRow[]);
      }
    } catch (err) {
      console.error('Yetki matrisi çekilirken hata:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (rol: string, sayfa_id: string, currentVal: boolean) => {
    if (!isMudur) return; // Non-Müdür users cannot modify matrix settings
    
    const key = `${rol}-${sayfa_id}`;
    setUpdatingId(key);
    setSaveStatus('idle');

    const newVal = !currentVal;

    try {
      const { data, error } = await api.update('role_permissions', { izinli: newVal }, { rol, sayfa_id });
      if (error) throw error;

      // Update state locally
      setPermissions(prev => prev.map(p => 
        (p.rol === rol && p.sayfa_id === sayfa_id) ? { ...p, izinli: newVal } : p
      ));

      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2000);

      // Audit Log loglama
      fetch('/api/audit-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action_type: 'role_permission_change',
          actor_sicil_no: user?.sicilNo || 'unknown',
          actor_name: user ? `${user.ad} ${user.soyad}` : 'Bilinmeyen',
          target: `${rol} / ${sayfa_id}`,
          details: { rol, sayfa_id, izinli: newVal },
        }),
      }).catch(err => console.error('[AuditLog] Yetki matrisi logu gönderilemedi:', err));

    } catch (err) {
      console.error('Yetki güncelleme hatası:', err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } finally {
      setUpdatingId(null);
    }
  };

  const getPermission = (rol: string, sayfa_id: string): boolean => {
    const perm = permissions.find(p => p.rol === rol && p.sayfa_id === sayfa_id);
    return perm ? perm.izinli : false;
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-gray-400 text-sm">Rol ve Ekran Yetkilendirme Matrisi yükleniyor...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-border/50 pb-4 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Dinamik Rol & Ekran Yetkileri</h1>
            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 flex items-center gap-1 font-semibold">
              <Shield className="w-3.5 h-3.5" /> Karargâh Paneli
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            Sivas İtfaiye Otomasyonu bünyesindeki 5 ana kontrol panelinin, 5 ana rütbe grubuna göre erişim kuralları.
          </p>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          {saveStatus === 'success' && (
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg animate-fade-in-out">
              <Check className="w-3.5 h-3.5" /> Veritabanına Yazıldı
            </div>
          )}
          {saveStatus === 'error' && (
            <div className="flex items-center gap-1.5 text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-lg animate-fade-in-out">
              <AlertTriangle className="w-3.5 h-3.5" /> Hata Oluştu!
            </div>
          )}
          <div className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border ${
            isMudur 
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
              : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
          }`}>
            {isMudur ? (
              <>
                <Unlock className="w-3.5 h-3.5" /> Müdür Yetkisi: Açık
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5" /> Salt Okunur Mod
              </>
            )}
          </div>
        </div>
      </div>

      {!isMudur && (
        <Card className="border-amber-500/20 bg-amber-500/[0.02]">
          <CardContent className="p-4 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-amber-200">Sayfa Yetkisi Sınırı Bilgilendirmesi</h4>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Şu an sisteme <span className="text-amber-400 font-semibold">{user?.unvan || 'Kullanıcı'}</span> unvanıyla giriş yaptınız. 
                Sivas İtfaiyesi kuralları gereği yetki matrisi üzerindeki düzenlemeler sadece **İbrahim Müdür (Müdür)** yetkisiyle yapılabilir. 
                Değişiklikleri görmek için Müdür hesabı ile giriş yapabilirsiniz; bu ekran size salt-okunur (read-only) hiyerarşide sunulmaktadır.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* MATRIX TABLE */}
      <Card className="border-zinc-800 bg-zinc-950/40 backdrop-blur-xl shadow-2xl overflow-hidden">
        <CardHeader className="border-b border-zinc-800 bg-zinc-900/20 pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-black tracking-wider uppercase text-zinc-300">MODERN YETKİLENDİRME GRİD MATRİSİ</CardTitle>
            <span className="text-xs text-zinc-500 font-mono">5 EKRAN x 5 RÜTBE GRUBU</span>
          </div>
        </CardHeader>
        
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-900 bg-zinc-950/40">
                <th className="p-5 text-left font-black text-xs uppercase tracking-wider text-zinc-400 w-1/3">
                  KONTROL PANELLERİ
                </th>
                {ROLES.map(role => (
                  <th key={role.id} className="p-5 text-center font-black text-xs uppercase tracking-wider text-zinc-400">
                    <div className="space-y-1">
                      <div className="text-zinc-200 font-black">{role.title}</div>
                      <div className="text-[10px] text-zinc-500 font-medium normal-case tracking-normal max-w-[150px] mx-auto line-clamp-1">{role.desc}</div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
              {PAGE_METADATA.map(page => {
                const PageIcon = page.icon;
                return (
                  <tr key={page.id} className="hover:bg-zinc-900/25 transition duration-150 group">
                    <td className="p-5 align-middle">
                      <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-2xl ${page.color} shrink-0 mt-0.5 transition duration-300 group-hover:scale-110 shadow-lg`}>
                          <PageIcon className="w-5 h-5" />
                        </div>
                        <div className="space-y-1">
                          <h4 className="font-bold text-zinc-100 text-sm group-hover:text-primary transition duration-150">{page.title}</h4>
                          <p className="text-xs text-zinc-400 leading-relaxed font-medium">{page.desc}</p>
                          <Badge variant="outline" className="text-[9px] font-mono px-2 py-0 h-4 uppercase tracking-wider bg-zinc-900 text-zinc-500 border-zinc-800">
                            id: {page.id}
                          </Badge>
                        </div>
                      </div>
                    </td>
                    
                    {ROLES.map(role => {
                      const isAllowed = getPermission(role.id, page.id);
                      const key = `${role.id}-${page.id}`;
                      const isUpdating = updatingId === key;
                      
                      return (
                        <td key={role.id} className="p-5 text-center align-middle">
                          <div className="flex flex-col items-center justify-center space-y-3">
                            {/* Toggle Wrapper */}
                            <button
                              disabled={!isMudur || isUpdating}
                              onClick={() => handleToggle(role.id, page.id, isAllowed)}
                              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 ${
                                isAllowed ? 'bg-emerald-500' : 'bg-red-500/30'
                              }`}
                            >
                              <span className="sr-only">Toggle</span>
                              <span
                                className={`pointer-events-none relative inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out flex items-center justify-center ${
                                  isAllowed ? 'translate-x-5' : 'translate-x-0'
                                }`}
                              >
                                {isUpdating ? (
                                  <Loader2 className="w-3 h-3 text-zinc-600 animate-spin" />
                                ) : isAllowed ? (
                                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                                ) : (
                                  <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                                )}
                              </span>
                            </button>
                            
                            {/* Status label */}
                            <div className="flex items-center gap-1.5">
                              {isAllowed ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                                  <Sparkles className="w-2.5 h-2.5" /> İzinli
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">
                                  Engelli
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
