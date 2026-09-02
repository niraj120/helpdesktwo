# Parent Identity & Visibility — Problem & Solution Design

**Status: DESIGN ONLY — no implementation. For discussion and sign-off.**
Covers both channels: **IVR call triage** and **Parent self-service portal**.

---

## 1. The problem, stated precisely

Across IVR and self-service we identify a "parent" by their **mobile number**
(and sometimes email). In the real master data:

- **One mobile number** is shared by mother, father, and guardian.
- **One email** is mapped to multiple parents.
- **Different parents of the same child** may have **different** numbers.

The current code treats the contact detail as if it uniquely identifies a person:

- IVR: `matchCaller()` runs `findOne({ mobile })` → returns **whichever row the
  DB returns first** → takes that row's name. Non-deterministic when the number
  is on more than one parent.
- Self-service: `resolveParentStudents()` takes `parents[0]` → the **first**
  match again. Ticket visibility is then keyed on `metadata.parent.mobile`.

So four questions have no clean answer today:

1. Same number on mother/father/guardian → **whose name shows in the IVR list?**
2. Same email on multiple parents → **same ambiguity.**
3. Mother and father (different numbers) raise for the same child → **do they see
   each other's tickets, or only their own?**
4. If we search by **student** instead of parent → **which parent populates?**

---

## 2. Root cause

We are collapsing **three distinct entities** into one "parent":

| Entity | What it really is | Cardinality | Correct role |
|---|---|---|---|
| **Contact** | a phone number / email address | shared across people **and** students | **lookup key only** — never an identity |
| **Guardian** | a *person*: mother / father / guardian | one real individual | **the raiser** of a request |
| **Student** | the child the request concerns | the subject | **the anchor** every request hangs off |

A phone number is a **Contact**. It is *not* a Guardian and *not* a Student.
Every problem above is caused by using a Contact as if it were a Guardian.

---

## 3. The model

> **Student is the anchor. Guardian is the raiser. Contact is only a lookup key,
> and is explicitly many-to-many.**

- A **request (SR)** is always **about a Student** and **raised by a Guardian**.
- A **Contact** (mobile/email) can resolve to **0, 1, or many** Guardians.
- A **Guardian** is linked to one or more **Students** with a **relationship**
  (mother / father / guardian) and, where available, a **custody / primary-contact
  flag** from the master data.

### The MDM already has stable ids — this is the good case

The **Guardian Master** table has **`guardianId` as its primary key** — one row per
**(parent-person × student)** relationship. The three ids relate like this:

```
 Guardian Master (PK = guardianId), one row per parent×student:

   guardianId  parentId  studentId   relation
   ─────────   ────────  ─────────   ────────
   G1          P_f       S5 (Aarav)  Father
   G2          P_f       S6 (Bina)   Father     ← same person P_f, 3 children,
   G3          P_f       S7 (Chetan) Father        3 rows, 3 guardianIds
   G4          P_m       S5 (Aarav)  Mother     ← different person P_m
```

Read the ids for what they are:

| Id | What it is | Role |
|---|---|---|
| **`parentId`** | the **person** — mother / father / guardian; repeats across all their children | **raiser identity** |
| **`studentId`** | the child | **anchor** |
| **`guardianId`** | PK of one *(parent × student)* row | the exact link stamped on the SR |

Therefore, deterministically:

- **Raiser identity** = **`parentId`** (the person). Mother and father are
  **different `parentId`s** — that is the mother/father disambiguation key.
- **Anchor** = **`studentId`**.
- **`guardianId`** = the precise *(parent, student)* row; stamp it on the SR as the
  exact context, but it is **not** the person — a parent of 3 has 3 of them.
- A **Contact** (mobile/email) resolves to **one or more Guardian Master rows**.
  Multiple rows = multiple persons (`parentId`s) and/or multiple students on that
  number.

All three ids get stamped on every SR at creation, so all four problems resolve
without guessing.

---

## 4. Resolution rules per channel

### 4a. IVR (inbound call) — guardian is UNKNOWN at pickup

A number that resolves to several Guardian Master rows is **data, not an error**.

- Look up the mobile → get all matching rows, then **group by `parentId`** (the
  person). Each person carries their set of students.
- The triage row lists the matched **persons** as candidates, each with their
  students:

  > `+91 98XXXXXX21 →`
  > `Rajesh Sharma (Father, parentId P_f) — students: Aarav, Bina, Chetan`
  > `Sunita Sharma (Mother, parentId P_m) — students: Aarav`

- The agent picks **the person they are speaking to** (`parentId`) **and the
  student** the call is about (`studentId`). That resolves the exact
  `guardianId` row, and all three ids are stamped on the SR.
- **One person, one student** → auto-selected.
- **Zero** rows → the existing unregistered / prospective flow, unchanged.
- One person with **several students** → show the student list; agent picks.

**Never silently auto-pick one name when several exist.**

### 4b. Email-to-ticket — same shape as IVR

Email is a Contact. If it resolves to multiple guardians, the request is created
with the guardian **unresolved**, and the agent selects the correct guardian +
student at triage. No auto-pick.

### 4c. Self-service portal — guardian is ALREADY KNOWN

The app has already authenticated the *specific* logged-in guardian. So there is
nothing to disambiguate — **do not** resolve by mobile.

- The app backend passes the **`parentId`** (the logged-in person) when minting
  the session token — not just a mobile. (The plumbing already anticipates this:
  `identity_fields` in the form-schema response exposes `parent_external_id` and
  `student_id`, and `metadata.parentExternalId` already exists on the SR — map
  `parentId` onto it.)
- The token carries the `parentId`; lookups key on it → one deterministic person.
- The portal shows the student picker (it already does) over that person's
  children; the chosen `studentId` is the anchor. `parentId + studentId` resolves
  the exact `guardianId` row, stamped on the SR.
- Mobile is kept only as a display/fallback value.

> **Ask the app team for the `parentId`, not just the mobile.** This is the one
> change on their side — they already know which parent is logged in, so they can
> send its MDM `parentId`. Without it, self-service falls back to the same
> ambiguous mobile lookup as IVR.

---

## 5. Visibility policy — the one decision to sign off

**Scenario:** Mother (number A) and Father (number B) each raise a request for the
same child, Student A. Who can see which?

With stable ids this is a clean query difference, not a data problem:
- **Raiser-private** = SRs where `metadata.parentId == mine`.
- **Student-shared** = SRs where `metadata.studentId ∈ (students my `parentId` is
  linked to in Guardian Master)`.

| Model | Behaviour | Trade-off |
|---|---|---|
| **A — Raiser-private** (current de-facto) | each parent-person sees only the requests they raised (`parentId` match) | father cannot see mother already raised it → **duplicate tickets**, desk chases duplicates, family confused |
| **B — Student-shared** (family view) | any parent linked to Student A sees **all** requests for Student A (`studentId` match) | **privacy risk**: separated/divorced parents; a sensitive request by one parent visible to the other |
| **C — Hybrid** ⭐ recommended | **Student-shared by default**, plus: per-project toggle · per-ticket "sensitive / private to raiser" flag · honour an MDM **custody / primary-contact** flag | a little more configuration |

### Recommendation: **C (Hybrid), defaulting to Student-shared**

Rationale:
- PSR exists to resolve the **student's** issue. If the two parents can't see each
  other's requests, the desk gets duplicate tickets for the same problem.
- **But** a school **will** have separated-parent and custody cases. Pure
  student-sharing would leak one parent's request to the other. So the default
  must be overridable:
  - honour a **custody / primary-contact** flag from the master data (only linked
    guardians *allowed to see* share the view),
  - allow a **per-request "private to raiser"** flag for sensitive matters,
  - allow a **project-level** switch to fall back to Raiser-private for tenants
    that want strict separation.
- Pair it with the **duplicate warning** that already exists in the create flow
  (`skipDuplicateCheck` / `duplicate_warning`): when a guardian raises a request
  for a student that already has an open request in the same category, warn.

**This is a business/privacy decision, not a technical one — it needs explicit
sign-off before any build.**

---

## 6. What this requires from the master data (MDM)

**Confirmed:** the **Guardian Master** table has `guardianId` as PK, one row per
*(parent × student)*, carrying `parentId` and `studentId`. That covers the hard
requirements — no composite fallback needed. Remaining confirmations:

| Field | Status | Purpose | If missing |
|---|---|---|---|
| **`parentId`** (the person; repeats across their children) | ✅ exists | deterministic **raiser** identity | — |
| **`studentId`** | ✅ exists | the **anchor**; drives student-shared visibility | — |
| **`guardianId`** (PK, per parent×student) | ✅ exists | exact link stamped on the SR | — |
| **Relationship** (mother / father / guardian) on the row | ❓ confirm | tag persons in the IVR picker; label the raiser | picker still works by `parentId`, just less readable |
| **Custody / primary-contact flag** | ❓ confirm | safe default for separated parents (§5) | student-shared riskier; that tenant should use raiser-private |
| **`parentId` ↔ mobile/email** columns | ❓ confirm | so a Contact lookup returns the right rows | can't match by phone/email at all |

Three things to confirm with the MDM owner:
1. Is **`parentId` truly per person** (one father = one `parentId` across all his
   children), or is it a household id shared by mother+father? The whole
   mother/father disambiguation rests on this. *(Working assumption: per person.)*
2. Does the row carry a **relationship label** (mother/father/guardian)?
3. Is there a **custody / primary-contact** flag for the §5 default?

Everything else is already in place.

---

## 7. Edge cases to keep in view

| Case | Handling |
|---|---|
| Same number, 2 guardians, **different students** | show guardian **and** student candidates; agent/portal picks both |
| Guardian with **no phone**, only present as a name | self-service still works via guardian id; IVR can't match them → unregistered |
| **Separated parents**, one must not see the other | custody flag + per-ticket private flag (Model C) |
| Guardian raises for **the wrong child** | student picker + the request is re-anchorable by the agent |
| Number **changes owner** (recycled SIM) | Contact→Guardian link is data the desk can correct; identity is the guardian id, not the number |
| **Prospective** parent (not in master) | unchanged unregistered flow; no student anchor yet |

---

## 8. Summary

- **Stop treating phone/email as identity.** They are lookup keys that legitimately
  map to many people.
- **The Guardian Master row `(guardianId PK · parentId · studentId)` is the unit of
  resolution.** All three ids get stamped on every SR — resolution is deterministic.
- **Raiser = `parentId` (the person). Anchor = `studentId`. `guardianId` = the exact
  parent×student row.**
- **IVR/email:** person unknown → group matched rows by `parentId`, show persons +
  their students as candidates, agent selects, never auto-pick.
- **Self-service:** person already known from app SSO → app passes the **`parentId`**,
  not a mobile; the student picker supplies `studentId`.
- **Visibility:** adopt **Hybrid** — student-shared default (`studentId` match) +
  custody flag + per-ticket private + project toggle. The only decision needing
  business sign-off.

---

## 9. Open items before build

1. **Sign off the §5 visibility policy** (business/privacy decision).
2. **Confirm with the MDM owner** (§6): (a) is `parentId` per-person or per-household
   — the mother/father split depends on it; (b) relationship label on the row;
   (c) custody/primary-contact flag; (d) how mobile/email attach to `parentId`.

One app-team ask follows: **self-service must send the `parentId`, not just the
mobile** (§4c) — fold this into the app integration spec.

---

*Design for discussion. No code changed.*
