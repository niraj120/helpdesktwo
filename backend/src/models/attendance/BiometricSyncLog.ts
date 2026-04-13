import mongoose, { Schema, Document } from "mongoose";

export type BiometricSyncStatus = "SUCCESS" | "FAILED";

export interface IBiometricSyncLog extends Document {
  projectId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  employeeCode: string;
  payrollNumber?: number;
  triggeredBy?: mongoose.Types.ObjectId; // admin user who clicked Sync
  status: BiometricSyncStatus;
  aftEmployeeId?: number; // AFT response data.EmployeeID
  aftBiometricId?: number; // AFT response data.EmployeeBiometricID
  aftResponse?: Record<string, unknown>; // full AFT response body
  errorMessage?: string;
  syncedAt: Date;
}

const biometricSyncLogSchema = new Schema<IBiometricSyncLog>(
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
    payrollNumber: { type: Number, default: null },
    triggeredBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    status: {
      type: String,
      enum: ["SUCCESS", "FAILED"],
      required: true,
    },
    aftEmployeeId: { type: Number, default: null },
    aftBiometricId: { type: Number, default: null },
    aftResponse: { type: Schema.Types.Mixed, default: null },
    errorMessage: { type: String, default: null },
    syncedAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

biometricSyncLogSchema.index({ projectId: 1, syncedAt: -1 });
biometricSyncLogSchema.index({ userId: 1, syncedAt: -1 });
biometricSyncLogSchema.index({ status: 1 });

export const BiometricSyncLog = mongoose.model<IBiometricSyncLog>(
  "BiometricSyncLog",
  biometricSyncLogSchema,
);
