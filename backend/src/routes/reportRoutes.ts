import express from "express";
import { auth } from "../middleware/auth";
import { checkPermission } from "../middleware/permissions";
import {
  getModulePermissions,
  updateModulePermission,
  getMyModulePermissions,
  getDataPoints,
  seedDataPoints,
  getDataPointAccess,
  getAllDataPointAccess,
  updateDataPointAccess,
  getSavedReports,
  getSavedReport,
  createSavedReport,
  updateSavedReport,
  deleteSavedReport,
  runReport,
  previewReport,
  exportReport,
  getAssignments,
  getReportAssignment,
  updateReportAssignment,
  deleteReportAssignment,
  getMyReports,
} from "../controllers/reports/reportController";

const router = express.Router();

// ── Module permissions (role-level on/off matrix) ─────────────────────────────
router.get(
  "/my-module-permissions",
  auth,
  checkPermission("REPORT_VIEW_TICKETS"),
  getMyModulePermissions,
);
router.get(
  "/module-permissions",
  auth,
  checkPermission("REPORT_PERMISSIONS_MANAGE"),
  getModulePermissions,
);
router.put(
  "/module-permissions/:roleId",
  auth,
  checkPermission("REPORT_PERMISSIONS_MANAGE"),
  updateModulePermission,
);

// ── Data points ───────────────────────────────────────────────────────────────
router.get(
  "/data-points",
  auth,
  checkPermission("REPORT_VIEW_TICKETS"),
  getDataPoints,
);
router.post(
  "/data-points/seed",
  auth,
  checkPermission("REPORT_DATA_POINTS_MANAGE"),
  seedDataPoints,
);
router.get(
  "/data-point-access",
  auth,
  checkPermission("REPORT_DATA_POINTS_MANAGE"),
  getAllDataPointAccess,
);
router.get(
  "/data-point-access/:roleId",
  auth,
  checkPermission("REPORT_DATA_POINTS_MANAGE"),
  getDataPointAccess,
);
router.put(
  "/data-point-access/:roleId",
  auth,
  checkPermission("REPORT_DATA_POINTS_MANAGE"),
  updateDataPointAccess,
);

// ── Saved reports CRUD ────────────────────────────────────────────────────────
router.get(
  "/saved",
  auth,
  checkPermission("REPORT_VIEW_TICKETS"),
  getSavedReports,
);
router.post(
  "/saved",
  auth,
  checkPermission("REPORT_VIEW_TICKETS"),
  createSavedReport,
);
router.get(
  "/saved/:id",
  auth,
  checkPermission("REPORT_VIEW_TICKETS"),
  getSavedReport,
);
router.put(
  "/saved/:id",
  auth,
  checkPermission("REPORT_VIEW_TICKETS"),
  updateSavedReport,
);
router.delete(
  "/saved/:id",
  auth,
  checkPermission("REPORT_VIEW_TICKETS"),
  deleteSavedReport,
);

// ── Report execution ──────────────────────────────────────────────────────────
router.post(
  "/saved/:id/run",
  auth,
  checkPermission("REPORT_VIEW_TICKETS"),
  runReport,
);
router.get(
  "/saved/:id/export",
  auth,
  checkPermission("REPORT_VIEW_TICKETS"),
  exportReport,
);
router.post(
  "/preview",
  auth,
  checkPermission("REPORT_VIEW_TICKETS"),
  previewReport,
);

// ── Assignments ───────────────────────────────────────────────────────────────
router.get(
  "/assignments",
  auth,
  checkPermission("REPORT_VIEW_TICKETS"),
  getAssignments,
);
router.get(
  "/assignments/:reportId",
  auth,
  checkPermission("REPORT_VIEW_TICKETS"),
  getReportAssignment,
);
router.put(
  "/assignments/:reportId",
  auth,
  checkPermission("REPORT_VIEW_TICKETS"),
  updateReportAssignment,
);
router.delete(
  "/assignments/:reportId",
  auth,
  checkPermission("REPORT_VIEW_TICKETS"),
  deleteReportAssignment,
);

// ── My assigned reports (no permission gate beyond auth) ─────────────────────
router.get("/mine", auth, getMyReports);

export default router;
