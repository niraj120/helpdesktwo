import express from "express";
import {
  submitFeedbackResponse,
  getFeedbackByTicket,
  getFeedbackByProject,
  getFeedbackStats,
  checkFeedbackSubmitted,
} from "../controllers/feedbackResponseController";
import { auth } from "../middleware/auth";
import { checkPermission } from "../middleware/permissions";
import { requireProjectAccess } from "../middleware/requireProjectAccess";

const router = express.Router();

// Public feedback submission (from email link)
router.post("/public", submitFeedbackResponse);

// Submit feedback response (Authenticated Student)
router.post("/", auth, submitFeedbackResponse);

// Check if feedback submitted for ticket (public - for email link access)
router.get("/ticket/:ticketId/check/public", checkFeedbackSubmitted);

// Check if feedback submitted for ticket
router.get("/ticket/:ticketId/check", auth, checkFeedbackSubmitted);

// Get feedback for a ticket
router.get("/ticket/:ticketId", auth, getFeedbackByTicket);

// Get all feedback for a project (Admin) — scope to the caller's own project.
router.get(
  "/project/:projectId",
  auth,
  checkPermission("FEEDBACK_VIEW"),
  requireProjectAccess("projectId"),
  getFeedbackByProject,
);

// Get feedback statistics (Admin)
router.get(
  "/project/:projectId/stats",
  auth,
  checkPermission("FEEDBACK_VIEW"),
  requireProjectAccess("projectId"),
  getFeedbackStats,
);

export default router;
