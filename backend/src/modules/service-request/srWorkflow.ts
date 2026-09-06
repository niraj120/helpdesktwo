/**
 * Service Request (PSR/ISR) module — status state-machine & WIP rules.
 * Phase 2: pure domain logic (no DB writes). Controllers call these guards
 * before applying a transition. Aligned to the legacy Vector status model.
 */
import { SrConfig } from "./types";
import { SR_CONFIG_DEFAULTS } from "./serviceRequestConfig";

/** PSR status codes (match the per-project `status` collection rows). */
export const SR_STATUS = {
  OPEN: 1,
  WIP: 2,
  RESOLVED: 4,
  CLOSED: 5,
  REOPEN: 6,
  REOPEN_WIP: 7,
  CANCEL: 8,
} as const;

/** Statuses from which an SR may be cancelled (any live, non-terminal status). */
export const SR_CANCELABLE_FROM: number[] = [1, 2, 4, 6, 7];

export type SrStatusCode = (typeof SR_STATUS)[keyof typeof SR_STATUS];

export interface SrTransition {
  to: SrStatusCode;
  /** Permission code required to perform this transition (if any). */
  requires?: string;
  /** WIP transitions require a future committed-closure date. */
  committedDateRequired?: boolean;
}

/**
 * Allowed transitions per current status. Reassign/Delegate are assignment
 * actions (handled separately) and are NOT status transitions.
 */
const CANCEL: SrTransition = { to: SR_STATUS.CANCEL, requires: "SR_CANCEL" };

const SR_TRANSITIONS: Record<number, SrTransition[]> = {
  [SR_STATUS.OPEN]: [
    { to: SR_STATUS.WIP, committedDateRequired: true },
    { to: SR_STATUS.RESOLVED },
    CANCEL,
  ],
  [SR_STATUS.WIP]: [
    { to: SR_STATUS.WIP, committedDateRequired: true }, // revise committed date
    { to: SR_STATUS.RESOLVED },
    CANCEL,
  ],
  // Resolved → Closed is done by closure-access; parent does the FINAL closure.
  [SR_STATUS.RESOLVED]: [{ to: SR_STATUS.CLOSED, requires: "SR_CLOSE" }, CANCEL],
  [SR_STATUS.CLOSED]: [{ to: SR_STATUS.REOPEN, requires: "SR_REOPEN" }],
  // Re-open is auto-assigned to Principal, who may WIP once or close.
  [SR_STATUS.REOPEN]: [
    { to: SR_STATUS.REOPEN_WIP, committedDateRequired: true },
    { to: SR_STATUS.CLOSED, requires: "SR_CLOSE" },
    CANCEL,
  ],
  [SR_STATUS.REOPEN_WIP]: [{ to: SR_STATUS.CLOSED, requires: "SR_CLOSE" }, CANCEL],
  [SR_STATUS.CANCEL]: [],
};

export function getTransition(
  from: number,
  to: number,
): SrTransition | null {
  return SR_TRANSITIONS[from]?.find((t) => t.to === to) ?? null;
}

export interface WipValidationResult {
  ok: boolean;
  error?: string;
}

/**
 * Validate a proposed WIP committed-closure date against the configurable
 * limits (Vector defaults: max 3 revisions, ≤8 days each).
 */
export function validateWipCommittedDate(
  committedDate: Date,
  currentRevisionCount: number,
  now: Date,
  cfg?: Partial<SrConfig>,
): WipValidationResult {
  const wip = cfg?.wip ?? SR_CONFIG_DEFAULTS.wip;
  if (!committedDate || isNaN(committedDate.getTime())) {
    return { ok: false, error: "A committed closure date is required for WIP." };
  }
  if (committedDate.getTime() <= now.getTime()) {
    return { ok: false, error: "Committed closure date must be in the future." };
  }
  if (currentRevisionCount >= wip.maxRevisions) {
    return {
      ok: false,
      error: `Maximum of ${wip.maxRevisions} committed-date revisions reached.`,
    };
  }
  const maxMs = wip.maxDaysPerRevision * 24 * 60 * 60 * 1000;
  if (committedDate.getTime() - now.getTime() > maxMs) {
    return {
      ok: false,
      error: `Committed date may extend at most ${wip.maxDaysPerRevision} days at a time.`,
    };
  }
  return { ok: true };
}

/** Parent/PSL may re-open only once. */
export function canReopen(
  ticket: { reopen?: { count?: number } },
  limit = 1,
): boolean {
  // A limit of 0 disables re-opening; anything higher allows that many.
  const allowed = Number.isFinite(limit) && limit >= 0 ? limit : 1;
  return (ticket.reopen?.count ?? 0) < allowed;
}
