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
