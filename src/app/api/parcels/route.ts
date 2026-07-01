import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { connectDB } from "@/lib/db"
import { Order } from "@/lib/models/Order"
import { getStaleDays } from "@/lib/settings-cache"
import { NOT_CANCELLED, statusViewFilter, dateBasisField, dateRangeFilter, mainStatus } from "@/lib/parcel-status"

/**
 * Parcel (Colis) list. Query params:
 *   view       — status view (en_cours|livres|payes|retours_*|sans_maj)
 *   range      — today|yesterday|7d|30d|custom  (+ from,to for custom)
 *   dateBasis  — remise (default) | navex | retour
 *   q          — search by Code Navex / Désignation / COD
 * Annulé parcels are always excluded.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ success: false, error: "Non authentifié" }, { status: 401 })

  await connectDB()
  const sp = new URL(req.url).searchParams
  const staleDays = await getStaleDays()

  const filter: any = { ...NOT_CANCELLED }
  Object.assign(filter, statusViewFilter(sp.get("view") || "", staleDays))

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

  const [rows, total] = await Promise.all([
    Order.find(filter).sort({ handedToNavexAt: -1, updatedAt: -1 }).limit(limit).lean(),
    Order.countDocuments(filter),
  ])

  const parcels = rows.map((p: any) => ({ ...p, mainStatus: mainStatus(p) }))
  const isEmpty = (await Order.countDocuments(NOT_CANCELLED)) === 0

  return NextResponse.json({ success: true, data: { parcels, total, isEmpty } })
}
