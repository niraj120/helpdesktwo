import * as cron from 'node-cron';
import EmailProcessingQueue from '../models/EmailProcessingQueue';
import EmailParser, { ParsedEmailData } from '../utils/emailParser';
import { findEmailThread } from '../utils/emailThreadDetection';
import { createTicketFromEmail, addEmailReplyToTicket } from '../utils/ticketFromEmail';
import { Ticket } from '../models/Ticket';

// Worker configuration - with sensible defaults
const WORKER_INTERVAL = process.env.EMAIL_WORKER_INTERVAL || '*/1 * * * *'; // Every 1 minute (default)
const BATCH_SIZE = process.env.EMAIL_WORKER_BATCH_SIZE 
  ? parseInt(process.env.EMAIL_WORKER_BATCH_SIZE, 10) 
  : 10; // Default: Process 10 emails per cycle
const MAX_RETRIES = 3; // Maximum retry attempts
const RETRY_DELAY = 5000; // 5 seconds between retries

/**
 * Email Processing Worker Service
 * Processes queued emails and creates tickets
 */
class EmailProcessingWorker {
  private cronJob: cron.ScheduledTask | null = null;
  private isProcessing: boolean = false;
  private processedCount: number = 0;
  private failedCount: number = 0;
  private successCount: number = 0;

  /**
   * Start the email processing worker
   */
  public start(): void {
    if (this.cronJob) {
      console.log('⚠️  Email processing worker is already running');
      return;
    }

    console.log(`🤖 Starting Email Processing Worker`);
    console.log(`   Interval: ${WORKER_INTERVAL} (every 1 minute)`);
    console.log(`   Batch Size: ${BATCH_SIZE} emails/cycle`);
    console.log(`   Max Retries: ${MAX_RETRIES} attempts`);

    // Schedule the cron job
    this.cronJob = cron.schedule(WORKER_INTERVAL, async () => {
      await this.processQueue();
    });

    console.log('✅ Email Processing Worker started successfully');

    // Run immediately on startup after 10 seconds
    setTimeout(() => {
      this.processQueue();
    }, 10000); // Wait 10 seconds after server start
  }

  /**
   * Stop the email processing worker
   */
  public stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('🛑 Email Processing Worker stopped');
    }
  }

  /**
   * Main processing logic - processes queued emails
   */
  private async processQueue(): Promise<void> {
    // Prevent concurrent processing
    if (this.isProcessing) {
      console.log('⏭️  Email processing already in progress, skipping this cycle');
      return;
    }

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      console.log('\n' + '='.repeat(60));
      console.log(`⚙️  Email Processing Cycle Started - ${new Date().toISOString()}`);
      console.log('='.repeat(60));

      // Fetch pending emails from queue (with retry limit)
      const pendingEmails = await EmailProcessingQueue.find({
        status: 'pending',
        retryCount: { $lt: MAX_RETRIES },
      })
        .sort({ createdAt: 1 }) // Oldest first (FIFO)
        .limit(BATCH_SIZE)
        .exec();

      if (pendingEmails.length === 0) {
        console.log('ℹ️  No pending emails in queue');
        return;
      }

      console.log(`📬 Found ${pendingEmails.length} pending email(s) to process`);

      let cycleSuccess = 0;
      let cycleFailed = 0;

      // Process each email
      for (const queueEntry of pendingEmails) {
        try {
          console.log(`\n📧 Processing email: ${queueEntry._id}`);
          console.log(`   From: ${queueEntry.metadata?.fromEmail || 'unknown'}`);
          console.log(`   Subject: ${queueEntry.metadata?.subject || 'unknown'}`);
          console.log(`   Retry: ${queueEntry.retryCount}/${MAX_RETRIES}`);

          await this.processEmail(queueEntry);
          cycleSuccess++;
          this.successCount++;

          console.log(`   ✅ Processed successfully`);
        } catch (error: any) {
          cycleFailed++;
          this.failedCount++;
          console.error(`   ❌ Processing failed: ${error.message}`);
          
          // Update retry count and error message
          await this.handleProcessingError(queueEntry, error);
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log('\n' + '='.repeat(60));
      console.log('📊 Processing Cycle Summary:');
      console.log(`   Processed: ${pendingEmails.length}`);
      console.log(`   Successful: ${cycleSuccess}`);
      console.log(`   Failed: ${cycleFailed}`);
      console.log(`   Duration: ${duration}s`);
      console.log(`   Total Stats: ${this.successCount} success, ${this.failedCount} failed`);
      console.log('='.repeat(60) + '\n');
    } catch (error: any) {
      console.error('❌ Email processing cycle failed:', error.message);
      console.error(error.stack);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single email from the queue
   */
  private async processEmail(queueEntry: any): Promise<void> {
    // Update status to 'processing'
    queueEntry.status = 'processing';
    queueEntry.lastAttemptAt = new Date();
    await queueEntry.save();

    console.log(`   ⚙️  Status: pending → processing`);

    try {
      // Parse email data
      console.log(`   📄 Parsing email data...`);
      
      let parsedEmail: ParsedEmailData;
      try {
        parsedEmail = await EmailParser.parseFromJSON(queueEntry.rawEmail);
      } catch (parseError: any) {
        throw new Error(`Email parsing failed: ${parseError.message}`);
      }

      console.log(`   ✓ Email parsed successfully`);
      console.log(`      Message-ID: ${parsedEmail.messageId}`);
      console.log(`      From: ${parsedEmail.from.address}`);
      console.log(`      Subject: ${parsedEmail.subject}`);
      console.log(`      Attachments: ${parsedEmail.attachments.length}`);

      // Check for email thread (Task 4.4)
      console.log(`   🔍 Checking for existing thread...`);
      const existingTicket = await findEmailThread(parsedEmail);

      if (existingTicket) {
        // Email is a reply - add as comment to existing ticket
        console.log(`   🔗 Thread found! Ticket #${existingTicket.ticketNumber}`);
        console.log(`   💬 Adding as reply to existing ticket...`);

        await this.addReplyToTicket(existingTicket, parsedEmail, queueEntry);
        
        console.log(`   ✅ Reply added successfully`);
      } else {
        // No thread found - create new ticket
        console.log(`   📝 No thread found, creating new ticket...`);

        let ticket;
        try {
          ticket = await createTicketFromEmail(parsedEmail, queueEntry);
        } catch (createError: any) {
          // Provide detailed reason for ticket creation failure
          const reason = createError.message || 'Ticket creation failed';
          console.error(`   ❌ Ticket creation failed: ${reason}`);
          throw new Error(`Failed to create ticket: ${reason}`);
        }
        
        console.log(`   ✅ Ticket created: #${ticket.ticketNumber}`);
        
        // Update queue entry with ticket ID
        queueEntry.ticketId = ticket._id;
      }

      // Mark as completed
      queueEntry.status = 'completed';
      queueEntry.processedAt = new Date();
      queueEntry.errorMessage = undefined;
      await queueEntry.save();

      console.log(`   ✓ Status: processing → completed`);
    } catch (error: any) {
      // Revert status back to pending for retry
      queueEntry.status = 'pending';
      await queueEntry.save();
      throw error;
    }
  }

  /**
   * Add reply to existing ticket
   */
  private async addReplyToTicket(
    ticket: any,
    parsedEmail: ParsedEmailData,
    queueEntry: any
  ): Promise<void> {
    // Use utility function from ticketFromEmail
    await addEmailReplyToTicket(ticket, parsedEmail, queueEntry);
  }

  /**
   * Handle processing error and update retry count
   */
  private async handleProcessingError(queueEntry: any, error: Error): Promise<void> {
    try {
      queueEntry.retryCount += 1;
      
      // Create detailed error message
      const errorDetails = {
        message: error.message || 'Unknown error occurred',
        type: error.name || 'Error',
        stack: error.stack?.split('\n').slice(0, 3).join('\n') || '',
        timestamp: new Date().toISOString(),
        from: queueEntry.metadata?.fromEmail || 'unknown',
        subject: queueEntry.metadata?.subject || 'unknown'
      };
      
      queueEntry.errorMessage = error.message || 'Unknown error - check backend logs for details';
      queueEntry.error = error.message || 'Unknown error';
      queueEntry.lastAttemptAt = new Date();
      queueEntry.lastRetryAt = new Date();

      // Log detailed error for debugging
      console.log(`   📋 Error Details:`);
      console.log(`      Type: ${errorDetails.type}`);
      console.log(`      Message: ${errorDetails.message}`);
      console.log(`      From: ${errorDetails.from}`);
      console.log(`      Subject: ${errorDetails.subject}`);

      if (queueEntry.retryCount >= MAX_RETRIES) {
        // Max retries reached, mark as failed
        queueEntry.status = 'failed';
        console.log(`   ⚠️  Max retries reached (${MAX_RETRIES}), marking as failed`);
        console.log(`   ❌ FINAL ERROR: ${errorDetails.message}`);
      } else {
        // Keep as pending for retry
        queueEntry.status = 'pending';
        console.log(`   🔄 Will retry (attempt ${queueEntry.retryCount + 1}/${MAX_RETRIES})`);
      }

      await queueEntry.save();
    } catch (saveError: any) {
      console.error(`   ❌ Failed to update queue entry:`, saveError.message);
    }
  }

  /**
   * Get worker status and statistics
   */
  public getStatus(): {
    isActive: boolean;
    isProcessing: boolean;
    interval: string;
    batchSize: number;
    stats: {
      totalProcessed: number;
      successful: number;
      failed: number;
    };
  } {
    return {
      isActive: this.cronJob !== null,
      isProcessing: this.isProcessing,
      interval: WORKER_INTERVAL,
      batchSize: BATCH_SIZE,
      stats: {
        totalProcessed: this.successCount + this.failedCount,
        successful: this.successCount,
        failed: this.failedCount,
      },
    };
  }

  /**
   * Process queue immediately (for manual trigger)
   */
  public async triggerProcessing(): Promise<void> {
    console.log('🔧 Manual processing triggered');
    await this.processQueue();
  }

  /**
   * Reset statistics
   */
  public resetStats(): void {
    this.processedCount = 0;
    this.successCount = 0;
    this.failedCount = 0;
    console.log('📊 Statistics reset');
  }
}

// Export singleton instance
export const emailProcessingWorker = new EmailProcessingWorker();
