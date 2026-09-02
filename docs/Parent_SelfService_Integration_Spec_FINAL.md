# Parent Self-Service — Integration Specification

**For: App Development Team**
**From: Helpdesk Platform Team**
**Environment: DEV / UAT — `https://helpdesksupport365.com`**
**Version 1.0**

---

## 1. What we are building

A parent who is already logged into your app taps **"Raise a Query"** (or similar).
Your app opens a **modal WebView**. Inside it, our hosted page lets the parent:

- raise a Service Request (query/complaint/request) for their child
- attach a photo or document
- see the list of their past requests and current status
- open a request, read the support team's replies, and reply back

The parent **never logs into the helpdesk** and **never sees a second login**.
Their identity comes from your app's existing session.

### Division of work

| | Built by |
|---|---|
| The entire form UI, validation, category list, student picker, attachments, request list, conversation view | **Helpdesk (us)** |
| Minting a session token from your backend | **App team (you)** |
| Opening the modal WebView with that token | **App team (you)** |
| Enabling the WebView file picker | **App team (you)** |

You write roughly **30 lines of code**: one backend call and one WebView launch.
You build **no forms, no lists, no API calls from the app**.

---

## 2. End-to-end flow (technical)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 1 — Parent is already logged into YOUR app (your existing SSO)     │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  │  parent taps "Raise a Query"
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 2 — YOUR APP asks YOUR BACKEND for a helpdesk session token        │
│          (your own authenticated endpoint, your own auth)               │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 3 — YOUR BACKEND → HELPDESK  (server-to-server, never from the app)│
│                                                                         │
│   POST https://helpdesksupport365.com/api/v1/service-requests/session   │
│   X-API-Key: pub_xxxxxxxxxxxx          ← your server secret             │
│   { "parent_mobile": "9876543210" }                                     │
│                                                                         │
│   ← 200 { "token": "eyJ…", "expires_in": "20m" }                        │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  │  backend returns ONLY the token to the app
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 4 — YOUR APP opens the modal WebView                               │
│                                                                         │
│   https://helpdesksupport365.com/portal/service-requests?token=eyJ…     │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 5 — OUR PAGE takes over (nothing further from you)                │
│                                                                         │
│   • reads the token → learns the project + this parent's mobile         │
│   • GET  /v1/service-requests/form-schema   → fields + categories       │
│   • GET  /v1/service-requests/students      → this parent's children    │
│   • parent fills the form, attaches a file, submits                     │
│   • POST /v1/service-requests               → SR created, number shown  │
│   • GET  /v1/service-requests/mine          → past requests             │
│   • GET  /v1/service-requests/{number}      → detail + conversation     │
│   • POST /v1/service-requests/{number}/reply→ parent replies            │
│                                                                         │
│   Every call carries: Authorization: Bearer <token>                     │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 6 — HELPDESK: the request lands in the agent's queue               │
│   auto-categorised · auto-assigned · SLA timer starts · escalation      │
│   matrix applies. Agent replies; parent sees it on next open.           │
└─────────────────────────────────────────────────────────────────────────┘
```

### Why a token and not the API key

The `pub_` API key is a long-lived secret with access to the whole project. It
**must never reach a phone or a browser** — apps get decompiled and URLs get
logged.

The session token is:
- **short-lived** — 20 minutes
- **scoped to one parent** — it carries that parent's mobile, so it physically
  cannot read another parent's requests
- **signed by our server** — tampering is rejected with `401`

If a token leaks, it expires in minutes and exposes only that one parent's own
requests. If the API key leaks, the whole project is exposed. That is the entire
reason for the two-step design.

---

## 3. What the parent actually sees

| Screen | Content |
|---|---|
| **Raise a Request** | Child picker (auto-filled from master data) → sub-category dropdown → subject → description → any custom fields configured by the helpdesk admin → **attach file** → Submit. Confirmation shows the request number. |
| **My Requests** | List of the parent's own requests — number, subject, status label, date. Paginated, newest first. |
| **Request Detail** | Subject, description, current status, and the full conversation — agent replies marked *support*, parent messages marked *you*. Reply box at the bottom. |

Grade, school, location and other master-data fields are **auto-filled** from the
parent/student master — the parent never types them, and they are used for
routing and escalation on our side.

Form fields and categories are **configured by the helpdesk admin at runtime**.
Adding a field, renaming a category, or changing what is mandatory needs
**no app release**.

---

## 4. WHAT WE PROVIDE

| # | Item | Value |
|---|---|---|
| P1 | Host (DEV/UAT) | `https://helpdesksupport365.com` |
| P2 | API base | `https://helpdesksupport365.com/api/v1` |
| P3 | Session endpoint | `POST /api/v1/service-requests/session` |
| P4 | WebView URL | `https://helpdesksupport365.com/portal/service-requests?token=<TOKEN>` |
| P5 | Public API key | `pub_…` — issued per project, **delivered once**, via password manager or encrypted channel |
| P6 | Project ID | Provided with the key (optional `X-Project-ID` header) |
| P7 | Test parent mobiles | 2–3 numbers seeded in the Parent-Student master |
| P8 | The entire form UI + attachments + list + conversation | Hosted by us, mobile-first |
| P9 | Agent workflow behind it | Auto-assignment, SLA, escalation, audit trail |
| P10 | Production host + production key | Issued separately before go-live |
| P11 | Support contact for integration | Shared at kickoff |

### Session endpoint contract

**Request**
```http
POST /api/v1/service-requests/session HTTP/1.1
Host: helpdesksupport365.com
X-API-Key: pub_xxxxxxxxxxxxxxxx
Content-Type: application/json

{ "parent_mobile": "9876543210" }
```

**Response `200`**
```json
{
  "status": "success",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…",
  "portal_url": "/portal/service-requests?token=eyJ…",
  "expires_in": "20m"
}
```

**Errors**

| HTTP | `code` | Cause | Your handling |
|---|---|---|---|
| 400 | `BAD_REQUEST` | `X-API-Key` header missing | config error — fix, don't retry |
| 400 | `MISSING_IDENTITY` | `parent_mobile` empty | don't open the modal |
| 401 | `INVALID_API_KEY` | key wrong, revoked, or rotated | alert ops; do not retry in a loop |
| 403 | `PROJECT_MISMATCH` | `X-Project-ID` doesn't match the key | remove or correct the header |
| 429 | `RATE_LIMIT_EXCEEDED` | over 60 requests/minute on that key | exponential back-off |
| 500 | `INTERNAL` | our side | retry once, then show a friendly message |

### Rate limits (per API key, per minute)

| Endpoint | Limit |
|---|---|
| `POST /service-requests/session` | 60 |
| `POST /service-requests` (create) | 30 |
| `POST /service-requests/{n}/reply` | 30 |
| All read endpoints | 60 |

Tell us your expected peak and we raise these before go-live.

### Attachments — built by us

| Setting | Value |
|---|---|
| Max file size | 10 MB per file |
| Max files per request | 3 |
| Allowed types | JPEG, PNG, GIF, PDF, MP4, MOV |
| Mandatory | No — always optional |
| Storage | Same secured cloud storage as all helpdesk attachments |

The picker, preview, validation and upload are all inside our page. **Your only
dependency is R5 below** — the WebView must be allowed to open a file picker.

---

## 5. WHAT WE NEED FROM YOU

### 5a. Code you must write

**R1 · Backend: a token-mint call**

Call this server-side, immediately before opening the modal. Never from the app.

```js
// YOUR BACKEND — e.g. GET /api/parent/helpdesk-token  (protected by YOUR auth)
async function getHelpdeskToken(parent) {
  const r = await fetch(
    "https://helpdesksupport365.com/api/v1/service-requests/session",
    {
      method: "POST",
      headers: {
        "X-API-Key": process.env.HELPDESK_PUB_KEY,   // server secret only
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ parent_mobile: parent.mobile }),
    },
  );
  if (!r.ok) throw new Error(`helpdesk session failed: ${r.status}`);
  const { token } = await r.json();
  return { token };            // return ONLY the token to the app
}
```

**R2 · App: open the modal WebView**

```js
const { token } = await api.get("/api/parent/helpdesk-token");
const url =
  "https://helpdesksupport365.com/portal/service-requests?token=" +
  encodeURIComponent(token);
openModalWebView(url);
```

Mint a **fresh token every time** the parent opens the widget. Never cache it,
never store it, never reuse it across parents.

**R3 · WebView configuration**

| Setting | Requirement |
|---|---|
| JavaScript | enabled |
| DOM storage | enabled |
| Recommended modal size | ≈ 420 × 720 dp — mobile-first, scrolls internally |
| iOS | `WKWebView` (not the deprecated `UIWebView`) |
| Android | `WebSettings.setJavaScriptEnabled(true)` + `setDomStorageEnabled(true)` |
| Cookies | not required |

**R4 · Handle the closed/expired states**

- Provide a visible close/back control on your modal.
- If the parent leaves the modal open past 20 minutes, our calls return `401`.
  Your app should simply close the WebView and mint a fresh token on next open.

**R5 · Enable the file picker — required for attachments**

A file input inside a WebView does **nothing** unless the host app implements it.
This is the single most commonly missed item in this integration.

| Platform | Required |
|---|---|
| **Android** | Implement `WebChromeClient.onShowFileChooser()`. Without it the attach button is silently dead — no picker, no error. |
| **Android (camera capture)** | Camera permission + `READ_MEDIA_IMAGES` on API 33+ |
| **iOS** | `WKWebView` handles it natively. Add `NSCameraUsageDescription` and `NSPhotoLibraryUsageDescription` to `Info.plist` if the parent may take a photo. |
| **Web iframe** | Add `allow="camera"` to the `<iframe>` if capture is wanted. |

### 5b. Information you must give us

Please return this table before we issue the API key.

| # | We need | Why | Your answer |
|---|---|---|---|
| Q1 | Platforms — Android / iOS / web portal / all | web embedding needs an extra header change on our side | |
| Q2 | Parent identifier — 10-digit mobile? Or an MDM parent id? | must match the Parent-Student master | |
| Q3 | Exact mobile format you will send — `9876543210` / `919876543210` / `+919876543210` | we normalise, but confirm so lookups don't silently miss | |
| Q4 | Your backend egress IP address(es) | so the API key can be locked to your servers | |
| Q5 | Technical contact + escalation contact (name, email, phone) | key delivery, incident routing | |
| Q6 | Web origin(s) you will embed from, e.g. `https://parents.example.com` | **web only** — we must allow framing from it | |
| Q7 | Modal size and placement in the app | so we sanity-check the layout at that width | |
| Q8 | Expected volume — total parents, peak opens per minute | to size rate limits | |
| Q9 | Where the entry point sits in the app | tells us whether deep-linking to a specific view is needed | |
| Q10 | Do you want a notification when support replies? | today the parent sees replies on reopening; push needs an endpoint from you | |
| Q11 | App name + version string in the WebView user-agent | so we can identify your traffic in our logs | |
| Q12 | Target dates — dev integration complete, and production go-live | drives when we issue the production key | |
| Q13 | **Is the WebView file picker enabled (R5)?** | attachments will not work otherwise | |

---

## 6. WHAT WE DO ON OUR SIDE

For transparency — no action needed from you on these.

| # | Item |
|---|---|
| O1 | Issue the project API key and share it securely |
| O2 | Allowlist your backend egress IPs (Q4) against the key |
| O3 | Seed and share test parent mobiles with children in the master data |
| O4 | Configure the self-service form — fields, mandatory flags, category tree |
| O5 | Build the attachment upload into the form (limits per §4) |
| O6 | **Web only:** allow framing from your origin (Q6) — required or the iframe stays blank |
| O7 | Confirm auto-assignment, SLA targets and escalation for parent-raised requests |
| O8 | Raise rate limits to match your projected volume (Q8) |
| O9 | Provide the production host + production key before go-live |
| O10 | Monitor logs during your integration testing and confirm each test case |

---

## 7. Joint test plan

Run in order. We watch our logs live during steps 1–6.

| # | Test | Pass criteria |
|---|---|---|
| 1 | Backend mints a token with the API key | `200` + a `token` value |
| 2 | Paste the URL into a mobile browser | Form renders; child list populates |
| 3 | Open in the app's modal WebView | Layout correct at your modal size; keyboard behaves; back/close dismisses |
| 4 | Raise a request | `201` + request number shown; we confirm it appears in the helpdesk with correct project, category, parent, student |
| 5 | **Attach a photo and a PDF** | File picker opens inside the WebView (this validates R5); upload completes; agent can open both files |
| 6 | Attachment negative cases | Oversized file and blocked file type are rejected cleanly — no hang, clear message |
| 7 | Reply loop | Our agent replies → parent reopens the modal → sees the reply → replies back → we see it in the helpdesk |
| 8 | Expired token | Leave the modal idle 20+ minutes → `401` → your app recovers by re-minting |
| 9 | Unknown parent mobile | Page loads, student list empty, no crash |
| 10 | No network | Your app's own offline state, not a blank WebView |

### Quick verification command

Run this once you have the key — before writing any app code:

```bash
curl -i -X POST https://helpdesksupport365.com/api/v1/service-requests/session \
  -H "X-API-Key: pub_xxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"parent_mobile":"<test mobile we provide>"}'
```

A `200` with a token means your key, network path and payload are all correct.
Everything after that is WebView plumbing.

---

## 8. Security requirements — both sides sign off

- [ ] The `pub_` API key lives **only** in your backend secret store — never in
      the app bundle, the WebView URL, source control, logs, or crash reports.
- [ ] The token is minted **server-side, per parent, per open**.
- [ ] The token is never cached, persisted, or reused across parents.
- [ ] Your token-mint endpoint is reachable **only** from your authenticated
      parent session — never exposed as a public API.
- [ ] All traffic over HTTPS; no certificate-validation bypass for our host.
- [ ] Your backend egress IPs shared and allowlisted (Q4).
- [ ] An agreed key-rotation contact and procedure if a key is suspected leaked.

---

## 9. Reference — endpoints used inside the page

You do **not** call these. Listed so your team can reason about the traffic they
will see from the WebView. All use `Authorization: Bearer <token>`; the parent's
mobile and project are derived from the token and never sent by the client.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/service-requests/form-schema` | form fields, category options, core fields |
| `GET` | `/v1/service-requests/students` | the parent's children from master data |
| `POST` | `/v1/service-requests` | create the request → `201 { ticket_number }` |
| `GET` | `/v1/service-requests/mine` | paginated list of the parent's requests |
| `GET` | `/v1/service-requests/{ticketNumber}` | detail + parent-visible conversation |
| `POST` | `/v1/service-requests/{ticketNumber}/reply` | parent posts a reply |

---

## 10. Summary — the shortest possible version

**You do three things:**
1. Backend: `POST /api/v1/service-requests/session` with the secret key → get a token.
2. App: open `…/portal/service-requests?token=<token>` in a modal WebView.
3. Enable the WebView file picker so attachments work.

**You send us:** platforms, parent identifier format, backend IPs, contacts, volume,
target dates (§5b).

**We send you:** host URL, API key, project id, test mobiles — and we host the entire
form, attachments, request list and conversation experience.

---

*Questions on this document → Helpdesk Platform Team.*
