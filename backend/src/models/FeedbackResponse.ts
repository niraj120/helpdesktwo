import mongoose, { Schema, Document } from 'mongoose';

export interface IFeedbackAnswer {
  questionId: string;
  questionLabel: string;
  questionType: string;
  answer: any; // Can be string, number, array of strings
}

export interface IFeedbackResponse extends Document {
  projectId: mongoose.Types.ObjectId;
  ticketId: mongoose.Types.ObjectId;
  formId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  answers: IFeedbackAnswer[];
  overallRating?: number; // If there's a rating question, store it here for quick access
  submittedAt: Date;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

const FeedbackAnswerSchema = new Schema({
  questionId: { type: String, required: true },
  questionLabel: { type: String, required: true },
  questionType: { type: String, required: true },
  answer: { type: Schema.Types.Mixed, required: true }
}, { _id: false });

const FeedbackResponseSchema = new Schema<IFeedbackResponse>({
  projectId: {
    type: Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  ticketId: {
    type: Schema.Types.ObjectId,
    ref: 'Ticket',
    required: true
  },
  formId: {
    type: Schema.Types.ObjectId,
    ref: 'FeedbackForm',
    required: true
  },
  studentId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  answers: [FeedbackAnswerSchema],
  overallRating: {
    type: Number,
    min: 1,
    max: 5
  },
  submittedAt: {
    type: Date,
    default: Date.now
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  }
}, {
  timestamps: true
});

// Indexes
FeedbackResponseSchema.index({ projectId: 1, ticketId: 1 });
FeedbackResponseSchema.index({ projectId: 1, formId: 1 });
FeedbackResponseSchema.index({ studentId: 1, ticketId: 1 });
FeedbackResponseSchema.index({ submittedAt: -1 });

export const FeedbackResponse = mongoose.model<IFeedbackResponse>('FeedbackResponse', FeedbackResponseSchema);
