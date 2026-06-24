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
// Vector re-opens auto-assign to the Principal. Configurable via sr.reopen so
// the actual person/role can be set later without code changes.
async function resolveReopenAssignee(
  projectId: any,
): Promise<mongoose.Types.ObjectId | null> {
  const cfg = await getProjectSrConfig(projectId);
  const r = cfg.reopen || {};
  if (r.assignToUserId) return new mongoose.Types.ObjectId(r.assignToUserId);
  if (r.assignToRoleId) {
    const inProject = await User.findOne({
      role: r.assignToRoleId,
      isActive: true,
      projects: projectId,
    })
      .select("_id")
      .lean();
    if (inProject) return inProject._id as any;
    const anyUser = await User.findOne({
      role: r.assignToRoleId,
      isActive: true,
    })
      .select("_id")
      .lean();
    if (anyUser) return anyUser._id as any;
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
      title: `Service Request ${ticket.ticketNumber}`,
      body: `Update: ${event.replace(/_/g, " ")}`,
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
  opts: { satisfied: boolean; comments?: string },
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
  return ticket;
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
  const principal = await resolveReopenAssignee(ticket.project);
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
  addFollowUp(ticket, `PSL call: ${opts.comments || ""}`, actorId);
  await ticket.save();
  return ticket;
}

export async function checkSrDuplicates(q: DuplicateQuery) {
  return findDuplicateServiceRequests(q);
}

// ── List & detail (Phase 3) ──────────────────────────────────────────────────

export interface ListSrParams {
  projectId?: string;
  interactionType?: string; // "PSR" | "ISR" | "all"
  status?: string;
  assignedTo?: string;
  search?: string;
  page?: number;
  limit?: number;
  scope?: ProjectScope; // restrict to the requester's projects
}

export async function listServiceRequests(params: ListSrParams) {
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
  const it = params.interactionType || "PSR";

  const q: any = {
    interactionType: it === "all" ? { $ne: "normal" } : it,
  };
  if (params.scope) {
    applyProjectScope(q, "project", params.projectId, params.scope);
  } else if (params.projectId) {
    q.project = params.projectId;
  }
  if (params.status && params.status !== "all") q.status = Number(params.status);
  if (params.assignedTo) q.assignedTo = params.assignedTo;
  if (params.search) {
    const rx = new RegExp(
      params.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i",
    );
    q.$or = [{ ticketNumber: rx }, { subject: rx }];
  }

  // Base query for the status-counter strip: every filter EXCEPT status, so the
  // counters stay stable while a status is selected (mirrors View Queries).
  const qBase: any = { ...q };
  delete qBase.status;

  const [items, total, statusAgg] = await Promise.all([
    Ticket.find(q)
      .sort({ createdAt: -1 })
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

  return { items, total, page, limit, statusCounts };
}

export async function getServiceRequest(id: string, scope?: ProjectScope) {
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
  return ticket;
}
