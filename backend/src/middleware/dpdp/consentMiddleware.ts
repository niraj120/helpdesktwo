/**
 * DPDP Act 2023 Compliance: Consent Validation Middleware
 * 
 * Legal Requirement: Section 6 - No processing without valid consent
 * Purpose: Validate consent before allowing access to personal data endpoints
 */

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../auth';
import ConsentRecord, { ConsentPurpose, ConsentStatus } from '../../models/dpdp/ConsentRecord';
import DataAccessLog, { DataAccessAction, DataAccessResult } from '../../models/dpdp/DataAccessLog';
import mongoose from 'mongoose';

// Extend Express Request to include DPDP context
declare global {
  namespace Express {
    interface Request {
      dpdp?: {
        consentVerified: boolean;
        consentId?: mongoose.Types.ObjectId;
        purpose?: ConsentPurpose;
        allowedDataCategories?: string[];
      };
    }
  }
}

// Configuration: Map endpoints to required purposes
const ENDPOINT_PURPOSE_MAP: Record<string, ConsentPurpose> = {
  '/api/users': ConsentPurpose.ACCOUNT_CREATION,
  '/api/tickets': ConsentPurpose.TICKET_MANAGEMENT,
  '/api/feedback': ConsentPurpose.FEEDBACK_COLLECTION,
  '/api/offline-registration': ConsentPurpose.OFFLINE_REGISTRATION,
  '/api/hrms': ConsentPurpose.HRMS_INTEGRATION,
  '/api/analytics': ConsentPurpose.ANALYTICS,
  '/api/projects': ConsentPurpose.PROJECT_COLLABORATION,
  '/api/assets': ConsentPurpose.ASSET_MANAGEMENT,
  '/api/knowledge-base': ConsentPurpose.KNOWLEDGE_BASE_ACCESS,
};

// Exempt endpoints that don't process personal data
const EXEMPT_ENDPOINTS = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/verify-token',
  '/api/health',
  '/api/public',
  '/api/dpdp/consent', // Allow consent management without prior consent
  '/api/dpdp/my-data', // User rights endpoints
];

/**
 * Middleware to validate consent before processing personal data
 * 
 * Usage:
 *   router.get('/api/users/:id', requireConsent(ConsentPurpose.ACCOUNT_CREATION), getUser);
 */
export const requireConsent = (purpose: ConsentPurpose) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get user ID from authenticated request
      const userId = req.user?.userId;
      
      if (!userId) {
        await logAccessDenied(req, null, purpose, 'No authenticated user');
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          dpdpViolation: 'UNAUTHENTICATED_ACCESS',
        });
        return;
      }

      // Check if accessing own data or someone else's
      const targetUserId = req.params.userId || req.params.id || req.body.userId || userId;
      
      // Admins accessing other users' data still need consent verification
      const consent = await ConsentRecord.getActiveConsent(
        new mongoose.Types.ObjectId(targetUserId),
        purpose
      );

      if (!consent) {
        await logAccessDenied(req, targetUserId, purpose, 'No active consent found');
        res.status(403).json({
          success: false,
          error: 'Consent required for this operation',
          dpdpViolation: 'NO_CONSENT',
          purpose,
          message: 'Please provide consent for data processing to continue',
          consentUrl: '/api/dpdp/consent/request',
        });
        return;
      }

      // Verify consent hasn't expired
      if (consent.expiresAt && consent.expiresAt < new Date()) {
        consent.status = ConsentStatus.EXPIRED;
        await consent.save();
        
        await logAccessDenied(req, targetUserId, purpose, 'Consent expired');
        res.status(403).json({
          success: false,
          error: 'Consent has expired',
          dpdpViolation: 'EXPIRED_CONSENT',
          purpose,
          message: 'Please renew consent to continue',
          consentUrl: '/api/dpdp/consent/request',
        });
        return;
      }

      // Attach consent info to request for downstream use
      req.dpdp = {
        consentVerified: true,
        consentId: consent._id,
        purpose,
        allowedDataCategories: consent.dataCategories,
      };

      // Log successful access
      await logAccessSuccess(req, targetUserId, purpose, consent._id);

      next();
    } catch (error) {
      console.error('Consent validation error:', error);
      await logAccessError(req, null, purpose, error);
      res.status(500).json({
        success: false,
        error: 'Consent validation failed',
        dpdpViolation: 'VALIDATION_ERROR',
      });
      return;
    }
  };
};

/**
 * Auto-detect purpose based on endpoint and validate consent
 */
export const autoConsentCheck = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // Check if endpoint is exempt
    const isExempt = EXEMPT_ENDPOINTS.some(exempt => req.path.startsWith(exempt));
    if (isExempt) {
      return next();
    }

    // Detect purpose from endpoint
    const purpose = detectPurpose(req.path);
    if (!purpose) {
      // No known purpose mapping, allow (non-personal data endpoint)
      return next();
    }

    // Apply consent check
    return requireConsent(purpose)(req, res, next);
  } catch (error) {
    console.error('Auto consent check error:', error);
    next(error);
  }
};

/**
 * Detect purpose from API endpoint
 */
function detectPurpose(path: string): ConsentPurpose | null {
  for (const [endpoint, purpose] of Object.entries(ENDPOINT_PURPOSE_MAP)) {
    if (path.startsWith(endpoint)) {
      return purpose;
    }
  }
  return null;
}

/**
 * Log successful data access
 */
async function logAccessSuccess(
  req: AuthRequest,
  targetUserId: string,
  purpose: ConsentPurpose,
  consentId: mongoose.Types.ObjectId
): Promise<void> {
  try {
    await DataAccessLog.create({
      accessorUserId: req.user?.userId,
      accessorRole: req.user?.role?.code || 'UNKNOWN',
      accessorIP: req.ip || req.connection.remoteAddress || 'unknown',
      targetUserId: new mongoose.Types.ObjectId(targetUserId),
      dataCategory: purpose,
      fields: extractAccessedFields(req),
      accessedAt: new Date(),
      endpoint: req.path,
      method: req.method,
      purpose,
      consentId,
      action: getActionFromMethod(req.method),
      result: DataAccessResult.SUCCESS,
      projectId: req.body.projectId || req.query.projectId,
      ticketId: req.body.ticketId || req.params.ticketId,
      userAgent: req.get('User-Agent'),
    });
  } catch (error) {
    console.error('Failed to log data access:', error);
    // Don't block request if logging fails
  }
}

/**
 * Log denied access attempt
 */
async function logAccessDenied(
  req: AuthRequest,
  targetUserId: string | null,
  purpose: ConsentPurpose | string,
  reason: string
): Promise<void> {
  try {
    await DataAccessLog.create({
      accessorUserId: req.user?.userId || new mongoose.Types.ObjectId(),
      accessorRole: req.user?.role?.code || 'UNKNOWN',
      accessorIP: req.ip || req.connection.remoteAddress || 'unknown',
      targetUserId: targetUserId ? new mongoose.Types.ObjectId(targetUserId) : new mongoose.Types.ObjectId(),
      dataCategory: purpose,
      fields: [],
      accessedAt: new Date(),
      endpoint: req.path,
      method: req.method,
      purpose,
      action: getActionFromMethod(req.method),
      result: DataAccessResult.NO_CONSENT,
      reason,
      projectId: req.body.projectId || req.query.projectId,
      userAgent: req.get('User-Agent'),
    });
  } catch (error) {
    console.error('Failed to log access denial:', error);
  }
}

/**
 * Log access error
 */
async function logAccessError(
  req: AuthRequest,
  targetUserId: string | null,
  purpose: ConsentPurpose | string,
  error: any
): Promise<void> {
  try {
    await DataAccessLog.create({
      accessorUserId: req.user?.userId || new mongoose.Types.ObjectId(),
      accessorRole: req.user?.role?.code || 'UNKNOWN',
      accessorIP: req.ip || req.connection.remoteAddress || 'unknown',
      targetUserId: targetUserId ? new mongoose.Types.ObjectId(targetUserId) : new mongoose.Types.ObjectId(),
      dataCategory: purpose,
      fields: [],
      accessedAt: new Date(),
      endpoint: req.path,
      method: req.method,
      purpose,
      action: getActionFromMethod(req.method),
      result: DataAccessResult.ERROR,
      reason: error.message || 'Unknown error',
      userAgent: req.get('User-Agent'),
    });
  } catch (logError) {
    console.error('Failed to log access error:', logError);
  }
}

/**
 * Extract accessed fields from request
 */
function extractAccessedFields(req: AuthRequest): string[] {
  const fields: string[] = [];
  
  // From query parameters
  if (req.query && req.query.fields) {
    fields.push(...String(req.query.fields).split(','));
  }
  
  // From body (for updates)
  if (req.body && typeof req.body === 'object') {
    fields.push(...Object.keys(req.body));
  }
  
  return fields.filter(Boolean);
}

/**
 * Map HTTP method to data access action
 */
function getActionFromMethod(method: string): DataAccessAction {
  switch (method.toUpperCase()) {
    case 'GET':
      return DataAccessAction.READ;
    case 'POST':
      return DataAccessAction.CREATE;
    case 'PUT':
    case 'PATCH':
      return DataAccessAction.UPDATE;
    case 'DELETE':
      return DataAccessAction.DELETE;
    default:
      return DataAccessAction.READ;
  }
}

/**
 * Validate that accessed data categories are within consent
 */
export const validateDataCategories = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.dpdp?.consentVerified) {
    return next(); // Let requireConsent handle this
  }

  const allowedCategories = req.dpdp.allowedDataCategories || [];
  const requestedFields = extractAccessedFields(req);
  
  // Map fields to data categories
  const requestedCategories = mapFieldsToCategories(requestedFields);
  
  // Check if all requested categories are allowed
  const unauthorizedCategories = requestedCategories.filter(
    cat => !allowedCategories.includes(cat)
  );

  if (unauthorizedCategories.length > 0) {
    await logAccessDenied(
      req,
      req.params.userId || req.user?.userId || null,
      req.dpdp.purpose!,
      `Unauthorized data categories: ${unauthorizedCategories.join(', ')}`
    );
    
    return res.status(403).json({
      success: false,
      error: 'Access to requested data categories not permitted by consent',
      dpdpViolation: 'UNAUTHORIZED_DATA_CATEGORY',
      unauthorizedCategories,
    });
  }

  next();
};

/**
 * Map field names to data categories
 */
function mapFieldsToCategories(fields: string[]): string[] {
  const categories = new Set<string>();
  
  const categoryMap: Record<string, string> = {
    email: 'basic_profile',
    firstName: 'basic_profile',
    lastName: 'basic_profile',
    fullName: 'basic_profile',
    phone: 'contact_info',
    mobile: 'contact_info',
    address: 'contact_info',
    uniqueId: 'identification',
    employeeCode: 'identification',
    hrmsId: 'employment',
    department: 'employment',
    designation: 'employment',
    joiningDate: 'employment',
    parentMobile: 'parent_guardian',
    centers: 'location',
    projects: 'location',
  };

  fields.forEach(field => {
    const category = categoryMap[field];
    if (category) {
      categories.add(category);
    }
  });

  return Array.from(categories);
}

export default {
  requireConsent,
  autoConsentCheck,
  validateDataCategories,
};



