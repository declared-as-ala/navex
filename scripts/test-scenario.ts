/**
 * End-to-end test of the simplified 700-parcel scenario.
 *
 * Runs against an ISOLATED database (logiflow_test) so it never touches real
 * data. Exercises the real shared scan engine (src/lib/scan-engine) and mirrors
 * the scan-create / sync rules implemented by the API routes.
 *
 * Run: npm run test:scenario
 */
import "./load-env"
import mongoose from "mongoose"
import { Order } from "../src/lib/models/Order"
import { decideRemiseExisting, decideReturnReceive } from "../src/lib/scan-engine"

const BASE_URI = process.env.MONGODB_URI || ""
if (!BASE_URI) { console.error("✗ MONGODB_URI manquant (.env.local ou variable d'environnement)"); process.exit(1) }
const TEST_URI = BASE_URI.replace(/\/([^/?]+)(\?|$)/, "/logiflow_test$2")

let passed = 0, failed = 0
function assert(label: string, actual: number | boolean, expected: number | boolean) {
  const ok = actual === expected
  ok ? passed++ : failed++
  console.log(`${ok ? "✅" : "❌"} ${label}: ${actual}${ok ? "" : ` (attendu ${expected})`}`)
}

async function dashboard() {
  const [total, delivered, announced, confirmed, missing] = await Promise.all([
    Order.countDocuments({}),
    Order.countDocuments({ navexStatus: "DELIVERED" }),
    Order.countDocuments({ navexStatus: "RETURN" }),
    Order.countDocuments({ physicalStatus: "RETURN_CONFIRMED" }),
    Order.countDocuments({ physicalStatus: "RETURN_EXPECTED" }),
  ])
  return { total, delivered, announced, confirmed, missing }
}

async function main() {
  await mongoose.connect(TEST_URI)
  console.log("✓ Connecté à la base de test isolée (logiflow_test)\n")
  await Order.deleteMany({})

  // ---- Step 1: scan 700 parcels in "Remise à Navex" (each fetched from Navex) ----
  const docs = Array.from({ length: 700 }, (_, i) => {
    const n = i + 1
    return {
      externalOrderId: `NAVEX-${387000000000 + n}`,
      navexTrackingCode: `${387000000000 + n}`,
      customer: { name: `Client ${n}`, phone: "53623884", governorate: "Tunis", city: "Tunis", address: "Adresse réelle" },
      designation: "1x article (taille M)",
      codAmount: 15 + (n % 60),
      physicalStatus: "HANDED_TO_NAVEX" as const,
      handedToNavexAt: new Date(),
      navexStatus: "PENDING" as const,
    }
  })
  await Order.insertMany(docs)
  console.log("— Étape 1 : 700 colis scannés (Remise à Navex) —")
  assert("Colis remis à Navex", (await dashboard()).total, 700)

  // duplicate remise must be rejected
  const one = await Order.findOne({})
  assert("Re-scan remise rejeté (duplicate)", decideRemiseExisting(one as any).ok, false)

  // ---- Step 2: Navex sync → 500 LIVRÉ, 200 RETOUR ----
  const all = await Order.find({}).select("_id").lean()
  const deliveredIds = all.slice(0, 500).map((p) => p._id)
  const returnIds = all.slice(500, 700).map((p) => p._id)
  await Order.updateMany({ _id: { $in: deliveredIds } }, { navexStatus: "DELIVERED", deliveredAt: new Date() })
  await Order.updateMany({ _id: { $in: returnIds } }, { navexStatus: "RETURN", physicalStatus: "RETURN_EXPECTED", returnExpectedAt: new Date() })

  console.log("\n— Étape 2 : Sync Navex (500 livrés, 200 retours) —")
  let d = await dashboard()
  assert("Livrés", d.delivered, 500)
  assert("Retours annoncés", d.announced, 200)
  assert("Retours confirmés", d.confirmed, 0)
  assert("Retours manquants", d.missing, 200)

  // ---- Step 3: physically scan 180 returns ----
  const returns = await Order.find({ physicalStatus: "RETURN_EXPECTED" }).limit(180)
  for (const p of returns) {
    const dec = decideReturnReceive(p, { override: false, canOverride: false })
    if (dec.ok) { dec.mutate?.(p as any); await p.save() }
  }
  console.log("\n— Étape 3 : Scan de 180 retours physiques —")
  d = await dashboard()
  assert("Retours annoncés (inchangé)", d.announced, 200)
  assert("Retours confirmés", d.confirmed, 180)
  assert("Retours manquants", d.missing, 20)

  // duplicate return scan blocked
  const confirmed1 = await Order.findOne({ physicalStatus: "RETURN_CONFIRMED" })
  assert("Re-scan retour rejeté (duplicate)", decideReturnReceive(confirmed1 as any, {}).ok, false)
  // return scan on a non-announced (delivered) parcel blocked
  const delivered1 = await Order.findOne({ navexStatus: "DELIVERED", physicalStatus: "HANDED_TO_NAVEX" })
  assert("Retour non annoncé bloqué", decideReturnReceive(delivered1 as any, {}).ok, false)

  console.log(`\n========================================`)
  console.log(`RÉSULTAT : ${passed} réussis, ${failed} échoués`)
  console.log(`========================================`)

  await Order.deleteMany({})
  await mongoose.disconnect()
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => { console.error("✗ Erreur:", err); process.exit(1) })
