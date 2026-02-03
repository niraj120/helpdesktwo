/**
 * Job Processors
 * ===============
 * Handlers for background job types.
 * Each processor is registered with the job queue.
 */

import { jobQueue, ProgressCallback } from './jobQueue';
import { IJob } from '../models/Job';
import * as emailService from '../utils/emailService';

// ============================================================================
// Job Type Constants
// ============================================================================

export const JOB_TYPES = {
  // Email Jobs
  EMAIL_SEND: 'email:send',
  EMAIL_OTP: 'email:otp',
  EMAIL_TICKET_CONFIRMATION: 'email:ticket:confirmation',
  EMAIL_STATUS_UPDATE: 'email:status:update',
  EMAIL_ASSIGNMENT: 'email:assignment',
  EMAIL_ESCALATION: 'email:escalation',
  EMAIL_REPLY: 'email:reply',
  EMAIL_BULK: 'email:bulk',
  
  // Report Jobs
  REPORT_TICKET_EXPORT: 'report:ticket:export',
  REPORT_LOG_EXPORT: 'report:log:export',
  
  // Notification Jobs
  NOTIFICATION_CREATE: 'notification:create',
  NOTIFICATION_BULK: 'notification:bulk',
  
  // Bulk Operations
  BULK_ASSET_MAPPING: 'bulk:asset:mapping',
  BULK_TICKET_UPDATE: 'bulk:ticket:update',
} as const;

export type JobType = typeof JOB_TYPES[keyof typeof JOB_TYPES];

// ============================================================================
// Email Processors
// ============================================================================

/**
 * Generic email sending processor (uses ticketReplyEmail as base)
 */
async function processEmailSend(job: IJob, progress: ProgressCallback): Promise<Record<string, any>> {
  const { ticketId, ticketNumber, ticketSubject, recipientEmail, recipientName, replyContent, replyContentHtml, agentName, agentEmail, projectId } = job.data;
  
  await progress(10);
  
  try {
    // Use the ticket reply email function as a generic email sender
    const result = await emailService.sendTicketReplyEmail({
      ticketId: ticketId || 'unknown',
      ticketNumber: ticketNumber || 'N/A',
      ticketSubject,
      recipientEmail,
      recipientName,
      replyContent,
      replyContentHtml,
      agentName: agentName || 'Support Team',
      agentEmail: agentEmail || 'support@sac-helpdesk.com',
      projectId
    });
    
    await progress(100);
    
    return {
      success: result.success,
      messageId: result.messageId,
      recipient: recipientEmail,
    };
  } catch (error: any) {
    throw new Error(`Failed to send email to ${recipientEmail}: ${error.message}`);
  }
}

/**
 * OTP email processor (high priority)
 */
async function processEmailOTP(job: IJob, progress: ProgressCallback): Promise<Record<string, any>> {
  const { email, otp, projectId } = job.data;
  
  await progress(20);
  
  try {
    await emailService.sendOTPEmail(email, otp, projectId);
    await progress(100);
    
    return {
      success: true,
      recipient: email,
      type: 'otp',
    };
  } catch (error: any) {
    throw new Error(`Failed to send OTP to ${email}: ${error.message}`);
  }
}

/**
 * Ticket confirmation email processor
 */
async function processTicketConfirmation(job: IJob, progress: ProgressCallback): Promise<Record<string, any>> {
  const { email, ticketNumber, ticketTitle, projectId, additionalData } = job.data;
  
  await progress(20);
  
  try {
    await emailService.sendTicketCreatedEmail(
      email,
      ticketNumber,
      ticketTitle,
      projectId,
      additionalData
    );
    await progress(100);
    
    return {
      success: true,
      recipient: email,
      ticketNumber,
    };
  } catch (error: any) {
    throw new Error(`Failed to send ticket confirmation for ${ticketNumber}: ${error.message}`);
  }
}

/**
 * Status update email processor
 */
async function processStatusUpdate(job: IJob, progress: ProgressCallback): Promise<Record<string, any>> {
  const { email, ticketNumber, ticketTitle, newStatus, previousStatus, projectId, additionalData } = job.data;
  
  await progress(20);
  
  try {
    await emailService.sendTicketStatusChangedEmail(
      email,
      ticketNumber,
      ticketTitle,
      newStatus,
      previousStatus,
      projectId,
      additionalData
    );
    await progress(100);
    
    return {
      success: true,
      recipient: email,
      ticketNumber,
      newStatus,
    };
  } catch (error: any) {
    throw new Error(`Failed to send status update for ${ticketNumber}: ${error.message}`);
  }
}

/**
 * Assignment notification email processor
 */
async function processAssignmentEmail(job: IJob, progress: ProgressCallback): Promise<Record<string, any>> {
  const { agentEmail, ticketNumber, ticketTitle, studentName, priority, projectId } = job.data;
  
  await progress(20);
  
  try {
    await emailService.sendTicketAssignedEmail(
      agentEmail,
      ticketNumber,
      ticketTitle,
      studentName,
      priority,
      projectId
    );
    await progress(100);
    
    return {
      success: true,
      recipient: agentEmail,
      ticketNumber,
    };
  } catch (error: any) {
    throw new Error(`Failed to send assignment email for ${ticketNumber}: ${error.message}`);
  }
}

/**
 * Escalation alert email processor
 */
async function processEscalationEmail(job: IJob, progress: ProgressCallback): Promise<Record<string, any>> {
  const { email, ticketNumber, ticketTitle, escalatedTo, projectId } = job.data;
  
  await progress(20);
  
  try {
    await emailService.sendTicketEscalatedEmail(
      email,
      ticketNumber,
      ticketTitle,
      escalatedTo,
      projectId
    );
    await progress(100);
    
    return {
      success: true,
      recipient: email,
      ticketNumber,
      type: 'escalation',
    };
  } catch (error: any) {
    throw new Error(`Failed to send escalation email for ${ticketNumber}: ${error.message}`);
  }
}

/**
 * Reply notification email processor (agent notification for new customer reply)
 */
async function processReplyEmail(job: IJob, progress: ProgressCallback): Promise<Record<string, any>> {
  const { agentEmail, ticketNumber, ticketTitle, replyPreview, customerName, projectId } = job.data;
  
  await progress(20);
  
  try {
    await emailService.sendAgentNewReplyNotification(
      agentEmail,
      ticketNumber,
      ticketTitle,
      replyPreview,
      customerName,
      projectId
    );
    await progress(100);
    
    return {
      success: true,
      recipient: agentEmail,
      ticketNumber,
      type: 'reply',
    };
  } catch (error: any) {
    throw new Error(`Failed to send reply notification for ${ticketNumber}: ${error.message}`);
  }
}

/**
 * Bulk email processor
 */
async function processBulkEmail(job: IJob, progress: ProgressCallback): Promise<Record<string, any>> {
  const { emails, projectId, agentName, agentEmail } = job.data; // Array of email objects
  
  const results = {
    total: emails.length,
    sent: 0,
    failed: 0,
    errors: [] as string[],
  };
  
  for (let i = 0; i < emails.length; i++) {
    const email = emails[i];
    try {
      await emailService.sendTicketReplyEmail({
        ticketId: email.ticketId || 'unknown',
        ticketNumber: email.ticketNumber || 'N/A',
        ticketSubject: email.ticketSubject,
        recipientEmail: email.recipientEmail,
        recipientName: email.recipientName,
        replyContent: email.replyContent,
        agentName: agentName || 'Support Team',
        agentEmail: agentEmail || 'support@sac-helpdesk.com',
        projectId
      });
      results.sent++;
    } catch (error: any) {
      results.failed++;
      results.errors.push(`${email.recipientEmail}: ${error.message}`);
    }
    
    await progress(Math.round(((i + 1) / emails.length) * 100));
  }
  
  return results;
}

// ============================================================================
// Report Processors
// ============================================================================

/**
 * Ticket export processor (for large exports)
 * This creates a background export and stores the result
 */
async function processTicketExport(job: IJob, progress: ProgressCallback): Promise<Record<string, any>> {
  const { filters, format, userId } = job.data;
  
  // Import dynamically to avoid circular dependencies
  const { Ticket } = await import('../models/Ticket');
  const ExcelJS = await import('exceljs');
  
  await progress(10);
  
  // Build query from filters
  const query: Record<string, any> = {};
  if (filters.projectId) query['metadata.projectId'] = filters.projectId;
  if (filters.status) query.status = filters.status;
  if (filters.priority) query.priority = filters.priority;
  if (filters.startDate && filters.endDate) {
    query.createdAt = {
      $gte: new Date(filters.startDate),
      $lte: new Date(filters.endDate),
    };
  }
  
  await progress(20);
  
  // Fetch tickets in batches
  const batchSize = 500;
  let skip = 0;
  const allTickets: any[] = [];
  
  while (true) {
    const batch = await Ticket.find(query)
      .populate('assignedTo', 'firstName lastName email')
      .populate('category', 'name')
      .skip(skip)
      .limit(batchSize)
      .lean();
    
    if (batch.length === 0) break;
    
    allTickets.push(...batch);
    skip += batchSize;
    
    // Update progress (20-70% for data fetching)
    await progress(20 + Math.round((allTickets.length / (allTickets.length + batchSize)) * 50));
  }
  
  await progress(70);
  
  // Create Excel workbook
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Tickets');
  
  // Headers
  worksheet.columns = [
    { header: 'Ticket #', key: 'ticketNumber', width: 15 },
    { header: 'Subject', key: 'subject', width: 40 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Priority', key: 'priority', width: 12 },
    { header: 'Category', key: 'category', width: 20 },
    { header: 'Assigned To', key: 'assignedTo', width: 25 },
    { header: 'Created At', key: 'createdAt', width: 20 },
    { header: 'Updated At', key: 'updatedAt', width: 20 },
  ];
  
  // Add rows
  allTickets.forEach((ticket) => {
    worksheet.addRow({
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject || ticket.title,
      status: ticket.status,
      priority: ticket.priority,
      category: ticket.category?.name || 'N/A',
      assignedTo: ticket.assignedTo
        ? `${ticket.assignedTo.firstName} ${ticket.assignedTo.lastName}`
        : 'Unassigned',
      createdAt: new Date(ticket.createdAt).toLocaleString(),
      updatedAt: new Date(ticket.updatedAt).toLocaleString(),
    });
  });
  
  await progress(90);
  
  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  
  await progress(100);
  
  return {
    success: true,
    totalRecords: allTickets.length,
    format: 'xlsx',
    filename: `ticket-export-${new Date().toISOString().split('T')[0]}.xlsx`,
    data: base64, // Base64 encoded file
  };
}

/**
 * Log export processor
 */
async function processLogExport(job: IJob, progress: ProgressCallback): Promise<Record<string, any>> {
  const { logType, filters } = job.data;
  
  const ExcelJS = await import('exceljs');
  
  await progress(20);
  
  // Build query
  const query: Record<string, any> = {};
  if (filters.projectId) query.project = filters.projectId;
  if (filters.startDate && filters.endDate) {
    query.timestamp = {
      $gte: new Date(filters.startDate),
      $lte: new Date(filters.endDate),
    };
  }
  
  // Fetch logs based on type
  let logs: any[];
  if (logType === 'access') {
    const AccessLog = (await import('../models/AccessLog')).default;
    logs = await AccessLog.find(query)
      .sort({ timestamp: -1 })
      .limit(10000)
      .lean();
  } else {
    const ActivityLog = (await import('../models/ActivityLog')).default;
    logs = await ActivityLog.find(query)
      .sort({ timestamp: -1 })
      .limit(10000)
      .lean();
  }
  
  await progress(60);
  
  // Create workbook
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Logs');
  
  if (logType === 'access') {
    worksheet.columns = [
      { header: 'Timestamp', key: 'timestamp', width: 20 },
      { header: 'User', key: 'user', width: 30 },
      { header: 'Action', key: 'action', width: 15 },
      { header: 'Success', key: 'success', width: 10 },
      { header: 'IP Address', key: 'ip', width: 15 },
    ];
    
    logs.forEach((log: any) => {
      worksheet.addRow({
        timestamp: new Date(log.timestamp).toLocaleString(),
        user: log.userEmail || log.userName,
        action: log.action,
        success: log.success ? 'Yes' : 'No',
        ip: log.ipAddress,
      });
    });
  } else {
    worksheet.columns = [
      { header: 'Timestamp', key: 'timestamp', width: 20 },
      { header: 'User', key: 'user', width: 30 },
      { header: 'Action', key: 'action', width: 20 },
      { header: 'Entity', key: 'entity', width: 15 },
      { header: 'Details', key: 'details', width: 40 },
    ];
    
    logs.forEach((log: any) => {
      worksheet.addRow({
        timestamp: new Date(log.timestamp).toLocaleString(),
        user: log.performedBy?.email || 'System',
        action: log.action,
        entity: log.entityType,
        details: log.description,
      });
    });
  }
  
  await progress(90);
  
  const buffer = await workbook.xlsx.writeBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  
  await progress(100);
  
  return {
    success: true,
    totalRecords: logs.length,
    format: 'xlsx',
    filename: `${logType}-logs-export-${new Date().toISOString().split('T')[0]}.xlsx`,
    data: base64,
  };
}

// ============================================================================
// Notification Processors
// ============================================================================

/**
 * Create in-app notification
 */
async function processNotificationCreate(job: IJob, progress: ProgressCallback): Promise<Record<string, any>> {
  const { userId, type, title, message, link, metadata } = job.data;
  
  const { Notification } = await import('../models/Notification');
  
  await progress(50);
  
  const notification = await Notification.create({
    userId,
    type,
    title,
    message,
    link,
    metadata,
    isRead: false,
  });
  
  await progress(100);
  
  return {
    success: true,
    notificationId: notification._id,
  };
}

/**
 * Bulk notification creation
 */
async function processBulkNotifications(job: IJob, progress: ProgressCallback): Promise<Record<string, any>> {
  const { notifications } = job.data; // Array of notification objects
  
  const { Notification } = await import('../models/Notification');
  
  await progress(20);
  
  const created = await Notification.insertMany(
    notifications.map((n: any) => ({
      ...n,
      isRead: false,
      createdAt: new Date(),
    }))
  );
  
  await progress(100);
  
  return {
    success: true,
    count: created.length,
  };
}

// ============================================================================
// Bulk Operation Processors
// ============================================================================

/**
 * Bulk asset mapping processor
 */
async function processBulkAssetMapping(job: IJob, progress: ProgressCallback): Promise<Record<string, any>> {
  const { centerIds, assetIds, mappingType } = job.data;
  
  const { CenterAssetMapping } = await import('../models/CenterAssetMapping');
  
  let processed = 0;
  const total = centerIds.length * assetIds.length;
  const results = { created: 0, skipped: 0, errors: 0 };
  
  for (const centerId of centerIds) {
    for (const assetId of assetIds) {
      try {
        const existing = await CenterAssetMapping.findOne({
          center: centerId,
          asset: assetId,
        });
        
        if (!existing) {
          await CenterAssetMapping.create({
            center: centerId,
            asset: assetId,
            mappingType,
          });
          results.created++;
        } else {
          results.skipped++;
        }
      } catch (error) {
        results.errors++;
      }
      
      processed++;
      await progress(Math.round((processed / total) * 100));
    }
  }
  
  return results;
}

/**
 * Bulk ticket update processor
 */
async function processBulkTicketUpdate(job: IJob, progress: ProgressCallback): Promise<Record<string, any>> {
  const { ticketIds, updates } = job.data;
  
  const { Ticket } = await import('../models/Ticket');
  
  await progress(20);
  
  const result = await Ticket.updateMany(
    { _id: { $in: ticketIds } },
    { $set: updates }
  );
  
  await progress(100);
  
  return {
    success: true,
    matched: result.matchedCount,
    modified: result.modifiedCount,
  };
}

// ============================================================================
// Register All Processors
// ============================================================================

export function registerJobProcessors(): void {
  console.log('📋 [JobProcessors] Registering all processors...');
  
  // Email processors
  jobQueue.process(JOB_TYPES.EMAIL_SEND, processEmailSend);
  jobQueue.process(JOB_TYPES.EMAIL_OTP, processEmailOTP);
  jobQueue.process(JOB_TYPES.EMAIL_TICKET_CONFIRMATION, processTicketConfirmation);
  jobQueue.process(JOB_TYPES.EMAIL_STATUS_UPDATE, processStatusUpdate);
  jobQueue.process(JOB_TYPES.EMAIL_ASSIGNMENT, processAssignmentEmail);
  jobQueue.process(JOB_TYPES.EMAIL_ESCALATION, processEscalationEmail);
  jobQueue.process(JOB_TYPES.EMAIL_REPLY, processReplyEmail);
  jobQueue.process(JOB_TYPES.EMAIL_BULK, processBulkEmail);
  
  // Report processors
  jobQueue.process(JOB_TYPES.REPORT_TICKET_EXPORT, processTicketExport);
  jobQueue.process(JOB_TYPES.REPORT_LOG_EXPORT, processLogExport);
  
  // Notification processors
  jobQueue.process(JOB_TYPES.NOTIFICATION_CREATE, processNotificationCreate);
  jobQueue.process(JOB_TYPES.NOTIFICATION_BULK, processBulkNotifications);
  
  // Bulk operation processors
  jobQueue.process(JOB_TYPES.BULK_ASSET_MAPPING, processBulkAssetMapping);
  jobQueue.process(JOB_TYPES.BULK_TICKET_UPDATE, processBulkTicketUpdate);
  
  console.log('✅ [JobProcessors] All processors registered');
}

export default { JOB_TYPES, registerJobProcessors };
