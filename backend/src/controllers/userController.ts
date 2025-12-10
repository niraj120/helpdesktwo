import { Request, Response } from 'express';
import { User } from '../models/User';
import { Role } from '../models/Role';
import { hrmsService } from '../services/hrmsService';
import mongoose from 'mongoose';
import { logActivity } from '../utils/logger';

/**
 * Get all users with filters and pagination
 */
export const getAllUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      role = '',
      isActive = '',
      project = '',
      department = '',
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Build filter query
    const filter: any = {};

    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { employeeCode: { $regex: search, $options: 'i' } },
        { mobile: { $regex: search, $options: 'i' } },
      ];
    }

    if (role) {
      filter.role = role;
    }

    if (isActive !== '') {
      filter.isActive = isActive === 'true';
    }

    if (project) {
      filter.projects = project;
    }

    if (department) {
      filter.department = { $regex: department, $options: 'i' };
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-password -resetPasswordOTP -resetPasswordOTPExpires')
        .populate('role', 'name code isAgent')
        .populate('projects', 'name code')
        .populate('reportingManager', 'firstName lastName email employeeCode')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      User.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: users,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users',
      message: error.message,
    });
  }
};

/**
 * Get single user by ID
 */
export const getUserById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const user = await User.findById(id)
      .select('-password -resetPasswordOTP -resetPasswordOTPExpires')
      .populate('role', 'name code permissions')
      .populate('projects', 'name code')
      .populate('reportingManager', 'firstName lastName email employeeCode')
      .lean();

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'User not found',
      });
      return;
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error: any) {
    console.error('Error fetching user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user',
      message: error.message,
    });
  }
};

/**
 * Create new user (manual creation or HRMS import)
 */
export const createUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      email,
      password,
      firstName,
      lastName,
      mobile,
      role,
      employeeCode,
      department,
      designation,
      joiningDate,
      reportingManager,
      projects,
      syncFromHRMS = false,
    } = req.body;

    // Validate required fields
    // When syncing from HRMS with employeeCode, email can be fetched from HRMS
    if (!role) {
      res.status(400).json({
        success: false,
        error: 'Role is required',
      });
      return;
    }

    if (!syncFromHRMS && !email) {
      res.status(400).json({
        success: false,
        error: 'Email is required',
      });
      return;
    }

    if (syncFromHRMS && !employeeCode) {
      res.status(400).json({
        success: false,
        error: 'Employee code is required when syncing from HRMS',
      });
      return;
    }

    // Check if email already exists (skip if syncing from HRMS and email not provided yet)
    if (email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        res.status(400).json({
          success: false,
          error: 'User with this email already exists',
        });
        return;
      }
    }

    // Check if employee code already exists (only if non-empty)
    if (employeeCode && employeeCode.trim()) {
      const existingEmployee = await User.findOne({ employeeCode });
      if (existingEmployee) {
        res.status(400).json({
          success: false,
          error: 'User with this employee code already exists',
        });
        return;
      }
    }

    // Validate role exists
    const roleDoc = await Role.findById(role);
    if (!roleDoc) {
      res.status(400).json({
        success: false,
        error: 'Invalid role ID',
      });
      return;
    }

    let userData: any = {
      email,
      password: password || Math.random().toString(36).slice(-10), // Generate random password if not provided
      firstName,
      lastName,
      mobile: mobile || undefined,
      role,
      department,
      designation,
      reportingManager,
      projects: projects || [],
    };

    // Sync from HRMS if requested
    if (syncFromHRMS && employeeCode) {
      try {
        const hrmsData = await hrmsService.syncEmployeeData(employeeCode);
        if (hrmsData) {
          userData = {
            ...userData,
            ...hrmsData,
            // Override with provided data if any
            firstName: firstName || hrmsData.firstName,
            lastName: lastName || hrmsData.lastName,
            email: email || hrmsData.email,
            mobile: mobile || hrmsData.mobile,
          };
        }

        // Check if email from HRMS already exists
        if (userData.email) {
          const existingUserByEmail = await User.findOne({ email: userData.email });
          if (existingUserByEmail) {
            res.status(400).json({
              success: false,
              error: `User with email ${userData.email} already exists`,
            });
            return;
          }
        }
      } catch (hrmsError: any) {
        res.status(400).json({
          success: false,
          error: 'Failed to sync from HRMS',
          message: hrmsError.message,
        });
        return;
      }
    } else if (employeeCode && employeeCode.trim()) {
      // Only set employeeCode if it's not empty
      userData.employeeCode = employeeCode;
    }

    if (joiningDate) {
      userData.joiningDate = new Date(joiningDate);
    }

    const user = new User(userData);
    await user.save();

    // Populate role and projects before returning
    await user.populate('role', 'name code');
    await user.populate('projects', 'name code');

    const userResponse: any = user.toObject();
    delete userResponse.password;
    delete userResponse.resetPasswordOTP;
    delete userResponse.resetPasswordOTPExpires;
    
    // Log activity
    try {
      const currentUser = (req as any).user;
      if (currentUser) {
        const projectNames = user.projects && Array.isArray(user.projects) && user.projects.length > 0
          ? (user.projects as any[]).map(p => p.name || p).join(', ')
          : 'No projects';
        const projectIds = user.projects && Array.isArray(user.projects) && user.projects.length > 0
          ? (user.projects as any[])[0]._id || (user.projects as any[])[0]
          : undefined;
        
        await logActivity({
          userId: currentUser.userId,
          userName: `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim(),
          userEmail: currentUser.email,
          action: 'create',
          entity: 'user',
          entityId: user._id.toString(),
          entityName: `${user.firstName} ${user.lastName}`,
          projectId: projectIds?.toString(),
          projectName: projectNames,
          description: `User ${user.email} created with role ${(user.role as any)?.name || 'N/A'}`,
          req,
          metadata: { employeeCode: user.employeeCode, syncFromHRMS }
        });
      }
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    res.status(201).json({
      success: true,
      data: userResponse,
      message: 'User created successfully',
    });
  } catch (error: any) {
    console.error('Error creating user:', error);
    
    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err: any) => err.message);
      res.status(400).json({
        success: false,
        error: messages.join(', '),
      });
      return;
    }
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      res.status(400).json({
        success: false,
        error: `User with this ${field} already exists`,
      });
      return;
    }
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create user',
    });
  }
};

/**
 * Update user
 */
export const updateUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      firstName,
      lastName,
      mobile,
      role,
      employeeCode,
      department,
      designation,
      joiningDate,
      reportingManager,
      projects,
      syncFromHRMS = false,
    } = req.body;

    const user = await User.findById(id);
    if (!user) {
      res.status(404).json({
        success: false,
        error: 'User not found',
      });
      return;
    }

    // Check if email is being changed and if it's unique
    if (req.body.email && req.body.email !== user.email) {
      const existingUser = await User.findOne({ email: req.body.email });
      if (existingUser) {
        res.status(400).json({
          success: false,
          error: 'User with this email already exists',
        });
        return;
      }
      user.email = req.body.email;
    }

    // Check if employee code is being changed and if it's unique (only if non-empty)
    if (employeeCode && employeeCode.trim() && employeeCode !== user.employeeCode) {
      const existingEmployee = await User.findOne({ employeeCode });
      if (existingEmployee) {
        res.status(400).json({
          success: false,
          error: 'User with this employee code already exists',
        });
        return;
      }
    }

    // Validate role if being updated
    if (role) {
      const roleDoc = await Role.findById(role);
      if (!roleDoc) {
        res.status(400).json({
          success: false,
          error: 'Invalid role ID',
        });
        return;
      }
      
      // Check if role is actually changing
      const roleChanged = user.role.toString() !== role.toString();
      user.role = role;
      
      // Increment token version to invalidate existing tokens when role changes
      if (roleChanged) {
        console.log(`🔄 Role changed for user ${user.email}. Incrementing token version.`);
        await user.incrementTokenVersion();
      }
    }

    // Sync from HRMS if requested
    if (syncFromHRMS && (employeeCode || user.employeeCode)) {
      try {
        const hrmsData = await hrmsService.syncEmployeeData(employeeCode || user.employeeCode!);
        Object.assign(user, hrmsData);
      } catch (hrmsError: any) {
        res.status(400).json({
          success: false,
          error: 'Failed to sync from HRMS',
          message: hrmsError.message,
        });
        return;
      }
    }

    // Update fields
    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (mobile !== undefined) user.mobile = mobile || undefined;
    // Convert empty string to undefined for sparse unique fields
    if (employeeCode !== undefined) user.employeeCode = employeeCode || undefined;
    if (department !== undefined) user.department = department;
    if (designation !== undefined) user.designation = designation;
    if (joiningDate !== undefined) user.joiningDate = new Date(joiningDate);
    if (reportingManager !== undefined) user.reportingManager = reportingManager;
    if (projects !== undefined) user.projects = projects;

    await user.save();

    await user.populate('role', 'name code');
    await user.populate('projects', 'name code');
    await user.populate('reportingManager', 'firstName lastName email employeeCode');

    const userResponse: any = user.toObject();
    delete userResponse.password;
    delete userResponse.resetPasswordOTP;
    delete userResponse.resetPasswordOTPExpires;
    
    // Log activity
    try {
      const currentUser = (req as any).user;
      if (currentUser) {
        const projectNames = user.projects && Array.isArray(user.projects) && user.projects.length > 0
          ? (user.projects as any[]).map(p => p.name || p).join(', ')
          : 'No projects';
        const projectIds = user.projects && Array.isArray(user.projects) && user.projects.length > 0
          ? (user.projects as any[])[0]._id || (user.projects as any[])[0]
          : undefined;
        
        // Track changes
        const changes = [];
        if (firstName !== undefined) changes.push({ field: 'firstName', oldValue: user.firstName, newValue: firstName });
        if (lastName !== undefined) changes.push({ field: 'lastName', oldValue: user.lastName, newValue: lastName });
        if (role !== undefined) changes.push({ field: 'role', oldValue: user.role, newValue: role });
        
        await logActivity({
          userId: currentUser.userId,
          userName: `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim(),
          userEmail: currentUser.email,
          action: 'update',
          entity: 'user',
          entityId: user._id.toString(),
          entityName: `${user.firstName} ${user.lastName}`,
          projectId: projectIds?.toString(),
          projectName: projectNames,
          changes: changes.length > 0 ? changes : undefined,
          description: `User ${user.email} updated`,
          req
        });
      }
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    res.json({
      success: true,
      data: userResponse,
      message: 'User updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update user',
      message: error.message,
    });
  }
};

/**
 * Delete user
 */
export const deleteUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      res.status(404).json({
        success: false,
        error: 'User not found',
      });
      return;
    }

    // Don't allow deleting super admin - check if user has a role first
    if (user.role) {
      await user.populate('role', 'code type');
      if ((user.role as any)?.code === 'SUPER_ADMIN') {
        res.status(403).json({
          success: false,
          error: 'Cannot delete Super Admin user',
        });
        return;
      }
    }

    // Store user data before deletion for logging
    const deletedUserData = {
      id: user._id.toString(),
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      projects: user.projects
    };
    
    await User.findByIdAndDelete(id);
    
    // Log activity
    try {
      const currentUser = (req as any).user;
      if (currentUser) {
        await logActivity({
          userId: currentUser.userId,
          userName: `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim(),
          userEmail: currentUser.email,
          action: 'delete',
          entity: 'user',
          entityId: deletedUserData.id,
          entityName: deletedUserData.name,
          description: `User ${deletedUserData.email} deleted`,
          req
        });
      }
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    res.json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete user',
      message: error.message,
    });
  }
};

/**
 * Toggle user active status
 */
export const toggleUserStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const user = await User.findById(id).populate('role', 'code type');
    if (!user) {
      res.status(404).json({
        success: false,
        error: 'User not found',
      });
      return;
    }

    // Don't allow deactivating super admin
    if ((user.role as any).code === 'SUPER_ADMIN') {
      res.status(403).json({
        success: false,
        error: 'Cannot deactivate Super Admin user',
      });
      return;
    }

    user.isActive = !user.isActive;
    await user.save();

    await user.populate('role', 'name code');
    await user.populate('projects', 'name code');

    const userResponse: any = user.toObject();
    delete userResponse.password;
    delete userResponse.resetPasswordOTP;
    delete userResponse.resetPasswordOTPExpires;

    res.json({
      success: true,
      data: userResponse,
      message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
    });
  } catch (error: any) {
    console.error('Error toggling user status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle user status',
      message: error.message,
    });
  }
};

/**
 * Search HRMS employees
 */
export const searchHRMSEmployees = async (req: Request, res: Response): Promise<void> => {
  try {
    const { query } = req.query;

    if (!query || typeof query !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Search query is required',
      });
      return;
    }

    const employees = await hrmsService.searchEmployees(query);

    res.json({
      success: true,
      data: employees,
    });
  } catch (error: any) {
    console.error('Error searching HRMS employees:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search HRMS employees',
      message: error.message,
    });
  }
};

/**
 * Validate employee code from HRMS
 */
export const validateEmployeeCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const { employeeCode } = req.params;

    if (!employeeCode) {
      res.status(400).json({
        success: false,
        error: 'Employee code is required',
      });
      return;
    }

    const isValid = await hrmsService.validateEmployeeCode(employeeCode);

    if (!isValid) {
      res.status(404).json({
        success: false,
        error: 'Employee code not found in HRMS',
      });
      return;
    }

    const employee = await hrmsService.getEmployeeByCode(employeeCode);

    res.json({
      success: true,
      data: employee,
      message: 'Employee code is valid',
    });
  } catch (error: any) {
    console.error('Error validating employee code:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate employee code',
      message: error.message,
    });
  }
};

/**
 * Bulk import users from HRMS
 */
export const bulkImportFromHRMS = async (req: Request, res: Response): Promise<void> => {
  try {
    const { employeeCodes, roleId, projectIds } = req.body;

    if (!Array.isArray(employeeCodes) || employeeCodes.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Employee codes array is required',
      });
      return;
    }

    if (!roleId) {
      res.status(400).json({
        success: false,
        error: 'Role ID is required',
      });
      return;
    }

    // Validate role
    const role = await Role.findById(roleId);
    if (!role) {
      res.status(400).json({
        success: false,
        error: 'Invalid role ID',
      });
      return;
    }

    const results = {
      success: [] as any[],
      failed: [] as any[],
    };

    for (const employeeCode of employeeCodes) {
      try {
        // Check if user already exists
        const existingUser = await User.findOne({ employeeCode });
        if (existingUser) {
          results.failed.push({
            employeeCode,
            reason: 'User already exists',
          });
          continue;
        }

        // Fetch from HRMS
        const hrmsData = await hrmsService.syncEmployeeData(employeeCode);

        // Create user - skip if no HRMS data
        if (!hrmsData) {
          results.failed.push({
            employeeCode,
            reason: 'No HRMS data found',
          });
          continue;
        }

        const user = new User({
          ...hrmsData,
          role: roleId,
          projects: projectIds || [],
          password: Math.random().toString(36).slice(-10), // Random password
        });

        await user.save();
        results.success.push({
          employeeCode,
          userId: user._id,
          name: `${user.firstName} ${user.lastName}`,
        });
      } catch (error: any) {
        results.failed.push({
          employeeCode,
          reason: error.message,
        });
      }
    }

    res.json({
      success: true,
      data: results,
      message: `Imported ${results.success.length} users, ${results.failed.length} failed`,
    });
  } catch (error: any) {
    console.error('Error bulk importing users:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to bulk import users',
      message: error.message,
    });
  }
};

/**
 * Reset user password (admin function)
 */
export const resetUserPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters long',
      });
      return;
    }

    const user = await User.findById(id);
    if (!user) {
      res.status(404).json({
        success: false,
        error: 'User not found',
      });
      return;
    }

    user.password = newPassword;
    user.resetPasswordOTP = undefined;
    user.resetPasswordOTPExpires = undefined;
    user.resetPasswordAttempts = 0;
    user.resetPasswordLockedUntil = undefined;

    await user.save();

    res.json({
      success: true,
      message: 'Password reset successfully',
    });
  } catch (error: any) {
    console.error('Error resetting password:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset password',
      message: error.message,
    });
  }
};

/**
 * Get user permissions by role and project
 */
export const getUserPermissions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { projectId } = req.query;

    const user = await User.findById(id).populate('role');
    if (!user) {
      res.status(404).json({
        success: false,
        error: 'User not found',
      });
      return;
    }

    // Get role permissions
    const role = user.role as any;
    if (!role || !role.permissions) {
      res.json({
        success: true,
        data: [],
      });
      return;
    }

    // If projectId is provided, filter permissions for that project
    let permissions = role.permissions;
    
    if (projectId) {
      // Filter permissions by project (if role-project mapping exists)
      // For now, return all role permissions
      permissions = role.permissions;
    }

    res.json({
      success: true,
      data: permissions,
    });

  } catch (error: any) {
    console.error('Get user permissions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user permissions',
      message: error.message,
    });
  }
};

/**
 * Search user by email (for offline module)
 */
export const searchUserByEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, projectId } = req.query;

    if (!email) {
      res.status(400).json({
        success: false,
        error: 'Email is required',
      });
      return;
    }

    const filter: any = { email: email as string };
    
    if (projectId) {
      filter.projects = projectId;
    }

    const user = await User.findOne(filter).select('firstName lastName email phone role');
    
    res.json({
      success: true,
      data: user,
    });

  } catch (error: any) {
    console.error('Search user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search user',
      message: error.message,
    });
  }
};

/**
 * Register student for offline support
 * Creates a full user account with STUDENT role that can login to student portal
 */
export const registerStudent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId, ...studentData } = req.body;
    
    console.log('📝 Student registration - phone and parent mobile are OPTIONAL');
    console.log('📝 Request data:', { projectId, fields: Object.keys(studentData) });
    
    // Field mapping to normalize various field name formats to expected backend fields
    const fieldMapping: Record<string, string> = {
      'First Name': 'firstName',
      'firstname': 'firstName',
      'first_name': 'firstName',
      'Last Name': 'lastName',
      'lastname': 'lastName',
      'last_name': 'lastName',
      'Email': 'email',
      'Email ID': 'email',
      'email_id': 'email',
      'Phone': 'phone',
      'Mobile': 'phone',
      'Mobile number': 'phone',
      'mobile_number': 'phone',
      'phone_number': 'phone',
      'Parent Mobile': 'parentMobile',
      'Parent Contact': 'parentMobile',
      'parent_mobile': 'parentMobile',
      'parent_contact': 'parentMobile',
      'parentmobile': 'parentMobile',
      'Unique ID': 'uniqueId',
      'unique_id': 'uniqueId',
      'uniqueid': 'uniqueId',
      'Student ID': 'uniqueId',
      'Full Name': 'fullName',
      'fullname': 'fullName',
      'full_name': 'fullName',
    };

    // Normalize field names
    const normalizedData: Record<string, any> = {};
    Object.keys(studentData).forEach(key => {
      const normalizedKey = fieldMapping[key] || key;
      normalizedData[normalizedKey] = studentData[key];
    });

    const { firstName, lastName, fullName, email, phone, parentMobile, uniqueId } = normalizedData;

    // Validate required fields
    if (!email || !projectId) {
      res.status(400).json({
        success: false,
        error: 'Email and project ID are required',
      });
      return;
    }

    // Phone and parent mobile are now optional
    // if (!phone) {
    //   res.status(400).json({
    //     success: false,
    //     error: 'Phone number is required',
    //   });
    //   return;
    // }

    // if (!parentMobile) {
    //   res.status(400).json({
    //     success: false,
    //     error: 'Parent mobile number is required',
    //   });
    //   return;
    // }

    // Check if user already exists with this email
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      res.status(400).json({
        success: false,
        error: 'User with this email already exists',
        existingUser: {
          _id: existingUser._id,
          firstName: existingUser.firstName,
          lastName: existingUser.lastName,
          email: existingUser.email,
        }
      });
      return;
    }

    // Check if uniqueId already exists (if provided)
    if (uniqueId) {
      const existingUserByUniqueId = await User.findOne({ uniqueId });
      if (existingUserByUniqueId) {
        res.status(400).json({
          success: false,
          error: 'User with this Unique ID already exists',
        });
        return;
      }
    }

    // Get STUDENT role
    const studentRole = await Role.findOne({ code: 'STUDENT' });
    if (!studentRole) {
      res.status(500).json({
        success: false,
        error: 'Student role not found in system. Please run seed-student-role.js',
      });
      return;
    }

    // Generate default password from phone or email
    // Format: first 4 chars of email + last 4 digits of phone
    const defaultPassword = `${email.substring(0, 4)}${phone.slice(-4)}`;

    // Prepare user data with all fields from the form
    const userData: any = {
      email,
      phone,
      parentMobile,
      password: defaultPassword, // Will be hashed by User model pre-save hook
      role: studentRole._id,
      projects: [projectId],
      isActive: true,
      requirePasswordSetup: true, // Student needs to change password on first login
      registrationSource: 'offline', // Mark as offline registration
      eulaAccepted: false,
    };

    // Add firstName, lastName, fullName if provided
    if (firstName) userData.firstName = firstName;
    if (lastName) userData.lastName = lastName;
    if (fullName) {
      userData.fullName = fullName;
    } else if (firstName && lastName) {
      userData.fullName = `${firstName} ${lastName}`;
    } else if (firstName) {
      userData.fullName = firstName;
    }

    // Add uniqueId if provided
    if (uniqueId) userData.uniqueId = uniqueId;

    // Store ALL additional dynamic fields from offline settings (using normalized data)
    Object.keys(normalizedData).forEach(key => {
      if (!['firstName', 'lastName', 'fullName', 'email', 'phone', 'parentMobile', 'uniqueId', 'projectId'].includes(key)) {
        userData[key] = normalizedData[key];
      }
    });

    // Create student user
    const newStudent = await User.create(userData);

    console.log(`✅ Student registered: ${email} (ID: ${newStudent._id})`);
    console.log(`🔑 Default password set for new student (not logged)`);

    res.status(201).json({
      success: true,
      message: 'Student registered successfully. Default password sent to student.',
      data: {
        _id: newStudent._id,
        firstName: newStudent.firstName || '',
        lastName: newStudent.lastName || '',
        fullName: newStudent.fullName || '',
        email: newStudent.email,
        phone: newStudent.phone,
        parentMobile: (newStudent as any).parentMobile,
        uniqueId: newStudent.uniqueId,
        // Do not return plaintext passwords in API responses for security
      },
    });

  } catch (error: any) {
    console.error('Register student error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to register student',
      message: error.message,
    });
  }
};

/**
 * Advanced search for students/users by name, phone, or unique ID
 */
export const searchStudents = async (req: Request, res: Response): Promise<void> => {
  try {
    const { query, projectId, searchType } = req.query;

    if (!query) {
      res.status(400).json({
        success: false,
        error: 'Search query is required',
      });
      return;
    }

    const filter: any = {};
    
    if (projectId) {
      filter.projects = projectId;
    }

    // Build search filter based on searchType
    // searchType can be: 'name', 'email', 'phone', 'all'
    if (searchType === 'name' || searchType === 'all') {
      filter.$or = [
        { firstName: { $regex: query as string, $options: 'i' } },
        { lastName: { $regex: query as string, $options: 'i' } },
        { fullName: { $regex: query as string, $options: 'i' } },
      ];
    }

    if (searchType === 'email') {
      filter.email = { $regex: query as string, $options: 'i' };
    }

    if (searchType === 'phone' || (searchType === 'all' && !filter.$or)) {
      filter.phone = query as string;
    }

    // If searchType is 'all', combine all search criteria
    if (searchType === 'all' && filter.$or) {
      filter.$or.push(
        { email: { $regex: query as string, $options: 'i' } },
        { phone: query as string }
      );
    }

    const users = await User.find(filter)
      .select('_id firstName lastName fullName email phone parentMobile')
      .limit(20); // Limit to 20 results

    res.json({
      success: true,
      data: users,
      count: users.length,
    });

  } catch (error: any) {
    console.error('Search students error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search students',
      message: error.message,
    });
  }
};

/**
 * Get agents from escalation policies for a project
 */
export const getEscalationAgents = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.query;

    if (!projectId) {
      res.status(400).json({
        success: false,
        error: 'Project ID is required',
      });
      return;
    }

    // Import EscalationPolicy model
    const EscalationPolicy = require('../models/sla-module/EscalationPolicy').default;

    // Get all active escalation policies for this project
    const policies = await EscalationPolicy.find({
      $or: [
        { projectId: projectId },
        { projectIds: projectId }
      ],
      isActive: true,
    });

    // Extract agents with their escalation level info
    const agentsMap = new Map<string, any>();
    
    policies.forEach((policy: any) => {
      policy.levels?.forEach((level: any) => {
        if (level.escalateTo?.type === 'user') {
          const userId = level.escalateTo.targetId;
          const targetName = level.escalateTo.targetName;
          
          // Store agent with escalation level info
          if (!agentsMap.has(userId)) {
            agentsMap.set(userId, {
              userId,
              targetName,
              escalationLevel: `Level ${level.level}`,
              escalationLevelNumber: level.level,
            });
          } else {
            // If agent appears in multiple levels, use the lowest level
            const existing = agentsMap.get(userId);
            if (level.level < existing.escalationLevelNumber) {
              existing.escalationLevel = `Level ${level.level}`;
              existing.escalationLevelNumber = level.level;
            }
          }
        }
      });
    });

    // Fetch user details for all unique user IDs
    const userIds = Array.from(agentsMap.keys());
    const users = await User.find({
      _id: { $in: userIds },
      isActive: true,
    })
      .select('_id firstName lastName email')
      .sort({ firstName: 1 });

    // Combine user details with escalation info
    const agents = users.map((user: any) => {
      const escalationInfo = agentsMap.get(user._id.toString());
      return {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        escalationLevel: escalationInfo?.escalationLevel || 'Unknown',
        escalationLevelNumber: escalationInfo?.escalationLevelNumber || 999,
      };
    }).sort((a, b) => a.escalationLevelNumber - b.escalationLevelNumber);

    res.json({
      success: true,
      data: agents,
      count: agents.length,
    });

  } catch (error: any) {
    console.error('Get escalation agents error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch escalation agents',
      message: error.message,
    });
  }
};
