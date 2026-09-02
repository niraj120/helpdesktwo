# Keycloak SSO — Implementation Plan

**Companion to `KEYCLOAK_SSO_READINESS_CHECKLIST.md`.** The checklist says *what*
must be true. This plan says *in what order we do it, why that order, and what
blocks each step.* No code changed yet — this is the roadmap to agree before we
start Phase 0.

Every claim below was verified against the current code (Aug 2026):

| Checklist claim | Verified in code |
|---|---|
| Browser controls OIDC state/nonce/PKCE | `frontend/src/services/ssoService.ts:99-101` (sessionStorage), callback trusts it |
| Token validation incomplete | `backend/src/middleware/keycloakAuth.ts:53-59` — checks sig + issuer, **no `aud`/`azp`** |
| Identity matched by email/mobile, not `sub` | `keycloakAuthController.ts:143-153`; `User.ts` has no `keycloakSubject` |
| Tokens in browser storage | `ssoService.ts:147` — `authToken` in `localStorage` |
| Per-project client secret in DB | `keycloakAuthController.ts:80,109` reads it from Project config |
| Hardcoded prod secrets | `config/index.ts:107` — **live Mongo URI + password**; `:29` JWT fallback |
| Project guard barely used | `requireProjectAccess` wired to **3 routes, 1 file** only |
| Sockets accept invalid tokens | `socketHandlers.ts:19` — "still allow connection without userId" |

---

## The core idea

Two problem families are bundled in the checklist:

1. **SSO hardening** — make the Keycloak login itself production-grade.
2. **Project authorization** — make sure "logged in" never means "can reach any
   project." This bug exists *today, without SSO.*

**Authorization (family 2) must land before SSO goes live (family 1)**, because
SSO drops users straight onto project URLs and turns every unguarded `projectId`
into a cross-tenant leak. That single dependency drives the phase order.

---

## Phase order at a glance

| Phase | Theme | Depends on | Blocked by org? |
|---|---|---|---|
| **0** | Stop the bleeding — secrets | nothing | no — start immediately |
| **1** | Project authorization hardening | 0 | no — our code only |
| **2** | Identity foundation (`keycloakSubject` + migration report) | nothing | **B3** MDM source-of-truth |
| **3** | Secure OIDC flow (server-side transaction, full validation) | 2 | **B2/B5** realm, client, redirect URIs |
| **4** | Server-side sessions + HttpOnly cookie | 3 | **B7** session policy |
| **5** | Logout (local + RP-initiated + backchannel) | 4 | **B7** which platforms support backchannel |
| **6** | Rollout hardening (flag, env split, audit, tests, monitoring) | 1-5 | **B1/B5/B8** |

Phases 0, 1, and 2 have **no org dependency** and can start now, in parallel.
Phases 3-5 need answers from Part B of the checklist first (see §"Org blockers").

---

## Phase 0 — Stop the bleeding (secrets)

**Why first:** a live production database credential is sitting in tracked source.
That is an active exposure independent of SSO. Nothing else matters if the DB is
open.

1. Rotate the MongoDB production credential (`config/index.ts:107`) — new password
   in the DB, new value in the secret manager, remove the fallback string.
2. Remove the JWT secret fallback (`:29`) and refresh-secret fallback (`:65`).
   **Production startup must fail** if `JWT_SECRET` / `MONGODB_PRODUCTION_URI` are
   missing or weak — replace the current "warn and continue" with "throw and exit."
3. Scan tracked env files for any other real secret; rotate anything found.
4. Move the per-project Keycloak client secret out of MongoDB into the secret
   manager (this also unblocks Phase 3's "no secret in API responses").

**Exit criteria:** no real secret in source or tracked env; prod refuses to boot
without required secrets; rotated values confirmed working.

**Blast radius:** config + deploy pipeline. No user-facing change.

---

## Phase 1 — Project authorization hardening

**Why before SSO:** closes the cross-tenant hole SSO would amplify. Ship this even
if SSO slips.

Define **one effective-project rule** first (union of `User.projects` and
`Role.projects`, or whichever the org approves) and apply it everywhere below.

1. Adopt the standard authorize chain on every project-scoped route:
   `authenticate → load user → active? → feature permission → resolve project →
   canAccessProject → resource-belongs-to-project → act`.
2. Extend `requireProjectAccess` beyond the 3 current routes to **all** project-
   scoped APIs (tickets, assets, settings, reports, SR, IVR, config…).
3. For resources (ticket/asset/report), **load the stored record first and
   authorize its own `project`** — never trust a browser-supplied `projectId`.
4. Fix the unauthenticated SMS config routes (`routes/smsConfig.ts`): add auth +
   permission + project access.
5. Secure Socket.IO (`socketHandlers.ts`): reject invalid/missing tokens (remove
   the "still allow" branch), and verify project access before every room join
   (`project-tickets-*`, `ticket-*`, `project-config-*`, `all-tickets`).

**Exit criteria:** swapping a `projectId`/slug/resource id for another project's
value returns 403 on every route and socket room. Negative tests prove it.

**Blast radius:** wide but mechanical — many routes, one guard pattern. Highest
regression risk; do it behind good tests.

---

## Phase 2 — Identity foundation

**Why now:** everything in Phase 3+ keys off an immutable identity. No behaviour
change here, so it's safe to land early.

1. Add a unique, sparse `keycloakSubject` field to `User` (holds Keycloak `sub`).
2. Build the **account-linking migration report** (offline job): every Helpdesk
   user → proposed `sub`, match reason, ambiguous matches, missing identities,
   disabled users, conflicts. **Do not auto-link ambiguous accounts.**
3. Define deactivation/role-change behaviour: when MDM disables a user, what
   happens to Keycloak, Helpdesk status, project assignments, and live sessions.

**Blocked by org: B3** — we cannot finalize the match key until the org confirms
whether MDM Postgres owns passwords, what the immutable source key is (employee/
HRMS id), and how MDM→Keycloak provisioning works. Start the report structure now;
finalize matches after B3.

**Exit criteria:** `keycloakSubject` in the schema; a reviewed migration report
with zero unresolved ambiguous matches.

---

## Phase 3 — Secure OIDC flow

Replace the browser-trusted prototype with a server-side login transaction.

1. `GET /api/auth/oidc/login` — server creates and stores a one-time transaction
   (`state`, `nonce`, PKCE verifier, return path, expiry, used-flag), then
   redirects to Keycloak (Auth Code + PKCE `S256`). Browser no longer mints trust.
2. `GET /api/auth/oidc/callback` — validate the one-time transaction; complete
   token validation: `iss`, **`aud`**, **`azp`**, allowed alg, `exp`, `nbf`,
   signature, `nonce`. Map immutable `sub` → local user (Phase 2). Check requested
   project before proceeding.
3. Exact **redirect + post-logout allow-lists** — server uses only approved URLs;
   never forwards a browser-supplied redirect to Keycloak.
4. Safe deep-link handling — store only a relative Helpdesk path; reject external
   URLs.
5. Access-Denied page for authenticated users without project access (no silent
   redirect to another project).

**Blocked by org: B2, B5** — realm/issuer per env, confidential client
(`helpdesk-web`), API audience (`helpdesk-api`), exact callback + post-logout URLs.

---

## Phase 4 — Server-side sessions

The biggest change: stop returning tokens to the browser.

1. Opaque server-side session store with expiry + revocation (Redis preferred;
   Mongo TTL acceptable). Session id in an `HttpOnly; Secure; SameSite=Lax` cookie.
2. `GET /api/auth/session` — returns current user, effective permissions, allowed
   projects (presentation only; every API still authorizes independently).
3. Remove `authToken`/Keycloak tokens from `localStorage`/`sessionStorage`; migrate
   the frontend auth context and all API calls to the cookie session.

**Blocked by org: B7** — idle/max session lifetimes, token lifetimes, step-up rules.

**Blast radius:** every authenticated request, front and back. Stage behind the
feature flag; run old JWT and new session side-by-side during cutover.

---

## Phase 5 — Logout

1. Local logout revokes the server session **before** redirecting to Keycloak
   RP-initiated logout.
2. Expired sessions preserve the original safe path and restart OIDC login.
3. **Backchannel logout** endpoint — validate Keycloak's signed logout token,
   revoke local sessions by `sid`/`sub`.

**Blocked by org: B7** — which connected platforms must support immediate shared
logout, and the max acceptable delay.

---

## Phase 6 — Rollout hardening

Cross-cutting; finish alongside 1-5, gate go-live on it.

1. Enforce the `KEYCLOAK_ENABLED` flag consistently; enable by env then pilot group.
2. Env-separated realms/clients/secrets/keys — prod never points at a dev realm.
3. Structured audit logs (login start/success/fail, link conflict, project denial,
   logout, backchannel, validation failure) — never log tokens/codes/secrets/PII.
4. Automated test suite — the full list in the checklist's "Required Test
   Scenarios" (invalid iss/aud/sig/nonce/state, replay, PKCE fail, deactivated
   user, cross-project, socket rooms, backchannel).
5. UAT + prod monitoring — Keycloak reachability, callback/validation failures,
   access-denied rate, session/logout failures, link conflicts.

---

## What blocks us — the org (Part B) critical path

We can run Phases 0-2 now. Phases 3-5 stall without these answers. Chase them in
parallel starting today:

| Need | Checklist ref | Blocks |
|---|---|---|
| MDM source-of-truth: does Postgres own passwords? immutable key? provisioning model | **B3** | Phase 2 finalize, Phase 3 |
| Realm + issuer per env; confidential `helpdesk-web` client; `helpdesk-api` audience; exact redirect + post-logout URLs | **B2, B5** | Phase 3 |
| Session + logout policy: lifetimes, global-logout scope, backchannel-capable platforms | **B7** | Phases 4, 5 |
| Ownership/RACI, environments, least-priv Keycloak access | **B1** | all phases (access to build) |

---

## Suggested sequencing

```
Now → Phase 0 (secrets)          ─┐
      Phase 1 (authorization)     ├─ no org dependency, parallel
      Phase 2 (identity + report) ┘   (report finalizes after B3)
                                   │
Org answers B2/B3/B5/B7 ──────────┤
                                   ▼
      Phase 3 (secure OIDC) → Phase 4 (sessions) → Phase 5 (logout)
                                   │
      Phase 6 (flag, tests, monitoring) runs across 1-5
                                   ▼
                          Go/No-Go gate (checklist)
```

**Recommended first step:** Phase 0. It's small, urgent, has no dependencies, and
removes a live credential exposure. We can start it the moment you say go.

---

*Plan for discussion. No code changed. Next: confirm the phase order, then begin
Phase 0 step by step.*
