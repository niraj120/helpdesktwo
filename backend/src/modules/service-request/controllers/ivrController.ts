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
      search: str(req.query.search),
      assignedTo,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      scope: getProjectScope(req),
    });
    res.json({ success: true, ...data });
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

/** Add a WIP / call-back commitment. Each one is appended to the log. */
export const addFollowUp = async (req: AuthRequest, res: Response) => {
  try {
    const doc = await ivr.addCallFollowUp(req.params.id, {
      scheduledAt: String(req.body?.scheduledAt || ""),
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
        scheduledAt: str(req.body?.scheduledAt),
        note: str(req.body?.note),
        actorUserId: actorId(req),
      },
    );
    res.json({ success: true, data: doc });
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
