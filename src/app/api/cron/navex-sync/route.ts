import { NextRequest, NextResponse } from "next/server"
import { connectDB } from "@/lib/db"
import { Order } from "@/lib/models/Order"
import { navexService } from "@/lib/navex/navex-client"
import { mapToSimpleNavexStatus, isNavexPaid } from "@/lib/navex/navex-status.mapper"

/**
 * Scheduled Navex status sync (cron). Same rules as POST /api/parcels/sync:
 *  - DELIVERED → deliveredAt; COD_EXPECTED becomes DELIVERED_UNPAID.
 *  - RETURN    → RETURN_EXPECTED (announcement only, never RETURN_CONFIRMED).
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  const secret = process.env.CRON_SECRET
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  }

  await connectDB()

  const active = await Order.find({
    navexTrackingCode: { $exists: true, $ne: null },
    physicalStatus: { $ne: "RETURN_CONFIRMED" },
    navexStatus: { $nin: ["DELIVERED"] },
  })
    .select("navexTrackingCode navexStatus physicalStatus")
    .lean()

  if (active.length === 0) {
    return NextResponse.json({ success: true, data: { synced: 0, total: 0 } })
  }

  const codes = active.map((p: any) => p.navexTrackingCode).filter(Boolean)
  let synced = 0

  try {
    const response = await navexService.getMultipleShipmentStatuses(codes)
    if (response.success && response.shipments) {
      for (const update of response.shipments) {
        const parcel = active.find((p: any) => p.navexTrackingCode === update.tracking_code)
        if (!parcel) continue
        const raw = update.status_label || update.status
        const simple = mapToSimpleNavexStatus(update.status)
        const set: Record<string, any> = {
          navexStatus: simple,
          navexRawStatus: raw,
          lastNavexSyncAt: new Date(),
        }
        if (simple === "DELIVERED") set.deliveredAt = new Date()
        if (isNavexPaid(raw)) { set.paymentStatus = "PAID"; set.paidAt = new Date() }
        if (simple === "RETURN" && parcel.physicalStatus !== "RETURN_CONFIRMED") {
          set.physicalStatus = "RETURN_EXPECTED"
          set.returnExpectedAt = new Date()
        }
        await Order.findByIdAndUpdate(parcel._id, { $set: set })
        synced++
      }
    }
    return NextResponse.json({ success: true, data: { synced, total: active.length } })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "CRON_SYNC_ERROR", message: error.message } })
  }
}
