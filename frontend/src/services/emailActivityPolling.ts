import { API_CONFIG } from '../config/constants';

export interface NewTicketNotification {
  ticketNumber: string;
  subject: string;
  sourceEmail: string;
  priority: string;
  status: number;
  createdAt: Date;
}

export interface EmailActivityStats {
  newTicketsCount: number;
  pendingEmails: number;
  processingEmails: number;
  failedEmails: number;
}

export interface EmailActivityData {
  newTickets: NewTicketNotification[];
  stats: EmailActivityStats;
  timestamp: string;
}

type ActivityCallback = (data: EmailActivityData) => void;

class EmailActivityPollingService {
  private intervalId: number | null = null;
  private pollingInterval: number = 60000; // 60 seconds default (reduced from 30s for better performance)
  private lastCheckTimestamp: string | null = null;
  private callbacks: ActivityCallback[] = [];
  private isRunning: boolean = false;

  /**
   * Start polling for email activity
   */
  public start(intervalMs?: number): void {
    if (this.isRunning) {
      console.log('⚠️ Email activity polling already running');
      return;
    }

    if (intervalMs) {
      this.pollingInterval = intervalMs;
    }

    console.log(`🚀 Starting email activity polling (interval: ${this.pollingInterval}ms)`);
    
    this.isRunning = true;
    
    // Poll immediately on start
    this.poll();
    
    // Then poll at regular intervals
    this.intervalId = window.setInterval(() => {
      this.poll();
    }, this.pollingInterval);
  }

  /**
   * Stop polling
   */
  public stop(): void {
    if (this.intervalId) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
      this.isRunning = false;
      console.log('🛑 Email activity polling stopped');
    }
  }

  /**
   * Update polling interval
   */
  public updateInterval(intervalMs: number): void {
    if (intervalMs < 10000) {
      console.warn('⚠️ Polling interval must be at least 10 seconds');
      return;
    }

    this.pollingInterval = intervalMs;
    
    // Restart polling with new interval if currently running
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }

  /**
   * Subscribe to activity updates
   */
  public subscribe(callback: ActivityCallback): () => void {
    this.callbacks.push(callback);
    
    // Return unsubscribe function
    return () => {
      this.callbacks = this.callbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * Poll for recent activity
   */
  private async poll(): Promise<void> {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) {
        console.log('⚠️ No auth token, skipping email activity poll');
        return;
      }

      const url = new URL(`${API_CONFIG.API_URL}/email-activity/recent`);
      if (this.lastCheckTimestamp) {
        url.searchParams.append('since', this.lastCheckTimestamp);
      }

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          console.log('⚠️ Authentication failed, stopping polling');
          this.stop();
        }
        return;
      }

      const result = await response.json();
      
      if (result.success && result.data) {
        const data: EmailActivityData = result.data;
        
        // Update last check timestamp
        this.lastCheckTimestamp = data.timestamp;
        
        // Notify subscribers if there's new activity
        if (data.newTickets.length > 0 || data.stats.pendingEmails > 0) {
          console.log(`📬 New activity: ${data.newTickets.length} tickets, ${data.stats.pendingEmails} pending emails`);
          this.notifySubscribers(data);
        }
      }
    } catch (error) {
      console.error('❌ Email activity polling error:', error);
      // Don't stop polling on error, just log it
    }
  }

  /**
   * Notify all subscribers
   */
  private notifySubscribers(data: EmailActivityData): void {
    this.callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('❌ Error in activity callback:', error);
      }
    });
  }

  /**
   * Get current polling status
   */
  public getStatus(): { isRunning: boolean; interval: number } {
    return {
      isRunning: this.isRunning,
      interval: this.pollingInterval
    };
  }
}

// Export singleton instance
export const emailActivityPolling = new EmailActivityPollingService();
