import { Response, NextFunction, RequestHandler } from 'express';
import { AuthRequest } from './auth';
import { Role } from '../models/Role';
import mongoose from 'mongoose';

/**
 * Middleware to attach project context to request
 * Extracts projectId from various sources and validates user access
 * Adds projectIds array for unified view mode
 * 
 * Usage:
 * - attachProjectContext() - automatically detects single/unified mode
 */
export const attachProjectContext = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }

    // Check for viewMode in query/body
    const viewMode = req.query.viewMode || req.body.viewMode || 'single';
    
    // Extract projectId from request
    const projectId = req.params.projectId || req.query.projectId || req.body.projectId;

    // Get user's accessible projects from role only
    const fullRole = await Role.findById(user.role?._id);
    const roleProjects = fullRole?.projects || [];
    
    // Use only role projects (users inherit project access from their role)
    const uniqueProjectIds = roleProjects.map((p: any) => p._id?.toString() || p.toString());

    // Check if user is admin (has access to all)
    const userRoleCode = user.role?.code || '';
    const isAdmin = userRoleCode === 'SUPER_ADMIN' || userRoleCode === 'ADMIN';

    // Attach project context to request
    req.projectContext = {
      viewMode: viewMode as 'single' | 'unified',
      currentProjectId: projectId || null,
      accessibleProjectIds: isAdmin ? [] : uniqueProjectIds, // Empty array means all projects
      isAdmin,
    };

    console.log(`📋 [PROJECT_CONTEXT] User: ${user.email}, Mode: ${viewMode}, Projects: ${uniqueProjectIds.length}`);
    next();
  } catch (error) {
    console.error('❌ [PROJECT_CONTEXT] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing project context'
    });
    return;
  }
};

/**
 * Middleware to validate that user has access to the project in the request
 * Checks:
 * 1. User's assigned projects array
 * 2. User's role's projects array (for roles scoped to specific projects)
 * 
 * Usage:
 * - requireProjectAccess() - checks project from req.params.projectId or req.query.projectId or req.body.projectId
 * - requireProjectAccess('customField') - checks specific field
 */
export const requireProjectAccess = (projectIdField?: string): RequestHandler => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      // Extract projectId from request
      let projectId: string | undefined;
      
      if (projectIdField) {
        // Custom field specified
        projectId = req.params[projectIdField] || req.query[projectIdField] || req.body[projectIdField];
      } else {
        // Check common locations
        projectId = req.params.projectId || req.query.projectId || req.body.projectId;
      }

      if (!projectId) {
        console.log('⚠️ [PROJECT_SCOPE] No projectId found in request');
        return res.status(400).json({
          success: false,
          message: 'Project ID is required'
        });
      }

      // Check if user is super admin (has access to all projects)
      const userRoleCode = user.role?.code || '';
      if (userRoleCode === 'SUPER_ADMIN' || userRoleCode === 'ADMIN') {
        console.log(`✅ [PROJECT_SCOPE] ${user.email} is admin - full access granted`);
        next();
        return;
      }

      // Fetch full role details with projects
      const fullRole = await Role.findById(user.role?._id);
      if (!fullRole) {
        return res.status(403).json({
          success: false,
          message: 'User role not found'
        });
      }

      // Check if user's role has access to this project
      const roleProjects = fullRole.projects || [];
      const roleHasProject = roleProjects.some(
        (p: any) => p.toString() === projectId
      );

      if (roleHasProject) {
        console.log(`✅ [PROJECT_SCOPE] ${user.email} has access to project ${projectId} via role ${fullRole.name}`);
        next();
        return;
      }

      console.log(`❌ [PROJECT_SCOPE] ${user.email} denied access to project ${projectId}`);
      console.log(`   Role: ${fullRole.name}`);
      console.log(`   Role projects: ${roleProjects.map((p: any) => p.toString()).join(', ')}`);
      
      return res.status(403).json({
        success: false,
        message: 'Your role does not have access to this project'
      });
    } catch (err) {
      console.error('Project scope check error:', err);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  };
};

/**
 * Helper function to check if user can access a specific project
 * Use this in controllers for manual checks
 */
export const canAccessProject = async (
  userId: string,
  projectId: string
): Promise<boolean> => {
  try {
    const User = mongoose.model('User');
    const user = await User.findById(userId).populate('role');
    
    if (!user) return false;

    const userRole: any = user.get('role');
    
    // Super admin has access to all
    if (userRole?.code === 'SUPER_ADMIN' || userRole?.code === 'ADMIN') {
      return true;
    }

    // Check role's project scope only
    const role = await Role.findById(userRole?._id);
    if (!role) return false;

    const roleProjects = role.projects || [];
    return roleProjects.some((p: any) => p.toString() === projectId);
  } catch (error) {
    console.error('Error checking project access:', error);
    return false;
  }
};

/**
 * Get list of all projects accessible to user
 */
export const getUserAccessibleProjects = async (
  userId: string
): Promise<string[]> => {
  try {
    const User = mongoose.model('User');
    const user = await User.findById(userId).populate('role');
    
    if (!user) return [];

    const userRole: any = user.get('role');
    
    // Super admin has access to all - return empty array to indicate "all"
    if (userRole?.code === 'SUPER_ADMIN' || userRole?.code === 'ADMIN') {
      return []; // Empty array = all projects
    }

    // Get projects from role only
    const role = await Role.findById(userRole?._id);
    if (!role || !role.projects) {
      return [];
    }

    return role.projects.map((p: any) => p.toString());
  } catch (error) {
    console.error('Error getting accessible projects:', error);
    return [];
  }
};
