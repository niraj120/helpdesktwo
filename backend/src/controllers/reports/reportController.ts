// @ts-nocheck
import { Request, Response } from "express";
import mongoose from "mongoose";
import { ReportModulePermission } from "../../models/reports/ReportModulePermission";
import {
  ReportDataPoint,
  SYSTEM_DATA_POINTS,
} from "../../models/reports/ReportDataPoint";
import { ReportDataPointAccess } from "../../models/reports/ReportDataPointAccess";
import { SavedReport } from "../../models/reports/SavedReport";
import { ReportAssignment } from "../../models/reports/ReportAssignment";
import {
  runReportQuery,
  applyDataPointRbac,
} from "../../services/reportQueryService";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function getUserRoleInfo(userId: string) {
  const User = mongoose.model("User");
  const user = await User.findById(userId).populate("role").lean();
  if (!user) return null;
  const role = user.role as any;
  return {
    roleId: role?._id?.toString(),
    roleCode: role?.code ?? "",
    roleName: role?.name ?? "",
    isSuperAdmin: role?.code === "SUPER_ADMIN",
  };
}

const ADMIN_ROLE_CODES = ["SUPER_ADMIN", "ACCOUNT_OWNER", "SUPPORT_ADMIN"];

/**
 * Returns the list of project IDs the caller is allowed to access.
 * Returns null for admins (all projects allowed).
 */
async function getCallerAllowedProjectIds(
  userId: string,
): Promise<string[] | null> {
  const User = mongoose.model("User");
  const user = await User.findById(userId)
    .populate({ path: "role", populate: { path: "projects", select: "_id" } })
    .lean();
  if (!user) return [];
  const role = (user as any).role as any;
  if (!role || ADMIN_ROLE_CODES.includes(role.code)) return null; // null = unrestricted
  const projects: any[] = role.projects ?? [];
  return projects.map((p: any) => p._id?.toString() ?? p.toString());
}

/** Returns the ReportModulePermission for the user's role, or admin defaults for admin roles. */
async function getEffectiveModulePerms(userId: string) {
  const roleInfo = await getUserRoleInfo(userId);
  if (!roleInfo) return null;
  const isAdmin = ADMIN_ROLE_CODES.includes(roleInfo.roleCode);
  if (isAdmin) {
    return {
      canView: true,
      canCreate: true,
      canExport: true,
      canSchedule: true,
      canAssign: true,
      canDelete: true,
    };
  }
  const perm = (await ReportModulePermission.findOne({
    roleId: roleInfo.roleId,
  }).lean()) as any;
  return {
    canView: perm?.canView ?? true,
    canCreate: perm?.canCreate ?? false,
    canExport: perm?.canExport ?? false,
    canSchedule: perm?.canSchedule ?? false,
    canAssign: perm?.canAssign ?? false,
    canDelete: perm?.canDelete ?? false,
  };
}

async function getAllRoles() {
  const Role = mongoose.model("Role");
  return Role.find({ isActive: { $ne: false } })
    .select("_id code name")
    .lean();
}

/**
 * GET /api/reports/my-module-permissions
 * Returns the module permission flags for the currently authenticated user's role.
 * Requires only REPORT_VIEW_TICKETS – no admin permission needed.
 */
export const getMyModulePermissions = async (req: Request, res: Response) => {
  try {
    const perms = await getEffectiveModulePerms(req.user?.userId);
    if (!perms)
      return res.status(401).json({ success: false, message: "Unauthorized" });
    return res.status(200).json({ success: true, data: perms });
  } catch (err: any) {
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// MODULE PERMISSIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/reports/module-permissions
 * Returns the module-level permission matrix for all roles.
 */
export const getModulePermissions = async (req: Request, res: Response) => {
  try {
    const roles = await getAllRoles();

    // Fetch or build docs for each role
    const results = await Promise.all(
      roles.map(async (role: any) => {
        let doc = await ReportModulePermission.findOne({
          roleId: role._id,
        }).lean();
        if (!doc) {
          // Build a default in-memory view (not persisted)
          doc = {
            roleId: role._id,
            roleCode: role.code,
            roleName: role.name,
            canView: true,
            canCreate: role.code === "SUPER_ADMIN" || role.code === "MANAGER",
            canExport: role.code === "SUPER_ADMIN" || role.code === "MANAGER",
            canSchedule: role.code === "SUPER_ADMIN",
            canAssign: role.code === "SUPER_ADMIN" || role.code === "MANAGER",
            canDelete: role.code === "SUPER_ADMIN",
          };
        }
        return { ...doc, roleCode: role.code, roleName: role.name };
      }),
    );

    return res.status(200).json({ success: true, data: results });
  } catch (err: any) {
    console.error("getModulePermissions error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

/**
 * PUT /api/reports/module-permissions/:roleId
 */
export const updateModulePermission = async (req: Request, res: Response) => {
  try {
    const { roleId } = req.params;
    const { canView, canCreate, canExport, canSchedule, canAssign, canDelete } =
      req.body;

    if (!mongoose.Types.ObjectId.isValid(roleId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid roleId" });
    }

    const Role = mongoose.model("Role");
    const role = await Role.findById(roleId).lean();
    if (!role)
      return res
        .status(404)
        .json({ success: false, message: "Role not found" });

    const doc = await ReportModulePermission.findOneAndUpdate(
      { roleId },
      {
        roleId,
        roleCode: (role as any).code,
        roleName: (role as any).name,
        canView: canView ?? true,
        canCreate: canCreate ?? false,
        canExport: canExport ?? false,
        canSchedule: canSchedule ?? false,
        canAssign: canAssign ?? false,
        canDelete: canDelete ?? false,
      },
      { upsert: true, new: true, runValidators: true },
    );

    return res.status(200).json({ success: true, data: doc });
  } catch (err: any) {
    console.error("updateModulePermission error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DATA POINTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/reports/data-points
 */
export const getDataPoints = async (req: Request, res: Response) => {
  try {
    // Always upsert system data points so newly added ones are reflected without manual seeding
    const ops = SYSTEM_DATA_POINTS.map((dp) => ({
      updateOne: {
        filter: { key: dp.key },
        update: { $set: dp },
        upsert: true,
      },
    }));
    await ReportDataPoint.bulkWrite(ops);
    const dataPoints = await ReportDataPoint.find({ isActive: true })
      .sort({ category: 1, order: 1 })
      .lean();
    return res.status(200).json({ success: true, data: dataPoints });
  } catch (err: any) {
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

/**
 * POST /api/reports/data-points/seed
 * Upserts the system data points from SYSTEM_DATA_POINTS.
 */
export const seedDataPoints = async (req: Request, res: Response) => {
  try {
    const ops = SYSTEM_DATA_POINTS.map((dp) => ({
      updateOne: {
        filter: { key: dp.key },
        update: { $set: dp },
        upsert: true,
      },
    }));
    const result = await ReportDataPoint.bulkWrite(ops);
    return res.status(200).json({
      success: true,
      message: `Data points seeded: ${result.upsertedCount} inserted, ${result.modifiedCount} updated`,
    });
  } catch (err: any) {
    console.error("seedDataPoints error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

/**
 * GET /api/reports/data-point-access/:roleId
 */
export const getDataPointAccess = async (req: Request, res: Response) => {
  try {
    const { roleId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(roleId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid roleId" });
    }

    const allDataPoints = await ReportDataPoint.find({ isActive: true }).lean();
    let access = await ReportDataPointAccess.findOne({ roleId }).lean();

    if (!access) {
      // Build sensible defaults: admins get everything, others get ticket-only
      const Role = mongoose.model("Role");
      const role = await Role.findById(roleId).lean();
      const code = (role as any)?.code ?? "";
      const isTrusted =
        code === "SUPER_ADMIN" || code === "ADMIN" || code === "MANAGER";
      const allowedDataPoints = isTrusted
        ? allDataPoints.map((d: any) => d.key)
        : allDataPoints
            .filter((d: any) => d.category === "ticket")
            .map((d: any) => d.key);
      access = { roleId, roleCode: code, allowedDataPoints } as any;
    }

    return res.status(200).json({ success: true, data: access, allDataPoints });
  } catch (err: any) {
    console.error("getDataPointAccess error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

/**
 * GET /api/reports/data-point-access
 * Returns access for ALL roles (for the matrix UI).
 */
export const getAllDataPointAccess = async (req: Request, res: Response) => {
  try {
    const [roles, allDataPoints] = await Promise.all([
      getAllRoles(),
      ReportDataPoint.find({ isActive: true })
        .sort({ category: 1, order: 1 })
        .lean(),
    ]);

    const accessList = await ReportDataPointAccess.find({}).lean();
    const accessMap: Record<string, string[]> = {};
    for (const a of accessList) {
      accessMap[(a as any).roleId.toString()] = (a as any).allowedDataPoints;
    }

    // Fill in defaults for roles without a doc
    const result = roles.map((role: any) => {
      const rid = role._id.toString();
      let allowed = accessMap[rid];
      if (!allowed) {
        const isTrusted =
          role.code === "SUPER_ADMIN" ||
          role.code === "ADMIN" ||
          role.code === "MANAGER";
        allowed = isTrusted
          ? (allDataPoints as any[]).map((d) => d.key)
          : (allDataPoints as any[])
              .filter((d) => d.category === "ticket")
              .map((d) => d.key);
      }
      return {
        roleId: rid,
        roleCode: role.code,
        roleName: role.name,
        allowedDataPoints: allowed,
      };
    });

    return res.status(200).json({ success: true, data: result, allDataPoints });
  } catch (err: any) {
    console.error("getAllDataPointAccess error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

/**
 * PUT /api/reports/data-point-access/:roleId
 */
export const updateDataPointAccess = async (req: Request, res: Response) => {
  try {
    const { roleId } = req.params;
    const { allowedDataPoints } = req.body;

    if (!mongoose.Types.ObjectId.isValid(roleId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid roleId" });
    }
    if (!Array.isArray(allowedDataPoints)) {
      return res.status(400).json({
        success: false,
        message: "allowedDataPoints must be an array",
      });
    }

    const Role = mongoose.model("Role");
    const role = await Role.findById(roleId).lean();
    if (!role)
      return res
        .status(404)
        .json({ success: false, message: "Role not found" });

    const doc = await ReportDataPointAccess.findOneAndUpdate(
      { roleId },
      { roleId, roleCode: (role as any).code, allowedDataPoints },
      { upsert: true, new: true, runValidators: true },
    );

    return res.status(200).json({ success: true, data: doc });
  } catch (err: any) {
    console.error("updateDataPointAccess error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SAVED REPORTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/reports/saved
 */
export const getSavedReports = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const page = parseInt((req.query.page as string) ?? "1", 10);
    const pageSize = parseInt((req.query.pageSize as string) ?? "20", 10);
    const search = (req.query.search as string) ?? "";

    const roleInfo = await getUserRoleInfo(userId);
    const filter: any = { isActive: true };
    if (!roleInfo?.isSuperAdmin) {
      filter.createdBy = new mongoose.Types.ObjectId(userId);
    }
    if (search) filter.name = { $regex: search, $options: "i" };

    // Auto project scoping: restrict to caller's allowed projects
    const callerRole = (req as any).user?.role;
    const isSuperAdmin =
      callerRole?.code === "SUPER_ADMIN" || callerRole?.name === "Super Admin";
    if (!isSuperAdmin && callerRole?.projects?.length > 0) {
      const allowedIds = callerRole.projects.map(
        (p: any) => new mongoose.Types.ObjectId(p._id || p),
      );
      filter.projectId = { $in: allowedIds };
    }

    const [reports, total] = await Promise.all([
      SavedReport.find(filter)
        .populate("createdBy", "firstName lastName email")
        .sort({ updatedAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      SavedReport.countDocuments(filter),
    ]);

    // Attach assignment counts
    const reportIds = reports.map((r: any) => r._id);
    const assignments = await ReportAssignment.find({
      reportId: { $in: reportIds },
    }).lean();
    const assignMap: Record<string, any> = {};
    for (const a of assignments) assignMap[(a as any).reportId.toString()] = a;

    const data = reports.map((r: any) => ({
      ...r,
      assignment: assignMap[r._id.toString()] ?? null,
      assignedUsersCount:
        assignMap[r._id.toString()]?.assignedToUsers?.length ?? 0,
      assignedRolesCount:
        assignMap[r._id.toString()]?.assignedToRoles?.length ?? 0,
    }));

    return res.status(200).json({ success: true, data, total, page, pageSize });
  } catch (err: any) {
    console.error("getSavedReports error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

/**
 * GET /api/reports/saved/:id
 */
export const getSavedReport = async (req: Request, res: Response) => {
  try {
    const report = await SavedReport.findById(req.params.id)
      .populate("createdBy", "firstName lastName email")
      .lean();
    if (!report)
      return res
        .status(404)
        .json({ success: false, message: "Report not found" });
    return res.status(200).json({ success: true, data: report });
  } catch (err: any) {
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

/**
 * POST /api/reports/saved
 */
export const createSavedReport = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const perms = await getEffectiveModulePerms(userId);
    if (!perms?.canCreate) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to create reports",
      });
    }
    const {
      name,
      description,
      dataPoints,
      filters,
      sortBy,
      sortOrder,
      projectId,
    } = req.body;

    if (!name || !Array.isArray(dataPoints) || dataPoints.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "name and dataPoints are required" });
    }

    // Enforce project scoping for non-admin callers
    const allowedProjectIds = await getCallerAllowedProjectIds(userId);
    let effectiveProjectId: string | undefined = projectId;
    if (allowedProjectIds !== null) {
      if (!effectiveProjectId) {
        return res.status(400).json({
          success: false,
          message: "Please select a project scope for this report.",
        });
      }
      if (!allowedProjectIds.includes(effectiveProjectId.toString())) {
        return res.status(403).json({
          success: false,
          message: "You do not have access to the selected project.",
        });
      }
    }

    const report = await SavedReport.create({
      name,
      description,
      createdBy: userId,
      projectId: effectiveProjectId || undefined,
      dataPoints,
      filters: filters ?? [],
      sortBy,
      sortOrder,
    });

    return res.status(201).json({ success: true, data: report });
  } catch (err: any) {
    console.error("createSavedReport error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

/**
 * PUT /api/reports/saved/:id
 */
export const updateSavedReport = async (req: Request, res: Response) => {
  try {
    const report = await SavedReport.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true },
    );
    if (!report)
      return res
        .status(404)
        .json({ success: false, message: "Report not found" });
    return res.status(200).json({ success: true, data: report });
  } catch (err: any) {
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

/**
 * DELETE /api/reports/saved/:id
 */
export const deleteSavedReport = async (req: Request, res: Response) => {
  try {
    const perms = await getEffectiveModulePerms(req.user?.userId);
    if (!perms?.canDelete) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to delete reports",
      });
    }
    const report = await SavedReport.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true },
    );
    if (!report)
      return res
        .status(404)
        .json({ success: false, message: "Report not found" });
    // Also remove assignments
    await ReportAssignment.deleteOne({ reportId: req.params.id });
    return res.status(200).json({ success: true, message: "Report deleted" });
  } catch (err: any) {
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// RUN / PREVIEW / EXPORT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/reports/saved/:id/run
 */
export const runReport = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const page = parseInt((req.query.page as string) ?? "1", 10);
    const pageSize = Math.min(
      parseInt((req.query.pageSize as string) ?? "100", 10),
      500,
    );

    const report = await SavedReport.findById(id).lean();
    if (!report || !(report as any).isActive) {
      return res
        .status(404)
        .json({ success: false, message: "Report not found" });
    }

    // RBAC: determine which data points the caller may see
    const roleInfo = await getUserRoleInfo(userId);
    const access = await ReportDataPointAccess.findOne({
      roleId: roleInfo?.roleId,
    }).lean();
    // If no access config exists for this role yet, default to allowing all (permissive default)
    const allowedKeys: string[] | null = access
      ? ((access as any)?.allowedDataPoints ?? [])
      : null;
    const dataPoints =
      allowedKeys === null
        ? (report as any).dataPoints // no access doc → allow all
        : applyDataPointRbac(
            (report as any).dataPoints,
            allowedKeys,
            roleInfo?.isSuperAdmin ?? false,
          );

    const { rows, total } = await runReportQuery(
      dataPoints,
      (report as any).filters ?? [],
      (report as any).sortBy,
      (report as any).sortOrder,
      (report as any).projectId?.toString(),
      page,
      pageSize,
    );

    // Update cache metadata (non-blocking)
    SavedReport.updateOne(
      { _id: id },
      { lastRunAt: new Date(), rowCount: total },
    ).exec();

    return res.status(200).json({
      success: true,
      data: rows,
      meta: {
        total,
        page,
        pageSize,
        pages: Math.ceil(total / pageSize),
        dataPoints,
        strippedDataPoints: (report as any).dataPoints.filter(
          (k: string) => !dataPoints.includes(k),
        ),
      },
    });
  } catch (err: any) {
    console.error("runReport error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

/**
 * POST /api/reports/preview
 * Used by the Report Builder to preview the first 10 rows without saving.
 */
export const previewReport = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { dataPoints, filters = [], sortBy, sortOrder, projectId } = req.body;

    if (!Array.isArray(dataPoints) || dataPoints.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "dataPoints are required" });
    }

    // Enforce project scoping for non-admin callers
    const allowedProjectIds = await getCallerAllowedProjectIds(userId);
    let effectiveProjectId: string | undefined = projectId;
    if (allowedProjectIds !== null) {
      // Caller has restricted project access
      if (!effectiveProjectId) {
        return res.status(400).json({
          success: false,
          message: "Please select a project scope for this report.",
        });
      }
      if (!allowedProjectIds.includes(effectiveProjectId.toString())) {
        return res.status(403).json({
          success: false,
          message: "You do not have access to the selected project.",
        });
      }
    }

    const roleInfo = await getUserRoleInfo(userId);
    const access = await ReportDataPointAccess.findOne({
      roleId: roleInfo?.roleId,
    }).lean();
    // Permissive default: if no access config has been set up yet, allow all requested data points
    const allowedKeys: string[] | null = access
      ? ((access as any)?.allowedDataPoints ?? [])
      : null;
    const filteredKeys =
      allowedKeys === null
        ? dataPoints
        : applyDataPointRbac(
            dataPoints,
            allowedKeys,
            roleInfo?.isSuperAdmin ?? false,
          );

    const { rows, total } = await runReportQuery(
      filteredKeys,
      filters,
      sortBy,
      sortOrder,
      effectiveProjectId,
      1,
      10, // preview is always 10 rows
    );

    return res.status(200).json({
      success: true,
      data: rows,
      meta: { total, dataPoints: filteredKeys },
    });
  } catch (err: any) {
    console.error("previewReport error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

/**
 * GET /api/reports/saved/:id/export
 * Returns a CSV download of the full report result set.
 */
export const exportReport = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    const perms = await getEffectiveModulePerms(userId);
    if (!perms?.canExport) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to export reports",
      });
    }

    const report = await SavedReport.findById(id).lean();
    if (!report || !(report as any).isActive) {
      return res
        .status(404)
        .json({ success: false, message: "Report not found" });
    }

    const roleInfo = await getUserRoleInfo(userId);
    const access = await ReportDataPointAccess.findOne({
      roleId: roleInfo?.roleId,
    }).lean();
    // Permissive default: if no access config has been set up yet, allow all
    const allowedKeys: string[] | null = access
      ? ((access as any)?.allowedDataPoints ?? [])
      : null;
    const dataPoints =
      allowedKeys === null
        ? (report as any).dataPoints
        : applyDataPointRbac(
            (report as any).dataPoints,
            allowedKeys,
            roleInfo?.isSuperAdmin ?? false,
          );

    // Fetch all rows (up to 10,000 for CSV safety)
    const { rows } = await runReportQuery(
      dataPoints,
      (report as any).filters ?? [],
      (report as any).sortBy,
      (report as any).sortOrder,
      (report as any).projectId?.toString(),
      1,
      10_000,
    );

    // Get data point labels for CSV header
    const dpDocs = await ReportDataPoint.find({
      key: { $in: dataPoints },
    }).lean();
    const labelMap: Record<string, string> = {};
    for (const dp of dpDocs) labelMap[(dp as any).key] = (dp as any).label;

    // Build CSV
    const header = dataPoints.map((k) => labelMap[k] ?? k).join(",");
    const csvRows = rows.map((row) =>
      dataPoints
        .map((k) => {
          const val = row[k];
          if (val === null || val === undefined) return "";
          const str = Array.isArray(val) ? val.join("; ") : String(val);
          // Escape commas/quotes
          return str.includes(",") || str.includes('"') || str.includes("\n")
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        })
        .join(","),
    );

    const csv = [header, ...csvRows].join("\n");
    const filename = `${(report as any).name.replace(/[^a-z0-9]/gi, "_")}_${Date.now()}.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (err: any) {
    console.error("exportReport error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ASSIGNMENTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/reports/project-users
 * Returns users scoped to the caller's allowed projects (for the Assign Reports UI).
 * Super-admins get all active users.
 */
export const getAssignableReportUsers = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const allowedProjectIds = await getCallerAllowedProjectIds(userId);
    const User = mongoose.model("User");

    let users: any[];
    if (allowedProjectIds === null) {
      // Admin — return all active users
      users = await User.find({ isActive: true })
        .select("_id firstName lastName email")
        .sort({ firstName: 1 })
        .lean();
    } else {
      // Non-admin — return users whose role belongs to any of their allowed projects
      const Role = mongoose.model("Role");
      const rolesInProjects = await Role.find({
        projects: {
          $in: allowedProjectIds.map((id) => new mongoose.Types.ObjectId(id)),
        },
        isActive: true,
      })
        .select("_id")
        .lean();
      const roleIds = rolesInProjects.map((r: any) => r._id);
      users = await User.find({ isActive: true, role: { $in: roleIds } })
        .select("_id firstName lastName email")
        .sort({ firstName: 1 })
        .lean();
    }

    return res.status(200).json({ success: true, data: users });
  } catch (err: any) {
    console.error("getAssignableReportUsers error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

/**
 * GET /api/reports/assignments
 */
export const getAssignments = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const roleInfo = await getUserRoleInfo(userId);
    // Non-admins only see assignments for reports they created
    const reportFilter: any = {};
    if (
      !roleInfo?.isSuperAdmin &&
      !ADMIN_ROLE_CODES.includes(roleInfo?.roleCode ?? "")
    ) {
      const myReports = await (mongoose.model("SavedReport") as any)
        .find({
          createdBy: new mongoose.Types.ObjectId(userId),
          isActive: true,
        })
        .select("_id")
        .lean();
      reportFilter.reportId = { $in: myReports.map((r: any) => r._id) };
    }
    const assignments = await ReportAssignment.find(reportFilter)
      .populate("reportId", "name description")
      .populate("assignedToUsers", "firstName lastName email")
      .populate("assignedToRoles", "name code")
      .populate("assignedBy", "firstName lastName email")
      .lean();
    return res.status(200).json({ success: true, data: assignments });
  } catch (err: any) {
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

/**
 * GET /api/reports/assignments/:reportId
 */
export const getReportAssignment = async (req: Request, res: Response) => {
  try {
    const { reportId } = req.params;
    const assignment = await ReportAssignment.findOne({ reportId })
      .populate("assignedToUsers", "firstName lastName email")
      .populate("assignedToRoles", "name code")
      .lean();
    return res.status(200).json({ success: true, data: assignment ?? null });
  } catch (err: any) {
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

/**
 * PUT /api/reports/assignments/:reportId
 * Upserts assignment (replaces users/roles lists).
 */
export const updateReportAssignment = async (req: Request, res: Response) => {
  try {
    const { reportId } = req.params;
    const userId = req.user?.userId;
    const {
      assignedToUsers = [],
      assignedToRoles = [],
      alertEnabled,
      scheduleType,
      scheduleDay,
      scheduleTime,
      ccUsers,
      ccEmails,
    } = req.body;

    const perms = await getEffectiveModulePerms(userId);
    if (!perms?.canAssign) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to assign reports",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(reportId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid reportId" });
    }

    const report = await SavedReport.findById(reportId).lean();
    if (!report)
      return res
        .status(404)
        .json({ success: false, message: "Report not found" });

    const updatePayload: Record<string, any> = {
      reportId,
      assignedToUsers,
      assignedToRoles,
      assignedBy: userId,
      assignedAt: new Date(),
    };
    if (alertEnabled !== undefined) updatePayload.alertEnabled = alertEnabled;
    if (scheduleType !== undefined) updatePayload.scheduleType = scheduleType;
    if (scheduleDay !== undefined) updatePayload.scheduleDay = scheduleDay;
    if (scheduleTime !== undefined) updatePayload.scheduleTime = scheduleTime;
    if (ccUsers !== undefined) updatePayload.ccUsers = ccUsers;
    if (ccEmails !== undefined) updatePayload.ccEmails = ccEmails;

    const doc = await ReportAssignment.findOneAndUpdate(
      { reportId },
      updatePayload,
      { upsert: true, new: true, runValidators: true },
    );

    // Register or destroy the alert cron task based on alertEnabled flag
    try {
      const { registerReportAlertTask, destroyReportAlertTask } = await import(
        "../../services/reports/reportAlertScheduler"
      );
      if (doc?.alertEnabled) {
        registerReportAlertTask(doc);
      } else {
        destroyReportAlertTask(reportId);
      }
    } catch (schedErr) {
      console.error("Report alert scheduler hook error:", schedErr);
      // Non-fatal — assignment saved, scheduler update failed
    }

    return res.status(200).json({ success: true, data: doc });
  } catch (err: any) {
    console.error("updateReportAssignment error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

/**
 * POST /api/reports/assignments/:reportId/test-alert
 * Immediately fires the scheduled report email for testing purposes.
 */
export const testReportAlert = async (req: Request, res: Response) => {
  try {
    const { reportId } = req.params;
    const userId = req.user?.userId;

    const perms = await getEffectiveModulePerms(userId);
    if (!perms?.canAssign) {
      return res.status(403).json({ success: false, message: "Permission denied" });
    }

    if (!mongoose.Types.ObjectId.isValid(reportId)) {
      return res.status(400).json({ success: false, message: "Invalid reportId" });
    }

    const { sendAlertNow } = await import(
      "../../services/reports/reportAlertScheduler"
    );
    await sendAlertNow(reportId);

    return res.status(200).json({ success: true, message: "Test alert sent successfully" });
  } catch (err: any) {
    console.error("testReportAlert error:", err);
    return res.status(500).json({ success: false, message: err.message ?? "Failed to send test alert" });
  }
};

/**
 * DELETE /api/reports/assignments/:reportId
 */
export const deleteReportAssignment = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const perms = await getEffectiveModulePerms(userId);
    if (!perms?.canAssign) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to manage report assignments",
      });
    }
    await ReportAssignment.deleteOne({ reportId: req.params.reportId });
    return res
      .status(200)
      .json({ success: true, message: "Assignment removed" });
  } catch (err: any) {
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

/**
 * GET /api/reports/mine
 * Returns reports directly assigned to the current user OR their role.
 */
export const getMyReports = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const roleInfo = await getUserRoleInfo(userId);

    const assignments = await ReportAssignment.find({
      $or: [
        { assignedToUsers: new mongoose.Types.ObjectId(userId) },
        {
          assignedToRoles: roleInfo?.roleId
            ? new mongoose.Types.ObjectId(roleInfo.roleId)
            : { $in: [] },
        },
      ],
    }).lean();

    const reportIds = assignments.map((a: any) => a.reportId);
    const reports = await SavedReport.find({
      _id: { $in: reportIds },
      isActive: true,
    })
      .populate("createdBy", "firstName lastName email")
      .lean();

    return res.status(200).json({ success: true, data: reports });
  } catch (err: any) {
    console.error("getMyReports error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};
