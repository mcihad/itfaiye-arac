"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"

// Bu sayfa artık birleşik /yonetim/gorevler sayfasına yönlendirilmektedir
export default function GorevlerRedirectPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/yonetim/gorevler')
  }, [router])

  return (
    <div className="p-8 text-center animate-pulse flex items-center justify-center gap-2 min-h-[50vh]">
      <span className="text-muted-foreground font-semibold">Görev & Devir-Teslim sayfasına yönlendiriliyorsunuz...</span>
    </div>
  )
}
