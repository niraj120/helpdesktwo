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
    submissionSource: CHANNEL_TO_SOURCE[input.channel] as any,
    assignedVia: assignedTo
      ? input.assignedTo
        ? "manual"
        : "by-user"
      : undefined,
    metadata: {
      ...(input.metadata || {}),
      ...(input.studentEnrollment
        ? { studentEnrollment: input.studentEnrollment }
        : {}),
      ...(input.formData ? { formData: input.formData } : {}),
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
