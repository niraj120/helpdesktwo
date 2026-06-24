import mongoose, { Document, Schema } from "mongoose";

/**
 * RoleMappingRule — configurable mapping from an HRMS attribute (employee/HRMS
 * code, department or designation) to a Role. Phase 6. Consulted as an optional
 * fallback by the onboarding paths (bulk upload / manual / MDM-HRMS import) so
 * users get the right role automatically without code changes.
 *
 * Rules are evaluated per project in ascending `priority` (lower = first match).
 */
export interface IRoleMappingRule extends Document {
  projectId: mongoose.Types.ObjectId;
  name?: string;
  matchType: "hrms_code" | "department" | "designation";
  operator: "equals" | "contains" | "startsWith";
  matchValue: string;
  roleId: mongoose.Types.ObjectId;
  priority: number;
  isActive: boolean;
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const RoleMappingRuleSchema = new Schema<IRoleMappingRule>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    name: { type: String, trim: true },
    matchType: {
      type: String,
      enum: ["hrms_code", "department", "designation"],
      required: true,
    },
    operator: {
      type: String,
      enum: ["equals", "contains", "startsWith"],
      default: "equals",
    },
    matchValue: { type: String, required: true, trim: true },
    roleId: {
      type: Schema.Types.ObjectId,
      ref: "Role",
      required: true,
    },
    priority: { type: Number, default: 100, index: true },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

RoleMappingRuleSchema.index({ projectId: 1, isActive: 1, priority: 1 });

export const RoleMappingRule = mongoose.model<IRoleMappingRule>(
  "RoleMappingRule",
  RoleMappingRuleSchema,
);
export default RoleMappingRule;
