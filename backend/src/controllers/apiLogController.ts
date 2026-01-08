import { Request, Response } from 'express';
import APILog from '../models/APILog';

/**
 * Get API logs with filtering and pagination
 */
export const getAPILogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      status,
      apiType,
      endpoint,
      startDate,
      endDate,
      page = 1,
      limit = 50,
    } = req.query;

    const filter: any = {};

    // Filter by status
    if (status) {
      filter.status = status;
    }

    // Filter by API type
    if (apiType) {
      filter.apiType = apiType;
    }

    // Filter by endpoint (partial match)
    if (endpoint) {
      filter.endpoint = { $regex: endpoint, $options: 'i' };
    }

    // Filter by date range
    if (startDate || endDate) {
      filter.sentAt = {};
      if (startDate) {
        filter.sentAt.$gte = new Date(startDate as string);
      }
      if (endDate) {
        filter.sentAt.$lte = new Date(endDate as string);
      }
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [logs, total] = await Promise.all([
      APILog.find(filter)
        .sort({ sentAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      APILog.countDocuments(filter),
    ]);

    res.status(200).json({
      logs,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error: any) {
    console.error('Error fetching API logs:', error);
    res.status(500).json({ message: 'Failed to fetch API logs', error: error.message });
  }
};

/**
 * Get failed API calls (status: failed or timeout)
 */
export const getFailedAPIs = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      apiType,
      startDate,
      endDate,
      page = 1,
      limit = 50,
    } = req.query;

    const filter: any = {
      status: { $in: ['failed', 'timeout'] },
    };

    if (apiType) {
      filter.apiType = apiType;
    }

    if (startDate || endDate) {
      filter.sentAt = {};
      if (startDate) {
        filter.sentAt.$gte = new Date(startDate as string);
      }
      if (endDate) {
        filter.sentAt.$lte = new Date(endDate as string);
      }
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [logs, total] = await Promise.all([
      APILog.find(filter)
        .sort({ sentAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      APILog.countDocuments(filter),
    ]);

    res.status(200).json({
      logs,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error: any) {
    console.error('Error fetching failed API logs:', error);
    res.status(500).json({ message: 'Failed to fetch failed API logs', error: error.message });
  }
};

/**
 * Get API statistics
 */
export const getAPIStatistics = async (req: Request, res: Response): Promise<void> => {
  try {
    const { startDate, endDate } = req.query;

    const filter: any = {};
    if (startDate || endDate) {
      filter.sentAt = {};
      if (startDate) {
        filter.sentAt.$gte = new Date(startDate as string);
      }
      if (endDate) {
        filter.sentAt.$lte = new Date(endDate as string);
      }
    }

    // Get counts by status
    const statusStats = await APILog.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    // Get counts by API type
    const typeStats = await APILog.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$apiType',
          count: { $sum: 1 },
          failures: {
            $sum: {
              $cond: [
                { $in: ['$status', ['failed', 'timeout']] },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

    // Get daily trends for the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const dailyTrends = await APILog.aggregate([
      {
        $match: {
          sentAt: { $gte: sevenDaysAgo },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$sentAt' },
          },
          total: { $sum: 1 },
          success: {
            $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] },
          },
          failed: {
            $sum: { $cond: [{ $in: ['$status', ['failed', 'timeout']] }, 1, 0] },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Calculate total counts
    const total = await APILog.countDocuments(filter);

    res.status(200).json({
      total,
      byStatus: statusStats.reduce((acc: any, stat: any) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {}),
      byType: typeStats,
      dailyTrends,
    });
  } catch (error: any) {
    console.error('Error fetching API statistics:', error);
    res.status(500).json({ message: 'Failed to fetch API statistics', error: error.message });
  }
};

/**
 * Retry a failed API call (placeholder - implement based on specific API needs)
 */
export const retryFailedAPI = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const apiLog = await APILog.findById(id);
    if (!apiLog) {
      res.status(404).json({ message: 'API log not found' });
      return;
    }

    // TODO: Implement retry logic based on apiType
    // This would involve calling the original API again with the stored request data

    res.status(200).json({
      message: 'Retry functionality to be implemented based on specific API requirements',
      apiLog,
    });
  } catch (error: any) {
    console.error('Error retrying API call:', error);
    res.status(500).json({ message: 'Failed to retry API call', error: error.message });
  }
};
