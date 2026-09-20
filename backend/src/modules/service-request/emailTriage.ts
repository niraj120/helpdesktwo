/**
 * Service Request (PSR/ISR) — Email triage inbox service. Phase 4.
 * Human-mediated: RE-Cell reads an email, classifies it, and takes one or more
 * actions. Distinct from the auto-ticket EmailProcessingQueue.
 */
import mongoose from "mongoose";
import { notifySrActivity } from "./srActivity";
import { EmailIntake } from "../../models/EmailIntake";
import { Lead } from "../../models/Lead";
import { Project } from "../../models/Project";
import ProjectEmailConfig from "../../models/ProjectEmailConfig";
import { resolveSrConfig } from "./serviceRequestConfig";
import { createServiceRequest } from "./createServiceRequest";
import { resolveSrAutoForward } from "./srMasterData";
import { SrError } from "./serviceRequestService";
import { sendTicketReplyEmail } from "../../utils/emailService";
import { applyProjectScope, ProjectScope } from "../../utils/projectScope";

const oid = (id: string) => new mongoose.Types.ObjectId(id);

async function nextUniqueId(): Promise<string> {
  const n = (await EmailIntake.estimatedDocumentCount()) + 1;
  return `M${String(n).padStart(9, "0")}`;
}

export interface IngestEmailInput {
  projectId: string;
  projectEmailConfigId?: string;
  fromName?: string;
  fromEmail: string;
  toEmail?: string;
  subject: string;
  body?: string;
  htmlBody?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
  assignedTo?: string;
  receivedAt?: string | Date;
}

export async function ingestEmail(input: IngestEmailInput) {
  const project = await Project.findById(input.projectId)
    .select("configuration.sr")
    .lean();
  if (!project) throw new SrError("Project not found", 404);
  const cfg = resolveSrConfig(project);
  const emailConfig = input.projectEmailConfigId
    ? await ProjectEmailConfig.findById(input.projectEmailConfigId)
        .select("mappedUserId")
        .lean()
    : null;
  const assignedTo =
    input.assignedTo ||
    (emailConfig?.mappedUserId ? String(emailConfig.mappedUserId) : undefined);

  const receivedAt = input.receivedAt ? new Date(input.receivedAt) : new Date();
  const dueAt = new Date(
    receivedAt.getTime() + cfg.email.tatHours * 60 * 60 * 1000,
  );

  // #11 Permanent junk — auto-junk mail from a configured sender on ingest.
  const senderLc = String(input.fromEmail || "").trim().toLowerCase();
  const isJunkSender =
    !!senderLc && (cfg.emailJunk?.senders || []).includes(senderLc);

  // Retry uniqueId on the rare duplicate.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const uniqueId = await nextUniqueId();
      const doc = await EmailIntake.create({
        projectId: oid(input.projectId),
        projectEmailConfigId: input.projectEmailConfigId
          ? oid(input.projectEmailConfigId)
          : undefined,
        uniqueId: attempt === 0 ? uniqueId : `${uniqueId}-${attempt}`,
        fromName: input.fromName,
        fromEmail: input.fromEmail,
        toEmail: input.toEmail,
        subject: input.subject,
        body: input.body,
        htmlBody: input.htmlBody,
        messageId: input.messageId,
        inReplyTo: input.inReplyTo,
        references: Array.isArray(input.references)
          ? input.references.filter(Boolean)
          : undefined,
        assignedTo: assignedTo ? oid(assignedTo) : undefined,
        receivedAt,
        status: isJunkSender ? "junk" : "open",
        closedAt: isJunkSender ? new Date() : undefined,
        dueAt,
      });
      // Junk is filed silently — badging it would train agents to ignore the
      // badge, which is the one thing it cannot afford.
      if (!isJunkSender) {
        notifySrActivity(input.projectId, "email", (doc as any).uniqueId);
      }
      return doc;
    } catch (e: any) {
      if (e?.code === 11000 && attempt < 4) continue;
      throw e;
    }
  }
  throw new SrError("Could not allocate an email unique id", 500);
}

export interface ListIntakeParams {
  projectId?: string;
  status?: string; // open | wip | closed | all
  read?: string; // "read" | "unread" — readAt set / unset
  senderType?: string;
  search?: string;
  page?: number;
  limit?: number;
  scope?: ProjectScope;
  assignedOnlyToUserId?: string;
}

/** find() casts ids from strings; aggregate() does not, so do it here. */
const castIds = (query: any): any => {
  if (Array.isArray(query)) return query.map(castIds);
  if (!query || typeof query !== "object") return query;
  if (query instanceof mongoose.Types.ObjectId || query instanceof Date) return query;
  const out: any = {};
  for (const [key, value] of Object.entries(query)) {
    out[key] =
      typeof value === "string" && mongoose.Types.ObjectId.isValid(value) && value.length === 24
        ? new mongoose.Types.ObjectId(value)
        : castIds(value);
  }
  return out;
};

export async function listEmailIntake(params: ListIntakeParams) {
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
  const q: any = {};
  if (params.scope) {
    applyProjectScope(q, "projectId", params.projectId, params.scope);
  } else if (params.projectId) {
    q.projectId = params.projectId;
  }
  // Counter strip: every filter EXCEPT status, so the tabs keep their numbers
  // while one of them is selected.
  const qWithoutStatus: any = { ...q };
  if (params.status && params.status !== "all") q.status = params.status;
  if (params.senderType) q.senderType = params.senderType;
  if (params.assignedOnlyToUserId) {
    q.$and = [
      ...(Array.isArray(q.$and) ? q.$and : []),
      {
        $or: [
          { assignedTo: oid(params.assignedOnlyToUserId) },
          { assignedTo: { $exists: false } },
          { assignedTo: null },
        ],
      },
    ];
  }
  if (params.search) {
    const rx = new RegExp(
      params.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i",
    );
    q.$or = [{ uniqueId: rx }, { subject: rx }, { fromEmail: rx }];
  }
  // Unread count ignores the read filter, so the "Unread (n)" choice keeps
  // its number whichever view is picked.
  const unreadQ = { ...q, readAt: null };
  if (params.read === "unread") {
    q.readAt = null;
    qWithoutStatus.readAt = null;
  } else if (params.read === "read") {
    q.readAt = { $ne: null };
    qWithoutStatus.readAt = { $ne: null };
  }
  const [items, total, unread, statusAgg] = await Promise.all([
    EmailIntake.find(q)
      .sort({ receivedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    EmailIntake.countDocuments(q),
    EmailIntake.countDocuments(unreadQ),
    EmailIntake.aggregate([
      { $match: castIds(qWithoutStatus) },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);
  const statusCounts: Record<string, number> = { all: 0 };
  for (const row of statusAgg as Array<{ _id: string; count: number }>) {
    statusCounts[String(row._id)] = row.count;
    statusCounts.all += row.count;
  }
  return { items, total, page, limit, unread, statusCounts };
}

export function assertEmailOwnerAccess(
  intake: { assignedTo?: any },
  viewerId: string,
  canAccessAll: boolean,
) {
  if (canAccessAll || !intake.assignedTo) return;
  const assignedId = intake.assignedTo?._id
    ? String(intake.assignedTo._id)
    : String(intake.assignedTo);
  if (assignedId !== String(viewerId)) {
    throw new SrError("Forbidden: this email is assigned to another user", 403);
  }
}

/**
 * Mark an email read (first opener recorded) or back to unread. The inbox is
 * shared, like View Queries: once anyone on the team opens it, it is read.
 */
export async function setEmailRead(id: string, read: boolean, userId?: string) {
  const update = read
    ? { $set: { readAt: new Date(), ...(userId ? { readBy: oid(userId) } : {}) } }
    : { $unset: { readAt: 1, readBy: 1 } };
  // Keep the first reader: only stamp an email that is still unread.
  const filter = read ? { _id: oid(id), readAt: null } : { _id: oid(id) };
  await EmailIntake.updateOne(filter, update as any);
  return EmailIntake.findById(id).select("readAt readBy").lean();
}

export async function getEmailIntake(id: string) {
  const intake = await EmailIntake.findById(id).lean();
  if (!intake) throw new SrError("Email intake not found", 404);
  return intake;
}

export async function bulkActionEmailIntake(
  intakeIds: string[],
  input: IntakeActionInput,
  actorId: string,
  canAccessAll = false,
) {
  const ids = Array.from(new Set(intakeIds.filter(Boolean)));
  if (!ids.length) throw new SrError("Select at least one email", 400);
  const results = [];
  for (const id of ids) {
    results.push(await actionEmailIntake(id, input, actorId, canAccessAll));
  }
  return { count: results.length, items: results };
}

export async function deleteEmailIntakes(
  intakeIds: string[],
  actorId: string,
  canAccessAll = false,
) {
  const ids = Array.from(new Set(intakeIds.filter(Boolean)));
  if (!ids.length) throw new SrError("Select at least one email", 400);
  const docs = await EmailIntake.find({ _id: { $in: ids.map(oid) } });
  docs.forEach((doc) => assertEmailOwnerAccess(doc, actorId, canAccessAll));
  const result = await EmailIntake.deleteMany({
    _id: { $in: docs.map((doc) => doc._id) },
  });
  return { count: result.deletedCount || 0 };
}

export interface IntakeActionInput {
  type:
    | "duplicate"
    | "psr"
    | "isr"
    | "lead"
    | "junk"
    | "converted"
    | "forward"
    | "repository"
    | "responded";
  senderType?: string; // classification stored on the intake
  subCategory?: string;
  categoryId?: string; // for psr/isr
  studentUserId?: string;
  remark?: string;
  refNumber?: string; // existing SR number (duplicate)
  refId?: string; // existing ticket/lead id when created through another flow
  replyContent?: string; // responded
  lead?: {
    name?: string;
    email?: string;
    contactNumber?: string;
    studentName?: string;
    grade?: string;
    enquiryNo?: string;
  };
  /** Keep open for further actions on the same email (Vector WIP). */
  wip?: boolean;
  /** #11 When junking, also add the sender to the permanent junk list. */
  permanentJunk?: boolean;
  /** #11 Extra addresses to forward the original email to (psr/isr/forward). */
  forwardTo?: string[];
}

/** Add a sender to the project's permanent junk list (deduped, lowercased). */
async function addPermanentJunkSender(projectId: any, email?: string) {
  const addr = String(email || "").trim().toLowerCase();
  if (!addr) return;
  const project = await Project.findById(projectId);
  if (!project) return;
  const cfg: any = project.configuration || (project.configuration = {} as any);
  const sr: any = cfg.sr || (cfg.sr = {});
  const junk: any = sr.emailJunk || (sr.emailJunk = { senders: [] });
  junk.senders = Array.from(new Set([...(junk.senders || []), addr]));
  project.markModified("configuration.sr");
  await project.save();
}

/** Forward an email's original content to one or more addresses (best-effort). */
async function forwardIntakeEmail(intake: any, targets: string[]) {
  const clean = Array.from(
    new Set((targets || []).map((t) => String(t).trim()).filter(Boolean)),
  );
  for (const to of clean) {
    try {
      await sendTicketReplyEmail({
        ticketId: String(intake._id),
        ticketNumber: intake.uniqueId,
        ticketSubject: `Fwd: ${intake.subject}`,
        recipientEmail: to,
        recipientName: to,
        replyContent:
          `Forwarded email from ${intake.fromName || intake.fromEmail}` +
          `\n\n${intake.body || ""}`,
        agentName: "Support",
        agentEmail: intake.toEmail || "",
        projectId: String(intake.projectId),
        emailConfigId: intake.projectEmailConfigId
          ? String(intake.projectEmailConfigId)
          : undefined,
      });
    } catch (e) {
      console.error("[emailTriage] forward send failed:", e);
    }
  }
}

export async function actionEmailIntake(
  intakeId: string,
  input: IntakeActionInput,
  actorId: string,
  canAccessAll = false,
) {
  const intake = await EmailIntake.findById(intakeId);
  if (!intake) throw new SrError("Email intake not found", 404);
  assertEmailOwnerAccess(intake, actorId, canAccessAll);

  if (input.senderType) intake.senderType = input.senderType as any;
  if (input.subCategory) intake.subCategory = input.subCategory;
  if (input.studentUserId) intake.studentUserId = oid(input.studentUserId);

  const action: any = {
    type: input.type,
    remark: input.remark,
    performedBy: oid(actorId),
    performedAt: new Date(),
  };

  switch (input.type) {
    case "psr":
    case "isr": {
      if (!input.categoryId) {
        throw new SrError("A sub-category is required to generate an SR", 400);
      }
      const r = await createServiceRequest({
        projectId: String(intake.projectId),
        interactionType: input.type === "psr" ? "PSR" : "ISR",
        requestType: "SR",
        channel: "email",
        modeOfContact: "email",
        categoryId: input.categoryId,
        subject: intake.subject,
        description: intake.body || "",
        createdBy: input.studentUserId || actorId,
        actorId,
        studentUserId: input.studentUserId,
        parent:
          input.type === "psr"
            ? {
                name: intake.fromName,
                email: intake.fromEmail,
              }
            : undefined,
        metadata: {
          emailIntakeId: String(intake._id),
          fromName: intake.fromName,
          fromEmail: intake.fromEmail,
        },
        skipDuplicateCheck: true,
      });
      action.refType = "ticket";
      action.refId = oid(r.ticketId);
      action.refNumber = r.ticketNumber;
      // #11 Auto-forward the original email — category-configured + ad-hoc.
      const autoTargets = await resolveSrAutoForward(
        String(intake.projectId),
        input.categoryId,
      );
      const targets = [...autoTargets, ...(input.forwardTo || [])];
      if (targets.length) {
        await forwardIntakeEmail(intake, targets);
        action.remark =
          (action.remark ? action.remark + " " : "") +
          `Forwarded to: ${targets.join(", ")}`;
      }
      break;
    }
    case "lead": {
      const lead = await Lead.create({
        projectId: intake.projectId,
        name: input.lead?.name || intake.fromName || intake.fromEmail,
        email: input.lead?.email || intake.fromEmail,
        contactNumber: input.lead?.contactNumber,
        studentName: input.lead?.studentName,
        grade: input.lead?.grade,
        enquiryNo: input.lead?.enquiryNo,
        source: "email",
        status: "new",
        emailIntakeId: intake._id,
        createdBy: oid(actorId),
      });
      action.refType = "lead";
      action.refId = lead._id;
      action.refNumber = lead.enquiryNo;
      break;
    }
    case "responded": {
      // Best-effort in-module reply via the existing email engine.
      try {
        await sendTicketReplyEmail({
          ticketId: String(intake._id),
          ticketNumber: intake.uniqueId,
          ticketSubject: intake.subject,
          recipientEmail: intake.fromEmail,
          recipientName: intake.fromName,
          replyContent: input.replyContent || input.remark || "",
          agentName: "Support",
          agentEmail: intake.toEmail || "",
          projectId: String(intake.projectId),
          emailConfigId: intake.projectEmailConfigId
            ? String(intake.projectEmailConfigId)
            : undefined,
        });
      } catch (e) {
        console.error("[emailTriage] reply send failed (recorded anyway):", e);
      }
      action.refType = "email";
      action.remark = input.replyContent || input.remark;
      break;
    }
    case "duplicate":
      action.refNumber = input.refNumber;
      break;
    case "junk":
      action.remark = input.remark || "Marked as junk";
      // #11 Permanent junk — remember this sender so future mail auto-junks.
      if (input.permanentJunk) {
        await addPermanentJunkSender(intake.projectId, intake.fromEmail);
        action.remark += " (sender added to permanent junk)";
      }
      break;
    case "converted":
      if (!input.refId) {
        throw new SrError("Ticket id is required to mark email converted", 400);
      }
      action.refType = "ticket";
      action.refId = oid(input.refId);
      action.refNumber = input.refNumber;
      action.remark = input.remark || "Converted to PSR";
      break;
    case "forward":
      // #11 Forward the original email to the given addresses.
      if (input.forwardTo?.length) {
        await forwardIntakeEmail(intake, input.forwardTo);
        action.remark =
          (input.remark ? input.remark + " " : "") +
          `Forwarded to: ${input.forwardTo.join(", ")}`;
      }
      break;
    case "repository":
      // Recorded only (repository bucket in remark).
      break;
  }

  intake.actions.push(action);
  // WIP keeps the email open for more actions; otherwise it's closed.
  if (input.type === "junk") {
    intake.status = "junk";
    intake.closedAt = new Date();
    intake.closedBy = oid(actorId);
  } else if (input.type === "converted") {
    intake.status = "closed";
    intake.closedAt = new Date();
    intake.closedBy = oid(actorId);
  } else if (input.wip) {
    intake.status = "wip";
  } else {
    intake.status = "closed";
    intake.closedAt = new Date();
    intake.closedBy = oid(actorId);
  }
  await intake.save();
  return intake;
}
