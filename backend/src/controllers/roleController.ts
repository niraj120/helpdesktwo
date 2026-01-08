import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Role } from '../models/Role';
import { logActivity } from '../utils/logger';

// @desc    Get all roles
// @route   GET /api/roles
// @access  Private
export const getRoles = async (req: AuthRequest, res: Response) => {
  try {
    const { projectId, includeSystem = 'true', isActive } = req.query as Record<string, string | undefined>;

    const query: any = {};

    if (typeof isActive !== 'undefined') {
      query.isActive = isActive !== 'false';
    }

    if (projectId) {
      const clauses: Record<string, any>[] = [
        { projects: projectId },
        { projectId },
      ];
      if (includeSystem !== 'false') {
        clauses.push({ type: 'system' });
      }
      query.$or = clauses;
    }

    const roles = await Role.find(Object.keys(query).length ? query : {}).populate('permissions');
    res.json({
      success: true,
      data: roles,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch roles',
    });
  }
};

// @desc    Get role by ID
// @route   GET /api/roles/:id
// @access  Private
export const getRoleById = async (req: AuthRequest, res: Response) => {
  try {
    const role = await Role.findById(req.params.id).populate('permissions');
    if (!role) {
      res.status(404).json({
        success: false,
        error: 'Role not found',
      });
      return;
    }
    res.json({
      success: true,
      data: role,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch role',
    });
  }
};

// @desc    Create new role
// @route   POST /api/roles
// @access  Private
export const createRole = async (req: AuthRequest, res: Response) => {
  try {
    const { name, code, description, permissions, type, projects, projectId, isMaster } = req.body;

    // Auto-generate code from name if not provided
    const roleCode = code?.toUpperCase() || name.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');

    // Check if role with same code already exists
    const existingRole = await Role.findOne({ code: roleCode });
    if (existingRole) {
      res.status(400).json({
        success: false,
        error: 'Role with this code already exists',
      });
      return;
    }

    // Prepare role data
    const roleData: any = {
      name,
      code: roleCode,
      description,
      permissions: permissions || [],
      type: type || 'custom',
      isMaster: isMaster || false,
    };

    // Handle project mapping
    // If projects array provided, use it
    // If single projectId provided (backward compatibility), convert to array
    if (projects && Array.isArray(projects) && projects.length > 0) {
      roleData.projects = projects;
      roleData.projectId = projects[0]; // Set first project as projectId for backward compatibility
    } else if (projectId) {
      roleData.projectId = projectId;
      roleData.projects = [projectId];
    }

    // System roles (like SuperAdmin) should not have project mapping
    if (type === 'system') {
      delete roleData.projects;
      delete roleData.projectId;
    }

    const role = await Role.create(roleData);

    const populatedRole = await Role.findById(role._id).populate('permissions');
    
    // Log activity
    try {
      const currentUser = req.user;
      if (currentUser) {
        const projectNames = roleData.projects && Array.isArray(roleData.projects) && roleData.projects.length > 0
          ? `Projects: ${roleData.projects.length}`
          : 'No specific projects';
        
        await logActivity({
          userId: currentUser.userId,
          userName: `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim(),
          userEmail: currentUser.email,
          action: 'create',
          entity: 'role',
          entityId: role._id.toString(),
          entityName: role.name,
          projectId: roleData.projects && roleData.projects.length > 0 ? roleData.projects[0].toString() : undefined,
          projectName: projectNames,
          description: `Role ${role.name} (${role.code}) created`,
          req,
          metadata: { code: role.code, type: role.type, isAgent: role.isAgent }
        });
      }
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    res.status(201).json({
      success: true,
      data: populatedRole,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create role',
    });
  }
};

// @desc    Update role
// @route   PUT /api/roles/:id
// @access  Private
export const updateRole = async (req: AuthRequest, res: Response) => {
  try {
    const { name, code, description, permissions, projects, projectId, isMaster, isAgent } = req.body;

    console.log('🔄 Updating role with body:', { name, code, isMaster, isAgent, projects });

    const role = await Role.findById(req.params.id);
    if (!role) {
      res.status(404).json({
        success: false,
        error: 'Role not found',
      });
      return;
    }

    // Prevent updating system roles' project mapping
    if (role.type === 'system' && (projects || projectId)) {
      res.status(400).json({
        success: false,
        error: 'Cannot modify project mapping for system roles',
      });
      return;
    }

    // Check if code is being changed and if it conflicts
    if (code && code.toUpperCase() !== role.code) {
      const existingRole = await Role.findOne({ code: code.toUpperCase() });
      if (existingRole) {
        res.status(400).json({
          success: false,
          error: 'Role with this code already exists',
        });
        return;
      }
    }

    role.name = name || role.name;
    role.code = code?.toUpperCase() || role.code;
    role.description = description || role.description;
    
    // Check if permissions are actually changing
    let permissionsChanged = false;
    if (permissions !== undefined) {
      const oldPermissions = role.permissions.map(p => p.toString()).sort();
      const newPermissions = permissions.map((p: any) => p.toString()).sort();
      permissionsChanged = JSON.stringify(oldPermissions) !== JSON.stringify(newPermissions);
      role.permissions = permissions;
    }

    if (isMaster !== undefined) {
      role.isMaster = isMaster;
      console.log('✅ Set isMaster to:', isMaster);
    }

    if (isAgent !== undefined) {
      role.isAgent = isAgent;
      console.log('✅ Set isAgent to:', isAgent);
    }

    // Update project mapping
    if (projects && Array.isArray(projects)) {
      role.projects = projects;
      role.projectId = projects.length > 0 ? projects[0] : undefined;
    } else if (projectId) {
      role.projectId = projectId;
      role.projects = [projectId];
    }

    await role.save();
    
    // Invalidate tokens for all users with this role if permissions changed
    if (permissionsChanged) {
      console.log(`🔄 Permissions changed for role ${role.name}. Invalidating tokens for affected users.`);
      const { User } = await import('../models/User');
      const affectedUsers = await User.find({ role: role._id });
      
      for (const user of affectedUsers) {
        await user.incrementTokenVersion();
        console.log(`   - Incremented token version for user: ${user.email}`);
      }
      
      console.log(`✅ Invalidated tokens for ${affectedUsers.length} user(s) with role ${role.name}`);
    }

    const populatedRole = await Role.findById(role._id).populate('permissions');
    
    // Log activity
    try {
      const currentUser = req.user;
      if (currentUser) {
        const changes = [];
        if (name) changes.push({ field: 'name', oldValue: role.name, newValue: name });
        if (permissions) changes.push({ field: 'permissions', oldValue: 'previous', newValue: 'updated' });
        
        const projectNames = role.projects && Array.isArray(role.projects) && role.projects.length > 0
          ? `Projects: ${role.projects.length}`
          : 'No specific projects';
        
        await logActivity({
          userId: currentUser.userId,
          userName: `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim(),
          userEmail: currentUser.email,
          action: 'update',
          entity: 'role',
          entityId: role._id.toString(),
          entityName: role.name,
          projectId: role.projects && role.projects.length > 0 ? role.projects[0].toString() : undefined,
          projectName: projectNames,
          changes: changes.length > 0 ? changes : undefined,
          description: `Role ${role.name} updated${permissionsChanged ? ' (permissions changed)' : ''}`,
          req
        });
      }
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    res.json({
      success: true,
      data: populatedRole,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update role',
    });
  }
};

// @desc    Delete role
// @route   DELETE /api/roles/:id
// @access  Private
export const deleteRole = async (req: AuthRequest, res: Response) => {
  try {
    const role = await Role.findById(req.params.id);
    if (!role) {
      res.status(404).json({
        success: false,
        error: 'Role not found',
      });
      return;
    }

    // Prevent deletion of system roles
    if (role.isSystem) {
      res.status(400).json({
        success: false,
        error: 'Cannot delete system roles',
      });
      return;
    }

    // Store role data before deletion
    const deletedRoleData = {
      id: role._id.toString(),
      name: role.name,
      code: role.code,
      projects: role.projects
    };
    
    await role.deleteOne();
    
    // Log activity
    try {
      const currentUser = req.user;
      if (currentUser) {
        await logActivity({
          userId: currentUser.userId,
          userName: `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim(),
          userEmail: currentUser.email,
          action: 'delete',
          entity: 'role',
          entityId: deletedRoleData.id,
          entityName: deletedRoleData.name,
          description: `Role ${deletedRoleData.name} (${deletedRoleData.code}) deleted`,
          req
        });
      }
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    res.json({
      success: true,
      message: 'Role deleted successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete role',
    });
  }
};

// @desc    Clone role from master role
// @route   POST /api/roles/:id/clone
// @access  Private
export const cloneRole = async (req: AuthRequest, res: Response) => {
  try {
    const { name, code, description, projects, projectId } = req.body;
    const masterRoleId = req.params.id;

    const masterRole = await Role.findById(masterRoleId);
    if (!masterRole) {
      res.status(404).json({
        success: false,
        error: 'Master role not found',
      });
      return;
    }

    // Auto-generate code from name if not provided
    const roleName = name || `${masterRole.name} (Copy)`;
    const roleCode = code?.toUpperCase() || roleName.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');

    // Check if role with same code already exists
    const existingRole = await Role.findOne({ code: roleCode });
    if (existingRole) {
      res.status(400).json({
        success: false,
        error: 'Role with this code already exists',
      });
      return;
    }

    // Clone the role with new name, code, and project mapping
    const roleData: any = {
      name: roleName,
      code: roleCode,
      description: description || masterRole.description,
      permissions: masterRole.permissions, // Copy all permissions
      type: 'custom', // Cloned roles are always custom
      isMaster: false, // Cloned roles are not master by default
      masterRoleId: masterRole._id, // Reference to master role
    };

    // Handle project mapping for cloned role
    if (projects && Array.isArray(projects) && projects.length > 0) {
      roleData.projects = projects;
      roleData.projectId = projects[0];
    } else if (projectId) {
      roleData.projectId = projectId;
      roleData.projects = [projectId];
    }

    const clonedRole = await Role.create(roleData);
    const populatedRole = await Role.findById(clonedRole._id).populate('permissions');

    res.status(201).json({
      success: true,
      data: populatedRole,
      message: 'Role cloned successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to clone role',
    });
  }
};

// @desc    Get master roles
// @route   GET /api/roles/master
// @access  Private
export const getMasterRoles = async (req: AuthRequest, res: Response) => {
  try {
    const masterRoles = await Role.find({ isMaster: true, isActive: true }).populate('permissions');
    res.json({
      success: true,
      data: masterRoles,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch master roles',
    });
  }
};
