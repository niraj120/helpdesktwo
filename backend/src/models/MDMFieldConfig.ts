import mongoose, { Document, Schema } from "mongoose";

/**
 * Per-source field configuration for the HRMS / MDM import UI.
 *
 * Deliberately stored in its OWN collection (not embedded on MDMSource) so the
 * MDM source document stays purely about connectivity. Holds:
 *  - selectedFields: which API columns to show in the picker table
 *  - fieldMapping:   which API field feeds each user-account field on import
 *
 * Keyed by (mdmSourceId, dataType) so employees / principals can differ.
 */
export interface IMDMFieldConfig extends Document {
  mdmSourceId: mongoose.Types.ObjectId;
  dataType: string; // "employees" | "principals" | ...
  selectedFields: string[];
  fieldMapping: {
    firstName?: string;
    lastName?: string;
    fullName?: string;
    email?: string;
    mobile?: string;
    employeeCode?: string;
    department?: string;
    designation?: string;
  };
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const MDMFieldConfigSchema = new Schema<IMDMFieldConfig>(
  {
    mdmSourceId: {
      type: Schema.Types.ObjectId,
      ref: "MDMSource",
      required: true,
      index: true,
    },
    dataType: { type: String, default: "employees", index: true },
    selectedFields: { type: [String], default: [] },
    fieldMapping: {
      firstName: { type: String },
      lastName: { type: String },
      fullName: { type: String },
      email: { type: String },
      mobile: { type: String },
      employeeCode: { type: String },
      department: { type: String },
      designation: { type: String },
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

MDMFieldConfigSchema.index({ mdmSourceId: 1, dataType: 1 }, { unique: true });

export const MDMFieldConfig = mongoose.model<IMDMFieldConfig>(
  "MDMFieldConfig",
  MDMFieldConfigSchema,
);

export default MDMFieldConfig;
