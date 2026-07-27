import { describe, it, expect, afterEach } from 'vitest';
import {
  getActivePostaForStation,
  setShiftCycleReference,
  getShiftCycleReference,
  normalizeStationName,
} from '@/lib/shiftUtils';

// Modül durumu testler arasında sızmasın diye her testten sonra varsayılana dön
afterEach(() => {
  setShiftCycleReference('2026-06-04', 2);
});

describe('normalizeStationName', () => {
  it('istasyon adlarını doğru anahtara eşler', () => {
    expect(normalizeStationName('Merkez İtfaiye Müdürlüğü')).toBe('Merkez');
    expect(normalizeStationName('Esentepe Şubesi')).toBe('Esentepe');
    expect(normalizeStationName('Organize Sanayi Bölgesi Şubesi')).toBe('Organize');
    expect(normalizeStationName('OSB')).toBe('Organize');
    expect(normalizeStationName(undefined)).toBe('Default');
    expect(normalizeStationName('Bilinmeyen')).toBe('Default');
  });
});

describe('getActivePostaForStation — varsayılan referans (04.06.2026 → 2. Posta)', () => {
  // Saat 12:00 kullanılır: tüm istasyonların vardiya değişim saatinden sonra
  const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h, 0, 0);

  it('referans gününde 2. Posta nöbettedir', () => {
    expect(getActivePostaForStation('Merkez', at(2026, 6, 4))).toBe(2);
  });

  it('döngü her gün +1 ilerler (2 → 3 → 1 → 2)', () => {
    expect(getActivePostaForStation('Merkez', at(2026, 6, 5))).toBe(3);
    expect(getActivePostaForStation('Merkez', at(2026, 6, 6))).toBe(1);
    expect(getActivePostaForStation('Merkez', at(2026, 6, 7))).toBe(2);
  });

  it('referanstan önceki günler için de doğru sarmalar', () => {
    expect(getActivePostaForStation('Merkez', at(2026, 6, 3))).toBe(1);
    expect(getActivePostaForStation('Merkez', at(2026, 6, 2))).toBe(3);
    expect(getActivePostaForStation('Merkez', at(2026, 6, 1))).toBe(2);
  });

  it('vardiya değişim saatinden ÖNCE önceki günün postası nöbettedir', () => {
    // Merkez değişimi 08:00 — 5 Haziran 07:59'da hâlâ 4 Haziran postası (2) nöbette
    expect(getActivePostaForStation('Merkez', new Date(2026, 5, 5, 7, 59))).toBe(2);
    // 08:00'den itibaren yeni posta (3)
    expect(getActivePostaForStation('Merkez', new Date(2026, 5, 5, 8, 0))).toBe(3);
  });

  it('istasyona özel değişim saatini dikkate alır (Organize 09:15)', () => {
    // 5 Haziran 09:00 — Organize'de değişim (09:15) henüz olmadı → önceki günün postası (2)
    expect(getActivePostaForStation('Organize', new Date(2026, 5, 5, 9, 0))).toBe(2);
    expect(getActivePostaForStation('Organize', new Date(2026, 5, 5, 9, 15))).toBe(3);
  });

  it('özel saatler (customTimes) parametresi öncelik alır', () => {
    const custom = {
      Merkez: { hours: 10, minutes: 30 },
      Esentepe: { hours: 8, minutes: 45 },
      Organize: { hours: 9, minutes: 15 },
      Default: { hours: 10, minutes: 30 },
    };
    // 10:00'da özel değişim saati (10:30) henüz gelmedi → önceki günün postası
    expect(getActivePostaForStation('Merkez', new Date(2026, 5, 5, 10, 0), custom)).toBe(2);
    expect(getActivePostaForStation('Merkez', new Date(2026, 5, 5, 10, 30), custom)).toBe(3);
  });
});

describe('setShiftCycleReference', () => {
  const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0);

  it('referans değişince hesap yeni referansa göre döner', () => {
    setShiftCycleReference('2026-07-01', 1);
    expect(getActivePostaForStation('Merkez', at(2026, 7, 1))).toBe(1);
    expect(getActivePostaForStation('Merkez', at(2026, 7, 2))).toBe(2);
    expect(getActivePostaForStation('Merkez', at(2026, 7, 3))).toBe(3);
  });

  it('geçersiz değerleri yok sayar (mevcut referans korunur)', () => {
    const before = getShiftCycleReference();
    setShiftCycleReference('gecersiz-tarih', 2);
    setShiftCycleReference('2026-07-01', 0);
    setShiftCycleReference('2026-07-01', 4);
    setShiftCycleReference(null, null);
    expect(getShiftCycleReference()).toEqual(before);
  });

  it('string posta değerini kabul eder (ayarlar metin olarak saklanır)', () => {
    setShiftCycleReference('2026-07-01', '3');
    expect(getShiftCycleReference().posta).toBe(3);
  });
});
