import mongoose, { Schema, Document } from "mongoose";

/**
 * PSR Master — a named external API source.
 *
 * The admin calls this a "Master" (e.g. "Parent Master", "Student Master").
 * Internally it holds the connection details needed to fetch rows.
 * Secrets are stored as references (env:VAR) or raw values (test-time only).
 */

export type MasterAuthType = "none" | "bearer" | "apikey" | "basic";

export interface IPsrMasterAuth {
  type: MasterAuthType;
  secretRef?: string;   // "env:MY_TOKEN" | "vault:path" | raw value (test only)
  headerName?: string;  // for apikey — default "X-API-Key"
  username?: string;    // for basic
}

export interface IPsrMaster extends Document {
  name: string;                      // "Parent Master"
  url: string;                       // full URL including path
  method: "GET" | "POST";
  auth: IPsrMasterAuth;
  headers: Record<string, string>;   // static headers
  responsePath?: string;             // dot-path to the rows array
  primaryKey?: string;               // unique key field on each row
  /** Pagination — leave empty for single-response APIs */
  pagination?: {
    pageParam?: string;   // e.g. "pagination[page]" or "page"
    sizeParam?: string;   // e.g. "pagination[pageSize]" or "limit"
    pageSize?: number;    // records per page, default 100
    totalPath?: string;   // dot-path to total count, e.g. "meta.pagination.total"
  };
  discoveredColumns: string[];       // flat dot-notation keys — populated by Load Keys
  lastTestedAt?: Date;
  lastTestOk?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PsrMasterAuthSchema = new Schema<IPsrMasterAuth>(
  {
    type: { type: String, enum: ["none", "bearer", "apikey", "basic"], default: "none" },
    secretRef: { type: String },
    headerName: { type: String, default: "X-API-Key" },
    username: { type: String },
  },
  { _id: false },
);

const PsrMasterSchema = new Schema<IPsrMaster>(
  {
    name: { type: String, required: true, trim: true, unique: true },
    url: { type: String, required: true, trim: true },
    method: { type: String, enum: ["GET", "POST"], default: "GET" },
    auth: { type: PsrMasterAuthSchema, default: () => ({ type: "none" }) },
    headers: { type: Schema.Types.Mixed, default: () => ({}) },
    responsePath: { type: String },
    primaryKey: { type: String, default: "id" },
    pagination: {
      type: new Schema({
        pageParam:  { type: String },
        sizeParam:  { type: String },
        pageSize:   { type: Number, default: 100 },
        totalPath:  { type: String },
      }, { _id: false }),
    },
    discoveredColumns: [{ type: String }],
    lastTestedAt: { type: Date },
    lastTestOk: { type: Boolean },
  },
  { timestamps: true },
);

export default mongoose.model<IPsrMaster>("PsrMaster", PsrMasterSchema, "psrmasters");
