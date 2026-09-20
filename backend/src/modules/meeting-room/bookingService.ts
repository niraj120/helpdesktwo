/**
 * Booking a room, and everything that happens to a booking afterwards:
 * approve, reject, move, cancel, check in, and the sweep that releases a room
 * nobody turned up for.
 *
 * The rules live in bookingRules; this file is the workflow around them.
 */
import mongoose from "mongoose";
import {
  MeetingBooking,
  IMeetingBooking,
  LIVE_BOOKING_STATUSES,
} from "../../models/meeting-room/MeetingBooking";
import { MeetingRoom } from "../../models/meeting-room/MeetingRoom";
import { BookingPurpose } from "../../models/meeting-room/MeetingRoomMasters";
import { User } from "../../models/User";
import { Notification } from "../../models/Notification";
import {
  BookingError,
  assertBookable,
  assertCancellable,
  expandRecurrence,
  holdWindow,
  loadRoom,
} from "./bookingRules";
import { pushBookingSafely } from "./yealinkSync";

const oid = (id: any) => new mongoose.Types.ObjectId(String(id));

export interface CreateBookingInput {
  projectId: string;
  roomId: string;
  title: string;
  purpose?: string;
  agenda?: string;
  start: string | Date;
  end: string | Date;
  /** Booking for someone else needs MEETING_ROOM_BOOK_FOR_OTHERS. */
  organizerId?: string;
  attendees?: Array<{ userId?: string; name?: string; email?: string; external?: boolean }>;
  expectedAttendees?: number;
  notes?: string;
  recurrence?: {
    frequency: "daily" | "weekly" | "monthly";
    interval?: number;
    byWeekday?: number[];
    until?: string | Date;
    count?: number;
  };
  bookedById: string;
}

/** Tell the people who care. Non-fatal — a booking stands without its alert. */
async function notify(
  userIds: (mongoose.Types.ObjectId | string | undefined)[],
  triggerType:
    | "meeting_booking_created"
    | "meeting_booking_awaiting_approval"
    | "meeting_booking_approved"
    | "meeting_booking_rejected"
    | "meeting_booking_cancelled"
    | "meeting_booking_moved",
  title: string,
  body: string,
  booking: { _id: any; projectId: any },
) {
  const ids = Array.from(new Set(userIds.filter(Boolean).map(String)));
  if (!ids.length) return;
  try {
    await Notification.insertMany(
      ids.map((userId) => ({
        recipientUserId: oid(userId),
        projectId: booking.projectId,
        triggerType,
        entityType: "meeting_booking",
        entityId: oid(booking._id),
        title,
        body,
        deepLinkUrl: `/meeting-rooms/bookings/${String(booking._id)}`,
      })),
    );
  } catch (e) {
    console.warn("[meeting-room] notify failed:", (e as any)?.message);
  }
}

/** Who may decide on a booking for this room. */
async function approverIdsFor(room: any): Promise<string[]> {
  const ids = new Set<string>((room.policy?.approverUserIds || []).map(String));
  if (room.policy?.approverRoleIds?.length) {
    const users = await User.find({ role: { $in: room.policy.approverRoleIds } })
      .select("_id")
      .lean();
    users.forEach((u: any) => ids.add(String(u._id)));
  }
  return Array.from(ids);
}

/**
 * Book a room — one meeting, or every occurrence of a repeating one. Each
 * occurrence is checked on its own: a clash on the third Thursday fails the
 * whole request rather than quietly skipping that week.
 */
export async function createBooking(input: CreateBookingInput) {
  const room = await loadRoom(input.roomId);
  const organizerId = input.organizerId || input.bookedById;

  const first = {
    start: new Date(input.start),
    end: new Date(input.end),
  };
  const windows = expandRecurrence(room, first, input.recurrence as any);

  const purpose = input.purpose
    ? await BookingPurpose.findOne({ projectId: room.projectId, code: input.purpose }).lean()
    : null;
  if (purpose?.requiresAgenda && !String(input.agenda || "").trim()) {
    throw new BookingError("This kind of meeting needs an agenda.", "AGENDA_REQUIRED");
  }
  if (purpose?.requiresAttendees && !input.attendees?.length) {
    throw new BookingError("Add who is attending.", "ATTENDEES_REQUIRED");
  }

  for (const w of windows) {
    await assertBookable({
      room,
      window: w,
      organizerId,
      bookedById: input.bookedById,
    });
  }

  const organizer: any = await User.findById(organizerId)
    .select("departmentRef firstName lastName fullName email")
    .lean();
  const needsApproval = !!room.policy?.requiresApproval;
  const seriesId = windows.length > 1 ? new mongoose.Types.ObjectId() : undefined;

  const docs = windows.map((w) => {
    const hold = holdWindow(room, w);
    return {
      projectId: room.projectId,
      roomId: room._id,
      title: input.title,
      purpose: input.purpose,
      agenda: input.agenda,
      start: w.start,
      end: w.end,
      holdStart: hold.start,
      holdEnd: hold.end,
      status: needsApproval ? "pending_approval" : "confirmed",
      organizerId: oid(organizerId),
      bookedById: oid(input.bookedById),
      departmentId: organizer?.departmentRef,
      attendees: (input.attendees || []).map((a) => ({
        ...a,
        userId: a.userId ? oid(a.userId) : undefined,
      })),
      expectedAttendees: input.expectedAttendees,
      notes: input.notes,
      seriesId,
      recurrence: input.recurrence
        ? {
            ...input.recurrence,
            until: input.recurrence.until ? new Date(input.recurrence.until) : undefined,
          }
        : undefined,
      deviceSync: { status: "pending" as const },
      createdBy: oid(input.bookedById),
    };
  });

  const created = await MeetingBooking.insertMany(docs);

  if (needsApproval) {
    const approvers = await approverIdsFor(room);
    await notify(
      approvers,
      "meeting_booking_awaiting_approval",
      "Meeting room booking to approve",
      `${input.title} — ${room.name}, ${first.start.toLocaleString()}`,
      created[0] as any,
    );
  } else {
    created.forEach((b: any) => pushBookingSafely(String(b._id), "create"));
    await notify(
      [organizerId, ...(input.attendees || []).map((a) => a.userId)],
      "meeting_booking_created",
      "Meeting room booked",
      `${input.title} — ${room.name}, ${first.start.toLocaleString()}`,
      created[0] as any,
    );
  }

  return { bookings: created, seriesId: seriesId ? String(seriesId) : undefined };
}

/** Approve or reject a booking waiting on someone. */
export async function decideBooking(
  bookingId: string,
  approve: boolean,
  actorId: string,
  remark?: string,
) {
  const booking: any = await MeetingBooking.findById(bookingId);
  if (!booking) throw new BookingError("Booking not found.", "NOT_FOUND", 404);
  if (booking.status !== "pending_approval") {
    throw new BookingError("This booking is not waiting for approval.", "NOT_PENDING");
  }
  const room = await loadRoom(String(booking.roomId));

  if (approve) {
    // Someone else may have taken the room while this waited.
    await assertBookable({
      room,
      window: { start: booking.start, end: booking.end },
      organizerId: String(booking.organizerId),
      bookedById: String(booking.bookedById),
      ignoreBookingId: String(booking._id),
    });
  }

  booking.status = approve ? "confirmed" : "rejected";
  booking.approval = { decidedBy: oid(actorId), decidedAt: new Date(), remark };
  booking.updatedBy = oid(actorId);
  await booking.save();

  if (approve) pushBookingSafely(String(booking._id), "create");
  await notify(
    [booking.organizerId, booking.bookedById],
    approve ? "meeting_booking_approved" : "meeting_booking_rejected",
    approve ? "Meeting room booking approved" : "Meeting room booking rejected",
    `${booking.title} — ${room.name}, ${booking.start.toLocaleString()}${remark ? ` (${remark})` : ""}`,
    booking,
  );
  return booking;
}

/** Cancel one booking, or the whole series from this occurrence on. */
export async function cancelBooking(
  bookingId: string,
  actorId: string,
  opts: { reason?: string; scope?: "one" | "series"; force?: boolean } = {},
) {
  const booking: any = await MeetingBooking.findById(bookingId);
  if (!booking) throw new BookingError("Booking not found.", "NOT_FOUND", 404);
  if (!LIVE_BOOKING_STATUSES.includes(booking.status)) {
    throw new BookingError("This booking is already closed.", "NOT_LIVE");
  }
  const room = await loadRoom(String(booking.roomId));
  // force = someone with the cancel-any right overriding the cutoff.
  if (!opts.force) assertCancellable(room, booking.start);

  const filter: any =
    opts.scope === "series" && booking.seriesId
      ? {
          seriesId: booking.seriesId,
          start: { $gte: booking.start },
          status: { $in: LIVE_BOOKING_STATUSES },
        }
      : { _id: booking._id };

  const affected = await MeetingBooking.find(filter).select("_id").lean();
  await MeetingBooking.updateMany(filter, {
    $set: {
      status: "cancelled",
      cancellation: { at: new Date(), by: oid(actorId), reason: opts.reason },
      updatedBy: oid(actorId),
    },
  });
  affected.forEach((b: any) => pushBookingSafely(String(b._id), "cancel"));

  await notify(
    [booking.organizerId, booking.bookedById],
    "meeting_booking_cancelled",
    "Meeting room booking cancelled",
    `${booking.title} — ${room.name}, ${booking.start.toLocaleString()}${
      opts.reason ? ` (${opts.reason})` : ""
    }`,
    booking,
  );
  return { cancelled: affected.length };
}

/** Move a booking: same rules as a fresh one, minus itself. */
export async function rescheduleBooking(
  bookingId: string,
  actorId: string,
  next: { start: string | Date; end: string | Date; roomId?: string },
) {
  const booking: any = await MeetingBooking.findById(bookingId);
  if (!booking) throw new BookingError("Booking not found.", "NOT_FOUND", 404);
  if (!LIVE_BOOKING_STATUSES.includes(booking.status)) {
    throw new BookingError("This booking is already closed.", "NOT_LIVE");
  }
  const room = await loadRoom(String(next.roomId || booking.roomId));
  assertCancellable(room, booking.start);

  const window = { start: new Date(next.start), end: new Date(next.end) };
  await assertBookable({
    room,
    window,
    organizerId: String(booking.organizerId),
    bookedById: actorId,
    ignoreBookingId: String(booking._id),
  });

  const hold = holdWindow(room, window);
  const movedFromRoom = String(room._id) !== String(booking.roomId);
  if (movedFromRoom) pushBookingSafely(String(booking._id), "cancel");

  booking.roomId = room._id;
  booking.start = window.start;
  booking.end = window.end;
  booking.holdStart = hold.start;
  booking.holdEnd = hold.end;
  booking.status = room.policy?.requiresApproval ? "pending_approval" : booking.status;
  booking.updatedBy = oid(actorId);
  await booking.save();

  pushBookingSafely(String(booking._id), movedFromRoom ? "create" : "update");
  await notify(
    [booking.organizerId, booking.bookedById],
    "meeting_booking_moved",
    "Meeting room booking moved",
    `${booking.title} — ${room.name}, now ${window.start.toLocaleString()}`,
    booking,
  );
  return booking;
}

/** Someone turned up: hold the room and stop the no-show sweep. */
export async function checkInBooking(bookingId: string, actorId: string) {
  const booking: any = await MeetingBooking.findById(bookingId);
  if (!booking) throw new BookingError("Booking not found.", "NOT_FOUND", 404);
  if (booking.status !== "confirmed") {
    throw new BookingError("Only a confirmed booking can be checked in.", "NOT_CONFIRMED");
  }
  const room = await loadRoom(String(booking.roomId));
  const window = room.policy?.checkInWindowMins ?? 15;
  const opensAt = booking.start.getTime() - window * 60 * 1000;
  if (Date.now() < opensAt) {
    throw new BookingError(
      `Check-in opens ${window} minutes before the meeting.`,
      "TOO_EARLY",
    );
  }
  booking.checkIn = { at: new Date(), by: oid(actorId) };
  booking.updatedBy = oid(actorId);
  await booking.save();
  return booking;
}

/**
 * Release rooms nobody checked into, and close out meetings that have ended.
 * Run on a schedule; safe to run repeatedly.
 */
export async function sweepBookings(): Promise<{ released: number; completed: number }> {
  const now = new Date();
  let released = 0;

  const rooms = await MeetingRoom.find({
    "policy.checkInRequired": true,
    status: "active",
  })
    .select("_id policy.autoReleaseNoShowMins")
    .lean();

  for (const room of rooms as any[]) {
    const grace = room.policy?.autoReleaseNoShowMins ?? 15;
    const cutoff = new Date(now.getTime() - grace * 60 * 1000);
    const res = await MeetingBooking.updateMany(
      {
        roomId: room._id,
        status: "confirmed",
        start: { $lte: cutoff },
        end: { $gt: now },
        "checkIn.at": { $exists: false },
      },
      { $set: { status: "no_show" } },
    );
    released += res.modifiedCount || 0;
  }

  const done = await MeetingBooking.updateMany(
    { status: "confirmed", end: { $lt: now } },
    { $set: { status: "completed" } },
  );

  return { released, completed: done.modifiedCount || 0 };
}

/** Free / busy for a room over a day, for the calendar's slot picker. */
export async function roomAvailability(
  roomId: string,
  dayISO: string,
): Promise<{ slotMinutes: number; busy: Array<{ start: Date; end: Date }> }> {
  const room = await loadRoom(roomId);
  const dayStart = new Date(dayISO);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const busy = await MeetingBooking.find({
    roomId: room._id,
    status: { $in: LIVE_BOOKING_STATUSES },
    holdStart: { $lt: dayEnd },
    holdEnd: { $gt: dayStart },
  })
    .select("holdStart holdEnd")
    .lean();

  return {
    slotMinutes: room.policy?.slotMinutes || 30,
    busy: busy.map((b: any) => ({ start: b.holdStart, end: b.holdEnd })),
  };
}

export type { IMeetingBooking };
