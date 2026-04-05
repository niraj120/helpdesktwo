import Imap from "imap";
import { simpleParser, ParsedMail, Attachment } from "mailparser";
import * as cron from "node-cron";
import axios from "axios";
import ProjectEmailConfig from "../models/ProjectEmailConfig";
import EmailProcessingQueue from "../models/EmailProcessingQueue";
import { IEmailProcessingQueue } from "../models/EmailProcessingQueue";
import SystemSettings from "../models/SystemSettings";
import { EmailParser } from "../utils/emailParser"; // Task 8.3
import { validateEmail, shouldRejectEmail } from "../utils/emailValidator"; // Task 8.3
import { logError, ErrorContext, ErrorSeverity } from "../utils/errorLogger"; // Task 8.3

// Email polling configuration - with sensible defaults
// Can be overridden via environment variables or database settings
const DEFAULT_POLLING_INTERVAL =
  process.env.EMAIL_POLLING_INTERVAL || "*/30 * * * * *"; // Every 30 seconds for immediate ticket creation
const MAX_EMAILS_PER_FETCH = process.env.MAX_EMAILS_PER_FETCH
  ? parseInt(process.env.MAX_EMAILS_PER_FETCH, 10)
  : 50; // Default: 50 emails per config per cycle
const IMAP_CONNECTION_TIMEOUT = 30000; // 30 seconds

interface EmailData {
  messageId: string;
  from: { address: string; name?: string };
  to: Array<{ address: string; name?: string }>;
  subject: string;
  body: string;
  htmlBody?: string;
  bodyPreview?: string; // Plain-text preview from Graph API (used as description fallback)
  headers: any;
  inReplyTo?: string; // RFC 5322 In-Reply-To header (for thread detection)
  references?: string[]; // RFC 5322 References header (thread chain)
  conversationId?: string; // Exchange/Graph conversation thread ID
  attachments: Array<{
    filename: string;
    contentType: string;
    size: number;
    content: Buffer;
  }>;
  receivedDate: Date;
  uid: number;
  date: Date;
}

/**
 * Email Polling Service
 * Periodically checks enabled email configurations for new emails
 */
class EmailPollingService {
  private cronJob: cron.ScheduledTask | null = null;
  private isRunning: boolean = false;
  private currentInterval: string = DEFAULT_POLLING_INTERVAL;

  /**
   * Get the current polling interval from database or use default
   */
  private async getPollingInterval(): Promise<string> {
    try {
      const setting = await SystemSettings.findOne({
        key: "email_polling_interval",
      });
      if (setting && setting.value) {
        // Validate the cron expression
        if (cron.validate(setting.value)) {
          return setting.value;
        } else {
          console.warn(
            `⚠️  Invalid cron expression in database: ${setting.value}, using default`,
          );
        }
      }
    } catch (error) {
      console.error("Error fetching polling interval from database:", error);
    }
    return DEFAULT_POLLING_INTERVAL;
  }

  /**
   * Update the polling interval dynamically
   */
  public async updatePollingInterval(
    newInterval: string,
    updatedBy?: string,
  ): Promise<boolean> {
    try {
      // Validate the cron expression
      if (!cron.validate(newInterval)) {
        throw new Error("Invalid cron expression");
      }

      // Save to database
      await SystemSettings.findOneAndUpdate(
        { key: "email_polling_interval" },
        {
          value: newInterval,
          description: "Email polling interval (cron expression)",
          updatedBy: updatedBy,
        },
        { upsert: true, new: true },
      );

      this.currentInterval = newInterval;

      // Restart the cron job with new interval
      console.log(
        `🔄 Updating polling interval from ${this.currentInterval} to ${newInterval}`,
      );
      this.restart();

      return true;
    } catch (error: any) {
      console.error("❌ Error updating polling interval:", error);
      throw error;
    }
  }

  /**
   * Restart the email polling service
   */
  public async restart(): Promise<void> {
    console.log("🔄 Restarting Email Polling Service...");
    this.stop();
    await this.start();
  }

  /**
   * Start the email polling service
   */
  public async start(): Promise<void> {
    if (this.cronJob) {
      console.log("⚠️  Email polling service is already running");
      return;
    }

    // Get the current polling interval from database
    this.currentInterval = await this.getPollingInterval();

    console.log(`🚀 Starting Email Polling Service`);
    console.log(`   Interval: ${this.currentInterval}`);
    console.log(
      `   Max Emails Per Fetch: ${MAX_EMAILS_PER_FETCH} emails/config/cycle`,
    );
    console.log(`   IMAP Timeout: ${IMAP_CONNECTION_TIMEOUT / 1000}s`);

    // Schedule the cron job
    this.cronJob = cron.schedule(this.currentInterval, async () => {
      await this.pollEmails();
    });

    console.log("✅ Email Polling Service started successfully");

    // Run immediately on startup (optional, comment out if not desired)
    setTimeout(() => {
      this.pollEmails();
    }, 5000); // Wait 5 seconds after server start
  }

  /**
   * Stop the email polling service
   */
  public stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log("🛑 Email Polling Service stopped");
    }
  }

  /**
   * Main polling logic - fetches emails from all enabled configurations
   */
  private async pollEmails(): Promise<void> {
    // Prevent concurrent runs
    if (this.isRunning) {
      console.log("⏭️  Email polling already in progress, skipping this cycle");
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      console.log("\n" + "=".repeat(60));
      console.log(
        `📬 Email Polling Cycle Started - ${new Date().toISOString()}`,
      );
      console.log("=".repeat(60));

      // Fetch all enabled email configurations (IMAP + Graph API — SendGrid/Webhook come via inbound route)
      const enabledConfigs = await ProjectEmailConfig.find({
        isEnabled: true,
        isDeleted: { $ne: true },
        $or: [
          { inboundMethod: "imap" },
          { inboundMethod: "graph" },
          { inboundMethod: { $exists: false } },
        ],
      }).select(
        "projectId emailAddress imapHost imapPort imapUsername imapPassword inboundMethod lastCheckedAt oauth2",
      );

      if (enabledConfigs.length === 0) {
        console.log("ℹ️  No enabled email configurations found");
        return;
      }

      console.log(
        `📧 Found ${enabledConfigs.length} enabled email configuration(s)`,
      );

      let totalEmailsFetched = 0;
      let successfulConfigs = 0;
      let failedConfigs = 0;

      // Process each email configuration
      for (const config of enabledConfigs) {
        try {
          const isGraph = config.inboundMethod === "graph";
          console.log(
            `\n📥 Processing: ${config.emailAddress} ${
              isGraph
                ? "(Microsoft Graph API)"
                : `(${config.imapHost}:${config.imapPort})`
            }`,
          );

          const emailCount = isGraph
            ? await this.fetchEmailsViaGraph(config)
            : await this.fetchEmailsForConfig(config);
          totalEmailsFetched += emailCount;
          successfulConfigs++;

          console.log(`   ✅ Fetched ${emailCount} email(s)`);
        } catch (error: any) {
          failedConfigs++;
          console.error(`   ❌ Error: ${error.message}`);

          // Update last check status
          config.lastCheckStatus = "failed";
          config.lastCheckError = error.message;
          config.lastCheckedAt = new Date();
          await config.save();
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log("\n" + "=".repeat(60));
      console.log("📊 Polling Cycle Summary:");
      console.log(`   Total Configs: ${enabledConfigs.length}`);
      console.log(`   Successful: ${successfulConfigs}`);
      console.log(`   Failed: ${failedConfigs}`);
      console.log(`   Total Emails Fetched: ${totalEmailsFetched}`);
      console.log(`   Duration: ${duration}s`);
      console.log("=".repeat(60) + "\n");
    } catch (error: any) {
      console.error("❌ Email polling cycle failed:", error.message);
      console.error(error.stack);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Fetch emails via Microsoft Graph API (app-only / client-credentials flow).
   * Requires:  oauth2.clientId, oauth2.clientSecret (encrypted), oauth2.tenantId
   * Permission needed in Azure: Mail.ReadWrite (Application)
   */
  private async fetchEmailsViaGraph(config: any): Promise<number> {
    const clientId: string = config.oauth2?.clientId;
    const tenantId: string = config.oauth2?.tenantId;
    const emailAddress: string = config.emailAddress;

    if (!clientId || !tenantId) {
      throw new Error(
        "Microsoft Graph API requires oauth2.clientId and oauth2.tenantId to be set",
      );
    }

    // Decrypt client secret stored in the DB
    const clientSecret: string = config.getDecryptedOAuth2ClientSecret
      ? config.getDecryptedOAuth2ClientSecret()
      : config.oauth2?.clientSecret || "";

    if (!clientSecret) {
      throw new Error("Microsoft Graph API requires oauth2.clientSecret");
    }

    // 1. Obtain an access token via client_credentials grant
    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const tokenPayload = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
    });

    const tokenResponse = await axios.post(tokenUrl, tokenPayload.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 15000,
    });

    const accessToken: string = tokenResponse.data.access_token;
    if (!accessToken) {
      throw new Error("Graph API token request returned no access_token");
    }

    // 2. Fetch unread messages from the shared/service mailbox
    const graphBase = "https://graph.microsoft.com/v1.0";
    const mailboxUser = encodeURIComponent(emailAddress);
    const messagesUrl =
      `${graphBase}/users/${mailboxUser}/messages` +
      `?$filter=isRead eq false` +
      `&$select=id,subject,from,toRecipients,body,bodyPreview,receivedDateTime,internetMessageId,hasAttachments,internetMessageHeaders,conversationId` +
      `&$top=${MAX_EMAILS_PER_FETCH}`;

    const messagesResponse = await axios.get(messagesUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 30000,
    });

    const messages: any[] = messagesResponse.data.value || [];
    let emailCount = 0;

    for (const msg of messages) {
      try {
        const isHtml = (msg.body?.contentType || "").toLowerCase() === "html";
        const bodyContent: string = msg.body?.content || "";

        // Extract RFC 5322 threading headers from Graph internetMessageHeaders
        const graphHeaders: Array<{ name: string; value: string }> =
          msg.internetMessageHeaders || [];
        const getGraphHeader = (name: string) =>
          graphHeaders.find((h) => h.name.toLowerCase() === name.toLowerCase())
            ?.value;
        const rawInReplyTo = getGraphHeader("in-reply-to");
        const rawReferences = getGraphHeader("references");
        const inReplyTo =
          rawInReplyTo?.replace(/^<|>$/g, "").trim() || undefined;
        const references = rawReferences
          ? rawReferences
              .split(/\s+/)
              .map((r) => r.replace(/^<|>$/g, "").trim())
              .filter(Boolean)
          : undefined;

        // Fetch actual attachment content from Graph API when the message has attachments
        const graphAttachments: any[] = [];
        if (msg.hasAttachments) {
          try {
            const attResponse = await axios.get(
              `${graphBase}/users/${mailboxUser}/messages/${msg.id}/attachments`,
              {
                headers: { Authorization: `Bearer ${accessToken}` },
                timeout: 30000,
              },
            );
            const rawAtts: any[] = attResponse.data.value || [];
            for (const att of rawAtts) {
              // Skip inline images (embedded in HTML body via cid:)
              if (att.contentId && att.isInline) continue;
              // Only handle file attachments (not item/reference attachments)
              if (att["@odata.type"] !== "#microsoft.graph.fileAttachment")
                continue;
              const contentBuffer = att.contentBytes
                ? Buffer.from(att.contentBytes, "base64")
                : Buffer.alloc(0);
              graphAttachments.push({
                filename: att.name || "attachment",
                contentType: att.contentType || "application/octet-stream",
                size: att.size || contentBuffer.length,
                content: contentBuffer,
                contentId: att.contentId || undefined,
                contentDisposition: att.isInline ? "inline" : "attachment",
              });
            }
            console.log(
              `   📎 Fetched ${graphAttachments.length} attachment(s) for message ${msg.id}`,
            );
          } catch (attErr: any) {
            console.error(
              `   ⚠️  Failed to fetch attachments for message ${msg.id}: ${attErr.message}`,
            );
          }
        }

        const emailData: EmailData = {
          messageId: msg.internetMessageId || msg.id,
          from: {
            address: msg.from?.emailAddress?.address || "",
            name: msg.from?.emailAddress?.name,
          },
          to: (msg.toRecipients || []).map((r: any) => ({
            address: r.emailAddress?.address || "",
            name: r.emailAddress?.name,
          })),
          subject: msg.subject || "(No Subject)",
          body: isHtml ? "" : bodyContent,
          htmlBody: isHtml ? bodyContent : undefined,
          bodyPreview: msg.bodyPreview || undefined,
          headers: {},
          inReplyTo,
          references,
          conversationId: msg.conversationId || undefined,
          attachments: graphAttachments,
          receivedDate: new Date(msg.receivedDateTime),
          uid: 0,
          date: new Date(msg.receivedDateTime),
        };

        await this.addToQueue(config, emailData);
        emailCount++;

        // Mark message as read so it won't be picked up again next cycle
        await axios.patch(
          `${graphBase}/users/${mailboxUser}/messages/${msg.id}`,
          { isRead: true },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            timeout: 10000,
          },
        );
      } catch (msgErr: any) {
        console.error(
          `   ❌ Failed to process Graph message ${msg.id}: ${msgErr.message}`,
        );
      }
    }

    // Persist last-check info
    config.lastCheckedAt = new Date();
    config.lastCheckStatus = "success";
    config.lastCheckError = undefined;
    await config.save();

    return emailCount;
  }

  /**
   * Fetch emails for a specific email configuration
   */
  private async fetchEmailsForConfig(config: any): Promise<number> {
    return new Promise(async (resolve, reject) => {
      let emailCount = 0;

      try {
        // Decrypt password
        const password = config.getDecryptedImapPassword();

        // Create IMAP connection
        const imap = new Imap({
          user: config.imapUsername,
          password: password,
          host: config.imapHost,
          port: config.imapPort,
          tls: true,
          tlsOptions: { rejectUnauthorized: false },
          connTimeout: IMAP_CONNECTION_TIMEOUT,
          authTimeout: 15000,
        });

        // Connection timeout handler
        const connectionTimeout = setTimeout(() => {
          imap.end();
          reject(new Error("IMAP connection timeout"));
        }, IMAP_CONNECTION_TIMEOUT);

        // Error handler
        imap.once("error", (err: Error) => {
          clearTimeout(connectionTimeout);
          console.error(`   IMAP Error: ${err.message}`);
          reject(err);
        });

        // End handler
        imap.once("end", () => {
          clearTimeout(connectionTimeout);
          console.log(`   📤 IMAP connection closed`);
        });

        // Ready handler - connection established
        imap.once("ready", () => {
          clearTimeout(connectionTimeout);
          console.log(`   🔌 IMAP connected successfully`);

          // Open INBOX
          imap.openBox("INBOX", false, async (err, box) => {
            if (err) {
              imap.end();
              return reject(new Error(`Failed to open INBOX: ${err.message}`));
            }

            console.log(
              `   📬 INBOX opened (${box.messages.total} total messages)`,
            );

            // Search for unread emails
            imap.search(["UNSEEN"], async (err, results) => {
              if (err) {
                imap.end();
                return reject(new Error(`Search failed: ${err.message}`));
              }

              if (!results || results.length === 0) {
                console.log(`   ℹ️  No unread emails found`);
                imap.end();

                // Update last checked time
                config.lastCheckedAt = new Date();
                config.lastCheckStatus = "success";
                config.lastCheckError = undefined;
                await config.save();

                return resolve(0);
              }

              console.log(`   📩 Found ${results.length} unread email(s)`);

              // Limit emails to fetch
              const emailsToFetch = results.slice(0, MAX_EMAILS_PER_FETCH);
              if (results.length > MAX_EMAILS_PER_FETCH) {
                console.log(
                  `   ⚠️  Limiting to ${MAX_EMAILS_PER_FETCH} emails (${results.length - MAX_EMAILS_PER_FETCH} will be processed in next cycle)`,
                );
              }

              const fetchedEmails: EmailData[] = [];
              let messagesProcessed = 0;
              const totalMessages = emailsToFetch.length;

              // Fetch email details
              const fetch = imap.fetch(emailsToFetch, {
                bodies: "", // Fetch entire email
                markSeen: false, // Don't mark as seen yet (we'll do it after queuing)
              });

              fetch.on("message", (msg, seqno) => {
                console.log(`   📄 Fetching email #${seqno}`);

                const chunks: Buffer[] = [];
                let totalSize = 0;
                const MAX_EMAIL_SIZE = 50 * 1024 * 1024; // 50MB limit
                let uid: number = 0;
                let sizeExceeded = false;

                msg.on("body", (stream: any) => {
                  stream.on("data", (chunk: Buffer) => {
                    // Check if adding this chunk would exceed the limit
                    if (totalSize + chunk.length > MAX_EMAIL_SIZE) {
                      sizeExceeded = true;
                      // Stop reading the stream
                      if (stream.destroy) {
                        stream.destroy();
                      } else if (stream.pause) {
                        stream.pause();
                      }
                      return;
                    }
                    chunks.push(chunk);
                    totalSize += chunk.length;
                  });
                });

                msg.once("attributes", (attrs) => {
                  uid = attrs.uid;
                });

                msg.once("end", async () => {
                  try {
                    // Check if email size was exceeded
                    if (sizeExceeded) {
                      console.error(
                        `   ❌ Email #${seqno} exceeds size limit (${MAX_EMAIL_SIZE / 1024 / 1024}MB)`,
                      );

                      await logError({
                        message: `Email exceeds size limit: ${MAX_EMAIL_SIZE / 1024 / 1024}MB`,
                        context: ErrorContext.EMAIL_PARSING,
                        severity: ErrorSeverity.MEDIUM,
                        details: {
                          seqno,
                          uid,
                          partialSize: totalSize,
                          limit: MAX_EMAIL_SIZE,
                        },
                      });
                      return; // Skip this email
                    }

                    // Combine chunks into single buffer
                    const buffer = Buffer.concat(chunks, totalSize);

                    // Task 8.3: Parse email with validation and error handling
                    console.log(`   📧 Parsing email #${seqno}...`);

                    const parsed: ParsedMail = await simpleParser(buffer);

                    // Task 8.3: Build email data with safe extraction
                    const emailData: EmailData = {
                      messageId:
                        parsed.messageId ||
                        `${Date.now()}-${uid}@helpdesk.local`,
                      from: this.extractEmailAddressObject(parsed.from),
                      to: parsed.to
                        ? this.extractEmailAddressArray(parsed.to)
                        : [{ address: "support@helpdesk.local" }],
                      subject:
                        parsed.subject && parsed.subject.trim()
                          ? parsed.subject.trim()
                          : "(No Subject)",
                      body:
                        parsed.text && parsed.text.trim()
                          ? parsed.text.trim()
                          : "(Empty message)",
                      htmlBody: parsed.html || undefined,
                      headers: parsed.headers,
                      attachments: this.extractAttachments(parsed.attachments),
                      receivedDate:
                        parsed.date instanceof Date &&
                        !isNaN(parsed.date.getTime())
                          ? parsed.date
                          : new Date(),
                      uid: uid,
                      date:
                        parsed.date instanceof Date &&
                        !isNaN(parsed.date.getTime())
                          ? parsed.date
                          : new Date(),
                    };

                    // ── Forwarded mailbox mode ─────────────────────────────
                    // When the config is flagged as a forwarded mailbox, the
                    // IMAP inbox is just a relay (e.g. Gmail forwarding from
                    // hubblestar.support@hubblehox.com).  We need to:
                    //  1. Use the *original* Message-ID for dedup + threading
                    //     so replies correlate with what the customer sent.
                    //  2. Set `to` to the *original* public address so the
                    //     ticket / outgoing email shows the right address.
                    if (config.isForwardedMailbox) {
                      const headers = parsed.headers;

                      // Extract original Message-ID from forwarding headers
                      // Gmail uses X-Forwarded-Message-Id; other forwarders
                      // may use X-Original-Message-Id or simply repeat it in
                      // the Resent-Message-ID header.
                      const originalMsgId =
                        (headers?.get("x-forwarded-message-id") as string) ||
                        (headers?.get("x-original-message-id") as string) ||
                        (headers?.get("resent-message-id") as string) ||
                        null;
                      if (originalMsgId) {
                        emailData.messageId = originalMsgId
                          .trim()
                          .replace(/^<|>$/g, "");
                        console.log(
                          `   🔄 Forwarded mail - using original Message-ID: ${emailData.messageId}`,
                        );
                      }

                      // Set `to` to the configured original address so the
                      // ticket shows hubblestar.support@hubblehox.com, not Gmail.
                      if (config.originalEmailAddress) {
                        emailData.to = [
                          { address: config.originalEmailAddress },
                        ];
                        console.log(
                          `   🔄 Forwarded mail - overriding To: ${config.originalEmailAddress}`,
                        );
                      }
                    }
                    // ─────────────────────────────────────────────────────

                    // Task 8.3: Log warnings for unusual emails
                    const warnings: string[] = [];

                    if (
                      !parsed.from ||
                      !parsed.from.value ||
                      parsed.from.value.length === 0
                    ) {
                      warnings.push("Missing FROM address");
                    }
                    if (!parsed.subject || parsed.subject.trim() === "") {
                      warnings.push("Missing subject");
                    }
                    if (!parsed.text && !parsed.html) {
                      warnings.push("Missing body content");
                    }
                    if (!parsed.messageId) {
                      warnings.push("Missing Message-ID (generated)");
                    }

                    if (warnings.length > 0) {
                      console.warn(
                        `   ⚠️  Email has issues: ${warnings.join(", ")}`,
                      );

                      // Log warning for unusual email
                      await logError({
                        message: `Malformed email detected: ${warnings.join("; ")}`,
                        context: ErrorContext.EMAIL_POLLING,
                        severity: ErrorSeverity.LOW,
                        details: {
                          messageId: emailData.messageId,
                          from: emailData.from,
                          subject: emailData.subject,
                          warnings,
                          seqno,
                          uid,
                        },
                      });
                    }

                    fetchedEmails.push(emailData);
                    console.log(
                      `   ✅ Parsed: "${emailData.subject}" from ${emailData.from.address}`,
                    );
                    messagesProcessed++;
                  } catch (parseError: any) {
                    console.error(
                      `   ❌ Parse error for email #${seqno}:`,
                      parseError.message,
                    );
                    messagesProcessed++;

                    // Task 8.3: Log parse error but don't crash
                    await logError({
                      message: `Email parsing failed: ${parseError.message}`,
                      context: ErrorContext.EMAIL_PARSING,
                      severity: ErrorSeverity.MEDIUM,
                      details: {
                        errorMessage: parseError.message,
                        errorStack: parseError.stack,
                        seqno,
                        uid,
                      },
                    });

                    // Task 8.3: Don't crash - continue processing other emails
                  }
                });
              });

              fetch.once("error", (fetchErr) => {
                console.error(`   ❌ Fetch error:`, fetchErr.message);
                imap.end();
                reject(fetchErr);
              });

              fetch.once("end", async () => {
                console.log(
                  `   📦 Fetch completed, waiting for message processing...`,
                );

                // Wait for all messages to be processed
                const checkInterval = setInterval(async () => {
                  if (messagesProcessed >= totalMessages) {
                    clearInterval(checkInterval);
                    console.log(
                      `   ✅ All ${totalMessages} messages processed, ${fetchedEmails.length} successfully parsed`,
                    );

                    try {
                      // Add emails to processing queue
                      for (const emailData of fetchedEmails) {
                        await this.addToQueue(config, emailData);
                        emailCount++;
                      }

                      // Mark emails as seen/read
                      if (fetchedEmails.length > 0) {
                        const uids = fetchedEmails.map((e) => e.uid);
                        imap.setFlags(uids, ["\\Seen"], (flagErr) => {
                          if (flagErr) {
                            console.error(
                              `   ⚠️  Failed to mark emails as read:`,
                              flagErr.message,
                            );
                          } else {
                            console.log(
                              `   ✓ Marked ${uids.length} email(s) as read`,
                            );
                          }

                          // Close connection
                          imap.end();
                        });
                      } else {
                        imap.end();
                      }

                      // Update last checked status
                      config.lastCheckedAt = new Date();
                      config.lastCheckStatus = "success";
                      config.lastCheckError = undefined;
                      await config.save();

                      resolve(emailCount);
                    } catch (queueError: any) {
                      console.error(`   ❌ Queue error:`, queueError.message);
                      imap.end();
                      reject(queueError);
                    }
                  }
                }, 100); // Check every 100ms

                // Timeout after 30 seconds
                setTimeout(() => {
                  clearInterval(checkInterval);
                  if (messagesProcessed < totalMessages) {
                    console.error(
                      `   ❌ Timeout waiting for messages: ${messagesProcessed}/${totalMessages} processed`,
                    );
                    imap.end();
                    reject(new Error("Timeout waiting for message processing"));
                  }
                }, 30000);
              });
            });
          });
        });

        // Connect to IMAP
        imap.connect();
      } catch (error: any) {
        console.error(`   ❌ Connection setup error:`, error.message);
        reject(error);
      }
    });
  }

  /**
   * Add email to processing queue
   */
  private async addToQueue(config: any, emailData: EmailData): Promise<void> {
    try {
      // Check if email already exists in queue (prevent duplicates)
      const existing = await EmailProcessingQueue.findOne({
        "metadata.messageId": emailData.messageId,
        projectEmailConfigId: config._id,
      });

      if (existing) {
        console.log(
          `   ⏭️  Email already in queue (Message-ID: ${emailData.messageId})`,
        );
        return;
      }

      // Convert to JSON and check size
      const emailJson = JSON.stringify(emailData);
      const emailSize = Buffer.byteLength(emailJson);
      const MAX_DOCUMENT_SIZE = 15 * 1024 * 1024; // 15MB (MongoDB limit is 16MB, leaving 1MB buffer)

      // Skip if email is too large for MongoDB
      if (emailSize > MAX_DOCUMENT_SIZE) {
        console.error(
          `   ❌ Email too large for storage: ${(emailSize / 1024 / 1024).toFixed(2)}MB (limit: ${MAX_DOCUMENT_SIZE / 1024 / 1024}MB)`,
        );
        console.error(`      Subject: ${emailData.subject}`);
        console.error(`      From: ${emailData.from.address}`);

        // Log oversized email error
        await logError({
          message: `Email too large to store: ${(emailSize / 1024 / 1024).toFixed(2)}MB`,
          context: ErrorContext.EMAIL_PARSING,
          severity: ErrorSeverity.MEDIUM,
          details: {
            messageId: emailData.messageId,
            subject: emailData.subject,
            from: emailData.from.address,
            size: emailSize,
            limit: MAX_DOCUMENT_SIZE,
          },
        });

        return; // Skip this email
      }

      // Create queue entry
      const queueEntry = new EmailProcessingQueue({
        projectEmailConfigId: config._id,
        rawEmail: emailJson,
        status: "pending",
        retryCount: 0,
        metadata: {
          fromEmail: emailData.from.address,
          toEmail: emailData.to.map((t) => t.address).join(", "),
          subject: emailData.subject,
          messageId: emailData.messageId,
          size: emailSize,
          inboundSource: config.inboundMethod || 'imap',
        },
      });

      await queueEntry.save();
      console.log(
        `   ➕ Added to queue: ${emailData.subject} (Queue ID: ${queueEntry._id})`,
      );
    } catch (error: any) {
      console.error(`   ❌ Failed to add to queue:`, error.message);
      throw error;
    }
  }

  /**
   * Extract email address from parsed email object as EmailAddress object
   */
  private extractEmailAddressObject(addressObj: any): {
    address: string;
    name?: string;
  } {
    if (!addressObj) {
      return { address: "unknown@invalid.local", name: "Unknown Sender" };
    }

    if (typeof addressObj === "string") {
      return { address: addressObj };
    }

    if (Array.isArray(addressObj.value) && addressObj.value.length > 0) {
      const first = addressObj.value[0];
      return {
        address: first.address || "unknown@invalid.local",
        name: first.name,
      };
    }

    if (addressObj.address) {
      return {
        address: addressObj.address,
        name: addressObj.name,
      };
    }

    return { address: "unknown@invalid.local", name: "Unknown Sender" };
  }

  /**
   * Extract email address array from parsed email object
   */
  private extractEmailAddressArray(
    addressObj: any,
  ): Array<{ address: string; name?: string }> {
    if (!addressObj) return [];

    if (typeof addressObj === "string") {
      return [{ address: addressObj }];
    }

    if (Array.isArray(addressObj.value)) {
      return addressObj.value.map((addr: any) => ({
        address: addr.address || "unknown@invalid.local",
        name: addr.name,
      }));
    }

    if (addressObj.address) {
      return [
        {
          address: addressObj.address,
          name: addressObj.name,
        },
      ];
    }

    return [];
  }

  /**
   * Extract email address from parsed email object (legacy string version)
   */
  private extractEmailAddress(addressObj: any): string {
    const emailObj = this.extractEmailAddressObject(addressObj);
    return emailObj.address;
  }

  /**
   * Extract attachments from parsed email
   */
  private extractAttachments(attachments: Attachment[] | undefined): Array<{
    filename: string;
    contentType: string;
    size: number;
    content: Buffer;
  }> {
    if (!attachments || attachments.length === 0) return [];

    return attachments.map((att) => ({
      filename: att.filename || "unknown",
      contentType: att.contentType || "application/octet-stream",
      size: att.size || 0,
      content: att.content,
    }));
  }

  /**
   * Get service status
   */
  public getStatus(): {
    isRunning: boolean;
    isActive: boolean;
    interval: string;
    maxEmailsPerFetch: number;
  } {
    return {
      isRunning: this.isRunning,
      isActive: this.cronJob !== null,
      interval: this.currentInterval,
      maxEmailsPerFetch: MAX_EMAILS_PER_FETCH,
    };
  }
}

// Export singleton instance
export const emailPollingService = new EmailPollingService();
