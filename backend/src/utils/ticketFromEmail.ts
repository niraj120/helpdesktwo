import { Ticket } from '../models/Ticket';
import { User } from '../models/User';
import { Project } from '../models/Project';
import ProjectEmailConfig from '../models/ProjectEmailConfig';
import { Category } from '../models/Category';
import SLARule from '../models/sla-module/SLARule';
import { ParsedEmailData } from './emailParser';
import { autoAssignTicket } from './ticketAutoAssignment';
import { sendTicketCreatedEmail, sendAgentNewReplyNotification } from './emailService';
import { logIncomingEmail } from './emailCommunicationLogger';
import { initializeSLATracking } from '../services/slaHelperService';
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
 * Returns null if no priority detected (will use project default)
 */
function extractPriorityFromEmail(parsedEmail: ParsedEmailData): string | null {
  // Check parsed priority from headers
  if (parsedEmail.priority) {
    switch (parsedEmail.priority) {
      case 'high':
        return 'HIGH';
      case 'low':
        return 'LOW';
      default:
        return null; // Will use project default
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

  // Return null to use project default
  return null;
}

/**
 * Get project's default priority from SLA Rules
 * Returns the first active SLA rule's name for the project, or 'Normal' fallback
 */
async function getProjectDefaultPriority(projectId: mongoose.Types.ObjectId): Promise<string> {
  console.log(`      🔍 Looking for SLA rule with projectIds containing: ${projectId}`);
  
  // Find first active SLA rule for the project (sorted by name for consistency)
  // Use $in operator since projectIds is an array
  const slaRule = await SLARule.findOne({
    projectIds: { $in: [projectId] },
    isActive: true
  }).sort({ name: 1 });
  
  if (slaRule) {
    // Use the SLA rule name as priority (e.g., "Normal", "High", etc.)
    const priorityName = slaRule.name.toUpperCase();
    console.log(`      ✓ Using SLA rule priority: ${priorityName}`);
    return priorityName;
  }
  
  // Fallback: Find any active SLA rule (global)
  const globalSlaRule = await SLARule.findOne({
    isActive: true
  }).sort({ name: 1 });
  
  if (globalSlaRule) {
    const priorityName = globalSlaRule.name.toUpperCase();
    console.log(`      ✓ Using global SLA rule priority: ${priorityName}`);
    return priorityName;
  }
  
  // Final fallback
  console.log(`      ⚠️ No SLA rule found, using NORMAL fallback`);
  return 'NORMAL';
}

/**
 * Get project's default category for email tickets
 * Returns the first active category for the project
 */
async function getProjectDefaultCategory(projectId: mongoose.Types.ObjectId): Promise<mongoose.Types.ObjectId | undefined> {
  // Find first active category for the project
  const category = await Category.findOne({
    projectId: projectId,
    isActive: true
  }).sort({ order: 1 });
  
  if (category) {
    console.log(`      ✓ Using project's default category: ${category.name} (${category._id})`);
    return category._id;
  }
  
  console.log(`      ⚠️ No category found for project`);
  return undefined;
}

/**
 * Generate unique ticket number using project's ticket number configuration
 * Uses the same format as regular ticket creation
 * @param projectId - Project ID to get ticket number configuration from
 */
async function generateTicketNumber(projectId: mongoose.Types.ObjectId): Promise<string> {
  // Get project with ticket number configuration
  const project = await Project.findById(projectId).select('configuration.ticketNumberSettings');
  
  const ticketNumberConfig = project?.configuration?.ticketNumberSettings;
  console.log('🔧 [Email-to-Ticket] Ticket Number Config:', JSON.stringify(ticketNumberConfig, null, 2));
  
  const prefix = ticketNumberConfig?.prefix || 'TKT';
  const format = ticketNumberConfig?.format || '{PREFIX}-{YYYY}{MM}{DD}-{NNNN}';
  const resetPeriod = ticketNumberConfig?.resetPeriod || 'daily';
  const startingNumber = ticketNumberConfig?.startingNumber || 1;
  
  console.log(`🎫 [Email-to-Ticket] Using: prefix="${prefix}", format="${format}", resetPeriod="${resetPeriod}"`);
  
  const today = new Date();
  
  // Build search pattern based on format (without the number part)
  let searchPattern = format
    .replace('{PREFIX}', prefix)
    .replace('{YYYY}', String(today.getFullYear()))
    .replace('{MM}', String(today.getMonth() + 1).padStart(2, '0'))
    .replace('{DD}', String(today.getDate()).padStart(2, '0'))
    .replace('{NNNN}', ''); // Remove the number part for search
  
  // Escape hyphens for regex
  const regexPattern = searchPattern.replace(/[-]/g, '\\-');
  
  // Find the highest ticket number for the current period within the same project
  const latestTicket = await Ticket.findOne({
    project: projectId,
    ticketNumber: new RegExp(`^${regexPattern}`)
  }).sort({ ticketNumber: -1 }).select('ticketNumber');
  
  let nextNumber = startingNumber;
  if (latestTicket && latestTicket.ticketNumber) {
    // Extract the sequence number from the last ticket
    const lastNumber = parseInt(latestTicket.ticketNumber.split('-').pop() || '0');
    nextNumber = lastNumber + 1;
  }
  
  // Try up to 10 times to find a unique number (in case of race conditions)
  for (let attempt = 0; attempt < 10; attempt++) {
    // Generate ticket number based on format
    let ticketNumber = format
      .replace('{PREFIX}', prefix)
      .replace('{YYYY}', String(today.getFullYear()))
      .replace('{MM}', String(today.getMonth() + 1).padStart(2, '0'))
      .replace('{DD}', String(today.getDate()).padStart(2, '0'))
      .replace('{NNNN}', String(nextNumber).padStart(4, '0'));
    
    // Check if this number already exists
    const exists = await Ticket.findOne({ ticketNumber });
    if (!exists) {
      console.log(`🎫 [Email-to-Ticket] Generated ticket number: ${ticketNumber}`);
      return ticketNumber;
    }
    
    nextNumber++;
  }
  
  // Fallback: use timestamp if all attempts fail
  const fallbackNumber = `${prefix}-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}-${Date.now().toString().slice(-4)}`;
  console.log(`⚠️ [Email-to-Ticket] Using fallback ticket number: ${fallbackNumber}`);
  return fallbackNumber;
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

    // IMPORTANT: Always ensure projectId is an ObjectId to prevent String/ObjectId mismatch
    const projectId = emailConfig.projectId instanceof mongoose.Types.ObjectId 
      ? emailConfig.projectId 
      : new mongoose.Types.ObjectId(emailConfig.projectId as string);
    console.log(`      ✓ Project ID: ${projectId} (type: ObjectId)`);

    // 3. Get priority - first check email headers/keywords, then use project default
    const emailPriority = extractPriorityFromEmail(parsedEmail);
    const priority = emailPriority || await getProjectDefaultPriority(projectId);
    console.log(`      ✓ Priority: ${priority}${emailPriority ? ' (from email)' : ' (project default)'}`);

    // 4. Generate ticket number using project's configuration
    const ticketNumber = await generateTicketNumber(projectId);
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

    // 7. Get category - use project's default category for email tickets
    // (Project admin should configure the appropriate category for email-to-ticket)
    const ticketCategoryId = await getProjectDefaultCategory(projectId);

    // 8. Auto-assign ticket based on project configuration
    const assignedAgent = await autoAssignTicket(projectId.toString(), undefined);

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
      category: ticketCategoryId, // Use ObjectId instead of string
      attachments,
      tags: ['email-to-ticket', `from-${parsedEmail.from.address}`],
      submissionSource: 'email',
      sourceEmail: parsedEmail.from.address,
      sourceEmailName: parsedEmail.from.name || undefined,
      sourceEmailConfigId: queueEntry.projectEmailConfigId, // Store which email config received this (for proper reply routing)
      metadata: {
        projectId: projectId, // Store as ObjectId for consistency with dashboard queries
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

    // Initialize SLA tracking for the new ticket (non-blocking)
    (async () => {
      try {
        await initializeSLATracking(
          ticket._id,
          projectId,
          ticket.priority,
          ticket.createdAt
        );
        console.log(`   ✅ SLA tracking initialized for email ticket ${ticket.ticketNumber}`);
      } catch (error) {
        console.error('   ❌ Failed to initialize SLA tracking for email ticket:', error);
      }
    })();

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
