import mongoose, { Schema, Document } from 'mongoose';

export interface IFeedbackQuestion {
  id: string;
  type: 'rating' | 'text' | 'textarea' | 'radio' | 'checkbox' | 'select';
  label: string;
  required: boolean;
  options?: string[]; // For radio, checkbox, select
  placeholder?: string;
  maxRating?: number; // For rating type (default 5)
  order: number;
}

export interface IFeedbackTrigger {
  type: 'ticket_created' | 'ticket_status_changed' | 'ticket_closed' | 'student_registered' | 'agent_assigned';
  enabled: boolean;
  conditions?: {
    statusIds?: string[]; // For ticket_status_changed
    specificStatuses?: string[]; // Status names
  };
}

export interface IFeedbackForm extends Document {
  projectId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  questions: IFeedbackQuestion[];
  isActive: boolean;
  triggers: IFeedbackTrigger[]; // Multiple triggers can be configured
  emailTemplate?: {
    subject: string;
    body: string; // Can include placeholders like {ticketNumber}, {studentName}, {feedbackLink}
  };
  settings: {
    showAfterTicketClosed: boolean;
    allowMultipleSubmissions: boolean;
    sendEmailNotification: boolean;
    emailDelay?: number; // Delay in minutes before sending feedback email
  };
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const FeedbackQuestionSchema = new Schema({
  id: { type: String, required: true },
  type: {
    type: String,
    enum: ['rating', 'text', 'textarea', 'radio', 'checkbox', 'select'],
    required: true
  },
  label: { type: String, required: true },
  required: { type: Boolean, default: false },
  options: [{ type: String }],
  placeholder: { type: String },
  maxRating: { type: Number, default: 5 },
  order: { type: Number, required: true }
}, { _id: false });

const FeedbackFormSchema = new Schema<IFeedbackForm>({
  projectId: {
    type: Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  questions: [FeedbackQuestionSchema],
  isActive: {
    type: Boolean,
    default: true
  },
  triggers: [{
    type: {
      type: String,
      enum: ['ticket_created', 'ticket_status_changed', 'ticket_closed', 'student_registered', 'agent_assigned'],
      required: true
    },
    enabled: {
      type: Boolean,
      default: true
    },
    conditions: {
      statusIds: [{ type: String }],
      specificStatuses: [{ type: String }]
    }
  }],
  emailTemplate: {
    subject: {
      type: String,
      default: 'Please share your feedback on Ticket #{ticketNumber}'
    },
    body: {
      type: String,
      default: 'Dear {studentName},\n\nYour ticket #{ticketNumber} has been resolved. We would love to hear your feedback.\n\nPlease click the link below to share your experience:\n{feedbackLink}\n\nThank you for your time!'
    }
  },
  settings: {
    showAfterTicketClosed: { type: Boolean, default: true },
    allowMultipleSubmissions: { type: Boolean, default: false },
    sendEmailNotification: { type: Boolean, default: true },
    emailDelay: { type: Number, default: 0 } // In minutes
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes
FeedbackFormSchema.index({ projectId: 1, isActive: 1 });
FeedbackFormSchema.index({ projectId: 1, name: 1 }, { unique: true });

export const FeedbackForm = mongoose.model<IFeedbackForm>('FeedbackForm', FeedbackFormSchema);
