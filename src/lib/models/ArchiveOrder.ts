import { Schema, Document, Connection } from "mongoose"

export interface IArchiveOrder extends Document {
  navexTrackingCode: string
  codAmount: number
  designation?: string
  navexCreatedAt?: Date
  status: string
  navexRawStatus?: string
  handedToNavexAt?: Date
  paidAt?: Date
  returnAt?: Date
  lastNavexSyncAt?: Date
  scannedBy?: any
  returnBy?: any
  createdAt: Date
  updatedAt: Date
  archivedAt: Date
}

const ArchiveOrderSchema = new Schema<IArchiveOrder>(
  {
    navexTrackingCode: { type: String, required: true, index: true },
    codAmount: { type: Number, required: true, min: 0 },
    designation: { type: String },
    navexCreatedAt: { type: Date },
    status: { type: String, enum: ["EN_COURS", "PAYE", "RETOUR"] },
    navexRawStatus: { type: String },
    handedToNavexAt: { type: Date },
    paidAt: { type: Date },
    returnAt: { type: Date },
    lastNavexSyncAt: { type: Date },
    scannedBy: { type: Schema.Types.Mixed },
    returnBy: { type: Schema.Types.Mixed },
    archivedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: "orders" }
)

ArchiveOrderSchema.index({ status: 1 })
ArchiveOrderSchema.index({ handedToNavexAt: -1 })

export function getArchiveOrderModel(conn: Connection) {
  return conn.models.ArchiveOrder || conn.model<IArchiveOrder>("ArchiveOrder", ArchiveOrderSchema)
}
