/**
 * Project access scoping for Service Request / triage list endpoints.
 * Mirrors how the ticket controller limits non-super-admins to their own
 * projects, so SR/email/IVR/lead lists never leak cross-tenant data.
 */
import { AuthRequest } from "../middleware/auth";

export interface ProjectScope {
  all: boolean; // super-admin → unrestricted
  projectIds: string[];
}

export function isSuperAdmin(req: AuthRequest): boolean {
  const role: any = req.user?.role;
  return (
    role?.code === "SUPER_ADMIN" ||
    role?.name === "Super Admin" ||
    role === "Super Admin"
  );
}

export function getAccessibleProjectIds(req: AuthRequest): string[] {
  const u: any = req.user || {};
  const ids = new Set<string>();
  (u.projects || []).forEach((p: any) => p && ids.add(String(p._id || p)));
  (u.userDirectProjects || []).forEach(
    (p: any) => p && ids.add(String(p._id || p)),
  );
  if (u.projectId) ids.add(String(u.projectId));
  return [...ids];
}

export function getProjectScope(req: AuthRequest): ProjectScope {
  if (isSuperAdmin(req)) return { all: true, projectIds: [] };
  return { all: false, projectIds: getAccessibleProjectIds(req) };
}

/**
 * Apply scope to a Mongo query on the given field.
 * - super-admin: optional exact projectId filter, otherwise unrestricted.
 * - others: restricted to their projects; a requested projectId outside that
 *   set yields an impossible filter (no results) rather than leaking.
 */
export function applyProjectScope(
  query: any,
  field: string,
  requestedProjectId: string | undefined,
  scope: ProjectScope,
): void {
  if (scope.all) {
    if (requestedProjectId) query[field] = requestedProjectId;
    return;
  }
  if (requestedProjectId) {
    query[field] = scope.projectIds.includes(String(requestedProjectId))
      ? requestedProjectId
      : { $in: [] }; // outside scope → match nothing
  } else {
    query[field] = { $in: scope.projectIds };
  }
}

/** Whether a single project id is accessible under the scope. */
export function canAccessProject(
  scope: ProjectScope,
  projectId: any,
): boolean {
  return scope.all || scope.projectIds.includes(String(projectId));
}
