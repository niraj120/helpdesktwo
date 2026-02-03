/**
 * Email Queue Service
 * ===================
 * Helper service to easily queue email jobs from other parts of the application.
 * This provides a simple interface for background email sending.
 * 
 * Usage:
 * Instead of: await emailService.sendOTPEmail(email, otp, projectId);
 * Use:        await emailQueueService.queueOTPEmail(email, otp, projectId);
 * 
 * The email will be processed in the background with retry logic.
 */

import { jobQueue, JobPriority } from './jobQueue';
import { JOB_TYPES } from './jobProcessors';

/**
 * Queue OTP email (critical priority - processed immediately)
 */
export async function queueOTPEmail(
  email: string,
  otp: string,
  projectId?: string
): Promise<string> {
  const job = await jobQueue.add(
    JOB_TYPES.EMAIL_OTP,
    { email, otp, projectId },
    {
      priority: 'critical',
      entityType: 'email',
      entityId: email,
      metadata: { emailType: 'otp' }
    }
  );
  return job.jobId;
}

/**
 * Queue ticket creation confirmation email
 */
export async function queueTicketConfirmationEmail(
  email: string,
  ticketNumber: string,
  ticketTitle: string,
  projectId?: string,
  additionalData?: {
    studentName?: string;
    status?: string;
    priority?: string;
    ticketId?: string;
    originalMessageId?: string;
    references?: string[];
  }
): Promise<string> {
  const job = await jobQueue.add(
    JOB_TYPES.EMAIL_TICKET_CONFIRMATION,
    { email, ticketNumber, ticketTitle, projectId, additionalData },
    {
      priority: 'high',
      entityType: 'ticket',
      entityId: ticketNumber,
      metadata: { emailType: 'ticket_confirmation' }
    }
  );
  return job.jobId;
}

/**
 * Queue ticket status change email
 */
export async function queueStatusUpdateEmail(
  email: string,
  ticketNumber: string,
  ticketTitle: string,
  newStatus: string,
  previousStatus: string,
  projectId?: string,
  additionalData?: { studentName?: string }
): Promise<string> {
  const job = await jobQueue.add(
    JOB_TYPES.EMAIL_STATUS_UPDATE,
    { email, ticketNumber, ticketTitle, newStatus, previousStatus, projectId, additionalData },
    {
      priority: 'normal',
      entityType: 'ticket',
      entityId: ticketNumber,
      metadata: { emailType: 'status_update', newStatus }
    }
  );
  return job.jobId;
}

/**
 * Queue ticket assignment email (to agent)
 */
export async function queueAssignmentEmail(
  agentEmail: string,
  ticketNumber: string,
  ticketTitle: string,
  studentName: string,
  priority: string,
  projectId?: string
): Promise<string> {
  const job = await jobQueue.add(
    JOB_TYPES.EMAIL_ASSIGNMENT,
    { agentEmail, ticketNumber, ticketTitle, studentName, priority, projectId },
    {
      priority: 'high',
      entityType: 'ticket',
      entityId: ticketNumber,
      metadata: { emailType: 'assignment', agentEmail }
    }
  );
  return job.jobId;
}

/**
 * Queue escalation email
 */
export async function queueEscalationEmail(
  email: string,
  ticketNumber: string,
  ticketTitle: string,
  escalatedTo: string,
  projectId?: string
): Promise<string> {
  const job = await jobQueue.add(
    JOB_TYPES.EMAIL_ESCALATION,
    { email, ticketNumber, ticketTitle, escalatedTo, projectId },
    {
      priority: 'critical', // Escalations should be processed quickly
      entityType: 'ticket',
      entityId: ticketNumber,
      metadata: { emailType: 'escalation', escalatedTo }
    }
  );
  return job.jobId;
}

/**
 * Queue reply notification email (to agent when customer replies)
 */
export async function queueReplyNotificationEmail(
  agentEmail: string,
  ticketNumber: string,
  ticketTitle: string,
  replyPreview: string,
  customerName: string,
  projectId?: string
): Promise<string> {
  const job = await jobQueue.add(
    JOB_TYPES.EMAIL_REPLY,
    { agentEmail, ticketNumber, ticketTitle, replyPreview, customerName, projectId },
    {
      priority: 'normal',
      entityType: 'ticket',
      entityId: ticketNumber,
      metadata: { emailType: 'reply_notification', customerName }
    }
  );
  return job.jobId;
}

/**
 * Queue generic email send (for custom emails)
 */
export async function queueGenericEmail(params: {
  ticketId?: string;
  ticketNumber?: string;
  ticketSubject?: string;
  recipientEmail: string;
  recipientName?: string;
  replyContent: string;
  replyContentHtml?: string;
  agentName?: string;
  agentEmail?: string;
  projectId?: string;
}, priority: JobPriority = 'normal'): Promise<string> {
  const job = await jobQueue.add(
    JOB_TYPES.EMAIL_SEND,
    params,
    {
      priority,
      entityType: 'email',
      entityId: params.recipientEmail,
      metadata: { emailType: 'generic' }
    }
  );
  return job.jobId;
}

/**
 * Queue bulk emails
 */
export async function queueBulkEmails(
  emails: Array<{
    ticketId?: string;
    ticketNumber?: string;
    ticketSubject?: string;
    recipientEmail: string;
    recipientName?: string;
    replyContent: string;
  }>,
  agentName: string,
  agentEmail: string,
  projectId?: string
): Promise<string> {
  const job = await jobQueue.add(
    JOB_TYPES.EMAIL_BULK,
    { emails, agentName, agentEmail, projectId },
    {
      priority: 'low', // Bulk emails are lower priority
      entityType: 'bulk_email',
      entityId: `bulk-${Date.now()}`,
      metadata: { emailCount: emails.length }
    }
  );
  return job.jobId;
}

// ============================================================================
// Report Queue Functions
// ============================================================================

/**
 * Queue ticket export report
 */
export async function queueTicketExport(
  filters: {
    projectId?: string;
    status?: string;
    priority?: string;
    startDate?: string;
    endDate?: string;
  },
  format: 'xlsx' | 'csv' = 'xlsx',
  userId: string
): Promise<string> {
  const job = await jobQueue.add(
    JOB_TYPES.REPORT_TICKET_EXPORT,
    { filters, format, userId },
    {
      priority: 'normal',
      entityType: 'report',
      entityId: userId,
      metadata: { reportType: 'ticket_export', format }
    }
  );
  return job.jobId;
}

/**
 * Queue log export report
 */
export async function queueLogExport(
  logType: 'access' | 'activity',
  filters: {
    projectId?: string;
    startDate?: string;
    endDate?: string;
  }
): Promise<string> {
  const job = await jobQueue.add(
    JOB_TYPES.REPORT_LOG_EXPORT,
    { logType, filters },
    {
      priority: 'low',
      entityType: 'report',
      entityId: `log-export-${Date.now()}`,
      metadata: { reportType: 'log_export', logType }
    }
  );
  return job.jobId;
}

// ============================================================================
// Notification Queue Functions
// ============================================================================

/**
 * Queue in-app notification
 */
export async function queueNotification(
  userId: string,
  type: string,
  title: string,
  message: string,
  link?: string,
  metadata?: Record<string, any>
): Promise<string> {
  const job = await jobQueue.add(
    JOB_TYPES.NOTIFICATION_CREATE,
    { userId, type, title, message, link, metadata },
    {
      priority: 'normal',
      entityType: 'notification',
      entityId: userId,
      metadata: { notificationType: type }
    }
  );
  return job.jobId;
}

/**
 * Queue bulk notifications
 */
export async function queueBulkNotifications(
  notifications: Array<{
    userId: string;
    type: string;
    title: string;
    message: string;
    link?: string;
    metadata?: Record<string, any>;
  }>
): Promise<string> {
  const job = await jobQueue.add(
    JOB_TYPES.NOTIFICATION_BULK,
    { notifications },
    {
      priority: 'low',
      entityType: 'bulk_notification',
      entityId: `bulk-${Date.now()}`,
      metadata: { count: notifications.length }
    }
  );
  return job.jobId;
}

// ============================================================================
// Bulk Operations Queue Functions
// ============================================================================

/**
 * Queue bulk asset mapping
 */
export async function queueBulkAssetMapping(
  centerIds: string[],
  assetIds: string[],
  mappingType: string
): Promise<string> {
  const job = await jobQueue.add(
    JOB_TYPES.BULK_ASSET_MAPPING,
    { centerIds, assetIds, mappingType },
    {
      priority: 'normal',
      entityType: 'bulk_operation',
      entityId: `asset-mapping-${Date.now()}`,
      metadata: { 
        operation: 'asset_mapping',
        centerCount: centerIds.length,
        assetCount: assetIds.length
      }
    }
  );
  return job.jobId;
}

/**
 * Queue bulk ticket update
 */
export async function queueBulkTicketUpdate(
  ticketIds: string[],
  updates: Record<string, any>
): Promise<string> {
  const job = await jobQueue.add(
    JOB_TYPES.BULK_TICKET_UPDATE,
    { ticketIds, updates },
    {
      priority: 'normal',
      entityType: 'bulk_operation',
      entityId: `ticket-update-${Date.now()}`,
      metadata: { 
        operation: 'ticket_update',
        ticketCount: ticketIds.length,
        updateFields: Object.keys(updates)
      }
    }
  );
  return job.jobId;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get job status
 */
export async function getJobStatus(jobId: string) {
  return await jobQueue.getJobStatus(jobId);
}

/**
 * Get job progress
 */
export async function getJobProgress(jobId: string): Promise<number | null> {
  const job = await jobQueue.getJob(jobId);
  return job?.progress ?? null;
}

/**
 * Cancel job
 */
export async function cancelJob(jobId: string): Promise<boolean> {
  return await jobQueue.cancelJob(jobId);
}

// Export as default object for convenience
export default {
  // Email
  queueOTPEmail,
  queueTicketConfirmationEmail,
  queueStatusUpdateEmail,
  queueAssignmentEmail,
  queueEscalationEmail,
  queueReplyNotificationEmail,
  queueGenericEmail,
  queueBulkEmails,
  
  // Reports
  queueTicketExport,
  queueLogExport,
  
  // Notifications
  queueNotification,
  queueBulkNotifications,
  
  // Bulk Operations
  queueBulkAssetMapping,
  queueBulkTicketUpdate,
  
  // Utility
  getJobStatus,
  getJobProgress,
  cancelJob,
};
