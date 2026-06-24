/**
 * Role-mapping resolver. Phase 6.
 * Resolves a Role from HRMS attributes using the configurable RoleMappingRule
 * set (per project, priority-ordered). Pure read; safe to call as a fallback.
 */
import mongoose from "mongoose";
import { RoleMappingRule } from "../models/RoleMappingRule";

export interface HrmsAttributes {
  hrmsCode?: string;
  department?: string;
  designation?: string;
}

function fieldFor(matchType: string, attrs: HrmsAttributes): string | undefined {
  if (matchType === "hrms_code") return attrs.hrmsCode;
  if (matchType === "department") return attrs.department;
  if (matchType === "designation") return attrs.designation;
  return undefined;
}

function matches(value: string, target: string, operator: string): boolean {
  const v = value.trim().toLowerCase();
  const t = target.trim().toLowerCase();
  if (!v || !t) return false;
  if (operator === "contains") return v.includes(t);
  if (operator === "startsWith") return v.startsWith(t);
  return v === t; // equals (default)
}

/**
 * Returns the mapped Role's ObjectId for the given HRMS attributes, or null if
 * no active rule matches.
 */
export async function resolveRoleFromHRMS(
  projectId: string | mongoose.Types.ObjectId,
  attrs: HrmsAttributes,
): Promise<mongoose.Types.ObjectId | null> {
  if (!projectId) return null;
  const rules = await RoleMappingRule.find({ projectId, isActive: true })
    .sort({ priority: 1, createdAt: 1 })
    .lean();

  for (const rule of rules) {
    const value = fieldFor(rule.matchType, attrs);
    if (!value) continue;
    if (matches(value, rule.matchValue, rule.operator)) {
      return rule.roleId as any;
    }
  }
  return null;
}
