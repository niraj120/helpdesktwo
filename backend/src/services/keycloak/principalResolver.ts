/**
 * Resolve an authenticated Keycloak identity to a Helpdesk principal (Phase 3).
 *
 * One callback, two resolvers:
 *   - staff  → a Helpdesk User, matched by the immutable (issuer, sub) pair.
 *   - parent → the Guardian Master (PSR builder). NO User row is created; the
 *              parent is carried as a guardian principal keyed by the MDM id.
 *
 * Identity is (keycloakIssuer, keycloakSubject) — a bare sub is not unique across
 * realms in a multi-tenant portal.
 */
import { User } from "../../models/User";
import { config } from "../../config";

export interface StaffPrincipal {
  type: "staff";
  userId: string;
  keycloakSub: string;
  keycloakIssuer: string;
}

export interface ParentPrincipal {
  type: "parent";
  parentId: string; // MDM parent/guardian id from the token claim
  keycloakSub: string;
  keycloakIssuer: string;
}

export type Principal =
  | { ok: true; principal: StaffPrincipal | ParentPrincipal }
  | { ok: false; reason: string };

/**
 * Staff: look up the User by the immutable (issuer, sub). If not yet linked and
 * the controlled-migration flag is on, link by a unique email match once, then
 * use (issuer, sub) forever after. Never link on an ambiguous/absent email.
 */
export async function resolveStaff(
  claims: Record<string, any>,
  issuer: string,
): Promise<Principal> {
  const sub = String(claims.sub || "");
  if (!sub) return { ok: false, reason: "token has no sub" };

  const existing = await User.findOne({
    keycloakIssuer: issuer,
    keycloakSubject: sub,
    isActive: true,
  })
    .select("_id")
    .lean();
  if (existing) {
    return {
      ok: true,
      principal: { type: "staff", userId: String(existing._id), keycloakSub: sub, keycloakIssuer: issuer },
    };
  }

  // Controlled migration: first login links (issuer, sub) to a unique email.
  const linkByEmail = process.env.OIDC_MIGRATION_LINK_BY_EMAIL === "true";
  const email = String(claims.email || "").toLowerCase();
  if (linkByEmail && email) {
    const candidates = await User.find({
      email,
      isActive: true,
      $or: [{ keycloakSubject: { $exists: false } }, { keycloakSubject: null }],
    })
      .select("_id")
      .lean();
    if (candidates.length === 1) {
      await User.updateOne(
        { _id: candidates[0]._id },
        { $set: { keycloakSubject: sub, keycloakIssuer: issuer } },
      );
      return {
        ok: true,
        principal: {
          type: "staff",
          userId: String(candidates[0]._id),
          keycloakSub: sub,
          keycloakIssuer: issuer,
        },
      };
    }
    // 0 or >1 → do not auto-link (ambiguous). Fall through to deny.
  }

  return {
    ok: false,
    reason: "no linked Helpdesk user for this Keycloak identity",
  };
}

/**
 * Parent: extract the MDM parent id from the configured claim. The parent's
 * guardian record, students, and project are resolved downstream from the
 * Guardian Master (reuses the self-service resolver keyed on this id) — this
 * function only establishes the authenticated parent principal.
 */
export function resolveParent(
  claims: Record<string, any>,
  issuer: string,
): Principal {
  const claimName = config.oidc.parentMdmClaim;
  const parentId = String(claims[claimName] || "");
  if (!parentId) {
    return {
      ok: false,
      reason: `token missing the MDM parent claim "${claimName}"`,
    };
  }
  const sub = String(claims.sub || "");
  return {
    ok: true,
    principal: { type: "parent", parentId, keycloakSub: sub, keycloakIssuer: issuer },
  };
}
