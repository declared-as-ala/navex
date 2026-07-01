import { tunisStartOfDay } from "@/lib/tz"

/**
 * Derived "main workflow status" and shared query fragments.
 * Annulé (CANCELLED) parcels are excluded everywhere via NOT_CANCELLED.
 */
export type MainStatus = "EN_COURS" | "LIVRE" | "RETOUR_ATTENDU" | "RETOUR_CONFIRME"

export function mainStatus(p: { navexStatus?: string; physicalStatus?: string }): MainStatus {
  if (p.physicalStatus === "RETURN_CONFIRMED") return "RETOUR_CONFIRME"
  if (p.navexStatus === "RETURN" || p.physicalStatus === "RETURN_EXPECTED") return "RETOUR_ATTENDU"
  if (p.navexStatus === "DELIVERED") return "LIVRE"
  return "EN_COURS"
}

export const MAIN_STATUS_LABEL: Record<MainStatus, string> = {
  EN_COURS: "En cours",
  LIVRE: "Livré",
  RETOUR_ATTENDU: "Retour attendu",
  RETOUR_CONFIRME: "Retour confirmé",
}

/** Every list/card/chart must ignore Annulé. */
export const NOT_CANCELLED = { navexStatus: { $ne: "CANCELLED" } }

const DAY = 86400000

/** Mongo filter for a named status view (Colis / Dashboard). */
export function statusViewFilter(view: string, staleDays = 7): Record<string, any> {
  switch (view) {
    case "en_cours":
      return { navexStatus: { $in: ["PENDING", "IN_TRANSIT", "OUT_FOR_DELIVERY"] }, physicalStatus: { $nin: ["RETURN_EXPECTED", "RETURN_CONFIRMED"] } }
    case "livres":
      return { navexStatus: "DELIVERED" }
    case "payes":
      return { paymentStatus: "PAID" }
    case "retours_attendus":
      return { navexStatus: "RETURN" }
    case "retours_confirmes":
      return { physicalStatus: "RETURN_CONFIRMED" }
    case "retours_manquants":
      return { navexStatus: "RETURN", physicalStatus: { $ne: "RETURN_CONFIRMED" } }
    case "sans_maj":
      return { navexStatus: "PENDING", handedToNavexAt: { $lte: new Date(Date.now() - staleDays * DAY) } }
    default:
      return {}
  }
}

/** Field a date range is applied to. */
export function dateBasisField(basis?: string): string {
  switch (basis) {
    case "navex": return "lastNavexSyncAt"
    case "retour": return "returnConfirmedAt"
    default: return "handedToNavexAt"
  }
}

/** Resolve a named date range (Africa/Tunis) into { start, end } bounds. */
export function resolveDateRange(range?: string, from?: string, to?: string): { start?: Date; end?: Date } {
  const now = new Date()
  const todayStart = tunisStartOfDay(now)
  switch (range) {
    case "today": return { start: todayStart }
    case "yesterday": return { start: new Date(todayStart.getTime() - DAY), end: todayStart }
    case "7d": return { start: new Date(now.getTime() - 7 * DAY) }
    case "30d": return { start: new Date(now.getTime() - 30 * DAY) }
    case "3d": return { start: new Date(now.getTime() - 3 * DAY) }
    case "custom": return { start: from ? new Date(from) : undefined, end: to ? new Date(to) : undefined }
    default: return {}
  }
}

/** Build a Mongo date filter fragment for a field + range. */
export function dateRangeFilter(field: string, range?: string, from?: string, to?: string): Record<string, any> {
  const { start, end } = resolveDateRange(range, from, to)
  if (!start && !end) return {}
  const cond: any = {}
  if (start) cond.$gte = start
  if (end) cond.$lt = end
  return { [field]: cond }
}
