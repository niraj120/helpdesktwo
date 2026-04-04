import mongoose, { Document, Schema } from "mongoose";

/**
 * One document per role.  Stores the array of data-point keys the role is
 * permitted to see.  Super-admin bypasses this check at runtime.
 */
export interface IReportDataPointAccess extends Document {
  roleId: mongoose.Types.ObjectId;
  roleCode: string;
  allowedDataPoints: string[]; // list of data point keys
  updatedAt: Date;
  createdAt: Date;
}

const ReportDataPointAccessSchema = new Schema<IReportDataPointAccess>(
  {
    roleId: {
      type: Schema.Types.ObjectId,
      ref: "Role",
      required: true,
      unique: true,
    },
    roleCode: { type: String, required: true },
    allowedDataPoints: { type: [String], default: [] },
  },
  { timestamps: true },
);

export const ReportDataPointAccess = mongoose.model<IReportDataPointAccess>(
  "ReportDataPointAccess",
  ReportDataPointAccessSchema,
);
