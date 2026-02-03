import mongoose, { Document, Schema } from 'mongoose';

export interface IKBArticleLevelMapping extends Document {
  articleId: mongoose.Types.ObjectId;
  levelId: mongoose.Types.ObjectId;
  createdAt: Date;
}

const KBArticleLevelMappingSchema = new Schema<IKBArticleLevelMapping>(
  {
    articleId: {
      type: Schema.Types.ObjectId,
      ref: 'KBArticle',
      required: [true, 'Article ID is required'],
    },
    levelId: {
      type: Schema.Types.ObjectId,
      ref: 'KBLevel',
      required: [true, 'Level ID is required'],
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Prevent duplicate mappings
KBArticleLevelMappingSchema.index({ articleId: 1, levelId: 1 }, { unique: true });

// Indexes for faster queries
KBArticleLevelMappingSchema.index({ articleId: 1 });
KBArticleLevelMappingSchema.index({ levelId: 1 });

export default mongoose.model<IKBArticleLevelMapping>(
  'KBArticleLevelMapping',
  KBArticleLevelMappingSchema
);
