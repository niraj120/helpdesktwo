import React, { useState, useEffect } from "react";
import axios from "axios";
import { API_CONFIG } from "../config/constants";
import ModuleHeader from "../components/ModuleHeader";
import HierarchyCategorySelector, {
  CategoryHierarchyValue,
  useHierarchyConfig,
} from "../components/HierarchyCategorySelector";
import {
  UserPlusIcon,
  TicketIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  ExclamationCircleIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";

interface User {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

interface Agent {
  _id: string; // composite key: matrixId-LevelNum-userId
  name: string; // display name
  email: string;
  role: string; // level name or role name
  priority?: string; // matrix name
  userId: string; // actual MongoDB user _id — sent to backend
}

interface Category {
  _id: string;
  name: string;
  description?: string;
}

interface Center {
  _id: string;
  centerName: string;
  address: string;
  city: string;
  state: string;
  country?: string;
  pincode?: string;
  phone?: string;
  email?: string;
  workingHours?: string;
  latitude?: number;
  longitude?: number;
  mapLink?: string;
  googleMapLink?: string;
  features?: string[];
  contacts?: Array<{
    name: string;
    role?: string;
    mobile?: string;
    email?: string;
  }>;
  isActive: boolean;
}

interface RegistrationField {
  id: string;
  fieldName: string;
  fieldType: string;
  required: boolean;
  placeholder?: string;
  options?: string[];
  validation?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
  };
  isParentMobile?: boolean;
  requireOtpVerification?: boolean;
  order: number;
}

interface TicketField {
  id: string;
  fieldName: string;
  fieldType: string;
  required: boolean;
  placeholder?: string;
  options?: string[];
  validation?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
  };
  allowMultiple?: boolean;
  maxFiles?: number;
  allowedFileTypes?: string[];
  isFixed?: boolean;
  isEnabled?: boolean;
  requireOtpVerification?: boolean;
  order: number;
}

interface OfflineSettings {
  registrationFields: RegistrationField[];
  ticketFields: TicketField[];
  allowAgentToMarkResolved: boolean;
  allowAgentToEscalate: boolean;
  autoAssignToCreatingAgent: boolean;
  requireStudentVerification: boolean;
  notificationSettings: {
    notifyStudentOnRegistration: boolean;
    notifyStudentOnTicketCreation: boolean;
    sendWelcomeEmail: boolean;
  };
}

interface Props {
  projectId: string;
}

const AgentOfflineModule: React.FC<Props> = ({ projectId }) => {
  const [activeTab, setActiveTab] = useState<"register" | "create-ticket">(
    "register",
  );

  // Offline Module Settings
  const [offlineSettings, setOfflineSettings] =
    useState<OfflineSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);

  // User Registration States
  const [userForm, setUserForm] = useState<Record<string, any>>({});
  const [searchEmail, setSearchEmail] = useState("");
  const [foundUser, setFoundUser] = useState<User | null>(null);
  const [registering, setRegistering] = useState(false);
  const [registerSuccess, setRegisterSuccess] = useState(false);
  const [userSearched, setUserSearched] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  // Ticket Creation States
  const [ticketForm, setTicketForm] = useState<Record<string, any>>({
    userEmail: "",
    userId: "",
    markAsResolved: false,
    needsEscalation: false,
    escalationReason: "",
    escalateTo: "",
  });
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [ticketUserSearched, setTicketUserSearched] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [centers, setCenters] = useState<Center[]>([]);
  const [selectedCenter, setSelectedCenter] = useState<string>("");
  const [userPriorTickets, setUserPriorTickets] = useState<any[]>([]);
  const [loadingPriorTickets, setLoadingPriorTickets] = useState(false);
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [ticketSuccess, setTicketSuccess] = useState(false);
  const [createdTicketNumber, setCreatedTicketNumber] = useState("");
  const [categoryHierarchy, setCategoryHierarchy] =
    useState<CategoryHierarchyValue>({});

  // OTP Verification States
  const [otpModal, setOtpModal] = useState<{
    isOpen: boolean;
    fieldId: string;
    fieldName: string;
    fieldType: "phone" | "email";
    value: string;
    formType: "registration" | "ticket";
  } | null>(null);
  const [otpValue, setOtpValue] = useState("");
  const [otpKey, setOtpKey] = useState(""); // OTP key from server for verification
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [verifiedFields, setVerifiedFields] = useState<Record<string, boolean>>(
    {},
  ); // fieldId -> verified status

  // Fetch hierarchy config to determine if multi-level categories are enabled
  const { config: hierarchyConfig } = useHierarchyConfig(projectId);

  useEffect(() => {
    if (projectId) {
      fetchOfflineSettings();
    }
  }, [projectId]);

  useEffect(() => {
    if (activeTab === "create-ticket") {
      fetchTicketAgents();
      fetchCategories();
      fetchCenters();
    }
  }, [activeTab]);

  const fetchOfflineSettings = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await axios.get(
        `${API_CONFIG.API_URL}/projects/${projectId}/offline-settings`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (response.data.success) {
        const settings = response.data.data; // Changed from response.data.settings to response.data.data
        setOfflineSettings(settings);

        // Initialize form with empty values for each configured field
        const initialRegistrationForm: Record<string, any> = {};
        settings.registrationFields?.forEach((field: RegistrationField) => {
          initialRegistrationForm[field.fieldName] = "";
        });
        setUserForm(initialRegistrationForm);

        const initialTicketForm: Record<string, any> = {
          userEmail: "",
          userId: "",
          markAsResolved: false,
          needsEscalation: false,
          escalationReason: "",
          escalateTo: "",
        };
        settings.ticketFields?.forEach((field: TicketField) => {
          initialTicketForm[field.fieldName] =
            field.fieldType === "file" ? [] : "";
        });
        setTicketForm(initialTicketForm);
      }
    } catch (error) {
      console.error("Error fetching offline settings:", error);
    } finally {
      setSettingsLoading(false);
    }
  };

  const fetchTicketAgents = async () => {
    try {
      const token = localStorage.getItem("authToken");

      // --- Old APIs (no longer used) ---
      // Old v1: all users with AGENT role, no hierarchy
      // const agentResponse = await axios.get(
      //   `${API_CONFIG.API_URL}/users?projectId=${projectId}&roleCode=AGENT`,
      //   { headers: { Authorization: `Bearer ${token}` } }
      // );
      // Old v2: hierarchy-based (returns current user + reportees — wrong for escalation)
      // const agentResponse = await axios.get(
      //   `${API_CONFIG.API_URL}/tickets/assignable-agents`,
      //   { headers: { Authorization: `Bearer ${token}` }, params: { viewMode: 'single', projectId } }
      // );

      // --- New: Escalation-matrix-based logic ---
      // 1. Get current user's role to determine their level in the matrix
      const [matrixRes, userRes] = await Promise.all([
        axios.get(
          `${API_CONFIG.API_URL}/escalation-matrix?projectId=${projectId}&isActive=true`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        ),
        axios.get(`${API_CONFIG.API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const matrices = matrixRes.data.data || [];
      const currentUserRoleCode: string = userRes.data?.data?.role?.code || "";
      const currentUserRoleId: string =
        userRes.data?.data?.role?._id?.toString() || "";
      const currentUserCenters: any[] = userRes.data?.data?.centers || [];
      console.log(
        `🔍 [OfflineEscalation] userRole: ${currentUserRoleCode} (${currentUserRoleId}), centers: ${currentUserCenters.length}, matrices: ${matrices.length}`,
      );

      if (matrices.length === 0) {
        console.warn("⚠️ No active escalation matrix found for project");
        setAgents([]);
        return;
      }

      const matrix = matrices[0];
      const isSequential = matrix.escalationMode === "SEQUENTIAL";
      const sortedLevels = (matrix.levels || []).sort(
        (a: any, b: any) => a.levelNumber - b.levelNumber,
      );

      // 2. Find the logged-in user's level index dynamically.
      // Match by role code OR role _id (handles both populated and non-populated roleId).
      const currentLevelIndex = sortedLevels.findIndex((l: any) => {
        const roleCode = l.roleId?.code;
        const roleId = l.roleId?._id?.toString() || l.roleId?.toString();
        return (
          (roleCode && roleCode === currentUserRoleCode) ||
          (roleId && currentUserRoleId && roleId === currentUserRoleId)
        );
      });
      console.log(
        `🔍 [OfflineEscalation] levels: ${sortedLevels.map((l: any) => `${l.levelNumber}:${l.roleId?.code || l.roleId}`).join(", ")}`,
      );
      // Default to startIndex=1 if user's role not in matrix (e.g. they are level 1)
      const startIndex = currentLevelIndex >= 0 ? currentLevelIndex + 1 : 1;
      const endIndex = isSequential ? startIndex + 1 : sortedLevels.length;
      console.log(
        `📊 User at matrix level index ${currentLevelIndex}, fetching indices ${startIndex}–${endIndex - 1} (sequential: ${isSequential})`,
      );

      const contacts: Agent[] = [];

      for (
        let i = startIndex;
        i < Math.min(endIndex, sortedLevels.length);
        i++
      ) {
        const level = sortedLevels[i];
        if (!level.isActive) continue;

        try {
          const usersRes = await axios.get(
            `${API_CONFIG.API_URL}/escalation-matrix/${matrix._id}/levels/${level._id}/users?projectId=${projectId}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );

          let levelUsers = usersRes.data.data || [];
          console.log(
            `  Level ${level.levelNumber} (${level.levelName}): ${levelUsers.length} users`,
          );

          // Filter by shared center if current user has centers
          if (currentUserCenters.length > 0) {
            levelUsers = levelUsers.filter((user: any) => {
              const userCenters = user.centers || [];
              return currentUserCenters.some((cId: any) => {
                const cIdStr =
                  typeof cId === "string"
                    ? cId
                    : cId._id?.toString() || cId.toString();
                return userCenters.some(
                  (uC: any) =>
                    (typeof uC === "string"
                      ? uC
                      : uC._id?.toString() || uC.toString()) === cIdStr,
                );
              });
            });
            console.log(`    After center filter: ${levelUsers.length} users`);
          }

          levelUsers.forEach((user: any) => {
            contacts.push({
              _id: `${matrix._id}-L${level.levelNumber}-${user._id}`,
              name: `${user.firstName} ${user.lastName}`,
              email: user.email,
              role:
                user.role?.name ||
                level.levelName ||
                `Level ${level.levelNumber}`,
              priority: matrix.name || "",
              userId: user._id,
            });
          });
        } catch (levelError) {
          console.error(
            `Error fetching users for level ${level.levelNumber}:`,
            levelError,
          );
        }
      }

      console.log(`✅ Escalation contacts: ${contacts.length}`, contacts);
      setAgents(contacts);
    } catch (error) {
      console.error("Error fetching escalation agents:", error);
      setAgents([]);
    }
  };

  const fetchCategories = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await axios.get(
        `${API_CONFIG.API_URL}/categories/project/${projectId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (response.data.success) {
        setCategories(response.data.data);
      }
    } catch (error) {
      console.error("Error fetching categories:", error);
    }
  };

  const fetchCenters = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await axios.get(
        `${API_CONFIG.API_URL}/centers?projectId=${projectId}&isActive=true`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (response.data.success) {
        setCenters(response.data.data || []);
        console.log("📍 Loaded centers:", response.data.data);
      }
    } catch (error) {
      console.error("Error fetching centers:", error);
    }
  };

  const searchUser = async () => {
    if (!searchEmail.trim()) return;

    setSearchLoading(true);
    setUserSearched(false);
    setFoundUser(null);

    try {
      const token = localStorage.getItem("authToken");
      const response = await axios.get(
        `${API_CONFIG.API_URL}/users/search?email=${searchEmail}&projectId=${projectId}&studentOnly=true`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (response.data.success && response.data.data) {
        setFoundUser(response.data.data);
        // Populate form with found user data
        const updatedForm: Record<string, any> = {};
        offlineSettings?.registrationFields.forEach((field) => {
          const normalizedFieldName = field.fieldName
            .toLowerCase()
            .replace(/\s+/g, "");
          if (normalizedFieldName === "firstname") {
            updatedForm[field.fieldName] = response.data.data.firstName || "";
          } else if (normalizedFieldName === "lastname") {
            updatedForm[field.fieldName] = response.data.data.lastName || "";
          } else if (normalizedFieldName === "email") {
            updatedForm[field.fieldName] = response.data.data.email || "";
          } else if (
            normalizedFieldName === "phone" ||
            normalizedFieldName === "phonenumber"
          ) {
            updatedForm[field.fieldName] = response.data.data.phone || "";
          } else {
            updatedForm[field.fieldName] = "";
          }
        });
        setUserForm(updatedForm);
      } else {
        setFoundUser(null);
        const updatedForm: Record<string, any> = {};
        offlineSettings?.registrationFields.forEach((field) => {
          if (field.fieldName.toLowerCase().includes("email")) {
            updatedForm[field.fieldName] = searchEmail;
          } else {
            updatedForm[field.fieldName] = "";
          }
        });
        setUserForm(updatedForm);
      }
      setUserSearched(true);
    } catch (error) {
      console.error("Error searching user:", error);
      setFoundUser(null);
      setUserSearched(true);
    } finally {
      setSearchLoading(false);
    }
  };

  // OTP Functions
  const openOtpModal = (
    fieldId: string,
    fieldName: string,
    fieldType: "phone" | "email",
    value: string,
    formType: "registration" | "ticket",
  ) => {
    setOtpModal({
      isOpen: true,
      fieldId,
      fieldName,
      fieldType,
      value,
      formType,
    });
    setOtpValue("");
    setOtpSent(false);
    setOtpError("");
  };

  const closeOtpModal = () => {
    setOtpModal(null);
    setOtpValue("");
    setOtpKey("");
    setOtpSent(false);
    setOtpError("");
  };

  const handleSendOtp = async () => {
    if (!otpModal) return;

    setOtpSending(true);
    setOtpError("");

    try {
      const token = localStorage.getItem("authToken");
      const endpoint =
        otpModal.fieldType === "phone"
          ? `${API_CONFIG.API_URL}/otp/send-phone`
          : `${API_CONFIG.API_URL}/otp/send-email`;

      const payload =
        otpModal.fieldType === "phone"
          ? { phone: otpModal.value, projectId }
          : { email: otpModal.value, projectId };

      const response = await axios.post(endpoint, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.data.success && response.data.otpKey) {
        setOtpKey(response.data.otpKey);
        setOtpSent(true);
      } else {
        setOtpError(response.data.message || "Failed to send OTP");
      }
    } catch (error: any) {
      console.error("Error sending OTP:", error);
      setOtpError(
        error.response?.data?.message ||
          "Failed to send OTP. Please try again.",
      );
    } finally {
      setOtpSending(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpModal || !otpValue || !otpKey) return;

    setOtpVerifying(true);
    setOtpError("");

    try {
      const token = localStorage.getItem("authToken");

      const response = await axios.post(
        `${API_CONFIG.API_URL}/otp/verify`,
        {
          otpKey,
          otp: otpValue,
          type: otpModal.fieldType,
          value: otpModal.value,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (response.data.success && response.data.verified) {
        // Mark this field as verified
        setVerifiedFields((prev) => ({
          ...prev,
          [otpModal.fieldId]: true,
        }));
        closeOtpModal();
      } else {
        setOtpError(response.data.message || "Invalid OTP. Please try again.");
      }
    } catch (error: any) {
      console.error("Error verifying OTP:", error);
      setOtpError(
        error.response?.data?.message || "Invalid OTP. Please try again.",
      );
    } finally {
      setOtpVerifying(false);
    }
  };

  // Check if all required OTP verifications are complete
  const checkOtpVerificationsComplete = (
    formType: "registration" | "ticket",
  ): { complete: boolean; missingFields: string[] } => {
    const fields =
      formType === "registration"
        ? offlineSettings?.registrationFields || []
        : offlineSettings?.ticketFields || [];

    const missingFields: string[] = [];

    fields.forEach((field) => {
      if (
        field.requireOtpVerification &&
        (field.fieldType === "phone" || field.fieldType === "email")
      ) {
        const value =
          formType === "registration"
            ? userForm[field.fieldName]
            : ticketForm[field.fieldName];
        if (value && !verifiedFields[field.id]) {
          missingFields.push(field.fieldName);
        }
      }
    });

    return { complete: missingFields.length === 0, missingFields };
  };

  const handleRegisterUser = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields (reject space-only input)
    const requiredRegFields =
      offlineSettings?.registrationFields.filter((f) => f.required) || [];
    for (const field of requiredRegFields) {
      if (!userForm[field.fieldName]?.toString().trim()) {
        alert(`${field.fieldName} is required`);
        return;
      }
    }

    // Check OTP verifications before proceeding
    const otpCheck = checkOtpVerificationsComplete("registration");
    if (!otpCheck.complete) {
      alert(`Please verify OTP for: ${otpCheck.missingFields.join(", ")}`);
      return;
    }

    setRegistering(true);
    setRegisterSuccess(false);

    try {
      const token = localStorage.getItem("authToken");
      const response = await axios.post(
        `${API_CONFIG.API_URL}/users/register-student`,
        {
          ...userForm,
          projectId,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (response.data.success) {
        setRegisterSuccess(true);
        setFoundUser(response.data.data);
        setTimeout(() => {
          setRegisterSuccess(false);
          setSearchEmail("");
          const resetForm: Record<string, any> = {};
          offlineSettings?.registrationFields.forEach((field) => {
            resetForm[field.fieldName] = "";
          });
          setUserForm(resetForm);
          setFoundUser(null);
          setUserSearched(false);
        }, 3000);
      }
    } catch (error: any) {
      alert(error.response?.data?.message || "Failed to register user");
    } finally {
      setRegistering(false);
    }
  };

  const searchUserForTicket = async () => {
    if (!ticketForm.userEmail.trim()) return;

    try {
      const token = localStorage.getItem("authToken");
      const response = await axios.get(
        `${API_CONFIG.API_URL}/users/search?email=${ticketForm.userEmail}&projectId=${projectId}&studentOnly=true`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (response.data.success && response.data.data) {
        setSelectedUser(response.data.data);
        setTicketForm((prev) => ({
          ...prev,
          userId: response.data.data._id,
        }));
        setTicketUserSearched(true);

        // Fetch all tickets raised by this user in the project (duplicate check)
        setLoadingPriorTickets(true);
        setUserPriorTickets([]);
        try {
          const tRes = await axios.get(
            `${API_CONFIG.API_URL}/tickets/student-history?studentId=${response.data.data._id}&projectId=${projectId}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          setUserPriorTickets(tRes.data.data?.tickets || []);
        } catch (err) {
          console.error("Error fetching prior tickets:", err);
          setUserPriorTickets([]);
        } finally {
          setLoadingPriorTickets(false);
        }
      } else {
        alert("User not found. Please register them first.");
        setSelectedUser(null);
        setTicketForm((prev) => ({
          ...prev,
          userId: "",
        }));
        setTicketUserSearched(true);
      }
    } catch (error) {
      console.error("Error searching user:", error);
      alert("Error finding user. Please try again.");
      setSelectedUser(null);
      setTicketUserSearched(false);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedUser) {
      alert("Please search and select a user first");
      return;
    }

    if (!selectedCenter) {
      alert("Please select a center");
      return;
    }

    if (ticketForm.needsEscalation && !ticketForm.escalateTo) {
      alert("Please select an agent to escalate to");
      return;
    }

    // Check OTP verifications before proceeding
    const otpCheck = checkOtpVerificationsComplete("ticket");
    if (!otpCheck.complete) {
      alert(`Please verify OTP for: ${otpCheck.missingFields.join(", ")}`);
      return;
    }

    // Validate mandatory hierarchy levels (Category / Subcategory / Topic)
    if (hierarchyConfig && hierarchyConfig.levelCount > 1) {
      const offlineVisibleLevels = new Set(
        hierarchyConfig.visibilitySettings?.showInOfflineForm ?? [],
      );
      const missingLevels = hierarchyConfig.levels
        .filter(
          (l) =>
            l.isMandatory &&
            l.isActive &&
            (offlineVisibleLevels.size === 0 ||
              offlineVisibleLevels.has(l.levelNumber)),
        )
        .filter(
          (l) =>
            !categoryHierarchy[
              `level${l.levelNumber}` as keyof CategoryHierarchyValue
            ],
        );
      if (missingLevels.length > 0) {
        alert(
          `Please select: ${missingLevels.map((l) => l.displayName).join(", ")}`,
        );
        return;
      }
    }

    setCreatingTicket(true);
    setTicketSuccess(false);

    try {
      const token = localStorage.getItem("authToken");
      const formData = new FormData();

      // Add all configured ticket fields
      offlineSettings?.ticketFields.forEach((field) => {
        if (field.fieldType === "file" && ticketForm[field.fieldName]) {
          const files = ticketForm[field.fieldName] as File[];
          files.forEach((file) => formData.append(field.fieldName, file));
        } else if (ticketForm[field.fieldName]) {
          formData.append(field.fieldName, ticketForm[field.fieldName]);
        }
      });

      formData.append("userId", selectedUser._id);
      formData.append("studentId", selectedUser._id);
      formData.append("projectId", projectId);
      formData.append("centerId", selectedCenter);
      formData.append("submissionType", "offline");

      // Add hierarchical category data if configured
      if (
        hierarchyConfig &&
        hierarchyConfig.levelCount > 1 &&
        categoryHierarchy
      ) {
        formData.append("categoryHierarchy", JSON.stringify(categoryHierarchy));
        // Also set the primary category from level1 for backward compatibility
        if (categoryHierarchy.level1) {
          formData.append("category", categoryHierarchy.level1);
        }
      }

      if (ticketForm.markAsResolved) {
        formData.append("status", "resolved");
        formData.append("resolvedAtCreation", "true");
      }

      if (ticketForm.needsEscalation) {
        formData.append("escalateTo", ticketForm.escalateTo);
        formData.append("escalationReason", ticketForm.escalationReason);
      }

      const response = await axios.post(
        `${API_CONFIG.API_URL}/tickets/offline-submission`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "multipart/form-data",
          },
        },
      );

      if (response.data.success) {
        setTicketSuccess(true);
        setCreatedTicketNumber(response.data.data.ticketNumber);
        setTimeout(() => {
          setTicketSuccess(false);
          // Reset form
          const resetForm: Record<string, any> = {
            userEmail: "",
            userId: "",
            markAsResolved: false,
            needsEscalation: false,
            escalationReason: "",
            escalateTo: "",
          };
          offlineSettings?.ticketFields.forEach((field) => {
            resetForm[field.fieldName] = field.fieldType === "file" ? [] : "";
          });
          setTicketForm(resetForm);
          setSelectedUser(null);
          setTicketUserSearched(false);
          setCreatedTicketNumber("");
        }, 5000);
      }
    } catch (error: any) {
      alert(error.response?.data?.message || "Failed to create query");
    } finally {
      setCreatingTicket(false);
    }
  };

  const renderDynamicField = (
    field: RegistrationField | TicketField,
    value: any,
    onChange: (value: any) => void,
    formType: "registration" | "ticket",
  ) => {
    const isRequired = field.required;
    const placeholder = field.placeholder || field.fieldName;
    const needsOtpVerification =
      field.requireOtpVerification &&
      (field.fieldType === "phone" || field.fieldType === "email");
    const isVerified = verifiedFields[field.id] === true;

    switch (field.fieldType) {
      case "text":
      case "email":
      case "phone":
      case "number": {
        const isNameField = field.fieldName === "firstName" || field.fieldName === "lastName";
        return (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type={
                  field.fieldType === "email"
                    ? "email"
                    : field.fieldType === "phone"
                      ? "tel"
                      : field.fieldType === "number"
                        ? "number"
                        : "text"
                }
                required={isRequired}
                value={value || ""}
                onChange={(e) => {
                  let val = e.target.value;
                  if (isNameField) {
                    val = val.replace(/[0-9]/g, "").replace(/^\s+/, "");
                  } else if (field.fieldType === "text") {
                    val = val.replace(/^\s+/, "");
                  }
                  onChange(val);
                  // Reset verification if value changes
                  if (needsOtpVerification && isVerified) {
                    setVerifiedFields((prev) => ({
                      ...prev,
                      [field.id]: false,
                    }));
                  }
                }}
                className={`flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  needsOtpVerification && isVerified
                    ? "border-green-500 bg-green-50"
                    : "border-gray-300"
                }`}
                placeholder={placeholder}
                minLength={field.validation?.minLength}
                maxLength={field.validation?.maxLength}
                pattern={field.validation?.pattern}
              />
              {needsOtpVerification &&
                value &&
                (isVerified ? (
                  <span className="inline-flex items-center px-3 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-medium">
                    <CheckCircleIcon className="h-5 w-5 mr-1" />
                    Verified
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      openOtpModal(
                        field.id,
                        field.fieldName,
                        field.fieldType as "phone" | "email",
                        value,
                        formType,
                      )
                    }
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium whitespace-nowrap"
                  >
                    Send OTP
                  </button>
                ))}
            </div>
            {needsOtpVerification && !isVerified && value && (
              <p className="text-xs text-amber-600 flex items-center">
                <ExclamationCircleIcon className="h-4 w-4 mr-1" />
                OTP verification required
              </p>
            )}
          </div>
        );
      }

      case "textarea":
        return (
          <textarea
            required={isRequired}
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            rows={4}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder={placeholder}
            minLength={field.validation?.minLength}
            maxLength={field.validation?.maxLength}
          />
        );

      case "dropdown":
        return (
          <select
            required={isRequired}
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Select {field.fieldName}</option>
            {field.options?.map((option, idx) => (
              <option key={idx} value={option}>
                {option}
              </option>
            ))}
          </select>
        );

      case "date":
        return (
          <input
            type="date"
            required={isRequired}
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        );

      case "file":
        const ticketFieldFile = field as TicketField;
        return (
          <div>
            <input
              type="file"
              multiple={ticketFieldFile.allowMultiple}
              accept={ticketFieldFile.allowedFileTypes?.join(",")}
              onChange={(e) => {
                if (e.target.files) {
                  const filesArray = Array.from(e.target.files);
                  const maxFiles = ticketFieldFile.maxFiles || 5;
                  if (filesArray.length > maxFiles) {
                    alert(`Maximum ${maxFiles} files allowed`);
                    return;
                  }
                  onChange(filesArray);
                }
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {value && value.length > 0 && (
              <div className="mt-2 space-y-1">
                {value.map((file: File, idx: number) => (
                  <div
                    key={idx}
                    className="text-sm text-gray-600 flex items-center justify-between bg-gray-50 px-3 py-1 rounded"
                  >
                    <span>{file.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const newFiles = value.filter(
                          (_: any, i: number) => i !== idx,
                        );
                        onChange(newFiles);
                      }}
                      className="text-red-600 hover:text-red-800"
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      // Handle all hierarchy field types dynamically
      default:
        // Check if this is a hierarchy field type (handles hierarchy-level-1, hierarchy-level-2, etc.)
        const fieldTypeLower = field.fieldType?.toLowerCase() || "";
        const isHierarchyField =
          fieldTypeLower === "category" ||
          fieldTypeLower === "hierarchy" ||
          fieldTypeLower.startsWith("hierarchy-level-");

        if (isHierarchyField) {
          // For level 1 or single hierarchy field, render the HierarchyCategorySelector
          const isLevel1 =
            fieldTypeLower === "category" ||
            fieldTypeLower === "hierarchy" ||
            fieldTypeLower === "hierarchy-level-1";

          if (isLevel1) {
            // Use hierarchical category selector if multi-level hierarchy is configured
            if (hierarchyConfig && hierarchyConfig.levelCount > 1) {
              return (
                <HierarchyCategorySelector
                  projectId={projectId}
                  value={categoryHierarchy}
                  onChange={(newValue) => {
                    setCategoryHierarchy(newValue);
                    // Also update the ticketForm with hierarchy data for submission
                    onChange(newValue);
                  }}
                  mode="offline"
                  showValidation={false}
                />
              );
            }
            // Fall back to simple dropdown for single-level category
            return (
              <select
                required={isRequired}
                value={value || ""}
                onChange={(e) => onChange(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select category</option>
                {categories.map((category) => (
                  <option key={category._id} value={category._id}>
                    {category.name}
                  </option>
                ))}
              </select>
            );
          }

          // For levels 2, 3, 4, etc. - they are handled by HierarchyCategorySelector
          return null;
        }

        // Default text input for unknown field types
        return (
          <input
            type="text"
            required={isRequired}
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder={placeholder}
          />
        );
    }
  };

  if (settingsLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading offline module settings...</p>
        </div>
      </div>
    );
  }

  if (!offlineSettings) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <ExclamationCircleIcon className="h-12 w-12 text-yellow-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-yellow-900 mb-2">
            Offline Module Not Configured
          </h3>
          <p className="text-yellow-700">
            Please ask your administrator to configure the offline module
            settings first.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <ModuleHeader
        title="Offline Support Center"
        subtitle="Register users and create queries for walk-in support"
      />

      {/* Tab Navigation */}
      <div className="flex space-x-4 border-b border-gray-200 mb-8">
        <button
          onClick={() => setActiveTab("register")}
          className={`px-6 py-3 font-medium transition-colors border-b-2 ${
            activeTab === "register"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-600 hover:text-gray-900"
          }`}
        >
          <div className="flex items-center space-x-2">
            <UserPlusIcon className="h-5 w-5" />
            <span>Register User</span>
          </div>
        </button>
        <button
          onClick={() => setActiveTab("create-ticket")}
          className={`px-6 py-3 font-medium transition-colors border-b-2 ${
            activeTab === "create-ticket"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-600 hover:text-gray-900"
          }`}
        >
          <div className="flex items-center space-x-2">
            <TicketIcon className="h-5 w-5" />
            <span>Create Query</span>
          </div>
        </button>
      </div>

      {/* Register User Tab */}
      {activeTab === "register" && (
        <div className="bg-white rounded-xl shadow-md p-8">
          {registerSuccess && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start space-x-3">
              <CheckCircleIcon className="h-6 w-6 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-green-900">
                  User Registered Successfully!
                </h4>
                <p className="text-sm text-green-700 mt-1">
                  {foundUser?.firstName} {foundUser?.lastName} has been
                  registered and can now submit queries.
                </p>
              </div>
            </div>
          )}

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search User by Email
            </label>
            <div className="flex space-x-2">
              <input
                type="email"
                value={searchEmail}
                onChange={(e) => setSearchEmail(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && searchUser()}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="user@example.com"
              />
              <button
                onClick={searchUser}
                disabled={searchLoading}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {searchLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  </>
                ) : (
                  <>
                    <MagnifyingGlassIcon className="h-5 w-5" />
                    <span>Search</span>
                  </>
                )}
              </button>
            </div>
            {userSearched && (
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                {foundUser ? (
                  <div>
                    <p className="text-sm text-blue-900 flex items-center space-x-2">
                      <CheckCircleIcon className="h-5 w-5" />
                      <span>
                        User found:{" "}
                        <strong>
                          {foundUser.firstName} {foundUser.lastName}
                        </strong>
                      </span>
                    </p>
                    <p className="text-xs text-blue-700 mt-1">
                      This user is already registered in the system.
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-blue-900">
                    User not found. Complete the registration form below to
                    create a new user.
                  </p>
                )}
              </div>
            )}
          </div>

          <form onSubmit={handleRegisterUser} className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              {offlineSettings.registrationFields
                .sort((a, b) => (a.order || 0) - (b.order || 0))
                .map((field) => (
                  <div
                    key={field.id}
                    className={
                      field.fieldType === "textarea" ? "col-span-2" : ""
                    }
                  >
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {field.fieldName.charAt(0).toUpperCase() +
                        field.fieldName.slice(1)}
                      {field.required && (
                        <span className="text-red-500"> *</span>
                      )}
                    </label>
                    {renderDynamicField(
                      field,
                      userForm[field.fieldName],
                      (value) =>
                        setUserForm({ ...userForm, [field.fieldName]: value }),
                      "registration",
                    )}
                  </div>
                ))}
            </div>

            <div className="flex justify-end space-x-4">
              <button
                type="button"
                onClick={() => {
                  setSearchEmail("");
                  const resetForm: Record<string, any> = {};
                  offlineSettings.registrationFields.forEach((field) => {
                    resetForm[field.fieldName] = "";
                  });
                  setUserForm(resetForm);
                  setFoundUser(null);
                  setUserSearched(false);
                }}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Clear
              </button>
              <button
                type="submit"
                disabled={registering || foundUser !== null}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {registering ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>Registering...</span>
                  </>
                ) : (
                  <>
                    <UserPlusIcon className="h-5 w-5" />
                    <span>
                      {foundUser ? "Already Registered" : "Register User"}
                    </span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Create Ticket Tab */}
      {activeTab === "create-ticket" && (
        <div className="bg-white rounded-xl shadow-md p-8">
          {ticketSuccess && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start space-x-3">
              <CheckCircleIcon className="h-6 w-6 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-green-900">
                  Query Created Successfully!
                </h4>
                <p className="text-sm text-green-700 mt-1">
                  Query #{createdTicketNumber} has been created
                  {ticketForm.markAsResolved && " and marked as resolved"}
                  {ticketForm.needsEscalation && " and escalated"}.
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleCreateTicket} className="space-y-6">
            {/* User Search */}
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg mb-4">
              <p className="text-sm text-amber-900 mb-3">
                <span className="font-semibold">Important:</span> You must
                search for and select a user before creating a query.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  User Email <span className="text-red-500">*</span>
                </label>
                <div className="flex space-x-2">
                  <input
                    type="email"
                    required
                    value={ticketForm.userEmail}
                    onChange={(e) => {
                      setTicketForm({
                        ...ticketForm,
                        userEmail: e.target.value,
                      });
                      setTicketUserSearched(false);
                      setSelectedUser(null);
                      setUserPriorTickets([]);
                    }}
                    onKeyPress={(e) =>
                      e.key === "Enter" &&
                      (e.preventDefault(), searchUserForTicket())
                    }
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="user@example.com"
                  />
                  <button
                    type="button"
                    onClick={searchUserForTicket}
                    className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center space-x-2"
                  >
                    <MagnifyingGlassIcon className="h-5 w-5" />
                    <span>Find</span>
                  </button>
                </div>
              </div>
              {ticketUserSearched && (
                <div className="mt-3">
                  {selectedUser ? (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                      <p className="text-sm text-green-900 flex items-center space-x-2">
                        <CheckCircleIcon className="h-5 w-5" />
                        <span>
                          User:{" "}
                          <strong>
                            {selectedUser.firstName} {selectedUser.lastName}
                          </strong>{" "}
                          ({selectedUser.email})
                        </span>
                      </p>
                    </div>
                  ) : (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm text-red-900 flex items-center space-x-2">
                        <ExclamationCircleIcon className="h-5 w-5" />
                        <span>User not found. Please register them first.</span>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Prior Tickets Panel — shows all queries raised by this user in the project */}
            {selectedUser && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <TicketIcon className="h-4 w-4 text-gray-500" />
                    Previously Raised Queries by This User
                  </span>
                  {loadingPriorTickets ? (
                    <span className="text-xs text-gray-500">Loading…</span>
                  ) : (
                    <span className="text-xs text-gray-500">
                      {userPriorTickets.length} ticket(s) found
                    </span>
                  )}
                </div>
                {loadingPriorTickets ? (
                  <div className="px-4 py-3 text-sm text-gray-500 text-center">
                    Fetching prior queries…
                  </div>
                ) : userPriorTickets.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-gray-500 text-center">
                    No prior queries found for this user in this project.
                  </div>
                ) : (
                  <>
                    {userPriorTickets.some(
                      (t) => t.status === 1 || t.status === 2 || t.status === 3,
                    ) && (
                      <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
                        <ExclamationCircleIcon className="h-4 w-4 text-amber-600 flex-shrink-0" />
                        <span className="text-xs font-medium text-amber-800">
                          {
                            userPriorTickets.filter(
                              (t) =>
                                t.status === 1 ||
                                t.status === 2 ||
                                t.status === 3,
                            ).length
                          }{" "}
                          open / in-progress ticket(s) already exist. Review
                          before creating a new one.
                        </span>
                      </div>
                    )}
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50 text-left text-gray-600 uppercase tracking-wide">
                            <th className="px-3 py-2 font-semibold whitespace-nowrap w-32">
                              Ticket #
                            </th>
                            <th className="px-3 py-2 font-semibold w-52">Subject</th>
                            <th className="px-3 py-2 font-semibold w-64">
                              Category
                            </th>
                            <th className="px-3 py-2 font-semibold whitespace-nowrap w-36">
                              Center
                            </th>
                            <th className="px-3 py-2 font-semibold whitespace-nowrap w-28">
                              Assigned To
                            </th>
                            <th className="px-3 py-2 font-semibold w-20">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {userPriorTickets.map((t) => {
                            const statusMap: Record<
                              number,
                              { label: string; className: string }
                            > = {
                              1: {
                                label: "Open",
                                className: "bg-blue-100 text-blue-800",
                              },
                              2: {
                                label: "In Progress",
                                className: "bg-yellow-100 text-yellow-800",
                              },
                              3: {
                                label: "On Hold",
                                className: "bg-orange-100 text-orange-800",
                              },
                              4: {
                                label: "Resolved",
                                className: "bg-green-100 text-green-800",
                              },
                              5: {
                                label: "Closed",
                                className: "bg-gray-100 text-gray-700",
                              },
                            };
                            const st = statusMap[t.status] || {
                              label: "Unknown",
                              className: "bg-gray-100 text-gray-700",
                            };
                            const centerDisplay = t.metadata?.centerId
                              ? typeof t.metadata.centerId === "object"
                                ? t.metadata.centerId.centerName
                                : t.metadata.centerId === "online"
                                  ? "Online"
                                  : t.metadata.centerId
                              : "—";
                            const assignedDisplay = t.assignedTo
                              ? `${t.assignedTo.firstName} ${t.assignedTo.lastName}`
                              : "Unassigned";
                            const categoryDisplay =
                              t.categoryHierarchy?.displayPath ||
                              t.category?.name ||
                              "—";
                            return (
                              <tr key={t._id} className="hover:bg-gray-50">
                                <td className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap w-32">
                                  {t.ticketNumber}
                                </td>
                                <td className="px-3 py-2 text-gray-800 w-52">
                                  {t.subject}
                                </td>
                                <td className="px-3 py-2 text-gray-600 w-64">
                                  {categoryDisplay}
                                </td>
                                <td className="px-3 py-2 text-gray-600 whitespace-nowrap w-36">
                                  {centerDisplay}
                                </td>
                                <td className="px-3 py-2 text-gray-600 whitespace-nowrap w-28">
                                  {assignedDisplay}
                                </td>
                                <td className="px-3 py-2 w-20">
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${st.className}`}
                                  >
                                    {st.label}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Center Selection */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Center <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={selectedCenter}
                onChange={(e) => setSelectedCenter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">-- Select Support Center --</option>
                {centers.map((center) => (
                  <option key={center._id} value={center._id}>
                    {center.centerName} - {center.city}, {center.state}
                  </option>
                ))}
              </select>
              {centers.length === 0 && (
                <p className="text-sm text-amber-600 mt-2">
                  No centers configured. Please add centers in project settings.
                </p>
              )}

              {/* Selected Center Details */}
              {selectedCenter &&
                centers.find((c) => c._id === selectedCenter) && (
                  <div className="mt-3 p-3 bg-white rounded-lg border border-blue-300 space-y-2">
                    {(() => {
                      const center = centers.find(
                        (c) => c._id === selectedCenter,
                      );
                      return (
                        <>
                          <h4 className="font-medium text-gray-900">
                            {center?.centerName}
                          </h4>
                          <div className="text-sm text-gray-600 space-y-1">
                            <p>📍 {center?.address}</p>
                            <p>
                              {center?.city}, {center?.state} {center?.pincode}
                            </p>
                            {center?.phone && <p>📞 {center.phone}</p>}
                            {center?.email && <p>✉️ {center.email}</p>}
                            {center?.workingHours && (
                              <p>🕒 {center.workingHours}</p>
                            )}
                            {(center?.googleMapLink || center?.mapLink) && (
                              <a
                                href={center.googleMapLink || center.mapLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium"
                              >
                                🗺️ View on Google Maps
                                <svg
                                  className="w-4 h-4"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                  />
                                </svg>
                              </a>
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
            </div>

            {/* Dynamic Ticket Fields */}
            <div className="space-y-6">
              {offlineSettings?.ticketFields
                ?.filter((field) => {
                  // Hide disabled fixed fields
                  if (field.isFixed && field.isEnabled === false) return false;

                  // Skip hierarchy level 2+ fields dynamically as they are handled by HierarchyCategorySelector
                  const fieldType = field.fieldType?.toLowerCase() || "";
                  if (fieldType.startsWith("hierarchy-level-")) {
                    const levelMatch = fieldType.match(/hierarchy-level-(\d+)/);
                    if (levelMatch) {
                      const level = parseInt(levelMatch[1], 10);
                      // Skip levels 2 and above - they are rendered by HierarchyCategorySelector
                      if (level > 1) return false;
                    }
                  }

                  return true;
                })
                .sort((a, b) => (a.order || 0) - (b.order || 0))
                .map((field) => (
                  <div key={field.id}>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {field.fieldName.charAt(0).toUpperCase() +
                        field.fieldName.slice(1).replace(/([A-Z])/g, " $1")}
                      {field.required && (
                        <span className="text-red-500"> *</span>
                      )}
                    </label>
                    {renderDynamicField(
                      field,
                      ticketForm[field.fieldName],
                      (value) =>
                        setTicketForm({
                          ...ticketForm,
                          [field.fieldName]: value,
                        }),
                      "ticket",
                    )}
                  </div>
                ))}
            </div>

            {/* Options */}
            <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
              <div className="flex items-start space-x-3">
                <input
                  type="checkbox"
                  id="markResolved"
                  checked={ticketForm.markAsResolved}
                  onChange={(e) =>
                    setTicketForm({
                      ...ticketForm,
                      markAsResolved: e.target.checked,
                    })
                  }
                  className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="markResolved" className="text-sm">
                  <span className="font-medium text-gray-900">
                    Mark as Resolved
                  </span>
                  <p className="text-gray-600 text-xs mt-1">
                    Check this if you resolved the issue during walk-in support
                  </p>
                </label>
              </div>

              <div className="flex items-start space-x-3">
                <input
                  type="checkbox"
                  id="needsEscalation"
                  checked={ticketForm.needsEscalation}
                  onChange={(e) =>
                    setTicketForm({
                      ...ticketForm,
                      needsEscalation: e.target.checked,
                    })
                  }
                  className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="needsEscalation" className="text-sm flex-1">
                  <span className="font-medium text-gray-900">
                    Escalate Query
                  </span>
                  <p className="text-gray-600 text-xs mt-1">
                    Escalate to another agent for specialized support
                  </p>
                </label>
              </div>

              {ticketForm.needsEscalation && (
                <div className="ml-7 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Escalate To <span className="text-red-500">*</span>
                    </label>
                    <select
                      required={ticketForm.needsEscalation}
                      value={ticketForm.escalateTo}
                      onChange={(e) =>
                        setTicketForm({
                          ...ticketForm,
                          escalateTo: e.target.value,
                        })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">
                        Select contact ({agents.length} available)
                      </option>
                      {agents.map((agent) => (
                        <option key={agent._id} value={agent.userId}>
                          {agent.name} ({agent.role})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Escalation Reason <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      required={ticketForm.needsEscalation}
                      rows={3}
                      value={ticketForm.escalationReason}
                      onChange={(e) =>
                        setTicketForm({
                          ...ticketForm,
                          escalationReason: e.target.value,
                        })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Reason for escalation..."
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-4 pt-4 border-t">
              <button
                type="button"
                onClick={() => {
                  const resetForm: Record<string, any> = {
                    userEmail: "",
                    userId: "",
                    markAsResolved: false,
                    needsEscalation: false,
                    escalationReason: "",
                    escalateTo: "",
                  };
                  offlineSettings?.ticketFields.forEach((field) => {
                    resetForm[field.fieldName] =
                      field.fieldType === "file" ? [] : "";
                  });
                  setTicketForm(resetForm);
                  setSelectedUser(null);
                  setTicketUserSearched(false);
                }}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Clear Form
              </button>
              <button
                type="submit"
                disabled={creatingTicket || !selectedUser}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {creatingTicket ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>Creating...</span>
                  </>
                ) : selectedUser ? (
                  <>
                    <TicketIcon className="h-5 w-5" />
                    <span>Create Query</span>
                  </>
                ) : (
                  <>
                    <ExclamationCircleIcon className="h-5 w-5" />
                    <span>Select User First</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* OTP Verification Modal */}
      {otpModal && otpModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Verify{" "}
                {otpModal.fieldType === "phone"
                  ? "Phone Number"
                  : "Email Address"}
              </h3>
              <button
                onClick={closeOtpModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-600">
                {otpSent
                  ? `OTP has been sent to ${otpModal.value}. Please enter the 6-digit code below.`
                  : `Click "Send OTP" to receive a verification code at ${otpModal.value}`}
              </p>
            </div>

            {otpError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-600">{otpError}</p>
              </div>
            )}

            {!otpSent ? (
              <button
                onClick={handleSendOtp}
                disabled={otpSending}
                className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-md font-medium flex items-center justify-center gap-2"
              >
                {otpSending ? (
                  <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <span>Sending...</span>
                  </>
                ) : (
                  <span>Send OTP</span>
                )}
              </button>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Enter OTP
                  </label>
                  <input
                    type="text"
                    value={otpValue}
                    onChange={(e) => {
                      const value = e.target.value
                        .replace(/\D/g, "")
                        .slice(0, 6);
                      setOtpValue(value);
                    }}
                    placeholder="Enter 6-digit OTP"
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center text-lg tracking-widest"
                    maxLength={6}
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleSendOtp}
                    disabled={otpSending}
                    className="flex-1 py-2 px-4 border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:bg-gray-100 rounded-md font-medium"
                  >
                    Resend OTP
                  </button>
                  <button
                    onClick={handleVerifyOtp}
                    disabled={otpVerifying || otpValue.length !== 6}
                    className="flex-1 py-2 px-4 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-md font-medium flex items-center justify-center gap-2"
                  >
                    {otpVerifying ? (
                      <>
                        <svg
                          className="animate-spin h-5 w-5"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="none"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        <span>Verifying...</span>
                      </>
                    ) : (
                      <span>Verify OTP</span>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentOfflineModule;
