import { Request } from 'express';
import ActivityLog from '../models/ActivityLog';
import AccessLog from '../models/AccessLog';

// Helper to extract IP address from request
export const getClientIp = (req: Request): string => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
};

// Helper to get user agent
export const getUserAgent = (req: Request): string => {
  return req.headers['user-agent'] || 'unknown';
};

// Log activity (CRUD operations)
export const logActivity = async (params: {
  userId: string;
  userName: string;
  userEmail: string;
  action: 'create' | 'update' | 'delete' | 'edit';
  entity: string;
  entityId?: string;
  entityName?: string;
  changes?: Array<{ field: string; oldValue: any; newValue: any }>;
  description?: string;
  req?: Request;
  projectId?: string;
  projectName?: string;
  role?: string;
  metadata?: Record<string, any>;
}): Promise<void> => {
  try {
    const logData: any = {
      userId: params.userId,
      userName: params.userName,
      userEmail: params.userEmail,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
      entityName: params.entityName,
      changes: params.changes,
      description: params.description,
      project: params.projectId,
      projectName: params.projectName,
      role: params.role,
      metadata: params.metadata,
      timestamp: new Date()
    };

    if (params.req) {
      logData.ipAddress = getClientIp(params.req);
      logData.userAgent = getUserAgent(params.req);
    }

    const log = new ActivityLog(logData);
    await log.save();
    console.log(`✅ Activity logged: ${params.action} ${params.entity} by ${params.userEmail}`);
  } catch (error) {
    console.error('❌ Error logging activity:', error);
    // Don't throw error - logging failures shouldn't break the app
  }
};

// Log access (login/logout)
export const logAccess = async (params: {
  userId?: string;
  userName?: string;
  userEmail: string;
  action: 'login' | 'logout' | 'login_failed' | 'password_reset' | 'forgot_password' | 'session_expired';
  success: boolean;
  failureReason?: string;
  req?: Request;
  projectId?: string;
  projectName?: string;
  role?: string;
  sessionDuration?: number;
  metadata?: Record<string, any>;
}): Promise<void> => {
  try {
    const logData: any = {
      userId: params.userId,
      userName: params.userName,
      userEmail: params.userEmail,
      action: params.action,
      success: params.success,
      failureReason: params.failureReason,
      project: params.projectId,
      projectName: params.projectName,
      role: params.role,
      sessionDuration: params.sessionDuration,
      metadata: params.metadata,
      timestamp: new Date()
    };

    if (params.req) {
      logData.ipAddress = getClientIp(params.req);
      logData.userAgent = getUserAgent(params.req);
    }

    const log = new AccessLog(logData);
    await log.save();
    console.log(`✅ Access logged: ${params.action} by ${params.userEmail} (success: ${params.success})`);
  } catch (error) {
    console.error('❌ Error logging access:', error);
    // Don't throw error - logging failures shouldn't break the app
  }
};

// Convenience function for login logging
export const logLogin = async (
  userId: string,
  userName: string,
  userEmail: string,
  req: Request,
  status: 'success' | 'failure',
  failureReason?: string,
  projectName?: string,
  roleName?: string
): Promise<void> => {
  await logAccess({
    userId: status === 'success' ? userId : undefined,
    userName: status === 'success' ? userName : undefined,
    userEmail,
    action: status === 'success' ? 'login' : 'login_failed',
    success: status === 'success',
    failureReason,
    req,
    projectName,
    role: roleName
  });
};

// Convenience function for logout logging
export const logLogout = async (
  userId: string,
  userName: string,
  userEmail: string,
  req: Request,
  projectName?: string,
  roleName?: string,
  sessionDuration?: number
): Promise<void> => {
  await logAccess({
    userId,
    userName,
    userEmail,
    action: 'logout',
    success: true,
    req,
    projectName,
    role: roleName,
    sessionDuration
  });
};
