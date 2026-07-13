# Simple External MDM Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the technical External MDM cache screen with a non-technical wizard that joins two API datasets, previews the result, and saves it as a reusable Mongo-backed collection.

**Architecture:** Keep the backend cache/join infrastructure already added. Simplify the frontend into a guided workflow that builds the existing `MDMCacheConfig` shape from plain choices: API 1, API 2, common keys, final display fields, and collection name.

**Tech Stack:** React, TypeScript, Vite/Vitest, existing MDM service APIs, existing Express/Mongoose cache APIs.

---

## File Structure

- Create: `frontend/src/pages/integrations/externalMdmWizard.ts`
  - Pure helpers for flattening sample keys and converting wizard state into `MDMCacheConfig`.
- Create: `frontend/src/pages/integrations/externalMdmWizard.test.ts`
  - Vitest tests for the config builder.
- Modify: `frontend/src/pages/integrations/ExternalMDMPage.tsx`
  - Replace the technical datasets/join-builder UI with a simple wizard.

---

## Task 1: Tested Wizard Config Builder

**Files:**
- Create: `frontend/src/pages/integrations/externalMdmWizard.test.ts`
- Create: `frontend/src/pages/integrations/externalMdmWizard.ts`

- [ ] **Step 1: Write failing tests**

Create tests that verify the wizard turns non-technical selections into the existing cache config:

```ts
import { describe, expect, it } from "vitest";
import { buildSimpleExternalMdmCache, flattenColumnNames } from "./externalMdmWizard";

describe("externalMdmWizard", () => {
  it("loads nested column names from API samples", () => {
    expect(
      flattenColumnNames({
        id: 1,
        parent: { name: "A", mobile: "9" },
        children: [{ student_id: 2, name: "B" }],
      }),
    ).toEqual([
      "children",
      "children.name",
      "children.student_id",
      "id",
      "parent",
      "parent.mobile",
      "parent.name",
    ]);
  });

  it("builds a two API joined cache config for a reusable dropdown collection", () => {
    const config = buildSimpleExternalMdmCache({
      collectionName: "Student Guardian Directory",
      firstApiIndex: 0,
      secondApiIndex: 1,
      firstJoinKey: "student_id",
      secondJoinKey: "student_id",
      displayFields: ["student_name", "parent_name"],
      valueField: "student_id",
      searchFields: ["student_name", "parent_mobile"],
    });

    expect(config.enabled).toBe(true);
    expect(config.datasets).toHaveLength(2);
    expect(config.joins).toHaveLength(1);
    expect(config.datasets[0].key).toBe("student_guardian_directory_api_1");
    expect(config.datasets[1].key).toBe("student_guardian_directory_api_2");
    expect(config.joins[0]).toMatchObject({
      key: "student_guardian_directory",
      label: "Student Guardian Directory",
      parentDatasetKey: "student_guardian_directory_api_1",
      mappingDatasetKey: "student_guardian_directory_api_2",
      studentDatasetKey: "student_guardian_directory_api_2",
      parentKeyField: "student_id",
      mappingParentKeyField: "student_id",
      mappingStudentKeyField: "student_id",
      studentKeyField: "student_id",
      parentStoredFields: ["student_name", "parent_name", "student_id", "parent_mobile"],
      childStoredFields: ["student_name", "parent_name", "student_id", "parent_mobile"],
    });
  });
});
```

- [ ] **Step 2: Run tests to verify red**

Run: `npx vitest run src/pages/integrations/externalMdmWizard.test.ts`

Expected: fails because `externalMdmWizard.ts` does not exist.

- [ ] **Step 3: Implement utility**

Create `externalMdmWizard.ts` with:

- `flattenColumnNames(sample)`
- `slugifyCollectionName(name)`
- `buildSimpleExternalMdmCache(input)`

- [ ] **Step 4: Verify green**

Run: `npx vitest run src/pages/integrations/externalMdmWizard.test.ts`

Expected: tests pass.

---

## Task 2: Replace Technical External MDM Page With Wizard

**Files:**
- Modify: `frontend/src/pages/integrations/ExternalMDMPage.tsx`

- [ ] **Step 1: Replace page state**

Use simple wizard state:

- selected source
- API 1 index
- API 2 index
- loaded API 1 keys
- loaded API 2 keys
- selected join keys
- collection name
- output display fields
- value field
- search fields
- preview rows

- [ ] **Step 2: Render four non-technical sections**

Sections:

1. `Select API Lists`
2. `Match Common Key`
3. `Choose Final Fields`
4. `Preview and Save Collection`

- [ ] **Step 3: Save using existing cache API**

On save:

1. Call `buildSimpleExternalMdmCache`.
2. Save via `updateMDMCacheConfig`.
3. Trigger sync for both generated datasets.
4. Trigger join rebuild.
5. Show the saved collection in a `Saved Collections` list.

- [ ] **Step 4: Build frontend**

Run: `npm run build`

Expected: build passes.

---

## Task 3: Final Verification

**Files:**
- No new files.

- [ ] **Step 1: Run focused frontend test**

Run: `npx vitest run src/pages/integrations/externalMdmWizard.test.ts`

Expected: tests pass.

- [ ] **Step 2: Run frontend build**

Run: `npm run build`

Expected: build passes.

