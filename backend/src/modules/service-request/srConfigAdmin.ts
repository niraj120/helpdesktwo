/**
 * Service Request (PSR/ISR) — per-project config admin. Phase 3.
 * Reads/updates Project.configuration.sr (Mixed) and seeds the PSR status rows
 * when PSR is enabled.
 */
import { Project } from "../../models/Project";
import { resolveSrConfig } from "./serviceRequestConfig";
import { seedPsrStatuses } from "./srStatusSeed";
import { SrError } from "./serviceRequestService";
import { SR_DEFAULT_CLASSIFY_CHANNELS } from "./types";

export async function getSrConfigForProject(projectId: string) {
  const project = await Project.findById(projectId)
    .select("configuration.sr")
    .lean();
  if (!project) throw new SrError("Project not found", 404);
  return resolveSrConfig(project);
}

export interface SrConfigPatch {
  enabled?: boolean;
  /** Who the reassign / delegate pickers offer (see SrReassignConfig). */
  reassign?: {
    requireDepartment?: boolean;
    restrictToProject?: boolean;
    excludeRoleIds?: string[];
  };
  numbering?: Partial<
    Record<
      "PSR" | "ISR",
      {
        prefix?: string;
        format?: string;
        resetPeriod?: string;
        startingNumber?: number;
      }
    >
  >;
  psr?: { enabled?: boolean; intake?: any; workflow?: any };
  isr?: {
    enabled?: boolean;
    linkFromNormalTickets?: {
      enabled?: boolean;
      createEnabled?: boolean;
      linkExistingEnabled?: boolean;
    };
    linkFromIsr?: {
      enabled?: boolean;
      createEnabled?: boolean;
      linkExistingEnabled?: boolean;
    };
  };
  wip?: {
    maxRevisions?: number;
    maxDaysPerRevision?: number;
    reminderHoursBefore?: number;
    escalateOnExpiry?: boolean;
  };
  reopen?: { assignToUserId?: string; assignToRoleId?: string };
  messages?: {
    duplicate?: string;
    closureDefault?: string;
    responseDefault?: string;
  };
  feedback?: {
    notifyManagerOnNegative?: boolean;
    ratingThreshold?: number;
    notifyUserId?: string;
    notifyRoleId?: string;
  };
  email?: { enabled?: boolean; tatHours?: number; level2Hours?: number };
  emailJunk?: { senders?: string[] };
  ivr?: {
    enabled?: boolean;
    callbackTat?: {
      enabled?: boolean;
      tiers?: {
        level?: number;
        label?: string;
        tatHours?: number;
        isActive?: boolean;
      }[];
    };
    parentLookup?: {
      enabled?: boolean;
      tableId?: string;
      mobileColumns?: string[];
      nameColumn?: string;
      schoolColumn?: string;
      studentCountColumn?: string;
    };
  };
  crm?: any;
  classifyChannels?: any[];
  psrDetail?: any;
  blocks?: {
    assigneeEmails?: { enabled?: boolean };
    prioritySchedule?: { enabled?: boolean };
    offlineReEntry?: { enabled?: boolean };
  };
  customChannelFields?: Record<string, any[]>;
}

export async function updateSrConfigForProject(
  projectId: string,
  patch: SrConfigPatch,
  actorId?: string,
) {
  const project = await Project.findById(projectId);
  if (!project) throw new SrError("Project not found", 404);

  const cfg: any = project.configuration || (project.configuration = {} as any);
  const sr: any = cfg.sr || (cfg.sr = {});

  if (patch.enabled !== undefined) sr.enabled = !!patch.enabled;
  // Per-interaction-type ticket numbering. Merged per type so a patch carrying
  // only PSR does not wipe ISR. generateSrTicketNumber() reads sr.numbering
  // first and only falls back to the project-wide ticketNumberSettings when
  // this is absent — without persisting it here, SR tickets silently took the
  // generic project prefix.
  if (patch.numbering) {
    const current = sr.numbering || {};
    const merged: any = { ...current };
    for (const type of ["PSR", "ISR"] as const) {
      const incoming = (patch.numbering as any)[type];
      if (!incoming) continue;
      const next = { ...(current[type] || {}), ...incoming };
      if (next.startingNumber !== undefined) {
        const n = Number(next.startingNumber);
        next.startingNumber = Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
      }
      if (typeof next.prefix === "string") next.prefix = next.prefix.trim();
      if (typeof next.format === "string") next.format = next.format.trim();
      merged[type] = next;
    }
    sr.numbering = merged;
  }
  if (patch.psr) sr.psr = { ...(sr.psr || {}), ...patch.psr };
  if (patch.isr) sr.isr = { ...(sr.isr || {}), ...patch.isr };
  if (patch.wip) sr.wip = { ...(sr.wip || {}), ...patch.wip };
  if (patch.reopen) sr.reopen = { ...(sr.reopen || {}), ...patch.reopen };
  if (patch.reassign) {
    const next = { ...(sr.reassign || {}), ...patch.reassign };
    if (patch.reassign.excludeRoleIds !== undefined) {
      next.excludeRoleIds = (patch.reassign.excludeRoleIds || []).map(String);
    }
    sr.reassign = next;
  }
  if (patch.messages)
    sr.messages = { ...(sr.messages || {}), ...patch.messages };
  if (patch.feedback)
    sr.feedback = { ...(sr.feedback || {}), ...patch.feedback };
  if (patch.email) sr.email = { ...(sr.email || {}), ...patch.email };
  if (patch.emailJunk) {
    const senders = Array.isArray(patch.emailJunk.senders)
      ? Array.from(
          new Set(
            patch.emailJunk.senders
              .map((s) => String(s).trim().toLowerCase())
              .filter(Boolean),
          ),
        )
      : [];
    sr.emailJunk = { senders };
  }
  if (patch.ivr) sr.ivr = { ...(sr.ivr || {}), ...patch.ivr };
  if (patch.crm) sr.crm = { ...(sr.crm || {}), ...patch.crm };
  if (Array.isArray(patch.classifyChannels))
    sr.classifyChannels = patch.classifyChannels;
  if (patch.psrDetail) sr.psrDetail = patch.psrDetail;
  if (patch.blocks) sr.blocks = { ...(sr.blocks || {}), ...patch.blocks };
  if (patch.customChannelFields !== undefined) sr.customChannelFields = patch.customChannelFields;

  // Seed the default classify channels the first time SR is enabled, so they
  // become concrete (editable + always available) instead of read-time-only.
  if (
    sr.enabled &&
    (!Array.isArray(sr.classifyChannels) || sr.classifyChannels.length === 0)
  ) {
    sr.classifyChannels = SR_DEFAULT_CLASSIFY_CHANNELS;
  }

  project.markModified("configuration.sr");
  await project.save();

  const resolved = resolveSrConfig(project);
  // Seed PSR status rows once PSR is actually enabled.
  if (resolved.enabled && resolved.psr.enabled) {
    await seedPsrStatuses(projectId, actorId);
  }
  return resolved;
}
