import React, { useState, useEffect, useMemo } from "react";
import { canDo } from "../constants/ticketActionPermissions";
import DOMPurify from "dompurify";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import PsrDetailLayout from "../components/sr/PsrDetailLayout";
import LinkedIsrPanel from "../components/sr/LinkedIsrPanel";
import PslCallTab from "../components/sr/PslCallTab";
import SrLifecyclePanel from "../components/sr/SrLifecyclePanel";
import { serviceRequestApi } from "../services/serviceRequests";

// Known boilerplate patterns injected by mail servers / Outlook (mirrors backend stripEmailBoilerplate)
const EMAIL_BOILERPLATE_PATTERNS: RegExp[] = [
  /you don.{0,5}t often get email from .+learn why this is important/i,
  /^caution\s*:?\s*external email/i,
  /^warning\s*:?\s*external email/i,
  /^\[external\]/i,
  /^this email (originated|was sent) from outside (your )?organ/i,
  /^do not click links or open attachments unless you recogni[sz]e/i,
  /^validate sender before clicking/i,
  /links\/attachments\.?$/i,
  /^the content of this email is confidential/i,
  /^it is strictly forbidden to share any part/i,
  /without a written consent of the sender\.?$/i,
  /^this (e-?mail|message) (and any attachments )?(is|are) (intended|confidential)/i,
  /^if you (are|have) not the intended recipient/i,
  /^please (notify|inform) the (sender|author) (immediately|and delete)/i,
];

function stripEmailBoilerplateFE(text: string): string {
  return text
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (!t) return true;
      return !EMAIL_BOILERPLATE_PATTERNS.some((p) => p.test(t));
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
import axios from "axios";
import { useSocket } from "../hooks/useSocket";
import DashboardLayout from "../components/DashboardLayout";
import EscalationMatrixCard from "../components/EscalationMatrixCard";
import HierarchyCategorySelector, {
  CategoryHierarchyValue,
  useHierarchyConfig,
  CategoryHierarchyDisplay,
} from "../components/HierarchyCategorySelector";
import { TicketMergeModal } from "../components/tickets/TicketMergeModal";
import { API_CONFIG } from "../config/constants";
import { useReplyDraft } from "../hooks/useReplyDraft";
import {
  ArrowLeftIcon,
  PaperClipIcon,
  PaperAirplaneIcon,
  UserIcon,
  ClockIcon,
  TagIcon,
  ChatBubbleLeftRightIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowUpIcon,
  TicketIcon,
  ArrowsPointingInIcon,
  ListBulletIcon,
  PhoneIcon,
} from "@heroicons/react/24/outline";

// SLA Tracking interface for resolution time calculation
interface SLATrackingData {
  currentEscalationLevel: number;
  resolutionDeadline?: string;
  nextEscalationDue?: string;
  resolutionStatus: "met" | "breached" | "pending";
  isPaused: boolean;
  pausedDuration: number;
  lastEscalationAt?: string;
  slaSource?: "category" | "priority" | "default";
  escalationHistory: Array<{
    level: number;
    escalatedAt: string;
    escalatedTo: string;
    mode: "manual" | "auto";
    reason: string;
  }>;
  escalationPolicy?: {
    _id: string;
    name: string;
    levels: Array<{
      level: number;
      escalationMode: string;
      escalateAfter: {
        value: number;
        unit: string;
      };
      escalateTo: {
        type: string;
        targetId: string;
        targetName: string;
      };
    }>;
  };
}

/**
 * Display name for a user. Not every account has a lastName (service accounts
 * such as "Admin" often don't), so joining the parts blindly renders
 * "Admin undefined".
 */
const personName = (u?: {
  firstName?: string;
  lastName?: string;
  email?: string;
}) =>
  !u
    ? ""
    : [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "";

interface Ticket {
  _id: string;
  ticketNumber: string;
  title: string;
  subject?: string;
  description: string;
  status: number;
  priority: string;
  category: string;
  categoryHierarchy?: {
    level1?: string;
    level2?: string;
    level3?: string;
    level4?: string;
    displayPath?: string;
  };
  projectId?: string | { _id: string; name?: string }; // Project this ticket belongs to
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  closedAt?: string;
  createdBy?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  assignedTo?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  submissionSource?: "online" | "offline" | "walk_in" | "email" | "ivr" | "whatsapp" | "sms" | "chatbot"; // Task 6.4: Ticket source
  sourceEmail?: string; // Task 6.4: Sender email for email tickets
  sourceEmailMessageId?: string; // Task 7.5: Original email message ID for threading
  metadata?: {
    studentName?: string;
    studentEmail?: string;
    studentPhone?: string;
    projectId?: string;
    centerId?:
    | string
    | {
      _id?: string;
      centerName?: string;
      city?: string;
      state?: string;
    };
    customFields?: Record<string, any>;
    requestedBy?: {
      type?: string;
      userId?: string;
      name?: string;
      email?: string;
      mobile?: string;
      source?: string;
    };
    requestedByName?: string;
    requestedByEmail?: string;
    requestedByMobile?: string;
    requestedByType?: string;
  };
  formSchemaSnapshot?: Array<{
    fieldName: string;
    fieldType: string;
    required?: boolean;
    options?: string[];
  }>;
  tags?: string[];
  threads?: Thread[];
  comments?: Comment[]; // Task 7.5: Email replies stored as comments
  internalNotes?: InternalNote[];
  attachments?: Attachment[];
  escalationHistory?: EscalationRecord[];
  changeHistory?: ChangeHistory[];
  slaTracking?: SLATrackingData; // SLA tracking data from backend
  // Escalation Matrix fields
  escalationMatrixId?: string;
  escalationMatrixName?: string;
  currentEscalationLevelNumber?: number;
  // Assignment tracking (Phase 1 — US-015)
  assignedVia?:
  | "manual"
  | "round-robin"
  | "by-role"
  | "by-user"
  | "condition-based"
  | "fallback"
  | null;
  /** US-ASSIGN-002: category rule that caused this assignment */
  assignedViaCategoryId?: string | { _id: string; name: string } | null;
  assignmentAttempts?: number;
  // Merge tracking fields
  isMerged?: boolean;
  mergedInto?:
  | string
  | { _id: string; ticketNumber: string; subject?: string; title?: string };
  // US-ESC-009: SLA tracking fields for countdown pill
  roleLevelSLA?: {
    startedAt?: string;
    dueAt?: string;
    breachedAt?: string;
    pausedAt?: string;
    pausedDuration?: number;
  };
  ticketLevelSLA?: {
    dueAt?: string;
    breachedAt?: string;
    pausedAt?: string;
    pausedDuration?: number;
  };
  mergedTickets?: Array<{
    _id: string;
    ticketNumber: string;
    subject?: string;
    title?: string;
    status: number | string;
    priority?: string;
    mergedAt?: string;
    createdAt?: string;
    assignedTo?: { firstName: string; lastName: string };
    category?: { name: string } | string;
    threads?: Array<{ _id: string }>;
  }>;
  mergedAt?: string;
}

interface Thread {
  _id?: string;
  message: string;
  createdBy: {
    _id?: string;
    firstName: string;
    lastName: string;
    email: string;
    role?: string | { name: string; code?: string };
  };
  createdAt: string;
  attachments?: Array<{
    filename: string;
    originalName: string;
    path: string;
    mimetype: string;
    size: number;
  }>;
  isSystemMessage?: boolean;
  mergedFrom?: string;
}

interface InternalNote {
  _id: string;
  note: string;
  createdBy: {
    firstName: string;
    lastName: string;
  };
  createdAt: string;
}

// Task 7.5: Comment interface for email replies
interface Comment {
  _id?: string;
  text: string;
  createdBy: {
    _id?: string;
    firstName: string;
    lastName: string;
    email?: string;
  };
  createdAt: string;
  updatedAt?: string;
  isSystemComment?: boolean;
  mergedFrom?: string;
  attachments?: Array<{
    filename: string;
    originalName: string;
    path: string;
    mimetype: string;
    size: number;
  }>;
}

interface Attachment {
  filename: string;
  path: string;
  size: number;
  uploadedAt: string;
}

// Task 6.5: Email communication interface
interface EmailCommunication {
  _id: string;
  ticketId: string;
  direction: "incoming" | "outgoing" | "inbound" | "outbound";
  fromEmail: string;
  toEmail: string;
  ccEmails?: string[];
  subject: string;
  body: string;
  htmlBody?: string;
  bodyHtml?: string;
  messageId: string;
  inReplyTo?: string;
  references?: string | string[];
  attachments?: Array<{
    filename: string;
    originalName: string;
    mimetype: string;
    size: number;
    path?: string;
  }>;
  sentAt?: string;
  receivedAt?: string;
  status?: string;
  createdAt: string;
  updatedAt: string;
}

interface EscalationRecord {
  _id: string;
  escalatedTo: {
    firstName: string;
    lastName: string;
    email: string;
  };
  escalatedBy: {
    firstName: string;
    lastName: string;
  };
  reason: string;
  escalatedAt: string;
  toLevel?: number;
}

interface ChangeHistory {
  _id: string;
  field: string;
  oldValue: string;
  newValue: string;
  changedBy: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  changedAt: string;
  changeType: "update" | "add" | "remove" | "reassigned";
  reassignmentReason?: string;
}

interface Category {
  _id: string;
  name: string;
}

interface ProjectConfiguration {
  ticketSubmissionSettings: {
    onlineFormFields: Array<{
      fieldName: string;
      fieldType: string;
      required: boolean;
      options?: string[];
    }>;
  };
}

interface SLARule {
  _id: string;
  name: string;
  description: string;
  priority: string;
  responseTime: {
    value: number;
    unit: string;
  };
  resolutionTime: {
    value: number;
    unit: string;
  };
  isActive: boolean;
}

interface AgentTicketDetailProps {
  wrapWithLayout?: boolean;
}

/** Opens an attachment — fetches a signed URL from the backend (with auth) then opens it in a new tab.
 * The tab is opened BEFORE the async call so browsers don't block it as a popup. */
// US-ESC-009: SLA countdown helpers for ticket detail header
const _formatSlaMsDetail = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");

  if (days > 0) return `${days}d ${hh}:${mm}:${ss}`;
  return `${hh}:${mm}:${ss}`;
};

const _formatDueTimestamp = (date: Date): string => {
  const time = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const sameDay = new Date().toDateString() === date.toDateString();
  return sameDay ? time : `${date.toLocaleDateString()} ${time}`;
};

const computeDetailSlaPill = (
  ticket: Ticket,
): { label: string; color: string; bg: string; tooltip: string } | null => {
  const dueAt = ticket.roleLevelSLA?.dueAt ?? ticket.ticketLevelSLA?.dueAt;
  if (!dueAt) return null;

  // Closed/resolved tickets: show frozen SLA status (met or breached at close time).
  // closedAt is the most reliable indicator — it is set for ALL closing status codes.
  const closedAt = (ticket as any).closedAt as string | undefined;
  const statusNum = Number((ticket as any).status);
  const isTicketClosed = !!(closedAt || statusNum === 4 || statusNum === 5);
  if (isTicketClosed) {
    // For closed tickets, check against the ticket-level resolution SLA, not the
    // role-level SLA. roleLevelSLA.breachedAt only means the escalation level timed
    // out (ticket was escalated); it does NOT mean the overall resolution SLA was breached.
    const resolutionDue = ticket.ticketLevelSLA?.dueAt ?? dueAt;
    const due = new Date(resolutionDue).getTime();
    const closedMs = closedAt ? new Date(closedAt).getTime() : Date.now();
    const wasBreached = !!(ticket.ticketLevelSLA?.breachedAt || closedMs > due);
    if (wasBreached)
      return {
        label: "BREACHED",
        color: "#dc2626",
        bg: "#fef2f2",
        tooltip: `SLA breached. Closed: ${new Date(closedAt ?? Date.now()).toLocaleString()}`,
      };
    return {
      label: "MET",
      color: "#15803d",
      bg: "#f0fdf4",
      tooltip: `Closed within SLA at ${new Date(closedAt ?? Date.now()).toLocaleString()}`,
    };
  }

  if (ticket.roleLevelSLA?.pausedAt ?? ticket.ticketLevelSLA?.pausedAt)
    return {
      label: "PAUSED",
      color: "#374151",
      bg: "#f3f4f6",
      tooltip: "SLA is paused",
    };
  const isBreached = !!(
    ticket.roleLevelSLA?.breachedAt ?? ticket.ticketLevelSLA?.breachedAt
  );
  const now = Date.now();
  const due = new Date(dueAt).getTime();
  const remaining = due - now;
  if (isBreached || remaining <= 0)
    return {
      label: "BREACHED",
      color: "#dc2626",
      bg: "#fef2f2",
      tooltip: `Due: ${new Date(dueAt).toLocaleString()}`,
    };
  const startedAt = ticket.roleLevelSLA?.startedAt;
  const start = startedAt ? new Date(startedAt).getTime() : due - 86400000;
  const total = due - start;
  const pct = total > 0 ? (remaining / total) * 100 : 100;
  const label = _formatSlaMsDetail(remaining);
  const tooltip = `Due: ${new Date(dueAt).toLocaleString()}`;
  if (pct > 50) return { label, color: "#15803d", bg: "#f0fdf4", tooltip };
  if (pct > 25) return { label, color: "#b45309", bg: "#fffbeb", tooltip };
  return { label, color: "#dc2626", bg: "#fef2f2", tooltip };
};

const openAttachment = async (pathOrUrl: string | undefined) => {
  if (!pathOrUrl) return;
  // If already a full URL (e.g. GCS signed URL), open it directly.
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    window.open(pathOrUrl, "_blank", "noopener,noreferrer");
    return;
  }
  // Relative backend path — open blank tab first (avoids popup blocker), then navigate.
  // NOTE: do NOT pass noopener here or window.open returns null in modern browsers.
  const newTab = window.open("", "_blank");
  const token = localStorage.getItem("authToken");
  try {
    const res = await axios.get(
      `${API_CONFIG.BASE_URL}/api/tickets/attachment-signed-url?path=${encodeURIComponent(pathOrUrl)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const url: string = res.data?.url || `${API_CONFIG.BASE_URL}${pathOrUrl}`;
    if (newTab) newTab.location.href = url;
  } catch {
    if (newTab) newTab.location.href = `${API_CONFIG.BASE_URL}${pathOrUrl}`;
  }
};

const AgentTicketDetail: React.FC<AgentTicketDetailProps> = ({
  wrapWithLayout = true,
}) => {
  const { id: ticketId, customUrlPath } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isServiceRequestRoute = location.pathname.includes("/service-requests/");
  const detailPathFor = (id: string) => {
    if (isServiceRequestRoute) {
      return customUrlPath
        ? `/${customUrlPath}/portal/service-requests/${id}`
        : `/service-requests/${id}`;
    }
    return customUrlPath ? `/${customUrlPath}/portal/tickets/${id}` : `/tickets/${id}`;
  };

  // Prev/Next navigation within the list the user came from. ViewTickets stores
  // the current ordered ticket IDs in sessionStorage; we use them to jump
  // between tickets without returning to the list.
  let prevTicketId: string | null = null;
  let nextTicketId: string | null = null;
  try {
    const navList: string[] = JSON.parse(
      sessionStorage.getItem("ticketNavList") || "[]",
    );
    const idx = navList.indexOf(ticketId || "");
    if (idx !== -1) {
      prevTicketId = idx > 0 ? navList[idx - 1] : null;
      nextTicketId = idx < navList.length - 1 ? navList[idx + 1] : null;
    }
  } catch {
    /* no nav context — Prev/Next simply won't render */
  }
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState<string[]>([]);
  // Current user id (for ownership: can only act on tickets assigned to me).
  // Prefer the plain "userId" key — it's set by EVERY login path (including the
  // project portal, which does NOT store a "user" object). Fall back to the
  // "user" object for older sessions.
  const currentUserId = useMemo<string | null>(() => {
    try {
      const plain = localStorage.getItem("userId");
      if (plain) return plain;
      const userStr = localStorage.getItem("user");
      const u = userStr ? JSON.parse(userStr) : null;
      return u?._id ?? u?.id ?? null;
    } catch {
      return null;
    }
  }, []);
  // US-ESC-009: ticker to keep SLA countdown pill current (updates every 60s)
  const [, setTickNow] = useState(Date.now());
  const [activeTab, setActiveTab] = useState<
    | "details"
    | "replies"
    | "linkedisr"
    | "notes"
    | "pslcall"
    | "history"
    | "emails"
    | "audit"
  >("replies"); // Task 6.5: Added 'emails' tab
  const [srConfig, setSrConfig] = useState<any>(null);

  // Reply states (useReplyDraft: idle-save auto-draft)
  const {
    value: replyMessage,
    onChange: setReplyMessage,
    saveStatus: replyDraftStatus,
    draftRestored: replyDraftRestored,
    dismissRestoreBanner: dismissReplyDraftBanner,
    clearDraft: clearReplyDraft,
  } = useReplyDraft(ticketId, "reply");
  const [replyFiles, setReplyFiles] = useState<FileList | null>(null);
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

  // File upload toast
  const [fileUploadToast, setFileUploadToast] = useState<{
    names: string[];
    visible: boolean;
  } | null>(null);
  const fileToastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const showFileUploadToast = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const names = Array.from(files).map((f) => f.name);
    if (fileToastTimerRef.current) clearTimeout(fileToastTimerRef.current);
    setFileUploadToast({ names, visible: true });
    fileToastTimerRef.current = setTimeout(() => {
      setFileUploadToast(null);
    }, 4000);
  };

  // Internal note states
  const [noteText, setNoteText] = useState("");
  const [isAddingNote, setIsAddingNote] = useState(false);

  // Reassign states
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [reassignDepartments, setReassignDepartments] = useState<
    { _id: string; name: string }[]
  >([]);
  const [reassignDepartmentId, setReassignDepartmentId] = useState("");
  const [reassignAgents, setReassignAgents] = useState<
    { _id: string; firstName: string; lastName: string; email: string }[]
  >([]);
  const [reassignAgentId, setReassignAgentId] = useState("");
  const [reassignReason, setReassignReason] = useState("");
  const [reassignLoading, setReassignLoading] = useState(false);
  const [reassignLoadingAgents, setReassignLoadingAgents] = useState(false);
  const [deptSearch, setDeptSearch] = useState("");
  const [deptDropdownOpen, setDeptDropdownOpen] = useState(false);
  const [agentSearch, setAgentSearch] = useState("");
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);

  // Edit states
  const [isEditingStatus, setIsEditingStatus] = useState(false);
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [isEditingPriority, setIsEditingPriority] = useState(false);
  const [isAddingTag, setIsAddingTag] = useState(false);

  const [newStatus, setNewStatus] = useState<string | number>("");
  const [newCategory, setNewCategory] = useState("");
  const [newPriority, setNewPriority] = useState("");
  const [newTag, setNewTag] = useState("");

  // Confirmation & success modal state
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    field: string;
    from: string;
    to: string;
    onConfirm: () => void;
  }>({ open: false, field: "", from: "", to: "", onConfirm: () => { } });

  // Closing-remark modal state (shown when a status has requireClosingRemark=true)
  const [remarkModal, setRemarkModal] = useState<{
    open: boolean;
    targetStatusCode: number;
    fromLabel: string;
    toLabel: string;
    remark: string;
    remarkDate: string;
    needsRemark?: boolean;
    needsDate?: boolean;
    dateLabel?: string;
  }>({
    open: false,
    targetStatusCode: 0,
    fromLabel: "",
    toLabel: "",
    remark: "",
    remarkDate: new Date().toISOString().slice(0, 10),
  });
  const [successModal, setSuccessModal] = useState<{
    open: boolean;
    message: string;
  }>({ open: false, message: "" });
  const [isFieldUpdating, setIsFieldUpdating] = useState(false);

  // Master data
  const [categories, setCategories] = useState<Category[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [projectConfig, setProjectConfig] =
    useState<ProjectConfiguration | null>(null);
  const [statusOptions, setStatusOptions] = useState<any[]>([]);
  const [priorityOptions, setPriorityOptions] = useState<string[]>([]);
  const [priorityData, setPriorityData] = useState<any>(null);
  const [slaRules, setSlaRules] = useState<any[]>([]);

  const [userRole, setUserRole] = useState<{
    _id: string;
    name: string;
    code?: string;
  } | null>(null);

  // Escalation Matrix and Working Calendar for SLA calculations
  const [escalationMatrix, setEscalationMatrix] = useState<any>(null);
  const [workingCalendar, setWorkingCalendar] = useState<any>(null);

  // Category hierarchy state
  const [categoryHierarchy, setCategoryHierarchy] =
    useState<CategoryHierarchyValue>({});

  // Compute projectId from ticket for hierarchy config
  const ticketProjectId = ticket?.projectId
    ? typeof ticket.projectId === "object"
      ? (ticket.projectId as any)._id
      : ticket.projectId
    : ticket?.metadata?.projectId || "";

  const isSrDetailTicket =
    !!ticket &&
    ((ticket as any).interactionType === "PSR" ||
      (ticket as any).interactionType === "ISR");
  const ticketInteractionType = (() => {
    const rawType = String((ticket as any)?.interactionType || "").toUpperCase();
    return rawType === "PSR" || rawType === "ISR" ? rawType : "Normal";
  })();

  useEffect(() => {
    if (!ticketProjectId) {
      setSrConfig(null);
      return;
    }
    let mounted = true;
    serviceRequestApi
      .getConfig(String(ticketProjectId))
      .then((res) => {
        if (mounted) setSrConfig(res.data || null);
      })
      .catch((e) => {
        console.error(e);
        if (mounted) setSrConfig(null);
      });
    return () => {
      mounted = false;
    };
  }, [ticketProjectId]);

  const srTab = (key: string) =>
    srConfig?.psrDetail?.tabs?.find((tab: any) => tab.key === key);
  const srTabVisible = (key: string) => {
    if (!isSrDetailTicket) return true;
    // A PSL call is a call to the PARENT — it has no meaning on an ISR, which
    // is raised internally and has no parent to satisfy.
    if (key === "pslcall" && (ticket as any)?.interactionType !== "PSR") return false;
    const tab = srTab(key);
    if (!tab) return true;
    if (!tab.enabled) return false;
    if (key === "emails" && ticket?.submissionSource !== "email") return false;
    return !tab.requiredPermission || permissions.includes(tab.requiredPermission);
  };
  const srTabLabel = (key: string, fallback: string) =>
    isSrDetailTicket ? srTab(key)?.label || fallback : fallback;
  const isPsrTicket = (ticket as any)?.interactionType === "PSR";
  const isIsrTicket = (ticket as any)?.interactionType === "ISR";
  const normalTicketLinkedIsrEnabled =
    !!ticket &&
    !isPsrTicket &&
    !isIsrTicket &&
    !!srConfig?.enabled &&
    !!srConfig?.isr?.enabled &&
    !!srConfig?.isr?.linkFromNormalTickets?.enabled;
  // Sub-ISRs: an ISR can host its own linked ISRs where the project opts in.
  // Off by default because it turns the flat parent/child relation into a
  // chain; the backend caps depth and refuses links that would form a loop.
  const isrLinkedIsrEnabled =
    !!ticket &&
    isIsrTicket &&
    !!srConfig?.enabled &&
    !!srConfig?.isr?.enabled &&
    !!srConfig?.isr?.linkFromIsr?.enabled;
  const linkedIsrTabEnabled =
    !!ticket &&
    (isPsrTicket || normalTicketLinkedIsrEnabled || isrLinkedIsrEnabled) &&
    srTabVisible("linkedisr");

  // Fetch hierarchy config to determine if multi-level categories are enabled
  const { config: hierarchyConfig } = useHierarchyConfig(ticketProjectId);

  // Task 6.5: Email communications state
  const [emailCommunications, setEmailCommunications] = useState<
    EmailCommunication[]
  >([]);
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [expandedEmails, setExpandedEmails] = useState<Set<string>>(new Set());

  // Task 7.1: Email reply state (useReplyDraft: idle-save auto-draft)
  const {
    value: replyContent,
    onChange: onReplyContentChange,
    setValue: setReplyContent,
    saveStatus: emailDraftStatus,
    draftRestored: emailDraftRestored,
    dismissRestoreBanner: dismissEmailDraftBanner,
    clearDraft: clearEmailDraft,
  } = useReplyDraft(ticketId, "email");
  const [sendingReply, setSendingReply] = useState(false);
  const [replySuccess, setReplySuccess] = useState("");
  const [replyError, setReplyError] = useState("");
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [emailSignature, setEmailSignature] = useState("");

  // Merge state
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergedPanelExpanded, setMergedPanelExpanded] = useState(false);

  // Task 6.4: Source badge helper function
  const getSourceBadge = (source?: Ticket["submissionSource"]) => {
    const badges: Record<
      NonNullable<Ticket["submissionSource"]>,
      { icon: string; label: string; color: string; bgColor: string; tooltip: string }
    > = {
      online: {
        icon: "🌐",
        label: "Online",
        color: "#3B82F6",
        bgColor: "#DBEAFE",
        tooltip: "Submitted via online portal",
      },
      offline: {
        icon: "📍",
        label: "Offline",
        color: "#8B5CF6",
        bgColor: "#EDE9FE",
        tooltip: "Walk-in or phone submission",
      },
      email: {
        icon: "📧",
        label: "Mail",
        color: "#10B981",
        bgColor: "#D1FAE5",
        tooltip: "Created from email",
      },
      walk_in: {
        icon: "WI",
        label: "Walk-in",
        color: "#7C3AED",
        bgColor: "#EDE9FE",
        tooltip: "Created by staff from New Request",
      },
      ivr: {
        icon: "IV",
        label: "IVR",
        color: "#0F766E",
        bgColor: "#CCFBF1",
        tooltip: "Created from IVR call",
      },
      whatsapp: {
        icon: "WA",
        label: "WhatsApp",
        color: "#15803D",
        bgColor: "#DCFCE7",
        tooltip: "Created from WhatsApp",
      },
      sms: {
        icon: "SM",
        label: "SMS",
        color: "#B45309",
        bgColor: "#FEF3C7",
        tooltip: "Created from SMS",
      },
      chatbot: {
        icon: "CB",
        label: "Chatbot",
        color: "#4F46E5",
        bgColor: "#E0E7FF",
        tooltip: "Created from chatbot",
      },
    };
    return badges[source || "online"] || badges.online;
  };

  // Helper function to get status display name from numeric code
  const getStatusDisplayName = (statusCode: number | string) => {
    const code =
      typeof statusCode === "string" ? Number(statusCode) : statusCode;
    const status = statusOptions.find((s: any) => s.code === code);

    // If status found in options, return it
    if (status) return status.name;

    // Fallback to standard status names for common codes
    const standardStatuses: { [key: number]: string } = {
      1: "Open",
      2: "In Progress",
      3: "Pending",
      4: "Resolved",
      5: "Closed",
    };

    return standardStatuses[code] || `Status ${code}`;
  };

  // Helper function to format change history values (converts status IDs to names)
  const formatChangeValue = (field: string, value: any) => {
    if (!value) return value;

    // Convert status codes to names
    if (field === "Status" || field === "status") {
      return getStatusDisplayName(value);
    }

    return value;
  };

  // Function to calculate resolution time remaining
  const calculateResolutionTimeRemaining = () => {
    if (!ticket || !priorityData) return null;

    const createdAt = new Date(ticket.createdAt);
    const now = new Date();
    const elapsedMs = now.getTime() - createdAt.getTime();

    // Convert resolution time to milliseconds
    let resolutionMs = 0;
    if (priorityData.resolutionTime) {
      const { value, unit } = priorityData.resolutionTime;
      switch (unit) {
        case "minutes":
          resolutionMs = value * 60 * 1000;
          break;
        case "hours":
          resolutionMs = value * 60 * 60 * 1000;
          break;
        case "days":
          resolutionMs = value * 24 * 60 * 60 * 1000;
          break;
      }
    }

    const remainingMs = resolutionMs - elapsedMs;
    const isBreached = remainingMs <= 0;

    // Convert to hours and minutes
    const totalMinutes = Math.abs(Math.floor(remainingMs / (1000 * 60)));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return {
      hours,
      minutes,
      isBreached,
      displayText: isBreached
        ? `Overdue by ${hours}h ${minutes}m`
        : `${hours}h ${minutes}m remaining`,
    };
  };

  // Helper to extract projectId from ticket (can be in projectId or metadata.projectId)
  const getTicketProjectId = (t: Ticket | null): string | undefined => {
    if (!t) return undefined;
    if (t.projectId) {
      return typeof t.projectId === "object"
        ? (t.projectId as any)._id
        : t.projectId;
    }
    if (t.metadata?.projectId) {
      return t.metadata.projectId;
    }
    return undefined;
  };

  useEffect(() => {
    fetchTicketDetails();
    fetchUserPermissions();
  }, [ticketId]);

  // Realtime: join the ticket room so agent sees student replies without refreshing
  useSocket({
    rooms: ticketId ? [`ticket-${ticketId}`] : [],
    events: {
      "ticket-updated": (payload: any) => {
        // Reload full ticket details on any update (new reply, status change, etc.)
        fetchTicketDetails();
      },
    },
  });

  // Auto-escalation detection: Poll ticket status to detect if it was escalated away
  useEffect(() => {
    if (!ticket || !ticketId) return;

    // Get current user ID from localStorage
    const userStr = localStorage.getItem("user");
    const currentUserId = userStr ? JSON.parse(userStr)?._id : null;

    // Get ticket's current assignedTo ID
    const getAssignedToId = (t: Ticket | null) => {
      if (!t?.assignedTo) return null;
      return typeof t.assignedTo === "object"
        ? (t.assignedTo as any)._id
        : t.assignedTo;
    };

    const initialAssignedTo = getAssignedToId(ticket);

    // Only poll if the ticket is currently assigned to the logged-in user
    if (initialAssignedTo !== currentUserId) return;

    const pollInterval = setInterval(async () => {
      try {
        const token = localStorage.getItem("authToken");
        if (!token) return;

        const response = await axios.get(
          `${API_CONFIG.API_URL}/tickets/${ticketId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );

        if (response.data.success && response.data.data) {
          const updatedTicket = response.data.data;
          const newAssignedTo = getAssignedToId(updatedTicket);
          const newLevel = updatedTicket.currentEscalationLevelNumber;
          const oldLevel = ticket.currentEscalationLevelNumber;

          // Check if ticket was escalated (assigned to different user or level changed)
          if (newAssignedTo && newAssignedTo !== currentUserId) {
            clearInterval(pollInterval);

            // Show notification
            const levelChange =
              newLevel && oldLevel && newLevel !== oldLevel
                ? ` from Level ${oldLevel} to Level ${newLevel}`
                : "";

            alert(
              `This ticket has been escalated${levelChange} and is no longer assigned to you. Redirecting to ticket list...`,
            );

            // Redirect to ticket listing
            navigate(`/${customUrlPath}/portal/queries`);
          }
        }
      } catch (error) {
        // Silently fail - don't interrupt user workflow for polling errors
        console.debug("Auto-escalation poll error:", error);
      }
    }, 30000); // Poll every 30 seconds

    return () => clearInterval(pollInterval);
  }, [ticket?._id, ticketId, customUrlPath, navigate]);

  // Fetch master data when ticket is loaded (use ticket's projectId)
  useEffect(() => {
    console.log(
      "🔄 useEffect[ticket] running, ticket:",
      ticket?._id,
      "metadata:",
      ticket?.metadata,
    );
    const projectId = getTicketProjectId(ticket);
    console.log("🔍 getTicketProjectId returned:", projectId);
    if (projectId) {
      console.log(
        "📋 Ticket loaded, fetching master data with projectId:",
        projectId,
      );
      fetchMasterData(projectId);
    } else {
      console.warn("⚠️ No projectId found, skipping master data fetch");
    }
  }, [ticket]);

  // Fetch escalation matrix when ticket has escalationMatrixId
  useEffect(() => {
    const fetchEscalationMatrix = async () => {
      if (!ticket?.escalationMatrixId) return;

      // Extract _id if escalationMatrixId is an object
      const matrixId =
        typeof ticket.escalationMatrixId === "object"
          ? (ticket.escalationMatrixId as any)._id
          : ticket.escalationMatrixId;

      if (!matrixId) {
        console.warn("⚠️ No valid escalation matrix ID found");
        return;
      }

      try {
        const token = localStorage.getItem("authToken");
        const response = await axios.get(
          `${API_CONFIG.API_URL}/escalation-matrix/${matrixId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );

        if (response.data.success && response.data.data) {
          console.log("📋 Escalation Matrix loaded:", response.data.data);
          setEscalationMatrix(response.data.data);
        }
      } catch (error) {
        console.error("❌ Error fetching escalation matrix:", error);
      }
    };

    fetchEscalationMatrix();
  }, [ticket?.escalationMatrixId]);

  // Fetch working calendar for the project
  useEffect(() => {
    const fetchWorkingCalendar = async () => {
      const projectId = getTicketProjectId(ticket);
      if (!projectId) return;

      try {
        const token = localStorage.getItem("authToken");
        const response = await axios.get(
          `${API_CONFIG.API_URL}/working-calendars?projectId=${projectId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );

        if (response.data.success && response.data.data?.length > 0) {
          // Find the default calendar or use the first one
          const calendar =
            response.data.data.find((c: any) => c.isDefault) ||
            response.data.data[0];
          console.log("📅 Working Calendar loaded:", calendar);
          setWorkingCalendar(calendar);
        }
      } catch (error) {
        console.error("❌ Error fetching working calendar:", error);
      }
    };

    fetchWorkingCalendar();
  }, [ticket]);

  // US-ESC-009: force re-render every second so SLA countdowns include seconds
  useEffect(() => {
    const timer = setInterval(() => setTickNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Task 6.5: Fetch email communications when ticket loads or changes
  useEffect(() => {
    if (ticket && ticket.submissionSource === "email") {
      fetchEmailCommunications();
    }
  }, [ticket?.submissionSource, ticketId]);

  // Update priority data when ticket or slaRules change (no additional API call needed)
  useEffect(() => {
    if (!ticket?.priority || !slaRules.length) return;

    // Find the matching SLA rule by priority name from already-fetched slaRules
    const matchingSlaRule = slaRules.find(
      (rule: any) =>
        rule.priority?.name?.toUpperCase() === ticket.priority.toUpperCase(),
    );

    if (matchingSlaRule?.priority) {
      setPriorityData({
        name: matchingSlaRule.priority.name,
        code: ticket.priority.toUpperCase(),
        resolutionTime: {
          value: matchingSlaRule.resolutionTime?.value || 0,
          unit: matchingSlaRule.resolutionTime?.unit || "hours",
        },
      });
    }
  }, [ticket?.priority, slaRules]);

  const fetchTicketDetails = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("authToken");

      if (!token) {
        console.error("No authentication token found");
        alert("Session expired. Please log in again.");
        navigate(`/${customUrlPath}/portal/login`);
        return;
      }

      if (!ticketId) {
        console.error("No ticket ID provided");
        alert("Invalid ticket ID");
        navigate(
          isServiceRequestRoute
            ? `/${customUrlPath}/portal/service-requests`
            : `/${customUrlPath}/portal/tickets`,
        );
        return;
      }

      console.log(
        isServiceRequestRoute ? "Fetching service request:" : "Fetching ticket:",
        ticketId,
      );
      const responseData = isServiceRequestRoute
        ? await serviceRequestApi.get(ticketId)
        : (
            await axios.get(`${API_CONFIG.API_URL}/tickets/${ticketId}`, {
              headers: { Authorization: `Bearer ${token}` },
            })
          ).data;

      console.log("Ticket response:", responseData);

      if (responseData.success && responseData.data) {
        console.log(
          "📋 Setting ticket with status:",
          responseData.data.status,
        );
        setTicket(responseData.data);
      } else if (responseData && !responseData.success) {
        console.error("API returned error:", responseData.message);
        alert(`Error: ${responseData.message || "Failed to load ticket"}`);
      } else {
        // Handle case where data is directly in response
        setTicket(responseData);
      }
    } catch (error: any) {
      console.error("Error fetching ticket:", error);
      console.error("Error details:", {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });

      if (error.response?.status === 401) {
        alert("Session expired. Please log in again.");
        navigate(`/${customUrlPath}/portal/login`);
      } else if (error.response?.status === 403) {
        alert(
          isServiceRequestRoute
            ? "You do not have permission to view this service request."
            : "You do not have permission to view this ticket.",
        );
      } else if (error.response?.status === 404) {
        alert(isServiceRequestRoute ? "Service request not found" : "Ticket not found");
        navigate(
          isServiceRequestRoute
            ? `/${customUrlPath}/portal/service-requests`
            : `/${customUrlPath}/portal/tickets`,
        );
      } else if (error.request) {
        alert(
          "Cannot connect to server. Please check if the backend is running.",
        );
      } else {
        alert(`Error loading ticket: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // PERFORMANCE: Consolidated master data fetch using Promise.all for parallel requests
  const fetchMasterData = async (projectIdOverride?: string) => {
    try {
      const token = localStorage.getItem("authToken");
      const projectContext = JSON.parse(
        localStorage.getItem("projectContext") || "{}",
      );
      const headers = { Authorization: `Bearer ${token}` };

      // Use override projectId (from ticket) or fallback to context
      const projectId = projectIdOverride || projectContext.projectId;

      if (!projectId) {
        console.warn("⚠️ No projectId available, skipping master data fetch");
        return;
      }

      console.log("📋 Fetching master data for projectId:", projectId);

      // PERFORMANCE: Fetch all data in parallel using Promise.all
      const [ticketConfigRes, tagsRes] = await Promise.all([
        // Ticket settings (statuses, priorities, categories, SLA rules)
        axios.get(
          `${API_CONFIG.API_URL}/projects/${projectId}/ticket-settings`,
          { headers },
        ),
        // Available tags (non-critical, catch errors)
        axios
          .get(`${API_CONFIG.API_URL}/tickets/tags`, { headers })
          .catch((err) => {
            console.warn("⚠️ Error fetching tags (non-critical):", err.message);
            return { data: { data: [] } };
          }),
      ]);

      // Process ticket configuration
      if (ticketConfigRes.data.success && ticketConfigRes.data.data) {
        const ticketConfig = ticketConfigRes.data.data;
        console.log("📋 Ticket Config received:", {
          statuses: ticketConfig.allowedStatuses?.length,
          categories: ticketConfig.categories?.length,
          priorities: ticketConfig.allowedPriorities?.length,
          slaRules: ticketConfig.slaRules?.length,
        });

        if (ticketConfig.allowedStatuses?.length > 0) {
          console.log(
            "✅ Setting status options:",
            ticketConfig.allowedStatuses,
          );
          setStatusOptions(ticketConfig.allowedStatuses);
        } else {
          console.warn("⚠️ No statuses received from API");
        }

        if (ticketConfig.categories?.length > 0) {
          // Categories can be either objects {_id, name} or strings
          const mappedCats = ticketConfig.categories.map((cat: any) =>
            typeof cat === "string" ? { _id: cat, name: cat } : cat,
          );
          console.log("✅ Setting categories:", mappedCats);
          setCategories(mappedCats);
        } else {
          console.warn("⚠️ No categories received from API");
        }

        const apiPriorities = Array.isArray(ticketConfig.allowedPriorities)
          ? ticketConfig.allowedPriorities
            .map((p: any) =>
              String(p || "")
                .trim()
                .toUpperCase(),
            )
            .filter((p: string) => p.length > 0)
          : [];

        const currentTicketPriority = String(ticket?.priority || "")
          .trim()
          .toUpperCase();

        const mergedPriorities = [
          ...new Set(
            [
              ...apiPriorities,
              currentTicketPriority && currentTicketPriority.length > 0
                ? currentTicketPriority
                : undefined,
            ].filter(Boolean),
          ),
        ] as string[];

        if (mergedPriorities.length > 0) {
          console.log("✅ Setting priority options:", mergedPriorities);
          setPriorityOptions(mergedPriorities);
        } else {
          console.warn("⚠️ No priorities received from API");
        }

        if (ticketConfig.slaRules?.length > 0) {
          console.log("✅ Setting SLA rules:", ticketConfig.slaRules);
          setSlaRules(ticketConfig.slaRules);
        }
      } else {
        console.error(
          "❌ Ticket config response failed:",
          ticketConfigRes.data,
        );
      }

      // Process tags
      setAvailableTags(tagsRes.data.data || []);
    } catch (error) {
      console.error("❌ Error fetching master data:", error);
      if (axios.isAxiosError(error)) {
        console.error("❌ Response:", error.response?.data);
      }
    }
  };

  const fetchUserPermissions = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await axios.get(`${API_CONFIG.API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.data.success && response.data.data) {
        const userPermissions = response.data.data.role?.permissions || [];
        console.log("🔐 User Permissions Loaded:", userPermissions);
        console.log(
          "✅ Has TICKET_ESCALATE?",
          userPermissions.includes("TICKET_ESCALATE"),
        );
        setPermissions(userPermissions);

        // Task 6.4: Store user role for SLA level calculation
        const role = response.data.data.role;
        if (role) {
          setUserRole({ _id: role._id, name: role.name, code: role.code });
          console.log("👤 User Role:", role.name, role.code);
        }
      }
    } catch (error) {
      console.error("Error fetching user permissions:", error);
    }
  };

  // --- Reassign helpers ---
  const openReassignModal = async () => {
    setReassignDepartmentId("");
    setReassignAgents([]);
    setReassignAgentId("");
    setReassignReason("");
    setDeptSearch("");
    setDeptDropdownOpen(false);
    setAgentSearch("");
    setAgentDropdownOpen(false);
    // Fetch departments for the ticket's project
    const projId = ticketProjectId;
    if (projId) {
      try {
        const token = localStorage.getItem("authToken");
        const res = await axios.get(
          `${API_CONFIG.API_URL}/departments/project/${projId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        setReassignDepartments(res.data.data || []);
      } catch {
        setReassignDepartments([]);
      }
    } else {
      setReassignDepartments([]);
    }
    setShowReassignModal(true);
  };

  const fetchReassignAgents = async (departmentId: string) => {
    if (!departmentId) {
      setReassignAgents([]);
      return;
    }
    setReassignLoadingAgents(true);
    try {
      const token = localStorage.getItem("authToken");
      const res = await axios.get(
        `${API_CONFIG.API_URL}/tickets/assignable-agents`,
        {
          headers: { Authorization: `Bearer ${token}` },
          // Pass ticketId so the backend can scope agents to the ticket's center/venue
          params: { departmentId, ticketId: ticketId || ticket?._id },
        },
      );
      setReassignAgents(res.data.data || []);
    } catch (e: any) {
      setReassignAgents([]);
      // An empty list reads as "nobody to assign to"; say what really happened.
      alert(
        e?.response?.data?.message ||
          "Could not load the users for this department.",
      );
    } finally {
      setReassignLoadingAgents(false);
    }
  };

  const submitReassign = async () => {
    if (!reassignAgentId) return;
    setReassignLoading(true);
    try {
      const token = localStorage.getItem("authToken");
      const res = await axios.patch(
        `${API_CONFIG.API_URL}/tickets/${ticketId}/reassign`,
        { newAgentId: reassignAgentId, reason: reassignReason.trim() },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.data.success) {
        setShowReassignModal(false);
        navigate(`/${customUrlPath}/portal/tickets/my-tickets`);
      }
    } catch (err: any) {
      alert(err?.response?.data?.message || "Failed to reassign ticket");
    } finally {
      setReassignLoading(false);
    }
  };

  // Task 6.5: Fetch email communications
  const fetchEmailCommunications = async () => {
    if (
      !ticketId ||
      !ticket?.submissionSource ||
      ticket.submissionSource !== "email"
    ) {
      // Only fetch for email tickets
      return;
    }

    setLoadingEmails(true);
    try {
      const token = localStorage.getItem("authToken");
      const response = await axios.get(
        `${API_CONFIG.API_URL}/tickets/${ticketId}/communications`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (response.data.success) {
        setEmailCommunications(response.data.data || []);
      }
    } catch (error) {
      console.error("Error fetching email communications:", error);
    } finally {
      setLoadingEmails(false);
    }
  };

  // Task 7.1: Send email reply
  const handleOpenReplyForm = async () => {
    // Fetch project email signature if not already loaded
    let sig = emailSignature;
    if (!sig && ticketProjectId) {
      try {
        const token = localStorage.getItem("authToken");
        const res = await fetch(
          `/api/projects/${ticketProjectId}/email-configs`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (res.ok) {
          const json = await res.json();
          const configs: any[] = json.data || [];
          // Use the first enabled config's signature
          const activeConfig = configs.find((c) => c.isEnabled) || configs[0];
          sig = activeConfig?.replySignature || "";
          setEmailSignature(sig);
        }
      } catch {
        // Signature fetch failure is non-critical; proceed without one
      }
    }
    // Do NOT clear replyContent here — preserve any restored draft
    setShowReplyForm(true);
  };

  const handleSendReply = async () => {
    if (!replyContent.trim() || !ticket) {
      setReplyError("Reply content is required");
      return;
    }

    // Validate ticket is from email source
    if (ticket.submissionSource !== "email" || !ticket.sourceEmail) {
      setReplyError(
        "Cannot send email reply: This ticket was not created via email",
      );
      return;
    }

    setSendingReply(true);
    setReplyError("");
    setReplySuccess("");

    try {
      const token = localStorage.getItem("authToken");

      // Get the original message ID for threading
      const originalMessageId =
        ticket.sourceEmailMessageId ||
        (emailCommunications.length > 0
          ? emailCommunications[0].messageId
          : undefined);

      // Build HTML body: agent message text + HTML signature (stored as rich HTML from editor)
      const agentMsgHtml = replyContent
        .trim()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br>");
      const replyContentHtml = emailSignature
        ? `${agentMsgHtml}<br><br>${emailSignature}`
        : agentMsgHtml;

      const response = await axios.post(
        `${API_CONFIG.API_URL}/tickets/${ticket._id}/reply-email`,
        {
          replyContent: replyContent.trim(),
          replyContentHtml,
          inReplyToMessageId: originalMessageId,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (response.data.success) {
        setReplySuccess("Email reply sent successfully!");
        await clearEmailDraft(); // Clear draft + localStorage + backend
        setShowReplyForm(false); // Hide form

        // Refresh email communications to show the new reply
        await fetchEmailCommunications();

        // Clear success message after 3 seconds
        setTimeout(() => {
          setReplySuccess("");
        }, 3000);
      } else {
        setReplyError(response.data.error || "Failed to send reply");
      }
    } catch (error: any) {
      console.error("Error sending email reply:", error);
      const errorMessage =
        error.response?.data?.error ||
        error.response?.data?.details ||
        "Failed to send email reply. Please try again.";
      setReplyError(errorMessage);
    } finally {
      setSendingReply(false);
    }
  };

  // Toggle email expand/collapse
  const toggleEmailExpanded = (emailId: string) => {
    setExpandedEmails((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(emailId)) {
        newSet.delete(emailId);
      } else {
        newSet.add(emailId);
      }
      return newSet;
    });
  };

  const handleUpdateStatus = async (
    statusOverride?: string | number,
    statusRemark?: string,
    committedDate?: string,
  ) => {
    if (!ticket) return;

    const statusToUpdate =
      statusOverride !== undefined ? statusOverride : newStatus;
    if (!statusToUpdate && statusToUpdate !== 0) return; // Allow 0 as a valid status

    // Convert to number (status codes are now numeric: 1=open, 2=in-progress, 3=on-hold, 4=resolved, 5=closed)
    let statusCode: number;
    if (typeof statusToUpdate === "string") {
      statusCode = Number(statusToUpdate);
      if (isNaN(statusCode)) {
        console.error("❌ Invalid status value:", statusToUpdate);
        return;
      }
    } else {
      statusCode = statusToUpdate;
    }

    const fromLabel = getStatusDisplayName(ticket.status);
    const toLabel = getStatusDisplayName(statusCode);

    // If the target status requires a remark and one hasn't been supplied yet, open the remark modal
    const targetStatusOption = statusOptions.find(
      (s: any) => s.code === statusCode,
    );
    // A status may ask for a remark, a committed date, or both.
    const needsRemark = !!targetStatusOption?.requireClosingRemark;
    const needsDate = !!targetStatusOption?.requireCommittedDate;
    if ((needsRemark && !statusRemark) || (needsDate && !committedDate)) {
      setRemarkModal({
        open: true,
        targetStatusCode: statusCode,
        fromLabel,
        toLabel,
        remark: "",
        remarkDate: new Date().toISOString().slice(0, 10),
        needsRemark,
        needsDate,
        dateLabel:
          targetStatusOption?.committedDateLabel || "Committed date",
      });
      return;
    }

    console.log("🔄 Updating status to:", statusToUpdate, "→", statusCode);
    console.log("🔍 Type of statusCode:", typeof statusCode);
    console.log("🔍 Status options available:", statusOptions);

    setIsFieldUpdating(true);
    try {
      const token = localStorage.getItem("authToken");
      const body: any = { status: statusCode };
      if (statusRemark) body.statusRemark = statusRemark;
      if (committedDate) body.committedDate = committedDate;
      console.log("📤 Sending PATCH request with body:", body);
      const response = await axios.patch(
        `${API_CONFIG.API_URL}/tickets/${ticket._id}/status`,
        body,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      console.log("✅ Status update response:", response.data);

      // Refresh ticket details to get updated data
      await fetchTicketDetails();

      console.log("🔄 Ticket refreshed, new status should be:", statusToUpdate);

      setIsEditingStatus(false);
      setNewStatus("");
      setSuccessModal({
        open: true,
        message: `Status changed from "${fromLabel}" to "${toLabel}" successfully.`,
      });
    } catch (error) {
      console.error("❌ Error updating status:", error);
      alert("Failed to update status");
    } finally {
      setIsFieldUpdating(false);
    }
  };

  const handleUpdateCategory = async (
    categoryOverride?: string,
    fromName?: string,
    toName?: string,
  ) => {
    const categoryToUpdate = categoryOverride || newCategory;
    if (!categoryToUpdate || !ticket) return;

    console.log("🔄 Updating category to:", categoryToUpdate);

    setIsFieldUpdating(true);
    try {
      const token = localStorage.getItem("authToken");
      const response = await axios.patch(
        `${API_CONFIG.API_URL}/tickets/${ticket._id}/category`,
        { category: categoryToUpdate },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      console.log("✅ Category update response:", response.data);

      // Refresh ticket details to get updated data
      await fetchTicketDetails();

      console.log(
        "🔄 Ticket refreshed, new category should be:",
        categoryToUpdate,
      );

      setIsEditingCategory(false);
      setNewCategory("");
      setSuccessModal({
        open: true,
        message:
          fromName && toName
            ? `Category changed from "${fromName}" to "${toName}" successfully.`
            : "Category updated successfully.",
      });
    } catch (error) {
      console.error("❌ Error updating category:", error);
      alert("Failed to update category");
    } finally {
      setIsFieldUpdating(false);
    }
  };

  const handleUpdateCategoryHierarchy = async (
    hierarchyValue: CategoryHierarchyValue,
    fromPath?: string,
    toPath?: string,
  ) => {
    if (!hierarchyValue || !ticket) return;

    console.log("🔄 Updating category hierarchy to:", hierarchyValue);

    setIsFieldUpdating(true);
    try {
      const token = localStorage.getItem("authToken");
      const response = await axios.patch(
        `${API_CONFIG.API_URL}/tickets/${ticket._id}/category-hierarchy`,
        { categoryHierarchy: hierarchyValue },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      console.log("✅ Category hierarchy update response:", response.data);

      // Refresh ticket details to get updated data
      await fetchTicketDetails();

      console.log("🔄 Ticket refreshed with new category hierarchy");
      setSuccessModal({
        open: true,
        message:
          fromPath && toPath
            ? `Category changed from "${fromPath}" to "${toPath}" successfully.`
            : "Category updated successfully.",
      });
    } catch (error) {
      console.error("❌ Error updating category hierarchy:", error);
      alert("Failed to update category hierarchy");
    } finally {
      setIsFieldUpdating(false);
    }
  };

  const handleUpdatePriority = async (priorityOverride?: string) => {
    const priorityToUpdate = priorityOverride || newPriority;
    if (!priorityToUpdate || !ticket) return;

    const fromPriority = ticket.priority;

    console.log("🔄 Updating priority to:", priorityToUpdate);

    setIsFieldUpdating(true);
    try {
      const token = localStorage.getItem("authToken");
      const response = await axios.patch(
        `${API_CONFIG.API_URL}/tickets/${ticket._id}/priority`,
        { priority: priorityToUpdate },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      console.log("✅ Priority update response:", response.data);

      // Refresh ticket details to get updated data
      await fetchTicketDetails();

      console.log(
        "🔄 Ticket refreshed, new priority should be:",
        priorityToUpdate,
      );

      setIsEditingPriority(false);
      setNewPriority("");
      setSuccessModal({
        open: true,
        message: `Priority changed from "${fromPriority}" to "${priorityToUpdate}" successfully.`,
      });
    } catch (error) {
      console.error("❌ Error updating priority:", error);
      alert("Failed to update priority");
    } finally {
      setIsFieldUpdating(false);
    }
  };

  const handleAddTag = async () => {
    if (!newTag || !ticket) return;

    try {
      const token = localStorage.getItem("authToken");
      const response = await axios.post(
        `${API_CONFIG.API_URL}/tickets/${ticket._id}/tags`,
        { tag: newTag },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      setTicket({ ...ticket, tags: [...(ticket.tags || []), newTag] });
      setIsAddingTag(false);
      setNewTag("");
      // Refresh available tags
      fetchMasterData();
    } catch (error) {
      console.error("Error adding tag:", error);
      alert("Failed to add tag");
    }
  };

  const handleRemoveTag = async (tag: string) => {
    if (!ticket) return;

    try {
      const token = localStorage.getItem("authToken");
      await axios.delete(
        `${API_CONFIG.API_URL}/tickets/${ticket._id}/tags/${tag}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      setTicket({ ...ticket, tags: ticket.tags?.filter((t) => t !== tag) });
    } catch (error) {
      console.error("Error removing tag:", error);
      alert("Failed to remove tag");
    }
  };

  const handleSubmitReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyMessage.trim() || !ticket) return;

    setIsSubmittingReply(true);
    try {
      const token = localStorage.getItem("authToken");
      const formData = new FormData();
      formData.append("message", replyMessage);
      formData.append("isInternal", "false");

      if (replyFiles) {
        Array.from(replyFiles).forEach((file) => {
          formData.append("attachments", file);
        });
      }

      await axios.post(
        `${API_CONFIG.API_URL}/tickets/${ticket._id}/reply`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "multipart/form-data",
          },
        },
      );

      await clearReplyDraft(); // Clear draft + localStorage + backend
      setReplyFiles(null);
      fetchTicketDetails();
    } catch (error) {
      console.error("Error submitting reply:", error);
      alert("Failed to submit reply");
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim() || !ticket) return;

    setIsAddingNote(true);
    try {
      const token = localStorage.getItem("authToken");
      await axios.post(
        `${API_CONFIG.API_URL}/tickets/${ticket._id}/notes`,
        { note: noteText },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      setNoteText("");
      fetchTicketDetails();
    } catch (error) {
      console.error("Error adding note:", error);
      alert("Failed to add internal note");
    } finally {
      setIsAddingNote(false);
    }
  };

  const getStatusColor = (status: number | string) => {
    const statusCode = typeof status === "string" ? Number(status) : status;
    const colors: Record<number, string> = {
      1: "bg-yellow-100 text-yellow-800 border-yellow-300", // open
      2: "bg-blue-100 text-blue-800 border-blue-300", // in-progress
      3: "bg-pink-100 text-pink-800 border-pink-300", // on-hold
      4: "bg-green-100 text-green-800 border-green-300", // resolved
      5: "bg-gray-100 text-gray-800 border-gray-300", // closed
    };
    return colors[statusCode] || colors[1]; // Default to 'open' style
  };

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      Critical: "bg-red-100 text-red-800",
      critical: "bg-red-100 text-red-800",
      Urgent: "bg-orange-100 text-orange-800",
      urgent: "bg-orange-100 text-orange-800",
      High: "bg-yellow-100 text-yellow-800",
      high: "bg-yellow-100 text-yellow-800",
      Normal: "bg-blue-100 text-blue-800",
      Medium: "bg-blue-100 text-blue-800",
      medium: "bg-blue-100 text-blue-800",
      Low: "bg-gray-100 text-gray-800",
      low: "bg-gray-100 text-gray-800",
    };
    return colors[priority] || colors["Normal"];
  };

  if (loading) {
    const loadingContent = (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
    return wrapWithLayout ? (
      <DashboardLayout>{loadingContent}</DashboardLayout>
    ) : (
      loadingContent
    );
  }

  if (!ticket) {
    const errorContent = (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <XCircleIcon className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Query Not Found
          </h2>
          <p className="text-gray-600 mb-4">
            The query you're looking for doesn't exist or you don't have access.
          </p>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
    return wrapWithLayout ? (
      <DashboardLayout>{errorContent}</DashboardLayout>
    ) : (
      errorContent
    );
  }

  // Ownership: an agent may act on a query only when it's assigned to them, or
  // when they hold TICKET_MODIFY_ANY (supervisor capability). Otherwise the
  // query is read-only. (The backend enforces the same rule.)
  const ticketAssigneeId =
    typeof ticket.assignedTo === "object"
      ? (ticket.assignedTo as any)?._id
      : (ticket.assignedTo as any);
  // A PSR/ISR is judged by the SR permission set, a normal query by the ticket
  // set — holding the run of the query desk grants nothing over service
  // requests. (The backend enforces the same split.)
  const recordType = (ticket as any)?.interactionType;
  // A PSR/ISR changes status only through the SR lifecycle panel, which
  // applies the WIP commitment, remark and re-open rules. The generic status
  // controls below know none of those, so they are not offered for one.
  const isSr = recordType === "PSR" || recordType === "ISR";

  // Query rules configured on the statuses (Query Config → Ticket Statuses):
  // which statuses may follow the current one, and who may apply each. The
  // server enforces the same; this only keeps unusable choices out of view.
  const isSuperAdminUser = (() => {
    try {
      const u = JSON.parse(localStorage.getItem("user") || "{}");
      return (u?.role?.code || u?.roleCode) === "SUPER_ADMIN";
    } catch {
      return false;
    }
  })();
  const queryStatusAllowed = (code: number) => {
    const cur = Number(ticket?.status);
    if (code === cur) return true; // the select still shows where it is now
    const curRule = statusOptions.find((s: any) => Number(s.code) === cur)?.rules?.query;
    if (curRule?.restrictNext && !(curRule.allowedNext || []).map(Number).includes(code))
      return false;
    const target = statusOptions.find((s: any) => Number(s.code) === code)?.rules?.query;
    // The target may also state which statuses it can follow.
    if (target?.restrictPrev && !(target.allowedPrev || []).map(Number).includes(cur))
      return false;
    const perm = target?.permission;
    return !perm || isSuperAdminUser || permissions.includes(perm);
  };
  // A linked ISR sits under a parent ticket. The relation used to be visible
  // only from the parent's Linked ISRs tab, so a child read as a standalone
  // ticket; surface it here too.
  const linkedParent = (() => {
    const p = (ticket as any)?.linkedPsrId;
    return p && typeof p === "object" && p.ticketNumber ? p : null;
  })();
  const canModify =
    canDo(permissions, "MODIFY_ANY", recordType) ||
    (!!currentUserId && !!ticketAssigneeId && ticketAssigneeId === currentUserId);
  const assigneeName =
    typeof ticket.assignedTo === "object" && ticket.assignedTo
      ? `${(ticket.assignedTo as any).firstName ?? ""} ${(ticket.assignedTo as any).lastName ?? ""}`.trim()
      : "";

  const content = (
    <>
      <div className="min-h-screen bg-gray-50">
        {/* Read-only banner when the query isn't assigned to the current agent */}
        {!canModify && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 text-sm text-amber-800 flex items-center gap-2">
            <span aria-hidden>🔒</span>
            <span>
              View only — this query is
              {assigneeName ? ` assigned to ${assigneeName}` : " not assigned to you"}
              . You can read it but can't comment, reply, or make changes.
            </span>
          </div>
        )}
        {/* Parent link — this record was raised under another ticket */}
        {linkedParent && (
          <div className="bg-indigo-50 border-b border-indigo-200 px-6 py-2.5 text-sm text-indigo-900 flex items-center gap-2">
            <span aria-hidden>🔗</span>
            <span>
              This {recordType === "ISR" ? "ISR" : "request"} is linked under{" "}
              <button
                onClick={() => navigate(detailPathFor(String(linkedParent._id)))}
                className="font-semibold underline hover:no-underline"
              >
                {linkedParent.ticketNumber}
              </button>
              {linkedParent.subject ? ` — ${linkedParent.subject}` : ""}
            </span>
          </div>
        )}
        {/* Header — stacks directly below the 64px DashboardLayout top bar */}
        <div className="bg-white border-b border-gray-200 sticky top-16 z-40">
          <div className="px-6">
            <div className="flex items-center justify-between py-3 gap-4">
              {/* Left: back button + ticket info */}
              <div className="flex items-start gap-4 min-w-0">
                {/* Back button — top-aligned, nudged down to sit level with the h1 */}
                <button
                  onClick={() => navigate(-1)}
                  className="flex-shrink-0 mt-1 p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Go back"
                >
                  <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
                </button>

                {/* Prev / Next — navigate within the list the user came from */}
                {(prevTicketId || nextTicketId) && (
                  <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                    <button
                      onClick={() =>
                        prevTicketId &&
                        navigate(detailPathFor(prevTicketId), { replace: true })
                      }
                      disabled={!prevTicketId}
                      className="px-2 py-1 text-xs font-medium rounded-md border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      title="Previous ticket"
                    >
                      ‹ Prev
                    </button>
                    <button
                      onClick={() =>
                        nextTicketId &&
                        navigate(detailPathFor(nextTicketId), { replace: true })
                      }
                      disabled={!nextTicketId}
                      className="px-2 py-1 text-xs font-medium rounded-md border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      title="Next ticket"
                    >
                      Next ›
                    </button>
                  </div>
                )}

                {/* Divider */}
                <div className="hidden sm:block mt-0.5 h-8 w-px bg-gray-200 flex-shrink-0" />

                {/* Ticket number + badges + created date */}
                <div className="min-w-0">
                  {/* Row 1: number + status + priority + source */}
                  <div className="flex items-center flex-wrap gap-2">
                    <h1 className="text-xl font-bold text-gray-900 whitespace-nowrap">
                      #{ticket.ticketNumber}
                    </h1>
                    <span
                      className="px-2.5 py-0.5 rounded-full text-xs font-semibold border"
                      style={{
                        color:
                          ticketInteractionType === "Normal" ? "#334155" : "#4338ca",
                        background:
                          ticketInteractionType === "Normal" ? "#f8fafc" : "#eef2ff",
                        borderColor:
                          ticketInteractionType === "Normal" ? "#cbd5e1" : "#c7d2fe",
                      }}
                    >
                      {ticketInteractionType}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getStatusColor(ticket.status)}`}
                    >
                      {getStatusDisplayName(ticket.status)}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${getPriorityColor(ticket.priority)}`}
                    >
                      {ticket.priority.charAt(0).toUpperCase() +
                        ticket.priority.slice(1).toLowerCase()}
                    </span>
                    {/* Source badge */}
                    {(() => {
                      const sourceBadge = getSourceBadge(
                        ticket.submissionSource,
                      );
                      return (
                        <span
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold"
                          style={{
                            color: sourceBadge.color,
                            backgroundColor: sourceBadge.bgColor,
                            border: `1px solid ${sourceBadge.color}40`,
                          }}
                          title={sourceBadge.tooltip}
                        >
                          <span>{sourceBadge.icon}</span>
                          <span>{sourceBadge.label}</span>
                        </span>
                      );
                    })()}
                    {/* Centre badge — shown for tickets raised at an offline centre */}
                    {(() => {
                      const c: any = ticket.metadata?.centerId;
                      const centerName =
                        c && typeof c === "object" ? c.centerName : undefined;
                      if (!centerName) return null;
                      return (
                        <span
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold"
                          style={{
                            color: "#92400E",
                            backgroundColor: "#FEF3C7",
                            border: "1px solid #FCD34D80",
                          }}
                          title="Centre where this ticket was created"
                        >
                          <span>📍</span>
                          <span>
                            {centerName}
                            {c.city ? ` · ${c.city}` : ""}
                          </span>
                        </span>
                      );
                    })()}
                  </div>

                  {/* Row 2: created date + optional sender email */}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <p className="text-xs text-gray-500">
                      Created {new Date(ticket.createdAt).toLocaleString()}
                    </p>
                    {ticket.submissionSource === "email" &&
                      ticket.sourceEmail && (
                        <>
                          <span className="text-gray-300">•</span>
                          <span className="text-xs text-gray-500">From:</span>
                          <a
                            href={`mailto:${ticket.sourceEmail}`}
                            className="text-xs text-blue-600 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {ticket.sourceEmail}
                          </a>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(
                                ticket.sourceEmail || "",
                              );
                            }}
                            className="text-xs px-1.5 py-0.5 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                            title="Copy email"
                          >
                            📋
                          </button>
                        </>
                      )}
                    {/* US-ESC-009: SLA countdown pill */}
                    {(() => {
                      const pill = computeDetailSlaPill(ticket);
                      if (!pill) return null;
                      return (
                        <>
                          <span className="text-gray-300">•</span>
                          <span
                            title={pill.tooltip}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              padding: "2px 8px",
                              borderRadius: "9999px",
                              fontSize: "11px",
                              fontWeight: 600,
                              color: pill.color,
                              backgroundColor: pill.bg,
                              border: `1px solid ${pill.color}40`,
                              cursor: "default",
                              whiteSpace: "nowrap",
                            }}
                          >
                            ⏱ SLA: {pill.label}
                          </span>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Right: Merge button */}
              {canDo(permissions, "MERGE", recordType) && !ticket.isMerged && (
                <button
                  onClick={() => setShowMergeModal(true)}
                  className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors"
                >
                  <ArrowsPointingInIcon className="h-4 w-4" />
                  Merge Ticket
                </button>
              )}
            </div>
          </div>
        </div>
        {/* Merged-into banner — shown when this ticket is a secondary merged ticket */}
        {ticket.isMerged && ticket.mergedInto && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
            <div className="max-w-7xl mx-auto flex items-center gap-3">
              <span className="text-amber-600 font-bold text-lg">⚠</span>
              <p className="text-sm text-amber-800">
                This ticket has been merged into{" "}
                <button
                  onClick={() => {
                    const primary = ticket.mergedInto;
                    const primaryId =
                      typeof primary === "object" ? primary._id : primary;
                    navigate(`/tickets/${primaryId}`);
                  }}
                  className="font-bold underline hover:text-amber-900"
                >
                  {typeof ticket.mergedInto === "object"
                    ? ticket.mergedInto.ticketNumber
                    : "the primary ticket"}
                </button>
                . All further updates are tracked there. Actions on this ticket
                are disabled.
              </p>
            </div>
          </div>
        )}
        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Merged tickets panel — shown on the primary ticket */}
              {!ticket.isMerged &&
                ticket.mergedTickets &&
                ticket.mergedTickets.length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-purple-100">
                    <button
                      className="w-full flex items-center justify-between px-6 py-4 text-left"
                      onClick={() => setMergedPanelExpanded((e) => !e)}
                    >
                      <div className="flex items-center gap-2">
                        <ArrowsPointingInIcon className="h-5 w-5 text-purple-600" />
                        <span className="font-semibold text-gray-900">
                          Merged Tickets ({ticket.mergedTickets.length})
                        </span>
                      </div>
                      <span className="text-gray-400 text-sm">
                        {mergedPanelExpanded ? "▲" : "▼"}
                      </span>
                    </button>
                    {mergedPanelExpanded && (
                      <div className="border-t border-gray-100 divide-y divide-gray-100">
                        {ticket.mergedTickets.map((m) => {
                          const statusLabels: Record<number, string> = {
                            1: "Open",
                            2: "In Progress",
                            3: "Pending",
                            4: "Resolved",
                            5: "Closed",
                          };
                          const statusNum =
                            typeof m.status === "string"
                              ? Number(m.status)
                              : (m.status as number);
                          const statusLabel =
                            statusLabels[statusNum] ?? String(m.status);
                          const statusColors: Record<number, string> = {
                            1: "bg-blue-100 text-blue-700",
                            2: "bg-yellow-100 text-yellow-700",
                            3: "bg-orange-100 text-orange-700",
                            4: "bg-green-100 text-green-700",
                            5: "bg-gray-100 text-gray-600",
                          };
                          const statusColor =
                            statusColors[statusNum] ??
                            "bg-gray-100 text-gray-600";
                          const priorityColor: Record<string, string> = {
                            LOW: "bg-slate-100 text-slate-600",
                            MEDIUM: "bg-yellow-100 text-yellow-700",
                            HIGH: "bg-orange-100 text-orange-700",
                            CRITICAL: "bg-red-100 text-red-700",
                          };
                          const catName = m.category
                            ? typeof m.category === "string"
                              ? m.category
                              : (m.category as any).name
                            : null;
                          return (
                            <div key={m._id} className="px-6 py-4">
                              {/* Header row */}
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                  <button
                                    onClick={() =>
                                      navigate(`/tickets/${m._id}`)
                                    }
                                    className="font-semibold text-purple-700 hover:underline text-sm"
                                  >
                                    #{m.ticketNumber}
                                  </button>
                                  <p className="text-sm font-medium text-gray-900 mt-0.5 line-clamp-2">
                                    {m.subject ?? m.title ?? "—"}
                                  </p>
                                </div>
                                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                  <span
                                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor}`}
                                  >
                                    {statusLabel}
                                  </span>
                                  {m.priority && (
                                    <span
                                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityColor[m.priority.toUpperCase()] ?? "bg-gray-100 text-gray-600"}`}
                                    >
                                      {m.priority}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {/* Meta row */}
                              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                                {m.assignedTo && (
                                  <span>
                                    <span className="font-medium text-gray-600">
                                      Assigned:
                                    </span>{" "}
                                    {m.assignedTo.firstName}{" "}
                                    {m.assignedTo.lastName}
                                  </span>
                                )}
                                {catName && (
                                  <span>
                                    <span className="font-medium text-gray-600">
                                      Category:
                                    </span>{" "}
                                    {catName}
                                  </span>
                                )}
                                {m.createdAt && (
                                  <span>
                                    <span className="font-medium text-gray-600">
                                      Created:
                                    </span>{" "}
                                    {new Date(m.createdAt).toLocaleDateString()}
                                  </span>
                                )}
                                {m.mergedAt && (
                                  <span>
                                    <span className="font-medium text-gray-600">
                                      Merged:
                                    </span>{" "}
                                    {new Date(m.mergedAt).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

              {isSrDetailTicket && (
                <PsrDetailLayout
                  ticket={ticket}
                  config={srConfig}
                  onChanged={fetchTicketDetails}
                />
              )}

              {/* Ticket Details Card */}
              <div className="relative bg-white rounded-2xl border border-gray-100 shadow-[0_10px_30px_rgba(15,23,42,0.05)] overflow-hidden">
                {/* gradient accent rail */}
                <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-blue-500 via-indigo-500 to-violet-500" />

                <div className="p-6 sm:p-8 pl-7 sm:pl-9">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                      <TicketIcon className="h-4 w-4" />
                    </span>
                    <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">
                      Subject
                    </span>
                  </div>
                  <h2 className="text-2xl font-bold leading-snug tracking-tight text-gray-900">
                    {ticket.title || ticket.subject || "No Subject"}
                  </h2>

                  <div className="my-6 h-px bg-gradient-to-r from-gray-200 via-gray-100 to-transparent" />

                  <div className="flex items-center gap-2 mb-4">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-violet-50 text-violet-600 ring-1 ring-violet-100">
                      <DocumentTextIcon className="h-4 w-4" />
                    </span>
                    <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">
                      Description
                    </span>
                  </div>
                  {ticket.description &&
                  (ticket.title || ticket.subject || ticket.description).trim() ? (
                    <div className="rounded-xl bg-gray-50/70 border border-gray-100 p-5">
                      {/<[a-z][\s\S]*>/i.test(ticket.description || "") ? (
                        <div
                          className="prose prose-sm max-w-none text-gray-700 leading-relaxed"
                          dangerouslySetInnerHTML={{
                            __html: DOMPurify.sanitize(ticket.description || ""),
                          }}
                        />
                      ) : (
                        <p className="text-[15px] text-gray-700 leading-7 whitespace-pre-wrap">
                          {stripEmailBoilerplateFE(ticket.description || "")}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 italic">
                      No description provided.
                    </p>
                  )}
                </div>

                {ticket.attachments && ticket.attachments.length > 0 && (
                  <div className="px-6 sm:px-8 pl-7 sm:pl-9 pb-7 pt-6 border-t border-gray-100">
                    <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400 mb-3">
                      Attachments
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {ticket.attachments.map((attachment, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => openAttachment(attachment.path)}
                          className="flex items-center space-x-2 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left w-full"
                        >
                          <PaperClipIcon className="h-5 w-5 text-gray-400 flex-shrink-0" />
                          <span className="text-sm text-gray-700 truncate">
                            {attachment.filename}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Latest Reply and Internal Note - Always Visible */}
              {(ticket.threads && ticket.threads.length > 0) ||
                (ticket.internalNotes && ticket.internalNotes.length > 0) ? (
                <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Recent Activity
                  </h3>

                  {/* Latest Reply */}
                  {ticket.threads &&
                    ticket.threads.length > 0 &&
                    (() => {
                      const latestReply = [...ticket.threads].sort(
                        (a, b) =>
                          new Date(b.createdAt).getTime() -
                          new Date(a.createdAt).getTime(),
                      )[0];

                      return (
                        <div className="border-l-4 border-blue-500 pl-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center space-x-2">
                              <ChatBubbleLeftRightIcon className="h-5 w-5 text-blue-600" />
                              <span className="text-sm font-semibold text-gray-900">
                                Latest Reply
                              </span>
                            </div>
                            <span className="text-xs text-gray-500">
                              {new Date(latestReply.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <div className="bg-blue-50 rounded-lg p-3">
                            <p className="text-xs font-medium text-gray-700 mb-1">
                              {`${latestReply.createdBy?.firstName ?? ""} ${latestReply.createdBy?.lastName ?? ""
                                }`.trim() || "User"}
                              {latestReply.createdBy?.role && (
                                <span className="text-gray-500">
                                  {" "}
                                  •{" "}
                                  {typeof latestReply.createdBy.role ===
                                    "string"
                                    ? latestReply.createdBy.role
                                    : (latestReply.createdBy.role as any).name}
                                </span>
                              )}
                            </p>
                            <div className="text-sm text-gray-800 line-clamp-3">
                              {/<[a-z][\s\S]*>/i.test(
                                latestReply.message || "",
                              ) ? (
                                <div
                                  className="prose prose-sm max-w-none"
                                  dangerouslySetInnerHTML={{
                                    __html: DOMPurify.sanitize(
                                      latestReply.message || "",
                                    ),
                                  }}
                                />
                              ) : (
                                <p className="whitespace-pre-wrap">
                                  {latestReply.message}
                                </p>
                              )}
                            </div>
                            {latestReply.attachments &&
                              latestReply.attachments.length > 0 && (
                                <div className="mt-2 flex items-center space-x-1 text-xs text-blue-600">
                                  <PaperClipIcon className="h-3 w-3" />
                                  <span>
                                    {latestReply.attachments.length}{" "}
                                    attachment(s)
                                  </span>
                                </div>
                              )}
                          </div>
                        </div>
                      );
                    })()}

                  {/* Latest Internal Note */}
                  {ticket.internalNotes &&
                    ticket.internalNotes.length > 0 &&
                    (() => {
                      const latestNote = [...ticket.internalNotes].sort(
                        (a, b) =>
                          new Date(b.createdAt).getTime() -
                          new Date(a.createdAt).getTime(),
                      )[0];

                      return (
                        <div className="border-l-4 border-yellow-500 pl-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center space-x-2">
                              <DocumentTextIcon className="h-5 w-5 text-yellow-600" />
                              <span className="text-sm font-semibold text-gray-900">
                                Latest Internal Note
                              </span>
                              <span className="text-xs text-gray-500 italic">
                                (Staff only)
                              </span>
                            </div>
                            <span className="text-xs text-gray-500">
                              {new Date(latestNote.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <div className="bg-yellow-50 rounded-lg p-3">
                            <p className="text-xs font-medium text-gray-700 mb-1">
                              {`${latestNote.createdBy?.firstName ?? ""} ${latestNote.createdBy?.lastName ?? ""
                                }`.trim() || "User"}
                            </p>
                            <p className="text-sm text-gray-800 whitespace-pre-wrap line-clamp-3">
                              {latestNote.note}
                            </p>
                          </div>
                        </div>
                      );
                    })()}

                  <div className="pt-2 border-t border-gray-200">
                    <p className="text-xs text-gray-500 text-center">
                      View all replies and notes in the tabs below
                    </p>
                  </div>
                </div>
              ) : null}

              {/* Tabs */}
              <div className="bg-white rounded-xl shadow-sm">
                <div className="border-b border-gray-200">
                  <div className="flex space-x-8 px-6">
                    <button
                      onClick={() => setActiveTab("replies")}
                      className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === "replies"
                          ? "border-blue-500 text-blue-600"
                          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                        }`}
                    >
                      <ChatBubbleLeftRightIcon className="h-5 w-5 inline-block mr-2" />
                      {srTabLabel("replies", "Replies")}
                    </button>
                    {linkedIsrTabEnabled && (
                        <button
                          onClick={() => setActiveTab("linkedisr")}
                          className={`py-4 px-1 border-b-2 font-medium text-sm ${
                            activeTab === "linkedisr"
                              ? "border-blue-500 text-blue-600"
                              : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                          }`}
                        >
                          <ListBulletIcon className="h-5 w-5 inline-block mr-2" />
                          {srTabLabel("linkedisr", "Linked ISRs")}
                        </button>
                      )}
                    <button
                      onClick={() => setActiveTab("notes")}
                      className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === "notes"
                          ? "border-blue-500 text-blue-600"
                          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                        }`}
                    >
                      <DocumentTextIcon className="h-5 w-5 inline-block mr-2" />
                      {srTabLabel("notes", "Internal Notes")}
                    </button>
                    {isSrDetailTicket && srTabVisible("pslcall") && (
                      <button
                        onClick={() => setActiveTab("pslcall")}
                        className={`py-4 px-1 border-b-2 font-medium text-sm ${
                          activeTab === "pslcall"
                            ? "border-blue-500 text-blue-600"
                            : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                        }`}
                      >
                        <PhoneIcon className="h-5 w-5 inline-block mr-2" />
                        {srTabLabel("pslcall", "PSL Call")}
                      </button>
                    )}
                    <button
                      onClick={() => setActiveTab("history")}
                      className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === "history"
                          ? "border-blue-500 text-blue-600"
                          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                        }`}
                    >
                      <ClockIcon className="h-5 w-5 inline-block mr-2" />
                      {srTabLabel("history", "History")}
                    </button>
                    {/* Audit tab — unified activity timeline */}
                    <button
                      onClick={() => setActiveTab("audit")}
                      className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === "audit"
                          ? "border-blue-500 text-blue-600"
                          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                        }`}
                    >
                      <ListBulletIcon className="h-5 w-5 inline-block mr-2" />
                      {srTabLabel("audit", "Audit")}
                    </button>

                    {/* Task 6.5: Emails tab - only show for email tickets */}
                    {ticket.submissionSource === "email" && srTabVisible("emails") && (
                      <button
                        onClick={() => setActiveTab("emails")}
                        className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === "emails"
                            ? "border-blue-500 text-blue-600"
                            : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                          }`}
                      >
                        <svg
                          className="h-5 w-5 inline-block mr-2"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                          />
                        </svg>
                        Email Thread (
                        {
                          emailCommunications.filter((e) => {
                            const isOut =
                              e.direction === "outgoing" ||
                              e.direction === "outbound";
                            const isConf = e.subject
                              ?.toLowerCase()
                              .includes("ticket created:");
                            return !(isOut && isConf);
                          }).length
                        }
                        )
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-6">
                  {/* Replies Tab */}
                  {activeTab === "replies" && (
                    <div className="space-y-6">
                      {/* Closed Ticket Notice */}
                      {(String(ticket.status) === "5" ||
                        String(ticket.status).toLowerCase() === "closed") && (
                          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                            <div className="flex items-start">
                              <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600 mr-2 flex-shrink-0" />
                              <div>
                                <h4 className="text-sm font-semibold text-yellow-900">
                                  Query is Closed
                                </h4>
                                <p className="text-sm text-yellow-700 mt-1">
                                  This query is closed. To add a reply, please
                                  change the status to "Open" first.
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                      {/* Reply Form (only if assigned to me / modify-any, and not closed) */}
                      {canModify &&
                        !(
                          String(ticket.status) === "5" ||
                          String(ticket.status).toLowerCase() === "closed"
                        ) && (
                          <form
                            onSubmit={handleSubmitReply}
                            className="space-y-4"
                          >
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Add Reply
                              </label>
                              {replyDraftRestored && (
                                <div className="text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 text-sm mb-2 flex items-center justify-between">
                                  <span>
                                    📋 Draft restored — your unsent reply has been
                                    loaded
                                  </span>
                                  <button
                                    type="button"
                                    onClick={dismissReplyDraftBanner}
                                    className="ml-2 text-amber-500 hover:text-amber-700 font-bold"
                                  >
                                    ✕
                                  </button>
                                </div>
                              )}
                              {replyDraftStatus !== "idle" && (
                                <div
                                  style={{
                                    fontSize: 12,
                                    marginBottom: 4,
                                    color:
                                      replyDraftStatus === "saved"
                                        ? "#16a34a"
                                        : replyDraftStatus === "saving"
                                          ? "#2563eb"
                                          : replyDraftStatus === "error"
                                            ? "#dc2626"
                                            : "#d97706",
                                  }}
                                >
                                  {replyDraftStatus === "saving"
                                    ? "⏳ Saving draft…"
                                    : replyDraftStatus === "saved"
                                      ? "✓ Draft saved"
                                      : replyDraftStatus === "error"
                                        ? "⚠ Failed to save draft"
                                        : "● Unsaved changes"}
                                </div>
                              )}
                              <textarea
                                value={replyMessage}
                                onChange={(e) => setReplyMessage(e.target.value)}
                                rows={4}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="Type your reply here..."
                                required
                              />
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Attachments (optional)
                              </label>
                              <input
                                type="file"
                                multiple
                                onChange={(e) => {
                                  setReplyFiles(e.target.files);
                                  showFileUploadToast(e.target.files);
                                }}
                                className="w-full"
                              />
                            </div>

                            <div className="flex justify-end">
                              <button
                                type="submit"
                                disabled={isSubmittingReply}
                                className="flex items-center space-x-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isSubmittingReply ? (
                                  <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                    <span>Sending...</span>
                                  </>
                                ) : (
                                  <>
                                    <PaperAirplaneIcon className="h-5 w-5" />
                                    <span>Send Reply</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </form>
                        )}

                      {/* Combined Timeline - bifurcated: primary first, then merged secondary sections */}
                      {((ticket.comments && ticket.comments.length > 0) ||
                        (ticket.threads && ticket.threads.length > 0)) &&
                        (() => {
                          // Merge all items into a unified list with type tag
                          type ConvItem =
                            | {
                              kind: "comment";
                              data: Comment;
                              resolvedFrom: string | null;
                            }
                            | {
                              kind: "thread";
                              data: Thread;
                              resolvedFrom: string | null;
                            };

                          // Build a lookup: threadId → ticketNumber from merged (secondary) tickets.
                          // Thread _id values are preserved during merge (via toObject() spread),
                          // so any primary thread whose _id appears in a secondary ticket came from there.
                          const mergedThreadIdMap = new Map<string, string>();
                          (ticket.mergedTickets ?? []).forEach((mt) => {
                            (mt.threads ?? []).forEach((t) => {
                              if (t._id)
                                mergedThreadIdMap.set(t._id, mt.ticketNumber);
                            });
                          });

                          // Helper: detect which ticket an item came from.
                          // 1. Use mergedFrom field (new merges after schema fix)
                          // 2. Fallback for threads: cross-reference _id against merged tickets' thread lists
                          // 3. Fallback for comments: "[From MHCET-XXXX]" text prefix (existing data)
                          const getResolvedFrom = (
                            item: Comment | Thread,
                          ): string | null => {
                            if ((item as any).mergedFrom)
                              return (item as any).mergedFrom as string;
                            if ("message" in item) {
                              // Thread: use ID cross-reference against secondary tickets
                              const fromId = (item as Thread)._id
                                ? mergedThreadIdMap.get((item as Thread)._id!)
                                : undefined;
                              if (fromId) return fromId;
                              // Also check message prefix as last resort
                              const m = (item as Thread).message?.match(
                                /^\[From ([^\]]+)\]/,
                              );
                              return m ? m[1] : null;
                            }
                            if ("text" in item) {
                              // Comment: use text prefix
                              const m = item.text?.match(/^\[From ([^\]]+)\]/);
                              return m ? m[1] : null;
                            }
                            return null;
                          };

                          const allItems: ConvItem[] = [
                            ...(ticket.comments ?? []).map((c) => ({
                              kind: "comment" as const,
                              data: c,
                              resolvedFrom: getResolvedFrom(c),
                            })),
                            ...(ticket.threads ?? []).map((t) => ({
                              kind: "thread" as const,
                              data: t,
                              resolvedFrom: getResolvedFrom(t),
                            })),
                          ];

                          // Primary items: no resolvedFrom, and skip the system merge-summary comment
                          const primaryItems = allItems
                            .filter((i) => {
                              if (i.resolvedFrom) return false;
                              if (
                                i.kind === "comment" &&
                                i.data.isSystemComment
                              )
                                return false;
                              return true;
                            })
                            .sort(
                              (a, b) =>
                                new Date(a.data.createdAt).getTime() -
                                new Date(b.data.createdAt).getTime(),
                            );

                          // Group secondary items by source ticket number
                          const secondaryMap = new Map<string, ConvItem[]>();
                          allItems
                            .filter((i) => !!i.resolvedFrom)
                            .forEach((i) => {
                              const key = i.resolvedFrom!;
                              if (!secondaryMap.has(key))
                                secondaryMap.set(key, []);
                              secondaryMap.get(key)!.push(i);
                            });
                          // Sort each group by date ascending
                          secondaryMap.forEach((items, key) => {
                            secondaryMap.set(
                              key,
                              items.sort(
                                (a, b) =>
                                  new Date(a.data.createdAt).getTime() -
                                  new Date(b.data.createdAt).getTime(),
                              ),
                            );
                          });

                          // Count visible items only (exclude system comments)
                          const visibleCount =
                            primaryItems.length +
                            Array.from(secondaryMap.values()).reduce(
                              (s, arr) => s + arr.length,
                              0,
                            );

                          const renderCommentItem = (
                            comment: Comment,
                            resolvedFrom: string | null,
                          ) => {
                            const emailMatch = comment.text.match(
                              /📧 Email reply sent to ([^:]+):\n\n(.+)/s,
                            );
                            const recipientEmail = emailMatch
                              ? emailMatch[1].trim()
                              : "";
                            // For legacy merged comments, strip the "[From TICKET] " prefix from display
                            let displayText = emailMatch
                              ? emailMatch[2].trim()
                              : comment.text;
                            if (!emailMatch && resolvedFrom) {
                              displayText = displayText.replace(
                                /^\[From [^\]]+\]\s*/,
                                "",
                              );
                            }
                            const isEmail = comment.text?.startsWith("📧");
                            return (
                              <div
                                key={comment._id}
                                className={`rounded-lg p-4 border-l-4 ${isEmail ? "bg-blue-50 border-blue-500" : "bg-gray-50 border-gray-300"}`}
                              >
                                <div className="flex items-start space-x-3">
                                  <div className="flex-shrink-0">
                                    <div
                                      className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold ${isEmail ? "bg-gradient-to-br from-blue-600 to-blue-400" : "bg-gradient-to-br from-gray-500 to-gray-600"}`}
                                    >
                                      {comment.createdBy?.firstName?.charAt(
                                        0,
                                      ) || "A"}
                                    </div>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center gap-2">
                                        <p className="text-sm font-medium text-gray-900">
                                          {comment.createdBy?.firstName}{" "}
                                          {comment.createdBy?.lastName}
                                        </p>
                                        {isEmail && (
                                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                            📧 Sent via Email
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-xs text-gray-500">
                                        {new Date(
                                          comment.createdAt,
                                        ).toLocaleString("en-US", {
                                          year: "numeric",
                                          month: "short",
                                          day: "numeric",
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        })}
                                      </p>
                                    </div>
                                    {recipientEmail && (
                                      <p className="text-xs text-blue-700 mb-2">
                                        To: {recipientEmail}
                                      </p>
                                    )}
                                    <div className="text-sm text-gray-700 break-words">
                                      {/<[a-z][\s\S]*>/i.test(displayText) ? (
                                        <div
                                          className="prose prose-sm max-w-none"
                                          dangerouslySetInnerHTML={{
                                            __html:
                                              DOMPurify.sanitize(displayText),
                                          }}
                                        />
                                      ) : (
                                        <p className="whitespace-pre-wrap">
                                          {displayText}
                                        </p>
                                      )}
                                    </div>
                                    {comment.attachments &&
                                      comment.attachments.length > 0 && (
                                        <div className="mt-3 space-y-2">
                                          {comment.attachments.map(
                                            (file, idx) => (
                                              <button
                                                key={idx}
                                                type="button"
                                                onClick={() =>
                                                  openAttachment(file.path)
                                                }
                                                className="flex items-center space-x-2 text-sm text-blue-600 hover:text-blue-700"
                                              >
                                                <PaperClipIcon className="h-4 w-4" />
                                                <span>
                                                  {file.originalName ||
                                                    file.filename}
                                                </span>
                                                <span className="text-gray-400">
                                                  (
                                                  {(file.size / 1024).toFixed(
                                                    1,
                                                  )}{" "}
                                                  KB)
                                                </span>
                                              </button>
                                            ),
                                          )}
                                        </div>
                                      )}
                                  </div>
                                </div>
                              </div>
                            );
                          };

                          const renderThreadItem = (
                            thread: Thread,
                            resolvedFrom: string | null,
                          ) => {
                            // Strip "[From TICKET] " prefix for legacy threads displayed under their section
                            let displayMessage = thread.message;
                            if (resolvedFrom) {
                              displayMessage = displayMessage?.replace(
                                /^\[From [^\]]+\]\s*/,
                                "",
                              );
                            }
                            return (
                              <div
                                key={thread._id}
                                className="bg-gray-50 rounded-lg p-4 border border-gray-200"
                              >
                                <div className="flex items-start space-x-3">
                                  <div className="flex-shrink-0">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold">
                                      {thread.createdBy?.firstName?.charAt(0) ||
                                        "?"}
                                    </div>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-2">
                                      <div>
                                        <p className="text-sm font-medium text-gray-900">
                                          {thread.createdBy?.firstName}{" "}
                                          {thread.createdBy?.lastName}
                                          {thread.createdBy?.role && (
                                            <span className="ml-2 text-xs text-gray-500">
                                              (
                                              {typeof thread.createdBy.role ===
                                                "string"
                                                ? thread.createdBy.role
                                                : thread.createdBy.role.name}
                                              )
                                            </span>
                                          )}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                          {new Date(
                                            thread.createdAt,
                                          ).toLocaleString()}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="text-sm text-gray-700">
                                      {/<[a-z][\s\S]*>/i.test(
                                        displayMessage || "",
                                      ) ? (
                                        <div
                                          className="prose prose-sm max-w-none"
                                          dangerouslySetInnerHTML={{
                                            __html: DOMPurify.sanitize(
                                              displayMessage || "",
                                            ),
                                          }}
                                        />
                                      ) : (
                                        <p className="whitespace-pre-wrap">
                                          {displayMessage}
                                        </p>
                                      )}
                                    </div>
                                    {thread.attachments &&
                                      thread.attachments.length > 0 && (
                                        <div className="mt-3 space-y-2">
                                          {thread.attachments.map(
                                            (file, idx) => (
                                              <button
                                                key={idx}
                                                type="button"
                                                onClick={() =>
                                                  openAttachment(file.path)
                                                }
                                                className="flex items-center space-x-2 text-sm text-blue-600 hover:text-blue-700"
                                              >
                                                <PaperClipIcon className="h-4 w-4" />
                                                <span>{file.filename}</span>
                                              </button>
                                            ),
                                          )}
                                        </div>
                                      )}
                                  </div>
                                </div>
                              </div>
                            );
                          };

                          const renderItem = (item: ConvItem) =>
                            item.kind === "comment"
                              ? renderCommentItem(item.data, item.resolvedFrom)
                              : renderThreadItem(item.data, item.resolvedFrom);

                          return (
                            <div className="space-y-4 mt-8">
                              <h4 className="text-base font-semibold text-gray-900 border-b pb-2">
                                Full Conversation ({visibleCount} message
                                {visibleCount !== 1 ? "s" : ""})
                              </h4>

                              {/* Primary ticket conversation */}
                              {primaryItems.length > 0 && (
                                <div className="space-y-3">
                                  {secondaryMap.size > 0 && (
                                    <div className="flex items-center gap-3 mb-1">
                                      <div className="h-px flex-1 bg-gray-200" />
                                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-2">
                                        #{ticket.ticketNumber} — Primary Ticket
                                      </span>
                                      <div className="h-px flex-1 bg-gray-200" />
                                    </div>
                                  )}
                                  {primaryItems.map(renderItem)}
                                </div>
                              )}

                              {/* Secondary ticket conversations — one section per source ticket */}
                              {Array.from(secondaryMap.entries()).map(
                                ([ticketNum, items]) => (
                                  <div key={ticketNum} className="space-y-3">
                                    <div className="flex items-center gap-3 my-2">
                                      <div className="h-px flex-1 bg-purple-200" />
                                      <div className="flex items-center gap-1.5 px-3 py-1 bg-purple-50 border border-purple-200 rounded-full">
                                        <ArrowsPointingInIcon className="h-3.5 w-3.5 text-purple-600" />
                                        <span className="text-xs font-semibold text-purple-700">
                                          Merged from #{ticketNum}
                                        </span>
                                      </div>
                                      <div className="h-px flex-1 bg-purple-200" />
                                    </div>
                                    {items.map(renderItem)}
                                  </div>
                                ),
                              )}
                            </div>
                          );
                        })()}
                    </div>
                  )}

                  {activeTab === "linkedisr" && ticket && (
                    <LinkedIsrPanel
                      parentTicketId={ticket._id}
                      projectId={String(ticketProjectId || "")}
                      variant="tab"
                      allowCreate={
                        isPsrTicket ||
                        (isIsrTicket
                          ? !!srConfig?.isr?.linkFromIsr?.createEnabled
                          : !!srConfig?.isr?.linkFromNormalTickets?.createEnabled)
                      }
                      allowLink={
                        isPsrTicket ||
                        (isIsrTicket
                          ? !!srConfig?.isr?.linkFromIsr?.linkExistingEnabled
                          : !!srConfig?.isr?.linkFromNormalTickets
                              ?.linkExistingEnabled)
                      }
                    />
                  )}

                  {/* PSL Call — parent satisfaction call (reach / satisfied) */}
                  {activeTab === "pslcall" && ticket && (
                    <PslCallTab ticket={ticket} onChanged={fetchTicketDetails} />
                  )}

                  {/* Internal Notes Tab */}
                  {activeTab === "notes" && (
                    <div className="space-y-6">
                      {/* Add Note Form */}
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Add Internal Note
                            <span className="text-xs text-gray-500 ml-2">
                              (Not visible to students)
                            </span>
                          </label>
                          <textarea
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            rows={3}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Add internal notes for your team..."
                          />
                        </div>

                        <div className="flex justify-end">
                          <button
                            onClick={handleAddNote}
                            disabled={isAddingNote || !noteText.trim()}
                            className="flex items-center space-x-2 px-6 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isAddingNote ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                <span>Adding...</span>
                              </>
                            ) : (
                              <>
                                <DocumentTextIcon className="h-5 w-5" />
                                <span>Add Note</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Full Internal Notes List */}
                      {ticket.internalNotes &&
                        ticket.internalNotes.length > 0 && (
                          <div className="space-y-4 mt-8">
                            <h4 className="text-base font-semibold text-gray-900 border-b pb-2">
                              All Internal Notes ({ticket.internalNotes.length}{" "}
                              {ticket.internalNotes.length === 1
                                ? "note"
                                : "notes"}
                              )
                            </h4>
                            {ticket.internalNotes
                              .sort(
                                (a, b) =>
                                  new Date(b.createdAt).getTime() -
                                  new Date(a.createdAt).getTime(),
                              )
                              .map((note) => (
                                <div
                                  key={note._id}
                                  className="bg-yellow-50 rounded-lg p-4 border border-yellow-200"
                                >
                                  <div className="flex items-start space-x-3">
                                    <div className="flex-shrink-0">
                                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-500 to-orange-600 flex items-center justify-center text-white font-semibold">
                                        {note.createdBy?.firstName?.charAt(0) ||
                                          "?"}
                                      </div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center justify-between mb-2">
                                        <div>
                                          <p className="text-sm font-medium text-gray-900">
                                            {note.createdBy?.firstName}{" "}
                                            {note.createdBy?.lastName}
                                            <span className="ml-2 text-xs text-yellow-700 font-semibold">
                                              (STAFF ONLY)
                                            </span>
                                          </p>
                                          <p className="text-xs text-gray-600">
                                            {new Date(
                                              note.createdAt,
                                            ).toLocaleString()}
                                          </p>
                                        </div>
                                      </div>
                                      <p className="text-gray-700 whitespace-pre-wrap text-sm">
                                        {note.note}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                          </div>
                        )}
                    </div>
                  )}

                  {/* History Tab */}
                  {activeTab === "history" && (
                    <div className="space-y-6">
                      {/* Escalation History */}
                      {ticket.escalationHistory &&
                        ticket.escalationHistory.length > 0 ? (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-medium text-gray-900">
                              Escalation Timeline
                            </h3>
                            {(ticket.escalationMatrixName ||
                              escalationMatrix?.name) && (
                                <span className="text-xs text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full">
                                  {ticket.escalationMatrixName ||
                                    escalationMatrix?.name}
                                </span>
                              )}
                          </div>

                          {/* Step indicator path */}
                          {escalationMatrix?.levels &&
                            escalationMatrix.levels.length > 0 && (
                              <div className="flex items-center flex-wrap gap-1 p-2 bg-gray-50 rounded-lg border border-gray-200 text-xs">
                                {[...escalationMatrix.levels]
                                  .sort(
                                    (a: any, b: any) =>
                                      a.levelNumber - b.levelNumber,
                                  )
                                  .map(
                                    (level: any, idx: number, arr: any[]) => {
                                      const isCurrent =
                                        level.levelNumber ===
                                        ticket.currentEscalationLevelNumber;
                                      const isPast =
                                        ticket.currentEscalationLevelNumber !=
                                        null &&
                                        level.levelNumber <
                                        ticket.currentEscalationLevelNumber;
                                      return (
                                        <React.Fragment
                                          key={level._id || level.levelNumber}
                                        >
                                          <span
                                            className={`inline-flex items-center px-2 py-1 rounded font-medium ${isCurrent
                                                ? "bg-orange-500 text-white"
                                                : isPast
                                                  ? "bg-gray-300 text-gray-600 line-through"
                                                  : "bg-white border border-gray-300 text-gray-500"
                                              }`}
                                          >
                                            L{level.levelNumber}
                                            <span className="ml-1 opacity-75">
                                              ({level.slaHours}
                                              {level.slaUnit === "mins"
                                                ? "m"
                                                : level.slaUnit === "days"
                                                  ? "d"
                                                  : "h"}
                                              )
                                            </span>
                                            {isCurrent && (
                                              <span className="ml-1">●</span>
                                            )}
                                          </span>
                                          {idx < arr.length - 1 && (
                                            <span className="text-gray-400">
                                              →
                                            </span>
                                          )}
                                        </React.Fragment>
                                      );
                                    },
                                  )}
                              </div>
                            )}

                          {/* Initial Creation Record */}
                          {(() => {
                            const createdAt = new Date(ticket.createdAt);
                            const firstEscalation = ticket.escalationHistory[0];
                            const firstEscalationTime = new Date(
                              firstEscalation.escalatedAt,
                            );

                            const timeAtL0 =
                              firstEscalationTime.getTime() -
                              createdAt.getTime();
                            const hours = Math.floor(
                              timeAtL0 / (1000 * 60 * 60),
                            );
                            const minutes = Math.floor(
                              (timeAtL0 % (1000 * 60 * 60)) / (1000 * 60),
                            );

                            return (
                              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                <div className="flex items-start space-x-3">
                                  <svg
                                    className="h-5 w-5 text-blue-600 flex-shrink-0 mt-1"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M12 4v16m8-8H4"
                                    />
                                  </svg>
                                  <div className="flex-1">
                                    <div className="flex items-center justify-between">
                                      <p className="text-sm font-medium text-gray-900">
                                        Ticket Created
                                      </p>
                                      <span className="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-1 rounded">
                                        Initial Level
                                      </span>
                                    </div>
                                    <p className="text-xs text-gray-600 mt-1">
                                      Created by {ticket.createdBy?.firstName}{" "}
                                      {ticket.createdBy?.lastName}
                                    </p>
                                    <div className="mt-3 grid grid-cols-2 gap-4 text-xs">
                                      <div>
                                        <p className="text-gray-500">
                                          Created At:
                                        </p>
                                        <p className="font-medium text-gray-900">
                                          {createdAt.toLocaleDateString()}{" "}
                                          {createdAt.toLocaleTimeString()}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-gray-500">
                                          Time Before Escalation:
                                        </p>
                                        <p className="font-medium text-gray-900">
                                          {hours > 0 ? `${hours}h ` : ""}
                                          {minutes}m
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}

                          {/* Escalation Records */}
                          {ticket.escalationHistory?.map((record, index) => {
                            // Calculate time at this level (time until next escalation or now)
                            const escalatedAt = new Date(record.escalatedAt);
                            const nextEscalation =
                              ticket.escalationHistory?.[index + 1];
                            const endTime = nextEscalation
                              ? new Date(nextEscalation.escalatedAt)
                              : new Date();

                            const timeAtLevel =
                              endTime.getTime() - escalatedAt.getTime();
                            const hours = Math.floor(
                              timeAtLevel / (1000 * 60 * 60),
                            );
                            const minutes = Math.floor(
                              (timeAtLevel % (1000 * 60 * 60)) / (1000 * 60),
                            );

                            const isAutoEscalation =
                              record.escalatedBy === null ||
                              record.escalatedBy === undefined;

                            return (
                              <div
                                key={record._id}
                                className={`p-4 border rounded-lg ${index === ticket.escalationHistory!.length - 1
                                    ? "bg-orange-50 border-orange-400 ring-1 ring-orange-300"
                                    : "bg-orange-50 border-orange-200"
                                  }`}
                              >
                                <div className="flex items-start space-x-3">
                                  <ArrowUpIcon className="h-5 w-5 text-orange-600 flex-shrink-0 mt-1" />
                                  <div className="flex-1">
                                    <div className="flex items-center justify-between">
                                      <p className="text-sm font-medium text-gray-900">
                                        Escalated to{" "}
                                        <span className="text-orange-700">
                                          {record.escalatedTo.firstName}{" "}
                                          {record.escalatedTo.lastName}
                                        </span>
                                      </p>
                                      <div className="flex items-center gap-1">
                                        {index ===
                                          ticket.escalationHistory!.length -
                                          1 && (
                                            <span className="text-xs font-medium text-orange-700 bg-orange-200 px-2 py-0.5 rounded-full">
                                              Current
                                            </span>
                                          )}
                                        <span className="text-xs font-medium text-orange-600 bg-orange-100 px-2 py-1 rounded">
                                          Level {index + 1}
                                        </span>
                                      </div>
                                    </div>
                                    <p className="text-xs text-gray-600 mt-1">
                                      {isAutoEscalation ? (
                                        <span className="inline-flex items-center">
                                          🤖{" "}
                                          <span className="ml-1">
                                            Auto-escalated by system
                                          </span>
                                        </span>
                                      ) : (
                                        <>
                                          By {record.escalatedBy.firstName}{" "}
                                          {record.escalatedBy.lastName}
                                        </>
                                      )}
                                    </p>
                                    <p className="text-sm text-gray-700 mt-2">
                                      {record.reason}
                                    </p>
                                    <div className="mt-3 grid grid-cols-2 gap-4 text-xs">
                                      <div>
                                        <p className="text-gray-500">
                                          Escalated At:
                                        </p>
                                        <p className="font-medium text-gray-900">
                                          {escalatedAt.toLocaleDateString()}{" "}
                                          {escalatedAt.toLocaleTimeString()}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-gray-500">
                                          Time at this Level:
                                        </p>
                                        <p className="font-medium text-gray-900">
                                          {hours > 0 ? `${hours}h ` : ""}
                                          {minutes}m
                                          {!nextEscalation && (
                                            <span className="text-orange-600 ml-1">
                                              (ongoing)
                                            </span>
                                          )}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}

                      {/* Change History */}
                      {ticket.changeHistory &&
                        ticket.changeHistory.length > 0 ? (
                        <div className="space-y-3 mt-6">
                          <h3 className="text-sm font-medium text-gray-900">
                            Change History
                          </h3>

                          {/* Newest first — a history is read from the latest
                              change backwards, and the stored order is the
                              order things happened. */}
                          {[...ticket.changeHistory]
                            .sort(
                              (a, b) =>
                                new Date(b.changedAt).getTime() -
                                new Date(a.changedAt).getTime(),
                            )
                            .map((change) => {
                            const changedAt = new Date(change.changedAt);

                            // Format field name for display
                            const fieldDisplayNames: Record<string, string> = {
                              status: "Status",
                              priority: "Priority",
                              assignedTo: "Assigned Agent",
                              category: "Category",
                              tags: "Tags",
                              subject: "Subject",
                              description: "Description",
                            };

                            const fieldDisplay =
                              fieldDisplayNames[change.field] || change.field;

                            // Choose icon and color based on field
                            let iconColor = "text-gray-600";
                            let bgColor = "bg-gray-50";
                            let borderColor = "border-gray-200";
                            let icon = null;

                            if (change.field === "status") {
                              iconColor = "text-green-600";
                              bgColor = "bg-green-50";
                              borderColor = "border-green-200";
                              icon = (
                                <CheckCircleIcon className="h-5 w-5 text-green-600 flex-shrink-0 mt-1" />
                              );
                            } else if (change.field === "priority") {
                              iconColor = "text-red-600";
                              bgColor = "bg-red-50";
                              borderColor = "border-red-200";
                              icon = (
                                <ExclamationTriangleIcon className="h-5 w-5 text-red-600 flex-shrink-0 mt-1" />
                              );
                            } else if (change.field === "assignedTo") {
                              iconColor = "text-blue-600";
                              bgColor = "bg-blue-50";
                              borderColor = "border-blue-200";
                              icon = (
                                <UserIcon className="h-5 w-5 text-blue-600 flex-shrink-0 mt-1" />
                              );
                            } else if (
                              change.field === "tags" ||
                              change.field === "category"
                            ) {
                              iconColor = "text-purple-600";
                              bgColor = "bg-purple-50";
                              borderColor = "border-purple-200";
                              icon = (
                                <TagIcon className="h-5 w-5 text-purple-600 flex-shrink-0 mt-1" />
                              );
                            } else {
                              icon = (
                                <DocumentTextIcon className="h-5 w-5 text-gray-600 flex-shrink-0 mt-1" />
                              );
                            }

                            return (
                              <div
                                key={change._id}
                                className={`p-4 ${bgColor} border ${borderColor} rounded-lg`}
                              >
                                <div className="flex items-start space-x-3">
                                  {icon}
                                  <div className="flex-1">
                                    <div className="flex items-center justify-between">
                                      <p className="text-sm font-medium text-gray-900">
                                        {fieldDisplay}{" "}
                                        {change.changeType === "update"
                                          ? "Updated"
                                          : change.changeType === "add"
                                            ? "Added"
                                            : "Removed"}
                                      </p>
                                      <span
                                        className={`text-xs font-medium ${iconColor} px-2 py-1 rounded`}
                                      >
                                        {change.changeType}
                                      </span>
                                    </div>
                                    <p className="text-xs text-gray-600 mt-1">
                                      {/* Older entries and system moves carry
                                          no user — say so rather than "By". */}
                                      {change.changedBy?.firstName ||
                                      change.changedBy?.lastName
                                        ? `By ${[
                                            change.changedBy.firstName,
                                            change.changedBy.lastName,
                                          ]
                                            .filter(Boolean)
                                            .join(" ")}`
                                        : "By the system"}
                                    </p>
                                    <div className="mt-3 grid grid-cols-2 gap-4 text-xs">
                                      <div>
                                        <p className="text-gray-500">From:</p>
                                        <p className="font-medium text-gray-900">
                                          {formatChangeValue(
                                            change.field,
                                            change.oldValue,
                                          ) || (
                                              <span className="text-gray-400 italic">
                                                Empty
                                              </span>
                                            )}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-gray-500">To:</p>
                                        <p className="font-medium text-gray-900">
                                          {formatChangeValue(
                                            change.field,
                                            change.newValue,
                                          ) || (
                                              <span className="text-gray-400 italic">
                                                Empty
                                              </span>
                                            )}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="mt-2">
                                      <p className="text-gray-500 text-xs">
                                        Changed At:
                                      </p>
                                      <p className="font-medium text-gray-900 text-xs">
                                        {changedAt.toLocaleDateString()}{" "}
                                        {changedAt.toLocaleTimeString()}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}

                      {/* No history message */}
                      {(!ticket.changeHistory ||
                        ticket.changeHistory.length === 0) &&
                        (!ticket.escalationHistory ||
                          ticket.escalationHistory.length === 0) && (
                          <p className="text-center text-gray-500 py-8">
                            No history yet
                          </p>
                        )}
                    </div>
                  )}

                  {/* Audit Tab — unified chronological activity log */}
                  {activeTab === "audit" && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold text-gray-700">
                          Full Activity Timeline
                        </h3>
                        <span className="text-xs text-gray-400">
                          All events, oldest first
                        </span>
                      </div>

                      {/* Build unified event list */}
                      {(() => {
                        type AuditEvent =
                          | { kind: "reply"; ts: number; data: any }
                          | { kind: "note"; ts: number; data: any }
                          | { kind: "change"; ts: number; data: any }
                          | { kind: "escalation"; ts: number; data: any };

                        const events: AuditEvent[] = [
                          // Replies (threads)
                          ...((ticket.threads || []) as any[]).map((t) => ({
                            kind: "reply" as const,
                            ts: new Date(t.createdAt).getTime(),
                            data: t,
                          })),
                          // Email comments
                          ...((ticket.comments || []) as any[]).map((c) => ({
                            kind: "reply" as const,
                            ts: new Date(c.createdAt).getTime(),
                            data: { ...c, _isComment: true },
                          })),
                          // Internal notes
                          ...((ticket.internalNotes || []) as any[]).map(
                            (n) => ({
                              kind: "note" as const,
                              ts: new Date(n.createdAt).getTime(),
                              data: n,
                            }),
                          ),
                          // Change history
                          ...((ticket.changeHistory || []) as any[]).map(
                            (c) => ({
                              kind: "change" as const,
                              ts: new Date(c.changedAt).getTime(),
                              data: c,
                            }),
                          ),
                          // Escalation history
                          ...((ticket.escalationHistory || []) as any[]).map(
                            (e) => ({
                              kind: "escalation" as const,
                              ts: new Date(e.escalatedAt).getTime(),
                              data: e,
                            }),
                          ),
                        ];

                        events.sort((a, b) => a.ts - b.ts);

                        if (events.length === 0) {
                          return (
                            <p className="text-center text-gray-400 py-12 text-sm">
                              No activity recorded yet.
                            </p>
                          );
                        }

                        const fieldDisplayNames: Record<string, string> = {
                          status: "Status",
                          priority: "Priority",
                          assignedTo: "Assigned Agent",
                          category: "Category",
                          tags: "Tags",
                          subject: "Subject",
                          description: "Description",
                        };

                        return (
                          <div className="relative">
                            {/* Vertical spine */}
                            <div className="absolute left-5 top-0 bottom-0 w-px bg-gray-200" />

                            <div className="space-y-3">
                              {events.map((ev, idx) => {
                                const timeStr = new Date(
                                  ev.ts,
                                ).toLocaleString();

                                /* ── Reply ── */
                                if (ev.kind === "reply") {
                                  const d = ev.data;
                                  const name = d._isComment
                                    ? d.from || d.createdBy?.firstName
                                    : `${d.createdBy?.firstName || ""} ${d.createdBy?.lastName || ""}`.trim();
                                  const body = d._isComment
                                    ? d.body || d.text
                                    : d.messageHtml || d.message;
                                  const isHtml = /<[a-z][\s\S]*>/i.test(
                                    body || "",
                                  );
                                  return (
                                    <div
                                      key={idx}
                                      className="flex gap-4 items-start pl-1"
                                    >
                                      <div className="z-10 flex-shrink-0 w-9 h-9 rounded-full bg-blue-100 border-2 border-blue-400 flex items-center justify-center text-blue-700 font-bold text-xs">
                                        {(name?.[0] || "?").toUpperCase()}
                                      </div>
                                      <div className="flex-1 bg-blue-50 border border-blue-200 rounded-lg p-3 min-w-0">
                                        <div className="flex items-center justify-between flex-wrap gap-1 mb-1">
                                          <span className="text-xs font-semibold text-blue-800">
                                            {name}
                                          </span>
                                          <div className="flex items-center gap-2">
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-200 text-blue-800 font-medium">
                                              {d._isComment
                                                ? "Email Reply"
                                                : "Reply"}
                                            </span>
                                            <span className="text-xs text-gray-400">
                                              {timeStr}
                                            </span>
                                          </div>
                                        </div>
                                        {isHtml ? (
                                          <div
                                            className="text-sm text-gray-700 prose prose-sm max-w-none"
                                            dangerouslySetInnerHTML={{
                                              __html: DOMPurify.sanitize(
                                                body || "",
                                              ),
                                            }}
                                          />
                                        ) : (
                                          <p className="text-sm text-gray-700 whitespace-pre-wrap">
                                            {body}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  );
                                }

                                /* ── Internal Note ── */
                                if (ev.kind === "note") {
                                  const d = ev.data;
                                  const name =
                                    `${d.createdBy?.firstName || ""} ${d.createdBy?.lastName || ""}`.trim();
                                  return (
                                    <div
                                      key={idx}
                                      className="flex gap-4 items-start pl-1"
                                    >
                                      <div className="z-10 flex-shrink-0 w-9 h-9 rounded-full bg-yellow-100 border-2 border-yellow-400 flex items-center justify-center text-yellow-700 font-bold text-xs">
                                        {(name?.[0] || "?").toUpperCase()}
                                      </div>
                                      <div className="flex-1 bg-yellow-50 border border-yellow-200 rounded-lg p-3 min-w-0">
                                        <div className="flex items-center justify-between flex-wrap gap-1 mb-1">
                                          <span className="text-xs font-semibold text-yellow-800">
                                            {name}
                                          </span>
                                          <div className="flex items-center gap-2">
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-200 text-yellow-800 font-medium">
                                              Internal Note
                                            </span>
                                            <span className="text-xs text-gray-400">
                                              {timeStr}
                                            </span>
                                          </div>
                                        </div>
                                        <p className="text-sm text-gray-700 whitespace-pre-wrap">
                                          {d.note}
                                        </p>
                                      </div>
                                    </div>
                                  );
                                }

                                /* ── Change ── */
                                if (ev.kind === "change") {
                                  const d = ev.data;
                                  const name =
                                    `${d.changedBy?.firstName || ""} ${d.changedBy?.lastName || ""}`.trim();
                                  const field =
                                    fieldDisplayNames[d.field] || d.field;
                                  return (
                                    <div
                                      key={idx}
                                      className="flex gap-4 items-start pl-1"
                                    >
                                      <div className="z-10 flex-shrink-0 w-9 h-9 rounded-full bg-green-100 border-2 border-green-400 flex items-center justify-center">
                                        <CheckCircleIcon className="h-4 w-4 text-green-600" />
                                      </div>
                                      <div className="flex-1 bg-green-50 border border-green-200 rounded-lg p-3 min-w-0">
                                        <div className="flex items-center justify-between flex-wrap gap-1 mb-1">
                                          <span className="text-xs font-semibold text-green-800">
                                            {field} changed by {name}
                                          </span>
                                          <div className="flex items-center gap-2">
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-200 text-green-800 font-medium">
                                              Change
                                            </span>
                                            <span className="text-xs text-gray-400">
                                              {timeStr}
                                            </span>
                                          </div>
                                        </div>
                                        <div className="flex gap-4 text-xs text-gray-600">
                                          <span>
                                            <span className="text-gray-400">
                                              From:
                                            </span>{" "}
                                            <span className="font-medium">
                                              {formatChangeValue(
                                                d.field,
                                                d.oldValue,
                                              ) || "—"}
                                            </span>
                                          </span>
                                          <span>→</span>
                                          <span>
                                            <span className="text-gray-400">
                                              To:
                                            </span>{" "}
                                            <span className="font-medium">
                                              {formatChangeValue(
                                                d.field,
                                                d.newValue,
                                              ) || "—"}
                                            </span>
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                }

                                /* ── Escalation ── */
                                if (ev.kind === "escalation") {
                                  const d = ev.data;
                                  const byName = d.escalatedBy
                                    ? personName(d.escalatedBy)
                                    : "System (auto)";
                                  const toName =
                                    `${d.escalatedTo?.firstName || ""} ${d.escalatedTo?.lastName || ""}`.trim();
                                  return (
                                    <div
                                      key={idx}
                                      className="flex gap-4 items-start pl-1"
                                    >
                                      <div className="z-10 flex-shrink-0 w-9 h-9 rounded-full bg-orange-100 border-2 border-orange-400 flex items-center justify-center">
                                        <ArrowUpIcon className="h-4 w-4 text-orange-600" />
                                      </div>
                                      <div className="flex-1 bg-orange-50 border border-orange-200 rounded-lg p-3 min-w-0">
                                        <div className="flex items-center justify-between flex-wrap gap-1 mb-1">
                                          <span className="text-xs font-semibold text-orange-800">
                                            Escalated to {toName}
                                          </span>
                                          <div className="flex items-center gap-2">
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-200 text-orange-800 font-medium">
                                              Escalation
                                            </span>
                                            <span className="text-xs text-gray-400">
                                              {timeStr}
                                            </span>
                                          </div>
                                        </div>
                                        <p className="text-xs text-gray-600">
                                          By: {byName}
                                        </p>
                                        {d.reason && (
                                          <p className="text-sm text-gray-700 mt-1">
                                            {d.reason}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  );
                                }

                                return null;
                              })}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Task 6.5: Email Communications Tab */}
                  {activeTab === "emails" && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-gray-900">
                          Email Communication Thread
                        </h3>
                        {loadingEmails && (
                          <span className="text-sm text-gray-500">
                            Loading...
                          </span>
                        )}
                      </div>

                      {/* Filter out automatic ticket confirmation emails (outgoing with "Ticket Created:" subject) */}
                      {(() => {
                        const filteredEmails = emailCommunications.filter(
                          (email) => {
                            // Exclude automatic outgoing confirmation emails
                            const isOutgoing =
                              email.direction === "outgoing" ||
                              email.direction === "outbound";
                            const isConfirmationEmail = email.subject
                              ?.toLowerCase()
                              .includes("ticket created:");
                            return !(isOutgoing && isConfirmationEmail);
                          },
                        );

                        return (
                          <>
                            {!loadingEmails && filteredEmails.length === 0 && (
                              <div className="text-center py-12 bg-gray-50 rounded-lg">
                                <svg
                                  className="mx-auto h-12 w-12 text-gray-400"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                                  />
                                </svg>
                                <p className="mt-4 text-sm text-gray-600">
                                  No email communications found
                                </p>
                                <p className="mt-1 text-xs text-gray-500">
                                  Email thread will appear here once messages
                                  are exchanged
                                </p>
                              </div>
                            )}

                            {filteredEmails.map((email, index) => {
                              const isIncoming =
                                email.direction === "incoming" ||
                                email.direction === "inbound";
                              const isExpanded = expandedEmails.has(email._id);
                              const emailBody =
                                email.htmlBody || email.bodyHtml || email.body;
                              const isLongEmail = emailBody.length > 500;
                              const displayBody =
                                !isExpanded && isLongEmail
                                  ? emailBody.substring(0, 500) + "..."
                                  : emailBody;

                              return (
                                <div
                                  key={email._id}
                                  className={`relative border-l-4 pl-6 pr-4 py-4 rounded-r-lg ${isIncoming
                                      ? "bg-blue-50 border-blue-500"
                                      : "bg-green-50 border-green-500"
                                    }`}
                                >
                                  {/* Thread indicator line */}
                                  {index > 0 && (
                                    <div
                                      className="absolute left-0 -top-4 w-0.5 h-4 bg-gray-300"
                                      style={{ marginLeft: "-2px" }}
                                    />
                                  )}

                                  {/* Email header */}
                                  <div className="flex items-start justify-between mb-3">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span
                                          className={`text-xs font-semibold px-2 py-1 rounded ${isIncoming
                                              ? "bg-blue-100 text-blue-700"
                                              : "bg-green-100 text-green-700"
                                            }`}
                                        >
                                          {isIncoming
                                            ? "📥 INCOMING"
                                            : "📤 OUTGOING"}
                                        </span>
                                        <span className="text-xs text-gray-500">
                                          {new Date(
                                            email.createdAt,
                                          ).toLocaleString()}
                                        </span>
                                      </div>
                                      <div className="text-sm">
                                        <p className="font-medium text-gray-900">
                                          <span className="text-gray-600">
                                            From:
                                          </span>{" "}
                                          {email.fromEmail}
                                        </p>
                                        <p className="text-gray-700">
                                          <span className="text-gray-600">
                                            To:
                                          </span>{" "}
                                          {email.toEmail}
                                        </p>
                                        {email.ccEmails &&
                                          email.ccEmails.length > 0 && (
                                            <p className="text-gray-600 text-xs">
                                              CC: {email.ccEmails.join(", ")}
                                            </p>
                                          )}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Email subject */}
                                  <div className="mb-3">
                                    <p className="text-sm font-semibold text-gray-900">
                                      Subject: {email.subject}
                                    </p>
                                  </div>

                                  {/* Email body */}
                                  <div className="mb-3">
                                    {email.htmlBody || email.bodyHtml ? (
                                      <div
                                        className="prose prose-sm max-w-none text-gray-700 bg-white p-3 rounded border border-gray-200"
                                        dangerouslySetInnerHTML={{
                                          __html: displayBody,
                                        }}
                                      />
                                    ) : (
                                      <div className="text-sm text-gray-700 bg-white p-3 rounded border border-gray-200 whitespace-pre-wrap">
                                        {displayBody}
                                      </div>
                                    )}
                                  </div>

                                  {/* Expand/Collapse button for long emails */}
                                  {isLongEmail && (
                                    <button
                                      onClick={() =>
                                        toggleEmailExpanded(email._id)
                                      }
                                      className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                                    >
                                      {isExpanded
                                        ? "▲ Show less"
                                        : "▼ Show more"}
                                    </button>
                                  )}

                                  {/* Attachments */}
                                  {email.attachments &&
                                    email.attachments.length > 0 && (
                                      <div className="mt-3 pt-3 border-t border-gray-200">
                                        <p className="text-xs font-medium text-gray-700 mb-2">
                                          📎 Attachments (
                                          {email.attachments.length})
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                          {email.attachments.map((att, i) =>
                                            att.path ? (
                                              <button
                                                key={i}
                                                type="button"
                                                onClick={() =>
                                                  openAttachment(att.path)
                                                }
                                                className="flex items-center gap-1 text-xs bg-white px-2 py-1 rounded border border-blue-300 text-blue-600 hover:bg-blue-50"
                                              >
                                                <PaperClipIcon className="h-3 w-3" />
                                                {att.originalName ||
                                                  att.filename}{" "}
                                                ({(att.size / 1024).toFixed(1)}{" "}
                                                KB)
                                              </button>
                                            ) : (
                                              <span
                                                key={i}
                                                className="text-xs bg-white px-2 py-1 rounded border border-gray-300 text-gray-500"
                                              >
                                                {att.originalName ||
                                                  att.filename}{" "}
                                                ({(att.size / 1024).toFixed(1)}{" "}
                                                KB)
                                              </span>
                                            ),
                                          )}
                                        </div>
                                      </div>
                                    )}

                                  {/* Email metadata */}
                                  <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-500">
                                    <div className="flex items-center gap-4">
                                      <span>
                                        Message ID:{" "}
                                        {email.messageId.substring(0, 20)}...
                                      </span>
                                      {email.inReplyTo && (
                                        <span>
                                          ↩️ Reply to:{" "}
                                          {email.inReplyTo.substring(0, 20)}...
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {/* Task 7.1: Email Reply Form */}
                  {!loadingEmails && ticket.sourceEmail && (
                    <div className="mt-6">
                      {/* Success/Error Messages */}
                      {replySuccess && (
                        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                          <span className="text-green-600">✅</span>
                          <span className="text-sm text-green-700">
                            {replySuccess}
                          </span>
                        </div>
                      )}
                      {replyError && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                          <span className="text-red-600">❌</span>
                          <span className="text-sm text-red-700">
                            {replyError}
                          </span>
                        </div>
                      )}

                      {/* Reply Button or Form (only when assigned to me / modify-any) */}
                      {!canModify ? null : !showReplyForm ? (
                        <button
                          onClick={handleOpenReplyForm}
                          className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center justify-center gap-2 transition-colors"
                        >
                          <span>📧</span>
                          <span>Reply via Email</span>
                        </button>
                      ) : (
                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-semibold text-gray-900">
                              Reply to: {ticket.sourceEmail}
                            </h4>
                            <button
                              onClick={() => {
                                setShowReplyForm(false);
                                setReplyError("");
                              }}
                              className="text-gray-400 hover:text-gray-600 transition-colors"
                              disabled={sendingReply}
                            >
                              ✕
                            </button>
                          </div>

                          {/* Reply Textarea */}
                          {emailDraftRestored && (
                            <div className="text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 text-sm mb-2 flex items-center justify-between">
                              <span>
                                📋 Draft restored — your unsent email reply has
                                been loaded
                              </span>
                              <button
                                type="button"
                                onClick={dismissEmailDraftBanner}
                                className="ml-2 text-amber-500 hover:text-amber-700 font-bold"
                              >
                                ✕
                              </button>
                            </div>
                          )}
                          {emailDraftStatus !== "idle" && (
                            <div
                              style={{
                                fontSize: 12,
                                marginBottom: 4,
                                color:
                                  emailDraftStatus === "saved"
                                    ? "#16a34a"
                                    : emailDraftStatus === "saving"
                                      ? "#2563eb"
                                      : emailDraftStatus === "error"
                                        ? "#dc2626"
                                        : "#d97706",
                              }}
                            >
                              {emailDraftStatus === "saving"
                                ? "⏳ Saving draft…"
                                : emailDraftStatus === "saved"
                                  ? "✓ Draft saved"
                                  : emailDraftStatus === "error"
                                    ? "⚠ Failed to save draft"
                                    : "● Unsaved changes"}
                            </div>
                          )}
                          <textarea
                            value={replyContent}
                            onChange={(e) =>
                              onReplyContentChange(e.target.value)
                            }
                            placeholder="Type your reply here..."
                            rows={6}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
                            disabled={sendingReply}
                          />

                          {/* Signature preview (HTML from rich-text editor in config) */}
                          {emailSignature && (
                            <div className="mt-2 border-t border-dashed border-gray-200 pt-2">
                              <p className="text-xs text-gray-400 mb-1">
                                Signature:
                              </p>
                              <div
                                className="text-sm text-gray-600 [&_img]:inline [&_img]:align-middle [&_img]:max-w-[200px] [&_img]:max-h-[80px] [&_p]:text-left"
                                dangerouslySetInnerHTML={{
                                  __html: DOMPurify.sanitize(emailSignature),
                                }}
                              />
                            </div>
                          )}

                          {/* Action Buttons */}
                          <div className="flex items-center justify-between mt-3">
                            <span className="text-xs text-gray-500">
                              {replyContent.length} characters
                            </span>
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  setShowReplyForm(false);
                                  setReplyError("");
                                }}
                                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                                disabled={sendingReply}
                              >
                                Cancel
                              </button>
                              <button
                                onClick={handleSendReply}
                                disabled={sendingReply || !replyContent.trim()}
                                className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
                              >
                                {sendingReply ? (
                                  <>
                                    <span className="animate-spin">⏳</span>
                                    <span>Sending...</span>
                                  </>
                                ) : (
                                  <>
                                    <span>📤</span>
                                    <span>Send Reply</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column - Sidebar */}
            <div className="space-y-6">
              {/* Ticket Info Card */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Query Information
                </h3>

                <div className="space-y-4">
                  {/* Status */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Status
                    </label>
                    {isSr ? (
                      <div>
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(ticket.status)}`}
                        >
                          {getStatusDisplayName(Number(ticket.status))}
                        </span>
                        {/* The SR lifecycle actions live here, next to the
                            status they change — WIP (with committed date),
                            Resolve, Close, Re-open, Cancel, each with the
                            rules the generic dropdown skipped. */}
                        <div className="mt-3">
                          <SrLifecyclePanel
                            ticket={ticket}
                            onChanged={fetchTicketDetails}
                            hideHeader
                          />
                        </div>
                      </div>
                    ) : (
                    <select
                      value={ticket.status || ""}
                      disabled={!canModify}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (!value) return; // Don't update if no value selected

                        const newStatusCode = Number(value);
                        if (isNaN(newStatusCode)) {
                          console.error(
                            "❌ Invalid status value from dropdown:",
                            value,
                          );
                          return;
                        }

                        console.log(
                          "✅ Status dropdown changed:",
                          value,
                          "→",
                          newStatusCode,
                        );
                        setNewStatus(newStatusCode);
                        // Show confirmation modal before saving
                        const fromLabel = getStatusDisplayName(
                          Number(ticket.status),
                        );
                        const toLabel = getStatusDisplayName(newStatusCode);
                        setConfirmModal({
                          open: true,
                          field: "Status",
                          from: fromLabel,
                          to: toLabel,
                          onConfirm: () => handleUpdateStatus(newStatusCode),
                        });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      {statusOptions
                        .filter((status: any) => queryStatusAllowed(Number(status.code)))
                        .map((status: any) => (
                          <option key={status.code} value={status.code}>
                            {status.name}
                          </option>
                        ))}
                    </select>
                    )}
                  </div>

                  {/* Priority */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Priority
                    </label>
                    <select
                      value={ticket.priority.toUpperCase()}
                      disabled={!canModify}
                      onChange={(e) => {
                        const newPriorityValue = e.target.value;
                        setNewPriority(newPriorityValue);
                        // Show confirmation modal before saving
                        setConfirmModal({
                          open: true,
                          field: "Priority",
                          from: ticket.priority,
                          to: newPriorityValue,
                          onConfirm: () =>
                            handleUpdatePriority(newPriorityValue),
                        });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      {priorityOptions.map((priority) => (
                        <option key={priority} value={priority.toUpperCase()}>
                          {priority}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Priority Resolution Timer - Shows overall priority-level resolution time */}
                  {(() => {
                    // Check if ticket is resolved or closed.
                    // Use closedAt as the primary guard to handle custom isClosed status codes.
                    const statusLower = String(ticket.status).toLowerCase();
                    const ticketClosedAt = (ticket as any).closedAt as
                      | string
                      | undefined;
                    const isResolved =
                      String(ticket.status) === "4" ||
                      statusLower === "resolved" ||
                      !!(ticket as any).resolvedAt;
                    const isClosed =
                      String(ticket.status) === "5" ||
                      statusLower === "closed" ||
                      statusLower === "close" ||
                      !!ticketClosedAt; // most reliable: set for ALL closing status codes
                    const isComplete = isResolved || isClosed;

                    // Get priority resolution time from SLA rules
                    // Match by: 1) rule.priority field, 2) rule.name field (fallback)
                    // Priority can be either a string "MEDIUM" or object { name: "MEDIUM" }
                    const ticketPriorityUpper = ticket.priority.toUpperCase();
                    const matchingSlaRule = slaRules.find((rule: any) => {
                      // Try matching by priority field first
                      const rulePriority =
                        typeof rule.priority === "string"
                          ? rule.priority.toUpperCase()
                          : rule.priority?.name?.toUpperCase();
                      if (
                        rulePriority &&
                        rulePriority === ticketPriorityUpper
                      ) {
                        return true;
                      }
                      // Fallback: match by rule name (e.g., rule.name = "Normal" matches ticket.priority = "NORMAL")
                      if (
                        rule.name &&
                        rule.name.toUpperCase() === ticketPriorityUpper
                      ) {
                        return true;
                      }
                      return false;
                    });

                    console.log("🎯 Priority SLA Debug:", {
                      ticketPriority: ticket.priority,
                      slaRulesCount: slaRules.length,
                      slaRuleNames: slaRules.map((r: any) => ({
                        name: r.name,
                        priority: r.priority,
                      })),
                      matchingSlaRule: matchingSlaRule
                        ? {
                          name: matchingSlaRule.name,
                          priority: matchingSlaRule.priority,
                          resolutionTime: matchingSlaRule.resolutionTime,
                        }
                        : null,
                    });

                    if (!matchingSlaRule?.resolutionTime) {
                      return null; // No SLA rule found for this priority
                    }

                    // Use roleLevelSLA.startedAt (adjusted for working hours) if available, otherwise createdAt
                    const slaStartedAt = (ticket as any).roleLevelSLA?.startedAt
                      ? new Date((ticket as any).roleLevelSLA.startedAt)
                      : new Date(ticket.createdAt);
                    const { value, unit } = matchingSlaRule.resolutionTime;

                    // Convert resolution time to milliseconds
                    let resolutionMs = 0;
                    switch (unit?.toLowerCase()) {
                      case "minutes":
                        resolutionMs = value * 60 * 1000;
                        break;
                      case "hours":
                        resolutionMs = value * 60 * 60 * 1000;
                        break;
                      case "days":
                        resolutionMs = value * 24 * 60 * 60 * 1000;
                        break;
                      default:
                        resolutionMs = value * 60 * 60 * 1000; // default to hours
                    }

                    const priorityDeadline = new Date(
                      slaStartedAt.getTime() + resolutionMs,
                    );
                    // Extract priority name from string or object
                    const priorityName =
                      typeof matchingSlaRule.priority === "string"
                        ? matchingSlaRule.priority
                        : matchingSlaRule.priority?.name || ticket.priority;

                    // Format the total resolution time for display
                    const totalResolutionDisplay =
                      unit?.toLowerCase() === "days"
                        ? `${value}d`
                        : unit?.toLowerCase() === "minutes"
                          ? `${value}m`
                          : `${value}h`;

                    let displayText = "";
                    let isBreached = false;
                    let bgColor = "";
                    let textColor = "";
                    let borderColor = "";
                    let iconColor = "";
                    let waitingForWorkingHours = false;
                    let dueInfo = "";

                    if (isComplete) {
                      // Ticket is resolved - show time taken vs allowed
                      const completedAt = new Date(
                        ticket.resolvedAt ||
                        ticket.closedAt ||
                        ticket.updatedAt,
                      );
                      const timeTakenMs =
                        completedAt.getTime() - slaStartedAt.getTime();
                      isBreached = timeTakenMs > resolutionMs;

                      displayText = isBreached
                        ? `Resolved in ${_formatSlaMsDetail(timeTakenMs)} (exceeded ${totalResolutionDisplay})`
                        : `Resolved in ${_formatSlaMsDetail(timeTakenMs)} (within ${totalResolutionDisplay})`;
                      dueInfo = `Closed at ${_formatDueTimestamp(completedAt)}`;

                      bgColor = isBreached ? "bg-red-50" : "bg-green-50";
                      borderColor = isBreached
                        ? "border-red-300"
                        : "border-green-300";
                      textColor = isBreached
                        ? "text-red-600"
                        : "text-green-600";
                      iconColor = isBreached
                        ? "text-red-500"
                        : "text-green-500";
                    } else {
                      // Ticket is open - check if SLA has started (working hours)
                      const now = new Date();
                      const slaNotStartedYet = now < slaStartedAt;

                      if (slaNotStartedYet) {
                        // SLA hasn't started yet - show "Starts in X" with blue styling
                        const startsInMs =
                          slaStartedAt.getTime() - now.getTime();
                        displayText = `Starts in ${_formatSlaMsDetail(startsInMs)}`;
                        dueInfo = `Starts at ${_formatDueTimestamp(slaStartedAt)}`;

                        bgColor = "bg-blue-50";
                        borderColor = "border-blue-300";
                        textColor = "text-blue-600";
                        iconColor = "text-blue-500";
                        waitingForWorkingHours = true;
                      } else {
                        // SLA is running - show remaining time
                        const diffMs =
                          priorityDeadline.getTime() - now.getTime();
                        isBreached = diffMs < 0;
                        const absDiffMs = Math.abs(diffMs);

                        displayText = isBreached
                          ? `Overdue by ${_formatSlaMsDetail(absDiffMs)}`
                          : `${_formatSlaMsDetail(absDiffMs)} remaining`;
                        dueInfo = isBreached
                          ? `Was due at ${_formatDueTimestamp(priorityDeadline)}`
                          : `Due at ${_formatDueTimestamp(priorityDeadline)}`;

                        bgColor = isBreached ? "bg-red-50" : "bg-purple-50";
                        borderColor = isBreached
                          ? "border-red-300"
                          : "border-purple-300";
                        textColor = isBreached
                          ? "text-red-600"
                          : "text-purple-600";
                        iconColor = isBreached
                          ? "text-red-500"
                          : "text-purple-500";
                      }
                    }

                    return (
                      <div
                        className={`p-3 rounded-lg border ${bgColor} ${borderColor}`}
                      >
                        <div className="flex items-center space-x-2">
                          <div className={`flex-shrink-0 ${iconColor}`}>
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-5 w-5"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path
                                fillRule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </div>
                          <div className="flex-1">
                            <p className="text-xs font-medium text-gray-700">
                              {ticket.slaTracking?.slaSource === "category"
                                ? "Category SLA"
                                : `${priorityName} Priority SLA`}{" "}
                              ({totalResolutionDisplay})
                            </p>
                            <p className={`text-lg font-bold ${textColor}`}>
                              {displayText}
                            </p>
                            {waitingForWorkingHours && (
                              <p className="text-xs text-blue-500 mt-1">
                                <span className="inline-block w-2 h-2 bg-blue-400 rounded-full mr-1"></span>
                                Waiting for working hours
                              </p>
                            )}
                            {dueInfo && (
                              <p className="text-xs text-gray-600 mt-1">
                                🕒 {dueInfo}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Escalation Level Countdown - Uses fetched escalation matrix */}
                  {(() => {
                    // Check if ticket is resolved or closed (handle both numeric and string values).
                    // Use closedAt as the primary guard for custom isClosed status codes.
                    const statusLower = String(ticket.status).toLowerCase();
                    const isResolved =
                      String(ticket.status) === "4" ||
                      statusLower === "resolved" ||
                      !!(ticket as any).resolvedAt;
                    const isClosed =
                      String(ticket.status) === "5" ||
                      statusLower === "closed" ||
                      statusLower === "close" ||
                      !!(ticket as any).closedAt; // most reliable: set for ALL closing status codes
                    const isComplete = isResolved || isClosed;

                    // Use escalation matrix from state (fetched via ticket.escalationMatrixId)
                    if (
                      !escalationMatrix ||
                      !escalationMatrix.levels ||
                      escalationMatrix.levels.length === 0
                    ) {
                      console.log(
                        "⚠️ No escalation matrix available for timer",
                      );
                      return null;
                    }

                    console.log(
                      "📋 Using Escalation Matrix:",
                      escalationMatrix.name,
                    );
                    console.log(
                      "📋 Escalation Matrix Levels:",
                      escalationMatrix.levels,
                    );

                    // Get current escalation level (0-based index, default to first level)
                    const currentLevelIndex =
                      ticket.currentEscalationLevelNumber
                        ? ticket.currentEscalationLevelNumber - 1
                        : 0;

                    // Get the current level configuration
                    const currentLevelConfig =
                      escalationMatrix.levels[currentLevelIndex] ||
                      escalationMatrix.levels[0];

                    // Determine the level label
                    const timeLabel =
                      currentLevelConfig.levelName ||
                      `Level ${currentLevelConfig.levelNumber || currentLevelIndex + 1} SLA`;

                    // Calculate SLA time for current level
                    let levelSlaMs = 0;
                    const slaHours = currentLevelConfig.slaHours || 0;
                    const slaUnit =
                      currentLevelConfig.slaUnit?.toLowerCase() || "hrs";

                    switch (slaUnit) {
                      case "mins":
                      case "min":
                      case "minutes":
                        levelSlaMs = slaHours * 60 * 1000;
                        break;
                      case "hrs":
                      case "hr":
                      case "hours":
                        levelSlaMs = slaHours * 60 * 60 * 1000;
                        break;
                      case "days":
                      case "day":
                        levelSlaMs = slaHours * 24 * 60 * 60 * 1000;
                        break;
                      default:
                        levelSlaMs = slaHours * 60 * 60 * 1000; // default to hours
                    }

                    // Calculate deadline from ticket creation
                    // For levels > 1, need to add previous levels' time
                    let totalPreviousLevelsMs = 0;
                    for (let i = 0; i < currentLevelIndex; i++) {
                      const prevLevel = escalationMatrix.levels[i];
                      if (prevLevel) {
                        const prevHours = prevLevel.slaHours || 0;
                        const prevUnit =
                          prevLevel.slaUnit?.toLowerCase() || "hrs";
                        switch (prevUnit) {
                          case "mins":
                          case "min":
                          case "minutes":
                            totalPreviousLevelsMs += prevHours * 60 * 1000;
                            break;
                          case "days":
                          case "day":
                            totalPreviousLevelsMs +=
                              prevHours * 24 * 60 * 60 * 1000;
                            break;
                          default: // hours
                            totalPreviousLevelsMs += prevHours * 60 * 60 * 1000;
                        }
                      }
                    }

                    // Use roleLevelSLA.startedAt if available (respects working calendar)
                    // Otherwise fall back to ticket.createdAt + previous levels time
                    const createdAt = new Date(ticket.createdAt);
                    const slaStartTime = (ticket as any).roleLevelSLA?.startedAt
                      ? new Date((ticket as any).roleLevelSLA.startedAt)
                      : new Date(createdAt.getTime() + totalPreviousLevelsMs);
                    const levelStartTime = slaStartTime;
                    const levelDeadline = new Date(
                      levelStartTime.getTime() + levelSlaMs,
                    );

                    // Check if SLA hasn't started yet (outside working hours)
                    const now = new Date();
                    const slaNotStartedYet = now < slaStartTime;

                    // Format SLA time for display
                    const slaDisplay = slaUnit.startsWith("min")
                      ? `${slaHours}m`
                      : slaUnit.startsWith("day")
                        ? `${slaHours}d`
                        : `${slaHours}h`;

                    let displayText = "";
                    let isBreached = false;
                    let bgColor = "";
                    let textColor = "";
                    let borderColor = "";
                    let nextEscalationInfo = "";
                    let escalateAtInfo = "";

                    if (isComplete) {
                      // Ticket is resolved or closed - show time taken
                      const completedAt = new Date(
                        ticket.resolvedAt ||
                        ticket.closedAt ||
                        ticket.updatedAt,
                      );
                      const timeTakenMs =
                        completedAt.getTime() - levelStartTime.getTime();

                      isBreached = timeTakenMs > levelSlaMs;
                      displayText = `Resolved in ${_formatSlaMsDetail(Math.abs(timeTakenMs))}`;
                      escalateAtInfo = `Closed at ${_formatDueTimestamp(completedAt)}`;

                      bgColor = isBreached ? "bg-red-50" : "bg-green-50";
                      borderColor = isBreached
                        ? "border-red-300"
                        : "border-green-300";
                      textColor = isBreached
                        ? "text-red-600"
                        : "text-green-600";
                    } else if (slaNotStartedYet) {
                      // SLA hasn't started yet (outside working hours)
                      const startsInMs = slaStartTime.getTime() - now.getTime();
                      displayText = `Starts in ${_formatSlaMsDetail(startsInMs)}`;

                      bgColor = "bg-blue-50";
                      borderColor = "border-blue-300";
                      textColor = "text-blue-600";
                      nextEscalationInfo = "Waiting for working hours";
                      escalateAtInfo = `Starts at ${_formatDueTimestamp(slaStartTime)}`;
                    } else {
                      // Ticket is still open and SLA has started - show remaining time for this level
                      const diffMs = levelDeadline.getTime() - now.getTime();
                      isBreached = diffMs < 0;

                      const absDiffMs = Math.abs(diffMs);

                      displayText = isBreached
                        ? `Overdue by ${_formatSlaMsDetail(absDiffMs)}`
                        : `${_formatSlaMsDetail(absDiffMs)} remaining`;
                      escalateAtInfo = isBreached
                        ? `Escalation due was ${_formatDueTimestamp(levelDeadline)}`
                        : `Auto-escalates at ${_formatDueTimestamp(levelDeadline)}`;

                      bgColor = isBreached ? "bg-red-50" : "bg-blue-50";
                      borderColor = isBreached
                        ? "border-red-300"
                        : "border-blue-300";
                      textColor = isBreached ? "text-red-600" : "text-blue-600";

                      // Show auto-escalation info only if autoEscalate is enabled AND not on last level
                      if (
                        !isBreached &&
                        escalationMatrix.autoEscalate === true &&
                        currentLevelIndex < escalationMatrix.levels.length - 1
                      ) {
                        nextEscalationInfo = `Auto-escalates in ${_formatSlaMsDetail(absDiffMs)}`;
                      }
                    }

                    return (
                      <div
                        className={`p-3 rounded-lg border ${bgColor} ${borderColor}`}
                      >
                        <div className="flex items-center space-x-2">
                          <ClockIcon className={`h-5 w-5 ${textColor}`} />
                          <div className="flex-1">
                            <p className="text-xs font-medium text-gray-700">
                              {timeLabel} ({slaDisplay})
                            </p>
                            <p className={`text-lg font-bold ${textColor}`}>
                              {displayText}
                            </p>
                            {nextEscalationInfo && (
                              <p className="text-xs text-orange-600 mt-1">
                                ⬆️ {nextEscalationInfo}
                              </p>
                            )}
                            {escalateAtInfo && (
                              <p className="text-xs text-gray-600 mt-1">
                                🕒 {escalateAtInfo}
                              </p>
                            )}
                            {currentLevelIndex > 0 && (
                              <p className="text-xs text-gray-500 mt-1">
                                Escalated {currentLevelIndex} time
                                {currentLevelIndex > 1 ? "s" : ""}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Category */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Category
                    </label>
                    {/* Use hierarchical category selector if multi-level hierarchy is configured */}
                    {hierarchyConfig &&
                      hierarchyConfig.levelCount > 1 &&
                      ticketProjectId ? (
                      <div>
                        {!(canDo(permissions, "CHANGE_CATEGORY", recordType) && canModify) ? (
                          <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 text-sm cursor-not-allowed">
                            {ticket.categoryHierarchy?.displayPath ||
                              "No category selected"}
                            <span className="ml-2 text-xs text-gray-400">
                              (read-only)
                            </span>
                          </div>
                        ) : (
                          <HierarchyCategorySelector
                            projectId={ticketProjectId}
                            value={
                              categoryHierarchy.level1
                                ? categoryHierarchy
                                : ticket.categoryHierarchy || {}
                            }
                            onChange={(newValue) => {
                              setCategoryHierarchy(newValue);
                              // Show confirmation modal before saving
                              const fromPath =
                                ticket.categoryHierarchy?.displayPath ||
                                "current category";
                              const toPath =
                                newValue.displayPath || "new category";
                              setConfirmModal({
                                open: true,
                                field: "Category",
                                from: fromPath,
                                to: toPath,
                                onConfirm: () =>
                                  handleUpdateCategoryHierarchy(
                                    newValue,
                                    fromPath,
                                    toPath,
                                  ),
                              });
                            }}
                            mode="display"
                            showValidation={false}
                            ticketType={
                              (ticket as any)?.interactionType === "PSR" ||
                              (ticket as any)?.interactionType === "ISR"
                                ? (ticket as any).interactionType
                                : "normal"
                            }
                          />
                        )}
                      </div>
                    ) : (
                      <select
                        disabled={
                          !(canDo(permissions, "CHANGE_CATEGORY", recordType) && canModify)
                        }
                        value={
                          typeof ticket.category === "object" &&
                            ticket.category !== null
                            ? (ticket.category as any)._id
                            : String(ticket.category || "")
                        }
                        onChange={(e) => {
                          const newCategoryId = e.target.value;
                          setNewCategory(newCategoryId);
                          // Show confirmation modal before saving
                          const fromCatName =
                            typeof ticket.category === "object" &&
                              ticket.category !== null
                              ? (ticket.category as any).name
                              : categories.find(
                                (c) =>
                                  String(c._id) === String(ticket.category),
                              )?.name || String(ticket.category);
                          const toCatName =
                            categories.find((c) => c._id === newCategoryId)
                              ?.name || newCategoryId;
                          setConfirmModal({
                            open: true,
                            field: "Category",
                            from: fromCatName,
                            to: toCatName,
                            onConfirm: () =>
                              handleUpdateCategory(
                                newCategoryId,
                                fromCatName,
                                toCatName,
                              ),
                          });
                        }}
                        className={`w-full px-3 py-2 border rounded-lg ${(canDo(permissions, "CHANGE_CATEGORY", recordType) && canModify)
                            ? "border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            : "border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed"
                          }`}
                      >
                        {categories.map((cat) => (
                          <option key={cat._id} value={cat._id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Assigned To */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Assigned To
                    </label>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <UserIcon className="h-5 w-5 text-gray-400" />
                        <span className="text-sm text-gray-900">
                          {ticket.assignedTo
                            ? personName(ticket.assignedTo) || "Unassigned"
                            : "Unassigned"}
                        </span>
                      </div>
                      {/* A service request is reassigned from the SR panel,
                          which applies the project's reassign settings (roles
                          excluded, department first). */}
                      {!isSr && canDo(permissions, "REASSIGN", recordType) && (
                        <button
                          onClick={openReassignModal}
                          className="text-xs px-2 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded hover:bg-blue-100 transition-colors font-medium"
                        >
                          Reassign
                        </button>
                      )}
                    </div>
                    {/* US-015: assignedVia badge — visible to agents/admins only */}
                    {ticket.assignedVia && (
                      <div className="mt-1.5">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                          style={{
                            backgroundColor:
                              (
                                {
                                  "round-robin": "#dbeafe",
                                  "by-role": "#ede9fe",
                                  "by-user": "#d1fae5",
                                  manual: "#f3f4f6",
                                  "condition-based": "#fef3c7",
                                  fallback: "#ffedd5",
                                } as Record<string, string>
                              )[ticket.assignedVia] ?? "#f3f4f6",
                            color:
                              (
                                {
                                  "round-robin": "#1d4ed8",
                                  "by-role": "#6d28d9",
                                  "by-user": "#065f46",
                                  manual: "#374151",
                                  "condition-based": "#92400e",
                                  fallback: "#9a3412",
                                } as Record<string, string>
                              )[ticket.assignedVia] ?? "#374151",
                          }}
                        >
                          {(
                            {
                              "round-robin": "↺ Round Robin",
                              "by-role": "● By Role",
                              "by-user": "→ By User",
                              manual: "✏ Manual",
                              "condition-based": "⚙ Auto (Rule)",
                              fallback: "⚠ Fallback",
                            } as Record<string, string>
                          )[ticket.assignedVia] ?? ticket.assignedVia}
                        </span>
                        {/* US-ASSIGN-002: show category rule name for by-role / by-user */}
                        {(ticket.assignedVia === "by-role" ||
                          ticket.assignedVia === "by-user") &&
                          ticket.assignedViaCategoryId && (
                            <span
                              style={{
                                fontSize: "11px",
                                color: "#6b7280",
                                marginLeft: "6px",
                              }}
                            >
                              via{" "}
                              <span style={{ fontStyle: "italic" }}>
                                {typeof ticket.assignedViaCategoryId ===
                                  "object"
                                  ? ticket.assignedViaCategoryId.name
                                  : "Category Rule"}
                              </span>
                            </span>
                          )}
                      </div>
                    )}
                  </div>

                  {/* Escalation Matrix Info (US-ESC-004) */}
                  {(ticket.escalationMatrixId ||
                    ticket.escalationMatrixName) && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Escalation Matrix
                        </label>
                        <div className="rounded-lg border border-purple-100 bg-purple-50 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-purple-900">
                              {ticket.escalationMatrixName ||
                                escalationMatrix?.name ||
                                "—"}
                            </span>
                            {ticket.currentEscalationLevelNumber && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                                L{ticket.currentEscalationLevelNumber}
                              </span>
                            )}
                          </div>
                          {escalationMatrix?.levels &&
                            escalationMatrix.levels.length > 0 && (
                              <div className="space-y-1 mt-1">
                                {[...escalationMatrix.levels]
                                  .sort(
                                    (a: any, b: any) =>
                                      a.levelNumber - b.levelNumber,
                                  )
                                  .map((level: any) => {
                                    const isCurrent =
                                      level.levelNumber ===
                                      ticket.currentEscalationLevelNumber;
                                    return (
                                      <div
                                        key={level._id || level.levelNumber}
                                        className={`flex items-center gap-2 text-xs rounded px-2 py-1 ${isCurrent ? "bg-orange-100 text-orange-800 font-medium" : "text-gray-600"}`}
                                      >
                                        <span
                                          className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${isCurrent ? "bg-orange-500 text-white" : "bg-gray-200 text-gray-600"}`}
                                        >
                                          {level.levelNumber}
                                        </span>
                                        <span className="flex-1 truncate">
                                          {level.levelName}
                                        </span>
                                        <span className="text-gray-400 flex-shrink-0">
                                          {level.slaHours}
                                          {level.slaUnit === "mins"
                                            ? "m"
                                            : level.slaUnit === "days"
                                              ? "d"
                                              : "h"}
                                        </span>
                                        {isCurrent && (
                                          <span className="flex-shrink-0 text-orange-600 font-semibold">
                                            ← now
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                              </div>
                            )}
                        </div>
                      </div>
                    )}

                  {/* Requester */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Requester
                    </label>
                    <div className="space-y-1">
                      {(ticket.metadata?.requestedByName || ticket.metadata?.requestedBy?.name) && (
                        <p className="text-sm text-gray-900">
                          {ticket.metadata?.requestedByName || ticket.metadata?.requestedBy?.name}
                        </p>
                      )}
                      {(ticket.metadata?.requestedByEmail || ticket.metadata?.requestedBy?.email) && (
                        <p className="text-sm text-gray-600">
                          {ticket.metadata?.requestedByEmail || ticket.metadata?.requestedBy?.email}
                        </p>
                      )}
                      {(ticket.metadata?.requestedByMobile || ticket.metadata?.requestedBy?.mobile) && (
                        <p className="text-sm text-gray-600">
                          {ticket.metadata?.requestedByMobile || ticket.metadata?.requestedBy?.mobile}
                        </p>
                      )}
                      {ticket.metadata?.studentName && (
                        <p className="text-sm text-gray-900">
                          {ticket.metadata.studentName}
                        </p>
                      )}
                      {ticket.metadata?.studentEmail && (
                        <p className="text-sm text-gray-600">
                          {ticket.metadata.studentEmail}
                        </p>
                      )}
                      {ticket.metadata?.studentPhone && (
                        <p className="text-sm text-gray-600">
                          {ticket.metadata.studentPhone}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Form Details Card — custom fields submitted with the ticket */}
              {(() => {
                const schema = ticket.formSchemaSnapshot || [];
                const customFields = ticket.metadata?.customFields || {};
                // Standard fields already shown elsewhere; skip them
                const standardKeys = new Set([
                  "Name",
                  "Email",
                  "Phone",
                  "Subject",
                  "Description",
                  "Category",
                  "Subcategory",
                ]);
                // Build rows: prefer schema order, fall back to raw customFields keys
                const schemaRows = schema.filter(
                  (f) => !standardKeys.has(f.fieldName),
                );
                const extraKeys = Object.keys(customFields).filter(
                  (k) =>
                    !standardKeys.has(k) &&
                    !schemaRows.find((f) => f.fieldName === k),
                );
                const allRows = [
                  ...schemaRows.map((f) => ({
                    label: f.fieldName,
                    value: customFields[f.fieldName],
                  })),
                  ...extraKeys.map((k) => ({
                    label: k,
                    value: customFields[k],
                  })),
                ].filter(
                  (r) =>
                    r.value !== undefined && r.value !== null && r.value !== "",
                );

                if (allRows.length === 0) return null;

                return (
                  <div className="bg-white rounded-xl shadow-sm p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      Form Details
                    </h3>
                    <div className="space-y-3">
                      {allRows.map(({ label, value }) => (
                        <div key={label}>
                          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-0.5">
                            {label}
                          </p>
                          <p className="text-sm text-gray-900 break-words">
                            {Array.isArray(value)
                              ? value.join(", ")
                              : String(value)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Tags Card */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Tags</h3>
                  <button
                    onClick={() => setIsAddingTag(true)}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    + Add
                  </button>
                </div>

                {isAddingTag && (
                  <div className="mb-4 space-y-2">
                    <input
                      type="text"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      placeholder="Enter tag name"
                      list="available-tags"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <datalist id="available-tags">
                      {availableTags.map((tag, index) => (
                        <option key={index} value={tag} />
                      ))}
                    </datalist>
                    <div className="flex space-x-2">
                      <button
                        onClick={handleAddTag}
                        className="flex-1 px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => {
                          setIsAddingTag(false);
                          setNewTag("");
                        }}
                        className="flex-1 px-3 py-1 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {ticket.tags && ticket.tags.length > 0 ? (
                    ticket.tags.map((tag, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center space-x-1 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm"
                      >
                        <TagIcon className="h-3 w-3" />
                        <span>{tag}</span>
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          className="ml-1 hover:text-blue-900"
                        >
                          ×
                        </button>
                      </span>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500">No tags added</p>
                  )}
                </div>
              </div>

              {/* Escalate Card - hidden for resolved/closed/merged tickets */}
              {ticket &&
                !ticket.isMerged &&
                Number(ticket.status) !== 4 &&
                Number(ticket.status) !== 5 && (
                  <EscalationMatrixCard
                    ticketId={ticket._id}
                    currentLevelNumber={
                      ticket.currentEscalationLevelNumber ||
                      ticket.slaTracking?.currentEscalationLevel
                    }
                    matrixName={ticket.escalationMatrixName}
                    onEscalationComplete={fetchTicketDetails}
                    permissions={permissions}
                    projectSlug={customUrlPath}
                  />
                )}

              {/* Quick Actions — not for a PSR/ISR: resolve/close go through
                  the SR panel so its remark and closure rules apply. */}
              {(() => {
                if (isSr) return null;
                const currentStatusOption = statusOptions.find(
                  (s: any) => s.code === Number(ticket.status),
                );

                // Dynamically resolve status codes from project config instead of
                // relying on hardcoded codes 4 (resolved) and 5 (closed).
                // "Resolved" status: prefer one named "resolved", fall back to the
                // isClosed-flagged status (handles projects where they are the same).
                const resolvedStatusOption =
                  statusOptions.find((s: any) =>
                    s.name?.toLowerCase().includes("resolv"),
                  ) ??
                  statusOptions.find((s: any) => s.isClosed === true) ??
                  null;

                // "Closed" status: the one explicitly flagged with isClosed=true
                const closedStatusOption =
                  statusOptions.find((s: any) => s.isClosed === true) ?? null;

                const resolvedCode = resolvedStatusOption?.code ?? 4;
                const closedCode = closedStatusOption?.code ?? 5;

                // Is the current ticket already in a resolved or closed state?
                const isAlreadyClosed = currentStatusOption?.isClosed === true;
                const isAlreadyResolved =
                  isAlreadyClosed || Number(ticket.status) === resolvedCode;

                // Show "Close Query" only when it maps to a DIFFERENT status than
                // "Mark as Resolved" (e.g. project has separate Resolved and Closed
                // statuses). When they are the same status, one button is enough.
                const showCloseButton =
                  !isAlreadyClosed &&
                  closedStatusOption != null &&
                  closedCode !== resolvedCode &&
                  queryStatusAllowed(closedCode);

                if (isAlreadyResolved && isAlreadyClosed) return null;
                const showResolveButton =
                  !isAlreadyResolved &&
                  !!resolvedStatusOption &&
                  queryStatusAllowed(resolvedCode);
                // Nothing the rules allow from here → no empty card.
                if (!showResolveButton && !showCloseButton) return null;

                return (
                  <div className="bg-white rounded-xl shadow-sm p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      Quick Actions
                    </h3>
                    <div className="space-y-2">
                      {!isAlreadyResolved &&
                        resolvedStatusOption &&
                        queryStatusAllowed(resolvedCode) && (
                        <button
                          onClick={() => {
                            setConfirmModal({
                              open: true,
                              field: "Status",
                              from: getStatusDisplayName(
                                Number(ticket!.status),
                              ),
                              to: resolvedStatusOption.name ?? "Resolved",
                              onConfirm: () => handleUpdateStatus(resolvedCode),
                            });
                          }}
                          className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100"
                        >
                          <CheckCircleIcon className="h-5 w-5" />
                          <span>Mark as Resolved</span>
                        </button>
                      )}

                      {showCloseButton && (
                        <button
                          onClick={() => {
                            setConfirmModal({
                              open: true,
                              field: "Status",
                              from: getStatusDisplayName(
                                Number(ticket!.status),
                              ),
                              to: closedStatusOption!.name ?? "Closed",
                              onConfirm: () => handleUpdateStatus(closedCode),
                            });
                          }}
                          className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-gray-50 text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-100"
                        >
                          <XCircleIcon className="h-5 w-5" />
                          <span>Close Query</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
        {/* ── Field-Update Spinner Overlay ──────────────────────────────── */}
        {isFieldUpdating && (
          <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center gap-4">
              {/* Spinner */}
              <svg
                className="animate-spin h-10 w-10 text-blue-600"
                xmlns="http://www.w3.org/2000/svg"
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
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              <p className="text-sm font-medium text-gray-700">
                Saving changes…
              </p>
            </div>
          </div>
        )}
        {/* ── Confirmation Modal ─────────────────────────────────────────── */}
        {confirmModal.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setConfirmModal((m) => ({ ...m, open: false }))}
            />
            {/* Dialog */}
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
              {/* Icon */}
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 mx-auto mb-4">
                <svg
                  className="h-6 w-6 text-amber-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 text-center mb-2">
                Confirm Change
              </h3>
              <p className="text-sm text-gray-600 text-center mb-6">
                Are you sure you want to change{" "}
                <span className="font-medium text-gray-800">
                  {confirmModal.field}
                </span>{" "}
                from{" "}
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-gray-100 text-gray-800 font-medium">
                  {confirmModal.from}
                </span>{" "}
                to{" "}
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-medium">
                  {confirmModal.to}
                </span>
                ?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() =>
                    setConfirmModal((m) => ({ ...m, open: false }))
                  }
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setConfirmModal((m) => ({ ...m, open: false }));
                    confirmModal.onConfirm();
                  }}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Yes, Change
                </button>
              </div>
            </div>
          </div>
        )}
        {/* ── Closing-Remark Modal ───────────────────────────────────────── */}
        {remarkModal.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setRemarkModal((m) => ({ ...m, open: false }))}
            />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
              {/* Icon */}
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 mx-auto mb-4">
                <svg
                  className="h-6 w-6 text-blue-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 text-center mb-1">
                {remarkModal.needsRemark && remarkModal.needsDate
                  ? "Remark and date required"
                  : remarkModal.needsDate
                    ? `${remarkModal.dateLabel || "Committed date"} required`
                    : "Remark required"}
              </h3>
              <p className="text-sm text-gray-500 text-center mb-5">
                Changing status from{" "}
                <span className="font-medium text-gray-700">
                  {remarkModal.fromLabel}
                </span>{" "}
                to{" "}
                <span className="font-medium text-blue-700">
                  {remarkModal.toLabel}
                </span>{" "}
                {remarkModal.needsRemark && remarkModal.needsDate
                  ? `requires a remark and a ${(remarkModal.dateLabel || "committed date").toLowerCase()}.`
                  : remarkModal.needsDate
                    ? `requires a ${(remarkModal.dateLabel || "committed date").toLowerCase()}.`
                    : "requires a remark."}
              </p>

              {/* Only shown when the status asks for a date — a closing status
                  usually wants the reason, not a commitment. */}
              {remarkModal.needsDate && (
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {remarkModal.dateLabel || "Committed date"}{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={remarkModal.remarkDate}
                    onChange={(e) =>
                      setRemarkModal((m) => ({
                        ...m,
                        remarkDate: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              )}

              {/* Remark textarea */}
              <div className="mb-5">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Remark{" "}
                  {remarkModal.needsRemark !== false ? (
                    <span className="text-red-500">*</span>
                  ) : (
                    <span className="text-gray-400 font-normal">(optional)</span>
                  )}
                </label>
                <textarea
                  rows={3}
                  placeholder={
                    remarkModal.needsRemark !== false
                      ? "Why is the status changing?"
                      : "Add a remark (optional)"
                  }
                  value={remarkModal.remark}
                  onChange={(e) =>
                    setRemarkModal((m) => ({ ...m, remark: e.target.value }))
                  }
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none ${remarkModal.remark.length > 0 &&
                      remarkModal.remark.trim().length < 10
                      ? "border-red-400"
                      : "border-gray-300"
                    }`}
                />
                <div className="flex justify-between mt-1">
                  {remarkModal.remark.length > 0 &&
                    remarkModal.remark.trim().length < 10 ? (
                    <span className="text-xs text-red-500">
                      Minimum 10 characters required
                    </span>
                  ) : (
                    <span />
                  )}
                  <span
                    className={`text-xs ${remarkModal.remark.trim().length < 10
                        ? "text-gray-400"
                        : "text-green-600"
                      }`}
                  >
                    {remarkModal.remark.trim().length}/10
                  </span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setRemarkModal((m) => ({ ...m, open: false }))}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  disabled={
                    (remarkModal.needsRemark !== false &&
                      remarkModal.remark.trim().length < 10) ||
                    (!!remarkModal.needsDate && !remarkModal.remarkDate)
                  }
                  onClick={() => {
                    const remarkMissing =
                      remarkModal.needsRemark !== false &&
                      remarkModal.remark.trim().length < 10;
                    const dateMissing =
                      !!remarkModal.needsDate && !remarkModal.remarkDate;
                    if (remarkMissing || dateMissing) return;
                    setRemarkModal((m) => ({ ...m, open: false }));
                    // Sent as two fields: the remark explains, the date
                    // commits. Packing them into one string is what filed WIP
                    // commitments under closingRemark.
                    handleUpdateStatus(
                      remarkModal.targetStatusCode,
                      remarkModal.remark.trim() || undefined,
                      remarkModal.needsDate ? remarkModal.remarkDate : undefined,
                    );
                  }}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Confirm &amp; Change Status
                </button>
              </div>
            </div>
          </div>
        )}
        {/* ── Reassign Modal ─────────────────────────────────────────────── */}{" "}
        {showReassignModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setShowReassignModal(false)}
            />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Reassign Ticket
              </h3>

              {/* Department selector */}
              <div className="mb-4 relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Department
                </label>
                <div className="relative">
                  <input
                    type="text"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                    placeholder={
                      reassignDepartmentId
                        ? (reassignDepartments.find(
                          (d) => d._id === reassignDepartmentId,
                        )?.name ?? "Search department...")
                        : "Search department..."
                    }
                    value={
                      deptDropdownOpen
                        ? deptSearch
                        : (reassignDepartments.find(
                          (d) => d._id === reassignDepartmentId,
                        )?.name ?? "")
                    }
                    onFocus={() => {
                      setDeptDropdownOpen(true);
                      setDeptSearch("");
                    }}
                    onChange={(e) => setDeptSearch(e.target.value)}
                    onBlur={() =>
                      setTimeout(() => setDeptDropdownOpen(false), 150)
                    }
                    readOnly={!deptDropdownOpen}
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-xs">
                    ▾
                  </span>
                </div>
                {deptDropdownOpen && (
                  <ul className="absolute z-10 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                    {reassignDepartments
                      .filter((d) =>
                        d.name.toLowerCase().includes(deptSearch.toLowerCase()),
                      )
                      .map((d) => (
                        <li
                          key={d._id}
                          className={`px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 ${d._id === reassignDepartmentId
                              ? "bg-blue-100 font-medium"
                              : ""
                            }`}
                          onMouseDown={() => {
                            setReassignDepartmentId(d._id);
                            setReassignAgentId("");
                            setAgentSearch("");
                            setDeptSearch("");
                            setDeptDropdownOpen(false);
                            fetchReassignAgents(d._id);
                          }}
                        >
                          {d.name}
                        </li>
                      ))}
                    {reassignDepartments.filter((d) =>
                      d.name.toLowerCase().includes(deptSearch.toLowerCase()),
                    ).length === 0 && (
                        <li className="px-3 py-2 text-sm text-gray-400">
                          No results
                        </li>
                      )}
                  </ul>
                )}
                {reassignDepartments.length === 0 && !deptDropdownOpen && (
                  <p className="text-xs text-gray-400 mt-1">
                    No departments found for this project. Please add
                    departments under Master Data first.
                  </p>
                )}
              </div>

              {/* Agent selector */}
              <div className="mb-4 relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Assign To
                </label>
                <div className="relative">
                  <input
                    type="text"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8 disabled:bg-gray-50 disabled:text-gray-400"
                    placeholder={
                      reassignLoadingAgents
                        ? "Loading..."
                        : !reassignDepartmentId
                          ? "Select department first"
                          : agentDropdownOpen
                            ? "Search team member..."
                            : reassignAgentId
                              ? ""
                              : "Search team member..."
                    }
                    value={
                      agentDropdownOpen
                        ? agentSearch
                        : reassignAgentId
                          ? (() => {
                            const a = reassignAgents.find(
                              (x) => x._id === reassignAgentId,
                            );
                            return a ? personName(a) : "";
                          })()
                          : ""
                    }
                    disabled={!reassignDepartmentId || reassignLoadingAgents}
                    onFocus={() => {
                      if (reassignDepartmentId && !reassignLoadingAgents) {
                        setAgentDropdownOpen(true);
                        setAgentSearch("");
                      }
                    }}
                    onChange={(e) => setAgentSearch(e.target.value)}
                    onBlur={() =>
                      setTimeout(() => setAgentDropdownOpen(false), 150)
                    }
                    readOnly={!agentDropdownOpen}
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-xs">
                    ▾
                  </span>
                </div>
                {agentDropdownOpen && (
                  <ul className="absolute z-10 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                    {reassignAgents
                      .filter((a) =>
                        `${a.firstName} ${a.lastName} ${a.email}`
                          .toLowerCase()
                          .includes(agentSearch.toLowerCase()),
                      )
                      .map((a) => (
                        <li
                          key={a._id}
                          className={`px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 ${a._id === reassignAgentId
                              ? "bg-blue-100 font-medium"
                              : ""
                            }`}
                          onMouseDown={() => {
                            setReassignAgentId(a._id);
                            setAgentSearch("");
                            setAgentDropdownOpen(false);
                          }}
                        >
                          <span className="font-medium">
                            {a.firstName} {a.lastName}
                          </span>
                          <span className="text-gray-400 ml-1">
                            ({a.email})
                          </span>
                        </li>
                      ))}
                    {reassignAgents.filter((a) =>
                      `${a.firstName} ${a.lastName} ${a.email}`
                        .toLowerCase()
                        .includes(agentSearch.toLowerCase()),
                    ).length === 0 && (
                        <li className="px-3 py-2 text-sm text-gray-400">
                          No results
                        </li>
                      )}
                  </ul>
                )}
              </div>

              {/* Buttons */}
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowReassignModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={submitReassign}
                  disabled={!reassignAgentId || reassignLoading}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {reassignLoading ? "Reassigning..." : "Reassign"}
                </button>
              </div>
            </div>
          </div>
        )}
        {/* ── Success Modal ──────────────────────────────────────────────── */}
        {successModal.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/30 backdrop-blur-sm"
              onClick={() => setSuccessModal({ open: false, message: "" })}
            />
            {/* Dialog */}
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 text-center">
              {/* Green check */}
              <div className="flex items-center justify-center w-14 h-14 rounded-full bg-green-100 mx-auto mb-4">
                <svg
                  className="h-7 w-7 text-green-600"
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
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Done!
              </h3>
              <p className="text-sm text-gray-600 mb-6">
                {successModal.message}
              </p>
              <button
                onClick={() => setSuccessModal({ open: false, message: "" })}
                className="w-full px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        )}
        {/* ── File Upload Toast ──────────────────────────────────────────── */}
        {fileUploadToast && (
          <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top-4 fade-in duration-300">
            <div className="flex items-start gap-3 bg-white border border-green-200 shadow-xl rounded-xl px-5 py-4 min-w-[280px] max-w-sm">
              {/* Green check circle */}
              <div className="flex-shrink-0 mt-0.5 bg-green-100 rounded-full p-1.5">
                <svg
                  className="h-5 w-5 text-green-600"
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
              {/* Text */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">
                  {fileUploadToast.names.length === 1
                    ? "Document attached"
                    : `${fileUploadToast.names.length} documents attached`}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {fileUploadToast.names.map((name, i) => (
                    <li key={i} className="text-xs text-gray-500 truncate">
                      {name}
                    </li>
                  ))}
                </ul>
              </div>
              {/* Close button */}
              <button
                onClick={() => setFileUploadToast(null)}
                className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Merge Modal */}
      {showMergeModal && ticket && (
        <TicketMergeModal
          isOpen={showMergeModal}
          onClose={() => setShowMergeModal(false)}
          primaryTicket={{
            _id: ticket._id || (ticket as any).id || "",
            ticketNumber: ticket.ticketNumber,
            subject: ticket.subject ?? ticket.title,
            status: Number(ticket.status) || 1,
            priority: ticket.priority,
          }}
          onMergeComplete={() => {
            setShowMergeModal(false);
            // Re-fetch ticket to show updated mergedTickets list
            window.location.reload();
          }}
        />
      )}
    </>
  );

  // Service Request (PSR/ISR) lifecycle actions — shown for SR tickets so a PSR
  // opened from the normal queue is fully actionable (audit Step E).
  return wrapWithLayout ? (
    <DashboardLayout>
      {content}
    </DashboardLayout>
  ) : (
    <>
      {content}
    </>
  );
};

export default AgentTicketDetail;
