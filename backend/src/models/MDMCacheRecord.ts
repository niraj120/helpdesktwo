import mongoose, { Document, Schema } from "mongoose";

export interface IMDMCacheRecord extends Document {
  sourceId: mongoose.Types.ObjectId;
  projectIds: mongoose.Types.ObjectId[];
  datasetKey: string;
  externalId: string;
  raw: any;
  selected: Map<string, string>;
  searchableText: string;
  sourceUpdatedAt?: Date;
  lastSyncedAt: Date;
  syncJobId?: mongoose.Types.ObjectId;
}

const mdmCacheRecordSchema = new Schema<IMDMCacheRecord>(
  {
    sourceId: {
      type: Schema.Types.ObjectId,
      ref: "MDMSource",
      required: true,
      index: true,
    },
    projectIds: [{ type: Schema.Types.ObjectId, ref: "Project", index: true }],
    datasetKey: { type: String, required: true, trim: true, index: true },
    externalId: { type: String, required: true, trim: true },
    raw: { type: Schema.Types.Mixed, default: {} },
    selected: { type: Map, of: String, default: {} },
    searchableText: { type: String, default: "", index: true },
    sourceUpdatedAt: { type: Date },
    lastSyncedAt: { type: Date, default: Date.now },
    syncJobId: { type: Schema.Types.ObjectId, ref: "MDMSyncJob" },
  },
  { timestamps: true },
);

mdmCacheRecordSchema.index(
  { sourceId: 1, datasetKey: 1, externalId: 1 },
  { unique: true },
);
mdmCacheRecordSchema.index({
  sourceId: 1,
  datasetKey: 1,
  searchableText: "text",
});

export default mongoose.model<IMDMCacheRecord>(
  "MDMCacheRecord",
  mdmCacheRecordSchema,
);
