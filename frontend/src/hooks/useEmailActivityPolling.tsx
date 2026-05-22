import { useEffect, useState } from "react";
import {
  emailActivityPolling,
  EmailActivityData,
  SuspendReason,
} from "../services/emailActivityPolling";
import { toast } from "react-hot-toast";

interface UseEmailActivityPollingOptions {
  enabled?: boolean;
  showNotifications?: boolean;
  onNewTickets?: (tickets: EmailActivityData) => void;
}

export const useEmailActivityPolling = (
  options: UseEmailActivityPollingOptions = {},
) => {
  const { enabled = true, showNotifications = true, onNewTickets } = options;

  const [latestActivity, setLatestActivity] =
    useState<EmailActivityData | null>(null);
  const [isSuspended, setIsSuspended] = useState(false);
  const [suspendReason, setSuspendReason] = useState<SuspendReason>(null);

  useEffect(() => {
    if (!enabled) return;

    // Subscribe to activity data
    const unsubscribeData = emailActivityPolling.subscribe(
      (data: EmailActivityData) => {
        setLatestActivity(data);

        if (onNewTickets) onNewTickets(data);

        if (showNotifications && data.newTickets.length > 0) {
          const count = data.newTickets.length;
          const firstTicket = data.newTickets[0];
          toast.success(
            `📬 ${count} new ticket${count > 1 ? "s" : ""} from email!\n${firstTicket.ticketNumber}: ${firstTicket.subject}`,
            { duration: 5000, position: "top-right", icon: "📧" },
          );
        }

        if (showNotifications && data.stats.failedEmails > 0) {
          toast.error(
            `⚠️ ${data.stats.failedEmails} email${data.stats.failedEmails > 1 ? "s" : ""} failed to process`,
            { duration: 4000, position: "top-right" },
          );
        }
      },
    );

    // Subscribe to suspend/resume status changes
    const unsubscribeStatus = emailActivityPolling.onStatusChange(
      (suspended: boolean, reason: SuspendReason) => {
        setIsSuspended(suspended);
        setSuspendReason(reason);
      },
    );

    emailActivityPolling.start();

    return () => {
      unsubscribeData();
      unsubscribeStatus();
      emailActivityPolling.stop();
    };
  }, [enabled, showNotifications, onNewTickets]);

  return {
    latestActivity,
    isPolling: !isSuspended,
    isSuspended,
    suspendReason,
    stats: latestActivity?.stats || null,
  };
};
