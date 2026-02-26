/**
 * Backfill Script: Populate slaRuleId on all existing Tickets
 *
 * Run once after deploying the slaRuleId field:
 *   node backend/scripts/backfill-slaRuleId.js
 *
 * What it does:
 *   For every ticket that has no slaRuleId, it finds the matching active SLA rule
 *   by project + priority name and sets ticket.slaRuleId = slaRule._id.
 *
 *   After this runs, the dashboard uses ObjectId matching exclusively (rename-resilient).
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("❌  MONGODB_URI not set in environment.");
  process.exit(1);
}

// ── Minimal schemas (avoid full TS compilation) ──────────────────────────────

const SLARuleSchema = new mongoose.Schema({
  name: String,
  projectIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Project" }],
  isActive: { type: Boolean, default: true },
  dashboardCategory: { type: String, enum: ["high", "medium", "low"] },
});
const SLARule =
  mongoose.models.SLARule || mongoose.model("SLARule", SLARuleSchema);

const TicketSchema = new mongoose.Schema(
  {
    priority: { type: String, uppercase: true, trim: true },
    slaRuleId: { type: mongoose.Schema.Types.ObjectId, ref: "SLARule" },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { strict: false },
);
const Ticket = mongoose.models.Ticket || mongoose.model("Ticket", TicketSchema);

// ─────────────────────────────────────────────────────────────────────────────

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log("✅  Connected to MongoDB");

  // Load all active SLA rules once
  const slaRules = await SLARule.find({ isActive: true })
    .select("_id name projectIds")
    .lean();
  console.log(`📋  Loaded ${slaRules.length} active SLA rules`);

  // Build a lookup map:  projectId_STRIG + ":" + priorityNameUpper  →  slaRule._id
  const ruleMap = new Map();
  for (const rule of slaRules) {
    for (const pid of rule.projectIds || []) {
      const key = `${pid.toString()}:${rule.name.toUpperCase()}`;
      ruleMap.set(key, rule._id);
    }
  }

  // Find tickets without slaRuleId
  const tickets = await Ticket.find({ slaRuleId: { $exists: false } })
    .select("_id priority metadata")
    .lean();
  console.log(`🎫  Found ${tickets.length} tickets missing slaRuleId`);

  let updated = 0;
  let skipped = 0;

  for (const ticket of tickets) {
    const projectId = ticket.metadata?.projectId?.toString();
    const priorityUpper = (ticket.priority || "").toUpperCase();

    if (!projectId || !priorityUpper) {
      skipped++;
      continue;
    }

    const slaRuleId = ruleMap.get(`${projectId}:${priorityUpper}`);

    if (!slaRuleId) {
      skipped++;
      continue;
    }

    await Ticket.updateOne({ _id: ticket._id }, { $set: { slaRuleId } });
    updated++;
  }

  console.log(`\n🏁  Backfill complete`);
  console.log(`   ✅  Updated : ${updated} tickets`);
  console.log(`   ⚠️   Skipped : ${skipped} tickets (no matching SLA rule found)`);

  await mongoose.disconnect();
  console.log("🔌  Disconnected from MongoDB");
}

run().catch((err) => {
  console.error("❌  Backfill failed:", err);
  mongoose.disconnect();
  process.exit(1);
});
