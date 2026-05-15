"use client"

import { useState } from "react"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Badge } from "@/components/ui/Badge"
import { 
  Bot, Send, Loader2, MapPin, Navigation, CloudRain, 
  AlertTriangle, X, ChevronDown, ChevronUp, Sparkles, Wind
} from "lucide-react"

interface RouteAnalysisPanelProps {
  /** Pre-fill incident location from map click */
  incidentLocation?: string
  /** Pre-fill station location */
  stationLocation?: string
}

export function RouteAnalysisPanel({ incidentLocation, stationLocation }: RouteAnalysisPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [analysis, setAnalysis] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [formIncident, setFormIncident] = useState(incidentLocation || "")
  const [formStation, setFormStation] = useState(stationLocation || "Sivas İtfaiye Müdürlüğü, Merkez")
  const [formRoadClosures, setFormRoadClosures] = useState("")
  const [formWeather, setFormWeather] = useState("")

  const handleAnalyze = async () => {
    if (!formIncident || !formStation) {
      setError("Olay yeri ve çıkış noktası zorunludur.")
      return
    }

    setLoading(true)
    setError(null)
    setAnalysis(null)

    try {
      const roadClosures = formRoadClosures
        .split(",")
        .map(r => r.trim())
        .filter(Boolean)

      const res = await fetch("/api/ai/route-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incidentLocation: formIncident,
          stationLocation: formStation,
          roadClosures,
          weather: formWeather,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Bilinmeyen hata")
      }

      setAnalysis(data.analysis)
    } catch (err: any) {
      setError(err.message || "AI analizi sırasında bir hata oluştu.")
    } finally {
      setLoading(false)
    }
  }

  // Update form when props change
  if (incidentLocation && incidentLocation !== formIncident) {
    setFormIncident(incidentLocation)
  }

  return (
    <div className="absolute bottom-4 right-4 z-[500] w-[360px] max-w-[calc(100vw-2rem)]">
      {/* Toggle Button */}
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          className="ml-auto flex items-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-2xl shadow-violet-500/30 rounded-full px-5 py-3 h-auto animate-in slide-in-from-bottom-4"
        >
          <Sparkles className="w-5 h-5" />
          <span className="font-semibold">AI Rota Analizi</span>
        </Button>
      )}

      {/* Panel */}
      {isOpen && (
        <div className="bg-background/95 backdrop-blur-xl border border-border/80 rounded-2xl shadow-2xl shadow-black/20 overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border/50 bg-gradient-to-r from-violet-600/10 to-indigo-600/10">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-bold">Gemini AI Asistan</h3>
                <p className="text-[10px] text-muted-foreground">Taktiksel Rota & Risk Analizi</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Badge variant="outline" className="text-[10px] border-violet-500/30 text-violet-500">
                gemini-2.5-flash
              </Badge>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Form */}
          <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
            {/* Olay Yeri */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                <MapPin className="w-3 h-3 text-red-500" /> Olay Yeri *
              </label>
              <Input
                placeholder="Örn: Alibaba Mah. Atatürk Cad. No:15"
                value={formIncident}
                onChange={(e) => setFormIncident(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            {/* Çıkış Noktası */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                <Navigation className="w-3 h-3 text-blue-500" /> Çıkış Noktası *
              </label>
              <Input
                placeholder="Örn: Sivas İtfaiye Müdürlüğü"
                value={formStation}
                onChange={(e) => setFormStation(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            {/* Kapalı Yollar */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-amber-500" /> Kapalı Yollar
              </label>
              <Input
                placeholder="Virgülle ayırın: İstasyon Cad., Kale Sok."
                value={formRoadClosures}
                onChange={(e) => setFormRoadClosures(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            {/* Hava Durumu */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                <Wind className="w-3 h-3 text-cyan-500" /> Rüzgar / Hava
              </label>
              <Input
                placeholder="Örn: Kuzeyden 25 km/h rüzgar, kuru hava"
                value={formWeather}
                onChange={(e) => setFormWeather(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            {/* Analyze Button */}
            <Button
              onClick={handleAnalyze}
              disabled={loading || !formIncident || !formStation}
              className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white h-10"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analiz Ediliyor...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Rota & Risk Analizi Yap
                </span>
              )}
            </Button>

            {/* Error */}
            {error && (
              <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs animate-in fade-in">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>{error}</p>
                </div>
              </div>
            )}

            {/* AI Response */}
            {analysis && (
              <div className="p-4 rounded-xl bg-gradient-to-br from-violet-500/5 to-indigo-500/5 border border-violet-500/20 animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-violet-500" />
                  <span className="text-xs font-bold text-violet-500 uppercase tracking-wider">AI Analiz Sonucu</span>
                </div>
                <div className="text-sm leading-relaxed text-foreground whitespace-pre-wrap prose prose-sm dark:prose-invert max-w-none">
                  {analysis}
                </div>
                <p className="text-[10px] text-muted-foreground mt-3 pt-2 border-t border-border/50">
                  ⚠️ Bu analiz yapay zeka tarafından üretilmiştir. Operasyonel kararlar her zaman amirler tarafından verilmelidir.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
