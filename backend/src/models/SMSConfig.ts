import mongoose, { Schema, Document } from "mongoose";
import { encrypt, decrypt, isEncrypted } from "../utils/encryption";

export interface ISMSTrigger {
  name: string;
  enabled: boolean;
  template: string; // The SMS message text
  recipients: "student" | "agent" | "both" | "custom";
  customRecipients?: string[];
  dltContentId?: string; // DLT Content Template ID (required by TRAI for India)
  dltTemplateId?: string; // DLT Template Mapping ID
}

export interface ISMSConfig extends Document {
  projectId: mongoose.Types.ObjectId;
  enabled: boolean; // Master toggle

  // Vendor Configuration
  vendor: "gupshup" | "ttbs" | "custom";
  apiUrl: string; // Full API endpoint URL
  usernameParamName: string; // e.g. 'userid' (Gupshup), 'username' (TTBS)
  passwordParamName: string; // e.g. 'password'
  phoneParamName: string; // e.g. 'send_to' (Gupshup), 'mobile' (TTBS)
  messageParamName: string; // e.g. 'msg' (Gupshup), 'message' (TTBS)
  senderIdParamName: string; // e.g. 'senderid' (TTBS)
  senderId: string; // DLT registered sender/header ID
  peid: string; // DLT Principal Entity ID (TRAI requirement)
  extraStaticParams: string; // JSON string of fixed params appended to every request
  successPattern: string; // Substring to detect success in API response

  // Credentials
  userId: string;
  password: string; // Encrypted

  // Triggers (matching Email and WhatsApp for consistency)
  triggers: {
    // Account & User Management
    accountCreated: ISMSTrigger;
    passwordReset: ISMSTrigger;

    // Ticket Creation
    ticketCreatedStudent: ISMSTrigger;
    ticketCreatedAgent: ISMSTrigger;
    ticketCreatedOnline: ISMSTrigger;
    ticketCreatedOffline: ISMSTrigger;
    ticketCreatedEmail: ISMSTrigger;

    // Ticket Assignment & Escalation
    ticketAssigned: ISMSTrigger;
    ticketEscalated: ISMSTrigger;
    ticketReassigned: ISMSTrigger;

    // Ticket Status Updates
    ticketStatusChanged: ISMSTrigger;
    ticketClosed: ISMSTrigger;
    ticketRejected: ISMSTrigger;
    ticketReopened: ISMSTrigger;

    // Ticket Interactions
    ticketCommentAdded: ISMSTrigger;
    ticketReplied: ISMSTrigger;

    // Reminders & Notifications
    ticketReminderAgent24hrs: ISMSTrigger;
    ticketReminderAgent48hrs: ISMSTrigger;
    ticketDueSoon: ISMSTrigger;
    ticketOverdue: ISMSTrigger;

    // Student/User Communications
    studentWelcome: ISMSTrigger;
    studentOTP: ISMSTrigger;
  };

  createdAt: Date;
  updatedAt: Date;

  getDecryptedPassword(): string;
}

const smsTriggerSchema = new Schema({
  name: { type: String, required: true },
  enabled: { type: Boolean, default: false },
  template: { type: String, default: "" },
  recipients: {
    type: String,
    enum: ["student", "agent", "both", "custom"],
    default: "student",
  },
  customRecipients: [{ type: String }],
  dltContentId: { type: String, default: "" }, // DLT Content Template ID
  dltTemplateId: { type: String, default: "" }, // DLT Template Mapping ID
});

const smsConfigSchema = new Schema(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      unique: true,
    },
    enabled: { type: Boolean, default: false },

    // Vendor Configuration
    vendor: {
      type: String,
      enum: ["gupshup", "ttbs", "custom"],
      default: "gupshup",
    },
    apiUrl: {
      type: String,
      default: "https://enterpriseapi.smsgupshup.com/GatewayAPI/rest",
    },
    usernameParamName: { type: String, default: "userid" },
    passwordParamName: { type: String, default: "password" },
    phoneParamName: { type: String, default: "send_to" },
    messageParamName: { type: String, default: "msg" },
    senderIdParamName: { type: String, default: "" },
    senderId: { type: String, default: "" },
    peid: { type: String, default: "" },
    extraStaticParams: {
      type: String,
      default:
        '{"method":"SendMessage","msg_type":"TEXT","auth_scheme":"plain","v":"1.1","format":"text"}',
    },
    successPattern: { type: String, default: "success" },

    // Credentials
    userId: { type: String, default: "" },
    password: { type: String, default: "" },

    triggers: {
      accountCreated: {
        type: smsTriggerSchema,
        default: {
          name: "Account Created",
          enabled: false,
          template:
            "Welcome to {{projectName}}! Your account has been created. Login: {{loginUrl}}",
          recipients: "student",
        },
      },
      passwordReset: {
        type: smsTriggerSchema,
        default: {
          name: "Password Reset",
          enabled: false,
          template:
            "Your password reset link for {{projectName}}: {{resetLink}}",
          recipients: "student",
        },
      },
      studentOTP: {
        type: smsTriggerSchema,
        default: {
          name: "Student OTP Verification",
          enabled: false,
          template: "{{otp}} is your verification code for {{projectName}}.",
          recipients: "student",
        },
      },
      ticketCreatedStudent: {
        type: smsTriggerSchema,
        default: {
          name: "Ticket Created - Student",
          enabled: false,
          template:
            "Ticket #{{ticketNumber}} created: {{ticketSubject}}. We will update you soon.",
          recipients: "student",
        },
      },
      ticketCreatedAgent: {
        type: smsTriggerSchema,
        default: {
          name: "Ticket Created - Agent",
          enabled: false,
          template:
            "New Ticket #{{ticketNumber}} assigned. Subject: {{ticketSubject}}.",
          recipients: "agent",
        },
      },
      ticketAssigned: {
        type: smsTriggerSchema,
        default: {
          name: "Ticket Assigned",
          enabled: false,
          template: "Ticket #{{ticketNumber}} has been assigned to you.",
          recipients: "agent",
        },
      },
      ticketStatusChanged: {
        type: smsTriggerSchema,
        default: {
          name: "Ticket Status Update",
          enabled: false,
          template: "Ticket #{{ticketNumber}} status updated to {{newStatus}}.",
          recipients: "student",
        },
      },
      ticketClosed: {
        type: smsTriggerSchema,
        default: {
          name: "Ticket Closed",
          enabled: false,
          template: "Ticket #{{ticketNumber}} has been closed. Thank you.",
          recipients: "student",
        },
      },
      ticketCommentAdded: {
        type: smsTriggerSchema,
        default: {
          name: "New Comment on Ticket",
          enabled: false,
          template: "New comment on Ticket #{{ticketNumber}}: {{commentText}}",
          recipients: "student",
        },
      },
      // New triggers to match Email and WhatsApp
      ticketCreatedOnline: {
        type: smsTriggerSchema,
        default: {
          name: "Ticket Created - Online",
          enabled: false,
          template:
            "Online ticket #{{ticketNumber}} created: {{ticketSubject}}",
          recipients: "student",
        },
      },
      ticketCreatedOffline: {
        type: smsTriggerSchema,
        default: {
          name: "Ticket Created - Offline",
          enabled: false,
          template:
            "Offline ticket #{{ticketNumber}} created: {{ticketSubject}}",
          recipients: "student",
        },
      },
      ticketCreatedEmail: {
        type: smsTriggerSchema,
        default: {
          name: "Ticket Created - Email",
          enabled: false,
          template: "Email ticket #{{ticketNumber}} created: {{ticketSubject}}",
          recipients: "student",
        },
      },
      ticketEscalated: {
        type: smsTriggerSchema,
        default: {
          name: "Ticket Escalated",
          enabled: false,
          template:
            "Ticket #{{ticketNumber}} has been escalated to {{escalatedTo}}.",
          recipients: "agent",
        },
      },
      ticketReassigned: {
        type: smsTriggerSchema,
        default: {
          name: "Ticket Reassigned",
          enabled: false,
          template: "Ticket #{{ticketNumber}} has been reassigned to you.",
          recipients: "agent",
        },
      },
      ticketRejected: {
        type: smsTriggerSchema,
        default: {
          name: "Ticket Rejected",
          enabled: false,
          template:
            "Ticket #{{ticketNumber}} has been rejected. Reason: {{reason}}",
          recipients: "student",
        },
      },
      ticketReopened: {
        type: smsTriggerSchema,
        default: {
          name: "Ticket Reopened",
          enabled: false,
          template: "Ticket #{{ticketNumber}} has been reopened.",
          recipients: "student",
        },
      },
      ticketReplied: {
        type: smsTriggerSchema,
        default: {
          name: "Ticket Reply",
          enabled: false,
          template: "New reply on Ticket #{{ticketNumber}}.",
          recipients: "student",
        },
      },
      ticketReminderAgent24hrs: {
        type: smsTriggerSchema,
        default: {
          name: "Ticket Reminder - 24hrs",
          enabled: false,
          template:
            "Reminder: Ticket #{{ticketNumber}} needs attention (pending 24hrs).",
          recipients: "agent",
        },
      },
      ticketReminderAgent48hrs: {
        type: smsTriggerSchema,
        default: {
          name: "Ticket Reminder - 48hrs",
          enabled: false,
          template: "Urgent: Ticket #{{ticketNumber}} pending for 48hrs.",
          recipients: "agent",
        },
      },
      ticketDueSoon: {
        type: smsTriggerSchema,
        default: {
          name: "Ticket Due Soon",
          enabled: false,
          template: "Ticket #{{ticketNumber}} is due soon.",
          recipients: "agent",
        },
      },
      ticketOverdue: {
        type: smsTriggerSchema,
        default: {
          name: "Ticket Overdue",
          enabled: false,
          template: "Ticket #{{ticketNumber}} is overdue!",
          recipients: "agent",
        },
      },
      studentWelcome: {
        type: smsTriggerSchema,
        default: {
          name: "Student Welcome",
          enabled: false,
          template:
            "Welcome to {{projectName}}! Your account is ready. Login: {{loginUrl}}",
          recipients: "student",
        },
      },
    },
  },
  { timestamps: true },
);

// Pre-save hook to encrypt password
smsConfigSchema.pre("save", function (next) {
  if (this.isModified("password") && this.password) {
    if (!isEncrypted(this.password)) {
      try {
        this.password = encrypt(this.password);
      } catch (error) {
        return next(error as Error);
      }
    }
  }
  next();
});

smsConfigSchema.methods.getDecryptedPassword = function (): string {
  if (!this.password) return "";
  try {
    return decrypt(this.password);
  } catch (error) {
    console.error("Failed to decrypt SMS password:", error);
    return "";
  }
};

export default mongoose.model<ISMSConfig>("SMSConfig", smsConfigSchema);
