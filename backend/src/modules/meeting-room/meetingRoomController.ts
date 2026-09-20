/**
 * HTTP layer for the meeting-room module: the setup side (rooms, amenities,
 * purposes, blackouts, Yealink) and the booking side (calendar, book, approve,
 * move, cancel, check in).
 *
 * Permission gating lives on the routes; what an endpoint does with the
 * caller's rights — booking for someone else, cancelling another person's
 * meeting — is decided here, where the record is in hand.
 */
import { Response } from "express";
import mongoose from "mongoose";
import { AuthRequest } from "../../middleware/auth";
import { MeetingRoom } from "../../models/meeting-room/MeetingRoom";
import {
  MeetingBooking,
  LIVE_BOOKING_STATUSES,
} from "../../models/meeting-room/MeetingBooking";
import {
  MeetingRoomAmenity,
  BookingPurpose,
  RoomBlackout,
} from "../../models/meeting-room/MeetingRoomMasters";
import { getProjectScope, canAccessProject } from "../../utils/projectScope";
import { BookingError } from "./bookingRules";
import {
  createBooking,
  decideBooking,
  cancelBooking,
  rescheduleBooking,
  checkInBooking,
  roomAvailability,
  sweepBookings,
} from "./bookingService";
import { pushBookingToDevice } from "./yealinkSync";
import { Project } from "../../models/Project";
import { User } from "../../models/User";

const oid = (id: any) => new mongoose.Types.ObjectId(String(id));

const fail = (res: Response, err: any) => {
  const status = err instanceof BookingError ? err.status : 500;
  if (status === 500) console.error("[meeting-room] error:", err);
  res.status(status).json({
    success: false,
    code: err?.code,
    message: err?.message || "Server error",
  });
};

const actorId = (req: AuthRequest): string => {
  const id = req.user?.userId;
  if (!id) throw new BookingError("Unauthenticated", "UNAUTHENTICATED", 401);
  return id;
};

const hasPerm = (req: AuthRequest, code: string): boolean => {
  const role: any = req.user?.role;
  if (role?.code === "SUPER_ADMIN" || role?.name === "Super Admin") return true;
  return (role?.permissions || []).some((p: any) =>
    typeof p === "string" ? p === code : p?.code === code || p?.name === code,
  );
};

/** Project from the query/body, checked against what the caller may see. */
const scopedProjectId = (req: AuthRequest): string => {
  const projectId = String(req.query.projectId || req.body?.projectId || "");
  if (!projectId) {
    throw new BookingError("projectId is required.", "MISSING_PROJECT", 400);
  }
  if (!canAccessProject(getProjectScope(req), projectId)) {
    throw new BookingError("No access to this project.", "FORBIDDEN", 403);
  }
  return projectId;
};

// ── Rooms (setup) ────────────────────────────────────────────────────────────

export const listRooms = async (req: AuthRequest, res: Response) => {
  try {
    const projectId = scopedProjectId(req);
    const q: any = { projectId: oid(projectId) };
    if (req.query.status && req.query.status !== "all") q.status = req.query.status;
    if (req.query.floor) q.floor = req.query.floor;
    if (req.query.centreId) q.centreId = oid(req.query.centreId);
    if (req.query.minCapacity) q.capacity = { $gte: Number(req.query.minCapacity) };
    if (req.query.amenities) {
      q.amenities = { $all: String(req.query.amenities).split(",").filter(Boolean) };
    }
    const rooms = await MeetingRoom.find(q).sort({ floor: 1, name: 1 }).lean();
    res.json({ success: true, data: rooms });
  } catch (err) {
    fail(res, err);
  }
};

export const getRoom = async (req: AuthRequest, res: Response) => {
  try {
    const room = await MeetingRoom.findById(req.params.id).lean();
    if (!room) throw new BookingError("Meeting room not found.", "NOT_FOUND", 404);
    if (!canAccessProject(getProjectScope(req), String(room.projectId))) {
      throw new BookingError("No access to this project.", "FORBIDDEN", 403);
    }
    res.json({ success: true, data: room });
  } catch (err) {
    fail(res, err);
  }
};

export const createRoom = async (req: AuthRequest, res: Response) => {
  try {
    const projectId = scopedProjectId(req);
    const room = await MeetingRoom.create({
      ...req.body,
      projectId: oid(projectId),
      createdBy: oid(actorId(req)),
    });
    res.status(201).json({ success: true, data: room });
  } catch (err: any) {
    if (err?.code === 11000) {
      return fail(
        res,
        new BookingError("A room with that code already exists.", "DUPLICATE_CODE", 409),
      );
    }
    fail(res, err);
  }
};

export const updateRoom = async (req: AuthRequest, res: Response) => {
  try {
    const room = await MeetingRoom.findById(req.params.id);
    if (!room) throw new BookingError("Meeting room not found.", "NOT_FOUND", 404);
    if (!canAccessProject(getProjectScope(req), String(room.projectId))) {
      throw new BookingError("No access to this project.", "FORBIDDEN", 403);
    }
    const { projectId, _id, ...rest } = req.body || {};
    Object.assign(room, rest, { updatedBy: oid(actorId(req)) });
    await room.save();
    res.json({ success: true, data: room });
  } catch (err) {
    fail(res, err);
  }
};

/**
 * Retiring a room never deletes its history: bookings stay for reporting, so
 * a room with any is deactivated instead.
 */
export const deleteRoom = async (req: AuthRequest, res: Response) => {
  try {
    const room = await MeetingRoom.findById(req.params.id);
    if (!room) throw new BookingError("Meeting room not found.", "NOT_FOUND", 404);
    if (!canAccessProject(getProjectScope(req), String(room.projectId))) {
      throw new BookingError("No access to this project.", "FORBIDDEN", 403);
    }
    const used = await MeetingBooking.countDocuments({ roomId: room._id });
    if (used) {
      room.status = "inactive";
      room.updatedBy = oid(actorId(req));
      await room.save();
      res.json({
        success: true,
        data: room,
        message: `The room has ${used} booking(s), so it was deactivated rather than deleted.`,
      });
      return;
    }
    await room.deleteOne();
    res.json({ success: true });
  } catch (err) {
    fail(res, err);
  }
};

// ── Masters: amenities, purposes, blackouts ──────────────────────────────────

export const listAmenities = async (req: AuthRequest, res: Response) => {
  try {
    const projectId = scopedProjectId(req);
    const data = await MeetingRoomAmenity.find({ projectId: oid(projectId) })
      .sort({ displayOrder: 1, name: 1 })
      .lean();
    res.json({ success: true, data });
  } catch (err) {
    fail(res, err);
  }
};

export const saveAmenity = async (req: AuthRequest, res: Response) => {
  try {
    const projectId = scopedProjectId(req);
    const { _id, code, ...rest } = req.body || {};
    const data = await MeetingRoomAmenity.findOneAndUpdate(
      _id ? { _id } : { projectId: oid(projectId), code: String(code || "").toUpperCase() },
      { ...rest, code: String(code || "").toUpperCase(), projectId: oid(projectId) },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    res.json({ success: true, data });
  } catch (err) {
    fail(res, err);
  }
};

export const deleteAmenity = async (req: AuthRequest, res: Response) => {
  try {
    await MeetingRoomAmenity.deleteOne({ _id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    fail(res, err);
  }
};

export const listPurposes = async (req: AuthRequest, res: Response) => {
  try {
    const projectId = scopedProjectId(req);
    const data = await BookingPurpose.find({ projectId: oid(projectId) })
      .sort({ displayOrder: 1, name: 1 })
      .lean();
    res.json({ success: true, data });
  } catch (err) {
    fail(res, err);
  }
};

export const savePurpose = async (req: AuthRequest, res: Response) => {
  try {
    const projectId = scopedProjectId(req);
    const { _id, code, ...rest } = req.body || {};
    const data = await BookingPurpose.findOneAndUpdate(
      _id ? { _id } : { projectId: oid(projectId), code: String(code || "").toUpperCase() },
      { ...rest, code: String(code || "").toUpperCase(), projectId: oid(projectId) },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    res.json({ success: true, data });
  } catch (err) {
    fail(res, err);
  }
};

export const deletePurpose = async (req: AuthRequest, res: Response) => {
  try {
    await BookingPurpose.deleteOne({ _id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    fail(res, err);
  }
};

export const listBlackouts = async (req: AuthRequest, res: Response) => {
  try {
    const projectId = scopedProjectId(req);
    const q: any = { projectId: oid(projectId) };
    if (req.query.from || req.query.to) {
      q.end = { $gte: new Date(String(req.query.from || Date.now())) };
      if (req.query.to) q.start = { $lte: new Date(String(req.query.to)) };
    }
    const data = await RoomBlackout.find(q).sort({ start: 1 }).lean();
    res.json({ success: true, data });
  } catch (err) {
    fail(res, err);
  }
};

export const createBlackout = async (req: AuthRequest, res: Response) => {
  try {
    const projectId = scopedProjectId(req);
    const data = await RoomBlackout.create({
      ...req.body,
      projectId: oid(projectId),
      createdBy: oid(actorId(req)),
    });
    res.status(201).json({ success: true, data });
  } catch (err) {
    fail(res, err);
  }
};

export const deleteBlackout = async (req: AuthRequest, res: Response) => {
  try {
    await RoomBlackout.deleteOne({ _id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    fail(res, err);
  }
};

// ── Yealink settings (per project) ───────────────────────────────────────────

export const getDeviceConfig = async (req: AuthRequest, res: Response) => {
  try {
    const projectId = scopedProjectId(req);
    const project: any = await Project.findById(projectId)
      .select("configuration.meetingRoom")
      .lean();
    const cfg = project?.configuration?.meetingRoom?.yealink || {};
    // Never hand the stored credential back to a browser.
    res.json({
      success: true,
      data: { ...cfg, authHeaderValue: cfg.authHeaderValue ? "********" : "" },
    });
  } catch (err) {
    fail(res, err);
  }
};

export const updateDeviceConfig = async (req: AuthRequest, res: Response) => {
  try {
    const projectId = scopedProjectId(req);
    const body = { ...(req.body || {}) };
    delete body.projectId;
    // A masked secret means "leave it alone".
    if (body.authHeaderValue === "********") delete body.authHeaderValue;
    const $set: Record<string, any> = {};
    Object.entries(body).forEach(([k, v]) => {
      $set[`configuration.meetingRoom.yealink.${k}`] = v;
    });
    await Project.updateOne({ _id: oid(projectId) }, { $set });
    res.json({ success: true });
  } catch (err) {
    fail(res, err);
  }
};

/** Retry a push that failed, from the booking screen. */
export const retryDeviceSync = async (req: AuthRequest, res: Response) => {
  try {
    await pushBookingToDevice(req.params.id, "update");
    const booking = await MeetingBooking.findById(req.params.id).select("deviceSync").lean();
    res.json({ success: true, data: booking?.deviceSync });
  } catch (err) {
    fail(res, err);
  }
};

// ── Bookings ─────────────────────────────────────────────────────────────────

/** The calendar: every booking for a project's rooms over a range. */
export const listBookings = async (req: AuthRequest, res: Response) => {
  try {
    const projectId = scopedProjectId(req);
    const q: any = { projectId: oid(projectId) };
    if (req.query.roomId) q.roomId = oid(req.query.roomId);
    if (req.query.from || req.query.to) {
      q.start = {};
      if (req.query.from) q.start.$gte = new Date(String(req.query.from));
      if (req.query.to) q.start.$lte = new Date(String(req.query.to));
    }
    if (req.query.status && req.query.status !== "all") {
      q.status = req.query.status;
    } else if (!req.query.includeClosed) {
      q.status = { $in: LIVE_BOOKING_STATUSES };
    }
    if (req.query.scope === "mine") {
      const me = oid(actorId(req));
      q.$or = [{ organizerId: me }, { bookedById: me }, { "attendees.userId": me }];
    }
    if (req.query.purpose) q.purpose = req.query.purpose;
    if (req.query.departmentId) q.departmentId = oid(req.query.departmentId);

    const data = await MeetingBooking.find(q)
      .sort({ start: 1 })
      .limit(Math.min(Number(req.query.limit) || 500, 1000))
      .populate("roomId", "name code colorHex floor capacity")
      .populate("organizerId", "firstName lastName fullName email")
      .lean();
    res.json({ success: true, data });
  } catch (err) {
    fail(res, err);
  }
};

export const getBooking = async (req: AuthRequest, res: Response) => {
  try {
    const booking = await MeetingBooking.findById(req.params.id)
      .populate("roomId", "name code colorHex floor capacity policy device")
      .populate("organizerId", "firstName lastName fullName email")
      .lean();
    if (!booking) throw new BookingError("Booking not found.", "NOT_FOUND", 404);
    if (!canAccessProject(getProjectScope(req), String(booking.projectId))) {
      throw new BookingError("No access to this project.", "FORBIDDEN", 403);
    }
    res.json({ success: true, data: booking });
  } catch (err) {
    fail(res, err);
  }
};

export const availability = async (req: AuthRequest, res: Response) => {
  try {
    const data = await roomAvailability(
      String(req.params.id),
      String(req.query.date || new Date().toISOString()),
    );
    res.json({ success: true, data });
  } catch (err) {
    fail(res, err);
  }
};

export const book = async (req: AuthRequest, res: Response) => {
  try {
    const projectId = scopedProjectId(req);
    const me = actorId(req);
    // Booking for a colleague: the form sends their email, not an id.
    let organizerId = req.body?.organizerId;
    if (!organizerId && req.body?.organizerEmail) {
      const organizer = await User.findOne({
        email: String(req.body.organizerEmail).trim().toLowerCase(),
      })
        .select("_id")
        .lean();
      if (!organizer) {
        throw new BookingError(
          "No user with that email — leave it blank to book for yourself.",
          "ORGANIZER_NOT_FOUND",
        );
      }
      organizerId = String(organizer._id);
    }
    if (organizerId && String(organizerId) !== me && !hasPerm(req, "MEETING_ROOM_BOOK_FOR_OTHERS")) {
      throw new BookingError(
        "You may only book for yourself.",
        "NOT_ALLOWED_FOR_OTHERS",
        403,
      );
    }
    const result = await createBooking({
      ...req.body,
      projectId,
      bookedById: me,
      organizerId: organizerId || me,
    });
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    fail(res, err);
  }
};

export const approve = async (req: AuthRequest, res: Response) => {
  try {
    const data = await decideBooking(
      req.params.id,
      req.body?.approve !== false,
      actorId(req),
      req.body?.remark,
    );
    res.json({ success: true, data });
  } catch (err) {
    fail(res, err);
  }
};

/** Cancelling someone else's booking needs the "any" right. */
export const cancel = async (req: AuthRequest, res: Response) => {
  try {
    const me = actorId(req);
    const booking = await MeetingBooking.findById(req.params.id)
      .select("organizerId bookedById")
      .lean();
    if (!booking) throw new BookingError("Booking not found.", "NOT_FOUND", 404);
    const mine =
      String(booking.organizerId) === me || String(booking.bookedById) === me;
    const any = hasPerm(req, "MEETING_ROOM_CANCEL_ANY");
    if (!mine && !any) {
      throw new BookingError("This is not your booking.", "NOT_YOURS", 403);
    }
    const data = await cancelBooking(req.params.id, me, {
      reason: req.body?.reason,
      scope: req.body?.scope === "series" ? "series" : "one",
      // The cutoff protects colleagues from late changes; it does not bind
      // the people who administer the rooms.
      force: any,
    });
    res.json({ success: true, ...data });
  } catch (err) {
    fail(res, err);
  }
};

export const reschedule = async (req: AuthRequest, res: Response) => {
  try {
    const me = actorId(req);
    const booking = await MeetingBooking.findById(req.params.id)
      .select("organizerId bookedById")
      .lean();
    if (!booking) throw new BookingError("Booking not found.", "NOT_FOUND", 404);
    const mine =
      String(booking.organizerId) === me || String(booking.bookedById) === me;
    if (!mine && !hasPerm(req, "MEETING_ROOM_CANCEL_ANY")) {
      throw new BookingError("This is not your booking.", "NOT_YOURS", 403);
    }
    const data = await rescheduleBooking(req.params.id, me, req.body);
    res.json({ success: true, data });
  } catch (err) {
    fail(res, err);
  }
};

export const checkIn = async (req: AuthRequest, res: Response) => {
  try {
    const data = await checkInBooking(req.params.id, actorId(req));
    res.json({ success: true, data });
  } catch (err) {
    fail(res, err);
  }
};

/** Release no-shows and close finished meetings; also run on a schedule. */
export const runSweep = async (_req: AuthRequest, res: Response) => {
  try {
    const data = await sweepBookings();
    res.json({ success: true, data });
  } catch (err) {
    fail(res, err);
  }
};

/** Utilisation: hours booked, occupancy and no-shows per room. */
export const usageReport = async (req: AuthRequest, res: Response) => {
  try {
    const projectId = scopedProjectId(req);
    const from = new Date(String(req.query.from || Date.now() - 30 * 864e5));
    const to = new Date(String(req.query.to || Date.now()));
    const rows = await MeetingBooking.aggregate([
      { $match: { projectId: oid(projectId), start: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: "$roomId",
          bookings: { $sum: 1 },
          hours: {
            $sum: {
              $divide: [{ $subtract: ["$end", "$start"] }, 1000 * 60 * 60],
            },
          },
          cancelled: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } },
          noShows: { $sum: { $cond: [{ $eq: ["$status", "no_show"] }, 1, 0] } },
          attendees: { $sum: { $ifNull: ["$expectedAttendees", 0] } },
        },
      },
    ]);
    const rooms = await MeetingRoom.find({ projectId: oid(projectId) })
      .select("name code capacity floor")
      .lean();
    const data = rooms.map((room: any) => {
      const row: any = rows.find((r) => String(r._id) === String(room._id)) || {};
      return {
        roomId: String(room._id),
        room: room.name,
        code: room.code,
        floor: room.floor,
        capacity: room.capacity,
        bookings: row.bookings || 0,
        hours: Math.round((row.hours || 0) * 10) / 10,
        cancelled: row.cancelled || 0,
        noShows: row.noShows || 0,
      };
    });
    res.json({ success: true, data, range: { from, to } });
  } catch (err) {
    fail(res, err);
  }
};
