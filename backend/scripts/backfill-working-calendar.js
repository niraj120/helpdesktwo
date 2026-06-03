/**
 * Backfill Script: Apply default working calendar to existing open tickets
 *
 * Run once after setting a working calendar as default for a project:
 *   node backend/scripts/backfill-working-calendar.js
 *
 * What it does:
 *   1. Finds all open/in-progress/on-hold tickets (status 1, 2, 3) that have no
 *      workingCalendarId set (i.e., created before a calendar was configured).
 *   2. For each such ticket, looks up the project's default active working calendar.
 *   3. Recalculates ticketLevelSLA.dueAt using the calendar (working-hours aware)
 *      based on the ticket's original createdAt time + priority resolution time.
 *   4. Updates workingCalendarId + ticketLevelSLA.dueAt + sla_due_at on the ticket.
 *
 * Safe to re-run — only touches tickets that still have no workingCalendarId.
 * --dry-run flag: preview changes without writing to DB.
 *   node backend/scripts/backfill-working-calendar.js --dry-run
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");

const DRY_RUN = process.argv.includes("--dry-run");
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("❌  MONGODB_URI not set in environment.");
  process.exit(1);
}

// ── Minimal inline schemas (avoids full TS compilation) ──────────────────────

const WorkingCalendarSchema = new mongoose.Schema(
  {
    name: String,
    projectId: mongoose.Schema.Types.ObjectId,
    isDefault: Boolean,
    isActive: Boolean,
    workingHours: mongoose.Schema.Types.Mixed,
    workingDays: [Number],
    holidays: [mongoose.Schema.Types.Mixed],
    timezone: String,
  },
  { strict: false },
);
const WorkingCalendar =
  mongoose.models.WorkingCalendar ||
  mongoose.model("WorkingCalendar", WorkingCalendarSchema);

const PrioritySchema = new mongoose.Schema(
  {
    code: String,
    projectId: mongoose.Schema.Types.ObjectId,
    isActive: Boolean,
    resolutionTime: { value: Number, unit: String },
  },
  { strict: false },
);
const Priority =
  mongoose.models.Priority || mongoose.model("Priority", PrioritySchema);

const SLARuleSchema = new mongoose.Schema(
  {
    priority: String,
    projectIds: [mongoose.Schema.Types.ObjectId],
    isActive: Boolean,
    resolutionTime: { value: Number, unit: String },
  },
  { strict: false },
);
const SLARule =
  mongoose.models.SLARule || mongoose.model("SLARule", SLARuleSchema);

const TicketSchema = new mongoose.Schema(
  {
    priority: String,
    status: Number,
    createdAt: Date,
    workingCalendarId: mongoose.Schema.Types.ObjectId,
    ticketLevelSLA: mongoose.Schema.Types.Mixed,
    sla_due_at: Date,
    metadata: mongoose.Schema.Types.Mixed,
  },
  { strict: false },
);
const Ticket =
  mongoose.models.Ticket || mongoose.model("Ticket", TicketSchema);

// ── Helpers ───────────────────────────────────────────────────────────────────

function convertToMinutes(value, unit) {
  switch ((unit || "hours").toLowerCase()) {
    case "minutes":
    case "minute":
      return value;
    case "hours":
    case "hour":
      return value * 60;
    case "days":
    case "day":
      return value * 60 * 24;
    default:
      return value * 60;
  }
}

/**
 * Add `minutes` of working time to `start` using the calendar.
 * Falls back to wall-clock if the calendar has no valid working hours.
 */
function addWorkingMinutes(start, minutes, calendar) {
  if (!calendar || !calendar.workingHours || !calendar.workingDays) {
    // Fallback: plain wall-clock addition
    return new Date(start.getTime() + minutes * 60 * 1000);
  }

  const tz = calendar.timezone || "Asia/Kolkata";
  const workingDays = calendar.workingDays; // e.g. [1,2,3,4,5] (Mon-Fri)

  // Parse working hours (stored as e.g. { start: "09:00", end: "18:00" })
  const [startH, startM] = (calendar.workingHours.start || "09:00")
    .split(":")
    .map(Number);
  const [endH, endM] = (calendar.workingHours.end || "18:00")
    .split(":")
    .map(Number);
  const workStartMin = startH * 60 + startM;
  const workEndMin = endH * 60 + endM;
  const workMinutesPerDay = workEndMin - workStartMin;

  if (workMinutesPerDay <= 0) {
    return new Date(start.getTime() + minutes * 60 * 1000);
  }

  // Build a set of holiday date strings (YYYY-MM-DD) for quick lookup
  const holidaySet = new Set(
    (calendar.holidays || []).map((h) => {
      const d = new Date(h.date || h);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    }),
  );

  const isHoliday = (d) =>
    holidaySet.has(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);

  const isWorkingDay = (d) => workingDays.includes(d.getDay()) && !isHoliday(d);

  let current = new Date(start.getTime());
  let remaining = minutes;

  // If we start outside working hours, advance to the next working start
  const advanceToWorkStart = (d) => {
    while (!isWorkingDay(d)) {
      d.setDate(d.getDate() + 1);
      d.setHours(Math.floor(workStartMin / 60), workStartMin % 60, 0, 0);
    }
    const currentMin = d.getHours() * 60 + d.getMinutes();
    if (currentMin < workStartMin) {
      d.setHours(Math.floor(workStartMin / 60), workStartMin % 60, 0, 0);
    } else if (currentMin >= workEndMin) {
      d.setDate(d.getDate() + 1);
      d.setHours(Math.floor(workStartMin / 60), workStartMin % 60, 0, 0);
      while (!isWorkingDay(d)) {
        d.setDate(d.getDate() + 1);
      }
    }
  };

  advanceToWorkStart(current);

  while (remaining > 0) {
    const currentMin = current.getHours() * 60 + current.getMinutes();
    const minutesLeftToday = workEndMin - currentMin;

    if (remaining <= minutesLeftToday) {
      current = new Date(current.getTime() + remaining * 60 * 1000);
      remaining = 0;
    } else {
      remaining -= minutesLeftToday;
      current.setDate(current.getDate() + 1);
      current.setHours(Math.floor(workStartMin / 60), workStartMin % 60, 0, 0);
      while (!isWorkingDay(current)) {
        current.setDate(current.getDate() + 1);
      }
    }
  }

  return current;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log("✅  Connected to MongoDB");
  if (DRY_RUN) console.log("🔎  DRY RUN — no changes will be written\n");

  // Fetch all open tickets missing a working calendar
  // Status: 1=Open, 2=In-Progress, 3=On-Hold
  const tickets = await Ticket.find({
    status: { $in: [1, 2, 3] },
    workingCalendarId: { $exists: false },
  }).lean();

  console.log(`📋  Found ${tickets.length} open ticket(s) without a working calendar\n`);

  if (tickets.length === 0) {
    console.log("✅  Nothing to do.");
    await mongoose.disconnect();
    return;
  }

  // Cache calendars and priorities per project to avoid repeat DB hits
  const calendarCache = new Map();
  const priorityCache = new Map();

  let updated = 0;
  let skipped = 0;

  for (const ticket of tickets) {
    const projectId = ticket.metadata?.projectId;
    if (!projectId) {
      console.log(`  ⚠️  Ticket ${ticket.ticketNumber || ticket._id} has no projectId — skipping`);
      skipped++;
      continue;
    }

    const projKey = projectId.toString();

    // Get default calendar for this project (cached)
    if (!calendarCache.has(projKey)) {
      const cal = await WorkingCalendar.findOne({
        projectId: new mongoose.Types.ObjectId(projKey),
        isDefault: true,
        isActive: true,
      }).lean();
      calendarCache.set(projKey, cal || null);
    }
    const calendar = calendarCache.get(projKey);

    if (!calendar) {
      console.log(
        `  ⚠️  No default calendar for project ${projKey} — skipping ticket ${ticket.ticketNumber || ticket._id}`,
      );
      skipped++;
      continue;
    }

    // Get priority resolution time (cached per project+priority)
    const prioKey = `${projKey}:${(ticket.priority || "").toUpperCase()}`;
    if (!priorityCache.has(prioKey)) {
      let prio = await Priority.findOne({
        code: (ticket.priority || "").toUpperCase(),
        projectId: new mongoose.Types.ObjectId(projKey),
        isActive: true,
      }).lean();

      if (!prio) {
        // Fallback to SLA rule
        const rule = await SLARule.findOne({
          priority: (ticket.priority || "").toUpperCase(),
          projectIds: new mongoose.Types.ObjectId(projKey),
          isActive: true,
        }).lean();
        if (rule) {
          prio = { code: rule.priority, resolutionTime: rule.resolutionTime };
        }
      }
      priorityCache.set(prioKey, prio || null);
    }
    const priority = priorityCache.get(prioKey);

    const resolutionMinutes = priority
      ? convertToMinutes(
          priority.resolutionTime?.value || 24,
          priority.resolutionTime?.unit || "hours",
        )
      : 24 * 60; // default 24h

    // Recalculate SLA due date using working calendar from ticket's createdAt
    const newDueAt = addWorkingMinutes(
      new Date(ticket.createdAt),
      resolutionMinutes,
      calendar,
    );

    const oldDueAt = ticket.ticketLevelSLA?.dueAt || ticket.sla_due_at;
    console.log(
      `  🎫  ${ticket.ticketNumber || ticket._id}  priority=${ticket.priority}  ` +
        `old_due=${oldDueAt ? new Date(oldDueAt).toISOString() : "none"}  ` +
        `new_due=${newDueAt.toISOString()}  calendar="${calendar.name}"`,
    );

    if (!DRY_RUN) {
      await Ticket.updateOne(
        { _id: ticket._id },
        {
          $set: {
            workingCalendarId: calendar._id,
            sla_due_at: newDueAt,
            "ticketLevelSLA.dueAt": newDueAt,
          },
        },
      );
    }
    updated++;
  }

  console.log(`\n📊  Summary:`);
  console.log(`  Updated : ${updated}`);
  console.log(`  Skipped : ${skipped}`);
  if (DRY_RUN) console.log(`\n  (Dry run — rerun without --dry-run to apply changes)`);

  await mongoose.disconnect();
  console.log("\n✅  Done.");
}

run().catch((err) => {
  console.error("❌  Fatal error:", err);
  process.exit(1);
});
