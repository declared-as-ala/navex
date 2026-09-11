import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { connectDB, connectArchiveDB } from "@/lib/db"
import { Order } from "@/lib/models/Order"
import { ParcelScan } from "@/lib/models/ParcelScan"
import { AuditLog } from "@/lib/models/AuditLog"
import { getArchiveOrderModel } from "@/lib/models/ArchiveOrder"
import { getArchiveParcelScanModel } from "@/lib/models/ArchiveParcelScan"

export async function POST() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "Non authentifié" }, { status: 401 })
  }

  const role = session.user.role as string
  if (role !== "SUPER_ADMIN" && role !== "ADMIN") {
    return NextResponse.json({ success: false, error: "Accès refusé" }, { status: 403 })
  }

  await connectDB()
  const archiveConn = await connectArchiveDB()

  const ArchiveOrder = getArchiveOrderModel(archiveConn)
  const ArchiveParcelScan = getArchiveParcelScanModel(archiveConn)

  const now = new Date()

  const orders = await Order.find({}).lean()
  const scans = await ParcelScan.find({}).lean()

  if (orders.length === 0) {
    return NextResponse.json({ success: true, message: "Aucune donnée à archiver", archived: { orders: 0, scans: 0 } })
  }

  if (orders.length > 0) {
    const archiveOrders = orders.map((o) => ({
      ...o,
      _id: undefined,
      archivedAt: now,
    }))
    await ArchiveOrder.insertMany(archiveOrders, { ordered: false }).catch(() => {})
  }

  if (scans.length > 0) {
    const archiveScans = scans.map((s) => ({
      ...s,
      _id: undefined,
      archivedAt: now,
    }))
    await ArchiveParcelScan.insertMany(archiveScans, { ordered: false }).catch(() => {})
  }

  await Order.deleteMany({})
  await ParcelScan.deleteMany({})

  await AuditLog.create({
    userId: session.user.id,
    action: "ARCHIVE_AND_RESET",
    entityType: "SYSTEM",
    after: { ordersArchived: orders.length, scansArchived: scans.length, archivedAt: now },
    isDemo: false,
  })

  return NextResponse.json({
    success: true,
    data: {
      archivedAt: now.toISOString(),
      ordersArchived: orders.length,
      scansArchived: scans.length,
      message: "Données archivées et réinitialisées avec succès",
    },
  })
}

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "Non authentifié" }, { status: 401 })
  }

  await connectDB()

  const orderCount = await Order.countDocuments()
  const scanCount = await ParcelScan.countDocuments()

  let archiveOrderCount = 0
  let archiveScanCount = 0
  try {
    const archiveConn = await connectArchiveDB()
    const ArchiveOrder = getArchiveOrderModel(archiveConn)
    const ArchiveParcelScan = getArchiveParcelScanModel(archiveConn)
    archiveOrderCount = await ArchiveOrder.countDocuments()
    archiveScanCount = await ArchiveParcelScan.countDocuments()
  } catch {
    // Archive DB not configured yet
  }

  return NextResponse.json({
    success: true,
    data: {
      current: { orders: orderCount, scans: scanCount },
      archive: { orders: archiveOrderCount, scans: archiveScanCount },
    },
  })
}
