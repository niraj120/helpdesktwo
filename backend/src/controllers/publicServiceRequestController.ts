/**
 * Public Service Request API (parent self-service).
 *
 * Lets a trusted app (authenticated with a pub_ API key) let a parent — after
 * SSO on the app side — raise a PSR themselves and list their own requests.
 * Uses the dedicated `self_service` SR form (distinct from the PSL/staff forms).
 *
 * Endpoints (mounted under /v1):
 *   GET  /v1/service-requests/form-schema   → the self-service form schema
 *   POST /v1/service-requests               → raise a PSR
 *   GET  /v1/service-requests/mine          → the parent's own PSRs
 *
 * Auth: X-API-Key (validatePublicApiKey resolves the project). The parent's
 * identity (mobile / external id) is supplied by the trusted app.
 */
import { Response } from "express";
import mongoose from "mongoose";
import { PublicApiRequest } from "../middleware/validatePublicApiKey";
import { Project } from "../models/Project";
import { Ticket } from "../models/Ticket";
import { Category } from "../models/Category";
import { resolveSrConfig, isSrEnabled } from "../modules/service-request/serviceRequestConfig";
import { createServiceRequest } from "../modules/service-request/createServiceRequest";
import { searchParentsFromMDM } from "../services/mdmService";
import { SR_PSR_STATUSES } from "../modules/service-request/types";
import { signParentSession } from "../middleware/selfServiceAuth";
import { enrolmentsForParent } from "../modules/service-request/srFamilyLookup";
import { getSrConfigForProject } from "../modules/service-request/srConfigAdmin";

const SELF_SERVICE_CHANNEL = "self_service";

// Status codes the parent endpoints move a request to (SR lifecycle).
const SR_STATUS_CLOSED = 5;
const SR_STATUS_REOPEN = 6;

// The parent's mobile: from the session token when present (locked to that
// parent), else from the request (trusted server-to-server pub_ key caller).
const effectiveMobile = (req: any, provided?: string): string =>
  String(req.parentSessionMobile || provided || "").trim();

const SR_STATUS_LABELS: Record<number, string> = Object.fromEntries(
  SR_PSR_STATUSES.map((s) => [s.code, s.name]),
);

/**
 * Which requests this parent may see and act on.
 *
 * Student-shared (the default): every request about one of their children,
 * whichever guardian raised it — so a mother sees the father's request for
 * the same child and can reply to it. Requests ticked "private to the raiser"
 * stay with whoever raised them. With `raiser_only`, or when the parent's
 * children cannot be resolved, it falls back to the raiser's own requests.
 */
const parentScope = async (
  req: any,
  projectId: string,
  parentMobile: string,
): Promise<Record<string, any>> => {
  const mine = { "metadata.parent.mobile": parentMobile };
  let enrolments: string[] = Array.isArray(req.parentSessionEnrolments)
    ? req.parentSessionEnrolments
    : [];
  let separatedRaiserOnly = true;
  try {
    const cfg: any = await getSrConfigForProject(projectId);
    const comms = cfg?.psr?.workflow?.parentCommunication;
    if (comms?.parentVisibility === "raiser_only") return mine;
    separatedRaiserOnly = comms?.separatedFamiliesRaiserOnly !== false;
    // A pub_ key caller has no session token: resolve the family now.
    if (!enrolments.length) {
      enrolments = await enrolmentsForParent(projectId, { mobile: parentMobile });
    }
  } catch (e) {
    console.warn("[psr] parent scope fell back to raiser-only:", (e as any)?.message);
    return mine;
  }
  if (!enrolments.length) return mine;
  const shared: Record<string, any> = {
    "metadata.studentEnrollments": { $in: enrolments },
    "metadata.privateToRaiser": { $ne: true },
  };
  if (separatedRaiserOnly) shared["metadata.separatedParents"] = { $ne: true };
  return { $or: [mine, shared] };
};

/** The project's PSR config, or null when it cannot be read. */
const srCfg = async (projectId: string): Promise<any> => {
  try {
    return await getSrConfigForProject(projectId);
  } catch {
    return null;
  }
};

const err = (res: Response, code: string, message: string, status = 400) =>
  res.status(status).json({ status: "error", code, message });

/** Stable key from a field label (matches the portal form's field keys). */
const slugKey = (label: string): string =>
  String(label || "field")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase() || "field";

// The self-service form is the "Student Portal" channel built in SR Settings →
// Configure (stored under configuration.sr.customChannelFields.student_portal).
const getSelfServiceFields = (project: any): any[] => {
  const cfg = resolveSrConfig(project) as any;
  const raw = cfg.customChannelFields?.student_portal;
  return Array.isArray(raw) ? raw : [];
};
const isCategoryField = (f: any) => f?.dataSource === "category";
// Roles resolved server-side from the parent login + selected student.
const isParentAuto = (f: any) => f?.autoRole === "parent";
const isStudentSelect = (f: any) => f?.autoRole === "student";
const isStudentAttr = (f: any) => f?.autoRole === "student_attr";
// "auto" = the app does not collect it (resolved from identity/student/MDM).
const isAutoField = (f: any) =>
  f?.dataSource === "mdm" || isParentAuto(f) || isStudentAttr(f);
// Keys handled as core fields (sent at the top level, not inside form_data).
const CORE_KEYS = new Set(["subject", "description"]);
// "search" = parent lookup; category → sub_category_id; student-select → the
// top-level student_id; subject/description are core — none are app form_data.
const isFormDataField = (f: any) =>
  !isCategoryField(f) &&
  !isStudentSelect(f) &&
  f?.type !== "search" &&
  !CORE_KEYS.has(slugKey(f?.label));

/** Map a stored Student-Portal field to the public schema shape. */
const mapField = (f: any) => ({
  key: slugKey(f.label),
  label: f.label,
  type: f.type,
  required: f.required === true,
  ...(Array.isArray(f.staticOptions) && f.staticOptions.length
    ? { options: f.staticOptions }
    : {}),
  // Auto fields are resolved from the parent identity / selected student — the
  // app does not collect them.
  ...(isAutoField(f) ? { source: "auto", auto: true } : {}),
  ...(f.autoRole && f.autoRole !== "none" ? { auto_role: f.autoRole } : {}),
});

/** Pull a value from a flat row by fuzzy column-name match. */
const findCol = (row: any, ...patterns: string[]): string => {
  if (!row) return "";
  for (const p of patterns) {
    const k = Object.keys(row).find((kk) =>
      kk.toLowerCase().includes(p.toLowerCase()),
    );
    if (k && row[k] != null && row[k] !== "") return String(row[k]);
  }
  return "";
};

// Columns we've already ensured an index on, so we build once per process.
const ensuredIndexes = new Set<string>();

/**
 * Search a PSR Builder table by mobile → parent + students (flat master).
 * `map` is the admin's explicit column mapping (studentCols on the field);
 * falls back to fuzzy column detection when a mapping isn't provided.
 */
async function queryPsrTableByMobile(
  tableId: string,
  mob: string,
  map: any = {},
): Promise<{ parent: any; students: any[] } | null> {
  try {
    const PsrTable = (await import("../models/psr/PsrTable")).default;
    const mongooseMod = (await import("mongoose")).default;
    const table: any = await PsrTable.findById(tableId).lean();
    if (!table?.targetCollection) return null;
    const col = mongooseMod.connection.collection(table.targetCollection);
    const digits = mob.replace(/\D/g, "");
    // Match string AND numeric storage forms (masters often import mobiles as
    // numbers), plus last-10-digits.
    const numeric = /^\d+$/.test(digits) ? Number(digits) : null;
    const variants: any[] = Array.from(
      new Set([mob, digits, digits.slice(-10)].filter(Boolean)),
    );
    if (numeric != null) variants.push(numeric, Number(digits.slice(-10)));

    // Mobile column: explicit map wins; else fuzzy-detect.
    const mobileCols = map.mobile
      ? [map.mobile]
      : (table.columns || [])
          .map((c: any) => c.as)
          .filter((a: string) => /mobile|phone|contact/i.test(a));

    // Ensure an index on the mobile column ONCE (awaited) so the very next
    // lookups use it. createIndex is a no-op if it already exists.
    for (const f of mobileCols) {
      const key = `${table.targetCollection}:${f}`;
      if (!ensuredIndexes.has(key)) {
        try {
          await col.createIndex({ [f]: 1 });
        } catch {
          /* ignore */
        }
        ensuredIndexes.add(key);
      }
    }

    let rows: any[] = [];
    if (mobileCols.length) {
      const t0 = Date.now();
      rows = await col
        .find(
          { $or: mobileCols.flatMap((f: string) => variants.map((v) => ({ [f]: v }))) } as any,
          { projection: { _id: 0, _key: 0 } },
        )
        .limit(50)
        .toArray();
      console.log(
        `[publicSR] student lookup on ${table.targetCollection} took ${Date.now() - t0}ms, ${rows.length} row(s)`,
      );
    }
    if (!rows.length && !map.mobile) {
      // Fallback only when no explicit mobile column: bounded regex.
      const searchCols = (table.columns || [])
        .filter((c: any) => c.searchable)
        .map((c: any) => c.as);
      if (searchCols.length) {
        const re = new RegExp(mob.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
        rows = await col
          .find(
            { $or: searchCols.map((f: string) => ({ [f]: { $regex: re } })) } as any,
            { projection: { _id: 0, _key: 0 } },
          )
          .limit(50)
          .toArray();
      }
    }
    const matched = rows;
    const val = (r: any, mapped?: string, ...fuzzy: string[]) =>
      mapped && r[mapped] != null ? String(r[mapped]) : findCol(r, ...fuzzy);
    // Value of the first column whose name contains ALL the given terms.
    const byTerms = (r: any, ...terms: string[]) => {
      const k = Object.keys(r).find((key) =>
        terms.every((t) => key.toLowerCase().includes(t)),
      );
      return k && r[k] != null ? String(r[k]) : "";
    };
    // Build "First Last" from mapped cols, else auto-detect "<who> first/last".
    const nameOf = (r: any, who: string, first?: string, last?: string) => {
      const f = first && r[first] != null ? String(r[first]) : byTerms(r, who, "first");
      const l = last && r[last] != null ? String(r[last]) : byTerms(r, who, "last");
      return `${f} ${l}`.trim();
    };

    const students = matched.map((r: any) => ({
      id:
        val(r, map.id) ||
        byTerms(r, "student", "id") ||
        findCol(r, "enrollment", "gr no", "grno") ||
        undefined,
      name: nameOf(r, "student", map.name, map.nameLast) || "Student",
      grade: val(r, map.grade, "grade", "class", "std"),
      school: val(r, map.school, "school", "centre", "center", "campus", "branch"),
      location: val(r, map.location, "city", "location", "district"),
      _raw: r,
    }));
    const parent = students.length
      ? {
          name:
            nameOf(matched[0], "parent", map.parentName, map.parentNameLast) ||
            byTerms(matched[0], "guardian", "first") ||
            "Parent",
          mobile: mob,
        }
      : null;
    return { parent, students };
  } catch (e) {
    console.error("[publicSR] PSR Builder table query failed:", e);
    return null;
  }
}

/**
 * Resolve the parent + their students by mobile. Prefers the PSR Builder table
 * configured on a self-service form field (the "DB source"); falls back to the
 * project lookup source (psr_builder / MDM). The PSR Builder master is a flat
 * parent-student table — rows matching the mobile ARE the students.
 */
async function resolveParentStudents(
  project: any,
  projectId: string,
  mobile: string,
  fields: any[] = [],
): Promise<{ parent: any; students: any[] }> {
  const cfg = resolveSrConfig(project);
  const lookup: any = cfg.psr?.intake?.lookup || {};
  const mob = String(mobile).trim();

  // 1) The table + column mapping from the self-service PSR-table field(s).
  const psrFields = (fields || []).filter(
    (f: any) => f?.dataSource === "psr_table" && f?.psrTableId,
  );
  // Merge column mappings across all PSR-table fields (parent + student), so a
  // mapping set on either field is honoured.
  const mergedMap = Object.assign(
    {},
    ...psrFields.map((f: any) => f.studentCols || {}),
  );
  // 2) Or the project-level PSR Builder table.
  const tableId =
    psrFields[0]?.psrTableId ||
    (lookup.source === "psr_builder" ? lookup.psrBuilderTableId : null);

  if (tableId) {
    const r = await queryPsrTableByMobile(String(tableId), mob, mergedMap);
    if (r) return r;
  }

  // 3) MDM fallback (only when no PSR Builder table is configured).
  try {
    const found = await searchParentsFromMDM(
      mob,
      projectId,
      lookup.parentMdmSourceId,
      lookup.relationship,
    );
    const match: any = found?.parents?.[0];
    if (match) {
      const students = (match.children || []).map((c: any) => ({
        id: c.id ?? c.studentId ?? c.enrollment,
        name: c.name || [c.firstName, c.lastName].filter(Boolean).join(" "),
        grade: c.grade,
        school: c.school,
        location: c.location ?? c.city,
        _raw: c,
      }));
      return {
        parent: { name: match.name, mobile: match.mobile || mob, externalId: match.id },
        students,
      };
    }
  } catch (e) {
    console.error("[publicSR] MDM lookup failed:", e);
  }
  return { parent: null, students: [] };
}

// ── POST /v1/service-requests/session ────────────────────────────────────────
// Server-to-server (pub_ key). The parent web/app backend calls this AFTER it
// has authenticated the parent, passing the parent's mobile. Returns a
// short-lived token the browser modal uses — the pub_ key stays server-side.
export const createParentSession = async (
  req: PublicApiRequest,
  res: Response,
): Promise<void> => {
  try {
    const projectId = req.publicApiProjectId!;
    const parentMobile = String(req.body?.parent_mobile || "").trim();
    if (!parentMobile) {
      return void err(res, "MISSING_IDENTITY", "parent_mobile is required.");
    }
    // Resolve the parent's children once, so every request in the session is
    // scoped to their enrolment numbers without a lookup per call.
    const enrolments = await enrolmentsForParent(projectId, { mobile: parentMobile });
    const token = signParentSession(projectId, parentMobile, enrolments);
    res.json({
      status: "success",
      token,
      // Convenience: the URL the app/web should load in its modal/webview.
      portal_url: `/portal/service-requests?token=${encodeURIComponent(token)}`,
      expires_in: "20m",
    });
  } catch (e: any) {
    err(res, "INTERNAL", e?.message || "Failed to create session.", 500);
  }
};

// ── GET /v1/service-requests/form-schema ─────────────────────────────────────
export const getSelfServiceFormSchema = async (
  req: PublicApiRequest,
  res: Response,
): Promise<void> => {
  try {
    const projectId = req.publicApiProjectId!;
    const project = await Project.findById(projectId)
      .select("name configuration.sr")
      .lean();
    if (!project) return void err(res, "PROJECT_NOT_FOUND", "Project not found.", 404);
    if (!isSrEnabled(project, "PSR")) {
      return void err(res, "PSR_DISABLED", "PSR is not enabled for this project.", 400);
    }

    const fields = getSelfServiceFields(project);
    const hasCategory = fields.some(isCategoryField);
    const hasStudentSelect = fields.some(isStudentSelect);

    // Leaf sub-categories for the dropdown, filtered to the category field's
    // scope (categories differ per interaction type). Self-service defaults PSR.
    const catField = fields.find(isCategoryField);
    const scope = (catField?.categoryScope || "PSR") as "normal" | "PSR" | "ISR";
    const matchesScope = (appliesTo?: string[]) => {
      const a = Array.isArray(appliesTo) ? appliesTo : [];
      if (a.length === 0) return scope === "normal";
      if (a.includes("PSR") && a.includes("ISR")) return scope === "PSR" || scope === "ISR";
      return a.length === 1 && a[0] === scope;
    };
    const cats = await Category.find({ projectId, isActive: true })
      .select("name parentId path sr")
      .lean();
    const parentIds = new Set(
      cats.filter((c: any) => c.parentId).map((c: any) => String(c.parentId)),
    );
    const subCategories = cats
      .filter((c: any) => !parentIds.has(String(c._id)))
      .filter((c: any) => matchesScope(c.sr?.appliesTo))
      .map((c: any) => ({ id: String(c._id), name: c.name, path: c.path || c.name }));

    res.json({
      status: "success",
      project_id: projectId,
      project_name: (project as any).name,
      channel: SELF_SERVICE_CHANNEL,
      // Identity the app must supply (from its SSO session).
      identity_fields: [
        { key: "parent_mobile", label: "Parent Mobile", type: "phone", required: true },
        { key: "parent_external_id", label: "Parent External ID (MDM)", type: "text", required: false },
        { key: "student_id", label: "Student ID (MDM)", type: "text", required: false },
      ],
      // When present, the app shows a child picker (options = the logged-in
      // parent's children, resolved from MDM); the chosen id is sent as student_id.
      student_field: hasStudentSelect
        ? { key: "student_id", label: "Select student", type: "select", source: "parent_children", required: true }
        : null,
      // The sub-category the request is filed under (required when the portal
      // form has a Category Master field).
      category_field: {
        key: "sub_category_id",
        label: "Sub-category",
        type: "select",
        required: hasCategory,
        options: subCategories,
      },
      core_fields: [
        { key: "subject", label: "Subject", type: "text", required: true, max_length: 200 },
        { key: "description", label: "Description", type: "textarea", required: false, max_length: 4000 },
      ],
      // The admin-built Student-Portal fields. Fields marked auto=true are
      // resolved from MDM using the parent identity and need not be collected.
      form_fields: fields.filter(isFormDataField).map(mapField),
    });
  } catch (e: any) {
    err(res, "INTERNAL", e?.message || "Failed to load form schema.", 500);
  }
};

// ── GET /v1/service-requests/students ────────────────────────────────────────
// Given the logged-in parent's mobile (from the app SSO), return the parent's
// children so the app/webview can auto-populate the student dropdown — the same
// MDM lookup existing-parent search uses, but triggered from the login identity
// instead of a manual search.
export const listParentStudents = async (
  req: PublicApiRequest,
  res: Response,
): Promise<void> => {
  try {
    const projectId = req.publicApiProjectId!;
    const parentMobile = effectiveMobile(req, req.query.parent_mobile as string);
    if (!parentMobile) {
      return void err(res, "MISSING_IDENTITY", "parent_mobile is required.");
    }
    const project = await Project.findById(projectId).select("configuration.sr").lean();
    if (!project) return void err(res, "PROJECT_NOT_FOUND", "Project not found.", 404);

    const { parent, students } = await resolveParentStudents(
      project,
      projectId,
      parentMobile,
      getSelfServiceFields(project),
    );
    res.json({
      status: "success",
      parent,
      // Normalized fields (id/name/grade/school/location) PLUS every master
      // column under `details`, so nothing from the DB is missing.
      students: students.map(({ _raw, ...s }: any) => ({
        ...s,
        details: _raw || {},
      })),
      ...(students.length === 0
        ? { message: "No students found for this mobile in the master data." }
        : {}),
    });
  } catch (e: any) {
    err(res, "INTERNAL", e?.message || "Failed to load students.", 500);
  }
};

// ── POST /v1/service-requests ────────────────────────────────────────────────
export const createSelfServiceSr = async (
  req: PublicApiRequest,
  res: Response,
): Promise<void> => {
  try {
    const projectId = req.publicApiProjectId!;
    const project = await Project.findById(projectId).select("configuration.sr").lean();
    if (!project) return void err(res, "PROJECT_NOT_FOUND", "Project not found.", 404);
    if (!isSrEnabled(project, "PSR")) {
      return void err(res, "PSR_DISABLED", "PSR is not enabled for this project.", 400);
    }

    const body = req.body || {};
    const parentMobile = effectiveMobile(req, body.parent_mobile);
    if (!parentMobile) {
      return void err(res, "MISSING_IDENTITY", "parent_mobile is required.");
    }
    const subCategoryId = String(body.sub_category_id || "").trim();
    if (!subCategoryId || !mongoose.Types.ObjectId.isValid(subCategoryId)) {
      return void err(res, "MISSING_CATEGORY", "A valid sub_category_id is required.");
    }
    const category = await Category.findOne({ _id: subCategoryId, projectId }).select("_id").lean();
    if (!category) {
      return void err(res, "INVALID_CATEGORY", "sub_category_id not found in this project.");
    }

    // Validate required Student-Portal form fields.
    const fields = getSelfServiceFields(project);
    const formData: Record<string, any> = { ...(body.form_data || {}) };
    const missing: string[] = [];
    for (const f of fields) {
      if (!isFormDataField(f) || isAutoField(f)) continue;
      const key = slugKey(f.label);
      if (f.required === true && !String(formData[key] ?? "").trim()) {
        missing.push(key);
      }
    }
    if (!String(body.subject || "").trim()) missing.push("subject");
    if (missing.length) {
      return void err(res, "MISSING_FIELDS", `Missing required fields: ${missing.join(", ")}`);
    }

    // Resolve the parent + students by mobile (PSR Builder table or MDM), then
    // auto-fill the fields the admin marked as parent/student roles.
    let parent: any = { name: body.parent_name, mobile: parentMobile, email: body.parent_email };
    let children: any[] = [];
    let studentHints: any = null;
    try {
      const resolved = await resolveParentStudents(project, projectId, parentMobile, fields);
      if (resolved.parent) parent = { ...parent, ...resolved.parent };
      const all = resolved.students || [];
      const chosen = body.student_id
        ? all.find((s: any) => String(s.id ?? "") === String(body.student_id))
        : undefined;
      const child = chosen || all[0] || {};
      children = child && Object.keys(child).length ? [child] : [];

      for (const f of fields) {
        const key = slugKey(f.label);
        if (isParentAuto(f)) {
          formData[key] = parent.name || parent.mobile || "";
        } else if (isStudentAttr(f)) {
          const attr = String(f.studentAttr || "").trim();
          const val = attr
            ? (child as any)[attr] ?? (child as any)._raw?.[attr] ?? findCol((child as any)._raw, attr)
            : undefined;
          if (val !== undefined && val !== null && val !== "") formData[key] = val;
        }
      }
      studentHints = {
        id: (child as any).id,
        grade: (child as any).grade,
        school: (child as any).school,
        location: (child as any).location,
      };
    } catch (resolveErr) {
      console.error("[publicSR] parent/student resolve failed (continuing):", resolveErr);
    }
    // Don't persist the raw master row.
    if (children[0]?._raw) delete children[0]._raw;

    const result = await createServiceRequest({
      projectId,
      interactionType: "PSR",
      requestType: "SR",
      channel: SELF_SERVICE_CHANNEL as any,
      modeOfContact: "digital",
      categoryId: subCategoryId,
      subject: String(body.subject).trim(),
      description: String(body.description || "").trim(),
      createdBy: undefined,
      parent,
      children,
      formData,
      requesterEmail: parent.email,
      metadata: {
        selfService: true,
        parent,
        raisedVia: "parent_app",
        parentExternalId: parent.externalId,
        studentId: body.student_id || studentHints?.id,
        // Routing hints (grade / school / location) for assignment + escalation.
        studentGrade: studentHints?.grade,
        studentSchool: studentHints?.school,
        studentLocation: studentHints?.location,
      },
      skipDuplicateCheck: false,
    } as any);

    res.status(201).json({
      status: "success",
      ticket_id: result.ticketId,
      ticket_number: result.ticketNumber,
      auto_closed: !!result.autoClosed,
      duplicate_warning: result.duplicateMessage || undefined,
    });
  } catch (e: any) {
    const status = e?.status && Number.isInteger(e.status) ? e.status : 500;
    err(res, "CREATE_FAILED", e?.message || "Failed to create service request.", status);
  }
};

// ── GET /v1/service-requests/:ticketNumber ───────────────────────────────────
// Detail + parent-visible thread for one of the parent's own requests.
export const getMySrDetail = async (
  req: PublicApiRequest,
  res: Response,
): Promise<void> => {
  try {
    const projectId = req.publicApiProjectId!;
    const parentMobile = effectiveMobile(req, req.query.parent_mobile as string);
    const ticketNumber = String(req.params.ticketNumber || "").trim();
    if (!parentMobile) return void err(res, "MISSING_IDENTITY", "parent_mobile is required.");

    const ticket = await Ticket.findOne({
      project: new mongoose.Types.ObjectId(projectId),
      ticketNumber,
      interactionType: "PSR",
      ...(await parentScope(req, projectId, parentMobile)),
    })
      .select(
        "ticketNumber subject description status createdAt resolvedAt closedAt comments metadata.parent.name metadata.parent.mobile metadata.studentName",
      )
      .lean();
    if (!ticket) return void err(res, "NOT_FOUND", "Request not found.", 404);

    const thread = (ticket.comments || [])
      .filter((c: any) => c.displayToParent || c.authorType === "parent")
      .map((c: any) => ({
        text: c.text,
        from: c.authorType === "parent" ? "you" : "support",
        at: c.createdAt,
      }));

    res.json({
      status: "success",
      request: {
        ticket_number: ticket.ticketNumber,
        subject: ticket.subject,
        description: ticket.description,
        status: ticket.status,
        status_label: SR_STATUS_LABELS[ticket.status] || String(ticket.status),
        created_at: ticket.createdAt,
        thread,
      },
    });
  } catch (e: any) {
    err(res, "INTERNAL", e?.message || "Failed to load request.", 500);
  }
};

// ── POST /v1/service-requests/:ticketNumber/reply ────────────────────────────
export const replyToMySr = async (
  req: PublicApiRequest,
  res: Response,
): Promise<void> => {
  try {
    const projectId = req.publicApiProjectId!;
    const parentMobile = effectiveMobile(req, req.body?.parent_mobile);
    const ticketNumber = String(req.params.ticketNumber || "").trim();
    const message = String(req.body?.message || "").trim();
    if (!parentMobile) return void err(res, "MISSING_IDENTITY", "parent_mobile is required.");
    if (!message) return void err(res, "EMPTY_MESSAGE", "message is required.");
    const comms = (await srCfg(projectId))?.psr?.workflow?.parentCommunication;
    if (comms && (comms.twoWayCommunicationEnabled === false || comms.parentCanAddComments === false)) {
      return void err(res, "REPLIES_DISABLED", "Replying is switched off for this project.", 403);
    }

    // Either guardian of the student may reply — same scope as the list.
    const ticket = await Ticket.findOne({
      project: new mongoose.Types.ObjectId(projectId),
      ticketNumber,
      interactionType: "PSR",
      ...(await parentScope(req, projectId, parentMobile)),
    });
    if (!ticket) return void err(res, "NOT_FOUND", "Request not found.", 404);

    // Who replied, when a request is shared between mother and father.
    const raiserMobile = (ticket as any).metadata?.parent?.mobile;
    const replierName =
      raiserMobile && raiserMobile !== parentMobile
        ? String(req.body?.parent_name || "").trim() || `Parent ${parentMobile}`
        : undefined;
    ticket.comments = ticket.comments || [];
    ticket.comments.push({
      text: replierName ? `${replierName}: ${message}` : message,
      createdAt: new Date(),
      displayToParent: true,
      authorType: "parent",
    } as any);
    (ticket as any).hasNewReply = true; // surface to staff inbox
    await ticket.save();

    res.status(201).json({ status: "success" });
  } catch (e: any) {
    err(res, "INTERNAL", e?.message || "Failed to post reply.", 500);
  }
};

// ── GET /v1/service-requests/mine ────────────────────────────────────────────
export const listMySelfServiceSr = async (
  req: PublicApiRequest,
  res: Response,
): Promise<void> => {
  try {
    const projectId = req.publicApiProjectId!;
    const parentMobile = effectiveMobile(req, req.query.parent_mobile as string);
    if (!parentMobile) {
      return void err(res, "MISSING_IDENTITY", "parent_mobile is required.");
    }
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

    const query: any = {
      project: new mongoose.Types.ObjectId(projectId),
      interactionType: "PSR",
      ...(await parentScope(req, projectId, parentMobile)),
    };
    const [rows, total] = await Promise.all([
      Ticket.find(query)
        .select(
          "ticketNumber subject status createdAt resolvedAt closedAt metadata.parent.name metadata.parent.mobile metadata.studentName",
        )
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Ticket.countDocuments(query),
    ]);

    res.json({
      status: "success",
      total,
      page,
      limit,
      requests: rows.map((t: any) => ({
        ticket_number: t.ticketNumber,
        subject: t.subject,
        status: t.status,
        status_label: SR_STATUS_LABELS[t.status] || String(t.status),
        created_at: t.createdAt,
        resolved_at: t.resolvedAt,
        closed_at: t.closedAt,
        // A request may have been raised by the other guardian of the student.
        student_name: t.metadata?.studentName,
        raised_by: t.metadata?.parent?.name,
        raised_by_me: t.metadata?.parent?.mobile === parentMobile,
      })),
    });
  } catch (e: any) {
    err(res, "INTERNAL", e?.message || "Failed to list requests.", 500);
  }
};

// ── POST /v1/service-requests/:ticketNumber/close ────────────────────────────
// The parent closes their own request, with satisfaction + a comment. Either
// guardian of the student may close it (same scope as the list).
export const closeMySelfServiceSr = async (
  req: PublicApiRequest,
  res: Response,
): Promise<void> => {
  try {
    const projectId = req.publicApiProjectId!;
    const parentMobile = effectiveMobile(req, req.body?.parent_mobile);
    const ticketNumber = String(req.params.ticketNumber || "").trim();
    if (!parentMobile) return void err(res, "MISSING_IDENTITY", "parent_mobile is required.");

    const lifecycle = (await srCfg(projectId))?.psr?.workflow?.lifecycle;
    if (lifecycle && lifecycle.parentClosureEnabled === false) {
      return void err(res, "CLOSURE_DISABLED", "Closing is switched off for this project.", 403);
    }

    const ticket: any = await Ticket.findOne({
      project: new mongoose.Types.ObjectId(projectId),
      ticketNumber,
      interactionType: "PSR",
      ...(await parentScope(req, projectId, parentMobile)),
    });
    if (!ticket) return void err(res, "NOT_FOUND", "Request not found.", 404);
    if (ticket.status === SR_STATUS_CLOSED) {
      return void err(res, "ALREADY_CLOSED", "This request is already closed.");
    }

    const satisfied = req.body?.satisfied !== false;
    const comments = String(req.body?.comments || "").trim();
    ticket.parentClosure = { satisfied, closedAt: new Date(), comments };
    if (satisfied) {
      ticket.status = SR_STATUS_CLOSED;
      ticket.closedAt = new Date();
    }
    ticket.comments = ticket.comments || [];
    ticket.comments.push({
      text: comments || (satisfied ? "Closed by the parent." : "Parent is not satisfied."),
      createdAt: new Date(),
      displayToParent: true,
      authorType: "parent",
    } as any);
    await ticket.save();
    res.json({ status: "success", closed: satisfied });
  } catch (e: any) {
    err(res, "INTERNAL", e?.message || "Failed to close the request.", 500);
  }
};

// ── POST /v1/service-requests/:ticketNumber/reopen ───────────────────────────
// Re-open a closed request, within the project's re-open limit. Recorded as a
// parent re-open, so the staff list can tell it from an agent's.
export const reopenMySelfServiceSr = async (
  req: PublicApiRequest,
  res: Response,
): Promise<void> => {
  try {
    const projectId = req.publicApiProjectId!;
    const parentMobile = effectiveMobile(req, req.body?.parent_mobile);
    const ticketNumber = String(req.params.ticketNumber || "").trim();
    const reason = String(req.body?.reason || "").trim();
    if (!parentMobile) return void err(res, "MISSING_IDENTITY", "parent_mobile is required.");
    if (!reason) return void err(res, "MISSING_REASON", "Say why you are re-opening.");

    const limit = (await srCfg(projectId))?.psr?.workflow?.lifecycle?.reopenLimit ?? 1;
    const ticket: any = await Ticket.findOne({
      project: new mongoose.Types.ObjectId(projectId),
      ticketNumber,
      interactionType: "PSR",
      ...(await parentScope(req, projectId, parentMobile)),
    });
    if (!ticket) return void err(res, "NOT_FOUND", "Request not found.", 404);
    if (limit <= 0) {
      return void err(res, "REOPEN_DISABLED", "Re-opening is switched off for this project.", 403);
    }
    const used = ticket.reopen?.count ?? 0;
    if (used >= limit) {
      return void err(
        res,
        "REOPEN_LIMIT",
        `This request has already been re-opened ${used} time(s) — the limit is ${limit}.`,
      );
    }

    ticket.status = SR_STATUS_REOPEN;
    ticket.closedAt = undefined;
    ticket.reopen = { count: used + 1, reopenedAt: new Date(), by: "parent" };
    ticket.comments = ticket.comments || [];
    ticket.comments.push({
      text: `Re-opened: ${reason}`,
      createdAt: new Date(),
      displayToParent: true,
      authorType: "parent",
    } as any);
    (ticket as any).hasNewReply = true;
    await ticket.save();
    res.json({ status: "success" });
  } catch (e: any) {
    err(res, "INTERNAL", e?.message || "Failed to re-open the request.", 500);
  }
};
