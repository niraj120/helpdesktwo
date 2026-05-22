import mongoose, { Document, Schema } from "mongoose";

export interface IUserTarget extends Document {
  tenantId: mongoose.Types.ObjectId; // project acting as tenant
  projectId?: mongoose.Types.ObjectId;
  centreId?: mongoose.Types.ObjectId;
  roleId?: mongoose.Types.ObjectId;
  targetMonth: Date; // first day of the month, e.g. 2025-05-01
  targetCount: number;
  setBy: mongoose.Types.ObjectId;
}

const UserTargetSchema = new Schema<IUserTarget>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    projectId: { type: Schema.Types.ObjectId, ref: "Project" },
    centreId: { type: Schema.Types.ObjectId, ref: "Center" },
    roleId: { type: Schema.Types.ObjectId, ref: "Role" },
    targetMonth: { type: Date, required: true },
    targetCount: { type: Number, required: true, min: 0 },
    setBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

UserTargetSchema.index({ tenantId: 1, centreId: 1, targetMonth: 1 });
UserTargetSchema.index({ tenantId: 1, projectId: 1, targetMonth: 1 });
UserTargetSchema.index(
  {
    tenantId: 1,
    projectId: 1,
    centreId: 1,
    roleId: 1,
    targetMonth: 1,
  },
  { unique: true, sparse: true },
);

export const UserTarget = mongoose.model<IUserTarget>(
  "UserTarget",
  UserTargetSchema,
);
