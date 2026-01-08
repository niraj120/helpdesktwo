import { Request, Response } from 'express';
import EscalationPolicy from '../../models/sla-module/EscalationPolicy';
import { User } from '../../models/User';
import { logActivity } from '../../utils/logger';

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
      .sort({ createdAt: -1 });

    console.log(`✅ Found ${policies.length} escalation policies`);

    // For each policy, populate the users based on role/user in escalateTo
    const enrichedPolicies = await Promise.all(
      policies.map(async (policy) => {
        const policyObj = policy.toObject();
        
        // Enrich each level with actual user information
        if (policyObj.levels && policyObj.levels.length > 0) {
          policyObj.levels = await Promise.all(
            policyObj.levels.map(async (level: any) => {
              if (level.escalateTo?.type === 'role' && level.escalateTo?.targetId) {
                // Find users with this role in the specified project
                const users = await User.find({
                  role: level.escalateTo.targetId,
                  isActive: true,
                  ...(projectId && { projects: { $in: [projectId] } })
                })
                  .populate('role', 'name code')
                  .select('firstName lastName email role')
                  .lean();
                
                // Attach users to this level
                level.users = users;
              } else if (level.escalateTo?.type === 'user' && level.escalateTo?.targetId) {
                // Fetch specific user
                const user = await User.findById(level.escalateTo.targetId)
                  .populate('role', 'name code')
                  .select('firstName lastName email role')
                  .lean();
                
                if (user) {
                  level.users = [user];
                }
              }
              
              return level;
            })
          );
        }
        
        return policyObj;
      })
    );

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
    
    // Log activity
    try {
      const currentUser = (req as any).user;
      if (currentUser) {
        const projectNames = (populatedPolicy as any)?.projectIds?.map((p: any) => p.name).join(', ') || 
                            (populatedPolicy as any)?.projectId?.name || 'No projects';
        const projectId = (populatedPolicy as any)?.projectIds?.[0]?._id || 
                         (populatedPolicy as any)?.projectIds?.[0] || 
                         (populatedPolicy as any)?.projectId?._id || 
                         (populatedPolicy as any)?.projectId;
        
        await logActivity({
          userId: currentUser.userId,
          userName: `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim(),
          userEmail: currentUser.email,
          action: 'create',
          entity: 'escalation-policy',
          entityId: policy._id.toString(),
          entityName: policy.name,
          projectId: projectId?.toString(),
          projectName: projectNames,
          description: `Escalation policy ${policy.name} created`,
          req,
          metadata: { levels: policy.levels.length, isActive: policy.isActive }
        });
      }
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

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
