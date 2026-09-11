import { Schema, Document, Connection } from "mongoose"

export interface IArchiveParcelScan extends Document {
  parcelId?: any
  navexTrackingCode: string
  mode: string
  result: string
  override: boolean
  overrideReason?: string
  message?: string
  operatorId?: any
  stationName?: string
  isDemo?: boolean
  createdAt: Date
  updatedAt: Date
  archivedAt: Date
}

const ArchiveParcelScanSchema = new Schema<IArchiveParcelScan>(
  {
    parcelId: { type: Schema.Types.Mixed },
    navexTrackingCode: { type: String, required: true, index: true },
    mode: { type: String, enum: ["HANDOVER_PREP", "RETURN_RECEIVE", "VERIFY"], required: true },
    result: { type: String, enum: ["OK", "DUPLICATE", "UNKNOWN", "BLOCKED", "OVERRIDE"], required: true },
    override: { type: Boolean, default: false },
    overrideReason: { type: String },
    message: { type: String },
    operatorId: { type: Schema.Types.Mixed },
    stationName: { type: String },
    isDemo: { type: Boolean, default: false },
    archivedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: "parcelscans" }
)

ArchiveParcelScanSchema.index({ navexTrackingCode: 1 })
ArchiveParcelScanSchema.index({ mode: 1, createdAt: -1 })

export function getArchiveParcelScanModel(conn: Connection) {
  return conn.models.ArchiveParcelScan || conn.model<IArchiveParcelScan>("ArchiveParcelScan", ArchiveParcelScanSchema)
}
