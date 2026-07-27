/**
 * Sayfa yetkilendirme (role_permissions) ortak mantığı.
 *
 * Aynı eşleme üç yerde kullanılır ve BURADAN beslenir:
 *  - PageGuard (istemci, görsel engel)
 *  - /api/auth/page-permission (sunucu, DB sorgusu)
 *  - proxy.ts (middleware, sunucu taraflı zorlama)
 *
 * Bu dosya edge runtime'da da çalışır: Node/DB bağımlılığı YOK.
 */

export type PermissionRole = 'Müdür' | 'Amir' | 'Başçavuş' | 'Çavuş' | 'Santral' | 'Er';

export type PageId =
  | 'harita' | 'personel_yonetimi' | 'arac_bakim' | 'envanter'
  | 'raporlar' | 'egitimler' | 'hizmet_basvurulari' | 'gorevler'
  | 'kilavuz' | 'telsiz';

/** Kullanıcının rol+ünvanını role_permissions tablosundaki rol adına eşler. */
export function mapUserToPermissionRole(user: { rol?: string; unvan?: string } | null | undefined): PermissionRole {
  if (!user) return 'Er';
  const rol = user.rol || '';
  const unvan = (user.unvan || '').toLowerCase();

  if (unvan.includes('müdür') || rol === 'Admin') {
    return 'Müdür';
  }
  if (unvan.includes('amir') || rol === 'Editor') {
    return 'Amir';
  }
  if (
    unvan.includes('başçavuş') ||
    unvan === 'baş şoför' ||
    unvan === 'baş şöför' ||
    unvan === 'başşoför' ||
    unvan === 'başşöför'
  ) {
    return 'Başçavuş';
  }
  if (
    unvan.includes('çavuş') ||
    unvan.includes('posta başşoför') ||
    unvan.includes('posta başşöför') ||
    rol === 'Shift_Leader'
  ) {
    return 'Çavuş';
  }
  if (
    unvan.includes('santral') ||
    unvan.includes('ihbar') ||
    unvan.includes('memur') ||
    rol === 'Santral'
  ) {
    return 'Santral';
  }
  return 'Er'; // Müdahale Eri ve Şoför
}

/**
 * role_permissions tablosunda satır yoksa (veya sorgu başarısızsa) kullanılan
 * deterministik varsayılan matris. PageGuard ve sunucu ucu aynı matrisi kullanır.
 */
export function getDefaultPagePermission(mappedRole: PermissionRole, pageId: string): boolean {
  if (pageId === 'kilavuz' || pageId === 'telsiz') return true;
  if (mappedRole === 'Müdür' || mappedRole === 'Amir') return true;
  if (mappedRole === 'Başçavuş' || mappedRole === 'Çavuş') {
    return ['harita', 'arac_bakim', 'envanter', 'raporlar', 'egitimler', 'hizmet_basvurulari', 'gorevler'].includes(pageId);
  }
  if (mappedRole === 'Santral') {
    return ['harita', 'hizmet_basvurulari', 'gorevler'].includes(pageId);
  }
  return ['harita', 'envanter', 'hizmet_basvurulari', 'gorevler'].includes(pageId);
}

/**
 * Middleware'in yol → sayfa_id eşlemesi. Buradaki her giriş, /api/auth/page-permission
 * üzerinden sunucu tarafında da denetlenir (PageGuard'ı baypas eden doğrudan
 * navigasyonlara karşı).
 */
export const PAGE_ID_BY_PATH: Record<string, PageId> = {
  '/yonetim/harita': 'harita',
  '/yonetim/personel': 'personel_yonetimi',
  '/yonetim/arac-bakim': 'arac_bakim',
  '/yonetim/envanter': 'envanter',
  '/yonetim/raporlar': 'raporlar',
  '/yonetim/egitimler': 'egitimler',
  '/yonetim/hizmetler': 'hizmet_basvurulari',
  '/yonetim/gorevler': 'gorevler',
};

/** pathname'i sayfa_id'ye çevirir; eşleşme yoksa null. */
export function resolvePageId(pathname: string): PageId | null {
  for (const [prefix, pageId] of Object.entries(PAGE_ID_BY_PATH)) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) return pageId;
  }
  return null;
}
