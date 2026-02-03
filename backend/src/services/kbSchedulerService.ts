import cron from 'node-cron';
import KBArticle from '../models/KBArticle';

/**
 * Scheduler service to auto-publish and auto-unpublish KB articles
 */
class KBSchedulerService {
  private isRunning: boolean = false;

  /**
   * Start the scheduler - runs every minute
   */
  public start(): void {
    if (this.isRunning) {
      console.log('KB Scheduler is already running');
      return;
    }

    console.log('Starting KB Scheduler service...');

    // Run every minute (0 * * * * *)
    cron.schedule('* * * * *', async () => {
      try {
        await this.processScheduledPublish();
        await this.processScheduledUnpublish();
      } catch (error) {
        console.error('KB Scheduler error:', error);
      }
    });

    this.isRunning = true;
    console.log('KB Scheduler service started successfully');
  }

  /**
   * Process articles scheduled for publishing
   */
  private async processScheduledPublish(): Promise<void> {
    try {
      const now = new Date();

      // Find articles that are scheduled to be published
      const articlesToPublish = await KBArticle.find({
        publishType: 'scheduled',
        scheduledPublishDate: { $lte: now },
        publishedAt: null, // Not yet published
        status: 'active',
      });

      if (articlesToPublish.length === 0) {
        return;
      }

      console.log(`Publishing ${articlesToPublish.length} scheduled articles...`);

      // Update publishedAt timestamp for these articles
      const updatePromises = articlesToPublish.map((article) => {
        article.publishedAt = now;
        return article.save();
      });

      await Promise.all(updatePromises);

      console.log(
        `Successfully published ${articlesToPublish.length} articles:`,
        articlesToPublish.map((a) => a.documentName)
      );
    } catch (error) {
      console.error('Error processing scheduled publish:', error);
    }
  }

  /**
   * Process articles scheduled for unpublishing
   */
  private async processScheduledUnpublish(): Promise<void> {
    try {
      const now = new Date();

      // Find articles that are scheduled to be unpublished
      const articlesToUnpublish = await KBArticle.find({
        publishType: 'scheduled',
        scheduledUnpublishDate: { $lte: now },
        status: 'active',
        publishedAt: { $ne: null }, // Already published
      });

      if (articlesToUnpublish.length === 0) {
        return;
      }

      console.log(`Unpublishing ${articlesToUnpublish.length} scheduled articles...`);

      // Set status to inactive to hide from public
      const updatePromises = articlesToUnpublish.map((article) => {
        article.status = 'inactive';
        return article.save();
      });

      await Promise.all(updatePromises);

      console.log(
        `Successfully unpublished ${articlesToUnpublish.length} articles:`,
        articlesToUnpublish.map((a) => a.documentName)
      );
    } catch (error) {
      console.error('Error processing scheduled unpublish:', error);
    }
  }

  /**
   * Manual trigger to check and process scheduled articles
   * Useful for testing or manual runs
   */
  public async processManually(): Promise<void> {
    console.log('Manually processing scheduled articles...');
    await this.processScheduledPublish();
    await this.processScheduledUnpublish();
    console.log('Manual processing completed');
  }

  /**
   * Get status of scheduler
   */
  public getStatus(): { isRunning: boolean } {
    return {
      isRunning: this.isRunning,
    };
  }
}

// Export singleton instance
export default new KBSchedulerService();
