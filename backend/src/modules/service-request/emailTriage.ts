/**
 * Service Request (PSR/ISR) — Email triage inbox service. Phase 4.
 * Human-mediated: RE-Cell reads an email, classifies it, and takes one or more
 * actions. Distinct from the auto-ticket EmailProcessingQueue.
 */
import mongoose from "mongoose";
import { EmailIntake } from "../../models/EmailIntake";
import { Lead } from "../../models/Lead";
import { Project } from "../../models/Project";
import { resolveSrConfig } from "./serviceRequestConfig";
import { createServiceRequest } from "./createServiceRequest";
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
  receivedAt?: string | Date;
}

export async function ingestEmail(input: IngestEmailInput) {
  const project = await Project.findById(input.projectId)
    .select("configuration.sr")
    .lean();
  if (!project) throw new SrError("Project not found", 404);
  const cfg = resolveSrConfig(project);

  const receivedAt = input.receivedAt ? new Date(input.receivedAt) : new Date();
  const dueAt = new Date(
    receivedAt.getTime() + cfg.email.tatHours * 60 * 60 * 1000,
  );

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
        receivedAt,
        status: "open",
        dueAt,
      });
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
  senderType?: string;
  search?: string;
  page?: number;
  limit?: number;
  scope?: ProjectScope;
}

export async function listEmailIntake(params: ListIntakeParams) {
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
  const q: any = {};
  if (params.scope) {
    applyProjectScope(q, "projectId", params.projectId, params.scope);
  } else if (params.projectId) {
    q.projectId = params.projectId;
  }
  if (params.status && params.status !== "all") q.status = params.status;
  if (params.senderType) q.senderType = params.senderType;
  if (params.search) {
    const rx = new RegExp(
      params.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i",
    );
    q.$or = [{ uniqueId: rx }, { subject: rx }, { fromEmail: rx }];
  }
  const [items, total] = await Promise.all([
    EmailIntake.find(q)
      .sort({ receivedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    EmailIntake.countDocuments(q),
  ]);
  return { items, total, page, limit };
}

export async function getEmailIntake(id: string) {
  const intake = await EmailIntake.findById(id).lean();
  if (!intake) throw new SrError("Email intake not found", 404);
  return intake;
}

export interface IntakeActionInput {
  type:
    | "duplicate"
    | "psr"
    | "isr"
    | "lead"
    | "forward"
    | "repository"
    | "responded";
  senderType?: string; // classification stored on the intake
  subCategory?: string;
  categoryId?: string; // for psr/isr
  studentUserId?: string;
  remark?: string;
  refNumber?: string; // existing SR number (duplicate)
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
}

export async function actionEmailIntake(
  intakeId: string,
  input: IntakeActionInput,
  actorId: string,
) {
  const intake = await EmailIntake.findById(intakeId);
  if (!intake) throw new SrError("Email intake not found", 404);

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
        studentUserId: input.studentUserId,
        metadata: { emailIntakeId: String(intake._id), fromEmail: intake.fromEmail },
        skipDuplicateCheck: true,
      });
      action.refType = "ticket";
      action.refId = oid(r.ticketId);
      action.refNumber = r.ticketNumber;
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
    case "forward":
    case "repository":
      // Recorded only (forward target / repository bucket in remark).
      break;
  }

  intake.actions.push(action);
  // WIP keeps the email open for more actions; otherwise it's closed.
  if (input.wip) {
    intake.status = "wip";
  } else {
    intake.status = "closed";
    intake.closedAt = new Date();
    intake.closedBy = oid(actorId);
  }
  await intake.save();
  return intake;
}
