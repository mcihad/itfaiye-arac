/**
 * Tablo/sütun/görünüm kurulum (lazy migration) fonksiyonları.
 * (Eskiden route.ts içindeydi; okunabilirlik için ayrıldı.)
 *
 * PERFORMANS: Her kurulum adımı PROCESS BAŞINA YALNIZCA BİR KEZ çalışır (memoize).
 * Eskiden bu DDL'ler ilgili tabloya gelen her istekte tekrar tekrar çalışıyordu.
 * Tüm ifadeler idempotent (CREATE/ALTER ... IF NOT EXISTS) olduğundan davranış
 * korunur; yalnızca gereksiz tekrar sorgular ortadan kalkar. Bir adım hata verirse
 * "tamamlandı" olarak işaretlenmez ve sonraki istekte tekrar denenir.
 */
import { query } from '@/lib/db';
import { REAL_VEHICLES, getPresetCompartments } from './seed-data';

const completed = new Set<string>();

async function once(key: string, fn: () => Promise<void>): Promise<void> {
  if (completed.has(key)) return;
  try {
    await fn();
    completed.add(key);
  } catch (err) {
    console.error(`[dbSchema] '${key}' hazırlanamadı (sonraki istekte tekrar denenecek):`, err);
  }
}

async function ensureRolePermissionsTableExists() {
  return once('role_permissions', async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        id SERIAL PRIMARY KEY,
        rol TEXT NOT NULL,
        sayfa_id TEXT NOT NULL,
        izinli BOOLEAN NOT NULL DEFAULT true,
        UNIQUE(rol, sayfa_id)
      )
    `);

    // 5 rol × 8 sayfa varsayılan izinleri (yalnızca eksikleri tamamlar)
    const defaultPermissions = [
      { rol: 'Müdür', sayfa_id: 'harita', izinli: true },
      { rol: 'Müdür', sayfa_id: 'personel_yonetimi', izinli: true },
      { rol: 'Müdür', sayfa_id: 'arac_bakim', izinli: true },
      { rol: 'Müdür', sayfa_id: 'envanter', izinli: true },
      { rol: 'Müdür', sayfa_id: 'raporlar', izinli: true },
      { rol: 'Müdür', sayfa_id: 'egitimler', izinli: true },
      { rol: 'Müdür', sayfa_id: 'hizmet_basvurulari', izinli: true },
      { rol: 'Müdür', sayfa_id: 'gorevler', izinli: true },

      { rol: 'Amir', sayfa_id: 'harita', izinli: true },
      { rol: 'Amir', sayfa_id: 'personel_yonetimi', izinli: true },
      { rol: 'Amir', sayfa_id: 'arac_bakim', izinli: true },
      { rol: 'Amir', sayfa_id: 'envanter', izinli: true },
      { rol: 'Amir', sayfa_id: 'raporlar', izinli: true },
      { rol: 'Amir', sayfa_id: 'egitimler', izinli: true },
      { rol: 'Amir', sayfa_id: 'hizmet_basvurulari', izinli: true },
      { rol: 'Amir', sayfa_id: 'gorevler', izinli: true },

      { rol: 'Çavuş', sayfa_id: 'harita', izinli: true },
      { rol: 'Çavuş', sayfa_id: 'personel_yonetimi', izinli: false },
      { rol: 'Çavuş', sayfa_id: 'arac_bakim', izinli: true },
      { rol: 'Çavuş', sayfa_id: 'envanter', izinli: true },
      { rol: 'Çavuş', sayfa_id: 'raporlar', izinli: true },
      { rol: 'Çavuş', sayfa_id: 'egitimler', izinli: true },
      { rol: 'Çavuş', sayfa_id: 'hizmet_basvurulari', izinli: true },
      { rol: 'Çavuş', sayfa_id: 'gorevler', izinli: true },

      { rol: 'Santral', sayfa_id: 'harita', izinli: true },
      { rol: 'Santral', sayfa_id: 'personel_yonetimi', izinli: false },
      { rol: 'Santral', sayfa_id: 'arac_bakim', izinli: false },
      { rol: 'Santral', sayfa_id: 'envanter', izinli: false },
      { rol: 'Santral', sayfa_id: 'raporlar', izinli: true },
      { rol: 'Santral', sayfa_id: 'egitimler', izinli: false },
      { rol: 'Santral', sayfa_id: 'hizmet_basvurulari', izinli: true },
      { rol: 'Santral', sayfa_id: 'gorevler', izinli: true },

      { rol: 'Er', sayfa_id: 'harita', izinli: true },
      { rol: 'Er', sayfa_id: 'personel_yonetimi', izinli: false },
      { rol: 'Er', sayfa_id: 'arac_bakim', izinli: false },
      { rol: 'Er', sayfa_id: 'envanter', izinli: true },
      { rol: 'Er', sayfa_id: 'raporlar', izinli: false },
      { rol: 'Er', sayfa_id: 'egitimler', izinli: false },
      { rol: 'Er', sayfa_id: 'hizmet_basvurulari', izinli: true },
      { rol: 'Er', sayfa_id: 'gorevler', izinli: true }
    ];

    for (const p of defaultPermissions) {
      await query(
        'INSERT INTO role_permissions (rol, sayfa_id, izinli) VALUES ($1, $2, $3) ON CONFLICT (rol, sayfa_id) DO NOTHING',
        [p.rol, p.sayfa_id, p.izinli]
      );
    }
  });
}

async function ensureSystemSettingsTableExists() {
  return once('system_settings', async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    const defaults = [
      { key: 'merkez_shift_time', value: '08:00' },
      { key: 'esentepe_shift_time', value: '08:45' },
      { key: 'organize_shift_time', value: '09:15' }
    ];

    for (const d of defaults) {
      const check = await query('SELECT key FROM system_settings WHERE key = $1', [d.key]);
      if (check.rowCount === 0) {
        await query('INSERT INTO system_settings (key, value) VALUES ($1, $2)', [d.key, d.value]);
      }
    }
  });
}

async function ensureDutyLogsTableExists() {
  return once('duty_logs', async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS duty_logs (
        id SERIAL PRIMARY KEY,
        sicil_no TEXT NOT NULL,
        action TEXT NOT NULL,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION
      )
    `);
  });
}

async function ensurePersonnelShiftsLogTableExists() {
  return once('personnel_shifts_log', async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS public.personnel_shifts_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        personnel_id UUID NOT NULL REFERENCES public.personnel(id) ON DELETE CASCADE,
        personel_ad_soyad VARCHAR NOT NULL,
        istasyon VARCHAR NOT NULL,
        posta VARCHAR NOT NULL,
        giris_tarihi TIMESTAMPTZ NOT NULL,
        cikis_tarihi TIMESTAMPTZ DEFAULT NULL,
        durum VARCHAR NOT NULL CHECK (durum IN ('GÖREVDE', 'TAMAMLANDI'))
      )
    `);
  });
}

async function ensureServiceApplicationsTableExists() {
  return once('service_applications', async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS public.service_applications (
        id SERIAL PRIMARY KEY,
        takip_kodu VARCHAR(50) UNIQUE NOT NULL,
        talep_turu VARCHAR(100) NOT NULL,
        basvuran_tc VARCHAR(11) NOT NULL,
        basvuran_ad VARCHAR(100) NOT NULL,
        basvuran_soyad VARCHAR(100) NOT NULL,
        basvuran_dogum_yili INTEGER NOT NULL,
        irtibat_tel VARCHAR(20) NOT NULL,
        adres TEXT NOT NULL,
        bina_tipi VARCHAR(100),
        isyeri_adi_turu VARCHAR(200),
        durum VARCHAR(50) DEFAULT 'BEKLEMEDE',
        islem_yapan_amir VARCHAR(150),
        atanan_ekip VARCHAR(150),
        islem_tarihi TIMESTAMPTZ,
        red_gerekcesi TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  });
}

async function ensureTempOtpsTableExists() {
  return once('temp_otps', async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS public.temp_otps (
        id SERIAL PRIMARY KEY,
        phone VARCHAR(20) NOT NULL,
        tc VARCHAR(11) NOT NULL,
        otp VARCHAR(6) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '5 minutes',
        used BOOLEAN DEFAULT FALSE
      )
    `);
  });
}

async function ensureHourlyShiftsTableExists() {
  return once('hourly_shifts', async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS public.hourly_shifts (
        id SERIAL PRIMARY KEY,
        tarih DATE NOT NULL DEFAULT CURRENT_DATE,
        posta INTEGER NOT NULL,
        saat_araligi VARCHAR(50) NOT NULL,
        gorev_yeri VARCHAR(100) NOT NULL,
        personel_sicil VARCHAR(50) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(tarih, saat_araligi, gorev_yeri)
      )
    `);
  });
}

async function ensureTemporaryAssignmentsTableExists() {
  return once('temporary_assignments', async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS public.temporary_assignments (
        id SERIAL PRIMARY KEY,
        uuid UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
        malzeme_id INTEGER NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
        teslim_edilen_tip VARCHAR(50) NOT NULL CHECK (teslim_edilen_tip IN ('PERSONEL', 'ARAC', 'DIS_BIRIM')),
        birim_adi VARCHAR(255) NOT NULL,
        teslim_tarihi TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        tahmini_iade_tarihi TIMESTAMPTZ NOT NULL,
        durum VARCHAR(50) NOT NULL DEFAULT 'AKTIF' CHECK (durum IN ('AKTIF', 'IADE_EDILDI', 'GECIKTI')),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await query(`ALTER TABLE public.temporary_assignments ADD COLUMN IF NOT EXISTS uuid UUID DEFAULT gen_random_uuid();`);
    await query(`UPDATE public.temporary_assignments SET uuid = gen_random_uuid() WHERE uuid IS NULL;`);
    await query(`ALTER TABLE public.temporary_assignments ADD COLUMN IF NOT EXISTS kaynak_plaka VARCHAR;`);
  });
}

async function ensureDailySummaryReportsTableExists() {
  return once('daily_summary_reports', async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS public.daily_summary_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        rapor_tarihi DATE NOT NULL UNIQUE,
        devreden_amir_id UUID NOT NULL REFERENCES public.personnel(id) ON DELETE CASCADE,
        yangin_sayisi JSONB NOT NULL DEFAULT '{"total": 0, "ev": 0, "isyeri": 0, "arazi": 0, "diger": 0}'::jsonb,
        kurtarma_sayisi JSONB NOT NULL DEFAULT '{"total": 0, "trafik_kazasi": 0, "su_baskini": 0, "hayvan_kurtarma": 0, "diger": 0}'::jsonb,
        dis_gorev_sayisi INTEGER NOT NULL DEFAULT 0,
        arizali_araclar TEXT[] DEFAULT '{}'::text[],
        bascavus_notu TEXT,
        onay_durumu BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await query(`ALTER TABLE public.daily_summary_reports ADD COLUMN IF NOT EXISTS serh_notu TEXT;`);
    await query(`ALTER TABLE public.daily_summary_reports ADD COLUMN IF NOT EXISTS devir_durumu VARCHAR DEFAULT 'Temiz';`);
  });
}

async function ensureVehicleColumnsExist() {
  return once('vehicles', async () => {
    await query(`ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS id UUID UNIQUE DEFAULT gen_random_uuid();`);
    await query(`ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS current_branch VARCHAR DEFAULT 'Merkez';`);
    // Faz 28.51: Kalıcı Şube Mühürlemesi - NULL olan tüm araçlara Merkez ata
    await query(`UPDATE public.vehicles SET current_branch = 'Merkez' WHERE current_branch IS NULL;`);
    // İstasyon bazlı otomatik şube eşleştirme (sadece henüz Merkez olanlar için)
    await query(`UPDATE public.vehicles SET current_branch = 'Esentepe' WHERE current_branch = 'Merkez' AND (istasyon ILIKE '%Esentepe%' OR istasyon ILIKE '%esentepe%');`);
    await query(`UPDATE public.vehicles SET current_branch = 'OSB (Organize)' WHERE current_branch = 'Merkez' AND (istasyon ILIKE '%Organize%' OR istasyon ILIKE '%OSB%' OR istasyon ILIKE '%organize%');`);
    await query(`UPDATE public.vehicles SET current_branch = 'OSB (Organize)' WHERE current_branch = 'OSB';`);

    await query(`ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS marka VARCHAR;`);
    await query(`ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS istasyon TEXT;`);
    await query(`ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS yil INTEGER;`);
    await query(`ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS model TEXT;`);
    await query(`ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS su_kapasite INTEGER DEFAULT 0;`);
    await query(`ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS kopuk_kapasite INTEGER DEFAULT 0;`);
    await query(`ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS next_inspection_date DATE;`);
    await query(`UPDATE public.vehicles SET next_inspection_date = "muayeneBitis" WHERE next_inspection_date IS NULL AND "muayeneBitis" IS NOT NULL;`);

    // Phase 28.21: Add physical status column and sync
    await query(`ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'active';`);
    await query(`UPDATE public.vehicles SET status = 'maintenance' WHERE durum IN ('bakımda', 'serviste', 'Bekliyor', 'Serviste', 'maintenance', 'Bakımda');`);
    await query(`UPDATE public.vehicles SET status = 'active' WHERE status != 'maintenance' OR status IS NULL;`);

    // Faz 28.26: Add filo_no and aciklama columns
    await query(`ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS filo_no INTEGER;`);
    await query(`ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS aciklama VARCHAR;`);

    // Faz 28.59: Add responsible personnel columns
    await query(`ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS sorumlu_sofor_id UUID REFERENCES public.personnel(id) ON DELETE SET NULL;`);
    await query(`ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS sorumlu_er_id UUID REFERENCES public.personnel(id) ON DELETE SET NULL;`);

    // Faz 28.53: Add push_subscription_token to personnel table
    await query(`ALTER TABLE public.personnel ADD COLUMN IF NOT EXISTS push_subscription_token TEXT;`);

    // Faz 28.55: Add personnel location tracking columns
    await query(`ALTER TABLE public.personnel ADD COLUMN IF NOT EXISTS son_enlem DOUBLE PRECISION;`);
    await query(`ALTER TABLE public.personnel ADD COLUMN IF NOT EXISTS son_boylam DOUBLE PRECISION;`);
    await query(`ALTER TABLE public.personnel ADD COLUMN IF NOT EXISTS son_guncelleme TIMESTAMPTZ;`);

    // Egitimler: Add temel_egitim_saati to personnel table
    await query(`ALTER TABLE public.personnel ADD COLUMN IF NOT EXISTS temel_egitim_saati INTEGER DEFAULT 0;`);
  });
}

async function ensureFireHydrantsSchema() {
  return once('fire_hydrants', async () => {
    await query(`ALTER TABLE public.fire_hydrants ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'active';`);
  });
}

async function ensureMaintenanceLogsTableExists() {
  return once('maintenance_logs', async () => {
    await query(`ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS id UUID UNIQUE DEFAULT gen_random_uuid();`);
    await query(`
      CREATE TABLE IF NOT EXISTS public.maintenance_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE CASCADE,
        ariza_seviyesi VARCHAR,
        aciklama TEXT,
        bakim_notu TEXT,
        "bakım_notu" TEXT,
        bildiren_personel_id UUID REFERENCES public.personnel(id) ON DELETE SET NULL,
        durum VARCHAR DEFAULT 'Bakımda',
        eski_sube VARCHAR,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await query(`ALTER TABLE public.maintenance_logs ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE CASCADE;`);
    await query(`ALTER TABLE public.maintenance_logs ADD COLUMN IF NOT EXISTS ariza_seviyesi VARCHAR;`);
    await query(`ALTER TABLE public.maintenance_logs ADD COLUMN IF NOT EXISTS aciklama TEXT;`);
    await query(`ALTER TABLE public.maintenance_logs ADD COLUMN IF NOT EXISTS bakim_notu TEXT;`);
    await query(`ALTER TABLE public.maintenance_logs ADD COLUMN IF NOT EXISTS "bakım_notu" TEXT;`);
    await query(`ALTER TABLE public.maintenance_logs ADD COLUMN IF NOT EXISTS bildiren_personel_id UUID REFERENCES public.personnel(id) ON DELETE SET NULL;`);
    await query(`ALTER TABLE public.maintenance_logs ADD COLUMN IF NOT EXISTS durum VARCHAR DEFAULT 'Bakımda';`);
    await query(`ALTER TABLE public.maintenance_logs ADD COLUMN IF NOT EXISTS eski_sube VARCHAR;`);
  });
}

async function ensureAracBakimGecmisiTableExists() {
  return once('arac_bakim_gecmisi', async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS public.arac_bakim_gecmisi (
        id SERIAL PRIMARY KEY,
        plaka VARCHAR(15) NOT NULL,
        tarih DATE NOT NULL,
        tip VARCHAR(50) NOT NULL,
        aciklama TEXT NOT NULL,
        maliyet NUMERIC(10, 2) DEFAULT 0,
        durum VARCHAR(20) DEFAULT 'Onaylandı',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await query(`ALTER TABLE public.arac_bakim_gecmisi ADD COLUMN IF NOT EXISTS durum VARCHAR(20) DEFAULT 'Onaylandı'`);
    await query(`CREATE INDEX IF NOT EXISTS idx_arac_bakim_gecmisi_plaka ON public.arac_bakim_gecmisi(plaka)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_arac_bakim_gecmisi_tarih ON public.arac_bakim_gecmisi(tarih DESC)`);
  });
}

async function ensureBlacklistInstitutionsTableExists() {
  return once('blacklist_institutions', async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS public.blacklist_institutions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        kurum_adi VARCHAR NOT NULL,
        telefon VARCHAR UNIQUE NOT NULL,
        gerekce TEXT,
        yasaklama_tarihi DATE NOT NULL DEFAULT CURRENT_DATE,
        aktif_durum BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  });
}

async function ensureExternalEducationsTableExists() {
  return once('external_educations', async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS public.external_educations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        kurum_id UUID REFERENCES public.blacklist_institutions(id) ON DELETE SET NULL,
        kurum_adi VARCHAR,
        kurum_tipi VARCHAR,
        egitim_turu VARCHAR,
        kisi_sayisi INTEGER,
        planlanan_tarih TIMESTAMPTZ,
        saat_slot VARCHAR,
        egitimci_personel_ids UUID[],
        durum VARCHAR DEFAULT 'Beklemede',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await query(`ALTER TABLE public.external_educations ADD COLUMN IF NOT EXISTS saat_slot VARCHAR;`);
    await query(`ALTER TABLE public.external_educations ADD COLUMN IF NOT EXISTS kurum_tipi VARCHAR;`);
    await query(`ALTER TABLE public.external_educations ADD COLUMN IF NOT EXISTS mahalle VARCHAR;`);
    await query(`ALTER TABLE public.external_educations ADD COLUMN IF NOT EXISTS yas_grubu VARCHAR;`);
    await query(`ALTER TABLE public.external_educations ADD COLUMN IF NOT EXISTS teorik_sure_dk INTEGER DEFAULT 0;`);
    await query(`ALTER TABLE public.external_educations ADD COLUMN IF NOT EXISTS tatbikat_sure_dk INTEGER DEFAULT 0;`);
    await query(`ALTER TABLE public.external_educations ADD COLUMN IF NOT EXISTS pratik_sure_dk INTEGER DEFAULT 0;`);
    await query(`ALTER TABLE public.external_educations ADD COLUMN IF NOT EXISTS toplam_sure_saat NUMERIC(5,2) DEFAULT 0;`);
    await query(`ALTER TABLE public.external_educations ADD COLUMN IF NOT EXISTS telefon VARCHAR(50);`);
  });
}

async function ensureExternalMissionsTableExists() {
  return once('external_missions', async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS public.external_missions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        gorev_turu VARCHAR NOT NULL,
        baslik VARCHAR NOT NULL,
        detay TEXT,
        hedef_koordinat GEOMETRY(Point, 4326),
        adres VARCHAR,
        mahalle VARCHAR,
        cikis_tarihi TIMESTAMPTZ DEFAULT NOW(),
        tahmini_donus TIMESTAMPTZ,
        durum VARCHAR DEFAULT 'Aktif',
        plaka VARCHAR,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await query(`ALTER TABLE public.external_missions ADD COLUMN IF NOT EXISTS sicil_nos VARCHAR[];`);
    await query(`ALTER TABLE public.external_missions ADD COLUMN IF NOT EXISTS mahalle VARCHAR;`);
  });
}

async function ensureEgitimMufredatiTableExists() {
  return once('egitim_mufredati', async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS public.egitim_mufredati (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tarih DATE NOT NULL,
        posta VARCHAR(1) NOT NULL,
        egitim_konusu VARCHAR NOT NULL,
        ay INTEGER NOT NULL,
        yil INTEGER NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
  });
}

async function ensurePersonnelDetailsTableExists() {
  return once('personnel_details', async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS public.personnel_details (
        sicil_no VARCHAR PRIMARY KEY,
        kan_grubu VARCHAR,
        telefon VARCHAR,
        acil_durum_kisi_ad VARCHAR,
        acil_durum_kisi_telefon VARCHAR,
        adres TEXT,
        dogum_tarihi DATE,
        ise_baslama_tarihi DATE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  });
}

async function ensureRadioLogsTableExists() {
  return once('radio_logs', async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS public.radio_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        kanal_tipi VARCHAR NOT NULL,
        vaka_id UUID REFERENCES public.incidents(id) ON DELETE CASCADE,
        gonderen_personel_id UUID NOT NULL REFERENCES public.personnel(id) ON DELETE CASCADE,
        gonderen_ad_soyad VARCHAR NOT NULL,
        gonderen_rutbe VARCHAR NOT NULL,
        mesaj_metni TEXT NOT NULL,
        telsiz_kodu VARCHAR,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await query(`ALTER TABLE public.radio_logs ADD COLUMN IF NOT EXISTS mission_id UUID REFERENCES public.external_missions(id) ON DELETE CASCADE;`);
  });
}

async function ensureUnifiedSystemLogsViewExists() {
  return once('unified_system_logs', async () => {
    await query(`DROP VIEW IF EXISTS public.unified_system_logs CASCADE;`);
    await query(`
      CREATE OR REPLACE VIEW public.unified_system_logs AS
      SELECT
        id,
        created_at AS tarih,
        plaka,
        'Günlük Kontrol' AS islem_tipi,
        kontrol_eden_sicil AS sicil,
        kontrol_eden_ad AS ad_soyad,
        (CASE
          WHEN yakit_durumu IN ('Boş', 'Az')
            OR su_durumu IN ('Boş', 'Az')
            OR kopuk_durumu IN ('Boş', 'Az')
            OR pompa_durumu = 'Arızalı'
            OR lastik_durumu = 'Kötü'
            OR far_durumu = 'Arızalı'
            OR genel_temizlik = 'Kötü'
          THEN 'Sorunlu'
          ELSE 'Kusursuz'
        END) AS durum,
        -- Girilen tüm kontrol alanları detay olarak gösterilir (eskiden yalnızca notlar
        -- gösterildiği için not yazılmayan kontroller raporda "boş/geçersiz" görünüyordu).
        CONCAT_WS(' · ',
          NULLIF('Yakıt: ' || yakit_durumu, 'Yakıt: '),
          NULLIF('Su: ' || su_durumu, 'Su: '),
          NULLIF('Köpük: ' || kopuk_durumu, 'Köpük: '),
          NULLIF('Pompa: ' || pompa_durumu, 'Pompa: '),
          NULLIF('Lastik: ' || lastik_durumu, 'Lastik: '),
          NULLIF('Far: ' || far_durumu, 'Far: '),
          NULLIF('Temizlik: ' || genel_temizlik, 'Temizlik: '),
          NULLIF('Not: ' || notlar, 'Not: ')
        ) AS detaylar
      FROM public.daily_vehicle_checks

      UNION ALL

      SELECT
        ic.id,
        ic.created_at AS tarih,
        ic.plaka,
        'Envanter Sayımı' AS islem_tipi,
        ic.kontrol_eden AS sicil,
        COALESCE(p.ad || ' ' || p.soyad, ic.kontrol_eden) AS ad_soyad,
        (CASE WHEN ic.yeni_durum IN ('Eksik', 'Arızalı') THEN 'Sorunlu' ELSE 'Kusursuz' END) AS durum,
        CONCAT(ic.bolme, ' - ', ic.malzeme, ' (', ic.yeni_durum, ')', COALESCE(' - Not: ' || ic.notlar, '')) AS detaylar
      FROM public.inventory_checks ic
      LEFT JOIN public.personnel p ON ic.kontrol_eden = p.sicil_no

      UNION ALL

      SELECT
        id,
        created_at AS tarih,
        '-' AS plaka,
        (CASE WHEN action_type = 'nobet_baslangic' THEN 'Nöbet Başlangıcı' ELSE 'Nöbet Bitişi' END) AS islem_tipi,
        actor_sicil_no AS sicil,
        actor_name AS ad_soyad,
        'Kusursuz' AS durum,
        CONCAT(target, COALESCE(' - Cihaz: ' || (details->>'cihaz'), ''), COALESCE(' - Geofence: ' || (details->>'geofence'), '')) AS detaylar
      FROM public.audit_logs
      WHERE action_type IN ('nobet_baslangic', 'nobet_bitis')
    `);
  });
}

/**
 * Araç tablosu boşsa 24 taktik aracı bir kez seed eder. (Process başına bir kez.)
 */
export async function autoSeedVehiclesIfEmpty() {
  return once('vehicles_seed', async () => {
    const countRes = await query('SELECT COUNT(*) FROM vehicles');
    const count = parseInt(countRes.rows[0]?.count || '0', 10);
    if (count === 0) {
      for (const v of REAL_VEHICLES) {
        const presetCompartments = getPresetCompartments(v.arac_tipi);
        await query(
          'INSERT INTO vehicles (plaka, arac_tipi, marka, durum, bolmeler, km, "motorSaatiPTO", "sigortaBitis", "muayeneBitis", next_inspection_date, istasyon, yil, model) ' +
          'VALUES ($1, $2, $3, ' + (v.yil > 1960 ? "'aktif'" : "'arızalı'") + ', $4, $5, $6, $7, $8, $9, $10, $11, $12) ' +
          'ON CONFLICT (plaka) DO NOTHING',
          [
            v.plaka,
            v.arac_tipi,
            v.marka || null,
            JSON.stringify(presetCompartments),
            v.yil > 2018 ? 24000 : 124000,
            v.yil > 2018 ? 450 : 2100,
            null,
            null,
            null,
            v.istasyon || null,
            v.yil || null,
            v.model || null
          ]
        );
      }
      console.log('✓ 24 taktik araç başarıyla seed edildi.');
    }
  });
}

async function ensureRadioRecordingsTableExists() {
  return once('radio_recordings', async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS public.radio_recordings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        incident_id UUID REFERENCES public.incidents(id) ON DELETE CASCADE,
        olay_bilgi VARCHAR,
        sicil_no VARCHAR NOT NULL,
        personel_ad VARCHAR NOT NULL,
        audio_url TEXT NOT NULL,
        kaynak VARCHAR NOT NULL DEFAULT 'MIKROFON' CHECK (kaynak IN ('MIKROFON','YUKLEME')),
        sure_sn INTEGER,
        aciklama VARCHAR,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_radio_recordings_incident ON public.radio_recordings(incident_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_radio_recordings_sicil ON public.radio_recordings(sicil_no)`);
  });
}

async function ensurePersonnelColumnsExist() {
  return once('personnel', async () => {
    // birim: 'Posta' (vardiyalı) | 'Karargah' (gündüz mesaili idari kadro).
    // Karargah ayrımı eskiden ekran bazında ünvan metninden tahmin ediliyordu;
    // artık tek gerçeklik kaynağı bu kolondur (bkz. src/lib/personnelUtils.ts).
    await query(`ALTER TABLE public.personnel ADD COLUMN IF NOT EXISTS birim VARCHAR(20);`);

    // Personel vesikalık fotoğrafı (MinIO URL — itfaiye/personel-foto/)
    await query(`ALTER TABLE public.personnel ADD COLUMN IF NOT EXISTS foto_url TEXT;`);

    // Geriye dönük sınıflandırma: bilinen karargah ünvanları (yalnızca birim boşsa)
    await query(`
      UPDATE public.personnel SET birim = 'Karargah'
      WHERE birim IS NULL AND (
        unvan IN ('Kalem', 'Memur', 'İdari İşler', 'Yazı İşleri', 'Çay Ocağı')
        OR unvan ILIKE '%kalem%' OR unvan ILIKE '%memur%'
        OR unvan ILIKE '%yazı işleri%' OR unvan ILIKE '%çay%'
      );
    `);
    await query(`UPDATE public.personnel SET birim = 'Posta' WHERE birim IS NULL;`);

    // posta_no DEFAULT 1 kaldırılır: posta atanmamış (karargah) personel
    // 1. Posta nöbetçisi gibi görünmesin. Mevcut veriler değiştirilmez.
    await query(`ALTER TABLE public.personnel ALTER COLUMN posta_no DROP DEFAULT;`);
  });
}

/**
 * Verilen tablo için gerekli şema kurulumunu (memoize edilmiş) çalıştırır.
 * GET/POST/PATCH/DELETE handler'larında tek çağrıyla kullanılır.
 */
export async function ensureTableSchema(table: string): Promise<void> {
  switch (table) {
    case 'personnel': await ensurePersonnelColumnsExist(); break;
    case 'role_permissions': await ensureRolePermissionsTableExists(); break;
    case 'system_settings': await ensureSystemSettingsTableExists(); break;
    case 'personnel_details': await ensurePersonnelDetailsTableExists(); break;
    case 'radio_logs': await ensureRadioLogsTableExists(); break;
    case 'duty_logs': await ensureDutyLogsTableExists(); break;
    case 'personnel_shifts_log': await ensurePersonnelShiftsLogTableExists(); break;
    case 'service_applications': await ensureServiceApplicationsTableExists(); break;
    case 'temp_otps': await ensureTempOtpsTableExists(); break;
    case 'hourly_shifts': await ensureHourlyShiftsTableExists(); break;
    case 'temporary_assignments': await ensureTemporaryAssignmentsTableExists(); break;
    case 'daily_summary_reports': await ensureDailySummaryReportsTableExists(); break;
    case 'vehicles': await ensureVehicleColumnsExist(); break;
    case 'fire_hydrants': await ensureFireHydrantsSchema(); break;
    case 'arac_bakim_gecmisi': await ensureAracBakimGecmisiTableExists(); break;
    case 'maintenance_logs': await ensureMaintenanceLogsTableExists(); break;
    case 'blacklist_institutions': await ensureBlacklistInstitutionsTableExists(); break;
    case 'external_educations':
      await ensureBlacklistInstitutionsTableExists();
      await ensureExternalEducationsTableExists();
      break;
    case 'external_missions': await ensureExternalMissionsTableExists(); break;
    case 'egitim_mufredati': await ensureEgitimMufredatiTableExists(); break;
    case 'unified_system_logs': await ensureUnifiedSystemLogsViewExists(); break;
    case 'radio_recordings': await ensureRadioRecordingsTableExists(); break;
    default: break;
  }
}
