import mongoose, { Schema, Document } from 'mongoose';

export interface IMasterData extends Document {
  category: string;
  key: string;
  value: string;
  metadata?: any;
  isActive: boolean;
}

const MasterDataSchema = new Schema<IMasterData>({
  category: { type: String, required: true },
  key: { type: String, required: true },
  value: { type: String, required: true },
  metadata: Schema.Types.Mixed,
  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

export const MasterData = mongoose.model<IMasterData>('MasterData', MasterDataSchema);
