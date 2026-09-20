/**
 * Meeting room module routes.
 *
 * Two surfaces, two sets of rights: the setup side (rooms, amenities,
 * purposes, blackouts, device) is MEETING_ROOM_MANAGE_*, the booking side is
 * MEETING_ROOM_BOOK / VIEW. Everyone who gets in at all holds
 * MEETING_ROOM_ACCESS, the same shape the SR module uses.
 */
import { Router } from "express";
import { authMiddleware } from "../../middleware/auth";
import { checkPermission } from "../../middleware/permissions";
import * as c from "./meetingRoomController";

const router = Router();
router.use(authMiddleware);
router.use(checkPermission("MEETING_ROOM_ACCESS"));

const VIEW = ["MEETING_ROOM_VIEW_CALENDAR", "MEETING_ROOM_BOOK", "MEETING_ROOM_MANAGE_ROOMS"];
const MANAGE_ROOMS = "MEETING_ROOM_MANAGE_ROOMS";
const MANAGE_MASTERS = ["MEETING_ROOM_MANAGE_MASTERS", "MEETING_ROOM_MANAGE_ROOMS"];

// ── Setup ────────────────────────────────────────────────────────────────────
router.get("/amenities", checkPermission(VIEW), c.listAmenities);
router.post("/amenities", checkPermission(MANAGE_MASTERS), c.saveAmenity);
router.delete("/amenities/:id", checkPermission(MANAGE_MASTERS), c.deleteAmenity);

router.get("/purposes", checkPermission(VIEW), c.listPurposes);
router.post("/purposes", checkPermission(MANAGE_MASTERS), c.savePurpose);
router.delete("/purposes/:id", checkPermission(MANAGE_MASTERS), c.deletePurpose);

router.get("/blackouts", checkPermission(VIEW), c.listBlackouts);
router.post("/blackouts", checkPermission("MEETING_ROOM_MANAGE_BLACKOUTS"), c.createBlackout);
router.delete("/blackouts/:id", checkPermission("MEETING_ROOM_MANAGE_BLACKOUTS"), c.deleteBlackout);

router.get("/device-config", checkPermission("MEETING_ROOM_MANAGE_DEVICE"), c.getDeviceConfig);
router.put("/device-config", checkPermission("MEETING_ROOM_MANAGE_DEVICE"), c.updateDeviceConfig);

router.get("/reports/usage", checkPermission("MEETING_ROOM_REPORTS_VIEW"), c.usageReport);

// ── Bookings (static paths before the room/:id routes) ───────────────────────
router.get("/bookings", checkPermission(VIEW), c.listBookings);
router.post("/bookings", checkPermission("MEETING_ROOM_BOOK"), c.book);
router.post("/bookings/sweep", checkPermission(MANAGE_ROOMS), c.runSweep);
router.get("/bookings/:id", checkPermission(VIEW), c.getBooking);
router.post("/bookings/:id/approve", checkPermission("MEETING_ROOM_APPROVE"), c.approve);
router.post(
  "/bookings/:id/cancel",
  checkPermission(["MEETING_ROOM_CANCEL_OWN", "MEETING_ROOM_CANCEL_ANY"]),
  c.cancel,
);
router.post(
  "/bookings/:id/reschedule",
  checkPermission(["MEETING_ROOM_RESCHEDULE", "MEETING_ROOM_CANCEL_ANY"]),
  c.reschedule,
);
router.post("/bookings/:id/check-in", checkPermission(["MEETING_ROOM_BOOK", "MEETING_ROOM_CHECK_IN"]), c.checkIn);
router.post(
  "/bookings/:id/device-sync",
  checkPermission("MEETING_ROOM_MANAGE_DEVICE"),
  c.retryDeviceSync,
);

// ── Rooms ────────────────────────────────────────────────────────────────────
router.get("/", checkPermission(VIEW), c.listRooms);
router.post("/", checkPermission(MANAGE_ROOMS), c.createRoom);
router.get("/:id", checkPermission(VIEW), c.getRoom);
router.put("/:id", checkPermission(MANAGE_ROOMS), c.updateRoom);
router.delete("/:id", checkPermission(MANAGE_ROOMS), c.deleteRoom);
router.get("/:id/availability", checkPermission(VIEW), c.availability);

export default router;
