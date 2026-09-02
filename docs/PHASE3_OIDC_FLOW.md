# Phase 3 — Secure OIDC Flow (built)

The production Authorization-Code + PKCE + BFF-session login, replacing the
insecure prototype. **Flag-gated** (`OIDC_ENABLED`) so an unconfigured deploy is
untouched; goes live once the Keycloak realm/client env values land.

## Endpoints (mounted under `/api/auth` only when `OIDC_ENABLED=true`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/auth/oidc/login` | start login — creates a server-side transaction, redirects to Keycloak |
| GET | `/api/auth/oidc/callback` | validate transaction + tokens, resolve principal, create BFF session |
| GET | `/api/auth/session` | current principal (presentation only) |
| POST | `/api/auth/logout` | revoke local session + RP-initiated Keycloak logout |
| POST | `/api/auth/oidc/backchannel-logout` | Keycloak → revoke sessions by `sid`/`sub` |

## What each prototype problem is now fixed

| Prototype problem | Fix |
|---|---|
| Browser-controlled base64 `state` | server-side one-time `OidcLoginTransaction` (state/nonce/PKCE/returnPath), claimed atomically at callback |
| No `nonce` validation | id-token `nonce` must equal the transaction's nonce |
| Only `iss` + signature checked | `validateClaims`: `iss`, `aud`, `azp`, `exp`, `nbf`, `nonce` + RS256 JWKS signature by `kid` |
| Tokens returned to the browser (`localStorage`) | BFF: opaque `OidcSession`, browser gets only an `HttpOnly; Secure; SameSite=Lax` cookie |
| Long-lived Helpdesk JWT issued | replaced by a revocable server-side session with idle + absolute expiry |
| PKCE generated in the browser | generated server-side (`pkce.ts`) |
| Open post-logout redirect | exact allow-list (`OIDC_POST_LOGOUT_ALLOWLIST`) |
| Open deep-link redirect | `safeReturnPath` — relative paths only, rejects scheme/host/CRLF/backslash |
| Identity by mutable email | `(keycloakIssuer, keycloakSubject)` pair; email only for a flagged one-time migration link |

## Two principals, one callback

| Principal | Resolved by | Session | On no-match |
|---|---|---|---|
| **staff** (`flow=staff`) | `User` by `(issuer, sub)`; optional unique-email link on first login (`OIDC_MIGRATION_LINK_BY_EMAIL`) | staff session (`userId`) | `/access-denied` |
| **parent** (`flow=parent`) | MDM claim → parent principal; guardian/students/project resolved downstream from the Guardian Master | parent session (`parentId`, no User row) | `/access-denied` |

## Files

```
config/index.ts                      + oidc {} block (env-driven)
models/OidcLoginTransaction.ts       one-time login transaction (TTL)
models/OidcSession.ts                BFF session (TTL, revocable, by sid/sub)
services/keycloak/pkce.ts            state/nonce/PKCE (server-side)
services/keycloak/redirectPolicy.ts  safe deep-link + post-logout allow-list
services/keycloak/oidcConfig.ts      per-flow config resolve + fail-fast
services/keycloak/oidcClient.ts      discovery, exchange, validateClaims/IdToken/LogoutToken
services/keycloak/principalResolver.ts  staff→User, parent→MDM claim
services/keycloak/sessionService.ts  create/read(slide)/revoke, cookie opts
controllers/oidcAuthController.ts    the 5 handlers
routes/oidcAuth.ts                   routes (backchannel uses urlencoded body)
server.ts                            flag-gated mount
```

## Verified

`tests/oidcSecurity.test.ts` — pure logic, no network/DB: PKCE/state generation,
`safeReturnPath` open-redirect cases, post-logout allow-list, and the full
`validateClaims` matrix (iss/aud/azp/nonce/exp/nbf incl. clock tolerance and
multi-audience). Backend type-check clean.

## Not runnable end-to-end yet — needs (from the Keycloak team)

Set these env values (see `.env.example` + `KEYCLOAK_SSO_ORG_INFORMATION_REQUEST.md`):
`KEYCLOAK_ISSUER`, `OIDC_CLIENT_ID`/`SECRET`, `KEYCLOAK_API_AUDIENCE`,
`OIDC_REDIRECT_URI`, `OIDC_POST_LOGOUT_*`, and for parents `OIDC_PARENT_CLIENT_*`
+ `OIDC_PARENT_MDM_CLAIM`. Then `OIDC_ENABLED=true`.

## Deliberately deferred (Phases 4–5)

- **Wiring the BFF session as the app's auth** across existing routes (they still
  use the Helpdesk JWT). Phase 5 migrates them; until then the OIDC flow creates a
  session + `/api/auth/session` works, but existing APIs stay on JWT.
- **Frontend** deep-link launch guard + `/access-denied` + `/signed-out` pages
  (Phase 4).
- **Retiring the prototype** `/api/keycloak-auth` + `localStorage` tokens (Phase 5).
- **Parent guardian/students/project resolution** from `parentId` — reuses/extends
  the existing self-service resolver (`resolveParentStudents`); wire when the MDM
  claim shape is confirmed.
