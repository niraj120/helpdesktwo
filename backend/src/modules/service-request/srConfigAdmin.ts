/**
 * Service Request (PSR/ISR) — per-project config admin. Phase 3.
 * Reads/updates Project.configuration.sr (Mixed) and seeds the PSR status rows
 * when PSR is enabled.
 */
import { Project } from "../../models/Project";
import { resolveSrConfig } from "./serviceRequestConfig";
import { seedPsrStatuses } from "./srStatusSeed";
import { SrError } from "./serviceRequestService";

export async function getSrConfigForProject(projectId: string) {
  const project = await Project.findById(projectId)
    .select("configuration.sr")
    .lean();
  if (!project) throw new SrError("Project not found", 404);
  return resolveSrConfig(project);
}

export interface SrConfigPatch {
  enabled?: boolean;
  psr?: { enabled?: boolean };
  isr?: { enabled?: boolean };
  wip?: {
    maxRevisions?: number;
    maxDaysPerRevision?: number;
    reminderHoursBefore?: number;
    escalateOnExpiry?: boolean;
  };
  reopen?: { assignToUserId?: string; assignToRoleId?: string };
  email?: { enabled?: boolean; tatHours?: number; level2Hours?: number };
  ivr?: { enabled?: boolean };
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
  if (patch.psr) sr.psr = { ...(sr.psr || {}), ...patch.psr };
  if (patch.isr) sr.isr = { ...(sr.isr || {}), ...patch.isr };
  if (patch.wip) sr.wip = { ...(sr.wip || {}), ...patch.wip };
  if (patch.reopen) sr.reopen = { ...(sr.reopen || {}), ...patch.reopen };
  if (patch.email) sr.email = { ...(sr.email || {}), ...patch.email };
  if (patch.ivr) sr.ivr = { ...(sr.ivr || {}), ...patch.ivr };

  project.markModified("configuration.sr");
  await project.save();

  const resolved = resolveSrConfig(project);
  // Seed PSR status rows once PSR is actually enabled.
  if (resolved.enabled && resolved.psr.enabled) {
    await seedPsrStatuses(projectId, actorId);
  }
  return resolved;
}
