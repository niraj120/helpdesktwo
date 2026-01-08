import mongoose, { Document, Schema } from 'mongoose';

export interface IPriority extends Document {
  name: string;
  code: string;
  color: string;
  order: number;
  responseTime: {
    value: number;
    unit: 'minutes' | 'hours' | 'days';
  };
  resolutionTime: {
    value: number;
    unit: 'minutes' | 'hours' | 'days';
  };
  isActive: boolean;
  isDefault?: boolean;
  description?: string;
  projectId: mongoose.Types.ObjectId;
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PrioritySchema = new Schema<IPriority>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    color: {
      type: String,
      required: true,
      default: '#6b7280',
    },
    order: {
      type: Number,
      required: true,
      default: 0,
    },
    responseTime: {
      value: {
        type: Number,
        required: true,
        min: 1,
      },
      unit: {
        type: String,
        required: true,
        enum: ['minutes', 'hours', 'days'],
        default: 'hours',
      },
    },
    resolutionTime: {
      value: {
        type: Number,
        required: true,
        min: 1,
      },
      unit: {
        type: String,
        required: true,
        enum: ['minutes', 'hours', 'days'],
        default: 'hours',
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    description: {
      type: String,
      trim: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
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

// Create compound unique index for name + projectId (same priority name allowed in different projects)
PrioritySchema.index({ name: 1, projectId: 1 }, { unique: true });
PrioritySchema.index({ code: 1, projectId: 1 }, { unique: true });

// Ensure only one default priority per project
PrioritySchema.pre('save', async function (next) {
  if (this.isDefault) {
    await mongoose.model('Priority').updateMany(
      { _id: { $ne: this._id }, projectId: this.projectId },
      { isDefault: false }
    );
  }
  next();
});

export const Priority = mongoose.model<IPriority>('Priority', PrioritySchema);
