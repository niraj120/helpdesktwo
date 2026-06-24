/**
 * IVR call triage — HTTP controller. Phase 5.
 */
import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import * as ivr from "../modules/service-request/callTriage";
import { SrError } from "../modules/service-request/serviceRequestService";
import { getProjectScope } from "../utils/projectScope";

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
    const data = await ivr.listCalls({
      projectId: str(req.query.projectId),
      callType: str(req.query.callType),
      registered: str(req.query.registered),
      callStatus: str(req.query.callStatus),
      search: str(req.query.search),
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

export const resolveOnCall = async (req: AuthRequest, res: Response) => {
  try {
    const c = await ivr.resolveCallOnCall(req.params.id, req.body);
    res.json({ success: true, data: c });
  } catch (err) {
    fail(res, err);
  }
};
