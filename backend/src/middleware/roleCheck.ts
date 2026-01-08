import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';

/**
 * @deprecated This middleware is no longer used. RBAC system now uses permission-based
 * checks instead of role-based checks. Use requirePermission middleware instead.
 * 
 * This file is kept for backward compatibility but should not be used in new code.
 * All access control should be based on permissions, not role names.
 * 
 * Example: Instead of requireSuperAdmin, use:
 *   requirePermission('PERMISSION_CODE')
 */
export const requireSuperAdmin = (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    // Check if user role is SuperAdmin
    const isSuperAdmin = req.user.role?.code === 'SUPER_ADMIN' || 
                         req.user.role?.name === 'Super Admin' ||
                         req.user.role === 'Super Admin';

    if (!isSuperAdmin) {
      res.status(403).json({
        success: false,
        error: 'Access denied. SuperAdmin role required.'
      });
      return;
    }

    next();
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Authorization check failed'
    });
  }
};
