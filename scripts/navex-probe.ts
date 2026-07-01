/**
 * Probe the real Navex status/etat API for one or more tracking codes.
 * Shows the raw JSON Navex returns + how LogiFlow would map it.
 *
 * Usage:  npx tsx scripts/navex-probe.ts 451284295362 387929459850
 */
import "./load-env"
import { mapToSimpleNavexStatus, isNavexPaid } from "../src/lib/navex/navex-status.mapper"

const token = process.env.NAVEX_STATUS_TOKEN || process.env.NAVEX_CREATE_TOKEN || ""
const BASE = "https://app.navex.tn"

async function probe(code: string) {
  console.log(`\n========== ${code} ==========`)
  if (!token) { console.log("✗ Aucun NAVEX_STATUS_TOKEN configuré"); return }

  const url = `${BASE}/api/${token}/v1/post.php`
  const body = new URLSearchParams()
  body.append("code", code)
  body.append("include_prix", "1")
  body.append("include_date", "1")

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: body.toString(),
    })
    const text = await res.text()
    console.log("HTTP:", res.status)
    let json: any
    try { json = JSON.parse(text) } catch { console.log("RAW (non-JSON):", text.slice(0, 500)); return }
    console.log("RAW JSON:", JSON.stringify(json, null, 2))
    const raw = json.etat || json.status || ""
    console.log("→ Statut Navex:", mapToSimpleNavexStatus(raw), "| Payé:", isNavexPaid(raw), "| COD:", json.prix ?? "—")
  } catch (e: any) {
    console.log("✗ Erreur:", e.message)
  }
}

async function main() {
  const codes = process.argv.slice(2)
  if (codes.length === 0) { console.log("Usage: npx tsx scripts/navex-probe.ts <code> [code2 ...]"); process.exit(1) }
  console.log(`Token: ${token ? token.slice(0, 12) + "…" : "(aucun)"}`)
  for (const c of codes) await probe(c)
  process.exit(0)
}
main()
