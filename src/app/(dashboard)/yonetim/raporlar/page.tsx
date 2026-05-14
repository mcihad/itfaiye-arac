"use client"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { Search, Loader2, Filter, AlertTriangle, CheckCircle2, History, X } from "lucide-react"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

type UnifiedLog = {
  id: string
  tarih: string
  plaka: string
  islem_tipi: string
  sicil: string
  ad_soyad: string
  durum: string
  detaylar: string
}

export default function LogsReportsPage() {
  const [logs, setLogs] = useState<UnifiedLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  // Filters
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "7days">("7days")
  const [plakaFilter, setPlakaFilter] = useState("")
  const [personnelFilter, setPersonnelFilter] = useState("")
  const [onlyIssues, setOnlyIssues] = useState(false)

  // Fetch logic
  const fetchLogs = async () => {
    setLoading(true)
    setError("")
    try {
      let query = api.from("unified_system_logs").select("*")
      
      // Plaka filter (server-side)
      if (plakaFilter.trim()) {
        query = query.ilike("plaka", `%${plakaFilter.trim()}%`)
      }

      // Status filter (server-side)
      if (onlyIssues) {
        query = query.eq("durum", "Sorunlu")
      }

      // Date filter (server-side)
      if (dateFilter === "today") {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        query = query.gte("tarih", today.toISOString())
      } else if (dateFilter === "7days") {
        const lastWeek = new Date()
        lastWeek.setDate(lastWeek.getDate() - 7)
        query = query.gte("tarih", lastWeek.toISOString())
      }

      // Server-Side Limit & Order
      query = query.order("tarih", { ascending: false }).limit(200)

      const { data, error } = await query

      if (error) throw error

      // Personnel filter (client-side — OR logic not available in API)
      let filtered = (data || []) as UnifiedLog[]
      if (personnelFilter.trim()) {
        const term = personnelFilter.trim().toLowerCase()
        filtered = filtered.filter(
          (log) => (log.sicil || "").toLowerCase().includes(term) || (log.ad_soyad || "").toLowerCase().includes(term)
        )
      }
      setLogs(filtered)
    } catch (err: any) {
      console.error("[Logs] Fetch error:", err)
      setError(err.message || "Kayıtlar yüklenirken bir hata oluştu.")
    } finally {
      setLoading(false)
    }
  }

  // Initial load & filter trigger
  useEffect(() => {
    fetchLogs()
  }, [dateFilter, onlyIssues]) // Auto-fetch on quick toggles

  // Handle manual search trigger for text inputs
  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    fetchLogs()
  }

  const clearFilters = () => {
    setDateFilter("all")
    setPlakaFilter("")
    setPersonnelFilter("")
    setOnlyIssues(false)
    setTimeout(fetchLogs, 0)
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-border/50 pb-4">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Sistem Logları ve Raporlar</h1>
        <p className="text-muted-foreground mt-1 text-sm">Tüm araç kontrolleri ve envanter sayımlarının birleştirilmiş görünümü.</p>
      </div>

      {/* FILTERS */}
      <Card className="bg-surface/50 border-primary/10">
        <CardContent className="p-4 sm:p-6 space-y-4">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Araç Plakası</label>
              <Input 
                placeholder="Örn: 58 ACT 367" 
                value={plakaFilter}
                onChange={e => setPlakaFilter(e.target.value)}
                className="bg-background"
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Personel (Ad veya Sicil)</label>
              <Input 
                placeholder="Örn: Ahmet veya SB5801" 
                value={personnelFilter}
                onChange={e => setPersonnelFilter(e.target.value)}
                className="bg-background"
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tarih Aralığı</label>
              <select 
                value={dateFilter}
                onChange={e => setDateFilter(e.target.value as any)}
                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="today">Bugün</option>
                <option value="7days">Son 7 Gün</option>
                <option value="all">Tüm Zamanlar</option>
              </select>
            </div>
            <div className="flex items-end gap-2 pt-2 sm:pt-0">
              <Button type="submit" disabled={loading} className="w-full sm:w-auto min-w-[100px]">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Search className="w-4 h-4 mr-2" /> Ara</>}
              </Button>
              {(plakaFilter || personnelFilter || dateFilter !== "7days" || onlyIssues) && (
                <Button type="button" variant="outline" onClick={clearFilters} title="Filtreleri Temizle" className="px-3">
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </form>

          {/* Quick Toggles */}
          <div className="pt-4 border-t border-border/50 flex flex-wrap gap-3">
            <button
              onClick={() => setOnlyIssues(!onlyIssues)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors border",
                onlyIssues 
                  ? "bg-danger text-white border-danger shadow-md shadow-danger/20" 
                  : "bg-surface text-muted-foreground border-border hover:bg-muted"
              )}
            >
              <AlertTriangle className="w-4 h-4" />
              Sadece Sorunlu Kayıtları Göster
            </button>
          </div>
        </CardContent>
      </Card>

      {/* DATA GRID */}
      <Card>
        <CardHeader className="p-4 sm:p-6 pb-2 border-b border-border/50 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              Kontrol Geçmişi
            </CardTitle>
            <CardDescription className="mt-1">
              {logs.length === 200 ? "Son 200 kayıt gösteriliyor" : `${logs.length} kayıt bulundu`}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div className="p-8 text-center text-danger">
              <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>{error}</p>
            </div>
          ) : loading ? (
            <div className="p-12 text-center text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-primary/50" />
              <p>Veriler yükleniyor...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Filter className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Bu filtrelere uygun kayıt bulunamadı.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/30 border-b border-border/50">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Tarih</th>
                    <th className="px-4 py-3 font-semibold">Plaka</th>
                    <th className="px-4 py-3 font-semibold">İşlem Tipi</th>
                    <th className="px-4 py-3 font-semibold">Personel</th>
                    <th className="px-4 py-3 font-semibold">Durum</th>
                    <th className="px-4 py-3 font-semibold max-w-md">Detaylar / Notlar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-medium">{new Date(log.tarih).toLocaleDateString("tr-TR")}</div>
                        <div className="text-xs text-muted-foreground">{new Date(log.tarih).toLocaleTimeString("tr-TR", { hour: '2-digit', minute: '2-digit' })}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-bold text-primary">
                        {log.plaka}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {log.islem_tipi}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-medium">{log.ad_soyad}</div>
                        <div className="text-xs text-muted-foreground">{log.sicil}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {log.durum === "Sorunlu" ? (
                          <Badge variant="danger" className="gap-1 px-2 py-0.5">
                            <AlertTriangle className="w-3 h-3" /> Sorunlu
                          </Badge>
                        ) : (
                          <Badge variant="success" className="gap-1 px-2 py-0.5 bg-success/10 text-success border-success/20">
                            <CheckCircle2 className="w-3 h-3" /> Kusursuz
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground min-w-[250px] break-words">
                        {log.detaylar || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
