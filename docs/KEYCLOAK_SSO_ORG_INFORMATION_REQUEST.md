# Keycloak SSO — Information Request (Helpdesk → Organization)

**To:** Keycloak / Identity owner, MDM (PostgreSQL) owner, Infra/Network owner
**From:** Helpdesk Platform Team
**Re:** Information required before we can build production SSO for the Helpdesk

We are implementing Keycloak SSO for the Helpdesk portal, per the agreed target
architecture in `KEYCLOAK_SSO_IMPLEMENTATION_GUIDE.md` (one shared realm per
environment · Authorization Code + PKCE · BFF server-side session · project
authorization enforced by Helpdesk, not by separate realms). The application-side
security and multi-tenant authorization work is already done. To build the login,
session, and logout flows we need the answers below. **Please reply in writing**
(a config export or ticket link is ideal) — verbal confirmation isn't enough for
the production sign-off.

Please route each block to the right owner. Target date for answers: **_____**.

---

## Block 1 — Identity source: MDM & PostgreSQL  *(owner: MDM / HRMS team)*

This is the most important block — it decides how a Keycloak login maps to a
Helpdesk user. *(Context: today the Helpdesk code treats MDM as an external REST
data source that syncs users into MongoDB — it does not log in directly against
Postgres. We need to know the real password/lifecycle authority to design the
Keycloak integration.)*

| # | Question | Answer |
|---|---|---|
| 1.1 | Does MDM PostgreSQL store **user records only**, or **passwords/credentials** too? | |
| 1.2 | Is MDM an **identity system**, an **HR/employee data** system, or both? | |
| 1.3 | What is the **immutable identity key** per person (e.g. employee id / HRMS id) that never changes across name/email/mobile changes? | |
| 1.4 | How should identities reach Keycloak? (pick one) — (a) Keycloak federates directly against MDM Postgres · (b) Keycloak federates against an MDM **API** · (c) a **sync/provisioning** job pushes MDM → Keycloak · (d) another provider (Entra ID / Google / LDAP / AD) is the real login and MDM is just data | |
| 1.5 | Who owns MDM Postgres — schema, user lifecycle (joiners/movers/leavers/rehires), backups, prod access? | |
| 1.6 | Required **deactivation time** when a user is disabled — immediate / ≤15 min / overnight? | |
| 1.7 | Which user fields does Helpdesk receive from MDM, and which are personal/sensitive? | |
| 1.8 | Does Keycloak have its **own** separate database (not MDM Postgres)? Confirm we must use Keycloak admin APIs / federation, never write Keycloak tables directly. | |
| 1.9 | **Parents/guardians:** does MDM hold a stable **parent/guardian id** (distinct from student id), and is it the key in the Parent-Guardian master the Helpdesk portal reads? Helpdesk resolves a logged-in parent to their guardian record by this id — email/mobile is not reliable (mother & father share a number). | |

*Blocks: Helpdesk identity linking (Phase 2) and the login flow (Phase 3), incl.
the parent self-service SSO flow.*

---

## Block 2 — Existing Keycloak inventory  *(owner: Keycloak / Identity admin)*

**The Helpdesk portal is multi-tenant** (many projects/schools on one platform).
Per the SSO implementation guide, our **target model is one shared realm per
environment** — multi-tenancy is enforced by Helpdesk's own project-authorization
(already built), **not** by a realm-per-project. Each application (Helpdesk, and
any other connected platform) is a separate **client** in that one realm. Please
confirm this is feasible on your side (2.0), then complete the rest.

| # | Question | Answer |
|---|---|---|
| 2.0 | **Confirm the shared-realm model:** one non-`master` realm per environment (suggested `hubblehox-dev` / `hubblehox-uat` / `hubblehox-prod`), Helpdesk and other platforms as clients within it. Any reason this can't work? | |
| 2.0b | Does any individual tenant/school already have **its own IdP** (Entra ID / Google Workspace / AD / a separate Keycloak)? If so we broker it **into the shared realm** (identity brokering) rather than creating a separate realm — list those tenants + their IdP. | |
| 2.0c | **Connected platforms:** which other apps are (or will be) clients on this realm and need **shared login + shared logout** with Helpdesk (e.g. Armor, CRM, admin portal)? List each with its owner. | |
| 2.0d | Do **students** authenticate via Keycloak (same realm) or through a **separate path**? This decides whether student login is in scope for this migration. | |
| 2.1 | Does the existing partial Helpdesk Keycloak integration point at a **real org realm** or only a test realm? | |
| 2.2 | **Realm name + issuer URL** for each environment (dev / UAT / prod). | |
| 2.3 | Can Helpdesk get a **confidential OIDC client** (suggested id `helpdesk-web`), Standard Authorization Code Flow with **PKCE S256**, Implicit + Direct Access Grants **disabled**? | |
| 2.4 | Can we get a Helpdesk **API audience** (suggested id `helpdesk-api`) with an audience mapper adding it to the access token? | |
| 2.5 | List every other client already on that realm (owner, redirect URLs, web origins). Any **wildcard** redirect URLs or broad web origins? (must be removed or formally approved) | |
| 2.6 | Is Keycloak the **primary IdP**, or does it broker an upstream provider (Entra ID / Google / LDAP / AD / SAML)? | |
| 2.7 | Can we define **coarse Helpdesk client roles** (e.g. `helpdesk-user`, `helpdesk-admin`)? (Fine-grained project access stays in Helpdesk, not in Keycloak.) | |
| 2.8 | Who owns client-secret / signing-key rotation, and what's the JWKS endpoint? | |
| 2.9 | **Parent self-service SSO** — the LMS (already on Keycloak) will point a Helpdesk icon at us so a logged-in parent reaches the Helpdesk modal with no second login. We need: (a) a **dedicated parent OIDC client** (e.g. `helpdesk-parent`) with our redirect URI, and (b) the **MDM parent/guardian id emitted as a token claim** (ID-token or userinfo) so we can resolve the parent to their guardian record. Confirm both. | |
| 2.10 | For the parent flow the LMS must open Helpdesk where the **Keycloak session cookie is shared** (Chrome Custom Tabs / SFSafariViewController) — a plain isolated WebView forces re-login. If an isolated WebView is required instead, confirm a **token/code handoff** path. *(LMS/app-team item.)* | |

*Blocks: the secure OIDC flow (Phase 3) and the parent self-service SSO flow.*

---

## Block 3 — Domain, TLS, DNS, network  *(owner: Infra / Network)*

| # | Question | Answer |
|---|---|---|
| 3.1 | Production Helpdesk domain, Keycloak **issuer domain**, and domains of the other connected platforms. | |
| 3.2 | **Exact OIDC callback URL** for each environment. Target path: `https://<helpdesk-host>/api/auth/oidc/callback`. | |
| 3.3 | **Exact post-logout URL** for each environment. Target path: `https://<helpdesk-host>/signed-out`. | |
| 3.8 | **Backchannel-logout URL** Keycloak will call on Helpdesk (backend-only): `https://<helpdesk-host>/api/auth/oidc/backchannel-logout`. Confirm reachable from Keycloak. | |
| 3.4 | Confirm the backend can reach Keycloak's **discovery, authorization, token, JWKS, and logout** endpoints (firewall/allow-list). | |
| 3.5 | Reverse-proxy / load-balancer config so Keycloak emits the correct **public HTTPS issuer** URL (not an internal host). | |
| 3.6 | Are Keycloak **admin endpoints** restricted from public access? | |
| 3.7 | DNS owner + certificate owner + expiry monitoring for these domains. | |
| 3.9 | **Secret-management tooling** available/approved for storing the Keycloak client secret + Helpdesk session secret (e.g. GCP Secret Manager / Vault) — must NOT live in app config or Git. | |

*Blocks: redirect/logout allow-lists and connectivity (Phase 3).*

---

## Block 4 — Session & logout policy  *(owner: Security + Identity)*

| # | Question | Answer |
|---|---|---|
| 4.1 | Keycloak **SSO session** idle timeout + max lifetime. | |
| 4.2 | Keycloak **client session** idle timeout + max lifetime. | |
| 4.3 | Access-token lifetime, refresh-token policy, offline-session policy. | |
| 4.4 | Desired **Helpdesk local session** idle + max lifetime. | |
| 4.5 | Must logout be **global** across all connected platforms? (stated requirement: yes) | |
| 4.6 | Which connected platforms **support Keycloak Backchannel Logout**? | |
| 4.7 | Max acceptable **delay** before a logged-out / disabled user loses access everywhere. | |
| 4.8 | Do sensitive actions require **recent re-auth / MFA step-up**? | |

*Blocks: server-side sessions (Phase 4) and logout incl. backchannel (Phase 5).*

---

## Why we need these now

Helpdesk-side Phases 0–1 (secrets hardening + multi-tenant authorization) are
complete and need nothing from you. The **next** phases can't start until:

| Phase | Needs |
|---|---|
| Identity linking + migration | Block 1 |
| Secure OIDC login flow | Blocks 2 & 3 |
| Server-side sessions | Block 4 |
| Logout (incl. backchannel) | Block 4 |

Answering these in parallel now keeps the project moving — otherwise we hit a hard
stop when we reach the login flow.

## Minimum Keycloak config we will ultimately need (for reference)

One non-`master` realm per environment · confidential client `helpdesk-web` ·
API audience `helpdesk-api` · Authorization Code + PKCE S256 · Implicit & Direct
Access Grants disabled · exact redirect + post-logout URLs · client secret via
approved secret management · audience mapper · RP-initiated + Backchannel Logout ·
JWKS endpoint with a documented key-rotation process.

---

*Please return answers to the Helpdesk Platform Team. Blockers are tracked against
the SSO implementation plan; each answered block unblocks the corresponding phase.*
