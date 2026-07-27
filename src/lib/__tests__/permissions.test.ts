import { describe, it, expect } from 'vitest';
import {
  mapUserToPermissionRole,
  getDefaultPagePermission,
  resolvePageId,
} from '@/lib/permissions';

describe('mapUserToPermissionRole', () => {
  it('rol ve ünvana göre doğru yetki rolüne eşler', () => {
    expect(mapUserToPermissionRole({ rol: 'Admin', unvan: 'Müdür' })).toBe('Müdür');
    expect(mapUserToPermissionRole({ rol: 'User', unvan: 'Müdür' })).toBe('Müdür');
    expect(mapUserToPermissionRole({ rol: 'Editor', unvan: 'Baş Şoför' })).toBe('Amir');
    expect(mapUserToPermissionRole({ rol: 'User', unvan: 'Amir' })).toBe('Amir');
    expect(mapUserToPermissionRole({ rol: 'User', unvan: 'Başçavuş' })).toBe('Başçavuş');
    expect(mapUserToPermissionRole({ rol: 'Shift_Leader', unvan: 'Çvş.' })).toBe('Çavuş');
    expect(mapUserToPermissionRole({ rol: 'User', unvan: 'Vardiya Çavuşu' })).toBe('Çavuş');
    expect(mapUserToPermissionRole({ rol: 'User', unvan: 'Santral Operatörü' })).toBe('Santral');
    expect(mapUserToPermissionRole({ rol: 'User', unvan: 'Memur' })).toBe('Santral');
    expect(mapUserToPermissionRole({ rol: 'User', unvan: 'Er' })).toBe('Er');
    expect(mapUserToPermissionRole({ rol: 'User', unvan: 'Şoför' })).toBe('Er');
    expect(mapUserToPermissionRole(null)).toBe('Er');
    expect(mapUserToPermissionRole(undefined)).toBe('Er');
  });

  it('öncelik sırası: Müdür > Amir > Başçavuş > Çavuş > Santral > Er', () => {
    // Admin rolü ünvandan bağımsız Müdür'dür
    expect(mapUserToPermissionRole({ rol: 'Admin', unvan: 'Er' })).toBe('Müdür');
    // Editor rolü ünvandan bağımsız Amir'dir (Müdür ünvanı hariç)
    expect(mapUserToPermissionRole({ rol: 'Editor', unvan: 'Er' })).toBe('Amir');
  });
});

describe('getDefaultPagePermission', () => {
  it('Müdür ve Amir her sayfayı görür', () => {
    expect(getDefaultPagePermission('Müdür', 'raporlar')).toBe(true);
    expect(getDefaultPagePermission('Amir', 'personel_yonetimi')).toBe(true);
  });

  it('Çavuş operasyonel sayfaları görür, personel yönetimini görmez', () => {
    expect(getDefaultPagePermission('Çavuş', 'harita')).toBe(true);
    expect(getDefaultPagePermission('Çavuş', 'arac_bakim')).toBe(true);
    expect(getDefaultPagePermission('Çavuş', 'personel_yonetimi')).toBe(false);
  });

  it('Santral yalnızca harita/hizmet/görev sayfalarını görür', () => {
    expect(getDefaultPagePermission('Santral', 'harita')).toBe(true);
    expect(getDefaultPagePermission('Santral', 'gorevler')).toBe(true);
    expect(getDefaultPagePermission('Santral', 'raporlar')).toBe(false);
  });

  it('Er kısıtlı sayfalara erişemez', () => {
    expect(getDefaultPagePermission('Er', 'personel_yonetimi')).toBe(false);
    expect(getDefaultPagePermission('Er', 'raporlar')).toBe(false);
    expect(getDefaultPagePermission('Er', 'envanter')).toBe(true);
  });

  it('kılavuz ve telsiz herkese açıktır', () => {
    expect(getDefaultPagePermission('Er', 'kilavuz')).toBe(true);
    expect(getDefaultPagePermission('Er', 'telsiz')).toBe(true);
  });
});

describe('resolvePageId', () => {
  it('yolları doğru sayfa kimliğine çevirir', () => {
    expect(resolvePageId('/yonetim/harita')).toBe('harita');
    expect(resolvePageId('/yonetim/personel')).toBe('personel_yonetimi');
    expect(resolvePageId('/yonetim/personel/SB1234')).toBe('personel_yonetimi');
    expect(resolvePageId('/yonetim/hizmetler')).toBe('hizmet_basvurulari');
  });

  it('eşlenmemiş yollar için null döner', () => {
    expect(resolvePageId('/yonetim')).toBeNull();
    expect(resolvePageId('/yonetim/telsiz')).toBeNull();
    expect(resolvePageId('/login')).toBeNull();
    // Ön ek benzeri ama farklı yol yanlış eşleşmemeli
    expect(resolvePageId('/yonetim/haritalar')).toBeNull();
  });
});
