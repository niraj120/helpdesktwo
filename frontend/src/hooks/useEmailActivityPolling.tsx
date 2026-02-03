import { useEffect, useState } from 'react';
import { emailActivityPolling, EmailActivityData } from '../services/emailActivityPolling';
import { toast } from 'react-hot-toast';

interface UseEmailActivityPollingOptions {
  enabled?: boolean;
  showNotifications?: boolean;
  onNewTickets?: (tickets: EmailActivityData) => void;
}

export const useEmailActivityPolling = (options: UseEmailActivityPollingOptions = {}) => {
  const { 
    enabled = true, 
    showNotifications = true,
    onNewTickets 
  } = options;

  const [latestActivity, setLatestActivity] = useState<EmailActivityData | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Subscribe to activity updates
    const unsubscribe = emailActivityPolling.subscribe((data: EmailActivityData) => {
      setLatestActivity(data);

      // Call custom callback if provided
      if (onNewTickets) {
        onNewTickets(data);
      }

      // Show toast notifications
      if (showNotifications && data.newTickets.length > 0) {
        const count = data.newTickets.length;
        const firstTicket = data.newTickets[0];
        
        toast.success(
          `📬 ${count} new ticket${count > 1 ? 's' : ''} from email!\n${firstTicket.ticketNumber}: ${firstTicket.subject}`,
          {
            duration: 5000,
            position: 'top-right',
            icon: '📧'
          }
        );
      }

      // Show warning for failed emails
      if (showNotifications && data.stats.failedEmails > 0) {
        toast.error(
          `⚠️ ${data.stats.failedEmails} email${data.stats.failedEmails > 1 ? 's' : ''} failed to process`,
          {
            duration: 4000,
            position: 'top-right'
          }
        );
      }
    });

    // Start polling
    emailActivityPolling.start();
    setIsPolling(true);

    // Cleanup
    return () => {
      unsubscribe();
      emailActivityPolling.stop();
      setIsPolling(false);
    };
  }, [enabled, showNotifications, onNewTickets]);

  return {
    latestActivity,
    isPolling,
    stats: latestActivity?.stats || null
  };
};
