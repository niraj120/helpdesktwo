import mongoose, { Schema, Document } from 'mongoose';

export interface IEulaAcceptance extends Document {
  userId: mongoose.Types.ObjectId;
  version: string;
  acceptedAt: Date;
  ipAddress?: string;
}

const EulaAcceptanceSchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    version: {
      type: String,
      required: true,
      default: '1.0',
    },
    acceptedAt: {
      type: Date,
      default: Date.now,
    },
    ipAddress: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
EulaAcceptanceSchema.index({ userId: 1, version: 1 });

export const EulaAcceptance = mongoose.model<IEulaAcceptance>('EulaAcceptance', EulaAcceptanceSchema);
export default EulaAcceptance;
