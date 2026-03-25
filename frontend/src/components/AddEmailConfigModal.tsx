import React, { useState, useEffect } from "react";
import axios from "axios";
import { API_CONFIG } from "../config/constants";
import {
  XMarkIcon,
  EnvelopeIcon,
  ServerIcon,
  SignalIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";

// Provider and auth method types
type EmailProvider = "google" | "microsoft" | "other";
type AuthMethod = "basic" | "app_password" | "oauth2";
type InboundMethod = "imap" | "webhook" | "graph";

type WebhookPayloadMap = {
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
  messageId: string;
};

// Vendor presets — auto-fill webhookPayloadMap from known provider schemas.
// Add new vendors here; zero backend changes needed.
const WEBHOOK_PRESETS: Record<
  string,
  { label: string; payloadMap: WebhookPayloadMap }
> = {
  sendgrid: {
    label: "SendGrid",
    payloadMap: {
      to: "envelope.to[0]",
      from: "from",
      subject: "subject",
      text: "text",
      html: "html",
      messageId: "headers.message-id",
    },
  },
  mailgun: {
    label: "Mailgun",
    payloadMap: {
      to: "recipient",
      from: "sender",
      subject: "subject",
      text: "body-plain",
      html: "body-html",
      messageId: "Message-Id",
    },
  },
  postmark: {
    label: "Postmark",
    payloadMap: {
      to: "To",
      from: "From",
      subject: "Subject",
      text: "TextBody",
      html: "HtmlBody",
      messageId: "MessageID",
    },
  },
  custom: {
    label: "Custom / Other",
    payloadMap: {
      to: "",
      from: "",
      subject: "",
      text: "",
      html: "",
      messageId: "",
    },
  },
};

const DEFAULT_WEBHOOK_VENDOR = "sendgrid";

interface EmailConfig {
  _id: string;
  emailAddress: string;
  imapHost: string;
  imapPort: number;
  imapUsername: string;
  smtpHost: string;
  smtpPort: number;
  smtpUsername: string;
  provider?: EmailProvider;
  authMethod?: AuthMethod;
  inboundMethod?: InboundMethod | "sendgrid";
  webhookProvider?: string;
  webhookPayloadMap?: WebhookPayloadMap;
  isForwardedMailbox?: boolean;
  originalEmailAddress?: string;
  replySignature?: string;
}

interface EmailConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  projectId: string;
  editingConfig?: EmailConfig | null;
}

interface FormData {
  emailAddress: string;
  inboundMethod: InboundMethod;
  webhookProvider: string;
  webhookPayloadMap: WebhookPayloadMap;
  isForwardedMailbox: boolean;
  originalEmailAddress: string;
  imapHost: string;
  imapPort: number | string;
  imapUsername: string;
  imapPassword: string;
  smtpHost: string;
  smtpPort: number | string;
  smtpUsername: string;
  smtpPassword: string;
  replySignature: string;
  provider: EmailProvider;
  authMethod: AuthMethod;
  oauth2ClientId: string;
  oauth2ClientSecret: string;
  oauth2RefreshToken: string;
  oauth2TenantId: string; // Microsoft Tenant ID for Graph API
  outboundMethod: "smtp" | "sendgrid" | "graph";
  sendgridApiKey: string;
}

interface ValidationErrors {
  [key: string]: string;
}

// Detect email provider from email address
const detectEmailProvider = (email: string): EmailProvider => {
  const lowerEmail = email.toLowerCase();
  if (
    lowerEmail.includes("@gmail.com") ||
    lowerEmail.includes("@googlemail.com")
  ) {
    return "google";
  }
  if (
    lowerEmail.includes("@outlook.") ||
    lowerEmail.includes("@hotmail.") ||
    lowerEmail.includes("@live.") ||
    lowerEmail.includes("@msn.") ||
    lowerEmail.includes("@microsoft.com")
  ) {
    return "microsoft";
  }
  return "other";
};

// Get provider defaults
const getProviderDefaults = (provider: EmailProvider) => {
  switch (provider) {
    case "google":
      return {
        imapHost: "imap.gmail.com",
        imapPort: 993,
        smtpHost: "smtp.gmail.com",
        smtpPort: 587,
      };
    case "microsoft":
      return {
        imapHost: "outlook.office365.com",
        imapPort: 993,
        smtpHost: "smtp.office365.com",
        smtpPort: 587,
      };
    default:
      return {
        imapHost: "",
        imapPort: 993,
        smtpHost: "",
        smtpPort: 587,
      };
  }
};

const EmailConfigModal: React.FC<EmailConfigModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  projectId,
  editingConfig,
}) => {
  // Initialize form data based on edit mode
  const getInitialFormData = (): FormData => {
    if (editingConfig) {
      // Normalise legacy "sendgrid" inboundMethod → "webhook"
      const rawMethod = (editingConfig as any).inboundMethod || "imap";
      const inboundMethod: InboundMethod =
        rawMethod === "sendgrid" || rawMethod === "webhook"
          ? "webhook"
          : rawMethod === "graph"
            ? "graph"
            : "imap";
      const webhookVendor =
        rawMethod === "sendgrid"
          ? "sendgrid"
          : (editingConfig as any).webhookProvider || DEFAULT_WEBHOOK_VENDOR;
      const webhookMap: WebhookPayloadMap =
        (editingConfig as any).webhookPayloadMap ||
        WEBHOOK_PRESETS[webhookVendor]?.payloadMap ||
        WEBHOOK_PRESETS.sendgrid.payloadMap;
      return {
        emailAddress: editingConfig.emailAddress,
        inboundMethod,
        webhookProvider: webhookVendor,
        webhookPayloadMap: webhookMap,
        isForwardedMailbox: (editingConfig as any).isForwardedMailbox ?? false,
        originalEmailAddress: (editingConfig as any).originalEmailAddress ?? "",
        imapHost: editingConfig.imapHost,
        imapPort: editingConfig.imapPort,
        imapUsername: editingConfig.imapUsername,
        imapPassword: "",
        smtpHost: editingConfig.smtpHost,
        smtpPort: editingConfig.smtpPort,
        smtpUsername: editingConfig.smtpUsername,
        smtpPassword: "",
        replySignature: (editingConfig as any).replySignature ?? "",
        provider:
          editingConfig.provider ||
          detectEmailProvider(editingConfig.emailAddress),
        authMethod: (editingConfig.authMethod as AuthMethod) || "basic",
        oauth2ClientId: (editingConfig as any).oauth2?.clientId || "",
        oauth2ClientSecret: "",
        oauth2RefreshToken: (editingConfig as any).oauth2?.refreshToken || "",
        oauth2TenantId: (editingConfig as any).oauth2?.tenantId || "",
        outboundMethod:
          inboundMethod === "graph"
            ? "graph"
            : (editingConfig as any).outboundMethod || "smtp",
        sendgridApiKey: "", // never pre-fill API key
      };
    }
    return {
      emailAddress: "",
      inboundMethod: "imap" as InboundMethod,
      webhookProvider: DEFAULT_WEBHOOK_VENDOR,
      webhookPayloadMap: { ...WEBHOOK_PRESETS.sendgrid.payloadMap },
      isForwardedMailbox: false,
      originalEmailAddress: "",
      imapHost: "",
      imapPort: 993,
      imapUsername: "",
      imapPassword: "",
      smtpHost: "",
      smtpPort: 587,
      smtpUsername: "",
      smtpPassword: "",
      replySignature: "",
      provider: "other",
      authMethod: "basic",
      oauth2ClientId: "",
      oauth2ClientSecret: "",
      oauth2RefreshToken: "",
      oauth2TenantId: "",
      outboundMethod: "smtp",
      sendgridApiKey: "",
    };
  };

  const [formData, setFormData] = useState<FormData>(getInitialFormData());

  const [errors, setErrors] = useState<ValidationErrors>({});
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Update form data when editingConfig changes
  useEffect(() => {
    if (isOpen) {
      setFormData(getInitialFormData());
      setErrors({});
      setTestResult(null);
    }
  }, [isOpen, editingConfig]);

  if (!isOpen) return null;

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateForm = (): boolean => {
    const newErrors: ValidationErrors = {};

    // Email validation
    if (!formData.emailAddress.trim()) {
      newErrors.emailAddress = "Email address is required";
    } else if (!validateEmail(formData.emailAddress)) {
      newErrors.emailAddress = "Invalid email format";
    }

    // IMAP validations — only when using IMAP inbound
    if (formData.inboundMethod === "imap") {
      if (!formData.imapHost.trim()) {
        newErrors.imapHost = "IMAP host is required";
      }
      const imapPort = Number(formData.imapPort);
      if (
        !formData.imapPort ||
        isNaN(imapPort) ||
        imapPort < 1 ||
        imapPort > 65535
      ) {
        newErrors.imapPort = "Valid IMAP port is required (1-65535)";
      }
      if (!formData.imapUsername.trim()) {
        newErrors.imapUsername = "IMAP username is required";
      }
      // Password not needed for OAuth2
      if (
        formData.authMethod !== "oauth2" &&
        !editingConfig &&
        !formData.imapPassword.trim()
      ) {
        newErrors.imapPassword = "IMAP password is required";
      }
    }

    // OAuth2 field validation
    if (formData.authMethod === "oauth2") {
      if (!formData.oauth2ClientId.trim()) {
        newErrors.oauth2ClientId = "Client ID is required";
      }
      if (formData.inboundMethod === "graph") {
        // Graph API uses client_credentials — tenant ID required, no refresh token needed
        if (!formData.oauth2TenantId.trim()) {
          newErrors.oauth2TenantId = "Tenant ID is required for Graph API";
        }
        if (!editingConfig && !formData.oauth2ClientSecret.trim()) {
          newErrors.oauth2ClientSecret =
            "Client Secret is required for Graph API";
        }
      } else {
        if (!formData.oauth2RefreshToken.trim()) {
          newErrors.oauth2RefreshToken = "Refresh Token is required";
        }
      }
    }

    // Forwarded mailbox validation
    if (formData.inboundMethod === "imap" && formData.isForwardedMailbox) {
      if (!formData.originalEmailAddress.trim()) {
        newErrors.originalEmailAddress = "Original email address is required";
      } else if (!validateEmail(formData.originalEmailAddress)) {
        newErrors.originalEmailAddress = "Invalid email format";
      }
    }

    // Webhook validations — only when using webhook inbound
    if (formData.inboundMethod === "webhook") {
      if (!formData.webhookProvider.trim()) {
        newErrors.webhookProvider = "Please select a vendor";
      }
      const requiredMapFields: (keyof WebhookPayloadMap)[] = [
        "to",
        "from",
        "subject",
        "text",
      ];
      for (const f of requiredMapFields) {
        if (!formData.webhookPayloadMap[f].trim()) {
          newErrors[`webhookMap_${f}`] = `"${f}" path is required`;
        }
      }
    }

    // SMTP validations — skip entirely for Graph API (no SMTP needed)
    if (formData.outboundMethod !== "graph") {
      if (formData.outboundMethod !== "sendgrid" && !formData.smtpHost.trim()) {
        newErrors.smtpHost = "SMTP host is required";
      }
      const smtpPort = Number(formData.smtpPort);
      if (
        formData.outboundMethod !== "sendgrid" &&
        (!formData.smtpPort ||
          isNaN(smtpPort) ||
          smtpPort < 1 ||
          smtpPort > 65535)
      ) {
        newErrors.smtpPort = "Valid SMTP port is required (1-65535)";
      }
      if (
        formData.outboundMethod !== "sendgrid" &&
        !formData.smtpUsername.trim()
      ) {
        newErrors.smtpUsername = "SMTP username is required";
      }
      // In edit mode password is optional; OAuth2 doesn't need SMTP password
      if (
        formData.outboundMethod !== "sendgrid" &&
        formData.authMethod !== "oauth2" &&
        !editingConfig &&
        !formData.smtpPassword.trim()
      ) {
        newErrors.smtpPassword = "SMTP password is required";
      }
    }

    // SendGrid outbound requires API key
    if (
      formData.outboundMethod === "sendgrid" &&
      !editingConfig &&
      !formData.sendgridApiKey.trim()
    ) {
      (newErrors as any).sendgridApiKey = "SendGrid API key is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: keyof FormData, value: string | number) => {
    let updatedData = { ...formData, [field]: value };

    // Auto-detect provider and set defaults when email changes
    if (field === "emailAddress" && typeof value === "string") {
      const provider = detectEmailProvider(value);
      if (provider !== formData.provider) {
        const defaults = getProviderDefaults(provider);
        updatedData = {
          ...updatedData,
          provider,
          imapHost: defaults.imapHost,
          imapPort: defaults.imapPort,
          smtpHost: defaults.smtpHost,
          smtpPort: defaults.smtpPort,
          imapUsername: value,
          smtpUsername: value,
          // Only switch authMethod if not already using OAuth2
          authMethod:
            formData.authMethod === "oauth2"
              ? "oauth2"
              : provider === "google" || provider === "microsoft"
                ? "app_password"
                : "basic",
        };
      }
    }

    // When switching to webhook, ensure vendor + map are populated
    if (field === "inboundMethod" && value === "webhook") {
      const vendor = formData.webhookProvider || DEFAULT_WEBHOOK_VENDOR;
      updatedData = {
        ...updatedData,
        webhookProvider: vendor,
        webhookPayloadMap:
          WEBHOOK_PRESETS[vendor]?.payloadMap ||
          WEBHOOK_PRESETS.sendgrid.payloadMap,
      };
    }

    // When switching to Graph API, auto-set oauth2 + outbound=graph
    if (field === "inboundMethod" && value === "graph") {
      updatedData = {
        ...updatedData,
        authMethod: "oauth2",
        outboundMethod: "graph",
      };
    }

    // When switching away from Graph, reset outbound if it was "graph"
    if (
      field === "inboundMethod" &&
      value !== "graph" &&
      formData.outboundMethod === "graph"
    ) {
      updatedData = { ...updatedData, outboundMethod: "smtp" };
    }

    // When changing vendor, auto-fill the payload map from preset
    if (field === "webhookProvider" && typeof value === "string") {
      const preset = WEBHOOK_PRESETS[value];
      if (preset) {
        updatedData = {
          ...updatedData,
          webhookPayloadMap: { ...preset.payloadMap },
        };
      }
    }

    setFormData(updatedData);
    // Clear error for this field when user types
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
    // Clear test result when any field changes
    setTestResult(null);
  };

  const handleWebhookMapChange = (
    field: keyof WebhookPayloadMap,
    value: string,
  ) => {
    setFormData((prev) => ({
      ...prev,
      webhookPayloadMap: { ...prev.webhookPayloadMap, [field]: value },
    }));
    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[`webhookMap_${field}`];
      return newErrors;
    });
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    if (!validateForm()) {
      setTestResult({
        success: false,
        message: "Please fix validation errors before testing connection",
      });
      return;
    }

    try {
      setTesting(true);
      setTestResult(null);
      const token = localStorage.getItem("authToken");

      // Test credentials without saving
      const response = await axios.post(
        `${API_CONFIG.API_URL}/projects/${projectId}/email-configs/test-credentials`,
        {
          emailAddress: formData.emailAddress,
          imapHost: formData.imapHost,
          imapPort: Number(formData.imapPort),
          imapUsername: formData.imapUsername,
          imapPassword:
            formData.authMethod === "oauth2"
              ? undefined
              : formData.imapPassword,
          smtpHost: formData.smtpHost,
          smtpPort: Number(formData.smtpPort),
          smtpUsername: formData.smtpUsername,
          smtpPassword:
            formData.authMethod === "oauth2"
              ? undefined
              : formData.smtpPassword,
          provider: formData.provider,
          authMethod: formData.authMethod,
          inboundMethod: formData.inboundMethod,
          outbound_method: formData.outboundMethod,
          ...(formData.outboundMethod === "sendgrid" &&
            formData.sendgridApiKey && {
              sendgrid_api_key: formData.sendgridApiKey,
            }),
          ...(formData.authMethod === "oauth2" && {
            oauth2: {
              clientId: formData.oauth2ClientId,
              clientSecret: formData.oauth2ClientSecret || undefined,
              refreshToken: formData.oauth2RefreshToken,
              tenantId: formData.oauth2TenantId || undefined,
            },
          }),
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          validateStatus: () => true, // Accept all status codes
        },
      );

      if (response.data.success) {
        setTestResult({
          success: true,
          message:
            "✅ Connection test successful! Both IMAP and SMTP connections are working.",
        });
      } else {
        const imapError = response.data.data?.imap?.error || "";
        const smtpError = response.data.data?.smtp?.error || "";
        const details = [
          imapError && `IMAP: ${imapError}`,
          smtpError && `SMTP: ${smtpError}`,
        ]
          .filter(Boolean)
          .join("; ");
        setTestResult({
          success: false,
          message: `❌ Connection test failed: ${response.data.message}${details ? ` - ${details}` : ""}`,
        });
      }
    } catch (error: any) {
      console.error("Error testing connection:", error);
      setTestResult({
        success: false,
        message: `❌ Connection test failed: ${error.response?.data?.message || error.message}`,
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem("authToken");

      // Prepare payload - only include passwords if provided
      const isGraphInbound = formData.inboundMethod === "graph";
      const isGraphOutbound = formData.outboundMethod === "graph";
      const payload: any = {
        email_address: formData.emailAddress,
        inbound_method: formData.inboundMethod,
        outbound_method: formData.outboundMethod,
        imap_host:
          formData.inboundMethod === "imap" ? formData.imapHost : undefined,
        imap_port:
          formData.inboundMethod === "imap"
            ? Number(formData.imapPort)
            : undefined,
        imap_username:
          formData.inboundMethod === "imap" ? formData.imapUsername : undefined,
        smtp_host: isGraphOutbound ? undefined : formData.smtpHost,
        smtp_port: isGraphOutbound ? undefined : Number(formData.smtpPort),
        smtp_username: isGraphOutbound ? undefined : formData.smtpUsername,
        provider: formData.provider,
        authMethod: formData.authMethod,
        webhook_provider:
          formData.inboundMethod === "webhook"
            ? formData.webhookProvider
            : undefined,
        webhook_payload_map:
          formData.inboundMethod === "webhook"
            ? formData.webhookPayloadMap
            : undefined,
        is_forwarded_mailbox:
          formData.inboundMethod === "imap"
            ? formData.isForwardedMailbox
            : false,
        original_email_address:
          formData.inboundMethod === "imap" && formData.isForwardedMailbox
            ? formData.originalEmailAddress
            : undefined,
        reply_signature: formData.replySignature,
      };

      // Only include passwords if provided (not for OAuth2)
      if (formData.authMethod !== "oauth2") {
        if (formData.inboundMethod === "imap" && formData.imapPassword.trim()) {
          payload.imap_password = formData.imapPassword;
        }
        if (formData.smtpPassword.trim()) {
          payload.smtp_password = formData.smtpPassword;
        }
      }

      // Include OAuth2 credentials when using OAuth2
      if (formData.authMethod === "oauth2") {
        payload.oauth2 = {
          clientId: formData.oauth2ClientId,
          ...(formData.oauth2ClientSecret.trim() && {
            clientSecret: formData.oauth2ClientSecret,
          }),
          // Include tenantId for Graph API
          ...(formData.oauth2TenantId.trim() && {
            tenantId: formData.oauth2TenantId,
          }),
          // Include refreshToken for standard OAuth2 (not needed for Graph)
          ...(!isGraphInbound &&
            formData.oauth2RefreshToken.trim() && {
              refreshToken: formData.oauth2RefreshToken,
            }),
        };
      }

      console.log("Sending payload:", {
        projectId,
        editingConfig: editingConfig?._id,
        payload,
      });

      let response;
      if (editingConfig) {
        console.log(
          "PUT URL:",
          `${API_CONFIG.API_URL}/projects/${projectId}/email-configs/${editingConfig._id}`,
        );
        // Update existing config
        response = await axios.put(
          `${API_CONFIG.API_URL}/projects/${projectId}/email-configs/${editingConfig._id}`,
          payload,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
      } else {
        console.log(
          "POST URL:",
          `${API_CONFIG.API_URL}/projects/${projectId}/email-configs`,
        );
        // Create new config
        response = await axios.post(
          `${API_CONFIG.API_URL}/projects/${projectId}/email-configs`,
          payload,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
      }

      if (response.data.success) {
        // Show success message
        alert(
          editingConfig
            ? "✅ Email configuration updated successfully!"
            : "✅ Email configuration added successfully!",
        );

        // Reset form
        setFormData(getInitialFormData());
        setErrors({});
        setTestResult(null);

        // Call success callback
        onSuccess();
        onClose();
      }
    } catch (error: any) {
      console.error("Error saving email config:", error);
      const errorMessage =
        error.response?.data?.message || error.message || "Unknown error";
      alert(
        `❌ Failed to ${editingConfig ? "update" : "save"} email configuration:\n${errorMessage}`,
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    // Reset form
    setFormData(getInitialFormData());
    setErrors({});
    setTestResult(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={handleCancel}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
            <div className="flex items-center">
              <EnvelopeIcon className="w-6 h-6 text-blue-600 mr-3" />
              <h2 className="text-xl font-semibold text-gray-900">
                {editingConfig
                  ? "Edit Email Configuration"
                  : "Add Email Configuration"}
              </h2>
            </div>
            <button
              onClick={handleCancel}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Email Address */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={formData.emailAddress}
                onChange={(e) =>
                  handleInputChange("emailAddress", e.target.value)
                }
                className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.emailAddress
                    ? "border-red-300 focus:border-red-500"
                    : "border-gray-300 focus:border-blue-500"
                }`}
                placeholder="support@example.com"
              />
              {errors.emailAddress && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.emailAddress}
                </p>
              )}
            </div>
            {/* Inbound Method Selector */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="text-sm font-semibold text-blue-900 mb-3">
                Incoming Email Method
              </h3>
              <div className="flex flex-col gap-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="inboundMethod"
                    value="imap"
                    checked={formData.inboundMethod === "imap"}
                    onChange={() => handleInputChange("inboundMethod", "imap")}
                    className="mt-0.5 w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-800">
                      Direct IMAP Polling
                    </span>
                    <p className="text-xs text-gray-500 mt-0.5">
                      System polls your mailbox via IMAP at regular intervals
                      (Gmail, Outlook, custom mail server)
                    </p>
                  </div>
                </label>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="inboundMethod"
                    value="webhook"
                    checked={formData.inboundMethod === "webhook"}
                    onChange={() =>
                      handleInputChange("inboundMethod", "webhook")
                    }
                    className="mt-0.5 w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-800">
                      Webhook (Push from vendor)
                    </span>
                    <span className="ml-2 text-xs text-green-700 font-medium bg-green-100 px-1.5 py-0.5 rounded">
                      No IMAP needed
                    </span>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Your email vendor pushes incoming mail via webhook — works
                      with SendGrid, Mailgun, Postmark, Gupshup or any custom
                      provider
                    </p>
                  </div>
                </label>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="inboundMethod"
                    value="graph"
                    checked={formData.inboundMethod === "graph"}
                    onChange={() => handleInputChange("inboundMethod", "graph")}
                    className="mt-0.5 w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-800">
                      Microsoft Graph API
                    </span>
                    <span className="ml-2 text-xs text-blue-700 font-medium bg-blue-100 px-1.5 py-0.5 rounded">
                      No IMAP / SMTP needed
                    </span>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Uses Microsoft Graph API with client credentials — only
                      requires App Registration (clientId + clientSecret +
                      tenantId). Needs{" "}
                      <code className="bg-gray-100 px-1 rounded">
                        Mail.ReadWrite
                      </code>{" "}
                      Application permission in Azure.
                    </p>
                  </div>
                </label>
              </div>
            </div>
            {/* Webhook vendor config (shown when webhook inbound selected) */}
            {formData.inboundMethod === "webhook" && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg space-y-4">
                <div className="flex items-center gap-2">
                  <InformationCircleIcon className="w-5 h-5 text-green-700 flex-shrink-0" />
                  <h4 className="text-sm font-semibold text-green-900">
                    Webhook Inbound Setup
                  </h4>
                </div>

                {/* Vendor selector */}
                <div>
                  <label className="block text-xs font-medium text-green-900 mb-1">
                    Email Vendor
                  </label>
                  <select
                    value={formData.webhookProvider}
                    onChange={(e) =>
                      handleInputChange("webhookProvider", e.target.value)
                    }
                    className="block w-full px-3 py-2 text-sm border border-green-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    {Object.entries(WEBHOOK_PRESETS).map(([key, preset]) => (
                      <option key={key} value={key}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                  {errors.webhookProvider && (
                    <p className="mt-1 text-xs text-red-600">
                      {errors.webhookProvider}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-green-700">
                    Selecting a vendor auto-fills the field mappings below.
                    Choose “Custom / Other” to enter paths manually for any
                    provider (e.g. Gupshup, Sparkpost, etc.).
                  </p>
                </div>

                {/* Webhook URL */}
                <div>
                  <label className="block text-xs font-medium text-green-900 mb-1">
                    Destination URL — paste this into your vendor’s webhook
                    settings
                  </label>
                  <div className="flex items-center gap-2 bg-white border border-green-300 rounded px-3 py-2">
                    <code className="text-xs text-green-900 flex-1 break-all">
                      {window.location.origin}/api/email/inbound/webhook
                    </code>
                  </div>
                </div>

                {/* Payload field path mapping */}
                <div>
                  <p className="text-xs font-medium text-green-900 mb-1">
                    Field Path Mapping
                  </p>
                  <p className="text-xs text-green-700 mb-2">
                    Dot-notation paths into your vendor’s POST body (e.g.{" "}
                    <code className="bg-white px-1 rounded border border-green-200">
                      envelope.to[0]
                    </code>
                    ). Fields marked <span className="text-red-500">*</span> are
                    required.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        "to",
                        "from",
                        "subject",
                        "text",
                        "html",
                        "messageId",
                      ] as const
                    ).map((field) => (
                      <div key={field}>
                        <label className="block text-xs text-green-800 mb-0.5 capitalize">
                          {field === "messageId" ? "Message-ID" : field}
                          {field !== "html" && field !== "messageId" && (
                            <span className="text-red-500 ml-0.5">*</span>
                          )}
                        </label>
                        <input
                          type="text"
                          value={formData.webhookPayloadMap[field]}
                          onChange={(e) =>
                            handleWebhookMapChange(field, e.target.value)
                          }
                          className={`block w-full px-2 py-1.5 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-green-500 bg-white ${
                            errors[`webhookMap_${field}`]
                              ? "border-red-300"
                              : "border-green-300"
                          }`}
                          placeholder={`path.to.${field}`}
                        />
                        {errors[`webhookMap_${field}`] && (
                          <p className="text-xs text-red-600 mt-0.5">
                            {errors[`webhookMap_${field}`]}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <p className="text-xs text-green-700">
                  Emails arriving at{" "}
                  <strong>{formData.emailAddress || "this address"}</strong>{" "}
                  will be pushed to SAC Helpdesk via webhook automatically.
                </p>
              </div>
            )}
            {/* Microsoft Graph API config panel */}
            {formData.inboundMethod === "graph" && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-4">
                <div className="flex items-center gap-2">
                  <InformationCircleIcon className="w-5 h-5 text-blue-700 flex-shrink-0" />
                  <h4 className="text-sm font-semibold text-blue-900">
                    Microsoft Graph API Setup
                  </h4>
                </div>
                <p className="text-xs text-blue-800">
                  Uses <strong>client credentials (app-only)</strong> flow — no
                  user sign-in or refresh token required. The Azure App
                  Registration must have{" "}
                  <code className="bg-white px-1 rounded border border-blue-200">
                    Mail.ReadWrite
                  </code>{" "}
                  as an <strong>Application</strong> permission (not Delegated).
                </p>

                {/* Tenant ID */}
                <div>
                  <label className="block text-xs font-medium text-blue-900 mb-1">
                    Tenant ID (Directory ID){" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.oauth2TenantId}
                    onChange={(e) =>
                      handleInputChange("oauth2TenantId", e.target.value)
                    }
                    placeholder="e.g. 15025a36-9c10-4300-8462-4fe1970f0a64"
                    className={`block w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.oauth2TenantId
                        ? "border-red-300 bg-red-50"
                        : "border-blue-300 bg-white"
                    }`}
                  />
                  {errors.oauth2TenantId && (
                    <p className="mt-1 text-xs text-red-600">
                      {errors.oauth2TenantId}
                    </p>
                  )}
                </div>

                {/* Client ID */}
                <div>
                  <label className="block text-xs font-medium text-blue-900 mb-1">
                    Client ID (Application ID){" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.oauth2ClientId}
                    onChange={(e) =>
                      handleInputChange("oauth2ClientId", e.target.value)
                    }
                    placeholder="e.g. xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    className={`block w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      (errors as any).oauth2ClientId
                        ? "border-red-300 bg-red-50"
                        : "border-blue-300 bg-white"
                    }`}
                  />
                  {(errors as any).oauth2ClientId && (
                    <p className="mt-1 text-xs text-red-600">
                      {(errors as any).oauth2ClientId}
                    </p>
                  )}
                </div>

                {/* Client Secret */}
                <div>
                  <label className="block text-xs font-medium text-blue-900 mb-1">
                    Client Secret <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={formData.oauth2ClientSecret}
                    onChange={(e) =>
                      handleInputChange("oauth2ClientSecret", e.target.value)
                    }
                    placeholder={
                      editingConfig
                        ? "Leave blank to keep existing secret"
                        : "Paste the client secret value"
                    }
                    className={`block w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      (errors as any).oauth2ClientSecret
                        ? "border-red-300 bg-red-50"
                        : "border-blue-300 bg-white"
                    }`}
                  />
                  {(errors as any).oauth2ClientSecret && (
                    <p className="mt-1 text-xs text-red-600">
                      {(errors as any).oauth2ClientSecret}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-blue-600">
                    Found in Azure Portal → App registrations → Certificates
                    &amp; secrets
                  </p>
                </div>

                {/* How emails are matched */}
                <p className="text-xs text-blue-700">
                  Unread emails addressed to{" "}
                  <strong>{formData.emailAddress || "this mailbox"}</strong>{" "}
                  will be polled every 30 seconds and converted to helpdesk
                  tickets automatically.
                </p>
              </div>
            )}
            {/* Provider Info Banner */}
            {formData.provider !== "other" && (
              <div
                className={`flex items-start p-4 rounded-lg ${
                  formData.provider === "google"
                    ? "bg-blue-50 border border-blue-200"
                    : "bg-sky-50 border border-sky-200"
                }`}
              >
                <InformationCircleIcon
                  className={`w-5 h-5 mt-0.5 mr-3 flex-shrink-0 ${
                    formData.provider === "google"
                      ? "text-blue-600"
                      : "text-sky-600"
                  }`}
                />
                <div className="flex-1">
                  <p
                    className={`text-sm font-medium ${
                      formData.provider === "google"
                        ? "text-blue-800"
                        : "text-sky-800"
                    }`}
                  >
                    {formData.provider === "google"
                      ? "Google Gmail Detected"
                      : "Microsoft Outlook Detected"}
                  </p>
                  <p
                    className={`text-sm mt-1 ${
                      formData.provider === "google"
                        ? "text-blue-700"
                        : "text-sky-700"
                    }`}
                  >
                    {formData.provider === "google" ? (
                      <>
                        Gmail requires an <strong>App Password</strong> instead
                        of your regular password.
                        <a
                          href="https://myaccount.google.com/apppasswords"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-1 underline hover:text-blue-900"
                        >
                          Create App Password
                        </a>
                        <span className="block mt-1 text-xs">
                          Note: You must have 2-Step Verification enabled to
                          create App Passwords.
                        </span>
                      </>
                    ) : (
                      <>
                        Microsoft Outlook requires an{" "}
                        <strong>App Password</strong> instead of your regular
                        password.
                        <a
                          href="https://account.live.com/proofs/AppPassword"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-1 underline hover:text-sky-900"
                        >
                          Create App Password
                        </a>
                        <span className="block mt-1 text-xs">
                          Note: You must have 2-Step Verification enabled to
                          create App Passwords.
                        </span>
                      </>
                    )}
                  </p>
                </div>
              </div>
            )}
            {/* Authentication Method — hidden when Graph API is selected (always uses OAuth2 client_credentials) */}
            {formData.inboundMethod !== "graph" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Authentication Method
                </label>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="authMethod"
                      value="basic"
                      checked={formData.authMethod === "basic"}
                      onChange={() => handleInputChange("authMethod", "basic")}
                      className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">
                      Basic Password
                    </span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="authMethod"
                      value="app_password"
                      checked={formData.authMethod === "app_password"}
                      onChange={() =>
                        handleInputChange("authMethod", "app_password")
                      }
                      className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">
                      App Password
                    </span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="authMethod"
                      value="oauth2"
                      checked={formData.authMethod === "oauth2"}
                      onChange={() => handleInputChange("authMethod", "oauth2")}
                      className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">
                      OAuth2 (Modern Auth)
                    </span>
                    {(formData.provider === "google" ||
                      formData.provider === "microsoft") && (
                      <span className="ml-1 text-xs text-green-600 font-medium">
                        (Recommended)
                      </span>
                    )}
                  </label>
                </div>
                {formData.authMethod === "app_password" && (
                  <p className="mt-1 text-xs text-gray-500">
                    App Passwords are 16-character codes that give apps access
                    to your email without your main password.
                  </p>
                )}

                {/* OAuth2 credential fields */}
                {formData.authMethod === "oauth2" && (
                  <div className="mt-3 space-y-3">
                    {/* Azure/Google setup instructions */}
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
                      <p className="font-semibold mb-1">
                        Microsoft 365 OAuth2 — What you need
                      </p>
                      <p className="mb-2 text-blue-700">
                        OAuth2 requires an{" "}
                        <strong>Azure App Registration</strong>. If you don't
                        have Azure Portal access, ask your IT / Microsoft 365
                        admin to complete these steps and provide you the three
                        credentials below.
                      </p>
                      <p className="font-medium mb-1">
                        Steps for your Azure admin:
                      </p>
                      <ol className="list-decimal list-inside space-y-1">
                        <li>
                          Azure Portal → <strong>App registrations</strong> →
                          New registration (any name, single-tenant or
                          multi-tenant)
                        </li>
                        <li>
                          <strong>API permissions</strong> → Add a permission →
                          Microsoft Graph → Delegated:{" "}
                          <code className="bg-blue-100 px-1 rounded">
                            IMAP.AccessAsUser.All
                          </code>
                          {", "}
                          <code className="bg-blue-100 px-1 rounded">
                            SMTP.Send
                          </code>
                          {", "}
                          <code className="bg-blue-100 px-1 rounded">
                            offline_access
                          </code>{" "}
                          → <strong>Grant admin consent</strong>
                        </li>
                        <li>
                          <strong>Certificates &amp; Secrets</strong> → New
                          client secret → copy the <strong>Value</strong> (shown
                          only once)
                        </li>
                        <li>
                          Copy the <strong>Application (client) ID</strong> from
                          Overview
                        </li>
                        <li>
                          Use the OAuth2 authorization code flow to obtain a{" "}
                          <strong>Refresh Token</strong> for the mailbox user —
                          see{" "}
                          <a
                            href="https://learn.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-auth-code-flow"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline"
                          >
                            Microsoft docs
                          </a>
                        </li>
                      </ol>
                      <p className="mt-2 text-blue-600">
                        The app registration only needs to be created once per
                        organization.
                      </p>
                    </div>

                    {/* Client ID */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Client ID (Application ID){" "}
                        <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.oauth2ClientId}
                        onChange={(e) =>
                          handleInputChange("oauth2ClientId", e.target.value)
                        }
                        className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${
                          (errors as any).oauth2ClientId
                            ? "border-red-300"
                            : "border-gray-300 focus:border-blue-500"
                        }`}
                        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      />
                      {(errors as any).oauth2ClientId && (
                        <p className="mt-1 text-sm text-red-600">
                          {(errors as any).oauth2ClientId}
                        </p>
                      )}
                    </div>

                    {/* Client Secret */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Client Secret
                      </label>
                      <input
                        type="password"
                        value={formData.oauth2ClientSecret}
                        onChange={(e) =>
                          handleInputChange(
                            "oauth2ClientSecret",
                            e.target.value,
                          )
                        }
                        className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${
                          (errors as any).oauth2ClientSecret
                            ? "border-red-300"
                            : "border-gray-300 focus:border-blue-500"
                        }`}
                        placeholder={
                          editingConfig
                            ? "Leave blank to keep existing"
                            : "Paste client secret value"
                        }
                      />
                      {(errors as any).oauth2ClientSecret && (
                        <p className="mt-1 text-sm text-red-600">
                          {(errors as any).oauth2ClientSecret}
                        </p>
                      )}
                    </div>

                    {/* Refresh Token (delegated OAuth2 flow) */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Refresh Token <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="password"
                        value={formData.oauth2RefreshToken}
                        onChange={(e) =>
                          handleInputChange(
                            "oauth2RefreshToken",
                            e.target.value,
                          )
                        }
                        className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${
                          (errors as any).oauth2RefreshToken
                            ? "border-red-300"
                            : "border-gray-300 focus:border-blue-500"
                        }`}
                        placeholder={
                          editingConfig
                            ? "Leave blank to keep existing"
                            : "Paste OAuth2 refresh token"
                        }
                      />
                      {(errors as any).oauth2RefreshToken && (
                        <p className="mt-1 text-sm text-red-600">
                          {(errors as any).oauth2RefreshToken}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* IMAP Settings Section — only for IMAP inbound */}
            {formData.inboundMethod === "imap" && (
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <div className="flex items-center mb-4">
                  <ServerIcon className="w-5 h-5 text-gray-600 mr-2" />
                  <h3 className="text-sm font-semibold text-gray-900">
                    IMAP Settings (Incoming Mail)
                  </h3>
                </div>

                {formData.authMethod === "oauth2" && (
                  <p className="mb-3 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-3 py-2">
                    OAuth2 replaces the password only. Host, port, and username
                    are still required.{" "}
                    {(formData.provider === "microsoft" ||
                      formData.provider === "google") && (
                      <span className="font-medium">
                        These were auto-filled from your email address.
                      </span>
                    )}
                  </p>
                )}

                <div className="space-y-4">
                  {/* IMAP Host */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      IMAP Host <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.imapHost}
                      onChange={(e) =>
                        handleInputChange("imapHost", e.target.value)
                      }
                      className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        errors.imapHost
                          ? "border-red-300 focus:border-red-500"
                          : "border-gray-300 focus:border-blue-500"
                      }`}
                      placeholder="imap.gmail.com"
                    />
                    {errors.imapHost && (
                      <p className="mt-1 text-sm text-red-600">
                        {errors.imapHost}
                      </p>
                    )}
                  </div>

                  {/* IMAP Port */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      IMAP Port <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      value={formData.imapPort}
                      onChange={(e) =>
                        handleInputChange("imapPort", e.target.value)
                      }
                      className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        errors.imapPort
                          ? "border-red-300 focus:border-red-500"
                          : "border-gray-300 focus:border-blue-500"
                      }`}
                      placeholder="993"
                      min="1"
                      max="65535"
                    />
                    {errors.imapPort && (
                      <p className="mt-1 text-sm text-red-600">
                        {errors.imapPort}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-gray-500">
                      Common: 993 (SSL) or 143 (non-SSL)
                    </p>
                  </div>

                  {/* IMAP Username */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      IMAP Username <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.imapUsername}
                      onChange={(e) =>
                        handleInputChange("imapUsername", e.target.value)
                      }
                      className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        errors.imapUsername
                          ? "border-red-300 focus:border-red-500"
                          : "border-gray-300 focus:border-blue-500"
                      }`}
                      placeholder="support@example.com"
                    />
                    {errors.imapUsername && (
                      <p className="mt-1 text-sm text-red-600">
                        {errors.imapUsername}
                      </p>
                    )}
                  </div>

                  {/* IMAP Password — hidden when using OAuth2 */}
                  {formData.authMethod !== "oauth2" && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        IMAP Password{" "}
                        {!editingConfig && (
                          <span className="text-red-500">*</span>
                        )}
                      </label>
                      <input
                        type="password"
                        value={formData.imapPassword}
                        onChange={(e) =>
                          handleInputChange("imapPassword", e.target.value)
                        }
                        className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          errors.imapPassword
                            ? "border-red-300 focus:border-red-500"
                            : "border-gray-300 focus:border-blue-500"
                        }`}
                        placeholder={editingConfig ? "••••••••" : "••••••••"}
                      />
                      {errors.imapPassword && (
                        <p className="mt-1 text-sm text-red-600">
                          {errors.imapPassword}
                        </p>
                      )}
                      {editingConfig && (
                        <p className="mt-1 text-xs text-gray-500">
                          Leave blank to keep existing password
                        </p>
                      )}
                    </div>
                  )}

                  {/* ── Forwarded Mailbox Toggle ── */}
                  <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.isForwardedMailbox}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            isForwardedMailbox: e.target.checked,
                            originalEmailAddress: e.target.checked
                              ? prev.originalEmailAddress
                              : "",
                          }))
                        }
                        className="mt-0.5 w-4 h-4 text-yellow-600 border-gray-300 rounded focus:ring-yellow-500"
                      />
                      <div>
                        <span className="text-sm font-medium text-yellow-900">
                          This mailbox receives forwarded emails
                        </span>
                        <p className="text-xs text-yellow-700 mt-0.5">
                          Enable if the IMAP mailbox is a relay — emails from
                          another address are auto-forwarded here (e.g. support
                          forwards to Gmail). The original Message-ID and To
                          address will be preserved for correct email threading.
                        </p>
                      </div>
                    </label>

                    {formData.isForwardedMailbox && (
                      <div className="mt-3">
                        <label className="block text-xs font-medium text-yellow-900 mb-1">
                          Original Email Address{" "}
                          <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="email"
                          value={formData.originalEmailAddress}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              originalEmailAddress: e.target.value,
                            }))
                          }
                          className={`block w-full px-3 py-2 text-sm border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 ${
                            errors.originalEmailAddress
                              ? "border-red-300"
                              : "border-yellow-300"
                          }`}
                          placeholder="hubblestar.support@hubblehox.com"
                        />
                        {errors.originalEmailAddress && (
                          <p className="mt-1 text-xs text-red-600">
                            {errors.originalEmailAddress}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-yellow-700">
                          The public address emails are originally sent to.
                          Outgoing replies will use this as the From/Reply-To
                          address.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            {/* SMTP Settings Section — hidden when Graph API handles outbound */}
            {formData.outboundMethod !== "graph" && (
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <div className="flex items-center mb-4">
                  <ServerIcon className="w-5 h-5 text-gray-600 mr-2" />
                  <h3 className="text-sm font-semibold text-gray-900">
                    Outgoing Mail (Outbound)
                  </h3>
                </div>

                {/* Outbound Method selector */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Outbound Method
                  </label>
                  <div className="flex gap-6">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="outboundMethod"
                        value="smtp"
                        checked={formData.outboundMethod === "smtp"}
                        onChange={() =>
                          handleInputChange("outboundMethod", "smtp")
                        }
                        className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">SMTP</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="outboundMethod"
                        value="sendgrid"
                        checked={formData.outboundMethod === "sendgrid"}
                        onChange={() =>
                          handleInputChange("outboundMethod", "sendgrid")
                        }
                        className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">
                        SendGrid API
                      </span>
                      {formData.authMethod === "oauth2" && (
                        <span className="ml-1 text-xs text-green-600 font-medium">
                          (Recommended with OAuth2)
                        </span>
                      )}
                    </label>
                  </div>
                </div>

                {/* ── SendGrid API key ── */}
                {formData.outboundMethod === "sendgrid" ? (
                  <div className="space-y-3">
                    <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-3 py-2">
                      Emails will be sent via the SendGrid API — no SMTP
                      credentials needed. The
                      <strong> From address</strong> will be the Email Address
                      above. Make sure that address is verified as a Sender in
                      your SendGrid account.
                    </p>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        SendGrid API Key{" "}
                        {!editingConfig && (
                          <span className="text-red-500">*</span>
                        )}
                      </label>
                      <input
                        type="password"
                        value={formData.sendgridApiKey}
                        onChange={(e) =>
                          handleInputChange("sendgridApiKey", e.target.value)
                        }
                        className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${
                          (errors as any).sendgridApiKey
                            ? "border-red-300 focus:border-red-500"
                            : "border-gray-300 focus:border-blue-500"
                        }`}
                        placeholder={
                          editingConfig
                            ? "Leave blank to keep existing"
                            : "SG.xxxxxxxxxxxx"
                        }
                      />
                      {(errors as any).sendgridApiKey && (
                        <p className="mt-1 text-sm text-red-600">
                          {(errors as any).sendgridApiKey}
                        </p>
                      )}
                      {editingConfig && (
                        <p className="mt-1 text-xs text-gray-500">
                          Leave blank to keep existing API key
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* SMTP Host */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        SMTP Host <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.smtpHost}
                        onChange={(e) =>
                          handleInputChange("smtpHost", e.target.value)
                        }
                        className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          errors.smtpHost
                            ? "border-red-300 focus:border-red-500"
                            : "border-gray-300 focus:border-blue-500"
                        }`}
                        placeholder="smtp.gmail.com"
                      />
                      {errors.smtpHost && (
                        <p className="mt-1 text-sm text-red-600">
                          {errors.smtpHost}
                        </p>
                      )}
                    </div>

                    {/* SMTP Port */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        SMTP Port <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        value={formData.smtpPort}
                        onChange={(e) =>
                          handleInputChange("smtpPort", e.target.value)
                        }
                        className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          errors.smtpPort
                            ? "border-red-300 focus:border-red-500"
                            : "border-gray-300 focus:border-blue-500"
                        }`}
                        placeholder="587"
                        min="1"
                        max="65535"
                      />
                      {errors.smtpPort && (
                        <p className="mt-1 text-sm text-red-600">
                          {errors.smtpPort}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-gray-500">
                        Common: 587 (TLS) or 465 (SSL)
                      </p>
                    </div>

                    {/* SMTP Username */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        SMTP Username <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.smtpUsername}
                        onChange={(e) =>
                          handleInputChange("smtpUsername", e.target.value)
                        }
                        className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          errors.smtpUsername
                            ? "border-red-300 focus:border-red-500"
                            : "border-gray-300 focus:border-blue-500"
                        }`}
                        placeholder="support@example.com"
                      />
                      {errors.smtpUsername && (
                        <p className="mt-1 text-sm text-red-600">
                          {errors.smtpUsername}
                        </p>
                      )}
                    </div>

                    {/* SMTP Password — hidden when using OAuth2 */}
                    {formData.authMethod !== "oauth2" && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          SMTP Password{" "}
                          {!editingConfig && (
                            <span className="text-red-500">*</span>
                          )}
                        </label>
                        <input
                          type="password"
                          value={formData.smtpPassword}
                          onChange={(e) =>
                            handleInputChange("smtpPassword", e.target.value)
                          }
                          className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            errors.smtpPassword
                              ? "border-red-300 focus:border-red-500"
                              : "border-gray-300 focus:border-blue-500"
                          }`}
                          placeholder={editingConfig ? "••••••••" : "••••••••"}
                        />
                        {errors.smtpPassword && (
                          <p className="mt-1 text-sm text-red-600">
                            {errors.smtpPassword}
                          </p>
                        )}
                        {editingConfig && (
                          <p className="mt-1 text-xs text-gray-500">
                            Leave blank to keep existing password
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}{" "}
            {/* end outboundMethod !== "graph" */}
            {/* Reply Signature — always shown regardless of outbound method */}
            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reply Signature
                </label>
                <textarea
                  value={formData.replySignature}
                  onChange={(e) =>
                    handleInputChange("replySignature", e.target.value)
                  }
                  rows={3}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
                  placeholder={`Regards,\nSupport Team`}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Automatically appended when an agent clicks &quot;Reply via
                  Email&quot;
                </p>
              </div>
            </div>
            {/* Test Result */}
            {testResult && (
              <div
                className={`p-4 rounded-md flex items-start ${
                  testResult.success
                    ? "bg-green-50 border border-green-200"
                    : "bg-red-50 border border-red-200"
                }`}
              >
                {testResult.success ? (
                  <CheckCircleIcon className="w-5 h-5 text-green-600 mr-3 flex-shrink-0 mt-0.5" />
                ) : (
                  <ExclamationCircleIcon className="w-5 h-5 text-red-600 mr-3 flex-shrink-0 mt-0.5" />
                )}
                <p
                  className={`text-sm ${
                    testResult.success ? "text-green-800" : "text-red-800"
                  }`}
                >
                  {testResult.message}
                </p>
              </div>
            )}
            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
              {/* Test Connection Button — only for IMAP inbound */}
              {formData.inboundMethod === "imap" ? (
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testing || loading}
                  className="inline-flex items-center px-4 py-2 border border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100 font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {testing ? (
                    <>
                      <svg
                        className="animate-spin -ml-1 mr-2 h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Testing...
                    </>
                  ) : (
                    <>
                      <SignalIcon className="w-4 h-4 mr-2" />
                      Test Connection
                    </>
                  )}
                </button>
              ) : (
                <div />
              )}

              {/* Save & Cancel Buttons */}
              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={loading || testing}
                  className="px-4 py-2 border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || testing}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center"
                >
                  {loading ? (
                    <>
                      <svg
                        className="animate-spin -ml-1 mr-2 h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      {editingConfig ? "Updating..." : "Saving..."}
                    </>
                  ) : editingConfig ? (
                    "Update Configuration"
                  ) : (
                    "Save Configuration"
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default EmailConfigModal;
