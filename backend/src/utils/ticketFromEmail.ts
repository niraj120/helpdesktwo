import { Ticket } from '../models/Ticket';
import { User } from '../models/User';
import ProjectEmailConfig from '../models/ProjectEmailConfig';
import { ParsedEmailData } from './emailParser';
import { autoAssignTicket } from './ticketAutoAssignment';
import { sendTicketCreatedEmail, sendAgentNewReplyNotification } from './emailService';
import { logIncomingEmail } from './emailCommunicationLogger';
import mongoose from 'mongoose';

/**
 * Ticket From Email Utility
 * Creates a new ticket from a parsed email
 */

/**
 * Find or create user by email address
 * Returns existing user or creates a new basic user
 */
async function findOrCreateUserByEmail(email: string, name?: string): Promise<mongoose.Types.ObjectId> {
  try {
    // Try to find existing user by email
    const existingUser = await User.findOne({ 
      email: email.toLowerCase(),
      isDeleted: { $ne: true }
    });

    if (existingUser) {
      console.log(`      ✓ Found existing user: ${existingUser.email}`);
      return existingUser._id;
    }

    // User doesn't exist - create new user
    console.log(`      ℹ️ Creating new user for: ${email}`);

    // Parse name if provided
    let firstName = 'External';
    let lastName = 'User';
    
    if (name) {
      const nameParts = name.trim().split(/\s+/);
      if (nameParts.length === 1) {
        firstName = nameParts[0];
        lastName = '';
      } else if (nameParts.length >= 2) {
        firstName = nameParts[0];
        lastName = nameParts.slice(1).join(' ');
      }
    }

    // Find the default "External User" role (or similar)
    // In production, you should have a specific role for email submitters
    let defaultRole = await mongoose.model('Role').findOne({
      name: { $regex: /^(external|guest|public)/i }
    });

    // Fallback to Student role if no external role exists
    if (!defaultRole) {
      console.log('      ℹ️  No external role found, using Student role as fallback');
      defaultRole = await mongoose.model('Role').findOne({
        code: 'STUDENT'
      });
    }

    if (!defaultRole) {
      throw new Error('Default role for external users not found. Please configure "External User" or "Student" role first.');
    }

    console.log(`      ℹ️  Using role: ${defaultRole.name} (${defaultRole.code})`);

    // Create new user
    const newUser = new User({
      email: email.toLowerCase(),
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`.trim(),
      role: defaultRole._id,
      isActive: true,
      registrationSource: 'online', // Email submissions are online registrations
      requirePasswordSetup: true, // They'll need to set password if they want to login
      eulaAccepted: false,
    });

    await newUser.save();
    console.log(`      ✅ New user created: ${newUser.email} (ID: ${newUser._id})`);

    return newUser._id;
  } catch (error: any) {
    // Handle duplicate key error (race condition)
    if (error.code === 11000 && error.keyPattern?.email) {
      console.log(`      ⚠️  Duplicate email detected, retrying lookup...`);
      
      // User was created between our check and insert
      const user = await User.findOne({ 
        email: email.toLowerCase(),
        isDeleted: { $ne: true }
      });
      
      if (user) {
        console.log(`      ✓ Found user after race condition: ${user.email}`);
        return user._id;
      }
      
      // Still not found - something is wrong
      throw new Error(`User with email ${email} not found after duplicate key error`);
    }
    
    // Other error - re-throw
    console.error(`Error finding/creating user: ${error.message}`);
    throw error;
  }
}

/**
 * Extract priority from email
 * Checks X-Priority header and keywords in subject/body
 */
function extractPriority(parsedEmail: ParsedEmailData): string {
  // Check parsed priority from headers
  if (parsedEmail.priority) {
    switch (parsedEmail.priority) {
      case 'high':
        return 'HIGH';
      case 'low':
        return 'LOW';
      default:
        return 'MEDIUM';
    }
  }

  // Check for urgent keywords in subject
  const subject = parsedEmail.subject.toLowerCase();
  const urgentKeywords = ['urgent', 'critical', 'emergency', 'asap', 'high priority'];
  
  for (const keyword of urgentKeywords) {
    if (subject.includes(keyword)) {
      console.log(`      ⚠️ Urgent keyword detected in subject: "${keyword}"`);
      return 'HIGH';
    }
  }

  // Default to MEDIUM
  return 'MEDIUM';
}

/**
 * Generate unique ticket number
 * Format: YYYYMMDD-XXXX (e.g., 20240124-0001)
 */
async function generateTicketNumber(): Promise<string> {
  const today = new Date();
  const datePrefix = today.toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD

  // Find the last ticket created today
  const lastTicket = await Ticket.findOne({
    ticketNumber: new RegExp(`^${datePrefix}-`),
  })
    .sort({ ticketNumber: -1 })
    .select('ticketNumber');

  let sequence = 1;
  if (lastTicket) {
    const lastSequence = parseInt(lastTicket.ticketNumber.split('-')[1]);
    sequence = lastSequence + 1;
  }

  const ticketNumber = `${datePrefix}-${sequence.toString().padStart(4, '0')}`;
  return ticketNumber;
}

/**
 * Create a new ticket from parsed email
 * 
 * @param parsedEmail - Parsed email data
 * @param queueEntry - Queue entry containing projectEmailConfigId
 * @returns Created ticket
 */
export async function createTicketFromEmail(
  parsedEmail: ParsedEmailData,
  queueEntry: any
): Promise<any> {
  try {
    console.log(`   📝 Creating ticket from email: ${parsedEmail.subject}`);

    // 1. Find or create user from email sender
    const submitterId = await findOrCreateUserByEmail(
      parsedEmail.from.address,
      parsedEmail.from.name
    );

    // 2. Get project from email configuration
    const emailConfig = await ProjectEmailConfig.findById(queueEntry.projectEmailConfigId);
    if (!emailConfig) {
      throw new Error(`Email configuration not found: ${queueEntry.projectEmailConfigId}`);
    }

    const projectId = emailConfig.projectId;
    console.log(`      ✓ Project ID: ${projectId}`);

    // 3. Extract priority from email
    const priority = extractPriority(parsedEmail);
    console.log(`      ✓ Priority: ${priority}`);

    // 4. Generate ticket number
    const ticketNumber = await generateTicketNumber();
    console.log(`      ✓ Ticket Number: ${ticketNumber}`);

    // 5. Extract description (prefer plain text, fallback to HTML)
    let description = parsedEmail.body || '';
    if (!description && parsedEmail.htmlBody) {
      // Use HTML body if plain text is empty
      description = parsedEmail.htmlBody;
    }

    // Truncate very long descriptions
    const MAX_DESCRIPTION_LENGTH = 10000;
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      description = description.substring(0, MAX_DESCRIPTION_LENGTH) + '\n\n[Email content truncated...]';
    }

    // 6. Prepare attachments (if any)
    // NOTE: Actual file upload to storage (GCS/S3) should be handled here
    // For now, we'll store attachment metadata only
    const attachments = parsedEmail.attachments.map((att) => ({
      filename: att.filename,
      originalName: att.filename,
      mimetype: att.contentType,
      size: att.size,
      uploadedAt: new Date(),
      // TODO: Upload att.content to storage and store path
      // For now, attachments are just metadata
    }));

    if (attachments.length > 0) {
      console.log(`      ℹ️ Email has ${attachments.length} attachment(s)`);
    }

    // 7. Extract category from email (if categorization is enabled)
    // Try to extract category from subject line keywords
    let ticketCategory: string | undefined = undefined;
    const categoryKeywords = [
      { keywords: ['technical', 'tech', 'bug', 'error', 'issue'], category: 'Technical Support' },
      { keywords: ['billing', 'payment', 'invoice', 'charge'], category: 'Billing' },
      { keywords: ['account', 'login', 'password', 'access'], category: 'Account' },
      { keywords: ['general', 'question', 'inquiry', 'help'], category: 'General' },
    ];

    const subjectLower = (parsedEmail.subject || '').toLowerCase();
    for (const item of categoryKeywords) {
      if (item.keywords.some((keyword) => subjectLower.includes(keyword))) {
        ticketCategory = item.category;
        console.log(`      ℹ️ Auto-detected category from subject: ${ticketCategory}`);
        break;
      }
    }

    // 8. Auto-assign ticket based on project configuration
    const assignedAgent = await autoAssignTicket(projectId.toString(), ticketCategory);

    // 9. Create the ticket
    const ticket = new Ticket({
      ticketNumber,
      subject: parsedEmail.subject || '(No Subject)',
      description,
      status: 1, // 1 = Open
      priority,
      createdBy: submitterId,
      assignedTo: assignedAgent || undefined,
      project: projectId,
      category: ticketCategory,
      attachments,
      tags: ['email-to-ticket', `from-${parsedEmail.from.address}`],
      submissionSource: 'email',
      sourceEmail: parsedEmail.from.address,
      metadata: {
        projectId: projectId.toString(), // For dashboard queries
        emailMessageId: parsedEmail.messageId,
        emailDate: parsedEmail.date,
        emailFrom: {
          address: parsedEmail.from.address,
          name: parsedEmail.from.name,
        },
        emailTo: parsedEmail.to,
        emailCc: parsedEmail.cc,
        hasAttachments: parsedEmail.attachments.length > 0,
        attachmentCount: parsedEmail.attachments.length,
        autoAssigned: assignedAgent ? true : false,
      },
    });

    await ticket.save();
    console.log(`   ✅ Ticket created: ${ticket.ticketNumber} (ID: ${ticket._id})`);
    if (assignedAgent) {
      console.log(`      ✓ Assigned to agent: ${assignedAgent}`);
    }

    // 8. Log email communication (Task 5.4)
    const emailComm = await logIncomingEmail(ticket._id, parsedEmail);
    console.log(`   ✅ Email communication logged (ID: ${emailComm._id})`);

    // 9. Add system comment to ticket
    const systemComment = {
      text: `Ticket created from email sent by ${parsedEmail.from.name || parsedEmail.from.address} on ${parsedEmail.date.toLocaleString()}`,
      createdBy: submitterId,
      createdAt: new Date(),
      isSystemComment: true,
    };

    ticket.comments = ticket.comments || [];
    ticket.comments.push(systemComment as any);
    await ticket.save();

    // 10. Send confirmation email to user (Task 5.5)
    try {
      console.log(`   📧 Sending confirmation email to: ${parsedEmail.from.address}`);
      
      const emailSent = await sendTicketCreatedEmail(
        parsedEmail.from.address,
        ticket.ticketNumber,
        ticket.subject,
        projectId.toString(),
        {
          studentName: parsedEmail.from.name || 'User',
          status: 'Open',
          priority: ticket.priority,
          ticketId: ticket._id, // For logging to TicketEmailCommunication
          originalMessageId: parsedEmail.messageId, // Thread to original email
          references: parsedEmail.references || [parsedEmail.messageId], // Thread references
        }
      );

      if (emailSent) {
        console.log(`   ✅ Confirmation email sent successfully`);
      } else {
        console.log(`   ⚠️ Confirmation email not sent (disabled or failed)`);
      }
    } catch (emailError: any) {
      console.error(`   ❌ Error sending confirmation email: ${emailError.message}`);
      // Don't throw - confirmation email failure shouldn't prevent ticket creation
    }

    return ticket;
  } catch (error: any) {
    console.error(`   ❌ Error creating ticket from email: ${error.message}`);
    throw error;
  }
}

/**
 * Add email as reply to existing ticket (Task 5.6)
 * Used by the processing worker when a thread is detected
 * 
 * @param ticket - Ticket document to add reply to
 * @param parsedEmail - Parsed email data
 * @param queueEntry - Email processing queue entry
 */
export async function addEmailReplyToTicket(
  ticket: any,
  parsedEmail: ParsedEmailData,
  queueEntry: any
): Promise<void> {
  try {
    console.log(`   💬 Adding email reply to ticket: ${ticket.ticketNumber}`);

    // 1. Find or create user
    const userId = await findOrCreateUserByEmail(
      parsedEmail.from.address,
      parsedEmail.from.name
    );

    // Get user details for notifications
    const user = await User.findById(userId);
    const userName = user?.fullName || user?.firstName || (parsedEmail.from as any).name || parsedEmail.from.address;

    // 2. Log email communication (Task 5.4)
    const emailComm = await logIncomingEmail(ticket._id, parsedEmail);
    console.log(`      ✓ Email communication logged (ID: ${emailComm._id})`);

    // 3. Add comment to ticket
    const commentText = parsedEmail.body || parsedEmail.htmlBody || '(No message body)';
    const comment = {
      text: commentText,
      createdBy: userId,
      createdAt: new Date(),
      isSystemComment: false,
    };

    ticket.comments = ticket.comments || [];
    ticket.comments.push(comment);

    console.log(`      ✓ Comment added to ticket (${commentText.length} chars)`);

    // 4. Reopen ticket if it's closed/resolved
    const wasClosedOrResolved = ticket.status === 4 || ticket.status === 5;
    if (wasClosedOrResolved) {
      const oldStatus = ticket.status === 4 ? 'Resolved' : 'Closed';
      console.log(`      ℹ️ Ticket is ${oldStatus}, reopening to Open...`);
      
      ticket.changeHistory = ticket.changeHistory || [];
      ticket.changeHistory.push({
        field: 'status',
        oldValue: ticket.status.toString(),
        newValue: '1',
        changedBy: userId,
        changedAt: new Date(),
        changeType: 'update',
      });
      
      ticket.status = 1; // Reopen to "Open"
      ticket.resolvedAt = undefined;
      ticket.closedAt = undefined;

      console.log(`      ✓ Ticket status changed: ${oldStatus} → Open`);
    }

    // 5. Update ticket
    ticket.updatedAt = new Date();
    await ticket.save();

    console.log(`   ✅ Email reply added to ticket ${ticket.ticketNumber}`);

    // 6. Notify assigned agent about new reply (Task 5.6)
    if (ticket.assignedTo) {
      try {
        await ticket.populate('assignedTo');
        const agent = ticket.assignedTo;
        
        if (agent && agent.email) {
          console.log(`      📧 Notifying assigned agent: ${agent.email}`);
          
          // Get reply preview (first 200 chars)
          const replyPreview = commentText.substring(0, 200);
          
          const projectId = ticket.project ? ticket.project.toString() : undefined;
          
          const notificationSent = await sendAgentNewReplyNotification(
            agent.email,
            ticket.ticketNumber,
            ticket.subject,
            replyPreview,
            userName,
            projectId
          );

          if (notificationSent) {
            console.log(`      ✅ Agent notification sent successfully`);
          } else {
            console.log(`      ⚠️ Agent notification not sent (disabled or failed)`);
          }
        }
      } catch (notifyError) {
        console.error(`      ⚠️ Failed to notify agent:`, notifyError);
        // Don't throw - notification failures shouldn't break reply processing
      }
    } else {
      console.log(`      ℹ️ No agent assigned to ticket, skipping notification`);
    }

    // 7. Store email communication ID in queue for reference
    queueEntry.emailCommunicationId = emailComm._id;
    await queueEntry.save();
  } catch (error: any) {
    console.error(`   ❌ Error adding email reply: ${error.message}`);
    throw error;
  }
}

export default createTicketFromEmail;
