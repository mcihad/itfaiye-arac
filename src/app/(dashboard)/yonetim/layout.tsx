"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { ShieldAlert, Loader2 } from "lucide-react"

const ALLOWED_ROLES = ["Admin", "Editor", "Shift_Leader"]

type AuthStatus = 'loading' | 'authenticated' | 'unauthorized' | 'unauthenticated'

export default function YonetimLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading')

  useEffect(() => {
    // Read auth state directly from localStorage — no Zustand dependency
    const token = localStorage.getItem('auth_token')
    
    if (!token) {
      setAuthStatus('unauthenticated')
      router.replace("/login?redirect=/yonetim")
      return
    }

    // Token exists — try reading role from persisted Zustand store
    try {
      const authData = localStorage.getItem('sivas-itfaiye-auth')
      if (authData) {
        const parsed = JSON.parse(authData)
        const state = parsed?.state
        if (state?.isAuthenticated && state?.user) {
          const role = state.user.rol;
          const isAllowedPath = pathname === '/yonetim/tarayici';
          
          if (!ALLOWED_ROLES.includes(role)) {
            if (role === 'User' && isAllowedPath) {
              setAuthStatus('authenticated')
              return
            }
            setAuthStatus('unauthorized')
            router.replace("/?unauthorized=1")
            return
          }
          setAuthStatus('authenticated')
          return
        }
      }
    } catch {}

    // Token exists but can't verify role from store — allow access
    // (Zustand will hydrate eventually and the component will re-check)
    setAuthStatus('authenticated')
  }, [router, pathname])

  if (authStatus === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (authStatus === 'unauthenticated') {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (authStatus === 'unauthorized') {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center space-y-3 max-w-md">
          <ShieldAlert className="w-12 h-12 text-danger mx-auto" />
          <h2 className="text-xl font-bold">Erişim Engellendi</h2>
          <p className="text-muted-foreground text-sm">
            Bu sayfaya erişim yetkiniz bulunmamaktadır. Yönetim paneli sadece
            Müdür, Amir ve Çavuş rollerine açıktır.
          </p>
          <p className="text-xs text-muted-foreground">Anasayfaya yönlendiriliyorsunuz...</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}


