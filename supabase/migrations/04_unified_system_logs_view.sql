-- ═══════════════════════════════════════════════
-- 04_unified_system_logs_view.sql
-- ═══════════════════════════════════════════════

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
  notlar AS detaylar
FROM public.daily_vehicle_checks

UNION ALL

SELECT 
  id, 
  created_at AS tarih, 
  plaka, 
  'Envanter Sayımı' AS islem_tipi, 
  kontrol_eden AS sicil, 
  kontrol_eden AS ad_soyad, -- inventory_checks may only have one 'kontrol_eden' field containing sicil or name
  (CASE WHEN yeni_durum IN ('Eksik', 'Arızalı') THEN 'Sorunlu' ELSE 'Kusursuz' END) AS durum, 
  CONCAT(bolme, ' - ', malzeme, ' (', yeni_durum, ')', COALESCE(' - Not: ' || notlar, '')) AS detaylar
FROM public.inventory_checks;
