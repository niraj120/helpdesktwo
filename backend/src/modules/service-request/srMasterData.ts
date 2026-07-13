/**
 * Service Request (PSR/ISR) module — master-data routing resolver.
 * Phase 1: composes the existing per-category config (CategoryAssignmentConfig,
 * CategorySLA) plus the new Category.department / Category.sr fields into a
 * single routing view for a sub-category.
 *
 * NOTE: this resolves on the EXACT categoryId given. The leaf→parent hierarchy
 * walk (reusing ticketAutoAssignment.resolveConfigForCategory) is wired in
 * Phase 2 when assignment goes live.
 */
import { Category } from "../../models/Category";
import { CategoryAssignmentConfig } from "../../models/ticket-module/CategoryAssignmentConfig";
import CategorySLA from "../../models/ticket-module/CategorySLA";
import { resolveEffectiveAssignment } from "../../utils/ticketAutoAssignment";

export interface SrTat {
  response: { value: number; unit: "minutes" | "hours" | "days" };
  resolution: { value: number; unit: "minutes" | "hours" | "days" };
}

export interface SrAssignment {
  mode: string;
  agentPool: string[];
  rolePool: string[];
  ccUsers: string[];
  ccRoles: string[];
}

export interface SrAutoClose {
  enabled: boolean;
  match: "all" | "any";
  conditions: { field: string; operator: string; value?: string }[];
  remarkTemplate?: string;
}

export interface SrRouting {
  categoryId: string;
  departmentId: string | null;
  proactiveHelpText: string | null;
  assignment: SrAssignment | null;
  tat: SrTat | null;
  autoClose: SrAutoClose | null;
}

async function resolveAssignmentForLineage(projectId: string, categoryId: string) {
  const category = await Category.findById(categoryId)
    .select("hierarchyPath")
    .lean();
  const chain = [
    categoryId,
    ...(((category as any)?.hierarchyPath || []) as any[])
      .slice()
      .reverse()
      .map(String),
  ];

  for (const id of chain) {
    const config = await CategoryAssignmentConfig.findOne({
      categoryId: id,
      projectId,
      isActive: true,
    }).lean();
    if (config) return config;
  }
  return null;
}

/**
 * Normalize a submissionSource to the SLA-source key. "online" and "portal"
 * are treated as the same channel.
 */
function normalizeSlaSource(source?: string | null): string | null {
  if (!source) return null;
  const s = String(source).toLowerCase();
  return s === "online" ? "portal" : s;
}

/** Pick the source-specific SLA times, falling back to the base SLA. */
function resolveSourceTat(sla: any, source?: string | null): SrTat | null {
  if (!sla) return null;
  const base = { response: sla.responseTime, resolution: sla.resolutionTime };
  const key = normalizeSlaSource(source);
  const bySource = sla.slaBySource || {};
  // Accept either the normalized key ("portal") or the raw source ("online").
  const override = key
    ? bySource[key] || bySource[String(source).toLowerCase()]
    : null;
  if (!override) return base;
  return {
    response: override.responseTime || base.response,
    resolution: override.resolutionTime || base.resolution,
  };
}

export async function resolveSrRouting(
  projectId: string,
  categoryId: string,
  centerId?: string | null,
  submissionSource?: string | null,
): Promise<SrRouting> {
  const [category, assignment, sla] = await Promise.all([
    Category.findById(categoryId).lean(),
    resolveAssignmentForLineage(projectId, categoryId),
    CategorySLA.findOne({ categoryId, projectId, isActive: true }).lean(),
  ]);

  const cat = category as any;
  // Apply per-center override (if the ticket carries a center + a matching row).
  const eff = assignment
    ? resolveEffectiveAssignment(assignment as any, centerId)
    : null;

  const ac = (assignment as any)?.autoClose;
  const autoClose: SrAutoClose | null =
    ac && ac.enabled && Array.isArray(ac.conditions) && ac.conditions.length
      ? {
          enabled: true,
          match: ac.match === "any" ? "any" : "all",
          conditions: ac.conditions.map((c: any) => ({
            field: String(c.field || ""),
            operator: String(c.operator || ""),
            value: c.value != null ? String(c.value) : undefined,
          })),
          remarkTemplate: ac.remarkTemplate || undefined,
        }
      : null;

  return {
    categoryId,
    departmentId: cat?.department ? String(cat.department) : null,
    proactiveHelpText: cat?.sr?.proactiveHelpText ?? null,
    assignment: eff
      ? {
          mode: eff.mode,
          agentPool: (eff.agentPool || []).map(String),
          rolePool: (eff.rolePool || []).map(String),
          ccUsers: (eff.ccUsers || []).map(String),
          ccRoles: (eff.ccRoles || []).map(String),
        }
      : null,
    tat: resolveSourceTat(sla, submissionSource),
    autoClose,
  };
}

/** Resolve the email auto-forward addresses configured for a category. */
export async function resolveSrAutoForward(
  projectId: string,
  categoryId: string,
): Promise<string[]> {
  const assignment = await resolveAssignmentForLineage(projectId, categoryId);
  const list = (assignment as any)?.autoForwardTo;
  return Array.isArray(list)
    ? list.map((s: any) => String(s).trim()).filter(Boolean)
    : [];
}

/**
 * Resolve the category(+center) re-open block for an SR, if configured.
 * Returns null when no category-level reopen routing exists (caller then
 * falls back to the project-level sr.reopen).
 */
export async function resolveSrReopenBlock(
  projectId: string,
  categoryId: string,
  centerId?: string | null,
): Promise<{
  assignToUserId?: string;
  assignToRoleId?: string;
  ccUsers?: string[];
  ccRoles?: string[];
} | null> {
  const assignment = await resolveAssignmentForLineage(projectId, categoryId);
  if (!assignment) return null;
  const eff = resolveEffectiveAssignment(assignment as any, centerId);
  const r = eff.reopen;
  if (!r || (!r.assignToUserId && !r.assignToRoleId)) return null;
  return {
    assignToUserId: r.assignToUserId ? String(r.assignToUserId) : undefined,
    assignToRoleId: r.assignToRoleId ? String(r.assignToRoleId) : undefined,
    ccUsers: (r.ccUsers || []).map(String),
    ccRoles: (r.ccRoles || []).map(String),
  };
}
