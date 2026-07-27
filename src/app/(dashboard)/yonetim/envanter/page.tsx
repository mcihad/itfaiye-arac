"use client"

import { useState, useEffect, useMemo } from "react"
import PageGuard from "@/components/PageGuard"
import { api } from "@/lib/api"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Badge } from "@/components/ui/Badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/Dialog"
import { 
  Truck, 
  RefreshCw, 
  Printer, 
  Inbox, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Search, 
  FileText, 
  Calendar,
  Combine,
  Loader2,
  Trash2,
  Plus,
  Save,
  ArrowRight,
  Layers,
  FileSpreadsheet,
  Warehouse,
  HelpCircle,
  Wrench
} from "lucide-react"
import QRCode from "react-qr-code"
import { useAuthStore } from "@/lib/authStore"
import { COMPARTMENT_NAMES, APP_BASE_URL } from "@/lib/constants"
import jsPDF from "jspdf"
import { cn } from "@/lib/utils"
import { toast } from "@/lib/toast"


const normalizeTextForSearch = (str: string): string => {
  if (!str) return "";
  return str
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g").replace(/Ğ/g, "g")
    .replace(/ü/g, "u").replace(/Ü/g, "u")
    .replace(/ş/g, "s").replace(/Ş/g, "s")
    .replace(/ö/g, "o").replace(/Ö/g, "o")
    .replace(/ç/g, "c").replace(/Ç/g, "c")
    .toLowerCase();
}

// ==========================================
// 🚗 VEHICLE INVENTORY TAB COMPONENT & TYPES
// ==========================================

// TypeScript interfaces
interface Vehicle {
  plaka: string;
  arac_tipi?: string;
  marka?: string;
  model?: string;
  filo_no?: number | null;
  aciklama?: string;
  id?: string;
  current_branch?: string;
}

interface InventoryRow {
  internalId: string;
  id?: number;
  plaka: string;
  bolme_kapak: string;
  malzeme_adi: string;
  adet: number;
  durum: string;
}

interface MasterInventoryItem {
  id: number;
  malzeme_adi: string;
  merkez: number;
  esentepe: number;
  organize: number;
  depo: number;
  toplam: number;
}

interface VehicleInventoryItem {
  plaka: string;
  inventory_id: number;
  adet: number;
}

interface GarajInventoryItem {
  id: number;
  malzeme_adi: string;
  bolme_kapak: string;
  adet: number;
}

const CLEAN_COMPARTMENT_OPTIONS = [
  "Araç İçi",
  "Araç Üstü",
  "Arka Kapak",
  "Halat Çantası",
  "Küçük Kapak",
  "Sağ Ön Kapak",
  "Sağ Orta Kapak",
  "Sağ Arka Kapak",
  "Sol Ön Kapak",
  "Sol Orta Kapak",
  "Sol Arka Kapak",
  "Yüksek Açı Kurtarma Çantası",
  "Garaj",
  "Ana Depo"
];

const DURUM_OPTIONS = [
  { value: "Tam", label: "Tam (Eksiksiz)", colorClass: "text-[var(--fd-success)]" },
  { value: "Eksik", label: "Eksik (Hasarsız)", colorClass: "text-[var(--fd-amber)]" },
  { value: "Arızalı", label: "Arızalı (Bakımda)", colorClass: "text-[var(--fd-danger)]" },
  { value: "Kayıp/Yok", label: "Kayıp / Yok", colorClass: "text-[var(--fd-text3)]" },
  { value: "🔄 GEÇİCİ ZİMMETTE", label: "🔄 GEÇİCİ ZİMMETTE", colorClass: "text-[var(--fd-info)]" }
];

function InfoTooltip({ content }: { content: string }) {
  return (
    <div className="relative group inline-block ml-1.5 align-middle">
      <HelpCircle className="w-4 h-4 text-[var(--fd-text3)] hover:text-[var(--fd-accent)] cursor-help transition-colors" />
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block group-focus:block bg-[var(--fd-surface2)]/95 backdrop-blur-md text-[var(--fd-text2)] text-xs rounded-xl p-2.5 w-64 border border-[var(--fd-border)] shadow-2xl z-50 transition-all text-center leading-normal font-sans font-medium whitespace-normal">
        {content}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-slate-950" />
      </div>
    </div>
  )
}

function VehicleInventoryTab() {
  const { user } = useAuthStore()
  const canEdit = user?.rol === 'Admin' || user?.rol === 'Editor'
  
  // Navigation Tabs State
  const [activeTab, setActiveTab] = useState<"crud" | "matrix">("crud")
  
  // Vehicle Selections and Rows
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [selectedPlaka, setSelectedPlaka] = useState<string>("")
  const [tableRows, setTableRows] = useState<InventoryRow[]>([])
  const [expandedCompartments, setExpandedCompartments] = useState<Record<string, boolean>>({})

  // Temporary Assignment States
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false)
  const [assignmentRow, setAssignmentRow] = useState<InventoryRow | null>(null)
  const [recipientType, setRecipientType] = useState<'PERSONEL' | 'ARAC' | 'DIS_BIRIM'>('PERSONEL')
  const [recipientName, setRecipientName] = useState("")
  const [estimatedReturnDate, setEstimatedReturnDate] = useState("")
  const [activePrintAssignment, setActivePrintAssignment] = useState<any | null>(null)
  const [phoneInput, setPhoneInput] = useState("")
  const [costInput, setCostInput] = useState("")

  const handleOpenAssignmentModal = (row: InventoryRow) => {
    const matUpper = row.malzeme_adi.trim().toUpperCase();
    const malzemeId = inventoryCache[matUpper];
    if (!malzemeId) {
      toast("Lütfen geçici zimmet işlemi yapmadan önce sayfa altındaki 'Kaydet' butonuna basarak envanter değişikliklerini veri tabanına işleyin.");
      return;
    }
    setAssignmentRow(row);
    setRecipientType('PERSONEL');
    setRecipientName('');
    setEstimatedReturnDate('');
    setPhoneInput('');
    setCostInput('');
    setAssignmentModalOpen(true);
  };

  const handleCreateAssignment = async () => {
    if (!assignmentRow || !recipientName || !estimatedReturnDate) {
      toast("Lütfen tüm zorunlu alanları doldurun.");
      return;
    }

    const matUpper = assignmentRow.malzeme_adi.trim().toUpperCase();
    const malzemeId = inventoryCache[matUpper];
    if (!malzemeId) {
      toast("Malzeme kimliği bulunamadı.");
      return;
    }

    try {
      // 1. Save assignment to DB
      const assignmentData = {
        malzeme_id: malzemeId,
        teslim_edilen_tip: recipientType,
        birim_adi: recipientName,
        teslim_tarihi: new Date().toISOString(),
        tahmini_iade_tarihi: new Date(estimatedReturnDate).toISOString(),
        durum: 'AKTIF',
        kaynak_plaka: selectedPlaka
      };

      const res = await api.insert('temporary_assignments', assignmentData);
      if (res.error) throw new Error(res.error);

      const createdAssignment = res.data?.[0];
      if (!createdAssignment) throw new Error("Veritabanından kayıt dönmedi.");

      // 2. Update status of the item locally to '🔄 GEÇİCİ ZİMMETTE'
      setTableRows(prev => prev.map(r => {
        if (r.internalId === assignmentRow.internalId) {
          return { ...r, durum: '🔄 GEÇİCİ ZİMMETTE' };
        }
        return r;
      }));

      // Update in vehicle_inventory immediately
      if (assignmentRow.id) {
        const invUpd = await api.update('vehicle_inventory', { durum: '🔄 GEÇİCİ ZİMMETTE' }, { id: assignmentRow.id });
        if (invUpd.error) {
          toast(`Uyarı: Zimmet verildi ancak envanter durumu güncellenemedi: ${invUpd.error}`);
        }
      }

      // Rebuild bolmeler JSON for vehicles
      const updatedRows = tableRows.map(r => {
        if (r.internalId === assignmentRow.internalId) {
          return { ...r, durum: '🔄 GEÇİCİ ZİMMETTE' };
        }
        return r;
      });

      const newBolmeler: Record<string, any[]> = {};
      updatedRows
        .filter(row => row.malzeme_adi.trim() !== "")
        .forEach(row => {
          const key = getCompartmentKey(row.bolme_kapak);
          if (!newBolmeler[key]) newBolmeler[key] = [];
          newBolmeler[key].push({
            malzeme: row.malzeme_adi,
            adet: row.adet,
            durum: row.durum
          });
        });

      const bolmeUpd = await api.update('vehicles', { bolmeler: newBolmeler }, { plaka: selectedPlaka });
      if (bolmeUpd.error) {
        toast(`Uyarı: Araç bölme listesi güncellenemedi: ${bolmeUpd.error}`);
      }

      // Save audit log
      fetch('/api/audit-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action_type: 'temporary_assignment',
          actor_sicil_no: user?.sicilNo || 'unknown',
          actor_name: user ? `${user.ad} ${user.soyad}` : 'Bilinmeyen',
          target: assignmentRow.malzeme_adi,
          details: {
            plaka: selectedPlaka,
            teslim_edilen_tip: recipientType,
            birim_adi: recipientName,
          },
        }),
      }).catch(err => console.error('[AuditLog] Zimmet logu gönderilemedi:', err))

      // 3. Trigger printing! Set activePrintAssignment to trigger React rendering & print
      const printData = {
        ...createdAssignment,
        materialName: assignmentRow.malzeme_adi,
        quantity: assignmentRow.adet,
        durum_aciklamasi: 'Hasarsız',
        telefon: phoneInput,
        ucret: costInput
      };
      setActivePrintAssignment(printData);

      // Close assignment modal, clear states
      setAssignmentModalOpen(false);

    } catch (err: any) {
      console.error(err);
      toast("Zimmet oluşturulurken hata oluştu: " + err.message);
    }
  };
  
  // Vehicle metadata edit states (filo_no and aciklama)
  const [editFiloNo, setEditFiloNo] = useState<string>("")
  const [editAciklama, setEditAciklama] = useState<string>("")

  // Synchronize edit fields when selectedPlaka changes
  useEffect(() => {
    if (!selectedPlaka) return;
    const currentVeh = vehicles.find(v => v.plaka === selectedPlaka);
    if (currentVeh) {
      setEditFiloNo(currentVeh.filo_no?.toString() || "");
      setEditAciklama(currentVeh.aciklama || "");
    } else {
      setEditFiloNo("");
      setEditAciklama("");
    }
  }, [selectedPlaka, vehicles])

  const handleUpdateVehicleMeta = async () => {
    if (!selectedPlaka || selectedPlaka === "GARAJ" || selectedPlaka === "ANA_DEPO") return;
    try {
      const updates = {
        filo_no: editFiloNo ? parseInt(editFiloNo, 10) : null,
        aciklama: editAciklama || null
      };
      
      const { error } = await api.update('vehicles', updates, { plaka: selectedPlaka });
      if (error) throw error;
      
      // Update vehicles state locally
      setVehicles(prev => prev.map(v => {
        if (v.plaka === selectedPlaka) {
          return { 
            ...v, 
            filo_no: updates.filo_no,
            aciklama: updates.aciklama || undefined 
          };
        }
        return v;
      }));
      
      toast("Araç filo bilgileri başarıyla güncellendi.");
    } catch (err: any) {
      console.error(err);
      toast("Hata oluştu: " + (err.message || err));
    }
  }
  
  // Cache of malzeme_adi -> id
  const [inventoryCache, setInventoryCache] = useState<Record<string, number>>({})
  
  // Master Matrix State
  const [masterInventory, setMasterInventory] = useState<MasterInventoryItem[]>([])
  const [allVehicleInventory, setAllVehicleInventory] = useState<VehicleInventoryItem[]>([])
  const [garajInventory, setGarajInventory] = useState<GarajInventoryItem[]>([])
  const [anaDepoInventory, setAnaDepoInventory] = useState<GarajInventoryItem[]>([])
  const [searchQuery, setSearchQuery] = useState<string>("")
  
  // Render plate as a beautiful realistic Turkish license plate badge
  const renderPlateHeader = (plaka: string) => {
    const isPlate = plaka.match(/(\d{2}\s+[A-Z]+\s+\d+)/i);
    if (!isPlate) return <span className="font-bold tracking-tight text-[var(--fd-text2)] font-sans">{plaka}</span>;
    return (
      <div className="inline-flex items-center border border-[var(--fd-border-strong)] rounded-[var(--fd-r-sm)] bg-[var(--fd-surface2)] overflow-hidden text-[10px] font-mono leading-none shadow-[var(--fd-shadow-sm)] border-b-2 border-[var(--fd-border-strong)]">
        <span className="bg-blue-600 text-white px-1 py-1 text-[8px] font-black select-none">TR</span>
        <span className="px-1.5 py-1 text-[var(--fd-text)] font-black tracking-tight whitespace-nowrap">{plaka}</span>
      </div>
    );
  };

  // UI Loading States
  const [loading, setLoading] = useState<boolean>(true)
  const [loadingRows, setLoadingRows] = useState<boolean>(false)
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false)
  
  // Print Filter Option
  const [printFilter, setPrintFilter] = useState<string>("all")
  const [mounted, setMounted] = useState<boolean>(false)

  // Reverse mapping for clean slug URLs
  const getCompartmentKey = (label: string): string => {
    const entry = Object.entries(COMPARTMENT_NAMES).find(
      ([_, v]) => v.toLowerCase() === label.toLowerCase()
    );
    return entry ? entry[0] : label.replace(/\s+/g, "_").toLowerCase();
  };

  const buildQrUrl = (plaka: string, compartmentLabel: string): string => {
    const slug = plaka.replace(/\s+/g, "-").toLowerCase();
    const compKey = getCompartmentKey(compartmentLabel);
    return `${APP_BASE_URL}/arac/${slug}/${compKey}`;
  };



  // Initial load
  useEffect(() => {
    setMounted(true)
    loadAllData()
  }, [])

  // Effect to handle temporary assignment form printing via cloning
  useEffect(() => {
    if (activePrintAssignment) {
      // Ensure the DOM has rendered the print area element
      const printArea = document.getElementById('print-area-assignment')
      if (printArea) {
        // Remove any existing print container
        const existing = document.getElementById('print-area-assignment-live')
        if (existing) {
          try { document.body.removeChild(existing); } catch (e) {}
        }

        const clone = printArea.cloneNode(true) as HTMLElement
        clone.className = 'print-area-container'
        clone.id = 'print-area-assignment-live'
        document.body.appendChild(clone)
        
        setTimeout(() => {
          window.print()
          setTimeout(() => {
            const live = document.getElementById('print-area-assignment-live')
            if (live) {
              try { document.body.removeChild(live); } catch (e) {}
            }
            setActivePrintAssignment(null)
          }, 500)
        }, 400)
      } else {
        setActivePrintAssignment(null)
      }
    }
  }, [activePrintAssignment])

  const loadAllData = async () => {
    try {
      setLoading(true)
      
      // 1. Fetch vehicles
      const { data: vehs } = await api.from('vehicles').select('*')
      if (vehs) {
        const sortedVehs = [...vehs].sort((a: Vehicle, b: Vehicle) => (a.filo_no || 999) - (b.filo_no || 999))
        setVehicles(sortedVehs)
      }

      // 2. Fetch master inventory to populate cache & matrix
      const { data: masterInv } = await api.from('inventory').select('*')
      if (masterInv) {
        const cache: Record<string, number> = {};
        masterInv.forEach((item: any) => {
          cache[item.malzeme_adi.toUpperCase()] = item.id;
        });
        setInventoryCache(cache)
        
        const sortedInv = [...masterInv].sort((a: any, b: any) => a.malzeme_adi.localeCompare(b.malzeme_adi, 'tr'));
        setMasterInventory(sortedInv)
      }

      // 3. Fetch all vehicle_inventory entries for search matrix cards & pivot columns
      const { data: allVehInv } = await api.from('vehicle_inventory').select('plaka, inventory_id, adet')
      if (allVehInv) {
        setAllVehicleInventory(allVehInv)
      }

      // 4. Fetch Garaj list
      const { data: garajRows } = await api.from('vehicle_inventory').select('*').eq('plaka', 'GARAJ')
      if (garajRows && masterInv) {
        const mapped = garajRows.map((item: any) => {
          const matchingInv = masterInv.find((i: any) => i.id === item.inventory_id);
          return {
            id: item.id,
            malzeme_adi: matchingInv ? matchingInv.malzeme_adi : `Bilinmeyen Malzeme (ID: ${item.inventory_id})`,
            bolme_kapak: item.bolme_kapak || "Garaj",
            adet: item.adet || 0
          };
        });
        mapped.sort((a: any, b: any) => a.malzeme_adi.localeCompare(b.malzeme_adi, 'tr'));
        setGarajInventory(mapped);
      }

      // 4b. Fetch Ana Depo list
      const { data: anaDepoRows } = await api.from('vehicle_inventory').select('*').eq('plaka', 'ANA_DEPO')
      if (anaDepoRows && masterInv) {
        const mapped = anaDepoRows.map((item: any) => {
          const matchingInv = masterInv.find((i: any) => i.id === item.inventory_id);
          return {
            id: item.id,
            malzeme_adi: matchingInv ? matchingInv.malzeme_adi : `Bilinmeyen Malzeme (ID: ${item.inventory_id})`,
            bolme_kapak: item.bolme_kapak || "Ana Depo",
            adet: item.adet || 0
          };
        });
        mapped.sort((a: any, b: any) => a.malzeme_adi.localeCompare(b.malzeme_adi, 'tr'));
        setAnaDepoInventory(mapped);
      }

      // 5. Select first vehicle by default for CRUD editor
      if (vehs && vehs.length > 0 && !selectedPlaka) {
        setSelectedPlaka(vehs[0].plaka);
      }
    } catch (err) {
      console.error("Envanter veri yükleme hatası:", err)
    } finally {
      setLoading(false)
    }
  };

  // Load rows when selectedPlaka changes
  useEffect(() => {
    if (!selectedPlaka) return;
    
    async function loadVehicleRows() {
      try {
        setLoadingRows(true)
        const { data: vehInv } = await api.from('vehicle_inventory').select('*').eq('plaka', selectedPlaka)
        const { data: masterInv } = await api.from('inventory').select('id, malzeme_adi')
        
        if (vehInv && masterInv) {
          const cache: Record<string, number> = {};
          masterInv.forEach((item: any) => {
            cache[item.malzeme_adi.toUpperCase()] = item.id;
          });
          setInventoryCache(cache);

          const mapped: InventoryRow[] = vehInv.map((item: any) => {
            const matchingInv = masterInv.find((i: any) => i.id === item.inventory_id);
            return {
              internalId: Math.random().toString(36).substring(7),
              id: item.id,
              plaka: item.plaka,
              bolme_kapak: item.bolme_kapak || "Araç İçi",
              malzeme_adi: matchingInv ? matchingInv.malzeme_adi : `Bilinmeyen Malzeme (ID: ${item.inventory_id})`,
              adet: item.adet || 0,
              durum: item.durum || "Tam"
            };
          });

          // Sort table rows by bolme_kapak, then by name
          mapped.sort((a, b) => {
            const locComp = a.bolme_kapak.localeCompare(b.bolme_kapak, 'tr');
            if (locComp !== 0) return locComp;
            return a.malzeme_adi.localeCompare(b.malzeme_adi, 'tr');
          });

          setTableRows(mapped);
          if (mapped.length > 0) {
            setExpandedCompartments({ [mapped[0].bolme_kapak]: true });
          } else {
            setExpandedCompartments({});
          }
        } else {
          setTableRows([]);
          setExpandedCompartments({});
        }
      } catch (err) {
        console.error("Araç envanter yükleme hatası:", err)
      } finally {
        setLoadingRows(false)
      }
    }
    loadVehicleRows()
  }, [selectedPlaka])

  // Field change handler
  const handleFieldChange = (internalId: string, field: keyof InventoryRow, value: any) => {
    setTableRows(prev => prev.map(row => 
      row.internalId === internalId ? { ...row, [field]: value } : row
    ));
  };

  // Add new row handler
  const handleAddNewItem = () => {
    if (!canEdit) return;
    const defaultComp = selectedPlaka === "GARAJ" ? "Garaj" : selectedPlaka === "ANA_DEPO" ? "Ana Depo" : "Araç İçi";
    setTableRows(prev => [
      ...prev,
      {
        internalId: Math.random().toString(36).substring(7),
        plaka: selectedPlaka,
        bolme_kapak: defaultComp,
        malzeme_adi: "",
        adet: 1,
        durum: "Tam"
      }
    ]);
    setExpandedCompartments(prev => ({
      ...prev,
      [defaultComp]: true
    }))
  };

  const handleAddNewItemInCompartment = (comp: string) => {
    if (!canEdit) return;
    setTableRows(prev => [
      ...prev,
      {
        internalId: Math.random().toString(36).substring(7),
        plaka: selectedPlaka,
        bolme_kapak: comp,
        malzeme_adi: "",
        adet: 1,
        durum: "Tam"
      }
    ]);
    setExpandedCompartments(prev => ({
      ...prev,
      [comp]: true
    }))
  };

  const toggleCompartment = (comp: string) => {
    setExpandedCompartments(prev => ({
      ...prev,
      [comp]: !prev[comp]
    }))
  };

  // Delete row handler
  const handleDeleteItem = (internalId: string) => {
    if (!canEdit) return;
    setTableRows(prev => prev.filter(row => row.internalId !== internalId));
  };

  // Save changes to database
  const saveInventoryToDB = async () => {
    if (!canEdit) {
      toast('Envanter düzenleme yetkiniz bulunmamaktadır. Bu işlem yalnızca Admin ve Editor rolleri tarafından yapılabilir.')
      return
    }
    setIsSaving(true)
    setSaveSuccess(false)
    
    try {
      // 1. Gather all unique malzeme_adi, create new inventory master items if they don't exist
      const cache = { ...inventoryCache };
      
      for (const row of tableRows) {
        const matName = row.malzeme_adi.trim();
        if (!matName) continue;
        
        const matUpper = matName.toUpperCase();
        if (!cache[matUpper]) {
          // Dynamic insert into master inventory
          const insertRes = await api.insert('inventory', { malzeme_adi: matName });
          if (insertRes.error) {
            throw new Error(`Yeni master malzeme "${matName}" eklenirken hata oluştu: ${insertRes.error}`);
          }
          if (insertRes.data && insertRes.data[0]) {
            cache[matUpper] = insertRes.data[0].id;
          }
        }
      }
      setInventoryCache(cache);

      // 2. Prepare database insert rows
      const dbRows = tableRows
        .filter(row => row.malzeme_adi.trim() !== "")
        .map(row => {
          const matUpper = row.malzeme_adi.trim().toUpperCase();
          return {
            plaka: selectedPlaka,
            inventory_id: cache[matUpper],
            adet: Number(row.adet),
            durum: row.durum || "Tam",
            bolme_kapak: row.bolme_kapak || (selectedPlaka === "GARAJ" ? "Garaj" : selectedPlaka === "ANA_DEPO" ? "Ana Depo" : "Araç İçi")
          };
        });

      // 3. Clear old records for selected vehicle in vehicle_inventory
      const removeRes = await api.remove('vehicle_inventory', { plaka: selectedPlaka });
      if (removeRes.error) {
        throw new Error(`Eski envanter silinirken hata oluştu: ${removeRes.error}`);
      }

      // 4. Batch insert new records into vehicle_inventory
      if (dbRows.length > 0) {
        const insertRes = await api.insert('vehicle_inventory', dbRows);
        if (insertRes.error) {
          throw new Error(`Envanter kaydedilirken hata oluştu: ${insertRes.error}`);
        }
      }

      // 5. Rebuild bolmeler JSON for backward compatibility
      const newBolmeler: Record<string, any[]> = {};
      dbRows.forEach(row => {
        const key = getCompartmentKey(row.bolme_kapak);
        if (!newBolmeler[key]) newBolmeler[key] = [];
        
        // Find matching master name
        const masterName = tableRows.find(
          r => r.bolme_kapak === row.bolme_kapak && getCompartmentKey(r.bolme_kapak) === key && cache[r.malzeme_adi.trim().toUpperCase()] === row.inventory_id
        )?.malzeme_adi || "Bilinmeyen Malzeme";

        newBolmeler[key].push({
          malzeme: masterName,
          adet: row.adet,
          durum: row.durum
        });
      });

      const vehicleUpdateRes = await api.update('vehicles', { bolmeler: newBolmeler }, { plaka: selectedPlaka });
      if (vehicleUpdateRes.error) {
        console.warn("⚠️ bolmeler JSON update warning:", vehicleUpdateRes.error);
      }

      // 6. Save audit log
      fetch('/api/audit-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action_type: 'inventory_update',
          actor_sicil_no: user?.sicilNo || 'unknown',
          actor_name: user ? `${user.ad} ${user.soyad}` : 'Bilinmeyen',
          target: selectedPlaka,
          details: {
            total_items: dbRows.length,
            compartments: Object.keys(newBolmeler),
          },
        }),
      }).catch(err => console.error('[AuditLog] Envanter güncelleme logu gönderilemedi:', err))

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      
      // Refresh local matrix and data cache
      loadAllData();
    } catch (err: any) {
      toast("Hata oluştu: " + err.message)
    } finally {
      setIsSaving(false)
    }
  }

  // Print engine handler
  const handlePrint = () => {
    const printArea = document.getElementById('print-area-qr')
    if (!printArea) return

    const clone = printArea.cloneNode(true) as HTMLElement
    clone.className = 'print-area-container'
    clone.id = 'print-area-live'
    document.body.appendChild(clone)

    setTimeout(() => {
      window.print()
      setTimeout(() => {
        const live = document.getElementById('print-area-live')
        if (live) document.body.removeChild(live)
      }, 500)
    }, 400)
  }

  // Maintenance Plakas set
  const maintenancePlakas = useMemo(() => {
    return new Set(
      vehicles
        .filter(v => v.current_branch === 'Makine İkmal Müdürlüğü (Bakım-Onarım)')
        .map(v => v.plaka)
    );
  }, [vehicles]);


  // S.T.O.K Sheet vehicle columns extract (Excluding GARAJ and ANA_DEPO to put in separate section)
  const vehicleColumns = useMemo(() => {
    const set = new Set(allVehicleInventory.map(item => item.plaka));
    return Array.from(set)
      .filter(plaka => plaka !== "GARAJ" && plaka !== "ANA_DEPO" && !maintenancePlakas.has(plaka))
      .sort((a, b) => a.localeCompare(b, 'tr'));
  }, [allVehicleInventory, maintenancePlakas]);

  // General stock matrix client-side Excel CSV exporter (includes vehicle columns)
  const exportStockMatrixToCSV = () => {
    const headers = [
      "Sira No", 
      "Malzeme Cinsi", 
      ...vehicleColumns,
      "Merkez", 
      "Esentepe", 
      "OSB (Organize)", 
      "Depo", 
      "Toplam Stok"
    ];

    const rows = filteredInventory.map((item, idx) => {
      const rowAllocations = allVehicleInventory.filter(vi => vi.inventory_id === item.id);
      const vehicleCountMap: Record<string, number> = {};
      rowAllocations.forEach(a => {
        vehicleCountMap[a.plaka] = a.adet;
      });

      const vehicleSum = Object.entries(vehicleCountMap)
        .filter(([plaka]) => plaka !== "GARAJ" && plaka !== "ANA_DEPO" && !maintenancePlakas.has(plaka))
        .reduce((sum, [_, val]) => sum + val, 0);

      const liveTotal = (item.merkez || 0) + (item.esentepe || 0) + (item.organize || 0) + (item.depo || 0) + vehicleSum;
      const vehicleCounts = vehicleColumns.map(plaka => vehicleCountMap[plaka] || 0);

      return [
        idx + 1,
        item.malzeme_adi,
        ...vehicleCounts,
        item.merkez,
        item.esentepe,
        item.organize,
        item.depo,
        liveTotal
      ];
    });
    
    let csvContent = "\uFEFF"; // UTF-8 BOM for Excel compatibility
    csvContent += headers.join(";") + "\n";
    rows.forEach(row => {
      csvContent += row.join(";") + "\n";
    });
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "Sivas_Itfaiyesi_Genel_Stok_Matrisi_2026.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Get distinct compartments in current table rows for QR printer
  const distinctCompartments = useMemo(() => {
    const set = new Set(tableRows.map(row => row.bolme_kapak));
    return Array.from(set).filter(Boolean);
  }, [tableRows]);

  const compartmentsToRender = useMemo(() => {
    const present = new Set(tableRows.map(r => r.bolme_kapak))
    const list = CLEAN_COMPARTMENT_OPTIONS.filter(c => present.has(c))
    tableRows.forEach(r => {
      if (r.bolme_kapak && !list.includes(r.bolme_kapak)) {
        list.push(r.bolme_kapak)
      }
    })
    if (list.length === 0) {
      list.push(selectedPlaka === "GARAJ" ? "Garaj" : selectedPlaka === "ANA_DEPO" ? "Ana Depo" : "Araç İçi")
    }
    return list
  }, [tableRows, selectedPlaka]);

  const printCompartments = printFilter === "all" ? distinctCompartments : [printFilter];

  // Dynamic distribution mapping for stock query tab cards
  const distributionMap = useMemo(() => {
    const map: Record<number, { plaka: string; adet: number }[]> = {};
    allVehicleInventory.forEach(item => {
      const invId = item.inventory_id;
      if (!map[invId]) map[invId] = [];
      map[invId].push({ plaka: item.plaka, adet: item.adet });
    });
    return map;
  }, [allVehicleInventory]);

  // Master stock filtering
  const filteredInventory = useMemo(() => {
    if (!searchQuery.trim()) return masterInventory;
    const query = normalizeTextForSearch(searchQuery.trim());
    return masterInventory.filter(item => 
      normalizeTextForSearch(item.malzeme_adi).includes(query)
    );
  }, [masterInventory, searchQuery]);


  return (
    <PageGuard pageId="envanter">
      <div className="space-y-6 w-full max-w-full pb-12 animate-in fade-in duration-300">
        
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-[var(--fd-border)] pb-4 print:hidden gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[var(--fd-text)] flex items-center gap-2">
              <Combine className="w-8 h-8 text-[var(--fd-accent)] drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
              QR & Envanter Yönetimi
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Araç malzemelerini canlı düzenleyin, sistem QR etiketlerini toplu şekilde yazdırın.
            </p>
          </div>
          
          {/* Print controls visible only on CRUD tab */}
          {activeTab === "crud" && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
              <select 
                value={printFilter} 
                onChange={e => setPrintFilter(e.target.value)} 
                className="h-11 w-full sm:w-auto rounded-lg border border-[var(--fd-border)] bg-[var(--fd-surface2)] px-3 text-sm text-[var(--fd-text)] focus:outline-none focus:ring-2 focus:border-[var(--fd-accent)] shrink-0 font-medium font-mono min-h-[44px]"
              >
                <option value="all">Tüm Bölmeler</option>
                {distinctCompartments.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <Button 
                onClick={handlePrint} 
                variant="default" 
                className="w-full sm:w-auto h-11 shrink-0 font-bold bg-orange-600 hover:bg-orange-500 text-white shadow-[0_0_15px_-3px_rgba(249,115,22,0.4)] border border-orange-500/30 min-h-[44px]"
              >
                <Printer className="w-4 h-4 mr-2" />
                Etiketleri Yazdır
              </Button>
              <InfoTooltip content="Bu butona basarak seçili aracın içindeki tüm malzemelerin QR kodlu etiketlerini tek tıkla yazdırabilirsiniz." />
            </div>
          )}

          {/* Matrix export visible only on Matrix tab */}
          {activeTab === "matrix" && (
            <Button 
              onClick={exportStockMatrixToCSV} 
              variant="secondary" 
              className="w-full sm:w-auto h-11 shrink-0 font-bold border border-[var(--fd-border)] bg-slate-800/85 hover:bg-[var(--fd-surface3)] text-[var(--fd-text)] min-h-[44px]"
            >
              <FileSpreadsheet className="w-4 h-4 mr-2 text-emerald-400" />
              Excel (CSV) İndir
            </Button>
          )}
        </div>

        {/* Tab Selection Row */}
        <div className="flex gap-2 p-1 bg-[var(--fd-surface2)] backdrop-blur-md rounded-xl border border-white/5 self-start print:hidden">
          <button
            onClick={() => setActiveTab("crud")}
            className={`px-4 py-2 text-xs md:text-sm font-bold rounded-lg transition-all ${activeTab === "crud" ? "bg-[var(--fd-accent)] text-[#ffffff] shadow-[var(--fd-shadow-sm)]" : "text-[var(--fd-text3)] hover:text-[var(--fd-text2)]"}`}
          >
            🚗 Araç Envanter Editörü (CRUD)
          </button>
          <button
            onClick={() => setActiveTab("matrix")}
            className={`px-4 py-2 text-xs md:text-sm font-bold rounded-lg transition-all ${activeTab === "matrix" ? "bg-[var(--fd-accent)] text-[#ffffff] shadow-[var(--fd-shadow-sm)]" : "text-[var(--fd-text3)] hover:text-[var(--fd-text2)]"}`}
          >
            📊 Genel Stok & Sorgu Matrisi
          </button>
        </div>

        {/* Dynamic Display Tab Body */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4 print:hidden">
            <Combine className="w-12 h-12 text-[var(--fd-accent)] animate-spin" />
            <p className="text-[var(--fd-text3)] font-mono text-sm tracking-wider">ENVANTER VERİLERİ ÇEKİLİYOR...</p>
          </div>
        ) : (
          
          /* ════════════════ TAB 1: CRUD EDITOR ════════════════ */
          activeTab === "crud" ? (
            <div className="space-y-6">
              {/* Vehicle Selection Header Card */}
              <Card className="bg-[var(--fd-surface2)]/75 backdrop-blur-lg border border-[var(--fd-border)] shadow-[0_4px_30px_rgba(0,0,0,0.4)] rounded-2xl print:hidden">
                <CardContent className="p-5 flex flex-col md:flex-row gap-4 items-stretch md:items-center">
                  
                  {/* Target Plate Select Dropdown */}
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold text-[var(--fd-text3)] uppercase tracking-wider mb-1.5 font-mono">HEDEF ARAÇ PLAKASI</label>
                    <div className="relative">
                      <select
                        value={selectedPlaka}
                        onChange={(e) => setSelectedPlaka(e.target.value)}
                        className="w-full h-12 rounded-xl border border-[var(--fd-border)] bg-[var(--fd-surface2)] px-3.5 font-mono font-bold text-[var(--fd-text)] text-sm md:text-base focus:outline-none focus:ring-2 focus:border-[var(--fd-accent)] cursor-pointer"
                      >
                        <option value="">-- Araç / Depo Seçin --</option>
                        <option value="ANA_DEPO">🏢 ANA DEPO (Genel Lojistik)</option>
                        {vehicles.map(v => (
                          <option key={v.plaka} value={v.plaka}>
                            {v.plaka === "GARAJ" 
                              ? "🏠 GARAJ (Merkez İtfaiye ve Şubeler)" 
                              : `🚗 ${v.filo_no ? `${v.filo_no} NOLU ${v.aciklama || ''} (${v.plaka})` : `${v.arac_tipi || ''} (${v.plaka})`}`}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Separator / Arrow */}
                  <div className="flex items-center justify-center pt-4 md:pt-6 px-2">
                    <ArrowRight className="text-[var(--fd-accent)]/40 w-5 h-5 hidden md:block" />
                  </div>

                  {/* Durum Bilgisi Counter Box */}
                  <div className="flex-1 bg-[var(--fd-surface2)]/40 p-3 rounded-xl border border-white/5 border-dashed flex justify-between items-center h-12">
                    <div>
                      <p className="text-[9px] font-bold text-[var(--fd-text3)] uppercase font-mono leading-none mb-1">Durum Bilgisi</p>
                      <p className="text-xs text-[var(--fd-text2)] font-semibold leading-none">Toplam Malzeme Çeşitliliği</p>
                    </div>
                    <span className="font-mono bg-rose-500/10 text-rose-400 border border-rose-500/25 px-2.5 py-1 rounded text-xs font-bold shrink-0">
                      {tableRows.length} Kalem
                    </span>
                  </div>

                </CardContent>
              </Card>

              {/* Admin/Editor Vehicle Details Edit Tools */}
              {canEdit && selectedPlaka && selectedPlaka !== "GARAJ" && selectedPlaka !== "ANA_DEPO" && (
                <Card className="bg-[var(--fd-surface2)]/75 backdrop-blur-lg border border-[var(--fd-border)] shadow-[0_4px_30px_rgba(0,0,0,0.4)] rounded-2xl print:hidden">
                  <CardContent className="p-5 flex flex-col sm:flex-row gap-4 items-end">
                    <div className="w-full sm:w-32">
                      <label className="block text-[10px] font-bold text-[var(--fd-text3)] uppercase tracking-wider mb-1.5 font-mono">FİLO NUMARASI</label>
                      <input
                        type="number"
                        value={editFiloNo}
                        onChange={(e) => setEditFiloNo(e.target.value)}
                        placeholder="Örn: 3"
                        className="w-full h-11 rounded-xl border border-[var(--fd-border)] bg-[var(--fd-surface2)] px-3.5 font-mono font-bold text-[var(--fd-text)] text-sm focus:outline-none focus:ring-2 focus:border-[var(--fd-accent)]"
                      />
                    </div>
                    <div className="flex-1 w-full font-sans">
                      <label className="block text-[10px] font-bold text-[var(--fd-text3)] uppercase tracking-wider mb-1.5 font-mono">AÇIKLAMA / ÇAĞRI ADI</label>
                      <input
                        type="text"
                        value={editAciklama}
                        onChange={(e) => setEditAciklama(e.target.value)}
                        placeholder="Örn: Ford Kargo Merdiven"
                        className="w-full h-11 rounded-xl border border-[var(--fd-border)] bg-[var(--fd-surface2)] px-3.5 font-bold text-[var(--fd-text)] text-sm focus:outline-none focus:ring-2 focus:border-[var(--fd-accent)]"
                      />
                    </div>
                    <button
                      onClick={handleUpdateVehicleMeta}
                      className="h-11 px-5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-extrabold rounded-xl text-xs uppercase tracking-wider transition-all duration-200 cursor-pointer shrink-0 w-full sm:w-auto font-sans shadow-[0_0_15px_-3px_rgba(16,185,129,0.15)] hover:shadow-[0_0_20px_-3px_rgba(16,185,129,0.3)]"
                    >
                      💾 Bilgiyi Güncelle
                    </button>
                  </CardContent>
                </Card>
              )}

              {/* CRUD Editor Table Matrix Card */}
              {!selectedPlaka ? (
                <Card className="bg-[var(--fd-surface2)]/40 border border-[var(--fd-border)]/40 py-16 text-center rounded-2xl print:hidden">
                  <p className="text-[var(--fd-text3)] italic text-sm">Düzenleme yapmak için lütfen üst menüden bir taktik araç plakası veya garaj deposunu seçin.</p>
                </Card>
              ) : (
                <Card className="bg-[var(--fd-surface2)]/75 backdrop-blur-lg border border-[var(--fd-border)] shadow-[0_4px_30px_rgba(0,0,0,0.4)] overflow-hidden rounded-2xl print:hidden">
                  <CardHeader className="bg-[var(--fd-surface2)]/40 border-b border-[var(--fd-border)] flex flex-row items-center justify-between p-5">
                    <CardTitle className="text-base font-bold text-[var(--fd-text2)] flex items-center gap-2 tracking-tight">
                      <Combine className="w-4 h-4 text-[var(--fd-accent)]" />
                      <span>
                        {selectedPlaka === "GARAJ" 
                          ? "Garaj Deposu Envanter Editörü" 
                          : selectedPlaka === "ANA_DEPO"
                            ? "Ana Depo Envanter Editörü"
                            : (() => {
                              const currentVeh = vehicles.find(v => v.plaka === selectedPlaka);
                              return currentVeh?.filo_no 
                                ? `${currentVeh.filo_no} NOLU ${currentVeh.aciklama || ''} (${selectedPlaka})` 
                                : `Tablo Yöneticisi (${selectedPlaka})`;
                            })()
                        }
                      </span>
                    </CardTitle>
                    {canEdit && (
                      <Button 
                        onClick={handleAddNewItem} 
                        size="sm" 
                        variant="secondary" 
                        className="font-bold border border-[var(--fd-border)] bg-slate-800/80 hover:bg-[var(--fd-surface3)] text-[var(--fd-text2)] text-xs rounded-lg px-3 py-1.5"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1 text-[var(--fd-accent)]"/>
                        Yeni Satır
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className="p-0">
                    
                    {loadingRows ? (
                      <div className="flex flex-col items-center justify-center py-20 space-y-4">
                        <Loader2 className="w-8 h-8 text-[var(--fd-accent)] animate-spin" />
                        <p className="text-[var(--fd-text3)] font-mono text-xs">Ayrıntılı envanter listesi yükleniyor...</p>
                      </div>
                    ) : tableRows.length === 0 ? (
                      <div className="py-16 text-center text-[var(--fd-text3)] italic font-mono text-xs">
                        Bu araca ait malzeme kaydı bulunamadı. "Yeni Satır" butonuna basarak envanter ekleyin.
                      </div>
                    ) : (
                      <div className="flex flex-col divide-y divide-[var(--fd-border)]/60">
                        {compartmentsToRender.map((comp) => {
                          const rowsInComp = tableRows.filter(r => r.bolme_kapak === comp)
                          const isExpanded = !!expandedCompartments[comp]

                          return (
                            <div key={comp} className="flex flex-col">
                              <div
                                role="button"
                                tabIndex={0}
                                onClick={() => toggleCompartment(comp)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    toggleCompartment(comp)
                                  }
                                }}
                                className="w-full flex items-center justify-between p-4 bg-[var(--fd-surface2)]/15 hover:bg-[var(--fd-surface2)]/40 transition-colors border-0 cursor-pointer select-none text-left focus:outline-none"
                              >
                                <div className="flex items-center gap-3">
                                  <span className="text-[10px] text-[var(--fd-accent)] font-bold font-mono w-4">
                                    {isExpanded ? "▼" : "▶"}
                                  </span>
                                  <span className="text-sm font-bold text-[var(--fd-text)]">
                                    {comp}
                                  </span>
                                  <Badge variant="muted" className="text-[10px] font-mono px-2 py-0.5 bg-[var(--fd-surface3)] text-[var(--fd-text2)] border border-[var(--fd-border)]">
                                    {rowsInComp.length} Malzeme
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-2">
                                  {canEdit && (
                                    <Button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleAddNewItemInCompartment(comp)
                                      }}
                                      size="sm"
                                      variant="secondary"
                                      className="h-7 px-2.5 font-bold border border-[var(--fd-border)] bg-slate-800/80 hover:bg-[var(--fd-surface3)] text-[var(--fd-text2)] text-[10px] rounded-lg"
                                    >
                                      + Yeni Ekle
                                    </Button>
                                  )}
                                </div>
                              </div>

                              {/* Accordion Content */}
                              {isExpanded && (
                                <div className="overflow-x-auto w-full bg-[var(--fd-surface2)]/5 border-t border-[var(--fd-border)]/60 animate-in slide-in-from-top-1 duration-150">
                                  <table className="w-full text-sm min-w-[700px]">
                                    <thead className="bg-[var(--fd-surface2)] text-[10px] text-[var(--fd-text3)] uppercase tracking-wider border-b border-[var(--fd-border)]/40 font-mono">
                                      <tr>
                                        <th className="px-5 py-3 text-left font-semibold w-1/4">BÖLME (KAPAK)</th>
                                        <th className="px-5 py-3 text-left font-semibold">MALZEME ADI</th>
                                        <th className="px-5 py-3 text-left font-semibold w-24">ADET</th>
                                        <th className="px-5 py-3 text-left font-semibold w-40">DURUM</th>
                                        <th className="px-5 py-3 text-center font-semibold w-40">İŞLEMLER</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--fd-border)]/30 font-medium">
                                      {rowsInComp.length === 0 ? (
                                        <tr>
                                          <td colSpan={5} className="py-8 text-center text-[var(--fd-text3)] italic font-mono text-xs">
                                            Bu bölmede kayıtlı malzeme bulunamadı. "+ Yeni Ekle" butonuna basarak ekleyin.
                                          </td>
                                        </tr>
                                      ) : (
                                        rowsInComp.map((row) => {
                                          const isTempAssigned = row.durum === '🔄 GEÇİCİ ZİMMETTE';
                                          return (
                                            <tr 
                                              key={row.internalId} 
                                              className={cn(
                                                "hover:bg-white/5 transition-colors duration-150",
                                                isTempAssigned && "bg-amber-500/[0.02] opacity-75"
                                              )}
                                            >
                                              {/* Compartment select */}
                                              <td className="px-5 py-2 align-middle">
                                                <select
                                                  value={row.bolme_kapak}
                                                  onChange={(e) => handleFieldChange(row.internalId, "bolme_kapak", e.target.value)}
                                                  className="h-9 w-full rounded-lg border border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text2)] px-2.5 py-1 text-xs focus:border-[var(--fd-accent)] focus:ring-1 focus:border-[var(--fd-accent)] outline-none font-mono"
                                                  disabled={isTempAssigned || !canEdit}
                                                >
                                                  {CLEAN_COMPARTMENT_OPTIONS.map(option => (
                                                    <option key={option} value={option}>{option}</option>
                                                  ))}
                                                </select>
                                              </td>

                                              {/* Material Name input */}
                                              <td className="px-5 py-2 align-middle">
                                                <div className="flex flex-col gap-1 w-full">
                                                  <Input 
                                                    placeholder="Malzeme ismi..."
                                                    value={row.malzeme_adi}
                                                    onChange={(e) => handleFieldChange(row.internalId, "malzeme_adi", e.target.value)}
                                                    className="bg-[var(--fd-surface2)] border-[var(--fd-border)] text-[var(--fd-text2)] text-xs focus:border-[var(--fd-accent)] h-9 w-full"
                                                    disabled={isTempAssigned || !canEdit}
                                                  />
                                                  {isTempAssigned && (
                                                    <span className="text-[10px] font-semibold text-amber-500 flex items-center gap-1 select-none">
                                                      ⚠️ Bu malzeme geçici zimmet verilmiştir. Geçici zimmet takibi ekranında kontrol edin.
                                                    </span>
                                                  )}
                                                </div>
                                              </td>

                                              {/* Quantity input */}
                                              <td className="px-5 py-2 align-middle">
                                                <Input 
                                                  type="number"
                                                  min="1"
                                                  value={row.adet}
                                                  onChange={(e) => handleFieldChange(row.internalId, "adet", Number(e.target.value))}
                                                  className="bg-[var(--fd-surface2)] border-[var(--fd-border)] text-[var(--fd-text2)] font-mono text-xs focus:border-[var(--fd-accent)] h-9 w-20 text-center"
                                                  disabled={isTempAssigned || !canEdit}
                                                />
                                              </td>

                                              {/* Status select */}
                                              <td className="px-5 py-2 align-middle">
                                                <select
                                                  value={row.durum}
                                                  onChange={(e) => handleFieldChange(row.internalId, "durum", e.target.value)}
                                                  className="h-9 w-full rounded-lg border border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text2)] px-2.5 py-1 text-xs focus:border-[var(--fd-accent)] focus:ring-1 focus:border-[var(--fd-accent)] outline-none font-mono font-bold"
                                                  disabled={isTempAssigned || !canEdit}
                                                >
                                                  {DURUM_OPTIONS.map(opt => (
                                                    <option key={opt.value} value={opt.value} className={opt.colorClass}>
                                                      {opt.label}
                                                    </option>
                                                  ))}
                                                </select>
                                              </td>

                                              {/* Actions cell */}
                                              <td className="px-5 py-2 text-center align-middle flex items-center justify-center gap-1.5">
                                                {canEdit && (
                                                  <>
                                                    <button
                                                      type="button"
                                                      onClick={() => handleOpenAssignmentModal(row)}
                                                      disabled={!row.malzeme_adi || isTempAssigned}
                                                      className="h-9 px-2 flex items-center justify-center text-[var(--fd-accent)] hover:bg-[var(--fd-accent-soft2)] rounded-lg transition-colors border border-transparent hover:border-[var(--fd-accent-soft2)] text-xs font-bold gap-1 disabled:opacity-40 disabled:cursor-not-allowed min-h-[38px]"
                                                      title={isTempAssigned ? "Zimmetli malzeme tekrar zimmetlenemez" : "Geçici Zimmetle"}
                                                    >
                                                      <span>🔄</span>
                                                      <span className="hidden sm:inline">Zimmetle</span>
                                                    </button>
                                                    <button 
                                                      type="button"
                                                      onClick={() => handleDeleteItem(row.internalId)}
                                                      disabled={isTempAssigned}
                                                      className="h-9 w-9 flex items-center justify-center text-[var(--fd-text3)] hover:bg-rose-500/10 hover:text-rose-400 rounded-lg transition-colors border border-transparent hover:border-rose-500/20 min-h-[38px] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--fd-text3)] disabled:cursor-not-allowed"
                                                      title={isTempAssigned ? "Zimmetli malzeme silinemez" : "Satırı Kaldır"}
                                                    >
                                                      <Trash2 className="w-4 h-4" />
                                                    </button>
                                                  </>
                                                )}
                                              </td>
                                            </tr>
                                          );
                                        })
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </CardContent>
                  
                  {/* Save bar */}
                  {canEdit && (
                    <div className="p-4 border-t border-[var(--fd-border)] bg-[var(--fd-surface2)] backdrop-blur-md flex flex-col sm:flex-row justify-end items-stretch sm:items-center gap-3">
                      {saveSuccess && (
                        <span className="text-xs font-mono font-bold text-emerald-400 mr-2 flex items-center gap-1.5 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/25 justify-center">
                          ✓ VERİTABANINA YAZILDI VE MÜHÜRLENDİ
                        </span>
                      )}
                      <Button 
                        onClick={saveInventoryToDB} 
                        disabled={isSaving || loadingRows} 
                        className="font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-[0_0_15px_-3px_rgba(225,29,72,0.4)] border border-rose-500/30 px-6 min-h-[44px] transition-all duration-200 active:scale-[0.97]"
                      >
                        {isSaving ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Kaydediliyor...
                          </>
                        ) : (
                          <>
                            <Save className="w-4 h-4 mr-2"/>
                            Kaydet
                          </>
                        )}
                      </Button>
                      <InfoTooltip content="Bu butona basarak girdiğiniz sayım veya değişiklik bilgilerini anında sisteme kaydedebilirsiniz." />
                    </div>
                  )}
                </Card>
              )}
            </div>
          ) : (
            
            /* ════════════════ TAB 2: GENERAL STOCK MATRIX ════════════════ */
            <div className="space-y-6">
              
              {/* Dynamic query search bar */}
              <Card className="bg-[var(--fd-surface2)]/75 backdrop-blur-lg border border-[var(--fd-border)] shadow-[0_4px_30px_rgba(0,0,0,0.4)] rounded-2xl print:hidden">
                <CardContent className="p-5">
                  <div className="relative">
                    <Search className="absolute left-4 top-3.5 text-[var(--fd-text3)] w-5 h-5" />
                    <Input
                      type="text"
                      placeholder="Malzeme ismi ile matriste süzme yapın (Örn: Ala Hortum, Motopomp, Jeneratör)..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="bg-[var(--fd-surface2)] border-[var(--fd-border)] text-[var(--fd-text)] text-sm focus:border-[var(--fd-accent)] focus:border-[var(--fd-accent)] h-12 pl-12 rounded-xl"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Dynamic Search Cards for vehicle distributions (visible only when search has text) */}
              {searchQuery.trim() !== "" && (
                <div className="space-y-4 print:hidden">
                  <h3 className="text-xs font-bold text-[var(--fd-text3)] uppercase tracking-wider font-mono pl-1">ARAMA SONUÇLARI MATRİS DIŞI DAĞILIM KARTLARI</h3>
                  
                  {filteredInventory.length === 0 ? (
                    <Card className="bg-[var(--fd-surface2)]/40 border border-[var(--fd-border)]/40 py-8 text-center rounded-2xl">
                      <p className="text-[var(--fd-text3)] italic text-sm">Aranan malzeme cinsiyle eşleşen envanter kaydı bulunamadı.</p>
                    </Card>
                  ) : (
                    <div className="grid grid-cols-1 gap-4">
                      {filteredInventory.map(item => {
                        const dists = distributionMap[item.id] || [];
                        return (
                          <Card key={item.id} className="bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] overflow-hidden shadow-lg hover:border-cyan-500/35 transition-all duration-200">
                            <CardHeader className="bg-[var(--fd-surface2)]/40 border-b border-white/5 p-4 flex flex-row justify-between items-center">
                              <span className="font-bold text-[var(--fd-text2)] text-sm">{item.malzeme_adi}</span>
                              <span className="font-mono bg-[var(--fd-accent-soft2)] text-[var(--fd-accent)] border border-[var(--fd-accent-soft2)] px-2 py-0.5 rounded text-xs font-bold">
                                Toplam: {item.toplam} Adet (Depo)
                              </span>
                            </CardHeader>
                            <CardContent className="p-4 space-y-4">
                              
                              {/* Depot list */}
                              <div className="grid grid-cols-4 gap-2 bg-[var(--fd-surface2)]/40 p-2.5 rounded-xl border border-white/5 text-center">
                                <div>
                                  <span className="text-[9px] font-bold text-[var(--fd-text3)] uppercase font-mono">Merkez</span>
                                  <p className="font-mono font-bold text-[var(--fd-text2)] text-xs mt-0.5">{item.merkez}</p>
                                </div>
                                <div>
                                  <span className="text-[9px] font-bold text-[var(--fd-text3)] uppercase font-mono">Esentepe</span>
                                  <p className="font-mono font-bold text-[var(--fd-text2)] text-xs mt-0.5">{item.esentepe}</p>
                                </div>
                                <div>
                                  <span className="text-[9px] font-bold text-[var(--fd-text3)] uppercase font-mono">OSB</span>
                                  <p className="font-mono font-bold text-[var(--fd-text2)] text-xs mt-0.5">{item.organize}</p>
                                </div>
                                <div>
                                  <span className="text-[9px] font-bold text-[var(--fd-text3)] uppercase font-mono">Depo</span>
                                  <p className="font-mono font-bold text-[var(--fd-text2)] text-xs mt-0.5">{item.depo}</p>
                                </div>
                              </div>

                              {/* Vehicles distribution */}
                              <div className="space-y-2">
                                <span className="text-[9px] font-bold text-[var(--fd-text3)] uppercase tracking-wider font-mono flex items-center gap-1.5">
                                  <Truck className="w-3.5 h-3.5 text-[var(--fd-accent)]" /> Taktik Araç Zimmet Dağılımı (Garaj ve Ana Depo Hariç)
                                </span>
                                {dists.filter(d => d.plaka !== "GARAJ" && d.plaka !== "ANA_DEPO").length === 0 ? (
                                  <p className="text-[11px] text-[var(--fd-text3)] italic font-mono pl-1">Araç üzerinde aktif zimmet bulunmamaktadır.</p>
                                ) : (
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {dists.filter(d => d.plaka !== "GARAJ" && d.plaka !== "ANA_DEPO").map(d => (
                                      <div key={d.plaka} className="bg-[var(--fd-surface2)] px-3 py-1.5 rounded-lg border border-white/5 flex items-center justify-between">
                                        <span className="font-mono text-xs text-[var(--fd-text3)] font-bold">{d.plaka}</span>
                                        <span className="font-mono text-xs text-[var(--fd-accent)] font-extrabold bg-[var(--fd-accent-soft)] px-2 py-0.5 rounded border border-[var(--fd-accent-soft2)]">{d.adet}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                            </CardContent>
                          </Card>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Master stock pivot table matrix (Excel layout) */}
              <Card className="bg-[var(--fd-surface2)]/75 backdrop-blur-lg border border-[var(--fd-border)] shadow-[0_4px_30px_rgba(0,0,0,0.4)] rounded-2xl overflow-hidden">
                <CardHeader className="bg-[var(--fd-surface2)]/40 border-b border-[var(--fd-border)] p-5 flex justify-between items-center flex-row">
                  <CardTitle className="text-base font-bold text-[var(--fd-text2)] flex items-center gap-2 tracking-tight">
                    <Layers className="w-5 h-5 text-[var(--fd-accent)]" />
                    <span>Sivas İtfaiyesi Genel Stok Durumu</span>
                  </CardTitle>
                  <span className="font-mono bg-[var(--fd-accent-soft2)] text-[var(--fd-accent)] border border-[var(--fd-accent-soft2)] px-3 py-1 rounded-lg text-xs font-bold">
                    Genel Çeşitlilik: {filteredInventory.length} Kalem
                  </span>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto max-h-[60vh] scrollbar-thin scrollbar-thumb-slate-800 relative">
                    <table className="w-full text-xs min-w-[1600px] border-collapse">
                      <thead className="bg-[var(--fd-surface2)]/90 text-xs text-[var(--fd-text3)] uppercase tracking-wider border-b border-[var(--fd-border)] font-mono sticky top-0 z-20 backdrop-blur-md">
                        <tr>
                          <th className="px-4 py-4 text-left font-semibold w-16 sticky left-0 bg-[var(--fd-surface2)] z-30 border-r border-[var(--fd-border)]">S.No</th>
                          <th className="px-4 py-4 text-left font-semibold min-w-[240px] sticky left-16 bg-[var(--fd-surface2)] z-30 border-r border-[var(--fd-border)]">Malzeme (Cinsi)</th>
                          {/* Dynamically mapped vehicles */}
                          {vehicleColumns.map(plaka => (
                            <th key={plaka} className="px-3 py-4 text-center font-semibold w-28 border-r border-white/5 whitespace-nowrap">
                              {renderPlateHeader(plaka)}
                            </th>
                          ))}
                          {/* Warehouse branches */}
                          <th className="px-3 py-4 text-center font-bold w-24 border-r border-white/5 bg-[var(--fd-surface2)]/40 text-[var(--fd-text2)]">MERKEZ</th>
                          <th className="px-3 py-4 text-center font-bold w-24 border-r border-white/5 bg-[var(--fd-surface2)]/40 text-[var(--fd-text2)]">ESENTEPE</th>
                          <th className="px-3 py-4 text-center font-bold w-24 border-r border-white/5 bg-[var(--fd-surface2)]/40 text-[var(--fd-text2)]">ORGANİZE</th>
                          <th className="px-3 py-4 text-center font-bold w-24 border-r border-white/5 bg-[var(--fd-surface2)]/40 text-[var(--fd-text2)]">DEPO</th>
                          <th className="px-4 py-4 text-right font-bold w-32 bg-[var(--fd-accent-soft2)] text-[var(--fd-accent)] sticky right-0 z-30 border-l border-[var(--fd-accent-soft2)]">TOPLAM STOK</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-medium">
                        {filteredInventory.length === 0 ? (
                          <tr>
                            <td colSpan={vehicleColumns.length + 7} className="py-12 text-center text-[var(--fd-text3)] italic font-mono text-xs">
                              Gösterilecek malzeme cinsi bulunmamaktadır.
                            </td>
                          </tr>
                        ) : (
                          filteredInventory.map((item, idx) => {
                            // Find allocations for this specific row in inventory
                            const rowAllocations = allVehicleInventory.filter(vi => vi.inventory_id === item.id);
                            const vehicleCountMap: Record<string, number> = {};
                            rowAllocations.forEach(a => {
                              vehicleCountMap[a.plaka] = a.adet;
                            });

                            // Quantities sum of active vehicle columns (excluding GARAJ and ANA_DEPO)
                            const activeVehicleSum = Object.entries(vehicleCountMap)
                              .filter(([plaka]) => plaka !== "GARAJ" && plaka !== "ANA_DEPO" && !maintenancePlakas.has(plaka))
                              .reduce((sum, [_, val]) => sum + val, 0);

                            // Calculate dynamically verified absolute total
                            const liveTotal = (item.merkez || 0) + (item.esentepe || 0) + (item.organize || 0) + (item.depo || 0) + activeVehicleSum;

                            return (
                              <tr key={item.id} className="hover:bg-white/5 transition-colors duration-150 border-b border-white/5">
                                {/* Sticky columns */}
                                <td className="px-4 py-3 text-[var(--fd-text3)] font-mono text-xs sticky left-0 bg-[var(--fd-surface2)]/95 z-10 border-r border-[var(--fd-border)]">{idx + 1}</td>
                                <td className="px-4 py-3 text-[var(--fd-text)] font-bold text-sm sticky left-16 bg-[var(--fd-surface2)]/95 z-10 border-r border-[var(--fd-border)] truncate max-w-[240px]" title={item.malzeme_adi}>
                                  {item.malzeme_adi}
                                </td>
                                {/* Vehicle Cells */}
                                {vehicleColumns.map(plaka => {
                                  const qty = vehicleCountMap[plaka] || 0;
                                  return (
                                    <td 
                                      key={plaka} 
                                      className="px-3 py-3 text-center font-mono border-r border-white/5 align-middle"
                                    >
                                      {qty > 0 ? (
                                        <span className="inline-flex items-center justify-center bg-[var(--fd-accent-soft2)] text-[var(--fd-accent)] border border-[var(--fd-accent-soft2)] font-bold px-2 py-0.5 rounded-md text-xs min-w-[24px]">
                                          {qty}
                                        </span>
                                      ) : (
                                        <span className="text-slate-700/40 select-none">·</span>
                                      )}
                                    </td>
                                  )
                                })}
                                {/* Branch Cells */}
                                <td className="px-3 py-3 text-center font-mono border-r border-white/5 bg-[var(--fd-surface2)]/20 align-middle">
                                  {item.merkez > 0 ? (
                                    <span className="inline-flex items-center justify-center bg-violet-500/10 text-violet-400 border border-violet-500/20 font-bold px-2 py-0.5 rounded-md text-xs min-w-[24px]">
                                      {item.merkez}
                                    </span>
                                  ) : (
                                    <span className="text-slate-700/40 select-none">·</span>
                                  )}
                                </td>
                                <td className="px-3 py-3 text-center font-mono border-r border-white/5 bg-[var(--fd-surface2)]/20 align-middle">
                                  {item.esentepe > 0 ? (
                                    <span className="inline-flex items-center justify-center bg-violet-500/10 text-violet-400 border border-violet-500/20 font-bold px-2 py-0.5 rounded-md text-xs min-w-[24px]">
                                      {item.esentepe}
                                    </span>
                                  ) : (
                                    <span className="text-slate-700/40 select-none">·</span>
                                  )}
                                </td>
                                <td className="px-3 py-3 text-center font-mono border-r border-white/5 bg-[var(--fd-surface2)]/20 align-middle">
                                  {item.organize > 0 ? (
                                    <span className="inline-flex items-center justify-center bg-violet-500/10 text-violet-400 border border-violet-500/20 font-bold px-2 py-0.5 rounded-md text-xs min-w-[24px]">
                                      {item.organize}
                                    </span>
                                  ) : (
                                    <span className="text-slate-700/40 select-none">·</span>
                                  )}
                                </td>
                                <td className="px-3 py-3 text-center font-mono border-r border-white/5 bg-[var(--fd-surface2)]/20 align-middle">
                                  {item.depo > 0 ? (
                                    <span className="inline-flex items-center justify-center bg-violet-500/10 text-violet-400 border border-violet-500/20 font-bold px-2 py-0.5 rounded-md text-xs min-w-[24px]">
                                      {item.depo}
                                    </span>
                                  ) : (
                                    <span className="text-slate-700/40 select-none">·</span>
                                  )}
                                </td>
                                {/* Sticky Dynamic Verified Total */}
                                <td className="px-4 py-3 text-right bg-[var(--fd-accent-soft)] sticky right-0 z-10 border-l border-[var(--fd-accent-soft2)] align-middle">
                                  <span className="inline-flex items-center justify-center bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold px-2.5 py-0.5 rounded-lg text-xs min-w-[28px]">
                                    {liveTotal}
                                  </span>
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* standalone Garaj Deposu list (Müstakil Rapor) */}
              <Card className="bg-[var(--fd-surface2)]/75 backdrop-blur-lg border border-[var(--fd-border)] shadow-[0_4px_30px_rgba(0,0,0,0.4)] rounded-2xl overflow-hidden mt-6">
                <CardHeader className="bg-[var(--fd-surface2)]/40 border-b border-[var(--fd-border)] p-5 flex justify-between items-center flex-row">
                  <CardTitle className="text-base font-bold text-[var(--fd-text2)] flex items-center gap-2 tracking-tight">
                    <Warehouse className="w-5 h-5 text-amber-500" />
                    <span>🏠 Garaj Deposu Zimmet Listesi (Müstakil Rapor)</span>
                  </CardTitle>
                  <span className="font-mono bg-amber-500/10 text-amber-400 border border-amber-500/25 px-3 py-1 rounded-lg text-xs font-bold">
                    Toplam Çeşitlilik: {garajInventory.length} Kalem
                  </span>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto max-h-[40vh] scrollbar-thin scrollbar-thumb-slate-800">
                    <table className="w-full text-sm">
                      <thead className="bg-[var(--fd-surface2)] text-[10px] text-[var(--fd-text3)] uppercase tracking-wider border-b border-white/5 font-mono sticky top-0 z-10 backdrop-blur-md">
                        <tr>
                          <th className="px-5 py-3.5 text-left font-semibold w-16">Sıra No</th>
                          <th className="px-5 py-3.5 text-left font-semibold">Malzeme Cinsi</th>
                          <th className="px-5 py-3.5 text-left font-semibold w-48">Bulunduğu Bölme / Detay</th>
                          <th className="px-5 py-3.5 text-right font-semibold w-32">Miktar (Adet)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-medium">
                        {garajInventory.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-12 text-center text-[var(--fd-text3)] italic font-mono text-xs">
                              Garaj deposuna zimmetli herhangi bir malzeme bulunmamaktadır.
                            </td>
                          </tr>
                        ) : (
                          garajInventory.map((item, idx) => (
                            <tr key={item.id} className="hover:bg-white/5 transition-colors duration-150">
                              <td className="px-5 py-3 text-[var(--fd-text3)] font-mono text-xs">{idx + 1}</td>
                              <td className="px-5 py-3 text-[var(--fd-text2)] font-bold">{item.malzeme_adi}</td>
                              <td className="px-5 py-3 text-[var(--fd-text3)] font-mono text-xs">{item.bolme_kapak}</td>
                              <td className="px-5 py-3 text-right text-amber-400 font-mono font-bold text-sm">{item.adet}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* standalone ANA_DEPO list (Müstakil Rapor) */}
              <Card className="bg-[var(--fd-surface2)]/75 backdrop-blur-lg border border-[var(--fd-border)] shadow-[0_4px_30px_rgba(0,0,0,0.4)] rounded-2xl overflow-hidden mt-6">
                <CardHeader className="bg-[var(--fd-surface2)]/40 border-b border-[var(--fd-border)] p-5 flex justify-between items-center flex-row">
                  <CardTitle className="text-base font-bold text-[var(--fd-text2)] flex items-center gap-2 tracking-tight">
                    <Warehouse className="w-5 h-5 text-indigo-500" />
                    <span>🏢 Ana Depo Lojistik Listesi (Müstakil Rapor)</span>
                  </CardTitle>
                  <span className="font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/25 px-3 py-1 rounded-lg text-xs font-bold">
                    Toplam Çeşitlilik: {anaDepoInventory.length} Kalem
                  </span>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto max-h-[40vh] scrollbar-thin scrollbar-thumb-slate-800">
                    <table className="w-full text-sm">
                      <thead className="bg-[var(--fd-surface2)] text-[10px] text-[var(--fd-text3)] uppercase tracking-wider border-b border-white/5 font-mono sticky top-0 z-10 backdrop-blur-md">
                        <tr>
                          <th className="px-5 py-3.5 text-left font-semibold w-16">Sıra No</th>
                          <th className="px-5 py-3.5 text-left font-semibold">Malzeme Cinsi</th>
                          <th className="px-5 py-3.5 text-left font-semibold w-48">Bulunduğu Bölme / Detay</th>
                          <th className="px-5 py-3.5 text-right font-semibold w-32">Miktar (Adet)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-medium">
                        {anaDepoInventory.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-12 text-center text-[var(--fd-text3)] italic font-mono text-xs">
                              Ana depoda herhangi bir malzeme bulunmamaktadır.
                            </td>
                          </tr>
                        ) : (
                          anaDepoInventory.map((item, idx) => (
                            <tr key={item.id} className="hover:bg-white/5 transition-colors duration-150">
                              <td className="px-5 py-3 text-[var(--fd-text3)] font-mono text-xs">{idx + 1}</td>
                              <td className="px-5 py-3 text-[var(--fd-text2)] font-bold">{item.malzeme_adi}</td>
                              <td className="px-5 py-3 text-[var(--fd-text3)] font-mono text-xs">{item.bolme_kapak}</td>
                              <td className="px-5 py-3 text-right text-indigo-400 font-mono font-bold text-sm">{item.adet}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

            </div>
          )
        )}

        {/* --- Hidden QR print element — 8cm × 4cm Etiket Kartları (Argox IX4-350) --- */}
        {mounted && selectedPlaka && (
          <div id="print-area-qr" style={{ display: 'none' }}>
             <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                <div className="print-header-section" style={{ marginBottom: '6mm', textAlign: 'center', borderBottom: '2px solid black', paddingBottom: '4mm' }}>
                  <h1 style={{ fontSize: '18px', fontWeight: 900, margin: 0, fontFamily: 'sans-serif', color: 'black' }}>
                    SİVAS BELEDİYESİ İTFAİYE MÜDÜRLÜĞÜ
                  </h1>
                  <p style={{ fontSize: '11px', fontWeight: 600, margin: '2px 0 0 0', fontFamily: 'sans-serif', color: 'black' }}>
                    Araç QR Kod &amp; Envanter Dizin Etiketleri — {selectedPlaka}
                  </p>
                </div>
                
                <div className="qr-label-grid" style={{ display: 'flex', flexWrap: 'wrap', gap: '3mm', justifyContent: 'center' }}>
                  {printCompartments.map(comp => (
                    <div
                      key={comp}
                      className="qr-label-card"
                      style={{
                        width: '8cm',
                        height: '4cm',
                        border: '2.5px solid #000',
                        borderRadius: '3px',
                        boxSizing: 'border-box' as const,
                        display: 'flex',
                        flexDirection: 'column' as const,
                        position: 'relative',
                        overflow: 'hidden',
                        fontFamily: 'sans-serif',
                        pageBreakInside: 'avoid',
                      }}
                    >
                      {/* Sağ Üst — Kurum Adı */}
                      <span style={{ position: 'absolute', top: '1.5mm', right: '2.5mm', fontSize: '8px', fontWeight: 800, color: '#000', letterSpacing: '0.05em' }}>
                        Sivas İtfaiye
                      </span>

                      {/* İçerik — QR Sol, Bilgiler Sağ */}
                      <div style={{
                        display: 'flex',
                        flex: 1,
                        padding: '2mm 3mm',
                        gap: '3mm',
                        alignItems: 'center',
                        minHeight: 0,
                      }}>
                        {/* QR Kod */}
                        <div style={{
                          flexShrink: 0,
                          width: '3.2cm',
                          height: '3.2cm',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: '1px solid #ddd',
                          borderRadius: '3px',
                          padding: '1mm',
                          background: '#fff',
                        }}>
                          <QRCode value={buildQrUrl(selectedPlaka, comp)} size={108} level={"M"} style={{ height: "auto", maxWidth: "100%", width: "100%" }} />
                        </div>

                        {/* Sağ — Bölme Bilgisi */}
                        <div style={{
                          flex: 1,
                          display: 'flex',
                          flexDirection: 'column' as const,
                          justifyContent: 'center',
                          gap: '1mm',
                          overflow: 'hidden',
                        }}>
                          <p style={{
                            margin: 0,
                            fontSize: '18px',
                            fontWeight: 900,
                            lineHeight: 1.2,
                            color: '#000',
                          }}>
                            {comp}
                          </p>
                          <p style={{
                            margin: 0,
                            fontSize: '11px',
                            fontWeight: 800,
                            color: '#000',
                          }}>
                            {tableRows.filter(r => r.bolme_kapak === comp).length} Malzeme
                          </p>
                          <div style={{
                            borderTop: '1px solid #ddd',
                            paddingTop: '1mm',
                            marginTop: '1mm',
                          }}>
                            <p style={{
                              margin: 0,
                              fontSize: '8px',
                              color: '#555',
                              fontWeight: 700,
                              letterSpacing: '0.08em',
                              textTransform: 'uppercase' as const,
                            }}>
                              Sivas İtfaiyesi Envanter Sistemi
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
             </div>
          </div>
        )}

        {/* --- Temporary Assignment Modal --- */}
        <Dialog open={assignmentModalOpen} onOpenChange={setAssignmentModalOpen}>
          <DialogContent className="max-w-md bg-[var(--fd-surface2)] border border-[var(--fd-border)]/80 shadow-[0_0_30px_rgba(6,182,212,0.15)] text-[var(--fd-text)] p-6 rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2 text-[var(--fd-accent)]">
                <span>🔄 Malzeme Geçici Zimmet Formu</span>
              </DialogTitle>
              <p className="text-xs text-[var(--fd-text3)] mt-1">
                Seçili malzemeyi başka bir personele, araca ya da dış birime geçici süreliğine zimmetleyin.
              </p>
            </DialogHeader>

            <div className="space-y-4 my-4 font-sans text-sm">
              <div className="bg-[var(--fd-surface2)] border border-[var(--fd-border)] p-3 rounded-xl">
                <span className="text-[10px] font-bold text-[var(--fd-text3)] uppercase block font-mono">ZİMMETLENECEK MALZEME</span>
                <p className="font-bold text-[var(--fd-text2)] mt-0.5">{assignmentRow?.malzeme_adi} ({assignmentRow?.adet} Adet)</p>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[var(--fd-text3)] uppercase tracking-wider mb-1.5 font-mono">TESLİM EDİLEN TİP</label>
                <select
                  value={recipientType}
                  onChange={(e) => setRecipientType(e.target.value as any)}
                  className="w-full h-11 rounded-xl border border-[var(--fd-border)] bg-[var(--fd-surface2)] px-3 font-semibold text-[var(--fd-text)] text-sm focus:outline-none focus:ring-2 focus:border-[var(--fd-accent)]"
                >
                  <option value="PERSONEL">Personel</option>
                  <option value="ARAC">Araç</option>
                  <option value="DIS_BIRIM">Dış Birim</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[var(--fd-text3)] uppercase tracking-wider mb-1.5 font-mono">TESLİM EDİLEN BİRİM / KİŞİ ADI</label>
                <Input
                  type="text"
                  placeholder={recipientType === 'PERSONEL' ? "Personel adını girin..." : recipientType === 'ARAC' ? "Plaka girin..." : "Dış birim/kurum adı..."}
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className="bg-[var(--fd-surface2)] border-[var(--fd-border)] text-[var(--fd-text)] text-sm focus:border-[var(--fd-accent)] h-11"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[var(--fd-text3)] uppercase tracking-wider mb-1.5 font-mono">İRTİBAT TELEFONU (İSTEĞE BAĞLI)</label>
                <Input
                  type="text"
                  placeholder="Telefon numarası..."
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  className="bg-[var(--fd-surface2)] border-[var(--fd-border)] text-[var(--fd-text)] text-sm focus:border-[var(--fd-accent)] h-11"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[var(--fd-text3)] uppercase tracking-wider mb-1.5 font-mono">TAHMİNİ İADE TARİHİ</label>
                <Input
                  type="date"
                  value={estimatedReturnDate}
                  onChange={(e) => setEstimatedReturnDate(e.target.value)}
                  className="bg-[var(--fd-surface2)] border-[var(--fd-border)] text-[var(--fd-text)] text-sm focus:border-[var(--fd-accent)] h-11 font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[var(--fd-text3)] uppercase tracking-wider mb-1.5 font-mono">TUTAR/ÜCRET (İSTEĞE BAĞLI - TAMİR İÇİNSE)</label>
                <Input
                  type="number"
                  placeholder="Ücret girin (TL)..."
                  value={costInput}
                  onChange={(e) => setCostInput(e.target.value)}
                  className="bg-[var(--fd-surface2)] border-[var(--fd-border)] text-[var(--fd-text)] text-sm focus:border-[var(--fd-accent)] h-11 font-mono"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setAssignmentModalOpen(false)} className="w-full sm:w-auto border-[var(--fd-border)] bg-[var(--fd-surface2)] text-[var(--fd-text2)]">
                İptal
              </Button>
              <Button onClick={handleCreateAssignment} className="w-full sm:w-auto bg-[var(--fd-accent)] hover:bg-[var(--fd-accent)] text-white font-bold shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                Zimmeti Onayla & Mühürle
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* --- Hidden Assignment Print Template (Cloned dynamically for printing) --- */}
        {activePrintAssignment && (
          <div id="print-area-assignment" style={{ display: 'none' }}>
            <div style={{ display: 'flex', flexDirection: 'column', width: '100%', color: 'black', backgroundColor: 'white', padding: '0px' }}>
              <style dangerouslySetInnerHTML={{__html: `
                @page {
                  size: A4 landscape;
                  margin: 5mm;
                }
                @media print {
                  .print-area-container {
                    padding: 8mm !important;
                    margin: 0 !important;
                    width: 100vw !important;
                    height: 100vh !important;
                    box-sizing: border-box !important;
                  }
                }
              `}} />
              
              <div style={{ width: '100%', border: '4px solid black', padding: '15px', borderRadius: '20px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', height: '140mm', minHeight: '140mm', maxHeight: '140mm', justifyContent: 'space-between', fontFamily: 'sans-serif' }}>
                
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '3px solid black', paddingBottom: '10px', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <img src="/logo-belediye.png" style={{ width: '60px', height: '60px', objectFit: 'contain' }} alt="Belediye Logo" />
                    <div>
                      <h1 style={{ margin: 0, fontSize: '16px', fontWeight: 900 }}>SİVAS BELEDİYESİ</h1>
                      <h2 style={{ margin: 0, fontSize: '13px', fontWeight: 700 }}>İTFAİYE MÜDÜRLÜĞÜ</h2>
                    </div>
                  </div>
                  
                  <div style={{ textAlign: 'center' }}>
                    <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900, border: '2px solid black', padding: '6px 15px', borderRadius: '10px', letterSpacing: '1px' }}>MALZEME TESLİM FORMU</h2>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'end', gap: '2px' }}>
                    <div style={{ background: 'white', padding: '2px', border: '2px solid black', display: 'inline-block' }}>
                      <QRCode value={`${window.location.origin}/zimmet/${activePrintAssignment.uuid}`} size={60} level="H" style={{ height: "auto", maxWidth: "100%", width: "100%" }} />
                    </div>
                    <span style={{ fontSize: '8px', fontFamily: 'monospace', fontWeight: 'bold' }}>UUID: {activePrintAssignment.uuid}</span>
                  </div>
                </div>

                {/* Content */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '12px', flex: 1, marginBottom: '10px', minHeight: '0' }}>
                  
                  {/* Left Column Box */}
                  <div style={{ gridColumn: 'span 4', borderRight: '3px solid black', paddingRight: '12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '5px' }}>
                    <div style={{ border: '2px solid black', padding: '6px 10px', borderRadius: '10px' }}>
                      <h3 style={{ margin: 0, fontSize: '9px', color: '#666', fontWeight: 'bold', textTransform: 'uppercase' }}>TESLİM EDİLEN BİRİM / TİP</h3>
                      <p style={{ margin: '2px 0 0 0', fontSize: '12px', fontWeight: 'bold' }}>
                        {activePrintAssignment.teslim_edilen_tip === 'PERSONEL' ? 'PERSONEL' : 
                         activePrintAssignment.teslim_edilen_tip === 'ARAC' ? 'ARAÇ' : 'DIŞ BİRİM'}
                      </p>
                    </div>
                    <div style={{ border: '2px solid black', padding: '6px 10px', borderRadius: '10px' }}>
                      <h3 style={{ margin: 0, fontSize: '9px', color: '#666', fontWeight: 'bold', textTransform: 'uppercase' }}>TESLİM ALAN</h3>
                      <p style={{ margin: '2px 0 0 0', fontSize: '12px', fontWeight: 'bold' }}>{activePrintAssignment.birim_adi}</p>
                    </div>
                    <div style={{ border: '2px solid black', padding: '6px 10px', borderRadius: '10px' }}>
                      <h3 style={{ margin: 0, fontSize: '9px', color: '#666', fontWeight: 'bold', textTransform: 'uppercase' }}>TELEFON</h3>
                      <p style={{ margin: '2px 0 0 0', fontSize: '12px', fontWeight: 'bold', fontFamily: 'monospace' }}>{activePrintAssignment.telefon || '....................................'}</p>
                    </div>
                  </div>

                  {/* Right Table */}
                  <div style={{ gridColumn: 'span 8', display: 'flex', flexDirection: 'column', minHeight: '0' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid black', tableLayout: 'fixed' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f3f4f6' }}>
                          <th style={{ border: '2px solid black', padding: '6px', fontSize: '11px', fontWeight: 'bold', textAlign: 'center', width: '35px' }}>S.NO</th>
                          <th style={{ border: '2px solid black', padding: '6px', fontSize: '11px', fontWeight: 'bold', textAlign: 'left' }}>MALZEMENİN CİNSİ</th>
                          <th style={{ border: '2px solid black', padding: '6px', fontSize: '11px', fontWeight: 'bold', textAlign: 'center', width: '60px' }}>MİKTARI</th>
                          <th style={{ border: '2px solid black', padding: '6px', fontSize: '11px', fontWeight: 'bold', textAlign: 'center', width: '85px' }}>ÇIKIŞ TARİHİ</th>
                          <th style={{ border: '2px solid black', padding: '6px', fontSize: '11px', fontWeight: 'bold', textAlign: 'center', width: '85px' }}>DÖNÜŞ TARİHİ</th>
                          <th style={{ border: '2px solid black', padding: '6px', fontSize: '11px', fontWeight: 'bold', textAlign: 'center', width: '85px' }}>HASAR DURUMU</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={{ border: '2px solid black', padding: '6px', fontSize: '11px', textAlign: 'center', fontFamily: 'monospace' }}>1</td>
                          <td style={{ border: '2px solid black', padding: '6px', fontSize: '11px', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activePrintAssignment.materialName}</td>
                          <td style={{ border: '2px solid black', padding: '6px', fontSize: '11px', textAlign: 'center', fontWeight: 'bold', fontFamily: 'monospace' }}>{activePrintAssignment.quantity}</td>
                          <td style={{ border: '2px solid black', padding: '6px', fontSize: '11px', textAlign: 'center', fontFamily: 'monospace' }}>{new Date(activePrintAssignment.teslim_tarihi).toLocaleDateString("tr-TR")}</td>
                          <td style={{ border: '2px solid black', padding: '6px', fontSize: '11px', textAlign: 'center', fontFamily: 'monospace' }}>{new Date(activePrintAssignment.tahmini_iade_tarihi).toLocaleDateString("tr-TR")}</td>
                          <td style={{ border: '2px solid black', padding: '6px', fontSize: '10px', textAlign: 'center', fontWeight: 'bold' }}>{activePrintAssignment.durum_aciklamasi || 'Hasarsız'}</td>
                        </tr>
                        {[2, 3, 4, 5].map(sno => (
                          <tr key={sno}>
                            <td style={{ border: '2px solid black', padding: '6px', fontSize: '11px', textAlign: 'center', fontFamily: 'monospace', color: '#ccc' }}>{sno}</td>
                            <td style={{ border: '2px solid black', padding: '6px', fontSize: '11px', color: '#ccc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>..................................................</td>
                            <td style={{ border: '2px solid black', padding: '6px', fontSize: '11px', textAlign: 'center', color: '#ccc' }}>......</td>
                            <td style={{ border: '2px solid black', padding: '6px', fontSize: '10px', textAlign: 'center', color: '#ccc' }}>...../...../20.....</td>
                            <td style={{ border: '2px solid black', padding: '6px', fontSize: '10px', textAlign: 'center', color: '#ccc' }}>...../...../20.....</td>
                            <td style={{ border: '2px solid black', padding: '6px', fontSize: '10px', textAlign: 'center', color: '#ccc' }}>................</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                </div>

                {/* Footer Signatures */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px', textAlign: 'center', paddingTop: '8px', borderTop: '3px solid black' }}>
                  <div>
                    <h4 style={{ margin: '0 0 20px 0', fontSize: '10px', fontWeight: 'bold' }}>TESLİM EDEN BİRİM / AMİR</h4>
                    <p style={{ margin: 0, fontSize: '10px', fontWeight: 'bold' }}>İmza / Kaşe</p>
                  </div>
                  <div>
                    <h4 style={{ margin: '0 0 20px 0', fontSize: '10px', fontWeight: 'bold' }}>TESLİM ALAN PERSONEL</h4>
                    <p style={{ margin: 0, fontSize: '10px', fontWeight: 'bold' }}>İmza</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ margin: '0 0 15px 0', fontSize: '9px', fontWeight: 'bold', color: '#555' }}>Malzeme Tamir İçin Çıkış Yapılmışsa Ücreti:</p>
                    <p style={{ margin: 0, fontSize: '11px', fontWeight: 'black' }}>
                      {activePrintAssignment.ucret ? `${activePrintAssignment.ucret} TL` : '....................................... TL'}
                    </p>
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}

        {/* Global Hardware Safe Area Spacer Shield */}
        <div 
          className="w-full block md:hidden pointer-events-none clear-both h-28" 
          aria-hidden="true" 
        />

      </div>
    </PageGuard>
  )
}


// ==========================================
// 🔄 GEÇİCİ ZİMMET TAKİBİ TAB COMPONENT & TYPES
// ==========================================
interface AssignmentItem {
  id: number
  uuid: string
  malzeme_id: number
  teslim_edilen_tip: 'PERSONEL' | 'ARAC' | 'DIS_BIRIM'
  birim_adi: string
  teslim_tarihi: string
  tahmini_iade_tarihi: string
  durum: 'AKTIF' | 'IADE_EDILDI' | 'GECIKTI'
  materialName?: string
  telefon?: string
  ucret?: string
  kaynak_plaka?: string
}

export default function EnvanterPage() {
  const { user } = useAuthStore()
  const [activeSection, setActiveSection] = useState<"vehicles" | "assignments">("vehicles")
  
  // Assignment Tab States
  const [assignments, setAssignments] = useState<AssignmentItem[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [activePrintAssignment, setActivePrintAssignment] = useState<any | null>(null)
  const [vehicles, setVehicles] = useState<any[]>([])

  useEffect(() => {
    async function loadVehicles() {
      try {
        const { data } = await api.from('vehicles').select('plaka,filo_no,aciklama')
        if (data) setVehicles(data)
      } catch (err) {
        console.error("Vehicles loading error:", err)
      }
    }
    loadVehicles()
  }, [])

  // Load assignments
  const loadAssignments = async () => {
    setLoading(true)
    try {
      // Fetch assignments - will auto-update durum to GECIKTI in backend GET
      const { data: list } = await api.from('temporary_assignments').select('*').order('created_at', { ascending: false })
      const { data: invData } = await api.from('inventory').select('id,malzeme_adi')
      
      if (list && invData) {
        const invMap = new Map((invData || []).map((i: any) => [i.id, i.malzeme_adi]))
        const mapped = (list || []).map((item: any) => ({
          ...item,
          materialName: invMap.get(item.malzeme_id) || `Bilinmeyen Malzeme (ID: ${item.malzeme_id})`
        }))
        setAssignments(mapped)
      } else {
        setAssignments([])
      }
    } catch (err) {
      console.error("Zimmet listesi yükleme hatası:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (activeSection === "assignments") {
      loadAssignments()
    }
  }, [activeSection])

  // Print Effect Handler
  useEffect(() => {
    if (activePrintAssignment) {
      const printArea = document.getElementById('print-area-assignment-control')
      if (printArea) {
        const existing = document.getElementById('print-area-assignment-live')
        if (existing) {
          try { document.body.removeChild(existing); } catch (e) {}
        }

        const clone = printArea.cloneNode(true) as HTMLElement
        clone.className = 'print-area-container'
        clone.id = 'print-area-assignment-live'
        document.body.appendChild(clone)
        
        setTimeout(() => {
          window.print()
          setTimeout(() => {
            const live = document.getElementById('print-area-assignment-live')
            if (live) {
              try { document.body.removeChild(live); } catch (e) {}
            }
            setActivePrintAssignment(null)
          }, 500)
        }, 400)
      } else {
        setActivePrintAssignment(null)
      }
    }
  }, [activePrintAssignment])

  // Return item logic
  const handleReturnItem = async (assignment: AssignmentItem) => {
    if (!window.confirm(`"${assignment.materialName}" malzemesini iade almak istediğinize emin misiniz?`)) return

    try {
      // 1. Update temporary_assignments durum to IADE_EDILDI
      const res = await api.update('temporary_assignments', { durum: 'IADE_EDILDI' }, { id: assignment.id })
      if (res.error) throw new Error(res.error)

      // 2. Find matching vehicle_inventory item with 🔄 GEÇİCİ ZİMMETTE status
      const { data: vehInvList } = await api
        .from('vehicle_inventory')
        .select('*')
        .eq('inventory_id', assignment.malzeme_id)
        .eq('durum', '🔄 GEÇİCİ ZİMMETTE')

      if (vehInvList && vehInvList.length > 0) {
        const targetItem = vehInvList[0]
        
        // Update vehicle_inventory status back to Tam
        const iadeUpd = await api.update('vehicle_inventory', { durum: 'Tam' }, { id: targetItem.id })
        if (iadeUpd.error) {
          toast(`Uyarı: İade alındı ancak envanter durumu 'Tam' yapılamadı: ${iadeUpd.error}`)
        }

        // Fetch all items for this vehicle to rebuild bolmeler JSON cache
        const { data: allItems } = await api
          .from('vehicle_inventory')
          .select('*')
          .eq('plaka', targetItem.plaka)

        const { data: masterInv } = await api.from('inventory').select('id,malzeme_adi')

        if (allItems && masterInv) {
          const cache: Record<number, string> = {}
          masterInv.forEach((m: any) => {
            cache[m.id] = m.malzeme_adi
          })

          const newBolmeler: Record<string, any[]> = {}
          allItems.forEach((row: any) => {
            const label = row.bolme_kapak || "Araç İçi"
            const key = Object.entries(COMPARTMENT_NAMES).find(
              ([_, v]) => v.toLowerCase() === label.toLowerCase()
            )?.[0] || label.replace(/\s+/g, "_").toLowerCase()

            if (!newBolmeler[key]) newBolmeler[key] = []
            newBolmeler[key].push({
              malzeme: cache[row.inventory_id] || "Bilinmeyen Malzeme",
              adet: row.adet,
              durum: row.durum
            })
          })

          const iadeBolme = await api.update('vehicles', { bolmeler: newBolmeler }, { plaka: targetItem.plaka })
          if (iadeBolme.error) {
            toast(`Uyarı: Araç bölme listesi güncellenemedi: ${iadeBolme.error}`)
          }
        }
      }

      // Save audit log
      fetch('/api/audit-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action_type: 'temporary_assignment_return',
          actor_sicil_no: user?.sicilNo || 'unknown',
          actor_name: user ? `${user.ad} ${user.soyad}` : 'Bilinmeyen',
          target: assignment.materialName,
          details: {
            assignment_id: assignment.id,
            birim_adi: assignment.birim_adi,
          },
        }),
      }).catch(err => console.error('[AuditLog] İade logu gönderilemedi:', err))

      toast("Malzeme başarıyla iade alındı ve araç envanter statüsü güncellendi.")
      loadAssignments()
    } catch (err: any) {
      console.error(err)
      toast("Hata oluştu: " + err.message)
    }
  }

  // Filtered assignments
  const filteredAssignments = useMemo(() => {
    if (!searchQuery.trim()) return assignments
    const q = normalizeTextForSearch(searchQuery.trim())
    return assignments.filter(item => 
      normalizeTextForSearch(item.materialName || "").includes(q) ||
      normalizeTextForSearch(item.birim_adi || "").includes(q)
    )
  }, [assignments, searchQuery])


  // Stats
  const stats = useMemo(() => {
    const total = assignments.length
    const active = assignments.filter(a => a.durum === 'AKTIF').length
    const overdue = assignments.filter(a => a.durum === 'GECIKTI').length
    const returned = assignments.filter(a => a.durum === 'IADE_EDILDI').length
    return { total, active, overdue, returned }
  }, [assignments])

  return (
    <PageGuard pageId="envanter">
      <div className="space-y-6 w-full max-w-full pb-12 animate-in fade-in duration-300">
        
        {/* Siberian-matte Top-level Tabs */}
        <div className="flex gap-2.5 p-1 bg-[var(--fd-surface2)] backdrop-blur-lg rounded-2xl border border-white/5 self-start print:hidden">
          <button
            onClick={() => setActiveSection("vehicles")}
            className={`px-5 py-2.5 text-xs md:text-sm font-extrabold rounded-xl transition-all flex items-center gap-2 ${
              activeSection === "vehicles" 
                ? "bg-[var(--fd-accent)] text-[#ffffff] shadow-[var(--fd-shadow-sm)]" 
                : "text-[var(--fd-text3)] hover:text-[var(--fd-text2)]"
            }`}
          >
            <Truck className="w-4 h-4" />
            🚒 Araç Envanterleri
          </button>
          <button
            onClick={() => setActiveSection("assignments")}
            className={`px-5 py-2.5 text-xs md:text-sm font-extrabold rounded-xl transition-all flex items-center gap-2 ${
              activeSection === "assignments" 
                ? "bg-[var(--fd-accent)] text-[#ffffff] shadow-[var(--fd-shadow-sm)]" 
                : "text-[var(--fd-text3)] hover:text-[var(--fd-text2)]"
            }`}
          >
            <RefreshCw className="w-4 h-4" />
            🔄 Geçici Zimmet Takibi
          </button>
        </div>

        {/* Section Rendering */}
        {activeSection === "vehicles" ? (
          <VehicleInventoryTab />
        ) : (
          <div className="space-y-6 animate-in fade-in duration-200 print:hidden">
            {/* Header Section */}
            <div className="border-b border-[var(--fd-border)] pb-4">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[var(--fd-text)] flex items-center gap-2">
                <RefreshCw className="w-8 h-8 text-[var(--fd-accent)] drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
                Geçici Zimmet Kontrol Merkezi
              </h1>
              <p className="text-muted-foreground mt-1 text-sm">
                İtfaiye bünyesindeki geçici zimmet kayıtlarını izleyin, iadeleri yönetin ve teslim formlarını yazdırın.
              </p>
            </div>

            {/* Statistics Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)]">
                <CardContent className="p-4 sm:p-5">
                  <span className="text-[10px] font-bold text-[var(--fd-text3)] uppercase tracking-wider block font-mono">Toplam Zimmet</span>
                  <p className="text-2xl sm:text-3xl font-bold text-[var(--fd-text)] mt-1">{stats.total}</p>
                </CardContent>
              </Card>
              <Card className="bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] border-l-4 border-l-[var(--fd-accent)]">
                <CardContent className="p-4 sm:p-5">
                  <span className="text-[10px] font-bold text-[var(--fd-text3)] uppercase tracking-wider block font-mono">Aktif Zimmetler</span>
                  <p className="text-2xl sm:text-3xl font-bold text-[var(--fd-accent)] mt-1">{stats.active}</p>
                </CardContent>
              </Card>
              <Card className="bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] border-l-2 border-l-red-500/50">
                <CardContent className="p-4 sm:p-5">
                  <span className="text-[10px] font-bold text-[var(--fd-text3)] uppercase tracking-wider block font-mono">Süresi Geçenler</span>
                  <p className="text-2xl sm:text-3xl font-bold text-red-400 mt-1 animate-pulse">{stats.overdue}</p>
                </CardContent>
              </Card>
              <Card className="bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] border-l-2 border-l-emerald-500/50">
                <CardContent className="p-4 sm:p-5">
                  <span className="text-[10px] font-bold text-[var(--fd-text3)] uppercase tracking-wider block font-mono">İade Edilenler</span>
                  <p className="text-2xl sm:text-3xl font-bold text-emerald-400 mt-1">{stats.returned}</p>
                </CardContent>
              </Card>
            </div>

            {/* Filter card */}
            <Card className="bg-[var(--fd-surface)] border border-[var(--fd-border)] shadow-[0_4px_30px_rgba(0,0,0,0.4)] rounded-2xl">
              <CardContent className="p-4 flex items-center gap-3">
                <Search className="text-[var(--fd-text3)] w-5 h-5 shrink-0" />
                <Input
                  type="text"
                  placeholder="Malzeme adı veya teslim alan birime göre filtreleyin..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="bg-[var(--fd-surface2)] border-[var(--fd-border)] text-[var(--fd-text)] text-sm focus:border-[var(--fd-accent)] focus:border-[var(--fd-accent)] h-11 rounded-xl"
                />
              </CardContent>
            </Card>

            {/* Main Assignments Grid */}
            <Card className="bg-[var(--fd-surface)] border border-[var(--fd-border)] shadow-[0_4px_30px_rgba(0,0,0,0.4)] rounded-2xl overflow-hidden">
              <CardHeader className="bg-[var(--fd-surface2)]/40 border-b border-[var(--fd-border)] p-5 flex justify-between items-center flex-row">
                <CardTitle className="text-base font-bold text-[var(--fd-text2)] flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[var(--fd-accent)]" />
                  <span>Resmi Geçici Zimmet Kayıtları</span>
                </CardTitle>
                <button 
                  onClick={loadAssignments}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-[var(--fd-text2)] rounded-lg transition-colors border border-white/5"
                  title="Yenile"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-20 space-y-4">
                    <Loader2 className="w-8 h-8 text-[var(--fd-accent)] animate-spin" />
                    <p className="text-[var(--fd-text3)] font-mono text-xs">Geçici zimmet kayıtları yükleniyor...</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto w-full">
                    <table className="w-full text-sm min-w-[950px]">
                      <thead className="bg-[var(--fd-surface2)] text-[10px] text-[var(--fd-text3)] uppercase tracking-wider border-b border-white/5 font-mono">
                        <tr>
                          <th className="px-5 py-3.5 text-left font-semibold">MALZEME ADI</th>
                          <th className="px-5 py-3.5 text-left font-semibold">ASIL ARACI (KAYNAK)</th>
                          <th className="px-5 py-3.5 text-left font-semibold">ZİMMETLENEN YER (ALICI)</th>
                          <th className="px-5 py-3.5 text-center font-semibold w-36">TESLİM TARİHİ</th>
                          <th className="px-5 py-3.5 text-center font-semibold w-36">İADE TARİHİ</th>
                          <th className="px-5 py-3.5 text-center font-semibold w-40">DURUM</th>
                          <th className="px-5 py-3.5 text-center font-semibold w-64">İŞLEMLER</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-medium">
                        {filteredAssignments.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-12 text-center text-[var(--fd-text3)] italic font-mono text-xs">
                              Gösterilecek geçici zimmet kaydı bulunmamaktadır.
                            </td>
                          </tr>
                        ) : (
                          filteredAssignments.map((item) => {
                            const isOverdue = item.durum === 'GECIKTI'
                            const isActive = item.durum === 'AKTIF'
                            const isReturned = item.durum === 'IADE_EDILDI'
                            
                            return (
                              <tr key={item.id} className="hover:bg-white/5 transition-colors duration-150">
                                
                                {/* Malzeme Adı */}
                                <td className="px-5 py-4 font-bold text-[var(--fd-text2)]">
                                  <div className="flex items-center gap-2">
                                    {isOverdue && (
                                      <span className="animate-pulse bg-red-500/15 text-red-400 border border-red-500/30 text-[9px] font-mono px-2 py-0.5 rounded font-bold shadow-[0_0_8px_rgba(239,68,68,0.4)]">
                                        🚨 GECİKTİ
                                      </span>
                                    )}
                                    <span>{item.materialName}</span>
                                  </div>
                                </td>

                                {/* Asıl Aracı (Kaynak) */}
                                <td className="px-5 py-4 text-xs font-semibold text-[var(--fd-text2)]">
                                  {(() => {
                                    if (!item.kaynak_plaka) return '—';
                                    if (item.kaynak_plaka === 'GARAJ') return 'Garaj Deposu';
                                    if (item.kaynak_plaka === 'ANA_DEPO') return 'Ana Depo';
                                    const veh = vehicles.find((v: any) => v.plaka === item.kaynak_plaka);
                                    if (veh) {
                                      return `${veh.filo_no} NOLU (${item.kaynak_plaka})`;
                                    }
                                    return item.kaynak_plaka;
                                  })()}
                                </td>

                                {/* Zimmetlenen Yer */}
                                <td className="px-5 py-4">
                                  <div className="flex flex-col">
                                    <span className="text-[var(--fd-text2)] font-bold">{item.birim_adi}</span>
                                    <span className="text-[10px] text-[var(--fd-text3)] uppercase font-mono mt-0.5">
                                      {item.teslim_edilen_tip === 'PERSONEL' ? 'Personel' : 
                                       item.teslim_edilen_tip === 'ARAC' ? 'Araç' : 'Dış Birim'}
                                    </span>
                                  </div>
                                </td>

                                {/* Teslim Tarihi */}
                                <td className="px-5 py-4 text-center font-mono text-xs text-[var(--fd-text2)] align-middle">
                                  {new Date(item.teslim_tarihi).toLocaleDateString("tr-TR")}
                                </td>

                                {/* İade Tarihi */}
                                <td className={`px-5 py-4 text-center font-mono text-xs align-middle ${isOverdue ? 'text-red-400 font-bold' : 'text-[var(--fd-text2)]'}`}>
                                  {new Date(item.tahmini_iade_tarihi).toLocaleDateString("tr-TR")}
                                </td>

                                {/* Durum */}
                                <td className="px-5 py-4 text-center align-middle">
                                  <Badge 
                                    className={`font-bold font-mono text-[9px] px-2.5 py-1 rounded-md ${
                                      isReturned 
                                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25' 
                                        : isOverdue 
                                          ? 'bg-red-500/10 text-red-400 border border-red-500/25' 
                                          : 'bg-[var(--fd-accent-soft2)] text-[var(--fd-accent)] border border-[var(--fd-accent-soft2)]'
                                    }`}
                                  >
                                    {isReturned ? 'İADE ALINDI' : isActive ? 'ZİMMETTE' : 'SÜRESİ GEÇTİ'}
                                  </Badge>
                                </td>

                                {/* İşlemler */}
                                <td className="px-5 py-4 text-center align-middle">
                                  <div className="flex items-center justify-center gap-2">
                                    <button
                                      onClick={() => setActivePrintAssignment(item)}
                                      className="h-10 px-3 bg-slate-800 hover:bg-slate-700 text-[var(--fd-text2)] border border-white/5 rounded-lg flex items-center justify-center gap-1.5 text-xs font-bold transition-all min-h-[44px]"
                                      title="Resmi Teslim Formunu Yazdır"
                                    >
                                      <Printer className="w-4 h-4 text-orange-400" />
                                      Formu Yazdır
                                    </button>
                                    {!isReturned && (
                                      <button
                                        onClick={() => handleReturnItem(item)}
                                        className="h-10 px-3 bg-emerald-600/10 hover:bg-emerald-600/25 border border-emerald-500/30 text-emerald-400 rounded-lg flex items-center justify-center gap-1.5 text-xs font-bold transition-all min-h-[44px]"
                                        title="Zimmeti Sonlandır, İade Al"
                                      >
                                        <Inbox className="w-4 h-4 text-emerald-400" />
                                        İade Al
                                      </button>
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

            {/* --- Hidden Assignment Control Print Template (Cloned dynamically for printing) --- */}
            {activePrintAssignment && (
              <div id="print-area-assignment-control" style={{ display: 'none' }}>
                <div style={{ display: 'flex', flexDirection: 'column', width: '100%', color: 'black', backgroundColor: 'white', padding: '0px' }}>
                  <style dangerouslySetInnerHTML={{__html: `
                    @page {
                      size: A4 landscape;
                      margin: 5mm;
                    }
                    @media print {
                      .print-area-container {
                        padding: 8mm !important;
                        margin: 0 !important;
                        width: 100vw !important;
                        height: 100vh !important;
                        box-sizing: border-box !important;
                      }
                    }
                  `}} />
                  
                  <div style={{ width: '100%', border: '4px solid black', padding: '15px', borderRadius: '20px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', height: '140mm', minHeight: '140mm', maxHeight: '140mm', justifyContent: 'space-between', fontFamily: 'sans-serif' }}>
                    
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '3px solid black', paddingBottom: '10px', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <img src="/logo-belediye.png" style={{ width: '60px', height: '60px', objectFit: 'contain' }} alt="Belediye Logo" />
                        <div>
                          <h1 style={{ margin: 0, fontSize: '16px', fontWeight: 900 }}>SİVAS BELEDİYESİ</h1>
                          <h2 style={{ margin: 0, fontSize: '13px', fontWeight: 700 }}>İTFAİYE MÜDÜRLÜĞÜ</h2>
                        </div>
                      </div>
                      
                      <div style={{ textAlign: 'center' }}>
                        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900, border: '2px solid black', padding: '6px 15px', borderRadius: '10px', letterSpacing: '1px' }}>MALZEME TESLİM FORMU</h2>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'end', gap: '2px' }}>
                        <div style={{ background: 'white', padding: '2px', border: '2px solid black', display: 'inline-block' }}>
                          <QRCode value={`${window.location.origin}/zimmet/${activePrintAssignment.uuid}`} size={60} level="H" style={{ height: "auto", maxWidth: "100%", width: "100%" }} />
                        </div>
                        <span style={{ fontSize: '8px', fontFamily: 'monospace', fontWeight: 'bold' }}>UUID: {activePrintAssignment.uuid}</span>
                      </div>
                    </div>

                    {/* Content */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '12px', flex: 1, marginBottom: '10px', minHeight: '0' }}>
                      
                      {/* Left Column Box */}
                      <div style={{ gridColumn: 'span 4', borderRight: '3px solid black', paddingRight: '12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '5px' }}>
                        <div style={{ border: '2px solid black', padding: '6px 10px', borderRadius: '10px' }}>
                          <h3 style={{ margin: 0, fontSize: '9px', color: '#666', fontWeight: 'bold', textTransform: 'uppercase' }}>TESLİM EDİLEN BİRİM / TİP</h3>
                          <p style={{ margin: '2px 0 0 0', fontSize: '12px', fontWeight: 'bold' }}>
                            {activePrintAssignment.teslim_edilen_tip === 'PERSONEL' ? 'PERSONEL' : 
                             activePrintAssignment.teslim_edilen_tip === 'ARAC' ? 'ARAÇ' : 'DIŞ BİRİM'}
                          </p>
                        </div>
                        <div style={{ border: '2px solid black', padding: '6px 10px', borderRadius: '10px' }}>
                          <h3 style={{ margin: 0, fontSize: '9px', color: '#666', fontWeight: 'bold', textTransform: 'uppercase' }}>TESLİM ALAN</h3>
                          <p style={{ margin: '2px 0 0 0', fontSize: '12px', fontWeight: 'bold' }}>{activePrintAssignment.birim_adi}</p>
                        </div>
                        <div style={{ border: '2px solid black', padding: '6px 10px', borderRadius: '10px' }}>
                          <h3 style={{ margin: 0, fontSize: '9px', color: '#666', fontWeight: 'bold', textTransform: 'uppercase' }}>TELEFON</h3>
                          <p style={{ margin: '2px 0 0 0', fontSize: '12px', fontWeight: 'bold', fontFamily: 'monospace' }}>{activePrintAssignment.telefon || '....................................'}</p>
                        </div>
                      </div>

                      {/* Right Table */}
                      <div style={{ gridColumn: 'span 8', display: 'flex', flexDirection: 'column', minHeight: '0' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid black', tableLayout: 'fixed' }}>
                          <thead>
                            <tr style={{ backgroundColor: '#f3f4f6' }}>
                              <th style={{ border: '2px solid black', padding: '6px', fontSize: '11px', fontWeight: 'bold', textAlign: 'center', width: '35px' }}>S.NO</th>
                              <th style={{ border: '2px solid black', padding: '6px', fontSize: '11px', fontWeight: 'bold', textAlign: 'left' }}>MALZEMENİN CİNSİ</th>
                              <th style={{ border: '2px solid black', padding: '6px', fontSize: '11px', fontWeight: 'bold', textAlign: 'center', width: '60px' }}>MİKTARI</th>
                              <th style={{ border: '2px solid black', padding: '6px', fontSize: '11px', fontWeight: 'bold', textAlign: 'center', width: '85px' }}>ÇIKIŞ TARİHİ</th>
                              <th style={{ border: '2px solid black', padding: '6px', fontSize: '11px', fontWeight: 'bold', textAlign: 'center', width: '85px' }}>DÖNÜŞ TARİHİ</th>
                              <th style={{ border: '2px solid black', padding: '6px', fontSize: '11px', fontWeight: 'bold', textAlign: 'center', width: '85px' }}>HASAR DURUMU</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td style={{ border: '2px solid black', padding: '6px', fontSize: '11px', textAlign: 'center', fontFamily: 'monospace' }}>1</td>
                              <td style={{ border: '2px solid black', padding: '6px', fontSize: '11px', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activePrintAssignment.materialName}</td>
                              <td style={{ border: '2px solid black', padding: '6px', fontSize: '11px', textAlign: 'center', fontWeight: 'bold', fontFamily: 'monospace' }}>{activePrintAssignment.quantity || 1}</td>
                              <td style={{ border: '2px solid black', padding: '6px', fontSize: '11px', textAlign: 'center', fontFamily: 'monospace' }}>{new Date(activePrintAssignment.teslim_tarihi).toLocaleDateString("tr-TR")}</td>
                              <td style={{ border: '2px solid black', padding: '6px', fontSize: '11px', textAlign: 'center', fontFamily: 'monospace' }}>{new Date(activePrintAssignment.tahmini_iade_tarihi).toLocaleDateString("tr-TR")}</td>
                              <td style={{ border: '2px solid black', padding: '6px', fontSize: '10px', textAlign: 'center', fontWeight: 'bold' }}>{activePrintAssignment.durum_aciklamasi || 'Hasarsız'}</td>
                            </tr>
                            {[2, 3, 4, 5].map(sno => (
                              <tr key={sno}>
                                <td style={{ border: '2px solid black', padding: '6px', fontSize: '11px', textAlign: 'center', fontFamily: 'monospace', color: '#ccc' }}>{sno}</td>
                                <td style={{ border: '2px solid black', padding: '6px', fontSize: '11px', color: '#ccc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>..................................................</td>
                                <td style={{ border: '2px solid black', padding: '6px', fontSize: '11px', textAlign: 'center', color: '#ccc' }}>......</td>
                                <td style={{ border: '2px solid black', padding: '6px', fontSize: '10px', textAlign: 'center', color: '#ccc' }}>...../...../20.....</td>
                                <td style={{ border: '2px solid black', padding: '6px', fontSize: '10px', textAlign: 'center', color: '#ccc' }}>...../...../20.....</td>
                                <td style={{ border: '2px solid black', padding: '6px', fontSize: '10px', textAlign: 'center', color: '#ccc' }}>................</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                    </div>

                    {/* Footer Signatures */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px', textAlign: 'center', paddingTop: '8px', borderTop: '3px solid black' }}>
                      <div>
                        <h4 style={{ margin: '0 0 20px 0', fontSize: '10px', fontWeight: 'bold' }}>TESLİM EDEN BİRİM / AMİR</h4>
                        <p style={{ margin: 0, fontSize: '10px', fontWeight: 'bold' }}>İmza / Kaşe</p>
                      </div>
                      <div>
                        <h4 style={{ margin: '0 0 20px 0', fontSize: '10px', fontWeight: 'bold' }}>TESLİM ALAN PERSONEL</h4>
                        <p style={{ margin: 0, fontSize: '10px', fontWeight: 'bold' }}>İmza</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ margin: '0 0 15px 0', fontSize: '9px', fontWeight: 'bold', color: '#555' }}>Malzeme Tamir İçin Çıkış Yapılmışsa Ücreti:</p>
                        <p style={{ margin: 0, fontSize: '11px', fontWeight: 'black' }}>
                          {activePrintAssignment.ucret ? `${activePrintAssignment.ucret} TL` : '....................................... TL'}
                        </p>
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Global Hardware Safe Area Spacer Shield */}
        <div 
          className="w-full block md:hidden pointer-events-none clear-both h-28" 
          aria-hidden="true" 
        />

      </div>
    </PageGuard>
  )
}

