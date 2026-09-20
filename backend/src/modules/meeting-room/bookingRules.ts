/**
 * Every rule that decides whether a room may be booked, in one place.
 *
 * The booking endpoints stay thin on purpose: a clash, a closed room, a quota
 * and a restriction are all "no" to the person asking, and they should be
 * answered the same way whether the request came from the calendar, an admin
 * booking on someone's behalf, or a repeat of an existing meeting.
 *
 * Nothing here is hardcoded to a customer's setup: hours, buffers, quotas,
 * approvals and who may use a room all come off the room document.
 */
import mongoose from "mongoose";
import { MeetingRoom, IMeetingRoom } from "../../models/meeting-room/MeetingRoom";
import {
  MeetingBooking,
  LIVE_BOOKING_STATUSES,
} from "../../models/meeting-room/MeetingBooking";
import { RoomBlackout } from "../../models/meeting-room/MeetingRoomMasters";
import { User } from "../../models/User";
import WorkingCalendar from "../../models/WorkingCalendar";

export class BookingError extends Error {
  status: number;
  code: string;
  constructor(message: string, code = "BOOKING_REJECTED", status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const oid = (id: any) => new mongoose.Types.ObjectId(String(id));
const MIN = 60 * 1000;

/** "HH:mm" → minutes past midnight. */
const hhmm = (value: string): number => {
  const [h, m] = String(value || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

const minutesInDay = (d: Date) => d.getHours() * 60 + d.getMinutes();

export interface BookingWindow {
  start: Date;
  end: Date;
}

/** The window the room is actually held for, buffers included. */
export const holdWindow = (room: IMeetingRoom, w: BookingWindow): BookingWindow => ({
  start: new Date(w.start.getTime() - (room.policy?.bufferBeforeMins || 0) * MIN),
  end: new Date(w.end.getTime() + (room.policy?.bufferAfterMins || 0) * MIN),
});

export async function loadRoom(roomId: string): Promise<IMeetingRoom> {
  const room = await MeetingRoom.findById(roomId);
  if (!room) throw new BookingError("Meeting room not found.", "ROOM_NOT_FOUND", 404);
  return room;
}

/**
 * May this person book this room at all? Rooms can be limited to departments,
 * roles or centres; an empty list means no limit.
 */
export async function assertRoomAllowed(room: IMeetingRoom, userId: string) {
  if (room.status !== "active") {
    throw new BookingError(
      room.status === "maintenance"
        ? "This room is under maintenance."
        : "This room is not open for booking.",
      "ROOM_UNAVAILABLE",
    );
  }
  const limits = [
    room.allowedDepartmentIds?.length,
    room.allowedRoleIds?.length,
    room.allowedCentreIds?.length,
  ].some(Boolean);
  if (!limits) return;

  const user: any = await User.findById(userId)
    .select("role departmentRef department centreId centers")
    .lean();
  if (!user) throw new BookingError("User not found.", "USER_NOT_FOUND", 404);

  const has = (list: any[], value: any) =>
    !list?.length || list.some((x) => String(x) === String(value));
  const hasAny = (list: any[], values: any[]) =>
    !list?.length || values.some((v) => list.some((x) => String(x) === String(v)));

  const centres = [
    user.centreId,
    ...(Array.isArray(user.centers) ? user.centers : []),
  ].filter(Boolean);

  const ok =
    has(room.allowedDepartmentIds as any[], user.departmentRef) &&
    has(room.allowedRoleIds as any[], user.role?._id || user.role) &&
    hasAny(room.allowedCentreIds as any[], centres);
  if (!ok) {
    throw new BookingError(
      "This room is reserved for other departments or locations.",
      "ROOM_RESTRICTED",
      403,
    );
  }
}

/** The room's opening window for that weekday, or null when it is shut. */
const openingFor = (room: IMeetingRoom, day: number) => {
  const hours = room.openingHours || [];
  if (!hours.length) return { open: 0, close: 24 * 60 }; // unset = all day
  const win = hours.find((h) => h.dayOfWeek === day);
  if (!win || !win.isOpen) return null;
  return { open: hhmm(win.openTime), close: hhmm(win.closeTime) };
};

/** Opening hours, holidays, notice, duration, and how far ahead. */
export async function assertWithinPolicy(room: IMeetingRoom, w: BookingWindow) {
  const p = room.policy || ({} as any);
  const now = new Date();
  const mins = (w.end.getTime() - w.start.getTime()) / MIN;

  if (!(w.end > w.start)) {
    throw new BookingError("The meeting must end after it starts.", "BAD_RANGE");
  }
  if (p.minDurationMins && mins < p.minDurationMins) {
    throw new BookingError(
      `Bookings are at least ${p.minDurationMins} minutes.`,
      "TOO_SHORT",
    );
  }
  if (p.maxDurationMins && mins > p.maxDurationMins) {
    throw new BookingError(
      `Bookings run to at most ${p.maxDurationMins} minutes in this room.`,
      "TOO_LONG",
    );
  }
  if (p.slotMinutes && minutesInDay(w.start) % p.slotMinutes !== 0) {
    throw new BookingError(
      `Start times run every ${p.slotMinutes} minutes.`,
      "OFF_SLOT",
    );
  }
  if (w.start.getTime() < now.getTime()) {
    throw new BookingError("That time has already passed.", "IN_THE_PAST");
  }
  if (p.minNoticeMins && w.start.getTime() - now.getTime() < p.minNoticeMins * MIN) {
    throw new BookingError(
      `This room needs ${p.minNoticeMins} minutes' notice.`,
      "TOO_SOON",
    );
  }
  if (p.maxAdvanceDays) {
    const horizon = new Date(now.getTime() + p.maxAdvanceDays * 24 * 60 * MIN);
    if (w.start > horizon) {
      throw new BookingError(
        `This room can be booked up to ${p.maxAdvanceDays} days ahead.`,
        "TOO_FAR_AHEAD",
      );
    }
  }

  // Opening hours — a meeting may not straddle a day either.
  if (w.start.toDateString() !== w.end.toDateString()) {
    throw new BookingError(
      "A booking has to start and end on the same day.",
      "SPANS_DAYS",
    );
  }
  const opening = openingFor(room, w.start.getDay());
  if (!opening) {
    throw new BookingError("The room is closed that day.", "ROOM_CLOSED");
  }
  if (minutesInDay(w.start) < opening.open || minutesInDay(w.end) > opening.close) {
    throw new BookingError(
      "That is outside the room's opening hours.",
      "OUTSIDE_HOURS",
    );
  }

  // Holidays, from the room's calendar or the project default.
  const calendar: any = room.workingCalendarId
    ? await WorkingCalendar.findById(room.workingCalendarId).lean()
    : await WorkingCalendar.findOne({
        projectId: room.projectId,
        isActive: true,
        isDefault: true,
      }).lean();
  const day = w.start.toISOString().slice(0, 10);
  const holiday = (calendar?.holidays || []).find((h: any) => {
    const d = new Date(h.date);
    if (Number.isNaN(d.getTime())) return false;
    if (h.isRecurring) {
      return d.toISOString().slice(5, 10) === day.slice(5, 10);
    }
    return d.toISOString().slice(0, 10) === day;
  });
  if (holiday) {
    throw new BookingError(
      `${holiday.name || "A holiday"} — the room is closed.`,
      "HOLIDAY",
    );
  }
}

/** Nothing else may hold the room over the same window. */
export async function assertNoClash(
  room: IMeetingRoom,
  w: BookingWindow,
  ignoreBookingId?: string,
) {
  const hold = holdWindow(room, w);
  const clash = await MeetingBooking.findOne({
    roomId: room._id,
    status: { $in: LIVE_BOOKING_STATUSES },
    ...(ignoreBookingId ? { _id: { $ne: oid(ignoreBookingId) } } : {}),
    holdStart: { $lt: hold.end },
    holdEnd: { $gt: hold.start },
  })
    .select("title start end organizerId")
    .lean();
  if (clash) {
    throw new BookingError(
      `The room is taken from ${new Date(clash.start).toLocaleTimeString()} to ${new Date(
        clash.end,
      ).toLocaleTimeString()}.`,
      "CLASH",
      409,
    );
  }

  const blackout = await RoomBlackout.findOne({
    projectId: room.projectId,
    $or: [{ roomId: room._id }, { roomId: { $exists: false }, floor: room.floor }, { roomId: null, floor: null }],
    start: { $lt: hold.end },
    end: { $gt: hold.start },
  }).lean();
  if (blackout) {
    throw new BookingError(
      `The room is blocked then: ${blackout.reason}.`,
      "BLACKOUT",
      409,
    );
  }
}

/** Per-person limits: how many live bookings, and how many hours a week. */
export async function assertQuota(
  room: IMeetingRoom,
  organizerId: string,
  w: BookingWindow,
  ignoreBookingId?: string,
) {
  const p = room.policy || ({} as any);
  const base: any = {
    organizerId: oid(organizerId),
    status: { $in: LIVE_BOOKING_STATUSES },
    ...(ignoreBookingId ? { _id: { $ne: oid(ignoreBookingId) } } : {}),
  };

  if (p.maxActiveBookingsPerUser) {
    const live = await MeetingBooking.countDocuments({
      ...base,
      projectId: room.projectId,
      end: { $gte: new Date() },
    });
    if (live >= p.maxActiveBookingsPerUser) {
      throw new BookingError(
        `You already hold ${live} upcoming bookings — the limit is ${p.maxActiveBookingsPerUser}.`,
        "QUOTA_BOOKINGS",
      );
    }
  }

  if (p.maxHoursPerUserPerWeek) {
    const weekStart = new Date(w.start);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const rows = await MeetingBooking.find({
      ...base,
      projectId: room.projectId,
      start: { $gte: weekStart, $lt: weekEnd },
    })
      .select("start end")
      .lean();
    const booked = rows.reduce(
      (sum, r: any) => sum + (new Date(r.end).getTime() - new Date(r.start).getTime()) / (60 * MIN),
      0,
    );
    const asked = (w.end.getTime() - w.start.getTime()) / (60 * MIN);
    if (booked + asked > p.maxHoursPerUserPerWeek) {
      throw new BookingError(
        `That would put you over ${p.maxHoursPerUserPerWeek} booked hours this week.`,
        "QUOTA_HOURS",
      );
    }
  }
}

/** Seats: a warning, not a block — people stand. */
export const capacityNote = (room: IMeetingRoom, expected?: number) =>
  expected && room.capacity && expected > room.capacity
    ? `${expected} people in a room that seats ${room.capacity}.`
    : undefined;

/** Everything, in the order a person would ask it. */
export async function assertBookable(opts: {
  room: IMeetingRoom;
  window: BookingWindow;
  organizerId: string;
  bookedById: string;
  ignoreBookingId?: string;
}) {
  await assertRoomAllowed(opts.room, opts.organizerId);
  await assertWithinPolicy(opts.room, opts.window);
  await assertNoClash(opts.room, opts.window, opts.ignoreBookingId);
  await assertQuota(opts.room, opts.organizerId, opts.window, opts.ignoreBookingId);
}

/** Cancelling / moving a booking this close to the start is blocked. */
export function assertCancellable(room: IMeetingRoom, start: Date) {
  const cutoff = room.policy?.cancellationCutoffMins || 0;
  if (!cutoff) return;
  if (start.getTime() - Date.now() < cutoff * MIN) {
    throw new BookingError(
      `Bookings cannot be changed within ${cutoff} minutes of the start.`,
      "CANCEL_CUTOFF",
    );
  }
}

/**
 * The dates a repeating meeting falls on. Capped by the room's policy so a
 * daily meeting cannot quietly hold a room for a year.
 */
export function expandRecurrence(
  room: IMeetingRoom,
  first: BookingWindow,
  rule?: {
    frequency: "daily" | "weekly" | "monthly";
    interval?: number;
    byWeekday?: number[];
    until?: Date;
    count?: number;
  },
): BookingWindow[] {
  if (!rule?.frequency) return [first];
  if (!room.policy?.allowRecurring) {
    throw new BookingError("This room does not take repeating bookings.", "NO_RECURRENCE");
  }
  const maxOccurrences = room.policy.maxOccurrences || 12;
  const wanted = Math.min(rule.count || maxOccurrences, maxOccurrences);
  const interval = Math.max(1, rule.interval || 1);
  const durationMs = first.end.getTime() - first.start.getTime();
  const out: BookingWindow[] = [];
  const weekdays = rule.byWeekday?.length ? rule.byWeekday : [first.start.getDay()];

  const cursor = new Date(first.start);
  let guard = 0;
  while (out.length < wanted && guard < 400) {
    guard++;
    const candidate = new Date(cursor);
    const matches =
      rule.frequency === "weekly" ? weekdays.includes(candidate.getDay()) : true;
    if (matches && candidate >= first.start) {
      if (rule.until && candidate > new Date(rule.until)) break;
      out.push({
        start: new Date(candidate),
        end: new Date(candidate.getTime() + durationMs),
      });
    }
    if (rule.frequency === "daily") cursor.setDate(cursor.getDate() + interval);
    else if (rule.frequency === "weekly") cursor.setDate(cursor.getDate() + 1);
    else cursor.setMonth(cursor.getMonth() + interval);
  }
  if (!out.length) {
    throw new BookingError("That repeat rule produces no dates.", "EMPTY_RECURRENCE");
  }
  return out;
}
