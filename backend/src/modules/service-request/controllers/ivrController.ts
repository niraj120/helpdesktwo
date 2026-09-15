/**
 * IVR call triage — HTTP controller. Phase 5.
 */
import { Response } from "express";
import { AuthRequest } from "../../../middleware/auth";
import * as ivr from "../callTriage";
import { SrError } from "../serviceRequestService";
import { getProjectScope } from "../../../utils/projectScope";
import { initiateClickToCall } from "../services/clickToCall";

function actorId(req: AuthRequest): string {
  const id = req.user?.userId;
  if (!id) throw new SrError("Unauthenticated", 401);
  return id;
}
function fail(res: Response, err: any) {
  const status = err instanceof SrError ? err.status : 500;
  if (status === 500) console.error("[ivr] error:", err);
  res
    .status(status)
    .json({ success: false, message: err?.message || "Server error" });
}
const str = (v: any) => (v === undefined || v === null ? undefined : String(v));

export const ingest = async (req: AuthRequest, res: Response) => {
  try {
    const doc = await ivr.ingestCall(req.body);
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    fail(res, err);
  }
};

/**
 * Whether this caller sees the whole project's calls or only their own.
 * Super Admin and IVR managers see everything; a plain agent sees their queue.
 */
function canSeeAllCalls(req: AuthRequest): boolean {
  const role = req.user?.role;
  if (role?.code === "SUPER_ADMIN") return true;
  const perms = role?.permissions || [];
  return ["IVR_VIEW_ALL_CALLS", "IVR_AGENT_MANAGE", "IVR_TAT_CONFIG"].some(
    (code) =>
      perms.some((p: any) => (typeof p === "string" ? p : p?.code) === code),
  );
}

export const list = async (req: AuthRequest, res: Response) => {
  try {
    // "me" resolves to the logged-in user's id (the "My calls" tab).
    const assignedToRaw = str(req.query.assignedTo);
    const assignedTo =
      assignedToRaw === "me" ? req.user?.userId : assignedToRaw;
    const data = await ivr.listCalls({
      projectId: str(req.query.projectId),
      callType: str(req.query.callType),
      registered: str(req.query.registered),
      callStatus: str(req.query.callStatus),
      wip: str(req.query.wip),
      restrictToUserId: canSeeAllCalls(req) ? undefined : req.user?.userId,
      search: str(req.query.search),
      assignedTo,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      scope: getProjectScope(req),
    });
    res.json({ success: true, ...data, canSeeAllCalls: canSeeAllCalls(req) });
  } catch (err) {
    fail(res, err);
  }
};

export const getOne = async (req: AuthRequest, res: Response) => {
  try {
    res.json({ success: true, data: await ivr.getCall(req.params.id) });
  } catch (err) {
    fail(res, err);
  }
};

export const classify = async (req: AuthRequest, res: Response) => {
  try {
    const c = await ivr.classifyCall(req.params.id, req.body);
    res.json({ success: true, data: c });
  } catch (err) {
    fail(res, err);
  }
};

export const convert = async (req: AuthRequest, res: Response) => {
  try {
    const r = await ivr.convertCall(req.params.id, req.body, actorId(req));
    res.json({ success: true, data: r });
  } catch (err) {
    fail(res, err);
  }
};

/** IVR agents this project's calls may be handed to. */
export const assignableAgents = async (req: AuthRequest, res: Response) => {
  try {
    const data = await ivr.listAssignableIvrAgents(
      String(req.query.projectId || ""),
    );
    res.json({ success: true, data });
  } catch (err) {
    fail(res, err);
  }
};

export const bulkReassign = async (req: AuthRequest, res: Response) => {
  try {
    const r = await ivr.bulkReassignCalls(
      Array.isArray(req.body?.callIds) ? req.body.callIds.map(String) : [],
      String(req.body?.toUserId || ""),
      actorId(req),
    );
    res.json({ success: true, data: r });
  } catch (err) {
    fail(res, err);
  }
};

export const markJunk = async (req: AuthRequest, res: Response) => {
  try {
    const c = await ivr.markCallJunk(req.params.id, req.body);
    res.json({ success: true, data: c });
  } catch (err) {
    fail(res, err);
  }
};

export const markConverted = async (req: AuthRequest, res: Response) => {
  try {
    const c = await ivr.markCallConverted(req.params.id, {
      ...req.body,
      // Attribution for the call history copied onto the ticket.
      actorUserId: actorId(req),
    });
    res.json({ success: true, data: c });
  } catch (err) {
    fail(res, err);
  }
};

export const resolveOnCall = async (req: AuthRequest, res: Response) => {
  try {
    const c = await ivr.resolveCallOnCall(req.params.id, req.body);
    res.json({ success: true, data: c });
  } catch (err) {
    fail(res, err);
  }
};

/**
 * The call-back ladder an agent may choose from. Read-only: agents need it to
 * render the choices, managers to edit them.
 */
export const getCallbackTat = async (req: AuthRequest, res: Response) => {
  try {
    const projectId = String(req.query.projectId || "");
    if (!projectId) {
      res.status(400).json({ success: false, message: "projectId is required" });
      return;
    }
    const data = await ivr.getCallbackTiers(projectId);
    res.json({ success: true, data });
  } catch (err) {
    fail(res, err);
  }
};

/** Replace the call-back ladder for a project (IVR manager). */
export const updateCallbackTat = async (req: AuthRequest, res: Response) => {
  try {
    const projectId = String(req.body?.projectId || "");
    if (!projectId) {
      res.status(400).json({ success: false, message: "projectId is required" });
      return;
    }
    const data = await ivr.saveCallbackTiers(projectId, {
      enabled: req.body?.enabled,
      tiers: req.body?.tiers,
    });
    res.json({ success: true, data });
  } catch (err) {
    fail(res, err);
  }
};

/** Add a WIP / call-back commitment. Each one is appended to the log. */
export const addFollowUp = async (req: AuthRequest, res: Response) => {
  try {
    const doc = await ivr.addCallFollowUp(req.params.id, {
      wipLevel: req.body?.wipLevel,
      note: str(req.body?.note),
      actorUserId: actorId(req),
    });
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    fail(res, err);
  }
};

/** Close out or amend one follow-up. */
export const updateFollowUp = async (req: AuthRequest, res: Response) => {
  try {
    const doc = await ivr.updateCallFollowUp(
      req.params.id,
      req.params.followUpId,
      {
        status: req.body?.status,
        outcome: req.body?.outcome,
        wipLevel: req.body?.wipLevel,
        note: str(req.body?.note),
        actorUserId: actorId(req),
      },
    );
    res.json({ success: true, data: doc });
  } catch (err) {
    fail(res, err);
  }
};

/**
 * How a call to the caller went. Advances the WIP ladder: answered closes it,
 * not connected / asked to call back apply the next step.
 */
export const logAttempt = async (req: AuthRequest, res: Response) => {
  try {
    const r = await ivr.logCallAttempt(req.params.id, {
      outcome: str(req.body?.outcome),
      note: str(req.body?.note),
      callbackRequestedAt: str(req.body?.callbackRequestedAt),
      actorUserId: actorId(req),
    });
    res.status(201).json({
      success: true,
      data: r.call,
      applied: r.applied,
      kept: r.kept,
    });
  } catch (err) {
    fail(res, err);
  }
};

/** Add an agent note ("asked to call back at 2 PM"). Append-only. */
export const addComment = async (req: AuthRequest, res: Response) => {
  try {
    const doc = await ivr.addCallComment(req.params.id, {
      text: str(req.body?.text),
      callbackRequestedAt: str(req.body?.callbackRequestedAt),
      actorUserId: actorId(req),
    });
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    fail(res, err);
  }
};

/** Outbound Click-to-Call: ring the agent, then dial the caller back. */
export const clickToCall = async (req: AuthRequest, res: Response) => {
  try {
    const outcome = await initiateClickToCall({
      callId: req.params.id,
      actorUserId: actorId(req),
      destinationOverride: str(req.body?.destinationNumber),
    });
    res.json({ success: true, data: outcome });
  } catch (err) {
    fail(res, err);
  }
};
