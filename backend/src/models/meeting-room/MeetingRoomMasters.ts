/**
 * The vocabulary the meeting-room module is configured with: amenities a room
 * can have, and the purposes a booking is made for. Both are per project so a
 * customer's own words show up on the booking form, and both are masters
 * rather than enums so adding "Hybrid camera" or "Interview" is a setting.
 *
 * Blackouts live here too: a room (or a whole floor) closed for maintenance,
 * an audit, or a holiday, for a stretch of time.
 */
import mongoose, { Document, Schema } from "mongoose";

export interface IMeetingRoomAmenity extends Document {
  projectId: mongoose.Types.ObjectId;
  code: string;
  name: string;
  icon?: string;
  displayOrder: number;
  isActive: boolean;
}

const AmenitySchema = new Schema<IMeetingRoomAmenity>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    icon: { type: String, trim: true },
    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);
AmenitySchema.index({ projectId: 1, code: 1 }, { unique: true });

export const MeetingRoomAmenity = mongoose.model<IMeetingRoomAmenity>(
  "MeetingRoomAmenity",
  AmenitySchema,
);

export interface IBookingPurpose extends Document {
  projectId: mongoose.Types.ObjectId;
  code: string;
  name: string;
  /** Drawn on the calendar in this colour. */
  colorHex?: string;
  /** Ask who is coming in — visitor meetings usually need the names. */
  requiresAttendees: boolean;
  requiresAgenda: boolean;
  displayOrder: number;
  isActive: boolean;
}

const PurposeSchema = new Schema<IBookingPurpose>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    colorHex: { type: String, trim: true, default: "#2563eb" },
    requiresAttendees: { type: Boolean, default: false },
    requiresAgenda: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);
PurposeSchema.index({ projectId: 1, code: 1 }, { unique: true });

export const BookingPurpose = mongoose.model<IBookingPurpose>(
  "BookingPurpose",
  PurposeSchema,
);

export interface IRoomBlackout extends Document {
  projectId: mongoose.Types.ObjectId;
  /** Unset = every room on the floor / in the project. */
  roomId?: mongoose.Types.ObjectId;
  floor?: string;
  reason: string;
  start: Date;
  end: Date;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const BlackoutSchema = new Schema<IRoomBlackout>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    roomId: { type: Schema.Types.ObjectId, ref: "MeetingRoom", index: true },
    floor: { type: String, trim: true },
    reason: { type: String, required: true, trim: true },
    start: { type: Date, required: true, index: true },
    end: { type: Date, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);
BlackoutSchema.index({ projectId: 1, start: 1, end: 1 });

export const RoomBlackout = mongoose.model<IRoomBlackout>(
  "RoomBlackout",
  BlackoutSchema,
);
