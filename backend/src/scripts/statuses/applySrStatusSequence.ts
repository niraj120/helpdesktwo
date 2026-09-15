/**
 * Apply a strict status sequence to a project's service requests.
 *
 * Requirement (UAT B.1): intermediate stages may not be skipped — a request
 * cannot jump from Work In Progress straight to Re-open. The order is:
 *
 *   Open → Work In Progress → Resolved → Closed → Re-open → Re-Opened WIP → Closed
 *
 * Everything is written into the status master (Query Config → Ticket
 * Statuses → Rules → Service Requests), so the sequence stays editable there
 * afterwards — nothing about it is fixed in code. Each status gets both ends
 * of the rule: what may follow it, and what it may follow.
 *
 * Cancel is treated as a side exit allowed from any live status (--no-cancel
 * turns that off), and Work In Progress may be re-applied to revise its
 * committed date (--no-wip-revise turns that off).
 *
 * Also sets, on the statuses that ask for a committed date: the date may not
 * be before the ticket was raised (UAT B.2).
 *
 * Dry-run by default:
 *   npx tsx src/scripts/statuses/applySrStatusSequence.ts --project="VIBGYOR schools"
 *   npx tsx src/scripts/statuses/applySrStatusSequence.ts --project="VIBGYOR schools" --apply
 */
import "dotenv/config";
import mongoose from "mongoose";
import { Project } from "../../models/Project";
import { Status } from "../../models/Status";
import { SR_STATUS } from "../../modules/service-request/srWorkflow";

const APPLY = process.argv.includes("--apply");
const WITH_CANCEL = !process.argv.includes("--no-cancel");
const WIP_REVISE = !process.argv.includes("--no-wip-revise");
/**
 * Hold the SLA clock while a request waits out its WIP committed date. On by
 * default for WIP only; --no-hold-sla leaves the clock running.
 *
 * Re-Opened WIP deliberately does NOT hold it: a re-opened request is live
 * work again, and its clock must keep running.
 */
const HOLD_SLA = !process.argv.includes("--no-hold-sla");
const ONLY = process.argv
  .filter((a) => a.startsWith("--project="))
  .map((a) => a.slice("--project=".length).trim().toLowerCase())
  .filter(Boolean);

const { OPEN, WIP, RESOLVED, CLOSED, REOPEN, REOPEN_WIP, CANCEL } = SR_STATUS;

/** next = may follow this status; prev = this status may follow those. */
const SEQUENCE: Record<number, { next: number[]; prev: number[]; permission?: string }> = {
  [OPEN]: { next: [WIP], prev: [] },
  [WIP]: { next: [RESOLVED, ...(WIP_REVISE ? [WIP] : [])], prev: [OPEN, ...(WIP_REVISE ? [WIP] : [])] },
  [RESOLVED]: { next: [CLOSED], prev: [WIP] },
  [CLOSED]: { next: [REOPEN], prev: [RESOLVED, REOPEN, REOPEN_WIP], permission: "SR_CLOSE" },
  [REOPEN]: { next: [REOPEN_WIP], prev: [CLOSED], permission: "SR_REOPEN" },
  [REOPEN_WIP]: { next: [CLOSED], prev: [REOPEN] },
  [CANCEL]: { next: [], prev: [OPEN, WIP, RESOLVED, REOPEN, REOPEN_WIP], permission: "SR_CANCEL" },
};

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log(APPLY ? "MODE: APPLY\n" : "MODE: DRY RUN (pass --apply to write)\n");

  const projects = await Project.find({}).select("name").lean();
  let touched = 0;

  for (const project of projects as any[]) {
    if (
      ONLY.length &&
      !ONLY.includes(String(project._id)) &&
      !ONLY.includes(String(project.name || "").toLowerCase())
    )
      continue;

    const statuses = await Status.find({ projectId: project._id });
    if (!statuses.length) continue;
    const present = new Map(statuses.map((s: any) => [Number(s.code), s]));
    const nameOf = (c: number) => present.get(c)?.name || `#${c}`;

    console.log(`${project.name}`);
    for (const [codeStr, rule] of Object.entries(SEQUENCE)) {
      const code = Number(codeStr);
      const st: any = present.get(code);
      if (!st) {
        console.log(`    – ${code}: not in this project's statuses — skipped`);
        continue;
      }
      const next = rule.next.filter((c) => present.has(c));
      const prev = rule.prev.filter((c) => present.has(c));
      // Cancel is a side exit from the LIVE statuses only — never from a
      // status that already closed the request.
      const cancellableFrom = SEQUENCE[CANCEL].prev;
      if (
        WITH_CANCEL &&
        present.has(CANCEL) &&
        code !== CANCEL &&
        cancellableFrom.includes(code) &&
        !next.includes(CANCEL)
      ) {
        next.push(CANCEL);
      }

      const set: any = {
        "rules.sr": {
          ...(st.rules?.sr || {}),
          restrictNext: true,
          allowedNext: next,
          restrictPrev: prev.length > 0,
          allowedPrev: prev,
          permission: rule.permission,
          assignOnApply:
            st.rules?.sr?.assignOnApply ||
            (code === REOPEN ? { mode: "reopenRouting" } : { mode: "keep" }),
          ...(code === REOPEN && st.rules?.sr?.maxPerTicket === undefined
            ? { maxPerTicket: 1 }
            : {}),
          // A request waiting on a date it committed to is not burning its
          // SLA: hold the clock, and start it again on that date. Re-Opened
          // WIP is excluded — a re-opened request is live work, not waiting.
          ...(HOLD_SLA && code === WIP
            ? { pauseSla: true, pauseUntil: "committedDate" }
            : {}),
        },
      };
      if (code === REOPEN || code === REOPEN_WIP) set.isReopen = true;
      if (code === CANCEL) set.showInProgress = false;
      // A commitment cannot predate the ticket (UAT B.2).
      // "none" is the schema default, i.e. never configured — still set it.
      if (
        st.requireCommittedDate &&
        (!st.committedDateMin || st.committedDateMin === "none")
      ) {
        set.committedDateMin = "created";
      }

      console.log(
        `    ${code} ${st.name}: next → [${next.map(nameOf).join(", ") || "none"}]` +
          `; may follow → [${prev.map(nameOf).join(", ") || "anything"}]` +
          (rule.permission ? `; needs ${rule.permission}` : "") +
          (set.committedDateMin ? "; date not before raised" : ""),
      );
      if (APPLY) await Status.updateOne({ _id: st._id }, { $set: set });
    }
    touched++;
  }

  console.log(`\n${touched} project(s) ${APPLY ? "updated" : "would be updated"}.`);
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
