# Parent Self-Service SR API — App Integration

How the mobile app lets a parent (already signed in via SSO on the app side)
**raise a PSR themselves** and **see their existing requests**. This is a
separate flow from the PSL/staff form (which staff use when a parent visits
offline).

## Auth

- All calls use header **`X-API-Key: pub_…`**. Create/rotate the key in the
  helpdesk under **Integrations → Public API Keys** (one key per project; the
  project is resolved from the key — no project id needed).
- The parent's identity comes from the **app's SSO session**. The app passes the
  parent's **mobile** (and optionally an MDM `student_id`). The key authenticates
  the app as a trusted caller; the parent identity is trusted from the app.
- Base URL: `https://<helpdesk-host>/api/v1`

## 1. Get the form to render — `GET /service-requests/form-schema`

Returns the admin-built **self-service** form for the project.

```
curl 'https://<host>/api/v1/service-requests/form-schema' \
  -H 'X-API-Key: pub_xxxxxxxx'
```

Response (shape):

```json
{
  "status": "success",
  "form": { "id": "...", "name": "Parent Self-Service", "version": 2 },
  "identity_fields": [
    { "key": "parent_mobile", "required": true },
    { "key": "student_id", "required": false }
  ],
  "category_field": { "key": "sub_category_id", "required": true },
  "core_fields": [
    { "key": "subject", "required": true },
    { "key": "description", "required": false }
  ],
  "form_fields": [
    { "key": "grade", "type": "select", "source": "mdm", "auto": true },
    { "key": "concern_type", "type": "select", "options": ["Academic", "Transport"] }
  ]
}
```

- Fields with `"auto": true` are **resolved server-side** from the parent login
  + selected student — the app does **not** collect them. Each carries an
  `auto_role`:
  - `parent` — the logged-in parent (auto-identified from `parent_mobile`).
  - `student_attr` — auto-filled from the selected student (e.g. grade, school,
    location), read-only.
- `student_field` (when present) → the app shows a **child picker** whose
  options are the logged-in parent's children (resolved from MDM); the chosen id
  is sent as `student_id`. Selecting the student is what triggers the
  `student_attr` auto-fills.
- The app renders `sub_category_id`, the student picker, `subject`,
  `description`, and any non-auto `form_fields`. Grade / school / location are
  auto — the parent only picks the child, category and types subject/description.
- On create, grade/school/location are stored on the SR
  (`metadata.studentGrade` / `studentSchool` / `studentLocation`) for routing +
  escalation.

## 1b. Get the parent's children — `GET /service-requests/students`

The app already knows the logged-in parent (SSO). Pass their **mobile**; we do
the same MDM lookup existing-parent search uses and return the children so the
webview can **auto-populate the student dropdown** (no manual search).

```
curl 'https://<host>/api/v1/service-requests/students?parent_mobile=9990001111' \
  -H 'X-API-Key: pub_xxxxxxxx'
```

```json
{
  "status": "success",
  "parent": { "name": "Asha Rao", "mobile": "9990001111" },
  "students": [
    { "id": "STU12345", "name": "R.  Rao", "grade": "Grade 5", "school": "North Campus" }
  ]
}
```

Parent picks a student → send its `id` as `student_id` in the create call;
grade/school/etc. are then auto-filled server-side.

## 2. Raise a request — `POST /service-requests`

```
curl -X POST 'https://<host>/api/v1/service-requests' \
  -H 'X-API-Key: pub_xxxxxxxx' \
  -H 'Content-Type: application/json' \
  -d '{
    "parent_mobile": "9990001111",
    "student_id": "STU12345",
    "sub_category_id": "665f0c…",
    "subject": "Bus not arriving on time",
    "description": "The morning bus has been late all week.",
    "form_data": { "concern_type": "Transport" }
  }'
```

Response:

```json
{
  "status": "success",
  "ticket_id": "…",
  "ticket_number": "PSR-2026-0042",
  "auto_closed": false,
  "duplicate_warning": null
}
```

Server does: MDM parent/child lookup (auto-fills grade/school), routing +
assignment, SLA/TAT, duplicate detection, auto-close rules, notifications —
all per the project's SR configuration.

## 3. List the parent's requests — `GET /service-requests/mine`

```
curl 'https://<host>/api/v1/service-requests/mine?parent_mobile=9990001111&page=1&limit=20' \
  -H 'X-API-Key: pub_xxxxxxxx'
```

```json
{
  "status": "success",
  "total": 3,
  "requests": [
    {
      "ticket_number": "PSR-2026-0042",
      "subject": "Bus not arriving on time",
      "status": 2,
      "status_label": "Work In Progress",
      "created_at": "2026-07-12T09:20:00.000Z"
    }
  ]
}
```

The app shows this list under the parent's "My Requests"; tapping a row can open
the detail in a modal/web view.

## Configuring the form (helpdesk admin)

**SR Settings → Configure → Student Portal → "Student / Parent Self-Service
Form"**. Toggle it On and add fields (Category Master for `sub_category_id`,
plus text/dropdown/etc.). Mark any MDM-backed field as its data source so it is
auto-resolved from the parent identity. Below the form, the **App integration**
panel shows the live endpoints, request body and cURL to hand to the app team.
Its fields are stored under `configuration.sr.customChannelFields.student_portal`
and served by `GET /v1/service-requests/form-schema`.

## Rate limits

`form-schema` 60/min · `POST` 30/min · `mine` 60/min — per API key.
