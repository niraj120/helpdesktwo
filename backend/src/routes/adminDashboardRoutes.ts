/**
 * Admin Dashboard Routes
 *
 * Requires: authMiddleware + requirePermission('dashboard.manage')
 *
 * Widget Definitions:
 *   GET  /api/v1/admin/widget-definitions
 *   GET  /api/v1/admin/widget-definitions/:id
 *
 * Templates:
 *   POST   /api/v1/admin/dashboards
 *   GET    /api/v1/admin/dashboards
 *   GET    /api/v1/admin/dashboards/:id
 *   PUT    /api/v1/admin/dashboards/:id
 *   DELETE /api/v1/admin/dashboards/:id
 *   POST   /api/v1/admin/dashboards/:id/publish
 *
 * Assignments:
 *   POST   /api/v1/admin/dashboards/:id/assignments
 *   GET    /api/v1/admin/dashboards/:id/assignments
 *   DELETE /api/v1/admin/dashboards/:id/assignments/:assignmentId
 *
 * User Targets:
 *   GET  /api/v1/admin/user-targets
 *   POST /api/v1/admin/user-targets
 *   PUT  /api/v1/admin/user-targets/:id
 */

import { Router, Response } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import {
  listWidgetDefinitions,
  getWidgetDefinition,
} from "../controllers/dashboard/widgetDefinitionController";
import {
  createDashboardTemplate,
  listDashboardTemplates,
  getDashboardTemplate,
  updateDashboardTemplate,
  deleteDashboardTemplate,
  publishDashboardTemplate,
  duplicateDashboardTemplate,
  exportDashboardTemplate,
  importDashboardTemplate,
} from "../controllers/dashboard/dashboardTemplateController";
import { DashboardAssignment } from "../models/dashboard/DashboardAssignment";
import { UserTarget } from "../models/dashboard/UserTarget";
import { User } from "../models/User";
import mongoose from "mongoose";

const router = Router();
const canManage = requirePermission("dashboard.manage");

// ─── Widget Definitions ───────────────────────────────────────────────────────
router.get(
  "/widget-definitions",
  authMiddleware,
  canManage,
  listWidgetDefinitions,
);
router.get(
  "/widget-definitions/:id",
  authMiddleware,
  canManage,
  getWidgetDefinition,
);

// ─── Templates ────────────────────────────────────────────────────────────────
router.post("/", authMiddleware, canManage, createDashboardTemplate);
router.post("/import", authMiddleware, canManage, importDashboardTemplate);
router.get("/", authMiddleware, canManage, listDashboardTemplates);
router.get("/:id", authMiddleware, canManage, getDashboardTemplate);
router.put("/:id", authMiddleware, canManage, updateDashboardTemplate);
router.delete("/:id", authMiddleware, canManage, deleteDashboardTemplate);
router.post(
  "/:id/publish",
  authMiddleware,
  canManage,
  publishDashboardTemplate,
);
router.post(
  "/:id/duplicate",
  authMiddleware,
  canManage,
  duplicateDashboardTemplate,
);
router.get("/:id/export", authMiddleware, canManage, exportDashboardTemplate);

// ─── Assignments ──────────────────────────────────────────────────────────────

router.post(
  "/:id/assignments",
  authMiddleware,
  canManage,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { assigneeType, assigneeId, tabOrder, isDefault } = req.body;

      // Use User's own projects (most reliable source for tenantId)
      const dbUser = await User.findById(req.user!.userId)
        .select("projects")
        .lean();
      const userProjects = (dbUser as any)?.projects ?? [];
      const reqProjects = (req.user as any)?.projects ?? [];
      const allProjects = userProjects.length > 0 ? userProjects : reqProjects;
      const tenantId =
        Array.isArray(allProjects) && allProjects.length > 0
          ? (allProjects[0]?._id?.toString() ?? allProjects[0]?.toString())
          : null;

      if (!tenantId) {
        res.status(400).json({ success: false, message: "No project context" });
        return;
      }

      const assignment = await DashboardAssignment.create({
        tenantId: new mongoose.Types.ObjectId(tenantId),
        dashboardTemplateId: new mongoose.Types.ObjectId(req.params.id),
        assigneeType,
        assigneeId: new mongoose.Types.ObjectId(assigneeId),
        tabOrder: tabOrder ?? 0,
        isDefault: isDefault ?? false,
        assignedBy: new mongoose.Types.ObjectId(req.user!.userId),
      });

      res.status(201).json({ success: true, data: assignment });
    } catch (err: any) {
      if (err.code === 11000) {
        res
          .status(409)
          .json({ success: false, message: "Assignment already exists" });
      } else {
        res.status(500).json({ success: false, message: err.message });
      }
    }
  },
);

router.get(
  "/:id/assignments",
  authMiddleware,
  canManage,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const assignments = await DashboardAssignment.find({
        dashboardTemplateId: new mongoose.Types.ObjectId(req.params.id),
      })
        .sort({ tabOrder: 1 })
        .lean();
      res.json({ success: true, data: assignments });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

router.delete(
  "/:id/assignments/:assignmentId",
  authMiddleware,
  canManage,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const deleted = await DashboardAssignment.findByIdAndDelete(
        req.params.assignmentId,
      );
      if (!deleted) {
        res
          .status(404)
          .json({ success: false, message: "Assignment not found" });
        return;
      }
      res.json({ success: true, message: "Assignment removed" });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// PUT /:id/assignments/:assignmentId — update tab order / isDefault
router.put(
  "/:id/assignments/:assignmentId",
  authMiddleware,
  canManage,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { tabOrder, isDefault } = req.body;
      const updated = await DashboardAssignment.findByIdAndUpdate(
        req.params.assignmentId,
        {
          $set: {
            ...(tabOrder !== undefined && { tabOrder }),
            ...(isDefault !== undefined && { isDefault }),
          },
        },
        { new: true },
      );
      if (!updated) {
        res
          .status(404)
          .json({ success: false, message: "Assignment not found" });
        return;
      }
      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// ─── User Targets ─────────────────────────────────────────────────────────────

router.get(
  "/user-targets",
  authMiddleware,
  canManage,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const projects = (req.user as any)?.projects;
      const tenantId =
        Array.isArray(projects) && projects.length > 0
          ? (projects[0]?._id?.toString() ?? projects[0]?.toString())
          : null;

      const filter: Record<string, any> = {};
      if (tenantId) filter.tenantId = new mongoose.Types.ObjectId(tenantId);
      if (req.query.centreId)
        filter.centreId = new mongoose.Types.ObjectId(
          req.query.centreId as string,
        );

      const targets = await UserTarget.find(filter)
        .sort({ targetMonth: -1 })
        .lean();
      res.json({ success: true, data: targets });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

router.post(
  "/user-targets",
  authMiddleware,
  canManage,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { centreId, projectId, roleId, targetMonth, targetCount } =
        req.body;
      const projects = (req.user as any)?.projects;
      const tenantId =
        Array.isArray(projects) && projects.length > 0
          ? (projects[0]?._id?.toString() ?? projects[0]?.toString())
          : null;

      if (!tenantId || !targetCount || !targetMonth) {
        res.status(400).json({
          success: false,
          message: "tenantId, targetMonth and targetCount are required",
        });
        return;
      }

      const parsedMonth = new Date(targetMonth);
      // Normalise to first of month
      parsedMonth.setDate(1);
      parsedMonth.setHours(0, 0, 0, 0);

      const target = await UserTarget.findOneAndUpdate(
        {
          tenantId: new mongoose.Types.ObjectId(tenantId),
          centreId: centreId
            ? new mongoose.Types.ObjectId(centreId)
            : undefined,
          projectId: projectId
            ? new mongoose.Types.ObjectId(projectId)
            : undefined,
          roleId: roleId ? new mongoose.Types.ObjectId(roleId) : undefined,
          targetMonth: parsedMonth,
        },
        {
          $set: {
            targetCount,
            setBy: new mongoose.Types.ObjectId(req.user!.userId),
          },
        },
        { new: true, upsert: true },
      );

      res.status(201).json({ success: true, data: target });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// GET /api/v1/admin/user-targets/:id — single target
router.get(
  "/user-targets/:id",
  authMiddleware,
  canManage,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const target = await UserTarget.findById(req.params.id).lean();
      if (!target) {
        res.status(404).json({ success: false, message: "Target not found" });
        return;
      }
      res.json({ success: true, data: target });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// DELETE /api/v1/admin/user-targets/:id — delete single target
router.delete(
  "/user-targets/:id",
  authMiddleware,
  canManage,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const deleted = await UserTarget.findByIdAndDelete(req.params.id);
      if (!deleted) {
        res.status(404).json({ success: false, message: "Target not found" });
        return;
      }
      res.json({ success: true, message: "Target deleted" });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// ─── Bulk CSV User Targets Import (Phase 4) ───────────────────────────────────
// POST /api/v1/admin/user-targets/import
// Body: multipart/form-data with field "file" (CSV)
// CSV columns: centreId, projectId, roleId, targetMonth (YYYY-MM), targetCount

import multer from "multer";
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
}).single("file");

router.post(
  "/user-targets/import",
  authMiddleware,
  canManage,
  (req, res, next) => csvUpload(req, res, next),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const projects = (req.user as any)?.projects;
      const tenantId =
        Array.isArray(projects) && projects.length > 0
          ? (projects[0]?._id?.toString() ?? projects[0]?.toString())
          : null;

      if (!tenantId) {
        res.status(400).json({
          success: false,
          message: "No tenant project found for this user",
        });
        return;
      }

      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file || !file.buffer) {
        res.status(400).json({
          success: false,
          message: "CSV file is required (field name: file)",
        });
        return;
      }

      const csvText = file.buffer.toString("utf8");

      if (!csvText.trim()) {
        res
          .status(400)
          .json({ success: false, message: "Uploaded file is empty" });
        return;
      }

      // Parse CSV — handle CRLF and LF, basic comma-split
      const lines = csvText
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .split("\n");
      const header = lines[0]
        .split(",")
        .map((h) => h.trim().toLowerCase().replace(/['"]/g, ""));

      const COL = {
        centreId: header.indexOf("centreid"),
        projectId: header.indexOf("projectid"),
        roleId: header.indexOf("roleid"),
        targetMonth: header.indexOf("targetmonth"),
        targetCount: header.indexOf("targetcount"),
      };

      if (COL.targetMonth === -1 || COL.targetCount === -1) {
        res.status(400).json({
          success: false,
          message: "CSV must have at least targetMonth and targetCount columns",
        });
        return;
      }

      const results = { imported: 0, skipped: 0, errors: [] as string[] };

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cells = line
          .split(",")
          .map((c) => c.trim().replace(/^["']|["']$/g, ""));

        const rawMonth =
          COL.targetMonth !== -1 ? (cells[COL.targetMonth] ?? "") : "";
        const rawCount =
          COL.targetCount !== -1 ? (cells[COL.targetCount] ?? "") : "";
        const rawCentre =
          COL.centreId !== -1 ? (cells[COL.centreId] ?? "") : "";
        const rawProject =
          COL.projectId !== -1 ? (cells[COL.projectId] ?? "") : "";
        const rawRole = COL.roleId !== -1 ? (cells[COL.roleId] ?? "") : "";

        // Validate month format YYYY-MM
        if (!/^\d{4}-\d{2}$/.test(rawMonth)) {
          results.errors.push(
            `Row ${i + 1}: invalid targetMonth "${rawMonth}" (expected YYYY-MM)`,
          );
          results.skipped++;
          continue;
        }

        const count = Number(rawCount);
        if (isNaN(count) || count < 0) {
          results.errors.push(
            `Row ${i + 1}: invalid targetCount "${rawCount}"`,
          );
          results.skipped++;
          continue;
        }

        // Validate optional ObjectIds
        let hasInvalidId = false;
        for (const [label, val] of [
          ["centreId", rawCentre],
          ["projectId", rawProject],
          ["roleId", rawRole],
        ] as [string, string][]) {
          if (val && !mongoose.Types.ObjectId.isValid(val)) {
            results.errors.push(`Row ${i + 1}: invalid ${label} "${val}"`);
            results.skipped++;
            hasInvalidId = true;
            break;
          }
        }
        if (hasInvalidId) continue;

        const parsedMonth = new Date(`${rawMonth}-01T00:00:00Z`);

        try {
          await UserTarget.findOneAndUpdate(
            {
              tenantId: new mongoose.Types.ObjectId(tenantId),
              centreId:
                rawCentre && mongoose.Types.ObjectId.isValid(rawCentre)
                  ? new mongoose.Types.ObjectId(rawCentre)
                  : undefined,
              projectId:
                rawProject && mongoose.Types.ObjectId.isValid(rawProject)
                  ? new mongoose.Types.ObjectId(rawProject)
                  : undefined,
              roleId:
                rawRole && mongoose.Types.ObjectId.isValid(rawRole)
                  ? new mongoose.Types.ObjectId(rawRole)
                  : undefined,
              targetMonth: parsedMonth,
            },
            {
              $set: {
                targetCount: count,
                setBy: new mongoose.Types.ObjectId(userId),
              },
            },
            { upsert: true, new: true },
          );
          results.imported++;
        } catch (rowErr: any) {
          results.errors.push(`Row ${i + 1}: ${rowErr.message}`);
          results.skipped++;
        }
      }

      res.json({ success: true, data: results });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// ─── Scheduled Reports (Sprint 10) ───────────────────────────────────────────

import {
  listScheduledReports,
  createScheduledReport,
  getScheduledReport,
  updateScheduledReport,
  deleteScheduledReport,
  sendReportNow,
} from "../controllers/dashboard/scheduledReportController";

router.get(
  "/scheduled-reports",
  authMiddleware,
  canManage,
  listScheduledReports,
);
router.post(
  "/scheduled-reports",
  authMiddleware,
  canManage,
  createScheduledReport,
);
router.get(
  "/scheduled-reports/:id",
  authMiddleware,
  canManage,
  getScheduledReport,
);
router.put(
  "/scheduled-reports/:id",
  authMiddleware,
  canManage,
  updateScheduledReport,
);
router.delete(
  "/scheduled-reports/:id",
  authMiddleware,
  canManage,
  deleteScheduledReport,
);
router.post(
  "/scheduled-reports/:id/send-now",
  authMiddleware,
  canManage,
  sendReportNow,
);

// ─── Threshold Alerts (Sprint 11) ────────────────────────────────────────────

import {
  listThresholdAlerts,
  createThresholdAlert,
  updateThresholdAlert,
  deleteThresholdAlert,
  testThresholdAlert,
} from "../controllers/dashboard/thresholdAlertController";

router.get("/:id/alerts", authMiddleware, canManage, listThresholdAlerts);
router.post("/:id/alerts", authMiddleware, canManage, createThresholdAlert);
router.put("/:id/alerts/:aid", authMiddleware, canManage, updateThresholdAlert);
router.delete(
  "/:id/alerts/:aid",
  authMiddleware,
  canManage,
  deleteThresholdAlert,
);
router.post(
  "/:id/alerts/:aid/test",
  authMiddleware,
  canManage,
  testThresholdAlert,
);

export default router;
