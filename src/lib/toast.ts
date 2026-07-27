/**
 * Hafif, bağımlılıksız toast bildirim sistemi.
 *
 * alert() yerine kullanılır: tarayıcıyı KİLİTLEMEZ, köşede belirir ve
 * kendiliğinden kaybolur. Çağrı imzası alert ile birebir uyumludur
 * (`toast("mesaj")`), tür verilmezse mesaj içeriğinden otomatik sınıflandırılır —
 * böylece mevcut alert çağrıları davranış değişikliği olmadan taşınabilir.
 *
 * React dışından da çağrılabilir (modül seviyesinde store); görselleştirme
 * src/components/ui/Toaster.tsx tarafından yapılır (kök layout'ta mount edilir).
 */

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

const DURATION_MS = 6000;
const MAX_VISIBLE = 5;

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<(items: ToastItem[]) => void>();

function emit() {
  for (const fn of listeners) fn(items);
}

/** Toaster bileşeni abone olur; geri dönen fonksiyon aboneliği kaldırır. */
export function subscribeToasts(fn: (items: ToastItem[]) => void): () => void {
  listeners.add(fn);
  fn(items);
  return () => listeners.delete(fn);
}

export function dismissToast(id: number) {
  const before = items.length;
  items = items.filter((t) => t.id !== id);
  if (items.length !== before) emit();
}

/**
 * Mesaj içeriğinden tür tahmini (alert → toast geçişinin davranışı bozmaması
 * için çağrı yerlerinde tür belirtmek zorunlu değildir).
 * Sıra önemli: "kaydedilemedi" hem 'kaydedildi' hem 'edilemedi' içerir —
 * hata kalıpları önce denetlenir.
 */
function classify(message: string): ToastType {
  const m = message.toLocaleLowerCase('tr-TR');
  if (/hata|başarısız|yazılamadı|edilemedi|edilemez|eklenemedi|silinemedi|kaydedilemedi|güncellenemedi|gönderilemedi|yüklenemedi|oluşturulamadı|yapılamadı|alınamadı|bulunamadı|geçersiz|uyuşmuyor|reddedildi|engelleniyor|yetkiniz yok/.test(m)) {
    return 'error';
  }
  if (/başarıyla|kaydedildi|güncellendi|tamamlandı|gönderildi|silindi|eklendi|oluşturuldu|onaylandı|taburcu edildi|sıfırlandı/.test(m)) {
    return 'success';
  }
  if (/uyarı|dikkat|lütfen|zorunlu|eksik|seçin|giriniz|girin|doldurun|bekleyin/.test(m)) {
    return 'warning';
  }
  return 'info';
}

function baseToast(message: unknown, type?: ToastType): void {
  if (typeof window === 'undefined') return; // SSR güvenliği
  const msg = typeof message === 'string' ? message : String(message ?? '');
  if (!msg.trim()) return;

  const item: ToastItem = { id: nextId++, type: type || classify(msg), message: msg };
  items = [...items, item].slice(-MAX_VISIBLE);
  emit();
  window.setTimeout(() => dismissToast(item.id), DURATION_MS);
}

export const toast = Object.assign(baseToast, {
  success: (m: string) => baseToast(m, 'success'),
  error: (m: string) => baseToast(m, 'error'),
  warning: (m: string) => baseToast(m, 'warning'),
  info: (m: string) => baseToast(m, 'info'),
});
