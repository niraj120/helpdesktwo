import mongoose, { Document, Schema } from 'mongoose';

export interface IKBArticle extends Document {
  documentName: string;
  documentType: 'pdf' | 'html' | 'both' | 'link';
  projectIds: mongoose.Types.ObjectId[];
  
  // PDF fields
  pdfUrl?: string;
  pdfFilename?: string;
  pdfSize?: number;
  
  // HTML fields
  htmlContent?: string;
  
  // Link field
  externalUrl?: string;
  
  // Publishing
  publishedDate?: Date;
  
  // Visibility - Role-based access control
  visibility: 'all' | 'internal' | 'public' | 'role_based';
  visibleToRoles: mongoose.Types.ObjectId[];
  
  // Metadata
  description?: string;
  tags: string[];
  author?: string;
  status: 'active' | 'inactive';
  isFeatured: boolean;
  showNewTag: boolean;
  displayOrder?: number;
  viewsCount: number;
  
  // Timestamps
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedBy?: mongoose.Types.ObjectId;
  updatedAt: Date;
  publishedAt?: Date;
}

const KBArticleSchema = new Schema<IKBArticle>(
  {
    documentName: {
      type: String,
      required: [true, 'Document name is required'],
      trim: true,
      maxlength: [200, 'Document name cannot exceed 200 characters'],
    },
    documentType: {
      type: String,
      enum: ['pdf', 'html', 'both', 'link'],
      required: [true, 'Document type is required'],
    },
    projectIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Project',
        required: true,
      },
    ],
    
    // PDF fields
    pdfUrl: {
      type: String,
      trim: true,
    },
    pdfFilename: {
      type: String,
      trim: true,
      maxlength: [255, 'PDF filename cannot exceed 255 characters'],
    },
    pdfSize: {
      type: Number,
      min: [0, 'PDF size cannot be negative'],
    },
    
    // HTML fields
    htmlContent: {
      type: String,
    },
    
    // Link field
    externalUrl: {
      type: String,
      trim: true,
    },
    
    // Publishing
    publishedDate: {
      type: Date,
    },
    
    // Visibility - Role-based access control
    visibility: {
      type: String,
      enum: ['all', 'internal', 'public', 'role_based'],
      default: 'all',
    },
    visibleToRoles: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Role',
      },
    ],
    
    // Metadata
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    author: {
      type: String,
      trim: true,
      maxlength: [100, 'Author name cannot exceed 100 characters'],
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    showNewTag: {
      type: Boolean,
      default: true,
    },
    displayOrder: {
      type: Number,
      min: [0, 'Display order cannot be negative'],
    },
    viewsCount: {
      type: Number,
      default: 0,
      min: [0, 'Views count cannot be negative'],
    },
    
    // User references
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    publishedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for faster queries
KBArticleSchema.index({ status: 1 });
KBArticleSchema.index({ projectIds: 1 });
KBArticleSchema.index({ scheduledPublishDate: 1 });
KBArticleSchema.index({ isFeatured: 1 });
KBArticleSchema.index({ documentName: 'text', htmlContent: 'text', tags: 'text' });

// Validation: Require PDF fields if documentType includes 'pdf'
KBArticleSchema.pre('save', function (next) {
  if ((this.documentType === 'pdf' || this.documentType === 'both') && !this.pdfUrl) {
    return next(new Error('PDF URL is required when document type is PDF or Both'));
  }
  if ((this.documentType === 'html' || this.documentType === 'both') && !this.htmlContent) {
    return next(new Error('HTML content is required when document type is HTML or Both'));
  }
  next();
});

export default mongoose.model<IKBArticle>('KBArticle', KBArticleSchema);
