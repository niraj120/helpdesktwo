import { Request, Response } from "express";
import ProjectEmailConfig from "../models/ProjectEmailConfig";
import EmailProcessingQueue from "../models/EmailProcessingQueue";
import { logError, ErrorContext, ErrorSeverity } from "../utils/errorLogger";

/**
 * POST /api/email/inbound/sendgrid
 *
 * SendGrid Inbound Parse Webhook handler.
 * SendGrid POSTs multipart/form-data here when an email arrives at a
 * configured inbound address.  multer parses the body before this runs.
 *
 * Setup in SendGrid:
 *   Settings → Inbound Parse → Add Host & URL
 *   URL: https://<your-domain>/api/email/inbound/sendgrid
 *   Tick "POST the raw, full MIME message" if you want raw; otherwise
 *   leave unticked for the parsed form fields used below.
 */
export const handleSendgridInbound = async (req: Request, res: Response) => {
  // Validate shared secret token if SENDGRID_INBOUND_TOKEN is configured
  const expectedToken = process.env.SENDGRID_INBOUND_TOKEN;
  if (expectedToken) {
    const providedToken = req.query.token as string | undefined;
    if (!providedToken || providedToken !== expectedToken) {
      // Return 403 but do NOT expose details to the caller
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

  // Acknowledge immediately so SendGrid doesn't retry
  res.status(200).json({ received: true });

  try {
    const { to, from, subject, text, html, headers, envelope, charsets } =
      req.body as Record<string, string>;

    // ---------- resolve recipient address ----------
    let toAddress = "";
    if (envelope) {
      try {
        const env = JSON.parse(envelope);
        if (Array.isArray(env.to) && env.to.length > 0) {
          toAddress = env.to[0].toLowerCase();
        }
      } catch {
        // fall through to `to` field
      }
    }
    if (!toAddress && to) {
      // `to` may be "Name <email>" or just "email,email"
      const match = to.match(/([^\s,<>]+@[^\s,<>]+)/);
      if (match) toAddress = match[1].toLowerCase();
    }

    if (!toAddress) {
      console.warn(
        "⚠️  SendGrid inbound: could not determine recipient, skipping",
      );
      return;
    }

    // ---------- find matching ProjectEmailConfig ----------
    const config = await ProjectEmailConfig.findOne({
      emailAddress: toAddress,
      isEnabled: true,
      inboundMethod: "sendgrid",
    });

    if (!config) {
      console.warn(
        `⚠️  SendGrid inbound: no SendGrid config found for ${toAddress}`,
      );
      return;
    }

    console.log(
      `📬 SendGrid inbound email for ${toAddress} (project: ${config.projectId})`,
    );

    // ---------- parse sender ----------
    let fromAddress = "unknown@invalid.local";
    let fromName: string | undefined;
    if (from) {
      const nameMatch = from.match(/^(.*?)\s*<([^>]+)>/);
      if (nameMatch) {
        fromName = nameMatch[1].trim() || undefined;
        fromAddress = nameMatch[2].toLowerCase();
      } else {
        fromAddress = from.trim().toLowerCase();
      }
    }

    // ---------- attachments from multer ----------
    const files = (req as any).files as Express.Multer.File[] | undefined;
    const attachments = (files || []).map((f) => ({
      filename: f.originalname || "attachment",
      contentType: f.mimetype || "application/octet-stream",
      size: f.size,
      content: f.buffer,
    }));

    // ---------- build EmailData ----------
    const messageId =
      (headers &&
        headers
          .split("\n")
          .find((h: string) => h.toLowerCase().startsWith("message-id:"))
          ?.replace(/message-id:\s*/i, "")
          .trim()) ||
      `sendgrid-${Date.now()}@helpdesk.local`;

    const emailData = {
      messageId,
      from: { address: fromAddress, name: fromName },
      to: [{ address: toAddress }],
      subject: subject?.trim() || "(No Subject)",
      body: text?.trim() || "(Empty message)",
      htmlBody: html || undefined,
      headers: headers || "",
      attachments,
      receivedDate: new Date(),
      uid: 0,
      date: new Date(),
    };

    // ---------- dedup check ----------
    const existing = await EmailProcessingQueue.findOne({
      "metadata.messageId": messageId,
      projectEmailConfigId: config._id,
    });

    if (existing) {
      console.log(`   ⏭️  Duplicate SendGrid email (Message-ID: ${messageId})`);
      return;
    }

    // ---------- size guard ----------
    const emailJson = JSON.stringify(emailData);
    const emailSize = Buffer.byteLength(emailJson);
    const MAX_DOC = 15 * 1024 * 1024;

    if (emailSize > MAX_DOC) {
      console.error(
        `   ❌ SendGrid email too large: ${(emailSize / 1024 / 1024).toFixed(2)}MB`,
      );
      await logError({
        message: `SendGrid inbound email too large: ${(emailSize / 1024 / 1024).toFixed(2)}MB`,
        context: ErrorContext.EMAIL_PARSING,
        severity: ErrorSeverity.MEDIUM,
        details: {
          messageId,
          subject: emailData.subject,
          from: fromAddress,
          size: emailSize,
        },
      });
      return;
    }

    // ---------- enqueue ----------
    const queueEntry = new EmailProcessingQueue({
      projectEmailConfigId: config._id,
      rawEmail: emailJson,
      status: "pending",
      retryCount: 0,
      metadata: {
        fromEmail: fromAddress,
        toEmail: toAddress,
        subject: emailData.subject,
        messageId,
        size: emailSize,
        inboundSource: 'sendgrid',
      },
    });

    await queueEntry.save();
    console.log(
      `   ✅ SendGrid inbound queued: "${emailData.subject}" (Queue ID: ${queueEntry._id})`,
    );
  } catch (error: any) {
    console.error("❌ SendGrid inbound webhook error:", error.message);
    await logError({
      message: `SendGrid inbound webhook failed: ${error.message}`,
      context: ErrorContext.EMAIL_POLLING,
      severity: ErrorSeverity.HIGH,
      details: { errorStack: error.stack },
    });
  }
};
