/**
 * Email Connection Health Monitor (Task 8.2)
 * Monitors SMTP connection health and handles failures gracefully
 */

import nodemailer from 'nodemailer';
import EmailConfig from '../models/EmailConfig';
import { logEmailError, ErrorContext, ErrorSeverity, logError } from './errorLogger';
import { decrypt, isEncrypted } from './encryption';

// Retry configuration
const RETRY_CONFIG = {
  maxAttempts: 5,
  baseDelayMs: 5 * 60 * 1000, // 5 minutes
  maxDelayMs: 60 * 60 * 1000, // 1 hour
  backoffMultiplier: 2
};

/**
 * Test SMTP connection for an email config
 * 
 * @param emailConfig - Email configuration to test
 * @returns Promise<boolean> - True if connection successful
 */
export async function testSmtpConnection(emailConfig: any): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    console.log(`🔍 Testing SMTP connection for project: ${emailConfig.projectId}`);

    if (!emailConfig.smtpHost || !emailConfig.smtpUser) {
      return {
        success: false,
        error: 'Missing SMTP configuration (host or user)'
      };
    }

    // Decrypt password if needed
    let password = emailConfig.smtpPassword;
    if (isEncrypted(password)) {
      password = decrypt(password);
    }

    // Create transporter
    const transporter = nodemailer.createTransport({
      host: emailConfig.smtpHost,
      port: emailConfig.smtpPort || 587,
      secure: emailConfig.smtpSecure || false,
      auth: {
        user: emailConfig.smtpUser,
        pass: password
      },
      connectionTimeout: 10000, // 10 seconds
      greetingTimeout: 5000
    });

    // Verify connection
    await transporter.verify();

    console.log(`✅ SMTP connection successful for project: ${emailConfig.projectId}`);
    
    return { success: true };
  } catch (error: any) {
    console.error(`❌ SMTP connection failed for project ${emailConfig.projectId}:`, error.message);
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Update email config connection status
 * 
 * @param configId - Email config ID
 * @param status - Connection status
 * @param error - Error message if failed
 */
export async function updateConnectionStatus(
  configId: string,
  status: 'connected' | 'disconnected' | 'error' | 'untested',
  error?: string
): Promise<void> {
  try {
    const updateData: any = {
      connectionStatus: status,
      lastConnectionTest: new Date()
    };

    if (status === 'connected') {
      updateData.lastSuccessfulConnection = new Date();
      updateData.failedAttempts = 0;
      updateData.nextRetryAt = null;
      updateData.lastConnectionError = null;
    } else if (status === 'disconnected' || status === 'error') {
      updateData.lastConnectionError = error || 'Connection failed';
      updateData.$inc = { failedAttempts: 1 };

      // Calculate next retry time with exponential backoff
      const config = await EmailConfig.findById(configId);
      if (config) {
        const attempts = (config.failedAttempts || 0) + 1;
        const delay = Math.min(
          RETRY_CONFIG.baseDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempts - 1),
          RETRY_CONFIG.maxDelayMs
        );
        updateData.nextRetryAt = new Date(Date.now() + delay);

        console.log(`⏰ Next retry scheduled in ${Math.round(delay / 60000)} minutes (attempt ${attempts})`);
      }
    }

    await EmailConfig.findByIdAndUpdate(configId, updateData);
    
    console.log(`📝 Connection status updated to: ${status}`);
  } catch (error) {
    console.error('Failed to update connection status:', error);
  }
}

/**
 * Handle connection failure with logging and alerting
 * 
 * @param emailConfig - Failed email configuration
 * @param error - Error details
 * @param context - Where the failure occurred
 */
export async function handleConnectionFailure(
  emailConfig: any,
  error: Error | string,
  context: 'smtp' | 'imap' = 'smtp'
): Promise<void> {
  const errorMessage = error instanceof Error ? error.message : error;
  const configId = emailConfig._id.toString();

  console.error(`🚨 ${context.toUpperCase()} connection failure for project ${emailConfig.projectId}`);

  // Log error with full context
  await logEmailError(
    error,
    context === 'smtp' ? ErrorContext.SMTP_CONNECTION : ErrorContext.EMAIL_POLLING,
    {
      projectId: emailConfig.projectId?.toString(),
      smtpHost: emailConfig.smtpHost,
      smtpPort: emailConfig.smtpPort,
      smtpUser: emailConfig.smtpUser,
      connectionStatus: emailConfig.connectionStatus,
      failedAttempts: emailConfig.failedAttempts || 0,
      errorType: 'connection_failure'
    }
  );

  // Update connection status
  await updateConnectionStatus(configId, 'disconnected', errorMessage);

  // Check if this is a critical failure (multiple failed attempts)
  const config = await EmailConfig.findById(configId);
  if (config && config.failedAttempts >= 3) {
    // Send critical alert
    await sendConnectionFailureAlert(config, errorMessage);
  }
}

/**
 * Send alert to admin about connection failure
 * 
 * @param emailConfig - Failed configuration
 * @param errorMessage - Error details
 */
async function sendConnectionFailureAlert(
  emailConfig: any,
  errorMessage: string
): Promise<void> {
  try {
    // Log critical error
    await logError({
      message: `Critical: Email connection failed for project ${emailConfig.projectId}`,
      context: ErrorContext.SMTP_CONNECTION,
      severity: ErrorSeverity.CRITICAL,
      details: {
        projectId: emailConfig.projectId?.toString(),
        smtpHost: emailConfig.smtpHost,
        smtpUser: emailConfig.smtpUser,
        failedAttempts: emailConfig.failedAttempts,
        lastError: errorMessage,
        nextRetryAt: emailConfig.nextRetryAt
      }
    });

    // TODO: Implement actual alerting
    // Options:
    // 1. Send email to admin using alternative SMTP
    // 2. Send Slack/Discord notification
    // 3. Create internal support ticket
    // 4. SMS alert to admin

    console.log(`
╔═══════════════════════════════════════════════════════════╗
║        🚨 CRITICAL: EMAIL CONNECTION FAILURE 🚨           ║
╠═══════════════════════════════════════════════════════════╣
║ Project: ${emailConfig.projectId?.toString().padEnd(48)} ║
║ Host: ${emailConfig.smtpHost.padEnd(51)} ║
║ Failed Attempts: ${String(emailConfig.failedAttempts).padEnd(42)} ║
║ Error: ${errorMessage.substring(0, 49).padEnd(49)} ║
╚═══════════════════════════════════════════════════════════╝
    `);
  } catch (error) {
    console.error('Failed to send connection failure alert:', error);
  }
}

/**
 * Check if email config should be retried
 * 
 * @param emailConfig - Email configuration
 * @returns boolean - True if should retry
 */
export function shouldRetryConnection(emailConfig: any): boolean {
  // Don't retry if disabled
  if (!emailConfig.enabled) {
    return false;
  }

  // Don't retry if max attempts reached
  if (emailConfig.failedAttempts >= RETRY_CONFIG.maxAttempts) {
    return false;
  }

  // Don't retry if not yet time
  if (emailConfig.nextRetryAt && new Date() < emailConfig.nextRetryAt) {
    return false;
  }

  // Don't retry if already connected
  if (emailConfig.connectionStatus === 'connected') {
    return false;
  }

  return true;
}

/**
 * Attempt to reconnect failed email configurations
 * Should be called periodically (e.g., every 5 minutes)
 */
export async function retryFailedConnections(): Promise<void> {
  try {
    console.log('🔄 Checking for failed email connections to retry...');

    const failedConfigs = await EmailConfig.find({
      enabled: true,
      connectionStatus: { $in: ['disconnected', 'error', 'untested'] },
      failedAttempts: { $lt: RETRY_CONFIG.maxAttempts },
      $or: [
        { nextRetryAt: { $lte: new Date() } },
        { nextRetryAt: null }
      ]
    });

    if (failedConfigs.length === 0) {
      console.log('✅ No failed connections to retry');
      return;
    }

    console.log(`🔄 Found ${failedConfigs.length} connection(s) to retry`);

    for (const config of failedConfigs) {
      try {
        console.log(`🔄 Retrying connection for project: ${config.projectId}`);

        const result = await testSmtpConnection(config);

        if (result.success) {
          await updateConnectionStatus(
            config._id.toString(),
            'connected'
          );
          console.log(`✅ Reconnection successful for project: ${config.projectId}`);
        } else {
          await handleConnectionFailure(config, result.error || 'Connection test failed', 'smtp');
        }
      } catch (error: any) {
        console.error(`Failed to retry connection for project ${config.projectId}:`, error.message);
        await handleConnectionFailure(config, error, 'smtp');
      }

      // Add delay between retries to avoid overwhelming servers
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } catch (error) {
    console.error('Error in retryFailedConnections:', error);
  }
}

/**
 * Get connection health statistics
 * 
 * @param projectId - Optional project filter
 * @returns Promise<Object> Connection statistics
 */
export async function getConnectionStats(projectId?: string): Promise<{
  total: number;
  connected: number;
  disconnected: number;
  error: number;
  untested: number;
  needsRetry: number;
}> {
  try {
    const query: any = projectId ? { projectId } : {};

    const [
      total,
      connected,
      disconnected,
      error,
      untested,
      needsRetry
    ] = await Promise.all([
      EmailConfig.countDocuments(query),
      EmailConfig.countDocuments({ ...query, connectionStatus: 'connected' }),
      EmailConfig.countDocuments({ ...query, connectionStatus: 'disconnected' }),
      EmailConfig.countDocuments({ ...query, connectionStatus: 'error' }),
      EmailConfig.countDocuments({ ...query, connectionStatus: 'untested' }),
      EmailConfig.countDocuments({
        ...query,
        enabled: true,
        connectionStatus: { $in: ['disconnected', 'error'] },
        failedAttempts: { $lt: RETRY_CONFIG.maxAttempts }
      })
    ]);

    return {
      total,
      connected,
      disconnected,
      error,
      untested,
      needsRetry
    };
  } catch (error) {
    console.error('Failed to get connection statistics:', error);
    return {
      total: 0,
      connected: 0,
      disconnected: 0,
      error: 0,
      untested: 0,
      needsRetry: 0
    };
  }
}

/**
 * Reset connection status for a config (for admin manual retry)
 * 
 * @param configId - Email config ID
 */
export async function resetConnectionStatus(configId: string): Promise<void> {
  await EmailConfig.findByIdAndUpdate(configId, {
    connectionStatus: 'untested',
    failedAttempts: 0,
    nextRetryAt: null,
    lastConnectionError: null
  });
}

export const ConnectionMonitor = {
  testSmtpConnection,
  updateConnectionStatus,
  handleConnectionFailure,
  shouldRetryConnection,
  retryFailedConnections,
  getConnectionStats,
  resetConnectionStatus
};

export default ConnectionMonitor;
