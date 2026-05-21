// Site URL — uses NEXT_PUBLIC_SITE_URL env var, falls back to Vercel production URL
// For QR codes this MUST be the canonical production domain, not a deployment-specific URL
export const APP_BASE_URL = 
  process.env.NEXT_PUBLIC_SITE_URL || 
  (typeof window !== 'undefined' ? window.location.origin : "https://itfaiye-arac.vercel.app");

export const COMPARTMENT_NAMES: Record<string, string> = {
  kabin_ici: "Kabin İçi",
  arac_ici: "Araç İçi",
  sol_on_kapak: "Sol Ön Kapak",
  sol_orta_kapak: "Sol Orta Kapak",
  sol_arka_kapak: "Sol Arka Kapak",
  sag_on_kapak: "Sağ Ön Kapak",
  sag_orta_kapak: "Sağ Orta Kapak",
  sag_arka_kapak: "Sağ Arka Kapak",
  arac_ustu: "Araç Üstü",
  arka_bolme: "Arka Bölme",
  arka_kapak: "Arka Kapak",
  sol_dolap: "Sol Malzeme Dolabı",
  sag_dolap: "Sağ Malzeme Dolabı",
  bagaj_ici: "Bagaj İçi",
  kasa_ici: "Kasa İçi",
};

export const COMPARTMENT_SLUGS: Record<string, string> = Object.fromEntries(
  Object.entries(COMPARTMENT_NAMES).map(([key, label]) => [key, key])
);
