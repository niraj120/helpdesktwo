import mongoose, { Schema, Document } from 'mongoose';

export interface ICountry extends Document {
  key: string;
  value: string;
  code: string; // ISO country code
  displayOrder?: number;
  isActive: boolean;
}

const CountrySchema = new Schema<ICountry>({
  key: { type: String, required: true, unique: true },
  value: { type: String, required: true },
  code: { type: String, required: true, uppercase: true },
  displayOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }
}, {
  timestamps: true,
  collection: 'countries'
});

export const Country = mongoose.model<ICountry>('Country', CountrySchema);
