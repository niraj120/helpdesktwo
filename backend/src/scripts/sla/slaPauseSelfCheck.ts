/**
 * Read-only check of the SLA hold maths. Uses a ticket id that does not exist,
 * so the SLATracking lookups find nothing and nothing is written anywhere.
 */
import "dotenv/config";
import mongoose from "mongoose";
import { syncSlaPause, resumeDueSlaPauses } from "../../services/slaPause";

const H = 3600 * 1000;
const fmt = (d: any) => (d ? new Date(d).toISOString().slice(0, 16) : "—");

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);

  const created = new Date(Date.now() - 13 * H);
  const dueAt = new Date(created.getTime() + 24 * H); // 24h SLA → 11h left
  const ticket: any = {
    _id: new mongoose.Types.ObjectId(), // does not exist → tracking untouched
    interactionType: "PSR",
    status: 1,
    ticketLevelSLA: { dueAt, pausedDuration: 0 },
    roleLevelSLA: { startedAt: created, dueAt, pausedDuration: 0 },
    wip: {},
  };
  const wip = { code: 2, name: "WIP", rules: { sr: { pauseSla: true, pauseUntil: "committedDate" } } };
  const resolved = { code: 4, name: "Resolved", rules: { sr: {} } };

  const now = new Date();
  const committed = new Date(now.getTime() + 48 * H);
  console.log("due before hold :", fmt(dueAt), `(${((dueAt.getTime() - now.getTime()) / H).toFixed(2)}h left)`);

  let r = await syncSlaPause(ticket, wip, { committedDate: committed, now });
  console.log("hold            :", r.action, "resumeAt", fmt(ticket.roleLevelSLA.resumeAt));
  console.log("due during hold :", fmt(ticket.roleLevelSLA.dueAt), "(unchanged — the clock is frozen)");

  // The committed date arrives: the scheduler releases the hold.
  const atCommitted = new Date(committed.getTime());
  r = await syncSlaPause(ticket, wip, { committedDate: committed, now: atCommitted }); // still WIP, no change
  const release = await syncSlaPause(ticket, resolved, { now: atCommitted });
  console.log("release         :", release.action);
  console.log("due after       :", fmt(ticket.roleLevelSLA.dueAt),
    `(${((ticket.roleLevelSLA.dueAt.getTime() - atCommitted.getTime()) / H).toFixed(2)}h left — expected 11.00)`);
  console.log("paused minutes  :", ticket.roleLevelSLA.pausedDuration, "(expected 2880)");

  // Leaving early: held 1h of a 48h window, only 1h given back.
  const t2: any = {
    _id: new mongoose.Types.ObjectId(),
    interactionType: "PSR",
    status: 1,
    roleLevelSLA: { startedAt: created, dueAt: new Date(dueAt), pausedDuration: 0 },
    wip: {},
  };
  await syncSlaPause(t2, wip, { committedDate: committed, now });
  const early = new Date(now.getTime() + 1 * H);
  await syncSlaPause(t2, resolved, { now: early });
  console.log("early leave     :", fmt(t2.roleLevelSLA.dueAt),
    `(+${((t2.roleLevelSLA.dueAt.getTime() - dueAt.getTime()) / H).toFixed(2)}h — expected +1.00)`);

  // The batch pass finds nothing to do on real data unless a hold is due.
  console.log("due holds now   :", await resumeDueSlaPauses(0));
  await mongoose.disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
