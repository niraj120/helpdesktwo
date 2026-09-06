/**
 * Service Request (PSR/ISR) module — creation orchestrator. Phase 3.
 * Normalizes channel input, runs advisory duplicate detection, resolves
 * assignment + CC from the master-data routing, and creates the Ticket via the
 * existing model. Channels: online + walk-in implemented; email/ivr funnel here
 * in later phases.
 */
import mongoose from "mongoose";
import { Ticket } from "../../models/Ticket";
import { Project } from "../../models/Project";
import { Category } from "../../models/Category";
import { User } from "../../models/User";
import { isSrEnabled, resolveSrConfig } from "./serviceRequestConfig";
import { resolveFormSchema } from "./srForms";
import type { SrAutoClose } from "./srMasterData";
import { evalConditions, renderTemplate } from "./srConditionEngine";
import { SR_STATUS } from "./srWorkflow";
import { resolveSrRouting } from "./srMasterData";
import { findDuplicateServiceRequests } from "./srDuplicateDetection";
import { generateSrTicketNumber } from "./srTicketNumber";
import { notifySrActivity } from "./srActivity";
import {
  SrError,
  notifySrWatchers,
  assertIsrParentAllowed,
} from "./serviceRequestService";
import { autoAssignTicket } from "../../utils/ticketAutoAssignment";
import {
  resolveScopeOwners,
  buildRoutingScope,
  primaryOwnerRole,
} from "./psrRoutingResolver";
import {
  autoAssignMatrixToTicket,
  resolveMatrixAssignee,
} from "../../services/escalationMatrixService";
import {
  InteractionType,
  ModeOfContact,
  RequestType,
  SrChannel,
} from "./types";

const CHANNEL_TO_SOURCE: Record<SrChannel, string> = {
  online: "online",
  walk_in: "walk_in",
  email: "email",
  ivr: "ivr",
  self_service: "self_service",
};

const firstText = (...values: any[]): string | undefined => {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return undefined;
};

const joinName = (...values: any[]): string | undefined => {
  const name = values.map((value) => String(value || "").trim()).filter(Boolean).join(" ");
  return name || undefined;
};

const buildRequestedByMetadata = async (
  input: CreateServiceRequestInput,
): Promise<Record<string, any>> => {
  const parent = input.parent || {};
  const formData = input.formData || {};
  const metadata = input.metadata || {};
  const source = CHANNEL_TO_SOURCE[input.channel] || input.channel;

  if (input.interactionType === "ISR") {
    // ISR is staff→staff: there is no parent or student. The requester IS the
    // agent who raised it, so resolve their name/contact from their user record
    // — otherwise the detail page's Requester panel renders blank.
    const raiserId = input.createdBy || input.actorId;
    const staff: any =
      raiserId && mongoose.Types.ObjectId.isValid(String(raiserId))
        ? await User.findById(raiserId)
            .select("firstName lastName fullName email mobile phone")
            .lean()
        : null;
    const staffName = firstText(
      staff?.fullName,
      joinName(staff?.firstName, staff?.lastName),
    );
    const staffEmail = firstText(staff?.email);
    const staffMobile = firstText(staff?.mobile, staff?.phone);
    return {
      requestedBy: {
        type: "staff",
        userId: raiserId,
        name: staffName,
        email: staffEmail,
        mobile: staffMobile,
        source,
      },
      requestedByUserId: raiserId,
      requestedByType: "staff",
      ...(staffName ? { requestedByName: staffName } : {}),
      ...(staffEmail ? { requestedByEmail: staffEmail } : {}),
      ...(staffMobile ? { requestedByMobile: staffMobile } : {}),
      sourceLabel: source,
    };
  }

  const requestedByName = firstText(
    metadata.requestedByName,
    parent.name,
    parent.fullName,
    joinName(parent.firstName, parent.middleName, parent.lastName),
    formData.parentName,
    formData.name,
    formData.parentFirstName || formData.parentLastName
      ? joinName(formData.parentFirstName, formData.parentLastName)
      : undefined,
    metadata.fromName,
    metadata.callerName,
  );
  const requestedByEmail = firstText(
    metadata.requestedByEmail,
    parent.email,
    formData.parentEmail,
    formData.email,
    input.requesterEmail,
    metadata.fromEmail,
  );
  const requestedByMobile = firstText(
    metadata.requestedByMobile,
    parent.mobile,
    parent.phone,
    parent.contact,
    formData.parentMobile,
    formData.mobile,
    formData.phone,
    metadata.callerMobile,
  );

  return {
    requestedBy: {
      type: "parent",
      userId: input.studentUserId || input.createdBy,
      name: requestedByName,
      email: requestedByEmail,
      mobile: requestedByMobile,
      source,
    },
    ...(input.studentUserId || input.createdBy
      ? { requestedByUserId: input.studentUserId || input.createdBy }
      : {}),
    requestedByType: "parent",
    ...(requestedByName ? { requestedByName } : {}),
    ...(requestedByEmail ? { requestedByEmail } : {}),
    ...(requestedByMobile ? { requestedByMobile } : {}),
    sourceLabel: source,
  };
};

const normalizeOptionalObjectId = (
  value: unknown,
  fieldName: string,
): string | undefined => {
  const id = String(value || "").trim();
  if (!id) return undefined;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new SrError(`Invalid ${fieldName}.`, 400);
  }
  return id;
};

const normalizeCategoryHierarchy = (
  hierarchy?: Record<string, string>,
): Record<string, string> | undefined => {
  if (!hierarchy || typeof hierarchy !== "object") return undefined;
  const cleaned = Object.fromEntries(
    Object.entries(hierarchy)
      .map(([key, value]) => [key, String(value || "").trim()])
      .filter(([, value]) => value),
  ) as Record<string, string>;
  for (const [key, value] of Object.entries(cleaned)) {
    if (/^level[1-5]$/.test(key) && !mongoose.Types.ObjectId.isValid(value)) {
      throw new SrError(`Invalid category hierarchy ${key}.`, 400);
    }
  }
  return Object.keys(cleaned).length ? cleaned : undefined;
};

export interface CreateServiceRequestInput {
  projectId: string;
  interactionType: Exclude<InteractionType, "normal">;
  requestType?: RequestType;
  /** ISR only: parent PSR ticket id this ISR is linked to. */
  linkedPsrId?: string;
  /** ISR only: parent ticket id this ISR is linked to (normal ticket or PSR). */
  linkedParentTicketId?: string;
  channel: SrChannel;
  modeOfContact?: ModeOfContact;
  /** Deepest selected sub-category. */
  categoryId?: string;
  categoryHierarchy?: Record<string, string>;
  subject: string;
  description?: string;
  /** The requester (student/parent), or the agent when raised on behalf. */
  createdBy?: string;
  /** Logged-in staff/user who performed the creation or conversion. */
  actorId?: string;
  /** Walk-in / on-behalf: the student the SR is for. */
  studentUserId?: string;
  studentEnrollment?: string;
  /** Explicit assignee (overrides matrix). */
  assignedTo?: string;
  /** ISR: explicit assignee emails (first = primary, rest = cc). */
  assignedToEmails?: string[];
  /** Classify-channel key chosen in the wizard. */
  classification?: string;
  /** Existing-parent flow: selected parent + children (stored in metadata). */
  parent?: Record<string, any>;
  children?: Array<Record<string, any>>;
  /** Priority & schedule override block. */
  priority?: string;
  scheduleDispatchDate?: string;
  /** Offline / RE-entry block. */
  createdByRE?: boolean;
  requesterEmail?: string;
  formData?: Record<string, any>;
  metadata?: Record<string, any>;
  sourceEmail?: string;
  sourceEmailName?: string;
  sourceEmailMessageId?: string;
  sourceEmailConfigId?: string;
  skipDuplicateCheck?: boolean;
}

export interface CreateServiceRequestResult {
  ticketId: string;
  ticketNumber: string;
  interactionType: InteractionType;
  assignedTo: string | null;
  /** True when a category auto-close rule closed the SR on creation. */
  autoClosed?: boolean;
  duplicates?: any[];
  /** Editable per-project message shown when duplicates are found. */
  duplicateMessage?: string;
}

export async function createServiceRequest(
  input: CreateServiceRequestInput,
): Promise<CreateServiceRequestResult> {
  const project = await Project.findById(input.projectId).select(
    "configuration",
  );
  if (!project) throw new SrError("Project not found", 404);
  if (!isSrEnabled(project, input.interactionType)) {
    throw new SrError(
      `Service Requests (${input.interactionType}) are not enabled for this project.`,
      400,
    );
  }
  if (!input.subject) throw new SrError("Subject is required", 400);
  const categoryId = normalizeOptionalObjectId(input.categoryId, "category");
  const categoryHierarchy = normalizeCategoryHierarchy(input.categoryHierarchy);

  // Linked parent validation: only an ISR may link, and only to a ticket in the
  // same project — a normal ticket, a PSR, or (where the project enables
  // sub-ISRs) another ISR. linkedPsrId is kept as a backward-compatible alias
  // for existing PSR flows.
  let linkedPsrId: mongoose.Types.ObjectId | undefined;
  const parentLinkId = input.linkedParentTicketId || input.linkedPsrId;
  if (parentLinkId) {
    if (input.interactionType !== "ISR") {
      throw new SrError("Only an ISR can be linked to a parent ticket.", 400);
    }
    if (!mongoose.Types.ObjectId.isValid(parentLinkId)) {
      throw new SrError("Invalid linked parent ticket id.", 400);
    }
    const parent = await Ticket.findById(parentLinkId)
      .select("interactionType project")
      .lean();
    if (!parent) {
      throw new SrError("Linked parent ticket not found.", 404);
    }
    if (String((parent as any).project) !== String(input.projectId)) {
      throw new SrError("Linked parent ticket belongs to a different project.", 400);
    }
    // Same rules as linking an existing ISR: opt-in, no loops, depth capped.
    await assertIsrParentAllowed(
      String(parentLinkId),
      (parent as any).interactionType,
      String(input.projectId),
    );
    linkedPsrId = new mongoose.Types.ObjectId(parentLinkId);
  }

  // Advisory duplicate detection (PSR only) — does not block creation.
  let duplicates: any[] | undefined;
  if (
    input.interactionType === "PSR" &&
    categoryId &&
    !input.skipDuplicateCheck
  ) {
    duplicates = await findDuplicateServiceRequests({
      projectId: input.projectId,
      subCategoryId: categoryId,
      studentUserId: input.studentUserId || input.createdBy,
      studentEnrollment: input.studentEnrollment,
    });
  }

  // Resolve assignment + CC + priority from the routing master data.
  const selfAssignStaffExistingParentPsr =
    input.interactionType === "PSR" &&
    input.classification === "existing_parent" &&
    input.channel === "walk_in" &&
    !!input.actorId &&
    !input.assignedTo;
  let assignedTo: mongoose.Types.ObjectId | null = input.assignedTo
    ? new mongoose.Types.ObjectId(input.assignedTo)
    : selfAssignStaffExistingParentPsr
      ? new mongoose.Types.ObjectId(input.actorId)
    : null;
  let assignedVia: string | undefined =
    input.assignedTo || selfAssignStaffExistingParentPsr ? "manual" : undefined;
  let cc: mongoose.Types.ObjectId[] = [];
  let priority = "NORMAL";
  let autoCloseRule: SrAutoClose | null = null;

  // SR center (offline / walk-in) drives per-center routing overrides when set.
  const srCenterId =
    (input.metadata as any)?.centerId &&
    mongoose.Types.ObjectId.isValid(String((input.metadata as any).centerId))
      ? String((input.metadata as any).centerId)
      : null;
  // Submission source drives per-source SLA/TAT (#7).
  const submissionSource = input.createdByRE
    ? "offline"
    : CHANNEL_TO_SOURCE[input.channel];

  // ── PSR entity-scope routing (school/grade/subject → owner) ──────────────────
  // Resolve the owning staff from the parent-selected scope tuple BEFORE the
  // category auto-assign, so a scoped owner (e.g. subject teacher) wins. If no
  // owner resolves, we fall through to category assignment (per fallback.mode).
  let routingScope: Record<string, string> | undefined;
  let routingOwners: Record<string, string> | undefined;
  // When routing owns the assignment decision, the category auto-assign below is
  // skipped (fallback modes role/user/none). Only fallback.mode "category" defers.
  let routingDefersToCategory = true;
  if (input.interactionType === "PSR" && !assignedTo) {
    const routingCfg = resolveSrConfig(project)?.psr?.workflow?.routing;
    if (routingCfg?.enabled) {
      const scope = buildRoutingScope(routingCfg, input.formData);
      if (Object.keys(scope).length) {
        const resolved = await resolveScopeOwners(
          routingCfg,
          scope,
          input.projectId,
        );
        routingScope = scope as Record<string, string>;
        routingOwners = Object.fromEntries(
          Object.entries(resolved.owners).filter(([, v]) => !!v) as [
            string,
            string,
          ][],
        );
        const primary = primaryOwnerRole(routingCfg);
        const ownerId = primary ? resolved.owners[primary] : null;
        const fbMode = routingCfg.fallback?.mode || "category";
        // A scope was supplied, so routing owns the decision unless it defers.
        routingDefersToCategory = fbMode === "category";
        if (ownerId) {
          assignedTo = new mongoose.Types.ObjectId(ownerId);
          assignedVia = "condition-based";
        } else if (fbMode === "user" && routingCfg.fallback?.userId) {
          assignedTo = new mongoose.Types.ObjectId(routingCfg.fallback.userId);
          assignedVia = "fallback";
        } else if (fbMode === "role" && routingCfg.fallback?.roleId) {
          // Resolve any active member of the fallback role in this project.
          const roleUser = await User.findOne({
            role: new mongoose.Types.ObjectId(routingCfg.fallback.roleId),
            isActive: true,
            $or: [
              { projects: new mongoose.Types.ObjectId(input.projectId) },
              { projects: { $size: 0 } },
            ],
          })
            .select("_id")
            .lean();
          if (roleUser?._id) {
            assignedTo = new mongoose.Types.ObjectId(String(roleUser._id));
            assignedVia = "by-role";
          }
        }
        // fbMode "none" → intentionally left unassigned; category auto-assign skipped.
      }
    }
  }

  if (categoryId) {
    if (!selfAssignStaffExistingParentPsr) {
      const routing = await resolveSrRouting(
        input.projectId,
        categoryId,
        srCenterId,
        submissionSource,
      );
      autoCloseRule = routing.autoClose;
      if (!assignedTo && routingDefersToCategory) {
        const assignment = await autoAssignTicket(
          input.projectId,
          categoryId,
          srCenterId,
        );
        if (assignment?.agentId) {
          assignedTo = assignment.agentId;
          assignedVia = assignment.assignedVia;
        }
      }
      cc = (routing.assignment?.ccUsers || []).map(
        (id) => new mongoose.Types.ObjectId(id),
      );
    }
    const cat = await Category.findById(categoryId).select(
      "defaultPriority",
    );
    if (cat?.defaultPriority) priority = cat.defaultPriority;
  }

  // Priority override block.
  if (input.priority) priority = input.priority;

  // Explicit assignee emails (ISR): first valid = primary, rest = cc.
  const unresolvedEmails: string[] = [];
  if (input.assignedToEmails?.length) {
    const emails = input.assignedToEmails
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const users = await User.find({ email: { $in: emails } })
      .select("_id email")
      .lean();
    const byEmail = new Map(users.map((u: any) => [u.email, u._id]));
    const resolvedIds = emails.map((e) => byEmail.get(e)).filter(Boolean) as any[];
    unresolvedEmails.push(...emails.filter((e) => !byEmail.has(e)));
    if (resolvedIds.length) {
      assignedTo = new mongoose.Types.ObjectId(resolvedIds[0]);
      assignedVia = "manual";
      const ccExtra = resolvedIds
        .slice(1)
        .map((id) => new mongoose.Types.ObjectId(id));
      cc = [...cc, ...ccExtra];
    }
  }

  // SLA & Escalation matrix — the level-1 owner is the starting assignee when
  // nothing more specific has claimed the ticket. Applies to PSR and ISR alike;
  // runs before the ISR raiser fallback so a configured matrix wins over
  // "whoever typed it in".
  if (!assignedTo && categoryId) {
    const fromMatrix = await resolveMatrixAssignee(
      input.projectId,
      String(categoryId),
      priority,
    );
    if (fromMatrix) {
      assignedTo = fromMatrix.userId;
      assignedVia = fromMatrix.assignedVia;
    }
  }

  // ISR is staff→staff: the agent raising it owns it until they hand it over.
  // If no assignee email was given and neither routing nor the category rules
  // produced an owner, it stays with the raiser instead of dropping into an
  // unassigned queue with nobody accountable.
  if (!assignedTo && input.interactionType === "ISR" && input.actorId) {
    assignedTo = new mongoose.Types.ObjectId(input.actorId);
    assignedVia = "manual";
  }

  const ticketNumber = await generateSrTicketNumber(
    input.projectId,
    input.interactionType,
  );
  const requestedByMetadata = await buildRequestedByMetadata(input);
  const sourceEmailConfigId = normalizeOptionalObjectId(
    input.sourceEmailConfigId,
    "sourceEmailConfigId",
  );

  // Snapshot the resolved SR form schema so field-level parent visibility
  // (showToParent / visibleAtStatus) can be enforced later on parent reads.
  let formSchemaSnapshot: any[] | undefined;
  try {
    const schema = await resolveFormSchema(
      input.projectId,
      input.interactionType,
      input.channel,
    );
    if (schema?.fields?.length) formSchemaSnapshot = schema.fields;
  } catch {
    /* no schema → nothing to snapshot */
  }

  const ticket = await Ticket.create({
    ticketNumber,
    formSchemaSnapshot,
    subject: input.subject,
    description: input.description || "",
    status: 1, // Open
    priority,
    project: new mongoose.Types.ObjectId(input.projectId),
    createdBy: input.createdBy
      ? new mongoose.Types.ObjectId(input.createdBy)
      : undefined,
    assignedTo: assignedTo || undefined,
    cc,
    category: categoryId as any,
    categoryHierarchy: categoryHierarchy as any,
    interactionType: input.interactionType,
    requestType:
      input.requestType ||
      (input.interactionType === "PSR" ? "SR" : undefined),
    linkedPsrId,
    routing: routingScope
      ? { scope: routingScope, owners: routingOwners || {} }
      : undefined,
    modeOfContact: input.modeOfContact,
    submissionSource: submissionSource as any,
    sourceEmail: input.sourceEmail || undefined,
    sourceEmailName: input.sourceEmailName || undefined,
    sourceEmailMessageId: input.sourceEmailMessageId || undefined,
    sourceEmailConfigId: sourceEmailConfigId
      ? new mongoose.Types.ObjectId(sourceEmailConfigId)
      : undefined,
    assignedVia: assignedTo
      ? assignedVia || "manual"
      : undefined,
    metadata: {
      ...(input.metadata || {}),
      ...requestedByMetadata,
      ...(input.studentEnrollment
        ? { studentEnrollment: input.studentEnrollment }
        : {}),
      ...(input.formData ? { formData: input.formData } : {}),
      ...(input.classification ? { classification: input.classification } : {}),
      ...(selfAssignStaffExistingParentPsr
        ? { assignmentRule: "staff_existing_parent_self_assigned" }
        : {}),
      ...(input.parent ? { parent: input.parent } : {}),
      ...(input.children?.length ? { children: input.children } : {}),
      ...(input.requesterEmail ? { requesterEmail: input.requesterEmail } : {}),
      ...(input.actorId
        ? {
            raisedByUserId: input.actorId,
            createdByAgentId: input.actorId,
          }
        : {}),
      ...(input.createdByRE
        ? {
            createdByRE: true,
            ...(input.actorId ? { createdByREUserId: input.actorId } : {}),
          }
        : {}),
      ...(input.scheduleDispatchDate
        ? { scheduleDispatchDate: input.scheduleDispatchDate }
        : {}),
      ...(unresolvedEmails.length ? { assigneeEmails: unresolvedEmails } : {}),
      projectId: input.projectId,
    },
  });

  // ── Auto-close rule (#8) ────────────────────────────────────────────────────
  // If a category rule matches the SR's field values, create it Closed with a
  // templated remark (falls back to the project closure-default message).
  let autoClosed = false;
  if (autoCloseRule?.enabled) {
    const values = { ...(input.formData || {}), subject: input.subject };
    if (evalConditions(autoCloseRule.conditions as any, values, autoCloseRule.match)) {
      const closureFallback =
        resolveSrConfig(project).messages?.closureDefault ||
        "Automatically closed on creation by rule.";
      const remark =
        renderTemplate(autoCloseRule.remarkTemplate || "", {
          ticketNumber,
          subject: input.subject,
          values,
        }).trim() || closureFallback;
      ticket.status = SR_STATUS.CLOSED;
      ticket.closedAt = new Date();
      (ticket as any).metadata = {
        ...((ticket as any).metadata || {}),
        autoClose: true,
      };
      ticket.markModified("metadata");
      ticket.comments = ticket.comments || [];
      ticket.comments.push({
        text: remark,
        createdBy: input.createdBy
          ? new mongoose.Types.ObjectId(input.createdBy)
          : (ticket.createdBy as any),
        createdAt: new Date(),
        isSystemComment: true,
        displayToParent: true,
      } as any);
      ticket.changeHistory = ticket.changeHistory || [];
      ticket.changeHistory.push({
        field: "status",
        oldValue: String(SR_STATUS.OPEN),
        newValue: String(SR_STATUS.CLOSED),
        changedBy: input.createdBy
          ? new mongoose.Types.ObjectId(input.createdBy)
          : (ticket.createdBy as any),
        changedAt: new Date(),
      } as any);
      await ticket.save();
      autoClosed = true;
    }
  }

  // Attach the escalation matrix (level pointer + SLA clock) for every
  // interaction type. PSR prefers the project's entity-routing matrix; PSR and
  // ISR both fall back to the category/priority matrix. Non-fatal on failure.
  if (!autoClosed) {
    try {
      await autoAssignMatrixToTicket(
        String(ticket._id),
        input.projectId,
        priority,
        categoryId ? String(categoryId) : undefined,
      );
    } catch (e) {
      console.warn("[SR] escalation matrix attach failed:", (e as any)?.message);
    }
  }

  await notifySrWatchers(
    ticket,
    autoClosed ? "closed" : "created",
    input.createdBy,
  );
  notifySrActivity(input.projectId, "requests", ticketNumber);

  return {
    ticketId: String(ticket._id),
    ticketNumber,
    interactionType: input.interactionType,
    assignedTo: assignedTo ? String(assignedTo) : null,
    autoClosed,
    duplicates,
    duplicateMessage:
      duplicates && duplicates.length
        ? resolveSrConfig(project).messages?.duplicate || undefined
        : undefined,
  };
}
