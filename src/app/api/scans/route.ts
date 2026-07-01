import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { connectDB } from "@/lib/db"
import { Order } from "@/lib/models/Order"
import { ParcelScan } from "@/lib/models/ParcelScan"
import { scanSchema } from "@/lib/validators"
import { decideRemiseExisting, decideReturnReceive } from "@/lib/scan-engine"
import { navexService } from "@/lib/navex/navex-client"
import { mapToSimpleNavexStatus } from "@/lib/navex/navex-status.mapper"

const SCAN_ROLES = ["SUPER_ADMIN", "ADMIN", "MANAGER", "WAREHOUSE_OPERATOR"]
const OVERRIDE_ROLES = ["SUPER_ADMIN", "ADMIN"]

function parcelInfo(p: any) {
  return {
    id: String(p._id),
    navexTrackingCode: p.navexTrackingCode,
    customerName: p.customer?.name || "",
    customerPhone: p.customer?.phone || "",
    customerAddress: p.customer?.address || "",
    city: p.customer?.city || "",
    governorate: p.customer?.governorate || "",
    codAmount: p.codAmount,
    designation: p.designation || "",
    navexCreatedAt: p.navexCreatedAt,
    navexStatus: p.navexStatus,
    physicalStatus: p.physicalStatus,
    handedToNavexAt: p.handedToNavexAt,
    returnExpectedAt: p.returnExpectedAt,
    returnConfirmedAt: p.returnConfirmedAt,
  }
}

/**
 * Physical barcode scan endpoint.
 *
 * Modes:
 *  - HANDOVER_PREP  : "Remise à Navex". Look up locally; if absent, fetch REAL
 *                     data from Navex and register the parcel as HANDED_TO_NAVEX.
 *                     If Navex doesn't know the code, NOTHING is created.
 *  - RETURN_RECEIVE : "Retour reçu" → RETURN_CONFIRMED (requires Navex = RETURN).
 *  - VERIFY         : read-only lookup.
 *
 * A scan NEVER fabricates empty/placeholder parcels.
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Non authentifié" } }, { status: 401 })
  }
  const role = session.user.role as string
  if (!SCAN_ROLES.includes(role)) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Accès refusé" } }, { status: 403 })
  }

  await connectDB()

  const parsed = scanSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0].message } }, { status: 400 })
  }

  const { mode, override, overrideReason, stationName } = parsed.data
  const trackingCode = parsed.data.trackingCode.trim().replace(/[\r\n]+$/g, "").trim()

  async function log(result: string, parcelId: any, message?: string, didOverride = false) {
    try {
      await ParcelScan.create({
        parcelId: parcelId || undefined, navexTrackingCode: trackingCode, mode, result,
        override: didOverride, overrideReason: didOverride ? overrideReason : undefined,
        message, operatorId: session!.user.id, stationName,
      })
    } catch { /* best-effort */ }
  }
  function reject(code: string, message: string, parcel?: any) {
    return NextResponse.json({ success: false, result: code, error: { code, message }, parcel: parcel ? parcelInfo(parcel) : undefined })
  }

  try {
    const existing = await Order.findOne({ navexTrackingCode: trackingCode })

    // ---------------- VERIFY ----------------
    if (mode === "VERIFY") {
      if (!existing) {
        await log("UNKNOWN", null, "Colis introuvable")
        return reject("UNKNOWN", "Code Navex introuvable. Ce colis n'a pas encore été scanné.")
      }
      await log("OK", existing._id, "Vérification")
      return NextResponse.json({ success: true, result: "OK", parcel: parcelInfo(existing) })
    }

    // ---------------- RETURN_RECEIVE ----------------
    if (mode === "RETURN_RECEIVE") {
      if (!existing) {
        await log("UNKNOWN", null, "Colis introuvable")
        return reject("UNKNOWN", "Code Navex introuvable. Ce colis n'a jamais été remis à Navex.")
      }
      const decision = decideReturnReceive(existing, { override, canOverride: OVERRIDE_ROLES.includes(role) })
      if (!decision.ok) {
        await log(decision.result, existing._id, decision.message)
        return reject(decision.code, decision.message, existing)
      }
      const didOverride = decision.result === "OVERRIDE"
      decision.mutate?.(existing)
      existing.returnConfirmedBy = session.user.id as any
      await existing.save()
      await log(decision.result, existing._id, decision.message, didOverride)
      return NextResponse.json({ success: true, result: decision.result, parcel: parcelInfo(existing) })
    }

    // ---------------- HANDOVER_PREP (Remise à Navex) ----------------
    if (existing) {
      const decision = decideRemiseExisting(existing)
      await log(decision.result, existing._id, decision.message)
      return reject(decision.code, decision.message, existing)
    }

    // Not local → fetch real data from Navex
    const lookup = await navexService.getParcelByTrackingCode(trackingCode)
    if (!lookup.configured) {
      await log("BLOCKED", null, "Navex lookup non configuré")
      return reject("NOT_CONFIGURED", "Navex lookup endpoint non configuré. Configurez-le dans Paramètres.")
    }
    if (!lookup.found || !lookup.parcel) {
      await log("UNKNOWN", null, "Code introuvable chez Navex")
      return reject("UNKNOWN", "Code Navex introuvable chez Navex. Aucun colis n'a été créé.")
    }

    const d = lookup.parcel
    const created = await Order.create({
      externalOrderId: `NAVEX-${trackingCode}`,
      navexTrackingCode: trackingCode,
      customer: { name: d.clientName, phone: d.clientPhone, governorate: d.governorate, city: d.city, address: d.clientAddress },
      designation: d.designation,
      codAmount: d.codAmount,
      navexCreatedAt: d.navexCreatedAt ? new Date(d.navexCreatedAt) : undefined,
      physicalStatus: "HANDED_TO_NAVEX",
      handedToNavexAt: new Date(),
      navexStatus: mapToSimpleNavexStatus(d.navexStatusRaw),
      navexRawStatus: d.navexStatusRaw,
      scannedBy: session.user.id,
      isDemo: false,
    })
    await log("OK", created._id, "Colis remis à Navex")
    return NextResponse.json({ success: true, result: "OK", parcel: parcelInfo(created) })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "SCAN_ERROR", message: error.message || "Erreur lors du scan" } }, { status: 500 })
  }
}

// Recent scans for the scanner side panel
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ success: false, error: "Non authentifié" }, { status: 401 })
  await connectDB()
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get("mode") || undefined
  const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100)
  const filter: any = {}
  if (mode) filter.mode = mode
  const scans = await ParcelScan.find(filter).sort({ createdAt: -1 }).limit(limit).lean()
  return NextResponse.json({ success: true, data: scans })
}
