/**
 * Pure scan-decision engine, shared by POST /api/scans and the test scenario so
 * the rules can never drift. Each function takes the current parcel state and
 * returns a decision; when ok=true the caller applies `mutate` before saving.
 */
import type { IOrder } from "@/lib/models/Order"

export type ScanResult = "OK" | "DUPLICATE" | "BLOCKED" | "OVERRIDE"

export interface ScanDecision {
  ok: boolean
  result: ScanResult
  code: string
  message: string
  mutate?: (p: IOrder) => void
}

function frDate(d?: Date) {
  return d ? new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Tunis", dateStyle: "short", timeStyle: "short" }).format(d) : ""
}

/**
 * "Remise à Navex" for a parcel that already exists locally.
 * Any locally-known parcel was already scanned out, so re-scanning is a duplicate.
 */
export function decideRemiseExisting(parcel: Pick<IOrder, "physicalStatus" | "handedToNavexAt">): ScanDecision {
  const when = frDate(parcel.handedToNavexAt as Date | undefined)
  return {
    ok: false,
    result: "DUPLICATE",
    code: "ALREADY_HANDED",
    message: when ? `Ce colis a déjà été remis à Navex le ${when}.` : "Ce colis a déjà été remis à Navex.",
  }
}

/**
 * "Retour reçu" → RETURN_CONFIRMED.
 * Allowed only when Navex announced a return, unless a supervisor override.
 */
export function decideReturnReceive(
  parcel: Pick<IOrder, "physicalStatus" | "navexStatus">,
  opts: { override?: boolean; canOverride?: boolean }
): ScanDecision {
  if (parcel.physicalStatus === "RETURN_CONFIRMED") {
    return { ok: false, result: "DUPLICATE", code: "DUPLICATE", message: "Retour déjà confirmé physiquement." }
  }
  const announced = parcel.navexStatus === "RETURN" || parcel.physicalStatus === "RETURN_EXPECTED"
  if (!announced) {
    if (!opts.override) {
      return { ok: false, result: "BLOCKED", code: "NOT_RETURN", message: "Ce colis n'est pas encore marqué Retour chez Navex." }
    }
    if (!opts.canOverride) {
      return { ok: false, result: "BLOCKED", code: "OVERRIDE_FORBIDDEN", message: "Override réservé à l'administrateur." }
    }
  }
  const didOverride = !announced && !!opts.override
  return {
    ok: true,
    result: didOverride ? "OVERRIDE" : "OK",
    code: "OK",
    message: "Retour confirmé physiquement",
    mutate: (p) => {
      p.physicalStatus = "RETURN_CONFIRMED"
      p.returnConfirmedAt = new Date()
    },
  }
}
