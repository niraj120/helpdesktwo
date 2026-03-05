import { Request, Response } from "express";
import WhatsAppConfig from "../models/WhatsAppConfig";
import {
  sendWhatsAppTemplateMessage,
  getSampleParametersForTrigger,
  TRIGGER_TEMPLATE_VARIABLES,
} from "../utils/whatsappService";

/**
 * Get WhatsApp configuration for a project
 */
export const getWhatsAppConfig = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;

    // Find existing config or create new one
    let config = await WhatsAppConfig.findOne({ projectId });

    if (!config) {
      // Create new config with default triggers
      config = await WhatsAppConfig.create({ projectId });
    }

    // Convert to object and decrypt access token for frontend
    const configData = config.toObject();

    // Decrypt access token for frontend (frontend has password field masking)
    if (configData.accessToken) {
      try {
        configData.accessToken = config.getDecryptedAccessToken();
      } catch (error) {
        console.error("Error decrypting access token:", error);
        configData.accessToken = "";
      }
    }

    return res.status(200).json({
      success: true,
      data: configData,
      templateVariables: TRIGGER_TEMPLATE_VARIABLES,
    });
  } catch (error) {
    console.error("Error getting WhatsApp config:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get WhatsApp configuration",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Update WhatsApp API settings (API Base URL, Access Token)
 */
export const updateWhatsAppSettings = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { apiBaseUrl, accessToken, enabled } = req.body;

    const updates: any = {};

    if (enabled !== undefined) {
      updates.enabled = enabled;
    }

    if (apiBaseUrl !== undefined) {
      updates.apiBaseUrl = apiBaseUrl.trim();
    }

    // Only update access token if it's not the masked value
    if (accessToken && accessToken !== "********") {
      updates.accessToken = accessToken;
    }

    const config = await WhatsAppConfig.findOneAndUpdate(
      { projectId },
      { $set: updates },
      { new: true, upsert: true },
    );

    return res.status(200).json({
      success: true,
      message: "WhatsApp settings updated successfully",
    });
  } catch (error) {
    console.error("Error updating WhatsApp settings:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update WhatsApp settings",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Update a specific WhatsApp trigger
 */
export const updateWhatsAppTrigger = async (req: Request, res: Response) => {
  try {
    const { projectId, triggerName } = req.params;
    const updates = req.body;

    // Validate trigger name exists
    const validTriggers = [
      "accountCreated",
      "passwordReset",
      "ticketCreatedStudent",
      "ticketCreatedAgent",
      "ticketCreatedOnline",
      "ticketCreatedOffline",
      "ticketCreatedEmail",
      "ticketAssigned",
      "ticketEscalated",
      "ticketReassigned",
      "ticketStatusChanged",
      "ticketClosed",
      "ticketRejected",
      "ticketReopened",
      "ticketCommentAdded",
      "ticketReplied",
      "ticketReminderAgent24hrs",
      "ticketReminderAgent48hrs",
      "ticketDueSoon",
      "ticketOverdue",
      "studentWelcome",
      "studentOTP",
    ];

    if (!validTriggers.includes(triggerName)) {
      return res.status(400).json({
        success: false,
        message: `Invalid trigger name: ${triggerName}`,
      });
    }

    // Build update object with dot notation
    const triggerUpdates: Record<string, any> = {};
    for (const [key, value] of Object.entries(updates)) {
      triggerUpdates[`triggers.${triggerName}.${key}`] = value;
    }

    const config = await WhatsAppConfig.findOneAndUpdate(
      { projectId },
      { $set: triggerUpdates },
      { new: true, upsert: true },
    );

    if (!config) {
      return res.status(404).json({
        success: false,
        message: "Configuration not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Trigger updated successfully",
      data: (config.triggers as any)[triggerName],
    });
  } catch (error) {
    console.error("Error updating WhatsApp trigger:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update trigger",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Test a specific WhatsApp trigger
 */
export const testWhatsAppTrigger = async (req: Request, res: Response) => {
  try {
    const { projectId, triggerName } = req.params;
    const { testPhoneNumber } = req.body;

    // Validate phone number
    if (!testPhoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Test phone number is required",
      });
    }

    // Validate phone number format (basic check)
    const cleanPhone = testPhoneNumber.replace(/\D/g, "");
    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid phone number. Please include country code (e.g., 919876543210)",
      });
    }

    // Get configuration
    const config = await WhatsAppConfig.findOne({ projectId });

    if (!config) {
      return res.status(404).json({
        success: false,
        message:
          "WhatsApp configuration not found. Please configure settings first.",
      });
    }

    // Check if API is configured
    if (!config.apiBaseUrl || !config.accessToken) {
      return res.status(400).json({
        success: false,
        message:
          "WhatsApp API not configured. Please set API Base URL and Access Token first.",
      });
    }

    // Get trigger
    const triggers = config.triggers as Record<string, any>;
    const trigger = triggers[triggerName];

    if (!trigger) {
      return res.status(404).json({
        success: false,
        message: `Trigger '${triggerName}' not found`,
      });
    }

    // Debug: Log trigger configuration
    console.log(`🔍 Testing trigger "${triggerName}" with config:`, {
      numberId: trigger.numberId,
      templateName: trigger.templateName,
      templateLanguage: trigger.templateLanguage,
      enabled: trigger.enabled,
    });

    // Check if Number ID is set (required for each template)
    if (!trigger.numberId) {
      return res.status(400).json({
        success: false,
        message:
          "Number ID not configured for this trigger. This is the pre-approved template ID from WhatsApp.",
      });
    }

    // Check if template name is set (required to send via API)
    if (!trigger.templateName) {
      return res.status(400).json({
        success: false,
        message:
          "Template Name not configured for this trigger. Please edit the trigger and enter the pre-approved WhatsApp template name (e.g., account_created).",
      });
    }

    const templateName = trigger.templateName;

    // Get sample parameters for this trigger
    const sampleParams = getSampleParametersForTrigger(triggerName);

    // Send test message with the new API signature
    const result = await sendWhatsAppTemplateMessage(
      trigger.numberId, // numberId goes in URL
      testPhoneNumber, // recipient
      templateName, // template name for request body (defaults to numberId)
      trigger.templateLanguage || "en", // language
      sampleParams.bodyParams, // body parameters
      sampleParams.buttonParams, // button parameters (for OTP etc)
      config, // config with API settings
      projectId, // for logging
      {
        triggerType: "test",
        triggerName,
        metadata: { isTest: true, testedAt: new Date().toISOString() },
      },
    );

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: "Test message sent successfully!",
        messageId: result.messageId,
        details: {
          numberId: trigger.numberId,
          templateName: trigger.templateName,
          language: trigger.templateLanguage || "en",
          recipient: testPhoneNumber,
          sampleBodyParameters: sampleParams.bodyParams.map((p) => p.text),
          sampleButtonParameters:
            sampleParams.buttonParams?.map((p) => p.text) || [],
        },
      });
    } else {
      return res.status(400).json({
        success: false,
        message: result.error || "Failed to send test message",
      });
    }
  } catch (error) {
    console.error("Error testing WhatsApp trigger:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send test message",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Get template variables reference for all triggers
 */
export const getTemplateVariables = async (req: Request, res: Response) => {
  try {
    return res.status(200).json({
      success: true,
      data: TRIGGER_TEMPLATE_VARIABLES,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to get template variables",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export default {
  getWhatsAppConfig,
  updateWhatsAppSettings,
  updateWhatsAppTrigger,
  testWhatsAppTrigger,
  getTemplateVariables,
};
