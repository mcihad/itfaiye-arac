"use client"
import { Suspense, useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Input } from "@/components/ui/Input"
import { Button } from "@/components/ui/Button"
import { Loader2, ShieldAlert, LogIn } from "lucide-react"
import Image from "next/image"
import { useAuthStore } from "@/lib/authStore"

function LoginForm() {
  const [sicilNo, setSicilNo] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const router = useRouter()
  const searchParams = useSearchParams()
  const { login, isAuthenticated, setRedirectUrl } = useAuthStore()

  // Store redirect URL from query param
  useEffect(() => {
    const redirect = searchParams.get("redirect")
    if (redirect) {
      setRedirectUrl(redirect)
    }
  }, [searchParams, setRedirectUrl])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    // Small delay for UX
    await new Promise(r => setTimeout(r, 500))

    try {
      const result = await login(sicilNo, password)

      if (result.success) {
        if (result.token) {
          localStorage.setItem('auth_token', result.token)
          document.cookie = `itfaiye_token=${result.token}; path=/; max-age=86400; SameSite=Lax`
        }
        window.location.href = '/yonetim'
      } else {
        setError(result.error || "Giriş başarısız.")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen h-screen w-screen grid grid-cols-1 lg:grid-cols-12 overflow-hidden bg-slate-950 text-slate-100">
      
      {/* Sol Panel: Premium Görsel (Desktop Only) */}
      <div className="hidden lg:flex lg:col-span-7 xl:col-span-8 relative h-full flex-col justify-between p-12 overflow-hidden">
        {/* Background Image with high-resolution firefighters team */}
        <div className="absolute inset-0 z-0">
          <Image 
            src="/login_bg_sivas_itfaiye.jpg" 
            alt="Sivas İtfaiye Filosu" 
            fill 
            className="object-cover object-center select-none"
            priority 
          />
          {/* Koyu bindirme katmanı */}
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-[1px]" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-slate-950/40" />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent to-slate-950/30" />
        </div>

        {/* Sol Panel Üst Bölüm: Kurumsal Logolar */}
        <div className="relative z-10 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full overflow-hidden bg-white/95 flex items-center justify-center p-1.5 shadow-[0_0_15px_rgba(255,255,255,0.1)]">
            <Image src="/logo-belediye.png" alt="Sivas Belediyesi" width={32} height={32} className="object-contain" />
          </div>
          <div className="w-12 h-12 rounded-full overflow-hidden bg-white/95 flex items-center justify-center p-1.5 shadow-[0_0_15px_rgba(255,255,255,0.1)]">
            <Image src="/logo-itfaiye.png" alt="Sivas İtfaiyesi" width={32} height={32} className="object-contain" />
          </div>
          <div className="h-6 w-px bg-white/20" />
          <span className="text-sm font-bold tracking-widest text-slate-200">SİVAS BELEDİYESİ</span>
        </div>

        {/* Sol Panel Orta/Alt Bölüm: Tipografi ve Rozet */}
        <div className="relative z-10 max-w-2xl space-y-6 mt-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold uppercase tracking-widest shadow-[0_0_15px_rgba(239,68,68,0.15)] animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            Akıllı Şehir Müdürlüğü
          </div>
          <div className="space-y-4">
            <h1 className="text-4xl xl:text-5xl font-black tracking-tight leading-none text-white drop-shadow-md">
              Sivas İtfaiyesi<br />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-red-500 to-amber-500">Bilgi Yönetim Sistemi</span>
            </h1>
            <p className="text-base text-slate-300 font-medium leading-relaxed max-w-xl">
              Canlı komuta kontrol haritası, akıllı araç envanteri, solunum uzmanlığı takipleri ve anlık postane devirlerini yöneten merkezi itfaiye otomasyon portali.
            </p>
          </div>
        </div>

        {/* Sol Panel Alt Bilgi */}
        <div className="relative z-10 mt-12 flex justify-between items-center text-xs text-slate-400 border-t border-white/5 pt-6">
          <span className="font-semibold">Sivas İtfaiye Komuta Merkezi</span>
          <span className="font-mono text-slate-500">v12.0.0 (Stabil)</span>
        </div>
      </div>

      {/* Sağ Panel: Giriş Formu (Bütün Cihazlarda Aktif) */}
      <div className="lg:col-span-5 xl:col-span-4 flex items-center justify-center p-6 sm:p-12 md:p-16 bg-slate-950 relative overflow-hidden h-full">
        {/* Subtle background red glow */}
        <div className="absolute top-1/4 right-0 w-80 h-80 bg-red-600/10 rounded-full filter blur-[100px] pointer-events-none z-0" />
        <div className="absolute bottom-1/4 left-0 w-80 h-80 bg-amber-600/5 rounded-full filter blur-[100px] pointer-events-none z-0" />

        <div className="w-full max-w-md space-y-8 z-10">
          
          {/* Mobil Görünümde Başlık */}
          <div className="text-center lg:hidden space-y-4">
            <div className="flex justify-center items-center gap-4">
              <div className="w-14 h-14 rounded-full overflow-hidden bg-white flex items-center justify-center p-2 shadow-lg">
                <Image src="/logo-belediye.png" alt="Sivas Belediyesi" width={40} height={40} className="object-contain" />
              </div>
              <div className="w-14 h-14 rounded-full overflow-hidden bg-white flex items-center justify-center p-2 shadow-lg">
                <Image src="/logo-itfaiye.png" alt="Sivas İtfaiyesi" width={40} height={40} className="object-contain" />
              </div>
            </div>
            <div className="space-y-1">
              <h2 className="text-2xl font-black text-white">Sivas İtfaiyesi</h2>
              <p className="text-sm text-slate-400 font-semibold">Bilgi ve Envanter Yönetim Portalı</p>
            </div>
          </div>

          <div className="hidden lg:block space-y-2">
            <h2 className="text-3xl font-black tracking-tight text-white">Personel Girişi</h2>
            <p className="text-sm text-slate-400 font-medium">Sisteme devam etmek için sicil bilginizle oturum açın.</p>
          </div>

          {/* Form Alanı (Glassmorphism & Border Styling) */}
          <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/80 p-6 sm:p-8 rounded-3xl shadow-2xl relative overflow-hidden">
            <form onSubmit={handleLogin} className="space-y-5">
              
              {/* Hata Mesajı */}
              {error && (
                <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm animate-in fade-in slide-in-from-top-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span className="font-semibold leading-snug">{error}</span>
                </div>
              )}

              {/* Yönlendirme Bildirimi */}
              {searchParams.get("redirect") && (
                <div className="flex items-center gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
                  <LogIn className="w-4 h-4 shrink-0 animate-bounce" />
                  <span className="font-semibold text-xs leading-snug">Bu sayfaya erişmek için yetkili oturum açmanız gerekmektedir.</span>
                </div>
              )}

              {/* Sicil Numarası */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sicil Numarası</label>
                <div className="relative">
                  <Input 
                    placeholder="Örn: SB5801" 
                    value={sicilNo}
                    onChange={(e) => setSicilNo(e.target.value)}
                    required
                    className="h-12 bg-slate-950/60 border-slate-800 focus:border-red-500 focus:ring-red-500 rounded-xl font-mono tracking-widest text-slate-100 placeholder-slate-600 pl-4 w-full"
                  />
                </div>
                <p className="text-[10px] text-slate-500 font-medium pl-1">Demo Sicil: <code className="bg-slate-950 px-1.5 py-0.5 rounded font-mono text-slate-400">SB5801</code> — <code className="bg-slate-950 px-1.5 py-0.5 rounded font-mono text-slate-400">SB5830</code></p>
              </div>

              {/* Şifre */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Giriş Parolası</label>
                <div className="relative">
                  <Input 
                    type="password" 
                    placeholder="••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-12 bg-slate-950/60 border-slate-800 focus:border-red-500 focus:ring-red-500 rounded-xl text-slate-100 placeholder-slate-600 pl-4 w-full"
                  />
                </div>
                <p className="text-[10px] text-slate-500 font-medium pl-1">Demo Parola: <code className="bg-slate-950 px-1.5 py-0.5 rounded font-mono text-slate-400">1234</code></p>
              </div>

              {/* Buton */}
              <Button 
                type="submit" 
                className="w-full h-12 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-red-600/20 active:scale-[0.98] mt-2 flex items-center justify-center gap-2 border-0" 
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Oturum Açılıyor...
                  </>
                ) : (
                  <>
                    <LogIn className="w-5 h-5" />
                    Sisteme Giriş Yap
                  </>
                )}
              </Button>
            </form>
          </div>

          {/* Kurumsal Alt Bilgi */}
          <div className="text-center space-y-1 pt-4">
            <p className="text-[11px] text-slate-600 font-bold tracking-wider uppercase">
              SİVAS BELEDİYESİ İTFAİYE MÜDÜRLÜĞÜ © 2026
            </p>
            <p className="text-[9px] text-slate-700 font-medium">
              Tüm hakları saklıdır. Yetkisiz erişimler loglanmaktadır.
            </p>
          </div>
        </div>

      </div>

    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-full"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
      <LoginForm />
    </Suspense>
  )
}
