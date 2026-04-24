import express from "express";
import {
  getAllProjects,
  getMyProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  toggleProjectStatus,
  updateProjectModules,
  getProjectStats,
  getProjectBranding,
  getProjectByDomain,
  getProjectTicketSettings,
  updateProjectTicketSettings,
  getOfflineSettings,
  updateOfflineSettings,
  getFormFields,
  createFormField,
  updateFormField,
  deleteFormField,
  uploadBrandingImage,
  getWhatsappWidgetConfig,
  updateWhatsappWidgetSettings,
} from "../controllers/projectController";
import { listConfigsByProject } from "../controllers/ticket-module/categoryAssignmentController";
import { authMiddleware } from "../middleware/auth";
import { checkPermission } from "../middleware/permissions";

const router = express.Router();

// Get user's assigned projects (for project switcher - no special permission required)
// MUST be before /:id to avoid conflicts
router.get("/my-projects", authMiddleware, getMyProjects);

// Get all projects with optional filtering
// Access is allowed to any authenticated user; getAllProjects handles scoping
// (non-admins only see their assigned projects, admins see all)
router.get("/", authMiddleware, getAllProjects);

// Get project statistics
router.get(
  "/stats",
  authMiddleware,
  checkPermission("PROJECT_VIEW_ALL"),
  getProjectStats,
);

// Get project branding by custom URL path (must be before /:id to avoid conflicts)
router.get("/branding/:urlPath", getProjectBranding);

// Get project configuration by domain (for login page - favicon, background, announcement)
router.get("/by-domain/:domain", getProjectByDomain);

// Get project ticket submission settings (public endpoint for student portal)
router.get("/:projectId/ticket-settings", getProjectTicketSettings);

// WhatsApp widget config (public — no auth, used by floating icon component)
router.get("/:projectId/whatsapp-widget", getWhatsappWidgetConfig);

// Update project ticket submission settings
router.put(
  "/:projectId/ticket-settings",
  authMiddleware,
  checkPermission("PROJECT_MANAGE_SETTINGS"),
  updateProjectTicketSettings,
);

// Update WhatsApp widget settings (admin only)
router.put(
  "/:id/whatsapp-widget",
  authMiddleware,
  checkPermission("PROJECT_MANAGE_SETTINGS"),
  updateWhatsappWidgetSettings,
);

// Get offline module settings
router.get(
  "/:id/offline-settings",
  authMiddleware,
  checkPermission(["PROJECT_VIEW_ALL", "OFFLINE_MODULE_ACCESS"]),
  getOfflineSettings,
);

// Update offline module settings
router.put(
  "/:id/offline-settings",
  authMiddleware,
  checkPermission("PROJECT_MANAGE_SETTINGS"),
  updateOfflineSettings,
);

// Form Fields Management
router.get(
  "/:projectId/form-fields",
  authMiddleware,
  checkPermission("PROJECT_VIEW_ALL"),
  getFormFields,
);
router.post(
  "/:projectId/form-fields",
  authMiddleware,
  checkPermission("PROJECT_MANAGE_SETTINGS"),
  createFormField,
);
router.put(
  "/:projectId/form-fields/:fieldId",
  authMiddleware,
  checkPermission("PROJECT_MANAGE_SETTINGS"),
  updateFormField,
);
router.delete(
  "/:projectId/form-fields/:fieldId",
  authMiddleware,
  checkPermission("PROJECT_MANAGE_SETTINGS"),
  deleteFormField,
);

// Category Assignment Configs for a project (admin overview)
router.get(
  "/:projectId/category-assignment-configs",
  authMiddleware,
  checkPermission("MASTER_DATA_VIEW"),
  listConfigsByProject,
);

// Get single project by ID
router.get(
  "/:id",
  authMiddleware,
  checkPermission("PROJECT_VIEW_ALL"),
  getProjectById,
);

// Create new project
router.post(
  "/",
  authMiddleware,
  checkPermission("PROJECT_CREATE"),
  createProject,
);

// Update project
router.put(
  "/:id",
  authMiddleware,
  checkPermission("PROJECT_EDIT"),
  updateProject,
);

// Delete project
router.delete(
  "/:id",
  authMiddleware,
  checkPermission("PROJECT_DELETE"),
  deleteProject,
);

// Toggle project status
router.patch(
  "/:id/toggle-status",
  authMiddleware,
  checkPermission("PROJECT_TOGGLE_STATUS"),
  toggleProjectStatus,
);

// Update project modules
router.patch(
  "/:id/modules",
  authMiddleware,
  checkPermission("PROJECT_MANAGE_SETTINGS"),
  updateProjectModules,
);

// Upload branding image (logo or favicon) to GCS
router.post(
  "/:id/branding-image",
  authMiddleware,
  checkPermission("PROJECT_EDIT"),
  uploadBrandingImage,
);

export default router;
