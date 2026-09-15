/**
 * Status rules engine — what a status change is allowed to do, read entirely
 * from the project's status master (Query Config → Ticket Statuses).
 *
 * Every path that moves a ticket between statuses — the ticket screen, the
 * Service Request panel, bulk change, the parent's close/re-open — asks this
 * one place, so a rule set once in configuration holds everywhere:
 *
 *   - which statuses may follow the current one      (rules.<type>.allowedNext)
 *   - a remark / committed date when applying        (requireClosingRemark / requireCommittedDate)
 *   - who may apply it                               (rules.<type>.permission)
 *   - how often it may be applied to one ticket      (rules.<type>.maxPerTicket)
 *   - who the ticket goes to on applying it          (rules.<type>.assignOnApply)
 *   - whether it re-opens a closed ticket            (isReopen)
 *
 * Rules are kept per record type ("query" / "sr"). A status whose rules for a
 * type were never configured behaves as before, so nothing changes for a
 * project until someone configures it.
 */
import mongoose from "mongoose";
import { Status } from "../models/Status";
import { User } from "../models/User";

export type RuleScope = "query" | "sr";

export class StatusRuleError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
    this.name = "StatusRuleError";
  }
}

/** PSR/ISR follow the "sr" rules, everything else the "query" rules. */
export const scopeOf = (ticket: any): RuleScope =>
  ticket?.interactionType === "PSR" || ticket?.interactionType === "ISR"
    ? "sr"
    : "query";

const projectOf = (ticket: any) =>
  ticket?.metadata?.projectId || ticket?.project;

export const loadProjectStatuses = (projectId: any) =>
  Status.find({ projectId }).lean();

export const ruleOf = (status: any, scope: RuleScope) =>
  status?.rules?.[scope] as
    | {
        restrictNext?: boolean;
        allowedNext?: number[];
        restrictPrev?: boolean;
        allowedPrev?: number[];
        maxPerTicket?: number;
        permission?: string;
        allowedActors?: string[];
        assignOnApply?: { mode?: string; roleId?: any; userId?: any };
      }
    | undefined;

/** How many times this ticket has entered `code`, from its status history. */
export function timesApplied(ticket: any, code: number): number {
  const fromHistory = (ticket?.changeHistory || []).filter(
    (h: any) => h?.field === "status" && String(h?.newValue) === String(code),
  ).length;
  return fromHistory;
}

export interface StatusCheck {
  to: any;
  from: any | null;
  scope: RuleScope;
  /** The current status has rules configured for this record type. */
  configured: boolean;
  /** Moving from a closing status into a re-open status. */
  isReopenMove: boolean;
}

/**
 * Validate a status change against the configuration. Throws StatusRuleError
 * with a message fit to show the agent.
 *
 * `user` carries the actor's permission codes; pass null for a system-driven
 * move (e.g. a parent closure), which is not subject to the permission rule.
 */
export async function checkStatusChange(opts: {
  ticket: any;
  toCode: number;
  remark?: string;
  committedDate?: any;
  user?: { roleCode?: string; permissions?: any[] } | null;
  /** Who is making the change — for the per-status "who may apply" rule. */
  actorUserId?: string;
  statuses?: any[];
}): Promise<StatusCheck> {
  const { ticket, toCode } = opts;
  const scope = scopeOf(ticket);
  const statuses = opts.statuses || (await loadProjectStatuses(projectOf(ticket)));

  const to = statuses.find((s: any) => Number(s.code) === Number(toCode));
  if (!to) {
    throw new StatusRuleError(`Status ${toCode} is not configured for this project.`);
  }
  if (to.isActive === false) {
    throw new StatusRuleError(`"${to.name}" is switched off for this project.`);
  }

  const from = statuses.find((s: any) => Number(s.code) === Number(ticket?.status)) || null;
  const fromRule = ruleOf(from, scope);
  const configured = !!fromRule;

  if (fromRule?.restrictNext && !(fromRule.allowedNext || []).map(Number).includes(Number(toCode))) {
    throw new StatusRuleError(
      `"${to.name}" cannot follow "${from?.name}". Allowed next: ${
        (fromRule.allowedNext || [])
          .map((c) => statuses.find((s: any) => Number(s.code) === Number(c))?.name || c)
          .join(", ") || "none"
      }.`,
    );
  }
  if (configured && !fromRule?.restrictNext && Number(toCode) === Number(ticket?.status)) {
    throw new StatusRuleError(`The ticket is already "${to.name}".`);
  }

  // The same rule read from the other end: a status may say which statuses it
  // can be reached FROM (e.g. Re-open only after Closed). Both directions must
  // agree, so either one can keep a status out of the list.
  const toRulePrev = ruleOf(to, scope);
  if (
    toRulePrev?.restrictPrev &&
    !(toRulePrev.allowedPrev || []).map(Number).includes(Number(ticket?.status))
  ) {
    throw new StatusRuleError(
      `"${to.name}" can only follow: ${
        (toRulePrev.allowedPrev || [])
          .map((c) => statuses.find((s: any) => Number(s.code) === Number(c))?.name || c)
          .join(", ") || "nothing"
      }.`,
    );
  }

  if (to.requireClosingRemark && !String(opts.remark || "").trim()) {
    throw new StatusRuleError(`A remark is required before applying "${to.name}".`);
  }
  if (to.requireCommittedDate && !opts.committedDate) {
    throw new StatusRuleError(
      `${to.committedDateLabel || "A committed date"} is required before applying "${to.name}".`,
    );
  }
  if (opts.committedDate) {
    // How early/late a commitment may be is the project's call, set on the
    // status (Query Config → Ticket Statuses), not fixed in code.
    const when = new Date(opts.committedDate);
    if (Number.isNaN(when.getTime())) {
      throw new StatusRuleError("The committed date is not a valid date.");
    }
    const dateName = to.committedDateLabel || "The committed date";
    const created = ticket?.createdAt ? new Date(ticket.createdAt) : null;
    const now = new Date();
    if (to.committedDateMin === "now" && when.getTime() <= now.getTime()) {
      throw new StatusRuleError(`${dateName} must be in the future.`);
    }
    if (
      to.committedDateMin === "created" &&
      created &&
      when.getTime() < created.getTime()
    ) {
      throw new StatusRuleError(
        `${dateName} cannot be before the ticket was raised (${created.toLocaleString("en-IN")}).`,
      );
    }
    const maxDays = Number(to.committedDateMaxDays);
    if (maxDays > 0) {
      const limit = now.getTime() + maxDays * 24 * 60 * 60 * 1000;
      if (when.getTime() > limit) {
        throw new StatusRuleError(
          `${dateName} may be at most ${maxDays} day${maxDays === 1 ? "" : "s"} ahead.`,
        );
      }
    }
  }

  const toRule = ruleOf(to, scope);
  if (toRule?.permission && opts.user && opts.user.roleCode !== "SUPER_ADMIN") {
    const codes = (opts.user.permissions || []).map((p: any) =>
      typeof p === "string" ? p : p?.code,
    );
    if (!codes.includes(toRule.permission)) {
      throw new StatusRuleError(
        `You need the ${toRule.permission} permission to apply "${to.name}".`,
        403,
      );
    }
  }

  // Who may apply it: the assignee, the person who raised it, or anyone —
  // the project's call, per status. A super admin is never locked out.
  const actors = toRule?.allowedActors || [];
  if (actors.length && opts.actorUserId && opts.user?.roleCode !== "SUPER_ADMIN") {
    const me = String(opts.actorUserId);
    const assignee = String(
      (ticket?.assignedTo && (ticket.assignedTo._id || ticket.assignedTo)) || "",
    );
    const raiser = String(
      (ticket?.createdBy && (ticket.createdBy._id || ticket.createdBy)) || "",
    );
    const isAssignee = !!assignee && assignee === me;
    const isRaiser = !!raiser && raiser === me;
    const ok =
      (actors.includes("assignee") && isAssignee) ||
      (actors.includes("raiser") && isRaiser);
    if (!ok) {
      const who = actors
        .map((a) => (a === "assignee" ? "the assignee" : "the person who raised it"))
        .join(" or ");
      throw new StatusRuleError(`Only ${who} may apply "${to.name}".`, 403);
    }
  }

  if (toRule?.maxPerTicket && toRule.maxPerTicket > 0) {
    // A re-open status also honours the dedicated counter, which predates the
    // history-based count on older tickets.
    const used = Math.max(
      timesApplied(ticket, Number(toCode)),
      to.isReopen ? Number(ticket?.reopen?.count ?? 0) : 0,
    );
    if (used >= toRule.maxPerTicket) {
      throw new StatusRuleError(
        `"${to.name}" can be applied at most ${toRule.maxPerTicket} time${
          toRule.maxPerTicket === 1 ? "" : "s"
        } on a ticket — this one has reached it.`,
      );
    }
  }

  return {
    to,
    from,
    scope,
    configured,
    isReopenMove: !!to.isReopen && !!from?.isClosed,
  };
}

/** First active user holding `roleId`, preferring one on the ticket's project. */
async function userInRole(roleId: any, projectId: any) {
  const inProject: any = await User.findOne({ role: roleId, isActive: true, projects: projectId })
    .select("_id")
    .lean();
  if (inProject) return inProject._id as mongoose.Types.ObjectId;
  const anyUser: any = await User.findOne({ role: roleId, isActive: true }).select("_id").lean();
  return anyUser ? (anyUser._id as mongoose.Types.ObjectId) : null;
}

/**
 * What applying the status should change on the ticket besides the status:
 * the re-open counter and the new assignee. Returned rather than applied, as
 * the ticket endpoints update with $set while the SR module mutates the doc.
 *
 * `reopenRouting` resolves the SR re-open routing (category/project setup);
 * only the SR module can supply it.
 */
export async function planOnEnter(
  ticket: any,
  check: StatusCheck,
  actorId: string,
  reopenRouting?: () => Promise<mongoose.Types.ObjectId | null>,
): Promise<{
  reopen?: { count: number; reopenedBy: mongoose.Types.ObjectId; reopenedAt: Date };
  clearClosedAt?: boolean;
  assignedTo?: mongoose.Types.ObjectId;
}> {
  const plan: any = {};
  if (check.isReopenMove) {
    plan.reopen = {
      count: Number(ticket?.reopen?.count ?? 0) + 1,
      reopenedBy: new mongoose.Types.ObjectId(actorId),
      reopenedAt: new Date(),
    };
    plan.clearClosedAt = true;
  }

  const a = ruleOf(check.to, check.scope)?.assignOnApply;
  let assignee: mongoose.Types.ObjectId | null = null;
  if (a?.mode === "user" && a.userId) assignee = new mongoose.Types.ObjectId(String(a.userId));
  else if (a?.mode === "role" && a.roleId) assignee = await userInRole(a.roleId, projectOf(ticket));
  else if (a?.mode === "reopenRouting" && reopenRouting) assignee = await reopenRouting();
  if (assignee) plan.assignedTo = assignee;
  return plan;
}
