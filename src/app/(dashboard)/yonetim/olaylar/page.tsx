"use client"

import { useState, useEffect } from "react"
import { api, unwrap } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { 
  AlertCircle, FileText, Clock, Loader2, Plus, X, Trash2
} from "lucide-react"
import { IncidentWizard } from "@/components/incident/IncidentWizard"
import { ImportPdfModal } from "@/components/incident/ImportPdfModal"
import { Incident, Personnel, Vehicle, IncidentMedia } from "@/types"
import { getTriageInfo } from "@/lib/utils"
import { toast } from "@/lib/toast"

export default function OlaylarPage() {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [personnelList, setPersonnelList] = useState<Personnel[]>([])
  const [vehicleList, setVehicleList] = useState<Vehicle[]>([])
  
  const [loading, setLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [ek16Incident, setEk16Incident] = useState<Incident | null>(null)
  const [incidentMedia, setIncidentMedia] = useState<IncidentMedia[]>([])

  useEffect(() => {
    fetchData()
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('action') === 'add') {
        setIsAdding(true)
      }
    }
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [incRes, perRes, vehRes, mediaRes] = await Promise.all([
        api.from('incidents').select('*').order('created_at', { ascending: false }),
        api.from('personnel').select('*').eq('aktif', true).order('ad', { ascending: true }),
        api.from('vehicles').select('*').order('plaka', { ascending: true }),
        api.from('incident_media').select('*')
      ])
      
      if (incRes.data) setIncidents(incRes.data)
      if (perRes.data) setPersonnelList(perRes.data)
      if (vehRes.data) setVehicleList(vehRes.data)
      if (mediaRes.data) setIncidentMedia(mediaRes.data as IncidentMedia[])
      
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleSuccess = () => {
    setIsAdding(false)
    setIsImporting(false)
    setEk16Incident(null)
    fetchData()
  }

  const handleCancel = () => {
    setIsAdding(false)
    setEk16Incident(null)
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm("Bu vaka kaydını kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz.")) return
    
    try {
      // Önce ilişkili yabancı anahtar tablolarını temizleyelim
      // (unwrap: biri başarısız olursa ana vaka silinmeden işlem durur)
      await Promise.all([
        api.remove('incident_personnel', { incident_id: id }).then(unwrap),
        api.remove('incident_vehicles', { incident_id: id }).then(unwrap),
        api.remove('incident_media', { incident_id: id }).then(unwrap)
      ])

      // Ardından ana vakayı silelim
      const { error } = await api.remove('incidents', { id })
      if (error) throw error
      
      setIncidents(prev => prev.filter(inc => inc.id !== id))
    } catch (error) {
      console.error(error)
      toast("Silme işlemi sırasında bir hata oluştu.")
    }
  }

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-[var(--fd-accent)]" />
        <p className="text-[var(--fd-text3)] text-sm">Vaka & Olay Raporları yükleniyor...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 w-full max-w-full px-1.5 md:px-3 pb-12 animate-in fade-in duration-300">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--fd-border)] pb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-[var(--fd-text)]">Vaka & Olay Raporları</h1>
          <p className="text-[var(--fd-text3)] text-xs mt-1">Resmi EK-12, EK-16 ve EK-7 İtfaiye Olay Raporu</p>
        </div>
        {!isAdding && !ek16Incident && (
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setIsImporting(true)}
              variant="outline"
              className="text-[var(--fd-text2)] font-semibold text-xs px-3.5 py-2 h-9 rounded-[var(--fd-r-sm)] flex items-center gap-1.5 hover:scale-[1.02] transition duration-150 shrink-0 border-[var(--fd-border-strong)]"
            >
              <FileText className="w-4 h-4" /> İçe Aktar (PDF)
            </Button>
            <Button
              onClick={() => setIsAdding(true)}
              className="bg-[var(--fd-accent)] hover:opacity-90 text-white font-bold text-xs px-3.5 py-2 h-9 rounded-[var(--fd-r-sm)] flex items-center gap-1.5 shadow-[var(--fd-shadow-sm)] hover:scale-[1.02] transition duration-150 shrink-0"
            >
              <Plus className="w-4 h-4" /> Yeni Vaka Ekle
            </Button>
          </div>
        )}
      </div>

      {isImporting && (
        <ImportPdfModal 
          onClose={() => setIsImporting(false)} 
          onSuccess={handleSuccess} 
        />
      )}

      {/* Yeni Vaka Ekleme Modal Dialog */}
      {isAdding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 sm:p-6 overflow-y-auto">
          <Card className="w-full max-w-5xl bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] shadow-[var(--fd-shadow-lg)] overflow-hidden animate-in zoom-in-95 duration-200 my-auto">
            <CardHeader className="bg-[var(--fd-surface2)]/40 border-b border-[var(--fd-border)] p-4 sm:p-5 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold text-[var(--fd-text)] flex items-center gap-2">
                  <Plus className="w-5 h-5 text-[var(--fd-accent)]" />
                  Yeni Vaka Kaydı Oluştur
                </CardTitle>
                <p className="text-xs text-[var(--fd-text3)] mt-1">Sivas İtfaiye Müdürlüğü Resmi Olay Kayıt Sihirbazı</p>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-[var(--fd-text3)] hover:text-[var(--fd-text)] hover:bg-[var(--fd-surface3)]/50 rounded-[var(--fd-r-sm)]"
                onClick={handleCancel}
              >
                <X className="w-5 h-5" />
              </Button>
            </CardHeader>
            <div className="p-4 sm:p-6 max-h-[80vh] overflow-y-auto">
              <IncidentWizard 
                mode="add"
                personnelList={personnelList}
                vehicleList={vehicleList}
                onCancel={handleCancel}
                onSuccess={handleSuccess}
              />
            </div>
          </Card>
        </div>
      )}

      {/* EK-16 Modal Dialog */}
      {ek16Incident && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 sm:p-6 overflow-y-auto">
          <Card className="w-full max-w-5xl bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] shadow-[var(--fd-shadow-lg)] overflow-hidden animate-in zoom-in-95 duration-200 my-auto">
            <CardHeader className="bg-[var(--fd-surface2)]/40 border-b border-[var(--fd-border)] p-4 sm:p-5 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold text-[var(--fd-text)] flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[var(--fd-accent)]" />
                  EK-16 Vaka Kapanış Raporu — {ek16Incident.mahalle}
                </CardTitle>
                <p className="text-xs text-[var(--fd-text3)] mt-1">Sivas Belediyesi İtfaiye Müdürlüğü Resmi Kapanış Belgesi</p>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-[var(--fd-text3)] hover:text-[var(--fd-text)] hover:bg-[var(--fd-surface3)]/50 rounded-[var(--fd-r-sm)]"
                onClick={handleCancel}
              >
                <X className="w-5 h-5" />
              </Button>
            </CardHeader>
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
          </Card>
        </div>
      )}

      {/* ======================= LIST VIEW ======================= */}
      <div className="grid grid-cols-1 gap-4">
          {incidents.length === 0 ? (
            <div className="text-center p-12 border border-dashed border-[var(--fd-border)] rounded-[var(--fd-r)] text-[var(--fd-text3)] bg-[var(--fd-surface2)]/30 font-semibold">
              Henüz girilmiş bir vaka kaydı bulunmamaktadır.
            </div>
          ) : (
            incidents.map(inc => {
              const triage = getTriageInfo(inc.olay_turu)
              return (
                <Card key={inc.id} className="bg-[var(--fd-surface)] border border-[var(--fd-border)] shadow-[var(--fd-shadow-sm)] rounded-[var(--fd-r)] hover:border-[var(--fd-accent)]/40 transition-all duration-200">
                  <CardContent className="p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <div 
                        className="w-11 h-11 rounded-[var(--fd-r-sm)] flex items-center justify-center shrink-0 border"
                        style={{
                          backgroundColor: `${triage.color}15`,
                          color: triage.color,
                          borderColor: `${triage.color}25`
                        }}
                      >
                        <AlertCircle className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <Badge variant={triage.badgeVariant}>
                            {inc.olay_turu}
                          </Badge>
                          <Badge variant={triage.badgeVariant} className="text-[9px] px-1.5 py-0">
                            {triage.badgeText}
                          </Badge>
                          <span className="font-bold text-base text-[var(--fd-text)]">{inc.mahalle}</span>
                        </div>
                        <p className="text-xs text-[var(--fd-text3)] line-clamp-1 font-medium">{inc.adres}</p>
                        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-[var(--fd-text3)] font-[var(--fd-fontmono)]">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> İhbar: {new Date(inc.ihbar_saati).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}
                          </span>
                          {inc.cikis_sebebi && <span className="opacity-60">| Sebep: {inc.cikis_sebebi}</span>}
                        </div>
                      </div>
                    </div>
                  
                  {/* Desktop Action Area */}
                  <div className="hidden md:flex md:flex-col gap-2 items-end md:min-w-[170px]">
                    {inc.status === 'closed' && (
                      <Badge variant="success" className="text-[10px] mb-1 w-full justify-center">KAPALI</Badge>
                    )}
                    <div className="flex gap-2 w-full flex-wrap justify-end">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className={`flex-1 text-xs transition-all duration-200 active:scale-[0.97] rounded-[var(--fd-r-sm)] border-[var(--fd-border)] ${
                          inc.status === 'closed' 
                            ? 'text-[var(--fd-success)] hover:bg-[rgba(22,163,74,0.08)]' 
                            : 'text-[var(--fd-danger)] hover:bg-[rgba(220,38,38,0.08)]'
                        }`}
                        onClick={() => setEk16Incident(inc)}
                      >
                        <FileText className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                        {inc.status === 'closed' ? 'EK-16' : 'Rapor'}
                      </Button>
                      
                      {incidentMedia.some(m => m.incident_id === inc.id && m.tip === 'pdf') && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex-1 text-xs transition-all duration-200 active:scale-[0.97] rounded-[var(--fd-r-sm)] border-[var(--fd-border)] text-blue-600 hover:bg-blue-50"
                          onClick={() => {
                            const pdfMedia = incidentMedia.find(m => m.incident_id === inc.id && m.tip === 'pdf');
                            if (pdfMedia) window.open(pdfMedia.url, '_blank');
                          }}
                        >
                          Taranmış Belge
                        </Button>
                      )}
                      
                      <Button
                        variant="outline"
                        size="icon"
                        className="border-[var(--fd-border)] text-[var(--fd-danger)] hover:bg-[rgba(220,38,38,0.08)] h-9 w-9 shrink-0 rounded-[var(--fd-r-sm)]"
                        title="Vakayı Sil"
                        onClick={() => handleDelete(inc.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex md:hidden flex-col gap-2.5 w-full border-t border-[var(--fd-border)]/50 pt-3 mt-2">
                    {inc.status === 'closed' ? (
                      <div className="flex flex-col gap-2.5 w-full">
                        {/* Status & Delete Row */}
                        <div className="flex items-center justify-between w-full">
                          <Badge variant="success" className="text-[10px] px-3 py-1">KAPALI</Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-[var(--fd-border)] text-[var(--fd-danger)] hover:bg-[rgba(220,38,38,0.08)] text-[11px] px-3 py-1 gap-1.5 h-8 font-medium rounded-[var(--fd-r-sm)] transition-all duration-200 active:scale-[0.97]"
                            onClick={() => handleDelete(inc.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Vakayı Sil
                          </Button>
                        </div>
                        
                        <div className="flex gap-2 w-full">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="flex-1 text-xs font-semibold h-10 transition-all duration-200 active:scale-[0.97] rounded-[var(--fd-r-sm)] border-[var(--fd-border)] text-[var(--fd-success)] hover:bg-[rgba(22,163,74,0.08)]"
                            onClick={() => setEk16Incident(inc)}
                          >
                            <FileText className="w-4 h-4 mr-1.5 shrink-0" />
                            EK-16 Raporu
                          </Button>
                          
                          {incidentMedia.some(m => m.incident_id === inc.id && m.tip === 'pdf') && (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="flex-1 text-xs font-semibold h-10 transition-all duration-200 active:scale-[0.97] rounded-[var(--fd-r-sm)] border-[var(--fd-border)] text-[var(--fd-info)] hover:bg-[rgba(37,99,235,0.08)]"
                              onClick={() => {
                                const pdfMedia = incidentMedia.find(m => m.incident_id === inc.id && m.tip === 'pdf');
                                if (pdfMedia) window.open(pdfMedia.url, '_blank');
                              }}
                            >
                              Belgeyi Gör
                            </Button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2 w-full">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex-1 text-xs border-[var(--fd-border)] text-[var(--fd-danger)] hover:bg-[rgba(220,38,38,0.08)] h-10 gap-1.5 rounded-[var(--fd-r-sm)]"
                          onClick={() => setEk16Incident(inc)}
                        >
                          <FileText className="w-4 h-4" /> Raporu Gör
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="border-[var(--fd-border)] text-[var(--fd-danger)] hover:bg-[rgba(220,38,38,0.08)] h-10 w-10 shrink-0 rounded-[var(--fd-r-sm)]"
                          title="Vakayı Sil"
                          onClick={() => handleDelete(inc.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>

                  </CardContent>
                </Card>
              )
            })
          )}
        </div>

      {/* Mobil Alt Bar Maskeleme Kalkanı - Spacer */}
      <div 
        className="w-full block md:hidden pointer-events-none clear-both" 
        style={{ height: 'calc(7rem + env(safe-area-inset-bottom))' }} 
        aria-hidden="true" 
      />

    </div>
  )
}
