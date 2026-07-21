/**
 * PSR entity-scope routing resolver (Phase A).
 *
 * Normal tickets route on the category taxonomy. PSR requests route on an entity
 * SCOPE tuple (e.g. { school, grade, subject }) the parent selects from PSR-Builder
 * dropdowns. The staff who own a given scope tuple (subject teacher, HOD, principal)
 * live in MDM staffing data, mirrored into a PsrTable. This module reads that map
 * table by scope and resolves the owner identifiers to helpdesk User ids.
 *
 * This is the shared primitive used by:
 *   - Phase B: owner resolution on PSR create (assign the L1 subject teacher).
 *   - Phase C: escalation target resolution (resolve a role for a scope subset).
 *
 * Nothing here is hardcoded — table, columns and holder-resolution strategy are all
 * config-driven. See [[no-hardcoding-configurable-by-permission]].
 */
import mongoose from "mongoose";
import { PsrRoutingConfig } from "./types";

/** A scope tuple: dimension key → selected value (e.g. { school: "DPS", grade: "5", subject: "Math" }). */
export type RoutingScope = Record<string, string | undefined>;

/** roleKey (e.g. "SUBJECT_TEACHER","HOD","PRINCIPAL") → resolved helpdesk User id (or null). */
export type ResolvedOwners = Record<string, string | null>;

export interface ScopeOwnerResult {
  /** The matched map-table row (raw), or null when nothing matched. */
  matchedRow: Record<string, any> | null;
  /** roleKey → helpdesk User id (string) or null when the holder didn't resolve. */
  owners: ResolvedOwners;
  /** roleKey → the raw holder identifier read from the table (for debugging/UI). */
  holders: Record<string, string | null>;
}

/** Case/space-insensitive equality used when matching scope values against the table. */
function norm(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

/**
 * Build a scope tuple from parent-submitted form values, using each dimension's
 * configured source field (falls back to the dimension key itself).
 */
export function buildRoutingScope(
  routing: PsrRoutingConfig | undefined,
  formData: Record<string, any> | undefined,
): RoutingScope {
  const scope: RoutingScope = {};
  if (!routing?.enabled || !formData) return scope;
  for (const dim of routing.dimensions || []) {
    const raw = dim.fieldId ? formData[dim.fieldId] : formData[dim.key];
    const val = raw == null ? "" : String(raw).trim();
    if (val) scope[dim.key] = val;
  }
  return scope;
}

/** The role key that owns a request first (L1). Config-driven, never hardcoded. */
export function primaryOwnerRole(
  routing: PsrRoutingConfig | undefined,
): string | null {
  const map = routing?.ownerMap;
  if (!map) return null;
  if (map.primaryRole && map.roleColumns?.[map.primaryRole]) return map.primaryRole;
  const keys = Object.keys(map.roleColumns || {});
  return keys.length ? keys[0] : null;
}

/**
 * Resolve a holder identifier (as stored in the map table) to a helpdesk User id.
 * Prefers a project-scoped user, then falls back to a global match.
 */
async function resolveHolderToUserId(
  holder: string,
  by: PsrRoutingConfig["ownerMap"]["holderResolution"]["by"],
  projectId?: string,
): Promise<string | null> {
  const value = String(holder ?? "").trim();
  if (!value) return null;

  const { User } = await import("../../models/User");

  // userId: the table already stores a helpdesk User _id.
  if (by === "userId") {
    if (!mongoose.Types.ObjectId.isValid(value)) return null;
    const u = await User.findById(value).select("_id").lean();
    return u ? String((u as any)._id) : null;
  }

  const q: any =
    by === "email" ? { email: value.toLowerCase() } : { employeeCode: value };

  // Prefer a user scoped to this project, then any matching user.
  if (projectId && mongoose.Types.ObjectId.isValid(projectId)) {
    const scoped = await User.findOne({ ...q, projects: projectId })
      .select("_id")
      .lean();
    if (scoped) return String((scoped as any)._id);
  }
  const any = await User.findOne(q).select("_id").lean();
  return any ? String((any as any)._id) : null;
}

/**
 * Read the owner-map table for the given scope tuple and resolve every configured
 * role's owner to a helpdesk User id.
 *
 * Matching is an AND over the scope dimensions that are BOTH mapped to a table
 * column AND present in `scope`. If the map table stores values with different
 * casing/whitespace, we fall back to an in-memory case-insensitive match.
 */
export async function resolveScopeOwners(
  routing: PsrRoutingConfig | undefined,
  scope: RoutingScope,
  projectId?: string,
): Promise<ScopeOwnerResult> {
  const empty: ScopeOwnerResult = { matchedRow: null, owners: {}, holders: {} };
  if (!routing?.enabled) return empty;

  const { ownerMap } = routing;
  if (!ownerMap?.tableId) return empty;

  const scopeColumns = ownerMap.scopeColumns || {};
  const roleColumns = ownerMap.roleColumns || {};

  // Dimensions we can actually match on: mapped to a column AND supplied in scope.
  const matchKeys = Object.keys(scopeColumns).filter(
    (k) => scopeColumns[k] && norm(scope[k]) !== "",
  );
  if (!matchKeys.length) return empty;

  const PsrTable = (await import("../../models/psr/PsrTable")).default;
  const table: any = await PsrTable.findById(ownerMap.tableId).lean();
  if (!table?.targetCollection) return empty;
  const col = mongoose.connection.collection(table.targetCollection);

  // Primary: exact-match query on the mapped columns (fast, index-friendly).
  const exactQuery: any = {};
  for (const k of matchKeys) exactQuery[scopeColumns[k]] = scope[k];
  let row = await col.findOne(exactQuery);

  // Fallback: case/space-insensitive scan (bounded) when exact match misses.
  if (!row) {
    const candidates = await col
      .find({ [scopeColumns[matchKeys[0]]]: { $exists: true } } as any)
      .limit(500)
      .toArray();
    row =
      candidates.find((r) =>
        matchKeys.every((k) => norm(r[scopeColumns[k]]) === norm(scope[k])),
      ) || null;
  }

  if (!row) return empty;

  const holders: Record<string, string | null> = {};
  const owners: ResolvedOwners = {};
  for (const roleKey of Object.keys(roleColumns)) {
    const colName = roleColumns[roleKey];
    const holder = colName ? String(row[colName] ?? "").trim() : "";
    holders[roleKey] = holder || null;
    owners[roleKey] = holder
      ? await resolveHolderToUserId(
          holder,
          ownerMap.holderResolution?.by || "employeeCode",
          projectId,
        )
      : null;
  }

  return { matchedRow: row, owners, holders };
}

/**
 * Resolve a SINGLE role for a scope SUBSET (used by escalation in Phase C — e.g.
 * HOD is keyed on school+subject, not the full school+grade+subject tuple).
 * `scopeSubset` lists which dimension keys to match on for this role.
 */
export async function resolveRoleForScope(
  routing: PsrRoutingConfig | undefined,
  scope: RoutingScope,
  roleKey: string,
  scopeSubset?: string[],
  projectId?: string,
): Promise<string | null> {
  if (!routing?.enabled) return null;
  const subsetScope: RoutingScope = {};
  const keys = scopeSubset?.length ? scopeSubset : Object.keys(scope);
  for (const k of keys) subsetScope[k] = scope[k];
  const res = await resolveScopeOwners(routing, subsetScope, projectId);
  return res.owners[roleKey] ?? null;
}
