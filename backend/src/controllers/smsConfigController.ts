import { Request, Response } from "express";
import SMSConfig from "../models/SMSConfig";
import { User } from "../models/User";
import { sendSMS, sendTriggerSMS } from "../utils/smsService";

/**
 * Get SMS Configuration
 */
export const getSMSConfig = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;

    let config = await SMSConfig.findOne({ projectId });

    if (!config) {
      config = await SMSConfig.create({ projectId });
    }

    const configData = config.toObject();

    // Mask password
    if (configData.password) {
      configData.password = "********";
    }

    return res.status(200).json({
      success: true,
      data: configData,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch SMS config" });
  }
};

/**
 * Update SMS Settings (Credentials & Master Toggle)
 */
export const updateSMSSettings = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const {
      userId,
      password,
      enabled,
      // Vendor configuration
      vendor,
      apiUrl,
      usernameParamName,
      passwordParamName,
      phoneParamName,
      messageParamName,
      senderIdParamName,
      senderId,
      peid,
      extraStaticParams,
      successPattern,
    } = req.body;

    const updates: any = {};

    if (userId !== undefined) updates.userId = userId;
    if (enabled !== undefined) updates.enabled = enabled;
    if (password && password !== "********") updates.password = password;

    // Vendor config fields
    if (vendor !== undefined) updates.vendor = vendor;
    if (apiUrl !== undefined) updates.apiUrl = apiUrl;
    if (usernameParamName !== undefined)
      updates.usernameParamName = usernameParamName;
    if (passwordParamName !== undefined)
      updates.passwordParamName = passwordParamName;
    if (phoneParamName !== undefined) updates.phoneParamName = phoneParamName;
    if (messageParamName !== undefined)
      updates.messageParamName = messageParamName;
    if (senderIdParamName !== undefined)
      updates.senderIdParamName = senderIdParamName;
    if (senderId !== undefined) updates.senderId = senderId;
    if (peid !== undefined) updates.peid = peid;
    if (extraStaticParams !== undefined)
      updates.extraStaticParams = extraStaticParams;
    if (successPattern !== undefined) updates.successPattern = successPattern;

    await SMSConfig.findOneAndUpdate(
      { projectId },
      { $set: updates },
      { new: true, upsert: true },
    );

    return res
      .status(200)
      .json({ success: true, message: "SMS settings updated successfully" });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, error: "Failed to update SMS settings" });
  }
};

/**
 * Update Specific SMS Trigger
 */
export const updateSMSTrigger = async (req: Request, res: Response) => {
  try {
    const { projectId, triggerName } = req.params;
    const updates = req.body; // { enabled, template, recipients... }

    const triggerUpdates: Record<string, any> = {};
    for (const [key, value] of Object.entries(updates)) {
      triggerUpdates[`triggers.${triggerName}.${key}`] = value;
    }

    await SMSConfig.findOneAndUpdate(
      { projectId },
      { $set: triggerUpdates },
      { upsert: true },
    );

    return res
      .status(200)
      .json({ success: true, message: "SMS trigger updated" });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, error: "Failed to update SMS trigger" });
  }
};

/**
 * Test SMS Trigger
 */
export const testSMSTrigger = async (req: Request, res: Response) => {
  try {
    const { projectId, triggerName } = req.params;
    const { phone } = req.body;

    if (!phone) {
      return res
        .status(400)
        .json({ success: false, error: "Phone number is required" });
    }

    const config = await SMSConfig.findOne({ projectId });
    if (!config) {
      return res
        .status(404)
        .json({ success: false, error: "SMS config not found" });
    }

    // Try to find the real user by phone/mobile to use their actual name
    const cleanPhone = phone.replace(/\D/g, "");
    const last10 = cleanPhone.slice(-10);
    const user = await User.findOne({
      projectId,
      $or: [
        { phone: last10 },
        { mobile: last10 },
        { phone: cleanPhone },
        { mobile: cleanPhone },
      ],
    })
      .select("firstName lastName fullName")
      .lean();

    const realName = user
      ? (
          user.fullName ||
          [user.firstName, user.lastName].filter(Boolean).join(" ")
        ).trim() || "Student"
      : "Test Student";

    // Mock data for testing based on trigger type
    let mockData: Record<string, string> = {
      otp: "123456",
      name: realName,
      studentName: realName,
      ticketId: "#T-12345",
      status: "Resolved",
      projectName: "SAC Helpdesk",
      loginUrl: "https://helpdesk.example.com",
      resetLink: "https://helpdesk.example.com/reset",
      ticketNumber: "T-12345",
      ticketSubject: "Test Ticket Subject",
      newStatus: "In Progress",
      reason: "Test reason",
      escalatedTo: "Senior Agent",
      commentText: "Test comment",
      // Numbered variables for DLT templates (e.g. TTBS)
      "1": realName, // maps to {{name}} in OTP template
      "2": "123456", // maps to {{otp}} in OTP template
      "3": "https://cetcell.",
      "4": "mahacet.org",
    };

    // We use the existing sendTriggerSMS but strictly for testing purposes
    // We might want to bypass some checks or just use it directly.
    // Using sendTriggerSMS ensures we test the actual logic (template replacement etc).
    // However, we need to ensure we don't block it if "enabled" is false?
    // The user usually wants to test even if disabled?
    // For now, let's assume valid config is needed.

    // Actually, if we use sendTriggerSMS it checks for enabled.
    // Let's use sendGupshupSMS directly after manual template replacement to allow testing even if disabled?
    // Or better, bypass the enabled check logic by temporarily mocking or just creating the message manually.

    // Let's do manual message construction to allow testing even if triggers are disabled.
    const triggers = config.triggers as any;
    const trigger = triggers[triggerName];

    if (!trigger) {
      return res
        .status(404)
        .json({ success: false, error: "Trigger not found" });
    }

    // Simple template replacement
    let message = trigger.template;
    message = message.replace(
      /\{\{(\w+)\}\}/g,
      (_: string, key: string) => mockData[key] || `{{${key}}}`,
    );

    const result = await sendSMS(phone, message, config, {
      dltContentId: (trigger as any).dltContentId,
      dltTemplateId: (trigger as any).dltTemplateId,
    });

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: "Test SMS sent successfully",
        responseId: result.responseId,
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.error || "Failed to send test SMS",
      });
    }
  } catch (error) {
    console.error("Test SMS error:", error);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error during test" });
  }
};

/**
 * Test Student OTP SMS with static content (no variable substitution)
 */
export const testStudentOTPStaticContent = async (
  req: Request,
  res: Response,
) => {
  try {
    const { projectId } = req.params;
    const { phone, message } = req.body as { phone?: string; message?: string };

    if (!phone) {
      return res
        .status(400)
        .json({ success: false, error: "Phone number is required" });
    }

    const config = await SMSConfig.findOne({ projectId });
    if (!config) {
      return res
        .status(404)
        .json({ success: false, error: "SMS config not found" });
    }

    const trigger = (config.triggers as any)?.studentOTP;
    if (!trigger) {
      return res
        .status(404)
        .json({ success: false, error: "studentOTP trigger not found" });
    }

    const defaultStaticMessage =
      "Dear Candidate,\n\nPlease re-download hall ticket for MHT-CET (PCB 1st Attempt) 2026 from https://cetcell.mahacet.org. Exam. Kindly ignore your previous hall ticket.\n\nCET CELL,\nMumbai";

    // Send exact static content for DLT testing; no placeholder replacement.
    const staticMessage =
      typeof message === "string" && message.trim().length > 0
        ? message.trim()
        : trigger.template || defaultStaticMessage;

    const result = await sendSMS(phone, staticMessage, config, {
      dltContentId: (trigger as any).dltContentId,
      dltTemplateId: (trigger as any).dltTemplateId,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || "Failed to send static OTP test SMS",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Static OTP test SMS sent successfully",
      responseId: result.responseId,
    });
  } catch (error) {
    console.error("Static OTP test SMS error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error during static OTP test",
    });
  }
};
