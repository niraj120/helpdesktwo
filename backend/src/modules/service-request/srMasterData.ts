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

export interface SrRouting {
  categoryId: string;
  departmentId: string | null;
  proactiveHelpText: string | null;
  assignment: SrAssignment | null;
  tat: SrTat | null;
}

export async function resolveSrRouting(
  projectId: string,
  categoryId: string,
): Promise<SrRouting> {
  const [category, assignment, sla] = await Promise.all([
    Category.findById(categoryId).lean(),
    CategoryAssignmentConfig.findOne({
      categoryId,
      projectId,
      isActive: true,
    }).lean(),
    CategorySLA.findOne({ categoryId, projectId, isActive: true }).lean(),
  ]);

  const cat = category as any;

  return {
    categoryId,
    departmentId: cat?.department ? String(cat.department) : null,
    proactiveHelpText: cat?.sr?.proactiveHelpText ?? null,
    assignment: assignment
      ? {
          mode: assignment.mode,
          agentPool: (assignment.agentPool || []).map(String),
          rolePool: (assignment.rolePool || []).map(String),
          ccUsers: ((assignment as any).ccUsers || []).map(String),
          ccRoles: ((assignment as any).ccRoles || []).map(String),
        }
      : null,
    tat: sla
      ? { response: sla.responseTime, resolution: sla.resolutionTime }
      : null,
  };
}
