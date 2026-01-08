import mongoose, { Schema, Document } from 'mongoose';
import { encrypt, decrypt, isEncrypted } from '../utils/encryption';

export interface IEmailTrigger {
  name: string;
  enabled: boolean;
  subject: string;
  body: string;
  recipients: 'student' | 'agent' | 'both' | 'custom';
  customRecipients?: string[];
}

export interface IEmailConfig extends Document {
  projectId: mongoose.Types.ObjectId;
  enabled: boolean;
  
  // SMTP Configuration
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassword: string;
  fromEmail: string;
  fromName: string;
  
  // Email Triggers
  triggers: {
    // Account & User Management
    accountCreated: IEmailTrigger;
    passwordReset: IEmailTrigger;
    
    // Ticket Creation
    ticketCreatedStudent: IEmailTrigger;
    ticketCreatedAgent: IEmailTrigger;
    ticketCreatedOnline: IEmailTrigger;
    ticketCreatedOffline: IEmailTrigger;
    ticketCreatedEmail: IEmailTrigger;
    
    // Ticket Assignment & Escalation
    ticketAssigned: IEmailTrigger;
    ticketEscalated: IEmailTrigger;
    ticketReassigned: IEmailTrigger;
    
    // Ticket Status Updates
    ticketStatusChanged: IEmailTrigger;
    ticketClosed: IEmailTrigger;
    ticketRejected: IEmailTrigger;
    ticketReopened: IEmailTrigger;
    
    // Ticket Interactions
    ticketCommentAdded: IEmailTrigger;
    ticketReplied: IEmailTrigger;
    
    // Reminders & Notifications
    ticketReminderAgent24hrs: IEmailTrigger;
    ticketReminderAgent48hrs: IEmailTrigger;
    ticketDueSoon: IEmailTrigger;
    ticketOverdue: IEmailTrigger;
    
    // Student/User Communications
    studentWelcome: IEmailTrigger;
    studentOTP: IEmailTrigger;
  };
  
  createdAt: Date;
  updatedAt: Date;
}

const emailTriggerSchema = new Schema({
  name: { type: String, required: true },
  enabled: { type: Boolean, default: false },
  subject: { type: String, required: true },
  body: { type: String, required: true },
  recipients: { 
    type: String, 
    enum: ['student', 'agent', 'both', 'custom'],
    default: 'student'
  },
  customRecipients: [{ type: String }],
});

const emailConfigSchema = new Schema(
  {
    projectId: { 
      type: Schema.Types.ObjectId, 
      ref: 'Project', 
      required: true,
      unique: true 
    },
    enabled: { type: Boolean, default: false },
    
    // SMTP Configuration
    smtpHost: { type: String, default: '' },
    smtpPort: { type: Number, default: 587 },
    smtpSecure: { type: Boolean, default: false },
    smtpUser: { type: String, default: '' },
    smtpPassword: { type: String, default: '' },
    fromEmail: { type: String, default: '' },
    fromName: { type: String, default: 'SAC Helpdesk' },
    
    // Email Triggers
    triggers: {
      // Account & User Management
      accountCreated: {
        type: emailTriggerSchema,
        default: {
          name: 'Account Created',
          enabled: false,
          subject: 'Welcome to {{projectName}} - Your Account Details',
          body: 'Hello {{studentName}},\n\nYour account has been created successfully!\n\nPortal URL: {{loginUrl}}\nEmail: {{email}}\n\nPlease login and set your password using the "Forgot Password" option.\n\nThank you!\n\n{{projectName}} Support Team',
          recipients: 'student'
        }
      },
      passwordReset: {
        type: emailTriggerSchema,
        default: {
          name: 'Password Reset',
          enabled: false,
          subject: 'Password Reset Request - {{projectName}}',
          body: 'Hello {{userName}},\n\nWe received a request to reset your password.\n\nReset Link: {{resetLink}}\n\nThis link is valid for 1 hour.\n\nIf you did not request this, please ignore this email.\n\nThank you!',
          recipients: 'student'
        }
      },
      
      // Ticket Creation - Student Notification
      ticketCreatedStudent: {
        type: emailTriggerSchema,
        default: {
          name: 'Ticket Created - Student Notification',
          enabled: false,
          subject: 'Ticket Created: {{ticketNumber}}',
          body: 'Hello {{studentName}},\n\nYour ticket has been created successfully.\n\nTicket Number: {{ticketNumber}}\nSubject: {{ticketSubject}}\nStatus: {{ticketStatus}}\nPriority: {{ticketPriority}}\n\nOur team will review and respond soon.\n\nThank you!',
          recipients: 'student'
        }
      },
      
      // Ticket Creation - Agent Notification
      ticketCreatedAgent: {
        type: emailTriggerSchema,
        default: {
          name: 'Ticket Created - Agent Notification',
          enabled: false,
          subject: 'New Ticket: {{ticketNumber}}',
          body: 'Hello {{agentName}},\n\nA new ticket has been created and assigned to you.\n\nTicket Number: {{ticketNumber}}\nStudent: {{studentName}}\nSubject: {{ticketSubject}}\nPriority: {{ticketPriority}}\nCreated: {{createdAt}}\n\nPlease review and respond.\n\nThank you!',
          recipients: 'agent'
        }
      },
      
      // Ticket Created Online
      ticketCreatedOnline: {
        type: emailTriggerSchema,
        default: {
          name: 'Ticket Created - Online Submission',
          enabled: false,
          subject: 'Online Ticket Submitted: {{ticketNumber}}',
          body: 'Hello {{studentName}},\n\nYour ticket submitted online has been received.\n\nTicket Number: {{ticketNumber}}\nSubject: {{ticketSubject}}\nSubmitted: {{createdAt}}\n\nYou can track your ticket at: {{ticketUrl}}\n\nThank you!',
          recipients: 'student'
        }
      },
      
      // Ticket Created Offline
      ticketCreatedOffline: {
        type: emailTriggerSchema,
        default: {
          name: 'Ticket Created - Offline/Walk-in',
          enabled: false,
          subject: 'Ticket Created at Center: {{ticketNumber}}',
          body: 'Hello {{studentName}},\n\nYour ticket created at our center has been registered.\n\nTicket Number: {{ticketNumber}}\nCenter: {{centerName}}\nSubject: {{ticketSubject}}\nCreated By: {{agentName}}\n\nYou can track your ticket at: {{ticketUrl}}\n\nThank you!',
          recipients: 'student'
        }
      },
      
      // Ticket Created via Email
      ticketCreatedEmail: {
        type: emailTriggerSchema,
        default: {
          name: 'Ticket Created - Email Submission',
          enabled: false,
          subject: 'Email Ticket Created: {{ticketNumber}}',
          body: 'Hello {{studentName}},\n\nWe received your email and created a ticket.\n\nTicket Number: {{ticketNumber}}\nSubject: {{ticketSubject}}\n\nWe will respond to your request soon.\n\nThank you!',
          recipients: 'student'
        }
      },
      
      // Ticket Assigned
      ticketAssigned: {
        type: emailTriggerSchema,
        default: {
          name: 'Ticket Assigned to Agent',
          enabled: false,
          subject: 'Ticket Assigned: {{ticketNumber}}',
          body: 'Hello {{agentName}},\n\nA ticket has been assigned to you.\n\nTicket Number: {{ticketNumber}}\nStudent: {{studentName}}\nSubject: {{ticketSubject}}\nPriority: {{ticketPriority}}\nAssigned By: {{assignedBy}}\nDue Date: {{dueDate}}\n\nPlease review and respond promptly.\n\nThank you!',
          recipients: 'agent'
        }
      },
      
      // Ticket Escalated (SLA)
      ticketEscalated: {
        type: emailTriggerSchema,
        default: {
          name: 'Ticket Escalated - SLA Breach',
          enabled: false,
          subject: 'URGENT: Ticket Escalated - {{ticketNumber}}',
          body: 'Hello {{escalatedTo}},\n\nA ticket has been escalated to you due to SLA breach.\n\nTicket Number: {{ticketNumber}}\nStudent: {{studentName}}\nSubject: {{ticketSubject}}\nPriority: {{ticketPriority}}\nOriginal Agent: {{originalAgent}}\nEscalation Reason: {{escalationReason}}\nTime Elapsed: {{timeElapsed}}\nSLA Target: {{slaTarget}}\n\nImmediate attention required!\n\nThank you!',
          recipients: 'agent'
        }
      },
      
      // Ticket Reassigned
      ticketReassigned: {
        type: emailTriggerSchema,
        default: {
          name: 'Ticket Reassigned',
          enabled: false,
          subject: 'Ticket Reassigned: {{ticketNumber}}',
          body: 'Hello {{newAgent}},\n\nA ticket has been reassigned to you.\n\nTicket Number: {{ticketNumber}}\nStudent: {{studentName}}\nSubject: {{ticketSubject}}\nPrevious Agent: {{previousAgent}}\nReassigned By: {{reassignedBy}}\nReason: {{reassignReason}}\n\nPlease review and take action.\n\nThank you!',
          recipients: 'agent'
        }
      },
      
      // Ticket Status Changed
      ticketStatusChanged: {
        type: emailTriggerSchema,
        default: {
          name: 'Ticket Status Updated',
          enabled: false,
          subject: 'Ticket Status Updated: {{ticketNumber}}',
          body: 'Hello {{studentName}},\n\nYour ticket status has been updated.\n\nTicket Number: {{ticketNumber}}\nPrevious Status: {{oldStatus}}\nNew Status: {{newStatus}}\nUpdated By: {{updatedBy}}\nComments: {{statusComments}}\n\nThank you!',
          recipients: 'student'
        }
      },
      
      // Ticket Closed
      ticketClosed: {
        type: emailTriggerSchema,
        default: {
          name: 'Ticket Closed',
          enabled: false,
          subject: 'Ticket Closed: {{ticketNumber}}',
          body: 'Hello {{studentName}},\n\nYour ticket has been closed.\n\nTicket Number: {{ticketNumber}}\nSubject: {{ticketSubject}}\nResolution: {{resolution}}\nClosed By: {{closedBy}}\nClosed Date: {{closedDate}}\n\nIf you have any concerns, please feel free to reopen this ticket or create a new one.\n\nThank you!',
          recipients: 'student'
        }
      },
      
      // Ticket Rejected
      ticketRejected: {
        type: emailTriggerSchema,
        default: {
          name: 'Ticket Rejected',
          enabled: false,
          subject: 'Ticket Rejected: {{ticketNumber}}',
          body: 'Hello {{studentName}},\n\nYour ticket has been rejected.\n\nTicket Number: {{ticketNumber}}\nSubject: {{ticketSubject}}\nRejected By: {{rejectedBy}}\nReason: {{rejectionReason}}\nRejection Date: {{rejectedDate}}\n\nIf you believe this was done in error, please contact us.\n\nThank you!',
          recipients: 'student'
        }
      },
      
      // Ticket Reopened
      ticketReopened: {
        type: emailTriggerSchema,
        default: {
          name: 'Ticket Reopened',
          enabled: false,
          subject: 'Ticket Reopened: {{ticketNumber}}',
          body: 'Hello {{agentName}},\n\nA previously closed ticket has been reopened.\n\nTicket Number: {{ticketNumber}}\nStudent: {{studentName}}\nSubject: {{ticketSubject}}\nReopened By: {{reopenedBy}}\nReason: {{reopenReason}}\n\nPlease review and take action.\n\nThank you!',
          recipients: 'agent'
        }
      },
      
      // Comment Added
      ticketCommentAdded: {
        type: emailTriggerSchema,
        default: {
          name: 'Comment Added to Ticket',
          enabled: false,
          subject: 'New Comment: {{ticketNumber}}',
          body: 'Hello {{recipientName}},\n\nA new comment has been added to your ticket.\n\nTicket Number: {{ticketNumber}}\nComment By: {{commentBy}}\nComment:\n{{commentText}}\n\nView ticket: {{ticketUrl}}\n\nThank you!',
          recipients: 'both'
        }
      },
      
      // Reply Added
      ticketReplied: {
        type: emailTriggerSchema,
        default: {
          name: 'Reply Added to Ticket',
          enabled: false,
          subject: 'New Reply: {{ticketNumber}}',
          body: 'Hello {{studentName}},\n\nYou have received a reply on your ticket.\n\nTicket Number: {{ticketNumber}}\nReplied By: {{repliedBy}}\nReply:\n{{replyText}}\n\nView and respond: {{ticketUrl}}\n\nThank you!',
          recipients: 'student'
        }
      },
      
      // Agent Reminder - 24 hours
      ticketReminderAgent24hrs: {
        type: emailTriggerSchema,
        default: {
          name: 'Ticket Reminder - 24 Hours No Response',
          enabled: false,
          subject: 'REMINDER: Pending Response - {{ticketNumber}}',
          body: 'Hello {{agentName}},\n\nThis is a reminder that the following ticket has not been responded to in 24 hours.\n\nTicket Number: {{ticketNumber}}\nStudent: {{studentName}}\nSubject: {{ticketSubject}}\nPriority: {{ticketPriority}}\nCreated: {{createdAt}}\nTime Elapsed: 24 hours\n\nPlease respond as soon as possible.\n\nThank you!',
          recipients: 'agent'
        }
      },
      
      // Agent Reminder - 48 hours
      ticketReminderAgent48hrs: {
        type: emailTriggerSchema,
        default: {
          name: 'Ticket Reminder - 48 Hours No Response',
          enabled: false,
          subject: 'URGENT: No Response for 48 Hours - {{ticketNumber}}',
          body: 'Hello {{agentName}},\n\nURGENT: The following ticket has not been responded to in 48 hours.\n\nTicket Number: {{ticketNumber}}\nStudent: {{studentName}}\nSubject: {{ticketSubject}}\nPriority: {{ticketPriority}}\nCreated: {{createdAt}}\nTime Elapsed: 48 hours\n\nImmediate action required!\n\nThank you!',
          recipients: 'agent'
        }
      },
      
      // Ticket Due Soon
      ticketDueSoon: {
        type: emailTriggerSchema,
        default: {
          name: 'Ticket Due Soon',
          enabled: false,
          subject: 'Ticket Due Soon: {{ticketNumber}}',
          body: 'Hello {{agentName}},\n\nThe following ticket is approaching its due date.\n\nTicket Number: {{ticketNumber}}\nStudent: {{studentName}}\nSubject: {{ticketSubject}}\nDue Date: {{dueDate}}\nTime Remaining: {{timeRemaining}}\n\nPlease prioritize this ticket.\n\nThank you!',
          recipients: 'agent'
        }
      },
      
      // Ticket Overdue
      ticketOverdue: {
        type: emailTriggerSchema,
        default: {
          name: 'Ticket Overdue',
          enabled: false,
          subject: 'OVERDUE: Ticket Past Due Date - {{ticketNumber}}',
          body: 'Hello {{agentName}},\n\nThe following ticket is now OVERDUE.\n\nTicket Number: {{ticketNumber}}\nStudent: {{studentName}}\nSubject: {{ticketSubject}}\nDue Date: {{dueDate}}\nTime Overdue: {{timeOverdue}}\n\nImmediate action required!\n\nThank you!',
          recipients: 'agent'
        }
      },
      
      // Student Welcome
      studentWelcome: {
        type: emailTriggerSchema,
        default: {
          name: 'Student Welcome Email',
          enabled: false,
          subject: 'Welcome to {{projectName}}',
          body: 'Hello {{studentName}},\n\nWelcome to {{projectName}}!\n\nYour account has been created. You can now login and track your tickets.\n\nPortal URL: {{portalUrl}}\nEmail: {{studentEmail}}\n\nThank you!',
          recipients: 'student'
        }
      },
      
      // Student OTP
      studentOTP: {
        type: emailTriggerSchema,
        default: {
          name: 'Student OTP for Login',
          enabled: false,
          subject: 'Your OTP for {{projectName}}',
          body: 'Hello {{studentName}},\n\nYour OTP for login is: {{otp}}\n\nThis OTP is valid for 10 minutes.\n\nIf you did not request this, please ignore this email.\n\nThank you!',
          recipients: 'student'
        }
      },
    },
  },
  { timestamps: true }
);

// Pre-save hook to encrypt SMTP password
emailConfigSchema.pre('save', function(next) {
  // Check if smtpPassword is modified and not empty
  if (this.isModified('smtpPassword') && this.smtpPassword) {
    // Only encrypt if not already encrypted
    if (!isEncrypted(this.smtpPassword)) {
      try {
        this.smtpPassword = encrypt(this.smtpPassword);
        console.log('🔐 SMTP password encrypted before save');
      } catch (error) {
        console.error('Failed to encrypt SMTP password:', error);
        return next(error as Error);
      }
    }
  }
  next();
});

// Virtual getter to decrypt password when accessed
// Note: This adds a method, not replacing the field
emailConfigSchema.methods.getDecryptedPassword = function(): string {
  if (!this.smtpPassword) return '';
  
  try {
    return decrypt(this.smtpPassword);
  } catch (error) {
    console.error('Failed to decrypt SMTP password:', error);
    return '';
  }
};

// Static method to get config with decrypted password
emailConfigSchema.statics.findWithDecryptedPassword = async function(query: any) {
  const config = await this.findOne(query);
  if (config && config.smtpPassword) {
    try {
      // Create a copy with decrypted password for use
      const decryptedConfig = config.toObject();
      decryptedConfig.smtpPassword = decrypt(config.smtpPassword);
      return decryptedConfig;
    } catch (error) {
      console.error('Failed to decrypt password in findWithDecryptedPassword:', error);
      return config;
    }
  }
  return config;
};

export default mongoose.model<IEmailConfig>('EmailConfig', emailConfigSchema);
