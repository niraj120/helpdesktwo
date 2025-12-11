import mongoose, { Document, Schema } from 'mongoose';

export interface IFAQ extends Document {
  projectId: mongoose.Types.ObjectId;
  question: string;
  answer: string;
  category?: string;
  tags?: string[];
  status: 'active' | 'inactive';
  displayOrder: number;
  viewCount: number;
  helpfulCount: number;
  notHelpfulCount: number;
  createdBy: {
    userId: mongoose.Types.ObjectId;
    name: string;
    email: string;
  };
  updatedBy?: {
    userId: mongoose.Types.ObjectId;
    name: string;
    email: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const FAQSchema = new Schema<IFAQ>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    question: {
      type: String,
      required: true,
      trim: true,
    },
    answer: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      trim: true,
      default: 'General',
    },
    tags: [{
      type: String,
      trim: true,
    }],
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
    viewCount: {
      type: Number,
      default: 0,
    },
    helpfulCount: {
      type: Number,
      default: 0,
    },
    notHelpfulCount: {
      type: Number,
      default: 0,
    },
    createdBy: {
      userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
      name: {
        type: String,
        required: true,
      },
      email: {
        type: String,
        required: true,
      },
    },
    updatedBy: {
      userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
      name: String,
      email: String,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient querying
FAQSchema.index({ projectId: 1, status: 1, displayOrder: 1 });
FAQSchema.index({ projectId: 1, category: 1 });

const FAQ = mongoose.model<IFAQ>('FAQ', FAQSchema);

export default FAQ;
