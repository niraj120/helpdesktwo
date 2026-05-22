/**
 * DashboardSummarySnapshot — Phase 4
 *
 * Pre-aggregated daily summary for heavy dashboard queries.
 * Documents are keyed by (tenantId, metricKey, date).
 * The aggregation service overwrites each row at midnight.
 */

import mongoose, { Document, Schema } from "mongoose";

export interface IDashboardSummarySnapshot extends Document {
  tenantId: mongoose.Types.ObjectId;
  metricKey: string; // e.g. "open_tickets", "closed_today", "sla_breach_rate"
  date: Date; // midnight UTC of the aggregation day
  value: number;
  meta?: Record<string, unknown>; // optional breakdown payload
  computedAt: Date;
}

const DashboardSummarySnapshotSchema = new Schema<IDashboardSummarySnapshot>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    metricKey: { type: String, required: true, index: true },
    date: { type: Date, required: true },
    value: { type: Number, required: true },
    meta: { type: Schema.Types.Mixed },
    computedAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

DashboardSummarySnapshotSchema.index(
  { tenantId: 1, metricKey: 1, date: 1 },
  { unique: true },
);

// Auto-expire entries older than 120 days
DashboardSummarySnapshotSchema.index(
  { computedAt: 1 },
  { expireAfterSeconds: 120 * 24 * 3600 },
);

export const DashboardSummarySnapshot =
  mongoose.model<IDashboardSummarySnapshot>(
    "DashboardSummarySnapshot",
    DashboardSummarySnapshotSchema,
  );
