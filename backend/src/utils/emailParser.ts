import {
  simpleParser,
  ParsedMail,
  AddressObject,
  Attachment,
} from "mailparser";
import * as iconv from "iconv-lite";
import {
  validateEmail,
  handleEncodingIssues,
  EmailValidationOptions,
} from "./emailValidator"; // Task 8.3
import { logError, ErrorContext, ErrorSeverity } from "./errorLogger"; // Task 8.3

/**
 * Parsed Email Data Structure
 */
export interface ParsedEmailData {
  // Core email information
  messageId: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  body: string; // Plain text body
  htmlBody?: string; // HTML body
  bodyPreview?: string; // Short plain-text preview (from Graph API)

  // Email metadata
  date: Date;
  headers: EmailHeaders;

  // Attachments
  attachments: EmailAttachment[];

  // Threading information
  inReplyTo?: string; // Message-ID of email being replied to
  references?: string[]; // Array of Message-IDs in thread
  conversationId?: string; // Exchange/Graph conversation thread ID (same for all emails in a thread)

  // Additional metadata
  priority?: "high" | "normal" | "low";
  isAutoReply?: boolean;

  // Raw data for debugging
  rawHeaders?: any;
}

/**
 * Email Address Structure
 */
export interface EmailAddress {
  name?: string; // Display name (e.g., "John Doe")
  address: string; // Email address (e.g., "john@example.com")
}

/**
 * Email Headers
 */
export interface EmailHeaders {
  from: string;
  to?: string;
  cc?: string;
  bcc?: string;
  subject: string;
  date?: string;
  messageId: string;
  inReplyTo?: string;
  references?: string;
  returnPath?: string;
  contentType?: string;
  mimeVersion?: string;
  [key: string]: any; // Allow any additional headers
}

/**
 * Email Attachment
 */
export interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  content: Buffer;
  contentId?: string; // For inline images
  contentDisposition?: string;
}

/**
 * Email Parser Utility
 * Handles parsing of raw email data with comprehensive error handling (Task 8.3)
 */
export class EmailParser {
  /**
   * Parse raw email buffer or string with validation (Task 8.3)
   * @param rawEmail - Raw email data (Buffer or string)
   * @param encoding - Character encoding (default: 'utf-8')
   * @param validationOptions - Validation options
   * @returns Parsed email data (sanitized)
   */
  public static async parse(
    rawEmail: Buffer | string,
    encoding: string = "utf-8",
    validationOptions?: EmailValidationOptions,
  ): Promise<ParsedEmailData> {
    try {
      console.log("📧 Parsing email...");

      // Task 8.3: Handle encoding issues gracefully
      let emailBuffer: Buffer;
      let encodingWarning: string | undefined;

      if (typeof rawEmail === "string") {
        emailBuffer = Buffer.from(rawEmail, encoding as BufferEncoding);
      } else {
        emailBuffer = rawEmail;

        // Check for encoding issues
        const encodingResult = await handleEncodingIssues(
          emailBuffer,
          encoding,
        );
        if (encodingResult.warning) {
          encodingWarning = encodingResult.warning;
          console.warn(`⚠️  ${encodingWarning}`);
        }
      }

      // Parse email using mailparser (wrapped in try-catch for safety)
      let parsed: ParsedMail;
      try {
        parsed = await simpleParser(emailBuffer);
      } catch (parseError: any) {
        console.error("❌ Mailparser failed:", parseError.message);

        // Task 8.3: Log parsing error but try to continue
        await logError({
          message: `Email parsing error: ${parseError.message}`,
          context: ErrorContext.EMAIL_PARSING,
          severity: ErrorSeverity.MEDIUM,
          details: {
            errorType: "mailparser_failure",
            encoding,
            bufferSize: emailBuffer.length,
          },
        });

        // Return minimal valid structure to prevent complete failure
        throw new Error(`Mailparser failed: ${parseError.message}`);
      }

      // Extract and structure data with safe extraction methods
      const parsedData: ParsedEmailData = {
        messageId: this.extractMessageId(parsed),
        from: this.extractFrom(parsed),
        to: this.extractTo(parsed),
        cc: this.extractCc(parsed),
        bcc: this.extractBcc(parsed),
        subject: this.extractSubject(parsed),
        body: this.extractPlainTextBody(parsed),
        htmlBody: this.extractHtmlBody(parsed),
        date: this.extractDate(parsed),
        headers: this.extractHeaders(parsed),
        attachments: this.extractAttachments(parsed),
        inReplyTo: this.extractInReplyTo(parsed),
        references: this.extractReferences(parsed),
        priority: this.extractPriority(parsed),
        isAutoReply: this.detectAutoReply(parsed),
        rawHeaders: parsed.headers,
      };

      // Task 8.3: Validate and sanitize parsed data
      console.log("🔍 Validating email structure...");
      const validationResult = await validateEmail(
        parsedData,
        validationOptions,
      );

      if (validationResult.warnings.length > 0) {
        console.warn(
          `⚠️  Email validation warnings (${validationResult.warnings.length}):`,
        );
        validationResult.warnings.forEach((w) => console.warn(`   - ${w}`));
      }

      if (validationResult.errors.length > 0) {
        console.error(
          `❌ Email validation errors (${validationResult.errors.length}):`,
        );
        validationResult.errors.forEach((e) => console.error(`   - ${e}`));
      }

      // Return sanitized data even if warnings exist
      const finalData = validationResult.sanitizedData || parsedData;

      console.log(
        `✅ Email parsed successfully: "${finalData.subject}" from ${finalData.from.address}`,
      );

      return finalData;
    } catch (error: any) {
      console.error("❌ Email parsing failed:", error.message);

      // Task 8.3: Log critical parsing error
      await logError({
        message: `Critical email parsing failure: ${error.message}`,
        context: ErrorContext.EMAIL_PARSING,
        severity: ErrorSeverity.HIGH,
        details: {
          errorType: "parse_exception",
          errorMessage: error.message,
          errorStack: error.stack,
          encoding,
        },
      });

      throw new Error(`Email parsing failed: ${error.message}`);
    }
  }

  /**
   * Extract Message-ID (critical for threading) - Task 8.3: Enhanced with fallback
   */
  private static extractMessageId(parsed: ParsedMail): string {
    try {
      if (parsed.messageId) {
        // Remove angle brackets if present
        const cleaned = parsed.messageId.replace(/^<|>$/g, "").trim();
        if (cleaned) return cleaned;
      }

      // Fallback: Generate Message-ID from date and hash
      const timestamp = parsed.date?.getTime() || Date.now();
      const hash = this.generateHash(
        parsed.text || parsed.html || String(timestamp),
      );
      const generated = `generated-${timestamp}-${hash}@helpdesk.local`;
      console.warn(`⚠️  Missing Message-ID, generated: ${generated}`);
      return generated;
    } catch (error) {
      // Ultimate fallback
      const fallback = `fallback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}@helpdesk.local`;
      console.error(`❌ Error extracting Message-ID, using: ${fallback}`);
      return fallback;
    }
  }

  /**
   * Extract From address - Task 8.3: Enhanced with validation
   */
  private static extractFrom(parsed: ParsedMail): EmailAddress {
    try {
      const from = parsed.from?.value?.[0];
      if (from && from.address) {
        return {
          name: from.name || undefined,
          address: from.address?.toLowerCase() || "",
        };
      }

      // Task 8.3: Fallback for malformed emails - use unknown sender
      console.warn("⚠️  Missing FROM address, using fallback");
      return {
        name: "Unknown Sender",
        address: "unknown@invalid.local",
      };
    } catch (error) {
      console.error("❌ Error extracting FROM address:", error);
      return {
        name: "Unknown Sender",
        address: "unknown@invalid.local",
      };
    }
  }

  /**
   * Extract To addresses - Task 8.3: Enhanced with error handling
   */
  private static extractTo(parsed: ParsedMail): EmailAddress[] {
    try {
      if (!parsed.to) {
        console.warn("⚠️  Missing TO addresses, using fallback");
        return [{ address: "support@helpdesk.local", name: "Support" }];
      }

      // Handle both single AddressObject and array
      const toAddresses = Array.isArray(parsed.to) ? parsed.to[0] : parsed.to;
      const addresses = this.parseAddresses(toAddresses);

      if (addresses.length === 0) {
        console.warn("⚠️  No valid TO addresses, using fallback");
        return [{ address: "support@helpdesk.local", name: "Support" }];
      }

      return addresses;
    } catch (error) {
      console.error("❌ Error extracting TO addresses:", error);
      return [{ address: "support@helpdesk.local", name: "Support" }];
    }
  }

  /**
   * Extract CC addresses - Task 8.3: Enhanced with error handling
   */
  private static extractCc(parsed: ParsedMail): EmailAddress[] | undefined {
    try {
      if (!parsed.cc) return undefined;
      // Handle both single AddressObject and array
      const ccAddresses = Array.isArray(parsed.cc) ? parsed.cc[0] : parsed.cc;
      const addresses = this.parseAddresses(ccAddresses);
      return addresses.length > 0 ? addresses : undefined;
    } catch (error) {
      console.error("❌ Error extracting CC addresses:", error);
      return undefined;
    }
  }

  /**
   * Extract BCC addresses
   */
  private static extractBcc(parsed: ParsedMail): EmailAddress[] | undefined {
    if (!parsed.bcc) return undefined;
    // Handle both single AddressObject and array
    const bccAddresses = Array.isArray(parsed.bcc) ? parsed.bcc[0] : parsed.bcc;
    return this.parseAddresses(bccAddresses);
  }

  /**
   * Parse address object to EmailAddress array
   */
  private static parseAddresses(addressObj: AddressObject): EmailAddress[] {
    if (!addressObj.value) return [];

    return addressObj.value.map((addr) => ({
      name: addr.name || undefined,
      address: addr.address?.toLowerCase() || "",
    }));
  }

  /**
   * Extract subject line - Task 8.3: Enhanced with validation
   */
  private static extractSubject(parsed: ParsedMail): string {
    try {
      if (!parsed.subject || parsed.subject.trim() === "") {
        console.warn("⚠️  Missing subject line, using default");
        return "(No Subject)";
      }

      // Decode encoded subjects (e.g., =?UTF-8?B?...?=)
      // mailparser already decodes, but handle edge cases
      const subject = parsed.subject.trim();

      // Check for excessively long subjects
      if (subject.length > 998) {
        console.warn(`⚠️  Subject exceeds 998 characters, truncating`);
        return subject.substring(0, 995) + "...";
      }

      return subject || "(No Subject)";
    } catch (error) {
      console.error("❌ Error extracting subject:", error);
      return "(No Subject)";
    }
  }

  /**
   * Extract plain text body - Task 8.3: Enhanced with fallbacks
   * Prioritize plain text over HTML
   */
  private static extractPlainTextBody(parsed: ParsedMail): string {
    try {
      if (parsed.text) {
        const text = this.cleanTextBody(parsed.text);
        if (text && text.trim().length > 0) {
          return text;
        }
      }

      // If no plain text, convert HTML to plain text
      if (parsed.html) {
        const html = parsed.html;
        let htmlString: string;

        try {
          if (typeof html === "string") {
            htmlString = html;
          } else if (Buffer.isBuffer(html)) {
            htmlString = (html as Buffer).toString("utf-8");
          } else {
            htmlString = String(html);
          }

          const plainText = this.htmlToPlainText(htmlString);
          if (plainText && plainText.trim().length > 0) {
            return plainText;
          }
        } catch (htmlError) {
          console.error("❌ Error converting HTML to plain text:", htmlError);
        }
      }

      // Task 8.3: Use subject as fallback if no body
      if (parsed.subject && parsed.subject.trim()) {
        console.warn("⚠️  No email body, using subject as content");
        return `Subject: ${parsed.subject}`;
      }

      console.warn("⚠️  Email has no body content");
      return "(Empty message)";
    } catch (error) {
      console.error("❌ Error extracting plain text body:", error);
      return "(Error reading message body)";
    }
  }

  /**
   * Extract HTML body - Task 8.3: Enhanced with error handling
   */
  private static extractHtmlBody(parsed: ParsedMail): string | undefined {
    try {
      if (!parsed.html) return undefined;

      const html = parsed.html;

      // Return as string (mailparser already converts Buffer to string)
      if (typeof html === "string") {
        return html;
      }

      // Handle Buffer type with encoding error handling
      if (Buffer.isBuffer(html)) {
        try {
          return (html as Buffer).toString("utf-8");
        } catch (encodingError) {
          console.warn("⚠️  UTF-8 decoding failed for HTML, trying latin1");
          return (html as Buffer).toString("latin1");
        }
      }

      // Fallback to string conversion
      return String(html);
    } catch (error) {
      console.error("❌ Error extracting HTML body:", error);
      return undefined;
    }
  }

  /**
   * Extract email date - Task 8.3: Enhanced with validation
   */
  private static extractDate(parsed: ParsedMail): Date {
    try {
      if (
        parsed.date &&
        parsed.date instanceof Date &&
        !isNaN(parsed.date.getTime())
      ) {
        return parsed.date;
      }

      // Fallback to current time
      console.warn("⚠️  Invalid or missing date, using current time");
      return new Date();
    } catch (error) {
      console.error("❌ Error extracting date:", error);
      return new Date();
    }
  }

  /**
   * Extract all email headers
   */
  private static extractHeaders(parsed: ParsedMail): EmailHeaders {
    const headers: EmailHeaders = {
      from: this.getHeaderValue(parsed.headers, "from") || "",
      to: this.getHeaderValue(parsed.headers, "to"),
      cc: this.getHeaderValue(parsed.headers, "cc"),
      bcc: this.getHeaderValue(parsed.headers, "bcc"),
      subject: this.getHeaderValue(parsed.headers, "subject") || "(No Subject)",
      date: this.getHeaderValue(parsed.headers, "date"),
      messageId: this.getHeaderValue(parsed.headers, "message-id") || "",
      inReplyTo: this.getHeaderValue(parsed.headers, "in-reply-to"),
      references: this.getHeaderValue(parsed.headers, "references"),
      returnPath: this.getHeaderValue(parsed.headers, "return-path"),
      contentType: this.getHeaderValue(parsed.headers, "content-type"),
      mimeVersion: this.getHeaderValue(parsed.headers, "mime-version"),
    };

    // Add any additional headers
    if (parsed.headers) {
      const headerMap = parsed.headers as Map<string, any>;
      headerMap.forEach((value, key) => {
        if (!headers[key]) {
          headers[key] = Array.isArray(value)
            ? value.join(", ")
            : String(value);
        }
      });
    }

    return headers;
  }

  /**
   * Get header value from parsed headers
   */
  private static getHeaderValue(headers: any, key: string): string | undefined {
    if (!headers) return undefined;

    // Headers can be a Map or object
    const value = headers instanceof Map ? headers.get(key) : headers[key];

    if (!value) return undefined;

    // Handle array values (multiple headers with same name)
    if (Array.isArray(value)) {
      return value.join(", ");
    }

    return String(value);
  }

  /**
   * Extract attachments
   */
  private static extractAttachments(parsed: ParsedMail): EmailAttachment[] {
    if (!parsed.attachments || parsed.attachments.length === 0) {
      return [];
    }

    return parsed.attachments.map((att: Attachment) => ({
      filename: att.filename || "unnamed-attachment",
      contentType: att.contentType || "application/octet-stream",
      size: att.size || att.content?.length || 0,
      content: att.content,
      contentId: att.contentId,
      contentDisposition: att.contentDisposition,
    }));
  }

  /**
   * Extract In-Reply-To header (for threading)
   */
  private static extractInReplyTo(parsed: ParsedMail): string | undefined {
    const inReplyTo = this.getHeaderValue(parsed.headers, "in-reply-to");
    if (!inReplyTo) return undefined;

    // Remove angle brackets and trim
    return inReplyTo.replace(/^<|>$/g, "").trim();
  }

  /**
   * Extract References header (for threading)
   */
  private static extractReferences(parsed: ParsedMail): string[] | undefined {
    const references = this.getHeaderValue(parsed.headers, "references");
    if (!references) return undefined;

    // Split by whitespace and remove angle brackets
    return references
      .split(/\s+/)
      .map((ref) => ref.replace(/^<|>$/g, "").trim())
      .filter(Boolean);
  }

  /**
   * Extract priority from headers
   */
  private static extractPriority(
    parsed: ParsedMail,
  ): "high" | "normal" | "low" | undefined {
    const priority = this.getHeaderValue(
      parsed.headers,
      "priority",
    )?.toLowerCase();
    const importance = this.getHeaderValue(
      parsed.headers,
      "importance",
    )?.toLowerCase();
    const xPriority = this.getHeaderValue(parsed.headers, "x-priority");

    // Check X-Priority (1-5 scale)
    if (xPriority) {
      const num = parseInt(xPriority, 10);
      if (num === 1 || num === 2) return "high";
      if (num === 4 || num === 5) return "low";
      return "normal";
    }

    // Check Importance header
    if (importance === "high") return "high";
    if (importance === "low") return "low";

    // Check Priority header
    if (priority === "urgent" || priority === "high") return "high";
    if (priority === "low" || priority === "non-urgent") return "low";

    return undefined; // Default to normal
  }

  /**
   * Detect auto-reply emails
   */
  private static detectAutoReply(parsed: ParsedMail): boolean {
    const autoSubmitted = this.getHeaderValue(parsed.headers, "auto-submitted");
    const precedence = this.getHeaderValue(parsed.headers, "precedence");
    const xAutoResponseSuppress = this.getHeaderValue(
      parsed.headers,
      "x-auto-response-suppress",
    );

    // Check Auto-Submitted header
    if (autoSubmitted && autoSubmitted !== "no") {
      return true;
    }

    // Check Precedence header
    if (precedence === "auto_reply" || precedence === "bulk") {
      return true;
    }

    // Check X-Auto-Response-Suppress
    if (xAutoResponseSuppress) {
      return true;
    }

    // Check subject for auto-reply keywords
    const subject = parsed.subject?.toLowerCase() || "";
    const autoReplyKeywords = [
      "automatic reply",
      "auto-reply",
      "out of office",
      "away from office",
      "vacation response",
      "autoreply",
    ];

    return autoReplyKeywords.some((keyword) => subject.includes(keyword));
  }

  /**
   * Clean plain text body
   * Remove excessive whitespace, normalize line breaks
   */
  private static cleanTextBody(text: string): string {
    if (!text) return "";

    return text
      .replace(/\r\n/g, "\n") // Normalize line breaks
      .replace(/\n{3,}/g, "\n\n") // Max 2 consecutive line breaks
      .trim();
  }

  /**
   * Convert HTML to plain text (basic conversion)
   */
  private static htmlToPlainText(html: string): string {
    if (!html) return "";

    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "") // Remove style tags
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "") // Remove script tags
      .replace(/<br\s*\/?>/gi, "\n") // Convert <br> to newline
      .replace(/<\/p>/gi, "\n\n") // Convert </p> to double newline
      .replace(/<\/div>/gi, "\n") // Convert </div> to newline
      .replace(/<[^>]+>/g, "") // Remove all HTML tags
      .replace(/&nbsp;/g, " ") // Convert &nbsp; to space
      .replace(/&amp;/g, "&") // Convert &amp; to &
      .replace(/&lt;/g, "<") // Convert &lt; to <
      .replace(/&gt;/g, ">") // Convert &gt; to >
      .replace(/&quot;/g, '"') // Convert &quot; to "
      .replace(/&#39;/g, "'") // Convert &#39; to '
      .replace(/\n{3,}/g, "\n\n") // Max 2 consecutive line breaks
      .trim();
  }

  /**
   * Generate simple hash for Message-ID fallback
   */
  private static generateHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Validate email address format
   */
  public static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Parse email from JSON string (for emails stored in queue)
   */
  public static async parseFromJSON(
    jsonString: string,
  ): Promise<ParsedEmailData> {
    try {
      const data = JSON.parse(jsonString);

      // If it's already parsed data, return it
      if (data.messageId && data.from && data.subject) {
        // Convert attachment contents back to Buffer if needed
        if (data.attachments) {
          data.attachments = data.attachments.map((att: any) => ({
            ...att,
            content: att.content?.data
              ? Buffer.from(att.content.data)
              : Buffer.from(att.content || ""),
          }));
        }
        return data as ParsedEmailData;
      }

      // If it's raw email, parse it
      throw new Error("Invalid JSON format - expected parsed email data");
    } catch (error: any) {
      throw new Error(`Failed to parse email from JSON: ${error.message}`);
    }
  }

  /**
   * Convert parsed email to JSON (for storage in queue)
   */
  public static toJSON(parsedEmail: ParsedEmailData): string {
    return JSON.stringify(parsedEmail, null, 2);
  }

  /**
   * Extract email domain from address
   */
  public static extractDomain(email: string): string {
    const match = email.match(/@(.+)$/);
    return match ? match[1].toLowerCase() : "";
  }

  /**
   * Check if email is from internal domain
   */
  public static isInternalEmail(
    email: string,
    internalDomains: string[],
  ): boolean {
    const domain = this.extractDomain(email);
    return internalDomains.some((d) => domain.endsWith(d.toLowerCase()));
  }
}

/**
 * Helper function for quick parsing
 */
export async function parseEmail(
  rawEmail: Buffer | string,
): Promise<ParsedEmailData> {
  return EmailParser.parse(rawEmail);
}

export default EmailParser;
