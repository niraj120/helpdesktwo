import { Router } from 'express';
import { 
  submitTicket, 
  upload, 
  getMyTickets,
  getAllTickets,
  getTicketById, 
  replyToTicket, 
  closeTicket, 
  getAgentAssignedTickets,
  updateTicketStatus,
  updateTicketCategory,
  updateTicketPriority,
  addTicketTag,
  removeTicketTag,
  addInternalNote,
  escalateTicket,
  assignTicket,
  getAllTags,
  bulkUpdateByTags,
  getDashboardStats,
  getProjectDashboardStats,
  createOfflineTicket,
  getAssignableAgents,
} from '../controllers/ticketController';
import { authMiddleware } from '../middleware/auth';
import { checkPermission } from '../middleware/permissions';

// Attachment controllers
import { 
  uploadAttachment, 
  downloadAttachment, 
  deleteAttachment,
  uploadMiddleware 
} from '../controllers/ticketAttachmentController';

// Comment controllers
import {
  getComments,
  createComment,
  updateComment,
  deleteComment
} from '../controllers/ticketCommentController';

// Export controller
import { exportTickets } from '../controllers/ticketExportController';

// Merge controller
import { mergeTickets } from '../controllers/ticketMergeController';

const router = Router();

// @desc    Submit ticket from student portal
// @route   POST /api/tickets/submit
// @access  Public
// Accept any file field names from the student portal (we'll map files by their fieldnames in the controller)
router.post('/submit', upload.any(), submitTicket);

// @desc    Create offline ticket submission (by agent on behalf of student)
// @route   POST /api/tickets/offline-submission
// @access  Private (Agent)
router.post('/offline-submission', authMiddleware, checkPermission('OFFLINE_TICKET_CREATE'), upload.any(), createOfflineTicket);

// @desc    Get tickets for logged-in user (own tickets or all if they have VIEW_ALL)
// @route   GET /api/tickets/my-tickets
// @access  Private (Student or Agent) - No permission check needed, controller handles filtering
router.get('/my-tickets', authMiddleware, getMyTickets);

// @desc    Get tickets assigned to logged-in agent
// @route   GET /api/tickets/agent/assigned
// @access  Private (Agent)
router.get('/agent/assigned', authMiddleware, checkPermission(['TICKET_VIEW_ALL', 'View Own Tickets']), getAgentAssignedTickets);

// @desc    Get dashboard statistics
// @route   GET /api/tickets/dashboard-stats
// @access  Private
router.get('/dashboard-stats', authMiddleware, checkPermission(['TICKET_VIEW_ALL', 'DASHBOARD_VIEW']), getDashboardStats);

// @desc    Get project-specific dashboard statistics
// @route   GET /api/tickets/project-dashboard-stats
// @access  Private
router.get('/project-dashboard-stats', authMiddleware, checkPermission(['TICKET_VIEW_ALL', 'TICKET_VIEW_OWN']), getProjectDashboardStats);

// @desc    Get all tags (MUST be before /:id route)
// @route   GET /api/tickets/tags
// @access  Private (Agent)
router.get('/tags', authMiddleware, checkPermission(['TICKET_VIEW_ALL', 'View Own Tickets']), getAllTags);

// @desc    Get assignable agents (MUST be before /:id route)
// @route   GET /api/tickets/assignable-agents
// @access  Private (requires TICKET_ASSIGN permission)
router.get('/assignable-agents', authMiddleware, checkPermission('TICKET_ASSIGN'), getAssignableAgents);

// @desc    Bulk update tickets by tags (MUST be before /:id route)
// @route   POST /api/tickets/bulk-update
// @access  Private (Agent)
router.post('/bulk-update', authMiddleware, checkPermission('TICKET_BULK_UPDATE'), bulkUpdateByTags);

// @desc    Get all tickets (for View Tickets page)
// @route   GET /api/tickets
// @access  Private - TICKET_VIEW_ALL permission required
router.get('/', authMiddleware, checkPermission('TICKET_VIEW_ALL'), getAllTickets);

// @desc    Create new ticket
// @route   POST /api/tickets
// @access  Private
router.post('/', (req, res) => {
  res.json({
    success: true,
    message: 'Create ticket endpoint - to be implemented',
  });
});

// @desc    Get single ticket by ID
// @route   GET /api/tickets/:id
// @access  Private (Student)
router.get('/:id', authMiddleware, checkPermission(['TICKET_VIEW_ALL', 'TICKET_VIEW_OWN']), getTicketById);

// @desc    Add reply to ticket
// @route   POST /api/tickets/:id/reply
// @access  Private (Student)
router.post('/:id/reply', authMiddleware, checkPermission('TICKET_ADD_COMMENT'), upload.any(), replyToTicket);

// @desc    Close ticket
// @route   PATCH /api/tickets/:id/close
// @access  Private (Student)
router.patch('/:id/close', authMiddleware, checkPermission('TICKET_CHANGE_STATUS'), closeTicket);

// @desc    Update ticket
// @route   PUT /api/tickets/:id
// @access  Private
router.put('/:id', (req, res) => {
  res.json({
    success: true,
    message: `Update ticket ${req.params.id} endpoint - to be implemented`,
  });
});

// @desc    Update ticket status
// @route   PATCH /api/tickets/:id/status
// @access  Private (Agent)
router.patch('/:id/status', authMiddleware, checkPermission('TICKET_CHANGE_STATUS'), updateTicketStatus);

// @desc    Update ticket category
// @route   PATCH /api/tickets/:id/category
// @access  Private (Agent)
router.patch('/:id/category', authMiddleware, checkPermission('TICKET_EDIT'), updateTicketCategory);

// @desc    Update ticket priority
// @route   PATCH /api/tickets/:id/priority
// @access  Private (Agent)
router.patch('/:id/priority', authMiddleware, checkPermission('TICKET_CHANGE_PRIORITY'), updateTicketPriority);

// @desc    Add tag to ticket
// @route   POST /api/tickets/:id/tags
// @access  Private (Agent)
router.post('/:id/tags', authMiddleware, checkPermission('TICKET_EDIT'), addTicketTag);

// @desc    Remove tag from ticket
// @route   DELETE /api/tickets/:id/tags/:tag
// @access  Private (Agent)
router.delete('/:id/tags/:tag', authMiddleware, checkPermission('TICKET_EDIT'), removeTicketTag);

// @desc    Add internal note to ticket
// @route   POST /api/tickets/:id/notes
// @access  Private (Agent)
router.post('/:id/notes', authMiddleware, checkPermission('TICKET_ADD_COMMENT'), addInternalNote);

// @desc    Escalate ticket
// @route   POST /api/tickets/:id/escalate
// @access  Private (Agent)
router.post('/:id/escalate', authMiddleware, checkPermission('TICKET_ESCALATE'), escalateTicket);

// @desc    Assign ticket to agent
// @route   PUT /api/tickets/:id/assign
// @access  Private (Center Manager, Admin)
router.put('/:id/assign', authMiddleware, checkPermission('TICKET_ASSIGN'), assignTicket);

// ============ NEW RBAC-PROTECTED ROUTES ============

// @desc    Export tickets to CSV or Excel
// @route   POST /api/tickets/export
// @access  Private (TICKET_EXPORT permission)
router.post('/export', authMiddleware, checkPermission('TICKET_EXPORT'), exportTickets);

// @desc    Upload attachment to ticket
// @route   POST /api/tickets/:id/attachments
// @access  Private (TICKET_ADD_ATTACHMENT permission)
router.post('/:id/attachments', authMiddleware, checkPermission('TICKET_ADD_ATTACHMENT'), uploadMiddleware, uploadAttachment);

// @desc    Download attachment from ticket
// @route   GET /api/tickets/:id/attachments/:attachmentId/download
// @access  Private (TICKET_VIEW_ALL or TICKET_VIEW_OWN permission)
router.get('/:id/attachments/:attachmentId/download', authMiddleware, checkPermission(['TICKET_VIEW_ALL', 'TICKET_VIEW_OWN']), downloadAttachment);

// @desc    Delete attachment from ticket
// @route   DELETE /api/tickets/:id/attachments/:attachmentId
// @access  Private (TICKET_DELETE_ATTACHMENT permission)
router.delete('/:id/attachments/:attachmentId', authMiddleware, checkPermission('TICKET_DELETE_ATTACHMENT'), deleteAttachment);

// @desc    Get all comments for a ticket
// @route   GET /api/tickets/:id/comments
// @access  Private (TICKET_VIEW_ALL or TICKET_VIEW_OWN permission)
router.get('/:id/comments', authMiddleware, checkPermission(['TICKET_VIEW_ALL', 'TICKET_VIEW_OWN']), getComments);

// @desc    Add comment to ticket
// @route   POST /api/tickets/:id/comments
// @access  Private (TICKET_ADD_COMMENT permission)
router.post('/:id/comments', authMiddleware, checkPermission('TICKET_ADD_COMMENT'), createComment);

// @desc    Update comment
// @route   PUT /api/tickets/:id/comments/:commentId
// @access  Private (TICKET_EDIT_COMMENT permission)
router.put('/:id/comments/:commentId', authMiddleware, checkPermission('TICKET_EDIT_COMMENT'), updateComment);

// @desc    Delete comment
// @route   DELETE /api/tickets/:id/comments/:commentId
// @access  Private (TICKET_DELETE_COMMENT permission)
router.delete('/:id/comments/:commentId', authMiddleware, checkPermission('TICKET_DELETE_COMMENT'), deleteComment);

// @desc    Merge tickets into primary ticket
// @route   POST /api/tickets/:id/merge
// @access  Private (TICKET_MERGE permission)
router.post('/:id/merge', authMiddleware, checkPermission('TICKET_MERGE'), mergeTickets);

export default router;