import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { connectDB } from "@/lib/db"
import { Order } from "@/lib/models/Order"
import { navexService } from "@/lib/navex/navex-client"

/**
 * Enrich a parcel's customer data from the Navex status API.
 * Navex returns recipient_name but may not return phone/city/address,
 * so we only overwrite fields that are currently empty.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ success: false, error: "Non authentifié" }, { status: 401 })

  await connectDB()
  const { id } = await params

  const parcel = await Order.findById(id)
  if (!parcel) return NextResponse.json({ success: false, error: "Colis introuvable" }, { status: 404 })

  const res = await navexService.getShipmentStatus(parcel.navexTrackingCode)
  if (!res.success) {
    return NextResponse.json({ success: false, error: "Impossible de contacter Navex" }, { status: 502 })
  }

  let updated = false

  // Navex status API may return the recipient name
  if (res.recipient_name && !parcel.customer.name) {
    parcel.customer.name = res.recipient_name
    updated = true
  }

  // Some Navex endpoints return additional fields in status_message or elsewhere
  if (res.livreur && !parcel.customer.name && typeof res.livreur === "string") {
    parcel.customer.name = res.livreur
    updated = true
  }

  if (updated) await parcel.save()

  return NextResponse.json({
    success: true,
    enriched: updated,
    message: updated ? "Nom client enrichi depuis Navex" : "Aucune donnée supplémentaire disponible",
    parcel: {
      _id: parcel._id,
      customerName: parcel.customer.name,
      customerPhone: parcel.customer.phone,
      city: parcel.customer.city,
      navexTrackingCode: parcel.navexTrackingCode,
    },
  })
}
