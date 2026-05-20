"use client"

import { useState, useEffect } from "react"
import { api } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { 
  AlertCircle, FileText, Clock, Loader2, Plus, X
} from "lucide-react"
import { IncidentWizard } from "@/components/incident/IncidentWizard"
import { Incident } from "@/types"
import { getTriageInfo } from "@/lib/utils"

type Personnel = any;
type Vehicle = any;

export default function OlaylarPage() {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [personnelList, setPersonnelList] = useState<Personnel[]>([])
  const [vehicleList, setVehicleList] = useState<Vehicle[]>([])
  
  const [loading, setLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [ek16Incident, setEk16Incident] = useState<Incident | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [incRes, perRes, vehRes] = await Promise.all([
        api.from('incidents').select('*').order('created_at', { ascending: false }),
        api.from('personnel').select('*').eq('aktif', true).order('ad', { ascending: true }),
        api.from('vehicles').select('*').order('plaka', { ascending: true })
      ])
      
      if (incRes.data) setIncidents(incRes.data)
      if (perRes.data) setPersonnelList(perRes.data)
      if (vehRes.data) setVehicleList(vehRes.data)
      
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleSuccess = () => {
    setIsAdding(false)
    setEk16Incident(null)
    fetchData()
  }

  const handleCancel = () => {
    setIsAdding(false)
    setEk16Incident(null)
  }

  if (loading) {
    return <div className="p-8 text-center animate-pulse flex items-center justify-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Yükleniyor...</div>
  }

  return (
    <div className="flex flex-col h-full space-y-6 max-w-6xl mx-auto pb-12">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Vaka & Olay Raporları</h1>
          <p className="text-muted-foreground text-sm">Resmi EK-12, EK-16 ve EK-7 İtfaiye Olay Raporu</p>
        </div>
        {!isAdding && !ek16Incident && (
          <Button onClick={() => setIsAdding(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Yeni Vaka Ekle
          </Button>
        )}
      </div>

      {isAdding && (
        <div className="mt-4">
          <IncidentWizard 
            mode="add"
            personnelList={personnelList}
            vehicleList={vehicleList}
            onCancel={handleCancel}
            onSuccess={handleSuccess}
          />
        </div>
      )}

      {ek16Incident && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 sm:p-6 overflow-y-auto">
          <div className="w-full max-w-5xl bg-background border rounded-xl shadow-2xl relative my-auto">
            <div className="flex items-center justify-between p-4 border-b bg-surface/50 rounded-t-xl sticky top-0 z-10 backdrop-blur-md">
              <h2 className="text-lg font-bold">EK-16 Vaka Kapanış Raporu - {ek16Incident.mahalle}</h2>
              <Button variant="ghost" size="icon" onClick={handleCancel}>
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="p-4 sm:p-6 max-h-[80vh] overflow-y-auto">
              <IncidentWizard 
                mode={ek16Incident.status === 'closed' ? 'readonly' : 'edit'}
                initialData={ek16Incident}
                personnelList={personnelList}
                vehicleList={vehicleList}
                onCancel={handleCancel}
                onSuccess={handleSuccess}
              />
            </div>
          </div>
        </div>
      )}

      {!isAdding && (
        // ======================= LIST VIEW =======================
        <div className="grid grid-cols-1 gap-4">
          {incidents.length === 0 ? (
            <div className="text-center p-12 border border-dashed rounded-xl text-muted-foreground bg-surface/50">
              Henüz girilmiş bir vaka kaydı bulunmamaktadır.
            </div>
          ) : (
            incidents.map(inc => {
              const triage = getTriageInfo(inc.olay_turu)
              return (
                <Card key={inc.id} className="hover:border-primary/50 transition-colors">
                  <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div 
                        className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border"
                        style={{
                          backgroundColor: `${triage.color}15`,
                          color: triage.color,
                          borderColor: `${triage.color}25`
                        }}
                      >
                        <AlertCircle className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <Badge variant={inc.olay_turu === 'Asılsız İhbar' ? 'outline' : 'default'} className={inc.olay_turu === 'Yangın' ? 'bg-danger hover:bg-danger/90' : ''}>
                            {inc.olay_turu}
                          </Badge>
                          <Badge className={`${triage.bgClass} font-bold text-xs px-2.5 py-0.5 rounded-full border-none`}>
                            {triage.badgeText}
                          </Badge>
                          <span className="font-semibold text-lg">{inc.mahalle}</span>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-1">{inc.adres}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground font-mono">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> İhbar: {new Date(inc.ihbar_saati).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                          {inc.cikis_sebebi && <span className="opacity-50">| Sebep: {inc.cikis_sebebi}</span>}
                        </div>
                      </div>
                    </div>
                  
                  <div className="flex flex-row sm:flex-col gap-2 items-end sm:min-w-[150px]">
                    {inc.status === 'closed' && (
                      <Badge className="bg-success/10 text-success border-none text-[10px] mb-1 w-full justify-center">KAPALI</Badge>
                    )}
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className={`w-full ${inc.status === 'closed' ? 'border-success/30 text-success hover:bg-success/10' : 'border-danger/30 text-danger hover:bg-danger/10'}`}
                      onClick={() => setEk16Incident(inc)}
                    >
                      <FileText className="w-3.5 h-3.5 mr-1.5" />
                      {inc.status === 'closed' ? 'EK-16 Yazdır/İncele' : 'EK-16 Raporunu Gör'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )})
          )}
        </div>
      )}

    </div>
  )
}
