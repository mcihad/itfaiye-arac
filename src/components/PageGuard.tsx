"use client"

import React, { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/authStore';
import { api } from '@/lib/api';
import { ShieldAlert, Lock, ArrowLeft, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function mapUserToPermissionRole(user: any): string {
  if (!user) return 'Er';
  const rol = user.rol || '';
  const unvan = user.unvan || '';
  
  if (unvan === 'Müdür' || rol === 'Admin') {
    return 'Müdür';
  }
  if (unvan === 'Amir' || rol === 'Editor') {
    return 'Amir';
  }
  if (
    unvan === 'Başçavuş' || 
    unvan === 'Çavuş' || 
    rol === 'Shift_Leader'
  ) {
    return 'Çavuş';
  }
  if (
    unvan.includes('Santral') || 
    unvan.includes('İhbar') || 
    unvan.includes('Memur') || 
    rol === 'Santral'
  ) {
    return 'Santral';
  }
  return 'Er';
}

interface PageGuardProps {
  pageId: 'harita' | 'personel_yonetimi' | 'arac_bakim' | 'envanter' | 'raporlar' | 'egitimler' | 'hizmet_basvurulari' | 'gorevler';
  children: React.ReactNode;
}

export default function PageGuard({ pageId, children }: PageGuardProps) {
  const { user, isAuthenticated } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [hasPermission, setHasPermission] = useState<boolean>(true);
  const router = useRouter();

  useEffect(() => {
    let active = true;

    async function checkPermission() {
      if (!isAuthenticated || !user) {
        setLoading(false);
        return;
      }

      const mappedRole = mapUserToPermissionRole(user);
      
      try {
        const { data, error } = await api.from('role_permissions')
          .eq('rol', mappedRole)
          .eq('sayfa_id', pageId)
          .single();

        if (active) {
          if (error) {
            console.error('PageGuard permission query error:', error);
            // Default fallback: if query fails, let Müdür & Amir view, else fallback by role defaults
            if (mappedRole === 'Müdür' || mappedRole === 'Amir') {
              setHasPermission(true);
            } else if (mappedRole === 'Çavuş') {
              setHasPermission(['harita', 'arac_bakim', 'envanter', 'raporlar', 'egitimler', 'hizmet_basvurulari', 'gorevler'].includes(pageId));
            } else if (mappedRole === 'Santral') {
              setHasPermission(['harita', 'raporlar', 'hizmet_basvurulari', 'gorevler'].includes(pageId));
            } else {
              setHasPermission(['harita', 'envanter', 'hizmet_basvurulari', 'gorevler'].includes(pageId));
            }
          } else if (data) {
            setHasPermission(!!data.izinli);
          } else {
            // Default fallback if no row found
            if (mappedRole === 'Müdür' || mappedRole === 'Amir') {
              setHasPermission(true);
            } else if (mappedRole === 'Çavuş') {
              setHasPermission(['harita', 'arac_bakim', 'envanter', 'raporlar', 'egitimler', 'hizmet_basvurulari', 'gorevler'].includes(pageId));
            } else if (mappedRole === 'Santral') {
              setHasPermission(['harita', 'raporlar', 'hizmet_basvurulari', 'gorevler'].includes(pageId));
            } else {
              setHasPermission(['harita', 'envanter', 'hizmet_basvurulari', 'gorevler'].includes(pageId));
            }
          }
          setLoading(false);
        }
      } catch (err) {
        console.error('PageGuard check error:', err);
        if (active) {
          if (mappedRole === 'Müdür' || mappedRole === 'Amir') {
            setHasPermission(true);
          } else {
            setHasPermission(false);
          }
          setLoading(false);
        }
      }
    }

    checkPermission();

    return () => {
      active = false;
    };
  }, [user, isAuthenticated, pageId]);

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-4">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-red-500/20 border-t-red-500 rounded-full animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <Lock className="w-6 h-6 text-red-500 animate-pulse" />
          </div>
        </div>
        <p className="text-gray-400 text-sm font-medium animate-pulse">Erişim yetkileri sorgulanıyor...</p>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
        <div className="bg-zinc-950/90 border border-red-500/30 backdrop-blur-xl p-8 rounded-2xl max-w-md w-full shadow-2xl space-y-6">
          <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center mx-auto text-red-500">
            <Lock className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-red-100">Giriş Yapılması Gerekiyor</h2>
            <p className="text-sm text-gray-400">Bu sayfayı görüntülemek için geçerli bir kullanıcı oturumu gereklidir.</p>
          </div>
          <button
            onClick={() => router.push('/login')}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-4 rounded-xl transition duration-200"
          >
            Giriş Ekranına Git
          </button>
        </div>
      </div>
    );
  }

  if (!hasPermission) {
    return (
      <div className="min-h-[75vh] flex flex-col items-center justify-center text-center px-4">
        <div className="relative group max-w-lg w-full">
          {/* Animated red glow effect behind the card */}
          <div className="absolute -inset-1 bg-gradient-to-r from-red-600 to-rose-600 rounded-2xl blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
          
          <div className="relative bg-zinc-950/90 border border-red-500/30 backdrop-blur-2xl p-10 rounded-2xl shadow-3xl space-y-8">
            <div className="relative w-20 h-20 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mx-auto text-red-500 animate-bounce">
              <ShieldAlert className="w-10 h-10" />
              <div className="absolute -inset-1 border border-red-500/30 rounded-full animate-ping opacity-75"></div>
            </div>
            
            <div className="space-y-3">
              <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-xs font-semibold tracking-wider text-red-400 uppercase">
                Yetki Sınırı Engeli
              </div>
              <h2 className="text-2xl font-black tracking-tight text-red-50">ERİŞİM ENGELLENDİ!</h2>
              <p className="text-sm text-zinc-400 max-w-sm mx-auto leading-relaxed">
                Bu kontrol paneli veya veri ekranı (<span className="text-red-400 font-semibold">{pageId.toUpperCase()}</span>) sizin aktif rolünüz/unvanınız (<span className="text-red-400 font-semibold">{user.unvan}</span>) için yetkilendirilmemiştir.
              </p>
            </div>

            <div className="border-t border-zinc-900 pt-6 flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => router.back()}
                className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-semibold py-3 px-6 rounded-xl transition duration-200"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Geri Dön</span>
              </button>
              <button
                onClick={() => window.location.reload()}
                className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-semibold py-3 px-6 rounded-xl shadow-lg shadow-red-900/30 transition duration-200"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Tekrar Dene</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
