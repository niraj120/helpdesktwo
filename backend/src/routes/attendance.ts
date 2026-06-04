import express from "express";
import { authMiddleware } from "../middleware/auth";
import { requirePermission, checkPermission } from "../middleware/permissions";
import {
  getAttendanceConfig,
  updateAttendanceConfig,
  testAttendanceConnection,
  triggerManualSync,
  getSyncLogs,
  getSyncLogById,
} from "../controllers/attendanceConfigController";
import {
  getEmployeesForSync,
  updatePayrollNumber,
  triggerBiometricSync,
  getBiometricSyncLogs,
  downloadEmployeeCsv,
} from "../controllers/attendanceBiometricController";
import {
  getAttendanceRecords,
  getAttendanceSummary,
  getAttendanceMatrix,
} from "../controllers/attendanceRecordsController";
import {
  downloadBulkTemplate,
  bulkUploadAttendance,
} from "../controllers/attendanceBulkController";
import {
  saveAttendanceReport,
  listAttendanceReports,
  deleteAttendanceReport,
  getAttendanceReportAssignment,
  updateAttendanceReportAssignment,
  getMyAttendanceReports,
  testAttendanceReportAlert,
} from "../controllers/attendanceSavedReportController";

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// ── Config endpoints (Admin only) ──────────────────────────────────────────
router.get(
  "/config",
  requirePermission("ATTENDANCE_CONFIG"),
  getAttendanceConfig,
);
router.put(
  "/config",
  requirePermission("ATTENDANCE_CONFIG"),
  updateAttendanceConfig,
);
router.post(
  "/config/test-connection",
  requirePermission("ATTENDANCE_CONFIG"),
  testAttendanceConnection,
);

// ── Sync control endpoints (Admin only) ────────────────────────────────────
router.post(
  "/sync/run",
  requirePermission("ATTENDANCE_CONFIG"),
  triggerManualSync,
);
router.get("/sync/logs", requirePermission("ATTENDANCE_CONFIG"), getSyncLogs);
router.get(
  "/sync/logs/:id",
  requirePermission("ATTENDANCE_CONFIG"),
  getSyncLogById,
);

// ── Bulk manual upload endpoints (Admin only) ──────────────────────────────
router.get(
  "/bulk/template",
  requirePermission("ATTENDANCE_CONFIG"),
  downloadBulkTemplate,
);
router.post(
  "/bulk/upload",
  requirePermission("ATTENDANCE_CONFIG"),
  bulkUploadAttendance,
);

// ── Employee biometric sync endpoints (Admin, HR) ──────────────────────────
// Note: order matters — specific paths before :userId param routes
router.get(
  "/employees/download-csv",
  requirePermission("ATTENDANCE_SYNC"),
  downloadEmployeeCsv,
);
router.get(
  "/employees/biometric-sync/logs",
  requirePermission("ATTENDANCE_SYNC"),
  getBiometricSyncLogs,
);
router.get(
  "/employees",
  requirePermission("ATTENDANCE_SYNC"),
  getEmployeesForSync,
);
router.post(
  "/employees/biometric-sync",
  requirePermission("ATTENDANCE_SYNC"),
  triggerBiometricSync,
);
router.patch(
  "/employees/:userId/payroll",
  requirePermission("ATTENDANCE_SYNC"),
  updatePayrollNumber,
);

// ── Attendance record endpoints (ATTENDANCE_VIEW or ATTENDANCE_REPORT_VIEW) ──
router.get(
  "/records",
  checkPermission(["ATTENDANCE_VIEW", "ATTENDANCE_REPORT_VIEW"]),
  getAttendanceRecords,
);
router.get(
  "/records/summary",
  checkPermission(["ATTENDANCE_VIEW", "ATTENDANCE_REPORT_VIEW"]),
  getAttendanceSummary,
);
router.get(
  "/matrix",
  checkPermission(["ATTENDANCE_VIEW", "ATTENDANCE_REPORT_VIEW"]),
  getAttendanceMatrix,
);

// ── Saved attendance reports ────────────────────────────────────────────────
router.get(
  "/reports/mine",
  requirePermission("ATTENDANCE_REPORT_VIEW"),
  getMyAttendanceReports,
);
router.post(
  "/reports/saved",
  requirePermission("ATTENDANCE_CONFIG"),
  saveAttendanceReport,
);
router.get(
  "/reports/saved",
  requirePermission("ATTENDANCE_CONFIG"),
  listAttendanceReports,
);
router.delete(
  "/reports/saved/:id",
  requirePermission("ATTENDANCE_CONFIG"),
  deleteAttendanceReport,
);
router.get(
  "/reports/saved/:id/assignment",
  requirePermission("ATTENDANCE_CONFIG"),
  getAttendanceReportAssignment,
);
router.put(
  "/reports/saved/:id/assignment",
  requirePermission("ATTENDANCE_CONFIG"),
  updateAttendanceReportAssignment,
);
router.post(
  "/reports/saved/:id/test-alert",
  requirePermission("ATTENDANCE_CONFIG"),
  testAttendanceReportAlert,
);

export default router;
