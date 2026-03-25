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
        if (authMethod === "basic") {
          // Check if it's a Microsoft host
          if (
            host.includes("office365") ||
            host.includes("outlook") ||
            host.includes("microsoft")
          ) {
            errorMessage +=
              " - Microsoft 365 has disabled basic IMAP authentication. Please switch to App Password (enable 2FA first at https://myaccount.microsoft.com, then create an App Password) or use OAuth2.";
          } else if (host.includes("gmail") || host.includes("google")) {
            errorMessage +=
              " - For Google accounts, please use an App Password (enable 2FA first at https://myaccount.google.com/apppasswords).";
          } else {
            errorMessage +=
              " - For Google/Microsoft accounts, please use App Password or OAuth2 authentication.";
          }
        } else if (authMethod === "app_password") {
          // User is already using an App Password — point to admin settings
          if (
            host.includes("office365") ||
            host.includes("outlook") ||
            host.includes("microsoft")
          ) {
            errorMessage +=
              " - App Password rejected by Microsoft 365. Microsoft deprecated Basic/Legacy Authentication for IMAP in October 2022. Even with a valid App Password, this will fail if your tenant has Security Defaults enabled (Azure Portal → Microsoft Entra ID → Properties → Manage Security Defaults). The only supported solution is OAuth2. Please switch the Authentication Method to OAuth2 in the email configuration, or ask your IT admin to create a Conditional Access exclusion for this service account.";
          } else if (host.includes("gmail") || host.includes("google")) {
            errorMessage +=
              " - App Password rejected by Google. Ensure 2FA is active and the App Password was generated at https://myaccount.google.com/apppasswords. Also check that IMAP access is enabled in Gmail settings.";
          } else {
            errorMessage +=
              " - App Password authentication failed. Verify the password is correct and that IMAP access is enabled for this account.";
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
      outbound_method = "smtp",
      sendgrid_api_key,
      oauth2,
      webhook_provider,
      webhook_payload_map,
    } = req.body;

    // Auto-detect provider from email if not specified
    const detectedProvider =
      provider || detectEmailProvider(email_address || "");
    const authType = authMethod as AuthMethod;
    const inboundType = inbound_method as "imap" | "sendgrid" | "webhook" | "graph";
    const outboundType = (outbound_method || "smtp") as "smtp" | "sendgrid" | "graph";

    // Validate based on auth method and inbound method
    if (authType === "oauth2") {
      // Graph API only requires clientId + clientSecret (client-credentials flow, no refreshToken needed)
      if (inboundType === "graph") {
        if (!oauth2?.clientId || !oauth2?.clientSecret || !oauth2?.tenantId) {
          return res.status(400).json({
            success: false,
            message:
              "Microsoft Graph API requires oauth2.clientId, oauth2.clientSecret, and oauth2.tenantId",
          });
        }
      } else {
        // Standard OAuth2 requires clientId + refreshToken
        if (!oauth2?.clientId || !oauth2?.refreshToken) {
          return res.status(400).json({
            success: false,
            message: "OAuth2 authentication requires clientId and refreshToken",
          });
        }
      }
      if (!email_address) {
        return res.status(400).json({
          success: false,
          message: "Email address is required",
        });
      }
    } else if (inboundType === "sendgrid" || inboundType === "webhook") {
      // Webhook inbound: only email_address + smtp/sendgrid fields needed
      if (!email_address) {
        return res.status(400).json({
          success: false,
          message: "Email address is required for webhook inbound",
        });
      }
      if (
        outboundType !== "sendgrid" &&
        (!smtp_host || !smtp_port || !smtp_username || !smtp_password)
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
        (outboundType !== "sendgrid" &&
          (!smtp_host || !smtp_port || !smtp_username || !smtp_password))
      ) {
        return res.status(400).json({
          success: false,
          message:
            outboundType === "sendgrid"
              ? "IMAP credentials are required"
              : "All fields are required for basic/app_password authentication",
        });
      }
    }

    // When using SendGrid for outbound, require the API key
    if (outboundType === "sendgrid" && !sendgrid_api_key) {
      return res.status(400).json({
        success: false,
        message:
          "SendGrid API key is required when outbound method is SendGrid",
      });
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
    if (
      inboundType !== "sendgrid" &&
      inboundType !== "webhook" &&
      inboundType !== "graph"
    ) {
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
        `Skipping IMAP test — inbound method is ${inboundType} (webhook-based or Graph API)`,
      );
    }

    // Test SMTP connection (skip when using SendGrid, Graph API for outbound, or Graph API for inbound)
    // When inbound is Graph API (client_credentials), OAuth2 tokens are scoped to Graph REST only
    // and cannot be used for SMTP XOAUTH2. SMTP relay uses separate basic credentials.
    if (outboundType !== "sendgrid" && outboundType !== "graph" && inboundType !== "graph") {
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
    } else {
      console.log(`Skipping SMTP test — outbound method is ${outboundType}${inboundType === "graph" ? " (Graph API inbound)" : ""}`);
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
      // Forwarded mailbox fields
      isForwardedMailbox:
        req.body.is_forwarded_mailbox === true ||
        req.body.is_forwarded_mailbox === "true",
      originalEmailAddress:
        req.body.original_email_address?.toLowerCase() || "",
      replySignature: req.body.reply_signature || "",
      outboundMethod: outboundType,
      sendgridApiKey: outboundType === "sendgrid" ? sendgrid_api_key || "" : "",
      smtpHost:
        outboundType === "sendgrid" || outboundType === "graph"
          ? ""
          : smtpHostToUse,
      smtpPort:
        outboundType === "sendgrid" || outboundType === "graph"
          ? 587
          : smtpPortToUse,
      smtpUsername:
        outboundType === "sendgrid" || outboundType === "graph"
          ? ""
          : smtp_username || email_address,
      smtpPassword:
        outboundType === "sendgrid" || outboundType === "graph"
          ? ""
          : smtp_password || "", // Will be encrypted by pre-save hook
      // OAuth2 fields (will be encrypted by pre-save hook)
      ...(authType === "oauth2" && oauth2
        ? {
            oauth2: {
              clientId: oauth2.clientId,
              clientSecret: oauth2.clientSecret,
              tenantId: oauth2.tenantId,
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
      isForwardedMailbox: (config as any).isForwardedMailbox ?? false,
      originalEmailAddress: (config as any).originalEmailAddress || "",
      replySignature: (config as any).replySignature || "",
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
    if (req.body.provider !== undefined)
      (config as any).provider = req.body.provider;
    if (req.body.inbound_method !== undefined)
      (config as any).inboundMethod = req.body.inbound_method;
    // When Graph API is selected as inbound, force authMethod to "oauth2" regardless of what was sent.
    // Graph API uses client_credentials — "basic" or "app_password" are meaningless and cause errors.
    const effectiveInboundMethod = req.body.inbound_method ?? (config as any).inboundMethod;
    if (req.body.authMethod !== undefined) {
      (config as any).authMethod =
        effectiveInboundMethod === "graph" ? "oauth2" : req.body.authMethod;
    } else if (effectiveInboundMethod === "graph" && (config as any).authMethod !== "oauth2") {
      (config as any).authMethod = "oauth2";
    }
    if (req.body.webhook_provider !== undefined)
    if (req.body.webhook_payload_map !== undefined)
      (config as any).webhookPayloadMap = req.body.webhook_payload_map;
    if (req.body.is_forwarded_mailbox !== undefined)
      (config as any).isForwardedMailbox =
        req.body.is_forwarded_mailbox === true ||
        req.body.is_forwarded_mailbox === "true";
    if (req.body.original_email_address !== undefined)
      (config as any).originalEmailAddress =
        req.body.original_email_address?.toLowerCase() || "";
    if (req.body.reply_signature !== undefined)
      (config as any).replySignature = req.body.reply_signature;
    if (imap_host !== undefined) config.imapHost = imap_host;
    if (imap_port !== undefined) config.imapPort = Number(imap_port);
    if (imap_username !== undefined) config.imapUsername = imap_username;
    if (smtp_host !== undefined) config.smtpHost = smtp_host;
    if (smtp_port !== undefined) config.smtpPort = Number(smtp_port);
    if (smtp_username !== undefined) config.smtpUsername = smtp_username;
    if (typeof isEnabled === "boolean") config.isEnabled = isEnabled;
    if (req.body.outbound_method !== undefined)
      (config as any).outboundMethod = req.body.outbound_method;

    // Only update passwords if provided (they are optional in updates)
    // Passwords will be encrypted by pre-save hook in the model
    if (imap_password) {
      config.imapPassword = imap_password;
    }
    if (smtp_password) {
      config.smtpPassword = smtp_password;
    }
    // Update SendGrid API key if provided
    if (req.body.sendgrid_api_key) {
      (config as any).sendgridApiKey = req.body.sendgrid_api_key;
    }

    // Update OAuth2 fields if provided (passwords encrypted by pre-save hook)
    if (req.body.oauth2 && typeof req.body.oauth2 === "object") {
      const existingOauth2 = (config as any).oauth2 || {};
      (config as any).oauth2 = {
        ...existingOauth2,
        ...(req.body.oauth2.clientId !== undefined && {
          clientId: req.body.oauth2.clientId,
        }),
        ...(req.body.oauth2.clientSecret && {
          clientSecret: req.body.oauth2.clientSecret,
        }),
        ...(req.body.oauth2.tenantId !== undefined && {
          tenantId: req.body.oauth2.tenantId,
        }),
        ...(req.body.oauth2.refreshToken && {
          refreshToken: req.body.oauth2.refreshToken,
        }),
        ...(req.body.oauth2.scope !== undefined && {
          scope: req.body.oauth2.scope,
        }),
      };
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
    const outboundMethodRaw = (config as any).outboundMethod as string;
    const isGraphInbound = inboundMethodRaw === "graph";
    const isWebhookInbound =
      inboundMethodRaw === "webhook" || inboundMethodRaw === "sendgrid";
    const isSendgridOutbound = outboundMethodRaw === "sendgrid";

    // Get decrypted passwords
    const imapPassword = config.getDecryptedImapPassword();
    const smtpPassword = config.getDecryptedSmtpPassword();

    // ── Inbound test ─────────────────────────────────────────────────────────
    let imapResult: { success: boolean; error?: string; skipped?: boolean };

    if (isGraphInbound) {
      // Graph API: test client_credentials token fetch instead of IMAP
      console.log("  🔑 Testing Microsoft Graph API credentials (client_credentials)...");
      const oauth2 = (config as any).oauth2;
      const clientId = oauth2?.clientId;
      const tenantId = oauth2?.tenantId;
      const clientSecret: string = config.getDecryptedOAuth2ClientSecret
        ? config.getDecryptedOAuth2ClientSecret()
        : oauth2?.clientSecret || "";

      if (!clientId || !tenantId || !clientSecret) {
        imapResult = {
          success: false,
          error: "Graph API credentials incomplete — clientId, tenantId and clientSecret are required. Please edit the config and enter these values.",
        };
      } else {
        try {
          const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
          const tokenRes = await fetch(tokenUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type: "client_credentials",
              client_id: clientId,
              client_secret: clientSecret,
              scope: "https://graph.microsoft.com/.default",
            }).toString(),
          });
          const tokenData: any = await tokenRes.json();
          if (!tokenRes.ok || !tokenData.access_token) {
            imapResult = {
              success: false,
              error: `Graph token error: ${tokenData.error_description || tokenData.error || "No access_token returned"}`,
            };
          } else {
            console.log("  ✅ Graph API token acquired successfully");
            imapResult = { success: true };
          }
        } catch (graphErr: any) {
          imapResult = { success: false, error: `Graph API: ${graphErr.message}` };
        }
      }
    } else if (isWebhookInbound) {
      console.log("  📥 Skipping IMAP test — inbound method is webhook-based");
      imapResult = { success: true, skipped: true };
    } else {
      console.log("  📥 Testing IMAP connection...");
      imapResult = await testImapConnection(
        config.imapHost,
        config.imapPort,
        config.imapUsername,
        imapPassword,
        (config.authMethod as AuthMethod) || "basic",
      );
    }

    // ── Outbound test ─────────────────────────────────────────────────────────
    let smtpResult: { success: boolean; error?: string; skipped?: boolean };

    if (isSendgridOutbound || isGraphInbound) {
      // SendGrid is validated via API key (not SMTP handshake); Graph API outbound
      // uses the same client_credentials already tested above.
      console.log(`  📤 Skipping SMTP test — outbound method is ${outboundMethodRaw || "graph"}`);
      smtpResult = { success: true, skipped: true };
    } else {
      console.log("  📤 Testing SMTP connection...");
      smtpResult = await testSmtpConnection(
        config.smtpHost,
        config.smtpPort,
        config.smtpUsername,
        smtpPassword,
        (config.authMethod as AuthMethod) || "basic",
      );
    }

    // ── Persist result ────────────────────────────────────────────────────────
    const overallSuccess = imapResult.success && smtpResult.success;

    config.lastCheckedAt = new Date();
    config.lastConnectionTest = new Date();

    if (overallSuccess) {
      config.lastCheckStatus = "success";
      config.lastCheckError = undefined;
      config.connectionStatus = "connected";
      config.lastSuccessfulConnection = new Date();
      config.failedAttempts = 0;
      config.nextRetryAt = undefined;
      config.lastConnectionError = undefined;
    } else {
      config.lastCheckStatus = "failed";
      const errors = [];
      if (!imapResult.success) errors.push(isGraphInbound ? `Graph API: ${imapResult.error}` : `IMAP: ${imapResult.error}`);
      if (!smtpResult.success) errors.push(`SMTP: ${smtpResult.error}`);
      config.lastCheckError = errors.join("; ");
      config.connectionStatus = "error";
      config.lastConnectionError = errors.join("; ");
      config.failedAttempts = (config.failedAttempts || 0) + 1;
    }
    await config.save();

    console.log(`  ${overallSuccess ? "✅" : "❌"} Connection test ${overallSuccess ? "passed" : "failed"}`);

    return res.status(200).json({
      success: overallSuccess,
      message: overallSuccess
        ? "Email connection test successful"
        : "Email connection test failed",
      data: {
        emailAddress: config.emailAddress,
        inboundMethod: inboundMethodRaw,
        outboundMethod: outboundMethodRaw,
        imap: isGraphInbound
          ? { success: imapResult.success, error: imapResult.error, method: "graph" }
          : isWebhookInbound
          ? { success: true, skipped: true, reason: "Webhook inbound — no IMAP needed" }
          : { success: imapResult.success, error: imapResult.error, host: config.imapHost, port: config.imapPort },
        smtp: isSendgridOutbound || isGraphInbound
          ? { success: true, skipped: true, reason: `${outboundMethodRaw || "graph"} — no SMTP handshake needed` }
          : { success: smtpResult.success, error: smtpResult.error, host: config.smtpHost, port: config.smtpPort },
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
    const inboundMethodType = (req.body.inboundMethod || req.body.inbound_method || "imap") as string;
    // Detect provider from email first, then fall back to host detection
    let detectedProvider =
      provider || detectEmailProvider(emailAddress || imapUsername || "");
    if (detectedProvider === "other") {
      // Try to detect from IMAP/SMTP hosts (helps with custom domains using Google/Microsoft)
      detectedProvider = detectProviderFromHost(imapHost, smtpHost);
    }
    const defaults = getProviderDefaults(detectedProvider);

    // Validate based on auth method and inbound method
    if (authType === "oauth2") {
      if (inboundMethodType === "graph") {
        // Graph API (client_credentials flow) needs clientId + clientSecret + tenantId; no refreshToken
        if (!oauth2?.clientId || !oauth2?.clientSecret || !oauth2?.tenantId) {
          return res.status(400).json({
            success: false,
            message: "Graph API requires oauth2.clientId, oauth2.clientSecret, and oauth2.tenantId",
          });
        }
      } else {
        // Standard delegated OAuth2 (IMAP/SMTP XOAUTH2) requires refreshToken
        if (!oauth2?.clientId || !oauth2?.refreshToken) {
          return res.status(400).json({
            success: false,
            message: "OAuth2 authentication requires clientId and refreshToken",
          });
        }
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

    const isGraph = inboundMethodType === "graph";

    console.log(
      `🔌 Testing email credentials (auth: ${authType}, provider: ${detectedProvider}, inbound: ${inboundMethodType})`,
    );

    // For Graph API inbound, test client_credentials token fetch (no IMAP)
    if (isGraph) {
      console.log("  🔑 Testing Microsoft Graph API client_credentials token...");
      try {
        const tokenUrl = `https://login.microsoftonline.com/${oauth2.tenantId}/oauth2/v2.0/token`;
        const params = new URLSearchParams({
          grant_type: "client_credentials",
          client_id: oauth2.clientId,
          client_secret: oauth2.clientSecret,
          scope: "https://graph.microsoft.com/.default",
        });
        const tokenRes = await fetch(tokenUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params.toString(),
        });
        const tokenData: any = await tokenRes.json();
        if (!tokenRes.ok || !tokenData.access_token) {
          return res.status(200).json({
            success: false,
            message: "Graph API token fetch failed",
            data: {
              imap: { success: false, error: `Graph API: ${tokenData.error_description || tokenData.error || "Token fetch failed"}` },
              smtp: { success: true, error: undefined },
              provider: detectedProvider,
              authMethod: authType,
              testedAt: new Date(),
            },
          });
        }
        console.log("  ✅ Graph API token acquired successfully");
        return res.status(200).json({
          success: true,
          message: "Microsoft Graph API credentials verified successfully",
          data: {
            imap: { success: true },
            smtp: { success: true },
            provider: detectedProvider,
            authMethod: authType,
            testedAt: new Date(),
          },
        });
      } catch (graphError: any) {
        return res.status(200).json({
          success: false,
          message: "Graph API connection test failed",
          data: {
            imap: { success: false, error: graphError.message },
            smtp: { success: true },
            provider: detectedProvider,
            authMethod: authType,
            testedAt: new Date(),
          },
        });
      }
    }

    // Standard IMAP + SMTP test
    console.log(`   IMAP: ${imapHostToUse}:${imapPortToUse}, SMTP: ${smtpHostToUse}:${smtpPortToUse}`);

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
