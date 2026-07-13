import mongoose, { Schema, Document } from "mongoose";

// ---------------------------------------------------------------------------
// PSR Pipeline Config — data model
//
// Represents a named, admin-configured data pipeline that:
//  • pulls from one or more external REST sources
//  • joins / filters / transforms rows according to ordered steps
//  • writes the composed documents to a named MongoDB collection
//  • is queried at search time via the generic /api/psr/search endpoint
//
// SCOPE: GLOBAL (no projectId). One set of pipelines, all projects share.
// ---------------------------------------------------------------------------

// ─── Auth ────────────────────────────────────────────────────────────────────

export type PsrAuthType = "none" | "bearer" | "apikey" | "basic";

export interface IPsrAuth {
  type: PsrAuthType;
  /**
   * REFERENCE ONLY — never a raw credential.
   * Format: "env:MY_API_KEY"  |  "vault:secret/path"
   * Resolved at execution time by the worker; never returned in API responses.
   */
  secretRef?: string;
  headerName?: string; // for apikey — default "X-API-Key"
  username?: string; // for basic — password is in secretRef
  extraHeaders?: Record<string, string>;
}

// ─── Pagination ──────────────────────────────────────────────────────────────

export type PaginationType = "page" | "offset" | "cursor" | "none";

export interface IPsrPagination {
  type: PaginationType;
  pageParam?: string;
  pageSizeParam?: string;
  pageSize?: number;
  offsetParam?: string;
  totalPath?: string; // JSON path to total record count in response
  nextCursorPath?: string;
  cursorParam?: string;
  // For incremental/CDC:
  modifiedSinceParam?: string; // query param to pass the watermark
  modifiedSinceField?: string; // field in the root response that holds the record's updated-at
}

// ─── BulkLookup ──────────────────────────────────────────────────────────────

export type BulkLookupStyle = "query-csv" | "body-array" | "repeat-param";

export interface IBulkLookup {
  supported: boolean;
  param?: string;
  style?: BulkLookupStyle;
  maxIds?: number; // batch cap; default unlimited
}

// ─── Source ──────────────────────────────────────────────────────────────────

export interface IPsrSource {
  key: string; // unique within pipeline, e.g. "s1" — ^[a-z][a-z0-9_]*$
  name: string;
  method: "GET" | "POST";
  baseUrl: string;
  path?: string; // appended to baseUrl
  requestBody?: string; // JSON string for POST endpoints
  auth: IPsrAuth;
  pagination: IPsrPagination;
  responsePath: string; // dot-notation path to the rows array in the response
  primaryKey: string; // unique key field on each row
  bulkLookup: IBulkLookup;
  discoveredColumns: string[]; // auto-populated by Test & Discover (US-1.3)
  fullOnly?: boolean; // true if source lacks CDC/modified-since support
  /** US-5.5 rate limiting */
  rateLimit?: {
    maxRequestsPerSecond?: number; // 0 = unlimited
  };
}

// ─── Steps ───────────────────────────────────────────────────────────────────

export interface IRootStep {
  op: "root";
  source: string; // source key
}

export interface ILookupStep {
  op: "lookup";
  source: string; // source key to join
  matchLeft: string; // field on the current row
  matchRight: string; // field on the right-side source
  pick: string[]; // fields to carry from the right side
  embedAs?: string; // if set, embed matched rows as an array under this key
  cardinality: "one" | "many";
  // Advanced: multi-key joins
  keyPairs?: Array<{ leftKey: string; rightKey: string }>;
}

export interface IFilterStep {
  op: "filter";
  condition: string; // restricted expression — validated at save, sandboxed at run
}

export interface IMapStep {
  op: "map";
  set: Record<string, string>; // output field → expression
  onError?: "skip" | "null" | "fail-run"; // default "null"
}

export interface IRenameStep {
  op: "rename";
  map: Record<string, string>; // sourceField → outputField
}

export type IPsrStep =
  | IRootStep
  | ILookupStep
  | IFilterStep
  | IMapStep
  | IRenameStep;

// ─── Output ──────────────────────────────────────────────────────────────────

export interface IOutputColumn {
  field: string;
  as?: string; // rename in stored document
}

export type SearchIndexType = "text" | "plain";

export interface ISearchIndex {
  field: string;
  type: SearchIndexType;
}

export interface IPsrOutput {
  keyField: string; // unique upsert key
  columns: IOutputColumn[]; // which fields to store
  searchIndexes: ISearchIndex[]; // which fields to index for search
}

// ─── Schedule ────────────────────────────────────────────────────────────────

export interface IPsrSchedule {
  enabled: boolean;
  incrementalEveryMinutes?: number;
  fullCron?: string; // cron expression for periodic full reconcile
  mode: "incremental" | "full";
}

// ─── Alert Config ────────────────────────────────────────────────────────────

export interface IPsrAlertConfig {
  enabled: boolean;
  failureThreshold?: number; // alert after N consecutive failed runs (default 3)
  stalenessHours?: number;   // alert when lastSyncedAt > N hours ago (default 24)
}

// ─── Pipeline ────────────────────────────────────────────────────────────────

export interface IPipelineConfig extends Document {
  name: string;
  targetCollection: string; // admin-named Mongo collection
  sources: IPsrSource[];
  steps: IPsrStep[];
  output: IPsrOutput;
  schedule: IPsrSchedule;
  alertConfig: IPsrAlertConfig;
  enabled: boolean;
  isRunnable: boolean; // computed: has root step + keyField defined
  lastSyncedAt?: Date;
  lastSyncedCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const PsrAuthSchema = new Schema<IPsrAuth>(
  {
    type: {
      type: String,
      enum: ["none", "bearer", "apikey", "basic"],
      default: "none",
    },
    secretRef: { type: String }, // "env:NAME" | "vault:path" — never raw
    headerName: { type: String },
    username: { type: String },
    extraHeaders: { type: Schema.Types.Mixed },
  },
  { _id: false },
);

const PsrPaginationSchema = new Schema<IPsrPagination>(
  {
    type: {
      type: String,
      enum: ["page", "offset", "cursor", "none"],
      default: "none",
    },
    pageParam: { type: String },
    pageSizeParam: { type: String },
    pageSize: { type: Number },
    offsetParam: { type: String },
    totalPath: { type: String },
    nextCursorPath: { type: String },
    cursorParam: { type: String },
    modifiedSinceParam: { type: String },
    modifiedSinceField: { type: String },
  },
  { _id: false },
);

const BulkLookupSchema = new Schema<IBulkLookup>(
  {
    supported: { type: Boolean, default: false },
    param: { type: String },
    style: { type: String, enum: ["query-csv", "body-array", "repeat-param"] },
    maxIds: { type: Number },
  },
  { _id: false },
);

const PsrSourceSchema = new Schema<IPsrSource>(
  {
    key: {
      type: String,
      required: true,
      match: [/^[a-z][a-z0-9_]*$/, "Source key must match ^[a-z][a-z0-9_]*$"],
    },
    name: { type: String, required: true },
    method: { type: String, enum: ["GET", "POST"], default: "GET" },
    baseUrl: { type: String, required: true },
    path: { type: String },
    requestBody: { type: String },
    auth: { type: PsrAuthSchema, default: () => ({ type: "none" }) },
    pagination: {
      type: PsrPaginationSchema,
      default: () => ({ type: "none" }),
    },
    responsePath: { type: String, default: "" },
    primaryKey: { type: String, default: "id" },
    bulkLookup: {
      type: BulkLookupSchema,
      default: () => ({ supported: false }),
    },
    discoveredColumns: [{ type: String }],
    fullOnly: { type: Boolean, default: false },
    rateLimit: {
      type: new Schema({ maxRequestsPerSecond: { type: Number } }, { _id: false }),
      default: () => ({}),
    },
  },
  { _id: false },
);

// Steps — stored as mixed to support the op-discriminated union without complex
// nested schemas. Validation of op-specific fields is done in the controller.
const StepSchema = new Schema({}, { _id: false, strict: false });

const OutputColumnSchema = new Schema<IOutputColumn>(
  {
    field: { type: String, required: true },
    as: { type: String },
  },
  { _id: false },
);

const SearchIndexSchema = new Schema<ISearchIndex>(
  {
    field: { type: String, required: true },
    type: { type: String, enum: ["text", "plain"], default: "plain" },
  },
  { _id: false },
);

const PsrOutputSchema = new Schema<IPsrOutput>(
  {
    keyField: { type: String, default: "" },
    columns: [OutputColumnSchema],
    searchIndexes: [SearchIndexSchema],
  },
  { _id: false },
);

const PsrScheduleSchema = new Schema<IPsrSchedule>(
  {
    enabled: { type: Boolean, default: false },
    incrementalEveryMinutes: { type: Number },
    fullCron: { type: String },
    mode: { type: String, enum: ["incremental", "full"], default: "full" },
  },
  { _id: false },
);

const PsrAlertConfigSchema = new Schema<IPsrAlertConfig>(
  {
    enabled: { type: Boolean, default: true },
    failureThreshold: { type: Number, default: 3 },
    stalenessHours: { type: Number, default: 24 },
  },
  { _id: false },
);

const PipelineConfigSchema = new Schema<IPipelineConfig>(
  {
    name: { type: String, required: true, trim: true },
    targetCollection: {
      type: String,
      required: true,
      trim: true,
      match: [/^[a-zA-Z][a-zA-Z0-9_]*$/, "Invalid collection name"],
    },
    sources: [PsrSourceSchema],
    steps: [StepSchema],
    output: {
      type: PsrOutputSchema,
      default: () => ({ keyField: "", columns: [], searchIndexes: [] }),
    },
    schedule: {
      type: PsrScheduleSchema,
      default: () => ({ enabled: false, mode: "full" }),
    },
    alertConfig: {
      type: PsrAlertConfigSchema,
      default: () => ({ enabled: true, failureThreshold: 3, stalenessHours: 24 }),
    },
    enabled: { type: Boolean, default: true },
    isRunnable: { type: Boolean, default: false },
    lastSyncedAt: { type: Date },
    lastSyncedCount: { type: Number },
  },
  { timestamps: true },
);

// Compute isRunnable before save
PipelineConfigSchema.pre("save", function (next) {
  const hasRoot = this.steps?.some((s: any) => s.op === "root");
  const hasKeyField = !!this.output?.keyField;
  this.isRunnable = hasRoot && hasKeyField;
  next();
});

// Guard: targetCollection must not clash with system collections
const SYSTEM_COLLECTIONS = new Set([
  "users",
  "roles",
  "permissions",
  "projects",
  "tickets",
  "categories",
  "statuses",
  "priorities",
  "mdmsources",
  "mdmcacherecords",
  "mdmcachejoins",
  "mdmsyncjobs",
  "psrpipelineconfigs",
  "psrsyncruns",
]);

PipelineConfigSchema.pre("save", function (next) {
  if (SYSTEM_COLLECTIONS.has(this.targetCollection.toLowerCase())) {
    return next(
      new Error(
        `targetCollection "${this.targetCollection}" clashes with a system collection.`,
      ),
    );
  }
  next();
});

export default mongoose.model<IPipelineConfig>(
  "PsrPipelineConfig",
  PipelineConfigSchema,
  "psrpipelineconfigs",
);
