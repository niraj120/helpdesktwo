import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Permission } from '../models/Permission';
import { User } from '../models/User';
import { refreshUserPermissions } from '../utils/jwtUtils';

// @desc    Get all permissions
// @route   GET /api/permissions
// @access  Private
export const getPermissions = async (req: AuthRequest, res: Response) => {
  try {
    const { category, isActive } = req.query as Record<string, string | undefined>;

    const query: any = {};

    if (category) {
      query.category = category;
    }

    if (typeof isActive !== 'undefined') {
      query.isActive = isActive !== 'false';
    }

    const permissions = await Permission.find(query).sort({ category: 1, module: 1, name: 1 });
    
    res.json({
      success: true,
      data: permissions,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch permissions',
    });
  }
};

// @desc    Get permissions grouped by category and module
// @route   GET /api/permissions/grouped
// @access  Private
export const getPermissionsGrouped = async (req: AuthRequest, res: Response) => {
  try {
    const permissions = await Permission.find({ isActive: true }).sort({ category: 1, module: 1, name: 1 });
    
    // Group by category first, then by module
    const grouped: Record<string, Record<string, any[]>> = {};
    
    permissions.forEach(permission => {
      const category = permission.category;
      const module = permission.module;
      
      if (!grouped[category]) {
        grouped[category] = {};
      }
      
      if (!grouped[category][module]) {
        grouped[category][module] = [];
      }
      
      grouped[category][module].push({
        _id: permission._id,
        name: permission.name,
        code: permission.code,
        description: permission.description,
      });
    });
    
    res.json({
      success: true,
      data: grouped,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch grouped permissions',
    });
  }
};

// @desc    Get permission by ID
// @route   GET /api/permissions/:id
// @access  Private
export const getPermissionById = async (req: AuthRequest, res: Response) => {
  try {
    const permission = await Permission.findById(req.params.id);
    if (!permission) {
      res.status(404).json({
        success: false,
        error: 'Permission not found',
      });
      return;
    }
    res.json({
      success: true,
      data: permission,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch permission',
    });
  }
};

/**
 * Refresh user permissions in JWT token
 * Useful when user role/permissions change without requiring full re-login
 */
export const refreshPermissions = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    console.log(`🔄 Refreshing permissions for user ID: ${userId}`);

    // Generate new token with updated permissions
    const newToken = await refreshUserPermissions(userId);

    // Set new HTTP-only cookie
    res.cookie('authToken', newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Get updated user data
    const user = await User.findById(userId).populate({
      path: 'role',
      populate: {
        path: 'permissions'
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Extract permission codes for response
    const roleData = user.role && typeof user.role === 'object' 
      ? user.role as any 
      : { name: 'User', code: 'USER', permissions: [] };

    const permissions = roleData.permissions || [];
    const permissionCodes = permissions.map((p: any) => p.code || p);

    console.log(`✅ Permissions refreshed: ${permissionCodes.length} permissions`);

    return res.json({
      success: true,
      message: 'Permissions refreshed successfully',
      data: {
        token: newToken,
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          name: `${user.firstName} ${user.lastName}`,
          role: {
            name: roleData.name,
            code: roleData.code,
            _id: roleData._id,
            permissions: permissionCodes
          }
        }
      }
    });

  } catch (error) {
    console.error('Refresh permissions error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to refresh permissions',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
