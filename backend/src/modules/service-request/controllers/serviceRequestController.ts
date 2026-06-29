/**
 * Service Request (PSR/ISR) — HTTP controller. Phase 2.
 * Thin layer over the lifecycle service; permission gating lives on the routes.
 */
import { Response } from "express";
import { AuthRequest } from "../../../middleware/auth";
import { User } from "../../../models/User";
import { getProjectScope } from "../../../utils/projectScope";
import * as srSvc from "../serviceRequestService";
import { SrError } from "../serviceRequestService";
import { createServiceRequest } from "../createServiceRequest";
import { searchParentsFromMDM } from "../../../services/mdmService";
import {
  listFormSchemas,
  upsertFormSchema,
  deleteFormSchema,
} from "../srForms";
import {
  getSrConfigForProject,
  updateSrConfigForProject,
} from "../srConfigAdmin";

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
      { satisfied: !!req.body.satisfied, comments: req.body.comments },
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
    const dupes = await srSvc.checkSrDuplicates({
      projectId: String(req.query.projectId || ""),
      subCategoryId: String(req.query.subCategoryId || ""),
      studentUserId: req.query.studentUserId
        ? String(req.query.studentUserId)
        : undefined,
      studentEnrollment: req.query.studentEnrollment
        ? String(req.query.studentEnrollment)
        : undefined,
    });
    res.json({ success: true, data: dupes });
  } catch (err) {
    fail(res, err);
  }
};

// ── Phase 3: list & detail ───────────────────────────────────────────────────

const str = (v: any): string | undefined =>
  v === undefined || v === null ? undefined : String(v);

export const list = async (req: AuthRequest, res: Response) => {
  try {
    const data = await srSvc.listServiceRequests({
      projectId: str(req.query.projectId),
      interactionType: str(req.query.interactionType),
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
    const psrId = String(req.body?.psrId || "");
    if (!psrId) {
      res.status(400).json({ success: false, message: "psrId is required" });
      return;
    }
    const data = await srSvc.linkIsrToPsr(
      req.params.id,
      psrId,
      getProjectScope(req),
    );
    res.json({ success: true, data });
  } catch (err) {
    fail(res, err);
  }
};

// ── Phase 3: create (online / walk-in), student lookup, form schemas ─────────

const hasPerm = (req: AuthRequest, code: string): boolean => {
  const role: any = req.user?.role;
  if (!role) return false;
  if (role.code === "SUPER_ADMIN" || role.code === "ADMIN") return true;
  const perms = role.permissions || [];
  return perms.some((p: any) => (typeof p === "string" ? p : p?.code) === code);
};

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
    if (q.length < 2) {
      res.json({ success: true, data: [], source: null });
      return;
    }

    // 1) MDM
    try {
      const mdm = await searchParentsFromMDM(q, projectId, mdmSourceId);
      if (mdm) {
        res.json({
          success: true,
          source: { id: String(mdm.source._id), name: mdm.source.name },
          data: mdm.parents.slice(0, 25),
        });
        return;
      }
    } catch (e: any) {
      // explicit source error → surface; otherwise fall through to internal
      if (mdmSourceId) {
        res.status(502).json({ success: false, message: e.message });
        return;
      }
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
