import { Request, Response } from 'express';
import { Ticket } from '../models/Ticket';
import { User } from '../models/User';

export const getDashboardStatistics = async (req: Request, res: Response) => {
  try {
    const { timeRange = '7days' } = req.query;
    
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

    // Get total tickets
    const totalTickets = await Ticket.countDocuments({
      createdAt: { $gte: startDate },
    });

    // Get tickets by status
    const ticketsByStatus = await Ticket.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
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
      { $match: { createdAt: { $gte: startDate } } },
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
      { $match: { createdAt: { $gte: startDate } } },
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

    // Get status counts (using numeric codes: 1=Open, 2=In Progress, 3=On Hold, 4=Resolved, 5=Closed)
    const openTickets = ticketsByStatus.find(s => s.status === 1)?.count || 0;
    const resolvedTickets = ticketsByStatus.find(s => s.status === 4)?.count || 0;
    const pendingTickets = ticketsByStatus.find(s => s.status === 2 || s.status === 3)?.count || 0; // In Progress or On Hold

    // Calculate average response time (mock for now - will need actual implementation)
    const averageResponseTime = 2.5; // hours

    // Calculate SLA compliance (mock for now)
    const slaCompliance = 95; // percentage

    // Get recent activity
    const recentActivity = await Ticket.find({
      createdAt: { $gte: startDate },
    })
      .sort({ updatedAt: -1 })
      .limit(10)
      .select('ticketNumber status createdBy updatedAt')
      .populate('createdBy', 'name')
      .lean();

    const formattedActivity = recentActivity.map(ticket => ({
      _id: ticket._id,
      action: 'updated',
      ticketNumber: ticket.ticketNumber,
      user: (ticket.createdBy as any)?.name || 'Unknown',
      timestamp: ticket.updatedAt,
    }));

    res.json({
      success: true,
      data: {
        totalTickets,
        openTickets,
        resolvedTickets,
        pendingTickets,
        averageResponseTime,
        slaCompliance,
        ticketsByStatus,
        ticketsByPriority,
        ticketsByCategory,
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
