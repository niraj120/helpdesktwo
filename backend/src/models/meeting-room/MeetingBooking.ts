/**
 * One booking of a meeting room — and, for a repeating meeting, one occurrence
 * of it. Each occurrence is its own document under a shared `seriesId`: a room
 * is held (or released, or moved) for a single date, and a stored rule would
 * have to be re-expanded on every read to answer "is 3 PM free on Thursday".
 *
 * `holdStart`/`holdEnd` carry the room's turnaround buffers so a clash check is
 * one range query rather than a policy lookup per candidate.
 */
import mongoose, { Document, Schema } from "mongoose";

export type BookingStatus =
  | "pending_approval"
  | "confirmed"
  | "rejected"
  | "cancelled"
  | "completed"
  | "no_show";

export interface IBookingAttendee {
  userId?: mongoose.Types.ObjectId;
  name?: string;
  email?: string;
  /** Someone from outside — a visitor, vendor or candidate. */
  external?: boolean;
}

export interface IMeetingBooking extends Document {
  projectId: mongoose.Types.ObjectId;
  roomId: mongoose.Types.ObjectId;
  title: string;
  /** Purpose code from the project's booking-purpose master. */
  purpose?: string;
  agenda?: string;
  start: Date;
  end: Date;
  /** start/end widened by the room's buffers — what actually blocks the room. */
  holdStart: Date;
  holdEnd: Date;
  status: BookingStatus;
  /** Who the meeting belongs to; may differ from who booked it. */
  organizerId: mongoose.Types.ObjectId;
  bookedById: mongoose.Types.ObjectId;
  departmentId?: mongoose.Types.ObjectId;
  attendees: IBookingAttendee[];
  expectedAttendees?: number;
  /** Repeating meeting: every occurrence shares the series id. */
  seriesId?: mongoose.Types.ObjectId;
  recurrence?: {
    frequency: "daily" | "weekly" | "monthly";
    interval: number;
    /** Weekly: 0-6. Empty = the start day. */
    byWeekday: number[];
    until?: Date;
    count?: number;
  };
  approval?: {
    decidedBy?: mongoose.Types.ObjectId;
    decidedAt?: Date;
    remark?: string;
  };
  checkIn?: {
    at?: Date;
    by?: mongoose.Types.ObjectId;
  };
  cancellation?: {
    at?: Date;
    by?: mongoose.Types.ObjectId;
    reason?: string;
  };
  /** Set when a booking is moved; points at what it replaced. */
  rescheduledFromId?: mongoose.Types.ObjectId;
  /** Push to the room's Yealink panel. */
  deviceSync?: {
    status: "pending" | "synced" | "failed" | "skipped";
    externalId?: string;
    lastAttemptAt?: Date;
    error?: string;
  };
  notes?: string;
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AttendeeSchema = new Schema<IBookingAttendee>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    name: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    external: { type: Boolean, default: false },
  },
  { _id: false },
);

const MeetingBookingSchema = new Schema<IMeetingBooking>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    roomId: {
      type: Schema.Types.ObjectId,
      ref: "MeetingRoom",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    purpose: { type: String, trim: true, index: true },
    agenda: { type: String, trim: true },
    start: { type: Date, required: true, index: true },
    end: { type: Date, required: true },
    holdStart: { type: Date, required: true, index: true },
    holdEnd: { type: Date, required: true },
    status: {
      type: String,
      enum: [
        "pending_approval",
        "confirmed",
        "rejected",
        "cancelled",
        "completed",
        "no_show",
      ],
      default: "confirmed",
      index: true,
    },
    organizerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    bookedById: { type: Schema.Types.ObjectId, ref: "User", required: true },
    departmentId: { type: Schema.Types.ObjectId, ref: "Department", index: true },
    attendees: { type: [AttendeeSchema], default: [] },
    expectedAttendees: { type: Number, min: 0 },
    seriesId: { type: Schema.Types.ObjectId, index: true },
    recurrence: {
      frequency: { type: String, enum: ["daily", "weekly", "monthly"] },
      interval: { type: Number, default: 1, min: 1 },
      byWeekday: [{ type: Number, min: 0, max: 6 }],
      until: { type: Date },
      count: { type: Number, min: 1 },
    },
    approval: {
      decidedBy: { type: Schema.Types.ObjectId, ref: "User" },
      decidedAt: { type: Date },
      remark: { type: String, trim: true },
    },
    checkIn: {
      at: { type: Date },
      by: { type: Schema.Types.ObjectId, ref: "User" },
    },
    cancellation: {
      at: { type: Date },
      by: { type: Schema.Types.ObjectId, ref: "User" },
      reason: { type: String, trim: true },
    },
    rescheduledFromId: { type: Schema.Types.ObjectId, ref: "MeetingBooking" },
    deviceSync: {
      status: {
        type: String,
        enum: ["pending", "synced", "failed", "skipped"],
        default: "skipped",
      },
      externalId: { type: String, trim: true },
      lastAttemptAt: { type: Date },
      error: { type: String },
    },
    notes: { type: String, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

// The clash check: one room, live bookings, overlapping hold window.
MeetingBookingSchema.index({ roomId: 1, status: 1, holdStart: 1, holdEnd: 1 });
// The calendar (a project's rooms over a date range) and "my bookings".
MeetingBookingSchema.index({ projectId: 1, start: 1, status: 1 });
MeetingBookingSchema.index({ organizerId: 1, start: -1 });
// The no-show sweep.
MeetingBookingSchema.index({ status: 1, start: 1 });

/** Statuses that still hold the room. */
export const LIVE_BOOKING_STATUSES: BookingStatus[] = [
  "pending_approval",
  "confirmed",
];

export const MeetingBooking = mongoose.model<IMeetingBooking>(
  "MeetingBooking",
  MeetingBookingSchema,
);
export default MeetingBooking;
