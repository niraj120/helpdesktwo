import mongoose, { Document, Schema } from 'mongoose';

export interface IActivityLog extends Document {
  userId: mongoose.Types.ObjectId;
  userName: string;
  userEmail: string;
  action: 'create' | 'update' | 'delete' | 'edit';
  entity: string; // e.g., 'ticket', 'user', 'project', 'sla-rule', 'escalation-policy'
  entityId?: string;
  entityName?: string;
  changes?: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
  description?: string;
  ipAddress?: string;
  userAgent?: string;
  project?: mongoose.Types.ObjectId;
  projectName?: string;
  role?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

const activityLogSchema = new Schema<IActivityLog>({
  userId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true 
  },
  userName: { 
    type: String, 
    required: true 
  },
  userEmail: { 
    type: String, 
    required: true,
    index: true 
  },
  action: { 
    type: String, 
    required: true,
    enum: ['create', 'update', 'delete', 'edit'],
    index: true 
  },
  entity: { 
    type: String, 
    required: true,
    index: true 
  },
  entityId: { 
    type: String 
  },
  entityName: { 
    type: String 
  },
  changes: [{
    field: String,
    oldValue: Schema.Types.Mixed,
    newValue: Schema.Types.Mixed
  }],
  description: { 
    type: String 
  },
  ipAddress: { 
    type: String 
  },
  userAgent: { 
    type: String 
  },
  project: { 
    type: Schema.Types.ObjectId, 
    ref: 'Project' 
  },
  projectName: { 
    type: String 
  },
  role: { 
    type: String 
  },
  timestamp: { 
    type: Date, 
    default: Date.now,
    index: true 
  },
  metadata: { 
    type: Schema.Types.Mixed 
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
activityLogSchema.index({ timestamp: -1 });
activityLogSchema.index({ userId: 1, timestamp: -1 });
activityLogSchema.index({ entity: 1, timestamp: -1 });
activityLogSchema.index({ action: 1, timestamp: -1 });

export default mongoose.model<IActivityLog>('ActivityLog', activityLogSchema);
