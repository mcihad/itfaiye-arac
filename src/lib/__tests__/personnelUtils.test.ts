import { describe, it, expect } from 'vitest';
import { trLower, isKarargah, isKarargahUnvan, isIdariUnvan, isPostaHarici } from '@/lib/personnelUtils';

describe('trLower — Türkçe İ regresyon testi', () => {
  it("'İzinli' durumu 'izin' araması ile eşleşir (Mesai Çizelgesi hatasının kökü)", () => {
    // Standart toLowerCase bunu BOZAR: 'İzinli'.toLowerCase() → 'i̇zinli' (i + U+0307)
    expect('İzinli'.toLowerCase().includes('izin')).toBe(false); // hatalı davranışın belgesi
    expect(trLower('İzinli').includes('izin')).toBe(true);        // doğru davranış
  });

  it('diğer Türkçe durum değerleri de doğru eşleşir', () => {
    expect(trLower('Yıllık İzin').includes('izin')).toBe(true);
    // 'Mazeret İzni' → 'mazeret izni': 'izin' ile EŞLEŞMEZ, 'izni' gerekir
    // (DailyWorkSchedule bu yüzden her iki kalıbı da kontrol eder)
    expect(trLower('Mazeret İzni').includes('izin')).toBe(false);
    expect(trLower('Mazeret İzni').includes('izni')).toBe(true);
    expect(trLower('İzinli - Rapor sonrası').includes('izinli')).toBe(true);
    expect(trLower('Raporlu').includes('rapor')).toBe(true);
    expect(trLower('Dış Görev')).toBe('dış görev');
    expect(trLower('I')).toBe('ı'); // Türkçe: büyük I → ı
  });

  it('null/undefined için boş dize döner', () => {
    expect(trLower(null)).toBe('');
    expect(trLower(undefined)).toBe('');
  });
});

describe('personel sınıflandırma yardımcıları', () => {
  it('isKarargah: birim alanı öncelikli, yoksa ünvan tahmini', () => {
    expect(isKarargah({ birim: 'Karargah', unvan: 'Er' })).toBe(true);
    expect(isKarargah({ birim: 'Posta', unvan: 'Kalem' })).toBe(false);
    expect(isKarargah({ unvan: 'Kalem' })).toBe(true);
    expect(isKarargah({ unvan: 'İdari İşler' })).toBe(true);
    expect(isKarargah({ unvan: 'Er' })).toBe(false);
  });

  it('isIdariUnvan ve isPostaHarici', () => {
    expect(isIdariUnvan('Müdür')).toBe(true);
    expect(isIdariUnvan('Er')).toBe(false);
    expect(isPostaHarici({ unvan: 'Müdür', posta_no: 1 })).toBe(true);
    expect(isPostaHarici({ unvan: 'Er', posta_no: null })).toBe(true);
    expect(isPostaHarici({ unvan: 'Er', posta_no: 2 })).toBe(false);
  });

  it('isKarargahUnvan Türkçe İ ile de çalışır', () => {
    expect(isKarargahUnvan('İdari İşler')).toBe(true);
    expect(isKarargahUnvan('Yazı İşleri')).toBe(true);
  });
});
