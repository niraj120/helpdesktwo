// @ts-nocheck
// TEMPORARILY DISABLED - Needs refactoring for new UserReportingHierarchy schema
// The new schema uses userId/reportingManager instead of supervisorUserId/reporteeUserId
// and removed isActive, effectiveTo, effectiveFrom, relationshipType fields
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { UserReportingHierarchy } from '../models/UserReportingHierarchy';
import { User } from '../models/User';
import ActivityLog from '../models/ActivityLog';

interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
  };
}

/**
 * Create a new hierarchy mapping (supervisor → reportee)
 * POST /api/hierarchy/mapping
 * Permission: HIERARCHY_MANAGE_TEAM
 */
export const createHierarchyMapping = async (req: AuthRequest, res: Response) => {
  try {
    const { supervisorUserId, reporteeUserId, projectId, relationshipType, metadata } = req.body;
    const currentUserId = req.user?.userId;

    // Validation: Required fields
    if (!supervisorUserId || !reporteeUserId) {
      return res.status(400).json({
        success: false,
        message: 'Supervisor and reportee user IDs are required',
      });
    }

    // Validation: Cannot be the same user
    if (supervisorUserId === reporteeUserId) {
      return res.status(400).json({
        success: false,
        message: 'User cannot report to themselves',
      });
    }

    // Validation: Both users must exist and be active
    const [supervisor, reportee] = await Promise.all([
      User.findById(supervisorUserId),
      User.findById(reporteeUserId),
    ]);

    if (!supervisor || !supervisor.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Supervisor user not found or inactive',
      });
    }

    if (!reportee || !reportee.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Reportee user not found or inactive',
      });
    }

    // CRITICAL: Check for circular dependency
    const hasCircularDependency = await (UserReportingHierarchy as any).checkCircularDependency(
      new mongoose.Types.ObjectId(supervisorUserId),
      new mongoose.Types.ObjectId(reporteeUserId),
      projectId ? new mongoose.Types.ObjectId(projectId) : undefined
    );

    if (hasCircularDependency) {
      return res.status(400).json({
        success: false,
        message: `Circular dependency detected: ${supervisor.firstName} ${supervisor.lastName} cannot supervise ${reportee.firstName} ${reportee.lastName} because it would create a reporting loop`,
      });
    }

    // Deactivate existing active mapping for this reportee in this project
    const existingMapping = await UserReportingHierarchy.findOne({
      reporteeUserId: new mongoose.Types.ObjectId(reporteeUserId),
      projectId: projectId ? new mongoose.Types.ObjectId(projectId) : { $exists: false },
      isActive: true,
    });

    if (existingMapping) {
      existingMapping.isActive = false;
      existingMapping.effectiveTo = new Date();
      existingMapping.updatedBy = new mongoose.Types.ObjectId(currentUserId);
      await existingMapping.save();

      console.log(`✅ Deactivated existing mapping for reportee ${reporteeUserId}`);
    }

    // Create new mapping
    const newMapping = new UserReportingHierarchy({
      supervisorUserId: new mongoose.Types.ObjectId(supervisorUserId),
      reporteeUserId: new mongoose.Types.ObjectId(reporteeUserId),
      projectId: projectId ? new mongoose.Types.ObjectId(projectId) : undefined,
      relationshipType: relationshipType || 'direct_report',
      hierarchyLevel: 1, // Direct report
      metadata: metadata || {},
      createdBy: new mongoose.Types.ObjectId(currentUserId),
      updatedBy: new mongoose.Types.ObjectId(currentUserId),
      isActive: true,
      effectiveFrom: new Date(),
    });

    await newMapping.save();

    // Audit log
    await ActivityLog.create({
      userId: new mongoose.Types.ObjectId(currentUserId),
      action: 'CREATE_HIERARCHY_MAPPING',
      entityType: 'UserReportingHierarchy',
      entityId: newMapping._id,
      details: {
        supervisorUserId,
        reporteeUserId,
        projectId,
        relationshipType,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    // Populate for response
    await newMapping.populate([
      { path: 'supervisorUserId', select: 'firstName lastName email role' },
      { path: 'reporteeUserId', select: 'firstName lastName email role' },
      { path: 'projectId', select: 'name projectName' },
    ]);

    return res.status(201).json({
      success: true,
      message: 'Hierarchy mapping created successfully',
      data: newMapping,
    });
  } catch (error: any) {
    console.error('Error creating hierarchy mapping:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create hierarchy mapping',
      error: error.message,
    });
  }
};

/**
 * Get direct reportees for a supervisor
 * GET /api/hierarchy/reportees/:userId
 * Permission: HIERARCHY_VIEW_TEAM
 */
export const getUserReportees = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { projectId, includeInactive } = req.query;

    const query: any = {
      supervisorUserId: new mongoose.Types.ObjectId(userId),
      hierarchyLevel: 1, // Direct reports only
    };

    if (!includeInactive) {
      query.isActive = true;
      query.effectiveFrom = { $lte: new Date() };
      query.$or = [{ effectiveTo: { $exists: false } }, { effectiveTo: { $gt: new Date() } }];
    }

    if (projectId) {
      query.projectId = new mongoose.Types.ObjectId(projectId as string);
    }

    const reportees = await UserReportingHierarchy.find(query)
      .populate({
        path: 'reporteeUserId',
        select: 'firstName lastName email role centers projects',
        populate: { path: 'role', select: 'name code' },
      })
      .populate({
        path: 'projectId',
        select: 'name projectName',
      })
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      count: reportees.length,
      data: reportees,
    });
  } catch (error: any) {
    console.error('Error fetching reportees:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch reportees',
      error: error.message,
    });
  }
};

/**
 * Get all reportees recursively (multi-level hierarchy)
 * GET /api/hierarchy/reportees/:userId/all
 * Permission: HIERARCHY_VIEW_TEAM
 */
export const getAllReporteesRecursive = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { projectId, maxDepth } = req.query;

    const reporteeIds = await (UserReportingHierarchy as any).getAllReporteesRecursive(
      new mongoose.Types.ObjectId(userId),
      projectId ? new mongoose.Types.ObjectId(projectId as string) : undefined,
      maxDepth ? parseInt(maxDepth as string) : 10
    );

    // Fetch user details
    const reportees = await User.find({ _id: { $in: reporteeIds } })
      .select('firstName lastName email role centers projects')
      .populate('role', 'name code')
      .lean();

    return res.json({
      success: true,
      count: reportees.length,
      data: reportees,
    });
  } catch (error: any) {
    console.error('Error fetching all reportees:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch all reportees',
      error: error.message,
    });
  }
};

/**
 * Get supervisor chain for a reportee
 * GET /api/hierarchy/supervisors/:userId
 * Permission: HIERARCHY_VIEW_TEAM
 */
export const getUserSupervisors = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { projectId } = req.query;

    const supervisorIds = await (UserReportingHierarchy as any).getSupervisorChain(
      new mongoose.Types.ObjectId(userId),
      projectId ? new mongoose.Types.ObjectId(projectId as string) : undefined
    );

    // Fetch user details
    const supervisors = await User.find({ _id: { $in: supervisorIds } })
      .select('firstName lastName email role')
      .populate('role', 'name code')
      .lean();

    return res.json({
      success: true,
      count: supervisors.length,
      data: supervisors,
    });
  } catch (error: any) {
    console.error('Error fetching supervisors:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch supervisors',
      error: error.message,
    });
  }
};

/**
 * Get full team structure (tree view)
 * GET /api/hierarchy/team-structure
 * Permission: HIERARCHY_VIEW_TEAM
 */
export const getTeamStructure = async (req: AuthRequest, res: Response) => {
  try {
    const { projectId, rootUserId } = req.query;
    const currentUserId = req.user?.userId;

    // If no rootUserId provided, use current user
    const rootId = rootUserId || currentUserId;

    const query: any = {
      isActive: true,
      effectiveFrom: { $lte: new Date() },
      $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: { $gt: new Date() } }],
    };

    if (projectId) {
      query.projectId = new mongoose.Types.ObjectId(projectId as string);
    }

    // Fetch all active mappings
    const mappings = await UserReportingHierarchy.find(query)
      .populate('supervisorUserId', 'firstName lastName email role')
      .populate('reporteeUserId', 'firstName lastName email role')
      .lean();

    // Build tree structure
    const buildTree = (supervisorId: string): any => {
      const directReports = mappings.filter(
        (m: any) => m.supervisorUserId._id.toString() === supervisorId
      );

      return directReports.map((mapping: any) => ({
        user: mapping.reporteeUserId,
        relationshipType: mapping.relationshipType,
        effectiveFrom: mapping.effectiveFrom,
        children: buildTree(mapping.reporteeUserId._id.toString()),
      }));
    };

    const tree = {
      root: await User.findById(rootId).select('firstName lastName email role').populate('role', 'name code'),
      children: buildTree(rootId as string),
    };

    return res.json({
      success: true,
      data: tree,
    });
  } catch (error: any) {
    console.error('Error fetching team structure:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch team structure',
      error: error.message,
    });
  }
};

/**
 * Get all hierarchy mappings (for admin view)
 * GET /api/hierarchy/mappings
 * Permission: HIERARCHY_MANAGE_TEAM
 */
export const getAllHierarchyMappings = async (req: AuthRequest, res: Response) => {
  try {
    const { projectId, includeInactive, page = 1, limit = 50 } = req.query;

    const query: any = {};

    if (!includeInactive) {
      query.isActive = true;
    }

    if (projectId) {
      query.projectId = new mongoose.Types.ObjectId(projectId as string);
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [mappings, total] = await Promise.all([
      UserReportingHierarchy.find(query)
        .populate({
          path: 'supervisorUserId',
          select: 'firstName lastName email role',
          populate: { path: 'role', select: 'name code' },
        })
        .populate({
          path: 'reporteeUserId',
          select: 'firstName lastName email role',
          populate: { path: 'role', select: 'name code' },
        })
        .populate('projectId', 'name projectName')
        .populate('createdBy', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      UserReportingHierarchy.countDocuments(query),
    ]);

    return res.json({
      success: true,
      data: mappings,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error: any) {
    console.error('Error fetching hierarchy mappings:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch hierarchy mappings',
      error: error.message,
    });
  }
};

/**
 * Deactivate a hierarchy mapping
 * DELETE /api/hierarchy/mapping/:id
 * Permission: HIERARCHY_MANAGE_TEAM
 */
export const deactivateHierarchyMapping = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user?.userId;

    const mapping = await UserReportingHierarchy.findById(id);

    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: 'Hierarchy mapping not found',
      });
    }

    if (!mapping.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Mapping is already inactive',
      });
    }

    mapping.isActive = false;
    mapping.effectiveTo = new Date();
    mapping.updatedBy = new mongoose.Types.ObjectId(currentUserId);
    await mapping.save();

    // Audit log
    await ActivityLog.create({
      userId: new mongoose.Types.ObjectId(currentUserId),
      action: 'DEACTIVATE_HIERARCHY_MAPPING',
      entityType: 'UserReportingHierarchy',
      entityId: mapping._id,
      details: {
        supervisorUserId: mapping.supervisorUserId,
        reporteeUserId: mapping.reporteeUserId,
        projectId: mapping.projectId,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    return res.json({
      success: true,
      message: 'Hierarchy mapping deactivated successfully',
      data: mapping,
    });
  } catch (error: any) {
    console.error('Error deactivating hierarchy mapping:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to deactivate hierarchy mapping',
      error: error.message,
    });
  }
};

/**
 * Update a hierarchy mapping
 * PUT /api/hierarchy/mapping/:id
 * Permission: HIERARCHY_MANAGE_TEAM
 */
export const updateHierarchyMapping = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { relationshipType, metadata } = req.body;
    const currentUserId = req.user?.userId;

    const mapping = await UserReportingHierarchy.findById(id);

    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: 'Hierarchy mapping not found',
      });
    }

    if (!mapping.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Cannot update inactive mapping',
      });
    }

    // Update allowed fields only
    if (relationshipType) {
      mapping.relationshipType = relationshipType;
    }

    if (metadata) {
      mapping.metadata = { ...mapping.metadata, ...metadata };
    }

    mapping.updatedBy = new mongoose.Types.ObjectId(currentUserId);
    await mapping.save();

    // Audit log
    await ActivityLog.create({
      userId: new mongoose.Types.ObjectId(currentUserId),
      action: 'UPDATE_HIERARCHY_MAPPING',
      entityType: 'UserReportingHierarchy',
      entityId: mapping._id,
      details: {
        changes: { relationshipType, metadata },
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    await mapping.populate([
      { path: 'supervisorUserId', select: 'firstName lastName email role' },
      { path: 'reporteeUserId', select: 'firstName lastName email role' },
      { path: 'projectId', select: 'name projectName' },
    ]);

    return res.json({
      success: true,
      message: 'Hierarchy mapping updated successfully',
      data: mapping,
    });
  } catch (error: any) {
    console.error('Error updating hierarchy mapping:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update hierarchy mapping',
      error: error.message,
    });
  }
};
