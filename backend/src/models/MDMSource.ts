import mongoose, { Schema, Document } from "mongoose";
import { encrypt, decrypt, isEncrypted } from "../utils/encryption";

/**
 * MDM (Master Data Management) Source
 *
 * The company's master database is exposed through one or more external REST
 * APIs. An MDMSource groups those endpoints (schools, employees, principals,
 * students, …) under a single named, company-wide configuration.
 *
 * SCOPE: GLOBAL — no projectId. There is one shared set of MDM sources used by
 * every tenant. Data fetched through a source is tagged with the source id so
 * the team always knows which MDM the data came from (provenance).
 *
 * Secrets in `auth` are encrypted at rest (aes-256-gcm) via the shared
 * encryption util — same pattern as WhatsAppConfig / ProjectEmailConfig.
 */

/**
 * MDMDataType is intentionally a free-text string so admins can register any
 * domain entity (schools, parents, students, fee_records, custom, …) without
 * code changes. The legacy enum values are kept here as documentation only.
 *
 * Legacy values: "schools" | "employees" | "principals" | "students" |
 *                "parents" | "children" | "custom"
 */
export type MDMDataType = string;

export type MDMAuthType = "none" | "apiKey" | "bearer" | "basic";

export interface IMDMApi {
  label: string;              // Human label e.g. "Employee Directory"
  dataType: MDMDataType;      // Free-text entity type configured by admin
  method: "GET" | "POST";
  baseUrl: string;            // e.g. https://mdm.company.com
  path: string;               // e.g. /api/v1/employees
  requestBody?: string;       // Optional JSON body for POST endpoints
  isDefaultForType: boolean;  // Use this api when a dataType is requested without an explicit api
  projectIds: mongoose.Types.ObjectId[]; // Projects this endpoint serves. Empty = all projects (global).
}

export interface IMDMAuth {
  type: MDMAuthType;
  apiKey?: string; // encrypted
  token?: string; // encrypted (bearer)
  username?: string;
  password?: string; // encrypted (basic)
  headerName?: string; // header to carry apiKey, default X-API-Key
  extraHeaders?: Record<string, string>; // arbitrary static headers
}

export type MDMCacheIncrementalMode =
  | "full"
  | "count"
  | "latest_id"
  | "updated_at";

/**
 * Pagination config for APIs that return data in pages rather than a single array.
 */
export interface IMDMDatasetPagination {
  /** Pagination strategy for the API. */
  type: "page" | "offset" | "cursor" | "none";
  /** Query param name for the page number or offset (e.g. "page", "offset"). */
  pageParam: string;
  /** Query param name for the page size (e.g. "limit", "perPage"). */
  limitParam: string;
  /** Number of records per page to request. */
  pageSize: number;
  /** For cursor-based: dot-notation path in the response that holds the next cursor value. */
  nextCursorPath?: string;
  /** For cursor-based: query param to pass the cursor value. */
  cursorParam?: string;
}

export interface IMDMCacheDataset {
  key: string;
  label: string;
  sourceId?: mongoose.Types.ObjectId;
  apiIndex: number;
  enabled: boolean;
  uniqueKeyField: string;
  displayField?: string;
  searchFields: string[];
  storedFields: string[];
  /**
   * Dot-notation path to extract the records array from the API response.
   * E.g. "data.results", "response.items", "payload.data.list".
   * If empty the service falls back to heuristic array detection.
   */
  responsePath?: string;
  /** Pagination config. If omitted or type=none, fetches a single response. */
  pagination?: IMDMDatasetPagination;
  incremental: {
    mode: MDMCacheIncrementalMode;
    countPath?: string;
    latestIdField?: string;
    updatedAtField?: string;
  };
  schedule: {
    enabled: boolean;
    cron: string;
  };
}

export interface IMDMCacheJoinConfig {
  key: string;
  label: string;
  enabled: boolean;
  outputType: "parent_with_children" | "flat_join";
  parentDatasetKey: string;
  mappingDatasetKey: string;
  studentDatasetKey: string;
  parentKeyField: string;
  mappingParentKeyField: string;
  mappingStudentKeyField: string;
  studentKeyField: string;
  parentStoredFields: string[];
  childStoredFields: string[];
  datasets?: Array<{ datasetKey: string; label: string }>;
  joinSteps?: Array<{
    leftDatasetKey: string;
    rightDatasetKey: string;
    leftKey: string;
    rightKey: string;
    keyPairs?: Array<{ leftKey: string; rightKey: string }>;
  }>;
  outputFields?: string[];
  searchFields?: string[];
  valueField?: string;
}

export interface IMDMCacheConfig {
  enabled: boolean;
  datasets: IMDMCacheDataset[];
  joins: IMDMCacheJoinConfig[];
}

export interface IMDMSource extends Document {
  name: string;
  description?: string;
  enabled: boolean;
  apis: IMDMApi[];
  auth: IMDMAuth;
  cache: IMDMCacheConfig;
  /** Scheduled refresh of existing Users' details (active/inactive + profile) from this source. */
  userSync?: {
    enabled: boolean;
    cron: string;
    statusField?: string; // MDM field holding active/inactive value
    activeValues?: string[]; // values that mean "active" (case-insensitive)
    updateProfile?: boolean; // also refresh name/dept/designation/mobile
  };

  connectionStatus: "connected" | "error" | "untested";
  lastConnectionTest?: Date;
  lastConnectionError?: string;
  failedAttempts: number;

  createdAt: Date;
  updatedAt: Date;

  getDecryptedAuth(): IMDMAuth;
}

const mdmApiSchema = new Schema<IMDMApi>(
  {
    label: { type: String, required: true, trim: true },
    // dataType is now a free-text string — no enum restriction
    dataType: { type: String, default: "custom", trim: true },
    method: { type: String, enum: ["GET", "POST"], default: "GET" },
    baseUrl: { type: String, required: true, trim: true },
    path: { type: String, default: "", trim: true },
    requestBody: { type: String, default: "" },
    isDefaultForType: { type: Boolean, default: false },
    projectIds: [{ type: Schema.Types.ObjectId, ref: "Project" }],
  },
  { _id: false },
);

const mdmAuthSchema = new Schema<IMDMAuth>(
  {
    type: {
      type: String,
      enum: ["none", "apiKey", "bearer", "basic"],
      default: "none",
    },
    apiKey: { type: String, default: "" }, // encrypted
    token: { type: String, default: "" }, // encrypted
    username: { type: String, default: "" },
    password: { type: String, default: "" }, // encrypted
    headerName: { type: String, default: "X-API-Key" },
    extraHeaders: { type: Map, of: String, default: {} },
  },
  { _id: false },
);

const mdmCacheDatasetSchema = new Schema<IMDMCacheDataset>(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, default: "", trim: true },
    sourceId: { type: Schema.Types.ObjectId, ref: "MDMSource" },
    apiIndex: { type: Number, required: true, min: 0 },
    enabled: { type: Boolean, default: true },
    uniqueKeyField: { type: String, required: true, trim: true },
    displayField: { type: String, default: "", trim: true },
    searchFields: { type: [String], default: [] },
    storedFields: { type: [String], default: [] },
    // Dot-notation JSON path to the records array in the API response.
    // E.g. "data.results", "response.list". Empty = heuristic detection.
    responsePath: { type: String, default: "", trim: true },
    // Optional pagination config for APIs that don't return all records in one response.
    pagination: {
      type: {
        type: String,
        enum: ["page", "offset", "cursor", "none"],
        default: "none",
      },
      pageParam: { type: String, default: "page", trim: true },
      limitParam: { type: String, default: "limit", trim: true },
      pageSize: { type: Number, default: 100 },
      nextCursorPath: { type: String, default: "", trim: true },
      cursorParam: { type: String, default: "", trim: true },
    },
    incremental: {
      mode: {
        type: String,
        enum: ["full", "count", "latest_id", "updated_at"],
        default: "full",
      },
      countPath: { type: String, default: "", trim: true },
      latestIdField: { type: String, default: "", trim: true },
      updatedAtField: { type: String, default: "", trim: true },
    },
    schedule: {
      enabled: { type: Boolean, default: false },
      cron: { type: String, default: "0 2 * * *", trim: true },
    },
  },
  { _id: false },
);

const mdmCacheJoinSchema = new Schema<IMDMCacheJoinConfig>(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, default: "", trim: true },
    enabled: { type: Boolean, default: true },
    outputType: {
      type: String,
      enum: ["parent_with_children", "flat_join"],
      default: "parent_with_children",
    },
    parentDatasetKey: { type: String, required: true, trim: true },
    mappingDatasetKey: { type: String, required: true, trim: true },
    studentDatasetKey: { type: String, required: true, trim: true },
    parentKeyField: { type: String, required: true, trim: true },
    mappingParentKeyField: { type: String, required: true, trim: true },
    mappingStudentKeyField: { type: String, required: true, trim: true },
    studentKeyField: { type: String, required: true, trim: true },
    parentStoredFields: { type: [String], default: [] },
    childStoredFields: { type: [String], default: [] },
    datasets: {
      type: [
        new Schema(
          {
            datasetKey: { type: String, required: true, trim: true },
            label: { type: String, default: "", trim: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    joinSteps: {
      type: [
        new Schema(
          {
            leftDatasetKey: { type: String, required: true, trim: true },
            rightDatasetKey: { type: String, required: true, trim: true },
            leftKey: { type: String, required: true, trim: true },
            rightKey: { type: String, required: true, trim: true },
            keyPairs: {
              type: [
                new Schema(
                  {
                    leftKey: { type: String, required: true, trim: true },
                    rightKey: { type: String, required: true, trim: true },
                  },
                  { _id: false },
                ),
              ],
              default: [],
            },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    outputFields: { type: [String], default: [] },
    searchFields: { type: [String], default: [] },
    valueField: { type: String, default: "", trim: true },
  },
  { _id: false },
);

const mdmCacheConfigSchema = new Schema<IMDMCacheConfig>(
  {
    enabled: { type: Boolean, default: false },
    datasets: { type: [mdmCacheDatasetSchema], default: [] },
    joins: { type: [mdmCacheJoinSchema], default: [] },
  },
  { _id: false },
);

const mdmSourceSchema = new Schema<IMDMSource>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, default: "" },
    enabled: { type: Boolean, default: true },
    apis: { type: [mdmApiSchema], default: [] },
    auth: { type: mdmAuthSchema, default: () => ({}) },
    cache: {
      type: mdmCacheConfigSchema,
      default: () => ({ enabled: false, datasets: [], joins: [] }),
    },
    userSync: {
      type: new Schema(
        {
          enabled: { type: Boolean, default: false },
          cron: { type: String, default: "0 3 * * *" },
          statusField: { type: String, default: "" },
          activeValues: { type: [String], default: [] },
          updateProfile: { type: Boolean, default: true },
        },
        { _id: false },
      ),
      default: () => ({ enabled: false, cron: "0 3 * * *", updateProfile: true }),
    },

    connectionStatus: {
      type: String,
      enum: ["connected", "error", "untested"],
      default: "untested",
    },
    lastConnectionTest: { type: Date },
    lastConnectionError: { type: String, default: "" },
    failedAttempts: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// Encrypt secrets on save (only if changed and not already encrypted)
mdmSourceSchema.pre("save", function (next) {
  try {
    const auth: any = this.auth || {};
    for (const field of ["apiKey", "token", "password"] as const) {
      const val = auth[field];
      if (val && this.isModified("auth") && !isEncrypted(val)) {
        auth[field] = encrypt(val);
      }
    }
    next();
  } catch (error) {
    next(error as Error);
  }
});

mdmSourceSchema.methods.getDecryptedAuth = function (): IMDMAuth {
  const auth: any = (this.auth && (this.auth as any).toObject)
    ? (this.auth as any).toObject()
    : { ...this.auth };
  const out: any = {
    type: auth.type || "none",
    username: auth.username || "",
    headerName: auth.headerName || "X-API-Key",
    extraHeaders:
      auth.extraHeaders instanceof Map
        ? Object.fromEntries(auth.extraHeaders)
        : auth.extraHeaders || {},
  };
  for (const field of ["apiKey", "token", "password"] as const) {
    const val = auth[field];
    out[field] = val && isEncrypted(val) ? decrypt(val) : val || "";
  }
  return out as IMDMAuth;
};

export default mongoose.model<IMDMSource>("MDMSource", mdmSourceSchema);
