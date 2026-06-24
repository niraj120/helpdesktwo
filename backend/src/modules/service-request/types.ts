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

/** Intake channels that funnel into the orchestrator. */
export type SrChannel = "online" | "walk_in" | "email" | "ivr";

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
}

/** Resolved (fully-defaulted) per-project SR configuration. */
export interface SrConfig {
  enabled: boolean;
  psr: { enabled: boolean };
  isr: { enabled: boolean };
  wip: SrWipConfig;
  reopen: SrReopenConfig;
  email: SrEmailConfig;
  ivr: { enabled: boolean };
  /** Configurable classify-call channels (PSR flow). */
  classifyChannels: SrClassifyChannel[];
  /** Optional create-form blocks (each also permission-gated). */
  blocks: {
    assigneeEmails: SrBlockToggle;
    prioritySchedule: SrBlockToggle;
    offlineReEntry: SrBlockToggle;
  };
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
];
