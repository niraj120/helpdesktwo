import mongoose, { Document, Schema } from 'mongoose';

export interface ISystemSettings extends Document {
  key: string;
  value: any;
  description?: string;
  updatedAt: Date;
  updatedBy?: mongoose.Types.ObjectId;
}

const SystemSettingsSchema: Schema = new Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    value: {
      type: Schema.Types.Mixed,
      required: true,
    },
    description: {
      type: String,
      trim: true,
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

// Index for faster lookups
SystemSettingsSchema.index({ key: 1 });

export default mongoose.model<ISystemSettings>('SystemSettings', SystemSettingsSchema);
