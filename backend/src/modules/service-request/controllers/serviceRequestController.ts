/**
 * Service Request (PSR/ISR) — HTTP controller. Phase 2.
 * Thin layer over the lifecycle service; permission gating lives on the routes.
 */
import { Response } from "express";
import mongoose from "mongoose";
import axios from "axios";
import { AuthRequest } from "../../../middleware/auth";
import { User } from "../../../models/User";
import { Ticket } from "../../../models/Ticket";
import {
  SrNotificationTemplate,
  SR_NOTIFICATION_EVENTS,
} from "../../../models/SrNotificationTemplate";
import { recomputeSrTat } from "../srTatRecompute";
import { getProjectScope, canAccessProject } from "../../../utils/projectScope";
import { bulkDeleteTickets } from "../../../controllers/ticketController";
import { mergeTickets } from "../../../controllers/ticketMergeController";
import * as srSvc from "../serviceRequestService";
import { SrError } from "../serviceRequestService";
import { createServiceRequest } from "../createServiceRequest";
import {
  fetchMdmOptions,
  resolveParentSource,
  searchParentsFromMDM,
} from "../../../services/mdmService";
import { searchCachedParentDirectory } from "../../../services/mdmCacheService";
import {
  listFormSchemas,
  upsertFormSchema,
  deleteFormSchema,
} from "../srForms";
import {
  getSrConfigForProject,
  updateSrConfigForProject,
} from "../srConfigAdmin";
import { buildLeadCrmPayload } from "../services/leadCrmSync";
import { resolveScopeOwners } from "../psrRoutingResolver";

function actorId(req: AuthRequest): string {
  const id = req.user?.userId;
  if (!id) throw new SrError("Unauthenticated", 401);
  return id;
}

function fail(res: Response, err: any) {
  const status = err instanceof SrError ? err.status : 500;
  if (status === 500) console.error("[serviceRequest] error:", err);
  res
    .status(status)
    .json({ success: false, message: err?.message || "Server error" });
}

function hasPerm(req: AuthRequest, code: string): boolean {
  const role = req.user?.role;
  if (
    role?.code === "SUPER_ADMIN" ||
    role?.name === "Super Admin" ||
    role === "Super Admin"
  ) {
    return true;
  }
  const perms = role?.permissions || [];
  return perms.some((p: any) => {
    const permCode = typeof p === "string" ? p : p?.code;
    const permName = typeof p === "string" ? p : p?.name;
    return permCode === code || permName === code;
  });
}

function srAccess(req: AuthRequest) {
  return {
    all: hasPerm(req, "SR_VIEW_ALL"),
    own:
      hasPerm(req, "SR_VIEW_OWN") ||
      hasPerm(req, "SR_PSR_CREATE") ||
      hasPerm(req, "SR_ISR_CREATE"),
    assigned:
      hasPerm(req, "SR_VIEW_ASSIGNED") ||
      hasPerm(req, "SR_PSR_RECEIVE") ||
      hasPerm(req, "SR_ISR_RECEIVE"),
  };
}

async function ensureSrTicketAccess(req: AuthRequest, ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.map((id) => String(id || "").trim()).filter(Boolean)));
  if (!uniqueIds.length) throw new SrError("At least one service request is required", 400);
  if (uniqueIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    throw new SrError("One or more service request IDs are invalid", 400);
  }

  const tickets = await Ticket.find({ _id: { $in: uniqueIds } })
    .select("_id ticketNumber interactionType project metadata")
    .lean();

  if (tickets.length !== uniqueIds.length) {
    throw new SrError("One or more service requests were not found", 404);
  }

  const nonSr = tickets.filter(
    (ticket: any) => !["PSR", "ISR"].includes(String(ticket.interactionType || "")),
  );
  if (nonSr.length) {
    throw new SrError(
      `Only PSR/ISR records can be managed here. Invalid record(s): ${nonSr
        .map((ticket: any) => ticket.ticketNumber || ticket._id)
        .join(", ")}`,
      400,
    );
  }

  const scope = getProjectScope(req);
  const outsideScope = tickets.filter((ticket: any) => {
    const projectId = ticket.project || ticket.metadata?.projectId;
    return projectId && !canAccessProject(scope, projectId);
  });
  if (outsideScope.length) {
    throw new SrError("Forbidden: one or more service requests are outside your project scope", 403);
  }

  return uniqueIds;
}

export const bulkDelete = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ticketIds = Array.isArray(req.body.ticketIds) ? req.body.ticketIds : req.body.ids;
    const ids = await ensureSrTicketAccess(req, ticketIds || []);
    req.body.ticketIds = ids;
    await bulkDeleteTickets(req as any, res);
  } catch (err) {
    fail(res, err);
  }
};

export const merge = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const secondaryIds = Array.isArray(req.body.ticketIds) ? req.body.ticketIds : [];
    const ids = await ensureSrTicketAccess(req, [req.params.id, ...secondaryIds]);
    req.body.ticketIds = ids.filter((id) => id !== String(req.params.id));
    await mergeTickets(req as any, res);
  } catch (err) {
    fail(res, err);
  }
};

export const changeStatus = async (req: AuthRequest, res: Response) => {
  try {
    const ticket = await srSvc.changeSrStatus(
      req.params.id,
      Number(req.body.toStatus),
      actorId(req),
      {
        committedDate: req.body.committedDate,
        comments: req.body.comments,
        displayToParent: req.body.displayToParent,
      },
    );
    res.json({ success: true, data: ticket });
  } catch (err) {
    fail(res, err);
  }
};

export const close = async (req: AuthRequest, res: Response) => {
  try {
    const ticket = await srSvc.closeSr(
      req.params.id,
      actorId(req),
      req.body.comments,
    );
    res.json({ success: true, data: ticket });
  } catch (err) {
    fail(res, err);
  }
};

export const reassign = async (req: AuthRequest, res: Response) => {
  try {
    const ticket = await srSvc.reassignSr(
      req.params.id,
      {
        userId: req.body.userId,
        subCategoryId: req.body.subCategoryId,
        remark: req.body.remark,
      },
      actorId(req),
    );
    res.json({ success: true, data: ticket });
  } catch (err) {
    fail(res, err);
  }
};

export const delegate = async (req: AuthRequest, res: Response) => {
  try {
    const ticket = await srSvc.delegateSr(
      req.params.id,
      { toUserId: req.body.toUserId, reason: req.body.reason },
      actorId(req),
    );
    res.json({ success: true, data: ticket });
  } catch (err) {
    fail(res, err);
  }
};

export const parentClose = async (req: AuthRequest, res: Response) => {
  try {
    const ticket = await srSvc.parentCloseSr(
      req.params.id,
      {
        satisfied: !!req.body.satisfied,
        comments: req.body.comments,
        rating:
          req.body.rating != null ? Number(req.body.rating) : undefined,
      },
      actorId(req),
    );
    res.json({ success: true, data: ticket });
  } catch (err) {
    fail(res, err);
  }
};

export const reopen = async (req: AuthRequest, res: Response) => {
  try {
    const ticket = await srSvc.reopenSr(
      req.params.id,
      { reason: req.body.reason },
      actorId(req),
    );
    res.json({ success: true, data: ticket });
  } catch (err) {
    fail(res, err);
  }
};

// ── Recompute open SR TATs (#13) ─────────────────────────────────────────────
export const recomputeTat = async (req: AuthRequest, res: Response) => {
  try {
    const projectId = String(
      req.query.projectId || req.body?.projectId || req.user?.projectId || "",
    );
    const result = await recomputeSrTat(projectId);
    res.json({ success: true, data: result });
  } catch (err) {
    fail(res, err);
  }
};

// ── SR notification templates (#9) ───────────────────────────────────────────
export const listNotificationTemplates = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const projectId = String(req.query.projectId || req.user?.projectId || "");
    if (!projectId) throw new SrError("projectId is required", 400);
    const stored = await SrNotificationTemplate.find({ projectId }).lean();
    const byEvent = new Map(stored.map((t: any) => [t.event, t]));
    // Return one row per known event (stored or empty default) so the UI can
    // render the full list without guessing.
    const data = SR_NOTIFICATION_EVENTS.map((event) => {
      const t: any = byEvent.get(event);
      return {
        event,
        enabled: t?.enabled ?? false,
        subject: t?.subject ?? "",
        body: t?.body ?? "",
        toParent: t?.toParent ?? false,
        ccUsers: (t?.ccUsers || []).map(String),
        ccRoles: (t?.ccRoles || []).map(String),
      };
    });
    res.json({ success: true, data });
  } catch (err) {
    fail(res, err);
  }
};

export const upsertNotificationTemplate = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const projectId = String(req.body.projectId || req.user?.projectId || "");
    const event = String(req.body.event || "");
    if (!projectId) throw new SrError("projectId is required", 400);
    if (!SR_NOTIFICATION_EVENTS.includes(event as any)) {
      throw new SrError("Invalid notification event", 400);
    }
    const toOids = (arr: any) =>
      Array.isArray(arr)
        ? arr
            .filter((id: any) => mongoose.Types.ObjectId.isValid(String(id)))
            .map((id: any) => new mongoose.Types.ObjectId(String(id)))
        : [];
    const doc = await SrNotificationTemplate.findOneAndUpdate(
      { projectId: new mongoose.Types.ObjectId(projectId), event },
      {
        $set: {
          enabled: !!req.body.enabled,
          subject: String(req.body.subject || ""),
          body: String(req.body.body || ""),
          toParent: !!req.body.toParent,
          ccUsers: toOids(req.body.ccUsers),
          ccRoles: toOids(req.body.ccRoles),
          updatedBy: req.user?.userId,
        },
        $setOnInsert: { createdBy: req.user?.userId },
      },
      { upsert: true, new: true, runValidators: true },
    );
    res.json({ success: true, data: doc });
  } catch (err) {
    fail(res, err);
  }
};

export const cancel = async (req: AuthRequest, res: Response) => {
  try {
    const ticket = await srSvc.cancelSr(req.params.id, actorId(req), {
      reason: req.body.reason,
      replacementSrId: req.body.replacementSrId,
    });
    res.json({ success: true, data: ticket });
  } catch (err) {
    fail(res, err);
  }
};

export const pslCall = async (req: AuthRequest, res: Response) => {
  try {
    const ticket = await srSvc.pslSatisfactionCall(
      req.params.id,
      {
        spoken: !!req.body.spoken,
        parentSatisfied: req.body.parentSatisfied,
        comments: req.body.comments,
      },
      actorId(req),
    );
    res.json({ success: true, data: ticket });
  } catch (err) {
    fail(res, err);
  }
};

export const checkDuplicates = async (req: AuthRequest, res: Response) => {
  try {
    const projectId = String(req.query.projectId || "");
    const dupes = await srSvc.checkSrDuplicates({
      projectId,
      subCategoryId: String(req.query.subCategoryId || ""),
      studentUserId: req.query.studentUserId
        ? String(req.query.studentUserId)
        : undefined,
      studentEnrollment: req.query.studentEnrollment
        ? String(req.query.studentEnrollment)
        : undefined,
    });
    // Surface the per-project, editable duplicate message when a match exists.
    let message: string | undefined;
    if (dupes.length && projectId) {
      const cfg = await getSrConfigForProject(projectId);
      message = cfg.messages?.duplicate || undefined;
    }
    res.json({ success: true, data: dupes, message });
  } catch (err) {
    fail(res, err);
  }
};

// ── Phase 3: list & detail ───────────────────────────────────────────────────

const str = (v: any): string | undefined =>
  v === undefined || v === null ? undefined : String(v);

export const list = async (req: AuthRequest, res: Response) => {
  try {
    const loggedInProjectId = req.user?.projectId
      ? String(req.user.projectId)
      : undefined;
    const data = await srSvc.listServiceRequests({
      projectId: str(req.query.projectId) || loggedInProjectId,
      interactionType: str(req.query.interactionType),
      viewScope: str(req.query.viewScope) as any,
      status: str(req.query.status),
      assignedTo: str(req.query.assignedTo),
      search: str(req.query.search),
      createdFrom: str(req.query.createdFrom),
      createdTo: str(req.query.createdTo),
      updatedFrom: str(req.query.updatedFrom),
      updatedTo: str(req.query.updatedTo),
      priority: str(req.query.priority),
      wipFrom: str(req.query.wipFrom),
      wipTo: str(req.query.wipTo),
      wipState: str(req.query.wipState),
      source: str(req.query.source),
      classification: str(req.query.classification),
      categoryId: str(req.query.categoryId),
      linkedIsrState: str(req.query.linkedIsrState),
      sortBy: str(req.query.sortBy),
      sortOrder: str(req.query.sortOrder),
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      scope: getProjectScope(req),
      viewerId: req.user?.userId,
      viewerEmail: req.user?.email,
      access: srAccess(req),
    });
    res.json({ success: true, ...data });
  } catch (err) {
    fail(res, err);
  }
};

export const getOne = async (req: AuthRequest, res: Response) => {
  try {
    const data = await srSvc.getServiceRequest(
      req.params.id,
      getProjectScope(req),
      {
        userId: req.user?.userId,
        email: req.user?.email,
        access: srAccess(req),
      },
    );
    res.json({ success: true, data });
  } catch (err) {
    fail(res, err);
  }
};

export const linkedIsrs = async (req: AuthRequest, res: Response) => {
  try {
    const data = await srSvc.listLinkedIsrs(
      req.params.id,
      getProjectScope(req),
    );
    res.json({ success: true, ...data });
  } catch (err) {
    fail(res, err);
  }
};

export const linkPsr = async (req: AuthRequest, res: Response) => {
  try {
    const parentTicketId = String(req.body?.parentTicketId || req.body?.psrId || "");
    if (!parentTicketId) {
      res.status(400).json({
        success: false,
        message: "parentTicketId is required",
      });
      return;
    }
    const data = await srSvc.linkIsrToPsr(
      req.params.id,
      parentTicketId,
      getProjectScope(req),
    );
    res.json({ success: true, data });
  } catch (err) {
    fail(res, err);
  }
};

// ── Phase 3: create (online / walk-in), student lookup, form schemas ─────────

export const create = async (req: AuthRequest, res: Response) => {
  try {
    const body = { ...req.body };
    // Strip permission-gated fields the actor isn't allowed to set.
    if (!hasPerm(req, "SR_ASSIGN_EMAILS")) delete body.assignedToEmails;
    if (!hasPerm(req, "SR_PRIORITY_OVERRIDE")) {
      delete body.priority;
      delete body.scheduleDispatchDate;
    }
    if (!hasPerm(req, "SR_OFFLINE_ENTRY")) {
      delete body.createdByRE;
      delete body.requesterEmail;
    }
    const result = await createServiceRequest({
      ...body,
      createdBy: body.createdBy || actorId(req),
      actorId: actorId(req),
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    fail(res, err);
  }
};

export const studentLookup = async (req: AuthRequest, res: Response) => {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) {
      res.json({ success: true, data: [] });
      return;
    }
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const filter: any = {
      $or: [
        { fullName: rx },
        { firstName: rx },
        { lastName: rx },
        { email: rx },
        { uniqueId: rx },
        { mobile: rx },
        { employeeCode: rx },
      ],
    };
    if (req.query.projectId) filter.projects = String(req.query.projectId);
    const users = await User.find(filter)
      .select(
        "firstName lastName fullName email uniqueId mobile registrationSource centreId",
      )
      .limit(20)
      .lean();
    res.json({ success: true, data: users });
  } catch (err) {
    fail(res, err);
  }
};

/**
 * Existing-Parent lookup for the SR wizard. Tries the configured MDM source
 * (parents + children) first; falls back to internal User records grouped by
 * parentMobile so dev/testing works without an MDM endpoint.
 */
export const parentLookup = async (req: AuthRequest, res: Response) => {
  try {
    const q = String(req.query.q || req.query.query || "").trim();
    const projectId = req.query.projectId
      ? String(req.query.projectId)
      : undefined;
    const mdmSourceId = req.query.mdmSourceId
      ? String(req.query.mdmSourceId)
      : undefined;
    const srConfig = projectId ? await getSrConfigForProject(projectId) : null;
    const lookupConfig = srConfig?.psr?.intake?.lookup || {
      source: "auto",
      searchMode: "parent",
      allowDatabaseFallback: true,
    };
    const lookupSource = lookupConfig.source || "auto";
    const explicitParentMdmSourceId =
      mdmSourceId || lookupConfig.parentMdmSourceId || undefined;
    if (q.length < 2) {
      res.json({ success: true, data: [], source: null });
      return;
    }

    // 0) PSR Builder table (local MongoDB mirror — fastest, no live API call)
    if (lookupSource === "psr_builder") {
      const tableId = (lookupConfig as any).psrBuilderTableId;
      if (!tableId) {
        res.json({ success: true, data: [], source: { name: "PSR Builder (no table configured)" }, lookupSource: "psr_builder" });
        return;
      }
      try {
        // Dynamic import to avoid circular deps
        const { searchTable: psrSearch } = await import("../../../controllers/psr/psrBuilderController");
        // Build a mock req/res to reuse the controller
        const db = (await import("mongoose")).default.connection;
        const PsrTable = (await import("../../../models/psr/PsrTable")).default;
        const table = await PsrTable.findById(tableId).lean();
        if (!table) {
          res.json({ success: true, data: [], source: { name: "PSR Builder (table not found)" }, lookupSource: "psr_builder" });
          return;
        }
        const col = db.collection((table as any).targetCollection);
        const searchFields = (table as any).columns?.filter((c: any) => c.searchable).map((c: any) => c.as) || [];
        let mongoQuery: Record<string, unknown> = {};
        if (q && searchFields.length) {
          const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
          mongoQuery = { $or: searchFields.map((f: string) => ({ [f]: { $regex: re } })) };
        }
        const rows = await col.find(mongoQuery, { projection: { _id: 0, _key: 0 } }).limit(25).toArray();
        // Map to ParentOpt format — find name/mobile/email from column names
        const findCol = (row: any, ...patterns: string[]) => {
          for (const p of patterns) {
            const key = Object.keys(row).find(k => k.toLowerCase().includes(p.toLowerCase()));
            if (key && row[key]) return String(row[key]);
          }
          return "";
        };
        const data = rows.map((row: any) => ({
          name: (findCol(row, "first name", "first_name") + " " + findCol(row, "last name", "last_name")).trim() || findCol(row, "name") || "—",
          mobile: findCol(row, "mobile", "phone", "contact"),
          email: findCol(row, "email"),
          school: findCol(row, "school", "centre"),
          parentCode: findCol(row, "guardian id", "guardian_id", "parent id", "parent_id"),
          children: [],
          _raw: row, // include full row for flexible display
        })).filter((r: any) => r.name !== "—" || r.mobile || r.email);
        res.json({ success: true, data, source: { name: (table as any).name || "PSR Builder" }, lookupSource: "psr_builder" });
        return;
      } catch (err: any) {
        console.error("[parentLookup] PSR Builder search failed:", err.message);
        // fall through to MDM
      }
    }
    if (lookupSource === "cache" || lookupSource === "hybrid_cache") {
      const cacheSourceId =
        lookupConfig.cacheMdmSourceId ||
        explicitParentMdmSourceId ||
        undefined;
      if (cacheSourceId) {
        const cached = await searchCachedParentDirectory({
          sourceId: cacheSourceId,
          projectId,
          joinKey: lookupConfig.cacheJoinKey || undefined,
          query: q,
          limit: 25,
        });
        if (cached && (cached.parents.length || lookupSource === "cache")) {
          res.json({
            success: true,
            source: { id: String(cached.source._id), name: cached.source.name },
            lookupSource: "cache",
            data: cached.parents.slice(0, 25),
          });
          return;
        }
      } else if (lookupSource === "cache") {
        res.json({
          success: true,
          source: { id: null, name: "No cached MDM source configured" },
          lookupSource: "cache",
          data: [],
        });
        return;
      }
    }

    // 2) MDM
    if (lookupSource !== "database" && lookupSource !== "cache") {
    try {
      const mdm = await searchParentsFromMDM(
        q,
        projectId,
        explicitParentMdmSourceId,
        lookupConfig.relationship,
      );
      if (mdm) {
        res.json({
          success: true,
          source: { id: String(mdm.source._id), name: mdm.source.name },
          lookupSource: "mdm",
          data: mdm.parents.slice(0, 25),
        });
        return;
      }
    } catch (e: any) {
      // explicit source error → surface; otherwise fall through to internal
      const hasProjectParentMdm = await resolveParentSource(
        explicitParentMdmSourceId,
        projectId,
        (lookupConfig.relationship?.parentDataType || "parents") as any,
      );
      if (hasProjectParentMdm) {
        res.status(502).json({
          success: false,
          message: e.message || "Parent MDM lookup failed",
        });
        return;
      }
    }
    }

    if (
      lookupSource === "cache" ||
      lookupSource === "mdm" ||
      (lookupSource === "auto" && lookupConfig.allowDatabaseFallback === false)
    ) {
      res.json({
        success: true,
        source: { id: null, name: "No configured lookup source returned data" },
        lookupSource,
        data: [],
      });
      return;
    }

    // 2) Internal fallback — group internal users by parentMobile. A user whose
    // uniqueId is "GUARDIAN" (or whose own mobile is the family key) supplies the
    // parent identity; the rest of the group are the children. We first match by
    // the query, then pull the FULL sibling set for the matched family keys so
    // selecting a parent always returns every child.
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const sel =
      "firstName lastName fullName email mobile parentMobile uniqueId department";
    const matchFilter: any = {
      $or: [
        { fullName: rx },
        { firstName: rx },
        { lastName: rx },
        { email: rx },
        { uniqueId: rx },
        { mobile: rx },
        { parentMobile: rx },
      ],
    };
    if (projectId) matchFilter.projects = projectId;
    const matched = await User.find(matchFilter).select(sel).limit(60).lean();

    // Family keys = parentMobile (preferred) or own mobile of matched users.
    const keys = Array.from(
      new Set(
        (matched as any[])
          .map((u) => u.parentMobile || u.mobile)
          .filter(Boolean),
      ),
    );
    if (keys.length === 0) {
      res.json({
        success: true,
        source: { id: null, name: "Internal directory (fallback)" },
        lookupSource: "database",
        data: [],
      });
      return;
    }

    const memberFilter: any = {
      $or: [{ parentMobile: { $in: keys } }, { mobile: { $in: keys } }],
    };
    if (projectId) memberFilter.projects = projectId;
    const members = await User.find(memberFilter).select(sel).limit(300).lean();

    const nameOf = (u: any) =>
      u.fullName || `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email;
    const isGuardian = (u: any, key: string) =>
      String(u.uniqueId || "").toUpperCase().includes("GUARDIAN") ||
      (u.mobile === key && !u.parentMobile);

    const groups = new Map<
      string,
      { guardian: any | null; children: any[] }
    >();
    for (const u of members as any[]) {
      const key = u.parentMobile || u.mobile;
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, { guardian: null, children: [] });
      const g = groups.get(key)!;
      if (isGuardian(u, key) && !g.guardian) g.guardian = u;
      else g.children.push(u);
    }

    const data = Array.from(groups.entries()).map(([key, g]) => {
      const gd = g.guardian;
      // If a guardian record exists but ended up with zero children (e.g. only
      // the guardian matched), still show it.
      const kids = g.children.length
        ? g.children
        : gd
          ? []
          : members.filter((m: any) => (m.parentMobile || m.mobile) === key);
      return {
        name: gd ? nameOf(gd) : kids[0] ? nameOf(kids[0]) : key,
        mobile: key,
        email: gd?.email || kids[0]?.email,
        school: gd?.department || undefined,
        parentCode: key,
        children: kids.map((c: any) => ({
          id: String(c._id),
          name: nameOf(c),
          // demo/dev seed stores grade in department; real users fall back to uniqueId
          grade: c.department || c.uniqueId || "",
          enrollmentId: c.uniqueId,
        })),
      };
    });

    res.json({
      success: true,
      source: { id: null, name: "Internal directory (fallback)" },
      lookupSource: "database",
      data: data.slice(0, 25),
    });
  } catch (err) {
    fail(res, err);
  }
};

export const listForms = async (req: AuthRequest, res: Response) => {
  try {
    const projectId = String(req.query.projectId || "");
    res.json({ success: true, data: await listFormSchemas(projectId) });
  } catch (err) {
    fail(res, err);
  }
};

export const formMdmOptions = async (req: AuthRequest, res: Response) => {
  try {
    const sourceId = String(req.query.sourceId || req.query.mdmSourceId || "");
    if (!sourceId) throw new SrError("sourceId is required", 400);

    const result = await fetchMdmOptions({
      sourceId,
      projectId: req.query.projectId ? String(req.query.projectId) : undefined,
      dataType: (req.query.dataType ? String(req.query.dataType) : "custom") as any,
      labelField: req.query.labelField ? String(req.query.labelField) : undefined,
      valueField: req.query.valueField ? String(req.query.valueField) : undefined,
      search: req.query.search ? String(req.query.search) : undefined,
      searchParam: req.query.searchParam ? String(req.query.searchParam) : undefined,
      dependsOnValue: req.query.dependsOnValue
        ? String(req.query.dependsOnValue)
        : undefined,
      dependsOnParam: req.query.dependsOnParam
        ? String(req.query.dependsOnParam)
        : undefined,
      dependsOnRemoteField: req.query.dependsOnRemoteField
        ? String(req.query.dependsOnRemoteField)
        : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });

    res.json({
      success: true,
      source: { id: String(result.source._id), name: result.source.name },
      data: result.data,
    });
  } catch (err) {
    fail(res, err);
  }
};

export const saveForm = async (req: AuthRequest, res: Response) => {
  try {
    const saved = await upsertFormSchema(
      req.body.projectId,
      req.body.schema || req.body,
    );
    res.json({ success: true, data: saved });
  } catch (err) {
    fail(res, err);
  }
};

export const removeForm = async (req: AuthRequest, res: Response) => {
  try {
    await deleteFormSchema(
      req.body.projectId || String(req.query.projectId || ""),
      req.params.schemaId,
    );
    res.json({ success: true });
  } catch (err) {
    fail(res, err);
  }
};

// ── Phase 3: per-project SR config (enable + WIP limits) ─────────────────────

export const getConfig = async (req: AuthRequest, res: Response) => {
  try {
    const projectId = String(req.query.projectId || "");
    if (!projectId) throw new SrError("projectId is required", 400);
    res.json({ success: true, data: await getSrConfigForProject(projectId) });
  } catch (err) {
    fail(res, err);
  }
};

export const updateConfig = async (req: AuthRequest, res: Response) => {
  try {
    const { projectId, ...patch } = req.body;
    if (!projectId) throw new SrError("projectId is required", 400);
    const data = await updateSrConfigForProject(projectId, patch, actorId(req));
    res.json({ success: true, data });
  } catch (err) {
    fail(res, err);
  }
};

/**
 * Test PSR entity-scope routing: given a scope tuple (e.g. { school, grade, subject }),
 * resolve the owning staff from the configured owner-map table. Lets admins verify
 * their column mapping before it drives live assignment (Phase A).
 */
export const testPsrRouting = async (req: AuthRequest, res: Response) => {
  try {
    const projectId = String(req.body?.projectId || req.query.projectId || "");
    if (!projectId) throw new SrError("projectId is required", 400);
    const scope = (req.body?.scope || {}) as Record<string, string>;
    if (!scope || typeof scope !== "object" || !Object.keys(scope).length) {
      throw new SrError("scope object is required (e.g. { school, grade, subject })", 400);
    }
    const cfg: any = await getSrConfigForProject(projectId);
    const routing = cfg?.psr?.workflow?.routing;
    const result = await resolveScopeOwners(routing, scope, projectId);
    res.json({
      success: true,
      data: {
        routingEnabled: !!routing?.enabled,
        matched: !!result.matchedRow,
        holders: result.holders,
        owners: result.owners,
        matchedRow: result.matchedRow,
      },
    });
  } catch (err) {
    fail(res, err);
  }
};

export const testLeadCrmConfig = async (req: AuthRequest, res: Response) => {
  try {
    const cfg = req.body?.leadSync || req.body?.crm?.leadSync || {};
    const endpoint = String(cfg.endpoint || cfg.apiUrl || cfg.webhookUrl || "");
    if (!endpoint) throw new SrError("CRM endpoint is required", 400);
    if (cfg.bodyTemplate && typeof cfg.bodyTemplate === "string") {
      try {
        JSON.parse(cfg.bodyTemplate);
      } catch {
        throw new SrError("Request body JSON is invalid", 400);
      }
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(cfg.headers && typeof cfg.headers === "object" ? cfg.headers : {}),
    };
    if (cfg.authHeaderName && cfg.authHeaderValue) {
      headers[String(cfg.authHeaderName)] = String(cfg.authHeaderValue);
    }

    const sampleLead = req.body?.payload || {
      _id: "test-lead",
      projectId: req.body?.projectId,
      name: "Vivek Mishra",
      firstName: "Vivek",
      lastName: "Mishra",
      email: "vivek9936234412@gmail.com",
      contactNumber: "9936234412",
      mobile: "9936234412",
      studentName: "test",
      studentFirstName: "test",
      studentLastName: "test",
      grade: "Jr.KG",
      gradeId: 15,
      schoolLocationId: 23,
      schoolLocation: "VIBGYOR Kids and High - Lucknow",
      academicYearId: 4,
      academicYear: "2026 - 27",
      enquiryNo: "TEST-CRM",
      source: "settings_test",
      status: "new",
      notes: "CRM API test from SR settings",
      createdAt: new Date().toISOString(),
    };
    const timeoutMs = Math.max(
      5000,
      Math.min(Number(cfg.timeoutMs || 30000), 120000),
    );
    const payload = buildLeadCrmPayload(sampleLead, { name: "CRM Test" }, cfg);

    const startedAt = Date.now();
    const response = await axios.request({
      method: String(cfg.method || "POST").toUpperCase() as any,
      url: endpoint,
      data: payload,
      headers,
      timeout: timeoutMs,
      validateStatus: () => true,
    });

    const ok = response.status >= 200 && response.status < 300;
    res.status(ok ? 200 : 502).json({
      success: ok,
      status: response.status,
      durationMs: Date.now() - startedAt,
      message: ok
        ? "CRM API test succeeded."
        : `CRM API returned HTTP ${response.status}`,
      response:
        response.data && typeof response.data === "object"
          ? response.data
          : { body: response.data },
    });
  } catch (err: any) {
    const isTimeout = err?.code === "ECONNABORTED";
    res.status(502).json({
      success: false,
      message: isTimeout
        ? "CRM API test timed out before the CRM responded. Increase timeout or ask CRM team to check endpoint latency."
        : err?.message || "CRM API test failed",
      code: err?.code,
    });
  }
};
