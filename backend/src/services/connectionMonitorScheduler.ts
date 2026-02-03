/**
 * Connection Monitor Scheduler Service (Task 8.2)
 * Periodically retries failed SMTP connections
 */

import cron from 'node-cron';
import { retryFailedConnections } from '../utils/connectionMonitor';

class ConnectionMonitorScheduler {
  private isRunning = false;

  /**
   * Start the scheduler - runs every 5 minutes
   */
  start(): void {
    if (this.isRunning) {
      console.log('⚠️  Connection Monitor Scheduler is already running');
      return;
    }

    console.log('🔌 Starting Connection Monitor Scheduler...');

    // Run every 5 minutes: */5 * * * *
    cron.schedule('*/5 * * * *', async () => {
      try {
        console.log('🔄 Running scheduled connection health check...');
        await retryFailedConnections();
      } catch (error) {
        console.error('❌ Connection Monitor Scheduler error:', error);
      }
    });

    this.isRunning = true;
    console.log('✅ Connection Monitor Scheduler started (runs every 5 minutes)');
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    this.isRunning = false;
    console.log('⏹️  Connection Monitor Scheduler stopped');
  }
}

export default new ConnectionMonitorScheduler();
