import mongoose, { Document, Schema } from 'mongoose';

/**
 * WhatsApp Log Interface
 * Records all WhatsApp message attempts for auditing purposes
 */
export interface IWhatsAppLog extends Document {
  projectId?: mongoose.Types.ObjectId;
  projectName?: string;
  
  // Message details
  recipient: string;                 // Phone number with country code
  templateName: string;              // WhatsApp template name used
  templateLanguage?: string;         // Language code used
  
  // Status tracking
  status: 'sent' | 'delivered' | 'read' | 'failed' | 'blocked' | 'simulated';
  error?: string;
  
  // WhatsApp API response
  whatsappMessageId?: string;        // WAMID returned by WhatsApp API
  
  // Trigger information
  triggerType?: string;              // e.g., 'ticket_created', 'otp', etc.
  triggerName?: string;              // e.g., 'ticketCreatedStudent'
  
  // Additional metadata
  metadata?: {
    ticketId?: string;
    ticketNumber?: string;
    userId?: string;
    userName?: string;
    templateParameters?: string[];
    [key: string]: any;
  };
  
  // Timestamps
  sentAt: Date;
  deliveredAt?: Date;
  readAt?: Date;
}

const whatsappLogSchema = new Schema<IWhatsAppLog>({
  projectId: {
    type: Schema.Types.ObjectId,
    ref: 'Project',
    index: true
  },
  projectName: {
    type: String
  },
  recipient: {
    type: String,
    required: true,
    index: true
  },
  templateName: {
    type: String,
    required: true,
    index: true
  },
  templateLanguage: {
    type: String,
    default: 'en'
  },
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read', 'failed', 'blocked', 'simulated'],
    required: true,
    index: true
  },
  error: {
    type: String
  },
  whatsappMessageId: {
    type: String,
    index: true
  },
  triggerType: {
    type: String
  },
  triggerName: {
    type: String,
    index: true
  },
  metadata: {
    type: Schema.Types.Mixed
  },
  sentAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  deliveredAt: {
    type: Date
  },
  readAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Compound indexes for efficient querying
whatsappLogSchema.index({ sentAt: -1 });
whatsappLogSchema.index({ status: 1, sentAt: -1 });
whatsappLogSchema.index({ templateName: 1, sentAt: -1 });
whatsappLogSchema.index({ projectId: 1, sentAt: -1 });
whatsappLogSchema.index({ whatsappMessageId: 1 });
whatsappLogSchema.index({ recipient: 1, sentAt: -1 });
whatsappLogSchema.index({ triggerName: 1, sentAt: -1 });

export default mongoose.model<IWhatsAppLog>('WhatsAppLog', whatsappLogSchema);
