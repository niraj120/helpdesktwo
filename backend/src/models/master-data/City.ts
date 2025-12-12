import mongoose, { Schema, Document } from 'mongoose';

export interface ICity extends Document {
  key: string;
  value: string;
  state: string; // Keep for backward compatibility
  country: string; // Keep for backward compatibility
  stateId: mongoose.Types.ObjectId; // New: Reference to State _id
  countryId: mongoose.Types.ObjectId; // New: Reference to Country _id
  displayOrder?: number;
  isActive: boolean;
}

const CitySchema = new Schema<ICity>({
  key: { type: String, required: true, unique: true },
  value: { type: String, required: true },
  state: { type: String, required: false }, // Optional for backward compatibility
  country: { type: String, required: false }, // Optional for backward compatibility
  stateId: { type: Schema.Types.ObjectId, ref: 'State', required: false }, // Will be required after migration
  countryId: { type: Schema.Types.ObjectId, ref: 'Country', required: false }, // Will be required after migration
  displayOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }
}, {
  timestamps: true,
  collection: 'cities' // Explicitly set collection name
});

export const City = mongoose.model<ICity>('City', CitySchema);
