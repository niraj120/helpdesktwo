/**
 * Move the built-in SR lifecycle into each SR project's status configuration.
 *
 * Until now the SR lifecycle (which status may follow which, the re-open
 * limit, who may close / re-open / cancel, who gets a re-opened request) was
 * code in srWorkflow.ts. The status master can now hold all of it per status
 * (Query Config → Ticket Statuses → Rules → Service Requests). This writes the
 * current behaviour there, so nothing changes on the day — but from then on
 * an admin edits it instead of a developer.
 *
 * For every project with service requests enabled, each status on the SR
 * lifecycle gets:
 *   rules.sr.restrictNext/allowedNext  ← SR_TRANSITIONS
 *   rules.sr.permission                ← the permission the built-in move needs
 *                                        (Closed: SR_CLOSE, Re-open: SR_REOPEN,
 *                                         Cancelled: SR_CANCEL)
 *   Re-open: maxPerTicket              ← project psr reopenLimit (default 1)
 *            assignOnApply             ← SR re-open routing
 *   isReopen                           ← Re-open, Re-Opened WIP
 *   showInProgress = false             ← Cancelled
 *   requireConfirmation                ← Closed, Re-open (they had a confirm step)
 *
 * A status that already has SR rules is left alone — an admin's choices are
 * never overwritten. Statuses outside the SR lifecycle are not touched.
 *
 * Limit it to specific projects with --project=<name or id> (repeatable). A
 * project whose statuses reuse the SR codes for other meanings (e.g. code 4 =
 * "Rejected") should be configured by hand instead.
 *
 * Idempotent. Dry-run by default:
 *   npx tsx src/scripts/statuses/seedSrStatusRules.ts --project="VIBGYOR schools"
 *   npx tsx src/scripts/statuses/seedSrStatusRules.ts --project="VIBGYOR schools" --apply
 */
import "dotenv/config";
import mongoose from "mongoose";
import { Project } from "../../models/Project";
import { Status } from "../../models/Status";
import { resolveSrConfig } from "../../modules/service-request/serviceRequestConfig";
import { SR_STATUS, getTransition } from "../../modules/service-request/srWorkflow";

const APPLY = process.argv.includes("--apply");
const ONLY = process.argv
  .filter((a) => a.startsWith("--project="))
  .map((a) => a.slice("--project=".length).trim().toLowerCase())
  .filter(Boolean);
const LIFECYCLE = Object.values(SR_STATUS) as number[];

/** Moves the built-in lifecycle allows out of `from`. */
const nextOf = (from: number) => LIFECYCLE.filter((to) => !!getTransition(from, to));

/** Permission the built-in lifecycle demands to ENTER `to` (from any status). */
const permissionFor = (to: number): string | undefined => {
  for (const from of LIFECYCLE) {
    const t: any = getTransition(from, to);
    if (t?.requires) return t.requires;
  }
  return undefined;
};

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log(APPLY ? "MODE: APPLY\n" : "MODE: DRY RUN (pass --apply to write)\n");

  const projects = await Project.find({}).select("name configuration").lean();
  let projectsTouched = 0;
  let statusesWritten = 0;

  for (const project of projects as any[]) {
    if (
      ONLY.length &&
      !ONLY.includes(String(project._id)) &&
      !ONLY.includes(String(project.name || "").toLowerCase())
    )
      continue;
    const cfg: any = resolveSrConfig(project);
    if (!cfg?.enabled) continue;
    const reopenLimit = Number(cfg?.psr?.workflow?.lifecycle?.reopenLimit ?? 1);

    const statuses = await Status.find({ projectId: project._id, code: { $in: LIFECYCLE } });
    if (!statuses.length) continue;
    const present = new Set(statuses.map((s) => Number(s.code)));

    const lines: string[] = [];
    for (const st of statuses as any[]) {
      if (st.rules?.sr) {
        lines.push(`    = ${st.code} ${st.name}: SR rules already configured — left as is`);
        continue;
      }
      const code = Number(st.code);
      const allowedNext = nextOf(code).filter((c) => present.has(c));
      const rule: any = {
        restrictNext: true,
        allowedNext,
        permission: permissionFor(code),
        assignOnApply: { mode: code === SR_STATUS.REOPEN ? "reopenRouting" : "keep" },
      };
      if (code === SR_STATUS.REOPEN) rule.maxPerTicket = reopenLimit > 0 ? reopenLimit : undefined;

      const set: any = { "rules.sr": rule };
      if (code === SR_STATUS.REOPEN || code === SR_STATUS.REOPEN_WIP) set.isReopen = true;
      if (code === SR_STATUS.CANCEL) set.showInProgress = false;
      if (code === SR_STATUS.CLOSED || code === SR_STATUS.REOPEN) set.requireConfirmation = true;

      const names = allowedNext
        .map((c) => statuses.find((x: any) => Number(x.code) === c)?.name || c)
        .join(", ");
      lines.push(
        `    + ${code} ${st.name}: next → [${names || "none"}]` +
          (rule.permission ? `, needs ${rule.permission}` : "") +
          (rule.maxPerTicket ? `, max ${rule.maxPerTicket}/ticket` : "") +
          (code === SR_STATUS.REOPEN ? ", assign → re-open routing" : "") +
          (set.isReopen ? ", re-open cycle" : "") +
          (set.showInProgress === false ? ", hidden from progress" : "") +
          (set.requireConfirmation ? ", confirm" : ""),
      );
      statusesWritten++;
      if (APPLY) await Status.updateOne({ _id: st._id }, { $set: set });
    }
    projectsTouched++;
    console.log(`${project.name}  (re-open limit ${reopenLimit})`);
    lines.forEach((l) => console.log(l));
  }

  console.log(
    `\n${projectsTouched} SR project(s); ${statusesWritten} status(es) ${APPLY ? "configured" : "would be configured"}.`,
  );
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
