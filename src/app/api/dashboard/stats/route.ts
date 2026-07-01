import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { connectDB } from "@/lib/db"
import { Order } from "@/lib/models/Order"
import { ParcelScan } from "@/lib/models/ParcelScan"
import { tunisStartOfDay } from "@/lib/tz"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ success: false, error: "Non authentifié" }, { status: 401 })

  await connectDB()

  const startOfDay = tunisStartOfDay()

  const [
    total, scannedToday, inTransit, delivered, returnsAnnounced, returnsConfirmed, returnsMissing, noUpdate,
  ] = await Promise.all([
    Order.countDocuments({}),
    ParcelScan.countDocuments({ result: "OK", mode: "HANDOVER_PREP", createdAt: { $gte: startOfDay } }),
    Order.countDocuments({ navexStatus: { $in: ["IN_TRANSIT", "OUT_FOR_DELIVERY"] } }),
    Order.countDocuments({ navexStatus: "DELIVERED" }),
    Order.countDocuments({ navexStatus: "RETURN" }),
    Order.countDocuments({ physicalStatus: "RETURN_CONFIRMED" }),
    Order.countDocuments({ physicalStatus: "RETURN_EXPECTED" }),
    Order.countDocuments({ navexStatus: "PENDING" }),
  ])

  return NextResponse.json({
    success: true,
    data: {
      cards: {
        scanned: total,
        handedToNavex: total,
        inTransit,
        delivered,
        returnsAnnounced,
        returnsConfirmed,
        returnsMissing,
        noUpdate,
      },
      // Chart 1: Remis à Navex → outcome
      remisChart: [
        { name: "En transit", value: inTransit, key: "IN_TRANSIT" },
        { name: "Livrés", value: delivered, key: "DELIVERED" },
        { name: "Retours annoncés", value: returnsAnnounced, key: "RETURN" },
        { name: "Sans mise à jour", value: noUpdate, key: "PENDING" },
      ],
      // Chart 2: Returns control (anti-loss)
      returnsChart: [
        { name: "Annoncés", value: returnsAnnounced, color: "#ea580c" },
        { name: "Confirmés", value: returnsConfirmed, color: "#16a34a" },
        { name: "Manquants", value: returnsMissing, color: "#dc2626" },
      ],
      isEmpty: total === 0,
    },
  })
}
