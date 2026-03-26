import mongoose from "mongoose";
import TicketEmailCommunication from "../models/TicketEmailCommunication";
import { ParsedEmailData } from "./emailParser";

/**
 * Email Communication Logger Utility
 * Logs email communications (incoming/outgoing) for ticket threading
 */

export interface EmailCommunicationData {
  // Basic email data
  from: {
    address: string;
    name?: string;
  };
  to: Array<{
    address: string;
    name?: string;
  }>;
  cc?: Array<{
    address: string;
    name?: string;
  }>;
  bcc?: Array<{
    address: string;
    name?: string;
  }>;
  subject: string;
  body?: string;
  htmlBody?: string;

  // Threading headers
  messageId: string;
  inReplyTo?: string;
  references?: string[];
  conversationId?: string; // Exchange/Graph conversation thread ID

  // Metadata
  date?: Date;
  rawHeaders?: any;
  attachments?: Array<{
    filename: string;
    originalName: string;
    mimetype: string;
    size: number;
    path?: string;
  }>;
}

/**
 * Log email communication for a ticket
 * Records incoming or outgoing email in the communications table
 *
 * @param ticketId - Ticket ObjectId or string
 * @param emailData - Email data (from ParsedEmailData or manual)
 * @param direction - 'incoming' or 'outgoing'
 * @returns Saved TicketEmailCommunication document
 */
export async function logEmailCommunication(
  ticketId: string | mongoose.Types.ObjectId,
  emailData: EmailCommunicationData,
  direction: "incoming" | "outgoing",
): Promise<any> {
  try {
    console.log(
      `   📝 Logging ${direction} email communication for ticket: ${ticketId}`,
    );

    // Validate required fields
    if (!emailData.from?.address) {
      throw new Error("Email from address is required");
    }
    if (!emailData.to || emailData.to.length === 0) {
      throw new Error("Email to address is required");
    }
    if (!emailData.messageId) {
      throw new Error("Email messageId is required");
    }

    // Convert references array to string (space-separated)
    const referencesString =
      emailData.references && emailData.references.length > 0
        ? emailData.references.join(" ")
        : undefined;

    // Normalise Message-IDs: strip surrounding angle brackets so lookups
    // (which extract IDs from RFC headers without brackets) always match.
    const normaliseId = (id: string | undefined) =>
      id ? id.replace(/^<|>$/g, "").trim() : id;

    // Prepare raw headers JSON
    const rawEmailHeaders = emailData.rawHeaders
      ? JSON.stringify(emailData.rawHeaders)
      : undefined;

    // Plain-text body: use provided body, fall back to HTML-stripped content,
    // fall back to empty string.  This prevents Mongoose validation errors for
    // HTML-only emails where parsedEmail.body is always "".
    const plainBody =
      emailData.body ||
      (emailData.htmlBody
        ? emailData.htmlBody
            .replace(/<[^>]*>/g, " ")
            .replace(/&nbsp;/gi, " ")
            .replace(/\s+/g, " ")
            .trim()
            .substring(0, 5000)
        : "");

    // Create communication record (supports both old and new field formats)
    const emailComm = new TicketEmailCommunication({
      ticketId:
        typeof ticketId === "string"
          ? new mongoose.Types.ObjectId(ticketId)
          : ticketId,
      direction,
      // Support both old and new field formats
      from: emailData.from.address.toLowerCase(),
      fromEmail: emailData.from.address.toLowerCase(),
      to: emailData.to.map((t) => t.address.toLowerCase()),
      toEmail: emailData.to[0].address.toLowerCase(), // Primary recipient
      cc: emailData.cc?.map((c) => c.address.toLowerCase()) || [],
      ccEmails: emailData.cc?.map((c) => c.address.toLowerCase()) || [],
      bccEmails: emailData.bcc?.map((b) => b.address.toLowerCase()) || [],
      subject: emailData.subject || "(No Subject)",
      body: plainBody,
      htmlBody: emailData.htmlBody,
      bodyHtml: emailData.htmlBody, // Support both field names
      messageId: normaliseId(emailData.messageId)!,
      inReplyTo: normaliseId(emailData.inReplyTo),
      references: referencesString,
      conversationId: emailData.conversationId || undefined,
      rawEmailHeaders,
      attachments: emailData.attachments || [],
      isProcessed: true,
      sentAt: emailData.date || new Date(),
      receivedAt: new Date(),
      status: direction === "incoming" ? "received" : "sent",
    });

    await emailComm.save();

    console.log(
      `   ✅ Email communication logged (ID: ${emailComm._id}, Message-ID: ${emailComm.messageId})`,
    );

    return emailComm;
  } catch (error: any) {
    // Check if duplicate messageId error
    if (error.code === 11000 && error.keyPattern?.messageId) {
      console.log(
        `   ⚠️ Email already logged (duplicate Message-ID: ${emailData.messageId})`,
      );

      // Return existing record
      const existingComm = await TicketEmailCommunication.findOne({
        messageId: emailData.messageId,
      });

      if (existingComm) {
        return existingComm;
      }
    }

    console.error(`   ❌ Error logging email communication: ${error.message}`);
    throw error;
  }
}

/**
 * Log email communication from ParsedEmailData (convenience wrapper)
 * Used for incoming emails from email polling service
 *
 * @param ticketId - Ticket ObjectId or string
 * @param parsedEmail - Parsed email data from emailParser
 * @returns Saved TicketEmailCommunication document
 */
export async function logIncomingEmail(
  ticketId: string | mongoose.Types.ObjectId,
  parsedEmail: ParsedEmailData,
): Promise<any> {
  const emailData: EmailCommunicationData = {
    from: parsedEmail.from,
    to: parsedEmail.to,
    cc: parsedEmail.cc,
    subject: parsedEmail.subject,
    body: parsedEmail.body,
    htmlBody: parsedEmail.htmlBody,
    messageId: parsedEmail.messageId,
    inReplyTo: parsedEmail.inReplyTo,
    references: parsedEmail.references,
    conversationId: parsedEmail.conversationId,
    date: parsedEmail.date,
    rawHeaders: parsedEmail.headers,
    attachments: parsedEmail.attachments.map((att) => ({
      filename: att.filename,
      originalName: att.filename,
      mimetype: att.contentType,
      size: att.size,
    })),
  };

  return logEmailCommunication(ticketId, emailData, "incoming");
}

/**
 * Log outgoing email communication
 * Used when agent replies to ticket via email
 *
 * @param ticketId - Ticket ObjectId or string
 * @param emailData - Outgoing email data
 * @returns Saved TicketEmailCommunication document
 */
export async function logOutgoingEmail(
  ticketId: string | mongoose.Types.ObjectId,
  emailData: EmailCommunicationData,
): Promise<any> {
  return logEmailCommunication(ticketId, emailData, "outgoing");
}

/**
 * Get all email communications for a ticket
 * Returns communications sorted by date (oldest first)
 *
 * @param ticketId - Ticket ObjectId or string
 * @returns Array of TicketEmailCommunication documents
 */
export async function getTicketEmailCommunications(
  ticketId: string | mongoose.Types.ObjectId,
): Promise<any[]> {
  try {
    const communications = await TicketEmailCommunication.find({
      ticketId:
        typeof ticketId === "string"
          ? new mongoose.Types.ObjectId(ticketId)
          : ticketId,
    }).sort({ sentAt: 1 }); // Oldest first

    console.log(
      `   📧 Found ${communications.length} email communications for ticket: ${ticketId}`,
    );

    return communications;
  } catch (error: any) {
    console.error(
      `   ❌ Error retrieving email communications: ${error.message}`,
    );
    throw error;
  }
}

/**
 * Get email communication by Message-ID
 * Used for thread detection and duplicate prevention
 *
 * @param messageId - Email Message-ID header
 * @returns TicketEmailCommunication document or null
 */
export async function getEmailCommunicationByMessageId(
  messageId: string,
): Promise<any | null> {
  try {
    const communication = await TicketEmailCommunication.findOne({ messageId });

    if (communication) {
      console.log(
        `   ✓ Found email communication for Message-ID: ${messageId}`,
      );
    } else {
      console.log(
        `   ℹ️ No email communication found for Message-ID: ${messageId}`,
      );
    }

    return communication;
  } catch (error: any) {
    console.error(
      `   ❌ Error retrieving email by Message-ID: ${error.message}`,
    );
    throw error;
  }
}

export default logEmailCommunication;
