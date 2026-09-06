/**
 * Apply the first call-back step to missed calls that predate the ladder.
 *
 * A missed call now has WIP 1 committed automatically the moment it is
 * ingested. Calls that landed before that shipped have an empty follow-up log,
 * so the inbox shows them as owing nothing — which is exactly the state the
 * ladder exists to prevent.
 *
 * Only open, unconverted missed calls with no follow-up are touched. The due
 * time is measured from NOW, not from when the call arrived: back-dating would
 * mark every one of them instantly overdue, which tells the agent nothing.
 *
 * Idempotent (a call with any follow-up is skipped). Dry-run by default:
 *   npx tsx src/scripts/ivr/backfillFirstCallbackStep.ts
 *   npx tsx src/scripts/ivr/backfillFirstCallbackStep.ts --apply
 */
import "dotenv/config";
import mongoose from "mongoose";
import { CallIntake } from "../../models/CallIntake";
import { applyFirstCallbackStep, getCallbackTiers } from "../../modules/service-request/callTriage";

const APPLY = process.argv.includes("--apply");

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);

  const calls = await CallIntake.find({
    callType: "missed",
    status: { $ne: "closed" },
    callStatus: { $nin: ["converted", "junk"] },
    $or: [{ followUps: { $exists: false } }, { followUps: { $size: 0 } }],
  });

  console.log(APPLY ? "MODE: APPLY\n" : "MODE: DRY RUN (pass --apply to write)\n");
  console.log(`Missed calls owing a first step: ${calls.length}\n`);

  const tierCache = new Map<string, any>();
  let done = 0;
  let skipped = 0;

  for (const call of calls as any[]) {
    const pid = String(call.projectId);
    if (!tierCache.has(pid)) tierCache.set(pid, await getCallbackTiers(pid));
    const { enabled, tiers } = tierCache.get(pid);

    if (!enabled || !tiers.length) {
      console.log(`  ${call.externalId || call._id}: no ladder configured — skipped`);
      skipped += 1;
      continue;
    }

    const first = tiers[0];
    console.log(
      `  ${call.callerMobile || call.externalId || call._id} (${new Date(
        call.receivedAt,
      ).toLocaleString()}) -> ${first.label}, due in ${first.tatHours}h`,
    );

    if (APPLY) {
      await applyFirstCallbackStep(call);
      done += 1;
    }
  }

  console.log(
    `\n${APPLY ? "Applied to" : "Would apply to"} ${APPLY ? done : calls.length - skipped} call(s)` +
      (skipped ? `, skipped ${skipped} with no ladder.` : "."),
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
