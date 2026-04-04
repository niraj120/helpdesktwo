import mongoose, { Document, Schema } from 'mongoose';

/**
 * Stores the module-level permission matrix for the Reports module.
 * One document per role — controls what a role can do inside the report module.
 */
export interface IReportModulePermission extends Document {
  roleId: mongoose.Types.ObjectId;
  roleCode: string;
  roleName: string;
  canView: boolean;
  canCreate: boolean;
  canExport: boolean;
  canSchedule: boolean;
  canAssign: boolean;
  canDelete: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ReportModulePermissionSchema = new Schema<IReportModulePermission>(
  {
    roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true, unique: true },
    roleCode: { type: String, required: true },
    roleName: { type: String, required: true },
    canView: { type: Boolean, default: true },
    canCreate: { type: Boolean, default: false },
    canExport: { type: Boolean, default: false },
    canSchedule: { type: Boolean, default: false },
    canAssign: { type: Boolean, default: false },
    canDelete: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const ReportModulePermission = mongoose.model<IReportModulePermission>(
  'ReportModulePermission',
  ReportModulePermissionSchema,
);
