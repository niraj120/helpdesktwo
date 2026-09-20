/**
 * Email triage inbox — HTTP controller. Phase 4.
 */
import { Response } from "express";
import { AuthRequest } from "../../../middleware/auth";
import * as triage from "../emailTriage";
import { SrError } from "../serviceRequestService";
import { canAccessProject, getProjectScope } from "../../../utils/projectScope";
import { lookupFamily } from "../srFamilyLookup";

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
function hasPerm(req: AuthRequest, code: string): boolean {
  const role = req.user?.role;
  if (
    role?.code === "SUPER_ADMIN" ||
    role?.name === "Super Admin" ||
    role === "Super Admin"
  ) {
    return true;
  }
  const perms = role?.permissions || [];
  return perms.some((p: any) => {
    const permCode = typeof p === "string" ? p : p?.code;
    const permName = typeof p === "string" ? p : p?.name;
    return permCode === code || permName === code;
  });
}

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
    const viewerId = actorId(req);
    const canAccessAll = hasPerm(req, "EMAIL_TRIAGE_ALL");
    const data = await triage.listEmailIntake({
      projectId: str(req.query.projectId),
      status: str(req.query.status),
      read: str(req.query.read),
      senderType: str(req.query.senderType),
      search: str(req.query.search),
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      scope: getProjectScope(req),
      assignedOnlyToUserId: canAccessAll ? undefined : viewerId,
    });
    res.json({ success: true, ...data });
  } catch (err) {
    fail(res, err);
  }
};

export const getOne = async (req: AuthRequest, res: Response) => {
  try {
    const viewerId = actorId(req);
    const data = await triage.getEmailIntake(req.params.id);
    triage.assertEmailOwnerAccess(data, viewerId, hasPerm(req, "EMAIL_TRIAGE_ALL"));
    res.json({ success: true, data });
  } catch (err) {
    fail(res, err);
  }
};

/**
 * The sender's family — parents registered on the From address and their
 * children. Same access as opening the email itself.
 */
export const family = async (req: AuthRequest, res: Response) => {
  try {
    const viewerId = actorId(req);
    const email: any = await triage.getEmailIntake(req.params.id);
    triage.assertEmailOwnerAccess(email, viewerId, hasPerm(req, "EMAIL_TRIAGE_ALL"));
    const projectId = String(email.projectId || "");
    if (!projectId || !canAccessProject(getProjectScope(req), projectId)) {
      res.status(403).json({ success: false, message: "No access to this email's project." });
      return;
    }
    const data = await lookupFamily(projectId, { email: email.fromEmail });
    res.json({ success: true, data });
  } catch (err) {
    fail(res, err);
  }
};

/** Mark an email read / unread — anyone who may open it. */
export const markRead = async (req: AuthRequest, res: Response) => {
  try {
    const viewerId = actorId(req);
    const email = await triage.getEmailIntake(req.params.id);
    triage.assertEmailOwnerAccess(email, viewerId, hasPerm(req, "EMAIL_TRIAGE_ALL"));
    const data = await triage.setEmailRead(
      req.params.id,
      req.body?.read !== false,
      viewerId,
    );
    res.json({ success: true, data });
  } catch (err) {
    fail(res, err);
  }
};

export const action = async (req: AuthRequest, res: Response) => {
  try {
    const viewerId = actorId(req);
    const type = String(req.body?.type || "");
    const isResponse = type === "responded";
    const allowed = isResponse
      ? hasPerm(req, "EMAIL_TRIAGE_RESPOND")
      : hasPerm(req, "EMAIL_TRIAGE_CONVERT");
    if (!allowed) {
      res.status(403).json({
        success: false,
        message: "Forbidden: insufficient email triage permission",
      });
      return;
    }
    const updated = await triage.actionEmailIntake(
      req.params.id,
      req.body,
      viewerId,
      hasPerm(req, "EMAIL_TRIAGE_ALL"),
    );
    res.json({ success: true, data: updated });
  } catch (err) {
    fail(res, err);
  }
};

export const bulkAction = async (req: AuthRequest, res: Response) => {
  try {
    const viewerId = actorId(req);
    const type = String(req.body?.type || "");
    const isResponse = type === "responded";
    const allowed = isResponse
      ? hasPerm(req, "EMAIL_TRIAGE_RESPOND")
      : hasPerm(req, "EMAIL_TRIAGE_CONVERT");
    if (!allowed) {
      res.status(403).json({
        success: false,
        message: "Forbidden: insufficient email triage permission",
      });
      return;
    }
    const data = await triage.bulkActionEmailIntake(
      Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [],
      req.body,
      viewerId,
      hasPerm(req, "EMAIL_TRIAGE_ALL"),
    );
    res.json({ success: true, data });
  } catch (err) {
    fail(res, err);
  }
};

export const bulkDelete = async (req: AuthRequest, res: Response) => {
  try {
    const viewerId = actorId(req);
    if (!hasPerm(req, "EMAIL_TRIAGE_CONVERT")) {
      res.status(403).json({
        success: false,
        message: "Forbidden: insufficient email triage permission",
      });
      return;
    }
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    const data = await triage.deleteEmailIntakes(
      ids,
      viewerId,
      hasPerm(req, "EMAIL_TRIAGE_ALL"),
    );
    res.json({ success: true, data });
  } catch (err) {
    fail(res, err);
  }
};
