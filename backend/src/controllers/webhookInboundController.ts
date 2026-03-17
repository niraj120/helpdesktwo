import { Request, Response } from "express";
import ProjectEmailConfig from "../models/ProjectEmailConfig";
import EmailProcessingQueue from "../models/EmailProcessingQueue";
import { logError, ErrorContext, ErrorSeverity } from "../utils/errorLogger";

/**
 * Resolve a dot/bracket-notation path against a parsed body object.
 *
 * Handles:
 *  - Flat keys:                 "from"           → body["from"]
 *  - Nested JSON strings:       "envelope.to[0]" → JSON.parse(body["envelope"])["to"][0]
 *  - MIME headers multiline:    "headers.message-id" → scans body["headers"] string
 *                               for a "message-id: <value>" line
 */
function resolveBodyPath(body: any, path: string): string | undefined {
  if (!path) return undefined;

  // Fast path: direct flat key
  if (body[path] !== undefined && body[path] !== null) {
    const v = body[path];
    return typeof v === "object" ? JSON.stringify(v) : String(v);
  }

  // Traverse dot/bracket notation
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".");
  let val: any = body;

  for (const part of parts) {
    if (val === null || val === undefined) return undefined;

    if (typeof val === "string") {
      // Try JSON first (e.g. SendGrid's `envelope` field is a JSON string)
      let parsed = false;
      try {
        val = JSON.parse(val);
        parsed = true;
      } catch {
        // not JSON
      }

      if (!parsed) {
        // Try MIME-style multi-line headers: "HeaderName: value\n..."
        if (val.includes("\n")) {
          const line = (val as string)
            .split("\n")
            .find((l) => l.toLowerCase().startsWith(part.toLowerCase() + ":"));
          if (line) {
            val = line.replace(new RegExp(`^${part}:\\s*`, "i"), "").trim();
            continue;
          }
        }
        return undefined;
      }
    }

    if (typeof val !== "object" || val === null) return undefined;
    val = (val as Record<string, any>)[part];
  }

  if (val === null || val === undefined) return undefined;
  return typeof val === "object" ? JSON.stringify(val) : String(val);
}

/**
 * POST /api/email/inbound/webhook
 *
 * Generic inbound webhook handler.  Any email vendor (SendGrid, Mailgun,
 * Postmark, Gupshup, custom, …) posts to this single endpoint.
 *
 * Which fields to extract from the payload is stored per-config in
 * ProjectEmailConfig.webhookPayloadMap — fully editable from the UI.
 * Zero code changes are required to switch vendors.
 *
 * Security: set EMAIL_WEBHOOK_TOKEN in the backend .env and append
 *   ?token=<value> to the destination URL configured in your vendor.
 */
export const handleWebhookInbound = async (req: Request, res: Response) => {
  // Optional shared-secret validation
  const expectedToken = process.env.EMAIL_WEBHOOK_TOKEN;
  if (expectedToken) {
    const providedToken = req.query.token as string | undefined;
    if (!providedToken || providedToken !== expectedToken) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

  // Acknowledge immediately so the vendor doesn't retry
  res.status(200).json({ received: true });

  try {
    const body = req.body as Record<string, any>;

    // Load all enabled webhook configs
    const configs = await ProjectEmailConfig.find({
      isEnabled: true,
      inboundMethod: "webhook",
    }).lean();

    if (configs.length === 0) {
      console.warn("⚠️  Webhook inbound: no active webhook configs found");
      return;
    }

    // Find the matching config by resolving each config's `to` path against
    // the posted body and comparing with the stored emailAddress
    let matchedConfig: any = null;
    let resolvedTo = "";

    for (const config of configs) {
      const map = (config as any).webhookPayloadMap;
      if (!map?.to) continue;

      const toRaw = resolveBodyPath(body, map.to);
      if (!toRaw) continue;

      // Strip display name: "Support <support@example.com>" → "support@example.com"
      const emailMatch = toRaw.match(/([^\s,<>]+@[^\s,<>]+)/);
      const toAddr = (emailMatch ? emailMatch[1] : toRaw).toLowerCase();

      if (toAddr === (config as any).emailAddress) {
        matchedConfig = config;
        resolvedTo = toAddr;
        break;
      }
    }

    if (!matchedConfig) {
      console.warn(
        "⚠️  Webhook inbound: no config matched the recipient in the payload",
      );
      return;
    }

    const map = (matchedConfig as any).webhookPayloadMap;

    // Resolve sender
    const fromRaw = resolveBodyPath(body, map.from) || "";
    let fromAddress = "unknown@invalid.local";
    let fromName: string | undefined;
    if (fromRaw) {
      const nameMatch = fromRaw.match(/^(.*?)\s*<([^>]+)>/);
      if (nameMatch) {
        fromName = nameMatch[1].trim() || undefined;
        fromAddress = nameMatch[2].toLowerCase();
      } else {
        fromAddress = fromRaw.trim().toLowerCase();
      }
    }

    const subject =
      (resolveBodyPath(body, map.subject) || "").trim() || "(No Subject)";
    const text =
      (resolveBodyPath(body, map.text) || "").trim() || "(Empty message)";
    const html = resolveBodyPath(body, map.html) || undefined;

    // Message-ID
    const rawMsgId = map.messageId
      ? resolveBodyPath(body, map.messageId)
      : undefined;
    const messageId = rawMsgId
      ? rawMsgId.trim()
      : `webhook-${Date.now()}@helpdesk.local`;

    // Attachments — vendors that POST multipart/form-data will have files via multer
    const files = (req as any).files as Express.Multer.File[] | undefined;
    const attachments = (files || []).map((f) => ({
      filename: f.originalname || "attachment",
      contentType: f.mimetype || "application/octet-stream",
      size: f.size,
      content: f.buffer,
    }));

    // Deduplication
    const existing = await EmailProcessingQueue.findOne({
      "metadata.messageId": messageId,
      projectEmailConfigId: matchedConfig._id,
    });
    if (existing) {
      console.log(`   ⏭️  Duplicate webhook email (Message-ID: ${messageId})`);
      return;
    }

    const emailData = {
      messageId,
      from: { address: fromAddress, name: fromName },
      to: [{ address: resolvedTo }],
      subject,
      body: text,
      htmlBody: html,
      headers: "",
      attachments,
      receivedDate: new Date(),
      uid: 0,
      date: new Date(),
    };

    // Size guard (15 MB)
    const emailJson = JSON.stringify(emailData);
    const emailSize = Buffer.byteLength(emailJson);
    const MAX_DOC = 15 * 1024 * 1024;

    if (emailSize > MAX_DOC) {
      console.error(
        `   ❌ Webhook email too large: ${(emailSize / 1024 / 1024).toFixed(2)}MB`,
      );
      await logError({
        message: `Webhook inbound email too large: ${(emailSize / 1024 / 1024).toFixed(2)}MB`,
        context: ErrorContext.EMAIL_PARSING,
        severity: ErrorSeverity.MEDIUM,
        details: {
          messageId,
          subject: emailData.subject,
          from: fromAddress,
          size: emailSize,
          provider: matchedConfig.webhookProvider,
        },
      });
      return;
    }

    // Enqueue for processing
    const queueEntry = new EmailProcessingQueue({
      projectEmailConfigId: matchedConfig._id,
      rawEmail: emailJson,
      status: "pending",
      retryCount: 0,
      metadata: {
        fromEmail: fromAddress,
        toEmail: resolvedTo,
        subject: emailData.subject,
        messageId,
        size: emailSize,
      },
    });

    await queueEntry.save();
    console.log(
      `   ✅ Webhook inbound queued (provider: ${matchedConfig.webhookProvider || "unknown"}): "${subject}" (Queue ID: ${queueEntry._id})`,
    );
  } catch (error: any) {
    console.error("❌ Webhook inbound error:", error.message);
    await logError({
      message: `Webhook inbound failed: ${error.message}`,
      context: ErrorContext.EMAIL_POLLING,
      severity: ErrorSeverity.HIGH,
      details: { errorStack: error.stack },
    });
  }
};
