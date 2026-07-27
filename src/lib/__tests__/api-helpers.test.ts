import { describe, it, expect } from 'vitest';
import { unwrap, addDaysISO } from '@/lib/api';

describe('unwrap', () => {
  it('error alanı boşsa sonucu aynen döndürür', () => {
    const res = { data: [{ id: 1 }], error: null };
    expect(unwrap(res)).toBe(res);
  });

  it('error alanı doluysa mesajıyla fırlatır', () => {
    expect(() => unwrap({ data: null, error: 'Yetkiniz yok.' })).toThrow('Yetkiniz yok.');
  });

  it('error nesne ise JSON olarak fırlatır', () => {
    expect(() => unwrap({ error: { code: 42 } })).toThrow('{"code":42}');
  });
});

describe('addDaysISO', () => {
  it('gün ekler', () => {
    expect(addDaysISO('2026-07-27', 0)).toBe('2026-07-27');
    expect(addDaysISO('2026-07-27', 1)).toBe('2026-07-28');
    expect(addDaysISO('2026-07-27', 4)).toBe('2026-07-31');
  });

  it('ay ve yıl sınırlarını doğru aşar', () => {
    expect(addDaysISO('2026-07-31', 1)).toBe('2026-08-01');
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01');
    // Artık yıl
    expect(addDaysISO('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDaysISO('2027-02-28', 1)).toBe('2027-03-01');
  });

  it('negatif gün ile geri gider', () => {
    expect(addDaysISO('2026-08-01', -1)).toBe('2026-07-31');
    expect(addDaysISO('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('UTC kaymasından etkilenmez (izin bitiş tarihi hatasının regresyon testi)', () => {
    // Eski kod new Date(str)+toISOString ile UTC+3'te günü kaydırabiliyordu;
    // 1 günlük izin aynı gün bitmeli.
    expect(addDaysISO('2026-07-27', 1 - 1)).toBe('2026-07-27');
  });
});
