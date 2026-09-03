/**
 * Service Request (PSR/ISR) — IVR call triage service. Phase 5.
 * Inbound calls (e.g. Tata) are ingested, the caller is matched/classified,
 * and the call is converted to a PSR — or resolved on-call (OCR, no ticket).
 */
import mongoose from "mongoose";
import { CallIntake, RequesterType } from "../../models/CallIntake";
import { IvrIngestLog } from "../../models/IvrIngestLog";
import { User } from "../../models/User";
import { Project } from "../../models/Project";
import PsrTable from "../../models/psr/PsrTable";
import { createServiceRequest } from "./createServiceRequest";
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
  } else if (call.callType === "answered" && !call.assignedTo) {
    // Answered calls land in the picking agent's own list.
    try {
      await assignAnsweredCall(call);
    } catch (e) {
      console.error("[ivr] answered-call assign failed:", e);
    }
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

  // If this webhook is the outcome of one of OUR Click-to-Call originates,
  // stitch its terminal status back onto the CallIntake that spawned it. TATA
  // echoes our correlation token as custom_identifier; ref_id is the fallback.
  const customIdentifier = firstString(
    payload.custom_identifier,
    payload.customIdentifier,
  );
  const refId = firstString(payload.ref_id, payload.refId);
  if (customIdentifier || refId) {
    try {
      await correlateOutboundWebhook({
        customIdentifier,
        refId,
        status: call.callType === "missed" ? "missed" : "answered",
        message: providerCallStatus,
      });
    } catch (e) {
      console.error("[ivr] outbound correlation failed:", e);
    }
  }

  // Missed calls are round-robined to IVR agents (once, on first sight).
  if (call.callType === "missed" && !call.assignmentStatus) {
    try {
      await assignMissedCall(call);
    } catch (e) {
      console.error("[ivr] round-robin assign failed:", e);
    }
  } else if (call.callType === "answered" && !call.assignedTo) {
    // Answered calls land in the picking agent's own list.
    try {
      await assignAnsweredCall(call);
    } catch (e) {
      console.error("[ivr] answered-call assign failed:", e);
    }
  }
  return { ignored: false, call, logId: log._id };
}

export interface ListCallParams {
  projectId?: string;
  callType?: string; // answered | missed | all
  registered?: string; // "true" | "false" | all
  callStatus?: string; // new | assigned | converted | all
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
  if (params.search) {
    const rx = new RegExp(
      params.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i",
    );
    q.$or = [{ callerName: rx }, { callerMobile: rx }, { schoolName: rx }];
  }
  const [items, total] = await Promise.all([
    CallIntake.find(q)
      .sort({ receivedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    CallIntake.countDocuments(q),
  ]);
  return { items, total, page, limit };
}

export async function getCall(id: string) {
  const call = await CallIntake.findById(id).lean();
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
  return { call, ticket: r };
}

/**
 * Bulk-reassign IVR calls to a single agent. Returns per-call outcome.
 * Does not change conversion state — only who owns the call in the inbox.
 */
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
  await call.save();
  return call;
}

/** Mark a call as converted by a PSR created through the guided New Request flow. */
export async function markCallConverted(
  id: string,
  input: { ticketId: string; ticketNumber?: string },
) {
  const call = await CallIntake.findById(id);
  if (!call) throw new SrError("Call not found", 404);
  if (!mongoose.Types.ObjectId.isValid(input.ticketId)) {
    throw new SrError("Invalid ticket id.", 400);
  }
  call.callStatus = "converted";
  call.status = "closed";
  call.convertedTicketId = oid(input.ticketId);
  call.convertedTicketNumber = input.ticketNumber;
  call.convertedAt = new Date();
  await call.save();
  return call;
}

/**
 * Set (or clear) the WIP / call-back date on a call — when an agent has
 * committed to ringing this caller back. Mainly used on missed calls, which
 * carry no conversation yet, so the only record of intent is this date.
 *
 * Passing a null/empty date clears the commitment.
 */
export async function setCallCallback(
  id: string,
  input: { callbackAt?: string | null; note?: string; actorUserId?: string },
) {
  const call = await CallIntake.findById(id);
  if (!call) throw new SrError("Call not found", 404);

  const raw = String(input.callbackAt ?? "").trim();
  if (!raw) {
    call.callbackAt = undefined;
    call.callbackNote = undefined;
    call.callbackSetBy = undefined;
    call.callbackSetAt = undefined;
    await call.save();
    return call;
  }

  const when = new Date(raw);
  if (Number.isNaN(when.getTime())) {
    throw new SrError("Invalid call-back date.", 400);
  }
  call.callbackAt = when;
  call.callbackNote = input.note?.trim() || undefined;
  call.callbackSetBy =
    input.actorUserId && mongoose.Types.ObjectId.isValid(input.actorUserId)
      ? oid(input.actorUserId)
      : undefined;
  call.callbackSetAt = new Date();
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
