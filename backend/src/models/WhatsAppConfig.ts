import mongoose, { Schema, Document } from 'mongoose';
import { encrypt, decrypt, isEncrypted } from '../utils/encryption';

/**
 * WhatsApp Trigger Interface
 * Each trigger maps to a pre-approved WhatsApp template
 * 
 * IMPORTANT: Each template has its own unique Number ID that is issued
 * after WhatsApp approval. This Number ID goes in the API URL path.
 */
export interface IWhatsAppTrigger {
  name: string;                    // Display name: "Ticket Created - Student"
  enabled: boolean;                // Is this trigger active?
  numberId: string;                // Pre-approved Number ID for this template (goes in URL)
  templateName: string;            // Pre-approved WhatsApp template name
  templateLanguage: string;        // Language code: "en", "hi", etc.
  recipients: 'student' | 'agent' | 'both' | 'custom';
  customRecipients?: string[];
}

/**
 * WhatsApp Configuration Interface
 * Stores API credentials and all message triggers for a project
 * 
 * API URL Format: {apiBaseUrl}/{numberId}/messages
 * Example: https://crmapi.wa0.in/api/meta/v19.0/952415067947914/messages
 */
export interface IWhatsAppConfig extends Document {
  projectId: mongoose.Types.ObjectId;
  enabled: boolean; // Master enable/disable switch

  // WhatsApp API Configuration (shared for all triggers)
  apiBaseUrl: string;              // Base URL: https://crmapi.wa0.in/api/meta/v19.0
  accessToken: string;             // Encrypted API access token

  // All triggers - each has its own numberId
  triggers: {
    // Account & User Management
    accountCreated: IWhatsAppTrigger;
    passwordReset: IWhatsAppTrigger;

    // Ticket Creation
    ticketCreatedStudent: IWhatsAppTrigger;
    ticketCreatedAgent: IWhatsAppTrigger;
    ticketCreatedOnline: IWhatsAppTrigger;
    ticketCreatedOffline: IWhatsAppTrigger;
    ticketCreatedEmail: IWhatsAppTrigger;

    // Ticket Assignment & Escalation
    ticketAssigned: IWhatsAppTrigger;
    ticketEscalated: IWhatsAppTrigger;
    ticketReassigned: IWhatsAppTrigger;

    // Ticket Status Updates
    ticketStatusChanged: IWhatsAppTrigger;
    ticketClosed: IWhatsAppTrigger;
    ticketRejected: IWhatsAppTrigger;
    ticketReopened: IWhatsAppTrigger;

    // Ticket Interactions
    ticketCommentAdded: IWhatsAppTrigger;
    ticketReplied: IWhatsAppTrigger;

    // Reminders & Notifications
    ticketReminderAgent24hrs: IWhatsAppTrigger;
    ticketReminderAgent48hrs: IWhatsAppTrigger;
    ticketDueSoon: IWhatsAppTrigger;
    ticketOverdue: IWhatsAppTrigger;

    // Student/User Communications
    studentWelcome: IWhatsAppTrigger;
    studentOTP: IWhatsAppTrigger;
  };

  createdAt: Date;
  updatedAt: Date;

  // Instance methods
  getDecryptedAccessToken(): string;
}

const whatsappTriggerSchema = new Schema({
  name: { type: String, required: true },
  enabled: { type: Boolean, default: false },
  numberId: { type: String, default: '' },          // Pre-approved Number ID from WhatsApp
  templateName: { type: String, default: '' },      // Pre-approved template name
  templateLanguage: { type: String, default: 'en' },
  recipients: {
    type: String,
    enum: ['student', 'agent', 'both', 'custom'],
    default: 'student'
  },
  customRecipients: [{ type: String }],
});

const whatsappConfigSchema = new Schema(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      unique: true
    },
    enabled: { type: Boolean, default: false },

    // WhatsApp API Configuration
    apiBaseUrl: { type: String, default: 'https://crmapi.wa0.in/api/meta/v19.0' },
    accessToken: { type: String, default: 'L4wesU3dPeuBZtWueijaXMOWhMmHCuwKcQUiv3SMkREFTSA55DmVOg1O02E9mc9B8hQ6gozYCVd7WdTwLSBSJKbIPeSq1cumJwvEF7CREFTSAVyvtJ7yl5mFt2uETc6Vh92xY' },

    // Pre-defined triggers with defaults - each has numberId
    triggers: {
      // Account & User Management
      accountCreated: {
        type: whatsappTriggerSchema,
        default: {
          name: 'Account Created',
          enabled: false,
          numberId: '',
          templateName: '',
          templateLanguage: 'en',
          recipients: 'student'
        }
      },
      passwordReset: {
        type: whatsappTriggerSchema,
        default: {
          name: 'Password Reset',
          enabled: false,
          numberId: '',
          templateName: '',
          templateLanguage: 'en',
          recipients: 'student'
        }
      },

      // Ticket Creation - Student Notification
      ticketCreatedStudent: {
        type: whatsappTriggerSchema,
        default: {
          name: 'Ticket Created - Student Notification',
          enabled: false,
          numberId: '',
          templateName: '',
          templateLanguage: 'en',
          recipients: 'student'
        }
      },

      // Ticket Creation - Agent Notification
      ticketCreatedAgent: {
        type: whatsappTriggerSchema,
        default: {
          name: 'Ticket Created - Agent Notification',
          enabled: false,
          numberId: '',
          templateName: '',
          templateLanguage: 'en',
          recipients: 'agent'
        }
      },

      // Ticket Created Online
      ticketCreatedOnline: {
        type: whatsappTriggerSchema,
        default: {
          name: 'Ticket Created - Online Portal',
          enabled: false,
          numberId: '',
          templateName: '',
          templateLanguage: 'en',
          recipients: 'student'
        }
      },

      // Ticket Created Offline
      ticketCreatedOffline: {
        type: whatsappTriggerSchema,
        default: {
          name: 'Ticket Created - Offline/Walk-in',
          enabled: false,
          numberId: '',
          templateName: '',
          templateLanguage: 'en',
          recipients: 'student'
        }
      },

      // Ticket Created via Email
      ticketCreatedEmail: {
        type: whatsappTriggerSchema,
        default: {
          name: 'Ticket Created - Email Channel',
          enabled: false,
          numberId: '',
          templateName: '',
          templateLanguage: 'en',
          recipients: 'student'
        }
      },

      // Ticket Assigned
      ticketAssigned: {
        type: whatsappTriggerSchema,
        default: {
          name: 'Ticket Assigned',
          enabled: false,
          numberId: '',
          templateName: '',
          templateLanguage: 'en',
          recipients: 'agent'
        }
      },

      // Ticket Escalated
      ticketEscalated: {
        type: whatsappTriggerSchema,
        default: {
          name: 'Ticket Escalated',
          enabled: false,
          numberId: '',
          templateName: '',
          templateLanguage: 'en',
          recipients: 'both'
        }
      },

      // Ticket Reassigned
      ticketReassigned: {
        type: whatsappTriggerSchema,
        default: {
          name: 'Ticket Reassigned',
          enabled: false,
          numberId: '',
          templateName: '',
          templateLanguage: 'en',
          recipients: 'agent'
        }
      },

      // Ticket Status Changed
      ticketStatusChanged: {
        type: whatsappTriggerSchema,
        default: {
          name: 'Ticket Status Changed',
          enabled: false,
          numberId: '',
          templateName: '',
          templateLanguage: 'en',
          recipients: 'student'
        }
      },

      // Ticket Closed
      ticketClosed: {
        type: whatsappTriggerSchema,
        default: {
          name: 'Ticket Closed',
          enabled: false,
          numberId: '',
          templateName: '',
          templateLanguage: 'en',
          recipients: 'student'
        }
      },

      // Ticket Rejected
      ticketRejected: {
        type: whatsappTriggerSchema,
        default: {
          name: 'Ticket Rejected',
          enabled: false,
          numberId: '',
          templateName: '',
          templateLanguage: 'en',
          recipients: 'student'
        }
      },

      // Ticket Reopened
      ticketReopened: {
        type: whatsappTriggerSchema,
        default: {
          name: 'Ticket Reopened',
          enabled: false,
          numberId: '',
          templateName: '',
          templateLanguage: 'en',
          recipients: 'both'
        }
      },

      // Ticket Comment Added
      ticketCommentAdded: {
        type: whatsappTriggerSchema,
        default: {
          name: 'Ticket Comment Added',
          enabled: false,
          numberId: '',
          templateName: '',
          templateLanguage: 'en',
          recipients: 'student'
        }
      },

      // Ticket Replied
      ticketReplied: {
        type: whatsappTriggerSchema,
        default: {
          name: 'Ticket Reply Received',
          enabled: false,
          numberId: '',
          templateName: '',
          templateLanguage: 'en',
          recipients: 'agent'
        }
      },

      // Ticket Reminder - 24hrs
      ticketReminderAgent24hrs: {
        type: whatsappTriggerSchema,
        default: {
          name: 'Ticket Reminder - 24 Hours',
          enabled: false,
          numberId: '',
          templateName: '',
          templateLanguage: 'en',
          recipients: 'agent'
        }
      },

      // Ticket Reminder - 48hrs
      ticketReminderAgent48hrs: {
        type: whatsappTriggerSchema,
        default: {
          name: 'Ticket Reminder - 48 Hours',
          enabled: false,
          numberId: '',
          templateName: '',
          templateLanguage: 'en',
          recipients: 'agent'
        }
      },

      // Ticket Due Soon
      ticketDueSoon: {
        type: whatsappTriggerSchema,
        default: {
          name: 'Ticket Due Soon',
          enabled: false,
          numberId: '',
          templateName: '',
          templateLanguage: 'en',
          recipients: 'agent'
        }
      },

      // Ticket Overdue
      ticketOverdue: {
        type: whatsappTriggerSchema,
        default: {
          name: 'Ticket Overdue',
          enabled: false,
          numberId: '',
          templateName: '',
          templateLanguage: 'en',
          recipients: 'both'
        }
      },

      // Student Welcome
      studentWelcome: {
        type: whatsappTriggerSchema,
        default: {
          name: 'Student Welcome Message',
          enabled: false,
          numberId: '',
          templateName: '',
          templateLanguage: 'en',
          recipients: 'student'
        }
      },

      // Student OTP
      studentOTP: {
        type: whatsappTriggerSchema,
        default: {
          name: 'Student OTP Verification',
          enabled: false,
          numberId: '',
          templateName: '',
          templateLanguage: 'en',
          recipients: 'student'
        }
      },
    },
  },
  { timestamps: true }
);

// Pre-save hook to encrypt access token
whatsappConfigSchema.pre('save', function (next) {
  if (this.isModified('accessToken') && this.accessToken) {
    // Check if already encrypted
    if (!isEncrypted(this.accessToken)) {
      try {
        this.accessToken = encrypt(this.accessToken);
      } catch (error) {
        return next(error as Error);
      }
    }
  }
  next();
});

// Method to get decrypted access token
whatsappConfigSchema.methods.getDecryptedAccessToken = function (): string {
  if (!this.accessToken) return '';

  try {
    if (isEncrypted(this.accessToken)) {
      return decrypt(this.accessToken);
    }
    return this.accessToken;
  } catch (error) {
    console.error('Failed to decrypt WhatsApp access token:', error);
    return '';
  }
};

// Index for faster lookups
whatsappConfigSchema.index({ projectId: 1 });

export default mongoose.model<IWhatsAppConfig>('WhatsAppConfig', whatsappConfigSchema);
