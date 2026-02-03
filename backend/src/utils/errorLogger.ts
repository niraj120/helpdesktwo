/**
 * Centralized Error Logging Service (Task 8.1)
 * Logs all errors with detailed context for debugging and monitoring
 */

import ErrorLog from '../models/ErrorLog';

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum ErrorContext {
  EMAIL_POLLING = 'email_polling',
  EMAIL_PARSING = 'email_parsing',
  TICKET_CREATION = 'ticket_creation',
  TICKET_UPDATE = 'ticket_update',
  EMAIL_SENDING = 'email_sending',
  THREAD_DETECTION = 'thread_detection',
  DATABASE_OPERATION = 'database_operation',
  API_REQUEST = 'api_request',
  AUTHENTICATION = 'authentication',
  VALIDATION = 'validation',
  SMTP_CONNECTION = 'smtp_connection',
  FILE_UPLOAD = 'file_upload',
  OTHER = 'other'
}

export interface ErrorLogData {
  message: string;
  stack?: string;
  context: ErrorContext;
  severity: ErrorSeverity;
  details?: {
    emailMessageId?: string;
    ticketId?: string;
    ticketNumber?: string;
    userId?: string;
    email?: string;
    endpoint?: string;
    method?: string;
    statusCode?: number;
    requestBody?: any;
    [key: string]: any;
  };
  projectId?: string;
}

/**
 * Log an error to the database with full context
 * 
 * @param errorData - Error information and context
 * @returns Promise<void>
 */
export async function logError(errorData: ErrorLogData): Promise<void> {
  try {
    const errorLog = new ErrorLog({
      message: errorData.message,
      stack: errorData.stack,
      context: errorData.context,
      severity: errorData.severity,
      details: errorData.details || {},
      projectId: errorData.projectId,
      timestamp: new Date(),
      resolved: false
    });

    await errorLog.save();

    // Log to console for immediate visibility
    const severityEmoji = {
      [ErrorSeverity.LOW]: '📝',
      [ErrorSeverity.MEDIUM]: '⚠️',
      [ErrorSeverity.HIGH]: '🔴',
      [ErrorSeverity.CRITICAL]: '🚨'
    };

    console.error(
      `${severityEmoji[errorData.severity]} [${errorData.context.toUpperCase()}] ${errorData.message}`,
      errorData.details ? `\nDetails:` : '',
      errorData.details || ''
    );

    // Check if critical error needs alerting
    if (errorData.severity === ErrorSeverity.CRITICAL) {
      await sendCriticalErrorAlert(errorData);
    }
  } catch (loggingError) {
    // Fallback if error logging fails - still log to console
    console.error('❌ Failed to log error to database:', loggingError);
    console.error('Original error:', errorData);
  }
}

/**
 * Log email-related errors with specific context
 * 
 * @param error - Error object or message
 * @param context - Email operation context
 * @param details - Additional details (messageId, email, etc.)
 */
export async function logEmailError(
  error: Error | string,
  context: ErrorContext,
  details?: {
    emailMessageId?: string;
    email?: string;
    ticketId?: string;
    ticketNumber?: string;
    queueId?: string;
    smtpHost?: string;
    [key: string]: any;
  }
): Promise<void> {
  const errorMessage = error instanceof Error ? error.message : error;
  const errorStack = error instanceof Error ? error.stack : undefined;

  // Determine severity based on context
  let severity = ErrorSeverity.MEDIUM;
  if (context === ErrorContext.EMAIL_SENDING) {
    severity = ErrorSeverity.HIGH; // Failed to send reply
  } else if (context === ErrorContext.SMTP_CONNECTION) {
    severity = ErrorSeverity.CRITICAL; // SMTP down affects all email
  } else if (context === ErrorContext.EMAIL_POLLING) {
    severity = ErrorSeverity.HIGH; // Can't receive new tickets
  }

  await logError({
    message: errorMessage,
    stack: errorStack,
    context,
    severity,
    details: {
      ...details,
      errorType: 'email_operation'
    }
  });
}

/**
 * Log API request errors
 * 
 * @param error - Error object
 * @param req - Express request object
 * @param details - Additional details
 */
export async function logApiError(
  error: Error | string,
  req: any,
  details?: Record<string, any>
): Promise<void> {
  const errorMessage = error instanceof Error ? error.message : error;
  const errorStack = error instanceof Error ? error.stack : undefined;

  await logError({
    message: errorMessage,
    stack: errorStack,
    context: ErrorContext.API_REQUEST,
    severity: ErrorSeverity.MEDIUM,
    details: {
      endpoint: req.originalUrl || req.url,
      method: req.method,
      userId: req.user?.userId || req.user?._id,
      userEmail: req.user?.email,
      requestBody: req.body,
      query: req.query,
      params: req.params,
      ...details
    }
  });
}

/**
 * Log database operation errors
 * 
 * @param error - Error object
 * @param operation - Database operation description
 * @param details - Additional details
 */
export async function logDatabaseError(
  error: Error | string,
  operation: string,
  details?: Record<string, any>
): Promise<void> {
  const errorMessage = error instanceof Error ? error.message : error;
  const errorStack = error instanceof Error ? error.stack : undefined;

  await logError({
    message: errorMessage,
    stack: errorStack,
    context: ErrorContext.DATABASE_OPERATION,
    severity: ErrorSeverity.HIGH,
    details: {
      operation,
      ...details
    }
  });
}

/**
 * Send alert for critical errors
 * This can be extended to send emails, Slack notifications, etc.
 * 
 * @param errorData - Error data that needs alerting
 */
async function sendCriticalErrorAlert(errorData: ErrorLogData): Promise<void> {
  try {
    // TODO: Implement actual alerting mechanism
    // Options:
    // 1. Send email to admin
    // 2. Send Slack/Discord notification
    // 3. Trigger PagerDuty/Opsgenie alert
    // 4. Push to monitoring service (Sentry, DataDog, etc.)

    console.error(`
╔═══════════════════════════════════════════════════════════╗
║           🚨 CRITICAL ERROR ALERT 🚨                      ║
╠═══════════════════════════════════════════════════════════╣
║ Context: ${errorData.context.toUpperCase().padEnd(47)} ║
║ Message: ${errorData.message.substring(0, 47).padEnd(47)} ║
║ Time: ${new Date().toISOString().padEnd(50)} ║
╚═══════════════════════════════════════════════════════════╝
    `);

    // Placeholder for future implementation
    // await sendEmailAlert(errorData);
    // await sendSlackAlert(errorData);
  } catch (alertError) {
    console.error('Failed to send critical error alert:', alertError);
  }
}

/**
 * Get recent errors for monitoring dashboard
 * 
 * @param filters - Filter options
 * @returns Promise<Array> Recent errors
 */
export async function getRecentErrors(filters?: {
  severity?: ErrorSeverity;
  context?: ErrorContext;
  resolved?: boolean;
  limit?: number;
  projectId?: string;
}): Promise<any[]> {
  try {
    const query: any = {};

    if (filters?.severity) {
      query.severity = filters.severity;
    }
    if (filters?.context) {
      query.context = filters.context;
    }
    if (filters?.resolved !== undefined) {
      query.resolved = filters.resolved;
    }
    if (filters?.projectId) {
      query.projectId = filters.projectId;
    }

    const errors = await ErrorLog.find(query)
      .sort({ timestamp: -1 })
      .limit(filters?.limit || 100)
      .lean();

    return errors;
  } catch (error) {
    console.error('Failed to retrieve error logs:', error);
    return [];
  }
}

/**
 * Mark an error as resolved
 * 
 * @param errorId - Error log ID
 * @param resolvedBy - User ID who resolved it
 * @param resolution - Resolution notes
 */
export async function resolveError(
  errorId: string,
  resolvedBy?: string,
  resolution?: string
): Promise<boolean> {
  try {
    await ErrorLog.findByIdAndUpdate(errorId, {
      resolved: true,
      resolvedAt: new Date(),
      resolvedBy,
      resolution
    });
    return true;
  } catch (error) {
    console.error('Failed to resolve error:', error);
    return false;
  }
}

/**
 * Get error statistics for monitoring
 * 
 * @param projectId - Optional project filter
 * @returns Promise<Object> Error statistics
 */
export async function getErrorStats(projectId?: string): Promise<{
  total: number;
  bySeverity: Record<string, number>;
  byContext: Record<string, number>;
  unresolved: number;
  last24Hours: number;
}> {
  try {
    const query: any = projectId ? { projectId } : {};
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      total,
      bySeverity,
      byContext,
      unresolved,
      last24Hours
    ] = await Promise.all([
      ErrorLog.countDocuments(query),
      ErrorLog.aggregate([
        { $match: query },
        { $group: { _id: '$severity', count: { $sum: 1 } } }
      ]),
      ErrorLog.aggregate([
        { $match: query },
        { $group: { _id: '$context', count: { $sum: 1 } } }
      ]),
      ErrorLog.countDocuments({ ...query, resolved: false }),
      ErrorLog.countDocuments({ ...query, timestamp: { $gte: yesterday } })
    ]);

    return {
      total,
      bySeverity: bySeverity.reduce((acc: any, item: any) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      byContext: byContext.reduce((acc: any, item: any) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      unresolved,
      last24Hours
    };
  } catch (error) {
    console.error('Failed to get error statistics:', error);
    return {
      total: 0,
      bySeverity: {},
      byContext: {},
      unresolved: 0,
      last24Hours: 0
    };
  }
}

// Export helper functions for common scenarios
export const ErrorLogger = {
  logError,
  logEmailError,
  logApiError,
  logDatabaseError,
  getRecentErrors,
  resolveError,
  getErrorStats
};

export default ErrorLogger;
