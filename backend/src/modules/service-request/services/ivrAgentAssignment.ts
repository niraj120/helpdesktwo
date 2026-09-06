/**
 * Missed-call round-robin assignment to IVR agents.
 *
 * SmartFlo names no agent on a missed call — nobody picked it up — so the
 * platform decides who owns it:
 *
 *   - Caller chose an IVR option: rotate among the agents mapped to that
 *     option, so a billing call reaches whoever handles billing.
 *   - Caller chose nothing (or a digit we do not recognise): rotate among every
 *     available IVR agent rather than requiring someone to be mapped to the
 *     "other" bucket.
 *
 * Either way the pick is the least-recently-assigned eligible agent, so the
 * rotation stays fair. A missed call with an unmapped option falls back to the
 * full pool rather than going unassigned — an unowned missed call is worse than
 * one owned by the wrong specialist.
 */
import mongoose from "mongoose";
import { IvrAgentConfig } from "../../../models/IvrAgentConfig";
import { IvrAgentLeave } from "../../../models/IvrAgentLeave";
import {
  IvrDigitConfig,
  OTHER_BUCKET,
} from "../../../models/IvrDigitConfig";
import { User } from "../../../models/User";
import { IvrDidConfig } from "../../../models/IvrDidConfig";

/**
 * Which bucket a call belongs to, and whether the caller actually chose it.
 * `chosen: false` means no digit was dialed or none matched the project's
 * options — the difference that decides how wide the agent pool is.
 */
async function resolveBucket(
  projectId: mongoose.Types.ObjectId,
  digitsDialed: string[] = [],
): Promise<{ bucket: string; chosen: boolean }> {
  const cfg = await IvrDigitConfig.findOne({ projectId }).lean();
  const codes = new Set((cfg?.digits || []).map((d) => String(d.code)));
  for (const d of digitsDialed) {
    const code = String(d || "").trim();
    if (code && codes.has(code)) return { bucket: code, chosen: true };
  }
  return { bucket: OTHER_BUCKET, chosen: false };
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
): Promise<{
  assigned: boolean;
  userId?: string;
  bucket: string;
  via?: string;
}> {
  const projectId = call.projectId;
  const { bucket, chosen } = await resolveBucket(
    projectId,
    call.digitsDialed || [],
  );

  /** Eligible = active IVR agent, not on leave today, and available now. */
  const eligibleFrom = async (configs: any[]) => {
    if (!configs.length) return [];
    const userIds = configs.map((c) => c.userId);

    const activeUsers = await User.find({
      _id: { $in: userIds },
      isActive: true,
      isIvrAgent: true,
    })
      .select("_id")
      .lean();
    const activeSet = new Set(activeUsers.map((u) => String(u._id)));

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

    return configs
      .filter(
        (c) =>
          activeSet.has(String(c.userId)) &&
          !leaveSet.has(String(c.userId)) &&
          isAvailableNow(c),
      )
      // least-recently-assigned first (never assigned counts as oldest)
      .sort(
        (a, b) =>
          new Date(a.lastAssignedAt || 0).getTime() -
          new Date(b.lastAssignedAt || 0).getTime(),
      );
  };

  let eligible: any[] = [];
  let via = "";

  if (chosen) {
    // The caller picked an option — prefer the agents who handle it.
    eligible = await eligibleFrom(
      await IvrAgentConfig.find({ projectId, active: true, digits: bucket }).lean(),
    );
    via = "digit-bucket";
  }

  if (!eligible.length) {
    // No option chosen, or nobody available for the one that was: rotate
    // across every available agent so the call still gets an owner.
    eligible = await eligibleFrom(
      await IvrAgentConfig.find({ projectId, active: true }).lean(),
    );
    via = chosen ? "any-agent-fallback" : "any-agent";
  }

  if (eligible.length) {
    const chosenAgent = eligible[0];
    await IvrAgentConfig.updateOne(
      { _id: chosenAgent._id },
      { $set: { lastAssignedAt: new Date() } },
    );
    call.assignedTo = chosenAgent.userId;
    call.assignedBucket = bucket;
    call.assignmentStatus = "assigned";
    call.callStatus = "assigned";
    call.matchedBy = via;
    await call.save();
    return { assigned: true, userId: String(chosenAgent.userId), bucket, via };
  }

  // Nobody available anywhere in the project — flag for manual handling.
  call.assignedBucket = bucket;
  call.assignmentStatus = "unassigned_no_agent";
  await call.save();
  return { assigned: false, bucket };
}

const last10 = (v: any): string =>
  String(v || "").replace(/\D/g, "").slice(-10);

/**
 * Assign an ANSWERED call to the agent who picked it up.
 *
 * SmartFlo exposes no stable agent id — only the agent's phone number
 * (answeredAgentNumber) and the DID that was answered (callToNumber). Since each
 * DID has dedicated agent(s), we resolve identity two ways and prefer the most
 * precise:
 *   1. Agent phone → helpdesk User via tataAgentNumber (the exact answerer).
 *   2. DID → dedicated agent from the DID registry (fallback; unambiguous only
 *      when the DID maps to a single agent).
 * Mutates + saves the CallIntake, recording which key matched (matchedBy).
 */
export async function assignAnsweredCall(
  call: any,
): Promise<{ assigned: boolean; userId?: string; via?: string }> {
  const agentDigits = last10(call.answeredAgentNumber);
  const didDigits = last10(call.callToNumber);

  // DID registry entry for the DID that was answered (last-10 match).
  let did: any = null;
  if (didDigits) {
    const dids = await IvrDidConfig.find({
      projectId: call.projectId,
      active: true,
    }).lean();
    did = dids.find((d) => last10(d.didNumber) === didDigits) || null;
  }

  // The agent who actually answered, matched by phone number.
  let byNumber: any = null;
  if (agentDigits) {
    byNumber = await User.findOne({
      tataAgentNumber: new RegExp(`${agentDigits}$`),
      projects: call.projectId,
      isActive: true,
    })
      .select("_id")
      .lean();
  }

  let userId: any = null;
  let via: string | undefined;
  if (byNumber) {
    userId = byNumber._id;
    via = "agent-number";
  } else if (did && Array.isArray(did.agentUserIds) && did.agentUserIds.length === 1) {
    // DID dedicated to a single agent — unambiguous fallback.
    userId = did.agentUserIds[0];
    via = "did-dedicated";
  }
  // A DID mapped to many agents with no phone match is ambiguous → leave for
  // manual assignment rather than guess who answered.

  if (did) call.didLabel = did.label || did.didNumber;
  if (!userId) {
    if (did) await call.save(); // still record the DID label for context
    return { assigned: false };
  }

  call.assignedTo = userId;
  call.assignmentStatus = "assigned";
  call.callStatus = "assigned";
  call.matchedBy = via;
  await call.save();
  return { assigned: true, userId: String(userId), via };
}
