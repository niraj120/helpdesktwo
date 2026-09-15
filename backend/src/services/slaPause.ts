/**
 * Holding the SLA clock while a ticket waits.
 *
 * A ticket that is waiting on a date someone committed to is not a ticket
 * nobody is working: the SLA should stop when it goes into that status and
 * start again where it left off. So a 24h SLA that is put into WIP at hour 13
 * with a committed date two days out has 11h left when those two days pass —
 * not a breach recorded overnight.
 *
 * Which statuses do this is configuration, never a status code: any status can
 * carry `rules.<query|sr>.pauseSla` (Query Config → Ticket Statuses → Rules),
 * with `pauseUntil` saying whether the clock restarts on the committed date or
 * only when the ticket leaves the status.
 *
 * The clock is held by leaving every deadline alone during the hold and adding
 * the time actually waited back to it on resume. Nothing is pre-shifted, so a
 * ticket that leaves the status early, or whose committed date is revised,
 * needs no correction — it simply gets back what it actually waited.
 *
 * Both SLA clocks on the ticket (ticket-level and role-level) and the separate
 * SLATracking record are held together; the escalation jobs already skip a
 * ticket whose `roleLevelSLA.pausedAt` is set, or whose tracking `isPaused`.
 */
import { Ticket } from "../models/Ticket";
import SLATracking from "../models/sla-module/SLATracking";
import { RuleScope, ruleOf, scopeOf } from "./statusRules";

const MIN = 60 * 1000;

export interface SlaPausePlan {
  /** Hold the clock (true) or let it run (false). */
  pause: boolean;
  /** When the hold is due to end; null = until the ticket leaves the status. */
  until: Date | null;
}

/** What the configuration says the clock should do in `status`. */
export function slaPausePlanFor(
  status: any,
  scope: RuleScope,
  committedDate?: Date | null,
): SlaPausePlan {
  const rule = ruleOf(status, scope) as any;
  if (!rule?.pauseSla) return { pause: false, until: null };
  const mode = rule.pauseUntil || "committedDate";
  const until =
    mode === "committedDate" && committedDate ? new Date(committedDate) : null;
  return { pause: true, until };
}

const shift = (date: any, ms: number) =>
  date ? new Date(new Date(date).getTime() + ms) : date;

/**
 * The changes a hold or a release makes to the ticket's own clocks. Applied to
 * the document in place (for callers that save it) and also returned as a
 * $set / $unset pair, because the ticket screen updates atomically.
 */
interface ClockChange {
  set: Record<string, any>;
  unset: Record<string, 1>;
}

/** Start the hold on the ticket's own clocks. */
function holdTicketClocks(ticket: any, now: Date, until: Date | null): ClockChange {
  const change: ClockChange = { set: {}, unset: {} };
  for (const key of ["ticketLevelSLA", "roleLevelSLA"] as const) {
    const sla = ticket[key];
    if (!sla?.dueAt) continue;
    // Already held: only the end date can have moved (a revised committed date).
    if (!sla.pausedAt) {
      sla.pausedAt = now;
      change.set[`${key}.pausedAt`] = now;
    }
    if (until) {
      sla.resumeAt = until;
      change.set[`${key}.resumeAt`] = until;
    } else {
      sla.resumeAt = undefined;
      change.unset[`${key}.resumeAt`] = 1;
    }
  }
  return change;
}

/** End the hold, giving back the time actually waited. */
function releaseTicketClocks(ticket: any, now: Date): ClockChange {
  const change: ClockChange = { set: {}, unset: {} };
  for (const key of ["ticketLevelSLA", "roleLevelSLA"] as const) {
    const sla = ticket[key];
    if (!sla?.pausedAt) continue;
    const ms = Math.max(0, now.getTime() - new Date(sla.pausedAt).getTime());
    sla.dueAt = shift(sla.dueAt, ms);
    sla.pausedDuration = (sla.pausedDuration || 0) + Math.round(ms / MIN);
    sla.pausedAt = undefined;
    sla.resumeAt = undefined;
    if (sla.dueAt) change.set[`${key}.dueAt`] = sla.dueAt;
    change.set[`${key}.pausedDuration`] = sla.pausedDuration;
    change.unset[`${key}.pausedAt`] = 1;
    change.unset[`${key}.resumeAt`] = 1;
  }
  return change;
}

async function holdTracking(ticketId: any, now: Date, until: Date | null) {
  const tracking = await SLATracking.findOne({ ticketId });
  if (!tracking) return;
  if (!tracking.isPaused) {
    tracking.isPaused = true;
    tracking.pausedAt = now;
  }
  (tracking as any).resumeAt = until || undefined;
  await tracking.save();
}

async function releaseTracking(ticketId: any, now: Date) {
  const tracking = await SLATracking.findOne({ ticketId });
  if (!tracking?.isPaused) return;
  const ms = tracking.pausedAt
    ? Math.max(0, now.getTime() - tracking.pausedAt.getTime())
    : 0;
  tracking.pausedDuration += Math.round(ms / MIN);
  if (tracking.responseDeadline && !tracking.firstResponseAt) {
    tracking.responseDeadline = shift(tracking.responseDeadline, ms);
  }
  tracking.resolutionDeadline = shift(tracking.resolutionDeadline, ms);
  if (tracking.nextEscalationDue) {
    tracking.nextEscalationDue = shift(tracking.nextEscalationDue, ms);
  }
  tracking.isPaused = false;
  tracking.pausedAt = undefined;
  (tracking as any).resumeAt = undefined;
  await tracking.save();
}

/** True while the ticket's clock is being held. */
export const isSlaPaused = (ticket: any) =>
  !!(ticket?.roleLevelSLA?.pausedAt || ticket?.ticketLevelSLA?.pausedAt);

/**
 * Bring the hold in line with the status the ticket is moving into. Mutates
 * the ticket's SLA fields — the caller saves the ticket — and writes the
 * SLATracking record itself.
 *
 * `status` is the status document being applied; pass the project's status
 * list rather than a code so no lifecycle code is assumed anywhere.
 */
export async function syncSlaPause(
  ticket: any,
  status: any,
  opts: { committedDate?: Date | null; now?: Date; scope?: RuleScope } = {},
): Promise<{
  action: "paused" | "resumed" | "unchanged";
  set: Record<string, any>;
  unset: Record<string, 1>;
  until: Date | null;
}> {
  const now = opts.now || new Date();
  const scope = opts.scope || scopeOf(ticket);
  const committed =
    opts.committedDate ?? (ticket?.wip?.committedDate as Date | undefined);
  const plan = slaPausePlanFor(status, scope, committed);

  if (plan.pause) {
    const already = isSlaPaused(ticket);
    const change = holdTicketClocks(ticket, now, plan.until);
    await holdTracking(ticket._id, now, plan.until);
    return { action: already ? "unchanged" : "paused", ...change, until: plan.until };
  }

  if (!isSlaPaused(ticket)) {
    return { action: "unchanged", set: {}, unset: {}, until: null };
  }
  const change = releaseTicketClocks(ticket, now);
  await releaseTracking(ticket._id, now);
  return { action: "resumed", ...change, until: null };
}

/**
 * End every hold whose date has arrived. Run from the SR scheduler; the ticket
 * stays in its status (it is still in WIP), only its clock starts again.
 */
export async function resumeDueSlaPauses(limit = 200): Promise<number> {
  const now = new Date();
  const due = await Ticket.find({
    $or: [
      { "roleLevelSLA.pausedAt": { $ne: null }, "roleLevelSLA.resumeAt": { $lte: now } },
      {
        "ticketLevelSLA.pausedAt": { $ne: null },
        "ticketLevelSLA.resumeAt": { $lte: now },
      },
    ],
  })
    .select("_id ticketLevelSLA roleLevelSLA")
    .limit(limit);

  let resumed = 0;
  for (const ticket of due) {
    releaseTicketClocks(ticket as any, now);
    await ticket.save();
    await releaseTracking(ticket._id, now);
    resumed++;
  }
  return resumed;
}

/** Release a hold outright (ticket resolved, cancelled, merged away). */
export async function releaseSlaPause(ticket: any, now = new Date()) {
  if (!isSlaPaused(ticket)) return false;
  releaseTicketClocks(ticket, now);
  await releaseTracking(ticket._id, now);
  return true;
}
