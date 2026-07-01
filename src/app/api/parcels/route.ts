import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { connectDB } from "@/lib/db"
import { Order } from "@/lib/models/Order"
import { getVerifyDelay } from "@/lib/settings-cache"
import { statusViewFilter, dateBasisField, dateRangeFilter } from "@/lib/parcel-status"

/**
 * Colis list. Query: view (en_cours|paye|retour|a_verifier),
 * range (today|yesterday|7d|30d|custom + from,to), dateBasis (remise|paiement|retour),
 * q (Code Navex / Désignation / COD).
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ success: false, error: "Non authentifié" }, { status: 401 })

  await connectDB()
  const sp = new URL(req.url).searchParams
  const delay = await getVerifyDelay()

  const filter: any = { ...statusViewFilter(sp.get("view") || "", delay) }
  const range = sp.get("range") || undefined
  if (range) Object.assign(filter, dateRangeFilter(dateBasisField(sp.get("dateBasis") || undefined), range, sp.get("from") || undefined, sp.get("to") || undefined))

  const q = sp.get("q")?.trim()
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
    const or: any[] = [{ navexTrackingCode: rx }, { designation: rx }]
    const num = parseFloat(q)
    if (!isNaN(num)) or.push({ codAmount: num })
    filter.$or = or
  }

  const limit = Math.min(parseInt(sp.get("limit") || "300", 10), 2000)
  const [parcels, total] = await Promise.all([
    Order.find(filter).sort({ handedToNavexAt: -1, updatedAt: -1 }).limit(limit).lean(),
    Order.countDocuments(filter),
  ])
  const isEmpty = (await Order.countDocuments({})) === 0

  return NextResponse.json({ success: true, data: { parcels, total, isEmpty } })
}
