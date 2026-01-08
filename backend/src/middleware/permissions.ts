import { Response, NextFunction, RequestHandler } from 'express';
import { AuthRequest } from './auth';
import { Permission } from '../models/Permission';

/**
 * Middleware factory to require a specific permission code.
 * It checks if the current user's role (from JWT payload) contains that permission.
 * Now supports both permission codes (strings) and permission IDs (ObjectIds) for backward compatibility.
 */
export const requirePermission = (code: string) => async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const rolePerms = req.user?.role?.permissions || [];
    
    // Check if permissions are stored as codes (new optimized format)
    const hasPermissionByCode = rolePerms.some((p: any) => {
      const permCode = typeof p === 'string' ? p : p.code;
      const permName = typeof p === 'string' ? p : p.name;
      // Match either by code or by name for flexibility
      return permCode === code || permName === code;
    });

    if (hasPermissionByCode) {
      next();
      return;
    }

    // Fallback: Check by permission ID (old format for backward compatibility)
    const perm = await Permission.findOne({ $or: [{ code }, { name: code }] });
    if (!perm) {
      console.log(`❌ [PERMISSION] Permission ${code} not found in database`);
      res.status(403).json({ success: false, message: `Permission ${code} not found` });
      return;
    }

    const permId = perm._id.toString();
    const hasPermissionById = rolePerms.some((p: any) => {
      try {
        return p.toString() === permId;
      } catch (e) {
        return false;
      }
    });

    if (!hasPermissionById) {
      console.log(`❌ [PERMISSION] User ${req.user?.email} lacks permission: ${code}`);
      res.status(403).json({ success: false, message: 'Forbidden: insufficient permissions' });
      return;
    }

    next();
    return;
  } catch (err) {
    console.error('Permission check error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
    return;
  }
};

/**
 * Middleware factory to check permission by code or resource and action.
 * Can be called as:
 * - checkPermission('PERMISSION_CODE') - direct permission code
 * - checkPermission(['CODE1', 'CODE2']) - array of codes (OR logic - user needs ANY one)
 * - checkPermission('resource', 'action') - constructs "resource.action"
 */
export const checkPermission = (resourceOrCode: string | string[], action?: string): RequestHandler => {
  // Handle array of permission codes (OR logic)
  if (Array.isArray(resourceOrCode)) {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const rolePerms = req.user?.role?.permissions || [];
        
        // Check if user has ANY of the required permissions
        const hasAnyPermission = resourceOrCode.some(code => {
          return rolePerms.some((p: any) => {
            const permCode = typeof p === 'string' ? p : p.code;
            const permName = typeof p === 'string' ? p : p.name;
            // Match either by code or by name for flexibility
            return permCode === code || permName === code;
          });
        });

        if (hasAnyPermission) {
          next();
          return;
        }

        console.log(`❌ [PERMISSION] User ${req.user?.email} lacks any of: ${resourceOrCode.join(', ')}`);
        res.status(403).json({ success: false, message: 'Forbidden: insufficient permissions' });
        return;
      } catch (err) {
        console.error('Permission check error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
        return;
      }
    };
  }
  
  // Handle single permission code
  const code = action ? `${resourceOrCode}.${action}` : resourceOrCode;
  return requirePermission(code);
};
