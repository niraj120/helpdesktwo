import { Response } from "express";
import { AuthRequest } from "../../../middleware/auth";
import { User } from "../../../models/User";
import { IvrAgentConfig } from "../../../models/IvrAgentConfig";
import { IvrAgentLeave } from "../../../models/IvrAgentLeave";
import {
  IvrDigitConfig,
  DEFAULT_IVR_DIGITS,
  OTHER_BUCKET,
} from "../../../models/IvrDigitConfig";

const fail = (res: Response, err: any) => {
  const status = err?.status || 500;
  res.status(status).json({ success: false, message: err?.message || "Error" });
};

const str = (v: any) => (v == null ? undefined : String(v));

function todayOnLeave(leaves: any[], userId: string): boolean {
  const now = new Date();
  return leaves.some(
    (l) =>
      String(l.userId) === userId &&
      new Date(l.fromDate) <= now &&
      new Date(l.toDate) >= now,
  );
}

/** GET /ivr-agents/digits?projectId — project digit buckets (seeds default). */
export async function getDigitConfig(req: AuthRequest, res: Response) {
  try {
    const projectId = str(req.query.projectId);
    if (!projectId) throw { status: 400, message: "projectId required" };
    let cfg = await IvrDigitConfig.findOne({ projectId }).lean();
    if (!cfg) {
      cfg = (
        await IvrDigitConfig.create({ projectId, digits: DEFAULT_IVR_DIGITS })
      ).toObject();
    }
    res.json({ success: true, digits: cfg.digits, otherBucket: OTHER_BUCKET });
  } catch (err) {
    fail(res, err);
  }
}

/** PUT /ivr-agents/digits — set project digit buckets. */
export async function setDigitConfig(req: AuthRequest, res: Response) {
  try {
    const { projectId, digits } = req.body || {};
    if (!projectId) throw { status: 400, message: "projectId required" };
    const clean = (Array.isArray(digits) ? digits : [])
      .map((d: any) => ({
        code: String(d.code || "").trim(),
        label: String(d.label || "").trim() || String(d.code || ""),
      }))
      .filter((d: any) => d.code && d.code !== OTHER_BUCKET);
    const cfg = await IvrDigitConfig.findOneAndUpdate(
      { projectId },
      { $set: { digits: clean, updatedBy: req.user?.userId } },
      { upsert: true, new: true },
    );
    res.json({ success: true, digits: cfg.digits });
  } catch (err) {
    fail(res, err);
  }
}

/** GET /ivr-agents?projectId — IVR-flagged users + mapping + leave status. */
export async function listAgents(req: AuthRequest, res: Response) {
  try {
    const projectId = str(req.query.projectId);
    if (!projectId) throw { status: 400, message: "projectId required" };

    const users = await User.find({
      isIvrAgent: true,
      projects: projectId,
    })
      .select("firstName lastName fullName email mobile isActive")
      .lean();

    const userIds = users.map((u) => u._id);
    const [configs, leaves] = await Promise.all([
      IvrAgentConfig.find({ projectId, userId: { $in: userIds } }).lean(),
      IvrAgentLeave.find({ projectId, userId: { $in: userIds } })
        .sort({ fromDate: 1 })
        .lean(),
    ]);
    const cfgByUser = new Map(configs.map((c) => [String(c.userId), c]));

    const agents = users.map((u) => {
      const c = cfgByUser.get(String(u._id));
      return {
        userId: u._id,
        name: u.fullName || `${u.firstName || ""} ${u.lastName || ""}`.trim(),
        email: u.email,
        mobile: u.mobile,
        isActive: u.isActive,
        digits: c?.digits || [],
        active: c ? c.active : true,
        available: c ? c.available !== false : true,
        unavailableUntil: c?.unavailableUntil || null,
        availableNow:
          !c ||
          c.available !== false ||
          (c.unavailableUntil && new Date(c.unavailableUntil) <= new Date()),
        lastAssignedAt: c?.lastAssignedAt || null,
        onLeave: todayOnLeave(leaves, String(u._id)),
        leaves: leaves
          .filter((l) => String(l.userId) === String(u._id))
          .map((l) => ({
            _id: l._id,
            fromDate: l.fromDate,
            toDate: l.toDate,
            reason: l.reason,
          })),
      };
    });

    res.json({ success: true, agents });
  } catch (err) {
    fail(res, err);
  }
}

/** PUT /ivr-agents/:userId — upsert an agent's digit mapping + active flag. */
export async function setAgentMapping(req: AuthRequest, res: Response) {
  try {
    const { userId } = req.params;
    const { projectId, digits, active } = req.body || {};
    if (!projectId) throw { status: 400, message: "projectId required" };
    const cfg = await IvrAgentConfig.findOneAndUpdate(
      { userId, projectId },
      {
        $set: {
          digits: Array.isArray(digits) ? digits.map(String) : [],
          active: active !== false,
        },
      },
      { upsert: true, new: true },
    );
    res.json({ success: true, config: cfg });
  } catch (err) {
    fail(res, err);
  }
}

/**
 * PUT /ivr-agents/:userId/availability — quick real-time break toggle.
 * body: { projectId, available, unavailableUntil? }
 *  - available:false + unavailableUntil (time today) → back automatically then
 *  - available:false + no until → off until manually resumed
 *  - available:true → resume now (clears until)
 */
export async function setAvailability(req: AuthRequest, res: Response) {
  try {
    const { userId } = req.params;
    const { projectId, available, unavailableUntil } = req.body || {};
    if (!projectId) throw { status: 400, message: "projectId required" };
    const set: any = { available: available !== false };
    set.unavailableUntil =
      available === false && unavailableUntil
        ? new Date(unavailableUntil)
        : null;
    const cfg = await IvrAgentConfig.findOneAndUpdate(
      { userId, projectId },
      { $set: set },
      { upsert: true, new: true },
    );
    res.json({ success: true, config: cfg });
  } catch (err) {
    fail(res, err);
  }
}

/** POST /ivr-agents/:userId/leaves — add a full-day leave range. */
export async function addLeave(req: AuthRequest, res: Response) {
  try {
    const { userId } = req.params;
    const { projectId, fromDate, toDate, reason } = req.body || {};
    if (!projectId || !fromDate || !toDate)
      throw { status: 400, message: "projectId, fromDate, toDate required" };
    const from = new Date(fromDate);
    from.setHours(0, 0, 0, 0);
    const to = new Date(toDate);
    to.setHours(23, 59, 59, 999);
    if (to < from) throw { status: 400, message: "toDate before fromDate" };
    const leave = await IvrAgentLeave.create({
      userId,
      projectId,
      fromDate: from,
      toDate: to,
      reason,
      createdBy: req.user?.userId,
    });
    res.json({ success: true, leave });
  } catch (err) {
    fail(res, err);
  }
}

/** DELETE /ivr-agents/leaves/:leaveId — remove a leave range. */
export async function removeLeave(req: AuthRequest, res: Response) {
  try {
    await IvrAgentLeave.deleteOne({ _id: req.params.leaveId });
    res.json({ success: true });
  } catch (err) {
    fail(res, err);
  }
}
