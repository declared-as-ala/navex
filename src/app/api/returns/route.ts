import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { connectDB } from "@/lib/db"
import { Order } from "@/lib/models/Order"

/**
 * Returns are derived directly from parcel state, never a separate collection.
 *  - RETURN_EXPECTED  : Navex announced a return, not yet physically back.
 *  - RETURN_CONFIRMED : warehouse physically scanned the returned parcel.
 *
 * Query ?status=expected|confirmed|all (default all).
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ success: false, error: "Non authentifié" }, { status: 401 })

  await connectDB()
  const status = new URL(req.url).searchParams.get("status") || "all"

  const filter: any = {}
  if (status === "expected") filter.physicalStatus = "RETURN_EXPECTED"
  else if (status === "confirmed") filter.physicalStatus = "RETURN_CONFIRMED"
  else filter.physicalStatus = { $in: ["RETURN_EXPECTED", "RETURN_CONFIRMED"] }

  const [announced, stillExpected, confirmed, parcels] = await Promise.all([
    Order.countDocuments({ navexStatus: "RETURN" }),
    Order.countDocuments({ physicalStatus: "RETURN_EXPECTED" }),
    Order.countDocuments({ physicalStatus: "RETURN_CONFIRMED" }),
    Order.find(filter)
      .select("navexTrackingCode customer codAmount designation navexCreatedAt physicalStatus navexStatus returnExpectedAt returnConfirmedAt")
      .sort({ returnExpectedAt: 1, updatedAt: -1 })
      .limit(500)
      .lean(),
  ])

  return NextResponse.json({
    success: true,
    data: { summary: { announced, confirmed, stillMissing: stillExpected }, parcels },
  })
}
