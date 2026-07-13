import mongoose, { Document, Schema } from "mongoose";

export interface IMDMCacheJoin extends Document {
  sourceId: mongoose.Types.ObjectId;
  projectIds: mongoose.Types.ObjectId[];
  joinKey: string;
  parentExternalId: string;
  parent: any;
  children: any[];
  searchableText: string;
  lastBuiltAt: Date;
}

const mdmCacheJoinSchema = new Schema<IMDMCacheJoin>(
  {
    sourceId: {
      type: Schema.Types.ObjectId,
      ref: "MDMSource",
      required: true,
      index: true,
    },
    projectIds: [{ type: Schema.Types.ObjectId, ref: "Project", index: true }],
    joinKey: { type: String, required: true, trim: true, index: true },
    parentExternalId: { type: String, required: true, trim: true },
    parent: { type: Schema.Types.Mixed, default: {} },
    children: { type: [{ type: Schema.Types.Mixed }], default: [] },
    searchableText: { type: String, default: "", index: true },
    lastBuiltAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

mdmCacheJoinSchema.index(
  { sourceId: 1, joinKey: 1, parentExternalId: 1 },
  { unique: true },
);
mdmCacheJoinSchema.index({
  sourceId: 1,
  joinKey: 1,
  searchableText: "text",
});

export default mongoose.model<IMDMCacheJoin>(
  "MDMCacheJoin",
  mdmCacheJoinSchema,
);
