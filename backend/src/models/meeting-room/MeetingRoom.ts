/**
 * A bookable meeting room, with the rules that govern booking it.
 *
 * Everything a policy needs sits on the room itself: two rooms in the same
 * building routinely differ (the board room needs approval and a day's notice,
 * a huddle room does not), and a shared policy table would be one more thing
 * to keep in step. Floors, amenities and booking purposes are masters so the
 * vocabulary stays the customer's own.
 */
import mongoose, { Document, Schema } from "mongoose";

export type RoomStatus = "active" | "inactive" | "maintenance";

export interface IMeetingRoomWindow {
  /** 0 = Sunday … 6 = Saturday, matching WorkingCalendar. */
  dayOfWeek: number;
  isOpen: boolean;
  /** "HH:mm" in the project's timezone. */
  openTime: string;
  closeTime: string;
}

export interface IMeetingRoomPolicy {
  /** Granularity a booking snaps to, in minutes. */
  slotMinutes: number;
  minDurationMins: number;
  maxDurationMins: number;
  /** Dead time held after / before a booking, for turnaround. */
  bufferBeforeMins: number;
  bufferAfterMins: number;
  /** How far ahead a booking may be made, and how close to the start. */
  maxAdvanceDays: number;
  minNoticeMins: number;
  /** 0 = unlimited. Counted over live bookings. */
  maxActiveBookingsPerUser: number;
  maxHoursPerUserPerWeek: number;
  /** Cancelling later than this many minutes before the start is blocked. */
  cancellationCutoffMins: number;
  /** A booking nobody checks in to is released after the grace period. */
  checkInRequired: boolean;
  checkInWindowMins: number;
  autoReleaseNoShowMins: number;
  allowRecurring: boolean;
  maxOccurrences: number;
  /** Bookings wait for an approver before they hold the room. */
  requiresApproval: boolean;
  /** Whose approval — roles first, then named users. */
  approverRoleIds: mongoose.Types.ObjectId[];
  approverUserIds: mongoose.Types.ObjectId[];
}

export interface IMeetingRoom extends Document {
  projectId: mongoose.Types.ObjectId;
  name: string;
  code: string;
  description?: string;
  /** Where it is: a centre, and a free-text floor / wing from the master. */
  centreId?: mongoose.Types.ObjectId;
  floor?: string;
  building?: string;
  capacity: number;
  /** Amenity codes from the project's amenity master. */
  amenities: string[];
  photoUrl?: string;
  /** Used by the calendar so a room keeps one colour everywhere. */
  colorHex?: string;
  status: RoomStatus;
  /** Empty = open to everyone who may book at all. */
  allowedDepartmentIds: mongoose.Types.ObjectId[];
  allowedRoleIds: mongoose.Types.ObjectId[];
  allowedCentreIds: mongoose.Types.ObjectId[];
  openingHours: IMeetingRoomWindow[];
  /** Holidays come from this calendar; unset = the project default. */
  workingCalendarId?: mongoose.Types.ObjectId;
  policy: IMeetingRoomPolicy;
  /** Yealink room panel / device this room's bookings are pushed to. */
  device?: {
    provider: "yealink" | "none";
    enabled: boolean;
    /** Room account on the device platform (usually its mailbox). */
    roomAccount?: string;
    deviceId?: string;
    lastSyncAt?: Date;
    lastSyncStatus?: "ok" | "failed";
    lastSyncError?: string;
  };
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const WindowSchema = new Schema<IMeetingRoomWindow>(
  {
    dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
    isOpen: { type: Boolean, default: true },
    openTime: { type: String, default: "09:00" },
    closeTime: { type: String, default: "18:00" },
  },
  { _id: false },
);

const PolicySchema = new Schema<IMeetingRoomPolicy>(
  {
    slotMinutes: { type: Number, default: 30, min: 5 },
    minDurationMins: { type: Number, default: 30, min: 5 },
    maxDurationMins: { type: Number, default: 240, min: 5 },
    bufferBeforeMins: { type: Number, default: 0, min: 0 },
    bufferAfterMins: { type: Number, default: 0, min: 0 },
    maxAdvanceDays: { type: Number, default: 60, min: 0 },
    minNoticeMins: { type: Number, default: 0, min: 0 },
    maxActiveBookingsPerUser: { type: Number, default: 0, min: 0 },
    maxHoursPerUserPerWeek: { type: Number, default: 0, min: 0 },
    cancellationCutoffMins: { type: Number, default: 0, min: 0 },
    checkInRequired: { type: Boolean, default: false },
    checkInWindowMins: { type: Number, default: 15, min: 0 },
    autoReleaseNoShowMins: { type: Number, default: 15, min: 0 },
    allowRecurring: { type: Boolean, default: true },
    maxOccurrences: { type: Number, default: 12, min: 1 },
    requiresApproval: { type: Boolean, default: false },
    approverRoleIds: [{ type: Schema.Types.ObjectId, ref: "Role" }],
    approverUserIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  { _id: false },
);

const MeetingRoomSchema = new Schema<IMeetingRoom>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    description: { type: String, trim: true },
    centreId: { type: Schema.Types.ObjectId, ref: "Center", index: true },
    floor: { type: String, trim: true, index: true },
    building: { type: String, trim: true },
    capacity: { type: Number, default: 0, min: 0 },
    amenities: [{ type: String, trim: true }],
    photoUrl: { type: String, trim: true },
    colorHex: { type: String, trim: true, default: "#2563eb" },
    status: {
      type: String,
      enum: ["active", "inactive", "maintenance"],
      default: "active",
      index: true,
    },
    allowedDepartmentIds: [{ type: Schema.Types.ObjectId, ref: "Department" }],
    allowedRoleIds: [{ type: Schema.Types.ObjectId, ref: "Role" }],
    allowedCentreIds: [{ type: Schema.Types.ObjectId, ref: "Center" }],
    openingHours: { type: [WindowSchema], default: undefined },
    workingCalendarId: { type: Schema.Types.ObjectId, ref: "WorkingCalendar" },
    policy: { type: PolicySchema, default: () => ({}) },
    device: {
      provider: { type: String, enum: ["yealink", "none"], default: "none" },
      enabled: { type: Boolean, default: false },
      roomAccount: { type: String, trim: true },
      deviceId: { type: String, trim: true },
      lastSyncAt: { type: Date },
      lastSyncStatus: { type: String, enum: ["ok", "failed"] },
      lastSyncError: { type: String },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

// One code per project; the calendar lists by project + status.
MeetingRoomSchema.index({ projectId: 1, code: 1 }, { unique: true });
MeetingRoomSchema.index({ projectId: 1, status: 1, floor: 1 });

export const MeetingRoom = mongoose.model<IMeetingRoom>(
  "MeetingRoom",
  MeetingRoomSchema,
);
export default MeetingRoom;
