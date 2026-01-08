import mongoose, { Document, Schema } from 'mongoose';

export interface IAccessLog extends Document {
  userId?: mongoose.Types.ObjectId;
  userName?: string;
  userEmail: string;
  action: 'login' | 'logout' | 'login_failed' | 'password_reset' | 'forgot_password' | 'session_expired';
  success: boolean;
  failureReason?: string;
  ipAddress?: string;
  userAgent?: string;
  project?: mongoose.Types.ObjectId;
  projectName?: string;
  role?: string;
  timestamp: Date;
  sessionDuration?: number; // in seconds, for logout events
  metadata?: Record<string, any>;
}

const accessLogSchema = new Schema<IAccessLog>({
  userId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User',
    index: true 
  },
  userName: { 
    type: String 
  },
  userEmail: { 
    type: String, 
    required: true,
    index: true 
  },
  action: { 
    type: String, 
    required: true,
    enum: ['login', 'logout', 'login_failed', 'password_reset', 'forgot_password', 'session_expired'],
    index: true 
  },
  success: { 
    type: Boolean, 
    required: true,
    default: true,
    index: true 
  },
  failureReason: { 
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
  sessionDuration: { 
    type: Number // in seconds
  },
  metadata: { 
    type: Schema.Types.Mixed 
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
accessLogSchema.index({ timestamp: -1 });
accessLogSchema.index({ userId: 1, timestamp: -1 });
accessLogSchema.index({ success: 1, timestamp: -1 });
accessLogSchema.index({ action: 1, timestamp: -1 });

export default mongoose.model<IAccessLog>('AccessLog', accessLogSchema);
