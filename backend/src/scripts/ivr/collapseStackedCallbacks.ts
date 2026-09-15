/**
 * Collapse stacked WIP steps down to the one that is actually live.
 *
 * Before the one-live-WIP rule, every "+ Add" in the IVR inbox appended a new
 * pending call-back without closing the previous one, so a single call could
 * carry several pending steps (WIP 2, WIP 2, WIP 1 …), each ticking and each
 * able to show as overdue.
 *
 * For every call with more than one pending step this keeps the most recently
 * logged one — the agent's latest commitment — and cancels the rest with a
 * "superseded" note. Nothing is deleted; the cancelled steps stay in the log.
 * callbackAt / callbackDueSoonAt are then recomputed the same way the app does.
 *
 * Idempotent (a call with at most one pending step is skipped). Dry-run by
 * default:
 *   npx tsx src/scripts/ivr/collapseStackedCallbacks.ts
 *   npx tsx src/scripts/ivr/collapseStackedCallbacks.ts --apply
 */
import "dotenv/config";
import mongoose from "mongoose";
import { CallIntake } from "../../models/CallIntake";
import { syncNextCallback } from "../../modules/service-request/callTriage";

const APPLY = process.argv.includes("--apply");

const loggedAt = (f: any) =>
  new Date(f.createdAt || f.scheduledAt || 0).getTime();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log(APPLY ? "MODE: APPLY\n" : "MODE: DRY RUN (pass --apply to write)\n");

  // Only calls whose log holds two or more pending steps.
  const calls = await CallIntake.find({
    $expr: {
      $gt: [
        {
          $size: {
            $filter: {
              input: { $ifNull: ["$followUps", []] },
              as: "f",
              cond: { $eq: ["$$f.status", "pending"] },
            },
          },
        },
        1,
      ],
    },
  });

  let steps = 0;
  const now = new Date();
  for (const call of calls) {
    const pending = (call.followUps || [])
      .filter((f: any) => f.status === "pending")
      .sort((a: any, b: any) => loggedAt(b) - loggedAt(a));
    const [keep, ...drop] = pending as any[];

    console.log(
      `${call.callerMobile}  ${String(call._id)}  keep ${keep.wipLabel || "?"} ` +
        `(due ${new Date(keep.scheduledAt).toLocaleString("en-IN")}), ` +
        `cancel ${drop.map((f) => f.wipLabel || "?").join(", ")}`,
    );

    for (const f of drop) {
      f.status = "cancelled";
      f.completedAt = now;
      f.note = f.note
        ? `${f.note} · Superseded — only one WIP is live`
        : "Superseded — only one WIP is live";
    }
    steps += drop.length;
    syncNextCallback(call);
    if (APPLY) await call.save();
  }

  console.log(
    `\n${calls.length} call(s) with stacked WIP steps; ${steps} step(s) ${
      APPLY ? "cancelled" : "would be cancelled"
    }.`,
  );
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
