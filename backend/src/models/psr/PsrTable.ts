import mongoose, { Schema, Document } from "mongoose";

/**
 * PSR Table — a saved search table built from one or more masters.
 *
 * The admin calls this a "Table" (e.g. "Parent search").
 * Internally it holds the master refs, link config, and column selection.
 * When saved, a background worker fills it so search is fast.
 *
 * The `targetCollection` is the MongoDB collection that holds the filled rows.
 * When the table is saved, a PipelineConfig is created/updated to drive the sync.
 */

export interface ITableLink {
  leftMasterId: string;
  leftColumn: string;      // e.g. "parentId"
  rightMasterId: string;
  rightColumn: string;     // e.g. "parentId"
}

export interface ITableColumn {
  masterId: string;
  field: string;           // e.g. "name"
  as: string;              // display name e.g. "Parent name"
  searchable: boolean;     // true → gets a DB index
}

export type PsrTableStatus = "idle" | "refreshing" | "error" | "empty";

export interface IPsrSyncSchedule {
  enabled: boolean;
  intervalMinutes: number; // 0 = manual only; 15, 30, 60, 360, 1440
}

export interface IPsrTable extends Document {
  name: string;
  masterIds: mongoose.Types.ObjectId[];
  links: ITableLink[];
  columns: ITableColumn[];
  keyColumn?: string;             // e.g. "parentId" — the unique key for upserts
  targetCollection: string;       // MongoDB collection name
  pipelineConfigId?: string;
  status: PsrTableStatus;
  syncSchedule: IPsrSyncSchedule;
  /** Incremental sync: track the watermark (updatedAt of the last processed record) */
  lastSyncWatermark?: Date;       // watermark for incremental — set after each run
  syncMode: "full" | "incremental"; // full on first run, incremental after
  lastRefreshedAt?: Date;
  rowCount?: number;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TableLinkSchema = new Schema<ITableLink>(
  {
    leftMasterId: { type: String, required: true },
    leftColumn: { type: String, required: true },
    rightMasterId: { type: String, required: true },
    rightColumn: { type: String, required: true },
  },
  { _id: false },
);

const TableColumnSchema = new Schema<ITableColumn>(
  {
    masterId: { type: String, required: true },
    field: { type: String, required: true },
    as: { type: String, required: true },
    searchable: { type: Boolean, default: false },
  },
  { _id: false },
);

const PsrTableSchema = new Schema<IPsrTable>(
  {
    name: { type: String, required: true, trim: true },
    masterIds: [{ type: Schema.Types.ObjectId, ref: "PsrMaster" }],
    links: [TableLinkSchema],
    columns: [TableColumnSchema],
    keyColumn: { type: String },
    targetCollection: { type: String, required: true, trim: true },
    pipelineConfigId: { type: String },
    status: {
      type: String,
      enum: ["idle", "refreshing", "error", "empty"],
      default: "empty",
    },
    syncSchedule: {
      type: new Schema<IPsrSyncSchedule>(
        { enabled: { type: Boolean, default: false }, intervalMinutes: { type: Number, default: 0 } },
        { _id: false },
      ),
      default: () => ({ enabled: false, intervalMinutes: 0 }),
    },
    syncMode: { type: String, enum: ["full", "incremental"], default: "full" },
    lastSyncWatermark: { type: Date },
    lastRefreshedAt: { type: Date },
    rowCount: { type: Number },
    errorMessage: { type: String },
  },
  { timestamps: true },
);

// Guard: targetCollection must not clash with system collections
const SYSTEM_COLLECTIONS = new Set([
  "users", "roles", "permissions", "projects", "tickets",
  "psrmasters", "psrtables", "psrpipelineconfigs", "psrsyncruns",
]);

PsrTableSchema.pre("save", function (next) {
  if (SYSTEM_COLLECTIONS.has(this.targetCollection.toLowerCase())) {
    return next(new Error(`"${this.targetCollection}" is a reserved system collection.`));
  }
  next();
});

export default mongoose.model<IPsrTable>("PsrTable", PsrTableSchema, "psrtables");
