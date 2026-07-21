import mongoose, { Document, Schema } from "mongoose";

/**
 * Global (singleton) settings for audit-log archival to GCS. Only the
 * behavioural knobs live here — enable/disable and how many days of audit rows
 * stay "hot" in MongoDB before being moved to the bucket. The bucket name and
 * credentials stay in env (secrets), never in the DB / UI.
 *
 * One document per deployment; read/created via getAuditArchiveSettings().
 */
export interface IAuditArchiveSettings extends Document {
  /** Master on/off for automatic + manual archival. */
  enabled: boolean;
  /** Rows older than this many days are moved to GCS. */
  retentionDays: number;
  updatedBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IAuditArchiveSettings>(
  {
    enabled: { type: Boolean, default: false },
    retentionDays: { type: Number, default: 90, min: 1 },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

export const AuditArchiveSettings = mongoose.model<IAuditArchiveSettings>(
  "AuditArchiveSettings",
  schema,
);

/**
 * Fetch the singleton settings doc, creating it with defaults on first use.
 * Default retentionDays falls back to the AUDIT_HOT_RETENTION_DAYS env value if
 * present, else 90.
 */
export const getAuditArchiveSettings =
  async (): Promise<IAuditArchiveSettings> => {
    let doc = await AuditArchiveSettings.findOne();
    if (!doc) {
      const envDays = Number(process.env.AUDIT_HOT_RETENTION_DAYS);
      doc = await AuditArchiveSettings.create({
        enabled: false,
        retentionDays: Number.isFinite(envDays) && envDays > 0 ? envDays : 90,
      });
    }
    return doc;
  };

export default AuditArchiveSettings;
