import mongoose, { Schema, Document } from "mongoose";
import { encrypt, decrypt, isEncrypted } from "../../utils/encryption";

export interface IAttendanceConfig extends Document {
  projectId: mongoose.Types.ObjectId;

  // AFT API settings
  aftBaseUrl: string;
  aftProjectPrefix: string; // e.g. "vmk" → used in /api/apiv1/vmk/get-attendance
  apiKeyEncrypted: string; // AES-256 encrypted Bearer token

  // Sync settings
  syncActive: boolean;
  syncSchedule: string[]; // Array of "HH:MM" strings e.g. ["09:00", "21:00"]
  publishedCheckEnabled: boolean; // If true: only store records where published === true
  syncLookbackDays: number; // How many days back to fetch from AFT (default 30)

  // Common identifier (always "employeeCode" — matches AFT "User ID")
  commonIdentifier: string;

  // Display & permissions
  displayFields: string[]; // Ordered list of field IDs to show in end-user view
  fieldPermissions: Record<
    string,
    { admin: boolean; manager: boolean; hr: boolean; employee: boolean }
  >;

  createdAt: Date;
  updatedAt: Date;

  getDecryptedApiKey(): string;
}

const defaultFieldPermissions = {
  employee_id: { admin: true, manager: true, hr: true, employee: true },
  name: { admin: true, manager: true, hr: true, employee: true },
  date: { admin: true, manager: true, hr: true, employee: true },
  punch_in: { admin: true, manager: true, hr: true, employee: true },
  punch_out: { admin: true, manager: true, hr: true, employee: true },
  total_working_hours: { admin: true, manager: true, hr: true, employee: true },
  status: { admin: true, manager: true, hr: true, employee: true },
  center: { admin: true, manager: true, hr: true, employee: false },
  geo: { admin: true, manager: false, hr: true, employee: false },
  published: { admin: true, manager: false, hr: true, employee: false },
};

const fieldPermissionSchema = new Schema(
  {
    admin: { type: Boolean, default: true },
    manager: { type: Boolean, default: false },
    hr: { type: Boolean, default: true },
    employee: { type: Boolean, default: false },
  },
  { _id: false },
);

const attendanceConfigSchema = new Schema<IAttendanceConfig>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      unique: true,
    },

    // AFT API
    aftBaseUrl: {
      type: String,
      default: "https://www.afterp.in/api/apiv1",
      trim: true,
    },
    aftProjectPrefix: {
      type: String,
      default: "vmk",
      trim: true,
    },
    apiKeyEncrypted: {
      type: String,
      default: "",
    },

    // Sync
    syncActive: { type: Boolean, default: true },
    syncSchedule: {
      type: [String],
      default: ["09:00"],
    },
    publishedCheckEnabled: { type: Boolean, default: false },
    syncLookbackDays: { type: Number, default: 30, min: 1, max: 365 },
    commonIdentifier: { type: String, default: "employeeCode" },

    // Display
    displayFields: {
      type: [String],
      default: [
        "employee_id",
        "name",
        "date",
        "punch_in",
        "punch_out",
        "total_working_hours",
        "status",
        "center",
      ],
    },
    fieldPermissions: {
      type: Map,
      of: fieldPermissionSchema,
      default: defaultFieldPermissions,
    },
  },
  { timestamps: true },
);

// Instance method: decrypt the AFT Bearer token
attendanceConfigSchema.methods.getDecryptedApiKey = function (): string {
  if (!this.apiKeyEncrypted) return "";
  try {
    if (isEncrypted(this.apiKeyEncrypted)) {
      return decrypt(this.apiKeyEncrypted);
    }
    return this.apiKeyEncrypted;
  } catch {
    return "";
  }
};

// Encrypt token before saving
attendanceConfigSchema.pre("save", function (next) {
  if (this.isModified("apiKeyEncrypted") && this.apiKeyEncrypted) {
    if (!isEncrypted(this.apiKeyEncrypted)) {
      this.apiKeyEncrypted = encrypt(this.apiKeyEncrypted);
    }
  }
  next();
});

export const AttendanceConfig = mongoose.model<IAttendanceConfig>(
  "AttendanceConfig",
  attendanceConfigSchema,
);
