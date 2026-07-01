import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { connectDB } from "@/lib/db"
import { Order } from "@/lib/models/Order"

const ALLOWED_ROLES = ["SUPER_ADMIN", "ADMIN", "MANAGER"]

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ success: false, error: "Non authentifié" }, { status: 401 })
  if (!ALLOWED_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ success: false, error: "Accès refusé" }, { status: 403 })
  }

  await connectDB()
  const { id } = await params

  const parcel = await Order.findById(id)
  if (!parcel) return NextResponse.json({ success: false, error: "Colis introuvable" }, { status: 404 })

  const body = await req.json()
  const allowedFields = ["codAmount", "productSummary"] as const
  for (const key of allowedFields) {
    if (body[key] !== undefined) (parcel as any)[key] = body[key]
  }
  if (body.customer) {
    for (const k of ["name", "phone", "governorate", "city", "address"] as const) {
      if (body.customer[k] !== undefined) parcel.customer[k] = body.customer[k]
    }
  }

  await parcel.save()
  return NextResponse.json({ success: true, parcel: parcel.toObject() })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ success: false, error: "Non authentifié" }, { status: 401 })
  if (!ALLOWED_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ success: false, error: "Accès refusé" }, { status: 403 })
  }

  await connectDB()
  const { id } = await params

  const parcel = await Order.findByIdAndDelete(id)
  if (!parcel) return NextResponse.json({ success: false, error: "Colis introuvable" }, { status: 404 })

  return NextResponse.json({ success: true })
}
