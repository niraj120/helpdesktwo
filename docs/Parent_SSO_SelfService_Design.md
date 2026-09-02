# Parent SSO — Self-Service via LMS (Design)

**Status: DESIGN. No code yet.** Connects three existing pieces: the parent
self-service portal, the Guardian-Master identity model, and the Keycloak SSO work.

## The requirement

A parent, already logged into the LMS (mobile app / web), taps a **Helpdesk
icon**. A **modal / WebView** opens (no visible address bar). The parent is
**already authenticated** — no second login — sees their **name + their
student(s)**, and fills a form to raise a Parent Self-Service Request (PSR).

Parents are **not** in Helpdesk User Management. Their identity comes from the
**Guardian Master** table built with the PSR Builder (the
`parentId · studentId · guardianId` model).

## Confirmed context (from the LMS/app team)

- The **LMS already uses Keycloak.** Parents authenticate against it.
- The LMS will **register Helpdesk's URL** as an allowed destination (OIDC
  redirect / client on the same realm).
- **MDM is the common identity source** for both LMS and Helpdesk.

→ So parents are **already provisioned in the shared Keycloak realm** via LMS+MDM.
Helpdesk does not provision or store parent credentials — it is just another OIDC
client. This is the **same shared-realm model** as the staff SSO work; parents are
simply a second user population.

## The model

> Keycloak authenticates the parent. Helpdesk resolves *who that parent is* from
> the **Guardian Master**, not User Management, and creates **no User row** on login.

- **Helpdesk = OIDC client** on the shared realm (recommend a **dedicated client**
  for the parent portal, e.g. `helpdesk-parent`, separate from staff `helpdesk-web`
  — different redirect URIs, roles, and session policy).
- **Parent identity = Keycloak `sub`**, mapped to a Guardian-Master row via a
  **stable MDM key carried as a token claim** (see "the critical claim" below).
- **No Helpdesk User is created at login.** The session is a *guardian session*
  scoped to the resolved `parentId`. A User/ticket-party is materialised only when
  a ticket is raised (as today), from the guardian record.
- **Project (tenant) is resolved from the student's school**, not `User.projects`
  — a parent has no role/project assignment. Multi-school parents → students span
  projects; each ticket is scoped to the selected student's project.

## End-to-end flow

```
Parent logged into LMS (has Keycloak SSO session)
        │  taps Helpdesk icon
        ▼
LMS opens Helpdesk parent-portal URL in an in-app browser tab
   (Chrome Custom Tabs / SFSafariViewController — shares the Keycloak
    session cookie so login is SILENT; a plain isolated WebView does NOT
    share cookies and would force a re-login → see "WebView" below)
        │
        ▼
Helpdesk  GET /api/auth/oidc/login?flow=parent&return=/portal/service-requests
   → creates server-side login transaction (state, nonce, PKCE) [Phase 3]
   → redirects to Keycloak
        │
        ▼
Keycloak sees the parent's existing SSO session → returns immediately
   (no login page) with an authorization code
        │
        ▼
Helpdesk  GET /api/auth/oidc/callback
   → validates state/nonce/PKCE/iss/aud/azp/exp/signature [Phase 3]
   → reads the parent's `sub` + MDM claim
   → resolves the Guardian-Master row(s) for that parent   ◄── NEW vs staff
   → creates a BFF guardian session (HttpOnly cookie); NO User row
   → redirects to /portal/service-requests
        │
        ▼
Parent portal renders: parent name + student picker + PSR form
   (existing UI + resolveParentStudents, already built)
        │
        ▼
Parent submits → PSR created; parent/student details stamped from the
   Guardian Master (existing createSelfServiceSr behaviour)
```

## The critical claim — how Keycloak maps to the Guardian Master

This is the one thing that must be agreed with the LMS/Keycloak team. After login
Helpdesk has the parent's `sub`, but `sub` means nothing to the Guardian Master.
We need a **stable MDM identifier in the token** to resolve the guardian row:

| Preference | Claim | Why |
|---|---|---|
| Best | `mdm_parent_id` (or `guardian_id`) — the Guardian-Master key | deterministic, immutable, matches the identity model |
| OK | `employee_id`-style stable id | if that's the MDM key parents carry |
| Weak | email / mobile | dup-prone (mother/father share a number) — the exact problem the Guardian-Master model solved; avoid as the primary key |

**Ask the LMS/Keycloak team to include the MDM parent/guardian id as a token
claim** (ID-token or userinfo). Without it we fall back to mobile matching, which
reintroduces the mother/father ambiguity documented in
`Parent_Identity_Resolution_Design.md`.

Once we have it: resolve `(issuer, sub)` for audit, but **match the guardian row
by the MDM claim**, then load that parent's students.

## Parents are not in User Management — session design

- A **guardian session** carries: `parentId` (MDM), resolved `guardianId`(s),
  the Keycloak `sub`+`issuer`, and the accessible student list — but **no Helpdesk
  `User._id`**.
- Authorization for parent endpoints is "this session may act for THIS parentId's
  own students/tickets" — the same scoping the current parent-session token
  already enforces (`resolveSelfServiceAuth`), just sourced from OIDC instead of a
  mobile-based mint.
- The existing public self-service endpoints (`/v1/service-requests/*`) already
  resolve parent+students from the Guardian Master and never require a User row —
  they are reused as-is behind the guardian session.

## WebView / silent-SSO requirement (app team)

For the parent to **not** see a login screen, the Helpdesk page must run where the
Keycloak session cookie is visible:

- **iOS:** open Helpdesk in **`SFSafariViewController`** (shares Safari cookies →
  Keycloak session present). A plain `WKWebView` has an isolated cookie store and
  will force a re-login.
- **Android:** open in **Chrome Custom Tabs** (shares system-browser cookies). A
  plain `WebView` will not have the Keycloak session.
- **Web:** a normal redirect / iframe works if same-site cookie rules allow; for a
  cross-origin iframe we still need `frame-ancestors` allow-listing (see the
  self-service spec).

If the app team must use an isolated WebView, the alternative is a **token
handoff**: the LMS (already holding a valid Keycloak token) passes an
authorization code / token to Helpdesk server-to-server. Flag this early — it
changes the integration.

## What's already built vs new

**Already built (reused):**
- Parent portal UI + student picker + PSR form.
- Guardian-Master resolution (`resolveParentStudents`) — parent name + students.
- Parent-scoped self-service endpoints + "act only for own students" auth.
- PSR creation stamping parent/student from the guardian record.
- The identity model: `parentId · studentId · guardianId`.

**New:**
- Helpdesk as an **OIDC client** for the parent flow (rides on Phase 3's login
  transaction + token validation).
- **Guardian-session** type (OIDC-authenticated, no User row) — the callback
  branches: staff → User Management, parent → Guardian Master.
- **Claim → Guardian-Master** resolution (needs the MDM claim).
- **Project resolution from the student's school** for parents.

## Impact on the SSO plan (Phase 3)

Phase 3's OIDC flow must support **two principal types** from the same callback:

| Principal | Resolved from | Session | Project scope |
|---|---|---|---|
| Staff / agent | User Management (`keycloakSubject`) | user session | `User.projects ∪ Role.projects` |
| **Parent** | **Guardian Master (MDM parentId)** | **guardian session, no User row** | **student's school/project** |

A `flow=parent` (or a role/claim on the token) tells the callback which branch to
take. This is a Phase-3 design input, not extra scope — one flow, two resolvers.

## Decisions / asks (LMS + Keycloak team)

1. **Include the MDM parent/guardian id as a token claim** (the critical item).
2. **Dedicated parent OIDC client** (`helpdesk-parent`) or reuse `helpdesk-web`
   with a role? (recommend dedicated — different redirect, session, roles.)
3. **WebView that shares the Keycloak session** (Custom Tabs / SFSafariVC), else a
   token-handoff variant.
4. Exact **redirect URI** for the parent portal to register on the client.
5. Confirm the **Guardian Master key that matches the MDM claim** (which column).

---

*Design for discussion. Depends on Phase 3 (OIDC flow) and the org realm answers
(Block 2). No code changed.*
