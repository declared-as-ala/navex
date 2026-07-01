import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { connectDB } from "@/lib/db"
import { Order } from "@/lib/models/Order"

/**
 * Parcel (Colis) list — the main operational table.
 * Filters: ?physical= &navex= &q= plus named views: ?view=remis|transit|delivered|
 * returns_expected|returns_confirmed|returns_missing
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ success: false, error: "Non authentifié" }, { status: 401 })

  await connectDB()
  const sp = new URL(req.url).searchParams

  const filter: any = {}
  if (sp.get("physical")) filter.physicalStatus = sp.get("physical")
  if (sp.get("navex")) filter.navexStatus = sp.get("navex")

  switch (sp.get("view")) {
    case "remis": filter.physicalStatus = "HANDED_TO_NAVEX"; break
    case "transit": filter.navexStatus = { $in: ["IN_TRANSIT", "OUT_FOR_DELIVERY"] }; break
    case "delivered": filter.navexStatus = "DELIVERED"; break
    case "returns_expected": filter.physicalStatus = "RETURN_EXPECTED"; break
    case "returns_confirmed": filter.physicalStatus = "RETURN_CONFIRMED"; break
    case "returns_missing": filter.physicalStatus = "RETURN_EXPECTED"; break
  }

  const q = sp.get("q")?.trim()
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
    filter.$or = [{ navexTrackingCode: rx }, { "customer.name": rx }, { "customer.phone": rx }]
  }

  const limit = Math.min(parseInt(sp.get("limit") || "200", 10), 1000)

  const [parcels, total] = await Promise.all([
    Order.find(filter).sort({ updatedAt: -1 }).limit(limit).lean(),
    Order.countDocuments(filter),
  ])

  return NextResponse.json({ success: true, data: { parcels, total, isEmpty: total === 0 } })
}
