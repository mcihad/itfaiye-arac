"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react"
import { subscribeToasts, dismissToast, ToastItem, ToastType } from "@/lib/toast"

const STYLES: Record<ToastType, { border: string; icon: React.ReactNode }> = {
  success: {
    border: "border-l-emerald-500",
    icon: <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />,
  },
  error: {
    border: "border-l-rose-500",
    icon: <XCircle className="w-4 h-4 text-rose-500 shrink-0" />,
  },
  warning: {
    border: "border-l-amber-500",
    icon: <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />,
  },
  info: {
    border: "border-l-sky-500",
    icon: <Info className="w-4 h-4 text-sky-500 shrink-0" />,
  },
}

/**
 * Toast bildirimlerinin görselleştiricisi — kök layout'ta bir kez mount edilir.
 * Mesajlar src/lib/toast.ts üzerinden gelir (alert yerine kullanılan sistem).
 */
export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => subscribeToasts(setItems), [])

  if (items.length === 0) return null

  return (
    <div
      className="fixed z-[200] flex flex-col gap-2 pointer-events-none
                 top-[calc(env(safe-area-inset-top)+0.75rem)] left-1/2 -translate-x-1/2 w-[calc(100%-1.5rem)] max-w-sm
                 sm:left-auto sm:translate-x-0 sm:right-4 sm:top-[calc(env(safe-area-inset-top)+1rem)]"
      aria-live="polite"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start gap-2.5 rounded-[var(--fd-r-sm,0.5rem)] border border-[var(--fd-border,#333)] border-l-4 ${STYLES[t.type].border}
                      bg-[var(--fd-surface,#111827)] text-[var(--fd-text,#f1f5f9)] shadow-lg px-3.5 py-3
                      animate-in slide-in-from-top-2 fade-in duration-200`}
          role="status"
        >
          <div className="mt-0.5">{STYLES[t.type].icon}</div>
          <div className="flex-1 text-[13px] leading-snug whitespace-pre-line break-words">
            {t.message}
          </div>
          <button
            type="button"
            onClick={() => dismissToast(t.id)}
            className="p-0.5 -m-0.5 text-[var(--fd-text3,#94a3b8)] hover:text-[var(--fd-text,#f1f5f9)] bg-transparent border-none cursor-pointer shrink-0"
            aria-label="Kapat"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
