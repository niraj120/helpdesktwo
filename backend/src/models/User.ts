import mongoose, { Document, Schema } from "mongoose";
import bcrypt from "bcryptjs";

export interface IUser extends Document {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  fullName?: string; // Combined first + last name for easier searching
  phone?: string; // Phone number (can be different from mobile for OTP)
  uniqueId?: string; // Student ID, Roll Number, Employee ID, etc.
  mobile?: string; // Mobile number for OTP verification
  parentMobile?: string; // Parent mobile number for parent login (for students)
  role: mongoose.Types.ObjectId; // Reference to Role model
  isActive: boolean;
  isIvrAgent?: boolean; // Marks user as an IVR agent (eligible for missed-call round-robin)
  tataAgentNumber?: string; // SmartFlo agent number rung first on outbound Click-to-Call
  lastLogin?: Date;
  eulaAccepted?: boolean; // EULA acceptance status
  eulaAcceptedAt?: Date; // When EULA was accepted
  requirePasswordSetup?: boolean; // Flag for first-time student users who need to set password via OTP
  registrationSource?: "online" | "offline" | "hrms" | "manual" | "email"; // Track where user was created from
  createdAt: Date;
  updatedAt: Date;

  // HRMS Integration fields
  hrmsId?: number; // PeopleStrong employee ID
  employeeCode?: string; // Unique employee code from HRMS
  department?: string; // Legacy free-text (HRMS sync) or display name
  departmentRef?: mongoose.Types.ObjectId; // Reference to structured Department master (primary project)
  projectDepartments?: Array<{
    projectId: mongoose.Types.ObjectId;
    departmentRef: mongoose.Types.ObjectId;
  }>; // Per-project department mappings for multi-project users
  designation?: string;
  joiningDate?: Date;
  reportingManager?: mongoose.Types.ObjectId; // Reference to another User
  mdmSourceId?: mongoose.Types.ObjectId; // Provenance: which MDM source this user's data came from (HRMS import)
  mdmSyncStatus?: "synced" | "missing_in_mdm"; // Last MDM sync outcome for this user
  mdmLastSyncedAt?: Date; // When this user was last refreshed from MDM

  // Project/Portal assignment
  projects?: mongoose.Types.ObjectId[]; // Multiple projects can be assigned
  centers?: mongoose.Types.ObjectId[]; // Multiple centers can be assigned (for offline mode)
  centreId?: mongoose.Types.ObjectId; // Primary centre assignment (used for dashboard centre-scoped queries)

  // OTP-related fields
  resetPasswordOTP?: string;
  resetPasswordOTPExpires?: Date;
  resetPasswordAttempts?: number;
  resetPasswordLockedUntil?: Date;

  // Keycloak SSO — immutable subject (the `sub` claim). Set once a user is
  // linked to their Keycloak account; thereafter login resolves the local user
  // by this value, NOT by mutable email/mobile. Null until linked (migration).
  // MULTI-TENANT: `sub` is unique only WITHIN a realm. The portal allows a
  // per-project realm override, so the real identity is the pair
  // (keycloakIssuer, keycloakSubject) — see the compound index below.
  keycloakSubject?: string;
  keycloakIssuer?: string; // Keycloak realm issuer URL the `sub` belongs to.

  // Token invalidation (incremented when role/permissions change)
  tokenVersion?: number;

  // Attendance Module — Biometric sync fields
  payrollNumber?: number;
  biometricSynced?: boolean;
  biometricEmployeeId?: number; // AFT EmployeeID returned from add-employee API
  biometricDeviceId?: number; // AFT EmployeeBiometricID returned from add-employee API
  biometricSyncedAt?: Date;
  biometricSyncError?: string;

  // Payroll / Company fields
  payrollType?: "internal" | "external";
  company?: mongoose.Types.ObjectId | null;

  // Methods
  comparePassword(candidatePassword: string): Promise<boolean>;
  generateResetPasswordOTP(): string;
  isResetPasswordLocked(): boolean;
  incrementTokenVersion(): Promise<void>;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: function (this: IUser) {
        // Password is optional for new student users who haven't set it yet
        return !this.requirePasswordSetup;
      },
      minlength: [8, "Password must be at least 8 characters long"],
    },
    firstName: {
      type: String,
      required: false,
      trim: true,
    },
    lastName: {
      type: String,
      required: false,
      trim: true,
    },
    fullName: {
      type: String,
      trim: true,
      index: true, // For text search
    },
    phone: {
      type: String,
      trim: true,
      sparse: true, // Allow multiple null values but unique non-null
      validate: {
        validator: function (v: string) {
          return !v || /^\d{10,15}$/.test(v); // 10-15 digit phone number
        },
        message: "Please enter a valid phone number",
      },
    },
    uniqueId: {
      type: String,
      trim: true,
      sparse: true, // Allow multiple null values but unique non-null
      unique: true,
      index: true,
    },
    mobile: {
      type: String,
      trim: true,
      validate: {
        validator: function (v: string) {
          return !v || /^[6-9]\d{9}$/.test(v); // Indian mobile number validation
        },
        message: "Please enter a valid 10-digit mobile number",
      },
    },
    parentMobile: {
      type: String,
      trim: true,
      validate: {
        validator: function (v: string) {
          return !v || /^[6-9]\d{9}$/.test(v); // Indian mobile number validation
        },
        message: "Please enter a valid 10-digit parent mobile number",
      },
    },
    role: {
      type: Schema.Types.ObjectId,
      ref: "Role",
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isIvrAgent: {
      type: Boolean,
      default: false,
    },
    tataAgentNumber: {
      type: String,
      trim: true,
    },
    lastLogin: {
      type: Date,
    },
    eulaAccepted: {
      type: Boolean,
      default: false,
    },
    eulaAcceptedAt: {
      type: Date,
    },
    requirePasswordSetup: {
      type: Boolean,
      default: false,
    },
    registrationSource: {
      type: String,
      enum: ["online", "offline", "hrms", "manual", "email"],
      default: "manual",
    },
    // HRMS Integration fields
    // Keycloak SSO immutable subject (`sub`) + its realm issuer. Uniqueness is
    // enforced on the (issuer, subject) PAIR via a partial compound index below,
    // not here — because `sub` is only unique within a realm and the portal
    // supports per-project realms.
    keycloakSubject: {
      type: String,
      trim: true,
    },
    keycloakIssuer: {
      type: String,
      trim: true,
    },
    hrmsId: {
      type: Number,
      sparse: true,
    },
    employeeCode: {
      type: String,
      sparse: true,
      unique: true,
      trim: true,
    },
    department: {
      type: String,
      trim: true,
    },
    departmentRef: {
      type: Schema.Types.ObjectId,
      ref: "Department",
      default: null,
    },
    projectDepartments: [
      {
        projectId: {
          type: Schema.Types.ObjectId,
          ref: "Project",
          required: true,
        },
        departmentRef: {
          type: Schema.Types.ObjectId,
          ref: "Department",
          required: true,
        },
      },
    ],
    designation: {
      type: String,
      trim: true,
    },
    joiningDate: {
      type: Date,
    },
    reportingManager: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    mdmSourceId: {
      type: Schema.Types.ObjectId,
      ref: "MDMSource",
      default: null,
    },
    mdmSyncStatus: {
      type: String,
      enum: ["synced", "missing_in_mdm"],
    },
    mdmLastSyncedAt: { type: Date },
    projects: [
      {
        type: Schema.Types.ObjectId,
        ref: "Project",
      },
    ],
    centers: [
      {
        type: Schema.Types.ObjectId,
        ref: "Center",
      },
    ],
    centreId: {
      type: Schema.Types.ObjectId,
      ref: "Center",
      sparse: true,
      index: true,
    },
    resetPasswordOTP: {
      type: String,
    },
    resetPasswordOTPExpires: {
      type: Date,
    },
    resetPasswordAttempts: {
      type: Number,
      default: 0,
    },
    resetPasswordLockedUntil: {
      type: Date,
    },
    tokenVersion: {
      type: Number,
      default: 0,
    },

    // Attendance Module — Biometric sync fields
    payrollNumber: { type: Number, default: null },
    biometricSynced: { type: Boolean, default: false },
    biometricEmployeeId: { type: Number, default: null, sparse: true },
    biometricDeviceId: { type: Number, default: null },
    biometricSyncedAt: { type: Date, default: null },
    biometricSyncError: { type: String, default: null },

    // Payroll / Company fields
    payrollType: {
      type: String,
      default: null,
      validate: {
        validator: (v: unknown) =>
          v == null || v === "internal" || v === "external",
        message: "payrollType must be internal, external, or null",
      },
    },
    company: { type: Schema.Types.ObjectId, ref: "Company", default: null },
  },
  {
    timestamps: true,
  },
);

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error as Error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function (
  candidatePassword: string,
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

// Generate reset password OTP (returns OTP but does NOT persist plaintext to the DB)
userSchema.methods.generateResetPasswordOTP = function (): string {
  const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
  // For security, do not write plaintext OTP to the user document anymore.
  // Use centralized `otpStore` to persist hashed OTPs.
  return otp;
};

// Check if account is locked for password reset
userSchema.methods.isResetPasswordLocked = function (): boolean {
  return !!(
    this.resetPasswordLockedUntil && this.resetPasswordLockedUntil > new Date()
  );
};

// Increment token version to invalidate existing tokens
userSchema.methods.incrementTokenVersion = async function (): Promise<void> {
  this.tokenVersion = (this.tokenVersion || 0) + 1;
  await this.save();
};

// Create indexes
userSchema.index({ email: 1 });
userSchema.index({ phone: 1 });
userSchema.index({ uniqueId: 1 });
userSchema.index({ fullName: 1 });
userSchema.index({ mobile: 1 });
userSchema.index({ employeeCode: 1 });
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ projects: 1 });
userSchema.index({ department: 1 });
// Keycloak identity is the (issuer, subject) pair — unique only among users that
// have actually been linked (partial index skips the null-subject majority).
// `sub` alone is NOT globally unique across realms in a multi-tenant portal.
userSchema.index(
  { keycloakIssuer: 1, keycloakSubject: 1 },
  {
    unique: true,
    partialFilterExpression: { keycloakSubject: { $type: "string" } },
  },
);
userSchema.index({ hrmsId: 1 });

export const User = mongoose.model<IUser>("User", userSchema);
