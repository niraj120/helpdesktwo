/**
 * Outbound Click-to-Call for the IVR triage inbox.
 *
 * An agent clicks "Call back" on a missed/answered call; SmartFlo rings the
 * agent's own phone (their per-user tataAgentNumber) first, then dials the
 * caller. We stamp a correlation token (customIdentifier) that SmartFlo echoes
 * on the resulting webhook, so the call's outcome (answered/missed) stitches
 * back onto the same CallIntake.
 */
import crypto from "crypto";
import mongoose from "mongoose";
import { CallIntake } from "../../../models/CallIntake";
import { User } from "../../../models/User";
import { TataVoiceConfig } from "../../../models/TataVoiceConfig";
import { TataVoiceClient, TataVoiceError } from "../../../services/tataVoiceClient";
import { SrError } from "../serviceRequestService";

const cleanNumber = (v?: string) => (v ? v.replace(/[\s-()]/g, "").trim() : "");

export interface ClickToCallInput {
  /** CallIntake _id being called back. */
  callId: string;
  /** Authenticated agent placing the call (req.user.userId). */
  actorUserId: string;
  /** Optional override; defaults to the call's stored caller mobile. */
  destinationOverride?: string;
}

export interface ClickToCallOutcome {
  refId?: string;
  customIdentifier: string;
  status: "initiated";
  message?: string;
}

/**
 * Initiate a Click-to-Call for a CallIntake. Throws SrError (mapped to an HTTP
 * status by the controller) on any precondition or provider failure; on the
 * latter it also records a "failed" attempt on the CallIntake for the audit
 * trail before rethrowing.
 */
export async function initiateClickToCall(
  input: ClickToCallInput,
): Promise<ClickToCallOutcome> {
  const call = await CallIntake.findById(input.callId);
  if (!call) throw new SrError("Call not found", 404);

  const destination = cleanNumber(
    input.destinationOverride || call.callerMobile,
  );
  if (!destination)
    throw new SrError("No destination number for this call", 400);

  const agent = await User.findById(input.actorUserId)
    .select("tataAgentNumber firstName lastName")
    .lean();
  const agentNumber = cleanNumber(agent?.tataAgentNumber);
  if (!agentNumber)
    throw new SrError(
      "Your SmartFlo agent number is not configured. Set it on your user profile before placing calls.",
      400,
    );

  const config = await TataVoiceConfig.findOne({
    projectId: call.projectId,
    isActive: true,
  });
  if (!config)
    throw new SrError(
      "TATA voice is not configured for this project.",
      400,
    );

  const token = config.getDecryptedToken();
  if (!token)
    throw new SrError("TATA voice token could not be read.", 500);

  // Correlation token echoed back on the webhook. Short, unique, greppable.
  const customIdentifier = `cti_${String(call._id)}_${crypto
    .randomBytes(6)
    .toString("hex")}`;

  const client = new TataVoiceClient({
    baseUrl: config.baseUrl,
    token,
  });

  const callerId = cleanNumber(config.defaultCallerId) || undefined;

  try {
    const result = await client.clickToCall({
      callerId,
      destinationNumber: destination,
      agentNumber,
      customIdentifier,
      callTimeoutSeconds: config.callTimeoutSeconds,
    });

    call.outboundCalls = call.outboundCalls || [];
    call.outboundCalls.push({
      refId: result.refId,
      customIdentifier,
      agentUserId: new mongoose.Types.ObjectId(input.actorUserId),
      agentNumber,
      callerId,
      destinationNumber: destination,
      status: "initiated",
      initiatedBy: new mongoose.Types.ObjectId(input.actorUserId),
      initiatedAt: new Date(),
      message: result.message,
    });
    call.lastOutboundStatus = "initiated";
    call.lastOutboundAt = new Date();
    await call.save();

    return {
      refId: result.refId,
      customIdentifier,
      status: "initiated",
      message: result.message,
    };
  } catch (err) {
    // Record the failed attempt for the trail, then surface a clean error.
    try {
      call.outboundCalls = call.outboundCalls || [];
      call.outboundCalls.push({
        customIdentifier,
        agentUserId: new mongoose.Types.ObjectId(input.actorUserId),
        agentNumber,
        callerId,
        destinationNumber: destination,
        status: "failed",
        initiatedBy: new mongoose.Types.ObjectId(input.actorUserId),
        initiatedAt: new Date(),
        message:
          err instanceof TataVoiceError ? err.message : "click-to-call failed",
      });
      call.lastOutboundStatus = "failed";
      call.lastOutboundAt = new Date();
      await call.save();
    } catch {
      /* best-effort record; ignore secondary failure */
    }

    if (err instanceof TataVoiceError)
      throw new SrError(`TATA click-to-call failed: ${err.message}`, 502);
    throw err;
  }
}

/**
 * Stitch a SmartFlo webhook back to the outbound attempt that spawned it, using
 * the echoed custom_identifier (or ref_id). Updates the matching outboundCalls
 * entry's terminal status. Best-effort — returns true if a match was updated.
 */
export async function correlateOutboundWebhook(params: {
  customIdentifier?: string;
  refId?: string;
  status: "answered" | "missed" | "failed";
  message?: string;
}): Promise<boolean> {
  const { customIdentifier, refId, status } = params;
  if (!customIdentifier && !refId) return false;

  const or: any[] = [];
  if (customIdentifier)
    or.push({ "outboundCalls.customIdentifier": customIdentifier });
  if (refId) or.push({ "outboundCalls.refId": refId });

  const call = await CallIntake.findOne({ $or: or });
  if (!call || !call.outboundCalls) return false;

  const entry = call.outboundCalls.find(
    (o) =>
      (customIdentifier && o.customIdentifier === customIdentifier) ||
      (refId && o.refId === refId),
  );
  if (!entry) return false;

  entry.status = status;
  entry.completedAt = new Date();
  if (params.message) entry.message = params.message;
  call.lastOutboundStatus = status;
  call.lastOutboundAt = new Date();
  await call.save();
  return true;
}
