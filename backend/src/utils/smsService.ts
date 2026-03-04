import axios from "axios";
import SMSConfig, { ISMSConfig, ISMSTrigger } from "../models/SMSConfig";
import SMSLog from "../models/SMSLog";

/**
 * Replace variables in template
 */
const replaceVariables = (
  template: string,
  variables: Record<string, string>,
) => {
  return template.replace(
    /\{\{(\w+)\}\}/g,
    (_, key) => variables[key] || `{{${key}}}`,
  );
};

/**
 * Log SMS attempt
 */
const logSMS = async (
  projectId: string,
  recipient: string,
  message: string,
  triggerType: string,
  status: "sent" | "failed" | "blocked",
  responseId?: string,
  error?: string,
  metadata?: any,
) => {
  try {
    await SMSLog.create({
      projectId,
      recipient,
      message,
      triggerType,
      status,
      responseId,
      error,
      metadata,
    });
  } catch (err) {
    console.error("Failed to log SMS:", err);
  }
};

/**
 * Generic vendor-agnostic SMS sender
 * Builds the API call dynamically from stored config — no vendor-specific code.
 */
export const sendSMS = async (
  phoneNumber: string,
  message: string,
  config: ISMSConfig,
  triggerOptions?: { dltContentId?: string; dltTemplateId?: string },
): Promise<{ success: boolean; responseId?: string; error?: string }> => {
  try {
    const password = config.getDecryptedPassword();
    const cleanPhone = phoneNumber.replace(/\D/g, "");
    const sendTo = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

    const params: Record<string, string> = {};

    // Credential params (use stored param names or Gupshup defaults for backward compat)
    const usernameParam = config.usernameParamName || "userid";
    const passwordParam = config.passwordParamName || "password";
    const phoneParam = config.phoneParamName || "send_to";
    const messageParam = config.messageParamName || "msg";

    params[usernameParam] = config.userId;
    params[passwordParam] = password;
    params[phoneParam] = sendTo;
    params[messageParam] = message;

    // Sender ID (DLT header)
    if (config.senderId && config.senderIdParamName) {
      params[config.senderIdParamName] = config.senderId;
    }

    // DLT Principal Entity ID
    if (config.peid) {
      params["peid"] = config.peid;
    }

    // Per-trigger DLT template IDs (contentid, tmid for TTBS / TRAI compliance)
    if (triggerOptions?.dltContentId) {
      params["contentid"] = triggerOptions.dltContentId;
    }
    if (triggerOptions?.dltTemplateId) {
      params["tmid"] = triggerOptions.dltTemplateId;
    }

    // Extra static params (JSON — e.g. Gupshup needs method=SendMessage, msg_type=TEXT, etc.)
    if (config.extraStaticParams) {
      try {
        const extra = JSON.parse(config.extraStaticParams);
        Object.assign(params, extra);
      } catch {
        // Invalid JSON — skip
      }
    }

    const apiUrl =
      config.apiUrl || "https://enterpriseapi.smsgupshup.com/GatewayAPI/rest";
    const queryString = new URLSearchParams(params).toString();
    const response = await axios.get(`${apiUrl}?${queryString}`);
    const responseData = response.data;

    const successPattern = (config.successPattern || "success").toLowerCase();
    const responseStr =
      typeof responseData === "string"
        ? responseData
        : JSON.stringify(responseData);

    if (responseStr.toLowerCase().includes(successPattern)) {
      const parts = responseStr.split("|");
      const responseId = parts[2]?.trim() || parts[1]?.trim() || "";
      return { success: true, responseId };
    } else {
      return { success: false, error: responseStr };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown HTTP error",
    };
  }
};

/**
 * Send SMS via Gupshup API (kept for backward compatibility — now delegates to sendSMS)
 */
export const sendGupshupSMS = async (
  phoneNumber: string,
  message: string,
  config: ISMSConfig,
): Promise<{ success: boolean; responseId?: string; error?: string }> => {
  return sendSMS(phoneNumber, message, config);
};

/**
 * Send SMS for a specific trigger
 */
export const sendTriggerSMS = async (
  triggerName: string,
  projectId: string,
  phoneNumber: string,
  data: Record<string, string>,
  metadata: any = {},
): Promise<{ success: boolean; error?: string }> => {
  try {
    const config = await SMSConfig.findOne({ projectId });

    if (!config) {
      return { success: false, error: "SMS configuration not found" };
    }

    // Check Master Toggle
    if (!config.enabled) {
      console.log(
        `⚠️  [SMS SERVICE] SMS sending is disabled for project ${projectId}`,
      );
      await logSMS(
        projectId,
        phoneNumber,
        "BLOCKED",
        triggerName,
        "blocked",
        undefined,
        "SMS integration is disabled",
      );
      return { success: false, error: "SMS integration is disabled" };
    }

    // Check Trigger
    const triggers = config.triggers as any;
    const trigger = triggers[triggerName] as ISMSTrigger;

    if (!trigger) {
      return { success: false, error: `Trigger '${triggerName}' not found` };
    }

    if (!trigger.enabled) {
      return { success: false, error: "Trigger is disabled" }; // Not logging blocked for individual triggers to avoid noise? Or maybe we should.
    }

    // Prepare Message
    const message = replaceVariables(trigger.template, data);

    // Send — pass DLT content/template IDs if configured on the trigger
    const result = await sendSMS(phoneNumber, message, config, {
      dltContentId: (trigger as any).dltContentId,
      dltTemplateId: (trigger as any).dltTemplateId,
    });

    // Log
    await logSMS(
      projectId,
      phoneNumber,
      message,
      triggerName,
      result.success ? "sent" : "failed",
      result.responseId,
      result.error,
      metadata,
    );

    if (result.success) {
      console.log(`✅ SMS sent to ${phoneNumber} (${triggerName})`);
    } else {
      console.error(`❌ SMS failed to ${phoneNumber}: ${result.error}`);
    }

    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in sendTriggerSMS:", error);
    return { success: false, error: errorMsg };
  }
};

/**
 * Send OTP specific helper
 */
export const sendOTPSMS = async (
  projectId: string,
  phoneNumber: string,
  otp: string,
): Promise<{ success: boolean; error?: string }> => {
  // Common data for OTP
  const data = {
    otp: otp,
    projectName: "Hubble Hox", // Can be fetched from project if needed
  };

  return sendTriggerSMS("studentOTP", projectId, phoneNumber, data, {
    type: "otp",
  });
};

/**
 * Send ticket created SMS notification
 */
export const sendTicketCreatedSMS = async (
  projectId: string,
  phoneNumber: string,
  ticketData: {
    studentName: string;
    ticketNumber: string;
    ticketSubject: string;
    ticketStatus: string;
  },
): Promise<{ success: boolean; error?: string }> => {
  const data = {
    studentName: ticketData.studentName,
    ticketNumber: ticketData.ticketNumber,
    ticketSubject: ticketData.ticketSubject,
    ticketStatus: ticketData.ticketStatus,
  };

  return sendTriggerSMS("ticketCreatedStudent", projectId, phoneNumber, data, {
    type: "ticket_created",
    ticketNumber: ticketData.ticketNumber,
  });
};

/**
 * Send ticket status changed SMS notification
 */
export const sendTicketStatusChangedSMS = async (
  projectId: string,
  phoneNumber: string,
  ticketData: {
    studentName: string;
    ticketNumber: string;
    newStatus: string;
    previousStatus: string;
  },
): Promise<{ success: boolean; error?: string }> => {
  const data = {
    studentName: ticketData.studentName,
    ticketNumber: ticketData.ticketNumber,
    newStatus: ticketData.newStatus,
    previousStatus: ticketData.previousStatus,
  };

  return sendTriggerSMS("ticketStatusChanged", projectId, phoneNumber, data, {
    type: "ticket_status_changed",
    ticketNumber: ticketData.ticketNumber,
  });
};

/**
 * Send ticket closed SMS notification
 */
export const sendTicketClosedSMS = async (
  projectId: string,
  phoneNumber: string,
  ticketData: {
    studentName: string;
    ticketNumber: string;
    resolution: string;
  },
): Promise<{ success: boolean; error?: string }> => {
  const data = {
    studentName: ticketData.studentName,
    ticketNumber: ticketData.ticketNumber,
    resolution: ticketData.resolution,
  };

  return sendTriggerSMS("ticketClosed", projectId, phoneNumber, data, {
    type: "ticket_closed",
    ticketNumber: ticketData.ticketNumber,
  });
};

/**
 * Send student welcome SMS
 */
export const sendStudentWelcomeSMS = async (
  projectId: string,
  phoneNumber: string,
  data: {
    studentName: string;
    projectName: string;
    loginUrl: string;
  },
): Promise<{ success: boolean; error?: string }> => {
  return sendTriggerSMS("studentWelcome", projectId, phoneNumber, data, {
    type: "student_welcome",
  });
};

/**
 * Send ticket assigned SMS (to agent)
 */
export const sendTicketAssignedSMS = async (
  projectId: string,
  phoneNumber: string,
  ticketData: {
    agentName: string;
    ticketNumber: string;
    ticketSubject: string;
    priority: string;
  },
): Promise<{ success: boolean; error?: string }> => {
  const data = {
    agentName: ticketData.agentName,
    ticketNumber: ticketData.ticketNumber,
    ticketSubject: ticketData.ticketSubject,
    priority: ticketData.priority,
  };
  return sendTriggerSMS("ticketAssigned", projectId, phoneNumber, data, {
    type: "ticket_assigned",
    ticketNumber: ticketData.ticketNumber,
  });
};

/**
 * Send ticket escalated SMS
 */
export const sendTicketEscalatedSMS = async (
  projectId: string,
  phoneNumber: string,
  ticketData: {
    ticketNumber: string;
    escalatedTo: string;
    reason: string;
  },
): Promise<{ success: boolean; error?: string }> => {
  return sendTriggerSMS("ticketEscalated", projectId, phoneNumber, ticketData, {
    type: "ticket_escalated",
    ticketNumber: ticketData.ticketNumber,
  });
};

/**
 * Send ticket reassigned SMS
 */
export const sendTicketReassignedSMS = async (
  projectId: string,
  phoneNumber: string,
  ticketData: {
    agentName: string;
    ticketNumber: string;
    previousAgent: string;
  },
): Promise<{ success: boolean; error?: string }> => {
  return sendTriggerSMS(
    "ticketReassigned",
    projectId,
    phoneNumber,
    ticketData,
    { type: "ticket_reassigned", ticketNumber: ticketData.ticketNumber },
  );
};

/**
 * Send ticket rejected SMS
 */
export const sendTicketRejectedSMS = async (
  projectId: string,
  phoneNumber: string,
  ticketData: {
    studentName: string;
    ticketNumber: string;
    reason: string;
  },
): Promise<{ success: boolean; error?: string }> => {
  return sendTriggerSMS("ticketRejected", projectId, phoneNumber, ticketData, {
    type: "ticket_rejected",
    ticketNumber: ticketData.ticketNumber,
  });
};

/**
 * Send ticket reopened SMS
 */
export const sendTicketReopenedSMS = async (
  projectId: string,
  phoneNumber: string,
  ticketData: {
    studentName: string;
    ticketNumber: string;
  },
): Promise<{ success: boolean; error?: string }> => {
  return sendTriggerSMS("ticketReopened", projectId, phoneNumber, ticketData, {
    type: "ticket_reopened",
    ticketNumber: ticketData.ticketNumber,
  });
};

/**
 * Send ticket comment added SMS
 */
export const sendTicketCommentAddedSMS = async (
  projectId: string,
  phoneNumber: string,
  ticketData: {
    studentName: string;
    ticketNumber: string;
    commentText: string;
  },
): Promise<{ success: boolean; error?: string }> => {
  return sendTriggerSMS(
    "ticketCommentAdded",
    projectId,
    phoneNumber,
    ticketData,
    { type: "ticket_comment", ticketNumber: ticketData.ticketNumber },
  );
};

/**
 * Send ticket replied SMS
 */
export const sendTicketRepliedSMS = async (
  projectId: string,
  phoneNumber: string,
  ticketData: {
    studentName: string;
    ticketNumber: string;
  },
): Promise<{ success: boolean; error?: string }> => {
  return sendTriggerSMS("ticketReplied", projectId, phoneNumber, ticketData, {
    type: "ticket_replied",
    ticketNumber: ticketData.ticketNumber,
  });
};

/**
 * Send ticket created (to agent) SMS
 */
export const sendTicketCreatedAgentSMS = async (
  projectId: string,
  phoneNumber: string,
  ticketData: {
    agentName: string;
    ticketNumber: string;
    ticketSubject: string;
    priority: string;
  },
): Promise<{ success: boolean; error?: string }> => {
  return sendTriggerSMS(
    "ticketCreatedAgent",
    projectId,
    phoneNumber,
    ticketData,
    { type: "ticket_created_agent", ticketNumber: ticketData.ticketNumber },
  );
};

/**
 * Send reminder SMS (generic for all reminder types)
 */
export const sendTicketReminderSMS = async (
  projectId: string,
  phoneNumber: string,
  ticketData: {
    agentName: string;
    ticketNumber: string;
    ticketSubject: string;
    hoursOpen: string;
  },
  reminderType:
    | "ticketReminderAgent24hrs"
    | "ticketReminderAgent48hrs"
    | "ticketDueSoon"
    | "ticketOverdue",
): Promise<{ success: boolean; error?: string }> => {
  return sendTriggerSMS(reminderType, projectId, phoneNumber, ticketData, {
    type: "reminder",
    ticketNumber: ticketData.ticketNumber,
  });
};

/**
 * Send account created SMS
 */
export const sendAccountCreatedSMS = async (
  projectId: string,
  phoneNumber: string,
  data: {
    userName: string;
    projectName: string;
    loginUrl: string;
  },
): Promise<{ success: boolean; error?: string }> => {
  return sendTriggerSMS("accountCreated", projectId, phoneNumber, data, {
    type: "account_created",
  });
};

/**
 * Send password reset SMS
 */
export const sendPasswordResetSMS = async (
  projectId: string,
  phoneNumber: string,
  data: {
    userName: string;
    projectName: string;
    resetLink: string;
  },
): Promise<{ success: boolean; error?: string }> => {
  return sendTriggerSMS("passwordReset", projectId, phoneNumber, data, {
    type: "password_reset",
  });
};
