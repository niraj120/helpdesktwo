import { Request, Response } from 'express';
import { Ticket } from '../models/Ticket';
import { User } from '../models/User';
import { AuthRequest } from '../middleware/auth';
import mongoose from 'mongoose';

/**
 * Get Dashboard Statistics
 * Supports both single project and unified view modes
 * Query params:
 * - timeRange: '7days' | '30days' | '90days' | 'all'
 * - viewMode: 'single' | 'unified'
 * - projectId: specific project (required for single mode)
 */
export const getDashboardStatistics = async (req: AuthRequest, res: Response) => {
  try {
    const { timeRange = '7days' } = req.query;
    const projectContext = req.projectContext;
    
    // Calculate date range
    const now = new Date();
    let startDate = new Date();
    
    switch (timeRange) {
      case '7days':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30days':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90days':
        startDate.setDate(now.getDate() - 90);
        break;
      case 'all':
        startDate = new Date(0); // Beginning of time
        break;
      default:
        startDate.setDate(now.getDate() - 7);
    }

    // Build base query with date filter
    const baseQuery: any = {
      createdAt: { $gte: startDate },
    };

    // Add project filter based on context
    if (projectContext) {
      if (projectContext.viewMode === 'single' && projectContext.currentProjectId) {
        // Single project mode - filter by specific project
        baseQuery['metadata.projectId'] = new mongoose.Types.ObjectId(projectContext.currentProjectId);
      } else if (projectContext.viewMode === 'unified' && !projectContext.isAdmin) {
        // Unified mode for non-admin - filter by accessible projects
        if (projectContext.accessibleProjectIds.length > 0) {
          baseQuery['metadata.projectId'] = {
            $in: projectContext.accessibleProjectIds.map(id => new mongoose.Types.ObjectId(id))
          };
        }
      }
      // If admin in unified mode, no project filter (see all)
    }

    console.log(`📊 [DASHBOARD] Query filter:`, JSON.stringify(baseQuery));

    // Get total tickets
    const totalTickets = await Ticket.countDocuments(baseQuery);

    // Get tickets by status
    const ticketsByStatus = await Ticket.aggregate([
      { $match: baseQuery },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          status: '$_id',
          count: 1,
        },
      },
    ]);

    // Get tickets by priority
    const ticketsByPriority = await Ticket.aggregate([
      { $match: baseQuery },
      {
        $group: {
          _id: '$priority',
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          priority: '$_id',
          count: 1,
        },
      },
    ]);

    // Get tickets by category
    const ticketsByCategory = await Ticket.aggregate([
      { $match: baseQuery },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          category: '$_id',
          count: 1,
        },
      },
      { $limit: 10 },
    ]);

    // Get tickets by project (for unified view)
    let ticketsByProject = [];
    if (projectContext?.viewMode === 'unified') {
      ticketsByProject = await Ticket.aggregate([
        { $match: baseQuery },
        {
          $group: {
            _id: '$metadata.projectId',
            count: { $sum: 1 },
          },
        },
        {
          $lookup: {
            from: 'projects',
            localField: '_id',
            foreignField: '_id',
            as: 'projectDetails',
          },
        },
        {
          $unwind: {
            path: '$projectDetails',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            _id: 0,
            projectId: '$_id',
            projectName: '$projectDetails.name',
            count: 1,
          },
        },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]);
    }

    // Get status counts (using numeric codes: 1=Open, 2=In Progress, 3=On Hold, 4=Resolved, 5=Closed)
    const openTickets = ticketsByStatus.find(s => s.status === 1)?.count || 0;
    const resolvedTickets = ticketsByStatus.find(s => s.status === 4)?.count || 0;
    const pendingTickets = ticketsByStatus.find(s => s.status === 2 || s.status === 3)?.count || 0; // In Progress or On Hold

    // Calculate average response time (mock for now - will need actual implementation)
    const averageResponseTime = 2.5; // hours

    // Calculate SLA compliance (mock for now)
    const slaCompliance = 95; // percentage

    // Get recent activity
    const recentActivity = await Ticket.find(baseQuery)
      .sort({ updatedAt: -1 })
      .limit(10)
      .select('ticketNumber status createdBy updatedAt metadata')
      .populate('createdBy', 'name')
      .populate('metadata.projectId', 'name')
      .lean();

    const formattedActivity = recentActivity.map(ticket => ({
      _id: ticket._id,
      action: 'updated',
      ticketNumber: ticket.ticketNumber,
      user: (ticket.createdBy as any)?.name || 'Unknown',
      projectName: (ticket.metadata as any)?.projectId?.name || 'Unknown',
      timestamp: ticket.updatedAt,
    }));

    res.json({
      success: true,
      data: {
        viewMode: projectContext?.viewMode || 'single',
        totalTickets,
        openTickets,
        resolvedTickets,
        pendingTickets,
        averageResponseTime,
        slaCompliance,
        ticketsByStatus,
        ticketsByPriority,
        ticketsByCategory,
        ticketsByProject, // Only populated in unified mode
        recentActivity: formattedActivity,
      },
    });
  } catch (error: any) {
    console.error('Error fetching dashboard statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard statistics',
    });
  }
};

export const exportDashboardData = async (req: Request, res: Response) => {
  try {
    const { timeRange = '7days' } = req.body;
    
    // This would generate an Excel file with dashboard data
    // For now, return a success message
    // TODO: Implement Excel generation using a library like 'exceljs'
    
    res.json({
      success: true,
      message: 'Export functionality to be implemented',
    });
  } catch (error: any) {
    console.error('Error exporting dashboard data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export dashboard data',
    });
  }
};
