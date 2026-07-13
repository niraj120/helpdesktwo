/**
 * Missed-call round-robin assignment to IVR agents.
 *
 * On a MISSED call, resolve the dialed digit → bucket, find active IVR agents
 * mapped to that bucket who are not on leave today, and assign the call to the
 * least-recently-assigned agent (fair rotation). If no eligible agent exists the
 * call is left unassigned and flagged for manual handling.
 */
import mongoose from "mongoose";
import { IvrAgentConfig } from "../../../models/IvrAgentConfig";
import { IvrAgentLeave } from "../../../models/IvrAgentLeave";
import {
  IvrDigitConfig,
  OTHER_BUCKET,
} from "../../../models/IvrDigitConfig";
import { User } from "../../../models/User";

/** Resolve which bucket a call belongs to from its dialed digits. */
async function resolveBucket(
  projectId: mongoose.Types.ObjectId,
  digitsDialed: string[] = [],
): Promise<string> {
  const cfg = await IvrDigitConfig.findOne({ projectId }).lean();
  const codes = new Set((cfg?.digits || []).map((d) => String(d.code)));
  for (const d of digitsDialed) {
    const code = String(d || "").trim();
    if (code && codes.has(code)) return code;
  }
  return OTHER_BUCKET;
}

function dayBounds(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/**
 * Assign a missed call. Mutates + saves the CallIntake document.
 * Returns { assigned, userId?, bucket }.
 */
export async function assignMissedCall(
  call: any,
): Promise<{ assigned: boolean; userId?: string; bucket: string }> {
  const projectId = call.projectId;
  const bucket = await resolveBucket(projectId, call.digitsDialed || []);

  // Candidate agent configs: active + mapped to this bucket, in this project.
  const configs = await IvrAgentConfig.find({
    projectId,
    active: true,
    digits: bucket,
  }).lean();

  if (configs.length) {
    const userIds = configs.map((c) => c.userId);

    // Drop users who are inactive or no longer flagged as IVR agents.
    const activeUsers = await User.find({
      _id: { $in: userIds },
      isActive: true,
      isIvrAgent: true,
    })
      .select("_id")
      .lean();
    const activeSet = new Set(activeUsers.map((u) => String(u._id)));

    // Drop users on leave today.
    const { start, end } = dayBounds();
    const onLeave = await IvrAgentLeave.find({
      projectId,
      userId: { $in: userIds },
      fromDate: { $lte: end },
      toDate: { $gte: start },
    })
      .select("userId")
      .lean();
    const leaveSet = new Set(onLeave.map((l) => String(l.userId)));

    const now = new Date();
    const isAvailableNow = (c: any) =>
      c.available !== false ||
      (c.unavailableUntil && new Date(c.unavailableUntil) <= now);

    const eligible = configs
      .filter(
        (c) =>
          activeSet.has(String(c.userId)) &&
          !leaveSet.has(String(c.userId)) &&
          isAvailableNow(c),
      )
      // least-recently-assigned first (null/undefined = never assigned = oldest)
      .sort(
        (a, b) =>
          new Date(a.lastAssignedAt || 0).getTime() -
          new Date(b.lastAssignedAt || 0).getTime(),
      );

    if (eligible.length) {
      const chosen = eligible[0];
      await IvrAgentConfig.updateOne(
        { _id: chosen._id },
        { $set: { lastAssignedAt: new Date() } },
      );
      call.assignedTo = chosen.userId;
      call.assignedBucket = bucket;
      call.assignmentStatus = "assigned";
      call.callStatus = "assigned";
      await call.save();
      return { assigned: true, userId: String(chosen.userId), bucket };
    }
  }

  // No eligible agent — leave unassigned + flag for manual handling.
  call.assignedBucket = bucket;
  call.assignmentStatus = "unassigned_no_agent";
  await call.save();
  return { assigned: false, bucket };
}
