-- ============================================================
-- SİVAS İTFAİYE CBS — YEREL (ON-PREMISE) MASTER ŞEMA
-- ============================================================
-- Bu dosya, tüm sistem tablolarını tek seferde oluşturur.
-- Yerel PostgreSQL sunucusunda çalıştırılmak üzere hazırlanmıştır.
-- Supabase'e özgü yapılar (RLS, auth.users, storage.buckets) kaldırılmıştır.
-- ============================================================

-- ═══════════════════════════════════════════════
-- 0) GEREKLİ EKLENTİLER
-- ═══════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- gen_random_uuid() için

-- ═══════════════════════════════════════════════
-- YARDIMCI: updated_at TRIGGER FONKSİYONU
-- ═══════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════
-- 1) VEHICLES (Araçlar)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.vehicles (
  plaka VARCHAR(15) PRIMARY KEY,
  arac_tipi VARCHAR(100) NOT NULL,
  marka VARCHAR(100),
  km INTEGER DEFAULT 0,
  "motorSaatiPTO" INTEGER DEFAULT 0,
  durum VARCHAR(20) DEFAULT 'aktif',
  "sigortaBitis" DATE,
  "muayeneBitis" DATE,
  bolmeler JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  filo_no INTEGER,
  aciklama VARCHAR
);

-- ═══════════════════════════════════════════════
-- 2) PERSONNEL (Personel)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.personnel (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sicil_no VARCHAR(20) UNIQUE NOT NULL,
  ad VARCHAR(50) NOT NULL,
  soyad VARCHAR(50) NOT NULL,
  unvan VARCHAR(100) NOT NULL,
  rol VARCHAR(20) NOT NULL DEFAULT 'User',
  posta VARCHAR(50),
  -- posta_no NULL = postasız (karargah/idari) personel; varsayılan atanmaz ki
  -- posta atanmamış personel 1. Posta nöbetçisi gibi görünmesin.
  posta_no INTEGER,
  -- birim: 'Posta' (vardiyalı) | 'Karargah' (gündüz mesaili idari kadro)
  birim VARCHAR(20) DEFAULT 'Posta',
  durum VARCHAR(50) DEFAULT 'Görevde',
  password_hash TEXT, -- bcrypt hash
  view_only BOOLEAN DEFAULT true,
  can_approve BOOLEAN DEFAULT false,
  can_print BOOLEAN DEFAULT false,
  aktif BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════
-- 3) MAINTENANCE_LOGS (Bakım Kayıtları)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.maintenance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plaka VARCHAR(15) NOT NULL,
  tip VARCHAR(50) NOT NULL,
  "kmAt" INTEGER DEFAULT 0,
  "ptoAt" INTEGER DEFAULT 0,
  aciklama TEXT NOT NULL,
  maliyet NUMERIC(10, 2) DEFAULT 0,
  tarih DATE NOT NULL,
  "yapanKisi" VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════
-- 4) FUEL_LOGS (Yakıt Kayıtları)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.fuel_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plaka VARCHAR(15) NOT NULL,
  litre NUMERIC(10, 2) NOT NULL,
  tutar NUMERIC(10, 2) NOT NULL,
  "kmAt" INTEGER NOT NULL,
  istasyon VARCHAR(100) NOT NULL,
  tarih DATE NOT NULL,
  "kayitEden" VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════
-- 5) TASKS (Görevler)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plaka VARCHAR(15) NOT NULL,
  tip VARCHAR(50) NOT NULL,
  checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  durum VARCHAR(20) NOT NULL DEFAULT 'bekliyor',
  atanan VARCHAR(100) NOT NULL,
  tarih DATE NOT NULL,
  "tamamlanmaTarihi" TIMESTAMPTZ,
  notlar TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════
-- 6) TASK_TEMPLATES (Görev Şablonları)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  baslik VARCHAR(100) NOT NULL,
  tip VARCHAR(50) NOT NULL,
  periyot VARCHAR(20) NOT NULL,
  hedef_araclar JSONB DEFAULT '[]'::jsonb,
  sorular JSONB NOT NULL,
  olusturan_sicil VARCHAR(20),
  aktif BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════
-- 7) SCBA_CYLINDERS (Oksijen Tüpleri)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.scba_cylinders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seri_no VARCHAR(50) UNIQUE NOT NULL,
  marka VARCHAR(50) NOT NULL,
  kapasite_lt NUMERIC NOT NULL,
  basinc_bar INTEGER NOT NULL,
  uretim_tarihi DATE,
  son_hidrostatik_test DATE NOT NULL,
  sonraki_test_tarihi DATE NOT NULL,
  durum VARCHAR(20) DEFAULT 'aktif',
  guncel_basinc INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════
-- 8) SCBA_FILL_LOGS (Tüp Dolum Kayıtları)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.scba_fill_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cylinder_id UUID REFERENCES public.scba_cylinders(id) ON DELETE CASCADE,
  dolduran_sicil VARCHAR(20),
  basilan_bar INTEGER NOT NULL,
  tarih TIMESTAMPTZ DEFAULT NOW(),
  notlar TEXT
);

-- ═══════════════════════════════════════════════
-- 9) INCIDENT_REPORTS (Arıza Bildirimleri)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.incident_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plaka VARCHAR(20) NOT NULL,
  bildiren_sicil VARCHAR(20),
  kategori VARCHAR(50) NOT NULL DEFAULT 'ariza',
  aciklama TEXT NOT NULL,
  oncelik VARCHAR(20) DEFAULT 'normal',
  fotograflar JSONB DEFAULT '[]'::jsonb,
  durum VARCHAR(20) DEFAULT 'acik',
  cozum_notu TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════
-- 10) AUTH_LOGS (Giriş Kayıtları)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.auth_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sicil_no VARCHAR(20),
  event_type VARCHAR(30) NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════
-- 11) AUDIT_LOGS (Denetim Kayıtları)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sicil_no VARCHAR(20),
  action_type VARCHAR(50),
  actor_sicil_no VARCHAR(20),
  actor_name VARCHAR(100),
  target VARCHAR(100),
  entity_type VARCHAR(50),
  entity_id VARCHAR(100),
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════
-- 12) INVENTORY_CHECKS (Envanter Kontrolleri)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.inventory_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plaka VARCHAR(15) NOT NULL,
  bolme VARCHAR(50) NOT NULL,
  malzeme VARCHAR(100) NOT NULL,
  kontrol_eden VARCHAR(20),
  eski_durum VARCHAR(50),
  yeni_durum VARCHAR(50),
  adet INTEGER,
  compartment_key VARCHAR(50),
  notlar TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════
-- 13) PERSONNEL HR MODULE (Personel İK Modülü)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.personnel_details (
  sicil_no TEXT PRIMARY KEY REFERENCES public.personnel(sicil_no) ON DELETE CASCADE,
  kan_grubu TEXT,
  telefon TEXT,
  acil_durum_kisi_ad TEXT,
  acil_durum_kisi_telefon TEXT,
  adres TEXT,
  dogum_tarihi DATE,
  ise_baslama_tarihi DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER set_personnel_details_updated_at
  BEFORE UPDATE ON public.personnel_details 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.personnel_leaves (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sicil_no TEXT REFERENCES public.personnel(sicil_no) ON DELETE CASCADE,
  izin_turu TEXT NOT NULL,
  baslangic_tarihi DATE NOT NULL,
  bitis_tarihi DATE NOT NULL,
  aciklama TEXT,
  belge_url TEXT,
  durum TEXT DEFAULT 'Beklemede',
  onaylayan_sicil TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER set_personnel_leaves_updated_at
  BEFORE UPDATE ON public.personnel_leaves 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.personnel_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sicil_no TEXT REFERENCES public.personnel(sicil_no) ON DELETE CASCADE,
  kayit_turu TEXT NOT NULL,
  tarih DATE NOT NULL DEFAULT CURRENT_DATE,
  aciklama TEXT NOT NULL,
  belge_no TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.personnel_equipment (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sicil_no TEXT REFERENCES public.personnel(sicil_no) ON DELETE CASCADE,
  ekipman_adi TEXT NOT NULL,
  seri_no TEXT,
  verilis_tarihi DATE NOT NULL DEFAULT CURRENT_DATE,
  miad_tarihi DATE,
  beden TEXT,
  durum TEXT DEFAULT 'Aktif',
  aciklama TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER set_personnel_equipment_updated_at
  BEFORE UPDATE ON public.personnel_equipment 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════
-- 14) INCIDENTS (Vaka/Olay Raporları)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.incidents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  olay_turu TEXT NOT NULL,
  ihbar_saati TIMESTAMPTZ,
  cikis_saati TIMESTAMPTZ,
  varis_saati TIMESTAMPTZ,
  donus_saati TIMESTAMPTZ,
  mahalle TEXT,
  adres TEXT,
  aciklama TEXT,
  kullanilan_su_ton NUMERIC DEFAULT 0,
  kullanilan_kopuk_litre NUMERIC DEFAULT 0,
  kullanilan_kkt_kg NUMERIC DEFAULT 0,
  hasar_durumu TEXT,
  raporlayan_sicil TEXT,
  -- EK-12, EK-16, EK-7 alanları
  ihbar_eden_ad_soyad TEXT,
  ihbar_eden_tel TEXT,
  bildirilen_kurumlar JSONB DEFAULT '[]'::jsonb,
  bina_yapi_malzemesi TEXT,
  yangin_baslangic_yeri TEXT,
  cikis_sebebi TEXT,
  sigorta_durumu TEXT,
  olay_teslim_edilen_kisi TEXT,
  olu_halk INT DEFAULT 0,
  yarali_halk INT DEFAULT 0,
  kurtarilan_halk INT DEFAULT 0,
  olu_itfaiye INT DEFAULT 0,
  yarali_itfaiye INT DEFAULT 0,
  kurtarilan_hayvan INT DEFAULT 0,
  olen_hayvan INT DEFAULT 0,
  status TEXT DEFAULT 'active',
  ek16_personel TEXT,
  ek16_araclar TEXT,
  ek16_cikis_nedeni TEXT,
  ek16_hasar_aciklama TEXT,
  ek16_kapatis_tarihi TIMESTAMPTZ,
  -- GIS
  location geometry(Point, 4326),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER set_incidents_updated_at
  BEFORE UPDATE ON public.incidents 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.incident_vehicles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  incident_id UUID REFERENCES public.incidents(id) ON DELETE CASCADE,
  plaka VARCHAR(15),
  gorev_turu TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(incident_id, plaka)
);

CREATE TABLE IF NOT EXISTS public.incident_personnel (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  incident_id UUID REFERENCES public.incidents(id) ON DELETE CASCADE,
  sicil_no TEXT,
  gorev TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(incident_id, sicil_no)
);

-- ═══════════════════════════════════════════════
-- 15) CITIZEN_REQUESTS (Vatandaş Başvuruları)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.citizen_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  talep_turu TEXT NOT NULL,
  basvuru_tarihi TIMESTAMPTZ DEFAULT NOW(),
  basvuran_tc TEXT,
  basvuran_ad_soyad TEXT NOT NULL,
  irtibat_tel TEXT NOT NULL,
  adres TEXT NOT NULL,
  baca_detaylari JSONB DEFAULT '{}'::jsonb,
  isyeri_detaylari JSONB DEFAULT '{}'::jsonb,
  durum TEXT DEFAULT 'Bekliyor',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER set_citizen_requests_updated_at
  BEFORE UPDATE ON public.citizen_requests 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════
-- 16) ACTIVITIES_AND_TRAININGS (Eğitim ve Faaliyetler)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.activities_and_trainings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  faaliyet_turu TEXT NOT NULL,
  faaliyet_konusu TEXT NOT NULL,
  baslangic_tarihi TIMESTAMPTZ NOT NULL,
  bitis_tarihi TIMESTAMPTZ,
  toplam_sure_saat NUMERIC,
  katilimci_sayisi INT DEFAULT 0,
  hedef_kitle TEXT,
  aciklama TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER set_activities_updated_at
  BEFORE UPDATE ON public.activities_and_trainings 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.personnel_activities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  activity_id UUID REFERENCES public.activities_and_trainings(id) ON DELETE CASCADE,
  sicil_no TEXT,
  rol TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(activity_id, sicil_no)
);

-- ═══════════════════════════════════════════════
-- 17) VEHICLE_MAINTENANCES (Araç Bakım ve Arıza)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.vehicle_maintenances (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plaka TEXT NOT NULL,
  islem_turu TEXT NOT NULL,
  tarih TIMESTAMPTZ DEFAULT NOW(),
  kilometre NUMERIC,
  aciklama TEXT,
  maliyet NUMERIC DEFAULT 0,
  kaydi_acan_sicil_no TEXT,
  fotograf_url TEXT,
  durum TEXT DEFAULT 'Bekliyor',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER set_vehicle_maintenances_updated_at
  BEFORE UPDATE ON public.vehicle_maintenances 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════
-- 18) FIRE_HYDRANTS (Yangın Hidrantları — GIS)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.fire_hydrants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  no TEXT,
  tip TEXT DEFAULT 'Yer üstü',
  durum TEXT DEFAULT 'Aktif',
  location geometry(Point, 4326),
  mahalle TEXT,
  adres TEXT,
  basinc_degeri NUMERIC,
  son_bakim_tarihi TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER set_fire_hydrants_updated_at
  BEFORE UPDATE ON public.fire_hydrants 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════
-- 19) SPATIAL_ADDRESSES (CBS Adres Arama)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.spatial_addresses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  abs_mahalle_adi TEXT NOT NULL,
  adi TEXT,
  location geometry(Point, 4326),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER set_spatial_addresses_updated_at
  BEFORE UPDATE ON public.spatial_addresses 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Arama indeksleri
CREATE INDEX IF NOT EXISTS idx_spatial_addresses_mahalle ON public.spatial_addresses (abs_mahalle_adi);
CREATE INDEX IF NOT EXISTS idx_spatial_addresses_adi ON public.spatial_addresses (adi);
CREATE INDEX IF NOT EXISTS idx_spatial_addresses_mahalle_trgm ON public.spatial_addresses USING GIN (abs_mahalle_adi gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_spatial_addresses_adi_trgm ON public.spatial_addresses USING GIN (adi gin_trgm_ops);

-- ═══════════════════════════════════════════════
-- 20) STAFF_CERTIFICATIONS (Personel Sertifikaları)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.staff_certifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sicil_no VARCHAR(20) REFERENCES public.personnel(sicil_no) ON DELETE CASCADE,
  tip VARCHAR(100) NOT NULL,
  gecerlilik_tarihi DATE NOT NULL,
  belge_no VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER set_staff_certifications_updated_at
  BEFORE UPDATE ON public.staff_certifications 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════
-- 21) KRİTİK UYARI GÖRÜNÜMÜ (VIEW)
-- ═══════════════════════════════════════════════
CREATE OR REPLACE VIEW public.vw_expiring_certifications AS
SELECT 
    sc.id,
    sc.sicil_no,
    p.ad,
    p.soyad,
    sc.tip,
    sc.gecerlilik_tarihi,
    sc.belge_no,
    (sc.gecerlilik_tarihi - CURRENT_DATE) AS kalan_gun
FROM 
    public.staff_certifications sc
JOIN 
    public.personnel p ON sc.sicil_no = p.sicil_no
WHERE 
    sc.gecerlilik_tarihi <= (CURRENT_DATE + INTERVAL '30 days')
    AND p.aktif = true;

-- ═══════════════════════════════════════════════
-- 22) INCIDENT_MEDIA (Olay Medya Arşivi)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.incident_media (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  incident_id UUID REFERENCES public.incidents(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  tip VARCHAR(50) DEFAULT 'fotoğraf',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TAMAMLANDI! Tüm tablolar yerel PostgreSQL için oluşturuldu.
-- ============================================================
