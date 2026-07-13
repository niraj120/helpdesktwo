/**
 * Service Request (PSR/ISR) module — lifecycle service.
 * Phase 2: applies the Vector status workflow + actions to an SR ticket.
 * Operates on the existing Ticket model; pure-ish (DB read/write only), no HTTP.
 *
 * Integration points intentionally stubbed until pending inputs land:
 *  - resolveReopenAssignee → needs the Vector role→permission mapping.
 *  - notifySrWatchers      → needs SR notification trigger types.
 */
import mongoose from "mongoose";
import { Ticket } from "../../models/Ticket";
import { Project } from "../../models/Project";
import { User } from "../../models/User";
import { Notification } from "../../models/Notification";
import {
  applyProjectScope,
  canAccessProject,
  ProjectScope,
} from "../../utils/projectScope";
import { resolveSrConfig } from "./serviceRequestConfig";
import {
  SR_STATUS,
  canReopen,
  getTransition,
  validateWipCommittedDate,
} from "./srWorkflow";
import {
  findDuplicateServiceRequests,
  DuplicateQuery,
} from "./srDuplicateDetection";
import { resolveSrReopenBlock } from "./srMasterData";
import { renderTemplate } from "./srConditionEngine";
import { SrNotificationTemplate } from "../../models/SrNotificationTemplate";

export class SrError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
    this.name = "SrError";
  }
}

const oid = (id: string) => new mongoose.Types.ObjectId(id);

async function loadSr(ticketId: string) {
  const ticket = await Ticket.findById(ticketId);
  if (!ticket) throw new SrError("Service request not found", 404);
  if (!ticket.interactionType || ticket.interactionType === "normal") {
    throw new SrError("This ticket is not a service request", 400);
  }
  return ticket;
}

function recordChange(
  ticket: any,
  field: string,
  oldValue: any,
  newValue: any,
  actorId: string,
  changeType: "update" | "add" | "remove" | "reassigned" = "update",
) {
  ticket.changeHistory = ticket.changeHistory || [];
  ticket.changeHistory.push({
    field,
    oldValue: String(oldValue ?? ""),
    newValue: String(newValue ?? ""),
    changedBy: oid(actorId),
    changedAt: new Date(),
    changeType,
  });
  return ticket.changeHistory[ticket.changeHistory.length - 1];
}

function addFollowUp(
  ticket: any,
  text: string,
  actorId: string,
  displayToParent = false,
) {
  if (!text) return;
  ticket.comments = ticket.comments || [];
  ticket.comments.push({
    text,
    createdBy: oid(actorId),
    createdAt: new Date(),
    displayToParent,
  });
}

async function getProjectSrConfig(projectId: any) {
  const project = await Project.findById(projectId)
    .select("configuration.sr")
    .lean();
  return resolveSrConfig(project);
}

// ── Re-open assignee (configurable) ──────────────────────────────────────────
// Vector re-opens auto-assign to the Principal. Configurable so the actual
// person/role can be set without code changes. Resolution order:
//   1. category(+center) reopen block on CategoryAssignmentConfig
//   2. project-level sr.reopen
async function resolveRoleAssignee(
  roleId: string,
  projectId: any,
): Promise<mongoose.Types.ObjectId | null> {
  const inProject = await User.findOne({
    role: roleId,
    isActive: true,
    projects: projectId,
  })
    .select("_id")
    .lean();
  if (inProject) return inProject._id as any;
  const anyUser = await User.findOne({ role: roleId, isActive: true })
    .select("_id")
    .lean();
  return anyUser ? (anyUser._id as any) : null;
}

async function resolveReopenAssignee(
  projectId: any,
  categoryId?: any,
  centerId?: any,
): Promise<mongoose.Types.ObjectId | null> {
  // 1. Category(+center) reopen block takes precedence when configured.
  if (categoryId) {
    const block = await resolveSrReopenBlock(
      String(projectId),
      String(categoryId),
      centerId ? String(centerId) : null,
    );
    if (block?.assignToUserId)
      return new mongoose.Types.ObjectId(block.assignToUserId);
    if (block?.assignToRoleId) {
      const u = await resolveRoleAssignee(block.assignToRoleId, projectId);
      if (u) return u;
    }
  }
  // 2. Project-level fallback (sr.reopen).
  const cfg = await getProjectSrConfig(projectId);
  const r = cfg.reopen || {};
  if (r.assignToUserId) return new mongoose.Types.ObjectId(r.assignToUserId);
  if (r.assignToRoleId) {
    const u = await resolveRoleAssignee(r.assignToRoleId, projectId);
    if (u) return u;
  }
  return null;
}

// ── CC / assignee notifications ──────────────────────────────────────────────
const EVENT_TRIGGER: Record<string, string> = {
  created: "sr_task_assigned",
  status_change: "ticket_status_changed",
  closed: "sr_closed",
  resolved: "sr_resolved",
  reassigned: "sr_reassigned",
  delegated: "sr_task_assigned",
  reopened: "sr_reopened",
  parent_closed: "sr_closed",
  cancelled: "ticket_status_changed",
};

export async function notifySrWatchers(
  ticket: any,
  event: string,
  actorId?: string,
): Promise<void> {
  try {
    const recipients = new Set<string>();
    if (ticket.assignedTo) recipients.add(String(ticket.assignedTo));
    (ticket.cc || []).forEach((u: any) => recipients.add(String(u)));

    // Per-project, per-event template (#9). Missing/disabled → built-in default.
    let title = `Service Request ${ticket.ticketNumber}`;
    let body = `Update: ${event.replace(/_/g, " ")}`;
    const tpl = await SrNotificationTemplate.findOne({
      projectId: ticket.project,
      event,
      enabled: true,
    }).lean();
    if (tpl) {
      const values = {
        ...((ticket.metadata as any)?.formData || {}),
        subject: ticket.subject,
        status: ticket.status,
      };
      const ctx = { ticketNumber: ticket.ticketNumber, subject: ticket.subject, values };
      if (tpl.subject?.trim()) title = renderTemplate(tpl.subject, ctx);
      if (tpl.body?.trim()) body = renderTemplate(tpl.body, ctx);
      // Template CC users
      (tpl.ccUsers || []).forEach((u: any) => recipients.add(String(u)));
      // Template CC roles → active project members
      if ((tpl.ccRoles || []).length) {
        const roleUsers = await User.find({
          role: { $in: tpl.ccRoles },
          isActive: true,
          projects: ticket.project,
        })
          .select("_id")
          .lean();
        roleUsers.forEach((u: any) => recipients.add(String(u._id)));
      }
      // Notify the parent / requester when the template opts in.
      if (tpl.toParent && ticket.createdBy) {
        recipients.add(String(ticket.createdBy));
      }
    }

    if (actorId) recipients.delete(actorId); // don't notify the actor

    const triggerType = EVENT_TRIGGER[event] || "ticket_status_changed";
    const docs = [...recipients].map((uid) => ({
      recipientUserId: new mongoose.Types.ObjectId(uid),
      triggeredByUserId: actorId
        ? new mongoose.Types.ObjectId(actorId)
        : undefined,
      projectId: ticket.project,
      triggerType,
      entityType: "ticket" as const,
      entityId: ticket._id,
      title,
      body,
      deepLinkUrl: `/service-requests/${ticket._id}`,
    }));
    if (docs.length) await Notification.insertMany(docs as any);
  } catch (e) {
    console.error("[sr] notify error:", e);
  }
}

// ── Operations ───────────────────────────────────────────────────────────────

export interface ChangeStatusOpts {
  committedDate?: string | Date;
  comments?: string;
  displayToParent?: boolean;
}

/** Open↔WIP↔Resolved transitions. Closed/Re-open use their dedicated actions. */
export async function changeSrStatus(
  ticketId: string,
  toStatus: number,
  actorId: string,
  opts: ChangeStatusOpts = {},
) {
  const ticket = await loadSr(ticketId);
  const from = ticket.status;

  if (toStatus === SR_STATUS.CLOSED || toStatus === SR_STATUS.REOPEN) {
    throw new SrError(
      "Use the dedicated close / re-open action for this transition.",
      400,
    );
  }

  const transition = getTransition(from, toStatus);
  if (!transition) {
    throw new SrError(`Illegal status transition (${from} → ${toStatus}).`, 400);
  }

  if (transition.committedDateRequired) {
    const committed = opts.committedDate ? new Date(opts.committedDate) : null;
    const cfg = await getProjectSrConfig(ticket.project);
    const rev = ticket.wip?.revisionCount ?? 0;
    const v = validateWipCommittedDate(
      committed as Date,
      rev,
      new Date(),
      cfg,
    );
    if (!v.ok) throw new SrError(v.error!, 400);

    const wip = (ticket.wip = ticket.wip || {});
    wip.committedDate = committed!;
    wip.revisionCount = rev + 1;
    wip.reminderSentAt = undefined;
    wip.history = wip.history || [];
    wip.history.push({
      committedDate: committed!,
      setBy: oid(actorId),
      setAt: new Date(),
      reason: opts.comments,
    });
  }

  if (toStatus === SR_STATUS.RESOLVED && !ticket.resolvedAt) {
    ticket.resolvedAt = new Date();
  }

  recordChange(ticket, "status", from, toStatus, actorId);
  ticket.status = toStatus;
  addFollowUp(ticket, opts.comments || "", actorId, !!opts.displayToParent);
  await ticket.save();
  await notifySrWatchers(ticket, "status_change", actorId);
  return ticket;
}

/** Resolved → Closed by closure-access (school/SSD/RE-Cell/VP/Principal). */
export async function closeSr(
  ticketId: string,
  actorId: string,
  comments?: string,
) {
  const ticket = await loadSr(ticketId);
  const transition = getTransition(ticket.status, SR_STATUS.CLOSED);
  if (!transition) {
    throw new SrError("Only a resolved SR can be closed.", 400);
  }
  recordChange(ticket, "status", ticket.status, SR_STATUS.CLOSED, actorId);
  ticket.status = SR_STATUS.CLOSED;
  ticket.closedAt = new Date();
  addFollowUp(ticket, comments || "", actorId, true);
  await ticket.save();
  await notifySrWatchers(ticket, "closed", actorId);
  return ticket;
}

export interface ReassignOpts {
  userId?: string;
  subCategoryId?: string;
  remark?: string;
}

/** Reassign (TAT is intentionally NOT recomputed — Vector rule). */
export async function reassignSr(
  ticketId: string,
  opts: ReassignOpts,
  actorId: string,
) {
  const ticket = await loadSr(ticketId);
  const oldAssignee = ticket.assignedTo;
  if (opts.userId) ticket.assignedTo = oid(opts.userId);
  if (opts.subCategoryId) ticket.category = opts.subCategoryId as any;
  const change = recordChange(
    ticket,
    "assignedTo",
    oldAssignee,
    ticket.assignedTo,
    actorId,
    "reassigned",
  );
  change.reassignmentReason = opts.remark;
  addFollowUp(ticket, `Reassigned: ${opts.remark || ""}`, actorId);
  // NOTE: SLA/TAT deliberately left untouched on reassign.
  await ticket.save();
  await notifySrWatchers(ticket, "reassigned", actorId);
  return ticket;
}

/** Delegate to another employee (assignee on leave/left); keeps original. */
export async function delegateSr(
  ticketId: string,
  opts: { toUserId: string; reason?: string },
  actorId: string,
) {
  const ticket = await loadSr(ticketId);
  const original = ticket.delegation?.originalAssignee || ticket.assignedTo;
  ticket.delegation = {
    delegatedTo: oid(opts.toUserId),
    delegatedBy: oid(actorId),
    delegatedAt: new Date(),
    reason: opts.reason,
    originalAssignee: original || undefined,
  };
  recordChange(ticket, "assignedTo", ticket.assignedTo, opts.toUserId, actorId);
  ticket.assignedTo = oid(opts.toUserId);
  addFollowUp(ticket, `Delegated: ${opts.reason || ""}`, actorId);
  await ticket.save();
  await notifySrWatchers(ticket, "delegated", actorId);
  return ticket;
}

/** Parent final closure + feedback. Satisfied → Closed; else awaits re-open. */
export async function parentCloseSr(
  ticketId: string,
  opts: { satisfied: boolean; comments?: string; rating?: number },
  actorId: string,
) {
  const ticket = await loadSr(ticketId);
  ticket.parentClosure = {
    satisfied: !!opts.satisfied,
    closedAt: new Date(),
    comments: opts.comments,
  };
  if (opts.satisfied) {
    recordChange(ticket, "status", ticket.status, SR_STATUS.CLOSED, actorId);
    ticket.status = SR_STATUS.CLOSED;
    ticket.closedAt = new Date();
  }
  addFollowUp(ticket, opts.comments || "", actorId, true);
  // TODO(Phase 2 wiring): persist a FeedbackResponse (CSAT) record.
  await ticket.save();
  await notifySrWatchers(ticket, "parent_closed", actorId);

  // #10 Not-happy escalation — notify a configurable manager when the parent
  // is unsatisfied (or rates at/below the threshold) and did not re-open.
  await notifyManagerOnNegativeFeedback(ticket, opts, actorId);
  return ticket;
}

/**
 * Notify the configured manager (user or role) when parent feedback is
 * negative. Fire-and-forget: never blocks the closure on notification errors.
 */
async function notifyManagerOnNegativeFeedback(
  ticket: any,
  opts: { satisfied: boolean; rating?: number },
  actorId?: string,
) {
  try {
    const cfg = await getProjectSrConfig(ticket.project);
    const fb = cfg.feedback;
    if (!fb?.notifyManagerOnNegative) return;
    const ratedLow =
      opts.rating != null && Number(opts.rating) <= (fb.ratingThreshold ?? 2);
    const negative = opts.satisfied === false || ratedLow;
    if (!negative) return;

    let managerId: mongoose.Types.ObjectId | null = null;
    if (fb.notifyUserId && mongoose.Types.ObjectId.isValid(fb.notifyUserId)) {
      managerId = new mongoose.Types.ObjectId(fb.notifyUserId);
    } else if (fb.notifyRoleId) {
      managerId = await resolveRoleAssignee(fb.notifyRoleId, ticket.project);
    }
    if (!managerId) return;

    await Notification.create({
      recipientUserId: managerId,
      triggeredByUserId: actorId
        ? new mongoose.Types.ObjectId(actorId)
        : undefined,
      projectId: ticket.project,
      triggerType: "sr_reopened",
      entityType: "ticket",
      entityId: ticket._id,
      title: `Unhappy parent feedback — ${ticket.ticketNumber}`,
      body: `Parent was not satisfied${
        opts.rating != null ? ` (rated ${opts.rating})` : ""
      }. Please follow up.`,
      deepLinkUrl: `/service-requests/${ticket._id}`,
    } as any);
  } catch (e) {
    console.error("[sr] negative-feedback notify error:", e);
  }
}

/** Re-open (parent/PSL, once) → auto-assign Principal (resolver pending). */
export async function reopenSr(
  ticketId: string,
  opts: { reason?: string },
  actorId: string,
) {
  const ticket = await loadSr(ticketId);
  if (!canReopen(ticket)) {
    throw new SrError(
      "This service request has already been re-opened once.",
      400,
    );
  }
  recordChange(ticket, "status", ticket.status, SR_STATUS.REOPEN, actorId);
  ticket.status = SR_STATUS.REOPEN;
  ticket.reopen = {
    count: (ticket.reopen?.count ?? 0) + 1,
    reopenedBy: oid(actorId),
    reopenedAt: new Date(),
  };
  const principal = await resolveReopenAssignee(
    ticket.project,
    ticket.category,
    (ticket as any).metadata?.centerId,
  );
  if (principal) ticket.assignedTo = principal;
  addFollowUp(ticket, `Re-opened: ${opts.reason || ""}`, actorId);
  await ticket.save();
  await notifySrWatchers(ticket, "reopened", actorId);
  return ticket;
}

/** PSL satisfaction call for a dissatisfied parent not re-opening. */
export async function pslSatisfactionCall(
  ticketId: string,
  opts: { spoken: boolean; parentSatisfied?: boolean; comments?: string },
  actorId: string,
) {
  const ticket = await loadSr(ticketId);
  ticket.pslCall = {
    spoken: !!opts.spoken,
    parentSatisfied: opts.parentSatisfied,
    comments: opts.comments,
    calledBy: oid(actorId),
    calledAt: new Date(),
  };
  if (opts.spoken && opts.parentSatisfied === false && canReopen(ticket)) {
    ticket.status = SR_STATUS.REOPEN;
    ticket.reopen = {
      count: (ticket.reopen?.count ?? 0) + 1,
      reopenedBy: oid(actorId),
      reopenedAt: new Date(),
    };
  } else if (opts.spoken && opts.parentSatisfied === true) {
    ticket.status = SR_STATUS.CLOSED;
    ticket.closedAt = ticket.closedAt || new Date();
  }
  // Proper audit entry — surfaces in History + Audit timelines (not a parent
  // reply). Captures whether the parent was reached, satisfaction and outcome.
  const outcome =
    !opts.spoken
      ? "Could not reach parent"
      : opts.parentSatisfied === true
        ? "Parent satisfied → Closed"
        : opts.parentSatisfied === false
          ? "Parent not satisfied" +
            (ticket.status === SR_STATUS.REOPEN ? " → Re-opened" : "")
          : "Spoke to parent";
  ticket.changeHistory = ticket.changeHistory || [];
  ticket.changeHistory.push({
    field: "PSL Call",
    oldValue: "-",
    newValue: `${outcome}${opts.comments ? ` — ${opts.comments}` : ""}`,
    changedBy: oid(actorId),
    changedAt: new Date(),
  } as any);
  await ticket.save();
  return ticket;
}

/**
 * Cancel an SR. Reason is required. Optionally link a replacement SR (two-way),
 * e.g. when the original was raised under the wrong sub-category. Cancel is a
 * terminal transition allowed from any live status (guarded by SR_CANCEL).
 */
export async function cancelSr(
  ticketId: string,
  actorId: string,
  opts: { reason: string; replacementSrId?: string },
) {
  const ticket = await loadSr(ticketId);
  const reason = (opts.reason || "").trim();
  if (!reason) throw new SrError("A cancellation reason is required.", 400);

  const transition = getTransition(ticket.status, SR_STATUS.CANCEL);
  if (!transition) {
    throw new SrError(
      "This service request cannot be cancelled from its current status.",
      400,
    );
  }

  let replacement: any = null;
  if (opts.replacementSrId) {
    if (!mongoose.Types.ObjectId.isValid(opts.replacementSrId)) {
      throw new SrError("Invalid replacement service request id.", 400);
    }
    if (String(opts.replacementSrId) === String(ticket._id)) {
      throw new SrError("A request cannot replace itself.", 400);
    }
    replacement = await Ticket.findById(opts.replacementSrId);
    if (!replacement || !replacement.interactionType || replacement.interactionType === "normal") {
      throw new SrError("Replacement service request not found.", 404);
    }
    if (String(replacement.project) !== String(ticket.project)) {
      throw new SrError(
        "Replacement service request belongs to a different project.",
        400,
      );
    }
  }

  recordChange(ticket, "status", ticket.status, SR_STATUS.CANCEL, actorId);
  ticket.status = SR_STATUS.CANCEL;
  ticket.cancel = {
    reason,
    replacementSrId: replacement ? (replacement._id as any) : undefined,
    by: oid(actorId),
    at: new Date(),
  };
  addFollowUp(ticket, `Cancelled: ${reason}`, actorId, true);
  await ticket.save();

  // Two-way link on the replacement so both sides cross-reference.
  if (replacement) {
    replacement.metadata = replacement.metadata || {};
    (replacement.metadata as any).replacesCancelledSrId = String(ticket._id);
    replacement.markModified("metadata");
    await replacement.save();
  }

  await notifySrWatchers(ticket, "cancelled", actorId);
  return ticket;
}

export async function checkSrDuplicates(q: DuplicateQuery) {
  return findDuplicateServiceRequests(q);
}

// ── List & detail (Phase 3) ──────────────────────────────────────────────────

export interface ListSrParams {
  projectId?: string;
  interactionType?: string; // "PSR" | "ISR" | "all"
  viewScope?: "project" | "assigned" | "raised" | "my";
  status?: string;
  assignedTo?: string;
  search?: string;
  createdFrom?: string;
  createdTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
  priority?: string;
  wipFrom?: string;
  wipTo?: string;
  wipState?: string; // "overdue" | "today" | "week" | "none"
  source?: string;
  classification?: string;
  categoryId?: string;
  linkedIsrState?: string; // "none" | "pending" | "completed"
  sortBy?: string;
  sortOrder?: string;
  page?: number;
  limit?: number;
  scope?: ProjectScope; // restrict to the requester's projects
  viewerId?: string;
  viewerEmail?: string;
  access?: {
    all?: boolean;
    own?: boolean;
    assigned?: boolean;
  };
}

const csv = (value?: string): string[] =>
  (value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

const validDate = (value?: string): Date | undefined => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const endOfDay = (date: Date): Date => {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
};

const castObjectIdFilter = (value: any): any => {
  if (!value) return value;
  if (typeof value === "string" && mongoose.Types.ObjectId.isValid(value)) {
    return new mongoose.Types.ObjectId(value);
  }
  if (Array.isArray(value)) return value.map((v) => castObjectIdFilter(v));
  if (typeof value === "object") {
    const next: any = { ...value };
    if (Array.isArray(next.$in)) next.$in = next.$in.map((v: any) => castObjectIdFilter(v));
    if (Array.isArray(next.$nin)) next.$nin = next.$nin.map((v: any) => castObjectIdFilter(v));
    if (next.$eq) next.$eq = castObjectIdFilter(next.$eq);
    return next;
  }
  return value;
};

const objectIdQueryFields = new Set([
  "_id",
  "project",
  "createdBy",
  "assignedTo",
  "linkedPsrId",
]);

const castAggregationObjectIds = (query: any): any => {
  if (!query || typeof query !== "object") return query;
  if (Array.isArray(query)) return query.map((item) => castAggregationObjectIds(item));
  return Object.fromEntries(
    Object.entries(query).map(([key, value]) => [
      key,
      objectIdQueryFields.has(key)
        ? castObjectIdFilter(value)
        : castAggregationObjectIds(value),
    ]),
  );
};

const applyDateRange = (
  query: any,
  field: string,
  from?: string,
  to?: string,
) => {
  const start = validDate(from);
  const end = validDate(to);
  if (!start && !end) return;
  query[field] = {};
  if (start) query[field].$gte = start;
  if (end) query[field].$lte = endOfDay(end);
};

const applyCsvFilter = (query: any, field: string, value?: string) => {
  const values = csv(value);
  if (!values.length) return;
  query[field] = values.length === 1 ? values[0] : { $in: values };
};

const addAnd = (query: any, condition: any) => {
  query.$and = query.$and || [];
  query.$and.push(condition);
};

const raisedByViewerConditions = (viewerId: string, viewerEmail?: string) => {
  const conditions: any[] = [
    { createdBy: viewerId },
    { "metadata.raisedByUserId": viewerId },
    { "metadata.createdByAgentId": viewerId },
    { "metadata.createdByREUserId": viewerId },
  ];
  if (viewerEmail) {
    conditions.push({
      "metadata.createdByAgentEmail": viewerEmail.toLowerCase(),
    });
  }
  return conditions;
};

const categoryFilter = (categoryId: string) => ({
  $or: [
    { category: categoryId },
    { "categoryHierarchy.level1": categoryId },
    { "categoryHierarchy.level2": categoryId },
    { "categoryHierarchy.level3": categoryId },
    { "categoryHierarchy.level4": categoryId },
    { "categoryHierarchy.level5": categoryId },
  ],
});

async function applyLinkedIsrFilter(query: any, state?: string) {
  if (!state || state === "all") return;

  const rollup = await Ticket.aggregate([
    { $match: { linkedPsrId: { $exists: true, $ne: null } } },
    {
      $group: {
        _id: "$linkedPsrId",
        total: { $sum: 1 },
        done: { $sum: { $cond: [{ $in: ["$status", [4, 5]] }, 1, 0] } },
      },
    },
  ]);

  const linkedIds = (rollup as any[]).map((r) => r._id);
  if (state === "none") {
    query._id = { ...(query._id || {}), $nin: linkedIds };
    return;
  }

  const matchingIds = (rollup as any[])
    .filter((r) =>
      state === "completed" ? r.total > 0 && r.done >= r.total : r.done < r.total,
    )
    .map((r) => r._id);
  query._id = { ...(query._id || {}), $in: matchingIds };
}

export async function listServiceRequests(params: ListSrParams) {
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
  const it = params.interactionType || "PSR";

  const q: any = {
    interactionType: it === "all" ? { $in: ["PSR", "ISR"] } : it,
  };
  if (params.scope) {
    applyProjectScope(q, "project", params.projectId, params.scope);
  } else if (params.projectId) {
    q.project = params.projectId;
  }

  const requestedScope = params.viewScope;
  const viewScope = ["project", "assigned", "raised", "my"].includes(
    requestedScope || "",
  )
    ? requestedScope
    : params.access?.all
      ? "project"
      : "my";
  if (params.viewerId) {
    const visibility: any[] = [];
    if (viewScope === "project") {
      if (!params.access?.all) {
        throw new SrError("Forbidden: project service request access required", 403);
      }
    } else if (viewScope === "assigned") {
      if (!params.access?.assigned) {
        throw new SrError("Forbidden: assigned service request access required", 403);
      }
      visibility.push({ assignedTo: params.viewerId });
    } else if (viewScope === "raised") {
      if (!params.access?.own) {
        throw new SrError("Forbidden: own service request access required", 403);
      }
      visibility.push(
        ...raisedByViewerConditions(params.viewerId, params.viewerEmail),
      );
    } else {
      if (params.access?.own) {
        visibility.push(
          ...raisedByViewerConditions(params.viewerId, params.viewerEmail),
        );
      }
      if (params.access?.assigned) visibility.push({ assignedTo: params.viewerId });
    }
    if (viewScope !== "project" && !visibility.length) {
      throw new SrError("Forbidden: insufficient service request access", 403);
    }
    if (visibility.length) addAnd(q, { $or: visibility });
  }

  const statuses = csv(params.status).filter((s) => s !== "all").map(Number);
  if (statuses.length) q.status = statuses.length === 1 ? statuses[0] : { $in: statuses };
  if (params.assignedTo) q.assignedTo = params.assignedTo;
  applyCsvFilter(q, "priority", params.priority);
  applyCsvFilter(q, "submissionSource", params.source);
  applyCsvFilter(q, "metadata.classification", params.classification);
  if (params.categoryId) addAnd(q, categoryFilter(params.categoryId));
  applyDateRange(q, "createdAt", params.createdFrom, params.createdTo);
  applyDateRange(q, "updatedAt", params.updatedFrom, params.updatedTo);
  applyDateRange(q, "wip.committedDate", params.wipFrom, params.wipTo);

  const now = new Date();
  if (params.wipState === "overdue") {
    q["wip.committedDate"] = { ...(q["wip.committedDate"] || {}), $lt: now };
    q.status = q.status || { $in: [2, 7] };
  } else if (params.wipState === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    q["wip.committedDate"] = {
      ...(q["wip.committedDate"] || {}),
      $gte: start,
      $lte: endOfDay(now),
    };
  } else if (params.wipState === "week") {
    const end = new Date();
    end.setDate(end.getDate() + 7);
    q["wip.committedDate"] = {
      ...(q["wip.committedDate"] || {}),
      $gte: now,
      $lte: endOfDay(end),
    };
  } else if (params.wipState === "none") {
    q["wip.committedDate"] = { $exists: false };
  }

  if (params.search) {
    const rx = new RegExp(
      params.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i",
    );
    addAnd(q, {
      $or: [
        { ticketNumber: rx },
        { subject: rx },
        { "metadata.studentName": rx },
        { "metadata.studentEnrollment": rx },
        { "metadata.parent.name": rx },
        { "metadata.parent.mobile": rx },
      ],
    });
  }

  await applyLinkedIsrFilter(q, params.linkedIsrState);

  // Base query for the status-counter strip: every filter EXCEPT status, so the
  // counters stay stable while a status is selected (mirrors View Queries).
  const qBase: any = castAggregationObjectIds(q);
  delete qBase.status;

  const allowedSorts = new Set([
    "createdAt",
    "updatedAt",
    "priority",
    "status",
    "wip.committedDate",
  ]);
  const sortBy = allowedSorts.has(params.sortBy || "")
    ? params.sortBy!
    : "createdAt";
  const sortOrder = params.sortOrder === "asc" ? 1 : -1;

  const [items, total, statusAgg] = await Promise.all([
    Ticket.find(q)
      .sort({ [sortBy]: sortOrder, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("assignedTo", "firstName lastName fullName email")
      .populate("createdBy", "firstName lastName fullName email")
      .lean(),
    Ticket.countDocuments(q),
    Ticket.aggregate([
      { $match: qBase },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  const statusCounts: Record<string, number> = {};
  let allCount = 0;
  for (const s of statusAgg as Array<{ _id: number; count: number }>) {
    statusCounts[String(s._id)] = s.count;
    allCount += s.count;
  }
  statusCounts.all = allCount;

  // Linked-ISR rollup: one aggregate over child ISRs for the PSR rows on this
  // page. done = status Resolved(4)/Closed(5). Inline list powers the popover.
  const psrIds = (items as any[])
    .filter((i) => i.interactionType === "PSR")
    .map((i) => i._id);
  if (psrIds.length) {
    const rollup = await Ticket.aggregate([
      { $match: { linkedPsrId: { $in: psrIds } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$linkedPsrId",
          total: { $sum: 1 },
          done: {
            $sum: { $cond: [{ $in: ["$status", [4, 5]] }, 1, 0] },
          },
          isrs: {
            $push: {
              _id: "$_id",
              ticketNumber: "$ticketNumber",
              status: "$status",
            },
          },
        },
      },
    ]);
    const byPsr = new Map(
      (rollup as any[]).map((r) => [String(r._id), r]),
    );
    for (const it of items as any[]) {
      const r = byPsr.get(String(it._id));
      it.linkedIsr = { total: r?.total || 0, done: r?.done || 0 };
      it.linkedIsrs = (r?.isrs || []).slice(0, 25);
    }
  }

  return { items, total, page, limit, statusCounts };
}

/** ISRs linked to a parent ticket (normal ticket or PSR). */
export async function listLinkedIsrs(parentTicketId: string, scope?: ProjectScope) {
  if (!mongoose.Types.ObjectId.isValid(parentTicketId)) {
    throw new SrError("Invalid parent ticket id", 400);
  }
  const parent = await Ticket.findById(parentTicketId)
    .select("interactionType project")
    .lean();
  if (!parent || (parent as any).interactionType === "ISR") {
    throw new SrError("Parent ticket not found", 404);
  }
  if (scope && !canAccessProject(scope, (parent as any).project)) {
    throw new SrError("Parent ticket not found", 404);
  }
  const items = await Ticket.find({ linkedPsrId: parentTicketId })
    .sort({ createdAt: -1 })
    .select("ticketNumber subject status priority assignedTo createdAt")
    .populate("assignedTo", "firstName lastName fullName email")
    .lean();
  const total = items.length;
  const done = items.filter((i: any) => i.status === 4 || i.status === 5).length;
  return { items, total, done };
}

/** Link an existing ISR to a parent ticket (same project, ISR not chained). */
export async function linkIsrToPsr(
  isrId: string,
  parentTicketId: string,
  scope?: ProjectScope,
) {
  if (
    !mongoose.Types.ObjectId.isValid(isrId) ||
    !mongoose.Types.ObjectId.isValid(parentTicketId)
  ) {
    throw new SrError("Invalid id", 400);
  }
  const isr = await Ticket.findById(isrId);
  if (!isr || isr.interactionType !== "ISR") {
    throw new SrError("ISR not found", 404);
  }
  const parent = await Ticket.findById(parentTicketId)
    .select("interactionType project")
    .lean();
  if (!parent || (parent as any).interactionType === "ISR") {
    throw new SrError("Parent ticket not found", 404);
  }
  if (String(isr.project) !== String((parent as any).project)) {
    throw new SrError("ISR and parent ticket belong to different projects", 400);
  }
  if (scope && !canAccessProject(scope, isr.project)) {
    throw new SrError("ISR not found", 404);
  }
  isr.linkedPsrId = new mongoose.Types.ObjectId(parentTicketId) as any;
  await isr.save();
  return { ticketId: String(isr._id), linkedPsrId: parentTicketId };
}

export async function getServiceRequest(
  id: string,
  scope?: ProjectScope,
  viewer?: {
    userId?: string;
    email?: string;
    access?: { all?: boolean; own?: boolean; assigned?: boolean };
  },
) {
  const ticket = await Ticket.findById(id)
    .populate("assignedTo", "firstName lastName fullName email")
    .populate("createdBy", "firstName lastName fullName email")
    .populate("cc", "firstName lastName fullName email")
    .lean();
  if (!ticket) throw new SrError("Service request not found", 404);
  const it = (ticket as any).interactionType;
  if (!it || it === "normal") {
    throw new SrError("This ticket is not a service request", 400);
  }
  if (scope && !canAccessProject(scope, (ticket as any).project)) {
    throw new SrError("Service request not found", 404);
  }
  if (!viewer?.access?.all && viewer?.userId) {
    const metadata = ((ticket as any).metadata || {}) as Record<string, any>;
    const actorIds = [
      metadata.raisedByUserId,
      metadata.createdByAgentId,
      metadata.createdByREUserId,
    ].filter(Boolean);
    const isOwn =
      viewer.access?.own &&
      (String((ticket as any).createdBy?._id || (ticket as any).createdBy || "") ===
        String(viewer.userId) ||
        actorIds.some((id) => String(id) === String(viewer.userId)) ||
        (!!viewer.email &&
          String(metadata.createdByAgentEmail || "").toLowerCase() ===
            viewer.email.toLowerCase()));
    const isAssigned =
      viewer.access?.assigned &&
      String((ticket as any).assignedTo?._id || (ticket as any).assignedTo || "") ===
        String(viewer.userId);
    if (!isOwn && !isAssigned) {
      throw new SrError("Service request not found", 404);
    }
  }
  return ticket;
}
