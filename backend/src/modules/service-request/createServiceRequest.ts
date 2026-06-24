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
import { isSrEnabled } from "./serviceRequestConfig";
import { resolveSrRouting } from "./srMasterData";
import { findDuplicateServiceRequests } from "./srDuplicateDetection";
import { generateSrTicketNumber } from "./srTicketNumber";
import { SrError, notifySrWatchers } from "./serviceRequestService";
import {
  InteractionType,
  ModeOfContact,
  RequestType,
  SrChannel,
} from "./types";

const CHANNEL_TO_SOURCE: Record<SrChannel, string> = {
  online: "online",
  walk_in: "offline",
  email: "email",
  ivr: "ivr",
};

export interface CreateServiceRequestInput {
  projectId: string;
  interactionType: Exclude<InteractionType, "normal">;
  requestType?: RequestType;
  channel: SrChannel;
  modeOfContact?: ModeOfContact;
  /** Deepest selected sub-category. */
  categoryId?: string;
  categoryHierarchy?: Record<string, string>;
  subject: string;
  description?: string;
  /** The requester (student/parent), or the agent when raised on behalf. */
  createdBy?: string;
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
  skipDuplicateCheck?: boolean;
}

export interface CreateServiceRequestResult {
  ticketId: string;
  ticketNumber: string;
  interactionType: InteractionType;
  assignedTo: string | null;
  duplicates?: any[];
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

  // Advisory duplicate detection (PSR only) — does not block creation.
  let duplicates: any[] | undefined;
  if (
    input.interactionType === "PSR" &&
    input.categoryId &&
    !input.skipDuplicateCheck
  ) {
    duplicates = await findDuplicateServiceRequests({
      projectId: input.projectId,
      subCategoryId: input.categoryId,
      studentUserId: input.studentUserId || input.createdBy,
      studentEnrollment: input.studentEnrollment,
    });
  }

  // Resolve assignment + CC + priority from the routing master data.
  let assignedTo: mongoose.Types.ObjectId | null = input.assignedTo
    ? new mongoose.Types.ObjectId(input.assignedTo)
    : null;
  let cc: mongoose.Types.ObjectId[] = [];
  let priority = "NORMAL";

  if (input.categoryId) {
    const routing = await resolveSrRouting(input.projectId, input.categoryId);
    if (!assignedTo && routing.assignment?.agentPool?.length) {
      assignedTo = new mongoose.Types.ObjectId(routing.assignment.agentPool[0]);
    }
    cc = (routing.assignment?.ccUsers || []).map(
      (id) => new mongoose.Types.ObjectId(id),
    );
    const cat = await Category.findById(input.categoryId).select(
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
      const ccExtra = resolvedIds
        .slice(1)
        .map((id) => new mongoose.Types.ObjectId(id));
      cc = [...cc, ...ccExtra];
    }
  }

  const ticketNumber = await generateSrTicketNumber(input.projectId);

  const ticket = await Ticket.create({
    ticketNumber,
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
    category: input.categoryId as any,
    categoryHierarchy: input.categoryHierarchy as any,
    interactionType: input.interactionType,
    requestType:
      input.requestType ||
      (input.interactionType === "PSR" ? "SR" : undefined),
    modeOfContact: input.modeOfContact,
    submissionSource: (input.createdByRE
      ? "offline"
      : CHANNEL_TO_SOURCE[input.channel]) as any,
    assignedVia: assignedTo
      ? input.assignedTo || input.assignedToEmails?.length
        ? "manual"
        : "by-user"
      : undefined,
    metadata: {
      ...(input.metadata || {}),
      ...(input.studentEnrollment
        ? { studentEnrollment: input.studentEnrollment }
        : {}),
      ...(input.formData ? { formData: input.formData } : {}),
      ...(input.classification ? { classification: input.classification } : {}),
      ...(input.parent ? { parent: input.parent } : {}),
      ...(input.children?.length ? { children: input.children } : {}),
      ...(input.requesterEmail ? { requesterEmail: input.requesterEmail } : {}),
      ...(input.createdByRE ? { createdByRE: true } : {}),
      ...(input.scheduleDispatchDate
        ? { scheduleDispatchDate: input.scheduleDispatchDate }
        : {}),
      ...(unresolvedEmails.length ? { assigneeEmails: unresolvedEmails } : {}),
      projectId: input.projectId,
    },
  });

  await notifySrWatchers(ticket, "created", input.createdBy);

  return {
    ticketId: String(ticket._id),
    ticketNumber,
    interactionType: input.interactionType,
    assignedTo: assignedTo ? String(assignedTo) : null,
    duplicates,
  };
}
