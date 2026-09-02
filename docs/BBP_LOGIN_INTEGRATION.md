# BBP → Helpdesk Login Integration

**For:** BBP engineering team
**From:** Helpdesk engineering, Eduspark International
**Environment:** DEV / UAT — `https://helpdesksupport365.com`
**Version:** 1.0 · 2026-08-26

BBP users are **internal staff**. This integration lets a user who is already
signed in to BBP open the Helpdesk with one click — no second password, no OTP —
and land in the **Service Request hub**, where they raise Internal Service
Requests (ISRs) and work the ones assigned to them.

There is **one API to call** and **one URL to open**. Everything else is
configuration on our side.

---

## 1. What you need from us

| Item | Value |
|---|---|
| Project name / code | `BBP` |
| Project ID | `6a8c239ef69b9fe7107e8367` |
| URL path | `bbp` |
| Host (DEV / UAT) | `https://helpdesksupport365.com` |
| API base | `https://helpdesksupport365.com/api/v1` |
| Public API key | **Issued separately** — a `pub_…` key delivered once over an encrypted channel |
| Production host + key | Issued before go-live |

Do not hard-code the host. Keep it in configuration — the production host is a
different value.

---

## 2. The flow

1. A BBP user clicks **Helpdesk** in your app.
2. Your **backend** calls `POST /api/v1/auth/login-url` with your API key and the
   user's email or mobile.
3. We return a `login_url` containing a one-time token, valid **120 seconds**.
4. Your frontend opens that URL — new tab, or an iframe modal.
5. The user lands inside the Helpdesk, signed in, for **8 hours**.

```
BBP frontend ──click──▶ BBP backend ──POST /api/v1/auth/login-url──▶ Helpdesk API
                             │            (X-API-Key, server-to-server)      │
                             ◀───────────────  { login_url }  ───────────────┘
                             │
    open login_url in browser ▼
                    Helpdesk exchanges the token for a session and
                    lands the user in the Service Request hub
```

Two rules that cause most integration bugs:

- **Mint at click time**, not at page load. The token lives 120 seconds.
- **One URL, one use.** The first open consumes it; a second open fails.

---

## 3. Push your users first — `POST /api/v1/users`

Call this when a BBP user is created or their details change, so they exist in
the Helpdesk before their first handoff. It is an upsert keyed on email —
calling it repeatedly is safe.

### Request

```http
POST /api/v1/users HTTP/1.1
Host: helpdesksupport365.com
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

| Field | Required | Notes |
|---|---|---|
| `email` | yes | Unique key for the user |
| `mobile` | no | 10-digit or `91`-prefixed |
| `firstName`, `lastName` | no | Display name |
| `employeeCode` | no | Your HRMS code |
| `department` | no | Drives role assignment — **send it for staff** |
| `designation` | no | Drives role assignment — **send it for staff** |

### Response — 201

```json
{
  "status": "success",
  "project_id": "6a8c239ef69b9fe7107e8367",
  "role_source": "mapping_rule",
  "user": {
    "user_id": "6a8e87c7a24b7bc223a13948",
    "email": "asha.verma@example.com",
    "first_name": "Asha",
    "last_name": "Verma",
    "mobile": "9876543210",
    "employee_code": "BBP-1042",
    "department": "Academics",
    "designation": "Coordinator"
  }
}
```

### How the user's role is decided

You never send a role. We resolve it from the HRMS attributes you send, using
mapping rules configured on our side — so changing who-gets-what is a
configuration change here, with no release on either side.

| `role_source` | Meaning | Action |
|---|---|---|
| `mapping_rule` | Matched a configured rule | Normal case |
| `project_default` | No rule matched; got the project default role | Fine, but tell us if unexpected |
| `fallback_student` | No rule and no default — the user became a plain requester, **not staff** | **Tell us.** A mapping rule is missing |

Send `department` and `designation` on every staff push. Without them we cannot
match a rule, and the user ends up with the wrong access.

A role in the request body would let anyone holding the API key grant themselves
anything — which is why the field does not exist.

### Errors

| Status | `code` | Meaning |
|---|---|---|
| 422 | `VALIDATION_ERROR` | `email` missing, or `mobile` is not a valid number. The `errors` array names the field |
| 400 | `BAD_REQUEST` | `X-API-Key` header missing |
| 401 | `INVALID_API_KEY` | API key invalid or revoked |

---

## 4. Mint the login URL — `POST /api/v1/auth/login-url`

**Server-to-server only.** Call it from your backend, for the user whose BBP
session you have already authenticated. The project is resolved from your API
key, so you never send a project ID.

### Request

```http
POST /api/v1/auth/login-url HTTP/1.1
Host: helpdesksupport365.com
X-API-Key: pub_xxxxxxxxxxxxxxxxxxxx
Content-Type: application/json

{
  "email": "asha.verma@example.com",
  "returnPath": "/portal/service-requests?tab=new"
}
```

| Field | Required | Notes |
|---|---|---|
| `email` | one of email/mobile | Matched inside the BBP project |
| `mobile` | one of email/mobile | 10-digit or `91`-prefixed; both accepted |
| `returnPath` | no | Where the user lands. Must be one of the values below. Defaults to `/portal/service-requests?tab=new` |

### Allowed `returnPath` values

| Value | Lands on |
|---|---|
| `/portal/service-requests?tab=new` | **Raise an ISR** — the default, and the one you want behind a "Raise a Request" button |
| `/portal/service-requests` | Their ISR queue — raised by them and assigned to them |
| `/portal/dashboard` | Project portal home |
| `/student/dashboard` | Requester portal home (non-staff populations) |
| `/student/submit-ticket` | Requester portal, raise a ticket |
| `/student/my-tickets` | Requester portal, tickets they raised |
| `/student/faq` | FAQ |

Anything else returns `INVALID_RETURN_PATH`. This is deliberate: an unrestricted
redirect target would let a leaked key bounce a signed-in user to an attacker's
page.

### Response — 200

```json
{
  "status": "success",
  "data": {
    "login_url": "https://helpdesksupport365.com/bbp/partner-login?token=8vQ2v3n0Xk...",
    "token": "8vQ2v3n0Xk...",
    "expires_in": 120,
    "user": {
      "id": "6a8e87c7a24b7bc223a13948",
      "name": "Asha Verma",
      "email": "asha.verma@example.com",
      "mobile": "9876543210"
    }
  }
}
```

Open `login_url` exactly as returned. Do not build, rewrite, or append to it.

### Errors

| Status | `code` | What to do |
|---|---|---|
| 400 | `BAD_REQUEST` | Send an `email` or a `mobile` |
| 400 | `BAD_REQUEST` | `X-API-Key` header missing |
| 400 | `INVALID_RETURN_PATH` | Use one of the values in the table above |
| 401 | `INVALID_API_KEY` | Key wrong or revoked — contact us |
| 403 | `USER_INACTIVE` | User is deactivated in the Helpdesk — contact us |
| 404 | `USER_NOT_FOUND` | Push the user via `POST /api/v1/users`, then retry **once** |
| 429 | `RATE_LIMIT_EXCEEDED` | Per-key limit is 60 requests/minute — back off and retry |

---

## 5. Open the URL

```
https://helpdesksupport365.com/bbp/partner-login?token=<one-time token>
```

Nothing for you to implement. That page exchanges the token for a session over
HTTPS, wipes the token out of the address bar, and forwards the user to the
`returnPath`.

**The token is a one-time ticket, not a JWT.** The first open consumes it; every
later attempt is rejected, even inside the 120 seconds. So:

- Mint a fresh URL per click.
- Do not cache, log, email, or share a `login_url`.
- Do not let anything **prefetch** it — a link preview, security scanner, or
  browser prefetch will burn the ticket and the user will see an error page.

If a user sees "This login link is invalid or has expired", the fix is always the
same: send them back through the button, which mints a new URL.

---

## 6. Security requirements

These are not optional.

1. **The API key lives on your server only.** If `pub_…` reaches a frontend
   bundle, a mobile binary, or a browser network call, anyone who finds it can
   sign in as any user in the BBP project. This is the highest-impact failure
   mode in this design.
2. **Call `/auth/login-url` from your backend**, for the user whose BBP session
   you already authenticated. Never let the browser choose which user to mint a
   login for.
3. **Mint at click time.** A URL minted on page load is dead before the click.
4. **One URL, one use.** Enforced on our side — the ticket is consumed atomically
   at first redeem, and a replay is logged as a security event.
5. **Store the key in a secret manager**, not in source control or a config file
   in your repo. Tell us immediately if it is ever exposed and we will rotate it.

The session itself never travels in a URL — only the 120-second one-time ticket
does, and we strip it from the address bar on arrival.

---

## 7. What your users get inside

BBP users are staff, so they land in the **Service Request hub** and are both
requester and resolver:

- **New Request** — raise an Internal Service Request
- **All Requests** — ISRs they raised and ISRs assigned to them
- Open any request, reply, attach files up to 100 MB, move it through its status
- FAQ and Knowledge Base

Which tabs a user sees comes entirely from the permissions on their role. Someone
who only raises requests never sees an assignment queue. Nothing for you to
configure — tell us which departments resolve which requests and we set up the
mapping.

The session lasts **8 hours**. After that the user clicks Helpdesk in BBP again;
there is no re-login prompt.

---

## 8. Quick test

```bash
# 1. Push a user
curl -X POST https://helpdesksupport365.com/api/v1/users \
  -H "X-API-Key: pub_xxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"email":"asha.verma@example.com","mobile":"9876543210","firstName":"Asha","lastName":"Verma","department":"Academics","designation":"Coordinator"}'

# 2. Mint a login URL
curl -X POST https://helpdesksupport365.com/api/v1/auth/login-url \
  -H "X-API-Key: pub_xxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"email":"asha.verma@example.com","returnPath":"/portal/service-requests?tab=new"}'
```

Paste the returned `login_url` into a browser within two minutes. Expected: a
brief "Signing you in…", then the Service Request hub on the New Request tab,
signed in as that user, with no token in the address bar.

Worth confirming while you are there: open the same URL a second time — it must
fail. That is the single-use protection working.

---

## 9. Your integration checklist

- [ ] Store the `pub_…` key server-side, in a secret manager
- [ ] Call `POST /api/v1/users` when a BBP user is created or updated, sending
      `employeeCode`, `department`, `designation`
- [ ] Alert on any `role_source: "fallback_student"` in the response and tell us
- [ ] Add a **Helpdesk** button that calls your backend, which mints the URL at
      click time and returns it
- [ ] Open the returned `login_url` as-is, in a new tab (or an iframe — see §10)
- [ ] Handle `USER_NOT_FOUND` by pushing the user, then retrying once
- [ ] Handle `429` with a backoff
- [ ] Never log a `login_url` or the API key

---

## 10. Open items

- **Public API key** — we issue it for the BBP project and deliver it once, via
  password manager or encrypted channel.
- **Iframe embedding.** A new tab works today. To render inside a BBP modal we
  must allow your origin in our `frame-ancestors` policy — send us the exact
  origin(s) and we will pin them. Note that browsers give an embedded page its
  own isolated storage, so the user re-handoffs each time the modal opens. That
  is fine; the handoff is cheap.
- **Which departments resolve requests.** Send us your department and designation
  list and who should receive ISRs, and we configure the mapping rules.
- **Logout semantics.** Today, logging out of BBP does not end the Helpdesk
  session; it expires on its own after 8 hours. Tell us if you need a
  back-channel logout and we will scope it.
- **Production host and key** — issued separately before go-live.

---

## 11. Contact

Questions, a failing call, or a suspected key exposure — reach the Helpdesk
engineering team. For any error, send us the timestamp, the endpoint, the
response `code`, and the user's email. Never send us the API key or a
`login_url`.
