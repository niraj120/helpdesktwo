# Biometric / Attendance Portal API — Vendor Requirement Specification

**Purpose:** Replicate the existing "AFT" portal integration so the SAC Helpdesk
platform can (a) push employees to the new vendor's biometric system, (b) **update**
existing employee details, and (c) pull attendance records. A new vendor must
implement the three REST endpoints below **exactly** (same paths, payloads,
response shapes) so no code change is needed on the Helpdesk side.

Reference implementation today: `https://www.afterp.in/api/apiv1` (provider "AFT").

---

## 1. Conventions (apply to all endpoints)

| Item | Value |
|---|---|
| Protocol | HTTPS, REST, JSON |
| Method | `POST` (all three endpoints) |
| Base URL | `{baseUrl}/{projectPrefix}` — e.g. `https://vendor.example.com/api/apiv1/vmk` |
| `baseUrl` | Vendor root, e.g. `https://vendor.example.com/api/apiv1` |
| `projectPrefix` | Per-project tenant code, e.g. `vmk` (we configure per project) |
| Auth | `Authorization: Bearer <API_KEY>` (per-project key, issued by vendor) |
| Content-Type | `application/json` |
| Timeout tolerance | Respond within 15s (employee) / 30s (attendance) |
| Rate limit | Platform sends ≤ 50 requests/min (≥1.2s apart). Vendor must accept this rate. |

### Standard response envelope (every endpoint)
```json
{ "status": "success", "message": "optional text", "data": { } }
```
- `status` MUST be the string `"success"` on success; any other value = failure.
- On failure return `{ "status": "failed", "message": "<reason>" }`.
- HTTP 200 for handled responses (success and business failures both 200 with `status`).

---

## 2. Endpoint A — Add Employee

Push a new employee into the biometric system.

```
POST {baseUrl}/{projectPrefix}/add-employee
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

**Request body**
```json
{
  "Name": "Ramesh Kumar",
  "userid": "EMP001",
  "payroll": "PR12345",
  "status": 1
}
```

| Field | Type | Required | Meaning |
|---|---|---|---|
| `Name` | string | yes | Employee full name |
| `userid` | string | yes | Employee code (unique business key per project) |
| `payroll` | string | yes | Payroll number (unique key used by biometric) |
| `status` | integer | yes | `1` = active, `0` = inactive |

**Success response**
```json
{
  "status": "success",
  "data": {
    "EmployeeID": 10231,
    "EmployeeBiometricID": 55012,
    "Name": "Ramesh Kumar",
    "UserID": "EMP001",
    "Payroll_Type": 1
  }
}
```

| Field | Type | Meaning |
|---|---|---|
| `EmployeeID` | integer | Vendor's internal employee id (we store it) |
| `EmployeeBiometricID` | integer | Vendor's biometric/device id (we store it) |
| `Name`, `UserID`, `Payroll_Type` | echo | Confirmation echo |

**Duplicate handling:** if employee already exists (`userid`/`payroll`), return a
failure whose `message` contains the word `already` or `exist` — the platform then
automatically retries via **update-employee**.

---

## 3. Endpoint B — Update Employee  *(required new/parity capability)*

Update details of an already-registered employee (name, payroll, active status).
Matched by `userid` (and/or `payroll`).

```
POST {baseUrl}/{projectPrefix}/update-employee
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

**Request body** — identical schema to add-employee:
```json
{
  "Name": "Ramesh Kumar Singh",
  "userid": "EMP001",
  "payroll": "PR12345",
  "status": 0
}
```
- `userid` = lookup key. Update the matching employee's `Name`, `payroll`, `status`.
- `status: 0` deactivates the employee (e.g. exit / left); `1` re-activates.

**Success response** — same envelope as add. **Please also return the `data`
object** (`EmployeeID`, `EmployeeBiometricID`) on update, not just `status`
(the current AFT update sometimes omits `data`; returning it lets us keep ids in sync).
```json
{
  "status": "success",
  "data": {
    "EmployeeID": 10231,
    "EmployeeBiometricID": 55012,
    "Name": "Ramesh Kumar Singh",
    "UserID": "EMP001",
    "Payroll_Type": 1
  }
}
```

**Not-found handling:** if `userid` does not exist, return failure (any `status` ≠
`"success"`). The platform then falls back to **add-employee** automatically.

> Net behaviour expected: the pair (add + update) must be **idempotent/upsert** —
> calling either for an existing or new employee converges to the correct record.

---

## 4. Endpoint C — Get Attendance

Pull punch records for a date range (used by scheduled sync).

```
POST {baseUrl}/{projectPrefix}/get-attendance
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

**Request body** — dates in `DD-MM-YYYY`:
```json
{ "from_date": "01-06-2026", "to_date": "30-06-2026" }
```

**Success response** — `data` is an array of records:
```json
{
  "status": "success",
  "data": [
    {
      "User ID": "EMP001",
      "Date": "15-06-2026",
      "Punch In": "09:02",
      "Punch Out": "18:11",
      "Total working hours": "09:09",
      "Status": "P",
      "Center": "Patna HQ",
      "Geo Lat/Long": "25.5941,85.1376",
      "published": true
    }
  ]
}
```

| Field (exact key) | Type | Meaning |
|---|---|---|
| `User ID` | string | Employee code (matches `userid`) |
| `Date` | string `DD-MM-YYYY` | Attendance date |
| `Punch In` | string `HH:mm` | First punch (may be empty) |
| `Punch Out` | string `HH:mm` | Last punch (may be empty) |
| `Total working hours` | string `HH:mm` | Worked duration |
| `Status` | string | `P`=present, `A`=absent, etc. |
| `Center` | string | Location/center name |
| `Geo Lat/Long` | string | `"lat,long"` |
| `published` | boolean | `true` when finalized. Platform can be set to ignore unpublished rows. |

- Times are India IST (UTC+05:30).
- Keys must match **exactly** (including spaces/casing) — they are read literally.

---

## 5. Acceptance checklist for the vendor

- [ ] All 3 endpoints live under `{baseUrl}/{projectPrefix}/...`, POST + Bearer auth.
- [ ] Per-project API key issuance.
- [ ] `add-employee` creates + returns `EmployeeID`, `EmployeeBiometricID`.
- [ ] `update-employee` updates Name/payroll/status by `userid` **and returns `data`**.
- [ ] Duplicate-on-add → failure message contains `already`/`exist`.
- [ ] Not-found-on-update → non-success status.
- [ ] `get-attendance` accepts `from_date`/`to_date` (`DD-MM-YYYY`), returns array with exact keys above.
- [ ] Response envelope `{status, message?, data}`, HTTP 200 for business responses.
- [ ] Sustains ≥ 50 req/min.
- [ ] Provide a sandbox base URL + test key for integration testing.

---

## 6. Notes / current platform behaviour (for context)

- Platform stores per employee: `EmployeeID` → `biometricEmployeeId`, `EmployeeBiometricID` → `biometricDeviceId`.
- Sync trigger: `POST /api/attendance/employees/biometric-sync` (push), scheduled job calls `get-attendance`.
- On push: if employee already synced → tries `update-employee` first, else `add-employee`; with automatic cross-fallback as described above.
- Config stored per project: `aftBaseUrl`, `aftProjectPrefix`, encrypted Bearer key (`AttendanceConfig`).
