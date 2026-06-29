import { Router } from "express";
import { auth } from "../middleware/auth";
import { checkPermission } from "../middleware/permissions";
import {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  toggleUserStatus,
  resetUserPassword,
  getUserPermissions,
  searchHRMSEmployees,
  getHRMSFields,
  getMdmFieldConfig,
  saveMdmFieldConfig,
  deleteMdmFieldConfig,
  validateEmployeeCode,
  searchUserByEmail,
  registerStudent,
  searchStudents,
  getEscalationAgents,
  getUserReport,
  checkDuplicate,
  downloadBulkUserTemplate,
  bulkCreateUsers,
  bulkUploadMiddleware,
  exportUsers,
} from "../controllers/userController";

const router = Router();

// All user routes require authentication
router.use(auth);

// HRMS routes (must be before /:id route to avoid conflicts)
// @desc    Search HRMS employees
// @route   GET /api/users/hrms/search
// @access  Private
router.get("/hrms/search", checkPermission("USER_CREATE"), searchHRMSEmployees);

// @desc    Discover field list for a source (dynamic column picker)
router.get("/hrms/fields", checkPermission("USER_CREATE"), getHRMSFields);

// @desc    Get / save field-selection + mapping config (separate collection)
router.get("/hrms/field-config", checkPermission("USER_CREATE"), getMdmFieldConfig);
router.put("/hrms/field-config", checkPermission("USER_CREATE"), saveMdmFieldConfig);
router.delete(
  "/hrms/field-config",
  checkPermission("USER_CREATE"),
  deleteMdmFieldConfig,
);

// @desc    Validate employee code
// @route   GET /api/users/hrms/validate/:employeeCode
// @access  Private
router.get(
  "/hrms/validate/:employeeCode",
  checkPermission("USER_CREATE"),
  validateEmployeeCode,
);

// Report routes (must be before /:id route to avoid conflicts)
// @desc    Get employee report
// @route   GET /api/users/report
// @access  Private
router.get("/report", checkPermission("REPORT_VIEW_EMPLOYEE"), getUserReport);

// Offline module routes
// @desc    Search user by email
// @route   GET /api/users/search
// @access  Private
router.get("/search", checkPermission("USER_VIEW_ALL"), searchUserByEmail);

// @desc    Search students/users by name, phone, or unique ID
// @route   GET /api/users/search-students
// @access  Private
router.get(
  "/search-students",
  checkPermission("OFFLINE_STUDENT_VIEW"),
  searchStudents,
);

// @desc    Get agents from escalation policies for a project
// @route   GET /api/users/escalation-agents
// @access  Private
router.get(
  "/escalation-agents",
  checkPermission("TICKET_ASSIGN"),
  getEscalationAgents,
);

// @desc    Check if email or phone already exists (duplicate check for offline registration)
// @route   GET /api/users/check-duplicate
// @access  Private
router.get(
  "/check-duplicate",
  checkPermission("OFFLINE_STUDENT_REGISTER"),
  checkDuplicate,
);

// @desc    Download Excel template for bulk user creation
// @route   GET /api/users/bulk-template
// @access  Private
router.get(
  "/bulk-template",
  checkPermission("USER_CREATE"),
  downloadBulkUserTemplate,
);

// @desc    Bulk create users from uploaded Excel
// @route   POST /api/users/bulk-upload
// @access  Private
router.post(
  "/bulk-upload",
  checkPermission("USER_CREATE"),
  bulkUploadMiddleware,
  bulkCreateUsers,
);

// @desc    Register student (offline module)
// @route   POST /api/users/register-student
// @access  Private
router.post(
  "/register-student",
  checkPermission("OFFLINE_STUDENT_REGISTER"),
  registerStudent,
);

// @desc    Export filtered users to CSV/Excel (must be before /:id)
// @route   GET /api/users/export
// @access  Private (USER_VIEW_ALL)
router.get("/export", checkPermission("USER_VIEW_ALL"), exportUsers);

// @desc    Get all users
// @route   GET /api/users
// @access  Private
router.get("/", auth, getAllUsers);

// @desc    Create new user
// @route   POST /api/users
// @access  Private
router.post("/", checkPermission("USER_CREATE"), createUser);

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private
router.get("/:id", checkPermission("USER_VIEW_ALL"), getUserById);

// @desc    Get user permissions
// @route   GET /api/users/:id/permissions
// @access  Private
router.get(
  "/:id/permissions",
  checkPermission("USER_VIEW_ALL"),
  getUserPermissions,
);

// @desc    Toggle user status
// @route   PATCH /api/users/:id/toggle-status
// @access  Private
router.patch(
  "/:id/toggle-status",
  checkPermission("USER_TOGGLE_STATUS"),
  toggleUserStatus,
);

// @desc    Reset user password
// @route   POST /api/users/:id/reset-password
// @access  Private
router.post(
  "/:id/reset-password",
  checkPermission("USER_RESET_PASSWORD"),
  resetUserPassword,
);

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private
router.put("/:id", checkPermission("USER_EDIT"), updateUser);

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private
router.delete("/:id", checkPermission("USER_DELETE"), deleteUser);

export default router;
