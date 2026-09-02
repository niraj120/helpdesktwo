# Parent Self-Service — App Integration Handover

**Meeting agenda + value exchange between Helpdesk (us) and the App team (you).**

Scope: the parent, already logged into your app, taps *"Raise a Query"* → your app
opens a **modal WebView** containing our hosted page. Parent raises a Service
Request, sees their past requests, and replies to them. No helpdesk login.

You build **no UI and call no data APIs from the app**. You do exactly two things:
1. **Backend:** mint a short-lived session token for the logged-in parent.
2. **App:** open our URL in a modal WebView with that token.

---

## 0. The flow in one picture

```
Parent logs into YOUR app (your existing SSO)
        │
        ▼
YOUR BACKEND ──(server-to-server, header: X-API-Key: pub_…)──►
        POST https://helpdesksupport365.com/api/v1/service-requests/session
        body: { "parent_mobile": "9876543210" }
        ◄── { "token": "eyJ…", "portal_url": "/portal/service-requests?token=eyJ…", "expires_in": "20m" }
        │
        ▼
YOUR APP opens modal WebView →
        https://helpdesksupport365.com/portal/service-requests?token=eyJ…
```

Two rules that make this safe:
- The `pub_` key is a **server secret**. It never goes into the app bundle, the
  WebView URL, or any log.
- The session token is **20 minutes** and **locked to one parent's mobile**. It
  can only read/raise/reply to that parent's own requests.

---

## SECTION A — What WE give YOU

Hand these over in the meeting. Values marked **[TO ISSUE]** are generated after
you confirm the environment.

| # | Item | Value (DEV) |
|---|---|---|
| A1 | Host | `https://helpdesksupport365.com` |
| A2 | API base path | `https://helpdesksupport365.com/api/v1` |
| A3 | Session-mint endpoint | `POST https://helpdesksupport365.com/api/v1/service-requests/session` |
| A4 | WebView page URL | `https://helpdesksupport365.com/portal/service-requests?token=<TOKEN>` |
| A5 | Public API key (`pub_…`) | **[TO ISSUE]** — one per project, shown once at creation |
| A6 | Project ID (optional header) | **[TO ISSUE]** — Mongo ObjectId of the project |
| A7 | Test mobile numbers | **[TO ISSUE]** — 2–3 numbers that exist in the Parent-Student master |
| A8 | Token TTL | 20 minutes, non-refreshable — re-mint per open |
| A9 | Rate limits | `/session` 60 req/min · create SR 30 req/min · reads 60 req/min — **per API key** |
| A10 | Production host | **[TBD]** — to be confirmed before go-live |

### A5 — how the key is issued
Created in the helpdesk by a `SYSTEM_ADMIN` via
`POST /api/admin/public-api-keys`. The plaintext `pub_…` value is returned
**once** and never retrievable again — only a bcrypt hash is stored. If you lose
it we rotate, we cannot recover it. Delivery: share over a password manager or
encrypted channel, **not** email/WhatsApp/Jira ticket.

### Session-mint contract

Request:
```http
POST /api/v1/service-requests/session HTTP/1.1
Host: helpdesksupport365.com
X-API-Key: pub_xxxxxxxxxxxxxxxx
Content-Type: application/json

{ "parent_mobile": "9876543210" }
```

Success `200`:
```json
{
  "status": "success",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…",
  "portal_url": "/portal/service-requests?token=eyJ…",
  "expires_in": "20m"
}
```

Error codes you must handle:

| HTTP | `code` | Meaning | Your action |
|---|---|---|---|
| 400 | `BAD_REQUEST` | `X-API-Key` header missing | fix config |
| 400 | `MISSING_IDENTITY` | `parent_mobile` empty | don't open the modal |
| 401 | `INVALID_API_KEY` | key wrong or revoked | alert, don't retry in a loop |
| 403 | `PROJECT_MISMATCH` | `X-Project-ID` ≠ key's project | drop the header or fix it |
| 429 | `RATE_LIMIT_EXCEEDED` | >60/min on that key | back off |
| 500 | `INTERNAL` | our side | retry once, then show a friendly error |

Node example:
```js
const r = await fetch(`${HELPDESK_HOST}/api/v1/service-requests/session`, {
  method: "POST",
  headers: {
    "X-API-Key": process.env.HELPDESK_PUB_KEY,   // server secret
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ parent_mobile: parent.mobile }),
});
const { token } = await r.json();
return { token };   // hand only the token to the app
```

### Opening the WebView

```js
const url = `https://helpdesksupport365.com/portal/service-requests?token=${encodeURIComponent(token)}`;
openModalWebView(url);
```

WebView requirements:
- JavaScript **enabled**
- DOM storage **enabled**
- Mobile-first layout — recommended modal ≈ **420 × 720 dp**; the page scrolls internally
- No cookies required; auth rides in the URL token
- Android: `WebSettings.setJavaScriptEnabled(true)`, `setDomStorageEnabled(true)`
- iOS: `WKWebView` (not the deprecated `UIWebView`)

### What the page does internally (FYI — you do not build this)

All calls carry `Authorization: Bearer <token>`; the parent's mobile and project
are derived from the token, never sent by the client.

| Purpose | Endpoint |
|---|---|
| Load form fields + category tree | `GET /v1/service-requests/form-schema` |
| List the parent's children | `GET /v1/service-requests/students` |
| Raise a request | `POST /v1/service-requests` |
| The parent's own requests | `GET /v1/service-requests/mine` |
| One request + conversation | `GET /v1/service-requests/{ticketNumber}` |
| Post a reply | `POST /v1/service-requests/{ticketNumber}/reply` |

Form fields, categories and which fields auto-fill from master data are all
configured by us in *SR Settings → Self-Service Form* — **changing the form needs
no app release**.

---

## SECTION B — What WE need from YOU

Fill this in during the meeting. Nothing gets issued until B1–B5 are answered.

| # | We need | Why | Your answer |
|---|---|---|---|
| B1 | **Platform(s)** — Android / iOS / web portal / all | web iframe needs an extra CSP change on our side; native WebView does not | |
| B2 | **Parent identifier** — is it the 10-digit mobile? | must match the Parent-Student master; if you key on an MDM parent id instead, we map it | |
| B3 | **Mobile format you will send** — `9876543210` / `919876543210` / `+919876543210` | we normalise to last 10 digits, but confirm so lookups don't silently miss | |
| B4 | **Your backend egress IP(s)** | so we can allowlist the `pub_` key to your servers | |
| B5 | **Technical + escalation contact** (name, email, phone) | key delivery and incident routing | |
| B6 | **Web origin(s)** you will iframe from, e.g. `https://parents.yourschool.com` | *web only* — we must add it to `frame-ancestors`, see C1 | |
| B7 | **Modal size / placement** in the app | so we sanity-check the layout at that width | |
| B8 | **Expected volume** — parents, peak concurrent opens/min | to size rate limits above the defaults | |
| B9 | **Entry points** in the app — where the button lives | affects whether we need deep-link-to-a-specific-view | |
| B10 | **Do you need push/in-app notification** when the helpdesk replies? | today the parent must reopen the modal to see replies — see C3 | |
| B11 | **App name + version** for the WebView user-agent | so we can identify traffic in logs | |
| B12 | **Target date** for dev integration and for production | drives when we issue the prod key | |
| B13 | **WebView file-picker enabled?** (Android `onShowFileChooser`, iOS `Info.plist` usage strings) | parents attach documents — without this the attach button does nothing, see C2 | |

---

## SECTION C — Open items to decide in the meeting

### C1 · Web iframe is currently blocked (only if B1 includes web)
Our headers today are `Content-Security-Policy: frame-ancestors 'self'`
([server.ts:286](../backend/src/server.ts#L286)) and
`X-Frame-Options: SAMEORIGIN` ([nginx.conf:151](../nginx.conf#L151)). A
cross-origin `<iframe>` will render blank / "refused to connect".
**Fix on our side:** add their origin to `frame-ancestors` and drop
`X-Frame-Options` for the `/portal/*` path. Needs B6 first.
**Native app WebView is not affected** — no change needed.

### C2 · Attachments — IN SCOPE, built by us
**Decided: the parent can attach a document.** The form inside the modal is ours,
so the file picker, upload and validation are all on our side — **the app team
builds nothing and changes nothing** for this. Files land in the same cloud
storage as normal ticket attachments and appear to the agent in the helpdesk.

Proposed limits (matching our existing public form endpoint — confirm if you
need different):

| Setting | Value |
|---|---|
| Max file size | 10 MB per file |
| Max files per request | 3 |
| Allowed types | JPEG, PNG, GIF, PDF, MP4, MOV |
| Required? | Optional — never blocks submission |

Only thing the app team must confirm: **the WebView allows file picking**, or the
button silently does nothing.
- **Android:** implement `WebChromeClient.onShowFileChooser()` — without it the
  file input is dead. Add `READ_MEDIA_IMAGES` (API 33+) / camera permission if
  you want capture-from-camera.
- **iOS:** `WKWebView` handles this natively; add `NSCameraUsageDescription` and
  `NSPhotoLibraryUsageDescription` to `Info.plist` if the parent may shoot a photo.
- **Web iframe:** add `allow="camera"` to the `<iframe>` if capture is wanted.

### C3 · Reply notifications
The parent sees agent replies only when they reopen the modal. Options:
- (a) nothing — parent checks manually
- (b) we already send SMS/WhatsApp on reply (confirm per project)
- (c) we call **your** push webhook on reply — needs an endpoint + auth from you

### C4 · Token expiry mid-session
20 minutes, no refresh. If a parent leaves the modal open and comes back, calls
return `401 INVALID_SESSION`. Agree the UX: your app should close the WebView and
re-mint on next open. Consider listening for that state.

### C5 · Unknown parent
If the mobile is not in the Parent-Student master, the page loads but no students
are listed. Decide: block the button in your app, or let them raise a request
with no student attached?

### C6 · Environments
DEV is `helpdesksupport365.com`. Confirm whether you get a **separate prod key +
prod host**, or DEV doubles as UAT. Keys are per-project and per-environment —
never share one across both.

---

## SECTION D — Test plan (do this before go-live)

Run in order. We watch our logs while you run 1–4.

1. **Key works** — from your backend:
   ```bash
   curl -i -X POST https://helpdesksupport365.com/api/v1/service-requests/session \
     -H "X-API-Key: pub_xxxxxxxx" \
     -H "Content-Type: application/json" \
     -d '{"parent_mobile":"<test mobile from A7>"}'
   ```
   Expect `200` + a `token`.

2. **Page loads** — paste the returned `portal_url` (prefixed with the host) into
   a mobile browser. The form renders, the child list populates.

3. **In-app** — open the same URL in your modal WebView. Confirm layout, keyboard
   behaviour, back-button dismiss.

4. **Raise a request** — submit. We confirm the SR appears in the helpdesk with
   the right project, category, parent and student.

4b. **Attach a document** — raise a second request with a photo and a PDF
   attached. Confirm the file picker opens inside the WebView (this is the
   Android `onShowFileChooser` check from B13), the upload completes, and the
   agent can open the file from the helpdesk. Also try an oversized file and a
   blocked type — the form must reject them cleanly, not hang.

5. **Reply loop** — our agent replies; parent reopens the modal and sees it, then
   replies back.

6. **Negative cases** — expired token (wait 20 min) → `401`; unknown mobile → empty
   student list; airplane mode → your app's own error state.

---

## SECTION E — Security checklist (both sides sign off)

- [ ] `pub_` key lives **only** in your backend secret store — not in the app
      bundle, not in the WebView URL, not in logs or crash reports.
- [ ] Session token minted **per parent, per open**, server-side.
- [ ] Token never cached, reused across parents, or written to persistent storage.
- [ ] `/session` reachable only from your authenticated parent flow — never
      exposed as a public endpoint of your app's API.
- [ ] Everything over HTTPS; no certificate pinning bypass for our host.
- [ ] Your backend egress IPs shared (B4) and allowlisted by us.
- [ ] Agreed key-rotation contact + procedure if the key leaks.

---

## Appendix — one-line summary for the meeting invite

> We host the parent query form; your app opens it in a modal WebView using a
> 20-minute token your backend mints with a secret API key. You need to give us:
> platform, parent identifier format, backend IPs, and a contact — and to enable
> the WebView file picker so parents can attach documents. We give you: the host
> URL, the API key, and test mobiles.
