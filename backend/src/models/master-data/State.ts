import mongoose, { Schema, Document } from 'mongoose';

export interface IState extends Document {
  key: string;
  value: string;
  country: string; // Keep for backward compatibility
  countryId: mongoose.Types.ObjectId; // New: Reference to Country _id
  displayOrder?: number;
  isActive: boolean;
}

const StateSchema = new Schema<IState>({
  key: { type: String, required: true, unique: true },
  value: { type: String, required: true },
  country: { type: String, required: false }, // Optional for backward compatibility
  countryId: { type: Schema.Types.ObjectId, ref: 'Country', required: false }, // Will be required after migration
  displayOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }
}, {
  timestamps: true,
  collection: 'states' // Explicitly set collection name
});

export const State = mongoose.model<IState>('State', StateSchema);
