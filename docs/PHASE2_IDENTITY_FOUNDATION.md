# Phase 2 — Identity Foundation (Keycloak SSO)

Adds the immutable identity link and the safe, dry-run migration tooling. No
login behaviour changes yet — this is groundwork for Phase 3.

## What was built

| Item | Where |
|---|---|
| `keycloakSubject` field on User (unique, sparse) | `models/User.ts` |
| Account-linking planner (pure, testable) | `services/keycloak/accountLinking.ts` |
| Dry-run report script (no DB writes) | `scripts/keycloakLinkReport.ts` |
| Unit tests (8/8 pass) | `tests/accountLinking.test.ts` |

### `keycloakSubject` + `keycloakIssuer` (multi-tenant)
Holds the Keycloak `sub` claim — the one identifier that never changes when a
user's email/mobile/name changes. Once set, **login resolves the local user by
this, not by email**. Fixes the Phase-1 finding that SSO matched users by mutable
email/mobile.

**Multi-tenant correction:** the portal supports a **per-project realm override**
(`Project.configuration.loginSettings.ssoSettings.keycloak`), and a `sub` is only
unique *within a realm*. So identity is the **`(keycloakIssuer, keycloakSubject)`
pair**, not `sub` alone. Enforced by a partial compound unique index on User
(`{keycloakIssuer, keycloakSubject}`, unique where subject is a string). A bare
`sub` unique index would be wrong the moment two tenants use different realms.

This depends on org answer **B2.0 (realm model)**:
- **Shared realm** → one issuer, `sub` effectively global — the pair still works.
- **Per-tenant / hybrid realm** → the issuer is what keeps two tenants' subs from
  colliding. Run the link report once per realm (`KEYCLOAK_ISSUER=<issuer>`).

### The account-linking report
For every Helpdesk user it proposes a Keycloak `sub` and classifies the match:

| Status | Meaning | Action |
|---|---|---|
| `MATCH_UNIQUE` | one Keycloak user on a **strong** key (employeeCode / hrmsId) | safe to auto-link |
| `MATCH_WEAK` | one match, but only via a **weak** key (email / mobile) | **review** — never auto-link |
| `MATCH_AMBIGUOUS` | multiple Keycloak users share the key | **review** |
| `CONFLICT` | one `sub` maps to two local users | **review** |
| `NO_KEYCLOAK` | no Keycloak user found | create/investigate |
| `DISABLED_SKIPPED` | inactive local user | ignored |
| `LINKED_ALREADY` | already has a `keycloakSubject` | untouched |

Only `MATCH_UNIQUE` is auto-linkable. Everything dup-prone or conflicting is held
for a human — satisfying the checklist rule *"do not automatically link ambiguous
accounts."* The script **writes nothing to the DB**; it emits a JSON + CSV report.

## Blocked on org answer B3 (documented, not a code change)

The authoritative match key depends on what MDM exposes. The planner is
**configurable** (`LinkConfig.keyPriority` / `strongKeys`, default employeeCode →
hrmsId → email → mobile). When B3 confirms the immutable key, set it there — no
structural change needed. Until then, run the script in **readiness mode** (no
Keycloak export) to see how many users even carry each key:

```bash
# readiness — how many active/unlinked users have employeeCode / hrmsId / email / mobile
npx ts-node src/scripts/keycloakLinkReport.ts

# full plan once a Keycloak export exists
KEYCLOAK_USERS_EXPORT=./kc-users.json npx ts-node src/scripts/keycloakLinkReport.ts
```

## Deactivation & role-change behaviour (design — to confirm against MDM/B3)

When MDM disables a user or changes their access, the following must happen. The
enforcement points already exist; the policy needs sign-off (deactivation timing
is org answer **1.6 / B7**).

| Event | Keycloak | Helpdesk user | Sessions / tokens |
|---|---|---|---|
| **User disabled in MDM** | disable/lock the Keycloak account (provisioning) | set `isActive=false` (existing MDM sync marks `mdmSyncStatus`) | revoke server-side session (Phase 4) + backchannel logout (Phase 5); until those land, `tokenVersion` bump forces re-login |
| **Role / project change** | n/a (roles stay in Helpdesk for rollout 1) | update role/projects | bump `tokenVersion` → existing tokens rejected next request (already implemented in `authMiddleware`) |
| **Email / mobile change** | Keycloak updates the attribute | no re-link needed | none — identity is `keycloakSubject`, not email |
| **Rehire / new `sub`** | new Keycloak account → new `sub` | migration report flags as `NO_KEYCLOAK` or `CONFLICT` | manual review before linking |

Key point: because identity is the immutable `sub`, email/mobile churn no longer
breaks login or requires re-linking — the main reason Phase 2 exists.

**Deactivation SLA to confirm (B7/1.6):** immediate / ≤15 min / overnight. This
determines whether we need backchannel logout (Phase 5) for immediate cutoff or
whether `tokenVersion` + short session TTL is sufficient.

## Verification
`tests/accountLinking.test.ts` — 8/8 pass: strong-key auto-link, weak-key review,
ambiguous, conflict, no-match, disabled-skip, already-linked, strong-over-weak
preference. Backend type-check clean.

## Not done here (correctly deferred)
- Actually **writing** `keycloakSubject` (the linking step) — happens after a
  human reviews the report and B3 confirms the key. The report is read-only by design.
- Provisioning MDM→Keycloak (depends on B3 integration model).
