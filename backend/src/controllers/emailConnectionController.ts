/**
 * Email Connection Health Controller (Task 8.2)
 * Manages SMTP connection testing and monitoring
 */

import { Request, Response } from 'express';
import EmailConfig from '../models/EmailConfig';
import {
  testSmtpConnection,
  updateConnectionStatus,
  getConnectionStats,
  resetConnectionStatus,
  retryFailedConnections
} from '../utils/connectionMonitor';
import { logApiError, ErrorContext } from '../utils/errorLogger';

/**
 * GET /api/email-config/connection-status
 * Get connection status for all configs
 */
export const getConnectionStatuses = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query;

    const query: any = {};
    if (projectId) {
      query.projectId = projectId;
    }

    const configs = await EmailConfig.find(query)
      .select('projectId enabled connectionStatus lastConnectionTest lastConnectionError lastSuccessfulConnection failedAttempts nextRetryAt fromEmail smtpHost')
      .populate('projectId', 'name')
      .sort({ updatedAt: -1 });

    // Get statistics
    const stats = await getConnectionStats(projectId as string | undefined);

    res.json({
      success: true,
      configs,
      stats
    });
  } catch (error: any) {
    console.error('Error fetching connection statuses:', error);
    await logApiError(error, req, { action: 'get_connection_statuses' });
    
    res.status(500).json({
      success: false,
      message: 'Failed to fetch connection statuses',
      error: error.message
    });
  }
};

/**
 * POST /api/email-config/:id/test-connection
 * Manually test SMTP connection for a config
 */
export const testConnection = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const emailConfig = await EmailConfig.findById(id);

    if (!emailConfig) {
      return res.status(404).json({
        success: false,
        message: 'Email configuration not found'
      });
    }

    console.log(`🔍 Manual connection test requested for project: ${emailConfig.projectId}`);

    const result = await testSmtpConnection(emailConfig);

    if (result.success) {
      await updateConnectionStatus(id, 'connected');
      
      return res.json({
        success: true,
        message: 'Connection test successful',
        status: 'connected',
        testedAt: new Date()
      });
    } else {
      await updateConnectionStatus(id, 'error', result.error);
      
      return res.status(400).json({
        success: false,
        message: 'Connection test failed',
        status: 'error',
        error: result.error,
        testedAt: new Date()
      });
    }
  } catch (error: any) {
    console.error('Error testing connection:', error);
    await logApiError(error, req, { action: 'test_connection', configId: req.params.id });
    
    res.status(500).json({
      success: false,
      message: 'Failed to test connection',
      error: error.message
    });
  }
};

/**
 * PATCH /api/email-config/:id/reset-retry
 * Reset retry counter and status for a config (admin action)
 */
export const resetRetry = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const emailConfig = await EmailConfig.findById(id);

    if (!emailConfig) {
      return res.status(404).json({
        success: false,
        message: 'Email configuration not found'
      });
    }

    console.log(`🔄 Resetting connection status for project: ${emailConfig.projectId}`);

    await resetConnectionStatus(id);

    return res.json({
      success: true,
      message: 'Connection status reset successfully',
      status: 'untested'
    });
  } catch (error: any) {
    console.error('Error resetting retry:', error);
    await logApiError(error, req, { action: 'reset_retry', configId: req.params.id });
    
    res.status(500).json({
      success: false,
      message: 'Failed to reset retry status',
      error: error.message
    });
  }
};

/**
 * POST /api/email-config/retry-all
 * Manually trigger retry for all failed connections (admin action)
 */
export const retryAll = async (req: Request, res: Response) => {
  try {
    console.log('🔄 Manual retry triggered for all failed connections');

    // Run retry in background
    retryFailedConnections().catch(error => {
      console.error('Background retry failed:', error);
    });

    return res.json({
      success: true,
      message: 'Retry process started in background'
    });
  } catch (error: any) {
    console.error('Error starting retry process:', error);
    await logApiError(error, req, { action: 'retry_all' });
    
    return res.status(500).json({
      success: false,
      message: 'Failed to start retry process',
      error: error.message
    });
  }
};

/**
 * GET /api/email-config/connection-stats
 * Get connection health statistics
 */
export const getStats = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query;

    const stats = await getConnectionStats(projectId as string | undefined);

    return res.json({
      success: true,
      stats
    });
  } catch (error: any) {
    console.error('Error fetching connection stats:', error);
    await logApiError(error, req, { action: 'get_connection_stats' });
    
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch connection statistics',
      error: error.message
    });
  }
};

/**
 * GET /api/email-config/:id/connection-details
 * Get detailed connection info for a specific config
 */
export const getConnectionDetails = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const emailConfig = await EmailConfig.findById(id)
      .select('projectId enabled connectionStatus lastConnectionTest lastConnectionError lastSuccessfulConnection failedAttempts nextRetryAt fromEmail smtpHost smtpPort smtpUser smtpSecure')
      .populate('projectId', 'name');

    if (!emailConfig) {
      return res.status(404).json({
        success: false,
        message: 'Email configuration not found'
      });
    }

    // Calculate time to next retry
    let minutesToRetry = null;
    if (emailConfig.nextRetryAt) {
      minutesToRetry = Math.max(0, Math.ceil((emailConfig.nextRetryAt.getTime() - Date.now()) / 60000));
    }

    return res.json({
      success: true,
      connection: {
        ...emailConfig.toObject(),
        minutesToRetry,
        canRetry: !emailConfig.nextRetryAt || minutesToRetry === 0
      }
    });
  } catch (error: any) {
    console.error('Error fetching connection details:', error);
    await logApiError(error, req, { action: 'get_connection_details', configId: req.params.id });
    
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch connection details',
      error: error.message
    });
  }
};

export default {
  getConnectionStatuses,
  testConnection,
  resetRetry,
  retryAll,
  getStats,
  getConnectionDetails
};
