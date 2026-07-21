import { Request, Response } from 'express';
import EscalationPolicy from '../../models/sla-module/EscalationPolicy';
import { User } from '../../models/User';

// Get all escalation policies
export const getAllEscalationPolicies = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId, isActive } = req.query;
    const filter: any = {};

    if (projectId) {
      // Check both projectId and projectIds array
      filter.$or = [
        { projectId: projectId },
        { projectIds: { $in: [projectId] } }
      ];
    }
    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }

    console.log('🔍 Fetching escalation policies with filter:', JSON.stringify(filter));

    const policies = await EscalationPolicy.find(filter)
      .populate('projectId', 'name code')
      .populate('projectIds', 'name code')
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .lean();

    console.log(`✅ Found ${policies.length} escalation policies`);

    // Optimized: Batch fetch all users by roles and specific user IDs
    // Collect all role IDs and user IDs from all policies
    const roleIds = new Set<string>();
    const userIds = new Set<string>();
    
    policies.forEach((policy: any) => {
      policy.levels?.forEach((level: any) => {
        if (level.escalateTo?.type === 'role' && level.escalateTo?.targetId) {
          roleIds.add(level.escalateTo.targetId.toString());
        } else if (level.escalateTo?.type === 'user' && level.escalateTo?.targetId) {
          userIds.add(level.escalateTo.targetId.toString());
        }
      });
    });
    
    // Batch fetch users by role and specific users
    const [usersByRole, specificUsers] = await Promise.all([
      roleIds.size > 0 
        ? User.find({
            role: { $in: Array.from(roleIds) },
            isActive: true,
            ...(projectId && { projects: { $in: [projectId] } })
          })
          .populate('role', 'name code')
          .select('firstName lastName email role')
          .lean()
        : Promise.resolve([]),
      userIds.size > 0
        ? User.find({ _id: { $in: Array.from(userIds) } })
          .populate('role', 'name code')
          .select('firstName lastName email role')
          .lean()
        : Promise.resolve([])
    ]);
    
    // Create maps for quick lookup
    const usersByRoleMap = new Map<string, any[]>();
    usersByRole.forEach((user: any) => {
      const roleId = user.role?._id?.toString() || user.role?.toString();
      if (roleId) {
        if (!usersByRoleMap.has(roleId)) {
          usersByRoleMap.set(roleId, []);
        }
        usersByRoleMap.get(roleId)!.push(user);
      }
    });
    
    const specificUsersMap = new Map(
      specificUsers.map((user: any) => [user._id.toString(), user])
    );
    
    // Enrich policies with pre-fetched user data
    const enrichedPolicies = policies.map((policy: any) => {
      if (policy.levels && policy.levels.length > 0) {
        policy.levels = policy.levels.map((level: any) => {
          if (level.escalateTo?.type === 'role' && level.escalateTo?.targetId) {
            level.users = usersByRoleMap.get(level.escalateTo.targetId.toString()) || [];
          } else if (level.escalateTo?.type === 'user' && level.escalateTo?.targetId) {
            const user = specificUsersMap.get(level.escalateTo.targetId.toString());
            level.users = user ? [user] : [];
          }
          return level;
        });
      }
      return policy;
    });

    res.status(200).json({
      success: true,
      data: enrichedPolicies,
    });
  } catch (error: any) {
    console.error('Error fetching escalation policies:', error);
    res.status(200).json({
      success: false,
      message: 'Failed to fetch escalation policies',
      error: error.message,
    });
  }
};

// Get single escalation policy
export const getEscalationPolicyById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const policy = await EscalationPolicy.findById(id)
      .populate('projectId', 'name code')
      .populate('projectIds', 'name code')
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email');

    if (!policy) {
      res.status(404).json({
        success: false,
        message: 'Escalation policy not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: policy,
    });
  } catch (error: any) {
    console.error('Error fetching escalation policy:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch escalation policy',
      error: error.message,
    });
  }
};

// Create escalation policy
export const createEscalationPolicy = async (req: Request, res: Response): Promise<void> => {
  try {
    const policyData = {
      ...req.body,
      createdBy: (req as any).user?.userId,
    };

    const policy = new EscalationPolicy(policyData);
    await policy.save();

    const populatedPolicy = await EscalationPolicy.findById(policy._id)
      .populate('projectId', 'name code')
      .populate('projectIds', 'name code')
      .populate('createdBy', 'firstName lastName email');
    

    res.status(201).json({
      success: true,
      message: 'Escalation policy created successfully',
      data: populatedPolicy,
    });
  } catch (error: any) {
    console.error('Error creating escalation policy:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create escalation policy',
      error: error.message,
    });
  }
};

// Update escalation policy
export const updateEscalationPolicy = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    // Remove createdBy from request body to prevent overwriting
    const { createdBy, ...bodyData } = req.body;
    const updateData = {
      ...bodyData,
      updatedBy: (req as any).user?.userId,
    };

    const policy = await EscalationPolicy.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('projectId', 'name code')
      .populate('projectIds', 'name code')
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email');

    if (!policy) {
      res.status(404).json({
        success: false,
        message: 'Escalation policy not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Escalation policy updated successfully',
      data: policy,
    });
  } catch (error: any) {
    console.error('Error updating escalation policy:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update escalation policy',
      error: error.message,
    });
  }
};

// Delete escalation policy
export const deleteEscalationPolicy = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const policy = await EscalationPolicy.findByIdAndDelete(id);

    if (!policy) {
      res.status(404).json({
        success: false,
        message: 'Escalation policy not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Escalation policy deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting escalation policy:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete escalation policy',
      error: error.message,
    });
  }
};

// Toggle escalation policy status
export const toggleEscalationPolicyStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const policy = await EscalationPolicy.findById(id);

    if (!policy) {
      res.status(404).json({
        success: false,
        message: 'Escalation policy not found',
      });
      return;
    }

    policy.isActive = !policy.isActive;
    policy.updatedBy = (req as any).user?.userId;
    await policy.save();

    res.status(200).json({
      success: true,
      message: `Escalation policy ${policy.isActive ? 'activated' : 'deactivated'} successfully`,
      data: policy,
    });
  } catch (error: any) {
    console.error('Error toggling escalation policy status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle escalation policy status',
      error: error.message,
    });
  }
};
