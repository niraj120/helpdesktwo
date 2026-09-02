/**
 * Account-linking planner for Keycloak SSO migration (Phase 2).
 *
 * PURE + DRY-RUN. Given the local Helpdesk users and an export of Keycloak
 * users, it proposes which local user maps to which Keycloak `sub`, and — most
 * importantly — flags everything that is NOT safe to auto-link. It writes
 * nothing; the caller decides what to do with the plan.
 *
 * ── Blocked on org answer B3 ──────────────────────────────────────────────
 * The authoritative match key depends on what MDM exposes (employee id / HRMS
 * id) and how identities reach Keycloak. Until B3 is answered, the key strategy
 * is configurable via `LinkConfig`:
 *   - strongKeys  = authoritative, unique identifiers (default: employeeCode, hrmsId)
 *   - weakKeys    = dup-prone (email, mobile) — a unique match on these still
 *                   needs human review, never silent auto-link.
 * When B3 lands, set `keyPriority`/`strongKeys` to the confirmed key and this
 * module needs no structural change.
 */

export type MatchKey = "employeeCode" | "hrmsId" | "email" | "mobile";

export type MatchStatus =
  | "LINKED_ALREADY" // local user already has a keycloakSubject
  | "MATCH_UNIQUE" // exactly one Keycloak user on a STRONG key → safe to link
  | "MATCH_WEAK" // exactly one match but only via a weak key → REVIEW, don't auto-link
  | "MATCH_AMBIGUOUS" // >1 Keycloak user matches → REVIEW, never auto-link
  | "NO_KEYCLOAK" // no Keycloak user found on any configured key
  | "CONFLICT" // the same Keycloak sub maps to >1 local user
  | "DISABLED_SKIPPED"; // local user inactive — reported, not linked

export interface LocalUser {
  id: string;
  email?: string;
  mobile?: string;
  employeeCode?: string;
  hrmsId?: number | string;
  isActive: boolean;
  keycloakSubject?: string;
}

export interface KeycloakUser {
  sub: string;
  email?: string;
  username?: string;
  employeeCode?: string; // typically from Keycloak user attributes
  hrmsId?: number | string;
  mobile?: string;
}

export interface LinkConfig {
  /** Keys tried in order; first key the local user actually has a value for wins. */
  keyPriority: MatchKey[];
  /** Keys treated as authoritative/unique. Matches on other keys are "weak". */
  strongKeys: MatchKey[];
}

export const DEFAULT_LINK_CONFIG: LinkConfig = {
  // TODO(B3): reorder / trim once MDM confirms the immutable key.
  keyPriority: ["employeeCode", "hrmsId", "email", "mobile"],
  strongKeys: ["employeeCode", "hrmsId"],
};

export interface MatchRow {
  localUserId: string;
  localEmail?: string;
  status: MatchStatus;
  matchedSub?: string;
  /** Realm issuer the matched sub belongs to. Identity is (issuer, sub) — a bare
   *  sub is not unique across realms in a multi-tenant portal. */
  matchedIssuer?: string;
  matchedBy?: MatchKey;
  /** Human-readable explanation, safe to drop into the CSV report. */
  reason: string;
  /** Candidate subs when ambiguous or in conflict. */
  candidateSubs?: string[];
}

export interface MatchPlan {
  rows: MatchRow[];
  summary: Record<MatchStatus, number>;
  /** Rows that are safe to auto-link (MATCH_UNIQUE only). */
  autoLinkable: MatchRow[];
  /** Rows a human must resolve before linking. */
  needsReview: MatchRow[];
}

const norm = (v: unknown): string =>
  v === undefined || v === null ? "" : String(v).trim().toLowerCase();

/** value(key) for a local user, normalized. */
function localKeyValue(u: LocalUser, key: MatchKey): string {
  switch (key) {
    case "employeeCode":
      return norm(u.employeeCode);
    case "hrmsId":
      return norm(u.hrmsId);
    case "email":
      return norm(u.email);
    case "mobile":
      return norm(u.mobile);
  }
}

function kcKeyValue(u: KeycloakUser, key: MatchKey): string {
  switch (key) {
    case "employeeCode":
      return norm(u.employeeCode);
    case "hrmsId":
      return norm(u.hrmsId);
    case "email":
      return norm(u.email);
    case "mobile":
      return norm(u.mobile);
  }
}

const EMPTY_SUMMARY = (): Record<MatchStatus, number> => ({
  LINKED_ALREADY: 0,
  MATCH_UNIQUE: 0,
  MATCH_WEAK: 0,
  MATCH_AMBIGUOUS: 0,
  NO_KEYCLOAK: 0,
  CONFLICT: 0,
  DISABLED_SKIPPED: 0,
});

/**
 * Build the (dry-run) linking plan. No side effects.
 */
export function buildMatchPlan(
  localUsers: LocalUser[],
  keycloakUsers: KeycloakUser[],
  config: LinkConfig = DEFAULT_LINK_CONFIG,
  /** Realm issuer of THIS Keycloak export. Run the report once per realm; the
   *  issuer is stamped on every match so links carry the (issuer, sub) pair. */
  issuer?: string,
): MatchPlan {
  // Index Keycloak users by each key: value → Set<sub>.
  const kcIndex: Record<MatchKey, Map<string, Set<string>>> = {
    employeeCode: new Map(),
    hrmsId: new Map(),
    email: new Map(),
    mobile: new Map(),
  };
  for (const kc of keycloakUsers) {
    for (const key of config.keyPriority) {
      const val = kcKeyValue(kc, key);
      if (!val) continue;
      if (!kcIndex[key].has(val)) kcIndex[key].set(val, new Set());
      kcIndex[key].get(val)!.add(kc.sub);
    }
  }

  const rows: MatchRow[] = [];

  for (const u of localUsers) {
    const base = { localUserId: u.id, localEmail: u.email };

    if (!u.isActive) {
      rows.push({
        ...base,
        status: "DISABLED_SKIPPED",
        reason: "Local user is inactive; not linked.",
      });
      continue;
    }
    if (u.keycloakSubject) {
      rows.push({
        ...base,
        status: "LINKED_ALREADY",
        matchedSub: u.keycloakSubject,
        reason: "Already linked to a Keycloak subject.",
      });
      continue;
    }

    let resolved = false;
    for (const key of config.keyPriority) {
      const val = localKeyValue(u, key);
      if (!val) continue; // user has no value for this key — try the next
      const subs = kcIndex[key].get(val);
      if (!subs || subs.size === 0) continue; // no KC user on this key — try next
      const subList = [...subs];
      if (subs.size > 1) {
        rows.push({
          ...base,
          status: "MATCH_AMBIGUOUS",
          matchedBy: key,
          candidateSubs: subList,
          reason: `Multiple Keycloak users share ${key}="${val}" — resolve manually.`,
        });
      } else {
        const strong = config.strongKeys.includes(key);
        rows.push({
          ...base,
          status: strong ? "MATCH_UNIQUE" : "MATCH_WEAK",
          matchedSub: subList[0],
          matchedIssuer: issuer,
          matchedBy: key,
          reason: strong
            ? `Unique match on strong key ${key}.`
            : `Unique match only on weak key ${key} — review before linking.`,
        });
      }
      resolved = true;
      break;
    }
    if (!resolved) {
      rows.push({
        ...base,
        status: "NO_KEYCLOAK",
        reason: "No Keycloak user found on any configured key.",
      });
    }
  }

  // Conflict pass: a Keycloak sub proposed for >1 local user is a CONFLICT for
  // all of them (never link a sub to two people).
  const subToRows = new Map<string, MatchRow[]>();
  for (const r of rows) {
    if (
      (r.status === "MATCH_UNIQUE" || r.status === "MATCH_WEAK") &&
      r.matchedSub
    ) {
      if (!subToRows.has(r.matchedSub)) subToRows.set(r.matchedSub, []);
      subToRows.get(r.matchedSub)!.push(r);
    }
  }
  for (const [sub, group] of subToRows) {
    if (group.length > 1) {
      for (const r of group) {
        r.status = "CONFLICT";
        r.candidateSubs = [sub];
        r.reason = `Keycloak sub ${sub} matched ${group.length} local users — resolve manually.`;
      }
    }
  }

  const summary = EMPTY_SUMMARY();
  for (const r of rows) summary[r.status]++;

  const autoLinkable = rows.filter((r) => r.status === "MATCH_UNIQUE");
  const needsReview = rows.filter(
    (r) =>
      r.status === "MATCH_WEAK" ||
      r.status === "MATCH_AMBIGUOUS" ||
      r.status === "CONFLICT",
  );

  return { rows, summary, autoLinkable, needsReview };
}

/** Render a plan as CSV (no writes; caller persists). */
export function planToCsv(plan: MatchPlan): string {
  const header = [
    "localUserId",
    "localEmail",
    "status",
    "matchedBy",
    "matchedIssuer",
    "matchedSub",
    "candidateSubs",
    "reason",
  ].join(",");
  const esc = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const lines = plan.rows.map((r) =>
    [
      esc(r.localUserId),
      esc(r.localEmail),
      esc(r.status),
      esc(r.matchedBy),
      esc(r.matchedIssuer),
      esc(r.matchedSub),
      esc((r.candidateSubs || []).join("|")),
      esc(r.reason),
    ].join(","),
  );
  return [header, ...lines].join("\n");
}
