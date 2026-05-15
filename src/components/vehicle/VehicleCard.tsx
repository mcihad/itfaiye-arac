import { Card, CardContent } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Truck, Printer, Edit2 } from "lucide-react"
import Link from "next/link"
import { Vehicle } from "@/types"

interface VehicleCardProps {
  vehicle: Vehicle
  onPrintQR?: (plaka: string, aracTipi: string, marka?: string) => void
  onEdit?: (vehicle: Vehicle) => void
}

export function VehicleCard({ vehicle, onPrintQR, onEdit }: VehicleCardProps) {
  const idStr = vehicle.plaka.replace(/\s+/g, '-').toLowerCase()
  
  return (
    <Card className="hover:border-primary/40 transition-all duration-200 group hover:shadow-md relative">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <Link href={`/araclar/${idStr}`} className="flex items-center space-x-4 flex-1 min-w-0">
            <div className="bg-primary/10 p-3 rounded-xl group-hover:bg-primary/20 transition-colors">
               <Truck className="w-7 h-7 text-primary group-hover:scale-110 transition-transform" />
            </div>
            <div className="min-w-0">
               <h3 className="font-bold text-lg">{vehicle.plaka}</h3>
               <p className="text-muted-foreground text-sm line-clamp-1">{vehicle.aracTipi}</p>
            </div>
          </Link>
          <div className="flex items-center gap-2 shrink-0">
            {onEdit && (
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onEdit(vehicle)
                }}
                className="p-2 rounded-lg bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition-colors cursor-pointer"
                title="Aracı Düzenle"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            )}
            {onPrintQR && (
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onPrintQR(vehicle.plaka, vehicle.aracTipi || "Araç", (vehicle as any).marka || "")
                }}
                className="p-2 rounded-lg bg-orange-500/10 text-orange-500 hover:bg-orange-500/20 transition-colors cursor-pointer"
                title="QR Etiket Yazdır"
              >
                <Printer className="w-4 h-4" />
              </button>
            )}
            <Badge variant="success" className="shadow-sm">Aktif</Badge>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-border/50">
          <p className="text-xs text-muted-foreground mb-2">Zimmetli Personel</p>
          <div className="flex flex-wrap gap-2">
              {((vehicle as any).aktifPersonel || (vehicle as any).aktif_personel || []).map((person: string) => (
              <Badge key={person} variant="outline" className="text-[10px] bg-muted/50">{person}</Badge>
              ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
