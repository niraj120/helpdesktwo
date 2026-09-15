/**
 * Service Request (PSR/ISR) — WIP committed-date reminder scheduler. Phase 2.
 * Sends the 48h-before reminder for WIP/Re-Opened-WIP service requests.
 *
 * Inert until projects enable SR: it only matches PSR/ISR tickets in a WIP
 * status with a committed date set.
 *
 * NOTE: committed-date-EXPIRY escalation is intentionally not wired here yet —
 * it hooks into the existing escalation engine (autoEscalationService) and is
 * handled when SR SLA/escalation goes live.
 */
import * as cron from "node-cron";
import { Ticket } from "../../../models/Ticket";
import { Project } from "../../../models/Project";
import { EmailIntake } from "../../../models/EmailIntake";
import { SR_STATUS } from "../srWorkflow";
import { resolveSrConfig } from "../serviceRequestConfig";
import { resumeDueSlaPauses } from "../../../services/slaPause";

const WIP_STATUSES = [SR_STATUS.WIP, SR_STATUS.REOPEN_WIP];
const DEFAULT_REMINDER_HOURS = 48; // per-project override applied in a later pass

class SrWipScheduler {
  private cronJob: cron.ScheduledTask | null = null;
  private interval = "*/15 * * * *"; // every 15 minutes

  start(): void {
    if (this.cronJob) return;
    console.log("🚀 Starting SR WIP reminder scheduler (every 15 min)");
    this.cronJob = cron.schedule(this.interval, () => {
      this.run().catch((e) => console.error("[srWipScheduler] run error:", e));
    });
    setTimeout(() => {
      this.run().catch((e) => console.error("[srWipScheduler] run error:", e));
    }, 15000);
  }

  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }
  }

  async run(): Promise<void> {
    const now = new Date();
    const windowEnd = new Date(
      now.getTime() + DEFAULT_REMINDER_HOURS * 60 * 60 * 1000,
    );

    // 0) Restart SLA clocks whose hold has run out (the committed date has
    //    arrived). The request stays in WIP; only its clock starts again.
    let slaResumed = 0;
    try {
      slaResumed = await resumeDueSlaPauses();
    } catch (e: any) {
      console.error("[srWipScheduler] SLA resume error:", e?.message || e);
    }

    // 1) Reminder pass — committed date approaching, no reminder sent yet.
    const due = await Ticket.find({
      interactionType: { $in: ["PSR", "ISR"] },
      status: { $in: WIP_STATUSES },
      "wip.committedDate": { $gt: now, $lte: windowEnd },
      "wip.reminderSentAt": { $exists: false },
    })
      .select("_id wip")
      .limit(200);

    for (const ticket of due) {
      (ticket as any).wip = (ticket as any).wip || {};
      (ticket as any).wip.reminderSentAt = now;
      await ticket.save();
    }

    // 2) Expiry escalation pass — committed date passed, not yet escalated.
    const expired = await Ticket.find({
      interactionType: { $in: ["PSR", "ISR"] },
      status: { $in: WIP_STATUSES },
      "wip.committedDate": { $lt: now },
      "wip.escalatedAt": { $exists: false },
    })
      .select("_id project wip roleLevelSLA ticketLevelSLA")
      .limit(200);

    // Per-project escalateOnExpiry flag (cached for the run).
    const flagCache = new Map<string, boolean>();
    let escalatedCount = 0;
    for (const ticket of expired) {
      const pid = String((ticket as any).project);
      let escalate = flagCache.get(pid);
      if (escalate === undefined) {
        const project = await Project.findById((ticket as any).project)
          .select("configuration.sr")
          .lean();
        escalate = resolveSrConfig(project).wip.escalateOnExpiry;
        flagCache.set(pid, escalate);
      }
      if (!escalate) continue;

      const w = ((ticket as any).wip = (ticket as any).wip || {});
      w.escalatedAt = now;
      // Mark an SLA breach so existing dashboards/escalation reporting reflect it.
      if ((ticket as any).roleLevelSLA && !(ticket as any).roleLevelSLA.breachedAt) {
        (ticket as any).roleLevelSLA.breachedAt = now;
      } else if (
        (ticket as any).ticketLevelSLA &&
        !(ticket as any).ticketLevelSLA.breachedAt
      ) {
        (ticket as any).ticketLevelSLA.breachedAt = now;
      }
      await ticket.save();
      escalatedCount++;
    }

    // 3) Email triage TAT — flag overdue intake for escalation (L1).
    const overdueEmails = await EmailIntake.updateMany(
      {
        status: { $in: ["open", "wip"] },
        dueAt: { $lt: now },
        $or: [
          { escalationLevel: { $exists: false } },
          { escalationLevel: { $lt: 1 } },
        ],
      },
      { $set: { escalationLevel: 1, escalatedAt: now } },
    );

    if (due.length || escalatedCount || overdueEmails.modifiedCount || slaResumed) {
      console.log(
        `[srWipScheduler] ${due.length} reminder(s), ${escalatedCount} expiry escalation(s), ` +
          `${overdueEmails.modifiedCount} email TAT escalation(s), ${slaResumed} SLA clock(s) resumed`,
      );
    }
  }
}

export const srWipScheduler = new SrWipScheduler();
