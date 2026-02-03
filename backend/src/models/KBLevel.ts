import mongoose, { Document, Schema } from 'mongoose';

export interface IKBLevel extends Document {
  levelName: string;
  levelOrder: number;
  levelIcon?: string;
  status: 'active' | 'inactive';
  description?: string;
  projectIds: mongoose.Types.ObjectId[];
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedBy?: mongoose.Types.ObjectId;
  updatedAt: Date;
}

const KBLevelSchema = new Schema<IKBLevel>(
  {
    levelName: {
      type: String,
      required: [true, 'Level name is required'],
      trim: true,
      maxlength: [100, 'Level name cannot exceed 100 characters'],
    },
    levelOrder: {
      type: Number,
      required: [true, 'Level order is required'],
      min: [1, 'Level order must be at least 1'],
    },
    levelIcon: {
      type: String,
      trim: true,
      maxlength: [50, 'Icon name cannot exceed 50 characters'],
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
    description: {
      type: String,
      trim: true,
    },
    projectIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Project',
        required: true,
      },
    ],
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
KBLevelSchema.index({ status: 1 });
KBLevelSchema.index({ levelOrder: 1 });
KBLevelSchema.index({ projectIds: 1 });
KBLevelSchema.index({ levelName: 1, projectIds: 1 });

export default mongoose.model<IKBLevel>('KBLevel', KBLevelSchema);
