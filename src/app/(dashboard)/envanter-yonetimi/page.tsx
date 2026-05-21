"use client"
import { useState, useEffect } from "react"
import PageGuard from "@/components/PageGuard"
import { QRCodeSVG } from "qrcode.react"
import { api } from "@/lib/api"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Printer, Settings, Combine, Save, Trash2, Plus, ArrowRight } from "lucide-react"
import { COMPARTMENT_NAMES, APP_BASE_URL } from "@/lib/constants"
import { useAuthStore } from "@/lib/authStore"

function buildQrUrl(plaka: string, compartment: string): string {
  const slug = plaka.replace(/\s+/g, "-").toLowerCase()
  return `${APP_BASE_URL}/arac/${slug}/${compartment}`
}

type FlatItem = {
  internalId: string;
  bolme: string;
  id: string; // The one from bolmeler (usually numeric or uuid but here it comes from JSON)
  malzeme: string;
  adet: number;
  durum: string;
}

export default function EnvanterYonetimiPage() {
  const { user } = useAuthStore()
  const [vehicles, setVehicles] = useState<any[]>([])
  const [selectedPlaka, setSelectedPlaka] = useState("")
  const [mounted, setMounted] = useState(false)
  
  // Flattened inventory state
  const [inventory, setInventory] = useState<FlatItem[]>([])
  
  // UI states
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [printFilter, setPrintFilter] = useState("all")

  // Fetch initial data
  useEffect(() => {
    setMounted(true)
    async function fetchVehicles() {
      const { data } = await api.from('vehicles').select('*')
      if (data) {
        setVehicles(data)
        if (data.length > 0) {
          selectVehicle(data[0].plaka, data)
        }
      }
    }
    fetchVehicles()
  }, [])

  const selectVehicle = (plaka: string, vData = vehicles) => {
    setSelectedPlaka(plaka)
    const currentVehicle = vData.find(v => v.plaka === plaka)
    
    if (currentVehicle && currentVehicle.bolmeler) {
      // Flatten the structure
      const flatList: FlatItem[] = []
      Object.entries(currentVehicle.bolmeler).forEach(([bolmeKey, items]: [string, any]) => {
        items.forEach((item: any) => {
          flatList.push({
            internalId: Math.random().toString(36).substring(7),
            bolme: bolmeKey,
            ...item
          })
        })
      })
      setInventory(flatList)
    } else {
      setInventory([])
    }
  }

  const handleFieldChange = (internalId: string, field: keyof FlatItem, value: any) => {
    setInventory(prev => prev.map(item => 
      item.internalId === internalId ? { ...item, [field]: value } : item
    ))
  }

  const handleAddNewItem = () => {
    setInventory(prev => [
      ...prev,
      {
        internalId: Math.random().toString(36).substring(7),
        id: Math.floor(Math.random() * 100000).toString(),
        bolme: Object.keys(COMPARTMENT_NAMES)[0],
        malzeme: "",
        adet: 1,
        durum: "Tam"
      }
    ])
  }

  const handleDeleteItem = (internalId: string) => {
    setInventory(prev => prev.filter(item => item.internalId !== internalId))
  }

  const saveInventoryToDB = async () => {
    setIsSaving(true)
    setSaveSuccess(false)
    
    // Group back to Supabase JSON schema
    const newBolmeler: Record<string, any[]> = {}
    
    inventory.forEach(item => {
      if (!item.malzeme || item.malzeme.trim() === "") return; // Skip empty items
      
      if (!newBolmeler[item.bolme]) newBolmeler[item.bolme] = []
      
      newBolmeler[item.bolme].push({
        id: item.id,
        malzeme: item.malzeme,
        adet: Number(item.adet),
        durum: item.durum
      })
    })
    const { error } = await api.update('vehicles', { bolmeler: newBolmeler }, { plaka: selectedPlaka })

    setIsSaving(false)
    if (!error) {
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)

      // Audit log: Envanter güncelleme işlemini kaydet
      fetch('/api/audit-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action_type: 'inventory_update',
          actor_sicil_no: user?.sicilNo || 'unknown',
          actor_name: user ? `${user.ad} ${user.soyad}` : 'Bilinmeyen',
          target: selectedPlaka,
          details: {
            total_items: inventory.length,
            compartments: Object.keys(newBolmeler),
          },
        }),
      }).catch(err => console.error('[AuditLog] Envanter güncelleme logu gönderilemedi:', err))
    } else {
      alert("Hata oluştu: " + error.message)
    }
  }

  const handlePrint = () => {
    // Get the print area div
    const printArea = document.getElementById('print-area-qr')
    if (!printArea) return

    // Clone the print area and append directly to body as a top-level child
    const clone = printArea.cloneNode(true) as HTMLElement
    clone.className = 'print-area-container'
    clone.id = 'print-area-live'
    document.body.appendChild(clone)

    // Wait for QR SVGs to fully render, then print
    setTimeout(() => {
      window.print()
      // Remove after print dialog closes
      setTimeout(() => {
        const live = document.getElementById('print-area-live')
        if (live) document.body.removeChild(live)
      }, 500)
    }, 400)
  }

  // Find unique compartments present in the inventory to generate QR codes
  const distinctCompartments = Array.from(new Set(inventory.map(i => i.bolme)))
  // If a vehicle has NO inventory, it has NO compartments, so print would be empty. 
  // Should ideally print all COMPARTMENT_NAMES? No, only the ones with inventory.
  // Actually, let's include all standard compartment types for that vehicle types, or just the ones with items.
  const printCompartments = distinctCompartments.length > 0 ? distinctCompartments : Object.keys(COMPARTMENT_NAMES)

  return (
    <PageGuard pageId="envanter">
      <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-white/10 pb-4 print:hidden gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <Combine className="w-8 h-8 text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
            Taktiksel CBS Envanter Kontrolü
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">Araç envanterlerini canlı olarak düzenleyin, siber-şifreli QR barkod etiketlerini toplu yazdırın.</p>
        </div>
        
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <select 
            value={printFilter} 
            onChange={e => setPrintFilter(e.target.value)} 
            className="h-11 rounded-lg border border-white/10 bg-slate-900/80 px-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 shrink-0 font-medium font-mono"
          >
            <option value="all">Tüm Bölmeler</option>
            {distinctCompartments.map(c => (
               <option key={c} value={c}>{COMPARTMENT_NAMES[c] || c}</option>
            ))}
          </select>
          <Button onClick={handlePrint} variant="default" className="w-full sm:w-auto h-11 shrink-0 font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-[0_0_15px_-3px_rgba(6,182,212,0.4)] border border-cyan-500/30">
            <Printer className="w-4 h-4 mr-2" />
            Etiketleri Yazdır
          </Button>
        </div>
      </div>

      <div className="print:hidden space-y-6">
        {/* Seçici Kart */}
        <Card className="backdrop-blur-md bg-slate-900/60 border border-white/10 shadow-[0_0_15px_-3px_rgba(34,211,238,0.1)] rounded-2xl">
          <CardContent className="p-5 flex flex-col md:flex-row items-center gap-4">
            <div className="flex-1 w-full">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 font-mono">HEDEF TAKTİK ARAÇ SEÇİMİ</label>
              <select 
                value={selectedPlaka} 
                onChange={e => selectVehicle(e.target.value)} 
                className="w-full h-11 rounded-lg border border-white/10 bg-slate-950/80 px-3 font-mono font-bold text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              >
                {vehicles.map(v => <option key={v.plaka} value={v.plaka}>{v.plaka} {v.marka ? `(${v.marka})` : ''}</option>)}
              </select>
            </div>
            
            <div className="hidden md:flex flex-col items-center justify-center pt-6 px-4">
               <ArrowRight className="text-cyan-500/40 animate-pulse" />
            </div>

            <div className="flex-1 w-full bg-slate-950/40 p-3.5 rounded-xl border border-white/5 border-dashed">
              <p className="text-xs font-bold text-slate-400 mb-1.5 uppercase font-mono">DURUM RADAR BİLGİSİ</p>
              <p className="text-xs text-slate-300 flex items-center justify-between">
                Zimmetli Toplam Taktik Ekipman:
                <span className="font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/25 px-2.5 py-0.5 rounded font-bold">{inventory.length} Adet</span>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* DataGrid Yöneticisi */}
        <Card className="backdrop-blur-md bg-slate-900/60 border border-white/10 shadow-[0_0_20px_-3px_rgba(34,211,238,0.15)] overflow-hidden rounded-2xl">
          <CardHeader className="bg-slate-950/40 border-b border-white/10 flex flex-row items-center justify-between p-5">
            <CardTitle className="text-base font-bold text-slate-200 flex items-center gap-2 tracking-tight">
              <Settings className="w-4 h-4 text-cyan-400 animate-spin-slow" />
              Taktiksel Envanter Matrisi (Anlık DB Güncelleme)
            </CardTitle>
            <Button onClick={handleAddNewItem} size="sm" variant="secondary" className="font-bold border border-white/10 bg-slate-800/80 hover:bg-slate-800 text-slate-200 text-xs rounded-lg px-3 py-1.5">
               <Plus className="w-3.5 h-3.5 mr-1 text-cyan-400"/>
               Yeni Ekipman Ekle
            </Button>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
             <table className="w-full text-sm">
                <thead className="bg-slate-950/60 text-[10px] text-slate-400 uppercase tracking-wider border-b border-white/5 font-mono">
                  <tr>
                    <th className="px-5 py-3.5 text-left font-semibold">Bölme (Kapak)</th>
                    <th className="px-5 py-3.5 text-left font-semibold">Malzeme Adı</th>
                    <th className="px-5 py-3.5 text-left font-semibold w-28">Adet</th>
                    <th className="px-5 py-3.5 text-left font-semibold w-36">Durum</th>
                    <th className="px-5 py-3.5 text-center font-semibold w-20">Eylem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-medium">
                  {inventory.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-500 italic font-mono text-xs">
                        Bu araca ait malzeme kaydı bulunamadı. "Yeni Ekipman Ekle" butonuna basarak matrise satır ekleyin.
                      </td>
                    </tr>
                  ) : inventory.map((item, index) => (
                    <tr key={item.internalId} className="hover:bg-white/5 transition-colors duration-150">
                      <td className="px-5 py-2.5 align-top">
                        <select
                          value={item.bolme}
                          onChange={(e) => handleFieldChange(item.internalId, "bolme", e.target.value)}
                          className="h-10 w-full rounded-lg border border-white/10 bg-slate-950/80 text-slate-200 px-3 py-1 text-xs focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 outline-none font-mono"
                        >
                          {Object.entries(COMPARTMENT_NAMES).map(([key, label]) => (
                            <option key={key} value={key}>{label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-5 py-2.5 align-top">
                        <Input 
                          placeholder="Ekipman ismi (Örn: 85'lik Hortum)..."
                          value={item.malzeme}
                          onChange={(e) => handleFieldChange(item.internalId, "malzeme", e.target.value)}
                          className="bg-slate-950/60 border-white/10 text-slate-200 text-xs focus:border-cyan-500/50 focus:ring-cyan-500/50 h-10"
                        />
                      </td>
                      <td className="px-5 py-2.5 align-top">
                        <Input 
                          type="number"
                          min="1"
                          value={item.adet}
                          onChange={(e) => handleFieldChange(item.internalId, "adet", e.target.value)}
                          className="bg-slate-950/60 border-white/10 text-slate-200 font-mono text-xs focus:border-cyan-500/50 focus:ring-cyan-500/50 h-10 w-20"
                        />
                      </td>
                      <td className="px-5 py-2.5 align-top">
                        <select
                          value={item.durum}
                          onChange={(e) => handleFieldChange(item.internalId, "durum", e.target.value)}
                          className="h-10 w-full rounded-lg border border-white/10 bg-slate-950/80 text-slate-200 px-3 py-1 text-xs focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 outline-none font-mono font-bold"
                        >
                           <option value="Tam" className="text-emerald-400">Tam (Eksiksiz)</option>
                           <option value="Eksik" className="text-amber-400">Eksik (Hasarsız)</option>
                           <option value="Arızalı" className="text-rose-400">Arızalı (Bakımda)</option>
                           <option value="Kayıp/Yok" className="text-slate-400">Kayıp / Yok</option>
                        </select>
                      </td>
                      <td className="px-5 py-2.5 text-center align-top">
                        <button 
                          onClick={() => handleDeleteItem(item.internalId)}
                          className="h-10 w-10 flex items-center justify-center text-slate-500 hover:bg-rose-500/10 hover:text-rose-400 rounded-lg transition-colors mx-auto border border-transparent hover:border-rose-500/20"
                          title="Satırı Kaldır"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
             </table>
          </CardContent>
          <div className="p-4 border-t border-white/10 bg-slate-950/80 backdrop-blur-md flex justify-end items-center gap-3 rounded-b-2xl md:relative sticky bottom-0 z-40"
               style={{ bottom: 'calc(68px + env(safe-area-inset-bottom, 0px))' }}>
             {saveSuccess && (
               <span className="text-xs font-mono font-bold text-emerald-400 animate-in fade-in duration-200 mr-2 flex items-center gap-1.5 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/25">
                 ✓ KOD MÜHÜRLENDİ & VERİTABANINA YAZILDI
               </span>
             )}
             <Button 
               onClick={saveInventoryToDB} 
               disabled={isSaving} 
               className="font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_15px_-3px_rgba(16,185,129,0.4)] border border-emerald-500/30 px-5"
             >
               {isSaving ? "Şifreleniyor..." : <><Save className="w-4 h-4 mr-2"/> Taktik Kaydet</>}
             </Button>
          </div>
        </Card>
      </div>


      {/* --- Hidden QR Source (never displayed, cloned to body on print) --- */}
      {mounted && (
        <div id="print-area-qr" style={{ display: 'none' }}>
           <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
              <h1 style={{ fontSize: '2rem', fontWeight: 900, marginBottom: '0.5rem', color: 'black' }}>ETİKET DİZİNİ</h1>
              <p style={{ fontSize: '1.25rem', fontWeight: 700, borderBottom: '4px solid black', paddingBottom: '1rem', marginBottom: '2rem', color: 'black' }}>Araç: {selectedPlaka}</p>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                {(printFilter === "all" ? printCompartments : [printFilter]).map(comp => (
                  <div key={comp} style={{ border: '6px solid black', padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: '1.5rem', textAlign: 'center', breakInside: 'avoid' as any, pageBreakInside: 'avoid' }}>
                     <h2 style={{ fontSize: '1.5rem', fontWeight: 900, background: 'black', color: 'white', padding: '0.5rem 1.5rem', borderRadius: '9999px', marginBottom: '2rem', whiteSpace: 'nowrap' }}>
                        {selectedPlaka}
                     </h2>
                     
                     <div style={{ background: 'white', padding: '0.5rem' }}>
                       <QRCodeSVG value={buildQrUrl(selectedPlaka, comp)} size={220} level={"H"} />
                     </div>
                     
                     <div style={{ marginTop: '2rem', borderTop: '4px solid black', width: '100%', paddingTop: '1rem' }}>
                       <h3 style={{ fontSize: '1.25rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'black' }}>{COMPARTMENT_NAMES[comp] || comp}</h3>
                       <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', fontFamily: 'monospace', marginTop: '0.75rem', letterSpacing: '0.15em', color: 'rgba(0,0,0,0.8)', fontWeight: 700 }}>Sivas İtfaiyesi</p>
                     </div>
                  </div>
                ))}
              </div>
           </div>
        </div>
      )}

    </div>
    </PageGuard>
  )
}
