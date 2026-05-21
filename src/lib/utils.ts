import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getTriageInfo(olayTuru: string) {
  const type = (olayTuru || "").trim();
  
  const redTypes = ["Ev Yangını", "Bina/Fabrika Yangını", "Sıkışmalı Trafik Kazası", "KBRN Sızıntısı", "Yangın", "Trafik Kazası"];
  const yellowTypes = ["Araç Yangını", "İşyeri Yangını", "Kurtarma Operasyonları", "Kurtarma", "Su Baskını"];
  
  if (redTypes.includes(type)) {
    return {
      seviye: 3,
      label: "KRİTİK",
      badgeText: "🔴 KRİTİK",
      color: "#ef4444",
      bgClass: "bg-red-500/10 text-red-500 border border-red-500/20",
      glowClass: "triage-critical-glow",
      animation: "pulse-glow-red 1s infinite ease-in-out"
    };
  }
  
  if (yellowTypes.includes(type)) {
    return {
      seviye: 2,
      label: "ORTA",
      badgeText: "🟡 ORTA",
      color: "#eab308",
      bgClass: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20",
      glowClass: "triage-medium-glow",
      animation: "pulse-glow-yellow 2s infinite ease-in-out"
    };
  }
  
  // Default to low (green)
  return {
    seviye: 1,
    label: "DÜŞÜK",
    badgeText: "🟢 DÜŞÜK",
    color: "#22c55e",
    bgClass: "bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20",
    glowClass: "triage-low-glow",
    animation: "pulse-glow-green 2.5s infinite ease-in-out"
  };
}

export function calculateRemainingDays(targetDate: string | null | undefined): { days: number | null; text: string } {
  if (!targetDate) {
    return { days: null, text: "Tarih Girilmemiş" };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const expiry = new Date(targetDate);
  expiry.setHours(0, 0, 0, 0);
  
  if (isNaN(expiry.getTime())) {
    return { days: null, text: "Tarih Girilmemiş" };
  }
  
  const diffTime = expiry.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) {
    return { days: diffDays, text: "SÜRESİ GEÇTİ" };
  }
  if (diffDays === 0) {
    return { days: 0, text: "Bugün son gün" };
  }
  return { days: diffDays, text: `${diffDays} gün kaldı` };
}
