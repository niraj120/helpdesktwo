/**
 * Backfill escalation matrix assignment for existing tickets.
 * Run from backend directory: node scripts/backfill-escalation-matrix.js
 *
 * This script assigns the escalation matrix + sets roleLevelSLA for open tickets
 * that were created before the matrix was configured, or where the assignment failed.
 *
 * Usage:
 *   node scripts/backfill-escalation-matrix.js           # Dry run (no changes)
 *   node scripts/backfill-escalation-matrix.js --apply   # Apply changes
 */

require("dotenv").config({ path: "../.env" });
const mongoose = require("mongoose");

const MHCET_PROJECT_ID = "693bd61817834e29eb111ec2";
const DRY_RUN = !process.argv.includes("--apply");

async function run() {
  const uri =
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    process.env.DATABASE_URL;
  if (!uri) {
    console.error("❌ No MongoDB URI found in environment variables");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("✅ Connected to MongoDB");
  console.log(`📋 Mode: ${DRY_RUN ? "DRY RUN (pass --apply to save changes)" : "APPLY CHANGES"}\n`);

  const db = mongoose.connection.db;

  // Find MHCET matrix with autoEscalate
  const matrix = await db.collection("escalationmatrices").findOne({
    projectIds: {
      $in: [
        new mongoose.Types.ObjectId(MHCET_PROJECT_ID),
        MHCET_PROJECT_ID,
      ],
    },
    isActive: true,
    autoEscalate: true,
  });

  if (!matrix) {
    console.error("❌ No active matrix with autoEscalate=true found for MHCET project.");
    console.error("   Please configure the matrix in the admin panel first.");
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`📋 Found matrix: "${matrix.name}" (${matrix._id})`);

  // Find L1 (level 1) for initial assignment
  const sortedLevels = (matrix.levels || [])
    .filter((l) => l.isActive)
    .sort((a, b) => a.levelNumber - b.levelNumber);

  if (sortedLevels.length === 0) {
    console.error("❌ Matrix has no active levels.");
    await mongoose.disconnect();
    process.exit(1);
  }

  const l1 = sortedLevels[0];
  console.log(`📋 Level 1: "${l1.levelName}" (roleId=${l1.roleId}), slaHours=${l1.slaHours}\n`);

  // Find open MHCET tickets WITHOUT escalationMatrixId
  const tickets = await db
    .collection("tickets")
    .find({
      "metadata.projectId": {
        $in: [
          new mongoose.Types.ObjectId(MHCET_PROJECT_ID),
          MHCET_PROJECT_ID,
        ],
      },
      status: { $in: [1, 2, 3] },
      $or: [
        { escalationMatrixId: { $exists: false } },
        { escalationMatrixId: null },
      ],
    })
    .project({
      ticketNumber: 1,
      status: 1,
      priority: 1,
      createdAt: 1,
      currentEscalationLevelNumber: 1,
    })
    .toArray();

  console.log(`Found ${tickets.length} open tickets without escalationMatrixId.\n`);

  if (tickets.length === 0) {
    console.log("✅ All tickets already have escalationMatrixId set.");
    await mongoose.disconnect();
    return;
  }

  let updated = 0;
  const errors = [];

  for (const ticket of tickets) {
    const now = new Date(ticket.createdAt) || new Date();
    const slaDeadline = new Date(now.getTime() + l1.slaHours * 3600 * 1000);
    const levelNumber = ticket.currentEscalationLevelNumber || 1;

    // Find the correct level for this ticket (in case it was manually escalated)
    const level = sortedLevels.find((l) => l.levelNumber === levelNumber) || l1;
    const deadline = new Date(now.getTime() + level.slaHours * 3600 * 1000);

    console.log(`  Ticket: ${ticket.ticketNumber} (status=${ticket.status}, priority=${ticket.priority})`);
    console.log(`    → Assign matrix: ${matrix._id}`);
    console.log(`    → Set escalationLevel: L${level.levelNumber}`);
    console.log(`    → roleLevelSLA.dueAt: ${deadline.toISOString()}`);

    if (DRY_RUN) {
      console.log(`    [DRY RUN: no changes made]\n`);
      continue;
    }

    try {
      const result = await db.collection("tickets").updateOne(
        { _id: ticket._id },
        {
          $set: {
            escalationMatrixId: matrix._id,
            currentEscalationLevelId: level._id,
            currentEscalationLevelNumber: level.levelNumber,
            roleLevelSLA: {
              startedAt: ticket.createdAt,
              dueAt: deadline,
              breachedAt: undefined,
              pausedAt: undefined,
              pausedDuration: 0,
            },
          },
        },
      );

      if (result.modifiedCount > 0) {
        console.log(`    ✅ Updated\n`);
        updated++;
      } else {
        console.log(`    ⚠️  No change made (already set?)\n`);
      }
    } catch (err) {
      console.error(`    ❌ Error: ${err.message}\n`);
      errors.push(`${ticket.ticketNumber}: ${err.message}`);
    }
  }

  if (!DRY_RUN) {
    console.log(`\n=== Results ===`);
    console.log(`  Updated: ${updated}/${tickets.length} tickets`);
    if (errors.length > 0) {
      console.log(`  Errors (${errors.length}):`);
      errors.forEach((e) => console.log(`    ❌ ${e}`));
    } else {
      console.log(`  ✅ No errors`);
    }
  } else {
    console.log(`\n📋 DRY RUN complete. Re-run with --apply to save changes.`);
  }

  await mongoose.disconnect();
  console.log("✅ Done.");
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
