import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { connectDB } from "@/lib/db"
import { Order } from "@/lib/models/Order"
import { ParcelScan } from "@/lib/models/ParcelScan"
import { getVerifyDelay } from "@/lib/settings-cache"
import { dateRangeFilter, verifyThreshold } from "@/lib/parcel-status"
import { tunisStartOfDay } from "@/lib/tz"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ success: false, error: "Non authentifié" }, { status: 401 })

  await connectDB()
  const sp = new URL(req.url).searchParams
  const delay = await getVerifyDelay()
  const threshold = verifyThreshold(delay)

  const dateFilter = dateRangeFilter("handedToNavexAt", sp.get("range") || undefined, sp.get("from") || undefined, sp.get("to") || undefined)
  const base = { ...dateFilter }
  const c = (extra: any) => Order.countDocuments({ ...base, ...extra })

  const [scannedToday, enCours, paye, retour, aVerifier, scannedTotal, activity] = await Promise.all([
    ParcelScan.countDocuments({ result: "OK", mode: "HANDOVER_PREP", createdAt: { $gte: tunisStartOfDay() } }),
    c({ status: "EN_COURS" }),
    c({ status: "PAYE" }),
    c({ status: "RETOUR" }),
    c({ status: "EN_COURS", handedToNavexAt: { $lte: threshold } }),
    c({}),
    Order.aggregate([
      { $match: { ...base, handedToNavexAt: { $ne: null } } },
      {
        $group: {
          _id: { $dateToString: { format: "%d/%m", date: "$handedToNavexAt", timezone: "Africa/Tunis" } },
          sortKey: { $min: { $dateToString: { format: "%Y-%m-%d", date: "$handedToNavexAt", timezone: "Africa/Tunis" } } },
          scannes: { $sum: 1 },
          payes: { $sum: { $cond: [{ $eq: ["$status", "PAYE"] }, 1, 0] } },
          retours: { $sum: { $cond: [{ $eq: ["$status", "RETOUR"] }, 1, 0] } },
          averifier: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "EN_COURS"] }, { $lte: ["$handedToNavexAt", threshold] }] }, 1, 0] } },
        },
      },
      { $sort: { sortKey: 1 } },
      { $limit: 31 },
    ]),
  ])

  const activityByDay = (activity as any[]).map((a) => ({ day: a._id, scannes: a.scannes, payes: a.payes, retours: a.retours, averifier: a.averifier }))

  return NextResponse.json({
    success: true,
    data: {
      cards: { scannedToday, enCours, paye, retour, aVerifier },
      activityByDay,
      reconciliation: [
        { name: "Scannés", value: scannedTotal, color: "#2563eb" },
        { name: "Payé", value: paye, color: "#16a34a" },
        { name: "Retour", value: retour, color: "#ea580c" },
        { name: "À vérifier", value: aVerifier, color: "#dc2626" },
      ],
      isEmpty: (await Order.countDocuments({})) === 0,
    },
  })
}
