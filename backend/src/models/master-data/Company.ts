import mongoose, { Schema, Document } from "mongoose";

export interface ICompany extends Document {
  name: string;
  isActive: boolean;
}

const CompanySchema = new Schema<ICompany>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    collection: "companies",
  },
);

export const Company = mongoose.model<ICompany>("Company", CompanySchema);
