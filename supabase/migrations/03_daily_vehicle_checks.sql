-- ═══════════════════════════════════════════════
-- GÜNLÜK ARAÇ DURUM KONTROLLERİ
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.daily_vehicle_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plaka VARCHAR(15) NOT NULL REFERENCES public.vehicles(plaka),
  kontrol_eden_sicil VARCHAR(20),
  kontrol_eden_ad VARCHAR(100),
  yakit_durumu VARCHAR(20) NOT NULL,
  su_durumu VARCHAR(20) NOT NULL,
  kopuk_durumu VARCHAR(20) NOT NULL,
  pompa_durumu VARCHAR(20) NOT NULL,
  lastik_durumu VARCHAR(20) DEFAULT 'İyi',
  far_durumu VARCHAR(20) DEFAULT 'Çalışıyor',
  genel_temizlik VARCHAR(20) DEFAULT 'İyi',
  notlar TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
