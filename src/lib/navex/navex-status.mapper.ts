export const NAVEX_STATUS_MAP: Record<string, { logistics: string; payment?: string; warehouse?: string; label: string }> = {
  "en_attente": { logistics: "NAVEX_CREATED", payment: "COD_EXPECTED", warehouse: "PACKED", label: "En attente" },
  "pris_en_charge": { logistics: "HANDED_TO_NAVEX", warehouse: "OUT_OF_WAREHOUSE", label: "Pris en charge" },
  "en_cours": { logistics: "IN_TRANSIT", label: "En cours d'acheminement" },
  "en cours": { logistics: "IN_TRANSIT", label: "En cours d'acheminement" },
  "en_cours_livraison": { logistics: "OUT_FOR_DELIVERY", label: "En cours de livraison" },
  "en cours de livraison": { logistics: "OUT_FOR_DELIVERY", label: "En cours de livraison" },
  "livre": { logistics: "DELIVERED", payment: "DELIVERED_UNPAID", label: "Livré" },
  "livré": { logistics: "DELIVERED", payment: "DELIVERED_UNPAID", label: "Livré" },
  "livre_non_paye": { logistics: "DELIVERED", payment: "DELIVERED_UNPAID", label: "Livré non payé" },
  "livré non payé": { logistics: "DELIVERED", payment: "DELIVERED_UNPAID", label: "Livré non payé" },
  "retour": { logistics: "RETURN_IN_TRANSIT", warehouse: "RETURN_EXPECTED", label: "Retour en cours" },
  "retour_recu": { logistics: "RETURN_RECEIVED", warehouse: "RETURN_RECEIVED", label: "Retour reçu" },
  "retour reçu": { logistics: "RETURN_RECEIVED", warehouse: "RETURN_RECEIVED", label: "Retour reçu" },
  "annule": { logistics: "CANCELLED", payment: "NOT_APPLICABLE", label: "Annulé" },
  "annulé": { logistics: "CANCELLED", payment: "NOT_APPLICABLE", label: "Annulé" },
  "refuse": { logistics: "RETURN_IN_TRANSIT", warehouse: "RETURN_EXPECTED", label: "Refusé" },
  "refusé": { logistics: "RETURN_IN_TRANSIT", warehouse: "RETURN_EXPECTED", label: "Refusé" },
  "non_distribuable": { logistics: "EXCEPTION", label: "Non distribuable" },
  "adresse_incomplete": { logistics: "EXCEPTION", label: "Adresse incomplète" },
  "client_absent": { logistics: "EXCEPTION", label: "Client absent" },
  "reporte": { logistics: "EXCEPTION", label: "Reporté" },
  "reporté": { logistics: "EXCEPTION", label: "Reporté" },
}

export function mapNavexStatus(navexStatus: string): {
  logistics: string
  payment?: string
  warehouse?: string
  label: string
} {
  const normalized = navexStatus?.toLowerCase().trim()
  return NAVEX_STATUS_MAP[normalized] || {
    logistics: "EXCEPTION",
    label: `Statut inconnu: ${navexStatus}`,
  }
}

/** Map a raw Navex status string to the simplified NavexStatus used by parcels. */
export function mapToSimpleNavexStatus(
  navexStatus: string
): "PENDING" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED" | "RETURN" | "CANCELLED" | "UNKNOWN" {
  const n = navexStatus?.toLowerCase().trim() || ""
  if (!n) return "UNKNOWN"
  if (/(annul|cancel)/.test(n)) return "CANCELLED"
  if (/(en[_ ]?cours[_ ]?(de[_ ]?)?livraison|out[_ ]?for|en[_ ]?livraison)/.test(n)) return "OUT_FOR_DELIVERY"
  if (/(en[_ ]?attente|pending|cree|créé|pris[_ ]?en[_ ]?charge)/.test(n)) return "PENDING"
  if (/(en[_ ]?cours|in[_ ]?transit|achemin)/.test(n)) return "IN_TRANSIT"
  if (/(livr|deliver|paye|payé)/.test(n)) return "DELIVERED"
  if (/(retour|return|refus)/.test(n)) return "RETURN"
  return "UNKNOWN"
}

/** Does a raw Navex status indicate the COD has been paid? */
export function isNavexPaid(navexStatus: string): boolean {
  const n = navexStatus?.toLowerCase().trim() || ""
  if (/non[_ ]?paye|non[_ ]?payé|impaye|impayé/.test(n)) return false
  return /(paye|payé|paid|regl|réglé)/.test(n)
}

export function mapNavexRecetteStatus(navexStatus: string): "delivered" | "returned" | "unknown" {
  const normalized = navexStatus?.toLowerCase().trim()
  if (["livre", "livré", "livre_non_paye", "livré non payé", "paye", "payé"].includes(normalized)) return "delivered"
  if (["retour", "retour_recu", "retour reçu", "refuse", "refusé", "annule", "annulé"].includes(normalized)) return "returned"
  return "unknown"
}
