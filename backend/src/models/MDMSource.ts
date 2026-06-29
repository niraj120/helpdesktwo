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

export type MDMDataType =
  | "schools"
  | "employees"
  | "principals"
  | "students"
  | "parents"
  | "children"
  | "custom";

export type MDMAuthType = "none" | "apiKey" | "bearer" | "basic";

export interface IMDMApi {
  label: string; // Human label e.g. "Employee Directory"
  dataType: MDMDataType; // What kind of data this endpoint returns
  method: "GET" | "POST";
  baseUrl: string; // e.g. https://mdm.company.com
  path: string; // e.g. /api/v1/employees
  isDefaultForType: boolean; // Use this api when a dataType is requested without an explicit api
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

export interface IMDMSource extends Document {
  name: string;
  description?: string;
  enabled: boolean;
  apis: IMDMApi[];
  auth: IMDMAuth;

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
    dataType: {
      type: String,
      enum: [
        "schools",
        "employees",
        "principals",
        "students",
        "parents",
        "children",
        "custom",
      ],
      default: "custom",
    },
    method: { type: String, enum: ["GET", "POST"], default: "GET" },
    baseUrl: { type: String, required: true, trim: true },
    path: { type: String, default: "", trim: true },
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

const mdmSourceSchema = new Schema<IMDMSource>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, default: "" },
    enabled: { type: Boolean, default: true },
    apis: { type: [mdmApiSchema], default: [] },
    auth: { type: mdmAuthSchema, default: () => ({}) },

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
