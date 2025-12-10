import { Request, Response } from 'express';
import { Project } from '../models/Project';
import { User } from '../models/User';
import { Category } from '../models/Category';
import { Status } from '../models/Status';
import SLARule from '../models/sla-module/SLARule';
import { AuthRequest } from '../middleware/auth';
import { logActivity } from '../utils/logger';

/**
 * Get all projects with optional filtering
 */
export const getAllProjects = async (req: Request, res: Response) => {
  try {
    const { search, status, page = 1, limit = 10 } = req.query;
    
    const query: any = {};
    
    // Search by name, code, or projectId
    if (search && typeof search === 'string') {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
        { projectId: { $regex: search, $options: 'i' } },
      ];
    }
    
    if (status) {
      query.status = status;
    }
    
    const skip = (Number(page) - 1) * Number(limit);
    
    const projects = await Project.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email');
    
    // Calculate actual user count for each project
    const projectsWithUserCount = await Promise.all(
      projects.map(async (project) => {
        const userCount = await User.countDocuments({ projects: project._id });
        return {
          ...project.toObject(),
          users: userCount,
        };
      })
    );
    
    const total = await Project.countDocuments(query);
    
    console.log(`📋 Retrieved ${projects.length} projects (Total: ${total})`);
    
    return res.json({
      success: true,
      data: {
        projects: projectsWithUserCount,
        pagination: {
          currentPage: Number(page),
          totalPages: Math.ceil(total / Number(limit)),
          totalItems: total,
          itemsPerPage: Number(limit),
        },
      },
    });
    
  } catch (error) {
    console.error('Get all projects error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

/**
 * Get single project by ID
 */
export const getProjectById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const project = await Project.findById(id)
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email');
    
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }
    
    // Calculate actual user count
    const userCount = await User.countDocuments({ projects: project._id });
    
    const projectWithUserCount = {
      ...project.toObject(),
      users: userCount,
    };
    
    console.log(`📋 Retrieved project: ${project.name} (${userCount} users)`);
    
    return res.json({
      success: true,
      data: { project: projectWithUserCount },
    });
    
  } catch (error) {
    console.error('Get project by ID error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

/**
 * Create new project
 */
export const createProject = async (req: Request, res: Response) => {
  try {
    const projectData = req.body;
    
    // Check if code already exists
    const existingProject = await Project.findOne({ code: projectData.code.toUpperCase() });
    if (existingProject) {
      return res.status(400).json({
        success: false,
        message: 'Project code already exists',
      });
    }
    
    // Create new project
    const project = new Project({
      ...projectData,
      code: projectData.code.toUpperCase(),
      createdBy: req.body.createdBy, // TODO: Get from authenticated user
    });
    
    await project.save();
    
    console.log(`✅ Created new project: ${project.name} (${project.projectId})`);
    
    // Log activity
    try {
      const currentUser = (req as any).user;
      if (currentUser) {
        await logActivity({
          userId: currentUser.userId,
          userName: `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim(),
          userEmail: currentUser.email,
          action: 'create',
          entity: 'project',
          entityId: project._id.toString(),
          entityName: project.name,
          projectId: project._id.toString(),
          projectName: project.name,
          description: `Project ${project.name} (${project.code}) created`,
          req,
          metadata: { projectId: project.projectId, code: project.code }
        });
      }
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }
    
    return res.status(201).json({
      success: true,
      data: { project },
      message: 'Project created successfully',
    });
    
  } catch (error: any) {
    console.error('Create project error:', error);
    console.error('Error details:', error.message);
    if (error.errors) {
      console.error('Validation errors:', JSON.stringify(error.errors, null, 2));
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
      errors: error.errors,
    });
  }
};

/**
 * Update project
 */
export const updateProject = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // Check if code is being updated and if it's unique
    if (updateData.code) {
      const existingProject = await Project.findOne({ 
        code: updateData.code.toUpperCase(),
        _id: { $ne: id },
      });
      if (existingProject) {
        return res.status(400).json({
          success: false,
          message: 'Project code already exists',
        });
      }
      updateData.code = updateData.code.toUpperCase();
    }
    
    const project = await Project.findByIdAndUpdate(
      id,
      {
        ...updateData,
        updatedBy: req.body.updatedBy, // TODO: Get from authenticated user
      },
      { new: true, runValidators: true }
    );
    
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }
    
    console.log(`✅ Updated project: ${project.name} (${project.projectId})`);
    
    // Log activity
    try {
      const currentUser = (req as any).user;
      if (currentUser) {
        const changes = Object.keys(updateData)
          .filter(key => !['updatedBy', 'updatedAt'].includes(key))
          .map(key => ({ field: key, oldValue: 'previous value', newValue: updateData[key] }));
        
        await logActivity({
          userId: currentUser.userId,
          userName: `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim(),
          userEmail: currentUser.email,
          action: 'update',
          entity: 'project',
          entityId: project._id.toString(),
          entityName: project.name,
          projectId: project._id.toString(),
          projectName: project.name,
          changes: changes.length > 0 ? changes : undefined,
          description: `Project ${project.name} updated`,
          req
        });
      }
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }
    
    return res.json({
      success: true,
      data: { project },
      message: 'Project updated successfully',
    });
    
  } catch (error) {
    console.error('Update project error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

/**
 * Delete project
 */
export const deleteProject = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Fetch project first to get its data
    const project = await Project.findById(id);
    
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }
    
    // Store project data before deletion
    const deletedProjectData = {
      id: project._id.toString(),
      name: project.name,
      code: project.code,
      projectId: project.projectId
    };
    
    // Delete the project
    await Project.findByIdAndDelete(id);
    
    console.log(`🗑️ Deleted project: ${deletedProjectData.name} (${deletedProjectData.projectId})`);
    
    // Log activity
    try {
      const currentUser = (req as any).user;
      if (currentUser) {
        await logActivity({
          userId: currentUser.userId,
          userName: `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim(),
          userEmail: currentUser.email,
          action: 'delete',
          entity: 'project',
          entityId: deletedProjectData.id,
          entityName: deletedProjectData.name,
          description: `Project ${deletedProjectData.name} (${deletedProjectData.code}) deleted`,
          req,
          metadata: { projectId: deletedProjectData.projectId, code: deletedProjectData.code }
        });
      }
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }
    
    return res.json({
      success: true,
      message: 'Project deleted successfully',
    });
    
  } catch (error) {
    console.error('Delete project error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

/**
 * Toggle project status (active/inactive)
 */
export const toggleProjectStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const project = await Project.findById(id);
    
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }
    
    project.isActive = !project.isActive;
    project.status = project.isActive ? 'active' : 'inactive';
    await project.save();
    
    console.log(`🔄 Toggled project status: ${project.name} -> ${project.status}`);
    
    return res.json({
      success: true,
      data: { project },
      message: `Project ${project.status === 'active' ? 'activated' : 'deactivated'} successfully`,
    });
    
  } catch (error) {
    console.error('Toggle project status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

/**
 * Update project modules
 */
export const updateProjectModules = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { modules } = req.body;
    
    const project = await Project.findByIdAndUpdate(
      id,
      { modules },
      { new: true, runValidators: true }
    );
    
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }
    
    console.log(`✅ Updated modules for project: ${project.name}`);
    
    return res.json({
      success: true,
      data: { project },
      message: 'Project modules updated successfully',
    });
    
  } catch (error) {
    console.error('Update project modules error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

/**
 * Get project statistics
 */
export const getProjectStats = async (req: Request, res: Response) => {
  try {
    const totalProjects = await Project.countDocuments();
    const activeProjects = await Project.countDocuments({ status: 'active' });
    const inactiveProjects = await Project.countDocuments({ status: 'inactive' });
    const suspendedProjects = await Project.countDocuments({ status: 'suspended' });
    
    return res.json({
      success: true,
      data: {
        total: totalProjects,
        active: activeProjects,
        inactive: inactiveProjects,
        suspended: suspendedProjects,
      },
    });
    
  } catch (error) {
    console.error('Get project stats error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

/**
 * Get project branding by custom URL path
 */
export const getProjectBranding = async (req: Request, res: Response) => {
  try {
    const { urlPath } = req.params;
    
    console.log(`🔍 Looking for project with customUrlPath: ${urlPath}`);
    
    const project = await Project.findOne({ 'branding.customUrlPath': urlPath });
    
    if (!project) {
      console.log(`❌ Project not found with customUrlPath: ${urlPath}`);
      return res.status(404).json({
        success: false,
        message: 'Project not found',
        error: 'No project found with this URL path',
      });
    }
    
    // Return only the necessary branding information
    const brandingData = {
      projectId: project._id.toString(),
      name: project.name,
      code: project.code,
      branding: {
        customUrlPath: project.branding?.customUrlPath,
        logo: project.branding?.logo,
        favicon: project.branding?.favicon,
        headerText: project.branding?.headerText,
        footerText: project.branding?.footerText,
        colorTheme: {
          primary: project.branding?.colorTheme?.primary || '#667eea',
          secondary: project.branding?.colorTheme?.secondary || '#1f2937',
          accent: project.branding?.colorTheme?.accent || '#764ba2',
          background: project.branding?.colorTheme?.background || '#ffffff',
        },
      },
      knowledgeBase: (project as any).knowledgeBase ?? true, // Enable KB by default
      ticketSubmissionMode: (project as any).ticketSubmissionSettings?.mode || 'both', // online, offline, or both
    };
    
    console.log(`✅ Found project branding: ${project.name}`, brandingData);
    
    // Set cache control headers to prevent stale branding data
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    return res.json({
      success: true,
      data: brandingData,
    });
    
  } catch (error) {
    console.error('Get project branding error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

/**
 * Get project ticket submission settings
 */
export const getProjectTicketSettings = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    
    console.log(`🔍 Looking for ticket settings for project: ${projectId}`);
    
    const project = await Project.findById(projectId);
    
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }
    
    // Get ticket numbering config - prefer ticketNumberSettings, fallback to old location
    const ticketNumberSettings = project.configuration?.ticketNumberSettings;
    const oldNumbering = (project.configuration as any)?.ticketSubmissionSettings?.numbering;
    
    console.log('🔍 DB ticketNumberSettings:', JSON.stringify(ticketNumberSettings, null, 2));
    console.log('🔍 DB oldNumbering:', JSON.stringify(oldNumbering, null, 2));
    
    // Convert backend format to UI format
    let numbering;
    if (ticketNumberSettings) {
      const prefix = ticketNumberSettings.prefix || 'TKT';
      const format = ticketNumberSettings.format || '{PREFIX}-{YYYY}-{NNNN}';
      
      // Extract separator from format (character between placeholders)
      let separator = '-';
      const match = format.match(/\{[^}]+\}(.)\{/);
      if (match) separator = match[1];
      
      // Build UI format string (replace {PREFIX} with actual prefix, {NNNN} with ####)
      const uiFormat = format
        .replace('{PREFIX}', prefix)
        .replace('{NNNN}', '####')
        .replace('{NNN}', '###')
        .replace('{NN}', '##');
      
      numbering = {
        format: uiFormat,
        prefix: prefix,
        startingNumber: ticketNumberSettings.startingNumber || 1,
        separator: separator,
        includeYear: format.includes('{YYYY}'),
        includeMonth: format.includes('{MM}'),
        resetFrequency: ticketNumberSettings.resetPeriod || 'yearly',
      };
    } else if (oldNumbering) {
      numbering = oldNumbering;
    } else {
      numbering = {
        format: 'TICK-{YYYY}-{####}',
        prefix: 'TICK',
        startingNumber: 1,
        separator: '-',
        includeYear: true,
        includeMonth: false,
        resetFrequency: 'yearly',
      };
    }
    
    console.log('📋 Returning ticket numbering config:', JSON.stringify(numbering, null, 2));
    
    // Return ticket submission settings with defaults
    const settings = {
      mode: project.configuration?.ticketSubmissionSettings?.mode || 'both',
      enableOnlineForm: project.configuration?.ticketSubmissionSettings?.enableOnlineForm !== false,
      enableOfflineCenter: project.configuration?.ticketSubmissionSettings?.enableOfflineCenter !== false,
      onlineFormFields: project.configuration?.ticketSubmissionSettings?.onlineFormFields || [
        { fieldName: 'Name', fieldType: 'text', required: true, placeholder: 'Enter your name' },
        { fieldName: 'Email', fieldType: 'email', required: true, placeholder: 'Enter your email' },
        { fieldName: 'Phone', fieldType: 'phone', required: true, placeholder: 'Enter your phone number' },
        { fieldName: 'Subject', fieldType: 'text', required: true, placeholder: 'Enter subject' },
        { fieldName: 'Description', fieldType: 'textarea', required: true, placeholder: 'Describe your issue' },
      ],
      offlineCenters: project.configuration?.ticketSubmissionSettings?.offlineCenters || [],
      welcomeMessage: project.configuration?.ticketSubmissionSettings?.welcomeMessage || 'Welcome! Submit your ticket below and our team will assist you.',
      successMessage: project.configuration?.ticketSubmissionSettings?.successMessage || 'Your ticket has been successfully submitted. We will get back to you soon.',
      announcement: project.configuration?.ticketSubmissionSettings?.announcement || '',
      allowAttachments: project.configuration?.ticketSubmissionSettings?.allowAttachments !== false,
      maxAttachmentSize: project.configuration?.ticketSubmissionSettings?.maxAttachmentSize || 10,
      allowedFileTypes: project.configuration?.ticketSubmissionSettings?.allowedFileTypes || ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'],
      // Fetch categories from Category model (master)
      categories: await (async () => {
        const categories = await Category.find({ 
          projectId: project._id, 
          isActive: true 
        }).select('name').sort({ order: 1, name: 1 });
        return categories.map(cat => cat.name);
      })(),
      // Fetch allowed statuses from Status model (master)
      allowedStatuses: await (async () => {
        const statuses = await Status.find({ 
          projectId: project._id, 
          isActive: true 
        }).select('name code color isDefault isClosed').sort({ displayOrder: 1 });
        return statuses;
      })(),
      // Fetch priorities from SLA Rules
      allowedPriorities: await (async () => {
        console.log('🔍 Querying SLA rules:');
        console.log('  Project ID:', project._id);
        console.log('  Project ID type:', typeof project._id);
        console.log('  SLARule collection:', SLARule.collection.name);
        
        const query = {
          projectIds: { $in: [project._id] },  // Use $in because projectIds is an array
          isActive: true
        };
        console.log('  Query:', JSON.stringify(query));
        
        const slaRules = await SLARule.find(query).select('name priority');
        console.log('  Raw results:', JSON.stringify(slaRules, null, 2));
        
        // Extract unique priorities - use priority field if exists, otherwise use name
        const uniquePriorities = [...new Set(slaRules.map(rule => rule.priority || rule.name).filter(p => p))];
        console.log(`📊 Found ${uniquePriorities.length} unique priorities from ${slaRules.length} SLA rules for project ${project.name}:`, uniquePriorities);
        
        return uniquePriorities;
      })(),
    };
    
    console.log(`✅ Found ticket settings for project: ${project.name}`);
    
    return res.json({
      success: true,
      projectName: project.name,
      data: settings,
      ticketConfig: {
        numbering,
      },
    });
    
  } catch (error) {
    console.error('Get project ticket settings error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

/**
 * Get offline module settings for a project
 */
export const getOfflineSettings = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const project = await Project.findById(id);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }

    let settings = project.configuration?.offlineModuleSettings || {
      registrationFields: [
        { id: '1', fieldName: 'First Name', fieldType: 'text', required: true, placeholder: 'Enter first name', order: 1 },
        { id: '2', fieldName: 'Last Name', fieldType: 'text', required: true, placeholder: 'Enter last name', order: 2 },
        { id: '3', fieldName: 'Email', fieldType: 'email', required: true, placeholder: 'student@example.com', order: 3 },
        { id: '4', fieldName: 'Phone', fieldType: 'phone', required: false, placeholder: '+91 98765 43210', order: 4 },
      ],
      ticketFields: [
        { id: 'category-fixed', fieldName: 'Category', fieldType: 'category', required: true, placeholder: 'Select category', isFixed: true, isEnabled: true, order: 1 },
        { id: '1', fieldName: 'Title', fieldType: 'text', required: true, placeholder: 'Brief description of issue', order: 2 },
        { id: '2', fieldName: 'Description', fieldType: 'textarea', required: true, placeholder: 'Detailed description...', order: 3 },
        { id: '3', fieldName: 'Attachments', fieldType: 'file', required: false, placeholder: '', allowMultiple: true, maxFiles: 5, allowedFileTypes: ['pdf', 'jpg', 'png', 'doc', 'docx'], order: 4 },
      ],
      allowAgentToMarkResolved: true,
      allowAgentToEscalate: true,
      autoAssignToCreatingAgent: false,
      requireStudentVerification: false,
      notificationSettings: {
        notifyStudentOnRegistration: true,
        notifyStudentOnTicketCreation: true,
        sendWelcomeEmail: true,
      },
    };

    // Convert to plain object to remove Mongoose metadata
    if (project.configuration?.offlineModuleSettings) {
      settings = JSON.parse(JSON.stringify(settings));
      
      // Ensure category field exists in ticket fields
      if (settings.ticketFields) {
        const hasCategoryField = settings.ticketFields.some((f: any) => 
          f.fieldType === 'category' || f.fieldType === 'category-select' || f.fieldName === 'Category'
        );
        if (!hasCategoryField) {
          settings.ticketFields = [
            { id: 'category-fixed', fieldName: 'Category', fieldType: 'category', required: true, placeholder: 'Select category', isFixed: true, isEnabled: true, order: 1 },
            ...settings.ticketFields.map((f: any) => ({ ...f, order: (f.order || 0) + 1 }))
          ];
        }
      }
    }

    return res.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error('Get offline settings error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

/**
 * Update offline module settings for a project
 */
export const updateOfflineSettings = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    let settings = req.body;

    // Clean the settings - remove MongoDB _id fields from nested arrays
    if (settings.registrationFields) {
      settings.registrationFields = settings.registrationFields.map((field: any) => {
        const { _id, ...cleanField } = field;
        return cleanField;
      });
    }

    if (settings.ticketFields) {
      settings.ticketFields = settings.ticketFields.map((field: any) => {
        const { _id, ...cleanField } = field;
        return cleanField;
      });
    }

    const project = await Project.findById(id);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }

    // Initialize configuration if it doesn't exist
    if (!project.configuration) {
      project.configuration = {};
    }

    // Update offline module settings
    project.configuration.offlineModuleSettings = settings;
    project.updatedAt = new Date();
    if (req.user?.userId) {
      project.updatedBy = req.user.userId as any;
    }

    await project.save();

    console.log(`✅ Offline module settings updated for project: ${project.name}`);

    return res.json({
      success: true,
      message: 'Offline module settings updated successfully',
      data: settings,
    });
  } catch (error) {
    console.error('Update offline settings error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

/**
 * Update project ticket settings
 */
export const updateProjectTicketSettings = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { numbering, statuses, types } = req.body;

    console.log('💾 Saving ticket settings:', JSON.stringify({ numbering, statuses, types }, null, 2));

    const project = await Project.findById(projectId);
    
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }

    // Initialize configuration structure if needed
    if (!project.configuration) {
      (project as any).configuration = {};
    }

    // Update ticket numbering configuration - save to ticketNumberSettings (where backend reads from)
    if (numbering) {
      // Build format string from UI settings
      const prefix = numbering.prefix || 'TKT';
      const separator = numbering.separator || '-';
      let formatParts = ['{PREFIX}'];
      
      if (numbering.includeYear) {
        formatParts.push('{YYYY}');
      }
      if (numbering.includeMonth) {
        formatParts.push('{MM}');
      }
      formatParts.push('{NNNN}');
      
      const format = formatParts.join(separator);
      
      // Convert UI format to backend format
      const ticketNumberSettings = {
        prefix: prefix,
        format: format,
        startingNumber: numbering.startingNumber || 1,
        resetPeriod: (numbering.resetFrequency || 'yearly') as 'never' | 'daily' | 'monthly' | 'yearly',
      };
      
      console.log('✅ Converted UI format to backend format:', ticketNumberSettings);
      (project as any).configuration.ticketNumberSettings = ticketNumberSettings;
      
      // Also save to old location for backward compatibility
      if (!(project as any).configuration.ticketSubmissionSettings) {
        (project as any).configuration.ticketSubmissionSettings = {};
      }
      (project as any).configuration.ticketSubmissionSettings.numbering = numbering;
    }
    
    if (statuses) {
      if (!(project as any).configuration.ticketSubmissionSettings) {
        (project as any).configuration.ticketSubmissionSettings = {};
      }
      (project as any).configuration.ticketSubmissionSettings.statuses = statuses;
    }
    if (types) {
      if (!(project as any).configuration.ticketSubmissionSettings) {
        (project as any).configuration.ticketSubmissionSettings = {};
      }
      (project as any).configuration.ticketSubmissionSettings.types = types;
    }

    await project.save();
    
    console.log('✅ Ticket settings saved successfully');

    return res.json({
      success: true,
      message: 'Ticket settings updated successfully',
      data: {
        numbering: (project as any).configuration?.ticketSubmissionSettings?.numbering,
        ticketNumberSettings: (project as any).configuration?.ticketNumberSettings,
        statuses: (project as any).configuration?.ticketSubmissionSettings?.statuses,
        types: (project as any).configuration?.ticketSubmissionSettings?.types,
      },
    });
  } catch (error) {
    console.error('Update ticket settings error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

/**
 * Get project configuration by domain
 * Public endpoint for login page to fetch branding, favicon, background image, announcement banner
 */
export const getProjectByDomain = async (req: Request, res: Response) => {
  try {
    const { domain } = req.params;
    
    console.log(`🔍 Looking for project with domain: ${domain}`);
    
    // Try to find by custom URL path first, then by domain
    let project = await Project.findOne({ 'branding.customUrlPath': domain });
    
    if (!project) {
      console.log(`❌ Project not found with domain: ${domain}`);
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }
    
    // Return project configuration needed for login page
    const projectConfig = {
      _id: project._id,
      name: project.name,
      code: project.code,
      branding: {
        logo: project.branding?.logo,
        favicon: project.branding?.favicon,
        headerText: project.branding?.headerText,
        footerText: project.branding?.footerText,
        customUrlPath: project.branding?.customUrlPath,
        colorTheme: project.branding?.colorTheme,
      },
      configuration: {
        announcementBanner: (project as any).configuration?.announcementBanner,
        customizationSettings: {
          loginPageBackgroundImage: (project as any).configuration?.customizationSettings?.loginPageBackgroundImage,
        },
        security: (project as any).configuration?.security,
      },
    };
    
    console.log(`✅ Found project: ${project.name}`);
    
    // Set cache control headers
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    return res.json(projectConfig);
  } catch (error) {
    console.error('Get project by domain error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};
