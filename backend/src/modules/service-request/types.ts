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

/** Resolved (fully-defaulted) per-project SR configuration. */
export interface SrConfig {
  enabled: boolean;
  psr: { enabled: boolean };
  isr: { enabled: boolean };
  wip: SrWipConfig;
  reopen: SrReopenConfig;
  email: SrEmailConfig;
  ivr: { enabled: boolean };
  [key: string]: any; // forward-compat for later phases
}

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
