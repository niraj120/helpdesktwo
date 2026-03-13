import { Request, Response } from "express";
import mongoose from "mongoose";
import ProjectEmailConfig, {
  detectEmailProvider,
  detectProviderFromHost,
  getProviderDefaults,
  EmailProvider,
  AuthMethod,
} from "../models/ProjectEmailConfig";
import { Project } from "../models/Project";
import { Ticket } from "../models/Ticket";
import Imap from "imap";
import nodemailer from "nodemailer";
import { google } from "googleapis";

/**
 * Generate XOAUTH2 token for IMAP/SMTP authentication
 */
const generateXOAuth2Token = (user: string, accessToken: string): string => {
  const authString = `user=${user}\x01auth=Bearer ${accessToken}\x01\x01`;
  return Buffer.from(authString).toString("base64");
};

/**
 * Refresh OAuth2 access token for Google
 */
const refreshGoogleAccessToken = async (
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<{ accessToken: string; expiresIn: number } | null> => {
  try {
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await oauth2Client.refreshAccessToken();
    return {
      accessToken: credentials.access_token || "",
      expiresIn: credentials.expiry_date
        ? Math.floor((credentials.expiry_date - Date.now()) / 1000)
        : 3600,
    };
  } catch (error) {
    console.error("Failed to refresh Google access token:", error);
    return null;
  }
};

/**
 * Refresh OAuth2 access token for Microsoft
 */
const refreshMicrosoftAccessToken = async (
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<{ accessToken: string; expiresIn: number } | null> => {
  try {
    const tokenEndpoint =
      "https://login.microsoftonline.com/common/oauth2/v2.0/token";
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope:
        "https://outlook.office365.com/IMAP.AccessAsUser.All https://outlook.office365.com/SMTP.Send offline_access",
    });

    const response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!response.ok) {
      console.error("Microsoft token refresh failed:", await response.text());
      return null;
    }

    const data = await response.json();
    return {
      accessToken: (data as { access_token: string; expires_in?: number })
        .access_token,
      expiresIn:
        (data as { access_token: string; expires_in?: number }).expires_in ||
        3600,
    };
  } catch (error) {
    console.error("Failed to refresh Microsoft access token:", error);
    return null;
  }
};

// OAuth2 options type for connection testing
interface OAuth2Options {
  clientId: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  provider?: EmailProvider;
}

/**
 * Test IMAP connection with support for OAuth2
 */
const testImapConnection = async (
  host: string,
  port: number,
  username: string,
  password: string,
  authMethod: AuthMethod = "basic",
  oauth2Options?: OAuth2Options,
): Promise<{ success: boolean; error?: string }> => {
  // Get access token for OAuth2
  let accessToken: string | undefined;
  if (authMethod === "oauth2" && oauth2Options) {
    accessToken = oauth2Options.accessToken;

    // If no access token, try to refresh
    if (!accessToken && oauth2Options.refreshToken) {
      if (oauth2Options.provider === "google" && oauth2Options.clientSecret) {
        const result = await refreshGoogleAccessToken(
          oauth2Options.clientId,
          oauth2Options.clientSecret,
          oauth2Options.refreshToken,
        );
        if (result) {
          accessToken = result.accessToken;
        }
      } else if (
        oauth2Options.provider === "microsoft" &&
        oauth2Options.clientSecret
      ) {
        const result = await refreshMicrosoftAccessToken(
          oauth2Options.clientId,
          oauth2Options.clientSecret,
          oauth2Options.refreshToken,
        );
        if (result) {
          accessToken = result.accessToken;
        }
      }
    }

    if (!accessToken) {
      return {
        success: false,
        error: "Failed to obtain access token for OAuth2",
      };
    }
  }

  return new Promise((resolve) => {
    const imapConfig: any = {
      user: username,
      host: host,
      port: port,
      tls: true,
      tlsOptions: {
        rejectUnauthorized: false,
        servername: host, // Required for Microsoft 365 SNI
        minVersion: "TLSv1.2", // Microsoft 365 requires TLS 1.2+
      },
      connTimeout: 15000,
      authTimeout: 15000, // Increased for Microsoft 365
    };

    // Use XOAUTH2 for OAuth2 authentication
    if (authMethod === "oauth2" && accessToken) {
      imapConfig.xoauth2 = generateXOAuth2Token(username, accessToken);
    } else {
      imapConfig.password = password;
    }

    const imap = new Imap(imapConfig);

    const timeout = setTimeout(() => {
      imap.end();
      resolve({ success: false, error: "Connection timeout (15s)" });
    }, 15000);

    imap.once("ready", () => {
      clearTimeout(timeout);
      imap.end();
      resolve({ success: true });
    });

    imap.once("error", (err: Error) => {
      clearTimeout(timeout);
      let errorMessage = err.message;

      // Provide helpful error messages
      if (
        errorMessage.includes("Invalid credentials") ||
        errorMessage.includes("Authentication failed") ||
        errorMessage.includes("AUTHENTICATE failed")
      ) {
        if (authMethod === "basic" || authMethod === "app_password") {
          // Check if it's a Microsoft host
          if (
            host.includes("office365") ||
            host.includes("outlook") ||
            host.includes("microsoft")
          ) {
            errorMessage +=
              " - Microsoft 365 has disabled basic IMAP authentication. Please use an App Password (enable 2FA first at https://myaccount.microsoft.com, then create an App Password).";
          } else if (host.includes("gmail") || host.includes("google")) {
            errorMessage +=
              " - For Google accounts, please use an App Password (enable 2FA first at https://myaccount.google.com/apppasswords).";
          } else {
            errorMessage +=
              " - For Google/Microsoft accounts, please use App Password or OAuth2 authentication.";
          }
        }
      }

      resolve({ success: false, error: errorMessage });
    });

    try {
      imap.connect();
    } catch (error: any) {
      clearTimeout(timeout);
      resolve({ success: false, error: error.message });
    }
  });
};

/**
 * Test SMTP connection with support for OAuth2
 */
const testSmtpConnection = async (
  host: string,
  port: number,
  username: string,
  password: string,
  authMethod: AuthMethod = "basic",
  oauth2Options?: OAuth2Options,
): Promise<{ success: boolean; error?: string }> => {
  // Get access token for OAuth2
  let accessToken: string | undefined;
  if (authMethod === "oauth2" && oauth2Options) {
    accessToken = oauth2Options.accessToken;

    // If no access token, try to refresh
    if (!accessToken && oauth2Options.refreshToken) {
      if (oauth2Options.provider === "google" && oauth2Options.clientSecret) {
        const result = await refreshGoogleAccessToken(
          oauth2Options.clientId,
          oauth2Options.clientSecret,
          oauth2Options.refreshToken,
        );
        if (result) {
          accessToken = result.accessToken;
        }
      } else if (
        oauth2Options.provider === "microsoft" &&
        oauth2Options.clientSecret
      ) {
        const result = await refreshMicrosoftAccessToken(
          oauth2Options.clientId,
          oauth2Options.clientSecret,
          oauth2Options.refreshToken,
        );
        if (result) {
          accessToken = result.accessToken;
        }
      }
    }

    if (!accessToken) {
      return {
        success: false,
        error: "Failed to obtain access token for OAuth2",
      };
    }
  }

  return new Promise((resolve) => {
    let authConfig: any;

    // Configure authentication based on method
    if (authMethod === "oauth2" && accessToken) {
      authConfig = {
        type: "OAuth2",
        user: username,
        accessToken: accessToken,
      };
    } else {
      authConfig = {
        user: username,
        pass: password,
      };
    }

    const transporter = nodemailer.createTransport({
      host: host,
      port: port,
      secure: port === 465,
      auth: authConfig,
      tls: {
        rejectUnauthorized: false,
      },
    });

    const timeout = setTimeout(() => {
      resolve({ success: false, error: "Connection timeout (15s)" });
    }, 15000);

    transporter.verify((error, success) => {
      clearTimeout(timeout);
      if (error) {
        let errorMessage = error.message;

        // Provide helpful error messages
        if (
          errorMessage.includes("Invalid login") ||
          errorMessage.includes("Authentication") ||
          errorMessage.includes("BadCredentials")
        ) {
          if (authMethod === "basic") {
            errorMessage +=
              " - For Google/Microsoft accounts, please use App Password or OAuth2 authentication. ";
            errorMessage +=
              "For Google: Enable 2FA and create an App Password at https://myaccount.google.com/apppasswords. ";
            errorMessage +=
              "For Microsoft: Create an App Password in security settings or use OAuth2.";
          }
        }

        resolve({ success: false, error: errorMessage });
      } else {
        resolve({ success: true });
      }
    });
  });
};

/**
 * POST /api/projects/:projectId/email-configs
 * Add email configuration for a project
 * Supports basic auth, app passwords, and OAuth2 (Google/Microsoft)
 */
export const addEmailConfig = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const {
      email_address,
      imap_host,
      imap_port,
      imap_username,
      imap_password,
      smtp_host,
      smtp_port,
      smtp_username,
      smtp_password,
      // New OAuth2 fields
      provider,
      authMethod = "basic",
      inbound_method = "imap",
      oauth2,
      webhook_provider,
      webhook_payload_map,
    } = req.body;

    // Auto-detect provider from email if not specified
    const detectedProvider =
      provider || detectEmailProvider(email_address || "");
    const authType = authMethod as AuthMethod;
    const inboundType = inbound_method as "imap" | "sendgrid" | "webhook";

    // Validate based on auth method and inbound method
    if (authType === "oauth2") {
      // OAuth2 requires oauth2 object with tokens
      if (!oauth2?.clientId || !oauth2?.refreshToken) {
        return res.status(400).json({
          success: false,
          message: "OAuth2 authentication requires clientId and refreshToken",
        });
      }
      if (!email_address) {
        return res.status(400).json({
          success: false,
          message: "Email address is required",
        });
      }
    } else if (inboundType === "sendgrid" || inboundType === "webhook") {
      // Webhook inbound: only email_address + smtp fields needed
      if (
        !email_address ||
        !smtp_host ||
        !smtp_port ||
        !smtp_username ||
        !smtp_password
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Email address and SMTP settings are required for SendGrid inbound",
        });
      }
    } else {
      // Basic and app_password (IMAP) require all fields
      if (
        !email_address ||
        !imap_host ||
        !imap_port ||
        !imap_username ||
        !imap_password ||
        !smtp_host ||
        !smtp_port ||
        !smtp_username ||
        !smtp_password
      ) {
        return res.status(400).json({
          success: false,
          message:
            "All fields are required for basic/app_password authentication",
        });
      }
    }

    // Validate project ID format
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid project ID",
      });
    }

    // Check if project exists
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Validate email format
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(email_address)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    // Check if email already exists for this project
    const existingConfig = await ProjectEmailConfig.findOne({
      projectId,
      emailAddress: email_address.toLowerCase(),
    });

    if (existingConfig) {
      return res.status(409).json({
        success: false,
        message: "Email address already configured for this project",
      });
    }

    // Validate port numbers
    if (
      imap_port < 1 ||
      imap_port > 65535 ||
      smtp_port < 1 ||
      smtp_port > 65535
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid port number (must be between 1 and 65535)",
      });
    }

    // Prepare defaults for OAuth2/sendgrid connections
    const defaults = getProviderDefaults(detectedProvider);
    const imapHostToUse = imap_host || defaults.imapHost;
    const imapPortToUse = imap_port || defaults.imapPort;
    const smtpHostToUse = smtp_host || defaults.smtpHost;
    const smtpPortToUse = smtp_port || defaults.smtpPort;

    // Test IMAP connection only when using IMAP inbound
    if (inboundType !== "sendgrid" && inboundType !== "webhook") {
      console.log(
        `Testing IMAP connection for ${email_address} (auth: ${authType})...`,
      );
      const imapTest = await testImapConnection(
        imapHostToUse,
        imapPortToUse,
        imap_username || email_address,
        imap_password || "",
        authType,
        authType === "oauth2"
          ? {
              clientId: oauth2?.clientId,
              clientSecret: oauth2?.clientSecret,
              accessToken: oauth2?.accessToken,
              refreshToken: oauth2?.refreshToken,
              provider: detectedProvider,
            }
          : undefined,
      );

      if (!imapTest.success) {
        return res.status(400).json({
          success: false,
          message: "IMAP connection failed",
          error: imapTest.error,
        });
      }
    } else {
      console.log(
        `Skipping IMAP test — inbound method is ${inboundType} (webhook-based)`,
      );
    }

    // Test SMTP connection
    console.log(`Testing SMTP connection for ${email_address}...`);
    const smtpTest = await testSmtpConnection(
      smtpHostToUse,
      smtpPortToUse,
      smtp_username || email_address,
      smtp_password || "",
      authType,
      authType === "oauth2"
        ? {
            clientId: oauth2?.clientId,
            clientSecret: oauth2?.clientSecret,
            accessToken: oauth2?.accessToken,
            refreshToken: oauth2?.refreshToken,
            provider: detectedProvider,
          }
        : undefined,
    );

    if (!smtpTest.success) {
      return res.status(400).json({
        success: false,
        message: "SMTP connection failed",
        error: smtpTest.error,
      });
    }

    // Create email configuration
    // Note: Passwords and OAuth2 secrets will be encrypted by pre-save hook in the model
    const emailConfig = new ProjectEmailConfig({
      projectId,
      emailAddress: email_address.toLowerCase(),
      provider: detectedProvider,
      authMethod: authType,
      inboundMethod: inboundType,
      imapHost: inboundType === "imap" ? imapHostToUse : "",
      imapPort: inboundType === "imap" ? imapPortToUse : 993,
      imapUsername:
        inboundType === "imap" ? imap_username || email_address : "",
      imapPassword: inboundType === "imap" ? imap_password || "" : "",
      // Webhook fields
      webhookProvider: inboundType === "webhook" ? webhook_provider || "" : "",
      webhookPayloadMap:
        inboundType === "webhook" ? webhook_payload_map || {} : {},
      smtpHost: smtpHostToUse,
      smtpPort: smtpPortToUse,
      smtpUsername: smtp_username || email_address,
      smtpPassword: smtp_password || "", // Will be encrypted by pre-save hook
      // OAuth2 fields (will be encrypted by pre-save hook)
      ...(authType === "oauth2" && oauth2
        ? {
            oauth2: {
              clientId: oauth2.clientId,
              clientSecret: oauth2.clientSecret,
              refreshToken: oauth2.refreshToken,
              accessToken: oauth2.accessToken,
              tokenExpiry: oauth2.tokenExpiry
                ? new Date(oauth2.tokenExpiry)
                : undefined,
              scope: oauth2.scope,
            },
          }
        : {}),
      lastCheckedAt: new Date(),
      lastCheckStatus: "success",
    });

    await emailConfig.save();

    console.log(
      `✅ Email configuration added for ${email_address} (provider: ${detectedProvider}, auth: ${authType})`,
    );

    return res.status(201).json({
      success: true,
      message: "Email configuration added successfully",
      data: {
        id: emailConfig._id,
        projectId: emailConfig.projectId,
        emailAddress: emailConfig.emailAddress,
        provider: emailConfig.provider,
        authMethod: emailConfig.authMethod,
        imapHost: emailConfig.imapHost,
        imapPort: emailConfig.imapPort,
        smtpHost: emailConfig.smtpHost,
        smtpPort: emailConfig.smtpPort,
        isEnabled: emailConfig.isEnabled,
        inboundMethod: emailConfig.inboundMethod,
        webhookProvider: (emailConfig as any).webhookProvider || "",
        webhookPayloadMap: (emailConfig as any).webhookPayloadMap || null,
        lastCheckedAt: emailConfig.lastCheckedAt,
        lastCheckStatus: emailConfig.lastCheckStatus,
      },
    });
  } catch (error: any) {
    console.error("Error adding email configuration:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to add email configuration",
      error: error.message,
    });
  }
};

/**
 * GET /api/projects/:projectId/email-configs
 * Get all email configurations for a project (Task 2.2)
 * Supports pagination via query params: page, limit
 */
export const getEmailConfigs = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { page = "1", limit = "10", includeDisabled = "true" } = req.query;

    // Validate project ID format
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid project ID",
      });
    }

    // Check if project exists
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Build query
    const query: any = { projectId };
    if (includeDisabled === "false") {
      query.isEnabled = true;
    }

    // Parse pagination params
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Get total count
    const total = await ProjectEmailConfig.countDocuments(query);

    // Get configs with pagination
    const configs = await ProjectEmailConfig.find(query)
      .select("-imapPassword -smtpPassword") // Exclude passwords
      .sort({ createdAt: -1 }) // Newest first
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Transform data to include connection status
    const transformedConfigs = configs.map((config: any) => ({
      _id: config._id, // Changed from 'id' to '_id' for frontend compatibility
      projectId: config.projectId,
      emailAddress: config.emailAddress,
      isEnabled: config.isEnabled,
      imapHost: config.imapHost,
      imapPort: config.imapPort,
      imapUsername: config.imapUsername,
      smtpHost: config.smtpHost,
      smtpPort: config.smtpPort,
      smtpUsername: config.smtpUsername,
      // Task 8.2: Connection status tracking (flat structure for frontend)
      connectionStatus: config.connectionStatus || "untested",
      lastConnectionTest: config.lastConnectionTest || null,
      lastConnectionError: config.lastConnectionError || null,
      failedAttempts: config.failedAttempts || 0,
      nextRetryAt: config.nextRetryAt || null,
      lastSuccessfulConnection: config.lastSuccessfulConnection || null,
      // Legacy status fields (for backward compatibility)
      lastCheckedAt: config.lastCheckedAt || null,
      lastCheckStatus: config.lastCheckStatus || "unknown",
      lastCheckError: config.lastCheckError || null,
      // Inbound method details
      inboundMethod: config.inboundMethod || "imap",
      webhookProvider: (config as any).webhookProvider || "",
      webhookPayloadMap: (config as any).webhookPayloadMap || null,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    }));

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    return res.status(200).json({
      success: true,
      data: transformedConfigs,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages,
        hasNextPage,
        hasPrevPage,
      },
    });
  } catch (error: any) {
    console.error("Error fetching email configurations:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch email configurations",
      error: error.message,
    });
  }
};

/**
 * PUT /api/projects/:projectId/email-configs/:configId
 * Update email configuration
 */
export const updateEmailConfig = async (req: Request, res: Response) => {
  try {
    const { projectId, configId } = req.params;
    const {
      email_address,
      imap_host,
      imap_port,
      imap_username,
      imap_password,
      smtp_host,
      smtp_port,
      smtp_username,
      smtp_password,
      isEnabled,
    } = req.body;

    console.log("📝 Update email config request:");
    console.log("   Project ID:", projectId);
    console.log("   Config ID:", configId);
    console.log("   Email address:", email_address);

    // Validate IDs
    if (
      !mongoose.Types.ObjectId.isValid(projectId) ||
      !mongoose.Types.ObjectId.isValid(configId)
    ) {
      console.log("   ❌ Invalid ID format");
      return res.status(400).json({
        success: false,
        message: "Invalid project ID or config ID",
      });
    }

    // Find config
    const config = await ProjectEmailConfig.findOne({
      _id: configId,
      projectId,
    });

    if (!config) {
      console.log("   ❌ Config not found");
      return res.status(404).json({
        success: false,
        message: "Email configuration not found",
      });
    }

    // Check if email is being changed and if it's already used by another config
    if (email_address && email_address !== config.emailAddress) {
      const existingConfig = await ProjectEmailConfig.findOne({
        emailAddress: email_address.toLowerCase(),
        projectId,
        _id: { $ne: configId }, // Exclude current config
      });

      if (existingConfig) {
        console.log("   ❌ Email already in use");
        return res.status(400).json({
          success: false,
          message: "Email address is already configured for this project",
        });
      }
    }

    // Update fields if provided
    if (email_address !== undefined)
      config.emailAddress = email_address.toLowerCase();
    if (req.body.inbound_method !== undefined)
      (config as any).inboundMethod = req.body.inbound_method;
    if (req.body.webhook_provider !== undefined)
      (config as any).webhookProvider = req.body.webhook_provider;
    if (req.body.webhook_payload_map !== undefined)
      (config as any).webhookPayloadMap = req.body.webhook_payload_map;
    if (imap_host !== undefined) config.imapHost = imap_host;
    if (imap_port !== undefined) config.imapPort = Number(imap_port);
    if (imap_username !== undefined) config.imapUsername = imap_username;
    if (smtp_host !== undefined) config.smtpHost = smtp_host;
    if (smtp_port !== undefined) config.smtpPort = Number(smtp_port);
    if (smtp_username !== undefined) config.smtpUsername = smtp_username;
    if (typeof isEnabled === "boolean") config.isEnabled = isEnabled;

    // Only update passwords if provided (they are optional in updates)
    // Passwords will be encrypted by pre-save hook in the model
    if (imap_password) {
      config.imapPassword = imap_password;
    }
    if (smtp_password) {
      config.smtpPassword = smtp_password;
    }

    await config.save();

    console.log(`✅ Updated email config: ${config.emailAddress}`);

    return res.status(200).json({
      success: true,
      message: "Email configuration updated successfully",
      data: {
        id: config._id,
        emailAddress: config.emailAddress,
        imapHost: config.imapHost,
        imapPort: config.imapPort,
        imapUsername: config.imapUsername,
        smtpHost: config.smtpHost,
        smtpPort: config.smtpPort,
        smtpUsername: config.smtpUsername,
        isEnabled: config.isEnabled,
        updatedAt: config.updatedAt,
      },
    });
  } catch (error: any) {
    console.error("Error updating email configuration:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update email configuration",
      error: error.message,
    });
  }
};

/**
 * PATCH /api/email-configs/:configId/toggle
 * Toggle email configuration on/off (Task 2.3)
 * Toggles the isEnabled field
 */
export const toggleEmailConfig = async (req: Request, res: Response) => {
  try {
    const { configId } = req.params;

    // Validate config ID format
    if (!mongoose.Types.ObjectId.isValid(configId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid configuration ID",
      });
    }

    // Find config
    const config = await ProjectEmailConfig.findById(configId);

    if (!config) {
      return res.status(404).json({
        success: false,
        message: "Email configuration not found",
      });
    }

    // Store old value for logging
    const oldValue = config.isEnabled;

    // Toggle isEnabled
    config.isEnabled = !config.isEnabled;
    await config.save();

    console.log(
      `🔄 Toggled email config ${config.emailAddress}: ${oldValue} → ${config.isEnabled}`,
    );

    return res.status(200).json({
      success: true,
      message: `Email configuration ${config.isEnabled ? "enabled" : "disabled"} successfully`,
      data: {
        id: config._id,
        projectId: config.projectId,
        emailAddress: config.emailAddress,
        isEnabled: config.isEnabled,
        imapHost: config.imapHost,
        imapPort: config.imapPort,
        smtpHost: config.smtpHost,
        smtpPort: config.smtpPort,
        updatedAt: config.updatedAt,
      },
    });
  } catch (error: any) {
    console.error("Error toggling email configuration:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to toggle email configuration",
      error: error.message,
    });
  }
};

/**
 * DELETE /api/projects/:projectId/email-configs/:configId
 * Delete email configuration
 */
export const deleteEmailConfig = async (req: Request, res: Response) => {
  try {
    const { projectId, configId } = req.params;

    // Validate IDs
    if (
      !mongoose.Types.ObjectId.isValid(projectId) ||
      !mongoose.Types.ObjectId.isValid(configId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid project ID or config ID",
      });
    }

    // Find and delete config
    // Find config first to get email address
    const config = await ProjectEmailConfig.findOne({
      _id: configId,
      projectId,
    });

    if (!config) {
      return res.status(404).json({
        success: false,
        message: "Email configuration not found",
      });
    }

    const emailAddress = config.emailAddress;

    // Delete the config
    await ProjectEmailConfig.findOneAndDelete({
      _id: configId,
      projectId,
    });

    console.log(`🗑️ Deleted email configuration for ${emailAddress}`);

    return res.status(200).json({
      success: true,
      message: "Email configuration deleted successfully",
    });
  } catch (error: any) {
    console.error("Error deleting email configuration:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete email configuration",
      error: error.message,
    });
  }
};

/**
 * DELETE /api/email-configs/:configId
 * Delete email configuration with ticket check (Task 2.4)
 */
export const deleteEmailConfigById = async (req: Request, res: Response) => {
  try {
    const { configId } = req.params;
    const { force = "false" } = req.query;

    // Validate config ID format
    if (!mongoose.Types.ObjectId.isValid(configId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid configuration ID",
      });
    }

    // Find config
    const config = await ProjectEmailConfig.findById(configId);

    if (!config) {
      return res.status(404).json({
        success: false,
        message: "Email configuration not found",
      });
    }

    // Check if any tickets were created using this email
    const ticketCount = await Ticket.countDocuments({
      sourceEmail: config.emailAddress.toLowerCase(),
    });

    if (ticketCount > 0 && force !== "true") {
      return res.status(409).json({
        success: false,
        message: `Cannot delete email configuration. ${ticketCount} ticket(s) were created using this email.`,
        data: {
          ticketCount,
          emailAddress: config.emailAddress,
          suggestion:
            "Consider disabling instead, or use ?force=true to delete anyway",
        },
      });
    }

    // Store email for logging
    const emailAddress = config.emailAddress;
    const projectId = config.projectId;

    // Hard delete
    await ProjectEmailConfig.findByIdAndDelete(configId);

    console.log(
      `🗑️ Deleted email configuration: ${emailAddress} (${ticketCount} related tickets)`,
    );

    return res.status(200).json({
      success: true,
      message: "Email configuration deleted successfully",
      data: {
        deletedEmail: emailAddress,
        projectId,
        relatedTickets: ticketCount,
      },
    });
  } catch (error: any) {
    console.error("Error deleting email configuration:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete email configuration",
      error: error.message,
    });
  }
};

/**
 * POST /api/email-configs/:configId/test
 * Test email configuration connection (Task 2.5)
 */
export const testEmailConfigConnection = async (
  req: Request,
  res: Response,
) => {
  try {
    const { configId } = req.params;

    console.log("🔍 Test connection request received");
    console.log("   Config ID:", configId);
    console.log("   Config ID type:", typeof configId);
    console.log(
      "   Is valid ObjectId:",
      mongoose.Types.ObjectId.isValid(configId),
    );

    // Validate config ID format
    if (!configId || !mongoose.Types.ObjectId.isValid(configId)) {
      console.log("   ❌ Invalid config ID format");
      return res.status(400).json({
        success: false,
        message: "Invalid configuration ID",
      });
    }

    // Find config
    const config = await ProjectEmailConfig.findById(configId);

    if (!config) {
      return res.status(404).json({
        success: false,
        message: "Email configuration not found",
      });
    }

    console.log(`🔌 Testing email configuration: ${config.emailAddress}`);

    const inboundMethodRaw = config.inboundMethod as string;
    const isWebhookInbound =
      inboundMethodRaw === "webhook" || inboundMethodRaw === "sendgrid";

    // Get decrypted passwords
    const imapPassword = config.getDecryptedImapPassword();
    const smtpPassword = config.getDecryptedSmtpPassword();

    // Test IMAP connection — skip for webhook-based inbound
    let imapResult: { success: boolean; error?: string };
    if (isWebhookInbound) {
      console.log("  📥 Skipping IMAP test — inbound method is webhook-based");
      imapResult = { success: true };
    } else {
      console.log("  📥 Testing IMAP connection...");
      imapResult = await testImapConnection(
        config.imapHost,
        config.imapPort,
        config.imapUsername,
        imapPassword,
      );
    }

    // Test SMTP connection
    console.log("  📤 Testing SMTP connection...");
    const smtpResult = await testSmtpConnection(
      config.smtpHost,
      config.smtpPort,
      config.smtpUsername,
      smtpPassword,
    );

    // Determine overall success
    const overallSuccess = imapResult.success && smtpResult.success;

    // Update connection status in database (Task 8.2)
    config.lastCheckedAt = new Date();
    config.lastConnectionTest = new Date();

    if (overallSuccess) {
      config.lastCheckStatus = "success";
      config.lastCheckError = undefined;
      config.connectionStatus = "connected"; // Task 8.2: Update connection status
      config.lastSuccessfulConnection = new Date();
      config.failedAttempts = 0;
      config.nextRetryAt = undefined;
      config.lastConnectionError = undefined;
    } else {
      config.lastCheckStatus = "failed";
      const errors = [];
      if (!imapResult.success) errors.push(`IMAP: ${imapResult.error}`);
      if (!smtpResult.success) errors.push(`SMTP: ${smtpResult.error}`);
      config.lastCheckError = errors.join("; ");
      config.connectionStatus = "error"; // Task 8.2: Update connection status
      config.lastConnectionError = errors.join("; ");
      config.failedAttempts = (config.failedAttempts || 0) + 1;
    }
    await config.save();

    console.log(
      `  ${overallSuccess ? "✅" : "❌"} Connection test ${
        overallSuccess ? "passed" : "failed"
      }`,
    );

    return res.status(200).json({
      success: overallSuccess,
      message: overallSuccess
        ? "Email connection test successful"
        : "Email connection test failed",
      data: {
        emailAddress: config.emailAddress,
        imap: isWebhookInbound
          ? {
              success: true,
              skipped: true,
              reason: "Webhook inbound — no IMAP needed",
            }
          : {
              success: imapResult.success,
              error: imapResult.error,
              host: config.imapHost,
              port: config.imapPort,
            },
        smtp: {
          success: smtpResult.success,
          error: smtpResult.error,
          host: config.smtpHost,
          port: config.smtpPort,
        },
        testedAt: config.lastCheckedAt,
      },
    });
  } catch (error: any) {
    console.error("Error testing email configuration:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to test email configuration",
      error: error.message,
    });
  }
};

/**
 * POST /api/projects/:projectId/email-configs/test-credentials
 * Test email credentials without saving (for use in add/edit modals)
 * Supports basic auth, app_password, and oauth2
 */
export const testEmailCredentials = async (req: Request, res: Response) => {
  try {
    const {
      imapHost,
      imapPort,
      imapUsername,
      imapPassword,
      smtpHost,
      smtpPort,
      smtpUsername,
      smtpPassword,
      // New OAuth2 fields
      emailAddress,
      provider,
      authMethod = "basic",
      oauth2,
    } = req.body;

    const authType = authMethod as AuthMethod;
    // Detect provider from email first, then fall back to host detection
    let detectedProvider =
      provider || detectEmailProvider(emailAddress || imapUsername || "");
    if (detectedProvider === "other") {
      // Try to detect from IMAP/SMTP hosts (helps with custom domains using Google/Microsoft)
      detectedProvider = detectProviderFromHost(imapHost, smtpHost);
    }
    const defaults = getProviderDefaults(detectedProvider);

    // Validate based on auth method
    if (authType === "oauth2") {
      if (!oauth2?.clientId || !oauth2?.refreshToken) {
        return res.status(400).json({
          success: false,
          message: "OAuth2 authentication requires clientId and refreshToken",
        });
      }
    } else {
      // Validate required fields for basic/app_password
      if (!imapHost || !imapPort || !imapUsername || !imapPassword) {
        return res.status(400).json({
          success: false,
          message: "Missing required IMAP credentials",
        });
      }

      if (!smtpHost || !smtpPort || !smtpUsername || !smtpPassword) {
        return res.status(400).json({
          success: false,
          message: "Missing required SMTP credentials",
        });
      }
    }

    // Use defaults for OAuth2 if not provided
    const imapHostToUse = imapHost || defaults.imapHost;
    const imapPortToUse = imapPort || defaults.imapPort;
    const smtpHostToUse = smtpHost || defaults.smtpHost;
    const smtpPortToUse = smtpPort || defaults.smtpPort;

    console.log(
      `🔌 Testing email credentials (auth: ${authType}, provider: ${detectedProvider})`,
    );
    console.log(
      `   IMAP: ${imapHostToUse}:${imapPortToUse}, SMTP: ${smtpHostToUse}:${smtpPortToUse}`,
    );

    // Test IMAP connection
    console.log("  📥 Testing IMAP connection...");
    const imapResult = await testImapConnection(
      imapHostToUse,
      Number(imapPortToUse),
      imapUsername || emailAddress,
      imapPassword || "",
      authType,
      authType === "oauth2"
        ? {
            clientId: oauth2?.clientId,
            clientSecret: oauth2?.clientSecret,
            accessToken: oauth2?.accessToken,
            refreshToken: oauth2?.refreshToken,
            provider: detectedProvider,
          }
        : undefined,
    );

    // Test SMTP connection
    console.log("  📤 Testing SMTP connection...");
    const smtpResult = await testSmtpConnection(
      smtpHostToUse,
      Number(smtpPortToUse),
      smtpUsername || emailAddress,
      smtpPassword || "",
      authType,
      authType === "oauth2"
        ? {
            clientId: oauth2?.clientId,
            clientSecret: oauth2?.clientSecret,
            accessToken: oauth2?.accessToken,
            refreshToken: oauth2?.refreshToken,
            provider: detectedProvider,
          }
        : undefined,
    );

    // Determine overall status
    const overallSuccess = imapResult.success && smtpResult.success;

    console.log(
      `  ${overallSuccess ? "✅" : "❌"} Test result: ${overallSuccess ? "Success" : "Failed"}`,
    );

    return res.status(200).json({
      success: overallSuccess,
      message: overallSuccess
        ? "Both IMAP and SMTP connections successful"
        : "One or more connections failed",
      data: {
        imap: {
          success: imapResult.success,
          error: imapResult.error,
          host: imapHostToUse,
          port: Number(imapPortToUse),
        },
        smtp: {
          success: smtpResult.success,
          error: smtpResult.error,
          host: smtpHostToUse,
          port: Number(smtpPortToUse),
        },
        provider: detectedProvider,
        authMethod: authType,
        testedAt: new Date(),
      },
    });
  } catch (error: any) {
    console.error("Error testing email credentials:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to test email credentials",
      error: error.message,
    });
  }
};

/**
 * POST /api/projects/:projectId/email-configs/oauth2/auth-url
 * Generate OAuth2 authorization URL for Google or Microsoft
 */
export const getOAuth2AuthUrl = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { provider, clientId, clientSecret, redirectUri } = req.body;

    if (!provider || !clientId || !redirectUri) {
      return res.status(400).json({
        success: false,
        message: "Provider, clientId, and redirectUri are required",
      });
    }

    let authUrl: string;

    if (provider === "google") {
      if (!clientSecret) {
        return res.status(400).json({
          success: false,
          message: "clientSecret is required for Google OAuth2",
        });
      }

      const oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        redirectUri,
      );

      authUrl = oauth2Client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent", // Force consent to get refresh token
        scope: [
          "https://mail.google.com/", // Full Gmail access for IMAP/SMTP
          "https://www.googleapis.com/auth/userinfo.email",
        ],
        state: JSON.stringify({ projectId, provider: "google" }),
      });
    } else if (provider === "microsoft") {
      // Microsoft OAuth2 endpoint
      const scopes = [
        "https://outlook.office365.com/IMAP.AccessAsUser.All",
        "https://outlook.office365.com/SMTP.Send",
        "offline_access",
        "openid",
        "email",
      ];

      const params = new URLSearchParams({
        client_id: clientId,
        response_type: "code",
        redirect_uri: redirectUri,
        response_mode: "query",
        scope: scopes.join(" "),
        state: JSON.stringify({ projectId, provider: "microsoft" }),
        prompt: "consent",
      });

      authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid provider. Supported: google, microsoft",
      });
    }

    return res.status(200).json({
      success: true,
      data: { authUrl },
    });
  } catch (error: any) {
    console.error("Error generating OAuth2 auth URL:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate OAuth2 authorization URL",
      error: error.message,
    });
  }
};

/**
 * POST /api/projects/:projectId/email-configs/oauth2/callback
 * Handle OAuth2 callback and exchange authorization code for tokens
 */
export const handleOAuth2Callback = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { code, provider, clientId, clientSecret, redirectUri } = req.body;

    if (!code || !provider || !clientId || !clientSecret || !redirectUri) {
      return res.status(400).json({
        success: false,
        message:
          "code, provider, clientId, clientSecret, and redirectUri are required",
      });
    }

    let tokens: {
      accessToken: string;
      refreshToken?: string;
      expiresIn?: number;
      email?: string;
    };

    if (provider === "google") {
      const oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        redirectUri,
      );

      const { tokens: googleTokens } = await oauth2Client.getToken(code);

      if (!googleTokens.access_token) {
        return res.status(400).json({
          success: false,
          message: "Failed to obtain access token from Google",
        });
      }

      // Get user email
      oauth2Client.setCredentials(googleTokens);
      const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
      const { data: userInfo } = await oauth2.userinfo.get();

      tokens = {
        accessToken: googleTokens.access_token,
        refreshToken: googleTokens.refresh_token || undefined,
        expiresIn: googleTokens.expiry_date
          ? Math.floor((googleTokens.expiry_date - Date.now()) / 1000)
          : 3600,
        email: userInfo.email || undefined,
      };
    } else if (provider === "microsoft") {
      // Exchange code for tokens using Microsoft endpoint
      const tokenEndpoint =
        "https://login.microsoftonline.com/common/oauth2/v2.0/token";

      const params = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        scope:
          "https://outlook.office365.com/IMAP.AccessAsUser.All https://outlook.office365.com/SMTP.Send offline_access openid email",
      });

      const response = await fetch(tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Microsoft token exchange failed:", errorText);
        return res.status(400).json({
          success: false,
          message: "Failed to exchange code for tokens with Microsoft",
          error: errorText,
        });
      }

      const tokenData = (await response.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
        id_token?: string;
      };

      // Decode id_token to get email (basic JWT parsing)
      let email: string | undefined;
      if (tokenData.id_token) {
        try {
          const payload = JSON.parse(
            Buffer.from(tokenData.id_token.split(".")[1], "base64").toString(),
          );
          email = payload.email || payload.preferred_username;
        } catch (e) {
          console.warn("Failed to decode Microsoft id_token:", e);
        }
      }

      tokens = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresIn: tokenData.expires_in || 3600,
        email,
      };
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid provider. Supported: google, microsoft",
      });
    }

    // Return tokens to frontend (they should be saved securely)
    return res.status(200).json({
      success: true,
      message: "OAuth2 authorization successful",
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        email: tokens.email,
        provider,
      },
    });
  } catch (error: any) {
    console.error("Error handling OAuth2 callback:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to complete OAuth2 authorization",
      error: error.message,
    });
  }
};
