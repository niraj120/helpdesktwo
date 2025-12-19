import mongoose, { Schema, Document } from 'mongoose';

export interface IKnowledgeBaseArticle extends Document {
  projectId: mongoose.Types.ObjectId;
  categoryId: mongoose.Types.ObjectId;
  subcategoryId: mongoose.Types.ObjectId;
  title: string;
  contentType: 'html' | 'pdf';
  content?: string; // For HTML content
  pdfUrl?: string; // For PDF content
  pdfFileName?: string;
  category?: string; // Keep for backward compatibility
  tags?: string[];
  author: mongoose.Types.ObjectId;
  status: 'draft' | 'published' | 'archived';
  viewCount: number;
  helpfulCount: number;
  notHelpfulCount: number;
  displayOrder: number;
  isActive: boolean;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const KnowledgeBaseArticleSchema = new Schema<IKnowledgeBaseArticle>({
  projectId: {
    type: Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    index: true
  },
  categoryId: {
    type: Schema.Types.ObjectId,
    ref: 'KBCategory',
    required: true,
    index: true
  },
  subcategoryId: {
    type: Schema.Types.ObjectId,
    ref: 'KBSubcategory',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  contentType: {
    type: String,
    enum: ['html', 'pdf'],
    required: true,
    default: 'html'
  },
  content: {
    type: String
  },
  pdfUrl: {
    type: String,
    trim: true
  },
  pdfFileName: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    trim: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  author: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'draft'
  },
  viewCount: {
    type: Number,
    default: 0
  },
  helpfulCount: {
    type: Number,
    default: 0
  },
  notHelpfulCount: {
    type: Number,
    default: 0
  },
  displayOrder: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  publishedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Indexes for better performance
KnowledgeBaseArticleSchema.index({ projectId: 1, status: 1, isActive: 1 });
KnowledgeBaseArticleSchema.index({ projectId: 1, category: 1 });
KnowledgeBaseArticleSchema.index({ title: 'text', content: 'text' }); // Text search

export const KnowledgeBaseArticle = mongoose.model<IKnowledgeBaseArticle>('KnowledgeBaseArticle', KnowledgeBaseArticleSchema);
