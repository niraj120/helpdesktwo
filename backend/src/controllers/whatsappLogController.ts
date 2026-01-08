import { Request, Response } from 'express';
import WhatsAppLog from '../models/WhatsAppLog';

/**
 * Get WhatsApp logs with filtering and pagination
 */
export const getWhatsAppLogs = async (req: Request, res: Response) => {
    try {
        const {
            page = 1,
            limit = 20,
            status,
            templateName,
            triggerName,
            recipient,
            projectId,
            startDate,
            endDate,
            sortBy = 'sentAt',
            sortOrder = 'desc'
        } = req.query;

        // Build filter query
        const filter: any = {};

        if (status) {
            filter.status = status;
        }

        if (templateName) {
            filter.templateName = { $regex: templateName, $options: 'i' };
        }

        if (triggerName) {
            filter.triggerName = triggerName;
        }

        if (recipient) {
            filter.recipient = { $regex: recipient, $options: 'i' };
        }

        if (projectId) {
            filter.projectId = projectId;
        }

        // Date range filter
        if (startDate || endDate) {
            filter.sentAt = {};
            if (startDate) {
                filter.sentAt.$gte = new Date(startDate as string);
            }
            if (endDate) {
                filter.sentAt.$lte = new Date(endDate as string);
            }
        }

        // Calculate pagination
        const pageNum = parseInt(page as string, 10);
        const limitNum = parseInt(limit as string, 10);
        const skip = (pageNum - 1) * limitNum;

        // Build sort
        const sort: any = {};
        sort[sortBy as string] = sortOrder === 'asc' ? 1 : -1;

        // Execute query
        const [logs, totalCount] = await Promise.all([
            WhatsAppLog.find(filter)
                .sort(sort)
                .skip(skip)
                .limit(limitNum)
                .lean(),
            WhatsAppLog.countDocuments(filter)
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
        console.error('Error getting WhatsApp logs:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to get WhatsApp logs',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};

/**
 * Get WhatsApp log statistics
 */
export const getWhatsAppStatistics = async (req: Request, res: Response) => {
    try {
        const { projectId, startDate, endDate } = req.query;

        // Build date filter
        const dateFilter: any = {};
        if (startDate) {
            dateFilter.$gte = new Date(startDate as string);
        }
        if (endDate) {
            dateFilter.$lte = new Date(endDate as string);
        }

        const matchFilter: any = {};
        if (projectId) {
            matchFilter.projectId = projectId;
        }
        if (Object.keys(dateFilter).length > 0) {
            matchFilter.sentAt = dateFilter;
        }

        // Aggregate statistics
        const [statusStats, triggerStats, dailyStats, totalCount] = await Promise.all([
            // Status breakdown
            WhatsAppLog.aggregate([
                { $match: matchFilter },
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 }
                    }
                }
            ]),

            // Trigger breakdown
            WhatsAppLog.aggregate([
                { $match: matchFilter },
                {
                    $group: {
                        _id: '$triggerName',
                        count: { $sum: 1 },
                        sent: {
                            $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] }
                        },
                        failed: {
                            $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
                        }
                    }
                },
                { $sort: { count: -1 } }
            ]),

            // Daily stats (last 30 days)
            WhatsAppLog.aggregate([
                {
                    $match: {
                        ...matchFilter,
                        sentAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
                    }
                },
                {
                    $group: {
                        _id: {
                            $dateToString: { format: '%Y-%m-%d', date: '$sentAt' }
                        },
                        total: { $sum: 1 },
                        sent: {
                            $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] }
                        },
                        failed: {
                            $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
                        },
                        simulated: {
                            $sum: { $cond: [{ $eq: ['$status', 'simulated'] }, 1, 0] }
                        }
                    }
                },
                { $sort: { _id: 1 } }
            ]),

            // Total count
            WhatsAppLog.countDocuments(matchFilter)
        ]);

        // Transform status stats to object
        const statusBreakdown: Record<string, number> = {
            sent: 0,
            failed: 0,
            blocked: 0,
            simulated: 0,
            delivered: 0,
            read: 0
        };

        statusStats.forEach((stat: any) => {
            if (stat._id) {
                statusBreakdown[stat._id] = stat.count;
            }
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
        console.error('Error getting WhatsApp statistics:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to get WhatsApp statistics',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};

/**
 * Get a single WhatsApp log by ID
 */
export const getWhatsAppLogById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const log = await WhatsAppLog.findById(id).lean();

        if (!log) {
            return res.status(404).json({
                success: false,
                message: 'Log not found'
            });
        }

        return res.status(200).json({
            success: true,
            data: log
        });
    } catch (error) {
        console.error('Error getting WhatsApp log:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to get WhatsApp log',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};

/**
 * Get blocked/failed recipients
 */
export const getBlockedRecipients = async (req: Request, res: Response) => {
    try {
        const { projectId } = req.query;

        const matchFilter: any = {
            status: { $in: ['failed', 'blocked'] }
        };

        if (projectId) {
            matchFilter.projectId = projectId;
        }

        const blockedRecipients = await WhatsAppLog.aggregate([
            { $match: matchFilter },
            {
                $group: {
                    _id: '$recipient',
                    failureCount: { $sum: 1 },
                    lastError: { $last: '$error' },
                    lastAttempt: { $max: '$sentAt' }
                }
            },
            { $sort: { failureCount: -1 } },
            { $limit: 100 }
        ]);

        return res.status(200).json({
            success: true,
            data: blockedRecipients
        });
    } catch (error) {
        console.error('Error getting blocked recipients:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to get blocked recipients',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};

export default {
    getWhatsAppLogs,
    getWhatsAppStatistics,
    getWhatsAppLogById,
    getBlockedRecipients,
};
