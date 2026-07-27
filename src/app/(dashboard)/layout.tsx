"use client"
import { Sidebar } from "@/components/layout/Sidebar"
import { Topbar } from "@/components/layout/Topbar"
import { MobileNav } from "@/components/layout/MobileNav"
import { ShiftConfigLoader } from "@/components/layout/ShiftConfigLoader"
import { useAuthStore } from "@/lib/authStore"
import { usePathname, useRouter } from "next/navigation"
import { useEffect } from "react"
import { Lock } from "lucide-react"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore()
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (user?.mustChangePassword && pathname !== "/sifre-degistir") {
      router.replace("/sifre-degistir")
    }
  }, [user?.mustChangePassword, pathname, router])

  // If password change is required, hide general layout and show only the password change page content
  if (user?.mustChangePassword) {
    if (pathname !== "/sifre-degistir") {
      return (
        <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-background text-[var(--fd-text)] p-6">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-red-500/20 border-t-red-500 rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <Lock className="w-6 h-6 text-red-500 animate-pulse" />
            </div>
          </div>
          <p className="text-gray-400 text-sm font-medium animate-pulse mt-4">Güvenlik Kontrolü: Parola değiştirme sayfasına yönlendiriliyorsunuz...</p>
        </div>
      )
    }

    // On /sifre-degistir page, hide sidebar, topbar, and mobile nav to restrict access
    return (
      <div className="flex h-screen max-w-[100vw] bg-background overflow-hidden relative justify-center items-center">
        <main className="flex-1 overflow-y-auto p-[calc(var(--fd-sp)*2)] md:p-[calc(var(--fd-sp)*3)] flex items-center justify-center">
          <div className="w-full max-w-md mx-auto">
            <div className="bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs font-semibold p-4 rounded-xl mb-4 text-center">
              🚨 İlk girişiniz veya şifreniz sıfırlandığı için devam etmeden önce yeni bir parola belirlemeniz gerekmektedir.
            </div>
            {children}
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex h-screen max-w-[100vw] bg-background overflow-hidden relative">
      <ShiftConfigLoader />
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-x-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-[96px] md:pb-0 p-[calc(var(--fd-sp)*2)] md:p-[calc(var(--fd-sp)*3)] scroll-smooth"
              style={{ paddingBottom: 'max(96px, calc(96px + env(safe-area-inset-bottom, 0px)))' }}>
          <div className="w-full min-h-full max-w-[1600px] mx-auto flex flex-col">
            {children}
          </div>
        </main>
      </div>
      <MobileNav />
    </div>
  )
}
