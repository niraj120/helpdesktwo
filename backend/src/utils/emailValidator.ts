/**
 * Email Validation Utility (Task 8.3)
 * Validates email structure and handles malformed emails gracefully
 */

import { ParsedEmailData, EmailAddress } from './emailParser';
import { logError, ErrorContext, ErrorSeverity } from './errorLogger';

export interface EmailValidationResult {
  isValid: boolean;
  warnings: string[];
  errors: string[];
  sanitizedData?: ParsedEmailData;
}

export interface EmailValidationOptions {
  requireSender?: boolean;
  requireSubject?: boolean;
  requireBody?: boolean;
  allowUnknownEncoding?: boolean;
  maxBodyLength?: number;
  maxSubjectLength?: number;
}

const DEFAULT_OPTIONS: EmailValidationOptions = {
  requireSender: true,
  requireSubject: false,
  requireBody: false,
  allowUnknownEncoding: true,
  maxBodyLength: 1000000, // 1MB
  maxSubjectLength: 998, // RFC 2822 limit
};

/**
 * Validate parsed email data and apply fallbacks
 * 
 * @param emailData - Parsed email data
 * @param options - Validation options
 * @returns Validation result with sanitized data
 */
export async function validateEmail(
  emailData: ParsedEmailData,
  options: EmailValidationOptions = {}
): Promise<EmailValidationResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const warnings: string[] = [];
  const errors: string[] = [];

  try {
    // Create sanitized copy
    const sanitized: ParsedEmailData = { ...emailData };

    // 1. Validate and sanitize sender (FROM)
    const senderValidation = validateSender(sanitized.from, opts.requireSender);
    if (senderValidation.error) {
      errors.push(senderValidation.error);
    }
    if (senderValidation.warning) {
      warnings.push(senderValidation.warning);
    }
    if (senderValidation.sanitized) {
      sanitized.from = senderValidation.sanitized;
    }

    // 2. Validate and sanitize recipients (TO)
    const recipientValidation = validateRecipients(sanitized.to);
    if (recipientValidation.warning) {
      warnings.push(recipientValidation.warning);
    }
    if (recipientValidation.sanitized) {
      sanitized.to = recipientValidation.sanitized;
    }

    // 3. Validate and sanitize subject
    const subjectValidation = validateSubject(
      sanitized.subject,
      opts.requireSubject,
      opts.maxSubjectLength
    );
    if (subjectValidation.warning) {
      warnings.push(subjectValidation.warning);
    }
    sanitized.subject = subjectValidation.sanitized;

    // 4. Validate and sanitize body
    const bodyValidation = validateBody(
      sanitized.body,
      sanitized.htmlBody,
      opts.requireBody,
      opts.maxBodyLength
    );
    if (bodyValidation.warning) {
      warnings.push(bodyValidation.warning);
    }
    sanitized.body = bodyValidation.sanitizedText;
    if (bodyValidation.sanitizedHtml) {
      sanitized.htmlBody = bodyValidation.sanitizedHtml;
    }

    // 5. Validate date
    const dateValidation = validateDate(sanitized.date);
    if (dateValidation.warning) {
      warnings.push(dateValidation.warning);
    }
    sanitized.date = dateValidation.sanitized;

    // 6. Validate message ID
    const messageIdValidation = validateMessageId(sanitized.messageId);
    if (messageIdValidation.warning) {
      warnings.push(messageIdValidation.warning);
    }
    sanitized.messageId = messageIdValidation.sanitized;

    // 7. Validate attachments
    const attachmentValidation = validateAttachments(sanitized.attachments);
    if (attachmentValidation.warning) {
      warnings.push(attachmentValidation.warning);
    }

    // 8. Check for auto-reply indicators
    if (sanitized.isAutoReply) {
      warnings.push('Email appears to be an auto-reply');
    }

    // Determine if email is valid enough to process
    const isValid = errors.length === 0;

    // Log validation results
    if (warnings.length > 0) {
      console.log(`⚠️  Email validation warnings: ${warnings.join(', ')}`);
      await logError({
        message: `Email validation warnings: ${warnings.join('; ')}`,
        context: ErrorContext.EMAIL_PARSING,
        severity: ErrorSeverity.LOW,
        details: {
          messageId: sanitized.messageId,
          from: sanitized.from.address,
          subject: sanitized.subject,
          warnings,
        },
      });
    }

    if (errors.length > 0) {
      console.error(`❌ Email validation errors: ${errors.join(', ')}`);
      await logError({
        message: `Email validation failed: ${errors.join('; ')}`,
        context: ErrorContext.VALIDATION,
        severity: ErrorSeverity.MEDIUM,
        details: {
          messageId: sanitized.messageId,
          from: sanitized.from.address,
          subject: sanitized.subject,
          errors,
        },
      });
    }

    return {
      isValid,
      warnings,
      errors,
      sanitizedData: sanitized,
    };
  } catch (error: any) {
    console.error('❌ Email validation failed with exception:', error);
    await logError({
      message: `Email validation exception: ${error.message}`,
      context: ErrorContext.VALIDATION,
      severity: ErrorSeverity.HIGH,
      details: {
        messageId: emailData.messageId,
        errorStack: error.stack,
      },
    });

    return {
      isValid: false,
      warnings,
      errors: [...errors, `Validation exception: ${error.message}`],
    };
  }
}

/**
 * Validate sender (FROM field)
 */
function validateSender(
  from: EmailAddress,
  required: boolean = true
): {
  error?: string;
  warning?: string;
  sanitized?: EmailAddress;
} {
  // Check if sender exists
  if (!from || !from.address) {
    if (required) {
      return {
        error: 'Missing sender email address (FROM field)',
        sanitized: {
          address: 'unknown@invalid.local',
          name: 'Unknown Sender',
        },
      };
    } else {
      return {
        warning: 'Missing sender email address, using fallback',
        sanitized: {
          address: 'unknown@invalid.local',
          name: 'Unknown Sender',
        },
      };
    }
  }

  // Validate email format
  if (!isValidEmailFormat(from.address)) {
    return {
      warning: `Invalid sender email format: ${from.address}`,
      sanitized: {
        ...from,
        address: sanitizeEmail(from.address),
      },
    };
  }

  // Check for suspicious patterns
  if (from.address.includes('noreply') || from.address.includes('no-reply')) {
    return {
      warning: 'Sender appears to be a no-reply address',
    };
  }

  return {};
}

/**
 * Validate recipients (TO field)
 */
function validateRecipients(to: EmailAddress[]): {
  warning?: string;
  sanitized?: EmailAddress[];
} {
  if (!to || to.length === 0) {
    return {
      warning: 'No recipients specified (TO field empty)',
      sanitized: [{ address: 'support@helpdesk.local', name: 'Support' }],
    };
  }

  // Filter out invalid addresses
  const validRecipients = to.filter((addr) =>
    addr && addr.address && isValidEmailFormat(addr.address)
  );

  if (validRecipients.length < to.length) {
    return {
      warning: `${to.length - validRecipients.length} invalid recipient(s) filtered out`,
      sanitized: validRecipients.length > 0 ? validRecipients : [
        { address: 'support@helpdesk.local', name: 'Support' }
      ],
    };
  }

  return {};
}

/**
 * Validate subject line
 */
function validateSubject(
  subject: string | undefined,
  required: boolean = false,
  maxLength?: number
): {
  warning?: string;
  sanitized: string;
} {
  // Handle missing subject
  if (!subject || subject.trim() === '') {
    return {
      warning: 'Missing subject line, using default',
      sanitized: '(No Subject)',
    };
  }

  // Trim whitespace
  let sanitized = subject.trim();

  // Check length
  if (maxLength && sanitized.length > maxLength) {
    return {
      warning: `Subject line exceeds ${maxLength} characters, truncating`,
      sanitized: sanitized.substring(0, maxLength) + '...',
    };
  }

  // Check for suspicious patterns
  if (sanitized.match(/^(Re: ){5,}/i)) {
    return {
      warning: 'Subject has excessive "Re:" prefixes',
      sanitized: sanitized.replace(/^(Re: ){2,}/i, 'Re: '),
    };
  }

  return { sanitized };
}

/**
 * Validate email body
 */
function validateBody(
  textBody: string | undefined,
  htmlBody: string | undefined,
  required: boolean = false,
  maxLength?: number
): {
  warning?: string;
  sanitizedText: string;
  sanitizedHtml?: string;
} {
  // Handle missing body
  if ((!textBody || textBody.trim() === '') && (!htmlBody || htmlBody.trim() === '')) {
    if (required) {
      return {
        warning: 'Email has no body content, using subject as body',
        sanitizedText: '(Empty message)',
      };
    } else {
      return {
        warning: 'Email has no body content',
        sanitizedText: '(Empty message)',
      };
    }
  }

  let sanitizedText = textBody || '(No plain text body)';
  let sanitizedHtml = htmlBody;

  // Check length
  if (maxLength) {
    if (sanitizedText.length > maxLength) {
      sanitizedText = sanitizedText.substring(0, maxLength) + '\n\n[Message truncated due to length]';
    }
    if (sanitizedHtml && sanitizedHtml.length > maxLength) {
      sanitizedHtml = sanitizedHtml.substring(0, maxLength) + '<p><em>[Message truncated due to length]</em></p>';
    }
  }

  return {
    sanitizedText,
    sanitizedHtml,
  };
}

/**
 * Validate date
 */
function validateDate(date: Date | undefined): {
  warning?: string;
  sanitized: Date;
} {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return {
      warning: 'Invalid or missing date, using current time',
      sanitized: new Date(),
    };
  }

  // Check for future dates (clock skew)
  const now = new Date();
  if (date.getTime() > now.getTime() + 3600000) { // More than 1 hour in future
    return {
      warning: 'Email date is in the future, possible clock skew',
      sanitized: date,
    };
  }

  // Check for very old dates (> 10 years)
  const tenYearsAgo = new Date();
  tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
  if (date.getTime() < tenYearsAgo.getTime()) {
    return {
      warning: 'Email date is more than 10 years old',
      sanitized: date,
    };
  }

  return { sanitized: date };
}

/**
 * Validate message ID
 */
function validateMessageId(messageId: string | undefined): {
  warning?: string;
  sanitized: string;
} {
  if (!messageId || messageId.trim() === '') {
    const generated = `fallback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}@helpdesk.local`;
    return {
      warning: 'Missing Message-ID, generated fallback',
      sanitized: generated,
    };
  }

  return { sanitized: messageId };
}

/**
 * Validate attachments
 */
function validateAttachments(attachments: any[]): {
  warning?: string;
} {
  if (!attachments || attachments.length === 0) {
    return {};
  }

  const invalidCount = attachments.filter(att => 
    !att.filename || !att.contentType
  ).length;

  if (invalidCount > 0) {
    return {
      warning: `${invalidCount} attachment(s) have missing metadata`,
    };
  }

  return {};
}

/**
 * Validate email address format
 */
function isValidEmailFormat(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  
  // Basic email regex (not RFC 5322 compliant, but practical)
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  
  return emailRegex.test(email);
}

/**
 * Sanitize email address
 */
function sanitizeEmail(email: string): string {
  if (!email) return 'invalid@invalid.local';
  
  // Remove whitespace
  email = email.trim();
  
  // Remove angle brackets if present
  email = email.replace(/^<|>$/g, '');
  
  // If still invalid, return fallback
  if (!isValidEmailFormat(email)) {
    return 'invalid@invalid.local';
  }
  
  return email.toLowerCase();
}

/**
 * Check if email should be rejected entirely
 * 
 * @param validationResult - Validation result
 * @returns True if email should be rejected
 */
export function shouldRejectEmail(validationResult: EmailValidationResult): boolean {
  // Reject if critical errors present
  if (validationResult.errors.length > 0) {
    const criticalErrors = validationResult.errors.filter(err =>
      err.includes('Missing sender') && err.includes('required')
    );
    return criticalErrors.length > 0;
  }

  return false;
}

/**
 * Handle encoding issues
 * 
 * @param buffer - Email buffer
 * @param declaredEncoding - Declared encoding from headers
 * @returns Decoded string
 */
export async function handleEncodingIssues(
  buffer: Buffer,
  declaredEncoding?: string
): Promise<{ content: string; warning?: string }> {
  try {
    // Try declared encoding first
    if (declaredEncoding) {
      try {
        const content = buffer.toString(declaredEncoding as BufferEncoding);
        return { content };
      } catch (error) {
        console.warn(`⚠️  Failed to decode with ${declaredEncoding}, trying fallbacks`);
      }
    }

    // Try common encodings
    const encodings: BufferEncoding[] = ['utf-8', 'utf8', 'latin1', 'ascii'];
    
    for (const encoding of encodings) {
      try {
        const content = buffer.toString(encoding);
        // Check if decoded content looks reasonable (no excessive invalid chars)
        const invalidCharRatio = (content.match(/[\uFFFD\u0000-\u0008\u000B-\u000C\u000E-\u001F]/g) || []).length / content.length;
        
        if (invalidCharRatio < 0.1) { // Less than 10% invalid characters
          return {
            content,
            warning: declaredEncoding ? `Used ${encoding} instead of declared ${declaredEncoding}` : undefined,
          };
        }
      } catch (error) {
        continue;
      }
    }

    // Last resort: force UTF-8 and replace invalid characters
    const content = buffer.toString('utf-8').replace(/[\uFFFD]/g, '?');
    return {
      content,
      warning: 'Email contains invalid characters, some content may be corrupted',
    };
  } catch (error: any) {
    console.error('❌ Encoding error:', error);
    return {
      content: '[Content could not be decoded due to encoding issues]',
      warning: `Severe encoding error: ${error.message}`,
    };
  }
}

export const EmailValidator = {
  validateEmail,
  shouldRejectEmail,
  handleEncodingIssues,
  isValidEmailFormat,
  sanitizeEmail,
};

export default EmailValidator;
