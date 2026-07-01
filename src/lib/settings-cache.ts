import { SystemSetting } from "@/lib/models/SystemSetting"

/**
 * "Sans mise à jour" threshold in days (configurable in Paramètres, default 7).
 */
export async function getStaleDays(): Promise<number> {
  try {
    const s = await SystemSetting.findOne({ key: "staleDays" }).lean<{ value?: any }>()
    const n = parseInt(String(s?.value ?? ""), 10)
    return Number.isFinite(n) && n > 0 ? n : 7
  } catch {
    return 7
  }
}
