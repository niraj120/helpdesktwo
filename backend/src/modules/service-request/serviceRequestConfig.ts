/**
 * Service Request (PSR/ISR) module — per-project config resolution.
 * Phase 0 foundation. Applies defaults to `Project.configuration.sr` (stored
 * as a flexible Mixed blob) so callers always get a fully-populated SrConfig.
 */
import { SrConfig, SR_DEFAULT_CLASSIFY_CHANNELS } from "./types";

export const SR_CONFIG_DEFAULTS: SrConfig = {
  enabled: false, // master switch — SR module inert until a project opts in
  psr: { enabled: false },
  isr: { enabled: false },
  wip: {
    maxRevisions: 3,
    maxDaysPerRevision: 8,
    reminderHoursBefore: 48,
    escalateOnExpiry: true,
  },
  reopen: {},
  email: { enabled: false, tatHours: 8, level2Hours: 12 },
  ivr: { enabled: false },
  classifyChannels: SR_DEFAULT_CLASSIFY_CHANNELS,
  blocks: {
    assigneeEmails: { enabled: true },
    prioritySchedule: { enabled: true },
    offlineReEntry: { enabled: true },
  },
  psrDetail: {
    statusProgress: {
      enabled: true,
      defaultOpen: true,
      steps: [
        { code: 1, label: "Open", enabled: true },
        { code: 2, label: "WIP", enabled: true },
        { code: 4, label: "Resolved", enabled: true },
        { code: 6, label: "Re-open", enabled: true },
        { code: 5, label: "Closed", enabled: true },
      ],
    },
    cards: [
      // sla / psrDetails / pslAssignment / parentStudent / linkedIsr default OFF:
      // they duplicate the legacy header, Query-Information sidebar and the
      // Linked-ISR tab. Left configurable so a project can opt into the
      // card-based layout from SR Settings.
      { key: "sla", label: "SLA", enabled: false, order: 1, width: "full" },
      {
        key: "wipCommitment",
        label: "WIP Commitment",
        enabled: true,
        order: 2,
        width: "full",
      },
      {
        key: "psrDetails",
        label: "PSR Details",
        enabled: false,
        order: 3,
        width: "half",
      },
      {
        key: "pslAssignment",
        label: "PSL Assignment",
        enabled: false,
        order: 4,
        width: "third",
      },
      {
        key: "parentStudent",
        label: "Parent & Student",
        enabled: false,
        order: 5,
        width: "third",
      },
      {
        // Off as a page card: the lifecycle actions (status / reassign /
        // delegate / PSL call) now live in the "PSL Call" tab instead.
        key: "lifecycleActions",
        label: "Lifecycle Actions",
        enabled: false,
        order: 6,
        width: "full",
      },
      {
        key: "linkedIsr",
        label: "Linked ISRs",
        enabled: false,
        order: 7,
        width: "full",
      },
    ],
    tabs: [
      { key: "replies", label: "Replies", enabled: true, order: 1 },
      { key: "linkedisr", label: "Linked ISRs", enabled: true, order: 2 },
      { key: "notes", label: "Internal Notes", enabled: true, order: 3 },
      { key: "pslcall", label: "PSL Call", enabled: true, order: 4 },
      { key: "history", label: "History", enabled: true, order: 5 },
      { key: "audit", label: "Audit", enabled: true, order: 6 },
      { key: "emails", label: "Emails", enabled: true, order: 7 },
    ],
  },
};

const mergeByKey = <T extends { key: string }>(defaults: T[], stored?: T[]) => {
  const byKey = new Map((stored || []).map((item: any) => [item.key, item]));
  const seen = new Set<string>();
  const merged = defaults.map((item: any) => {
    seen.add(item.key);
    return { ...item, ...(byKey.get(item.key) || {}) };
  });
  for (const item of stored || []) {
    if (!seen.has((item as any).key)) merged.push(item);
  }
  return merged.sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
};

const mergeSteps = (stored?: any[]) => {
  const byCode = new Map((stored || []).map((item: any) => [Number(item.code), item]));
  const seen = new Set<number>();
  const merged = SR_CONFIG_DEFAULTS.psrDetail.statusProgress.steps.map((item) => {
    seen.add(item.code);
    return { ...item, ...(byCode.get(item.code) || {}) };
  });
  for (const item of stored || []) {
    const code = Number(item.code);
    if (!seen.has(code)) merged.push({ ...item, code });
  }
  return merged;
};

/**
 * Resolve a fully-defaulted SrConfig from a project document, a project's
 * `configuration` object, or a raw `sr` blob — whichever is passed.
 */
export function resolveSrConfig(raw: any): SrConfig {
  const sr = raw?.configuration?.sr ?? raw?.sr ?? raw ?? {};
  return {
    ...sr,
    enabled: !!sr.enabled,
    psr: { enabled: sr.psr?.enabled ?? false },
    isr: { enabled: sr.isr?.enabled ?? false },
    wip: {
      maxRevisions: sr.wip?.maxRevisions ?? SR_CONFIG_DEFAULTS.wip.maxRevisions,
      maxDaysPerRevision:
        sr.wip?.maxDaysPerRevision ?? SR_CONFIG_DEFAULTS.wip.maxDaysPerRevision,
      reminderHoursBefore:
        sr.wip?.reminderHoursBefore ??
        SR_CONFIG_DEFAULTS.wip.reminderHoursBefore,
      escalateOnExpiry:
        sr.wip?.escalateOnExpiry ?? SR_CONFIG_DEFAULTS.wip.escalateOnExpiry,
    },
    reopen: {
      assignToUserId: sr.reopen?.assignToUserId,
      assignToRoleId: sr.reopen?.assignToRoleId,
    },
    email: {
      enabled: !!sr.email?.enabled,
      tatHours: sr.email?.tatHours ?? SR_CONFIG_DEFAULTS.email.tatHours,
      level2Hours:
        sr.email?.level2Hours ?? SR_CONFIG_DEFAULTS.email.level2Hours,
    },
    ivr: { enabled: !!sr.ivr?.enabled },
    classifyChannels:
      Array.isArray(sr.classifyChannels) && sr.classifyChannels.length
        ? sr.classifyChannels
        : SR_DEFAULT_CLASSIFY_CHANNELS,
    blocks: {
      assigneeEmails: {
        enabled: sr.blocks?.assigneeEmails?.enabled ?? true,
      },
      prioritySchedule: {
        enabled: sr.blocks?.prioritySchedule?.enabled ?? true,
      },
      offlineReEntry: {
        enabled: sr.blocks?.offlineReEntry?.enabled ?? true,
      },
    },
    psrDetail: {
      statusProgress: {
        enabled:
          sr.psrDetail?.statusProgress?.enabled ??
          SR_CONFIG_DEFAULTS.psrDetail.statusProgress.enabled,
        defaultOpen:
          sr.psrDetail?.statusProgress?.defaultOpen ??
          SR_CONFIG_DEFAULTS.psrDetail.statusProgress.defaultOpen,
        steps: mergeSteps(sr.psrDetail?.statusProgress?.steps),
      },
      cards: mergeByKey(
        SR_CONFIG_DEFAULTS.psrDetail.cards,
        sr.psrDetail?.cards,
      ),
      tabs: mergeByKey(SR_CONFIG_DEFAULTS.psrDetail.tabs, sr.psrDetail?.tabs),
    },
  };
}

/**
 * Whether the SR module (optionally a specific type) is enabled for a project.
 * `type` omitted → just checks the master switch.
 */
export function isSrEnabled(raw: any, type?: "PSR" | "ISR"): boolean {
  const cfg = resolveSrConfig(raw);
  if (!cfg.enabled) return false;
  if (type === "PSR") return cfg.psr.enabled;
  if (type === "ISR") return cfg.isr.enabled;
  return true;
}
