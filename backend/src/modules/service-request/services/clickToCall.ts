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
  const agentName =
    [agent?.firstName, agent?.lastName].filter(Boolean).join(" ") || undefined;
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
      agentName,
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
        agentName,
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
 * the echoed custom_identifier (or ref_id).
 *
 * Everything the provider reports about the call-back — outcome, duration,
 * recording — is written onto THAT attempt. A caller chased three times ends
 * up with one inbound recording plus one per call-back, side by side on the
 * same call; nothing overwrites anything.
 *
 * Returns the CallIntake the attempt belongs to, or null when the webhook is
 * not one of ours (so the caller can treat it as a fresh inbound call).
 */
export async function correlateOutboundWebhook(params: {
  customIdentifier?: string;
  refId?: string;
  status: "answered" | "missed" | "failed";
  message?: string;
  externalId?: string;
  recordingUrl?: string;
  durationSeconds?: number;
  answerStamp?: Date;
  endStamp?: Date;
  providerCallStatus?: string;
}) {
  const { customIdentifier, refId, status } = params;
  if (!customIdentifier && !refId) return null;

  const or: any[] = [];
  if (customIdentifier)
    or.push({ "outboundCalls.customIdentifier": customIdentifier });
  if (refId) or.push({ "outboundCalls.refId": refId });

  const call = await CallIntake.findOne({ $or: or });
  if (!call || !call.outboundCalls) return null;

  const entry = call.outboundCalls.find(
    (o) =>
      (customIdentifier && o.customIdentifier === customIdentifier) ||
      (refId && o.refId === refId),
  );
  if (!entry) return null;

  // The provider can send more than one webhook for a call (per leg, or a late
  // CDR). Once a call has connected it stays connected, and a later payload
  // that lacks a field must not blank what an earlier one supplied.
  if (entry.status !== "answered") entry.status = status;
  entry.completedAt = new Date();
  if (params.message) entry.message = params.message;
  if (params.externalId) entry.externalId = params.externalId;
  if (params.recordingUrl) entry.recordingUrl = params.recordingUrl;
  if (params.durationSeconds !== undefined)
    entry.durationSeconds = params.durationSeconds;
  if (params.answerStamp) entry.answerStamp = params.answerStamp;
  if (params.endStamp) entry.endStamp = params.endStamp;
  if (params.providerCallStatus)
    entry.providerCallStatus = params.providerCallStatus;

  call.lastOutboundStatus = entry.status;
  call.lastOutboundAt = new Date();
  await call.save();
  return call;
}
