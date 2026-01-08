import mongoose, { Document, Schema } from 'mongoose';

export interface IEscalationLevel {
  level: number;
  escalateAfter: {
    value: number;
    unit: 'minutes' | 'hours' | 'days';
  };
  escalateTo: {
    type: 'user' | 'group' | 'role';
    targetId: string;
    targetName: string;
  };
  notifyMethod: ('email' | 'sms' | 'push')[];
  emailTemplate?: string;
  actions?: {
    changePriority?: 'Urgent' | 'High' | 'Normal' | 'Low';
    addWatchers?: string[];
    changeStatus?: string;
  };
}

export interface IEscalationPolicy extends Document {
  policyId: string;
  name: string;
  description?: string;
  levels: IEscalationLevel[];
  isActive: boolean;
  projectId?: mongoose.Types.ObjectId;
  projectIds?: mongoose.Types.ObjectId[];
  slaRuleIds?: mongoose.Types.ObjectId[];
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const EscalationLevelSchema = new Schema<IEscalationLevel>(
  {
    level: {
      type: Number,
      required: true,
      min: 1,
    },
    escalateAfter: {
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
    escalateTo: {
      type: {
        type: String,
        required: true,
        enum: ['user', 'group', 'role'],
      },
      targetId: {
        type: String,
        required: true,
      },
      targetName: {
        type: String,
        required: true,
      },
    },
    notifyMethod: [
      {
        type: String,
        enum: ['email', 'sms', 'push'],
      },
    ],
    emailTemplate: {
      type: String,
    },
    actions: {
      changePriority: {
        type: String,
        enum: ['Urgent', 'High', 'Normal', 'Low'],
      },
      addWatchers: [String],
      changeStatus: String,
    },
  },
  { _id: false }
);

const EscalationPolicySchema = new Schema<IEscalationPolicy>(
  {
    policyId: {
      type: String,
      required: false,
      unique: true,
      uppercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    levels: [EscalationLevelSchema],
    isActive: {
      type: Boolean,
      default: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
    },
    projectIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Project',
      },
    ],
    slaRuleIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'SLARule',
      },
    ],
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

// Auto-generate policyId before saving
EscalationPolicySchema.pre('save', async function (next) {
  if (this.isNew && !this.policyId) {
    const EscalationPolicyModel = this.constructor as mongoose.Model<IEscalationPolicy>;
    const lastPolicy = await EscalationPolicyModel.findOne().sort({ policyId: -1 });

    let sequence = 1;
    if (lastPolicy && lastPolicy.policyId) {
      const lastSequence = parseInt(lastPolicy.policyId.replace('ESC', ''));
      if (!isNaN(lastSequence)) {
        sequence = lastSequence + 1;
      }
    }

    this.policyId = `ESC${sequence.toString().padStart(4, '0')}`;
  }
  next();
});

// Indexes
EscalationPolicySchema.index({ policyId: 1 });
EscalationPolicySchema.index({ isActive: 1 });
EscalationPolicySchema.index({ projectId: 1 });
EscalationPolicySchema.index({ projectIds: 1 });
EscalationPolicySchema.index({ createdAt: -1 });

const EscalationPolicy = mongoose.model<IEscalationPolicy>('EscalationPolicy', EscalationPolicySchema);

export default EscalationPolicy;
