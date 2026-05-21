"use client"
import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { VehicleCard } from "@/components/vehicle/VehicleCard"
import { QRLabelModal } from "@/components/vehicle/QRLabelModal"
import { VehicleEditModal } from "@/components/vehicle/VehicleEditModal"
import { VehicleAddModal } from "@/components/vehicle/VehicleAddModal"
import { useAuthStore } from "@/lib/authStore"
import { PlusCircle, RefreshCw } from "lucide-react"

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuthStore()

  // QR Label Modal state
  const [qrModal, setQrModal] = useState<{ open: boolean; plaka: string; aracTipi: string; marka: string }>({
    open: false,
    plaka: "",
    aracTipi: "",
    marka: "",
  })

  // Edit Modal state
  const [editModal, setEditModal] = useState<{ open: boolean; vehicle: any | null }>({
    open: false,
    vehicle: null,
  })

  // Add Modal state
  const [addModalOpen, setAddModalOpen] = useState(false)

  const fetchVehicles = async () => {
    setLoading(true)
    const { data } = await api.from('vehicles').select('*')
    setVehicles(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchVehicles()
  }, [])

  const canEdit = user?.rol !== 'User'

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/50 pb-5">
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-100">Araçlar ve Envanter</h1>
          <p className="text-muted-foreground mt-1 text-sm">İstasyondaki aktif araçların listesi, taktik kodları ve anlık envanter durumları.</p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-center">
          <button
            onClick={fetchVehicles}
            disabled={loading}
            className="p-2.5 rounded-xl bg-slate-900 border border-white/10 text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer flex items-center justify-center"
            title="Yenile"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          
          {canEdit && (
            <button
              onClick={() => setAddModalOpen(true)}
              className="px-4 py-2.5 bg-slate-950 border border-emerald-500/40 hover:border-cyan-500/60 text-emerald-400 hover:text-cyan-400 shadow-[0_0_15px_-3px_rgba(16,185,129,0.2)] hover:shadow-[0_0_20px_-3px_rgba(34,211,238,0.4)] transition-all duration-300 font-extrabold rounded-xl flex items-center gap-2 text-xs md:text-sm active:scale-95 cursor-pointer uppercase tracking-wider"
            >
              <PlusCircle className="w-4 h-4 md:w-5 h-5" />
              <span>Yeni Araç Ekle</span>
            </button>
          )}
        </div>
      </div>
      
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] space-y-3">
          <div className="w-10 h-10 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
          <p className="text-sm text-slate-400">Taktik araçlar yükleniyor...</p>
        </div>
      ) : vehicles.length === 0 ? (
        <div className="p-12 text-center text-muted-foreground border border-dashed border-white/10 rounded-3xl bg-slate-900/20">
          Sistemde henüz araç bulunmamaktadır. {canEdit && "Yukarıdaki butondan ilk aracı ekleyebilirsiniz."}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {vehicles.map(v => (
            <VehicleCard
              key={v.plaka}
              vehicle={v}
              onPrintQR={(plaka, aracTipi, marka) => setQrModal({ open: true, plaka, aracTipi, marka: marka || "" })}
              onEdit={canEdit ? (vehicle) => setEditModal({ open: true, vehicle }) : undefined}
            />
          ))}
        </div>
      )}

      {/* QR Label Print Modal */}
      <QRLabelModal
        isOpen={qrModal.open}
        onClose={() => setQrModal({ open: false, plaka: "", aracTipi: "", marka: "" })}
        plaka={qrModal.plaka}
        aracTipi={qrModal.aracTipi}
        marka={qrModal.marka}
      />

      {/* Edit Modal */}
      <VehicleEditModal
        isOpen={editModal.open}
        vehicle={editModal.vehicle}
        onClose={() => setEditModal({ open: false, vehicle: null })}
        onSuccess={() => {
          setEditModal({ open: false, vehicle: null })
          fetchVehicles()
        }}
      />

      {/* Add Modal */}
      <VehicleAddModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSuccess={() => {
          setAddModalOpen(false)
          fetchVehicles()
        }}
      />
    </div>
  )
}

