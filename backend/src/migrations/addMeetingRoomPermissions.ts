/**
 * Seed the meeting-room permissions.
 *
 * Idempotent: every code is upserted, so re-running after adding one is safe.
 * Nothing is granted to any role here except Super Admin, which by design
 * holds everything — who may book, approve or configure is a decision for
 * whoever sets the roles up.
 *
 *   npx ts-node src/migrations/addMeetingRoomPermissions.ts
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../../.env") });

const MODULE = "Meeting Room Booking";
const CATEGORY = "meeting-room";

export const MEETING_ROOM_PERMISSIONS = [
  {
    code: "MEETING_ROOM_ACCESS",
    name: "Access Meeting Rooms",
    description: "Can open the meeting room module at all",
  },
  {
    code: "MEETING_ROOM_VIEW_CALENDAR",
    name: "View Room Calendar",
    description: "Can see rooms and who has booked them",
  },
  {
    code: "MEETING_ROOM_BOOK",
    name: "Book A Room",
    description: "Can book a room for themselves",
  },
  {
    code: "MEETING_ROOM_BOOK_FOR_OTHERS",
    name: "Book On Behalf Of Others",
    description: "Can raise a booking with someone else as the organiser",
  },
  {
    code: "MEETING_ROOM_CANCEL_OWN",
    name: "Cancel Own Booking",
    description: "Can cancel bookings they raised or organise",
  },
  {
    code: "MEETING_ROOM_CANCEL_ANY",
    name: "Cancel Any Booking",
    description:
      "Can cancel or move anyone's booking, and is not bound by the room's cancellation cut-off",
  },
  {
    code: "MEETING_ROOM_RESCHEDULE",
    name: "Reschedule Booking",
    description: "Can move their own booking to another time or room",
  },
  {
    code: "MEETING_ROOM_APPROVE",
    name: "Approve Bookings",
    description: "Can approve or reject bookings for rooms that need it",
  },
  {
    code: "MEETING_ROOM_CHECK_IN",
    name: "Check In To A Booking",
    description: "Can confirm attendance so the room is not auto-released",
  },
  {
    code: "MEETING_ROOM_MANAGE_ROOMS",
    name: "Manage Rooms",
    description: "Can add, edit, deactivate rooms and set their booking rules",
  },
  {
    code: "MEETING_ROOM_MANAGE_MASTERS",
    name: "Manage Amenities & Purposes",
    description: "Can maintain the amenity and booking-purpose masters",
  },
  {
    code: "MEETING_ROOM_MANAGE_BLACKOUTS",
    name: "Manage Blackouts",
    description: "Can close a room or a floor for maintenance or an event",
  },
  {
    code: "MEETING_ROOM_MANAGE_DEVICE",
    name: "Manage Room Devices",
    description: "Can configure the Yealink panels and retry a failed push",
  },
  {
    code: "MEETING_ROOM_REPORTS_VIEW",
    name: "View Room Reports",
    description: "Can see utilisation, cancellations and no-shows",
  },
].map((p) => ({ ...p, module: MODULE, category: CATEGORY }));

export async function seedMeetingRoomPermissions(): Promise<{
  created: number;
  updated: number;
}> {
  const Permission =
    mongoose.models.Permission ||
    mongoose.model(
      "Permission",
      new mongoose.Schema(
        {
          module: String,
          name: String,
          code: { type: String, unique: true },
          description: String,
          category: String,
          isActive: { type: Boolean, default: true },
        },
        { timestamps: true },
      ),
    );

  let created = 0;
  let updated = 0;
  const ids: mongoose.Types.ObjectId[] = [];
  for (const perm of MEETING_ROOM_PERMISSIONS) {
    const existing = await Permission.findOne({ code: perm.code });
    const doc = await Permission.findOneAndUpdate(
      { code: perm.code },
      { ...perm, isActive: true },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    ids.push(doc._id);
    if (existing) updated++;
    else created++;
  }

  // Super Admin holds every permission by definition.
  const Role = mongoose.models.Role;
  if (Role) {
    await Role.updateOne(
      { code: "SUPER_ADMIN" },
      { $addToSet: { permissions: { $each: ids } } },
    );
  }
  return { created, updated };
}

if (require.main === module) {
  (async () => {
    await mongoose.connect(process.env.MONGODB_URI as string);
    // Pull the real models in so Role is registered before we touch it.
    await import("../models/Permission");
    await import("../models/Role");
    const { created, updated } = await seedMeetingRoomPermissions();
    console.log(
      `Meeting room permissions seeded — ${created} created, ${updated} already present.`,
    );
    await mongoose.disconnect();
  })().catch((e) => {
    console.error("FAILED", e.message);
    process.exit(1);
  });
}
