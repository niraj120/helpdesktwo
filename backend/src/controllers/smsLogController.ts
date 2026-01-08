import { Request, Response } from 'express';
import SMSLog from '../models/SMSLog';

/**
 * Get SMS logs with filtering and pagination
 */
export const getSMSLogs = async (req: Request, res: Response) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      triggerType,
      recipient,
      projectId,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const filter: any = {};

    if (status) filter.status = status;
    if (triggerType) filter.triggerType = triggerType;
    if (recipient) filter.recipient = { $regex: recipient, $options: 'i' };
    if (projectId) filter.projectId = projectId;

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate as string);
      if (endDate) filter.createdAt.$lte = new Date(endDate as string);
    }

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const sort: any = {};
    sort[sortBy as string] = sortOrder === 'asc' ? 1 : -1;

    const [logs, totalCount] = await Promise.all([
      SMSLog.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      SMSLog.countDocuments(filter)
    ]);

    return res.status(200).json({
      success: true,
      data: logs,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalCount / limitNum),
        totalItems: totalCount,
        itemsPerPage: limitNum
      }
    });
  } catch (error) {
    console.error('Error getting SMS logs:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get SMS logs',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get SMS statistics (status + trigger breakdown + daily counts)
 */
export const getSMSStatistics = async (req: Request, res: Response) => {
  try {
    const { projectId, startDate, endDate } = req.query;

    const dateFilter: any = {};
    if (startDate) dateFilter.$gte = new Date(startDate as string);
    if (endDate) dateFilter.$lte = new Date(endDate as string);

    const matchFilter: any = {};
    if (projectId) matchFilter.projectId = projectId;
    if (Object.keys(dateFilter).length) matchFilter.createdAt = dateFilter;

    const [statusStats, triggerStats, dailyStats, totalCount] = await Promise.all([
      SMSLog.aggregate([
        { $match: matchFilter },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      SMSLog.aggregate([
        { $match: matchFilter },
        {
          $group: {
            _id: '$triggerType',
            count: { $sum: 1 },
            sent: { $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] } },
            failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
            blocked: { $sum: { $cond: [{ $eq: ['$status', 'blocked'] }, 1, 0] } }
          }
        },
        { $sort: { count: -1 } }
      ]),
      SMSLog.aggregate([
        {
          $match: {
            ...matchFilter,
            createdAt: {
              $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
              ...(matchFilter.createdAt || {})
            }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            total: { $sum: 1 },
            sent: { $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] } },
            failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
            blocked: { $sum: { $cond: [{ $eq: ['$status', 'blocked'] }, 1, 0] } }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      SMSLog.countDocuments(matchFilter)
    ]);

    const statusBreakdown: Record<string, number> = {
      sent: 0,
      failed: 0,
      blocked: 0
    };
    statusStats.forEach((s: any) => {
      if (s._id) statusBreakdown[s._id] = s.count;
    });

    return res.status(200).json({
      success: true,
      data: {
        totalMessages: totalCount,
        statusBreakdown,
        triggerBreakdown: triggerStats,
        dailyStats
      }
    });
  } catch (error) {
    console.error('Error getting SMS statistics:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get SMS statistics',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get single SMS log by ID
 */
export const getSMSLogById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const log = await SMSLog.findById(id).lean();

    if (!log) {
      return res.status(404).json({ success: false, message: 'Log not found' });
    }

    return res.status(200).json({ success: true, data: log });
  } catch (error) {
    console.error('Error getting SMS log:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get SMS log',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
