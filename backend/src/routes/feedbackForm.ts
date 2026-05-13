import express from "express";
import {
  createFeedbackForm,
  getFeedbackFormsByProject,
  getFeedbackFormById,
  getActiveFeedbackForm,
  updateFeedbackForm,
  deleteFeedbackForm,
  toggleFeedbackFormActive,
} from "../controllers/feedbackFormController";
import { auth } from "../middleware/auth";
import { checkPermission } from "../middleware/permissions";

const router = express.Router();

// Create feedback form (Admin)
router.post(
  "/",
  auth,
  checkPermission("FEEDBACK_FORM_CREATE"),
  createFeedbackForm,
);

// Get all forms for a project
router.get("/project/:projectId", auth, getFeedbackFormsByProject);

// Get active form for a project (public for students clicking email link)
router.get("/project/:projectId/active", getActiveFeedbackForm);

// Get single form by ID
router.get("/:id", auth, getFeedbackFormById);

// Update feedback form
router.put(
  "/:id",
  auth,
  checkPermission("FEEDBACK_FORM_EDIT"),
  updateFeedbackForm,
);

// Toggle active status
router.patch(
  "/:id/toggle-active",
  auth,
  checkPermission("FEEDBACK_FORM_EDIT"),
  toggleFeedbackFormActive,
);

// Delete feedback form
router.delete(
  "/:id",
  auth,
  checkPermission("FEEDBACK_FORM_DELETE"),
  deleteFeedbackForm,
);

export default router;
