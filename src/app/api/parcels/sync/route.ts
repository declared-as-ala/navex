import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { connectDB } from "@/lib/db"
import { Order } from "@/lib/models/Order"
import { navexService } from "@/lib/navex/navex-client"
import { mapToSimpleNavexStatus } from "@/lib/navex/navex-status.mapper"

const SYNC_ROLES = ["SUPER_ADMIN", "ADMIN", "MANAGER"]

/**
 * Sync delivery status from Navex onto parcels. Updates ONLY navexStatus:
 *  - DELIVERED → set deliveredAt; physical stays HANDED_TO_NAVEX.
 *  - RETURN    → mark RETURN_EXPECTED (announcement only) unless already
 *               RETURN_CONFIRMED. Never overwrites a confirmed physical return.
 */
export async function POST() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ success: false, error: "Non authentifié" }, { status: 401 })
  if (!SYNC_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ success: false, error: "Accès refusé" }, { status: 403 })
  }

  await connectDB()

  // Active parcels: handed to Navex / in transit, not yet at a terminal state
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
        const simple = mapToSimpleNavexStatus(update.status)
        const set: Record<string, any> = {
          navexStatus: simple,
          navexRawStatus: update.status_label || update.status,
          lastNavexSyncAt: new Date(),
        }
        if (simple === "DELIVERED") {
          set.deliveredAt = new Date()
        }
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
    return NextResponse.json(
      { success: false, error: { code: "SYNC_ERROR", message: error.message || "Erreur de synchronisation" } },
      { status: 500 }
    )
  }
}
