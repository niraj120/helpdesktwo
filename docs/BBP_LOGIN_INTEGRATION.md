# BBP → Helpdesk Login Integration

**For:** BBP engineering team
**Environment:** DEV / UAT — `https://helpdesksupport365.com`
**Date:** 2026-08-24

There is exactly one API to call and one URL to open. Nothing else is required.

---

## 0. Your project — already created

| Item | Value |
|---|---|
| Project name | `BBP` |
| Project code | `BBP` |
| Project ID | `6a8c239ef69b9fe7107e8367` |
| URL path | `bbp` |
| Host (DEV/UAT) | `https://helpdesksupport365.com` |
| API base | `https://helpdesksupport365.com/api/v1` |
| Login URL pattern | `https://helpdesksupport365.com/bbp/partner-login?token=<TOKEN>` |
| Public API key | **Not yet issued** — we will hand you a `pub_…` key over an encrypted channel |
| Production host + key | Issued separately before go-live |

The project currently has **zero users**. BBP users must be pushed in via
`POST /api/v1/users` before their first login (see §3).

---

## 1. The flow

1. A BBP user clicks **Helpdesk** in your app.
2. Your **backend** calls `POST /api/v1/auth/login-url` with your API key and the
   user's email or mobile.
3. We return a `login_url` containing a token valid for 120 seconds.
4. Your frontend opens that URL (new tab, or an iframe modal).
5. The user lands inside the Helpdesk, already signed in.

```
BBP frontend  ──click──▶  BBP backend  ──POST /api/v1/auth/login-url──▶  Helpdesk API
                                │                                            │
                                ◀────────────  { login_url }  ───────────────┘
                                │
       open login_url in browser ▼
                          Helpdesk signs the user in and shows the portal
```

Mint the URL **at click time**, not at page load — the token lives 120 seconds.

---

## 2. The API — `POST /api/v1/auth/login-url`

Server-to-server only. Called by your backend. The project is resolved from your
API key, so you never send a project ID.

### Request

```http
POST /api/v1/auth/login-url HTTP/1.1
Host: helpdesksupport365.com
X-API-Key: pub_xxxxxxxxxxxxxxxxxxxx
Content-Type: application/json

{
  "email": "asha.verma@example.com",
  "returnPath": "/student/submit-ticket"
}
```

| Field | Required | Notes |
|---|---|---|
| `email` | one of email/mobile | Matched inside the BBP project |
| `mobile` | one of email/mobile | 10-digit or `91`-prefixed; both accepted |
| `returnPath` | no | Where the user lands. Must be one of the allowed paths below. Defaults to `/portal/service-requests?tab=new` |

Allowed `returnPath` values:

```
/portal/service-requests?tab=new  → raise an Internal Service Request (default)
/portal/service-requests          → their ISR queue: raised by them + assigned to them
/portal/dashboard                 → project portal home
/student/dashboard          → requester portal landing page
/student/submit-ticket      → requester portal, raise a ticket
/student/my-tickets         → requester portal, tickets they raised
/student/faq                → FAQ
```

BBP users are internal staff, so the first two are the ones you want. Omit
`returnPath` and you get `/portal/service-requests?tab=new`. The requester-portal paths
remain for any non-staff population you push later.

Anything else returns `INVALID_RETURN_PATH`. This is deliberate — an
unrestricted redirect target would let a leaked key bounce a signed-in user to
an attacker's page.

### Response — 200

```json
{
  "status": "success",
  "data": {
    "login_url": "https://helpdesksupport365.com/bbp/partner-login?token=8vQ2v3n0Xk...",
    "token": "8vQ2v3n0Xk...",
    "expires_in": 120,
    "user": {
      "id": "665f...",
      "name": "Asha Verma",
      "email": "asha.verma@example.com",
      "mobile": "9876543210"
    }
  }
}
```

Open `login_url` as-is. You do not need to build it yourself.

### Errors

| Status | `code` | What to do |
|---|---|---|
| 400 | `BAD_REQUEST` | Send an email or a mobile |
| 400 | `INVALID_RETURN_PATH` | Use one of the four paths above |
| 401 | `INVALID_API_KEY` | Key missing, wrong, or revoked |
| 404 | `USER_NOT_FOUND` | Push the user via `POST /api/v1/users`, then retry once |
| 403 | `USER_INACTIVE` | User is deactivated in the Helpdesk — contact us |
| 429 | `RATE_LIMIT_EXCEEDED` | 60 requests/minute per API key |

---

## 3. Creating users — `POST /api/v1/users`

Call it when a BBP user is created, so they exist in the Helpdesk before their
first handoff. If you skip it, the first `login-url` call returns
`USER_NOT_FOUND` — push the user, then retry once.

```http
POST /api/v1/users
X-API-Key: pub_xxxxxxxxxxxxxxxxxxxx
Content-Type: application/json

{
  "email": "asha.verma@example.com",
  "mobile": "9876543210",
  "firstName": "Asha",
  "lastName": "Verma",
  "employeeCode": "BBP-1042",
  "department": "Academics",
  "designation": "Coordinator"
}
```

`employeeCode`, `department` and `designation` are optional but **send them for
staff**. The Helpdesk decides the user's role from them, using mapping rules we
configure on our side — so a change of who-gets-what is a configuration change
here, not a release on either side. The response carries `role_source`:

| `role_source` | Meaning |
|---|---|
| `mapping_rule` | Matched one of our configured rules — the normal case |
| `project_default` | No rule matched; got the project's default role |
| `fallback_student` | Neither — the user became a requester. **Tell us**: a rule or default is missing |

You never send a role. A role in the request body would let anyone holding the
API key grant themselves anything.

---

## 4. The URL — `https://helpdesksupport365.com/bbp/partner-login?token=…`

This is the `login_url` we return. Open it in a new tab or an iframe modal.

The page trades the token for a real session, wipes the token out of the address
bar, and forwards the user to `returnPath`. Nothing for you to implement.

**A `login_url` works exactly once.** The token is a random one-time ticket, not
a JWT — the first redeem consumes it, and every later attempt is rejected even
inside the 120 seconds. Mint a fresh one per click. If your app opens the URL
twice (a prefetch, a retry, a double click, a link scanner in an email client),
the second open lands on an error page.

---

## 5. Security requirements

These are not optional.

1. **The API key must live on your server only.** If `pub_…` appears in your
   frontend bundle, in a mobile app binary, or in a browser network call, anyone
   who finds it can log in as any user in the BBP project. This is the single
   highest-impact failure mode in this design.
2. **Call `/api/v1/auth/login-url` from your backend**, using the BBP session you
   have already authenticated. Never let the browser choose which user to mint a
   login for.
3. **Mint at click time.** The token expires in 120 seconds. Pre-minting it on
   page load means it is dead before the user clicks.
4. **One URL, one use.** Enforced on our side — the ticket is consumed atomically
   at first redeem. Still: do not cache, log, or share a `login_url`.
5. **Do not prefetch the `login_url`.** Anything that fetches the link before the
   user does (link preview, security scanner, browser prefetch) burns the ticket.

The session itself never travels in a URL — only the 120-second handoff token
does, and the Helpdesk strips it from the address bar on arrival.

---

## 6. Quick test

```bash
curl -X POST https://helpdesksupport365.com/api/v1/auth/login-url \
  -H "X-API-Key: pub_xxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"email":"asha.verma@example.com","returnPath":"/portal/service-requests?tab=new"}'
```

Paste the returned `login_url` into a browser within 2 minutes. You should land
in the Service Request hub, signed in, on the New Request tab.

---

## 7. What the user can do once inside

BBP users are internal staff, so they land in the **Service Request hub** and are
both requester and resolver:

- **New Request** — raise an Internal Service Request (ISR)
- **All Requests** — ISRs they raised and ISRs assigned to them
- Open any request, reply, attach files (up to 100 MB), move it through its status
- Browse FAQ / Knowledge Base

Which tabs appear is driven purely by the permissions on that user's role. A user
who only raises never sees an assignment queue — nothing to configure on your side.

Session lasts 8 hours. After that, the user clicks Helpdesk in BBP again — there
is no re-login prompt.

---

## 8. Open items

- **Public API key** — we issue it for the BBP project and deliver it once, via
  password manager or encrypted channel.
- **Iframe embedding.** Works today in a new tab. To render inside a BBP modal we
  must allow your origin in our `frame-ancestors` CSP — send us the exact
  origin(s) and we will pin them. Note that browsers give an embedded page its
  own isolated storage, so the user re-handoffs each time the modal opens; that
  is fine, the handoff is cheap.
- **"Assigned to Me"** (BBP users who also resolve tickets) is a permissions
  question, not a code change — tell us which BBP users should resolve and we
  will configure the role.
- **Production host and key** — issued separately before go-live.

---

## Reference — implementation on the Helpdesk side

| Piece | File |
|---|---|
| Mint + redeem logic | `backend/src/controllers/bbpHandoffController.ts` |
| `POST /api/v1/auth/login-url` | `backend/src/routes/publicApi.ts` |
| `POST /api/auth/handoff/redeem` | `backend/src/routes/auth.ts` |
| Handoff page | `frontend/src/pages/PartnerLogin.tsx` |
| Route registration | `frontend/src/App.tsx` |
