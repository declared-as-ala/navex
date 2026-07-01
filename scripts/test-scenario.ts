/**
 * End-to-end test of the daily reconciliation scenario (2 days + payment).
 * Runs against an ISOLATED database (logiflow_test). Uses the real shared scan
 * engine and mirrors the sync rules from the API routes.
 *
 * Run: npm run test:scenario
 */
import "./load-env"
import mongoose from "mongoose"
import { Order } from "../src/lib/models/Order"
import { decideRemiseExisting, decideReturnReceive } from "../src/lib/scan-engine"
import { mainStatus } from "../src/lib/parcel-status"

const BASE_URI = process.env.MONGODB_URI || ""
if (!BASE_URI) { console.error("✗ MONGODB_URI manquant"); process.exit(1) }
const TEST_URI = BASE_URI.replace(/\/([^/?]+)(\?|$)/, "/logiflow_test$2")

let passed = 0, failed = 0
function assert(label: string, actual: any, expected: any) {
  const ok = actual === expected
  ok ? passed++ : failed++
  console.log(`${ok ? "✅" : "❌"} ${label}: ${actual}${ok ? "" : ` (attendu ${expected})`}`)
}

const DAY1 = new Date("2026-06-30T09:00:00+01:00")
const DAY2 = new Date("2026-07-01T09:00:00+01:00")

function makeParcels(count: number, startSeq: number, date: Date) {
  return Array.from({ length: count }, (_, i) => {
    const n = startSeq + i
    return {
      externalOrderId: `NAVEX-${450000000000 + n}`,
      navexTrackingCode: `${450000000000 + n}`,
      customer: { name: "", phone: "", governorate: "", city: "", address: "" },
      designation: "1x article",
      codAmount: 15 + (n % 60),
      physicalStatus: "HANDED_TO_NAVEX" as const,
      handedToNavexAt: date,
      navexStatus: "PENDING" as const,
      paymentStatus: "PENDING" as const,
    }
  })
}

async function counts() {
  const [livres, payes, announced, confirmed, missing] = await Promise.all([
    Order.countDocuments({ navexStatus: "DELIVERED" }),
    Order.countDocuments({ paymentStatus: "PAID" }),
    Order.countDocuments({ navexStatus: "RETURN" }),
    Order.countDocuments({ physicalStatus: "RETURN_CONFIRMED" }),
    Order.countDocuments({ navexStatus: "RETURN", physicalStatus: { $ne: "RETURN_CONFIRMED" } }),
  ])
  return { livres, payes, announced, confirmed, missing }
}

async function main() {
  await mongoose.connect(TEST_URI)
  console.log("✓ Base de test isolée (logiflow_test)\n")
  await Order.deleteMany({})

  // Day 1: 700 scans
  await Order.insertMany(makeParcels(700, 1, DAY1))
  console.log("— Jour 1 : 700 colis remis à Navex —")
  assert("Total colis", await Order.countDocuments({}), 700)
  const sample = await Order.findOne({})
  assert("Statut principal = En cours", mainStatus(sample as any), "EN_COURS")

  // Day 2: 200 scans
  await Order.insertMany(makeParcels(200, 701, DAY2))
  console.log("\n— Jour 2 : 200 colis —")
  assert("Filtre Jour 1 (remise)", await Order.countDocuments({ handedToNavexAt: { $gte: DAY1, $lt: DAY2 } }), 700)
  assert("Filtre Jour 2 (remise)", await Order.countDocuments({ handedToNavexAt: { $gte: DAY2 } }), 200)

  // Sync: 500 livrés (dont 350 payés), 200 retours
  const all = await Order.find({}).select("_id").lean()
  const delivered = all.slice(0, 500).map((p) => p._id)
  const paid = all.slice(0, 350).map((p) => p._id)
  const returns = all.slice(500, 700).map((p) => p._id)
  await Order.updateMany({ _id: { $in: delivered } }, { navexStatus: "DELIVERED", deliveredAt: new Date() })
  await Order.updateMany({ _id: { $in: paid } }, { paymentStatus: "PAID", paidAt: new Date() })
  await Order.updateMany({ _id: { $in: returns } }, { navexStatus: "RETURN", physicalStatus: "RETURN_EXPECTED", returnExpectedAt: new Date() })

  console.log("\n— Sync Navex : 500 livrés, 350 payés, 200 retours —")
  let c = await counts()
  assert("Livrés", c.livres, 500)
  assert("Payés", c.payes, 350)
  assert("Retours annoncés", c.announced, 200)
  assert("Retours confirmés", c.confirmed, 0)
  assert("Retours manquants", c.missing, 200)

  // Physical returns: 180
  const toConfirm = await Order.find({ physicalStatus: "RETURN_EXPECTED" }).limit(180)
  for (const p of toConfirm) {
    const dec = decideReturnReceive(p, {})
    if (dec.ok) { dec.mutate?.(p as any); await p.save() }
  }
  console.log("\n— 180 retours confirmés physiquement —")
  c = await counts()
  assert("Retours annoncés", c.announced, 200)
  assert("Retours confirmés", c.confirmed, 180)
  assert("Retours manquants", c.missing, 20)

  // Validations
  console.log("\n— Validations —")
  const existing = await Order.findOne({ navexStatus: "DELIVERED" })
  assert("Re-scan remise bloqué", decideRemiseExisting(existing as any).ok, false)
  const confirmed1 = await Order.findOne({ physicalStatus: "RETURN_CONFIRMED" })
  assert("Re-scan retour bloqué", decideReturnReceive(confirmed1 as any, {}).ok, false)
  assert("Retour non annoncé bloqué", decideReturnReceive(existing as any, {}).ok, false)

  // Annulé ignored
  await Order.updateMany({ _id: { $in: all.slice(690, 700).map((p) => p._id) } }, { navexStatus: "CANCELLED" })
  const visibleReturns = await Order.countDocuments({ navexStatus: "RETURN" })
  assert("Annulés exclus des retours", visibleReturns, 190)

  console.log(`\n========================================`)
  console.log(`RÉSULTAT : ${passed} réussis, ${failed} échoués`)
  console.log(`========================================`)

  await Order.deleteMany({})
  await mongoose.disconnect()
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => { console.error("✗", e); process.exit(1) })
