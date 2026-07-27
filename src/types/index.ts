export interface InventoryItem {
  id?: string;
  malzeme: string;
  adet: number;
  durum: "Tam" | "Eksik" | "Kayıp/Yok" | string;
}

export type CompartmentMap = Record<string, InventoryItem[]>;

export interface Vehicle {
  plaka: string;
  aracTipi: string;
  arac_tipi?: string;
  marka?: string;
  aktifPersonel?: string[];
  bolmeler: CompartmentMap;
  km?: number;
  motorSaatiPTO?: number;
  durum?: "aktif" | "bakimda" | "arizali" | "pasif" | string;
  sigortaBitis?: string;
  muayeneBitis?: string;
  next_inspection_date?: string;
  istasyon?: string;
  yil?: number;
  model?: string;
  su_kapasite?: number;
  kopuk_kapasite?: number;
  filo_no?: number | null;
  aciklama?: string;
  id?: string;
  current_branch?: string;
  sorumlu_sofor_id?: string | null;
  sorumlu_er_id?: string | null;
  sorumlu_sofor_id_p1?: string | null;
  sorumlu_er_id_p1?: string | null;
  sorumlu_sofor_id_p2?: string | null;
  sorumlu_er_id_p2?: string | null;
  sorumlu_sofor_id_p3?: string | null;
  sorumlu_er_id_p3?: string | null;
}


export interface Personnel {
  id?: string;
  sicil_no: string;
  username?: string;
  ad: string;
  soyad: string;
  unvan: string;
  rol: "Admin" | "Editor" | "Shift_Leader" | "User" | string;
  telefon?: string;
  posta?: string;
  posta_no?: number | null;
  /** 'Posta' (vardiyalı) | 'Karargah' (gündüz mesaili idari kadro) */
  birim?: string;
  istasyon?: string;
  durum?: "Görevde" | "İzinli" | "Raporlu" | string;
  ilkyardim_sertifika_tarihi?: string;
  ehliyet_gecerlilik_tarihi?: string;
  scba_sertifika_tarihi?: string;
  view_only?: boolean;
  can_approve?: boolean;
  can_print?: boolean;
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

export interface DutyLog {
  id?: number;
  sicil_no: string;
  action: 'START_DUTY' | 'END_DUTY';
  timestamp: string;
  latitude: number;
  longitude: number;
}

export interface ShiftState {
  status: 'AKTIF' | 'TAMAMLANDI';
  loading: boolean;
  distance: number | null;
  coords: { lat: number; lng: number } | null;
  message: string;
}

export interface AracBakimGecmisi {
  id: number;
  plaka: string;
  tarih: string;
  tip: 'tamir' | 'yag_bakimi';
  aciklama: string;
  maliyet: number;
  durum?: 'Onaylandı' | 'Bekliyor' | string;
  created_at?: string;
}

export interface BakimDashboardResponse {
  vehicles: Vehicle[];
  logs: AracBakimGecmisi[];
  fuelLogs: FuelLog[];
}