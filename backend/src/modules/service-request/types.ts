/**
 * Service Request (PSR/ISR) module — shared types & constants.
 * Phase 0 foundation. Pure types/constants; no runtime side-effects.
 */

export type InteractionType = "normal" | "PSR" | "ISR";
export type RequestType = "OCR" | "SR";
export type ModeOfContact =
  | "telephone"
  | "walk_in"
  | "email"
  | "portal"
  | "ivr"
  | "digital";

/**
 * Intake channels that funnel into the orchestrator.
 * `self_service` = parent-raised via the mobile app (SSO) public API — distinct
 * from the PSL/staff `online`/`walk_in` forms.
 */
export type SrChannel =
  | "online"
  | "walk_in"
  | "email"
  | "ivr"
  | "self_service";

export interface SrWipConfig {
  /** Max number of revised committed-closure dates an assignee may set. */
  maxRevisions: number;
  /** Max days each committed-closure date may extend. */
  maxDaysPerRevision: number;
  /** Hours before the committed date that a reminder fires. */
  reminderHoursBefore: number;
  /** When true, escalate once the committed closure date has passed. */
  escalateOnExpiry: boolean;
}

/**
 * Re-open routing config (Vector: re-open auto-assigns to Principal).
 * Configurable so the "Principal" can be added later without code changes:
 * a fixed user, or a role (first active user in the project with that role).
 */
export interface SrReopenConfig {
  assignToUserId?: string;
  assignToRoleId?: string;
}

/** Email triage inbox config (Phase 4). */
export interface SrEmailConfig {
  enabled: boolean;
  /** Hours to read & action an email before L1 escalation (Vector: 8). */
  tatHours: number;
  /** Hours before L2 escalation (Vector: 12). */
  level2Hours: number;
}

/** Permanent junk senders — inbound mail from these is auto-junked on ingest. */
export interface SrEmailJunkConfig {
  senders: string[];
}

/**
 * Editable, per-project message templates (Vector: global `hd_messages`).
 * All optional — blank falls back to a built-in default so nothing crashes.
 * Placeholders like {{ticketNumber}} are substituted where the message is used.
 */
export interface SrMessagesConfig {
  /** Shown when duplicate SR detection matches (duplicateDetection). */
  duplicate?: string;
  /** Seeded default remark when an SR is moved to Closed. */
  closureDefault?: string;
  /** Seeded default remark when an SR is Resolved / first responded. */
  responseDefault?: string;
}

/**
 * Not-happy escalation config. When a parent closes an SR unsatisfied (or below
 * the rating threshold) and it is not re-opened, notify a manager so it can be
 * followed up. Target is configurable (user or role); no hardcoded roles.
 */
export interface SrFeedbackConfig {
  notifyManagerOnNegative: boolean;
  /** Ratings at or below this value count as negative (1–5). */
  ratingThreshold: number;
  /** Explicit user notified on negative feedback (takes precedence). */
  notifyUserId?: string;
  /** Role whose first active project member is notified. */
  notifyRoleId?: string;
}

export interface SrTicketNumberConfig {
  prefix: string;
  format: string;
  resetPeriod: "daily" | "monthly" | "yearly" | "never";
  startingNumber: number;
}

export type PsrFormSource = "ticket_config" | "sr_form";
export type PsrEmailMode = "auto_create" | "triage";

export interface PsrFormIntakeConfig {
  enabled: boolean;
  formSource: PsrFormSource;
  formSchemaId?: string;
}

export interface PsrWalkInIntakeConfig extends PsrFormIntakeConfig {
  reuseOfflineModule: boolean;
}

export interface PsrEmailSourceMapping {
  id: string;
  emailAddress: string;
  projectEmailConfigId?: string;
  assignToUserId?: string;
  assignToRoleId?: string;
  enabled: boolean;
}

export interface PsrEmailIntakeConfig {
  enabled: boolean;
  mode: PsrEmailMode;
  sources: PsrEmailSourceMapping[];
}

export interface PsrParentLookupConfig {
  enabled: boolean;
  /** PsrTable _id whose psr_tbl_* collection holds registered parents. */
  tableId: string;
  /** Column `as` names (builder labels) that hold the caller's mobile. */
  mobileColumns: string[];
  nameColumn?: string;
  schoolColumn?: string;
  studentCountColumn?: string;
}

export interface PsrIvrIntakeConfig {
  enabled: boolean;
  provider: "smartflo";
  mode: PsrEmailMode;
  apiBaseUrl?: string;
  webhookPath?: string;
  /** Match inbound callers against a PSR parent table & populate their details. */
  parentLookup?: PsrParentLookupConfig;
}

export type PsrLookupSource =
  | "mdm"
  | "database"
  | "auto"
  | "cache"
  | "hybrid_cache"
  | "psr_builder"; // PSR Builder table (local MongoDB mirror)
export type PsrLookupSearchMode = "parent" | "student" | "both";

export interface PsrLookupConfig {
  /** Where PSR parent/student identity should be searched from for this project. */
  source: PsrLookupSource;
  /** Which identity search modes are available to staff while creating PSR. */
  searchMode: PsrLookupSearchMode;
  /** Optional explicit MDM source for parent lookup; empty = first eligible source. */
  parentMdmSourceId?: string;
  /** Optional explicit MDM source for student lookup; empty = first eligible source. */
  studentMdmSourceId?: string;
  /** External MDM source whose cached join should be used for parent lookup. */
  cacheMdmSourceId?: string;
  /** Optional cached join key; empty = first enabled parent-with-children join. */
  cacheJoinKey?: string;
  /** Only used when source is auto: allow MongoDB fallback when MDM has no source/result. */
  allowDatabaseFallback: boolean;
  /** PSR Builder table id — used when source === "psr_builder" */
  psrBuilderTableId?: string;
  /** Optional bridge API for MDMs where parent and student APIs do not share a direct id. */
  relationship?: {
    enabled?: boolean;
    parentDataType?: "parents" | "custom" | "students" | "children";
    mappingMdmSourceId?: string;
    mappingDataType?: "custom" | "children" | "students";
    /** Field in the parent API response whose value should be sent to the mapping API. */
    parentIdField?: string;
    /** Field in the mapping API response used to confirm the parent id, if present. */
    mappingParentIdField?: string;
    /** Field in the mapping API response that contains the student id. */
    studentIdField?: string;
    /** Request parameter name used when calling the mapping API with the parent id. */
    parentIdParam?: string;
    studentMdmSourceId?: string;
    studentDataType?: "students" | "children" | "custom";
    /** Field in the student API response used to confirm the student id, if present. */
    studentResponseIdField?: string;
    /** Request parameter name used when calling the student API with each mapped student id. */
    studentIdParam?: string;
  };
}

export interface PsrIntakeConfig {
  lookup: PsrLookupConfig;
  mobileForm: PsrFormIntakeConfig;
  walkIn: PsrWalkInIntakeConfig;
  email: PsrEmailIntakeConfig;
  ivr: PsrIvrIntakeConfig;
}

export interface PsrDuplicateDetectionConfig {
  enabled: boolean;
  matchStudentId: boolean;
  matchSubCategory: boolean;
  matchStatus: boolean;
  activeStatuses: number[];
  action: "warn" | "block";
}

export interface PsrRequestTypeConfig {
  ocrEnabled: boolean;
  srEnabled: boolean;
  defaultType: RequestType;
  autoCloseOcr: boolean;
}

export interface PsrLifecycleConfig {
  assignResearchTask: boolean;
  assignResolutionTask: boolean;
  allowCombinedResearchResolution: boolean;
  assignBySubCategory: boolean;
  allowReassignment: boolean;
  allowCancellation: boolean;
  cancellationReasons: string[];
  createChildCaseOnCancellation: boolean;
  closureTaskEnabled: boolean;
  closureAssignToUserId?: string;
  closureAssignToRoleId?: string;
  parentClosureEnabled: boolean;
  feedbackEnabled: boolean;
  reopenOnUnhappyFeedback: boolean;
  reopenLimit: number;
  reassignKeepsOriginalTat: boolean;
  delegateRestrictedToCcMatrix: boolean;
  splitMultipleIssuesIntoSeparatePsr: boolean;
}

export interface PsrNotificationConfig {
  parentOnCreation: boolean;
  departmentOnTaskAssignment: boolean;
  departmentOnReassignment: boolean;
  parentOnResolved: boolean;
  parentOnCancellation: boolean;
  reCellOnChildCase: boolean;
  principalOnClosureTask: boolean;
  parentOnClosure: boolean;
  channels: Array<"email" | "sms" | "in_app" | "push">;
}

export interface PsrAssignmentConfig {
  defaultAssignToRoleId?: string;
  defaultAssignToUserId?: string;
  defaultCcRoleIds: string[];
  pslRoleId?: string;
  principalRoleId?: string;
  appointmentAssignToPsl: boolean;
  appointmentCategoryKeywords: string[];
  ssdVertexCategoryKeywords: string[];
}

/**
 * PSR entity-based routing.
 *
 * Normal tickets route on the CATEGORY taxonomy. PSR requests instead route on
 * an entity SCOPE tuple (e.g. school + grade + subject) that the parent selects
 * from PSR-Builder dropdowns (mirrored from MDM). The owner (subject teacher,
 * HOD, principal…) of a given scope tuple lives in MDM staffing data, mirrored
 * as a PsrTable. This config declares the routing dimensions and how to resolve
 * a scope tuple → the staff who own it. Nothing is hardcoded — see
 * [[no-hardcoding-configurable-by-permission]].
 */
export interface PsrRoutingDimension {
  /** Stable key reused across form, matrix and ticket (e.g. "school","grade","subject"). */
  key: string;
  /** Human label for the config UI. */
  label: string;
  /** Form field id (customChannelFields) that supplies this value at submit. */
  fieldId?: string;
}

/** How an owner identifier stored in the map table resolves to a helpdesk User. */
export interface PsrOwnerHolderResolution {
  by: "employeeCode" | "email" | "userId";
}

/** Maps a scope tuple → the staff who own it, mirrored from MDM as a PsrTable. */
export interface PsrOwnerMapConfig {
  /** PsrTable (MDM mirror) holding the ownership rows. */
  tableId?: string;
  /** Table columns (`.as`) holding each dimension value, keyed by dimension key. */
  scopeColumns: Record<string, string>;
  /** Table columns holding each role's owner identifier, keyed by role key. */
  roleColumns: Record<string, string>;
  /** Role key that owns the request first (L1, e.g. "SUBJECT_TEACHER").
   *  Defaults to the first roleColumns key when unset. */
  primaryRole?: string;
  /** How a holder identifier in the table maps to a helpdesk User. */
  holderResolution: PsrOwnerHolderResolution;
}

/** When no owner row matches the scope tuple. */
export interface PsrRoutingFallback {
  mode: "category" | "role" | "user" | "none";
  roleId?: string;
  userId?: string;
}

export interface PsrRoutingConfig {
  enabled: boolean;
  /** Ordered routing dimensions (e.g. school → grade → subject). */
  dimensions: PsrRoutingDimension[];
  /** Owner lookup table + column mapping. */
  ownerMap: PsrOwnerMapConfig;
  /** Fallback when the scope tuple has no matching owner row. */
  fallback: PsrRoutingFallback;
}

export interface PsrParentCommunicationConfig {
  twoWayCommunicationEnabled: boolean;
  parentCanAddComments: boolean;
  askAdditionalInfoEnabled: boolean;
  displayRemarksPermission: "closure_access" | "psl_only" | "custom";
  proactiveInfoBeforeSubmit: boolean;
  feedbackPopupEnabled: boolean;
  feedbackPrompt: string;
  pslSatisfactionCallEnabled: boolean;
  pslCallRequiredWhenUnhappyNoReopen: boolean;
}

export interface PsrLinkedIsrConfig {
  enabled: boolean;
  generateFromPsrPage: boolean;
  clickableCrossLinks: boolean;
  requireIsrNumberPaste: boolean;
}

export interface PsrEmailIntegrationConfig {
  enabled: boolean;
  uniqueIdPrefix: string;
  actionTatHours: number;
  level2EscalationHours: number;
  workingStart: string;
  workingEnd: string;
  excludeSundays: boolean;
  allowMultipleActionsPerEmail: boolean;
  requireWipForFurtherActions: boolean;
  replyMode: "outlook_manual" | "in_app";
  defaultPsrModeOfContact: "email";
  senderTypes: string[];
  trackConversionHistory: boolean;
  dashboardMetrics: Array<
    | "total"
    | "within_tat"
    | "outside_tat"
    | "due_for_escalation"
    | "wip_within_tat"
    | "wip_due_for_escalation"
    | "closed"
    | "conversion_rate"
    | "response_time"
  >;
}

export interface PsrReportingConfig {
  filters: Array<
    | "date_range"
    | "month"
    | "department"
    | "cluster"
    | "school"
    | "category"
    | "sub_category"
  >;
  dashboardCards: Array<
    | "outside_tat"
    | "due_for_escalation"
    | "within_tat"
    | "wip_future"
    | "reopened_wip"
    | "resolved_not_psl_closed"
    | "resolved_not_parent_closed"
    | "reopened_by_parent"
    | "total"
    | "closed"
  >;
}

export interface PsrWorkflowConfig {
  duplicateDetection: PsrDuplicateDetectionConfig;
  requestTypes: PsrRequestTypeConfig;
  lifecycle: PsrLifecycleConfig;
  notifications: PsrNotificationConfig;
  assignment: PsrAssignmentConfig;
  /** Entity-scope routing (school/grade/subject → teacher/HOD/principal). */
  routing: PsrRoutingConfig;
  parentCommunication: PsrParentCommunicationConfig;
  linkedIsr: PsrLinkedIsrConfig;
  emailIntegration: PsrEmailIntegrationConfig;
  reporting: PsrReportingConfig;
}

/**
 * Configurable classify-call channel (the "How would you classify this call?"
 * step). Stored per-project; admins can add new channels later — a channel
 * with flow "custom" renders the generic SR form with no code changes.
 */
export type SrChannelFlow =
  | "existing_parent"
  | "prospect_parent"
  | "vendor"
  | "job"
  | "others"
  | "junk"
  | "custom";

export interface SrClassifyChannel {
  key: string;
  label: string;
  description?: string;
  icon?: string;
  color?: string;
  enabled: boolean;
  order: number;
  /** Permission code required to see/use this channel. Empty = any SR creator. */
  requiredPermission?: string;
  flow: SrChannelFlow;
  routing?: {
    interactionType?: "PSR" | "ISR";
    target?: "sr" | "crm" | "lead" | "procurement" | "hr" | "junk_archive";
    defaultCategoryId?: string;
    defaultAssigneeEmails?: string[];
    defaultRoleId?: string;
  };
}

/** Toggle for an optional, permission-gated block on the SR create form. */
export interface SrBlockToggle {
  enabled: boolean;
  label?: string;
  placeholder?: string;
  required?: boolean;
}

export interface SrDetailCardConfig {
  key:
    | "sla"
    | "wipCommitment"
    | "pslAssignment"
    | "parentStudent"
    | "psrDetails"
    | "lifecycleActions"
    | "linkedIsr";
  label: string;
  enabled: boolean;
  order: number;
  width: "full" | "half" | "third";
  requiredPermission?: string;
}

export interface SrDetailTabConfig {
  key:
    | "replies"
    | "linkedisr"
    | "notes"
    | "pslcall"
    | "history"
    | "audit"
    | "emails";
  label: string;
  enabled: boolean;
  order: number;
  requiredPermission?: string;
}

export interface SrDetailConfig {
  /**
   * Display prefs only. The steps themselves are the project's status master
   * (SLA & Escalation) — never stored here, or the two lists drift.
   */
  statusProgress: {
    enabled: boolean;
    defaultOpen: boolean;
  };
  cards: SrDetailCardConfig[];
  tabs: SrDetailTabConfig[];
}

/** Resolved (fully-defaulted) per-project SR configuration. */
/** One step of the IVR call-back ladder (WIP 1, WIP 2, ...). */
export interface IvrCallbackTier {
  /** 1-based position; what the agent is really choosing. */
  level: number;
  /** Shown to the agent, e.g. "WIP 1". */
  label: string;
  /** Hours from logging the step to the call-back being due. */
  tatHours: number;
  isActive: boolean;
}

/**
 * Reassign / delegate search on a service request.
 *
 * The people offered are always helpdesk users — a request can only be
 * assigned to someone who can sign in and work it. Which of them appear is a
 * project decision: students and parents have accounts too and must never be
 * offered, and a large project usually wants the department picked first.
 */
export interface SrReassignConfig {
  /** Pick a department before any user is listed. */
  requireDepartment: boolean;
  /** Only users who belong to this project (off = any active user). */
  restrictToProject: boolean;
  /** Roles never offered — e.g. Student, Parent. */
  excludeRoleIds: string[];
}

export interface SrConfig {
  enabled: boolean;
  numbering: {
    PSR: SrTicketNumberConfig;
    ISR: SrTicketNumberConfig;
  };
  psr: { enabled: boolean; intake: PsrIntakeConfig; workflow: PsrWorkflowConfig };
  isr: {
    enabled: boolean;
    linkFromNormalTickets: {
      enabled: boolean;
      createEnabled: boolean;
      linkExistingEnabled: boolean;
    };
    /** Sub-ISRs: link or raise an ISR underneath another ISR. */
    linkFromIsr: {
      enabled: boolean;
      createEnabled: boolean;
      linkExistingEnabled: boolean;
    };
  };
  wip: SrWipConfig;
  reopen: SrReopenConfig;
  /** Who the "Reassign / Delegate" pickers offer on a service request. */
  reassign: SrReassignConfig;
  /** Editable per-project message templates (duplicate / closure / response). */
  messages: SrMessagesConfig;
  /** Not-happy escalation on negative parent feedback. */
  feedback: SrFeedbackConfig;
  email: SrEmailConfig;
  /** Permanent junk senders (auto-junk on ingest). */
  emailJunk: SrEmailJunkConfig;
  ivr: {
    enabled: boolean;
    /** Call-back ladder: the agent picks a step, its TAT sets the due time. */
    callbackTat: { enabled: boolean; tiers: IvrCallbackTier[] };
    [key: string]: any;
  };
  /** Configurable classify-call channels (PSR flow). */
  classifyChannels: SrClassifyChannel[];
  /** Optional create-form blocks (each also permission-gated). */
  blocks: {
    parentLookup: SrBlockToggle;
    childSelection: SrBlockToggle;
    category: SrBlockToggle;
    subject: SrBlockToggle;
    description: SrBlockToggle;
    dynamicFields: SrBlockToggle;
    assigneeEmails: SrBlockToggle;
    prioritySchedule: SrBlockToggle;
    offlineReEntry: SrBlockToggle;
  };
  psrDetail: SrDetailConfig;
  [key: string]: any; // forward-compat for later phases
}

/** Default classify channels seeded per project (the 6 from the call screen). */
export const SR_DEFAULT_CLASSIFY_CHANNELS: SrClassifyChannel[] = [
  {
    key: "existing_parent",
    label: "Existing Parent",
    description:
      "Parent already registered. Search and link their child to raise a PSR.",
    icon: "👪",
    color: "#10b981",
    enabled: true,
    order: 1,
    flow: "existing_parent",
    routing: { interactionType: "PSR", target: "sr" },
  },
  {
    key: "prospect_parent",
    label: "Prospect Parent",
    description: "Admissions or new-school enquiry. Forwards to CRM.",
    icon: "🙋",
    color: "#3b82f6",
    enabled: true,
    order: 2,
    flow: "prospect_parent",
    routing: { target: "lead" },
  },
  {
    key: "vendor",
    label: "Vendor / Business",
    description: "Supplies, licensing or services. Routes an SR to Procurement.",
    icon: "🏢",
    color: "#8b5cf6",
    enabled: true,
    order: 3,
    flow: "vendor",
    routing: { interactionType: "ISR", target: "procurement" },
  },
  {
    key: "job",
    label: "Job Application",
    description: "Careers, teaching openings, or resumes. Routes an SR to HR.",
    icon: "💼",
    color: "#f59e0b",
    enabled: true,
    order: 4,
    flow: "job",
    routing: { interactionType: "ISR", target: "hr" },
  },
  {
    key: "others",
    label: "Others / General",
    description: "General feedback or support questions. Routes a custom SR.",
    icon: "❓",
    color: "#6b7280",
    enabled: true,
    order: 5,
    flow: "others",
    routing: { interactionType: "PSR", target: "sr" },
  },
  {
    key: "junk",
    label: "Junk / Telemarketing",
    description: "Spam, wrong number or blank voicemail. Archived as junk.",
    icon: "🗑️",
    color: "#ef4444",
    enabled: true,
    order: 6,
    flow: "junk",
    routing: { target: "junk_archive" },
  },
];

/**
 * Canonical PSR status set (aligned to the legacy Vector system).
 * Rows are seeded per-project when SR is enabled (a later phase) — defined
 * here as the single source of truth. Codes 1–5 match the existing global
 * status codes; 6/7 are PSR-specific additions.
 */
export interface SrStatusSeed {
  code: number;
  name: string;
  color: string;
  isClosed: boolean;
}

export const SR_PSR_STATUSES: SrStatusSeed[] = [
  { code: 1, name: "Open", color: "#3b82f6", isClosed: false },
  { code: 2, name: "Work In Progress", color: "#f59e0b", isClosed: false },
  { code: 4, name: "Resolved", color: "#10b981", isClosed: false },
  { code: 5, name: "Closed", color: "#6b7280", isClosed: true },
  { code: 6, name: "Re-open", color: "#ef4444", isClosed: false },
  { code: 7, name: "Re-Opened WIP", color: "#f97316", isClosed: false },
  { code: 8, name: "Cancelled", color: "#94a3b8", isClosed: true },
];
