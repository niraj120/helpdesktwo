import React, { useState, useEffect } from "react";
import axios from "axios";
import API_BASE_URL from "../config/api";
import ModuleHeader from "../components/ModuleHeader";
import {
  EnvelopeIcon,
  CheckCircleIcon,
  XCircleIcon,
  Cog6ToothIcon,
  PaperAirplaneIcon,
  InformationCircleIcon,
  EyeIcon,
  EyeSlashIcon,
  DevicePhoneMobileIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";

// Variable definitions for each trigger type
const TRIGGER_VARIABLES: {
  [key: string]: { variable: string; description: string }[];
} = {
  accountCreated: [
    { variable: "{{studentName}}", description: "Student's full name" },
    { variable: "{{email}}", description: "Student's email address" },
    { variable: "{{loginUrl}}", description: "Link to student login page" },
    { variable: "{{projectName}}", description: "Project/portal name" },
  ],
  passwordReset: [
    { variable: "{{studentName}}", description: "Student's full name" },
    { variable: "{{email}}", description: "Student's email address" },
    { variable: "{{otp}}", description: "One-time password for reset" },
  ],
  ticketCreatedStudent: [
    { variable: "{{ticketNumber}}", description: "Unique ticket number" },
    { variable: "{{ticketTitle}}", description: "Ticket subject/title" },
    {
      variable: "{{ticketSubject}}",
      description: "Ticket subject (alias for ticketTitle)",
    },
    { variable: "{{studentName}}", description: "Student's name" },
    {
      variable: "{{ticketStatus}}",
      description: "Ticket status (Open, In Progress, etc.)",
    },
    {
      variable: "{{ticketPriority}}",
      description: "Ticket priority (Low, Medium, High)",
    },
  ],
  ticketCreatedAgent: [
    { variable: "{{ticketNumber}}", description: "Unique ticket number" },
    { variable: "{{ticketTitle}}", description: "Ticket subject/title" },
    { variable: "{{studentName}}", description: "Student's name" },
    { variable: "{{agentName}}", description: "Assigned agent's name" },
  ],
  ticketCreatedOnline: [
    { variable: "{{ticketNumber}}", description: "Unique ticket number" },
    { variable: "{{ticketTitle}}", description: "Ticket subject/title" },
    {
      variable: "{{ticketSubject}}",
      description: "Ticket subject (alias for ticketTitle)",
    },
    { variable: "{{studentName}}", description: "Student's name" },
    { variable: "{{ticketStatus}}", description: "Ticket status" },
    { variable: "{{ticketPriority}}", description: "Ticket priority" },
  ],
  ticketCreatedOffline: [
    { variable: "{{ticketNumber}}", description: "Unique ticket number" },
    { variable: "{{ticketTitle}}", description: "Ticket subject/title" },
    { variable: "{{studentName}}", description: "Student's name" },
  ],
  ticketCreatedEmail: [
    { variable: "{{ticketNumber}}", description: "Unique ticket number" },
    { variable: "{{ticketTitle}}", description: "Ticket subject/title" },
    { variable: "{{email}}", description: "Sender's email" },
  ],
  ticketAssigned: [
    { variable: "{{ticketNumber}}", description: "Unique ticket number" },
    { variable: "{{ticketTitle}}", description: "Ticket subject/title" },
    { variable: "{{agentName}}", description: "Assigned agent's name" },
    { variable: "{{studentName}}", description: "Student's name" },
  ],
  ticketStatusChanged: [
    { variable: "{{ticketNumber}}", description: "Unique ticket number" },
    { variable: "{{ticketTitle}}", description: "Ticket subject/title" },
    { variable: "{{oldStatus}}", description: "Previous status" },
    { variable: "{{newStatus}}", description: "New status" },
    { variable: "{{studentName}}", description: "Student's name" },
  ],
  ticketCommentAdded: [
    { variable: "{{ticketNumber}}", description: "Unique ticket number" },
    { variable: "{{ticketTitle}}", description: "Ticket subject/title" },
    { variable: "{{commentAuthor}}", description: "Person who added comment" },
    { variable: "{{commentText}}", description: "Comment content" },
  ],
  ticketResolved: [
    { variable: "{{ticketNumber}}", description: "Unique ticket number" },
    { variable: "{{ticketTitle}}", description: "Ticket subject/title" },
    { variable: "{{studentName}}", description: "Student's name" },
    { variable: "{{resolutionTime}}", description: "Time taken to resolve" },
  ],
  ticketClosed: [
    { variable: "{{ticketNumber}}", description: "Unique ticket number" },
    { variable: "{{ticketTitle}}", description: "Ticket subject/title" },
    { variable: "{{studentName}}", description: "Student's name" },
  ],
  ticketEscalated: [
    { variable: "{{ticketNumber}}", description: "Unique ticket number" },
    { variable: "{{ticketTitle}}", description: "Ticket subject/title" },
    {
      variable: "{{escalationLevel}}",
      description: "Current escalation level",
    },
    { variable: "{{agentName}}", description: "Assigned agent's name" },
  ],
  slaWarning: [
    { variable: "{{ticketNumber}}", description: "Unique ticket number" },
    { variable: "{{ticketTitle}}", description: "Ticket subject/title" },
    { variable: "{{timeRemaining}}", description: "Time before SLA breach" },
    { variable: "{{agentName}}", description: "Assigned agent's name" },
  ],
  slaBreach: [
    { variable: "{{ticketNumber}}", description: "Unique ticket number" },
    { variable: "{{ticketTitle}}", description: "Ticket subject/title" },
    { variable: "{{breachTime}}", description: "How long SLA was breached" },
    { variable: "{{agentName}}", description: "Assigned agent's name" },
  ],
};

interface EmailTrigger {
  name: string;
  enabled: boolean;
  subject: string;
  body: string;
  recipients: "student" | "agent" | "both" | "custom";
  customRecipients?: string[];
}

interface EmailConfig {
  _id: string;
  projectId: string;
  enabled: boolean;
  // Delivery provider
  emailProvider: "smtp" | "sendgrid";
  sendgridApiKey?: string;
  // SMTP
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassword: string;
  fromEmail: string;
  fromName: string;
  triggers: {
    [key: string]: EmailTrigger;
  };
}

// WhatsApp interfaces
interface WhatsAppTrigger {
  name: string;
  enabled: boolean;
  numberId: string;
  templateName: string;
  templateLanguage: string;
  recipients: "student" | "agent" | "both" | "custom";
  customRecipients?: string[];
}

interface WhatsAppConfig {
  _id: string;
  projectId: string;
  enabled: boolean;
  apiBaseUrl: string;
  accessToken: string;
  triggers: {
    [key: string]: WhatsAppTrigger;
  };
}

// SMS interfaces
interface ISMSTrigger {
  name: string;
  enabled: boolean;
  template: string;
  recipients: "student" | "agent" | "both" | "custom";
  customRecipients?: string[];
  dltContentId?: string; // DLT Content Template ID
  dltTemplateId?: string; // DLT Template Mapping ID
}

interface ISMSConfig {
  _id: string;
  projectId: string;
  enabled: boolean;
  // Vendor config
  vendor?: "gupshup" | "ttbs" | "custom";
  apiUrl?: string;
  usernameParamName?: string;
  passwordParamName?: string;
  phoneParamName?: string;
  messageParamName?: string;
  senderIdParamName?: string;
  senderId?: string;
  peid?: string;
  extraStaticParams?: string;
  successPattern?: string;
  // Credentials
  userId: string;
  password?: string;
  triggers: {
    [key: string]: ISMSTrigger;
  };
}

// Vendor preset configurations — auto-fills API URL and param names
const SMS_VENDOR_PRESETS: Record<string, Partial<ISMSConfig>> = {
  gupshup: {
    vendor: "gupshup",
    apiUrl: "https://enterpriseapi.smsgupshup.com/GatewayAPI/rest",
    usernameParamName: "userid",
    passwordParamName: "password",
    phoneParamName: "send_to",
    messageParamName: "msg",
    senderIdParamName: "",
    successPattern: "success",
    extraStaticParams:
      '{"method":"SendMessage","msg_type":"TEXT","auth_scheme":"plain","v":"1.1","format":"text"}',
  },
  ttbs: {
    vendor: "ttbs",
    apiUrl: "https://api2.ttbssms.com/xml-transconnect-api",
    usernameParamName: "username",
    passwordParamName: "password",
    phoneParamName: "mobile",
    messageParamName: "message",
    senderIdParamName: "senderid",
    successPattern: "accepted",
    extraStaticParams: "",
  },
  custom: {
    vendor: "custom",
    apiUrl: "",
    usernameParamName: "username",
    passwordParamName: "password",
    phoneParamName: "mobile",
    messageParamName: "message",
    senderIdParamName: "senderid",
    successPattern: "success",
    extraStaticParams: "",
  },
};

const EmailConfigPage: React.FC = () => {
  const [config, setConfig] = useState<EmailConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testingEmail, setTestingEmail] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<
    "email" | "whatsapp" | "sms" | "test"
  >("email");
  const [showSmtpSettings, setShowSmtpSettings] = useState(true);
  const [selectedTrigger, setSelectedTrigger] = useState<string | null>(null);
  const [triggerEdits, setTriggerEdits] = useState<Partial<EmailTrigger>>({});
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [showSendgridKey, setShowSendgridKey] = useState(false);

  // WhatsApp state
  const [whatsappConfig, setWhatsappConfig] = useState<WhatsAppConfig | null>(
    null,
  );
  const [whatsappLoading, setWhatsappLoading] = useState(false);
  const [whatsappSaving, setWhatsappSaving] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testingWaTrigger, setTestingWaTrigger] = useState<string | null>(null);
  const [waTestResult, setWaTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [showWaApiSettings, setShowWaApiSettings] = useState(false);
  const [showWaAccessToken, setShowWaAccessToken] = useState(false);
  const [selectedWaTrigger, setSelectedWaTrigger] = useState<string | null>(
    null,
  );
  const [waTriggerEdits, setWaTriggerEdits] = useState<
    Partial<WhatsAppTrigger>
  >({});

  // SMS state
  const [smsConfig, setSmsConfig] = useState<ISMSConfig | null>(null);
  const [smsLoading, setSmsLoading] = useState(false);
  const [smsSaving, setSmsSaving] = useState(false);
  const [showSmsSettings, setShowSmsSettings] = useState(false);
  const [showSmsPassword, setShowSmsPassword] = useState(false);
  const [showAdvancedSmsConfig, setShowAdvancedSmsConfig] = useState(false);
  const [selectedSmsTrigger, setSelectedSmsTrigger] = useState<string | null>(
    null,
  );
  const [smsTriggerEdits, setSmsTriggerEdits] = useState<Partial<ISMSTrigger>>(
    {},
  );
  const [testSmsPhone, setTestSmsPhone] = useState("");
  const [testingSmsTrigger, setTestingSmsTrigger] = useState<string | null>(
    null,
  );
  const [smsTestResult, setSmsTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Unified test state
  const [bundleSendEmail, setBundleSendEmail] = useState(true);
  const [bundleSendWhatsApp, setBundleSendWhatsApp] = useState(false);
  const [bundleSendSMS, setBundleSendSMS] = useState(false);
  const [bundleTestEmail, setBundleTestEmail] = useState("");
  const [bundleTestPhone, setBundleTestPhone] = useState("");
  const [bundleTestErrors, setBundleTestErrors] = useState<{
    email?: string;
    phone?: string;
  }>({});
  const [bundleTesting, setBundleTesting] = useState(false);
  const [bundleResult, setBundleResult] = useState<Record<
    string,
    { success: boolean; message: string }
  > | null>(null);

  // Get projectId from context, URL, or fetch projects
  useEffect(() => {
    const init = async () => {
      let activeProjectId: string | null = null;
      setLoading(true);

      // 1. Determine preferred Project ID from storage
      try {
        const projectContext = JSON.parse(
          localStorage.getItem("projectContext") || "{}",
        );
        const storedProjectId = localStorage.getItem("projectId");

        if (projectContext.projectId) {
          console.log(
            "Found projectId in projectContext:",
            projectContext.projectId,
          );
          activeProjectId = projectContext.projectId;
        } else if (storedProjectId) {
          console.log("Found projectId in localStorage:", storedProjectId);
          activeProjectId = storedProjectId;
        }
      } catch (e) {
        console.error("Error parsing project context:", e);
      }

      // 2. Fetch all projects (to populate dropdown)
      try {
        const token = localStorage.getItem("authToken");
        console.log("Fetching projects for email config...");
        const response = await axios.get(`${API_BASE_URL}/projects`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        // Handle different response structures
        let projectsList: any[] = [];
        if (response.data.success && response.data.data) {
          if (
            response.data.data.projects &&
            Array.isArray(response.data.data.projects)
          ) {
            projectsList = response.data.data.projects;
          } else if (Array.isArray(response.data.data)) {
            projectsList = response.data.data;
          } else if (typeof response.data.data === "object") {
            projectsList = [response.data.data];
          }
        } else if (Array.isArray(response.data)) {
          projectsList = response.data;
        }

        if (projectsList.length > 0) {
          setProjects(projectsList);

          // 3. Set final Project ID
          // If we have a preferred ID, use it. Otherwise default to the first project.
          if (activeProjectId) {
            // Optional: Verify if the activeProjectId exists in the fetched list if we want to be strict
            setProjectId(activeProjectId);
          } else {
            setProjectId(projectsList[0]._id);
          }
        } else {
          console.warn("No projects found");
          // If no projects found but we have an ID (e.g. from context), we might still want to use it?
          // Unlikely scenario unless user has no access to list projects but has access to one.
          if (activeProjectId) setProjectId(activeProjectId);
        }
      } catch (error: any) {
        console.error("Error fetching projects:", error);
        // If fetching projects fails (e.g. permission error), still try to use the stored ID
        if (activeProjectId) setProjectId(activeProjectId);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  // Clear all stale per-project data whenever the project changes
  useEffect(() => {
    if (!projectId) return;
    // Reset all tab-specific state so each tab reloads fresh data
    setConfig(null);
    setWhatsappConfig(null);
    setSmsConfig(null);
    setSelectedTrigger(null);
    setTriggerEdits({});
    setSelectedWaTrigger(null);
    setWaTriggerEdits({});
    setSelectedSmsTrigger(null);
    setSmsTriggerEdits({});
    setBundleResult(null);
    // Always re-fetch email config (active by default)
    fetchEmailConfig();
    // If already on whatsapp/sms tab, re-fetch immediately
    if (activeTab === "whatsapp") fetchWhatsAppConfig();
    if (activeTab === "sms") fetchSMSConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const fetchEmailConfig = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await axios.get(
        `${API_BASE_URL}/email-config/${projectId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      setConfig(response.data.data);
      setLoading(false);
    } catch (error: any) {
      console.error("Error fetching email config:", error);
      console.error("Error details:", error.response?.data);
      // If config doesn't exist, it will be created by the backend
      // Set loading to false to show the form
      setLoading(false);
    }
  };

  // Fetch WhatsApp configuration
  const fetchWhatsAppConfig = async () => {
    if (!projectId) return;
    try {
      setWhatsappLoading(true);
      const token = localStorage.getItem("authToken");
      const response = await axios.get(
        `${API_BASE_URL}/whatsapp-config/${projectId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      setWhatsappConfig(response.data.data);
    } catch (error: any) {
      console.error("Error fetching WhatsApp config:", error);
    } finally {
      setWhatsappLoading(false);
    }
  };

  // Fetch WhatsApp config when switching to whatsapp tab
  // Always fetch WhatsApp config when switching to whatsapp tab (project reset clears stale data)
  useEffect(() => {
    if (activeTab === "whatsapp" && projectId) {
      fetchWhatsAppConfig();
    }
  }, [activeTab]); // projectId changes are handled by the reset effect above

  // Fetch SMS configuration
  const fetchSMSConfig = async () => {
    if (!projectId) return;
    try {
      setSmsLoading(true);
      const token = localStorage.getItem("authToken");
      const response = await axios.get(
        `${API_BASE_URL}/sms-config/${projectId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      setSmsConfig(response.data.data);
    } catch (error: any) {
      console.error("Error fetching SMS config:", error);
    } finally {
      setSmsLoading(false);
    }
  };

  // Fetch SMS config when switching to sms tab
  // Always fetch SMS config when switching to sms tab (project reset clears stale data)
  useEffect(() => {
    if (activeTab === "sms" && projectId) {
      fetchSMSConfig();
    }
  }, [activeTab]); // projectId changes are handled by the reset effect above

  // WhatsApp helper functions
  const saveWaApiSettings = async () => {
    if (!whatsappConfig || !projectId) return;
    try {
      setWhatsappSaving(true);
      const token = localStorage.getItem("authToken");
      await axios.put(
        `${API_BASE_URL}/whatsapp-config/${projectId}/settings`,
        {
          enabled: whatsappConfig.enabled,
          apiBaseUrl: whatsappConfig.apiBaseUrl,
          accessToken: whatsappConfig.accessToken,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      alert("WhatsApp API settings saved!");
    } catch (error: any) {
      alert("Failed to save WhatsApp settings");
    } finally {
      setWhatsappSaving(false);
    }
  };

  const updateWaTriggerField = async (
    triggerKey: string,
    field: string,
    value: any,
  ) => {
    if (!projectId || !whatsappConfig) return;
    setWhatsappConfig({
      ...whatsappConfig,
      triggers: {
        ...whatsappConfig.triggers,
        [triggerKey]: {
          ...whatsappConfig.triggers[triggerKey],
          [field]: value,
        },
      },
    });
    try {
      const token = localStorage.getItem("authToken");
      await axios.put(
        `${API_BASE_URL}/whatsapp-config/${projectId}/triggers/${triggerKey}`,
        { [field]: value },
        { headers: { Authorization: `Bearer ${token}` } },
      );
    } catch (error) {
      console.error(`Error updating ${field}:`, error);
    }
  };

  const testWaTrigger = async (triggerKey: string) => {
    if (!testPhone || !projectId) {
      alert("Please enter a test phone number");
      return;
    }
    try {
      setTestingWaTrigger(triggerKey);
      setWaTestResult(null);
      const token = localStorage.getItem("authToken");
      const response = await axios.post(
        `${API_BASE_URL}/whatsapp-config/${projectId}/triggers/${triggerKey}/test`,
        { testPhoneNumber: "91" + testPhone },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setWaTestResult({
        success: true,
        message: response.data.message || "Test message sent!",
      });
    } catch (error: any) {
      setWaTestResult({
        success: false,
        message: error.response?.data?.message || "Failed to send test message",
      });
    } finally {
      setTestingWaTrigger(null);
    }
  };

  // Open WhatsApp trigger edit modal
  const openWaTriggerEditor = (triggerKey: string) => {
    if (whatsappConfig?.triggers[triggerKey]) {
      setSelectedWaTrigger(triggerKey);
      setWaTriggerEdits({ ...whatsappConfig.triggers[triggerKey] });
    }
  };

  // Save WhatsApp trigger from edit modal
  const saveWaTrigger = async () => {
    if (!selectedWaTrigger || !projectId) return;
    try {
      setWhatsappSaving(true);
      const token = localStorage.getItem("authToken");
      await axios.put(
        `${API_BASE_URL}/whatsapp-config/${projectId}/triggers/${selectedWaTrigger}`,
        waTriggerEdits,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      // Update local state
      if (whatsappConfig) {
        setWhatsappConfig({
          ...whatsappConfig,
          triggers: {
            ...whatsappConfig.triggers,
            [selectedWaTrigger]: {
              ...whatsappConfig.triggers[selectedWaTrigger],
              ...waTriggerEdits,
            },
          },
        });
      }

      setSelectedWaTrigger(null);
      setWaTriggerEdits({});
      alert("WhatsApp trigger saved!");
    } catch (error: any) {
      alert("Failed to save WhatsApp trigger");
    } finally {
      setWhatsappSaving(false);
    }
  };

  const getTemplateBodyPreview = (triggerKey: string) => {
    switch (triggerKey) {
      case "accountCreated":
        return `Hello {{1}},\n\nYour account has been created successfully!\n\nPortal URL: {{3}}\nEmail: {{2}}\n\nPlease login and set your password.`;
      case "passwordReset":
        return `Hello {{1}},\n\nWe received a request to reset your password.\n\nReset Link: {{2}}\n\nIf you didn't request this, please ignore this message.`;
      case "studentOTP":
        return `Your verification code is {{1}}.\n\nThis code is valid for 10 minutes. Do not share it with anyone.`;
      case "ticketCreatedStudent":
        return `Hello {{1}},\n\nTicket {{2}} has been created.\nSubject: {{3}}\nPriority: {{4}}\n\nWe will update you soon.`;
      case "ticketCreatedAgent":
        return `New Ticket Alert!\n\nStudent: {{1}}\nTicket: {{2}}\nSubject: {{3}}\nPriority: {{4}}\n\nPlease review it immediately.`;
      case "ticketAssigned":
        return `Hello Agent {{1}},\n\nTicket {{2}} has been assigned to you.\nSubject: {{3}}\n\nPlease take action.`;
      case "ticketStatusChanged":
        return `Hello {{1}},\n\nYour ticket {{2}} status has changed to: {{3}}.\n\nCheck the portal for details.`;
      case "ticketClosed":
        return `Hello {{1}},\n\nTicket {{2}} has been closed.\nResolution: {{3}}\n\nThank you for contacting us.`;
      default:
        return `(Template preview not available for this trigger)\n\nTypical structure:\nHello {{1}},\nYour update regarding {{2}} is here.`;
    }
  };

  // SMS helper functions
  const saveSMSSettings = async () => {
    if (!smsConfig || !projectId) return;
    try {
      setSmsSaving(true);
      const token = localStorage.getItem("authToken");
      await axios.put(
        `${API_BASE_URL}/sms-config/${projectId}/settings`,
        {
          userId: smsConfig.userId,
          password: smsConfig.password,
          enabled: smsConfig.enabled,
          // Vendor configuration
          vendor: smsConfig.vendor,
          apiUrl: smsConfig.apiUrl,
          usernameParamName: smsConfig.usernameParamName,
          passwordParamName: smsConfig.passwordParamName,
          phoneParamName: smsConfig.phoneParamName,
          messageParamName: smsConfig.messageParamName,
          senderIdParamName: smsConfig.senderIdParamName,
          senderId: smsConfig.senderId,
          peid: smsConfig.peid,
          extraStaticParams: smsConfig.extraStaticParams,
          successPattern: smsConfig.successPattern,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      alert("SMS settings saved!");
    } catch (error: any) {
      alert("Failed to save SMS settings");
    } finally {
      setSmsSaving(false);
    }
  };

  const updateSMSTriggerField = async (
    triggerKey: string,
    field: string,
    value: any,
  ) => {
    if (!projectId || !smsConfig) return;
    setSmsConfig({
      ...smsConfig,
      triggers: {
        ...smsConfig.triggers,
        [triggerKey]: { ...smsConfig.triggers[triggerKey], [field]: value },
      },
    });
    // Optional: auto-save (or we can use saveSMSTrigger explicitly)
  };

  const saveSMSTrigger = async () => {
    if (!selectedSmsTrigger || !projectId) return;
    try {
      setSmsSaving(true);
      const token = localStorage.getItem("authToken");
      await axios.put(
        `${API_BASE_URL}/sms-config/${projectId}/triggers/${selectedSmsTrigger}`,
        smsTriggerEdits,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      // Update local state
      if (smsConfig) {
        setSmsConfig({
          ...smsConfig,
          triggers: {
            ...smsConfig.triggers,
            [selectedSmsTrigger]: {
              ...smsConfig.triggers[selectedSmsTrigger],
              ...smsTriggerEdits,
            },
          },
        });
      }

      setSelectedSmsTrigger(null);
      setSmsTriggerEdits({});
      alert("SMS trigger saved!");
    } catch (error: any) {
      alert("Failed to save SMS trigger");
    } finally {
      setSmsSaving(false);
    }
  };

  const testSMSTrigger = async (triggerKey: string) => {
    if (!testSmsPhone || !projectId) {
      alert("Please enter a phone number to test");
      return;
    }

    try {
      setTestingSmsTrigger(triggerKey);
      setSmsTestResult(null);
      const token = localStorage.getItem("authToken");
      const response = await axios.post(
        `${API_BASE_URL}/sms-config/${projectId}/triggers/${triggerKey}/test`,
        { phone: "91" + testSmsPhone },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      setSmsTestResult({ success: true, message: response.data.message });
      alert(response.data.message);
    } catch (error: any) {
      console.error("Test SMS error:", error);
      const msg = error.response?.data?.error || "Failed to send test SMS";
      setSmsTestResult({ success: false, message: msg });
      alert(msg);
    } finally {
      setTestingSmsTrigger(null);
    }
  };

  const openSmsTriggerEditor = (triggerKey: string) => {
    if (smsConfig?.triggers[triggerKey]) {
      setSelectedSmsTrigger(triggerKey);
      setSmsTriggerEdits({ ...smsConfig.triggers[triggerKey] });
    }
  };

  const togglePasswordVisibility = async () => {
    if (!showPassword && config?.smtpPassword === "********") {
      // Fetch real password from backend
      try {
        const token = localStorage.getItem("authToken");
        const response = await axios.get(
          `${API_BASE_URL}/email-config/${projectId}?showPassword=true`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        setConfig(response.data.data);
        setShowPassword(true);
      } catch (error) {
        console.error("Error fetching password:", error);
      }
    } else {
      setShowPassword(!showPassword);
    }
  };

  const handleSMTPChange = (field: string, value: any) => {
    if (config) {
      setConfig({ ...config, [field]: value });
    }
  };

  const saveSMTPConfig = async () => {
    try {
      setSaving(true);
      const token = localStorage.getItem("authToken");

      const provider = config?.emailProvider || "smtp";
      const updates: any = {
        enabled: config?.enabled,
        emailProvider: provider,
        fromEmail: config?.fromEmail,
        fromName: config?.fromName,
      };

      if (provider === "sendgrid") {
        // Only send API key if it was actually changed (not the masked '****' placeholder)
        if (config?.sendgridApiKey && config.sendgridApiKey !== "****") {
          updates.sendgridApiKey = config.sendgridApiKey;
        }
      } else {
        // SMTP fields
        updates.smtpHost = config?.smtpHost;
        updates.smtpPort = config?.smtpPort;
        updates.smtpSecure = config?.smtpSecure;
        updates.smtpUser = config?.smtpUser;
        if (config?.smtpPassword && config.smtpPassword !== "********") {
          updates.smtpPassword = config.smtpPassword;
        }
      }

      await axios.put(`${API_BASE_URL}/email-config/${projectId}`, updates, {
        headers: { Authorization: `Bearer ${token}` },
      });

      alert("SMTP configuration saved successfully!");
      fetchEmailConfig();
    } catch (error) {
      console.error("Error saving SMTP config:", error);
      alert("Failed to save SMTP configuration");
    } finally {
      setSaving(false);
    }
  };

  const testEmailConfiguration = async () => {
    try {
      setTestingEmail(true);
      setTestResult(null);
      const token = localStorage.getItem("authToken");

      const response = await axios.post(
        `${API_BASE_URL}/email-config/${projectId}/test`,
        { testEmail },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      setTestResult({ success: true, message: response.data.message });
    } catch (error: any) {
      setTestResult({
        success: false,
        message: error.response?.data?.message || "Failed to send test email",
      });
    } finally {
      setTestingEmail(false);
    }
  };

  const testNotificationBundle = async () => {
    if (!projectId) return;

    // Validate inputs before firing the request
    const errors: { email?: string; phone?: string } = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^\d{10}$/;

    if (bundleSendEmail) {
      if (!bundleTestEmail.trim()) {
        errors.email = "Email address is required";
      } else if (!emailRegex.test(bundleTestEmail.trim())) {
        errors.email = "Enter a valid email address (e.g. user@example.com)";
      }
    }
    if (bundleSendWhatsApp || bundleSendSMS) {
      if (!bundleTestPhone.trim()) {
        errors.phone = "Phone number is required";
      } else if (!phoneRegex.test(bundleTestPhone.trim())) {
        errors.phone = "Enter a valid 10-digit mobile number";
      }
    }
    if (Object.keys(errors).length > 0) {
      setBundleTestErrors(errors);
      return;
    }
    setBundleTestErrors({});

    setBundleTesting(true);
    setBundleResult(null);
    try {
      const token = localStorage.getItem("authToken");
      const response = await axios.post(
        `${API_BASE_URL}/email-config/${projectId}/test-bundle`,
        {
          sendEmail: bundleSendEmail,
          sendSMS: bundleSendSMS,
          sendWhatsApp: bundleSendWhatsApp,
          testEmail: bundleTestEmail,
          testPhone: "91" + bundleTestPhone,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      setBundleResult(response.data.results || {});
    } catch (error: any) {
      const message = error?.response?.data?.message || "Failed to run test";
      setBundleResult({ global: { success: false, message } });
    } finally {
      setBundleTesting(false);
    }
  };

  const openTriggerEditor = (triggerKey: string) => {
    setSelectedTrigger(triggerKey);
    if (config) {
      setTriggerEdits(config.triggers[triggerKey]);
    }
  };

  const saveTrigger = async () => {
    if (!selectedTrigger) return;

    try {
      setSaving(true);
      const token = localStorage.getItem("authToken");

      await axios.put(
        `${API_BASE_URL}/email-config/${projectId}/triggers/${selectedTrigger}`,
        triggerEdits,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      alert("Trigger updated successfully!");
      fetchEmailConfig();
      setSelectedTrigger(null);
      setTriggerEdits({});
    } catch (error) {
      console.error("Error saving trigger:", error);
      alert("Failed to save trigger");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <ModuleHeader
          title="Email Configuration"
          subtitle="Configure SMTP settings and manage email triggers for your project"
        />

        {/* Project Selector (for super admin) */}
        {projects.length > 0 && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Project
            </label>
            <select
              value={projectId || ""}
              onChange={(e) => {
                const newProjectId = e.target.value;
                setProjectId(newProjectId);
                localStorage.setItem("projectId", newProjectId);
              }}
              className="block w-full max-w-md px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              {projects.map((project) => (
                <option key={project._id} value={project._id}>
                  {project.name} ({project.code})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab("email")}
              className={`${
                activeTab === "email"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2`}
            >
              <PaperAirplaneIcon className="h-5 w-5" />
              Email Configuration
            </button>
            <button
              onClick={() => setActiveTab("whatsapp")}
              className={`${
                activeTab === "whatsapp"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2`}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              WhatsApp Triggers
            </button>
            <button
              onClick={() => setActiveTab("sms")}
              className={`${
                activeTab === "sms"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2`}
            >
              <DevicePhoneMobileIcon className="h-5 w-5" />
              SMS Settings
            </button>
            <button
              onClick={() => setActiveTab("test")}
              className={`${
                activeTab === "test"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2`}
            >
              <PaperAirplaneIcon className="h-5 w-5" />
              Test Notifications
            </button>
          </nav>
        </div>

        {/* Email Configuration Tab (Email + WhatsApp + SMS) */}
        {activeTab === "email" && config && (
          <div className="space-y-6">
            {/* SMTP Settings - Collapsible */}
            <div className="bg-white rounded-lg shadow-md">
              <button
                onClick={() => setShowSmtpSettings(!showSmtpSettings)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors rounded-t-lg"
              >
                <div className="flex items-center gap-3">
                  <Cog6ToothIcon className="h-6 w-6 text-gray-600" />
                  <div className="text-left">
                    <h3 className="text-base font-semibold text-gray-900">
                      SMTP Settings
                    </h3>
                    <p className="text-sm text-gray-500">
                      {config.enabled ? "Configured" : "Not configured"}
                    </p>
                  </div>
                </div>
                <svg
                  className={`h-5 w-5 text-gray-400 transform transition-transform ${showSmtpSettings ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {showSmtpSettings && (
                <div className="px-6 pb-6 border-t border-gray-100">
                  <div className="space-y-6 mt-4">
                    {/* Enable/Disable Email */}
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div>
                        <h4 className="text-lg font-semibold text-gray-900">
                          Email Integration
                        </h4>
                        <p className="text-sm text-gray-600">
                          Enable or disable email notifications
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={config.enabled}
                          onChange={(e) =>
                            handleSMTPChange("enabled", e.target.checked)
                          }
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>

                    {/* Delivery Provider Selector */}
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <h4 className="text-sm font-semibold text-blue-900 mb-3">
                        Delivery Provider
                      </h4>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="emailProvider"
                            value="smtp"
                            checked={
                              (config.emailProvider || "smtp") === "smtp"
                            }
                            onChange={() =>
                              handleSMTPChange("emailProvider", "smtp")
                            }
                            className="h-4 w-4 text-blue-600 border-gray-300"
                          />
                          <span className="text-sm font-medium text-gray-800">
                            Direct SMTP / IMAP
                          </span>
                          <span className="text-xs text-gray-500">
                            (Gmail, Outlook, custom mail server)
                          </span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="emailProvider"
                            value="sendgrid"
                            checked={config.emailProvider === "sendgrid"}
                            onChange={() =>
                              handleSMTPChange("emailProvider", "sendgrid")
                            }
                            className="h-4 w-4 text-blue-600 border-gray-300"
                          />
                          <span className="text-sm font-medium text-gray-800">
                            SendGrid
                          </span>
                          <span className="text-xs text-gray-500">
                            (Email delivery partner — API-based)
                          </span>
                        </label>
                      </div>
                    </div>

                    {/* SendGrid Configuration */}
                    {config.emailProvider === "sendgrid" && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            SendGrid API Key *
                          </label>
                          <div className="relative">
                            <input
                              type={showSendgridKey ? "text" : "password"}
                              value={config.sendgridApiKey || ""}
                              onChange={(e) =>
                                handleSMTPChange(
                                  "sendgridApiKey",
                                  e.target.value,
                                )
                              }
                              placeholder="SG.xxxxxxxxxxxxxxxxxx"
                              className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setShowSendgridKey(!showSendgridKey)
                              }
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                            >
                              {showSendgridKey ? (
                                <EyeSlashIcon className="h-5 w-5" />
                              ) : (
                                <EyeIcon className="h-5 w-5" />
                              )}
                            </button>
                          </div>
                          <p className="mt-1 text-xs text-gray-500">
                            Get your API key from{" "}
                            <a
                              href="https://app.sendgrid.com/settings/api_keys"
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 underline"
                            >
                              SendGrid Dashboard → API Keys
                            </a>
                            . Requires <strong>Mail Send</strong> permission.
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            From Email *
                          </label>
                          <input
                            type="email"
                            value={config.fromEmail}
                            onChange={(e) =>
                              handleSMTPChange("fromEmail", e.target.value)
                            }
                            placeholder="noreply@yourdomain.com"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                          <p className="mt-1 text-xs text-gray-500">
                            Must be a verified sender or domain in SendGrid.
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            From Name
                          </label>
                          <input
                            type="text"
                            value={config.fromName}
                            onChange={(e) =>
                              handleSMTPChange("fromName", e.target.value)
                            }
                            placeholder="SAC Helpdesk"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                      </div>
                    )}

                    {/* SMTP Configuration Grid */}
                    {(config.emailProvider || "smtp") === "smtp" && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            SMTP Host *
                          </label>
                          <input
                            type="text"
                            value={config.smtpHost}
                            onChange={(e) =>
                              handleSMTPChange("smtpHost", e.target.value)
                            }
                            placeholder="smtp.gmail.com"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            SMTP Port *
                          </label>
                          <input
                            type="number"
                            value={config.smtpPort}
                            onChange={(e) =>
                              handleSMTPChange(
                                "smtpPort",
                                parseInt(e.target.value),
                              )
                            }
                            placeholder="587"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            SMTP Username *
                          </label>
                          <input
                            type="text"
                            value={config.smtpUser}
                            onChange={(e) =>
                              handleSMTPChange("smtpUser", e.target.value)
                            }
                            placeholder="your_email@gmail.com"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            SMTP Password *
                          </label>
                          <div className="relative">
                            <input
                              type={showPassword ? "text" : "password"}
                              value={config.smtpPassword}
                              onChange={(e) =>
                                handleSMTPChange("smtpPassword", e.target.value)
                              }
                              placeholder="********"
                              className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                            <button
                              type="button"
                              onClick={togglePasswordVisibility}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                            >
                              {showPassword ? (
                                <EyeSlashIcon className="h-5 w-5" />
                              ) : (
                                <EyeIcon className="h-5 w-5" />
                              )}
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            From Email *
                          </label>
                          <input
                            type="email"
                            value={config.fromEmail}
                            onChange={(e) =>
                              handleSMTPChange("fromEmail", e.target.value)
                            }
                            placeholder="noreply@example.com"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            From Name
                          </label>
                          <input
                            type="text"
                            value={config.fromName}
                            onChange={(e) =>
                              handleSMTPChange("fromName", e.target.value)
                            }
                            placeholder="SAC Helpdesk"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                      </div>
                    )}

                    {(config.emailProvider || "smtp") === "smtp" && (
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="smtpSecure"
                          checked={config.smtpSecure}
                          onChange={(e) =>
                            handleSMTPChange("smtpSecure", e.target.checked)
                          }
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <label
                          htmlFor="smtpSecure"
                          className="ml-2 block text-sm text-gray-700"
                        >
                          Use SSL/TLS (Port 465)
                        </label>
                      </div>
                    )}

                    {/* Test Email */}
                    <div className="border-t pt-6">
                      <h4 className="text-lg font-semibold text-gray-900 mb-4">
                        Test Email Configuration
                      </h4>
                      <div className="flex gap-4">
                        <input
                          type="email"
                          value={testEmail}
                          onChange={(e) => setTestEmail(e.target.value)}
                          placeholder="Enter email to send test"
                          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <button
                          onClick={testEmailConfiguration}
                          disabled={testingEmail || !testEmail}
                          className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          {testingEmail ? (
                            <>
                              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                              Sending...
                            </>
                          ) : (
                            <>
                              <PaperAirplaneIcon className="h-5 w-5" />
                              Send Test Email
                            </>
                          )}
                        </button>
                      </div>
                      {testResult && (
                        <div
                          className={`mt-4 p-4 rounded-lg flex items-center gap-3 ${testResult.success ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}
                        >
                          {testResult.success ? (
                            <CheckCircleIcon className="h-6 w-6" />
                          ) : (
                            <XCircleIcon className="h-6 w-6" />
                          )}
                          <span>{testResult.message}</span>
                        </div>
                      )}
                    </div>

                    {/* Save Button */}
                    <div className="flex justify-end border-t pt-6">
                      <button
                        onClick={saveSMTPConfig}
                        disabled={saving}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {saving ? "Saving..." : "Save SMTP Configuration"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Email Triggers Section */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Email Triggers
              </h3>
              <p className="text-sm text-gray-600 mb-6">
                Configure when and how email notifications are sent
              </p>

              <div className="space-y-4">
                {Object.entries(config.triggers).map(([key, trigger]) => (
                  <div
                    key={key}
                    className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h4 className="text-lg font-semibold text-gray-900">
                            {trigger.name}
                          </h4>
                          <span
                            className={`px-3 py-1 text-xs font-medium rounded-full ${trigger.enabled ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}
                          >
                            {trigger.enabled ? "Enabled" : "Disabled"}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          {trigger.subject}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={trigger.enabled}
                            onChange={async (e) => {
                              const newEnabled = e.target.checked;
                              // Optimistically update local state
                              const updatedConfig = { ...config };
                              updatedConfig.triggers[key].enabled = newEnabled;
                              setConfig(updatedConfig);
                              // Persist to database immediately
                              try {
                                const token = localStorage.getItem("authToken");
                                await axios.put(
                                  `${API_BASE_URL}/email-config/${projectId}/triggers/${key}`,
                                  { ...trigger, enabled: newEnabled },
                                  {
                                    headers: {
                                      Authorization: `Bearer ${token}`,
                                    },
                                  },
                                );
                              } catch (err) {
                                console.error(
                                  "Failed to save trigger state:",
                                  err,
                                );
                                // Revert on failure
                                const revertedConfig = { ...config };
                                revertedConfig.triggers[key].enabled =
                                  !newEnabled;
                                setConfig(revertedConfig);
                                alert(
                                  "Failed to save trigger state. Please try again.",
                                );
                              }
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                        <button
                          onClick={() => openTriggerEditor(key)}
                          className="px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Trigger Edit Modal */}
            {selectedTrigger && config.triggers[selectedTrigger] && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                  <div className="p-6">
                    <div className="flex justify-between items-center mb-6">
                      <h2 className="text-xl font-bold text-gray-900">
                        Edit Trigger: {config.triggers[selectedTrigger].name}
                      </h2>
                      <button
                        onClick={() => {
                          setSelectedTrigger(null);
                          setTriggerEdits({});
                        }}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <XCircleIcon className="h-6 w-6" />
                      </button>
                    </div>

                    <div className="space-y-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Email Subject
                        </label>
                        <input
                          type="text"
                          value={
                            triggerEdits.subject ??
                            config.triggers[selectedTrigger].subject
                          }
                          onChange={(e) =>
                            setTriggerEdits({
                              ...triggerEdits,
                              subject: e.target.value,
                            })
                          }
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Email Body
                        </label>
                        <textarea
                          value={
                            triggerEdits.body ??
                            config.triggers[selectedTrigger].body
                          }
                          onChange={(e) =>
                            setTriggerEdits({
                              ...triggerEdits,
                              body: e.target.value,
                            })
                          }
                          rows={8}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div className="bg-blue-50 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <InformationCircleIcon className="h-5 w-5 text-blue-600" />
                          <h4 className="font-medium text-blue-900">
                            Available Variables
                          </h4>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {TRIGGER_VARIABLES[selectedTrigger]?.map((v) => (
                            <div key={v.variable} className="text-sm">
                              <code className="bg-blue-100 px-2 py-1 rounded text-blue-800">
                                {v.variable}
                              </code>
                              <span className="text-gray-600 ml-2">
                                {v.description}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Recipients
                        </label>
                        <select
                          value={
                            triggerEdits.recipients ??
                            config.triggers[selectedTrigger].recipients
                          }
                          onChange={(e) =>
                            setTriggerEdits({
                              ...triggerEdits,
                              recipients: e.target.value as any,
                            })
                          }
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="student">Student Only</option>
                          <option value="agent">Agent Only</option>
                          <option value="both">Both Student & Agent</option>
                          <option value="custom">Custom Recipients</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex justify-end gap-4 mt-6 pt-6 border-t">
                      <button
                        onClick={() => {
                          setSelectedTrigger(null);
                          setTriggerEdits({});
                        }}
                        className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={saveTrigger}
                        disabled={saving}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                        {saving ? "Saving..." : "Save Trigger"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* WhatsApp Tab */}
        {activeTab === "whatsapp" && (
          <div className="space-y-6">
            {whatsappLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
              </div>
            ) : !whatsappConfig ? (
              <div className="text-center py-12 text-gray-500">
                No WhatsApp configuration found
              </div>
            ) : (
              <>
                {/* WhatsApp API Settings */}
                <div className="bg-white rounded-lg shadow-md">
                  <button
                    onClick={() => setShowWaApiSettings(!showWaApiSettings)}
                    className="w-full px-6 py-4 flex items-center justify-between text-left"
                  >
                    <div className="flex items-center gap-3">
                      <Cog6ToothIcon className="h-5 w-5 text-gray-400" />
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          WhatsApp API Settings
                        </h3>
                        <p className="text-sm text-gray-500">
                          {whatsappConfig.apiBaseUrl
                            ? "Configured"
                            : "Not configured"}
                        </p>
                      </div>
                    </div>
                    <svg
                      className={`h-5 w-5 text-gray-400 transform transition-transform ${showWaApiSettings ? "rotate-180" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>

                  {showWaApiSettings && (
                    <div className="px-6 pb-6 border-t border-gray-100">
                      {/* Status Toggle Header */}
                      <div className="flex items-center justify-between mb-8 mt-6 bg-gray-50 p-4 rounded-lg border border-gray-100">
                        <div>
                          <h3 className="text-sm font-medium text-gray-900">
                            Integration Status
                          </h3>
                          <p className="text-xs text-gray-500 mt-1">
                            {whatsappConfig.enabled
                              ? "Integration is active. Messages will be sent based on trigger settings."
                              : "Integration is globally disabled. No messages will be sent."}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span
                            className={`text-sm font-medium ${whatsappConfig.enabled ? "text-green-600" : "text-gray-500"}`}
                          >
                            {whatsappConfig.enabled ? "Active" : "Inactive"}
                          </span>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={whatsappConfig.enabled || false}
                              onChange={(e) =>
                                setWhatsappConfig({
                                  ...whatsappConfig,
                                  enabled: e.target.checked,
                                })
                              }
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                          </label>
                        </div>
                      </div>

                      {/* API Configuration Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        {/* API Base URL */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            API Base URL <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={whatsappConfig.apiBaseUrl}
                            onChange={(e) =>
                              setWhatsappConfig({
                                ...whatsappConfig,
                                apiBaseUrl: e.target.value,
                              })
                            }
                            placeholder="https://crmapi.wa0.in/api/meta/v19.0"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-green-500 focus:border-green-500 text-sm"
                          />
                          <p className="mt-1 text-xs text-gray-500 break-all">
                            Format: {whatsappConfig.apiBaseUrl || "https://..."}
                            /{"{numberId}"}/messages
                          </p>
                        </div>

                        {/* Access Token */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Access Token <span className="text-red-500">*</span>
                          </label>
                          <div className="relative">
                            <input
                              type={showWaAccessToken ? "text" : "password"}
                              value={whatsappConfig.accessToken}
                              onChange={(e) =>
                                setWhatsappConfig({
                                  ...whatsappConfig,
                                  accessToken: e.target.value,
                                })
                              }
                              placeholder="Enter API access token"
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 focus:ring-green-500 focus:border-green-500 text-sm"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setShowWaAccessToken(!showWaAccessToken)
                              }
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                            >
                              {showWaAccessToken ? (
                                <EyeSlashIcon className="h-4 w-4" />
                              ) : (
                                <EyeIcon className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex justify-end pt-2">
                        <button
                          onClick={saveWaApiSettings}
                          disabled={whatsappSaving}
                          className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium shadow-sm transition-colors"
                        >
                          {whatsappSaving ? "Saving..." : "Save API Settings"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* WhatsApp Test Result */}
                {waTestResult && (
                  <div
                    className={`p-4 rounded-lg flex items-center gap-3 ${waTestResult.success ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}
                  >
                    {waTestResult.success ? (
                      <CheckCircleIcon className="h-5 w-5" />
                    ) : (
                      <XCircleIcon className="h-5 w-5" />
                    )}
                    <span>{waTestResult.message}</span>
                    <button
                      onClick={() => setWaTestResult(null)}
                      className="ml-auto text-sm underline"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                {/* WhatsApp Triggers List */}
                <div className="bg-white rounded-lg shadow-md">
                  <div className="px-6 py-4 border-b border-gray-100">
                    <h3 className="text-lg font-semibold text-gray-900">
                      WhatsApp Triggers
                    </h3>
                    <p className="text-sm text-gray-500">
                      Configure Number ID for each message trigger
                    </p>
                  </div>

                  <div className="divide-y divide-gray-100">
                    {Object.entries(whatsappConfig.triggers).map(
                      ([key, trigger]) => (
                        <div key={key} className="px-6 py-4">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h4 className="font-medium text-gray-900">
                                  {trigger.name}
                                </h4>
                                <span
                                  className={`px-2 py-0.5 text-xs rounded-full ${trigger.enabled ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}
                                >
                                  {trigger.enabled ? "Enabled" : "Disabled"}
                                </span>
                                <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800">
                                  {trigger.recipients}
                                </span>
                              </div>

                              {/* Trigger Configuration Fields */}
                              <div className="flex flex-wrap items-end gap-3">
                                <div className="flex-1 min-w-[200px]">
                                  <label className="block text-xs text-gray-500 mb-1">
                                    Number ID{" "}
                                    <span className="text-red-500">*</span>
                                  </label>
                                  <input
                                    type="text"
                                    value={trigger.numberId || ""}
                                    onChange={(e) =>
                                      updateWaTriggerField(
                                        key,
                                        "numberId",
                                        e.target.value,
                                      )
                                    }
                                    placeholder="e.g., 952415067947914"
                                    className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:ring-green-500 focus:border-green-500"
                                  />
                                </div>

                                <div className="flex-1 min-w-[160px]">
                                  <label className="block text-xs text-gray-500 mb-1">
                                    Template Name{" "}
                                    <span className="text-red-500">*</span>
                                    {!trigger.templateName && (
                                      <span className="ml-1 text-amber-600 font-medium">
                                        (required)
                                      </span>
                                    )}
                                  </label>
                                  <input
                                    type="text"
                                    value={trigger.templateName || ""}
                                    onChange={(e) =>
                                      updateWaTriggerField(
                                        key,
                                        "templateName",
                                        e.target.value,
                                      )
                                    }
                                    placeholder="e.g., account_created"
                                    className={`w-full text-sm border rounded px-2 py-1.5 focus:ring-green-500 focus:border-green-500 ${!trigger.templateName ? "border-amber-400 bg-amber-50" : "border-gray-300"}`}
                                  />
                                </div>

                                <div className="w-24">
                                  <label className="block text-xs text-gray-500 mb-1">
                                    Language
                                  </label>
                                  <select
                                    value={trigger.templateLanguage || "en"}
                                    onChange={(e) =>
                                      updateWaTriggerField(
                                        key,
                                        "templateLanguage",
                                        e.target.value,
                                      )
                                    }
                                    className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
                                  >
                                    <option value="en">English</option>
                                    <option value="hi">Hindi</option>
                                    <option value="mr">Marathi</option>
                                  </select>
                                </div>

                                {/* Test */}
                                <div className="flex items-end gap-2">
                                  <div>
                                    <label className="block text-xs text-gray-500 mb-1">
                                      Test Phone
                                    </label>
                                    <div className="flex items-center border border-gray-300 rounded overflow-hidden w-44">
                                      <span className="px-2 py-1.5 bg-gray-100 text-sm text-gray-600 border-r border-gray-300 select-none whitespace-nowrap">
                                        +91
                                      </span>
                                      <input
                                        type="text"
                                        value={testPhone}
                                        onChange={(e) =>
                                          setTestPhone(
                                            e.target.value
                                              .replace(/\D/g, "")
                                              .slice(0, 10),
                                          )
                                        }
                                        placeholder="9876543210"
                                        className="w-full text-sm px-2 py-1.5 outline-none"
                                      />
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => testWaTrigger(key)}
                                    disabled={
                                      testingWaTrigger === key ||
                                      !trigger.numberId ||
                                      !trigger.templateName
                                    }
                                    className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                                  >
                                    <PaperAirplaneIcon className="h-4 w-4" />
                                    {testingWaTrigger === key ? "..." : "Test"}
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Toggle & Edit */}
                            <div className="flex flex-col items-end gap-2">
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={trigger.enabled}
                                  onChange={(e) =>
                                    updateWaTriggerField(
                                      key,
                                      "enabled",
                                      e.target.checked,
                                    )
                                  }
                                  className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                              </label>
                              <button
                                onClick={() => openWaTriggerEditor(key)}
                                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                              >
                                Edit
                              </button>
                            </div>
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* WhatsApp Trigger Edit Modal */}
        {selectedWaTrigger && whatsappConfig && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-xl font-bold text-gray-900">
                  Edit WhatsApp Trigger:{" "}
                  {whatsappConfig.triggers[selectedWaTrigger]?.name}
                </h2>
              </div>

              <div className="p-6 space-y-6">
                {/* Enable Checkbox */}
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="waTriggerEnabled"
                    checked={waTriggerEdits.enabled || false}
                    onChange={(e) =>
                      setWaTriggerEdits({
                        ...waTriggerEdits,
                        enabled: e.target.checked,
                      })
                    }
                    className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                  />
                  <label
                    htmlFor="waTriggerEnabled"
                    className="text-sm font-medium text-gray-700"
                  >
                    Enable this trigger
                  </label>
                </div>

                {/* Number ID */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Number ID <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={waTriggerEdits.numberId || ""}
                    onChange={(e) =>
                      setWaTriggerEdits({
                        ...waTriggerEdits,
                        numberId: e.target.value,
                      })
                    }
                    placeholder="e.g., 952415067947914"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Pre-approved Number ID from WhatsApp for this template
                  </p>
                </div>

                {/* Template Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Template Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={waTriggerEdits.templateName || ""}
                    onChange={(e) =>
                      setWaTriggerEdits({
                        ...waTriggerEdits,
                        templateName: e.target.value,
                      })
                    }
                    placeholder="e.g., account_created"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Exact name of the pre-approved WhatsApp template (e.g.,
                    account_created, password_reset)
                  </p>
                </div>

                {/* Language */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Language
                  </label>
                  <select
                    value={waTriggerEdits.templateLanguage || "en"}
                    onChange={(e) =>
                      setWaTriggerEdits({
                        ...waTriggerEdits,
                        templateLanguage: e.target.value,
                      })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  >
                    <option value="en">English</option>
                    <option value="hi">Hindi (à¤¹à¤¿à¤‚à¤¦à¥€)</option>
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    The language of the WhatsApp template. Must match the
                    language your template was approved for.
                  </p>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <InformationCircleIcon className="h-5 w-5 text-blue-600 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-blue-900 mb-2">
                        Available Variables
                      </h4>
                      <p className="text-sm text-blue-700 mb-3">
                        These variables are sent as template parameters ({"{"}
                        {"{"}1{"}"}
                        {"}"}, {"{"}
                        {"{"}2{"}"}
                        {"}"}, etc.) when the message is triggered.
                      </p>
                      <div className="space-y-2">
                        {selectedWaTrigger === "accountCreated" && (
                          <>
                            <div className="flex items-center gap-2 text-sm">
                              <code className="bg-blue-100 px-2 py-0.5 rounded text-blue-800">
                                {"{{1}}"}
                              </code>
                              <span className="text-blue-700">
                                - Student's full name
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <code className="bg-blue-100 px-2 py-0.5 rounded text-blue-800">
                                {"{{2}}"}
                              </code>
                              <span className="text-blue-700">
                                - Student's email
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <code className="bg-blue-100 px-2 py-0.5 rounded text-blue-800">
                                {"{{3}}"}
                              </code>
                              <span className="text-blue-700">- Login URL</span>
                            </div>
                          </>
                        )}
                        {selectedWaTrigger === "passwordReset" && (
                          <>
                            <div className="flex items-center gap-2 text-sm">
                              <code className="bg-blue-100 px-2 py-0.5 rounded text-blue-800">
                                {"{{1}}"}
                              </code>
                              <span className="text-blue-700">
                                - User's name
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <code className="bg-blue-100 px-2 py-0.5 rounded text-blue-800">
                                {"{{2}}"}
                              </code>
                              <span className="text-blue-700">
                                - Reset link
                              </span>
                            </div>
                          </>
                        )}
                        {selectedWaTrigger === "studentOTP" && (
                          <div className="flex items-center gap-2 text-sm">
                            <code className="bg-blue-100 px-2 py-0.5 rounded text-blue-800">
                              {"{{1}}"}
                            </code>
                            <span className="text-blue-700">
                              - OTP code (6 digits)
                            </span>
                          </div>
                        )}
                        {(selectedWaTrigger.includes("ticketCreated") ||
                          selectedWaTrigger === "ticketStatusChanged" ||
                          selectedWaTrigger === "ticketClosed") && (
                          <>
                            <div className="flex items-center gap-2 text-sm">
                              <code className="bg-blue-100 px-2 py-0.5 rounded text-blue-800">
                                {"{{1}}"}
                              </code>
                              <span className="text-blue-700">
                                - Recipient's name
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <code className="bg-blue-100 px-2 py-0.5 rounded text-blue-800">
                                {"{{2}}"}
                              </code>
                              <span className="text-blue-700">
                                - Ticket number
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <code className="bg-blue-100 px-2 py-0.5 rounded text-blue-800">
                                {"{{3}}"}
                              </code>
                              <span className="text-blue-700">
                                - Ticket subject / Status
                              </span>
                            </div>
                          </>
                        )}
                        {![
                          "accountCreated",
                          "passwordReset",
                          "studentOTP",
                        ].includes(selectedWaTrigger) &&
                          !selectedWaTrigger.includes("ticketCreated") &&
                          selectedWaTrigger !== "ticketStatusChanged" &&
                          selectedWaTrigger !== "ticketClosed" && (
                            <p className="text-sm text-blue-700 italic">
                              Variables depend on the trigger type. Contact
                              admin for specific template requirements.
                            </p>
                          )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recipients */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Recipients
                  </label>
                  <select
                    value={waTriggerEdits.recipients || "student"}
                    onChange={(e) =>
                      setWaTriggerEdits({
                        ...waTriggerEdits,
                        recipients: e.target.value as any,
                      })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  >
                    <option value="student">Student Only</option>
                    <option value="agent">Agent Only</option>
                    <option value="both">Both Student & Agent</option>
                    <option value="custom">Custom Recipients</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-4 px-6 py-4 border-t border-gray-100">
                <button
                  onClick={() => {
                    setSelectedWaTrigger(null);
                    setWaTriggerEdits({});
                  }}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={saveWaTrigger}
                  disabled={whatsappSaving}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {whatsappSaving ? "Saving..." : "Save Trigger"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SMS Tab */}
        {activeTab === "sms" && (
          <div className="space-y-6">
            {smsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
              </div>
            ) : !smsConfig ? (
              <div className="text-center py-12 text-gray-500">
                No SMS configuration found
              </div>
            ) : (
              <>
                {/* SMS Settings */}
                <div className="bg-white rounded-lg shadow-md">
                  <div className="px-6 py-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        SMS Gateway Settings
                      </h3>
                      <p className="text-sm text-gray-500">
                        Configure your SMS vendor and credentials
                      </p>
                    </div>
                  </div>

                  <div className="px-6 pb-6 border-t border-gray-100">
                    {/* Master Toggle */}
                    <div className="flex items-center justify-between mb-6 mt-6 bg-gray-50 p-4 rounded-lg border border-gray-100">
                      <div>
                        <h3 className="text-sm font-medium text-gray-900">
                          Integration Status
                        </h3>
                        <p className="text-xs text-gray-500 mt-1">
                          {smsConfig.enabled
                            ? "SMS integration is active. Messages will be sent based on trigger settings."
                            : "SMS integration is globally disabled. No messages will be sent."}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={`text-sm font-medium ${smsConfig.enabled ? "text-green-600" : "text-gray-500"}`}
                        >
                          {smsConfig.enabled ? "Active" : "Inactive"}
                        </span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={smsConfig.enabled || false}
                            onChange={(e) =>
                              setSmsConfig({
                                ...smsConfig,
                                enabled: e.target.checked,
                              })
                            }
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                        </label>
                      </div>
                    </div>

                    {/* Vendor Selection */}
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        SMS Vendor <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={smsConfig.vendor || "gupshup"}
                        onChange={(e) => {
                          const preset =
                            SMS_VENDOR_PRESETS[e.target.value] ||
                            SMS_VENDOR_PRESETS.custom;
                          setSmsConfig({
                            ...smsConfig,
                            ...preset,
                            vendor: e.target.value as any,
                          });
                        }}
                        className="w-full md:w-80 border border-gray-300 rounded-lg px-3 py-2 focus:ring-purple-500 focus:border-purple-500 text-sm"
                      >
                        <option value="gupshup">Gupshup Enterprise</option>
                        <option value="ttbs">
                          TTBS — Tata Tele Business Services
                        </option>
                        <option value="custom">Custom Vendor</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        Selecting a vendor auto-fills API URL and parameter
                        names below.
                      </p>
                    </div>

                    {/* Credentials */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          User ID <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={smsConfig.userId || ""}
                          onChange={(e) =>
                            setSmsConfig({
                              ...smsConfig,
                              userId: e.target.value,
                            })
                          }
                          placeholder="Account username / user ID"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-purple-500 focus:border-purple-500 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Password <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type={showSmsPassword ? "text" : "password"}
                            value={smsConfig.password || ""}
                            onChange={(e) =>
                              setSmsConfig({
                                ...smsConfig,
                                password: e.target.value,
                              })
                            }
                            placeholder="Enter password"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 focus:ring-purple-500 focus:border-purple-500 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => setShowSmsPassword(!showSmsPassword)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                          >
                            {showSmsPassword ? (
                              <EyeSlashIcon className="h-4 w-4" />
                            ) : (
                              <EyeIcon className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Sender / DLT Configuration */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Sender ID{" "}
                          <span className="text-xs font-normal text-gray-400">
                            (DLT Header)
                          </span>
                        </label>
                        <input
                          type="text"
                          value={smsConfig.senderId || ""}
                          onChange={(e) =>
                            setSmsConfig({
                              ...smsConfig,
                              senderId: e.target.value,
                            })
                          }
                          placeholder="e.g. HUBHOX"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-purple-500 focus:border-purple-500 text-sm"
                        />
                        <p className="text-xs text-gray-400 mt-1">
                          6-char DLT registered sender header
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          PEID{" "}
                          <span className="text-xs font-normal text-gray-400">
                            (Principal Entity ID)
                          </span>
                        </label>
                        <input
                          type="text"
                          value={smsConfig.peid || ""}
                          onChange={(e) =>
                            setSmsConfig({ ...smsConfig, peid: e.target.value })
                          }
                          placeholder="DLT registered entity ID"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-purple-500 focus:border-purple-500 text-sm"
                        />
                        <p className="text-xs text-gray-400 mt-1">
                          Required by TRAI for all transactional SMS in India
                        </p>
                      </div>
                    </div>

                    {/* Advanced API Config — collapsible */}
                    <div className="border border-gray-200 rounded-lg mb-6">
                      <button
                        type="button"
                        onClick={() =>
                          setShowAdvancedSmsConfig(!showAdvancedSmsConfig)
                        }
                        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <span>Advanced API Configuration</span>
                        <ChevronDownIcon
                          className={`h-4 w-4 transition-transform ${showAdvancedSmsConfig ? "rotate-180" : ""}`}
                        />
                      </button>
                      {showAdvancedSmsConfig && (
                        <div className="p-4 space-y-4 border-t border-gray-200">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              API URL
                            </label>
                            <input
                              type="text"
                              value={smsConfig.apiUrl || ""}
                              onChange={(e) =>
                                setSmsConfig({
                                  ...smsConfig,
                                  apiUrl: e.target.value,
                                })
                              }
                              placeholder="https://api.vendor.com/send"
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-purple-500 focus:border-purple-500"
                            />
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {[
                              {
                                label: "Username Param",
                                field: "usernameParamName",
                                hint: "userid / username",
                              },
                              {
                                label: "Password Param",
                                field: "passwordParamName",
                                hint: "password",
                              },
                              {
                                label: "Phone Param",
                                field: "phoneParamName",
                                hint: "mobile / send_to",
                              },
                              {
                                label: "Message Param",
                                field: "messageParamName",
                                hint: "message / msg",
                              },
                              {
                                label: "Sender ID Param",
                                field: "senderIdParamName",
                                hint: "senderid / header",
                              },
                              {
                                label: "Success Pattern",
                                field: "successPattern",
                                hint: "success",
                              },
                            ].map(({ label, field, hint }) => (
                              <div key={field}>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  {label}
                                </label>
                                <input
                                  type="text"
                                  value={(smsConfig as any)[field] || ""}
                                  onChange={(e) =>
                                    setSmsConfig({
                                      ...smsConfig,
                                      [field]: e.target.value,
                                    })
                                  }
                                  placeholder={hint}
                                  className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-xs font-mono focus:ring-purple-500 focus:border-purple-500"
                                />
                              </div>
                            ))}
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Extra Fixed Parameters{" "}
                              <span className="text-xs font-normal text-gray-400">
                                (JSON)
                              </span>
                            </label>
                            <textarea
                              value={smsConfig.extraStaticParams || ""}
                              onChange={(e) =>
                                setSmsConfig({
                                  ...smsConfig,
                                  extraStaticParams: e.target.value,
                                })
                              }
                              rows={3}
                              placeholder='{"method":"SendMessage","msg_type":"TEXT"}'
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono focus:ring-purple-500 focus:border-purple-500"
                            />
                            <p className="text-xs text-gray-400 mt-1">
                              Fixed key-value pairs appended to every API call
                              (e.g. Gupshup needs method, msg_type, auth_scheme)
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end">
                      <button
                        onClick={saveSMSSettings}
                        disabled={smsSaving}
                        className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm font-medium shadow-sm"
                      >
                        {smsSaving ? "Saving..." : "Save Settings"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* SMS Triggers List */}
                <div className="bg-white rounded-lg shadow-md">
                  <div className="px-6 py-4 border-b border-gray-100">
                    <h3 className="text-lg font-semibold text-gray-900">
                      SMS Triggers
                    </h3>
                    <p className="text-sm text-gray-500">
                      Configure templates for each trigger
                    </p>
                  </div>

                  <div className="space-y-4 p-6">
                    {Object.entries(smsConfig.triggers).map(
                      ([key, trigger]) => (
                        <div
                          key={key}
                          className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h4 className="font-medium text-gray-900">
                                  {trigger.name}
                                </h4>
                                <span
                                  className={`px-2 py-0.5 text-xs rounded-full ${trigger.enabled ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}
                                >
                                  {trigger.enabled ? "Enabled" : "Disabled"}
                                </span>
                              </div>
                              <p className="text-sm text-gray-600 line-clamp-2 bg-gray-50 p-2 rounded border border-gray-100 font-mono text-xs">
                                {trigger.template || "(No template configured)"}
                              </p>

                              {/* Test SMS Input */}
                              <div className="mt-3 flex items-center gap-2">
                                <div className="flex items-center border border-gray-300 rounded overflow-hidden">
                                  <span className="px-2 py-1 bg-gray-100 text-xs text-gray-600 border-r border-gray-300 select-none whitespace-nowrap">
                                    +91
                                  </span>
                                  <input
                                    type="text"
                                    value={testSmsPhone}
                                    onChange={(e) =>
                                      setTestSmsPhone(
                                        e.target.value
                                          .replace(/\D/g, "")
                                          .slice(0, 10),
                                      )
                                    }
                                    placeholder="9876543210"
                                    className="text-xs px-2 py-1 w-32 outline-none"
                                  />
                                </div>
                                <button
                                  onClick={() => testSMSTrigger(key)}
                                  disabled={
                                    testingSmsTrigger === key || !testSmsPhone
                                  }
                                  className="px-3 py-1 text-xs bg-blue-50 text-blue-600 border border-blue-200 rounded hover:bg-blue-100 disabled:opacity-50 flex items-center gap-1"
                                >
                                  {testingSmsTrigger === key ? (
                                    <>
                                      <div className="animate-spin h-3 w-3 border-b-2 border-blue-600 rounded-full"></div>
                                      Sending...
                                    </>
                                  ) : (
                                    <>
                                      <PaperAirplaneIcon className="h-3 w-3" />
                                      Test
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>

                            <div className="flex flex-col items-end gap-2">
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={trigger.enabled}
                                  onChange={(e) =>
                                    updateSMSTriggerField(
                                      key,
                                      "enabled",
                                      e.target.checked,
                                    )
                                  }
                                  className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                              </label>
                              <button
                                onClick={() => openSmsTriggerEditor(key)}
                                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                              >
                                Edit
                              </button>
                            </div>
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* SMS Trigger Edit Modal */}
        {selectedSmsTrigger && smsConfig && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-xl font-bold text-gray-900">
                  Edit SMS Trigger:{" "}
                  {smsConfig.triggers[selectedSmsTrigger]?.name}
                </h2>
              </div>

              <div className="p-6 space-y-6">
                {/* Enable Checkbox */}
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="smsTriggerEnabled"
                    checked={smsTriggerEdits.enabled || false}
                    onChange={(e) =>
                      setSmsTriggerEdits({
                        ...smsTriggerEdits,
                        enabled: e.target.checked,
                      })
                    }
                    className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                  />
                  <label
                    htmlFor="smsTriggerEnabled"
                    className="text-sm font-medium text-gray-700"
                  >
                    Enable this trigger
                  </label>
                </div>

                {/* Template */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Message Template <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={smsTriggerEdits.template || ""}
                    onChange={(e) =>
                      setSmsTriggerEdits({
                        ...smsTriggerEdits,
                        template: e.target.value,
                      })
                    }
                    rows={5}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm"
                    placeholder="Enter your SMS template content here..."
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Supports variables like {"{{1}}"}, {"{{2}}"}, etc. or named
                    variables {"{{otp}}"} depending on trigger context.
                  </p>
                </div>

                {/* DLT Template IDs (TTBS / TRAI compliance) */}
                {(smsConfig.vendor === "ttbs" ||
                  smsConfig.vendor === "custom") && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-yellow-900 mb-3">
                      DLT Template Details{" "}
                      <span className="text-xs font-normal text-yellow-700">
                        (required for{" "}
                        {smsConfig.vendor === "ttbs"
                          ? "TTBS"
                          : "custom vendors"}{" "}
                        — TRAI mandate)
                      </span>
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Content Template ID{" "}
                          <span className="text-gray-400">(contentid)</span>
                        </label>
                        <input
                          type="text"
                          value={smsTriggerEdits.dltContentId || ""}
                          onChange={(e) =>
                            setSmsTriggerEdits({
                              ...smsTriggerEdits,
                              dltContentId: e.target.value,
                            })
                          }
                          placeholder="DLT content template ID"
                          className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm font-mono focus:ring-purple-500 focus:border-purple-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Template Mapping ID{" "}
                          <span className="text-gray-400">(tmid)</span>
                        </label>
                        <input
                          type="text"
                          value={smsTriggerEdits.dltTemplateId || ""}
                          onChange={(e) =>
                            setSmsTriggerEdits({
                              ...smsTriggerEdits,
                              dltTemplateId: e.target.value,
                            })
                          }
                          placeholder="DLT template mapping ID"
                          className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm font-mono focus:ring-purple-500 focus:border-purple-500"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Recipients */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Recipients
                  </label>
                  <select
                    value={smsTriggerEdits.recipients || "student"}
                    onChange={(e) =>
                      setSmsTriggerEdits({
                        ...smsTriggerEdits,
                        recipients: e.target.value as any,
                      })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="student">Student Only</option>
                    <option value="agent">Agent Only</option>
                    <option value="both">Both Student & Agent</option>
                    <option value="custom">Custom Recipients</option>
                  </select>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <InformationCircleIcon className="h-5 w-5 text-blue-600 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-blue-900 mb-2">
                        Available Variables
                      </h4>
                      <div className="space-y-1 text-sm text-blue-800">
                        {/* Simplified variable suggestion for now */}
                        <p>Use variables matching the trigger context.</p>
                        {selectedSmsTrigger === "studentOTP" && (
                          <p>
                            <code>{`{{otp}}`}</code> - The 6-digit OTP code
                          </p>
                        )}
                        {selectedSmsTrigger === "ticketCreatedStudent" && (
                          <p>
                            <code>{`{{ticketNumber}}`}</code>,{" "}
                            <code>{`{{ticketTitle}}`}</code>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-4 px-6 py-4 border-t border-gray-100">
                <button
                  onClick={() => {
                    setSelectedSmsTrigger(null);
                    setSmsTriggerEdits({});
                  }}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={saveSMSTrigger}
                  disabled={smsSaving}
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                >
                  {smsSaving ? "Saving..." : "Save Trigger"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Test Notifications Tab */}
        {activeTab === "test" && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-md">
              <div className="px-6 py-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Test Notifications (Email / WhatsApp / SMS)
                </h3>
                <p className="text-sm text-gray-600 mb-6">
                  Send test messages to verify your notification configurations
                  across all channels
                </p>

                {/* Channel Selection */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Select Channels to Test
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <label className="flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                      <input
                        type="checkbox"
                        checked={bundleSendEmail}
                        onChange={(e) => setBundleSendEmail(e.target.checked)}
                        className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <div>
                        <span className="text-sm font-medium text-gray-900">
                          Email
                        </span>
                        <p className="text-xs text-gray-500">
                          Test email notifications
                        </p>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                      <input
                        type="checkbox"
                        checked={bundleSendWhatsApp}
                        onChange={(e) =>
                          setBundleSendWhatsApp(e.target.checked)
                        }
                        className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <div>
                        <span className="text-sm font-medium text-gray-900">
                          WhatsApp
                        </span>
                        <p className="text-xs text-gray-500">
                          Test WhatsApp templates
                        </p>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                      <input
                        type="checkbox"
                        checked={bundleSendSMS}
                        onChange={(e) => setBundleSendSMS(e.target.checked)}
                        className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <div>
                        <span className="text-sm font-medium text-gray-900">
                          SMS
                        </span>
                        <p className="text-xs text-gray-500">
                          Test SMS messages
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Test Inputs */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Test Email Address
                      {bundleSendEmail && (
                        <span className="text-red-500 ml-1">*</span>
                      )}
                    </label>
                    <input
                      type="email"
                      value={bundleTestEmail}
                      onChange={(e) => {
                        setBundleTestEmail(e.target.value);
                        if (bundleTestErrors.email)
                          setBundleTestErrors((prev) => ({
                            ...prev,
                            email: undefined,
                          }));
                      }}
                      placeholder="user@example.com"
                      disabled={!bundleSendEmail}
                      className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed ${bundleTestErrors.email ? "border-red-500 bg-red-50" : "border-gray-300"}`}
                    />
                    {bundleTestErrors.email ? (
                      <p className="mt-1 text-xs text-red-600">
                        {bundleTestErrors.email}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-gray-500">
                        Required if Email is selected
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Test Phone Number
                      {(bundleSendWhatsApp || bundleSendSMS) && (
                        <span className="text-red-500 ml-1">*</span>
                      )}
                    </label>
                    <div
                      className={`flex items-center border rounded-lg overflow-hidden ${bundleTestErrors.phone ? "border-red-500 bg-red-50" : "border-gray-300"} ${!bundleSendWhatsApp && !bundleSendSMS ? "opacity-60" : ""}`}
                    >
                      <span className="px-3 py-2 bg-gray-100 text-sm text-gray-600 border-r border-gray-300 select-none whitespace-nowrap font-medium">
                        +91
                      </span>
                      <input
                        type="tel"
                        value={bundleTestPhone}
                        onChange={(e) => {
                          const numeric = e.target.value
                            .replace(/\D/g, "")
                            .slice(0, 10);
                          setBundleTestPhone(numeric);
                          if (bundleTestErrors.phone)
                            setBundleTestErrors((prev) => ({
                              ...prev,
                              phone: undefined,
                            }));
                        }}
                        placeholder="9876543210"
                        disabled={!bundleSendWhatsApp && !bundleSendSMS}
                        maxLength={10}
                        className="flex-1 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed bg-transparent"
                      />
                    </div>
                    {bundleTestErrors.phone ? (
                      <p className="mt-1 text-xs text-red-600">
                        {bundleTestErrors.phone}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-gray-500">
                        Enter 10-digit mobile number (country code +91 is
                        prefixed)
                      </p>
                    )}
                  </div>
                </div>

                {/* Send Button */}
                <div className="flex justify-end border-t pt-6">
                  <button
                    onClick={testNotificationBundle}
                    disabled={
                      bundleTesting ||
                      (!bundleSendEmail &&
                        !bundleSendWhatsApp &&
                        !bundleSendSMS)
                    }
                    className="px-8 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium shadow-sm"
                  >
                    {bundleTesting ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        Testing...
                      </>
                    ) : (
                      <>
                        <PaperAirplaneIcon className="h-5 w-5" />
                        Send Test Messages
                      </>
                    )}
                  </button>
                </div>

                {/* Results */}
                {bundleResult && (
                  <div className="mt-6 space-y-3 border-t pt-6">
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">
                      Test Results
                    </h4>
                    {Object.entries(bundleResult).map(([channel, result]) => (
                      <div
                        key={channel}
                        className={`p-4 rounded-lg flex items-start gap-3 ${result.success ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}
                      >
                        {result.success ? (
                          <CheckCircleIcon className="h-6 w-6 text-green-600 flex-shrink-0 mt-0.5" />
                        ) : (
                          <XCircleIcon className="h-6 w-6 text-red-600 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1">
                          <span className="font-semibold capitalize text-sm">
                            {channel}
                          </span>
                          <p
                            className={`text-sm mt-1 ${result.success ? "text-green-800" : "text-red-800"}`}
                          >
                            {result.message}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Info Card */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <div className="flex items-start gap-3">
                <InformationCircleIcon className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-blue-900 mb-2">
                    Testing Guidelines
                  </h4>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>
                      • Ensure each channel is properly configured before
                      testing
                    </li>
                    <li>
                      • Integration must be enabled for the channel to send test
                      messages
                    </li>
                    <li>
                      • For WhatsApp, at least one trigger must have numberId
                      and templateName configured
                    </li>
                    <li>
                      • Test messages use sample content and may not reflect
                      actual trigger templates
                    </li>
                    <li>
                      • Check spam/junk folders if you don't receive the email
                      test
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmailConfigPage;
