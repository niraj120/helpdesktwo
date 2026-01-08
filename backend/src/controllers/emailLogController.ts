import { Request, Response } from 'express';
import EmailLog from '../models/EmailLog';
import EmailConfig from '../models/EmailConfig';

/**
 * Get all email logs with filtering and pagination
 */
export const getEmailLogs = async (req: Request, res: Response) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      status, 
      type, 
      recipient,
      projectId,
      startDate,
      endDate
    } = req.query;

    // Build filter query
    const filter: any = {};
    
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (recipient) filter.recipient = { $regex: recipient, $options: 'i' };
    if (projectId) filter.projectId = projectId;
    
    if (startDate || endDate) {
      filter.sentAt = {};
      if (startDate) filter.sentAt.$gte = new Date(startDate as string);
      if (endDate) filter.sentAt.$lte = new Date(endDate as string);
    }

    // Get total count
    const total = await EmailLog.countDocuments(filter);

    // Get logs with pagination
    const logs = await EmailLog.find(filter)
      .sort({ sentAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .populate('projectId', 'name code')
      .lean();

    // Get statistics
    const stats = await EmailLog.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const statistics = {
      total,
      sent: stats.find(s => s._id === 'sent')?.count || 0,
      failed: stats.find(s => s._id === 'failed')?.count || 0,
      blocked: stats.find(s => s._id === 'blocked')?.count || 0,
      simulated: stats.find(s => s._id === 'simulated')?.count || 0
    };

    return res.status(200).json({
      success: true,
      data: {
        logs,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        },
        statistics
      }
    });
  } catch (error) {
    console.error('Get email logs error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch email logs',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get blocked email recipients
 */
export const getBlockedRecipients = async (req: Request, res: Response) => {
  try {
    // Get failed email logs grouped by recipient
    const failedEmails = await EmailLog.aggregate([
      {
        $match: {
          status: 'blocked'
        }
      },
      {
        $group: {
          _id: {
            recipient: '$recipient',
            projectId: '$projectId'
          },
          count: { $sum: 1 },
          lastBlocked: { $max: '$sentAt' },
          projectName: { $first: '$projectName' }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    const blockedRecipients = failedEmails.map(item => ({
      email: item._id.recipient,
      projectId: item._id.projectId,
      projectName: item.projectName,
      blockCount: item.count,
      lastBlocked: item.lastBlocked
    }));

    return res.status(200).json({
      success: true,
      data: blockedRecipients
    });
  } catch (error) {
    console.error('Get blocked recipients error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch blocked recipients',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get email statistics by type
 */
export const getEmailStatistics = async (req: Request, res: Response) => {
  try {
    const { projectId, days = 30 } = req.query;

    const filter: any = {
      sentAt: {
        $gte: new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000)
      }
    };

    if (projectId) filter.projectId = projectId;

    // Get statistics by type
    const typeStats = await EmailLog.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$type',
          total: { $sum: 1 },
          sent: {
            $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] }
          },
          failed: {
            $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
          },
          blocked: {
            $sum: { $cond: [{ $eq: ['$status', 'blocked'] }, 1, 0] }
          },
          simulated: {
            $sum: { $cond: [{ $eq: ['$status', 'simulated'] }, 1, 0] }
          }
        }
      }
    ]);

    // Get daily statistics for chart
    const dailyStats = await EmailLog.aggregate([
      { $match: filter },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$sentAt' } },
            status: '$status'
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.date': 1 } }
    ]);

    // Format daily stats
    const formattedDailyStats = dailyStats.reduce((acc: any, item: any) => {
      const date = item._id.date;
      if (!acc[date]) {
        acc[date] = { date, sent: 0, failed: 0, blocked: 0, simulated: 0 };
      }
      acc[date][item._id.status] = item.count;
      return acc;
    }, {});

    return res.status(200).json({
      success: true,
      data: {
        byType: typeStats,
        daily: Object.values(formattedDailyStats)
      }
    });
  } catch (error) {
    console.error('Get email statistics error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch email statistics',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Retry failed email
 */
export const retryFailedEmail = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const emailLog = await EmailLog.findById(id);
    if (!emailLog) {
      return res.status(404).json({
        success: false,
        message: 'Email log not found'
      });
    }

    if (emailLog.status !== 'failed') {
      return res.status(400).json({
        success: false,
        message: 'Can only retry failed emails'
      });
    }

    // TODO: Implement retry logic by calling appropriate email service function

    return res.status(200).json({
      success: true,
      message: 'Email retry initiated (not yet implemented)'
    });
  } catch (error) {
    console.error('Retry email error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retry email',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
