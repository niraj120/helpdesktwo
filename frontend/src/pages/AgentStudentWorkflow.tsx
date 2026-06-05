import React, { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { API_CONFIG } from "../config/constants";
import { useBranding } from "../contexts/BrandingContext";
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
  ChevronRightIcon,
  UserIcon,
} from "@heroicons/react/24/outline";

interface Student {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  uniqueId?: string;
}

interface EscalationContact {
  _id: string;
  name: string;
  email: string;
  role: string;
  priority: string;
  userId?: string;
}

interface Category {
  _id: string;
  name: string;
  description?: string;
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

interface Center {
  _id: string;
  centerName: string;
  address?: string;
  city?: string;
  state?: string;
  isActive?: boolean;
}

type WorkflowStep = "search" | "register" | "ticket";

// localStorage key for persisting the in-progress registration form
const REG_DRAFT_KEY = "sac_offline_reg_draft";
// sessionStorage key for center selection (persists across page refreshes within the session)
const CENTER_SESSION_KEY = "sac_offline_selected_center";

// ── Searchable center picker ──────────────────────────────────────────────────
const CenterPickerScreen: React.FC<{
  centers: Center[];
  onSelect: (c: Center) => void;
}> = ({ centers, onSelect }) => {
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const filtered = query.trim()
    ? centers.filter(
        (c) =>
          c.centerName.toLowerCase().includes(query.toLowerCase()) ||
          (c.city || "").toLowerCase().includes(query.toLowerCase()) ||
          (c.state || "").toLowerCase().includes(query.toLowerCase()) ||
          (c.address || "").toLowerCase().includes(query.toLowerCase()),
      )
    : centers;

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0 && filtered[activeIndex]) {
      onSelect(filtered[activeIndex]);
    }
  };

  React.useEffect(() => {
    setActiveIndex(-1);
  }, [query]);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Candidate Management Workflow
        </h1>
        <p className="text-gray-600 mt-2">
          Please select the center you are operating from to continue.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-md p-8">
        <h2 className="text-xl font-bold text-gray-900 mb-1">
          Select Your Center
        </h2>
        <p className="text-gray-500 text-sm mb-6">
          You are assigned to {centers.length} centers. Search by name, city, or
          address and select the one where you are currently located.
        </p>

        {/* Search input */}
        <div className="relative mb-2">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Search by center name, city, or address…"
            className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          )}
        </div>

        {/* Result count */}
        {query && (
          <p className="text-xs text-gray-400 mb-3">
            {filtered.length} result{filtered.length !== 1 ? "s" : ""} for "
            {query}"
          </p>
        )}

        {/* List */}
        <div className="border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100 max-h-80 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500 text-sm">
              No centers match your search.
            </div>
          ) : (
            filtered.map((center, idx) => (
              <button
                key={center._id}
                onClick={() => onSelect(center)}
                onMouseEnter={() => setActiveIndex(idx)}
                className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${
                  activeIndex === idx ? "bg-blue-50" : "hover:bg-gray-50"
                }`}
              >
                <svg
                  className="h-4 w-4 text-blue-500 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {center.centerName}
                  </p>
                  {(center.city || center.state) && (
                    <p className="text-xs text-gray-500 truncate">
                      {[center.city, center.state].filter(Boolean).join(", ")}
                    </p>
                  )}
                </div>
                <svg
                  className="h-4 w-4 text-gray-300 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
// ─────────────────────────────────────────────────────────────────────────────

const AgentStudentWorkflow: React.FC = () => {
  // Get customUrlPath from URL
  const { customUrlPath } = useParams<{ customUrlPath: string }>();

  // Use branding context (already fetched by BrandingProvider at /:customUrlPath/portal/*)
  const { branding, loading: projectLoading } = useBranding();
  const projectId = branding?.projectId || "";

  // Workflow state
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>("search");
  const [hasSavedDraft, setHasSavedDraft] = useState(false);
  const [currentStudent, setCurrentStudent] = useState<Student | null>(null);
  const [newlyRegisteredStudentId, setNewlyRegisteredStudentId] = useState<
    string | null
  >(null);

  // Offline Module Settings
  const [offlineSettings, setOfflineSettings] =
    useState<OfflineSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);

  // Step 1: Student Search States
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState<
    "name" | "email" | "phone" | "all"
  >("all");
  const [searchResults, setSearchResults] = useState<Student[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");

  // Step 2: Registration States
  const [registrationForm, setRegistrationForm] = useState<Record<string, any>>(
    {},
  );
  const [registering, setRegistering] = useState(false);
  const [registrationError, setRegistrationError] = useState("");

  // Step 3: Ticket States
  const [ticketForm, setTicketForm] = useState<Record<string, any>>({
    markAsResolved: false,
    needsEscalation: false,
    escalationReason: "",
    escalateTo: "",
  });
  const [agents, setAgents] = useState<EscalationContact[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [userPriorTickets, setUserPriorTickets] = useState<any[]>([]);
  const [loadingPriorTickets, setLoadingPriorTickets] = useState(false);
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [ticketMessage, setTicketMessage] = useState("");
  const [validationPopup, setValidationPopup] = useState<{
    isOpen: boolean;
    errors: string[];
  }>({ isOpen: false, errors: [] });
  const [categoryHierarchy, setCategoryHierarchy] =
    useState<CategoryHierarchyValue>({});

  // Fetch hierarchy config to determine if multi-level categories are enabled
  const { config: hierarchyConfig } = useHierarchyConfig(projectId);

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
  const [otpKey, setOtpKey] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [verifiedFields, setVerifiedFields] = useState<Record<string, boolean>>(
    {},
  );
  // Inline per-field validation errors (keyed by field.id)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Center selection states
  const [selectedCenter, setSelectedCenter] = useState<Center | null>(null);
  const [mappedCenters, setMappedCenters] = useState<Center[]>([]);
  const [centersLoading, setCentersLoading] = useState(false);

  /** Requires at least one dot in the domain part with 2+ chars after it. */
  const validateEmail = (email: string): string => {
    if (!email) return "";
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
    return valid
      ? ""
      : "Please enter a valid email address (e.g. name@domain.com)";
  };

  // Ticket creation success popup
  const [ticketSuccessModal, setTicketSuccessModal] = useState<{
    ticketNumber: string;
    studentName: string;
  } | null>(null);

  // File upload toast notification
  const [fileUploadToast, setFileUploadToast] = useState<{
    names: string[];
    visible: boolean;
  } | null>(null);
  const fileToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFileUploadToast = (files: File[]) => {
    if (fileToastTimerRef.current) clearTimeout(fileToastTimerRef.current);
    setFileUploadToast({ names: files.map((f) => f.name), visible: true });
    fileToastTimerRef.current = setTimeout(() => {
      setFileUploadToast(null);
    }, 4000);
  };

  // Duplicate-user warning state (set when email/phone already exists in system)
  const [duplicateUserWarning, setDuplicateUserWarning] = useState<{
    type: "email" | "phone";
    fieldName: string;
    existingUser: {
      _id: string;
      firstName: string;
      lastName: string;
      email: string;
      phone?: string;
      roleCode?: string;
    };
  } | null>(null);

  // Load settings on mount
  useEffect(() => {
    if (projectId) {
      fetchOfflineSettings();
      fetchCenterData();
    }
  }, [projectId]);

  // Restore registration draft saved by previous session (network loss / window close)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(REG_DRAFT_KEY);
      if (raw) {
        const { form, verified } = JSON.parse(raw);
        if (form && Object.keys(form).length > 0) {
          setRegistrationForm(form);
          setVerifiedFields(verified || {});
          setHasSavedDraft(true); // show resume banner, do NOT auto-redirect
        }
      }
    } catch {
      // ignore corrupt draft
    }
  }, []); // run once on mount

  // Persist registration form to localStorage while on the register step
  useEffect(() => {
    if (workflowStep === "register") {
      localStorage.setItem(
        REG_DRAFT_KEY,
        JSON.stringify({ form: registrationForm, verified: verifiedFields }),
      );
    }
  }, [registrationForm, verifiedFields, workflowStep]);

  // Fetch agents and categories when moving to ticket step
  useEffect(() => {
    if (workflowStep === "ticket") {
      fetchTicketAgents();
      fetchCategories();
    }
  }, [workflowStep]);

  const fetchOfflineSettings = async () => {
    try {
      if (!projectId) {
        console.error("No projectId provided");
        setSettingsLoading(false);
        return;
      }

      const token = localStorage.getItem("authToken");

      const response = await axios.get(
        `${API_CONFIG.API_URL}/projects/${projectId}/offline-settings`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (response.data.success) {
        let settings = response.data.data;

        // Remove duplicate Category fields - keep only the first one
        if (settings.ticketFields) {
          const seenCategories = new Set();
          settings.ticketFields = settings.ticketFields.filter((field: any) => {
            if (field.fieldName === "Category") {
              if (seenCategories.has("Category")) {
                console.log("Removing duplicate Category field:", field.id);
                return false; // Remove duplicate
              }
              seenCategories.add("Category");
            }
            return true;
          });
        }

        setOfflineSettings(settings);

        // Initialize registration form with empty defaults
        const initialRegForm: Record<string, any> = {};
        settings.registrationFields?.forEach((field: RegistrationField) => {
          initialRegForm[field.fieldName] = "";
        });

        // Preserve any saved draft — draft restoration useEffect runs before
        // this async fetch resolves, but the async API response overwrites state.
        // Re-merge draft values so the "Resume" flow isn't wiped out.
        try {
          const raw = localStorage.getItem(REG_DRAFT_KEY);
          if (raw) {
            const { form: draft } = JSON.parse(raw);
            if (draft && Object.keys(draft).length > 0) {
              Object.assign(initialRegForm, draft);
            }
          }
        } catch {
          /* ignore corrupt draft */
        }

        setRegistrationForm(initialRegForm);

        // Initialize ticket form
        const initialTicketForm: Record<string, any> = {
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
    } catch (error: any) {
      console.error("Error fetching offline settings:", error);
      console.error("Error details:", error.response?.data || error.message);
      // Show error message to user
      alert(
        `Failed to load offline module settings: ${error.response?.data?.message || error.message}`,
      );
    } finally {
      setSettingsLoading(false);
    }
  };

  const fetchCenterData = async () => {
    setCentersLoading(true);
    try {
      const token = localStorage.getItem("authToken");

      const [meRes, centersRes] = await Promise.all([
        axios.get(`${API_CONFIG.API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(
          `${API_CONFIG.API_URL}/centers?projectId=${projectId}&isActive=true`,
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      ]);

      const allProjectCenters: Center[] = centersRes.data.data || [];
      if (allProjectCenters.length === 0) {
        setMappedCenters([]);
        return;
      }

      const userCenterRefs: any[] = meRes.data?.data?.centers || [];
      const userCenterIds = new Set(
        userCenterRefs.map((c: any) =>
          typeof c === "string" ? c : c._id?.toString() || c.toString(),
        ),
      );

      // Intersect user's assigned centers with project centers
      let accessible: Center[] =
        userCenterIds.size > 0
          ? allProjectCenters.filter((c) => userCenterIds.has(c._id.toString()))
          : allProjectCenters;

      // If no intersection, fall back to all project centers
      if (accessible.length === 0) accessible = allProjectCenters;
      setMappedCenters(accessible);

      // Restore from sessionStorage if still valid
      try {
        const stored = sessionStorage.getItem(CENTER_SESSION_KEY);
        if (stored) {
          const storedCenter: Center = JSON.parse(stored);
          const found = accessible.find((c) => c._id === storedCenter._id);
          if (found) {
            setSelectedCenter(found);
            return;
          }
        }
      } catch {
        /* ignore corrupt session */
      }

      // Auto-select if only one accessible center
      if (accessible.length === 1) {
        setSelectedCenter(accessible[0]);
        try {
          sessionStorage.setItem(
            CENTER_SESSION_KEY,
            JSON.stringify(accessible[0]),
          );
        } catch {
          /* ignore */
        }
      }
      // If 2+ centers: selectedCenter stays null → center picker will show
    } catch (error) {
      console.error("Error fetching center data:", error);
      setMappedCenters([]);
    } finally {
      setCentersLoading(false);
    }
  };

  const fetchTicketAgents = async () => {
    try {
      const token = localStorage.getItem("authToken");
      console.log("🔍 Fetching escalation options for project:", projectId);

      // First, try to get escalation matrix for the project
      const matrixRes = await axios.get(
        `${API_CONFIG.API_URL}/escalation-matrix?projectId=${projectId}&isActive=true`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      const matrices = matrixRes.data.data || [];
      console.log(
        `📊 Found ${matrices.length} escalation matrices for project`,
      );

      // Get current user's role + centers for dynamic level detection
      const userRes = await axios.get(`${API_CONFIG.API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // Response structure is { success: true, data: { role: { code, _id }, centers: [...] } }
      const currentUserCenters: any[] = userRes.data?.data?.centers || [];
      const currentUserRoleCode: string = userRes.data?.data?.role?.code || "";
      const currentUserRoleId: string =
        userRes.data?.data?.role?._id?.toString() || "";
      console.log(
        `🏢 Current user centers: ${currentUserCenters.length}, role: ${currentUserRoleCode} (${currentUserRoleId})`,
      );

      if (matrices.length > 0) {
        // Use escalation matrix levels for sequential escalation
        const matrix = matrices[0]; // Use first active matrix
        console.log(
          `📋 Using escalation matrix: ${matrix.name} (${matrix.escalationMode})`,
        );

        const contacts: EscalationContact[] = [];
        const isSequential = matrix.escalationMode === "SEQUENTIAL";

        const sortedLevels = (matrix.levels || []).sort(
          (a: any, b: any) => a.levelNumber - b.levelNumber,
        );

        // Dynamically detect the logged-in user's level in the matrix.
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
          `🔍 [Escalation] levels: ${sortedLevels.map((l: any) => `L${l.levelNumber}:${l.roleId?.code || l.roleId}`).join(", ")}`,
        );
        // If user's role is not found in matrix, default to 0 (show from level 2 onward).
        // This handles L1 users who may not need level detection.
        const startIndex = currentLevelIndex >= 0 ? currentLevelIndex + 1 : 1;
        const endIndex = isSequential ? startIndex + 1 : sortedLevels.length;

        console.log(
          `📊 User at matrix level index ${currentLevelIndex} (${currentUserRoleCode}), fetching indices ${startIndex}–${endIndex - 1} of ${sortedLevels.length} (sequential: ${isSequential})`,
        );

        for (
          let i = startIndex;
          i < Math.min(endIndex, sortedLevels.length);
          i++
        ) {
          const level = sortedLevels[i];
          if (!level.isActive) continue;

          try {
            // Fetch users for this level with center filtering
            const usersRes = await axios.get(
              `${API_CONFIG.API_URL}/escalation-matrix/${matrix._id}/levels/${level._id}/users?projectId=${projectId}`,
              { headers: { Authorization: `Bearer ${token}` } },
            );

            let levelUsers = usersRes.data.data || [];
            console.log(
              `  Level ${level.levelNumber} (${level.levelName}): ${levelUsers.length} users total`,
            );

            // Filter by center if current user has centers assigned (for offline projects)
            if (currentUserCenters.length > 0) {
              levelUsers = levelUsers.filter((user: any) => {
                // Check if user shares any center with current user
                // Handle both string IDs and object references for centers
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
              console.log(
                `    After center filter: ${levelUsers.length} users`,
              );
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

        console.log(
          `✅ Total escalation contacts from matrix: ${contacts.length}`,
          contacts,
        );
        setAgents(contacts);
        return;
      }

      // Fallback to escalation policies if no matrix found
      console.log(
        "📋 No escalation matrix found, falling back to escalation policies",
      );
      const escalationContactsRes = await axios.get(
        `${API_CONFIG.API_URL}/escalation-policies?projectId=${projectId}&isActive=true`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      console.log(
        "📋 Escalation policies response:",
        escalationContactsRes.data,
      );

      // Transform escalation policies into contact format for the dropdown
      const policies = escalationContactsRes.data.data || [];

      console.log(
        `📊 Found ${policies.length} active policies for this project`,
      );

      const contacts = policies.flatMap((policy: any) => {
        console.log(
          `📌 Processing policy: ${policy.name}, levels: ${policy.levels?.length}`,
        );

        return (policy.levels || []).flatMap((level: any) => {
          console.log(
            `  Level ${level.level}: ${level.users?.length} users, escalateTo:`,
            level.escalateTo,
          );

          // If level has users array, create a contact for each user
          if (level.users && level.users.length > 0) {
            return level.users.map((user: any) => ({
              _id: `${policy._id}-L${level.level}-${user._id}`,
              name: `${user.firstName} ${user.lastName}`,
              email: user.email,
              role: user.role?.name || level.escalateTo?.targetName || "N/A",
              priority: policy.name || "",
              userId: user._id,
            }));
          } else {
            // Fallback to old format if no users found
            return [
              {
                _id: `${policy._id}-L${level.level}`,
                name: level.escalateTo?.targetName || `Level ${level.level}`,
                email: level.escalateTo?.targetId || "",
                role: level.escalateTo?.type || "role",
                priority: policy.name || "",
              },
            ];
          }
        });
      });

      console.log(`✅ Total contacts extracted: ${contacts.length}`, contacts);
      setAgents(contacts);
    } catch (error) {
      console.error("❌ Error fetching escalation agents:", error);
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

  // STEP 1: Search Student
  const handleSearchStudent = async () => {
    if (!searchQuery.trim()) {
      setSearchMessage("Please enter a search query");
      return;
    }
    if (searchType === "email" && !searchQuery.includes("@")) {
      setSearchMessage("Please enter a valid email address containing '@'");
      return;
    }
    if (searchType === "phone" && !/^[0-9]+$/.test(searchQuery.trim())) {
      setSearchMessage("Please enter a valid phone number (digits only)");
      return;
    }

    setSearching(true);
    setSearchMessage("");
    setSearchResults([]);
    setUserPriorTickets([]);

    try {
      const token = localStorage.getItem("authToken");
      const response = await axios.get(
        `${API_CONFIG.API_URL}/users/search-students?query=${encodeURIComponent(
          searchQuery,
        )}&projectId=${projectId}&searchType=${searchType}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (response.data.success) {
        if (response.data.data && response.data.data.length > 0) {
          setSearchResults(response.data.data);
          setSearchMessage(`Found ${response.data.count} candidate(s)`);
        } else {
          setSearchMessage(
            "No candidates found. Please register a new candidate.",
          );
          setSearchResults([]);
        }
      }
    } catch (error) {
      console.error("Error searching candidates:", error);
      setSearchMessage("Error searching candidates. Please try again.");
    } finally {
      setSearching(false);
    }
  };

  // Fetch all tickets raised by a student in this project (for duplicate check)
  const fetchPriorTickets = async (studentId: string) => {
    setLoadingPriorTickets(true);
    setUserPriorTickets([]);
    try {
      const token = localStorage.getItem("authToken");
      const tRes = await axios.get(
        `${API_CONFIG.API_URL}/tickets/student-history?studentId=${studentId}&projectId=${projectId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setUserPriorTickets(tRes.data.data?.tickets || []);
    } catch (err) {
      console.error("Error fetching prior tickets:", err);
      setUserPriorTickets([]);
    } finally {
      setLoadingPriorTickets(false);
    }
  };

  // Select student from search results
  const selectStudent = (student: Student) => {
    setCurrentStudent(student);
    setWorkflowStep("ticket");
    // Auto-populate ticket form with student ID
    setTicketForm((prev) => ({
      ...prev,
      studentId: student._id,
    }));
    fetchPriorTickets(student._id);
  };

  // STEP 2: Register New Student
  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Skip registration and proceed to ticket creation using an already-existing user. */
  const useExistingUserForTicket = (user: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    roleCode?: string;
  }) => {
    // Block non-student users — offline portal is for students only
    if (user.roleCode && user.roleCode !== "STUDENT") {
      setRegistrationError(
        "This user is not registered as a student and cannot be used for ticket creation in this portal.",
      );
      setDuplicateUserWarning(null);
      return;
    }
    setCurrentStudent({
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
    });
    setTicketForm((prev) => ({ ...prev, studentId: user._id }));
    setDuplicateUserWarning(null);
    closeOtpModal();
    // Clear draft — user is moving past registration
    clearRegDraft();
    setRegistrationForm({});
    setVerifiedFields({});
    setFieldErrors({});
    setWorkflowStep("ticket");
    fetchPriorTickets(user._id);
  };

  const handleRegisterStudent = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    const requiredFields =
      offlineSettings?.registrationFields.filter((f) => f.required) || [];
    for (const field of requiredFields) {
      if (!registrationForm[field.fieldName]?.toString().trim()) {
        setRegistrationError(`${field.fieldName} is required`);
        return;
      }
    }

    // Validate email format for all email-type fields
    const allFields = offlineSettings?.registrationFields || [];
    for (const field of allFields) {
      if (field.fieldType === "email" && registrationForm[field.fieldName]) {
        const err = validateEmail(registrationForm[field.fieldName]);
        if (err) {
          setFieldErrors((prev) => ({ ...prev, [field.id]: err }));
          setRegistrationError(`${field.fieldName}: ${err}`);
          return;
        }
      }
    }

    // Check OTP verification for required fields
    const otpCheck = checkOtpVerificationsComplete("registration");
    if (!otpCheck.complete) {
      setRegistrationError(
        `Please verify: ${otpCheck.missingFields.join(", ")}`,
      );
      return;
    }

    setRegistering(true);
    setRegistrationError("");

    try {
      const token = localStorage.getItem("authToken");
      const response = await axios.post(
        `${API_CONFIG.API_URL}/users/register-student`,
        {
          ...registrationForm,
          projectId,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (response.data.success) {
        const newStudent = response.data.data;
        setCurrentStudent(newStudent);
        setNewlyRegisteredStudentId(newStudent._id);
        // Show success message with default password
        if (newStudent.defaultPassword) {
          alert(
            `✅ Candidate Registered Successfully!\n\n` +
              `Name: ${newStudent.firstName} ${newStudent.lastName}\n` +
              `Email: ${newStudent.email}\n` +
              `Default Password: ${newStudent.defaultPassword}\n\n` +
              `⚠️ IMPORTANT: Please share this password with the candidate securely.\n` +
              `The candidate can login to the candidate portal using:\n` +
              `Email: ${newStudent.email}\n` +
              `Password: ${newStudent.defaultPassword}\n\n` +
              `They will be required to change their password on first login.`,
          );
        }

        // Auto-populate ticket form with new student ID
        setTicketForm((prev) => ({
          ...prev,
          studentId: newStudent._id,
        }));

        // Clear draft — registration complete, moving to ticket creation
        clearRegDraft();
        setRegistrationForm({});
        setVerifiedFields({});
        setFieldErrors({});

        // Move to ticket creation
        setWorkflowStep("ticket");
      }
    } catch (error: any) {
      // 409 → duplicate user detected by backend
      if (
        error.response?.status === 409 &&
        error.response?.data?.existingUser
      ) {
        const eu = error.response.data.existingUser;
        const field: "email" | "phone" =
          error.response.data.duplicateField === "phone" ? "phone" : "email";
        setDuplicateUserWarning({
          type: field,
          fieldName: field === "phone" ? "Mobile Number" : "Email",
          existingUser: eu,
        });
        setRegistrationError(""); // clear inline error — modal will show instead
      } else {
        setRegistrationError(
          error.response?.data?.message ||
            error.response?.data?.error ||
            "Failed to register candidate. Please try again.",
        );
      }
    } finally {
      setRegistering(false);
    }
  };

  // STEP 3: Create Ticket
  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentStudent) {
      setTicketMessage(
        "No candidate selected. Please search or register a candidate first.",
      );
      return;
    }

    if (ticketForm.needsEscalation && !ticketForm.escalateTo) {
      setValidationPopup({
        isOpen: true,
        errors: ["Escalate To (please select an agent)"],
      });
      return;
    }

    // ── Collect ALL validation errors before proceeding ──────────────────────
    const validationErrors: string[] = [];

    // 1. Check all required non-hierarchy ticket fields
    for (const field of offlineSettings?.ticketFields || []) {
      if (!field.required) continue;
      if (field.isFixed && field.isEnabled === false) continue;
      const ft = field.fieldType?.toLowerCase() || "";
      const isHierarchyField =
        ft === "category" ||
        ft === "hierarchy" ||
        ft.startsWith("hierarchy-level-");
      if (isHierarchyField) continue; // handled below
      const value = ticketForm[field.fieldName];
      const isEmpty =
        value === undefined ||
        value === null ||
        value === "" ||
        (Array.isArray(value) && value.length === 0);
      if (isEmpty) {
        const label =
          field.fieldName.charAt(0).toUpperCase() +
          field.fieldName.slice(1).replace(/([A-Z])/g, " $1");
        validationErrors.push(label);
      }
    }

    // 2. Check mandatory hierarchy levels (Category, Subcategory, Topic, etc.)
    if (hierarchyConfig && hierarchyConfig.levelCount > 1) {
      const offlineVisibleLevels = new Set(
        hierarchyConfig.visibilitySettings?.showInOfflineForm ?? [],
      );
      const hierarchyFieldValue = offlineSettings?.ticketFields
        .map((f) => ticketForm[f.fieldName])
        .find((v) => v && typeof v === "object" && "level1" in v) as
        | CategoryHierarchyValue
        | undefined;
      const mandatoryLevels = hierarchyConfig.levels.filter(
        (l) =>
          l.isMandatory &&
          l.isActive &&
          (offlineVisibleLevels.size === 0 ||
            offlineVisibleLevels.has(l.levelNumber)),
      );
      if (!hierarchyFieldValue) {
        mandatoryLevels.forEach((l) => validationErrors.push(l.displayName));
      } else {
        mandatoryLevels
          .filter(
            (l) =>
              !hierarchyFieldValue[
                `level${l.levelNumber}` as keyof CategoryHierarchyValue
              ],
          )
          .forEach((l) => validationErrors.push(l.displayName));
      }
    }

    if (validationErrors.length > 0) {
      setValidationPopup({ isOpen: true, errors: validationErrors });
      return;
    }
    // ─────────────────────────────────────────────────────────────────────────

    setCreatingTicket(true);
    setTicketMessage("");

    try {
      const token = localStorage.getItem("authToken");
      const formData = new FormData();

      // Debug: Log all ticket form data before processing
      console.log("=== TICKET FORM DEBUG ===");
      console.log("Current ticketForm:", ticketForm);
      console.log(
        "Offline settings ticket fields:",
        offlineSettings?.ticketFields,
      );
      console.log("========================");

      // Map field names to normalize variations
      const normalizeFieldName = (name: string): string => {
        const normalized = name.toLowerCase().trim().replace(/\s+/g, "");

        if (
          normalized.includes("description") ||
          normalized.includes("details") ||
          normalized.includes("issue")
        ) {
          return "description";
        }
        if (normalized.includes("category")) {
          return "category";
        }
        if (normalized.includes("priority")) {
          return "priority";
        }
        return name;
      };

      // Add all configured ticket fields with normalized names
      let hasDescription = false;
      let hasCategory = false;

      offlineSettings?.ticketFields.forEach((field) => {
        const normalizedName = normalizeFieldName(field.fieldName);
        const fieldValue = ticketForm[field.fieldName];
        const fieldTypeLower = field.fieldType?.toLowerCase() || "";
        const isHierarchyField =
          fieldTypeLower === "category" ||
          fieldTypeLower === "hierarchy" ||
          fieldTypeLower.startsWith("hierarchy-level-");

        if (field.fieldType === "file" && fieldValue) {
          const files = fieldValue as File[];
          files.forEach((file) => formData.append("attachments", file));
        } else if (
          isHierarchyField &&
          typeof fieldValue === "object" &&
          fieldValue !== null
        ) {
          // Handle hierarchy category fields - send as JSON and extract deepest category
          const hierarchyValue = fieldValue as CategoryHierarchyValue;
          console.log(
            `Appending hierarchy field: ${field.fieldName} ->`,
            hierarchyValue,
          );

          // Send the full hierarchy as JSON for backend processing
          formData.append("categoryHierarchy", JSON.stringify(hierarchyValue));

          // Get the deepest selected category ID for backward compatibility
          const deepestCategory =
            hierarchyValue.level4 ||
            hierarchyValue.level3 ||
            hierarchyValue.level2 ||
            hierarchyValue.level1;
          if (deepestCategory) {
            formData.append("category", deepestCategory);
            hasCategory = true;
          }
        } else if (
          fieldValue !== undefined &&
          fieldValue !== null &&
          fieldValue !== ""
        ) {
          console.log(
            `Appending field: ${field.fieldName} -> ${normalizedName} = ${fieldValue}`,
          );
          formData.append(normalizedName, String(fieldValue));

          // Track required fields
          if (normalizedName === "description") hasDescription = true;
          if (normalizedName === "category") hasCategory = true;
        } else {
          console.log(`Field ${field.fieldName} is empty or undefined`);
        }
      });

      // Validate required fields before submission
      if (!hasDescription || !hasCategory) {
        // Belt-and-suspenders — should not reach here since upfront validation covers this
        setCreatingTicket(false);
        return;
      }

      // Validate field-level rules (minLength, maxLength, regex)
      for (const field of offlineSettings?.ticketFields || []) {
        const v = (field as any).validation;
        if (!v) continue;
        const fieldValue = ticketForm[field.fieldName];
        if (fieldValue == null || fieldValue === "") continue; // required check already done
        const value = String(fieldValue);
        const label = (field as any).displayLabel || field.fieldName;
        if (v.minLength != null && value.length < Number(v.minLength)) {
          setTicketMessage(
            `${label} must be at least ${v.minLength} characters`,
          );
          setCreatingTicket(false);
          return;
        }
        if (v.maxLength != null && value.length > Number(v.maxLength)) {
          setTicketMessage(
            `${label} must be at most ${v.maxLength} characters`,
          );
          setCreatingTicket(false);
          return;
        }
        if (v.regex) {
          try {
            const re = new RegExp(v.regex);
            if (!re.test(value)) {
              setTicketMessage(`${label} is not in the correct format`);
              setCreatingTicket(false);
              return;
            }
          } catch {
            // invalid regex — skip
          }
        }
      }

      // Validate mandatory hierarchy levels (Subcategory / Topic)
      if (hierarchyConfig && hierarchyConfig.levelCount > 1) {
        const offlineVisibleLevels = new Set(
          hierarchyConfig.visibilitySettings?.showInOfflineForm ?? [],
        );
        const hierarchyFieldValue = offlineSettings?.ticketFields
          .map((f) => ticketForm[f.fieldName])
          .find((v) => v && typeof v === "object" && "level1" in v) as
          | CategoryHierarchyValue
          | undefined;
        if (hierarchyFieldValue) {
          // Belt-and-suspenders only — upfront validation already caught missing levels
        }
      }

      formData.append("userId", currentStudent._id);
      formData.append("studentId", currentStudent._id);
      formData.append("projectId", projectId);
      formData.append("submissionType", "offline");
      if (selectedCenter) {
        formData.append("centerId", selectedCenter._id);
      }

      if (ticketForm.markAsResolved) {
        formData.append("status", "resolved");
        formData.append("resolvedAtCreation", "true");
      }

      if (ticketForm.needsEscalation) {
        formData.append("escalateTo", ticketForm.escalateTo);
        formData.append("escalationReason", ticketForm.escalationReason);
      }

      // Log all FormData entries AFTER everything is appended
      console.log("Final FormData entries:");
      for (let [key, value] of formData.entries()) {
        console.log(`${key}: ${value}`);
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
        const ticketNo = response.data.data.ticketNumber;
        const studentName = `${currentStudent.firstName} ${currentStudent.lastName}`;

        // Show success popup
        setTicketSuccessModal({ ticketNumber: ticketNo, studentName });

        // Auto-dismiss after 6 seconds and reset workflow
        setTimeout(() => {
          setTicketSuccessModal(null);
          clearRegDraft();
          setWorkflowStep("search");
          setCurrentStudent(null);
          setNewlyRegisteredStudentId(null);
          setSearchQuery("");
          setSearchResults([]);
          setTicketMessage("");
          setRegistrationForm({});
          setVerifiedFields({});
          setFieldErrors({});
          setCategoryHierarchy({});
          setTicketForm({
            markAsResolved: false,
            needsEscalation: false,
            escalationReason: "",
            escalateTo: "",
          });
        }, 6000);
      }
    } catch (error: any) {
      setTicketMessage(
        error.response?.data?.message || "Failed to create query",
      );
    } finally {
      setCreatingTicket(false);
    }
  };

  // Clear the persisted registration draft from localStorage
  const clearRegDraft = () => {
    localStorage.removeItem(REG_DRAFT_KEY);
    setHasSavedDraft(false);
  };

  // Select a center for this session and persist to sessionStorage
  const handleCenterSelect = (center: Center) => {
    setSelectedCenter(center);
    try {
      sessionStorage.setItem(CENTER_SESSION_KEY, JSON.stringify(center));
    } catch {
      /* ignore */
    }
  };

  // Go back to search
  const resetWorkflow = () => {
    clearRegDraft();
    setWorkflowStep("search");
    setCurrentStudent(null);
    setNewlyRegisteredStudentId(null);
    setSearchQuery("");
    setSearchResults([]);
    setSearchMessage("");
    setRegistrationError("");
    setRegistrationForm({});
    setTicketMessage("");
    setVerifiedFields({});
    setFieldErrors({});
    setCategoryHierarchy({});
  };

  // OTP Functions
  const openOtpModal = (
    fieldId: string,
    fieldName: string,
    fieldType: "phone" | "email",
    value: string,
    formType: "registration" | "ticket",
  ) => {
    // Validate email format before opening the OTP modal
    if (fieldType === "email") {
      const err = validateEmail(value);
      if (err) {
        setFieldErrors((prev) => ({ ...prev, [fieldId]: err }));
        return;
      }
    }
    setOtpModal({
      isOpen: true,
      fieldId,
      fieldName,
      fieldType,
      value,
      formType,
    });
    setOtpValue("");
    setOtpKey("");
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

      // ── Duplicate check (registration forms only) ─────────────────────────
      // Before sending an OTP for a phone/email being entered during registration,
      // verify the value doesn't already belong to another user in the system.
      if (otpModal.formType === "registration") {
        const dupType = otpModal.fieldType === "phone" ? "phone" : "email";
        try {
          const dupRes = await axios.get(
            `${API_CONFIG.API_URL}/users/check-duplicate`,
            {
              params: { type: dupType, value: otpModal.value },
              headers: { Authorization: `Bearer ${token}` },
            },
          );
          if (dupRes.data.exists && dupRes.data.existingUser) {
            // Close OTP modal first, then show duplicate warning
            closeOtpModal();
            setDuplicateUserWarning({
              type: dupType,
              fieldName: dupType === "phone" ? "Mobile Number" : "Email",
              existingUser: dupRes.data.existingUser,
            });
            setOtpSending(false);
            return;
          }
        } catch {
          // If the duplicate check itself fails, allow OTP to proceed
          // (graceful degradation — backend will catch it on form submit)
        }
      }
      // ──────────────────────────────────────────────────────────────────────

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
        const formData =
          formType === "registration" ? registrationForm : ticketForm;
        if (formData[field.fieldName] && !verifiedFields[field.id]) {
          missingFields.push(field.fieldName);
        }
      }
    });

    return {
      complete: missingFields.length === 0,
      missingFields,
    };
  };

  const renderDynamicField = (
    field: RegistrationField | TicketField,
    value: any,
    onChange: (value: any) => void,
    formType: "registration" | "ticket" = "registration",
  ) => {
    const isRequired = field.required;
    const placeholder = field.placeholder || field.fieldName;
    const needsOtpVerification =
      field.requireOtpVerification &&
      (field.fieldType === "phone" || field.fieldType === "email");
    const isVerified = verifiedFields[field.id];

    switch (field.fieldType) {
      case "text":
      case "number": {
        const isNameField =
          field.fieldName === "firstName" || field.fieldName === "lastName";
        return (
          <input
            type="text"
            inputMode={field.fieldType === "number" ? "numeric" : undefined}
            required={isRequired}
            value={value || ""}
            onChange={(e) => {
              let val = e.target.value;
              if (field.fieldType === "number") {
                val = val.replace(/[^0-9]/g, "");
              } else if (isNameField) {
                val = val.replace(/[0-9]/g, "").replace(/^\s+/, "");
              } else {
                val = val.replace(/^\s+/, "");
              }
              onChange(val);
            }}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder={placeholder}
            minLength={field.validation?.minLength}
            maxLength={field.validation?.maxLength}
            pattern={field.validation?.pattern}
          />
        );
      }

      case "email":
      case "phone": {
        const emailError =
          field.fieldType === "email" ? fieldErrors[field.id] || "" : "";
        const hasEmailError = field.fieldType === "email" && !!emailError;
        return (
          <div className="space-y-1">
            <div className="flex gap-2">
              <input
                type={field.fieldType === "email" ? "email" : "tel"}
                required={isRequired}
                value={value || ""}
                onChange={(e) => {
                  const newVal = e.target.value;
                  onChange(newVal);
                  // Validate email format live
                  if (field.fieldType === "email") {
                    setFieldErrors((prev) => ({
                      ...prev,
                      [field.id]: validateEmail(newVal),
                    }));
                  }
                  // Reset OTP verification if value changes
                  if (verifiedFields[field.id]) {
                    setVerifiedFields((prev) => {
                      const updated = { ...prev };
                      delete updated[field.id];
                      return updated;
                    });
                  }
                }}
                onBlur={(e) => {
                  if (field.fieldType === "email") {
                    setFieldErrors((prev) => ({
                      ...prev,
                      [field.id]: validateEmail(e.target.value),
                    }));
                  }
                }}
                className={`flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  isVerified
                    ? "border-green-500 bg-green-50"
                    : hasEmailError
                      ? "border-red-400 bg-red-50"
                      : "border-gray-300"
                }`}
                placeholder={placeholder}
                minLength={field.validation?.minLength}
                maxLength={field.validation?.maxLength}
              />
              {needsOtpVerification &&
                value &&
                (isVerified ? (
                  <span className="flex items-center px-3 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-medium">
                    <CheckCircleIcon className="h-5 w-5 mr-1" />
                    Verified
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={field.fieldType === "email" && hasEmailError}
                    onClick={() =>
                      openOtpModal(
                        field.id,
                        field.fieldName,
                        field.fieldType as "phone" | "email",
                        value,
                        formType,
                      )
                    }
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                  >
                    Verify
                  </button>
                ))}
            </div>
            {hasEmailError && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <ExclamationCircleIcon className="h-3.5 w-3.5 flex-shrink-0" />
                {emailError}
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
            <option value="">{placeholder}</option>
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
        const ticketField = field as TicketField;
        return (
          <div>
            <input
              type="file"
              multiple={ticketField.allowMultiple}
              accept={ticketField.allowedFileTypes?.join(",")}
              onChange={(e) => {
                if (e.target.files) {
                  const filesArray = Array.from(e.target.files);
                  const maxFiles = ticketField.maxFiles || 5;
                  if (filesArray.length > maxFiles) {
                    alert(`Maximum ${maxFiles} files allowed`);
                    return;
                  }
                  onChange(filesArray);
                  if (filesArray.length > 0) showFileUploadToast(filesArray);
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
        // Check if this is a hierarchy field type (handles category, hierarchy, hierarchy-level-1, hierarchy-level-2, etc.)
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

  if (projectLoading || settingsLoading || centersLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">
            {projectLoading
              ? "Loading project..."
              : centersLoading
                ? "Loading center data..."
                : "Loading workflow settings..."}
          </p>
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

  // Center picker screen — shown when user is assigned to multiple centers and hasn't selected one yet
  if (mappedCenters.length > 1 && !selectedCenter) {
    return (
      <CenterPickerScreen
        centers={mappedCenters}
        onSelect={handleCenterSelect}
      />
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* File upload toast — top-center */}
      {fileUploadToast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 animate-slide-down">
          <div className="flex items-start gap-3 bg-white border border-green-200 shadow-lg rounded-xl px-5 py-3 min-w-[280px] max-w-sm">
            <div className="flex-shrink-0 w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
              <svg
                className="w-4 h-4 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800">
                File selected successfully
              </p>
              {fileUploadToast.names.map((name, i) => (
                <p key={i} className="text-xs text-gray-500 truncate">
                  {name}
                </p>
              ))}
            </div>
            <button
              onClick={() => setFileUploadToast(null)}
              className="flex-shrink-0 text-gray-400 hover:text-gray-600 ml-1"
            >
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Candidate Management Workflow
        </h1>
        <p className="text-gray-600 mt-2">
          Search, register, and create queries for walk-in candidates
        </p>
        {selectedCenter && (
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-full px-4 py-1.5">
              <svg
                className="h-4 w-4 text-blue-600 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              <span className="text-sm font-medium text-blue-800">
                {selectedCenter.centerName}
              </span>
              {selectedCenter.city && (
                <span className="text-xs text-blue-600">
                  · {selectedCenter.city}
                </span>
              )}
            </div>
            {mappedCenters.length > 1 && (
              <button
                onClick={() => {
                  setSelectedCenter(null);
                  try {
                    sessionStorage.removeItem(CENTER_SESSION_KEY);
                  } catch {
                    /* ignore */
                  }
                }}
                className="text-sm text-gray-500 hover:text-gray-700 underline"
              >
                Change Center
              </button>
            )}
          </div>
        )}
      </div>

      {/* Workflow Progress */}
      <div className="mb-8 flex items-center space-x-4">
        <div
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${
            workflowStep === "search"
              ? "bg-blue-100 text-blue-900 font-semibold"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          <MagnifyingGlassIcon className="h-5 w-5" />
          <span>Search</span>
        </div>
        <ChevronRightIcon className="h-5 w-5 text-gray-400" />
        <div
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${
            workflowStep === "register"
              ? "bg-blue-100 text-blue-900 font-semibold"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          <UserPlusIcon className="h-5 w-5" />
          <span>Register</span>
        </div>
        <ChevronRightIcon className="h-5 w-5 text-gray-400" />
        <div
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${
            workflowStep === "ticket"
              ? "bg-blue-100 text-blue-900 font-semibold"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          <TicketIcon className="h-5 w-5" />
          <span>Create Query</span>
        </div>
      </div>

      {/* STEP 1: SEARCH */}
      {workflowStep === "search" && (
        <div className="bg-white rounded-xl shadow-md p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            Search for a Candidate
          </h2>

          {/* Resume draft banner */}
          {hasSavedDraft && (
            <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-300 rounded-lg px-4 py-3 text-sm">
              <span className="text-amber-800 font-medium">
                ⚠ You have an unsaved registration draft.
              </span>
              <div className="flex gap-2 ml-4">
                <button
                  onClick={() => {
                    setHasSavedDraft(false);
                    setWorkflowStep("register");
                  }}
                  className="px-3 py-1 bg-amber-500 text-white rounded hover:bg-amber-600 font-medium"
                >
                  Resume
                </button>
                <button
                  onClick={() => {
                    clearRegDraft();
                    setHasSavedDraft(false);
                    setRegistrationForm({});
                    setVerifiedFields({});
                  }}
                  className="px-3 py-1 bg-white border border-amber-400 text-amber-700 rounded hover:bg-amber-100 font-medium"
                >
                  Discard
                </button>
              </div>
            </div>
          )}
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search Type
              </label>
              <select
                value={searchType}
                onChange={(e) => {
                  setSearchType(e.target.value as any);
                  setSearchQuery("");
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All (Name, Email, Phone)</option>
                <option value="name">By Name</option>
                <option value="email">By Email</option>
                <option value="phone">By Phone Number</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search Login <span className="text-red-500">*</span>
              </label>
              <div className="flex space-x-2">
                <input
                  type={
                    searchType === "phone"
                      ? "tel"
                      : searchType === "email"
                        ? "email"
                        : "text"
                  }
                  value={searchQuery}
                  onChange={(e) => {
                    let val = e.target.value;
                    if (searchType === "phone") {
                      val = val.replace(/[^0-9]/g, "");
                    } else if (searchType === "name") {
                      val = val.replace(/[0-9]/g, "");
                    }
                    setSearchQuery(val);
                  }}
                  onKeyPress={(e) => e.key === "Enter" && handleSearchStudent()}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder={
                    searchType === "name"
                      ? "e.g., John Doe"
                      : searchType === "email"
                        ? "e.g., student@example.com"
                        : searchType === "phone"
                          ? "e.g., 9876543210"
                          : "Enter name, email, or phone"
                  }
                />
                <button
                  onClick={handleSearchStudent}
                  disabled={searching}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 flex items-center space-x-2"
                >
                  {searching ? (
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
            </div>

            {/* Search Message */}
            {searchMessage && (
              <div
                className={`p-4 rounded-lg ${
                  searchResults.length > 0
                    ? "bg-green-50 border border-green-200 text-green-900"
                    : "bg-amber-50 border border-amber-200 text-amber-900"
                }`}
              >
                {searchResults.length > 0 ? (
                  <p className="flex items-center space-x-2">
                    <CheckCircleIcon className="h-5 w-5" />
                    <span>{searchMessage}</span>
                  </p>
                ) : (
                  <p className="flex items-center space-x-2">
                    <ExclamationCircleIcon className="h-5 w-5" />
                    <span>{searchMessage}</span>
                  </p>
                )}
              </div>
            )}

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-700">
                  Select a Candidate:
                </h3>
                {searchResults.map((student) => (
                  <div
                    key={student._id}
                    className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      <UserIcon className="h-6 w-6 text-gray-400" />
                      <div>
                        <p className="font-semibold text-gray-900">
                          {student.firstName} {student.lastName}
                        </p>
                        <p className="text-sm text-gray-600">{student.email}</p>
                        {student.phone && (
                          <p className="text-sm text-gray-600">
                            Phone: {student.phone}
                          </p>
                        )}
                        {student.uniqueId && (
                          <p className="text-sm text-gray-600">
                            ID: {student.uniqueId}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => selectStudent(student)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
                    >
                      <span>Select</span>
                      <ChevronRightIcon className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Register New Student Button */}
            {searchResults.length === 0 && searchMessage && (
              <button
                onClick={() => setWorkflowStep("register")}
                className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center space-x-2 font-semibold"
              >
                <UserPlusIcon className="h-5 w-5" />
                <span>Register New Student</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* STEP 2: REGISTER */}
      {workflowStep === "register" && (
        <div className="bg-white rounded-xl shadow-md p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            Register New Student
          </h2>

          {registrationError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-900 flex items-start space-x-3">
              <ExclamationCircleIcon className="h-6 w-6 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold">Registration Error</h4>
                <p className="text-sm mt-1">{registrationError}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleRegisterStudent} className="space-y-6">
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
                      registrationForm[field.fieldName],
                      (value) =>
                        setRegistrationForm({
                          ...registrationForm,
                          [field.fieldName]: value,
                        }),
                      "registration",
                    )}
                  </div>
                ))}
            </div>

            <div className="flex justify-end space-x-4 pt-6 border-t">
              <button
                type="button"
                onClick={() => resetWorkflow()}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Back to Search
              </button>
              <button
                type="submit"
                disabled={registering}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400 flex items-center space-x-2"
              >
                {registering ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>Registering...</span>
                  </>
                ) : (
                  <>
                    <UserPlusIcon className="h-5 w-5" />
                    <span>Register & Continue</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STEP 3: CREATE TICKET */}
      {workflowStep === "ticket" && currentStudent && (
        <div className="bg-white rounded-xl shadow-md p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Create Query
          </h2>

          {/* Student Info Card */}
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-gray-600 mb-2">
              {newlyRegisteredStudentId ? "📝 Newly Registered" : "✓ Existing"}{" "}
              Student:
            </p>
            <p className="text-lg font-semibold text-gray-900">
              {currentStudent.firstName} {currentStudent.lastName}
            </p>
            <p className="text-sm text-gray-600 mt-1">{currentStudent.email}</p>
            {currentStudent.phone && (
              <p className="text-sm text-gray-600">
                Phone: {currentStudent.phone}
              </p>
            )}
          </div>

          {/* Prior Tickets Panel — shows all queries raised by this student in the project */}
          <div className="mb-6 border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <TicketIcon className="h-4 w-4 text-gray-500" />
                Previously Raised Queries by This Candidate
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
                No prior queries found for this candidate in this project.
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
                            t.status === 1 || t.status === 2 || t.status === 3,
                        ).length
                      }{" "}
                      open / in-progress ticket(s) already exist. Review before
                      creating a new one.
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
                        <th className="px-3 py-2 font-semibold w-52">
                          Subject
                        </th>
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

          {ticketMessage && (
            <div
              className={`mb-6 p-4 rounded-lg ${
                ticketMessage.startsWith("✓")
                  ? "bg-green-50 border border-green-200 text-green-900"
                  : "bg-red-50 border border-red-200 text-red-900"
              }`}
            >
              <p className="flex items-center space-x-2">
                {ticketMessage.startsWith("✓") ? (
                  <CheckCircleIcon className="h-5 w-5" />
                ) : (
                  <ExclamationCircleIcon className="h-5 w-5" />
                )}
                <span>{ticketMessage}</span>
              </p>
            </div>
          )}

          <form onSubmit={handleCreateTicket} noValidate className="space-y-6">
            {/* Ticket Fields */}
            <div className="space-y-6">
              {offlineSettings.ticketFields
                .filter((field) => {
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
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>ℹ️ Auto-Assignment:</strong> This query will be
                  automatically assigned to you unless you escalate it to
                  another agent.
                </p>
              </div>

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
                    Check if the issue was resolved during this visit
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
                  <span className="font-medium text-gray-900">Escalate</span>
                  <p className="text-gray-600 text-xs mt-1">
                    Check if this query needs specialized support
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
                      {agents.map((contact) => (
                        <option
                          key={contact._id}
                          value={contact.userId || contact._id}
                        >
                          {contact.name} - {contact.role}
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
                      placeholder="Explain why this query needs escalation..."
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-4 pt-4 border-t">
              <button
                type="button"
                onClick={resetWorkflow}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                New Workflow
              </button>
              <button
                type="submit"
                disabled={creatingTicket}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 flex items-center space-x-2"
              >
                {creatingTicket ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>Creating...</span>
                  </>
                ) : (
                  <>
                    <TicketIcon className="h-5 w-5" />
                    <span>Create Query</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Duplicate User Warning Modal ───────────────────────────────────── */}
      {duplicateUserWarning && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                <ExclamationCircleIcon className="h-6 w-6 text-amber-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">
                {duplicateUserWarning.type === "phone"
                  ? "Mobile Number Already Exists"
                  : "Email Already Exists"}
              </h3>
            </div>

            {/* Body */}
            <p className="text-sm text-gray-600 mb-4">
              A user with this{" "}
              <span className="font-medium">
                {duplicateUserWarning.fieldName}
              </span>{" "}
              already exists in the system:
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 space-y-1">
              <p className="text-sm font-medium text-gray-900">
                {duplicateUserWarning.existingUser.firstName}{" "}
                {duplicateUserWarning.existingUser.lastName}
              </p>
              <p className="text-sm text-gray-600">
                📧 {duplicateUserWarning.existingUser.email}
              </p>
              {duplicateUserWarning.existingUser.phone && (
                <p className="text-sm text-gray-600">
                  📱 {duplicateUserWarning.existingUser.phone}
                </p>
              )}
            </div>

            {/* Actions — block if existing user is not a student */}
            {duplicateUserWarning.existingUser.roleCode &&
            duplicateUserWarning.existingUser.roleCode !== "STUDENT" ? (
              <>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                  <p className="text-sm font-semibold text-red-700 mb-1">
                    ⛔ Access Restricted
                  </p>
                  <p className="text-sm text-red-600">
                    This user is registered with a non-student role and cannot
                    be used for ticket creation in this portal. Please use a
                    different phone number or email address.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setDuplicateUserWarning(null)}
                    className="flex-1 py-2 px-4 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg font-medium text-sm"
                  >
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-600 mb-6">
                  Would you like to use this existing user and proceed to raise
                  a ticket on their behalf?
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() =>
                      useExistingUserForTicket(
                        duplicateUserWarning.existingUser,
                      )
                    }
                    className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm"
                  >
                    Use Existing User
                  </button>
                  <button
                    onClick={() => setDuplicateUserWarning(null)}
                    className="flex-1 py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
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

      {/* ── Ticket Created Success Modal ─────────────────────────────── */}
      {/* ── Validation Error Popup ─────────────────────────────────────── */}
      {validationPopup.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in duration-300">
            {/* Red header band */}
            <div className="bg-red-500 px-6 py-6 flex flex-col items-center text-white">
              <div className="bg-white/20 rounded-full p-3 mb-3">
                <svg
                  className="h-10 w-10 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-bold tracking-tight">
                Required Fields Missing
              </h2>
              <p className="text-red-100 text-sm mt-1">
                Please fill in the following fields before submitting
              </p>
            </div>

            {/* Body — list of missing fields */}
            <div className="px-6 py-5">
              <ul className="space-y-2">
                {validationPopup.errors.map((err, idx) => (
                  <li
                    key={idx}
                    className="flex items-center gap-3 text-sm text-gray-700"
                  >
                    <span className="flex-shrink-0 w-5 h-5 bg-red-100 rounded-full flex items-center justify-center">
                      <svg
                        className="w-3 h-3 text-red-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </span>
                    <span className="font-medium">{err}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Footer */}
            <div className="px-6 pb-6">
              <button
                type="button"
                onClick={() =>
                  setValidationPopup({ isOpen: false, errors: [] })
                }
                className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
              >
                OK, I'll Fix It
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ────────────────────────────────────────────────────────────────── */}

      {ticketSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in duration-300">
            {/* Green header band */}
            <div className="bg-green-500 px-6 py-8 flex flex-col items-center text-white">
              {/* Big checkmark circle */}
              <div className="bg-white/20 rounded-full p-4 mb-3">
                <svg
                  className="h-12 w-12 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-bold tracking-tight">
                Query Created!
              </h2>
              <p className="text-green-100 text-sm mt-1">
                Successfully submitted
              </p>
            </div>

            {/* Body */}
            <div className="px-6 py-6 text-center space-y-4">
              {/* Ticket number badge */}
              <div className="inline-flex items-center gap-2 bg-green-50 border border-green-200 rounded-full px-5 py-2">
                <span className="text-green-600 font-semibold text-sm uppercase tracking-wide">
                  Query No.
                </span>
                <span className="text-green-800 font-bold text-xl">
                  #{ticketSuccessModal.ticketNumber}
                </span>
              </div>

              <p className="text-gray-600 text-sm">
                Query has been raised for{" "}
                <span className="font-semibold text-gray-800">
                  {ticketSuccessModal.studentName}
                </span>
              </p>

              <p className="text-xs text-gray-400">
                This window will close automatically in a few seconds.
              </p>

              {/* Action button */}
              <button
                onClick={() => {
                  setTicketSuccessModal(null);
                  clearRegDraft();
                  setWorkflowStep("search");
                  setCurrentStudent(null);
                  setNewlyRegisteredStudentId(null);
                  setSearchQuery("");
                  setSearchResults([]);
                  setTicketMessage("");
                  setRegistrationForm({});
                  setVerifiedFields({});
                  setFieldErrors({});
                  setCategoryHierarchy({});
                  setTicketForm({
                    markAsResolved: false,
                    needsEscalation: false,
                    escalationReason: "",
                    escalateTo: "",
                  });
                }}
                className="w-full py-2.5 px-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors"
              >
                Start New Flow
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentStudentWorkflow;
