export interface InventoryItem {
  malzeme: string;
  adet: number;
  durum: "Tam" | "Eksik" | "Kayıp/Yok" | string;
}

export type CompartmentMap = Record<string, InventoryItem[]>;

export interface Vehicle {
  plaka: string;
  aracTipi: string;
  aktifPersonel: string[];
  bolmeler: CompartmentMap;
  km?: number;
  motorSaatiPTO?: number;
  durum?: "aktif" | "bakimda" | "arizali" | "pasif";
  sigortaBitis?: string;
  muayeneBitis?: string;
}

export interface Personnel {
  sicil_no: string;
  ad: string;
  soyad: string;
  unvan: string;
  rol: "Admin" | "Editor" | "Shift_Leader" | "User" | string;
  posta?: string;
  posta_no?: number;
  durum?: "Görevde" | "İzinli" | "Raporlu" | string;
}

export interface StaffCertification {
  id: string;
  sicil_no: string;
  tip: string;
  gecerlilik_tarihi: string;
  belge_no?: string;
  personnel?: Personnel;
}

export interface IncidentMedia {
  id: string;
  incident_id: string;
  url: string;
  tip: "fotoğraf" | "video" | string;
  created_at: string;
}

export interface MaintenanceLog {
  id: string;
  plaka: string;
  tip: "periyodik" | "ariza" | "kaza" | "revizyon";
  kmAt: number;
  ptoAt: number;
  aciklama: string;
  maliyet?: number;
  tarih: string;
  yapanKisi: string;
}

export interface FuelLog {
  id: string;
  plaka: string;
  litre: number;
  tutar: number;
  kmAt: number;
  istasyon: string;
  tarih: string;
  kayitEden: string;
}

export type ChecklistItem = {
  label: string;
  checked: boolean;
};

export interface TaskLog {
  id: string;
  plaka: string;
  tip: "devir_teslim" | "gunluk_kontrol" | "ariza_bildirimi" | "envanter_sayim";
  checklist: ChecklistItem[];
  durum: "beklemede" | "devam_ediyor" | "tamamlandi" | "iptal";
  notlar?: string;
  atanan: string;
  tarih: string;
  tamamlanmaTarihi?: string;
}

export interface Incident {
  id: string;
  olay_turu: string;
  ihbar_saati: string;
  cikis_saati: string;
  varis_saati: string;
  donus_saati: string;
  mahalle: string;
  adres: string;
  cikis_sebebi?: string;
  status: "active" | "closed";
  ek16_personel?: string;
  ek16_araclar?: string;
  created_at?: string;
  location?: string | { coordinates: [number, number] };
  aciliyet_seviyesi?: number;
}