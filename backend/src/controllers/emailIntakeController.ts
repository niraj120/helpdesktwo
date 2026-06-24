/**
 * Email triage inbox — HTTP controller. Phase 4.
 */
import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import * as triage from "../modules/service-request/emailTriage";
import { SrError } from "../modules/service-request/serviceRequestService";
import { getProjectScope } from "../utils/projectScope";

function actorId(req: AuthRequest): string {
  const id = req.user?.userId;
  if (!id) throw new SrError("Unauthenticated", 401);
  return id;
}
function fail(res: Response, err: any) {
  const status = err instanceof SrError ? err.status : 500;
  if (status === 500) console.error("[emailIntake] error:", err);
  res
    .status(status)
    .json({ success: false, message: err?.message || "Server error" });
}
const str = (v: any) => (v === undefined || v === null ? undefined : String(v));

export const ingest = async (req: AuthRequest, res: Response) => {
  try {
    const doc = await triage.ingestEmail(req.body);
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    fail(res, err);
  }
};

export const list = async (req: AuthRequest, res: Response) => {
  try {
    const data = await triage.listEmailIntake({
      projectId: str(req.query.projectId),
      status: str(req.query.status),
      senderType: str(req.query.senderType),
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
    res.json({ success: true, data: await triage.getEmailIntake(req.params.id) });
  } catch (err) {
    fail(res, err);
  }
};

export const action = async (req: AuthRequest, res: Response) => {
  try {
    const updated = await triage.actionEmailIntake(
      req.params.id,
      req.body,
      actorId(req),
    );
    res.json({ success: true, data: updated });
  } catch (err) {
    fail(res, err);
  }
};
