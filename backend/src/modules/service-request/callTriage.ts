/**
 * Service Request (PSR/ISR) — IVR call triage service. Phase 5.
 * Inbound calls (e.g. Tata) are ingested, the caller is matched/classified,
 * and the call is converted to a PSR — or resolved on-call (OCR, no ticket).
 */
import mongoose from "mongoose";
import { CallIntake, RequesterType } from "../../models/CallIntake";
import { Ticket } from "../../models/Ticket";
import { IvrIngestLog } from "../../models/IvrIngestLog";
import { Notification } from "../../models/Notification";
import { User } from "../../models/User";
import { Project } from "../../models/Project";
import PsrTable from "../../models/psr/PsrTable";
import { createServiceRequest } from "./createServiceRequest";
import { resolveSrConfig } from "./serviceRequestConfig";
import { WorkingCalendar } from "../../models/WorkingCalendar";
import { calculateDueDate } from "../../services/slaService";
import { SrError } from "./serviceRequestService";
import { applyProjectScope, ProjectScope } from "../../utils/projectScope";
import {
  assignMissedCall,
  assignAnsweredCall,
} from "./services/ivrAgentAssignment";
import { correlateOutboundWebhook } from "./services/clickToCall";

const oid = (id: string) => new mongoose.Types.ObjectId(id);

export interface IngestCallInput {
  projectId: string;
  externalId: string;
  callerName?: string;
  callerMobile: string;
  schoolName?: string;
  callType?: "answered" | "missed";
  durationSeconds?: number;
  voiceNoteUrl?: string;
  provider?: "smartflo" | "manual" | "other";
  uuid?: string;
  callToNumber?: string;
  direction?: string;
  startStamp?: string | Date;
  answerStamp?: string | Date;
  endStamp?: string | Date;
  recordingUrl?: string;
  digitsDialed?: string[];
  answeredAgentId?: string;
  answeredAgentName?: string;
  answeredAgentNumber?: string;
  providerCallStatus?: string;
  rawPayload?: Record<string, any>;
  lastPayload?: Record<string, any>;
  lastIngestLogId?: string;
  receivedAt?: string | Date;
}

export interface CallerMatch {
  /** Set only when the match resolves to a helpdesk User. */
  userId?: mongoose.Types.ObjectId;
  registered: boolean;
  callerName?: string;
  schoolName?: string;
  studentCount?: number;
  source: "psr" | "user";
}

/** Read the project's PSR parent-lookup config (psr_tbl_* + column mapping). */
async function getParentLookupConfig(projectId: string): Promise<
  | {
      tableId: string;
      mobileColumns: string[];
      nameColumn?: string;
      schoolColumn?: string;
      studentCountColumn?: string;
    }
  | null
> {
  const project: any = await Project.findById(projectId)
    .select("configuration.sr.intake.ivr.parentLookup configuration.sr.ivr.parentLookup")
    .lean();
  const cfg =
    project?.configuration?.sr?.intake?.ivr?.parentLookup ??
    project?.configuration?.sr?.ivr?.parentLookup;
  if (!cfg?.enabled || !cfg?.tableId) return null;
  const mobileColumns = Array.isArray(cfg.mobileColumns)
    ? cfg.mobileColumns.filter(Boolean)
    : [];
  if (!mobileColumns.length) return null;
  return {
    tableId: String(cfg.tableId),
    mobileColumns,
    nameColumn: cfg.nameColumn || undefined,
    schoolColumn: cfg.schoolColumn || undefined,
    studentCountColumn: cfg.studentCountColumn || undefined,
  };
}

/** Match against the PSR-builder parent table (psr_tbl_*), if configured. */
async function matchCallerInPsrTable(
  projectId: string,
  norm: string,
): Promise<CallerMatch | null> {
  const cfg = await getParentLookupConfig(projectId);
  if (!cfg) return null;

  const table: any = await PsrTable.findById(cfg.tableId).lean();
  if (!table?.targetCollection) return null;

  const col = mongoose.connection.collection(table.targetCollection);
  const rx = new RegExp(`${norm}$`);
  const row = await col.findOne({
    $or: cfg.mobileColumns.map((c) => ({ [c]: rx })),
  } as any);
  if (!row) return null;

  const count = cfg.studentCountColumn
    ? Number(row[cfg.studentCountColumn])
    : undefined;
  return {
    registered: true,
    source: "psr",
    callerName: cfg.nameColumn ? s(row[cfg.nameColumn]) : undefined,
    schoolName: cfg.schoolColumn ? s(row[cfg.schoolColumn]) : undefined,
    studentCount: Number.isFinite(count) ? count : undefined,
  };
}

/**
 * Match a caller mobile to a registered parent. Prefers the PSR-builder parent
 * table (where registered parents actually live); falls back to the User
 * collection. Returns enriched details (name/school) for populating the call.
 */
async function matchCaller(
  projectId: string,
  mobile: string,
): Promise<CallerMatch | null> {
  if (!mobile) return null;
  const norm = mobile.replace(/\D/g, "").slice(-10); // last 10 digits
  if (!norm) return null;

  // 1) PSR parent table (config-driven).
  try {
    const psr = await matchCallerInPsrTable(projectId, norm);
    if (psr) return psr;
  } catch (e) {
    console.error("[ivr] PSR parent lookup failed:", e);
  }

  // 2) Fall back to a helpdesk User record.
  const rx = new RegExp(`${norm}$`);
  const user: any = await User.findOne({
    $or: [{ mobile: rx }, { parentMobile: rx }, { phone: rx }],
    projects: projectId,
  })
    .select("_id firstName lastName name schoolName")
    .lean();
  if (!user) return null;

  const fullName =
    s(user.name) ||
    [s(user.firstName), s(user.lastName)].filter(Boolean).join(" ") ||
    undefined;
  return {
    userId: user._id,
    registered: true,
    source: "user",
    callerName: fullName,
    schoolName: s(user.schoolName),
  };
}

/**
 * Tell the agent a call has landed in their queue — a browser push and the
 * live socket event, the same delivery the query desk uses. A missed call is
 * already ticking against its call-back TAT, so it cannot wait for someone to
 * open the inbox.
 *
 * Best-effort: a notification must never fail an intake.
 */
async function notifyCallAssignee(call: any) {
  try {
    if (!call?.assignedTo) return;
    const who = call.callerName
      ? `${call.callerName} (${call.callerMobile})`
      : call.callerMobile || "unknown number";
    const title =
      call.callType === "missed" ? "Missed call to return" : "IVR call assigned";

    await Notification.create({
      recipientUserId: new mongoose.Types.ObjectId(String(call.assignedTo)),
      projectId: call.projectId,
      triggerType: "ivr_call_assigned",
      entityType: "ivr_call",
      entityId: call._id,
      title,
      body: `${who}${call.didLabel ? ` · ${call.didLabel}` : ""}`,
      deepLinkUrl: `/service-requests?tab=ivr`,
    } as any);

    const { createNotification } = require("../../controllers/notificationController");
    await createNotification({
      userId: new mongoose.Types.ObjectId(String(call.assignedTo)),
      projectId: call.projectId,
      type: "info",
      title,
      message: `${who}${call.didLabel ? ` · ${call.didLabel}` : ""}`,
      link: `/service-requests?tab=ivr`,
    });
  } catch (e: any) {
    console.warn("[ivr] call notification failed:", e?.message || e);
  }
}

export async function ingestCall(input: IngestCallInput) {
  const existing = await CallIntake.findOne({ externalId: input.externalId });
  if (existing) return existing; // idempotent

  const matched = await matchCaller(input.projectId, input.callerMobile);

  const call = await CallIntake.create({
    projectId: oid(input.projectId),
    externalId: input.externalId,
    provider: input.provider || "manual",
    uuid: input.uuid,
    callToNumber: input.callToNumber,
    callerName: input.callerName || matched?.callerName,
    callerMobile: input.callerMobile,
    schoolName: input.schoolName || matched?.schoolName,
    callType: input.callType || "answered",
    direction: input.direction,
    startStamp: input.startStamp ? new Date(input.startStamp) : undefined,
    answerStamp: input.answerStamp ? new Date(input.answerStamp) : undefined,
    endStamp: input.endStamp ? new Date(input.endStamp) : undefined,
    durationSeconds: input.durationSeconds,
    voiceNoteUrl: input.voiceNoteUrl,
    recordingUrl: input.recordingUrl,
    digitsDialed: input.digitsDialed,
    answeredAgentId: input.answeredAgentId,
    answeredAgentName: input.answeredAgentName,
    answeredAgentNumber: input.answeredAgentNumber,
    providerCallStatus: input.providerCallStatus,
    originalProviderCallStatus: input.providerCallStatus,
    rawPayload: input.rawPayload,
    lastPayload: input.lastPayload || input.rawPayload,
    lastIngestLogId: input.lastIngestLogId
      ? oid(input.lastIngestLogId)
      : undefined,
    receivedAt: input.receivedAt ? new Date(input.receivedAt) : new Date(),
    registered: !!matched,
    studentUserId: matched?.userId,
    studentCount: matched?.studentCount,
    requesterType: matched ? "existing_parent" : undefined,
    callStatus: "new",
    status: "open",
  });

  // Missed calls are round-robined to IVR agents by dialed-digit bucket.
  if (call.callType === "missed") {
    try {
      await assignMissedCall(call);
    } catch (e) {
      console.error("[ivr] round-robin assign failed:", e);
    }
    // ...and owe a first call-back step, exactly as on the webhook path. A
    // call reaching us through this route is no less of a commitment.
    try {
      await applyFirstCallbackStep(call);
    } catch (e) {
      console.error("[ivr] first call-back step failed:", e);
    }
  } else if (call.callType === "answered" && !call.assignedTo) {
    // Answered calls land in the picking agent's own list.
    try {
      await assignAnsweredCall(call);
    } catch (e) {
      console.error("[ivr] answered-call assign failed:", e);
    }
  }

  await notifyCallAssignee(call);

  // Keep open inboxes current — same event the webhook path emits.
  try {
    const { getIo } = require("../../socket/ioInstance");
    const { emitIvrCallUpdate, emitSrActivity } = require("../../socket/socketHandlers");
    const io = getIo();
    if (io) {
      emitIvrCallUpdate(io, String(call.projectId), {
        type: "new-call",
        call: call.toObject ? call.toObject() : call,
      });
      emitSrActivity(io, String(call.projectId), {
        area: "ivr",
        ref: call.callerMobile,
      });
    }
  } catch (e) {
    console.error("[ivr] socket emit failed:", e);
  }

  return call;
}

const s = (value: any): string | undefined => {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text || undefined;
};

const n = (value: any): number | undefined => {
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
};

const dt = (value: any): Date | undefined => {
  const text = s(value);
  if (!text) return undefined;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const cleanMobile = (value: any): string | undefined => {
  const digits = s(value)?.replace(/\D/g, "");
  if (!digits) return undefined;
  return digits.length > 10 ? digits.slice(-10) : digits;
};

function parseMaybeJson(value: any): any {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (!text) return value;
  const looksJson =
    (text.startsWith("{") && text.endsWith("}")) ||
    (text.startsWith("[") && text.endsWith("]"));
  if (!looksJson) return value;
  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
}

function asArray(value: any): any[] {
  const parsed = parseMaybeJson(value);
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed === "string") {
    return parsed
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return parsed ? [parsed] : [];
}

function firstString(...values: any[]): string | undefined {
  for (const value of values) {
    const text = s(value);
    if (text) return text;
  }
  return undefined;
}

function normalizeDirection(value: any): string | undefined {
  const direction = s(value);
  if (!direction) return undefined;
  const key = direction.toLowerCase();
  if (key === "dialer (inbound)" || key === "dialer") return "inbound";
  return direction;
}

function normalizeCallType(status: any): "answered" | "missed" {
  const key = (s(status) || "").toLowerCase();
  return key.includes("miss") || key.includes("abandon") ? "missed" : "answered";
}

function resolveCallFlow(payload: any): any[] {
  return asArray(payload?.call_flow).filter(
    (step) => step && typeof step === "object",
  );
}

function resolveCallToNumber(payload: any): string | undefined {
  return firstString(
    payload?.call_to_number,
    payload?.did_number,
    payload?.did,
    payload?.destination_number,
    payload?.to_number,
  );
}

function resolveCallerMobile(payload: any): string | undefined {
  return cleanMobile(
    firstString(
      payload?.caller_id_number,
      payload?.customer_number_with_prefix,
      payload?.customer_number,
      payload?.caller_number,
      payload?.from_number,
      payload?.from,
    ),
  );
}

function resolveDigits(payload: any): string[] {
  const direct = asArray(payload?.digits_dialed)
    .map((item) => s(item))
    .filter(Boolean) as string[];
  if (direct.length > 0) {
    return direct;
  }
  const flow = resolveCallFlow(payload);
  for (const step of flow) {
    if (String(step?.type || "").toLowerCase() === "dtmf") {
      const input = s(step?.input);
      if (input) return [input];
    }
  }
  return [];
}

function resolveAgent(payload: any) {
  const direct = parseMaybeJson(payload?.answered_agent);
  const fromArray = Array.isArray(direct) ? direct[0] : direct;
  let id = s(fromArray?.id);
  const flow = resolveCallFlow(payload);
  if (!id) {
    const answered = flow.find(
      (step: any) =>
        String(step?.type || "").toLowerCase() === "agent" &&
        String(step?.dialst || "").toLowerCase() === "answered",
    );
    const fallback = [...flow]
      .reverse()
      .find((step: any) => String(step?.type || "").toLowerCase() === "agent");
    id = s(answered?.id) || s(fallback?.id);
  }
  return {
    id,
    name:
      s(payload?.answered_agent_name) ||
      s(payload?.agent_name) ||
      s(fromArray?.name),
    // Click-to-Call payloads use `answer_agent_number` (no "ed"); inbound uses
    // `answered_agent_number`. Accept both.
    number:
      s(payload?.answered_agent_number) ||
      s(payload?.answer_agent_number) ||
      s(payload?.agent_number) ||
      s(fromArray?.number),
  };
}

export async function ingestSmartflowWebhook(input: {
  projectId: string;
  payload: Record<string, any>;
  headers?: Record<string, any>;
  rawBody?: string;
}) {
  const payload = input.payload || {};
  const callerMobileForExternalId = resolveCallerMobile(payload);
  const externalId =
    firstString(payload.call_id, payload.uuid, payload.call_uuid) ||
    [
      callerMobileForExternalId || "unknown",
      firstString(payload.start_stamp, payload.start_date, payload.start_time) ||
        Date.now(),
    ].join("-");

  const log = await IvrIngestLog.create({
    projectId: oid(input.projectId),
    provider: "smartflo",
    externalId,
    rawBody: input.rawBody,
    payload,
    headers: input.headers || {},
    status: "received",
  });

  // A call-back WE placed (Click-to-Call) comes back through this same
  // webhook, carrying our correlation token. It is not a new inbound call: it
  // belongs to the call being chased, and its recording/duration go on that
  // attempt. Checked before anything else — before the inbound-shape checks
  // below, which an outbound leg need not satisfy — so a call-back can never
  // surface as a second row in the inbox or be round-robined as a missed call.
  const customIdentifier = firstString(
    payload.custom_identifier,
    payload.customIdentifier,
  );
  const refId = firstString(payload.ref_id, payload.refId);
  if (customIdentifier || refId) {
    const providerStatus = s(payload.call_status);
    let parent: any = null;
    try {
      parent = await correlateOutboundWebhook({
        customIdentifier,
        refId,
        status:
          normalizeCallType(providerStatus) === "missed" ? "missed" : "answered",
        message: providerStatus,
        externalId: firstString(payload.call_id, payload.uuid, payload.call_uuid),
        recordingUrl: s(payload.recording_url),
        durationSeconds: n(payload.duration) ?? n(payload.billsec),
        answerStamp: dt(payload.answer_stamp),
        endStamp: dt(payload.end_stamp),
        providerCallStatus: providerStatus,
      });
    } catch (e) {
      console.error("[ivr] outbound correlation failed:", e);
    }
    if (parent) {
      log.status = "processed";
      log.message = "outbound call-back attached to its call";
      log.callIntakeId = parent._id as any;
      await log.save();
      try {
        const { getIo } = require("../../socket/ioInstance");
        const { emitIvrCallUpdate } = require("../../socket/socketHandlers");
        const io = getIo();
        if (io) {
          emitIvrCallUpdate(io, String(parent.projectId), {
            type: "call-updated",
            call: parent.toObject ? parent.toObject() : parent,
          });
        }
      } catch (e) {
        console.error("[ivr] socket emit failed:", e);
      }
      return { ignored: false, call: parent, logId: log._id };
    }
    // Carries a token but matches none of our attempts — not ours; fall
    // through and treat it as an ordinary inbound call.
  }

  const callToNumber = resolveCallToNumber(payload);
  if (!callToNumber) {
    log.status = "ignored";
    log.message = "call_to_number is required";
    await log.save();
    return { ignored: true, reason: log.message, logId: log._id };
  }

  const callerMobile = resolveCallerMobile(payload);
  if (!callerMobile) {
    log.status = "ignored";
    log.message = "caller_id_number is required";
    await log.save();
    return { ignored: true, reason: log.message, logId: log._id };
  }

  const digits = resolveDigits(payload);
  const agent = resolveAgent(payload);
  const providerCallStatus = s(payload.call_status);
  const update = {
    provider: "smartflo" as const,
    uuid: s(payload.uuid),
    callToNumber,
    callerMobile,
    callType: normalizeCallType(providerCallStatus),
    direction: normalizeDirection(payload.direction),
    startStamp: dt(payload.start_stamp),
    answerStamp: dt(payload.answer_stamp),
    endStamp: dt(payload.end_stamp),
    durationSeconds: n(payload.duration) ?? n(payload.billsec),
    voiceNoteUrl: s(payload.recording_url),
    recordingUrl: s(payload.recording_url),
    digitsDialed: digits,
    answeredAgentId: agent.id,
    answeredAgentName: agent.name,
    answeredAgentNumber: agent.number,
    providerCallStatus,
    lastPayload: payload,
    lastIngestLogId: log._id,
  };

  const existing = await CallIntake.findOne({
    projectId: oid(input.projectId),
    externalId,
  });

  let call;
  if (existing) {
    Object.assign(existing, update);
    if (!existing.originalProviderCallStatus && providerCallStatus) {
      existing.originalProviderCallStatus = providerCallStatus;
    }
    call = await existing.save();
  } else {
    const matched = await matchCaller(input.projectId, callerMobile);
    call = await CallIntake.create({
      ...update,
      projectId: oid(input.projectId),
      externalId,
      rawPayload: payload,
      originalProviderCallStatus: providerCallStatus,
      receivedAt: dt(payload.start_stamp) || new Date(),
      callerName: matched?.callerName,
      schoolName: matched?.schoolName,
      studentCount: matched?.studentCount,
      registered: !!matched,
      studentUserId: matched?.userId,
      requesterType: matched ? "existing_parent" : undefined,
      callStatus: "new",
      status: "open",
    });
  }

  log.status = "processed";
  log.callIntakeId = call._id as any;
  await log.save();

  // Missed calls are round-robined to IVR agents (once, on first sight).
  if (call.callType === "missed" && !call.assignmentStatus) {
    try {
      await assignMissedCall(call);
    } catch (e) {
      console.error("[ivr] round-robin assign failed:", e);
    }
    // ...and the first call-back step is committed for them, so the clock
    // starts when the call lands rather than when an agent gets to it.
    try {
      await applyFirstCallbackStep(call);
    } catch (e) {
      console.error("[ivr] first call-back step failed:", e);
    }
  } else if (call.callType === "answered" && !call.assignedTo) {
    // Answered calls land in the picking agent's own list.
    try {
      await assignAnsweredCall(call);
    } catch (e) {
      console.error("[ivr] answered-call assign failed:", e);
    }
  }
  await notifyCallAssignee(call);

  // Tell any open IVR inbox about the call so the list updates itself rather
  // than waiting for someone to hit refresh. Emitted after assignment so the
  // row arrives with its owner and first call-back step already set.
  try {
    const { getIo } = require("../../socket/ioInstance");
    const { emitIvrCallUpdate, emitSrActivity } = require("../../socket/socketHandlers");
    const io = getIo();
    if (io) {
      emitIvrCallUpdate(io, String(call.projectId), {
        type: "new-call",
        call: call.toObject ? call.toObject() : call,
      });
      emitSrActivity(io, String(call.projectId), {
        area: "ivr",
        ref: call.callerMobile,
      });
    }
  } catch (e) {
    console.error("[ivr] socket emit failed:", e);
  }

  return { ignored: false, call, logId: log._id };
}

export interface ListCallParams {
  projectId?: string;
  callType?: string; // answered | missed | all
  registered?: string; // "true" | "false" | all
  callStatus?: string; // new | assigned | converted | all
  /** Call-back state: wip | due_soon | overdue */
  wip?: string;
  /**
   * Set when the caller may NOT see every call in the project. The list is
   * then pinned to the calls assigned to them, whatever the request asked for
   * — an agent works their own queue, not the floor's.
   */
  restrictToUserId?: string;
  search?: string;
  /** Restrict to calls assigned to this user (the "My calls" tab). */
  assignedTo?: string;
  page?: number;
  limit?: number;
  scope?: ProjectScope;
}

export async function listCalls(params: ListCallParams) {
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.limit) || 25));
  const q: any = {};
  if (params.scope) {
    applyProjectScope(q, "projectId", params.projectId, params.scope);
  } else if (params.projectId) {
    q.projectId = params.projectId;
  }
  if (params.callType && params.callType !== "all") q.callType = params.callType;
  if (params.registered === "true") q.registered = true;
  if (params.registered === "false") q.registered = false;
  if (params.callStatus && params.callStatus !== "all")
    q.callStatus = params.callStatus;
  if (params.assignedTo) q.assignedTo = params.assignedTo;
  // Enforced last so no combination of query params can widen it.
  if (params.restrictToUserId) q.assignedTo = oid(params.restrictToUserId);

  // WIP (call-back) state. "wip" is every call with an outstanding commitment;
  // the other two narrow it to the ones the agent should act on first.
  const now = new Date();
  if (params.wip) {
    // A junked or converted call owes nothing, so it must not surface in any
    // of these — least of all "overdue", where it would read as a breach.
    q.callStatus = { $nin: ["junk", "converted"] };
    if (params.wip === "wip") {
      q.callbackAt = { $ne: null };
    } else if (params.wip === "due_soon") {
      q.callbackAt = { $gt: now };
      q.callbackDueSoonAt = { $lte: now };
    } else if (params.wip === "overdue") {
      q.callbackAt = { $lt: now };
    }
  }
  if (params.search) {
    const rx = new RegExp(
      params.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i",
    );
    q.$or = [{ callerName: rx }, { callerMobile: rx }, { schoolName: rx }];
  }
  const [items, total] = await Promise.all([
    CallIntake.find(q)
      // Raw provider payloads are for debugging a single call, never the list.
      .select("-rawPayload -lastPayload")
      // Who owns the call — the inbox shows the agent's name on every row.
      .populate("assignedTo", "firstName lastName email")
      .sort({ receivedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    CallIntake.countDocuments(q),
  ]);
  return { items, total, page, limit };
}

export async function getCall(id: string) {
  const call = await CallIntake.findById(id)
    .populate("assignedTo", "firstName lastName email")
    .lean();
  if (!call) throw new SrError("Call not found", 404);
  return call;
}

export async function classifyCall(
  id: string,
  input: { requesterType: RequesterType; studentUserId?: string },
) {
  const call = await CallIntake.findById(id);
  if (!call) throw new SrError("Call not found", 404);
  call.requesterType = input.requesterType;
  if (input.studentUserId) {
    call.studentUserId = oid(input.studentUserId);
    call.registered = true;
  }
  await call.save();
  return call;
}

export async function convertCall(
  id: string,
  input: {
    categoryId: string;
    requesterType?: RequesterType;
    subject?: string;
    description?: string;
  },
  actorId: string,
) {
  const call = await CallIntake.findById(id);
  if (!call) throw new SrError("Call not found", 404);
  // A single call can spawn several PSRs (e.g. multiple concerns) — each is
  // appended and linked, so re-conversion is allowed.
  if (!input.categoryId) {
    throw new SrError("A sub-category is required to convert to a PSR", 400);
  }
  if (input.requesterType) call.requesterType = input.requesterType;

  const r = await createServiceRequest({
    projectId: String(call.projectId),
    interactionType: "PSR",
    requestType: "SR",
    channel: "ivr",
    modeOfContact: "telephone",
    categoryId: input.categoryId,
    subject:
      input.subject || `IVR call — ${call.callerName || call.callerMobile}`,
    description:
      input.description ||
      `Converted from IVR call ${call.externalId} (${call.callerMobile}).`,
    createdBy: call.studentUserId ? String(call.studentUserId) : actorId,
    actorId,
    studentUserId: call.studentUserId ? String(call.studentUserId) : undefined,
    parent: {
      name: call.callerName,
      mobile: call.callerMobile,
    },
    metadata: {
      callIntakeId: String(call._id),
      callerName: call.callerName,
      callerMobile: call.callerMobile,
      requesterType: call.requesterType,
    },
    skipDuplicateCheck: true,
  });

  const now = new Date();
  call.callStatus = "converted";
  call.status = "closed";
  // Keep the single fields (first conversion) for back-compat; append all.
  if (!call.convertedTicketId) {
    call.convertedTicketId = oid(r.ticketId);
    call.convertedTicketNumber = r.ticketNumber;
  }
  call.convertedAt = now;
  call.convertedTickets = call.convertedTickets || [];
  call.convertedTickets.push({
    ticketId: oid(r.ticketId),
    ticketNumber: r.ticketNumber,
    at: now,
  });
  await call.save();
  // The SR inherits the call's story — inbound outcome, call-backs, follow-ups.
  await attachCallHistoryToTicket(call, String(r.ticketId), actorId);
  return { call, ticket: r };
}

/**
 * Bulk-reassign IVR calls to a single agent. Returns per-call outcome.
 * Does not change conversion state — only who owns the call in the inbox.
 */
/**
 * IVR agents a call may be handed to: active users flagged as IVR agents in
 * this project. Deliberately not the general user list — reassigning to
 * someone who does not take calls silently strands the call.
 */
export async function listAssignableIvrAgents(projectId: string) {
  if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
    throw new SrError("A valid projectId is required.", 400);
  }
  const users = await User.find({
    isActive: true,
    isIvrAgent: true,
    projects: oid(projectId),
  })
    .select("_id firstName lastName email")
    .sort({ firstName: 1, lastName: 1 })
    .lean();
  return users;
}

export async function bulkReassignCalls(
  callIds: string[],
  toUserId: string,
  actorId: string,
) {
  if (!toUserId || !mongoose.Types.ObjectId.isValid(toUserId)) {
    throw new SrError("A valid target user is required.", 400);
  }
  const ids = (callIds || []).filter((c) =>
    mongoose.Types.ObjectId.isValid(String(c)),
  );
  if (!ids.length) throw new SrError("No valid call ids provided.", 400);

  // Only someone who actually takes IVR calls may be handed one. Checked here
  // rather than trusting the dropdown: a call parked on a non-agent is
  // invisible to the rota and to the person receiving it.
  const target = await User.findOne({
    _id: oid(toUserId),
    isActive: true,
    isIvrAgent: true,
  })
    .select("_id")
    .lean();
  if (!target) {
    throw new SrError(
      "Calls can only be reassigned to an active IVR agent.",
      400,
    );
  }

  const calls = await CallIntake.find({ _id: { $in: ids } });
  let reassigned = 0;
  for (const call of calls) {
    call.assignedTo = oid(toUserId);
    if (call.callStatus === "new") call.callStatus = "assigned";
    call.remark = `${call.remark ? call.remark + " · " : ""}Reassigned by ${actorId}`;
    await call.save();
    reassigned++;
  }
  return { reassigned, requested: ids.length };
}

/** Junk / spam call — no SR created. */
export async function markCallJunk(
  id: string,
  input: { remark?: string },
) {
  const call = await CallIntake.findById(id);
  if (!call) throw new SrError("Call not found", 404);
  if (call.callStatus === "converted") {
    throw new SrError("Converted calls cannot be marked as junk.", 400);
  }
  call.requesterType = "junk";
  call.callStatus = "junk";
  call.status = "closed";
  call.remark = input.remark || "Marked as junk";
  cancelPendingCallbacks(call, "Call marked junk");
  await call.save();
  return call;
}

/** Mark a call as converted by a PSR created through the guided New Request flow. */
export async function markCallConverted(
  id: string,
  input: {
    ticketId: string;
    ticketNumber?: string;
    actorUserId?: string;
    /** The PSR was raised and closed on the call (OCR). */
    resolvedOnCall?: boolean;
    remark?: string;
  },
) {
  const call = await CallIntake.findById(id);
  if (!call) throw new SrError("Call not found", 404);
  if (!mongoose.Types.ObjectId.isValid(input.ticketId)) {
    throw new SrError("Invalid ticket id.", 400);
  }
  if (input.resolvedOnCall) {
    call.resolvedOnCall = true;
    if (input.remark) call.remark = input.remark;
  }
  call.callStatus = "converted";
  call.status = "closed";
  call.convertedTicketId = oid(input.ticketId);
  call.convertedTicketNumber = input.ticketNumber;
  call.convertedAt = new Date();
  cancelPendingCallbacks(call, "Converted to a service request");
  await call.save();
  // Same trail as the direct convert path — the guided flow must not lose it.
  await attachCallHistoryToTicket(
    call,
    input.ticketId,
    input.actorUserId || String(call.assignedTo || ""),
  );
  return call;
}

/**
 * Build the call's story as ticket changeHistory entries: the inbound call and
 * how it went, every outbound call-back attempt, and every follow-up commitment
 * with its outcome. Written onto the ticket at conversion so the SR carries the
 * whole pre-ticket history — otherwise it is stranded on the CallIntake and the
 * ticket looks like it appeared from nowhere.
 *
 * changeHistory requires oldValue/newValue, so events use "—" as oldValue and
 * put the readable line in newValue, matching the existing "PSL Call" pattern.
 */
export async function buildCallHistoryEntries(
  call: any,
  actorId: string,
): Promise<any[]> {
  const by = oid(actorId);
  const fmt = (d?: Date | string) =>
    d ? new Date(d).toLocaleString("en-IN") : "unknown time";

  // Resolve every user referenced by the log in one round trip.
  const ids = new Set<string>();
  for (const f of call.followUps || []) {
    if (f.createdBy) ids.add(String(f.createdBy));
    if (f.completedBy) ids.add(String(f.completedBy));
  }
  for (const o of call.outboundCalls || []) {
    if (o.agentUserId) ids.add(String(o.agentUserId));
    if (o.initiatedBy) ids.add(String(o.initiatedBy));
  }
  for (const c of call.comments || []) {
    if (c.createdBy && !c.createdByName) ids.add(String(c.createdBy));
  }
  const users = ids.size
    ? await User.find({ _id: { $in: [...ids].map((i) => oid(i)) } })
        .select("firstName lastName email")
        .lean()
    : [];
  const nameOf = (id?: any) => {
    if (!id) return "someone";
    const u: any = users.find((x: any) => String(x._id) === String(id));
    if (!u) return "someone";
    return (
      [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "someone"
    );
  };

  const entries: any[] = [];
  const push = (newValue: string, changedAt: Date) =>
    entries.push({
      field: "IVR Call",
      oldValue: "—",
      newValue,
      changedBy: by,
      changedAt,
      changeType: "add",
    });

  // 1. The inbound call itself.
  const caller = call.callerName
    ? `${call.callerName} (${call.callerMobile})`
    : call.callerMobile || "unknown number";
  if (call.callType === "missed") {
    push(
      `Inbound call from ${caller} at ${fmt(call.receivedAt)} — MISSED (no agent answered).`,
      call.receivedAt || new Date(),
    );
  } else {
    const who =
      call.answeredAgentName || call.answeredAgentNumber || "an agent";
    const secs = call.durationSeconds;
    push(
      `Inbound call from ${caller} at ${fmt(call.receivedAt)} — ANSWERED by ${who}` +
        (secs ? ` (${Math.floor(secs / 60)}m ${secs % 60}s).` : "."),
      call.receivedAt || new Date(),
    );
  }
  if (call.didLabel || call.digitsDialed?.length) {
    push(
      `Routed via ${call.didLabel || "DID not captured"}` +
        (call.digitsDialed?.length
          ? `, IVR digits: ${call.digitsDialed.join(", ")}.`
          : "."),
      call.receivedAt || new Date(),
    );
  }

  // 2. Outbound call-back attempts (Click-to-Call).
  for (const o of call.outboundCalls || []) {
    const secs = Number(o.durationSeconds) || 0;
    push(
      `Call-back placed by ${o.agentName || nameOf(o.initiatedBy || o.agentUserId)} at ${fmt(
        o.initiatedAt,
      )} to ${o.destinationNumber || call.callerMobile} — ${String(
        o.status || "initiated",
      ).toUpperCase()}${o.message ? ` (${o.message})` : ""}` +
        (secs ? `, ${Math.floor(secs / 60)}m ${secs % 60}s` : "") +
        (o.recordingUrl ? `. Recording: ${o.recordingUrl}` : "."),
      o.initiatedAt || new Date(),
    );
  }

  // Agent notes, as written.
  for (const c of call.comments || []) {
    push(
      `Note by ${c.createdByName || nameOf(c.createdBy)}: "${c.text}"` +
        (c.callbackRequestedAt
          ? ` — caller asked for a call-back at ${fmt(c.callbackRequestedAt)}.`
          : ""),
      c.createdAt || new Date(),
    );
  }

  // 3. Follow-up commitments and how each ended.
  for (const f of call.followUps || []) {
    push(
      `Follow-up scheduled for ${fmt(f.scheduledAt)} by ${nameOf(f.createdBy)}` +
        (f.note ? ` — "${f.note}"` : "."),
      f.createdAt || f.scheduledAt || new Date(),
    );
    if (f.status && f.status !== "pending") {
      push(
        `Follow-up ${f.status === "done" ? "completed" : "cancelled"} by ${nameOf(
          f.completedBy,
        )} at ${fmt(f.completedAt)}` +
          (f.outcome ? ` — outcome: ${f.outcome.replace(/_/g, " ")}.` : "."),
        f.completedAt || new Date(),
      );
    }
  }

  const pending = (call.followUps || []).filter(
    (f: any) => f.status === "pending",
  ).length;
  push(
    `Converted to a service request from the IVR inbox. ` +
      `${(call.outboundCalls || []).length} call-back attempt(s), ` +
      `${(call.comments || []).length} note(s), ` +
      `${(call.followUps || []).length} follow-up(s) logged` +
      (pending ? `, ${pending} still pending.` : "."),
    new Date(),
  );

  return entries.sort(
    (a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime(),
  );
}

/**
 * Copy the call's history onto the ticket it produced. Non-fatal: a conversion
 * must not fail because its audit trail could not be written.
 */
export async function attachCallHistoryToTicket(
  call: any,
  ticketId: string,
  actorId: string,
) {
  try {
    const entries = await buildCallHistoryEntries(call, actorId);
    if (!entries.length) return;
    await Ticket.updateOne(
      { _id: oid(ticketId) },
      { $push: { changeHistory: { $each: entries } } },
    );
  } catch (e) {
    console.warn(
      "[ivr] could not attach call history to ticket:",
      (e as any)?.message,
    );
  }
}

/**
 * Recompute callbackAt from the follow-up log: the earliest still-pending
 * commitment, or nothing when none are outstanding. Callers must invoke this
 * after any change to followUps so the inbox's "due" column stays truthful.
 */
/** The share of a step's TAT that must elapse before it counts as urgent. */
export const CALLBACK_URGENT_AT = 0.8;

/**
 * The project's working calendar: the default one, or any active calendar for
 * the project. The default flag is not always set (BPP's calendar is not
 * marked default), and silently falling back to plain elapsed hours there
 * would make the TAT mean something different per project.
 */
async function resolveWorkingCalendar(projectId: any) {
  return (
    (await WorkingCalendar.findOne({ projectId, isDefault: true, isActive: true })) ||
    (await WorkingCalendar.findOne({ projectId, isActive: true }))
  );
}

/**
 * When a call-back step logged now falls due, counting working hours only.
 *
 * A call arriving at 22:00 is assigned immediately, but its clock does not
 * start until the working day opens — so a 4h step promised overnight is due
 * at 13:00 the next working day, not at 02:00 when nobody is there. Without a
 * calendar the TAT stays plain elapsed hours, which is the old behaviour.
 */
async function resolveCallbackDeadline(projectId: any, tatHours: number) {
  const calendar: any = await resolveWorkingCalendar(projectId);
  const now = new Date();

  if (!calendar) {
    const ms = tatHours * 60 * 60 * 1000;
    return {
      startsAt: now,
      dueAt: new Date(now.getTime() + ms),
      urgentAt: new Date(now.getTime() + ms * CALLBACK_URGENT_AT),
      usedCalendar: false,
    };
  }

  const startsAt = calendar.isWorkingTime(now)
    ? now
    : calendar.getNextWorkingTime(now);

  const [dueAt, urgentAt] = await Promise.all([
    calculateDueDate(startsAt, tatHours, calendar._id),
    calculateDueDate(startsAt, tatHours * CALLBACK_URGENT_AT, calendar._id),
  ]);

  return { startsAt, dueAt, urgentAt, usedCalendar: true };
}

export function syncNextCallback(call: any) {
  const pending = (call.followUps || [])
    .filter((f: any) => f.status === "pending")
    .filter((f: any) => !Number.isNaN(new Date(f.scheduledAt).getTime()))
    .sort(
      (a: any, b: any) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
    );

  const next = pending[0];
  call.callbackAt = next ? new Date(next.scheduledAt) : undefined;

  // When the step turns red. Computed against the working calendar at logging
  // time and stored, so the marker cannot drift from the due date it was
  // derived with. Steps predating the ladder carry neither and simply never
  // turn red early.
  if (next?.urgentAt) {
    call.callbackDueSoonAt = new Date(next.urgentAt);
  } else if (next && Number(next.tatHours) > 0) {
    const windowMs = Number(next.tatHours) * 60 * 60 * 1000;
    call.callbackDueSoonAt = new Date(
      new Date(next.scheduledAt).getTime() - windowMs * (1 - CALLBACK_URGENT_AT),
    );
  } else {
    call.callbackDueSoonAt = undefined;
  }
}

/**
 * The call-back ladder configured for a project, active steps only, in order.
 */
export async function getCallbackTiers(projectId: string) {
  const project = await Project.findById(projectId).lean();
  const cfg = resolveSrConfig(project as any);
  const tat = cfg?.ivr?.callbackTat;
  const tiers = ((tat?.tiers || []) as any[])
    .filter((t: any) => t?.isActive !== false)
    .map((t: any) => ({
      level: Number(t.level),
      label: String(t.label || `WIP ${t.level}`),
      tatHours: Number(t.tatHours),
    }))
    .filter((t: any) => Number.isFinite(t.level) && Number.isFinite(t.tatHours))
    .sort((a: any, b: any) => a.level - b.level) as {
    level: number;
    label: string;
    tatHours: number;
  }[];
  return { enabled: tat?.enabled !== false, tiers };
}

/**
 * Replace the call-back ladder for a project.
 *
 * Steps are renumbered 1..n in the order given, so a manager reordering or
 * deleting one cannot leave gaps or duplicate levels that the agent selector
 * would then render ambiguously.
 */
export async function saveCallbackTiers(
  projectId: string,
  input: { enabled?: boolean; tiers?: any[] },
) {
  const project = await Project.findById(projectId);
  if (!project) throw new SrError("Project not found", 404);

  const cleaned = (Array.isArray(input.tiers) ? input.tiers : [])
    .map((t: any, i: number) => ({
      level: i + 1,
      label: String(t?.label || `WIP ${i + 1}`).trim().slice(0, 40),
      tatHours: Number(t?.tatHours),
      isActive: t?.isActive !== false,
    }))
    .filter((t) => Number.isFinite(t.tatHours) && t.tatHours > 0);

  if (!cleaned.length) {
    throw new SrError("At least one call-back step with a TAT is required.", 400);
  }

  const cfg: any = (project as any).configuration || {};
  cfg.sr = cfg.sr || {};
  cfg.sr.ivr = cfg.sr.ivr || {};
  cfg.sr.ivr.callbackTat = {
    enabled: input.enabled !== false,
    tiers: cleaned,
  };
  (project as any).configuration = cfg;
  project.markModified("configuration");
  await project.save();

  return getCallbackTiers(projectId);
}

/**
 * Apply the first step of the call-back ladder to a freshly logged missed call.
 *
 * The first attempt is not a judgement call — a missed call always owes the
 * caller a call back within the first step's TAT — so the agent should find it
 * already committed rather than having to choose. Later attempts are theirs to
 * pick, and they can amend this one if the first step was wrong.
 *
 * No-ops when the ladder is off, has no steps, or the call already carries a
 * follow-up, so repeat webhooks for the same call cannot stack duplicates.
 */
export async function applyFirstCallbackStep(call: any) {
  if ((call.followUps || []).length) return;

  const { enabled, tiers } = await getCallbackTiers(String(call.projectId));
  if (!enabled || !tiers.length) return;

  const first = tiers[0];
  const deadline = await resolveCallbackDeadline(call.projectId, first.tatHours);
  call.followUps = call.followUps || [];
  call.followUps.push({
    scheduledAt: deadline.dueAt,
    tatStartsAt: deadline.startsAt,
    urgentAt: deadline.urgentAt,
    wipLevel: first.level,
    wipLabel: first.label,
    tatHours: first.tatHours,
    note: "Auto-applied on missed call",
    status: "pending",
    createdAt: new Date(),
  } as any);
  syncNextCallback(call);
  await call.save();
}

/**
 * Close out any pending call-back once a call is finished with.
 *
 * A junked or converted call is not going to be chased, so leaving its step
 * "pending" leaves it counted as outstanding and eventually shown as overdue —
 * a breach the agent can do nothing about and did not cause.
 */
function cancelPendingCallbacks(call: any, reason: string) {
  let changed = false;
  for (const f of call.followUps || []) {
    if (f.status === "pending") {
      f.status = "cancelled";
      f.note = f.note ? `${f.note} · ${reason}` : reason;
      f.completedAt = new Date();
      changed = true;
    }
  }
  if (changed) syncNextCallback(call);
  return changed;
}

/**
 * Add a WIP / call-back commitment. A caller is often chased several times, so
 * each one is appended — nothing is overwritten.
 *
 * The agent chooses the call-frequency step, not a date: the due time is
 * computed from that step's TAT so the commitment reflects the manager's
 * policy. The hours in force at the time are stored alongside the level,
 * because editing the ladder later must not silently rewrite past promises.
 */
export async function addCallFollowUp(
  id: string,
  input: { wipLevel?: number | string; note?: string; actorUserId?: string },
) {
  const call = await CallIntake.findById(id);
  if (!call) throw new SrError("Call not found", 404);

  const { tiers } = await getCallbackTiers(String(call.projectId));
  if (!tiers.length) {
    throw new SrError(
      "No call-back steps are configured for this project. Ask an IVR manager to set them up.",
      400,
    );
  }

  const requested = Number(input.wipLevel);
  const tier = Number.isFinite(requested)
    ? tiers.find((t) => t.level === requested)
    : undefined;
  if (!tier) {
    throw new SrError(
      `Select a call-back step (${tiers.map((t) => t.label).join(", ")}).`,
      400,
    );
  }

  const deadline = await resolveCallbackDeadline(call.projectId, tier.tatHours);
  // Only one WIP is ever live. A new step replaces whatever was still owed —
  // stacking them left several "pending" steps on one call, each ticking and
  // each able to go overdue for a caller who is only being chased once.
  cancelPendingCallbacks(call, "Superseded by a new call-back step");
  call.followUps = call.followUps || [];
  call.followUps.push({
    scheduledAt: deadline.dueAt,
    tatStartsAt: deadline.startsAt,
    urgentAt: deadline.urgentAt,
    wipLevel: tier.level,
    wipLabel: tier.label,
    tatHours: tier.tatHours,
    note: input.note?.trim() || undefined,
    status: "pending",
    createdBy:
      input.actorUserId && mongoose.Types.ObjectId.isValid(input.actorUserId)
        ? oid(input.actorUserId)
        : undefined,
    createdAt: new Date(),
  } as any);
  syncNextCallback(call);
  await call.save();
  return call;
}

/**
 * Close out or amend one follow-up — mark it done with an outcome, cancel it,
 * or correct its date/note.
 */
export async function updateCallFollowUp(
  id: string,
  followUpId: string,
  input: {
    status?: "pending" | "done" | "cancelled";
    outcome?: "answered" | "no_answer" | "busy" | "other";
    wipLevel?: number | string;
    note?: string;
    actorUserId?: string;
  },
) {
  const call = await CallIntake.findById(id);
  if (!call) throw new SrError("Call not found", 404);
  const entry = (call.followUps || []).find(
    (f: any) => String(f._id) === String(followUpId),
  ) as any;
  if (!entry) throw new SrError("Follow-up not found", 404);

  // Re-selecting a step re-derives the due time; there is deliberately no way
  // to type a date, so the ladder stays the single source of the commitment.
  if (input.wipLevel !== undefined) {
    const { tiers } = await getCallbackTiers(String(call.projectId));
    const tier = tiers.find((t) => t.level === Number(input.wipLevel));
    if (!tier) {
      throw new SrError(
        `Select a call-back step (${tiers.map((t) => t.label).join(", ")}).`,
        400,
      );
    }
    const deadline = await resolveCallbackDeadline(call.projectId, tier.tatHours);
    entry.wipLevel = tier.level;
    entry.wipLabel = tier.label;
    entry.tatHours = tier.tatHours;
    entry.tatStartsAt = deadline.startsAt;
    entry.urgentAt = deadline.urgentAt;
    entry.scheduledAt = deadline.dueAt;
  }
  if (input.note !== undefined) entry.note = input.note?.trim() || undefined;
  if (input.outcome) entry.outcome = input.outcome;
  if (input.status) {
    entry.status = input.status;
    if (input.status === "pending") {
      entry.completedAt = undefined;
      entry.completedBy = undefined;
    } else {
      entry.completedAt = new Date();
      entry.completedBy =
        input.actorUserId && mongoose.Types.ObjectId.isValid(input.actorUserId)
          ? oid(input.actorUserId)
          : undefined;
    }
  }
  syncNextCallback(call);
  await call.save();
  return call;
}

/**
 * The WIP level a call is currently on: the live (pending) step, else the last
 * step that was worked (done). Cancelled steps are ignored. 0 = never on one.
 */
export function currentWipLevel(followUps: any[]): number {
  const at = (f: any) => new Date(f.createdAt || f.scheduledAt || 0).getTime();
  const pick = (status: string) =>
    followUps
      .filter((f) => f.status === status && Number.isFinite(Number(f.wipLevel)))
      .sort((a, b) => at(b) - at(a))[0];
  const step = pick("pending") || pick("done");
  return step ? Number(step.wipLevel) : 0;
}

export type AttemptOutcome = "answered" | "not_connected" | "callback_requested";

const ATTEMPT_LABEL: Record<AttemptOutcome, string> = {
  answered: "Answered",
  not_connected: "Not connected",
  callback_requested: "Caller asked to call back",
};

/**
 * Record how a call to the caller went, and move the WIP ladder accordingly.
 * This is the one place the ladder advances once the first step is on.
 *
 *   answered            → the live WIP is done; no new step. The call stays
 *                         open for the agent to convert or resolve.
 *   not_connected       → the live WIP is closed as "no answer" and the NEXT
 *                         step is applied (WIP 1 → WIP 2 …), TAT from the ladder.
 *   callback_requested  → same as not_connected — the next step still applies.
 *                         The time the caller asked for is kept on the note as
 *                         a detail for whoever calls; it does not move the TAT.
 *
 * At most one WIP is live afterwards. Past the last step the last step repeats.
 */
export async function logCallAttempt(
  id: string,
  input: {
    outcome?: string;
    note?: string;
    callbackRequestedAt?: string | Date;
    actorUserId?: string;
  },
) {
  const outcome = input.outcome as AttemptOutcome;
  if (!ATTEMPT_LABEL[outcome]) {
    throw new SrError(
      "Pick how the call went: answered, not connected, or asked to call back.",
      400,
    );
  }

  let requestedAt: Date | undefined;
  if (input.callbackRequestedAt) {
    requestedAt = new Date(input.callbackRequestedAt);
    if (Number.isNaN(requestedAt.getTime()))
      throw new SrError("The requested call-back time is not a valid date.", 400);
  }
  if (outcome === "callback_requested" && !requestedAt) {
    throw new SrError("Add the time the caller asked to be called at.", 400);
  }
  const note = String(input.note || "").trim();
  if (note.length > 2000)
    throw new SrError("Notes are limited to 2000 characters.", 400);

  const call = await CallIntake.findById(id);
  if (!call) throw new SrError("Call not found", 404);
  if (call.callStatus === "converted" || call.callStatus === "junk") {
    throw new SrError("This call is already closed out.", 400);
  }

  const actor =
    input.actorUserId && mongoose.Types.ObjectId.isValid(input.actorUserId)
      ? oid(input.actorUserId)
      : undefined;
  const now = new Date();

  // The step this attempt answers: the live WIP (the latest logged, if older
  // data still has several). With none live, the last step that actually ran —
  // cancelled/superseded steps never count, or a correction or a clean-up
  // would push the caller further up the ladder than they have been chased.
  const currentLevel = currentWipLevel(call.followUps || []);

  // The live WIP (latest logged, if older data still stacks several) and the
  // ladder it sits on.
  const at = (f: any) => new Date(f.createdAt || f.scheduledAt || 0).getTime();
  const pendingSteps = ((call.followUps || []) as any[])
    .filter((f) => f.status === "pending")
    .sort((x, y) => at(y) - at(x));
  const live = pendingSteps[0];
  const ladder =
    outcome === "answered"
      ? { enabled: false, tiers: [] as { level: number; label: string; tatHours: number }[] }
      : await getCallbackTiers(String(call.projectId));
  const lastLevel = ladder.tiers.length
    ? ladder.tiers[ladder.tiers.length - 1].level
    : 0;

  // Already on the last step: its clock keeps running. Re-applying it would
  // hand out a fresh TAT on every unanswered attempt, so a caller could be
  // "chased" for ever without the step ever going overdue.
  const holdLive =
    outcome !== "answered" &&
    ladder.enabled &&
    ladder.tiers.length > 0 &&
    !!live &&
    Number(live.wipLevel) >= lastLevel;

  // 1. Close out what this call answers — every pending step, except the live
  //    one when it is being held on the last step.
  const followOutcome =
    outcome === "answered"
      ? "answered"
      : outcome === "not_connected"
        ? "no_answer"
        : "callback_requested";
  let closed = 0;
  for (const f of pendingSteps) {
    if (holdLive && f === live) continue;
    f.status = "done";
    f.outcome = followOutcome;
    f.completedAt = now;
    f.completedBy = actor;
    closed++;
  }

  // 2. Not reached, and not yet on the last step → the next step up.
  let applied: { level: number; label: string; tatHours: number } | null = null;
  if (outcome !== "answered" && !holdLive && ladder.enabled && ladder.tiers.length) {
    const tier =
      ladder.tiers.find((t) => t.level === currentLevel + 1) ||
      ladder.tiers[ladder.tiers.length - 1];
    const deadline = await resolveCallbackDeadline(call.projectId, tier.tatHours);
    call.followUps = call.followUps || [];
    call.followUps.push({
      scheduledAt: deadline.dueAt,
      tatStartsAt: deadline.startsAt,
      urgentAt: deadline.urgentAt,
      wipLevel: tier.level,
      wipLabel: tier.label,
      tatHours: tier.tatHours,
      note: `Applied after: ${ATTEMPT_LABEL[outcome]}`,
      status: "pending",
      createdBy: actor,
      createdAt: now,
    } as any);
    applied = tier;
  }
  const kept = holdLive
    ? {
        level: Number(live.wipLevel),
        label: String(live.wipLabel || `WIP ${live.wipLevel}`),
        dueAt: live.scheduledAt as Date,
      }
    : null;

  // 3. The agent's note. Written when there is something to say, or when no
  //    WIP was open to carry the outcome — so every attempt leaves a trace.
  // Held on the last step, nothing else records this attempt — the note must.
  if (note || requestedAt || !closed || holdLive) {
    let createdByName: string | undefined;
    if (actor) {
      const u: any = await User.findById(actor)
        .select("firstName lastName email")
        .lean();
      createdByName =
        [u?.firstName, u?.lastName].filter(Boolean).join(" ") ||
        u?.email ||
        undefined;
    }
    call.comments = call.comments || [];
    call.comments.push({
      text: note ? `${ATTEMPT_LABEL[outcome]} — ${note}` : ATTEMPT_LABEL[outcome],
      callbackRequestedAt: requestedAt,
      createdBy: actor,
      createdByName,
      createdAt: now,
    } as any);
  }

  syncNextCallback(call);
  await call.save();
  return { call, applied, kept };
}

/**
 * Add an agent note to a call. Append-only — a note records what the caller
 * said, so none is ever edited or replaced.
 *
 * `callbackRequestedAt` is the time the caller asked for ("call me at 2 PM").
 * It is kept as the caller's request, shown to whoever picks the call up
 * next; it does not move the call-back ladder's TAT, which stays the
 * manager's policy.
 */
export async function addCallComment(
  id: string,
  input: {
    text?: string;
    callbackRequestedAt?: string | Date;
    actorUserId?: string;
  },
) {
  const text = String(input.text || "").trim();
  if (!text) throw new SrError("Write a note first.", 400);
  if (text.length > 2000)
    throw new SrError("Notes are limited to 2000 characters.", 400);

  let requestedAt: Date | undefined;
  if (input.callbackRequestedAt) {
    requestedAt = new Date(input.callbackRequestedAt);
    if (Number.isNaN(requestedAt.getTime()))
      throw new SrError("The requested call-back time is not a valid date.", 400);
  }

  const call = await CallIntake.findById(id);
  if (!call) throw new SrError("Call not found", 404);

  let createdByName: string | undefined;
  let createdBy: mongoose.Types.ObjectId | undefined;
  if (input.actorUserId && mongoose.Types.ObjectId.isValid(input.actorUserId)) {
    createdBy = oid(input.actorUserId);
    const u: any = await User.findById(createdBy)
      .select("firstName lastName email")
      .lean();
    createdByName =
      [u?.firstName, u?.lastName].filter(Boolean).join(" ") ||
      u?.email ||
      undefined;
  }

  call.comments = call.comments || [];
  call.comments.push({
    text,
    callbackRequestedAt: requestedAt,
    createdBy,
    createdByName,
    createdAt: new Date(),
  } as any);
  await call.save();
  return call;
}

/** OCR — resolved during the call, no SR created. */
export async function resolveCallOnCall(
  id: string,
  input: { remark?: string },
) {
  const call = await CallIntake.findById(id);
  if (!call) throw new SrError("Call not found", 404);
  call.resolvedOnCall = true;
  call.status = "closed";
  call.remark = input.remark;
  await call.save();
  return call;
}
