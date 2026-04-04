import mongoose, { Document, Schema } from "mongoose";

export interface ICategoryEscalationConfig extends Document {
  categoryId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  escalationMatrixId: mongoose.Types.ObjectId;
  isActive: boolean;
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CategoryEscalationConfigSchema = new Schema<ICategoryEscalationConfig>(
  {
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    escalationMatrixId: {
      type: Schema.Types.ObjectId,
      ref: "EscalationMatrix",
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true },
);

// One escalation config per category
CategoryEscalationConfigSchema.index({ categoryId: 1 }, { unique: true });

export default mongoose.model<ICategoryEscalationConfig>(
  "CategoryEscalationConfig",
  CategoryEscalationConfigSchema,
);
