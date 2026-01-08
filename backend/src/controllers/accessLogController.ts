import { Request, Response } from 'express';
import AccessLog from '../models/AccessLog';
import { AuthRequest } from '../middleware/auth';

// Get all access logs with filtering and pagination
export const getAllAccessLogs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      userId, 
      action, 
      success, 
      startDate, 
      endDate,
      search 
    } = req.query;

    const filter: any = {};

    // Apply filters
    if (userId) {
      filter.userId = userId;
    }
    if (action) {
      filter.action = action;
    }
    if (success !== undefined) {
      filter.success = success === 'true';
    }
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) {
        filter.timestamp.$gte = new Date(startDate as string);
      }
      if (endDate) {
        filter.timestamp.$lte = new Date(endDate as string);
      }
    }
    if (search) {
      filter.$or = [
        { userName: { $regex: search, $options: 'i' } },
        { userEmail: { $regex: search, $options: 'i' } },
        { projectName: { $regex: search, $options: 'i' } },
        { ipAddress: { $regex: search, $options: 'i' } }
      ];
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const [logs, total] = await Promise.all([
      AccessLog.find(filter)
        .populate('userId', 'firstName lastName email')
        .populate('project', 'name code')
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      AccessLog.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      data: logs,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error: any) {
    console.error('Error fetching access logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch access logs',
      error: error.message
    });
  }
};

// Get single access log by ID
export const getAccessLogById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const log = await AccessLog.findById(id)
      .populate('userId', 'firstName lastName email')
      .populate('project', 'name code');

    if (!log) {
      res.status(404).json({
        success: false,
        message: 'Access log not found'
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: log
    });
  } catch (error: any) {
    console.error('Error fetching access log:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch access log',
      error: error.message
    });
  }
};

// Create access log (typically called during login/logout)
export const createAccessLog = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const logData = {
      ...req.body,
      timestamp: new Date()
    };

    const log = new AccessLog(logData);
    await log.save();

    res.status(201).json({
      success: true,
      message: 'Access log created successfully',
      data: log
    });
  } catch (error: any) {
    console.error('Error creating access log:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create access log',
      error: error.message
    });
  }
};

// Get access log statistics
export const getAccessStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { startDate, endDate } = req.query;
    
    const dateFilter: any = {};
    if (startDate || endDate) {
      dateFilter.timestamp = {};
      if (startDate) {
        dateFilter.timestamp.$gte = new Date(startDate as string);
      }
      if (endDate) {
        dateFilter.timestamp.$lte = new Date(endDate as string);
      }
    }

    const [loginStats, failureStats, totalLogs] = await Promise.all([
      AccessLog.aggregate([
        { $match: { ...dateFilter, action: 'login' } },
        { $group: { _id: '$success', count: { $sum: 1 } } }
      ]),
      AccessLog.aggregate([
        { $match: { ...dateFilter, success: false } },
        { $group: { _id: '$failureReason', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      AccessLog.countDocuments(dateFilter)
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalLogs,
        loginStats,
        failureStats
      }
    });
  } catch (error: any) {
    console.error('Error fetching access stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch access statistics',
      error: error.message
    });
  }
};

// Export access logs (returns data for download)
export const exportAccessLogs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId, action, success, startDate, endDate } = req.query;
    
    const filter: any = {};
    if (userId) filter.userId = userId;
    if (action) filter.action = action;
    if (success !== undefined) filter.success = success === 'true';
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) filter.timestamp.$gte = new Date(startDate as string);
      if (endDate) filter.timestamp.$lte = new Date(endDate as string);
    }

    const logs = await AccessLog.find(filter)
      .populate('userId', 'firstName lastName email')
      .populate('project', 'name code')
      .sort({ timestamp: -1 })
      .limit(10000) // Limit export to 10k records
      .lean();

    res.status(200).json({
      success: true,
      data: logs,
      count: logs.length
    });
  } catch (error: any) {
    console.error('Error exporting access logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export access logs',
      error: error.message
    });
  }
};
