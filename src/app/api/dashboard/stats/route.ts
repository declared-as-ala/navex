import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { connectDB } from "@/lib/db"
import { Order } from "@/lib/models/Order"
import { ParcelScan } from "@/lib/models/ParcelScan"
import { getStaleDays } from "@/lib/settings-cache"
import { NOT_CANCELLED, statusViewFilter, dateRangeFilter } from "@/lib/parcel-status"
import { tunisStartOfDay } from "@/lib/tz"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ success: false, error: "Non authentifié" }, { status: 401 })

  await connectDB()
  const sp = new URL(req.url).searchParams
  const staleDays = await getStaleDays()

  // Cards respect the selected date range (based on outgoing-scan date).
  const dateFilter = dateRangeFilter("handedToNavexAt", sp.get("range") || undefined, sp.get("from") || undefined, sp.get("to") || undefined)
  const base = { ...NOT_CANCELLED, ...dateFilter }
  const c = (extra: any) => Order.countDocuments({ ...base, ...extra })

  const [
    scannedToday, enCours, livres, payes, retoursAnnonces, retoursConfirmes, retoursManquants, sansMaj, activity,
  ] = await Promise.all([
    ParcelScan.countDocuments({ result: "OK", mode: "HANDOVER_PREP", createdAt: { $gte: tunisStartOfDay() } }),
    c(statusViewFilter("en_cours", staleDays)),
    c({ navexStatus: "DELIVERED" }),
    c({ paymentStatus: "PAID" }),
    c({ navexStatus: "RETURN" }),
    c({ physicalStatus: "RETURN_CONFIRMED" }),
    c({ navexStatus: "RETURN", physicalStatus: { $ne: "RETURN_CONFIRMED" } }),
    c(statusViewFilter("sans_maj", staleDays)),
    Order.aggregate([
      { $match: { ...base, handedToNavexAt: { $ne: null } } },
      {
        $group: {
          _id: { $dateToString: { format: "%d/%m", date: "$handedToNavexAt", timezone: "Africa/Tunis" } },
          sortKey: { $min: { $dateToString: { format: "%Y-%m-%d", date: "$handedToNavexAt", timezone: "Africa/Tunis" } } },
          remis: { $sum: 1 },
          livres: { $sum: { $cond: [{ $eq: ["$navexStatus", "DELIVERED"] }, 1, 0] } },
          retoursAnnonces: { $sum: { $cond: [{ $eq: ["$navexStatus", "RETURN"] }, 1, 0] } },
          retoursConfirmes: { $sum: { $cond: [{ $eq: ["$physicalStatus", "RETURN_CONFIRMED"] }, 1, 0] } },
        },
      },
      { $sort: { sortKey: 1 } },
      { $limit: 31 },
    ]),
  ])

  const activityByDay = (activity as any[]).map((a) => ({
    day: a._id, remis: a.remis, livres: a.livres, retoursAnnonces: a.retoursAnnonces, retoursConfirmes: a.retoursConfirmes,
  }))

  return NextResponse.json({
    success: true,
    data: {
      cards: { scannedToday, enCours, livres, payes, retoursAnnonces, retoursConfirmes, retoursManquants, sansMaj },
      activityByDay,
      returnsChart: [
        { name: "Annoncés", value: retoursAnnonces, color: "#ea580c" },
        { name: "Confirmés", value: retoursConfirmes, color: "#16a34a" },
        { name: "Manquants", value: retoursManquants, color: "#dc2626" },
      ],
      isEmpty: (await Order.countDocuments(NOT_CANCELLED)) === 0,
    },
  })
}
