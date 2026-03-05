import axios from "axios";
import https from "https";
import WhatsAppConfig, {
  IWhatsAppConfig,
  IWhatsAppTrigger,
} from "../models/WhatsAppConfig";
import WhatsAppLog from "../models/WhatsAppLog";
import { Project } from "../models/Project";

/**
 * WhatsApp Service for sending template messages
 *
 * API URL Format: {apiBaseUrl}/{numberId}/messages
 * Example: https://crmapi.wa0.in/api/meta/v19.0/952415067947914/messages
 *
 * Each template has its own pre-approved numberId that goes in the URL path.
 */

/**
 * Template parameter type for WhatsApp API
 */
interface TemplateParameter {
  type: "text";
  text: string;
}

/**
 * Template component for button parameters
 */
interface ButtonComponent {
  type: "button";
  sub_type: "url" | "quick_reply";
  index: number;
  parameters: TemplateParameter[];
}

/**
 * Template component for body parameters
 */
interface BodyComponent {
  type: "body";
  parameters: TemplateParameter[];
}

type TemplateComponent = BodyComponent | ButtonComponent;

/**
 * WhatsApp API Request Body
 */
interface WhatsAppRequestBody {
  messaging_product: "whatsapp";
  to: string;
  recipient_type: "individual";
  type: "template";
  template: {
    language: {
      policy: "deterministic";
      code: string;
    };
    name: string;
    components?: TemplateComponent[];
  };
}

/**
 * WhatsApp API Response Types
 */
interface WhatsAppAPIResponse {
  messages: Array<{
    id: string; // This is the WAMID
  }>;
}

interface WhatsAppAPIError {
  error: {
    message: string;
    type: string;
    code: number;
  };
}

/**
 * Template variables reference for each trigger type
 * These define the order of {{1}}, {{2}}, etc. in the WhatsApp template
 */
export const TRIGGER_TEMPLATE_VARIABLES: Record<
  string,
  { name: string; description: string }[]
> = {
  accountCreated: [
    { name: "studentName", description: "Student's full name" },
    { name: "email", description: "Student's email address" },
    { name: "loginUrl", description: "Login page URL" },
  ],
  passwordReset: [
    { name: "userName", description: "User's full name" },
    { name: "resetLink", description: "Password reset link" },
  ],
  ticketCreatedStudent: [
    { name: "studentName", description: "Student's full name" },
    {
      name: "ticketNumber",
      description: "Ticket number (e.g., MHCET-2025-0001)",
    },
    { name: "ticketSubject", description: "Ticket subject/title" },
    { name: "ticketStatus", description: "Current ticket status" },
  ],
  ticketCreatedAgent: [
    { name: "agentName", description: "Agent's full name" },
    { name: "ticketNumber", description: "Ticket number" },
    { name: "studentName", description: "Student's name" },
    { name: "ticketSubject", description: "Ticket subject/title" },
    { name: "ticketPriority", description: "Ticket priority level" },
  ],
  ticketCreatedOnline: [
    { name: "studentName", description: "Student's full name" },
    { name: "ticketNumber", description: "Ticket number" },
    { name: "ticketSubject", description: "Ticket subject/title" },
  ],
  ticketCreatedOffline: [
    { name: "studentName", description: "Student's full name" },
    { name: "ticketNumber", description: "Ticket number" },
    { name: "ticketSubject", description: "Ticket subject/title" },
  ],
  ticketCreatedEmail: [
    { name: "studentName", description: "Student's full name" },
    { name: "ticketNumber", description: "Ticket number" },
    { name: "ticketSubject", description: "Ticket subject/title" },
  ],
  ticketAssigned: [
    { name: "agentName", description: "Assigned agent's name" },
    { name: "ticketNumber", description: "Ticket number" },
    { name: "ticketSubject", description: "Ticket subject/title" },
    { name: "studentName", description: "Student's name" },
  ],
  ticketEscalated: [
    { name: "recipientName", description: "Recipient's name" },
    { name: "ticketNumber", description: "Ticket number" },
    { name: "escalatedTo", description: "Escalated to (person/team)" },
    { name: "reason", description: "Escalation reason" },
  ],
  ticketReassigned: [
    { name: "newAgentName", description: "New agent's name" },
    { name: "ticketNumber", description: "Ticket number" },
    { name: "ticketSubject", description: "Ticket subject/title" },
    { name: "previousAgentName", description: "Previous agent's name" },
  ],
  ticketStatusChanged: [
    { name: "studentName", description: "Student's full name" },
    { name: "ticketNumber", description: "Ticket number" },
    { name: "newStatus", description: "New ticket status" },
    { name: "previousStatus", description: "Previous ticket status" },
  ],
  ticketClosed: [
    { name: "studentName", description: "Student's full name" },
    { name: "ticketNumber", description: "Ticket number" },
    { name: "resolution", description: "Resolution summary" },
  ],
  ticketRejected: [
    { name: "studentName", description: "Student's full name" },
    { name: "ticketNumber", description: "Ticket number" },
    { name: "reason", description: "Rejection reason" },
  ],
  ticketReopened: [
    { name: "recipientName", description: "Recipient's name" },
    { name: "ticketNumber", description: "Ticket number" },
    { name: "reopenReason", description: "Reason for reopening" },
  ],
  ticketCommentAdded: [
    { name: "studentName", description: "Student's full name" },
    { name: "ticketNumber", description: "Ticket number" },
    { name: "commentBy", description: "Name of commenter" },
  ],
  ticketReplied: [
    { name: "agentName", description: "Agent's full name" },
    { name: "ticketNumber", description: "Ticket number" },
    { name: "studentName", description: "Student's name" },
  ],
  ticketReminderAgent24hrs: [
    { name: "agentName", description: "Agent's full name" },
    { name: "ticketNumber", description: "Ticket number" },
    { name: "ticketSubject", description: "Ticket subject/title" },
    { name: "hours", description: "Hours pending" },
  ],
  ticketReminderAgent48hrs: [
    { name: "agentName", description: "Agent's full name" },
    { name: "ticketNumber", description: "Ticket number" },
    { name: "ticketSubject", description: "Ticket subject/title" },
    { name: "hours", description: "Hours pending" },
  ],
  ticketDueSoon: [
    { name: "agentName", description: "Agent's full name" },
    { name: "ticketNumber", description: "Ticket number" },
    { name: "dueTime", description: "Due time/date" },
  ],
  ticketOverdue: [
    { name: "recipientName", description: "Recipient's name" },
    { name: "ticketNumber", description: "Ticket number" },
    { name: "overdueBy", description: "Time overdue by" },
  ],
  studentWelcome: [
    { name: "studentName", description: "Student's full name" },
    { name: "portalUrl", description: "Portal URL" },
  ],
  studentOTP: [{ name: "otpCode", description: "6-digit OTP code" }],
};

/**
 * Log a WhatsApp message attempt
 */
const logWhatsAppMessage = async (params: {
  projectId?: string;
  projectName?: string;
  recipient: string;
  templateName: string;
  templateLanguage?: string;
  status: "sent" | "delivered" | "read" | "failed" | "blocked" | "simulated";
  error?: string;
  whatsappMessageId?: string;
  triggerType?: string;
  triggerName?: string;
  metadata?: Record<string, any>;
}): Promise<void> => {
  try {
    const log = new WhatsAppLog({
      projectId: params.projectId,
      projectName: params.projectName,
      recipient: params.recipient,
      templateName: params.templateName,
      templateLanguage: params.templateLanguage || "en",
      status: params.status,
      error: params.error,
      whatsappMessageId: params.whatsappMessageId,
      triggerType: params.triggerType,
      triggerName: params.triggerName,
      metadata: params.metadata,
      sentAt: new Date(),
    });
    await log.save();
  } catch (err) {
    // Never throw from logging - just log to console
    console.error("Failed to save WhatsApp log:", err);
  }
};

/**
 * Format phone number for WhatsApp API
 * Removes +, spaces, dashes and ensures proper format (just digits)
 */
const formatPhoneNumber = (phone: string): string => {
  // Remove all non-digit characters
  return phone.replace(/\D/g, "");
};

/**
 * Send a WhatsApp template message
 *
 * @param numberId - Pre-approved Number ID for this template (goes in URL path)
 * @param phoneNumber - Recipient phone number with country code
 * @param templateName - Pre-approved template name
 * @param templateLanguage - Language code (e.g., 'en', 'hi')
 * @param bodyParameters - Ordered list of body template parameters
 * @param buttonParameters - Optional button parameters (for URL buttons)
 * @param config - WhatsApp config document with API settings
 * @param projectId - Project ID for logging
 * @param options - Additional options
 * @returns Result with success status and message ID
 */
export const sendWhatsAppTemplateMessage = async (
  numberId: string,
  phoneNumber: string,
  templateName: string,
  templateLanguage: string,
  bodyParameters: TemplateParameter[],
  buttonParameters: TemplateParameter[] | null,
  config: IWhatsAppConfig,
  projectId: string,
  options?: {
    triggerType?: string;
    triggerName?: string;
    metadata?: Record<string, any>;
  },
): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  const triggerType = options?.triggerType || "other";
  const triggerName = options?.triggerName || "";
  const metadata = options?.metadata || {};

  try {
    // Get project name for logging
    let projectName = "";
    try {
      const project = await Project.findById(projectId);
      projectName = project?.name || "";
    } catch (e) {
      // Ignore error, just won't have project name in log
    }

    // Check if API is configured
    if (!config || !config.apiBaseUrl || !config.accessToken) {
      // Log as simulated when config is not set
      await logWhatsAppMessage({
        projectId,
        projectName,
        recipient: phoneNumber,
        templateName,
        templateLanguage,
        status: "simulated",
        triggerType,
        triggerName,
        metadata: { ...metadata, reason: "WhatsApp API not configured" },
      });

      console.log(
        `📱 [SIMULATED] WhatsApp message to ${phoneNumber} using template: ${templateName}`,
      );
      return { success: true };
    }

    // Check if numberId is provided
    if (!numberId) {
      await logWhatsAppMessage({
        projectId,
        projectName,
        recipient: phoneNumber,
        templateName,
        templateLanguage,
        status: "failed",
        error: "Number ID not configured for this template",
        triggerType,
        triggerName,
        metadata,
      });
      return {
        success: false,
        error: "Number ID not configured for this template",
      };
    }

    // Get decrypted access token
    const accessToken = config.getDecryptedAccessToken();
    if (!accessToken) {
      throw new Error("Failed to decrypt WhatsApp access token");
    }

    // Format phone number
    const formattedPhone = formatPhoneNumber(phoneNumber);
    if (!formattedPhone || formattedPhone.length < 10) {
      throw new Error("Invalid phone number format");
    }

    // Build request body matching your API format
    const requestBody: WhatsAppRequestBody = {
      messaging_product: "whatsapp",
      to: formattedPhone,
      recipient_type: "individual",
      type: "template",
      template: {
        language: {
          policy: "deterministic",
          code: templateLanguage,
        },
        name: templateName,
      },
    };

    // Add components if there are parameters
    const components: TemplateComponent[] = [];

    if (bodyParameters && bodyParameters.length > 0) {
      components.push({
        type: "body",
        parameters: bodyParameters,
      });
    }

    // Add button parameters if provided (for OTP or URL buttons)
    if (buttonParameters && buttonParameters.length > 0) {
      components.push({
        type: "button",
        sub_type: "url",
        index: 0,
        parameters: buttonParameters,
      });
    }

    if (components.length > 0) {
      requestBody.template.components = components;
    }

    // Build API URL: {apiBaseUrl}/{numberId}/messages
    // Normalize baseUrl - ensure it has a protocol prefix
    let baseUrl = config.apiBaseUrl.trim();
    if (
      baseUrl &&
      !baseUrl.startsWith("http://") &&
      !baseUrl.startsWith("https://")
    ) {
      baseUrl = `http://${baseUrl}`;
    }
    // Remove trailing slash before appending
    baseUrl = baseUrl.replace(/\/$/, "");
    const apiUrl = `${baseUrl}/${numberId}/messages`;

    console.log(`📱 Sending WhatsApp to ${formattedPhone} via ${apiUrl}`);
    console.log(`📱 Template: ${templateName}, Language: ${templateLanguage}`);

    // Send message via WhatsApp API
    // httpsAgent with rejectUnauthorized: false is required because the WhatsApp
    // gateway (crmapi.wa0.in) uses an intermediate CA not present in Node's
    // built-in certificate store, causing UNABLE_TO_VERIFY_LEAF_SIGNATURE errors.
    const httpsAgent = new https.Agent({ rejectUnauthorized: false });
    const response = await axios.post<WhatsAppAPIResponse>(
      apiUrl,
      requestBody,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        timeout: 30000, // 30 second timeout
        httpsAgent,
      },
    );

    // Debug: Log the full response
    console.log(
      "📱 WhatsApp API Response:",
      JSON.stringify(response.data, null, 2),
    );

    // Extract message ID - handle both standard Meta API format and CRM API format
    let messageId = response.data.messages?.[0]?.id; // Standard Meta format

    // Check for CRM API format (crmapi.wa0.in)
    if (!messageId && (response.data as any).message) {
      const crmMessage = (response.data as any).message;
      if (crmMessage.queue_id && crmMessage.message_status === "queued") {
        messageId = crmMessage.queue_id;
        console.log("📱 Message queued with queue_id:", messageId);
      }
    }

    // Check if we got a valid message ID
    if (!messageId) {
      const errorMsg =
        "WhatsApp API returned success but no message ID. Check your template name, parameters, and WhatsApp Business Account setup.";
      console.error("❌ " + errorMsg);
      console.error("Response data:", response.data);

      // Log as failed since we didn't get a message ID
      await logWhatsAppMessage({
        projectId,
        projectName,
        recipient: phoneNumber,
        templateName,
        templateLanguage,
        status: "failed",
        error: errorMsg,
        triggerType,
        triggerName,
        metadata: {
          ...metadata,
          numberId,
          templateParameters: bodyParameters.map((p) => p.text),
          responseData: response.data,
        },
      });

      return { success: false, error: errorMsg };
    }

    // Log success
    await logWhatsAppMessage({
      projectId,
      projectName,
      recipient: phoneNumber,
      templateName,
      templateLanguage,
      status: "sent",
      whatsappMessageId: messageId,
      triggerType,
      triggerName,
      metadata: {
        ...metadata,
        numberId,
        templateParameters: bodyParameters.map((p) => p.text),
      },
    });

    console.log(
      `✅ WhatsApp message sent to ${phoneNumber}, WAMID: ${messageId}`,
    );
    return { success: true, messageId };
  } catch (error: any) {
    // Extract error message
    let errorMessage = "Unknown error";

    if (axios.isAxiosError(error)) {
      const apiError = error.response?.data as WhatsAppAPIError;
      if (
        error.code === "ECONNREFUSED" ||
        error.code === "ENOTFOUND" ||
        error.code === "ETIMEDOUT"
      ) {
        const targetUrl = error.config?.url || config.apiBaseUrl;
        errorMessage = `Cannot connect to WhatsApp API server (${targetUrl}). Please verify the API Base URL in WhatsApp configuration is correct and the server is reachable.`;
      } else {
        errorMessage = apiError?.error?.message || error.message;
      }
      console.error("WhatsApp API error response:", error.response?.data);
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    // Log failure
    let projectName = "";
    try {
      const project = await Project.findById(projectId);
      projectName = project?.name || "";
    } catch (e) {
      // Ignore
    }

    await logWhatsAppMessage({
      projectId,
      projectName,
      recipient: phoneNumber,
      templateName,
      templateLanguage,
      status: "failed",
      error: errorMessage,
      triggerType,
      triggerName,
      metadata: { ...metadata, numberId },
    });

    console.error(
      `❌ WhatsApp message failed to ${phoneNumber}: ${errorMessage}`,
    );
    return { success: false, error: errorMessage };
  }
};

/**
 * Get sample parameters for testing a trigger
 */
export const getSampleParametersForTrigger = (
  triggerName: string,
): {
  bodyParams: TemplateParameter[];
  buttonParams: TemplateParameter[] | null;
} => {
  const sampleData: Record<string, { body: string[]; button?: string[] }> = {
    accountCreated: {
      body: [
        "John Doe",
        "john@example.com",
        "https://helpdesk.example.com/login",
      ],
    },
    passwordReset: {
      body: ["John Doe", "https://helpdesk.example.com/reset/abc123"],
    },
    ticketCreatedStudent: {
      body: ["John Doe", "TICKET-2025-0001", "Login Issue", "Open"],
    },
    ticketCreatedAgent: {
      body: [
        "Agent Smith",
        "TICKET-2025-0001",
        "John Doe",
        "Login Issue",
        "High",
      ],
    },
    ticketCreatedOnline: {
      body: ["John Doe", "TICKET-2025-0001", "Payment Issue"],
    },
    ticketCreatedOffline: {
      body: ["John Doe", "TICKET-2025-0001", "Document Request"],
    },
    ticketCreatedEmail: {
      body: ["John Doe", "TICKET-2025-0001", "Email Subject"],
    },
    ticketAssigned: {
      body: ["Agent Smith", "TICKET-2025-0001", "Login Issue", "John Doe"],
    },
    ticketEscalated: {
      body: [
        "Manager Jones",
        "TICKET-2025-0001",
        "Senior Support",
        "SLA Breach",
      ],
    },
    ticketReassigned: {
      body: ["Agent Johnson", "TICKET-2025-0001", "Login Issue", "Agent Smith"],
    },
    ticketStatusChanged: {
      body: ["John Doe", "TICKET-2025-0001", "In Progress", "Open"],
    },
    ticketClosed: {
      body: ["John Doe", "TICKET-2025-0001", "Issue resolved successfully"],
    },
    ticketRejected: {
      body: ["John Doe", "TICKET-2025-0001", "Duplicate ticket"],
    },
    ticketReopened: {
      body: [
        "Agent Smith",
        "TICKET-2025-0001",
        "Customer reported recurring issue",
      ],
    },
    ticketCommentAdded: {
      body: ["John Doe", "TICKET-2025-0001", "Agent Smith"],
    },
    ticketReplied: { body: ["Agent Smith", "TICKET-2025-0001", "John Doe"] },
    ticketReminderAgent24hrs: {
      body: ["Agent Smith", "TICKET-2025-0001", "Login Issue", "24"],
    },
    ticketReminderAgent48hrs: {
      body: ["Agent Smith", "TICKET-2025-0001", "Login Issue", "48"],
    },
    ticketDueSoon: { body: ["Agent Smith", "TICKET-2025-0001", "2 hours"] },
    ticketOverdue: { body: ["Agent Smith", "TICKET-2025-0001", "6 hours"] },
    studentWelcome: { body: ["John Doe", "https://helpdesk.example.com"] },
    studentOTP: { body: ["654321"], button: ["654321"] }, // OTP also goes in button for URL
  };

  const data = sampleData[triggerName] || { body: ["Sample Value"] };

  return {
    bodyParams: data.body.map((text) => ({ type: "text", text })),
    buttonParams: data.button
      ? data.button.map((text) => ({ type: "text", text }))
      : null,
  };
};

/**
 * Send a specific trigger's WhatsApp message
 * Validates trigger is enabled and configured before sending
 */
export const sendTriggerMessage = async (
  triggerName: string,
  projectId: string,
  phoneNumber: string,
  bodyParameters: TemplateParameter[],
  buttonParameters: TemplateParameter[] | null = null,
  metadata?: Record<string, any>,
): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  try {
    const config = await WhatsAppConfig.findOne({ projectId });

    if (!config) {
      return { success: false, error: "WhatsApp configuration not found" };
    }

    // Check if WhatsApp integration is enabled
    if (!config.enabled) {
      console.log(
        `⚠️  [WHATSAPP SERVICE] WhatsApp sending is disabled for project ${projectId}`,
      );
      // Log as blocked
      await logWhatsAppMessage({
        projectId,
        recipient: phoneNumber,
        templateName:
          (config.triggers as any)[triggerName]?.templateName || "unknown",
        status: "blocked",
        error: "WhatsApp integration is disabled",
        triggerType: triggerName.includes("ticket") ? "ticket" : "other",
        triggerName,
        metadata,
      });
      return { success: false, error: "WhatsApp integration is disabled" };
    }

    // Get the specific trigger
    const triggers = config.triggers as Record<string, IWhatsAppTrigger>;
    const trigger = triggers[triggerName];

    if (!trigger) {
      return { success: false, error: `Trigger '${triggerName}' not found` };
    }

    if (!trigger.enabled) {
      // Log as blocked
      await logWhatsAppMessage({
        projectId,
        recipient: phoneNumber,
        templateName: trigger.templateName || "unknown",
        status: "blocked",
        error: "Trigger is disabled",
        triggerType: triggerName.includes("ticket") ? "ticket" : "other",
        triggerName,
        metadata,
      });
      return { success: false, error: "Trigger is disabled" };
    }

    if (!trigger.numberId) {
      return {
        success: false,
        error: "Number ID not configured for this template",
      };
    }

    if (!trigger.templateName) {
      return { success: false, error: "Template name not configured" };
    }

    return await sendWhatsAppTemplateMessage(
      trigger.numberId,
      phoneNumber,
      trigger.templateName,
      trigger.templateLanguage || "en",
      bodyParameters,
      buttonParameters,
      config,
      projectId,
      {
        triggerType: triggerName.includes("ticket") ? "ticket" : "other",
        triggerName,
        metadata,
      },
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: errorMessage };
  }
};

// ============================================================================
// Specific trigger functions (convenience wrappers)
// ============================================================================

/**
 * Send ticket created notification to student
 */
export const sendTicketCreatedWhatsApp = async (
  projectId: string,
  phoneNumber: string,
  data: {
    studentName: string;
    ticketNumber: string;
    ticketSubject: string;
    ticketStatus: string;
  },
): Promise<{ success: boolean; error?: string }> => {
  const bodyParameters: TemplateParameter[] = [
    { type: "text", text: data.studentName },
    { type: "text", text: data.ticketNumber },
    { type: "text", text: data.ticketSubject },
    { type: "text", text: data.ticketStatus },
  ];

  return await sendTriggerMessage(
    "ticketCreatedStudent",
    projectId,
    phoneNumber,
    bodyParameters,
    null,
    { ticketNumber: data.ticketNumber, type: "ticket_created_student" },
  );
};

/**
 * Send OTP via WhatsApp
 * Note: OTP typically goes in both body and button (for URL copy)
 */
export const sendOTPWhatsApp = async (
  projectId: string,
  phoneNumber: string,
  otpCode: string,
): Promise<{ success: boolean; error?: string }> => {
  const bodyParameters: TemplateParameter[] = [{ type: "text", text: otpCode }];

  // OTP also goes in button for URL-based copy feature
  const buttonParameters: TemplateParameter[] = [
    { type: "text", text: otpCode },
  ];

  return await sendTriggerMessage(
    "studentOTP",
    projectId,
    phoneNumber,
    bodyParameters,
    buttonParameters,
    { type: "otp" },
  );
};

/**
 * Send ticket status change notification
 */
export const sendTicketStatusChangedWhatsApp = async (
  projectId: string,
  phoneNumber: string,
  data: {
    studentName: string;
    ticketNumber: string;
    newStatus: string;
    previousStatus: string;
  },
): Promise<{ success: boolean; error?: string }> => {
  const bodyParameters: TemplateParameter[] = [
    { type: "text", text: data.studentName },
    { type: "text", text: data.ticketNumber },
    { type: "text", text: data.newStatus },
    { type: "text", text: data.previousStatus },
  ];

  return await sendTriggerMessage(
    "ticketStatusChanged",
    projectId,
    phoneNumber,
    bodyParameters,
    null,
    { ticketNumber: data.ticketNumber, type: "ticket_status_changed" },
  );
};

/**
 * Send ticket closed notification
 */
export const sendTicketClosedWhatsApp = async (
  projectId: string,
  phoneNumber: string,
  data: {
    studentName: string;
    ticketNumber: string;
    resolution: string;
  },
): Promise<{ success: boolean; error?: string }> => {
  const bodyParameters: TemplateParameter[] = [
    { type: "text", text: data.studentName },
    { type: "text", text: data.ticketNumber },
    { type: "text", text: data.resolution },
  ];

  return await sendTriggerMessage(
    "ticketClosed",
    projectId,
    phoneNumber,
    bodyParameters,
    null,
    { ticketNumber: data.ticketNumber, type: "ticket_closed" },
  );
};

/**
 * Send student welcome WhatsApp
 */
export const sendStudentWelcomeWhatsApp = async (
  projectId: string,
  phoneNumber: string,
  data: {
    studentName: string;
    projectName: string;
    loginUrl: string;
  },
): Promise<{ success: boolean; error?: string }> => {
  const bodyParameters: TemplateParameter[] = [
    { type: "text", text: data.studentName },
    { type: "text", text: data.projectName },
    { type: "text", text: data.loginUrl },
  ];

  return await sendTriggerMessage(
    "studentWelcome",
    projectId,
    phoneNumber,
    bodyParameters,
    null,
    { type: "student_welcome" },
  );
};

/**
 * Send ticket assigned WhatsApp (to agent)
 */
export const sendTicketAssignedWhatsApp = async (
  projectId: string,
  phoneNumber: string,
  data: {
    agentName: string;
    ticketNumber: string;
    ticketSubject: string;
    priority: string;
  },
): Promise<{ success: boolean; error?: string }> => {
  const bodyParameters: TemplateParameter[] = [
    { type: "text", text: data.agentName },
    { type: "text", text: data.ticketNumber },
    { type: "text", text: data.ticketSubject },
    { type: "text", text: data.priority },
  ];

  return await sendTriggerMessage(
    "ticketAssigned",
    projectId,
    phoneNumber,
    bodyParameters,
    null,
    { ticketNumber: data.ticketNumber, type: "ticket_assigned" },
  );
};

/**
 * Send ticket escalated WhatsApp
 */
export const sendTicketEscalatedWhatsApp = async (
  projectId: string,
  phoneNumber: string,
  data: {
    ticketNumber: string;
    escalatedTo: string;
    reason: string;
  },
): Promise<{ success: boolean; error?: string }> => {
  const bodyParameters: TemplateParameter[] = [
    { type: "text", text: data.ticketNumber },
    { type: "text", text: data.escalatedTo },
    { type: "text", text: data.reason },
  ];

  return await sendTriggerMessage(
    "ticketEscalated",
    projectId,
    phoneNumber,
    bodyParameters,
    null,
    { ticketNumber: data.ticketNumber, type: "ticket_escalated" },
  );
};

/**
 * Send ticket reassigned WhatsApp
 */
export const sendTicketReassignedWhatsApp = async (
  projectId: string,
  phoneNumber: string,
  data: {
    agentName: string;
    ticketNumber: string;
    previousAgent: string;
  },
): Promise<{ success: boolean; error?: string }> => {
  const bodyParameters: TemplateParameter[] = [
    { type: "text", text: data.agentName },
    { type: "text", text: data.ticketNumber },
    { type: "text", text: data.previousAgent },
  ];

  return await sendTriggerMessage(
    "ticketReassigned",
    projectId,
    phoneNumber,
    bodyParameters,
    null,
    { ticketNumber: data.ticketNumber, type: "ticket_reassigned" },
  );
};

/**
 * Send ticket rejected WhatsApp
 */
export const sendTicketRejectedWhatsApp = async (
  projectId: string,
  phoneNumber: string,
  data: {
    studentName: string;
    ticketNumber: string;
    reason: string;
  },
): Promise<{ success: boolean; error?: string }> => {
  const bodyParameters: TemplateParameter[] = [
    { type: "text", text: data.studentName },
    { type: "text", text: data.ticketNumber },
    { type: "text", text: data.reason },
  ];

  return await sendTriggerMessage(
    "ticketRejected",
    projectId,
    phoneNumber,
    bodyParameters,
    null,
    { ticketNumber: data.ticketNumber, type: "ticket_rejected" },
  );
};

/**
 * Send ticket reopened WhatsApp
 */
export const sendTicketReopenedWhatsApp = async (
  projectId: string,
  phoneNumber: string,
  data: {
    studentName: string;
    ticketNumber: string;
  },
): Promise<{ success: boolean; error?: string }> => {
  const bodyParameters: TemplateParameter[] = [
    { type: "text", text: data.studentName },
    { type: "text", text: data.ticketNumber },
  ];

  return await sendTriggerMessage(
    "ticketReopened",
    projectId,
    phoneNumber,
    bodyParameters,
    null,
    { ticketNumber: data.ticketNumber, type: "ticket_reopened" },
  );
};

/**
 * Send ticket comment added WhatsApp
 */
export const sendTicketCommentAddedWhatsApp = async (
  projectId: string,
  phoneNumber: string,
  data: {
    studentName: string;
    ticketNumber: string;
    commentText: string;
  },
): Promise<{ success: boolean; error?: string }> => {
  const bodyParameters: TemplateParameter[] = [
    { type: "text", text: data.studentName },
    { type: "text", text: data.ticketNumber },
    { type: "text", text: data.commentText },
  ];

  return await sendTriggerMessage(
    "ticketCommentAdded",
    projectId,
    phoneNumber,
    bodyParameters,
    null,
    { ticketNumber: data.ticketNumber, type: "ticket_comment" },
  );
};

/**
 * Send ticket replied WhatsApp
 */
export const sendTicketRepliedWhatsApp = async (
  projectId: string,
  phoneNumber: string,
  data: {
    studentName: string;
    ticketNumber: string;
  },
): Promise<{ success: boolean; error?: string }> => {
  const bodyParameters: TemplateParameter[] = [
    { type: "text", text: data.studentName },
    { type: "text", text: data.ticketNumber },
  ];

  return await sendTriggerMessage(
    "ticketReplied",
    projectId,
    phoneNumber,
    bodyParameters,
    null,
    { ticketNumber: data.ticketNumber, type: "ticket_replied" },
  );
};

/**
 * Send account created WhatsApp
 */
export const sendAccountCreatedWhatsApp = async (
  projectId: string,
  phoneNumber: string,
  data: {
    userName: string;
    projectName: string;
    loginUrl: string;
  },
): Promise<{ success: boolean; error?: string }> => {
  const bodyParameters: TemplateParameter[] = [
    { type: "text", text: data.userName },
    { type: "text", text: data.projectName },
    { type: "text", text: data.loginUrl },
  ];

  return await sendTriggerMessage(
    "accountCreated",
    projectId,
    phoneNumber,
    bodyParameters,
    null,
    { type: "account_created" },
  );
};

/**
 * Send password reset WhatsApp
 */
export const sendPasswordResetWhatsApp = async (
  projectId: string,
  phoneNumber: string,
  data: {
    userName: string;
    projectName: string;
    otp: string;
  },
): Promise<{ success: boolean; error?: string }> => {
  const bodyParameters: TemplateParameter[] = [
    { type: "text", text: data.userName },
    { type: "text", text: data.otp },
  ];

  return await sendTriggerMessage(
    "passwordReset",
    projectId,
    phoneNumber,
    bodyParameters,
    [{ type: "text", text: data.otp }],
    { type: "password_reset" },
  );
};

export default {
  sendWhatsAppTemplateMessage,
  sendTriggerMessage,
  getSampleParametersForTrigger,
  sendTicketCreatedWhatsApp,
  sendOTPWhatsApp,
  sendTicketStatusChangedWhatsApp,
  sendTicketClosedWhatsApp,
  sendStudentWelcomeWhatsApp,
  sendTicketAssignedWhatsApp,
  sendTicketEscalatedWhatsApp,
  sendTicketReassignedWhatsApp,
  sendTicketRejectedWhatsApp,
  sendTicketReopenedWhatsApp,
  sendTicketCommentAddedWhatsApp,
  sendTicketRepliedWhatsApp,
  sendAccountCreatedWhatsApp,
  sendPasswordResetWhatsApp,
  TRIGGER_TEMPLATE_VARIABLES,
};
