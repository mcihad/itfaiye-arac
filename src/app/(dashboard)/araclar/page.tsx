"use client"
import { useEffect, useState, useMemo } from "react"
import Link from "next/link"
import { api, unwrap } from "@/lib/api"
import { VehicleCard } from "@/components/vehicle/VehicleCard"
import { QRLabelModal } from "@/components/vehicle/QRLabelModal"
import { VehicleEditModal } from "@/components/vehicle/VehicleEditModal"
import { VehicleAddModal } from "@/components/vehicle/VehicleAddModal"
import { useAuthStore } from "@/lib/authStore"
import { 
  PlusCircle, 
  RefreshCw, 
  Wrench, 
  Truck, 
  FileText, 
  Inbox, 
  Printer, 
  Loader2,
  Edit2,
  Trash2,
  Building2,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  Circle
} from "lucide-react"
import { Vehicle, Personnel } from "@/types"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/Dialog"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card"
import jsPDF from "jspdf"
import { Accordion, AccordionItem } from "@/components/ui/Accordion"
import { toast } from "@/lib/toast"

interface MaintenanceLog {
  id?: string;
  vehicle_id: string;
  ariza_seviyesi: string;
  aciklama: string;
  bakim_notu?: string;
  durum: string;
  eski_sube: string;
  created_at?: string;
}

export default function VehiclesPage() {
  const [activeTab, setActiveTab] = useState<"active" | "maintenance">("active")
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [personnel, setPersonnel] = useState<Personnel[]>([])
  const [maintenanceLogs, setMaintenanceLogs] = useState<MaintenanceLog[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [inspectedVehicles, setInspectedVehicles] = useState<Set<string>>(new Set())
  const { user } = useAuthStore()

  // Faz 28.51: Müfreze Filtresi
  const [branchFilter, setBranchFilter] = useState<string>("Tümü")

  // Fault report modal states
  const [arizaModalOpen, setArizaModalOpen] = useState(false)
  const [reportingPlaka, setReportingPlaka] = useState<string | null>(null)
  const [arizaSeviyesi, setArizaSeviyesi] = useState("Kritik")
  const [arizaAciklama, setArizaAciklama] = useState("")
  const [savingAriza, setSavingAriza] = useState(false)

  // Return/Discharge modal states
  const [returnModalOpen, setReturnModalOpen] = useState(false)
  const [dischargeItem, setDischargeItem] = useState<{ vehicle: Vehicle; log: MaintenanceLog } | null>(null)
  const [targetBranch, setTargetBranch] = useState("Merkez")
  const [returnNotes, setReturnNotes] = useState("")
  const [savingReturn, setSavingReturn] = useState(false)

  // Edit Log modal states
  const [editLogModalOpen, setEditLogModalOpen] = useState(false)
  const [editingLog, setEditingLog] = useState<MaintenanceLog | null>(null)
  const [editArizaSeviyesi, setEditArizaSeviyesi] = useState("Kritik")
  const [editAciklama, setEditAciklama] = useState("")
  const [editBakimNotu, setEditBakimNotu] = useState("")
  const [editDurum, setEditDurum] = useState("Bakımda")
  const [editEskiSube, setEditEskiSube] = useState("Merkez")
  const [savingLogEdit, setSavingLogEdit] = useState(false)

  // QR Label Modal state
  const [qrModal, setQrModal] = useState<{ open: boolean; plaka: string; aracTipi: string; marka: string }>({
    open: false,
    plaka: "",
    aracTipi: "",
    marka: "",
  })

  // Edit Modal state
  const [editModal, setEditModal] = useState<{ open: boolean; vehicle: Vehicle | null }>({
    open: false,
    vehicle: null,
  })

  // Add Modal state
  const [addModalOpen, setAddModalOpen] = useState(false)

  // Delete Modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deletingPlaka, setDeletingPlaka] = useState("")
  const [confirmPlakaInput, setConfirmPlakaInput] = useState("")
  const [deleting, setDeleting] = useState(false)

  // Faz 28.51: Şube Değiştir Modal state
  const [branchModalOpen, setBranchModalOpen] = useState(false)
  const [branchChangePlaka, setBranchChangePlaka] = useState<string | null>(null)
  const [newBranch, setNewBranch] = useState("Merkez")
  const [savingBranch, setSavingBranch] = useState(false)

  // Shift Responsibles Modal state
  const [responsiblesModal, setResponsiblesModal] = useState<{ open: boolean; vehicle: Vehicle | null }>({
    open: false,
    vehicle: null,
  })

  const fetchVehicles = async () => {
    setLoading(true)
    try {
      const { data } = await api.from('vehicles').select('*')
      const filtered = (data || []).filter((v: Vehicle) => v.plaka !== 'GARAJ')
      
      // Numaratik Sıralama Nizamı: filo_no ASC (küçükten büyüğe, tanımsızlar sonda)
      filtered.sort((a: Vehicle, b: Vehicle) => (a.filo_no || 999) - (b.filo_no || 999))
      setVehicles(filtered)
    } catch (err) {
      console.error("Araçlar yüklenirken hata:", err)
    } finally {
      setLoading(false)
    }
  }

  const fetchMaintenanceLogs = async () => {
    setLoadingLogs(true)
    try {
      const { data } = await api.from('maintenance_logs').select('*')
      if (data) {
        const sorted = [...data].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        setMaintenanceLogs(sorted)
      } else {
        setMaintenanceLogs([])
      }
    } catch (err) {
      console.error("Bakım logları yüklenirken hata:", err)
    } finally {
      setLoadingLogs(false)
    }
  }

  const fetchPersonnel = async () => {
    try {
      const { data } = await api.from('personnel').select('*').eq('aktif', true)
      if (data) {
        setPersonnel(data)
      }
    } catch (err) {
      console.error("Personel yüklenirken hata:", err)
    }
  }

  const fetchInspections = async () => {
    try {
      // İtfaiye Nöbet Döngüsü (Sabah 08:00 - Ertesi Sabah 08:00)
      const shiftStart = new Date()
      if (shiftStart.getHours() < 8) {
        shiftStart.setDate(shiftStart.getDate() - 1)
      }
      shiftStart.setHours(8, 0, 0, 0)
      
      const { data } = await api.from('unified_system_logs')
        .select('plaka')
        .gte('tarih', shiftStart.toISOString())
      
      if (data) {
        const plates = new Set<string>()
        data.forEach((log: any) => {
          if (log.plaka) plates.add(log.plaka)
        })
        setInspectedVehicles(plates)
      }
    } catch (err) {
      console.error("Sayım logları yüklenirken hata:", err)
    }
  }

  useEffect(() => {
    fetchVehicles()
    fetchMaintenanceLogs()
    fetchPersonnel()
    fetchInspections()
  }, [])

  const drivers = useMemo(() => {
    return personnel.filter(p => {
      const isKomuta = p.rol === 'Admin' || p.rol === 'Shift_Leader' || p.unvan === 'Amir' || p.unvan === 'Müdür';
      return !isKomuta && (
        p.rol === 'Driver' || 
        p.unvan.toLowerCase().includes('şof') || 
        p.unvan.toLowerCase().includes('sürücü')
      );
    });
  }, [personnel]);

  const ers = useMemo(() => {
    return personnel.filter(p => {
      const isKomuta = p.rol === 'Admin' || p.rol === 'Shift_Leader' || p.unvan === 'Amir' || p.unvan === 'Müdür';
      const isDriver = !isKomuta && (
        p.rol === 'Driver' || 
        p.unvan.toLowerCase().includes('şof') || 
        p.unvan.toLowerCase().includes('sürücü')
      );
      return !isKomuta && !isDriver && (
        p.unvan === 'Er' || 
        p.unvan.toLowerCase().includes('personnel')
      );
    });
  }, [personnel]);

  const handleUpdateResponsibles = async (plaka: string, updateData: any) => {
    try {
      const { error } = await api.update('vehicles', updateData, { plaka });
      if (error) throw new Error(error);
      fetchVehicles();
    } catch (err) {
      console.error("Sorumlular güncellenirken hata oluştu:", err);
      toast("Hata oluştu: Sorumlu personel atanamadı.");
    }
  };

  const canEdit = user?.rol !== 'User'

  const canDelete = useMemo(() => {
    if (!user) return false;
    const rol = user.rol;
    const unvan = (user.unvan || '').toLowerCase();
    if (rol === 'Admin' || rol === 'Editor' || rol === 'Shift_Leader') return true;
    const allowedTitles = ['müdür', 'amir', 'çavuş', 'başçavuş', 'başşöför', 'baş şoför', 'baş.çvş.', 'çvş.', 'eğitim çavuşu'];
    return allowedTitles.some(title => unvan.includes(title));
  }, [user]);

  // Turkish character encoding cleaning helper for jsPDF Helvetica font compatibility
  const cleanTurkishChars = (str: string): string => {
    if (!str) return "";
    const map: Record<string, string> = {
      'ş': 's', 'Ş': 'S',
      'ğ': 'g', 'Ğ': 'G',
      'ı': 'i', 'İ': 'I',
      'ö': 'o', 'Ö': 'O',
      'ü': 'u', 'Ü': 'U',
      'ç': 'c', 'Ç': 'C'
    };
    return str.replace(/[şŞğĞıİöÖüÜçÇ]/g, m => map[m] || m);
  };

  const handleDeleteVehicle = async () => {
    if (!deletingPlaka) return;
    if (confirmPlakaInput.trim().toUpperCase() !== deletingPlaka.toUpperCase()) {
      toast("Girdiğiniz plaka uyuşmuyor.");
      return;
    }

    try {
      setDeleting(true);
      unwrap(await api.remove('vehicle_maintenances', { plaka: deletingPlaka }));
      unwrap(await api.remove('fuel_logs', { plaka: deletingPlaka }));
      const { error } = await api.remove('vehicles', { plaka: deletingPlaka });
      
      if (error) {
        throw new Error(error);
      }
      
      setDeleteModalOpen(false);
      setDeletingPlaka("");
      setConfirmPlakaInput("");
      fetchVehicles();
      toast("Araç ve ilişkili tüm kayıtlar başarıyla silindi.");
    } catch (err: any) {
      console.error("Araç silinirken hata:", err);
      toast("Araç silinemedi: " + (err.message || err));
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveAriza = async () => {
    if (!reportingPlaka) return;
    if (!arizaAciklama.trim()) {
      toast("Lütfen arıza açıklamasını girin.");
      return;
    }

    try {
      setSavingAriza(true);
      const targetVehicle = vehicles.find(v => v.plaka === reportingPlaka);
      if (!targetVehicle) {
        toast("Araç bulunamadı.");
        return;
      }

      // 1. Insert into maintenance_logs
      const logId = crypto.randomUUID();
      const logData = {
        id: logId,
        vehicle_id: targetVehicle.id,
        plaka: targetVehicle.plaka,
        tip: targetVehicle.arac_tipi || targetVehicle.aracTipi || 'İtfaiye Aracı',
        aciklama: arizaAciklama.trim(),
        tarih: new Date().toISOString().split('T')[0],
        yapanKisi: user ? `${user.ad} ${user.soyad}` : 'Bilinmeyen',
        ariza_seviyesi: arizaSeviyesi,
        durum: 'Bakımda',
        eski_sube: targetVehicle.current_branch || 'Merkez',
        bildiren_personel_id: null,
        created_at: new Date().toISOString()
      };
      
      const resLog = await api.insert('maintenance_logs', logData);
      if (resLog.error) throw new Error(resLog.error);

      // 1b. Simultaneously insert into vehicle_maintenances
      const vehicleMaintenanceData = {
        id: logId,
        plaka: targetVehicle.plaka,
        tarih: new Date().toISOString().split('T')[0],
        islem_turu: 'Arıza/Tamir',
        aciklama: `Arıza/Tamir: ${arizaAciklama.trim()} (Seviye: ${arizaSeviyesi})`,
        maliyet: 0,
        durum: 'Bekliyor', // pending manager approval in the maintenance module
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      const resVehMaint = await api.insert('vehicle_maintenances', vehicleMaintenanceData);
      if (resVehMaint.error) throw new Error(resVehMaint.error);

      // 2. Update vehicle's current_branch and status
      const resVeh = await api.update(
        'vehicles',
        { 
          current_branch: 'Makine İkmal Müdürlüğü (Bakım-Onarım)', 
          durum: 'arizali' 
        },
        { id: targetVehicle.id }
      );
      if (resVeh.error) throw new Error(resVeh.error);

      // Audit Log
      fetch('/api/audit-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action_type: 'ariza_bildirim',
          actor_sicil_no: user?.sicilNo || 'unknown',
          actor_name: user ? `${user.ad} ${user.soyad}` : 'Bilinmeyen',
          target: reportingPlaka,
          details: {
            ariza_seviyesi: arizaSeviyesi,
            aciklama: arizaAciklama.trim(),
            eski_sube: targetVehicle.current_branch || 'Merkez',
          },
        }),
      }).catch(err => console.error('[AuditLog] Arıza logu gönderilemedi:', err));

      toast("Arıza başarıyla bildirildi. Araç Makine İkmal Müdürlüğü (Bakım-Onarım) şubesine sevk edildi.");
      setArizaModalOpen(false);
      setArizaAciklama("");
      setArizaSeviyesi("Kritik");
      setReportingPlaka(null);
      fetchVehicles();
      fetchMaintenanceLogs();
    } catch (err: any) {
      console.error(err);
      toast("Arıza bildirilirken hata oluştu: " + err.message);
    } finally {
      setSavingAriza(false);
    }
  };

  const handleOpenReturnModal = (item: { vehicle: Vehicle; log: MaintenanceLog }) => {
    setDischargeItem(item);
    setTargetBranch(item.log?.eski_sube || "Merkez");
    setReturnNotes("");
    setReturnModalOpen(true);
  };

  const handleSaveReturn = async () => {
    if (!dischargeItem) return;
    
    try {
      setSavingReturn(true);
      const { vehicle, log } = dischargeItem;
      
      // 1. Update vehicle current_branch to targetBranch and status back to 'aktif'
      const resVeh = await api.update(
        'vehicles',
        { current_branch: targetBranch, durum: 'aktif' },
        { id: vehicle.id }
      );
      if (resVeh.error) throw new Error(resVeh.error);

      // 2. Update maintenance_log status to 'Taburcu Edildi'
      if (log && log.id) {
        const resLog = await api.update(
          'maintenance_logs',
          { durum: 'Taburcu Edildi', bakim_notu: returnNotes.trim() },
          { id: log.id }
        );
        if (resLog.error) throw new Error(resLog.error);

        // Simultaneously update corresponding vehicle_maintenances record!
        // (api.* reject etmez; .catch hiç tetiklenmiyordu — error alanı kontrol edilir)
        const resMaint = await api.update(
          'vehicle_maintenances',
          {
            durum: 'Onaylandı',
            aciklama: log.aciklama + (returnNotes.trim() ? `\n\n[Bakım Notu]: ${returnNotes.trim()}` : '')
          },
          { id: log.id }
        );
        if (resMaint.error) console.error('[Sync] vehicle_maintenances güncellenemedi:', resMaint.error);
      }

      // Audit Log
      fetch('/api/audit-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action_type: 'ariza_taburcu',
          actor_sicil_no: user?.sicilNo || 'unknown',
          actor_name: user ? `${user.ad} ${user.soyad}` : 'Bilinmeyen',
          target: vehicle.plaka,
          details: {
            hedef_sube: targetBranch,
            bakim_notu: returnNotes.trim(),
          },
        }),
      }).catch(err => console.error('[AuditLog] Taburcu logu gönderilemedi:', err));

      toast(`${vehicle.plaka} başarıyla taburcu edildi ve ${targetBranch} şubesine sevk edildi.`);
      setReturnModalOpen(false);
      setDischargeItem(null);
      setReturnNotes("");
      setTargetBranch("Merkez");
      fetchVehicles();
      fetchMaintenanceLogs();
    } catch (err: any) {
      console.error(err);
      toast("Araç taburcu edilirken hata oluştu: " + err.message);
    } finally {
      setSavingReturn(false);
    }
  };

  const handleOpenEditLogModal = (item: { vehicle: Vehicle; log: MaintenanceLog }) => {
    setEditingLog(item.log);
    setEditArizaSeviyesi(item.log.ariza_seviyesi || "Kritik");
    setEditAciklama(item.log.aciklama || "");
    setEditBakimNotu(item.log.bakim_notu || "");
    setEditDurum(item.log.durum || "Bakımda");
    setEditEskiSube(item.log.eski_sube || "Merkez");
    setEditLogModalOpen(true);
  };

  const handleSaveLogEdit = async () => {
    if (!editingLog) return;
    if (!editAciklama.trim()) {
      toast("Lütfen arıza açıklamasını girin.");
      return;
    }
    
    try {
      setSavingLogEdit(true);
      
      const updates = {
        ariza_seviyesi: editArizaSeviyesi,
        aciklama: editAciklama.trim(),
        bakim_notu: editBakimNotu.trim(),
        durum: editDurum,
        eski_sube: editEskiSube
      };
      
      const resLog = await api.update('maintenance_logs', updates, { id: editingLog.id });
      if (resLog.error) throw new Error(resLog.error);
      
      // If durum changed, align vehicle status
      if (editDurum !== editingLog.durum) {
        const vehicle = vehicles.find(v => v.id === editingLog.vehicle_id);
        if (vehicle) {
          if (editDurum === 'Taburcu Edildi') {
            unwrap(await api.update(
              'vehicles',
              { current_branch: editEskiSube, durum: 'aktif' },
              { id: vehicle.id }
            ));
          } else if (editDurum === 'Bakımda') {
            unwrap(await api.update(
              'vehicles',
              { current_branch: 'Makine İkmal Müdürlüğü (Bakım-Onarım)', durum: 'arizali' },
              { id: vehicle.id }
            ));
          }
        }
      }

      // Simultaneously update corresponding vehicle_maintenances record!
      const statusMaint = editDurum === 'Taburcu Edildi' ? 'Onaylandı' : 'Bekliyor';
      const editSync = await api.update(
        'vehicle_maintenances',
        {
          aciklama: `Arıza/Tamir: ${editAciklama.trim()} (Seviye: ${editArizaSeviyesi})` + (editBakimNotu.trim() ? `\n\n[Bakım Notu]: ${editBakimNotu.trim()}` : ''),
          durum: statusMaint
        },
        { id: editingLog.id }
      );
      if (editSync.error) console.error('[Sync] vehicle_maintenances güncellenemedi:', editSync.error);
      
      toast("Arıza kaydı başarıyla güncellendi.");
      setEditLogModalOpen(false);
      setEditingLog(null);
      fetchVehicles();
      fetchMaintenanceLogs();
    } catch (err: any) {
      console.error(err);
      toast("Kayıt güncellenirken hata oluştu: " + err.message);
    } finally {
      setSavingLogEdit(false);
    }
  };

  const handleDeleteLog = async (log: MaintenanceLog) => {
    if (!confirm("Bu arıza kaydını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.")) return;
    
    try {
      const resDel = await api.remove('maintenance_logs', { id: log.id });
      if (resDel.error) throw new Error(resDel.error);
      
      // If deleted log was active (Bakımda), restore vehicle to active branch
      if (log.durum === 'Bakımda') {
        const vehicle = vehicles.find(v => v.id === log.vehicle_id);
        if (vehicle) {
          const resVeh = await api.update(
            'vehicles',
            { current_branch: log.eski_sube || 'Merkez', durum: 'aktif' },
            { id: vehicle.id }
          );
          if (resVeh.error) throw new Error(resVeh.error);
        }
      }

      // Simultaneously delete from vehicle_maintenances
      // (api.* reject etmez; .catch hiç tetiklenmiyordu — error alanı kontrol edilir)
      if (log.id) {
        const resSyncDel = await api.remove('vehicle_maintenances', { id: log.id });
        if (resSyncDel.error) console.error('[Sync] vehicle_maintenances silinemedi:', resSyncDel.error);
      }
      
      toast("Arıza kaydı başarıyla silindi.");
      fetchVehicles();
      fetchMaintenanceLogs();
    } catch (err: any) {
      console.error(err);
      toast("Kayıt silinirken hata oluştu: " + err.message);
    }
  };
  // Faz 28.51: Şube Değiştir Handler
  const handleSaveBranchChange = async () => {
    if (!branchChangePlaka) return;

    try {
      setSavingBranch(true);
      const targetVehicle = vehicles.find(v => v.plaka === branchChangePlaka);
      if (!targetVehicle) {
        toast("Araç bulunamadı.");
        return;
      }

      const oldBranch = targetVehicle.current_branch || 'Merkez';
      if (newBranch === oldBranch) {
        toast("Araç zaten bu şubede kayıtlı.");
        return;
      }

      const resVeh = await api.update(
        'vehicles',
        { current_branch: newBranch },
        { id: targetVehicle.id }
      );
      if (resVeh.error) throw new Error(resVeh.error);

      // Audit Log
      fetch('/api/audit-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action_type: 'sube_degisiklik',
          actor_sicil_no: user?.sicilNo || 'unknown',
          actor_name: user ? `${user.ad} ${user.soyad}` : 'Bilinmeyen',
          target: branchChangePlaka,
          details: {
            eski_sube: oldBranch,
            yeni_sube: newBranch,
          },
        }),
      }).catch(err => console.error('[AuditLog] Şube değişiklik logu gönderilemedi:', err));

      toast(`${branchChangePlaka} başarıyla "${newBranch}" şubesine atandı.`);
      setBranchModalOpen(false);
      setBranchChangePlaka(null);
      setNewBranch("Merkez");
      fetchVehicles();
    } catch (err: any) {
      console.error(err);
      toast("Şube değiştirilirken hata oluştu: " + err.message);
    } finally {
      setSavingBranch(false);
    }
  };

  const handlePrintServiceForm = (item: { vehicle: Vehicle; log: MaintenanceLog }) => {
    const { vehicle, log } = item;
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4"
    });

    const clean = cleanTurkishChars;

    // Double Border
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.7);
    doc.rect(10, 10, 190, 277);
    
    doc.setLineWidth(0.3);
    doc.rect(11.5, 11.5, 187, 274);

    // Header logo & text area
    doc.setLineWidth(0.5);
    doc.line(15, 42, 195, 42);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(clean("SİVAS BELEDİYE BAŞKANLIĞI"), 105, 20, { align: "center" });
    doc.setFontSize(12);
    doc.text(clean("İtfaiye Müdürlüğü"), 105, 26, { align: "center" });
    doc.setFontSize(14);
    doc.text(clean("ARAÇ BAKIM VE SERVİS TALEP FORMU"), 105, 36, { align: "center" });

    // Document Details Table / Fields
    let y = 50;
    const drawRow = (label: string, value: string) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(clean(label) + ":", 20, y);
      doc.setFont("helvetica", "normal");
      doc.text(clean(value), 65, y);
      y += 8;
    };

    const plaka = vehicle.plaka || "—";
    const typeStr = vehicle.arac_tipi || vehicle.aracTipi || "—";
    const filo = vehicle.filo_no ? String(vehicle.filo_no) : "—";
    const markaModel = `${vehicle.marka || ""} / ${vehicle.model || vehicle.aciklama || ""}`;
    const arizaSeviyesi = log?.ariza_seviyesi || "Kritik";
    const girisTarihi = log?.created_at ? new Date(log.created_at).toLocaleString("tr-TR") : new Date().toLocaleString("tr-TR");

    drawRow("Araç Plakası", plaka);
    drawRow("Araç Tipi / Filo No", `${typeStr} (Filo No: ${filo})`);
    drawRow("Marka / Model", markaModel);
    drawRow("Arıza Seviyesi", arizaSeviyesi);
    drawRow("Giriş Tarihi / Saat", girisTarihi);

    // Fault description multi-line box
    doc.setFont("helvetica", "bold");
    doc.text(clean("Arıza / Bakım Açıklaması:"), 20, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    
    const splitText = doc.splitTextToSize(clean(log?.aciklama || "Açıklama girilmemiş."), 165);
    doc.text(splitText, 20, y);
    
    y += splitText.length * 5 + 10;
    
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.line(15, y, 195, y);
    y += 10;

    // Directives Section
    doc.setFont("helvetica", "bold");
    doc.text(clean("MAKİNE İKMAL MÜDÜRLÜĞÜ İNCELEME NOTLARI:"), 20, y);
    y += 8;
    
    // Draw an empty box for physical notes
    doc.setDrawColor(180, 180, 180);
    doc.rect(20, y, 170, 40);
    
    y += 50;

    // Signatures Section
    const imzaY = y + 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    
    doc.text(clean("TESLİM EDEN"), 45, imzaY, { align: "center" });
    doc.text(clean("İstasyon Amiri / Personel"), 45, imzaY + 5, { align: "center" });
    
    doc.text(clean("TESLİM ALAN"), 150, imzaY, { align: "center" });
    doc.text(clean("Makine İkmal Yetkilisi"), 150, imzaY + 5, { align: "center" });
    
    doc.setFont("helvetica", "normal");
    doc.text("İmza: ........................", 45, imzaY + 20, { align: "center" });
    doc.text("İmza: ........................", 150, imzaY + 20, { align: "center" });

    doc.save(`Servis_Talep_Formu_${plaka.replace(/\s+/g, "_")}.pdf`);
  };

  // Filter vehicles by tab
  const activeVehicles = useMemo(() => {
    return vehicles.filter(v => v.current_branch !== 'Makine İkmal Müdürlüğü (Bakım-Onarım)')
  }, [vehicles])

  // Group active vehicles by branch for Accordion
  const groupedActiveVehicles = useMemo(() => {
    const groups = {
      Merkez: [] as Vehicle[],
      Esentepe: [] as Vehicle[],
      OSB: [] as Vehicle[]
    }
    activeVehicles.forEach(v => {
      const br = v.current_branch || 'Merkez'
      if (br === 'Esentepe') groups.Esentepe.push(v)
      else if (br === 'OSB (Organize)') groups.OSB.push(v)
      else groups.Merkez.push(v)
    })
    return groups
  }, [activeVehicles])

  const getPersonnelName = (id?: string | null) => {
    if (!id) return null;
    const person = personnel.find(p => p.id === id);
    if (!person) return null;
    return `${person.ad} ${person.soyad}`;
  };

  const maintenanceVehicles = useMemo(() => {
    return vehicles.filter(v => v.current_branch === 'Makine İkmal Müdürlüğü (Bakım-Onarım)')
  }, [vehicles])

  const renderPlateHeader = (plaka: string) => {
    const isPlate = plaka.match(/(\d{2}\s+[A-Z]+\s+\d+)/i);
    if (!isPlate) return <span className="font-bold tracking-tight text-[var(--fd-text2)] font-sans text-sm">{plaka}</span>;
    return (
      <div className="inline-flex items-center border border-[var(--fd-border)] rounded bg-[var(--fd-surface2)] overflow-hidden text-[12px] font-mono leading-none shadow-[var(--fd-shadow-sm)]">
        <span className="bg-blue-600 text-white px-2 py-1.5 text-[9px] font-black select-none">TR</span>
        <span className="px-3 py-1.5 text-[var(--fd-text)] font-bold tracking-wider whitespace-nowrap">{plaka}</span>
      </div>
    );
  };

  const getStatusBadge = (durum?: string) => {
    const d = (durum || 'aktif').toLowerCase()
    switch (d) {
      case 'aktif':
        return <Badge className="bg-[var(--fd-success)]/10 text-[var(--fd-success)] border border-[var(--fd-success)]/20 text-[9px] font-bold tracking-wide uppercase px-2 py-0.5 shrink-0">AKTİF</Badge>
      case 'bakimda':
        return <Badge className="bg-[var(--fd-amber)]/10 text-[var(--fd-amber)] border border-[var(--fd-amber)]/20 text-[9px] font-bold tracking-wide uppercase px-2 py-0.5 shrink-0">BAKIMDA</Badge>
      case 'arizali':
        return <Badge className="bg-[var(--fd-danger)]/10 text-[var(--fd-danger)] border border-[var(--fd-danger)]/20 text-[9px] font-bold tracking-wide uppercase px-2 py-0.5 animate-pulse shrink-0">ARIZALI</Badge>
      default:
        return <Badge className="bg-[var(--fd-surface3)] text-[var(--fd-text3)] border border-[var(--fd-border)] text-[9px] font-bold tracking-wide uppercase px-2 py-0.5 shrink-0">PASİF</Badge>
    }
  }

  const getInspectionStatusText = (dateStr: string | undefined | null) => {
    if (!dateStr) return 'Tarih Girilmedi';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 'Geçersiz Tarih';
    const now = new Date();
    const d1 = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    const d2 = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const diffTime = d1 - d2;
    const remainingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (remainingDays <= 0) return 'Muayene Geçti!';
    if (remainingDays <= 30) return `${remainingDays} Gün Kaldı`;
    return `${remainingDays} Gün Kaldı`;
  }

  const getInspectionBadgeClass = (dateStr: string | undefined | null) => {
    if (!dateStr) return 'bg-[var(--fd-surface3)] text-[var(--fd-text3)] border border-[var(--fd-border)]';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 'bg-[var(--fd-surface3)] text-[var(--fd-text3)] border border-[var(--fd-border)]';
    const now = new Date();
    const d1 = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    const d2 = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const diffTime = d1 - d2;
    const remainingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (remainingDays <= 0) return 'bg-[var(--fd-danger)]/15 text-[var(--fd-danger)] border border-[var(--fd-danger)]/25 animate-pulse';
    if (remainingDays <= 30) return 'bg-[var(--fd-amber)]/10 text-[var(--fd-amber)] border border-[var(--fd-amber)]/25';
    return 'bg-[var(--fd-success)]/10 text-[var(--fd-success)] border border-[var(--fd-success)]/20';
  }

  const renderVehicleAccordionList = (branchVehicles: Vehicle[]) => {
    return (
      <Accordion className="mt-3">
        {branchVehicles.map(v => (
          <AccordionItem
            key={v.plaka}
            value={v.plaka}
            trigger={
              <div className="flex flex-wrap items-center justify-between gap-3 w-full pr-3 text-xs sm:text-sm">
                <div className="flex items-center gap-3">
                  {renderPlateHeader(v.plaka)}
                  {v.filo_no && (
                    <Badge className="bg-[var(--fd-surface3)] text-[var(--fd-text2)] border border-[var(--fd-border)] font-mono font-bold text-[10px]">
                      Filo {v.filo_no}
                    </Badge>
                  )}
                  <span className="font-semibold text-[var(--fd-text)] hidden sm:inline">{v.marka || v.model || ''}</span>
                </div>
                <div className="flex items-center gap-2">
                  {inspectedVehicles.has(v.plaka) ? (
                    <div className="flex items-center gap-1 text-[var(--fd-success)] bg-[var(--fd-success)]/10 px-2 py-0.5 rounded-full border border-[var(--fd-success)]/20" title="Bu posta döngüsünde sayımı yapıldı">
                      <CheckCircle2 className="w-3 h-3" />
                      <span className="text-[9px] font-bold tracking-wide uppercase hidden md:inline">Sayım Tamam</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-[var(--fd-amber)] bg-[var(--fd-amber)]/10 px-2 py-0.5 rounded-full border border-[var(--fd-amber)]/20" title="Bu posta döngüsünde henüz sayılmadı">
                      <Circle className="w-3 h-3" />
                      <span className="text-[9px] font-bold tracking-wide uppercase hidden md:inline">Sayım Bekliyor</span>
                    </div>
                  )}
                  <Badge variant="outline" className="text-[10px] font-semibold text-[var(--fd-text3)] uppercase">
                    {v.arac_tipi || v.aracTipi}
                  </Badge>
                  {getStatusBadge(v.durum)}
                </div>
              </div>
            }
          >
            {/* Expanded Content */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-[var(--fd-text)] text-xs sm:text-sm pt-2">
              {/* Left Column: Core Info & Link to Schematic */}
              <div className="space-y-3 border-r border-[var(--fd-border)]/40 pr-0 lg:pr-6">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--fd-text3)] font-medium">Model / Marka:</span>
                  <span className="font-bold">{v.model && v.model.toLowerCase().startsWith((v.marka || '').toLowerCase()) ? v.model : `${v.marka || ''} ${v.model || ''}`}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--fd-text3)] font-medium">Kilometre (KM):</span>
                  <span className="font-mono font-bold">{v.km ? v.km.toLocaleString('tr-TR') : '0'} km</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--fd-text3)] font-medium">Motor Saati (PTO):</span>
                  <span className="font-mono font-bold">{v.motorSaatiPTO || '0'} sa</span>
                </div>
                <Link 
                  href={`/araclar/${v.plaka.replace(/\s+/g, '-').toLowerCase()}`}
                  className="mt-4 flex items-center justify-center gap-2 w-full py-2.5 bg-[var(--fd-accent)]/10 hover:bg-[var(--fd-accent)]/20 text-[var(--fd-accent)] border border-[var(--fd-accent)]/30 rounded-xl font-bold transition-all text-center"
                >
                  🚒 CBS Taktik Donanım Şeması
                </Link>
              </div>

              {/* Middle Column: Sorumlular */}
              <div className="space-y-3.5 border-r border-[var(--fd-border)]/40 pr-0 lg:pr-6 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold text-[var(--fd-text3)] uppercase tracking-wider block font-mono mb-2.5">🔒 POSTA SORUMLULARI</span>
                  <div className="space-y-2.5 py-1 text-xs">
                    <div className="flex items-center justify-between border-b border-[var(--fd-border)]/30 pb-1.5">
                      <span className="font-semibold text-[var(--fd-text2)]">1. Posta:</span>
                      <span className="text-[var(--fd-text)] font-mono text-[11px] truncate max-w-[180px]" title={`${getPersonnelName(v.sorumlu_sofor_id_p1) || 'Şoför Atanmadı'} / ${getPersonnelName(v.sorumlu_er_id_p1) || 'Er Atanmadı'}`}>
                        {getPersonnelName(v.sorumlu_sofor_id_p1) || "Şoför Yok"} / {getPersonnelName(v.sorumlu_er_id_p1) || "Er Yok"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-b border-[var(--fd-border)]/30 pb-1.5">
                      <span className="font-semibold text-[var(--fd-text2)]">2. Posta:</span>
                      <span className="text-[var(--fd-text)] font-mono text-[11px] truncate max-w-[180px]" title={`${getPersonnelName(v.sorumlu_sofor_id_p2) || 'Şoför Atanmadı'} / ${getPersonnelName(v.sorumlu_er_id_p2) || 'Er Atanmadı'}`}>
                        {getPersonnelName(v.sorumlu_sofor_id_p2) || "Şoför Yok"} / {getPersonnelName(v.sorumlu_er_id_p2) || "Er Yok"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[var(--fd-text2)]">3. Posta:</span>
                      <span className="text-[var(--fd-text)] font-mono text-[11px] truncate max-w-[180px]" title={`${getPersonnelName(v.sorumlu_sofor_id_p3) || 'Şoför Atanmadı'} / ${getPersonnelName(v.sorumlu_er_id_p3) || 'Er Atanmadı'}`}>
                        {getPersonnelName(v.sorumlu_sofor_id_p3) || "Şoför Yok"} / {getPersonnelName(v.sorumlu_er_id_p3) || "Er Yok"}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setResponsiblesModal({ open: true, vehicle: v })}
                  className="mt-3 flex items-center justify-center gap-1.5 w-full py-2 bg-[var(--fd-accent)]/10 hover:bg-[var(--fd-accent)]/20 text-[var(--fd-accent)] border border-[var(--fd-accent)]/30 rounded-xl font-bold transition-all text-center text-xs cursor-pointer active:scale-[0.98]"
                >
                  👤 Araç Sorumlularını Düzenle
                </button>
              </div>

              {/* Right Column: Muayene Tarihi & Eylemler */}
              <div className="space-y-4">
                <div className="bg-[var(--fd-surface2)]/40 border border-[var(--fd-border)] p-3 rounded-xl space-y-2">
                  <span className="text-[10px] font-bold text-[var(--fd-text3)] uppercase tracking-wider block font-mono">Muayene / Belge Geçerlilik</span>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[var(--fd-text2)]">{v.next_inspection_date ? new Date(v.next_inspection_date).toLocaleDateString('tr-TR') : 'Tarih Girilmedi'}</span>
                    <Badge className={getInspectionBadgeClass(v.next_inspection_date)}>
                      {getInspectionStatusText(v.next_inspection_date)}
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    onClick={() => setQrModal({ open: true, plaka: v.plaka, aracTipi: v.arac_tipi || v.aracTipi || '', marka: v.marka || '' })}
                    className="flex-1 min-w-[100px] h-8 bg-[var(--fd-surface2)] hover:bg-[var(--fd-surface3)] border border-[var(--fd-border)] text-[var(--fd-text2)] hover:text-[var(--fd-text)] rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    QR Barkod
                  </button>
                  
                  {canEdit && (
                    <button
                      onClick={() => setEditModal({ open: true, vehicle: v })}
                      className="flex-1 min-w-[100px] h-8 bg-[var(--fd-accent)]/10 hover:bg-[var(--fd-accent)]/20 border border-[var(--fd-accent)]/30 text-[var(--fd-accent)] rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      Düzenle
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setReportingPlaka(v.plaka);
                      setArizaModalOpen(true);
                    }}
                    className="flex-1 min-w-[100px] h-8 bg-[var(--fd-danger)]/10 hover:bg-[var(--fd-danger)]/20 border border-[var(--fd-danger)]/30 text-[var(--fd-danger)] rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Arıza Bildir
                  </button>

                  {canEdit && (
                    <button
                      onClick={() => {
                        const targetVehicle = vehicles.find(veh => veh.plaka === v.plaka);
                        setBranchChangePlaka(v.plaka);
                        setNewBranch(targetVehicle?.current_branch || 'Merkez');
                        setBranchModalOpen(true);
                      }}
                      className="flex-1 min-w-[100px] h-8 bg-[var(--fd-accent)]/10 hover:bg-[var(--fd-accent)]/20 border border-[var(--fd-accent)]/30 text-[var(--fd-accent)] rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      Şube Değiştir
                    </button>
                  )}
                </div>
              </div>
            </div>
          </AccordionItem>
        ))}
      </Accordion>
    )
  }

  return (
    <div className="space-y-6 w-full max-w-full pb-12 animate-in fade-in duration-300">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[var(--fd-border)] pb-5">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--fd-text)]">Araçlar ve Envanter</h1>
          <p className="text-[var(--fd-text3)] mt-1 text-xs sm:text-sm">İstasyondaki aktif araçların listesi, taktik kodları ve anlık envanter durumları.</p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-center">
          <button
            onClick={() => { fetchVehicles(); fetchMaintenanceLogs(); }}
            disabled={loading}
            className="p-2 bg-[var(--fd-surface)] border border-[var(--fd-border)] text-[var(--fd-text2)] hover:text-[var(--fd-text)] hover:bg-[var(--fd-surface2)] transition-all rounded-xl cursor-pointer flex items-center justify-center"
            title="Yenile"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          
          {canEdit && (
            <button
              onClick={() => setAddModalOpen(true)}
              className="px-4 py-2 bg-[var(--fd-surface)] border border-[var(--fd-accent)]/30 hover:border-[var(--fd-accent)] text-[var(--fd-accent)] shadow-[var(--fd-shadow-sm)] hover:bg-[var(--fd-accent-soft)] hover:shadow-[0_0_15px_var(--fd-accent-glow)] transition-all font-semibold rounded-xl flex items-center gap-2 text-xs md:text-sm active:scale-95 cursor-pointer uppercase tracking-wider"
            >
              <PlusCircle className="w-4 h-4 md:w-5 h-5" />
              <span>Yeni Araç Ekle</span>
            </button>
          )}

          {canDelete && (
            <button
              onClick={() => {
                setConfirmPlakaInput("");
                setDeletingPlaka("");
                setDeleteModalOpen(true);
              }}
              className="px-4 py-2 bg-[var(--fd-surface)] border border-[var(--fd-danger)]/30 hover:border-[var(--fd-danger)] text-[var(--fd-danger)] shadow-[var(--fd-shadow-sm)] hover:bg-[var(--fd-danger)]/5 transition-all font-semibold rounded-xl flex items-center gap-2 text-xs md:text-sm active:scale-95 cursor-pointer uppercase tracking-wider"
            >
              <Trash2 className="w-4 h-4 md:w-5 h-5" />
              <span>Araç Sil</span>
            </button>
          )}
        </div>
      </div>

      {/* Tab Selection Row */}
      <div className="flex gap-2 p-1 bg-[var(--fd-surface2)]/50 backdrop-blur-md rounded-xl border border-[var(--fd-border)] self-start print:hidden">
        <button
          onClick={() => setActiveTab("active")}
          className={`px-4 py-2 text-xs md:text-sm font-bold rounded-lg transition-all flex items-center gap-2 cursor-pointer ${activeTab === "active" ? "bg-[var(--fd-accent)] text-white shadow-[0_0_10px_var(--fd-accent-glow)]" : "text-[var(--fd-text3)] hover:text-[var(--fd-text)]"}`}
        >
          <Truck className="w-4 h-4" />
          <span>🚒 Aktif Görev Filosu ({activeVehicles.length})</span>
        </button>
        <button
          onClick={() => setActiveTab("maintenance")}
          className={`px-4 py-2 text-xs md:text-sm font-bold rounded-lg transition-all flex items-center gap-2 cursor-pointer ${activeTab === "maintenance" ? "bg-[var(--fd-accent)] text-white shadow-[0_0_10px_var(--fd-accent-glow)]" : "text-[var(--fd-text3)] hover:text-[var(--fd-text)]"}`}
        >
          <Wrench className="w-4 h-4" />
          <span>🔧 Makine İkmal / Arıza Havuzu ({maintenanceVehicles.length})</span>
        </button>
      </div>
      
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] space-y-3">
          <Loader2 className="w-10 h-10 text-[var(--fd-accent)] animate-spin" />
          <p className="text-sm text-[var(--fd-text3)]">Taktik araçlar yükleniyor...</p>
        </div>
      ) : activeTab === "active" ? (
        /* ════════════════ TAB 1: AKTİF GÖREV FİLOSU ════════════════ */
        <div className="animate-in fade-in duration-200">
          <Accordion defaultValue={['Merkez', 'Esentepe', 'OSB']}>
            <AccordionItem
              value="Merkez"
              trigger={
                <div className="flex items-center justify-between gap-3 pr-2">
                  <div className="flex items-center gap-2.5">
                    <span className="text-base">🏢</span>
                    <span className="text-sm font-bold tracking-tight text-[var(--fd-text)]">Merkez Şubesi (Karargâh)</span>
                  </div>
                  <Badge className="bg-[var(--fd-accent)]/10 border border-[var(--fd-accent)]/20 text-[var(--fd-accent)] font-mono text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                    {groupedActiveVehicles.Merkez.length} Araç
                  </Badge>
                </div>
              }
            >
              {groupedActiveVehicles.Merkez.length === 0 ? (
                <div className="py-8 text-center text-[var(--fd-text3)] text-xs italic font-mono">
                  Şubede aktif görevli araç bulunmamaktadır.
                </div>
              ) : (
                renderVehicleAccordionList(groupedActiveVehicles.Merkez)
              )}
            </AccordionItem>

            <AccordionItem
              value="Esentepe"
              trigger={
                <div className="flex items-center justify-between gap-3 pr-2">
                  <div className="flex items-center gap-2.5">
                    <span className="text-base">📍</span>
                    <span className="text-sm font-bold tracking-tight text-[var(--fd-text)]">Esentepe Müfrezesi</span>
                  </div>
                  <Badge className="bg-[var(--fd-accent)]/10 border border-[var(--fd-accent)]/20 text-[var(--fd-accent)] font-mono text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                    {groupedActiveVehicles.Esentepe.length} Araç
                  </Badge>
                </div>
              }
            >
              {groupedActiveVehicles.Esentepe.length === 0 ? (
                <div className="py-8 text-center text-[var(--fd-text3)] text-xs italic font-mono">
                  Şubede aktif görevli araç bulunmamaktadır.
                </div>
              ) : (
                renderVehicleAccordionList(groupedActiveVehicles.Esentepe)
              )}
            </AccordionItem>

            <AccordionItem
              value="OSB"
              trigger={
                <div className="flex items-center justify-between gap-3 pr-2">
                  <div className="flex items-center gap-2.5">
                    <span className="text-base">🏭</span>
                    <span className="text-sm font-bold tracking-tight text-[var(--fd-text)]">Organize Sanayi (OSB) Müfrezesi</span>
                  </div>
                  <Badge className="bg-[var(--fd-accent)]/10 border border-[var(--fd-accent)]/20 text-[var(--fd-accent)] font-mono text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                    {groupedActiveVehicles.OSB.length} Araç
                  </Badge>
                </div>
              }
            >
              {groupedActiveVehicles.OSB.length === 0 ? (
                <div className="py-8 text-center text-[var(--fd-text3)] text-xs italic font-mono">
                  Şubede aktif görevli araç bulunmamaktadır.
                </div>
              ) : (
                renderVehicleAccordionList(groupedActiveVehicles.OSB)
              )}
            </AccordionItem>
          </Accordion>
        </div>
      ) : (
        /* ════════════════ TAB 2: MAKİNE İKMAL / ARIZA HAVUZU ════════════════ */
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Header info */}
          <div className="flex justify-between items-center bg-[var(--fd-surface2)]/40 border border-[var(--fd-border)] p-5 rounded-2xl">
            <div>
              <h3 className="text-base font-bold text-[var(--fd-text)] flex items-center gap-2">
                <Wrench className="w-5 h-5 text-[var(--fd-danger)] animate-spin" style={{ animationDuration: '6s' }} />
                <span>Makine İkmal Müdürlüğü Bakım Havuzu</span>
              </h3>
              <p className="text-xs text-[var(--fd-text3)] mt-1 font-medium">
                Şu anda serviste/bakımda olan ve vaka sevkine kapatılmış aktif itfaiye araçlarının lojistik takibi.
              </p>
            </div>
            <div className="font-mono bg-[var(--fd-danger)]/10 text-[var(--fd-danger)] border border-[var(--fd-danger)]/20 px-3 py-1.5 rounded-lg text-xs font-bold shrink-0">
              Bakımdaki Araç: {maintenanceVehicles.length} Adet
            </div>
          </div>

          {/* Cards for Maintenance Vehicles */}
          {maintenanceVehicles.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-[10px] font-semibold text-[var(--fd-text3)] uppercase tracking-wider pl-1">Bakımdaki Araç Listesi</h4>
              {renderVehicleAccordionList(maintenanceVehicles)}
            </div>
          )}

          {/* Table of Maintenance Logs */}
          <Card className="bg-[var(--fd-surface)] border border-[var(--fd-border)] shadow-[var(--fd-shadow)] rounded-2xl overflow-hidden mt-6">
            <CardHeader className="bg-[var(--fd-surface2)]/50 border-b border-[var(--fd-border)] p-5 flex justify-between items-center flex-row">
              <CardTitle className="text-base font-bold text-[var(--fd-text)] flex items-center gap-2">
                <FileText className="w-5 h-5 text-[var(--fd-accent)]" />
                <span>Tüm Arıza ve Servis Takip Kayıtları</span>
              </CardTitle>
              <button 
                onClick={fetchMaintenanceLogs}
                className="p-2 bg-[var(--fd-surface2)] hover:bg-[var(--fd-surface3)] text-[var(--fd-text2)] hover:text-[var(--fd-text)] rounded-lg transition-colors border border-[var(--fd-border)]/50 cursor-pointer"
                title="Yenile"
              >
                <RefreshCw className={`w-4 h-4 ${loadingLogs ? 'animate-spin' : ''}`} />
              </button>
            </CardHeader>
            <CardContent className="p-0">
              {loadingLogs ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-4">
                  <Loader2 className="w-8 h-8 text-[var(--fd-accent)] animate-spin" />
                  <p className="text-[var(--fd-text3)] font-mono text-xs">Bakım havuzu listesi güncelleniyor...</p>
                </div>
              ) : (
                <div className="overflow-x-auto w-full">
                  <table className="w-full text-sm min-w-[900px]">
                    <thead className="bg-[var(--fd-surface2)] text-[10px] text-[var(--fd-text3)] uppercase tracking-wider border-b border-[var(--fd-border)]/50 font-mono">
                      <tr>
                        <th className="px-5 py-3.5 text-left font-semibold">ARAÇ BİLGİSİ</th>
                        <th className="px-5 py-3.5 text-left font-semibold">ARIZA SEVİYESİ</th>
                        <th className="px-5 py-3.5 text-left font-semibold">ARIZA / BAKIM DETAYI</th>
                        <th className="px-5 py-3.5 text-center font-semibold w-36">SEVK TARİHİ</th>
                        <th className="px-5 py-3.5 text-center font-semibold w-36">ÖNCEKİ ŞUBESİ</th>
                        <th className="px-5 py-3.5 text-center font-semibold w-36">DURUM</th>
                        <th className="px-5 py-3.5 text-center font-semibold w-64">İŞLEMLER</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--fd-border)]/40 font-medium">
                      {maintenanceLogs.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-[var(--fd-text3)] italic font-mono text-xs">
                            Kayıt bulunamadı.
                          </td>
                        </tr>
                      ) : (
                        maintenanceLogs.map((log) => {
                          const vehicle = vehicles.find(v => v.id === log.vehicle_id);
                          if (!vehicle) return null;
                          const isCritical = log.ariza_seviyesi === 'Kritik';
                          const isBakimda = log.durum === 'Bakımda';
                          
                          return (
                            <tr key={log.id} className="hover:bg-[var(--fd-surface2)]/30 transition-colors duration-150">
                              
                              {/* Araç Plaka & Filo */}
                              <td className="px-5 py-4">
                                <div className="flex items-center gap-3">
                                  {renderPlateHeader(vehicle.plaka)}
                                  <div className="flex flex-col">
                                    <span className="text-[var(--fd-text)] text-xs font-bold">
                                      {vehicle.filo_no ? `${vehicle.filo_no} No` : 'Filo No Yok'}
                                    </span>
                                    <span className="text-[10px] text-[var(--fd-text3)] font-mono">
                                      {vehicle.aciklama || 'Çağrı adı girilmemiş'}
                                    </span>
                                  </div>
                                </div>
                              </td>

                              {/* Arıza Seviyesi */}
                              <td className="px-5 py-4 align-middle">
                                <Badge 
                                  className={`font-semibold font-mono text-[9px] px-2.5 py-1 rounded-md ${
                                    isCritical 
                                      ? 'bg-[var(--fd-danger)]/10 text-[var(--fd-danger)] border border-[var(--fd-danger)]/25' 
                                      : log.ariza_seviyesi === 'Orta' 
                                        ? 'bg-[var(--fd-amber)]/10 text-[var(--fd-amber)] border border-[var(--fd-amber)]/25' 
                                        : 'bg-[var(--fd-surface3)] text-[var(--fd-text2)] border border-[var(--fd-border)]'
                                  }`}
                                >
                                  {log.ariza_seviyesi}
                                </Badge>
                              </td>

                              {/* Arıza Açıklaması */}
                              <td className="px-5 py-4 max-w-[280px] truncate align-middle text-[var(--fd-text2)]" title={log.aciklama}>
                                {log.aciklama}
                              </td>

                              {/* Sevk Tarihi */}
                              <td className="px-5 py-4 text-center font-mono text-xs text-[var(--fd-text3)] align-middle">
                                {log.created_at ? new Date(log.created_at).toLocaleDateString("tr-TR") : '—'}
                              </td>

                              {/* Önceki Şubesi */}
                              <td className="px-5 py-4 text-center font-mono text-xs text-[var(--fd-text3)] align-middle">
                                {log.eski_sube || '—'}
                              </td>

                              {/* Durum */}
                              <td className="px-5 py-4 text-center align-middle">
                                <Badge 
                                  className={`font-bold text-[9px] px-2 py-0.5 rounded-md ${
                                    isBakimda 
                                      ? 'bg-[var(--fd-danger)]/15 text-[var(--fd-danger)] border border-[var(--fd-danger)]/25 animate-pulse' 
                                      : 'bg-[var(--fd-success)]/10 text-[var(--fd-success)] border border-[var(--fd-success)]/20'
                                  }`}
                                >
                                  {log.durum}
                                </Badge>
                              </td>

                              {/* İşlemler */}
                              <td className="px-5 py-4 text-center align-middle font-sans">
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => handlePrintServiceForm({ vehicle, log })}
                                    className="h-9 px-3 bg-[var(--fd-surface2)] hover:bg-[var(--fd-surface3)] text-[var(--fd-text2)] border border-[var(--fd-border)] rounded-lg flex items-center justify-center gap-1.5 text-xs font-bold transition-all min-h-[36px] cursor-pointer"
                                    title="Servis Formu (PDF) İndir"
                                  >
                                    <Printer className="w-4 h-4 text-[var(--fd-danger)]" />
                                    Servis Formu
                                  </button>
                                  {isBakimda && canEdit && (
                                    <button
                                      onClick={() => handleOpenReturnModal({ vehicle, log })}
                                      className="h-9 px-3 bg-[var(--fd-success)]/10 hover:bg-[var(--fd-success)]/25 border border-[var(--fd-success)]/30 text-[var(--fd-success)] rounded-lg flex items-center justify-center gap-1.5 text-xs font-semibold transition-all min-h-[36px] cursor-pointer"
                                      title="Göreve İade Et / Taburcu Et"
                                    >
                                      <Inbox className="w-4 h-4 text-[var(--fd-success)]" />
                                      Taburcu Et
                                    </button>
                                  )}
                                  {canEdit && (
                                    <>
                                      <button
                                        onClick={() => handleOpenEditLogModal({ vehicle, log })}
                                        className="h-9 w-9 bg-[var(--fd-accent)]/10 hover:bg-[var(--fd-accent)]/25 border border-[var(--fd-accent)]/30 text-[var(--fd-accent)] rounded-lg flex items-center justify-center transition-all cursor-pointer"
                                        title="Kaydı Düzenle"
                                      >
                                        <Edit2 className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteLog(log)}
                                        className="h-9 w-9 bg-[var(--fd-danger)]/10 hover:bg-[var(--fd-danger)]/25 border border-[var(--fd-danger)]/30 text-[var(--fd-danger)] rounded-lg flex items-center justify-center transition-all cursor-pointer"
                                        title="Kaydı Sil"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>

                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* --- Arıza Bildirim Modalı --- */}
      <Dialog open={arizaModalOpen} onOpenChange={setArizaModalOpen}>
        <DialogContent className="w-full max-w-md bg-[var(--fd-surface)] border border-[var(--fd-border)] text-[var(--fd-text)] shadow-[var(--fd-shadow-lg)] p-5 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-[var(--fd-danger)]">
              <span>⚠️ Araç Arıza Bildirim Formu</span>
            </DialogTitle>
            <p className="text-xs text-[var(--fd-text3)] mt-1 font-medium">
              Bu form ile arızalı aracı bakım-onarım havuzuna alabilir ve servis talep fişi oluşturabilirsiniz.
            </p>
          </DialogHeader>

          <div className="space-y-4 my-4 font-sans text-sm">
            <div className="bg-[var(--fd-surface2)] border border-[var(--fd-border)] p-3 rounded-xl">
              <span className="text-[10px] font-bold text-[var(--fd-text3)] uppercase block font-mono">BİLDİRİM YAPILAN ARAÇ</span>
              <p className="font-bold text-[var(--fd-text)] mt-0.5">{reportingPlaka || ""}</p>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-[var(--fd-text3)] uppercase tracking-wider mb-1.5 font-mono">ARIZA SEVİYESİ</label>
              <select
                value={arizaSeviyesi}
                onChange={(e) => setArizaSeviyesi(e.target.value)}
                className="w-full h-11 rounded-xl border border-[var(--fd-border)] bg-[var(--fd-surface2)] px-3 font-semibold text-[var(--fd-text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]/50 cursor-pointer"
              >
                <option value="Hafif">Hafif (Göreve Engel Değil)</option>
                <option value="Orta">Orta (Kısmi Engel / Gözetim)</option>
                <option value="Kritik">Kritik (Görev Dışı - Makine İkmal Sevk)</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-[var(--fd-text3)] uppercase tracking-wider mb-1.5 font-mono">ARIZA AÇIKLAMASI</label>
              <textarea
                placeholder="Arıza detaylarını, belirtilerini ve tespitleri buraya yazın..."
                value={arizaAciklama}
                onChange={(e) => setArizaAciklama(e.target.value)}
                rows={4}
                className="w-full rounded-xl border border-[var(--fd-border)] bg-[var(--fd-surface2)] px-3 py-2 text-[var(--fd-text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]/50 resize-none"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 font-sans">
            <Button variant="outline" onClick={() => setArizaModalOpen(false)} className="w-full sm:w-auto border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text2)] hover:text-[var(--fd-text)]">
              İptal
            </Button>
            <Button onClick={handleSaveAriza} disabled={savingAriza} className="w-full sm:w-auto bg-[var(--fd-accent)] hover:opacity-90 text-white font-semibold shadow-[0_0_10px_var(--fd-accent-glow)]">
              {savingAriza ? "Kaydediliyor..." : "Arıza Kaydını Aç"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- Taburcu Etme (Eski şubesine geri atama) Modalı --- */}
      <Dialog open={returnModalOpen} onOpenChange={setReturnModalOpen}>
        <DialogContent className="w-full max-w-md bg-[var(--fd-surface)] border border-[var(--fd-border)] text-[var(--fd-text)] shadow-[var(--fd-shadow-lg)] p-5 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-[var(--fd-success)]">
              <span>🔧 Araç Bakım Taburcu Formu</span>
            </DialogTitle>
            <p className="text-xs text-[var(--fd-text3)] mt-1 font-medium">
              Bakımı biten aracı aktif şubelerden birine sevk ederek göreve iade edebilirsiniz.
            </p>
          </DialogHeader>

          <div className="space-y-4 my-4 font-sans text-sm">
            <div className="bg-[var(--fd-surface2)] border border-[var(--fd-border)] p-3 rounded-xl">
              <span className="text-[10px] font-bold text-[var(--fd-text3)] uppercase block font-mono">TABURCU EDİLEN ARAÇ</span>
              <p className="font-bold text-[var(--fd-text)] mt-0.5">{dischargeItem?.vehicle?.plaka || ""}</p>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-[var(--fd-text3)] uppercase tracking-wider mb-1.5 font-mono">SEVK EDİLECEK ŞUBE</label>
              <select
                value={targetBranch}
                onChange={(e) => setTargetBranch(e.target.value)}
                className="w-full h-11 rounded-xl border border-[var(--fd-border)] bg-[var(--fd-surface2)] px-3 font-semibold text-[var(--fd-text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]/50 cursor-pointer"
              >
                <option value="Merkez">Merkez Şubesi</option>
                <option value="Esentepe">Esentepe Şubesi</option>
                <option value="OSB (Organize)">Organize Sanayi Şubesi</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-[var(--fd-text3)] uppercase tracking-wider mb-1.5 font-mono">BAKIM & ONARIM NOTLARI</label>
              <textarea
                placeholder="Yapılan işlemler, değişen parçalar ve teknik notları buraya yazın..."
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
                rows={4}
                className="w-full rounded-xl border border-[var(--fd-border)] bg-[var(--fd-surface2)] px-3 py-2 text-[var(--fd-text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]/50 resize-none"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 font-sans">
            <Button variant="outline" onClick={() => setReturnModalOpen(false)} className="w-full sm:w-auto border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text2)] hover:text-[var(--fd-text)]">
              İptal
            </Button>
            <Button onClick={handleSaveReturn} disabled={savingReturn} className="w-full sm:w-auto bg-[var(--fd-success)] hover:opacity-90 text-white font-semibold shadow-[0_0_10px_rgba(16,185,129,0.3)]">
              {savingReturn ? "Kaydediliyor..." : "Taburcu Et & Aktif Et"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- Arıza Kaydı Düzenleme Modalı --- */}
      <Dialog open={editLogModalOpen} onOpenChange={setEditLogModalOpen}>
        <DialogContent className="w-full max-w-md bg-[var(--fd-surface)] border border-[var(--fd-border)] text-[var(--fd-text)] shadow-[var(--fd-shadow-lg)] p-5 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-[var(--fd-accent)]">
              <span>✏️ Arıza Kaydı Düzenleme</span>
            </DialogTitle>
            <p className="text-xs text-[var(--fd-text3)] mt-1 font-medium">
              Yanlış girilmiş arıza takip kayıtlarını bu modal üzerinden güncelleyebilirsiniz.
            </p>
          </DialogHeader>

          <div className="space-y-4 my-4 font-sans text-sm">
            <div>
              <label className="block text-[10px] font-semibold text-[var(--fd-text3)] uppercase tracking-wider mb-1.5 font-mono">ARIZA SEVİYESİ</label>
              <select
                value={editArizaSeviyesi}
                onChange={(e) => setEditArizaSeviyesi(e.target.value)}
                className="w-full h-11 rounded-xl border border-[var(--fd-border)] bg-[var(--fd-surface2)] px-3 font-semibold text-[var(--fd-text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]/50 cursor-pointer"
              >
                <option value="Hafif">Hafif (Göreve Engel Değil)</option>
                <option value="Orta">Orta (Kısmi Engel / Gözetim)</option>
                <option value="Kritik">Kritik (Görev Dışı - Makine İkmal Sevk)</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-[var(--fd-text3)] uppercase tracking-wider mb-1.5 font-mono">DURUM</label>
              <select
                value={editDurum}
                onChange={(e) => setEditDurum(e.target.value)}
                className="w-full h-11 rounded-xl border border-[var(--fd-border)] bg-[var(--fd-surface2)] px-3 font-semibold text-[var(--fd-text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]/50 cursor-pointer"
              >
                <option value="Bakımda">Bakımda</option>
                <option value="Taburcu Edildi">Taburcu Edildi</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-[var(--fd-text3)] uppercase tracking-wider mb-1.5 font-mono">ÖNCEKİ / ASIL ŞUBESİ</label>
              <select
                value={editEskiSube}
                onChange={(e) => setEditEskiSube(e.target.value)}
                className="w-full h-11 rounded-xl border border-[var(--fd-border)] bg-[var(--fd-surface2)] px-3 font-semibold text-[var(--fd-text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]/50 cursor-pointer"
              >
                <option value="Merkez">Merkez Şubesi</option>
                <option value="Esentepe">Esentepe Şubesi</option>
                <option value="OSB (Organize)">Organize Sanayi Şubesi</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-[var(--fd-text3)] uppercase tracking-wider mb-1.5 font-mono">ARIZA AÇIKLAMASI</label>
              <textarea
                placeholder="Arıza detayları..."
                value={editAciklama}
                onChange={(e) => setEditAciklama(e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-[var(--fd-border)] bg-[var(--fd-surface2)] px-3 py-2 text-[var(--fd-text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]/50 resize-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-[var(--fd-text3)] uppercase tracking-wider mb-1.5 font-mono">BAKIM & TAMİR NOTLARI</label>
              <textarea
                placeholder="Yapılan işlemler, teknik notlar..."
                value={editBakimNotu}
                onChange={(e) => setEditBakimNotu(e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-[var(--fd-border)] bg-[var(--fd-surface2)] px-3 py-2 text-[var(--fd-text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]/50 resize-none"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 font-sans">
            <Button variant="outline" onClick={() => setEditLogModalOpen(false)} className="w-full sm:w-auto border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text2)] hover:text-[var(--fd-text)]">
              İptal
            </Button>
            <Button onClick={handleSaveLogEdit} disabled={savingLogEdit} className="w-full sm:w-auto bg-[var(--fd-accent)] hover:opacity-90 text-white font-semibold shadow-[0_0_10px_var(--fd-accent-glow)]">
              {savingLogEdit ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- Faz 28.51: Şube Değiştir Modalı --- */}
      <Dialog open={branchModalOpen} onOpenChange={setBranchModalOpen}>
        <DialogContent className="w-full max-w-md bg-[var(--fd-surface)] border border-[var(--fd-border)] text-[var(--fd-text)] shadow-[var(--fd-shadow-lg)] p-5 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-[var(--fd-accent)]">
              <span>📍 Araç Şube Değiştirme</span>
            </DialogTitle>
            <p className="text-xs text-[var(--fd-text3)] mt-1 font-medium">
              Seçili aracı farklı bir müfrezeye/şubeye atayabilirsiniz. Bu işlem araç konuşlanma bilgilerini günceller.
            </p>
          </DialogHeader>

          <div className="space-y-4 my-4 font-sans text-sm">
            <div className="bg-[var(--fd-surface2)] border border-[var(--fd-border)] p-3 rounded-xl">
              <span className="text-[10px] font-bold text-[var(--fd-text3)] uppercase block font-mono">ŞUBE DEĞİŞTİRİLEN ARAÇ</span>
              <p className="font-bold text-[var(--fd-text)] mt-0.5">{branchChangePlaka || ""}</p>
              {branchChangePlaka && (() => {
                const v = vehicles.find(veh => veh.plaka === branchChangePlaka);
                return v ? (
                  <p className="text-[10px] text-[var(--fd-text3)] mt-0.5 font-mono">
                    Mevcut Şube: <span className="text-[var(--fd-accent)] font-bold">{v.current_branch || 'Merkez'}</span>
                  </p>
                ) : null;
              })()}
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-[var(--fd-text3)] uppercase tracking-wider mb-1.5 font-mono">YENİ ŞUBE</label>
              <select
                value={newBranch}
                onChange={(e) => setNewBranch(e.target.value)}
                className="w-full h-11 rounded-xl border border-[var(--fd-border)] bg-[var(--fd-surface2)] px-3 font-semibold text-[var(--fd-text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]/50 cursor-pointer"
              >
                <option value="Merkez">Merkez Şubesi</option>
                <option value="Esentepe">Esentepe Şubesi</option>
                <option value="OSB (Organize)">Organize Sanayi Şubesi</option>
              </select>
            </div>
          </div>

          <DialogFooter className="gap-2 font-sans">
            <Button variant="outline" onClick={() => setBranchModalOpen(false)} className="w-full sm:w-auto border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text2)] hover:text-[var(--fd-text)]">
              İptal
            </Button>
            <Button onClick={handleSaveBranchChange} disabled={savingBranch} className="w-full sm:w-auto bg-[var(--fd-accent)] hover:opacity-90 text-white font-semibold shadow-[0_0_10px_var(--fd-accent-glow)]">
              {savingBranch ? "Kaydediliyor..." : "Şubeyi Güncelle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* Delete Vehicle Modal */}
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent className="max-w-md bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-2xl shadow-2xl p-6 font-sans">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[var(--fd-danger)] flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-[var(--fd-danger)]" />
              Araç Sil
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4 text-sm text-[var(--fd-text2)]">
            <p>
              Silmek istediğiniz aracı seçin ve onaylamak için plakasını yazın.
              Bu araca ait tüm bakım ve yakıt geçmişi de kalıcı olarak silinecektir.
            </p>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--fd-text3)] block uppercase">Silinecek Araç</label>
              <select
                value={deletingPlaka}
                onChange={(e) => {
                  setDeletingPlaka(e.target.value);
                  setConfirmPlakaInput("");
                }}
                className="w-full h-10 px-3 rounded-lg border border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--fd-danger)]/50"
              >
                <option value="">Araç Seçin...</option>
                {vehicles.map((v) => (
                  <option key={v.plaka} value={v.plaka}>
                    {v.plaka} - {v.model && v.model.toLowerCase().startsWith((v.marka || '').toLowerCase()) ? v.model : `${v.marka || ''} ${v.model || v.aracTipi || v.arac_tipi}`} ({v.istasyon})
                  </option>
                ))}
              </select>
            </div>

            {deletingPlaka && (
              <div className="space-y-2 animate-in fade-in duration-200">
                <label className="text-xs font-bold text-[var(--fd-text3)] block uppercase">
                  Onaylamak için <span className="text-[var(--fd-danger)] font-mono select-none">{deletingPlaka}</span> yazın
                </label>
                <input
                  type="text"
                  value={confirmPlakaInput}
                  onChange={(e) => setConfirmPlakaInput(e.target.value)}
                  placeholder={deletingPlaka}
                  className="w-full h-10 px-3 rounded-lg border border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--fd-danger)]/50 uppercase"
                />
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 font-sans">
            <Button variant="outline" onClick={() => setDeleteModalOpen(false)} className="w-full sm:w-auto border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text2)] hover:text-[var(--fd-text)]">
              İptal
            </Button>
            <Button
              onClick={handleDeleteVehicle}
              disabled={deleting || !deletingPlaka || confirmPlakaInput.trim().toUpperCase() !== deletingPlaka.toUpperCase()}
              className="w-full sm:w-auto bg-[var(--fd-danger)] hover:bg-[var(--fd-danger)]/90 text-white font-semibold shadow-[0_0_10px_rgba(239,68,68,0.2)] animate-pulse"
            >
              {deleting ? "Siliniyor..." : "Aracı Kalıcı Olarak Sil"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vehicle Responsibles Modal */}
      <Dialog 
        open={responsiblesModal.open} 
        onOpenChange={(open) => setResponsiblesModal(prev => ({ ...prev, open }))}
      >
        <DialogContent className="max-w-lg bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-2xl shadow-2xl p-6 font-sans">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[var(--fd-text)] flex items-center gap-2">
              👤 Sorumlu Personel Ayarları
            </DialogTitle>
            <p className="text-xs text-[var(--fd-text3)] mt-1">
              Plaka: <span className="font-mono font-bold text-[var(--fd-accent)]">{responsiblesModal.vehicle?.plaka}</span> | 3 Posta (Vardiya) için sorumlu şoför ve er atamalarını gerçekleştirin.
            </p>
          </DialogHeader>

          {responsiblesModal.vehicle && (
            <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto pr-1">
              {/* Posta 1 */}
              <div className="border border-[var(--fd-border)] rounded-xl p-3.5 space-y-3 bg-[var(--fd-surface2)]/40">
                <span className="text-[11px] font-bold text-[var(--fd-accent)] uppercase tracking-wider block font-mono">1. POSTA (VARDİYA)</span>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[var(--fd-text3)] uppercase">Sorumlu Şoför</label>
                    <select
                      value={responsiblesModal.vehicle.sorumlu_sofor_id_p1 || ""}
                      onChange={(e) => {
                        const val = e.target.value || null;
                        setResponsiblesModal(prev => {
                          if (!prev.vehicle) return prev;
                          return {
                            ...prev,
                            vehicle: {
                              ...prev.vehicle,
                              sorumlu_sofor_id_p1: val,
                              sorumlu_sofor_id: val
                            }
                          };
                        });
                      }}
                      className="w-full h-10 px-2.5 rounded-lg border border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text)] text-sm focus:outline-none focus:border-[var(--fd-accent)] cursor-pointer"
                    >
                      <option value="">Şoför Seçilmedi</option>
                      {drivers.map(d => (
                        <option key={d.id} value={d.id}>{d.ad} {d.soyad} ({d.sicil_no})</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[var(--fd-text3)] uppercase">Sorumlu Er</label>
                    <select
                      value={responsiblesModal.vehicle.sorumlu_er_id_p1 || ""}
                      onChange={(e) => {
                        const val = e.target.value || null;
                        setResponsiblesModal(prev => {
                          if (!prev.vehicle) return prev;
                          return {
                            ...prev,
                            vehicle: {
                              ...prev.vehicle,
                              sorumlu_er_id_p1: val,
                              sorumlu_er_id: val
                            }
                          };
                        });
                      }}
                      className="w-full h-10 px-2.5 rounded-lg border border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text)] text-sm focus:outline-none focus:border-[var(--fd-accent)] cursor-pointer"
                    >
                      <option value="">Er Seçilmedi</option>
                      {ers.map(er => (
                        <option key={er.id} value={er.id}>{er.ad} {er.soyad} ({er.sicil_no})</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Posta 2 */}
              <div className="border border-[var(--fd-border)] rounded-xl p-3.5 space-y-3 bg-[var(--fd-surface2)]/40">
                <span className="text-[11px] font-bold text-[var(--fd-accent)] uppercase tracking-wider block font-mono">2. POSTA (VARDİYA)</span>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[var(--fd-text3)] uppercase">Sorumlu Şoför</label>
                    <select
                      value={responsiblesModal.vehicle.sorumlu_sofor_id_p2 || ""}
                      onChange={(e) => {
                        const val = e.target.value || null;
                        setResponsiblesModal(prev => {
                          if (!prev.vehicle) return prev;
                          return {
                            ...prev,
                            vehicle: {
                              ...prev.vehicle,
                              sorumlu_sofor_id_p2: val
                            }
                          };
                        });
                      }}
                      className="w-full h-10 px-2.5 rounded-lg border border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text)] text-sm focus:outline-none focus:border-[var(--fd-accent)] cursor-pointer"
                    >
                      <option value="">Şoför Seçilmedi</option>
                      {drivers.map(d => (
                        <option key={d.id} value={d.id}>{d.ad} {d.soyad} ({d.sicil_no})</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[var(--fd-text3)] uppercase">Sorumlu Er</label>
                    <select
                      value={responsiblesModal.vehicle.sorumlu_er_id_p2 || ""}
                      onChange={(e) => {
                        const val = e.target.value || null;
                        setResponsiblesModal(prev => {
                          if (!prev.vehicle) return prev;
                          return {
                            ...prev,
                            vehicle: {
                              ...prev.vehicle,
                              sorumlu_er_id_p2: val
                            }
                          };
                        });
                      }}
                      className="w-full h-10 px-2.5 rounded-lg border border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text)] text-sm focus:outline-none focus:border-[var(--fd-accent)] cursor-pointer"
                    >
                      <option value="">Er Seçilmedi</option>
                      {ers.map(er => (
                        <option key={er.id} value={er.id}>{er.ad} {er.soyad} ({er.sicil_no})</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Posta 3 */}
              <div className="border border-[var(--fd-border)] rounded-xl p-3.5 space-y-3 bg-[var(--fd-surface2)]/40">
                <span className="text-[11px] font-bold text-[var(--fd-accent)] uppercase tracking-wider block font-mono">3. POSTA (VARDİYA)</span>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[var(--fd-text3)] uppercase">Sorumlu Şoför</label>
                    <select
                      value={responsiblesModal.vehicle.sorumlu_sofor_id_p3 || ""}
                      onChange={(e) => {
                        const val = e.target.value || null;
                        setResponsiblesModal(prev => {
                          if (!prev.vehicle) return prev;
                          return {
                            ...prev,
                            vehicle: {
                              ...prev.vehicle,
                              sorumlu_sofor_id_p3: val
                            }
                          };
                        });
                      }}
                      className="w-full h-10 px-2.5 rounded-lg border border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text)] text-sm focus:outline-none focus:border-[var(--fd-accent)] cursor-pointer"
                    >
                      <option value="">Şoför Seçilmedi</option>
                      {drivers.map(d => (
                        <option key={d.id} value={d.id}>{d.ad} {d.soyad} ({d.sicil_no})</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[var(--fd-text3)] uppercase">Sorumlu Er</label>
                    <select
                      value={responsiblesModal.vehicle.sorumlu_er_id_p3 || ""}
                      onChange={(e) => {
                        const val = e.target.value || null;
                        setResponsiblesModal(prev => {
                          if (!prev.vehicle) return prev;
                          return {
                            ...prev,
                            vehicle: {
                              ...prev.vehicle,
                              sorumlu_er_id_p3: val
                            }
                          };
                        });
                      }}
                      className="w-full h-10 px-2.5 rounded-lg border border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text)] text-sm focus:outline-none focus:border-[var(--fd-accent)] cursor-pointer"
                    >
                      <option value="">Er Seçilmedi</option>
                      {ers.map(er => (
                        <option key={er.id} value={er.id}>{er.ad} {er.soyad} ({er.sicil_no})</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 font-sans border-t border-[var(--fd-border)] pt-4 mt-2">
            <Button 
              variant="outline" 
              onClick={() => setResponsiblesModal({ open: false, vehicle: null })} 
              className="w-full sm:w-auto border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text2)] hover:text-[var(--fd-text)]"
            >
              İptal
            </Button>
            <Button
              onClick={async () => {
                if (responsiblesModal.vehicle) {
                  const { plaka, sorumlu_sofor_id, sorumlu_er_id, sorumlu_sofor_id_p1, sorumlu_er_id_p1, sorumlu_sofor_id_p2, sorumlu_er_id_p2, sorumlu_sofor_id_p3, sorumlu_er_id_p3 } = responsiblesModal.vehicle;
                  await handleUpdateResponsibles(plaka, {
                    sorumlu_sofor_id,
                    sorumlu_er_id,
                    sorumlu_sofor_id_p1,
                    sorumlu_er_id_p1,
                    sorumlu_sofor_id_p2,
                    sorumlu_er_id_p2,
                    sorumlu_sofor_id_p3,
                    sorumlu_er_id_p3
                  });
                  setResponsiblesModal({ open: false, vehicle: null });
                }
              }}
              disabled={!canEdit}
              className="w-full sm:w-auto bg-[var(--fd-accent)] hover:opacity-90 text-white font-semibold"
            >
              Değişiklikleri Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mobil Alt Bar Maskeleme Kalkanı - Spacer */}
      <div 
        className="w-full block md:hidden pointer-events-none clear-both" 
        style={{ height: 'calc(7rem + env(safe-area-inset-bottom))' }} 
        aria-hidden="true" 
      />
    </div>
  )
}
