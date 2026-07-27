/**
 * Personel sınıflandırma yardımcıları — TEK gerçeklik kaynağı.
 *
 * "Karargah" (gündüz mesaili idari kadro: kalem, memur, yazı işleri, çay ocağı vb.)
 * ile "Posta" (vardiyalı) ayrımı `personnel.birim` kolonunda tutulur. Eski kayıtlar
 * için birim boş olabilir; o durumda ünvan üzerinden geriye dönük tahmin yapılır.
 *
 * Bu ayrım eskiden her ekranda farklı ünvan-anahtar-kelime listeleriyle
 * tekrarlanıyordu (LeaveManagementModal, yonetim/page, FutureShiftCalendar...);
 * yeni kod her yerde bu modülü kullanmalıdır.
 */
import { Personnel } from "@/types";

/** Posta nöbetine girmeyen idari yönetici ünvanları (gündüz mesaisi). */
export const IDARI_UNVANLAR = ["Müdür", "Amir", "Baş Şoför", "Eğitim Çavuşu"];

/** Ünvanında bu kelimeler geçenler karargah kadrosu sayılır (birim boşsa). */
const KARARGAH_UNVAN_KELIMELERI = ["kalem", "memur", "idari", "yazı", "çay"];

export function isIdariUnvan(unvan?: string): boolean {
  return IDARI_UNVANLAR.includes(unvan || "");
}

export function isKarargahUnvan(unvan?: string): boolean {
  const u = (unvan || "").toLocaleLowerCase("tr-TR");
  return KARARGAH_UNVAN_KELIMELERI.some((k) => u.includes(k));
}

/** Personel karargah (gündüz mesaili idari) kadrosunda mı? */
export function isKarargah(p: Pick<Personnel, "birim" | "unvan">): boolean {
  if (p.birim) return p.birim === "Karargah";
  return isKarargahUnvan(p.unvan);
}

/**
 * Posta nöbet listelerinin DIŞINDA kalanlar: idari yöneticiler, karargah kadrosu
 * ve postası atanmamış personel. Nöbet/takvim ekranlarındaki posta filtresi bu
 * fonksiyonun tersini, "Karargah" görünümü ise kendisini kullanır.
 */
export function isPostaHarici(p: Pick<Personnel, "birim" | "unvan" | "posta_no">): boolean {
  return isIdariUnvan(p.unvan) || isKarargah(p) || !p.posta_no;
}
