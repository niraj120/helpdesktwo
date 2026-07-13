import { Request, Response } from "express";
import {
  syncUsersFromSource,
  syncSingleUser,
  syncAllEnabledSources,
} from "../services/mdmUserSync";

const fail = (res: Response, err: any) =>
  res
    .status(err?.status || 500)
    .json({ success: false, message: err?.message || "Sync failed" });

/** POST /api/mdm-sync/source/:sourceId — sync all users of one MDM source. */
export async function syncSource(req: Request, res: Response) {
  try {
    const result = await syncUsersFromSource(req.params.sourceId, req.body || {});
    res.json({ success: true, result });
  } catch (err) {
    fail(res, err);
  }
}

/** POST /api/mdm-sync/user/:userId — sync one MDM-managed user. */
export async function syncUser(req: Request, res: Response) {
  try {
    const result = await syncSingleUser(req.params.userId);
    res.json({ success: true, result });
  } catch (err) {
    fail(res, err);
  }
}

/** POST /api/mdm-sync/all — sync every source with userSync enabled. */
export async function syncAll(_req: Request, res: Response) {
  try {
    const results = await syncAllEnabledSources();
    res.json({ success: true, results });
  } catch (err) {
    fail(res, err);
  }
}
