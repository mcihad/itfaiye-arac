"use client"
import { useState, useEffect } from "react"
import { ScanLine, Camera, Check, ExternalLink } from "lucide-react"
import { Card, CardContent } from "@/components/ui/Card"
import { InventoryCheckModal } from "@/components/inventory/InventoryCheckModal"
import { useRouter } from "next/navigation"
import { APP_BASE_URL } from "@/lib/constants"

import { Scanner } from "@yudiel/react-qr-scanner"

export default function BarkodPage() {
  const router = useRouter()
  const [isScanning, setIsScanning] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedVehicle, setSelectedVehicle] = useState("")
  const [selectedCompartment, setSelectedCompartment] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const [cameraError, setCameraError] = useState(false)

  // Intercept and suppress Next.js DevOverlay popup for missing cameras
  useEffect(() => {
    if (typeof window !== "undefined") {
      const originalError = console.error;
      console.error = (...args: any[]) => {
        const errorStr = args.map(a => {
          if (a instanceof Error) return a.message + " " + a.stack;
          return String(a);
        }).join(" ");
        
        if (
          errorStr.includes("Requested device not found") || 
          errorStr.includes("NotFoundError") || 
          errorStr.includes("Devices not found") ||
          errorStr.includes("Permission denied")
        ) {
          console.warn("[Camera Interceptor] Camera error handled gracefully:", ...args);
          return;
        }
        originalError.apply(console, args);
      };
      return () => {
        console.error = originalError;
      };
    }
  }, []);

  // Parse QR data - supports both URL format and legacy JSON format
  const handleRealScan = (dataStr: string) => {
    try {
      // Try URL format first: https://domain/arac/{plaka-slug}/{compartment}
      const urlPattern = /\/arac\/([^/]+)\/([^/?#]+)/
      const urlMatch = dataStr.match(urlPattern)
      
      if (urlMatch) {
        const plakaSlug = urlMatch[1]
        const compartment = urlMatch[2]
        // Convert slug back to plaka: "58-act-367" -> "58 ACT 367"
        const plaka = plakaSlug.replace(/-/g, ' ').toUpperCase()
        
        setIsScanning(false)
        setSelectedVehicle(plaka)
        setSelectedCompartment(compartment)
        setModalOpen(true)
        return
      }

      // Fallback: legacy JSON format {"p": "58-ACT-367", "c": "kabin_ici"}
      const data = JSON.parse(dataStr)
      if (data.p && data.c) {
        setIsScanning(false)
        setSelectedVehicle(data.p)
        setSelectedCompartment(data.c)
        setModalOpen(true)
      }
    } catch {
      // Ignore bad QR codes
    }
  }

  // Simulate a barcode scan manually via test buttons
  const handleSimulateScan = (vehiclePlaka: string, compartmentKey: string) => {
    setIsScanning(false)
    setSelectedVehicle(vehiclePlaka)
    setSelectedCompartment(compartmentKey)
    setModalOpen(true)
  }

  const handleSaveInventoryCheck = (results: any[]) => {
    // Sayım veritabanına InventoryCheckModal içinde kaydedildi
    setModalOpen(false)
    
    const issues = results.filter((r: any) => r.checkStatus !== "Tam")
    const msg = issues.length > 0
      ? `${selectedVehicle} sayımı kaydedildi. ${issues.length} sorunlu malzeme tespit edildi.`
      : `${selectedVehicle} aracı için sayım başarıyla kaydedildi!`
    
    setSuccessMessage(msg)
    setIsScanning(true)

    setTimeout(() => {
      setSuccessMessage("")
    }, 4000)
  }

  // Build QR URL for display
  const buildQrUrl = (plaka: string, comp: string) => {
    const slug = plaka.replace(/\s+/g, "-").toLowerCase()
    return `/arac/${slug}/${comp}`
  }

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] w-full items-center justify-center space-y-6">
      
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold flex items-center justify-center gap-2">
          <ScanLine className="w-6 h-6 text-primary" />
          Barkod / QR Tarayıcı
        </h1>
        <p className="text-sm text-muted-foreground max-w-sm">Araç bölmelerindeki QR kodu okutarak devir-teslim listesini otomatik açın.</p>
      </div>

      {successMessage && (
        <div className="bg-success/10 text-success px-4 py-3 rounded-lg flex items-center justify-center gap-2 w-full max-w-sm animate-in fade-in slide-in-from-top-4">
          <Check className="w-5 h-5" />
          <span className="text-sm font-semibold">{successMessage}</span>
        </div>
      )}

      {/* Scanner Viewfinder */}
      <Card className="w-full max-w-sm aspect-square bg-surface border-2 border-border/50 relative overflow-hidden group shadow-lg">
        <CardContent className="p-0 w-full h-full flex flex-col items-center justify-center relative">
          
          {/* Camera Background */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20 pointer-events-none" />

          {isScanning ? (
            cameraError ? (
              <div className="flex flex-col items-center justify-center text-center p-6 space-y-4">
                <Camera className="w-16 h-16 text-muted-foreground opacity-50" />
                <p className="text-sm text-muted-foreground font-medium">
                  Kamera erişimi sağlanamadı.<br />
                  Kamera izinlerini kontrol edin veya aşağıdaki test butonlarını kullanın.
                </p>
              </div>
            ) : (
              <div className="w-full h-full relative">
                <Scanner 
                  onScan={(result: any[]) => {
                    if (result && result.length > 0) handleRealScan(result[0].rawValue)
                  }} 
                  onError={() => setCameraError(true)}
                  components={{
                    finder: false
                  }}
                />
                
                {/* Scan Area Frame Overlay */}
                <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                  <div className="w-3/4 h-3/4 border-2 border-primary/40 rounded-xl relative">
                    {/* Corner Accents */}
                    <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-primary rounded-tl-xl" />
                    <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-primary rounded-tr-xl" />
                    <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-primary rounded-bl-xl" />
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-primary rounded-br-xl" />
    
                    {/* Animated Laser Line */}
                    <div className="absolute left-0 right-0 h-0.5 bg-primary shadow-[0_0_8px_2px_rgba(var(--primary),0.6)] animate-[scan_2s_ease-in-out_infinite]" />
                  </div>
                </div>
                <p className="absolute bottom-6 left-0 right-0 text-center text-xs font-semibold text-primary/80 animate-pulse z-20">Etiketi vizöre ortalayın</p>
              </div>
            )
          ) : (
            <div className="flex flex-col items-center text-success animate-in zoom-in">
              <Check className="w-16 h-16 mb-2" />
              <p className="font-bold">Barkod Okundu</p>
            </div>
          )}

        </CardContent>
      </Card>

      {/* Deep Link Info */}
      <div className="w-full max-w-sm">
        <div className="p-3 bg-cyan-500/5 border border-cyan-500/15 rounded-xl text-[11px] text-muted-foreground flex items-start gap-2">
          <ExternalLink className="w-3.5 h-3.5 mt-0.5 text-cyan-400 shrink-0" />
          <span>
            <strong className="text-foreground">Yeni:</strong> QR kodlar artık derin bağlantı (URL) içeriyor. Telefonunuzun 
            kamerası ile de direkt okutabilirsiniz.
          </span>
        </div>
      </div>

      {/* Test Barcodes */}
      <div className="w-full max-w-sm space-y-3 pt-2">
        <p className="text-xs text-center font-bold text-muted-foreground uppercase tracking-widest border-b border-border/50 pb-2">Test Barkodları</p>
        
        <button 
          onClick={() => handleSimulateScan("58 ACT 367", "kabin_ici")}
          className="w-full bg-surface hover:bg-muted border border-border p-3 rounded-xl flex items-center justify-between transition-colors shadow-sm"
        >
          <div className="flex items-center gap-3">
             <div className="p-2 bg-primary/10 rounded-lg text-primary"><ScanLine className="w-4 h-4" /></div>
             <div className="text-left">
               <p className="text-sm font-bold">58 ACT 367</p>
               <p className="text-xs text-muted-foreground">Kabin İçi</p>
             </div>
          </div>
          <span className="text-[10px] bg-muted-foreground/10 px-2 py-1 rounded font-mono">TEST</span>
        </button>

        <button 
          onClick={() => handleSimulateScan("58 TH 257", "sol_orta_kapak")}
          className="w-full bg-surface hover:bg-muted border border-border p-3 rounded-xl flex items-center justify-between transition-colors shadow-sm"
        >
          <div className="flex items-center gap-3">
             <div className="p-2 bg-warning/10 rounded-lg text-warning"><ScanLine className="w-4 h-4" /></div>
             <div className="text-left">
               <p className="text-sm font-bold">58 TH 257</p>
               <p className="text-xs text-muted-foreground">Sol Orta Kapak</p>
             </div>
          </div>
          <span className="text-[10px] bg-muted-foreground/10 px-2 py-1 rounded font-mono">TEST</span>
        </button>
      </div>

      <InventoryCheckModal 
        isOpen={modalOpen} 
        vehiclePlaka={selectedVehicle}
        compartmentKey={selectedCompartment}
        onClose={() => {
          setModalOpen(false)
          setIsScanning(true)
        }} 
        onSave={handleSaveInventoryCheck} 
      />

    </div>
  )
}
