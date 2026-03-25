import { Ticket } from "../models/Ticket";
import { ParsedEmailData } from "./emailParser";
import TicketEmailCommunication from "../models/TicketEmailCommunication";

/**
 * Email Thread Detector
 * Finds existing tickets based on email threading headers
 */

/**
 * Find existing ticket based on email thread
 * Uses In-Reply-To and References headers to detect email threads
 *
 * @param parsedEmail - Parsed email data
 * @returns Existing ticket if found, null otherwise
 */
export async function findEmailThread(
  parsedEmail: ParsedEmailData,
): Promise<any | null> {
  try {
    // Strategy 1: Check In-Reply-To header (most reliable)
    if (parsedEmail.inReplyTo) {
      const ticketByInReplyTo = await findByInReplyTo(parsedEmail.inReplyTo);
      if (ticketByInReplyTo) {
        console.log(
          `      ✓ Match found via In-Reply-To: ${parsedEmail.inReplyTo}`,
        );
        return ticketByInReplyTo;
      }
    }

    // Strategy 2: Check References header (thread history)
    if (parsedEmail.references && parsedEmail.references.length > 0) {
      const ticketByReferences = await findByReferences(parsedEmail.references);
      if (ticketByReferences) {
        console.log(`      ✓ Match found via References header`);
        return ticketByReferences;
      }
    }

    // Strategy 3: Check subject line (fallback method)
    if (parsedEmail.subject) {
      const ticketBySubject = await findBySubject(
        parsedEmail.subject,
        parsedEmail.from.address,
      );
      if (ticketBySubject) {
        console.log(`      ✓ Match found via subject line`);
        return ticketBySubject;
      }
    }

    // No thread found
    console.log(`      ✗ No thread found`);
    return null;
  } catch (error: any) {
    console.error(`Error detecting email thread: ${error.message}`);
    return null;
  }
}

/**
 * Find ticket by In-Reply-To header
 * Most reliable method - checks if the email is replying to a known message
 */
async function findByInReplyTo(inReplyTo: string): Promise<any | null> {
  try {
    // First, check if the In-Reply-To message ID exists in TicketEmailCommunication
    const emailComm = await TicketEmailCommunication.findOne({
      messageId: inReplyTo,
    }).select("ticketId");

    if (emailComm && emailComm.ticketId) {
      // Found the original email, get the ticket
      const ticket = await Ticket.findById(emailComm.ticketId);
      if (ticket) {
        return ticket;
      }
    }

    // Fallback: Check if In-Reply-To matches any ticket's initial message ID
    const ticket = await Ticket.findOne({
      "metadata.emailMessageId": inReplyTo,
    });

    return ticket || null;
  } catch (error: any) {
    console.error(`Error in findByInReplyTo: ${error.message}`);
    return null;
  }
}

/**
 * Find ticket by References header
 * Checks thread history for any matching message IDs
 */
async function findByReferences(references: string[]): Promise<any | null> {
  try {
    // Check all message IDs in the references chain
    for (const messageId of references) {
      // Check TicketEmailCommunication
      const emailComm = await TicketEmailCommunication.findOne({
        messageId: messageId,
      }).select("ticketId");

      if (emailComm && emailComm.ticketId) {
        const ticket = await Ticket.findById(emailComm.ticketId);
        if (ticket) {
          return ticket;
        }
      }

      // Check Ticket collection
      const ticket = await Ticket.findOne({
        "metadata.emailMessageId": messageId,
      });

      if (ticket) {
        return ticket;
      }
    }

    return null;
  } catch (error: any) {
    console.error(`Error in findByReferences: ${error.message}`);
    return null;
  }
}

/**
 * Find ticket by subject line (fallback method)
 * Matches subject with ticket number pattern or exact subject match
 * Only matches if from the same sender (to avoid false positives)
 */
async function findBySubject(
  subject: string,
  senderEmail: string,
): Promise<any | null> {
  try {
    // Check for ticket number in subject (e.g., "Re: [Ticket #12345] Issue with...")
    const ticketNumberMatch = subject.match(/\[?(?:Ticket|TKT)?\s*#?(\d+)\]?/i);

    if (ticketNumberMatch) {
      const ticketNumber = ticketNumberMatch[1];
      const ticket = await Ticket.findOne({
        ticketNumber: ticketNumber,
        sourceEmail: senderEmail.toLowerCase(),
      });

      if (ticket) {
        return ticket;
      }
    }

    // Fallback: Try to match by EXACT subject (recent tickets only)
    // Strip ALL leading Re:/Fwd: prefixes (handles 'Re: Re: ...' etc.)
    let cleanSubject = subject.trim();
    while (/^(Re:|Fwd:|FW:|Fw:)\s*/i.test(cleanSubject)) {
      cleanSubject = cleanSubject.replace(/^(Re:|Fwd:|FW:|Fw:)\s*/i, "").trim();
    }
    cleanSubject = cleanSubject.toLowerCase();

    if (cleanSubject.length < 5) {
      // Subject too short, don't attempt matching
      return null;
    }

    // Find recent tickets from same sender with EXACT subject match only
    // Different subject = NEW ticket (user's requirement)
    const recentTickets = await Ticket.find({
      sourceEmail: senderEmail.toLowerCase(),
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // Last 7 days
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .select("subject ticketNumber");

    for (const ticket of recentTickets) {
      // Normalize ticket subject the same way — strip ALL leading Re:/Fwd: prefixes
      let ticketSubject = ticket.subject.trim();
      while (/^(Re:|Fwd:|FW:|Fw:)\s*/i.test(ticketSubject)) {
        ticketSubject = ticketSubject
          .replace(/^(Re:|Fwd:|FW:|Fw:)\s*/i, "")
          .trim();
      }
      ticketSubject = ticketSubject.toLowerCase();

      // ONLY match if subject is EXACTLY the same (after normalization)
      // This ensures different subjects create NEW tickets
      if (ticketSubject === cleanSubject) {
        console.log(`      📌 Exact subject match found: "${cleanSubject}"`);
        // Reload full ticket object
        return await Ticket.findById(ticket._id);
      }
    }

    // No exact match found - will create a new ticket
    console.log(
      `      📝 No exact subject match for: "${cleanSubject}" - new ticket will be created`,
    );

    return null;
  } catch (error: any) {
    console.error(`Error in findBySubject: ${error.message}`);
    return null;
  }
}

/**
 * Check if email is an auto-reply and should not create a ticket
 * This is a helper function to filter out auto-replies
 */
export function shouldIgnoreEmail(parsedEmail: ParsedEmailData): boolean {
  // Ignore auto-replies
  if (parsedEmail.isAutoReply) {
    console.log(`   ⚠️  Email is auto-reply, should be ignored`);
    return true;
  }

  // Ignore emails from known system addresses
  const systemAddresses = [
    "noreply@",
    "no-reply@",
    "donotreply@",
    "mailer-daemon@",
    "postmaster@",
  ];

  const fromEmail = parsedEmail.from.address.toLowerCase();
  for (const systemAddr of systemAddresses) {
    if (fromEmail.includes(systemAddr)) {
      console.log(
        `   ⚠️  Email from system address (${fromEmail}), should be ignored`,
      );
      return true;
    }
  }

  // Ignore emails with empty body
  if (!parsedEmail.body || parsedEmail.body.trim().length === 0) {
    console.log(`   ⚠️  Email has no body, should be ignored`);
    return true;
  }

  return false;
}

/**
 * Extract ticket number from subject line
 */
export function extractTicketNumberFromSubject(subject: string): string | null {
  const match = subject.match(/\[?(?:Ticket|TKT)?\s*#?(\d+)\]?/i);
  return match ? match[1] : null;
}

/**
 * Check if two email addresses belong to the same person
 * (for future implementation with alias detection)
 */
export function isSameSender(email1: string, email2: string): boolean {
  return email1.toLowerCase() === email2.toLowerCase();
}

export default findEmailThread;
