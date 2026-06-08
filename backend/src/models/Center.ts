import mongoose, { Document, Schema } from "mongoose";

export interface ICenter extends Document {
  projectId: mongoose.Types.ObjectId;
  centerName: string;
  address: string;
  country?: string;
  city: string;
  state: string;
  pincode?: string;
  phone?: string;
  email?: string;
  workingHours?: string;
  latitude?: number;
  longitude?: number;
  features?: string[];
  mapLink?: string;
  googleMapLink?: string;
  contacts?: Array<{
    name: string;
    role: string;
    mobile: string;
    email: string;
  }>;
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  // Dashboard: centre capacity target
  idealCount?: number;
  idealCountUpdatedBy?: mongoose.Types.ObjectId;
  idealCountUpdatedAt?: Date;
}

const CenterSchema = new Schema<ICenter>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    centerName: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: String,
      required: true,
    },
    country: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      required: true,
      index: true,
    },
    state: {
      type: String,
      required: true,
      index: true,
    },
    pincode: {
      type: String,
    },
    phone: {
      type: String,
    },
    email: {
      type: String,
    },
    workingHours: {
      type: String,
    },
    latitude: {
      type: Number,
    },
    longitude: {
      type: Number,
    },
    features: [
      {
        type: String,
      },
    ],
    mapLink: {
      type: String,
    },
    googleMapLink: {
      type: String,
    },
    contacts: [
      {
        name: { type: String },
        role: { type: String },
        mobile: { type: String },
        email: { type: String },
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    // Dashboard: centre capacity target
    idealCount: { type: Number, default: null },
    idealCountUpdatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    idealCountUpdatedAt: { type: Date },
  },
  {
    timestamps: true,
  },
);

// Compound index for project + centerName uniqueness
CenterSchema.index({ projectId: 1, centerName: 1 }, { unique: true });

// Index for active centers lookup
CenterSchema.index({ projectId: 1, isActive: 1 });

export const Center = mongoose.model<ICenter>("Center", CenterSchema);
