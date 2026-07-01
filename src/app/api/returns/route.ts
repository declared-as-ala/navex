import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { connectDB } from "@/lib/db"
import { Order } from "@/lib/models/Order"
import { NOT_CANCELLED, dateRangeFilter } from "@/lib/parcel-status"

/**
 * Returns control (anti-loss). Cards + the list of MISSING returns
 * (announced by Navex, not yet physically scanned), longest wait first.
 *
 * Query: range=today|7d|30d|custom (+from,to on returnExpectedAt),
 *        minWait=3|7 (announced more than N days ago).
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ success: false, error: "Non authentifié" }, { status: 401 })

  await connectDB()
  const sp = new URL(req.url).searchParams

  const [announced, confirmed, missing] = await Promise.all([
    Order.countDocuments({ ...NOT_CANCELLED, navexStatus: "RETURN" }),
    Order.countDocuments({ ...NOT_CANCELLED, physicalStatus: "RETURN_CONFIRMED" }),
    Order.countDocuments({ ...NOT_CANCELLED, navexStatus: "RETURN", physicalStatus: { $ne: "RETURN_CONFIRMED" } }),
  ])

  const filter: any = { ...NOT_CANCELLED, navexStatus: "RETURN", physicalStatus: { $ne: "RETURN_CONFIRMED" } }
  const range = sp.get("range") || undefined
  if (range) Object.assign(filter, dateRangeFilter("returnExpectedAt", range, sp.get("from") || undefined, sp.get("to") || undefined))
  const minWait = parseInt(sp.get("minWait") || "", 10)
  if (Number.isFinite(minWait) && minWait > 0) {
    filter.returnExpectedAt = { ...(filter.returnExpectedAt || {}), $lte: new Date(Date.now() - minWait * 86400000) }
  }

  const parcels = await Order.find(filter)
    .select("navexTrackingCode codAmount designation handedToNavexAt returnExpectedAt")
    .sort({ returnExpectedAt: 1 }) // oldest announcement = longest wait first
    .limit(1000)
    .lean()

  return NextResponse.json({ success: true, data: { summary: { announced, confirmed, missing }, parcels } })
}
