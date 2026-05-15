"use client"
import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { VehicleCard } from "@/components/vehicle/VehicleCard"
import { QRLabelModal } from "@/components/vehicle/QRLabelModal"
import { VehicleEditModal } from "@/components/vehicle/VehicleEditModal"
import { useAuthStore } from "@/lib/authStore"

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
      <div className="border-b border-border/50 pb-4">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Araçlar ve Envanter</h1>
        <p className="text-muted-foreground mt-1 text-sm">İstasyondaki araçların listesi ve anlık envanter durumları.</p>
      </div>
      
      {loading ? (
        <div className="p-8 text-center text-muted-foreground">Araçlar yükleniyor...</div>
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
    </div>
  )
}

