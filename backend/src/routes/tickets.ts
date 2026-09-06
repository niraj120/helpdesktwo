import { Router } from "express";
import {
  submitTicket,
  upload,
  getMyTickets,
  getAllTickets,
  getTicketById,
  replyToTicket,
  closeTicket,
  reopenTicket,
  getAgentAssignedTickets,
  updateTicketStatus,
  updateTicketCategory,
  updateTicketCategoryHierarchy,
  updateTicketPriority,
  addTicketTag,
  removeTicketTag,
  addInternalNote,
  escalateTicket,
  assignTicket,
  reassignTicket,
  getAllTags,
  bulkUpdateByTags,
  bulkChangeStatus,
  bulkReply,
  getDashboardStats,
  getProjectDashboardStats,
  createOfflineTicket,
  getAssignableAgents,
  getSLAStatus,
  pauseSLA,
  resumeSLA,
  bulkDeleteTickets,
  getStudentTicketHistory,
} from "../controllers/ticketController";
import { authMiddleware } from "../middleware/auth";
import { checkPermission } from "../middleware/permissions";
import { requireTicketAction } from "../middleware/ticketActionPermission";
import { attachProjectContext } from "../middleware/projectScope";
import { requireResourceProject } from "../middleware/requireProjectAccess";
import { Ticket } from "../models/Ticket";

// Authorize the ticket in :id against the caller's project scope. The ticket
// controllers scope the LIST view but not the per-:id operations, so without
// this an agent could mutate another project's ticket by guessing its id.
// Ticket stores its project in the `project` field (not `projectId`).
const ticketOwnsProject = requireResourceProject(Ticket, "id", "project");

// Attachment controllers
import {
  uploadAttachment,
  downloadAttachment,
  deleteAttachment,
  getAttachmentSignedUrl,
  uploadMiddleware,
} from "../controllers/ticketAttachmentController";

// Comment controllers
import {
  getComments,
  createComment,
  updateComment,
  deleteComment,
} from "../controllers/ticketCommentController";

// Email communication controllers (Task 6.5, 7.1)
import {
  getEmailCommunications,
  getEmailCommunicationById,
  sendTicketReply,
  getAllIncomingEmails,
} from "../controllers/emailCommunicationController";

// Export controller
import { exportTickets } from "../controllers/ticketExportController";

// Draft controller (idle auto-save)
import {
  getDraft,
  saveDraft,
  deleteDraft,
} from "../controllers/ticketDraftController";

// Merge controller
import {
  mergeTickets,
  getMergeCandidates,
} from "../controllers/ticketMergeController";

// Escalation Matrix controller
import {
  getAllowedEscalations,
  escalateTicketWithMatrix,
  assignMatrixToTicket,
} from "../controllers/escalation-matrix/escalationMatrixController";

const router = Router();

// @desc    Submit ticket from student portal
// @route   POST /api/tickets/submit
// @access  Public
// Accept any file field names from the student portal (we'll map files by their fieldnames in the controller)
router.post("/submit", upload.any(), submitTicket);

// @desc    Create offline ticket submission (by agent on behalf of student)
// @route   POST /api/tickets/offline-submission
// @access  Private (Agent)
router.post(
  "/offline-submission",
  authMiddleware,
  checkPermission("OFFLINE_TICKET_CREATE"),
  upload.any(),
  createOfflineTicket,
);

// @desc    Bulk delete tickets
// @route   DELETE /api/tickets/bulk
// @access  Private (TICKET_VIEW_ALL)
router.delete(
  "/bulk",
  authMiddleware,
  checkPermission("TICKET_VIEW_ALL"),
  bulkDeleteTickets,
);

// @desc    Get tickets for logged-in user (own tickets or all if they have VIEW_ALL)
// @route   GET /api/tickets/my-tickets
// @access  Private (Student or Agent) - No permission check needed, controller handles filtering
router.get("/my-tickets", authMiddleware, getMyTickets);

// @desc    Get all tickets created by a specific student (duplicate-check for agents)
// @route   GET /api/tickets/student-history?studentId=X&projectId=Y
// @access  Private (any authenticated agent)
router.get("/student-history", authMiddleware, getStudentTicketHistory);

// @desc    Get tickets assigned to logged-in agent
// @route   GET /api/tickets/agent/assigned
// @access  Private (Agent)
router.get(
  "/agent/assigned",
  authMiddleware,
  checkPermission(["TICKET_VIEW_ALL", "View Own Tickets"]),
  getAgentAssignedTickets,
);

// @desc    Get dashboard statistics
// @route   GET /api/tickets/dashboard-stats
// @access  Private
router.get(
  "/dashboard-stats",
  authMiddleware,
  checkPermission(["TICKET_VIEW_ALL", "TICKET_VIEW_OWN", "DASHBOARD_VIEW"]),
  getDashboardStats,
);

// @desc    Get project-specific dashboard statistics
// @route   GET /api/tickets/project-dashboard-stats
// @access  Private
router.get(
  "/project-dashboard-stats",
  authMiddleware,
  checkPermission(["TICKET_VIEW_ALL", "TICKET_VIEW_OWN"]),
  getProjectDashboardStats,
);

// @desc    Get all tags (MUST be before /:id route)
// @route   GET /api/tickets/tags
// @access  Private (Agent)
router.get(
  "/tags",
  authMiddleware,
  checkPermission(["TICKET_VIEW_ALL", "View Own Tickets"]),
  getAllTags,
);

// @desc    Get assignable agents (MUST be before /:id route)
// @route   GET /api/tickets/assignable-agents
// @access  Private (requires TICKET_ASSIGN or TICKET_REASSIGN permission)
router.get(
  "/assignable-agents",
  authMiddleware,
  checkPermission(["TICKET_ASSIGN", "TICKET_REASSIGN"]),
  getAssignableAgents,
);

// Bulk actions on a selected set. Registered before /:id so the literal
// paths are not swallowed by the param route.
// @route   POST /api/tickets/bulk-status
router.post(
  "/bulk-status",
  authMiddleware,
  checkPermission("TICKET_BULK_UPDATE"),
  attachProjectContext,
  bulkChangeStatus,
);
// @route   POST /api/tickets/bulk-reply
router.post(
  "/bulk-reply",
  authMiddleware,
  checkPermission(["TICKET_BULK_UPDATE", "TICKET_ADD_COMMENT"]),
  attachProjectContext,
  bulkReply,
);

// @desc    Bulk update tickets by tags (MUST be before /:id route)
// @route   POST /api/tickets/bulk-update
// @access  Private (Agent)
router.post(
  "/bulk-update",
  authMiddleware,
  checkPermission("TICKET_BULK_UPDATE"),
  bulkUpdateByTags,
);

// @desc    Get all tickets (for View Tickets page and Reports)
// @route   GET /api/tickets
// @access  Private - TICKET_VIEW_ALL or TICKET_VIEW_OWN permission required
// Supports unified and single project views via attachProjectContext middleware
// Controller handles filtering: VIEW_ALL sees all tickets, VIEW_OWN sees only assigned tickets
router.get(
  "/",
  authMiddleware,
  attachProjectContext,
  checkPermission(["TICKET_VIEW_ALL", "TICKET_VIEW_OWN"]),
  getAllTickets,
);

// @desc    Create new ticket
// @route   POST /api/tickets
// @access  Private
router.post("/", (req, res) => {
  res.json({
    success: true,
    message: "Create ticket endpoint - to be implemented",
  });
});

// @desc    Get single ticket by ID
// @route   GET /api/tickets/:id
// @access  Private (Student)
router.get(
  "/:id",
  authMiddleware,
  requireTicketAction("VIEW"),
  ticketOwnsProject,
  getTicketById,
);

// @desc    Add reply to ticket
// @route   POST /api/tickets/:id/reply
// @access  Private (Student can reply to own tickets, Agents can reply to assigned tickets)
router.post(
  "/:id/reply",
  authMiddleware,
  requireTicketAction("REPLY"),
  ticketOwnsProject,
  upload.any(),
  replyToTicket,
);

// @desc    Close ticket
// @route   PATCH /api/tickets/:id/close
// @access  Private (Student)
router.patch(
  "/:id/close",
  authMiddleware,
  requireTicketAction("CLOSE"),
  ticketOwnsProject,
  closeTicket,
);

// @desc    Reopen closed ticket
// @route   PATCH /api/tickets/:id/reopen
// @access  Private (Student)
router.patch(
  "/:id/reopen",
  authMiddleware,
  requireTicketAction("REOPEN"),
  ticketOwnsProject,
  reopenTicket,
);

// @desc    Update ticket
// @route   PUT /api/tickets/:id
// @access  Private
router.put("/:id", (req, res) => {
  res.json({
    success: true,
    message: `Update ticket ${req.params.id} endpoint - to be implemented`,
  });
});

// @desc    Update ticket status
// @route   PATCH /api/tickets/:id/status
// @access  Private (Agent)
router.patch(
  "/:id/status",
  authMiddleware,
  requireTicketAction("CHANGE_STATUS"),
  ticketOwnsProject,
  updateTicketStatus,
);

// @desc    Update ticket category
// @route   PATCH /api/tickets/:id/category
// @access  Private (Agent with TICKET_CHANGE_CATEGORY permission)
router.patch(
  "/:id/category",
  authMiddleware,
  requireTicketAction("CHANGE_CATEGORY"),
  ticketOwnsProject,
  updateTicketCategory,
);

// @desc    Update ticket category hierarchy
// @route   PATCH /api/tickets/:id/category-hierarchy
// @access  Private (Agent with TICKET_CHANGE_CATEGORY permission)
router.patch(
  "/:id/category-hierarchy",
  authMiddleware,
  requireTicketAction("CHANGE_CATEGORY"),
  ticketOwnsProject,
  updateTicketCategoryHierarchy,
);

// @desc    Update ticket priority
// @route   PATCH /api/tickets/:id/priority
// @access  Private (Agent)
router.patch(
  "/:id/priority",
  authMiddleware,
  requireTicketAction("CHANGE_PRIORITY"),
  ticketOwnsProject,
  updateTicketPriority,
);

// @desc    Add tag to ticket
// @route   POST /api/tickets/:id/tags
// @access  Private (Agent)
router.post(
  "/:id/tags",
  authMiddleware,
  requireTicketAction("EDIT"),
  ticketOwnsProject,
  addTicketTag,
);

// @desc    Remove tag from ticket
// @route   DELETE /api/tickets/:id/tags/:tag
// @access  Private (Agent)
router.delete(
  "/:id/tags/:tag",
  authMiddleware,
  requireTicketAction("EDIT"),
  ticketOwnsProject,
  removeTicketTag,
);

// @desc    Add internal note to ticket
// @route   POST /api/tickets/:id/notes
// @access  Private (Agent)
router.post(
  "/:id/notes",
  authMiddleware,
  requireTicketAction("COMMENT"),
  ticketOwnsProject,
  addInternalNote,
);

// @desc    Escalate ticket
// @route   POST /api/tickets/:id/escalate
// @access  Private (Agent with TICKET_ESCALATE permission)
router.post(
  "/:id/escalate",
  authMiddleware,
  requireTicketAction("ESCALATE"),
  ticketOwnsProject,
  escalateTicket,
);

// @desc    Get allowed escalation levels for a ticket (based on Escalation Matrix)
// @route   GET /api/tickets/:id/allowed-escalations
// @access  Private (Agent with TICKET_ESCALATE permission)
router.get(
  "/:id/allowed-escalations",
  authMiddleware,
  requireTicketAction("ESCALATE"),
  ticketOwnsProject,
  getAllowedEscalations,
);

// @desc    Escalate ticket using Escalation Matrix rules (with backend validation)
// @route   POST /api/tickets/:id/matrix-escalate
// @access  Private (Agent with TICKET_ESCALATE permission)
router.post(
  "/:id/matrix-escalate",
  authMiddleware,
  requireTicketAction("ESCALATE"),
  ticketOwnsProject,
  escalateTicketWithMatrix,
);

// @desc    Assign escalation matrix to a ticket
// @route   POST /api/tickets/:id/assign-matrix
// @access  Private (Admin with TICKET_MANAGE permission)
router.post(
  "/:id/assign-matrix",
  authMiddleware,
  checkPermission("TICKET_MANAGE"),
  ticketOwnsProject,
  assignMatrixToTicket,
);

// @desc    Assign ticket to agent
// @route   PUT /api/tickets/:id/assign
// @access  Private (Center Manager, Admin)
router.put(
  "/:id/assign",
  authMiddleware,
  requireTicketAction("ASSIGN"),
  ticketOwnsProject,
  assignTicket,
);

// @desc    Reassign ticket to a different agent / project
// @route   PATCH /api/tickets/:id/reassign
// @access  Private (TICKET_REASSIGN permission)
// Note: ownership is checked against the ticket's CURRENT project (the source),
// which is the correct gate for moving it elsewhere.
router.patch(
  "/:id/reassign",
  authMiddleware,
  requireTicketAction("REASSIGN"),
  ticketOwnsProject,
  reassignTicket,
);

// ============ NEW RBAC-PROTECTED ROUTES ============

// @desc    Export tickets to CSV or Excel
// @route   POST /api/tickets/export
// @access  Private (TICKET_EXPORT permission)
router.post(
  "/export",
  authMiddleware,
  checkPermission("TICKET_EXPORT"),
  exportTickets,
);

// @desc    Upload attachment to ticket
// @route   POST /api/tickets/:id/attachments
// @access  Private (TICKET_ADD_ATTACHMENT permission)
router.post(
  "/:id/attachments",
  authMiddleware,
  requireTicketAction("ATTACH"),
  ticketOwnsProject,
  uploadMiddleware,
  uploadAttachment,
);

// @desc    Get signed download URL for any GCS attachment (thread attachments, etc.)
// @route   GET /api/tickets/attachment-signed-url?path=...
// @access  Private (any authenticated user)
router.get("/attachment-signed-url", authMiddleware, getAttachmentSignedUrl);

// @desc    Download attachment from ticket
// @route   GET /api/tickets/:id/attachments/:attachmentId/download
// @access  Private (TICKET_VIEW_ALL or TICKET_VIEW_OWN permission)
router.get(
  "/:id/attachments/:attachmentId/download",
  authMiddleware,
  requireTicketAction("VIEW"),
  ticketOwnsProject,
  downloadAttachment,
);

// @desc    Delete attachment from ticket
// @route   DELETE /api/tickets/:id/attachments/:attachmentId
// @access  Private (TICKET_DELETE_ATTACHMENT permission)
router.delete(
  "/:id/attachments/:attachmentId",
  authMiddleware,
  requireTicketAction("DELETE_ATTACHMENT"),
  ticketOwnsProject,
  deleteAttachment,
);

// @desc    Get all comments for a ticket
// @route   GET /api/tickets/:id/comments
// @access  Private (TICKET_VIEW_ALL or TICKET_VIEW_OWN permission)
router.get(
  "/:id/comments",
  authMiddleware,
  requireTicketAction("VIEW"),
  ticketOwnsProject,
  getComments,
);

// Task 6.5: Email communication routes
// @desc    Get all email communications for a ticket
// @route   GET /api/tickets/:id/communications
// @access  Private (TICKET_VIEW_ALL or TICKET_VIEW_OWN permission)
router.get(
  "/:id/communications",
  authMiddleware,
  requireTicketAction("VIEW"),
  ticketOwnsProject,
  getEmailCommunications,
);

// @desc    Get single email communication
// @route   GET /api/tickets/:id/communications/:commId
// @access  Private (TICKET_VIEW_ALL or TICKET_VIEW_OWN permission)
router.get(
  "/:id/communications/:commId",
  authMiddleware,
  requireTicketAction("VIEW"),
  ticketOwnsProject,
  getEmailCommunicationById,
);

// Task 7.1: Send email reply route
// @desc    Send email reply to ticket
// @route   POST /api/tickets/:id/reply-email
// @access  Private (TICKET_REPLY or TICKET_VIEW_ALL permission)
router.post(
  "/:id/reply-email",
  authMiddleware,
  requireTicketAction("REPLY"),
  ticketOwnsProject,
  sendTicketReply,
);

// Draft auto-save (idle-save method)
// @route   GET    /api/tickets/:id/draft?type=reply|email
// @route   PUT    /api/tickets/:id/draft
// @route   DELETE /api/tickets/:id/draft?type=reply|email
router.get("/:id/draft", authMiddleware, ticketOwnsProject, getDraft);
router.put("/:id/draft", authMiddleware, ticketOwnsProject, saveDraft);
router.delete("/:id/draft", authMiddleware, ticketOwnsProject, deleteDraft);

// @desc    Add comment to ticket
// @route   POST /api/tickets/:id/comments
// @access  Private (TICKET_ADD_COMMENT permission)
router.post(
  "/:id/comments",
  authMiddleware,
  requireTicketAction("COMMENT"),
  ticketOwnsProject,
  createComment,
);

// @desc    Update comment
// @route   PUT /api/tickets/:id/comments/:commentId
// @access  Private (TICKET_EDIT_COMMENT permission)
router.put(
  "/:id/comments/:commentId",
  authMiddleware,
  requireTicketAction("COMMENT"),
  ticketOwnsProject,
  updateComment,
);

// @desc    Delete comment
// @route   DELETE /api/tickets/:id/comments/:commentId
// @access  Private (TICKET_DELETE_COMMENT permission)
router.delete(
  "/:id/comments/:commentId",
  authMiddleware,
  requireTicketAction("COMMENT"),
  ticketOwnsProject,
  deleteComment,
);

// @desc    Merge tickets into primary ticket
// @route   POST /api/tickets/:id/merge
// @access  Private (TICKET_MERGE permission)
router.post(
  "/:id/merge",
  authMiddleware,
  requireTicketAction("MERGE"),
  ticketOwnsProject,
  mergeTickets,
);

// @desc    Get merge candidate tickets (same student, open/in-progress)
// @route   GET /api/tickets/:id/merge-candidates
// @access  Private (TICKET_MERGE permission)
router.get(
  "/:id/merge-candidates",
  authMiddleware,
  requireTicketAction("MERGE"),
  ticketOwnsProject,
  getMergeCandidates,
);

// @desc    Get SLA status for ticket
// @route   GET /api/tickets/:id/sla-status
// @access  Private (TICKET_VIEW_ALL or TICKET_VIEW_OWN permission)
router.get(
  "/:id/sla-status",
  authMiddleware,
  requireTicketAction("VIEW"),
  ticketOwnsProject,
  getSLAStatus,
);

// @desc    Pause SLA for ticket
// @route   POST /api/tickets/:id/pause-sla
// @access  Private (TICKET_CHANGE_STATUS permission)
router.post(
  "/:id/pause-sla",
  authMiddleware,
  requireTicketAction("CHANGE_STATUS"),
  ticketOwnsProject,
  pauseSLA,
);

// @desc    Resume SLA for ticket
// @route   POST /api/tickets/:id/resume-sla
// @access  Private (TICKET_CHANGE_STATUS permission)
router.post(
  "/:id/resume-sla",
  authMiddleware,
  requireTicketAction("CHANGE_STATUS"),
  ticketOwnsProject,
  resumeSLA,
);

export default router;
