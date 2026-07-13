import mongoose from 'mongoose';
import { Request, Response } from 'express';
import { Ticket } from '../models/Ticket';
import EmailProcessingQueue from '../models/EmailProcessingQueue';
import ProjectEmailConfig from '../models/ProjectEmailConfig';
import SystemSettings from '../models/SystemSettings';
import { emailPollingService } from '../services/emailPollingService';
import * as cron from 'node-cron';
import { CRON_PRESETS, describeCronExpression } from '../utils/cronHelpers';
import { getProjectScope } from '../utils/projectScope';

/**
 * Get recent ticket activity for real-time updates
 * Used by frontend polling to detect new tickets
 */
export const getRecentActivity = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { since, projectId } = req.query; // Timestamp of last check
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    // Default to last 5 minutes if no timestamp provided
    const sinceDate = since 
      ? new Date(since as string) 
      : new Date(Date.now() - 5 * 60 * 1000);

    console.log(`📊 Checking recent activity since: ${sinceDate.toISOString()}`);

    const scope = getProjectScope(req as any);
    const requestedProjectId =
      typeof projectId === 'string' && mongoose.Types.ObjectId.isValid(projectId)
        ? projectId
        : undefined;
    const allowedProjectIds = scope.all
      ? requestedProjectId
        ? [requestedProjectId]
        : []
      : requestedProjectId
        ? scope.projectIds.includes(requestedProjectId)
          ? [requestedProjectId]
          : []
        : scope.projectIds;

    if (!scope.all && allowedProjectIds.length === 0) {
      return res.json({
        success: true,
        data: {
          newTickets: [],
          stats: {
            newTicketsCount: 0,
            pendingEmails: 0,
            processingEmails: 0,
            failedEmails: 0
          },
          timestamp: new Date().toISOString()
        }
      });
    }

    const projectObjectIds = allowedProjectIds.map(
      (id) => new mongoose.Types.ObjectId(id)
    );
    const ticketProjectFilter =
      projectObjectIds.length > 0 ? { project: { $in: projectObjectIds } } : {};
    const emailConfigFilter =
      projectObjectIds.length > 0
        ? { projectId: { $in: projectObjectIds } }
        : {};
    const emailConfigIds = await ProjectEmailConfig.find(emailConfigFilter)
      .select('_id')
      .lean();
    const queueProjectFilter =
      emailConfigIds.length > 0
        ? { projectEmailConfigId: { $in: emailConfigIds.map((c: any) => c._id) } }
        : projectObjectIds.length > 0
          ? { projectEmailConfigId: { $in: [] } }
          : {};

    // Optimized: Parallel queries instead of sequential
    const [newTickets, emailStats] = await Promise.all([
      // Get new tickets created since last check
      Ticket.find({
        ...ticketProjectFilter,
        createdAt: { $gte: sinceDate },
        submissionSource: 'email' // Only email-created tickets for this notification
      })
      .select('ticketNumber subject createdAt sourceEmail priority status')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),
      
      // Single aggregation for all email queue stats
      EmailProcessingQueue.aggregate([
        {
          $facet: {
            pending: [
              { $match: { ...queueProjectFilter, status: 'pending', createdAt: { $gte: sinceDate } } },
              { $count: 'count' }
            ],
            failed: [
              { $match: { ...queueProjectFilter, status: 'failed', createdAt: { $gte: sinceDate } } },
              { $count: 'count' }
            ],
            processing: [
              { $match: { ...queueProjectFilter, status: 'processing' } },
              { $count: 'count' }
            ]
          }
        }
      ])
    ]);

    // Extract counts from aggregation result
    const pendingEmails = emailStats[0]?.pending[0]?.count || 0;
    const failedEmails = emailStats[0]?.failed[0]?.count || 0;
    const processingEmails = emailStats[0]?.processing[0]?.count || 0;

    console.log(`   ✅ Found: ${newTickets.length} new tickets, ${pendingEmails} pending emails`);

    return res.json({
      success: true,
      data: {
        newTickets: newTickets.map((t: any) => ({
          ticketNumber: t.ticketNumber,
          subject: t.subject,
          sourceEmail: t.sourceEmail,
          priority: t.priority,
          status: t.status,
          createdAt: t.createdAt
        })),
        stats: {
          newTicketsCount: newTickets.length,
          pendingEmails,
          processingEmails,
          failedEmails
        },
        timestamp: new Date().toISOString()
      }
    });
  } catch (error: any) {
    console.error('❌ Error fetching recent activity:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch recent activity',
      error: error.message
    });
  }
};

/**
 * Get email polling configuration
 */
export const getEmailPollingConfig = async (req: Request, res: Response) => {
  try {
    // Get current service status with actual interval from database
    const serviceStatus = emailPollingService.getStatus();
    
    // Optimized: Single query to fetch all settings at once
    const settings = await SystemSettings.find({
      key: { $in: ['email_polling_interval', 'email_processing_interval', 'frontend_polling_interval'] }
    }).lean();
    
    // Create a map for quick lookup
    const settingsMap = new Map(settings.map(s => [s.key, s.value]));
    
    const config = {
      pollingInterval: settingsMap.get('email_polling_interval') || process.env.EMAIL_POLLING_INTERVAL || '*/30 * * * * *',
      processingInterval: settingsMap.get('email_processing_interval') || process.env.EMAIL_PROCESSING_INTERVAL || '*/1 * * * *',
      frontendPollingInterval: settingsMap.get('frontend_polling_interval') || parseInt(process.env.FRONTEND_POLLING_INTERVAL || '30000'),
      maxEmailsPerFetch: serviceStatus.maxEmailsPerFetch,
      maxRetries: 3,
      serviceStatus: {
        isActive: serviceStatus.isActive,
        isRunning: serviceStatus.isRunning,
        currentInterval: serviceStatus.interval,
      }
    };

    res.json({
      success: true,
      data: config
    });
  } catch (error: any) {
    console.error('❌ Error fetching email config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch email configuration',
      error: error.message
    });
  }
};

/**
 * Update email polling configuration (admin only)
 */
export const updateEmailPollingConfig = async (req: Request, res: Response) => {
  try {
    const { frontendPollingInterval, pollingInterval, processingInterval } = req.body;
    const userId = (req as any).user?.userId;

    // Validate frontend polling interval
    if (frontendPollingInterval !== undefined) {
      if (typeof frontendPollingInterval !== 'number' || frontendPollingInterval < 10000 || frontendPollingInterval > 300000) {
        return res.status(400).json({
          success: false,
          message: 'Frontend polling interval must be a number between 10000-300000 ms (10-300 seconds)'
        });
      }
      
      await SystemSettings.findOneAndUpdate(
        { key: 'frontend_polling_interval' },
        {
          value: frontendPollingInterval,
          description: 'Frontend polling interval in milliseconds',
          updatedBy: userId,
        },
        { upsert: true, new: true }
      );
    }

    // Validate and update backend polling interval (cron expression)
    if (pollingInterval) {
      if (!cron.validate(pollingInterval)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid cron expression for polling interval. Examples: "*/30 * * * * *" (30 sec), "*/1 * * * *" (1 min)'
        });
      }

      // Update the polling interval dynamically
      await emailPollingService.updatePollingInterval(pollingInterval, userId);
      console.log(`✅ Polling interval updated to: ${pollingInterval}`);
    }

    // Validate and update processing interval
    if (processingInterval) {
      if (!cron.validate(processingInterval)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid cron expression for processing interval'
        });
      }

      await SystemSettings.findOneAndUpdate(
        { key: 'email_processing_interval' },
        {
          value: processingInterval,
          description: 'Email processing interval (cron expression)',
          updatedBy: userId,
        },
        { upsert: true, new: true }
      );
    }

    // Get updated status
    const serviceStatus = emailPollingService.getStatus();

    return res.json({
      success: true,
      message: 'Email polling configuration updated successfully',
      data: {
        frontendPollingInterval,
        pollingInterval,
        processingInterval,
        serviceStatus: {
          isActive: serviceStatus.isActive,
          currentInterval: serviceStatus.interval,
        }
      }
    });
  } catch (error: any) {
    console.error('❌ Error updating email config:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update email configuration',
      error: error.message
    });
  }
};

/**
 * Get available cron presets for polling intervals
 */
export const getCronPresets = async (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: {
        presets: CRON_PRESETS,
        examples: [
          {
            description: 'Every 30 seconds (recommended)',
            expression: '*/30 * * * * *',
            category: 'seconds'
          },
          {
            description: 'Every 1 minute',
            expression: '*/1 * * * *',
            category: 'minutes'
          },
          {
            description: 'Every 5 minutes',
            expression: '*/5 * * * *',
            category: 'minutes'
          }
        ],
        help: {
          format: 'Cron expressions: [seconds] [minutes] [hours] [day] [month] [weekday]',
          tip: 'For seconds-level polling, use 6-part expressions (e.g., "*/30 * * * * *")',
        }
      }
    });
  } catch (error: any) {
    console.error('❌ Error fetching cron presets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch cron presets',
      error: error.message
    });
  }
};
