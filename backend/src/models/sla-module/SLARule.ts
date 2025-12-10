import mongoose, { Document, Schema } from 'mongoose';

export interface ISLARule extends Document {
  name: string;
  description?: string;
  priority?: 'Critical' | 'Urgent' | 'High' | 'Normal' | 'Low';
  responseTime: {
    value: number;
    unit: 'minutes' | 'hours' | 'days';
  };
  resolutionTime: {
    value: number;
    unit: 'minutes' | 'hours' | 'days';
  };
  isActive: boolean;
  projectIds?: mongoose.Types.ObjectId[];
  escalationPolicyId?: mongoose.Types.ObjectId;
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SLARuleSchema = new Schema<ISLARule>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    priority: {
      type: String,
      required: false,
      enum: ['Critical', 'Urgent', 'High', 'Normal', 'Low'],
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
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    projectIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Project',
      },
    ],
    escalationPolicyId: {
      type: Schema.Types.ObjectId,
      ref: 'EscalationPolicy',
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
    collection: 'slarules', // Explicitly set collection name
  }
);

// Indexes
SLARuleSchema.index({ priority: 1, isActive: 1 });
SLARuleSchema.index({ projectIds: 1 });
SLARuleSchema.index({ createdAt: -1 });

const SLARule = mongoose.model<ISLARule>('SLARule', SLARuleSchema);

export default SLARule;
