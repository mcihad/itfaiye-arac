"use client"

import { useEffect } from "react"
import { api } from "@/lib/api"
import { setShiftCycleReference } from "@/lib/shiftUtils"

/**
 * Vardiya döngüsü referansını (hangi tarihte hangi posta nöbetteydi)
 * system_settings'ten okuyup shiftUtils'e uygular. Dashboard layout'unda
 * görünmez olarak mount edilir; böylece hangi sayfa açılırsa açılsın
 * posta hesabı aynı referansı kullanır.
 *
 * Ayar yoksa veya henüz yüklenmediyse shiftUtils'teki varsayılan
 * (04.06.2026 → 2. Posta) geçerlidir — eski davranışla birebir aynı.
 */
export function ShiftConfigLoader() {
  useEffect(() => {
    let active = true
    async function load() {
      try {
        const { data } = await api.from('system_settings')
          .select('*')
          .in('key', ['vardiya_referans_tarihi', 'vardiya_referans_posta'])
        if (!active || !Array.isArray(data)) return
        const map: Record<string, string> = {}
        data.forEach((s: any) => { map[s.key] = s.value })
        setShiftCycleReference(map['vardiya_referans_tarihi'], map['vardiya_referans_posta'])
      } catch (err) {
        console.error('[ShiftConfigLoader] Vardiya referansı okunamadı:', err)
      }
    }
    load()
    return () => { active = false }
  }, [])

  return null
}
