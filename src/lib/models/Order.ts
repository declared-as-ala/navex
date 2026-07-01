import mongoose, { Schema, Document } from "mongoose"

/**
 * Parcel (Colis) — the single canonical entity LogiFlow controls.
 *
 * A parcel exists in LogiFlow only AFTER it has been physically scanned at the
 * warehouse in "Remise à Navex" mode, at which point its real data is fetched
 * from Navex. Parcels are NEVER created with fake/empty data.
 *
 * Two independent status dimensions:
 *  - physicalStatus : where the physical package is, confirmed by warehouse scans
 *  - navexStatus    : the delivery status reported by Navex (announcement only)
 */

export type PhysicalStatus =
  | "NOT_SCANNED"
  | "HANDED_TO_NAVEX"   // physically scanned out → handed to Navex
  | "RETURN_EXPECTED"   // Navex announced a return (NOT physically back)
  | "RETURN_CONFIRMED"  // warehouse physically scanned the returned package

export type NavexStatus =
  | "PENDING"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "RETURN"
  | "UNKNOWN"

export const PHYSICAL_STATUSES: PhysicalStatus[] = [
  "NOT_SCANNED", "HANDED_TO_NAVEX", "RETURN_EXPECTED", "RETURN_CONFIRMED",
]
export const NAVEX_STATUSES: NavexStatus[] = [
  "PENDING", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "RETURN", "UNKNOWN",
]

export interface ICustomer {
  name: string
  phone: string
  governorate: string
  city: string
  address: string
}

export interface IOrder extends Document {
  externalOrderId: string
  navexTrackingCode: string
  navexLabelUrl?: string
  navexCreatedAt?: Date

  customer: ICustomer
  designation?: string
  codAmount: number

  physicalStatus: PhysicalStatus
  navexStatus: NavexStatus
  navexRawStatus?: string

  // lifecycle timestamps
  handedToNavexAt?: Date
  deliveredAt?: Date
  returnExpectedAt?: Date
  returnConfirmedAt?: Date
  lastNavexSyncAt?: Date

  scannedBy?: mongoose.Types.ObjectId
  returnConfirmedBy?: mongoose.Types.ObjectId

  isDemo?: boolean
  createdAt: Date
  updatedAt: Date
}

const CustomerSchema = new Schema<ICustomer>(
  {
    name: { type: String, default: "" },
    phone: { type: String, default: "" },
    governorate: { type: String, default: "" },
    city: { type: String, default: "" },
    address: { type: String, default: "" },
  },
  { _id: false }
)

const OrderSchema = new Schema<IOrder>(
  {
    externalOrderId: { type: String, required: true, unique: true },
    navexTrackingCode: { type: String, required: true, unique: true },
    navexLabelUrl: { type: String },
    navexCreatedAt: { type: Date },

    customer: { type: CustomerSchema, required: true },
    designation: { type: String },
    codAmount: { type: Number, required: true, min: 0 },

    physicalStatus: { type: String, enum: PHYSICAL_STATUSES, default: "HANDED_TO_NAVEX" },
    navexStatus: { type: String, enum: NAVEX_STATUSES, default: "PENDING" },
    navexRawStatus: { type: String },

    handedToNavexAt: { type: Date },
    deliveredAt: { type: Date },
    returnExpectedAt: { type: Date },
    returnConfirmedAt: { type: Date },
    lastNavexSyncAt: { type: Date },

    scannedBy: { type: Schema.Types.ObjectId, ref: "User" },
    returnConfirmedBy: { type: Schema.Types.ObjectId, ref: "User" },

    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true }
)

OrderSchema.index({ physicalStatus: 1 })
OrderSchema.index({ navexStatus: 1 })
OrderSchema.index({ "customer.phone": 1 })

export const Order = mongoose.models.Order || mongoose.model<IOrder>("Order", OrderSchema)

// Backwards-friendly alias: a parcel is the canonical unit of work.
export const Parcel = Order
