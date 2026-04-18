import mongoose, { Schema, Document } from "mongoose";

// Open type — biometric partner can send any status code (CL, SL, EL, CO, OD, WFH, etc.)
export type AttendanceStatus = string;

export interface IAttendanceRecord extends Document {
  projectId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId; // matched platform user
  employeeCode: string; // AFT "User ID" — the common identifier
  attendanceDate: Date; // stored as midnight UTC
  punchIn?: Date; // IST timestamp
  punchOut?: Date; // IST timestamp
  totalWorkingHours?: string; // "HH:MM:SS" as-is from AFT
  status: AttendanceStatus;
  center?: string;
  geoLat?: number | null;
  geoLong?: number | null;
  published?: boolean | null;
  rawPayload: Record<string, unknown>; // full AFT record for audit
  syncRunId?: mongoose.Types.ObjectId; // references AttendanceSyncLog
  createdAt: Date;
  updatedAt: Date;
}

const attendanceRecordSchema = new Schema<IAttendanceRecord>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    employeeCode: { type: String, required: true },
    attendanceDate: { type: Date, required: true },
    punchIn: { type: Date, default: null },
    punchOut: { type: Date, default: null },
    totalWorkingHours: { type: String, default: null },
    status: {
      type: String,
      required: true,
      // No enum — status codes are defined by the biometric partner and can vary
    },
    center: { type: String, default: null },
    geoLat: { type: Number, default: null },
    geoLong: { type: Number, default: null },
    published: { type: Boolean, default: null },
    rawPayload: { type: Schema.Types.Mixed, default: {} },
    syncRunId: {
      type: Schema.Types.ObjectId,
      ref: "AttendanceSyncLog",
      default: null,
    },
  },
  { timestamps: true },
);

// Compound unique index — upsert key
attendanceRecordSchema.index(
  { projectId: 1, employeeCode: 1, attendanceDate: 1 },
  { unique: true },
);

// Query performance indexes
attendanceRecordSchema.index({ projectId: 1, attendanceDate: 1 });
attendanceRecordSchema.index({ projectId: 1, status: 1 });
attendanceRecordSchema.index({ projectId: 1, center: 1 });

export const AttendanceRecord = mongoose.model<IAttendanceRecord>(
  "AttendanceRecord",
  attendanceRecordSchema,
);
