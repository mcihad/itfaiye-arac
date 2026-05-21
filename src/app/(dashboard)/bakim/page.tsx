"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"

// Bu sayfa artık birleşik /yonetim/arac-bakim sayfasına yönlendirilmektedir
export default function BakimRedirectPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/yonetim/arac-bakim')
  }, [router])

  return (
    <div className="p-8 text-center animate-pulse flex items-center justify-center gap-2 min-h-[50vh]">
      <span className="text-muted-foreground font-semibold">Araç Bakım & Yakıt sayfasına yönlendiriliyorsunuz...</span>
    </div>
  )
}
