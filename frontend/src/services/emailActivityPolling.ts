import { API_CONFIG } from "../config/constants";

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

export type SuspendReason = "hidden" | "idle" | null;

type ActivityCallback = (data: EmailActivityData) => void;
type StatusCallback = (suspended: boolean, reason: SuspendReason) => void;

// How long with no user interaction before polling is suspended (5 minutes)
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

// User interaction events that reset the idle timer
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "click",
];

class EmailActivityPollingService {
  private intervalId: number | null = null;
  private pollingInterval: number = 60000; // 60 seconds
  private lastCheckTimestamp: string | null = null;
  private callbacks: ActivityCallback[] = [];
  private statusCallbacks: StatusCallback[] = [];
  private projectId: string | null = null;

  // Whether start() has been called (user intent to poll)
  private isStarted: boolean = false;

  // Whether polling is currently suspended due to hidden tab or idle
  private isSuspended: boolean = false;
  private suspendReason: SuspendReason = null;

  // Idle detection
  private lastActivityTime: number = Date.now();
  private idleCheckId: number | null = null;
  private boundActivityHandler: () => void;
  private boundVisibilityHandler: () => void;

  constructor() {
    this.boundActivityHandler = this.onUserActivity.bind(this);
    this.boundVisibilityHandler = this.onVisibilityChange.bind(this);
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  public start(intervalMs?: number): void {
    if (this.isStarted) return;

    if (intervalMs) this.pollingInterval = intervalMs;
    this.isStarted = true;
    this.lastActivityTime = Date.now();

    // Attach Page Visibility listener
    document.addEventListener("visibilitychange", this.boundVisibilityHandler);

    // Attach user-activity listeners for idle detection
    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, this.boundActivityHandler, {
        passive: true,
      }),
    );

    // Check for idle every 30 seconds
    this.idleCheckId = window.setInterval(() => this.checkIdle(), 30_000);

    // Start polling unless tab is already hidden
    if (document.hidden) {
      this.suspend("hidden");
    } else {
      this.resumePolling(/* catchUp */ true);
    }
  }

  public stop(): void {
    this.isStarted = false;
    this.clearInterval();
    this.isSuspended = false;
    this.suspendReason = null;

    document.removeEventListener(
      "visibilitychange",
      this.boundVisibilityHandler,
    );
    ACTIVITY_EVENTS.forEach((evt) =>
      window.removeEventListener(evt, this.boundActivityHandler),
    );

    if (this.idleCheckId !== null) {
      window.clearInterval(this.idleCheckId);
      this.idleCheckId = null;
    }
  }

  public subscribe(callback: ActivityCallback): () => void {
    this.callbacks.push(callback);
    return () => {
      this.callbacks = this.callbacks.filter((cb) => cb !== callback);
    };
  }

  /** Subscribe to suspend/resume status changes (for UI indicators) */
  public onStatusChange(callback: StatusCallback): () => void {
    this.statusCallbacks.push(callback);
    return () => {
      this.statusCallbacks = this.statusCallbacks.filter(
        (cb) => cb !== callback,
      );
    };
  }

  public getStatus(): {
    isStarted: boolean;
    isSuspended: boolean;
    suspendReason: SuspendReason;
    interval: number;
  } {
    return {
      isStarted: this.isStarted,
      isSuspended: this.isSuspended,
      suspendReason: this.suspendReason,
      interval: this.pollingInterval,
    };
  }

  public setProjectId(projectId?: string | null): void {
    const next = projectId || null;
    if (this.projectId === next) return;
    this.projectId = next;
    this.lastCheckTimestamp = null;
  }

  // ─── Visibility & Idle ────────────────────────────────────────────────────

  private onVisibilityChange(): void {
    if (!this.isStarted) return;

    if (document.hidden) {
      // Tab went to background — suspend immediately
      this.suspend("hidden");
    } else {
      // Tab came back to foreground
      this.lastActivityTime = Date.now();
      if (this.suspendReason === "hidden") {
        // Resume and do an immediate catch-up poll
        this.resumePolling(/* catchUp */ true);
      }
      // If suspended for idle, wait for actual user interaction to resume
    }
  }

  private onUserActivity(): void {
    this.lastActivityTime = Date.now();

    // If suspended due to idle (not hidden), resume polling immediately
    if (this.isStarted && this.isSuspended && this.suspendReason === "idle") {
      this.resumePolling(/* catchUp */ true);
    }
  }

  private checkIdle(): void {
    if (!this.isStarted || document.hidden) return;

    const idleMs = Date.now() - this.lastActivityTime;
    if (!this.isSuspended && idleMs >= IDLE_TIMEOUT_MS) {
      this.suspend("idle");
    }
  }

  // ─── Internal polling control ─────────────────────────────────────────────

  private suspend(reason: SuspendReason): void {
    if (this.isSuspended && this.suspendReason === reason) return;
    this.clearInterval();
    this.isSuspended = true;
    this.suspendReason = reason;
    this.notifyStatus();
  }

  private resumePolling(catchUp: boolean): void {
    this.isSuspended = false;
    this.suspendReason = null;
    this.notifyStatus();

    // Catch-up poll immediately so user sees fresh data on return
    if (catchUp) this.poll();

    // Restart the regular interval
    this.clearInterval();
    this.intervalId = window.setInterval(
      () => this.poll(),
      this.pollingInterval,
    );
  }

  private clearInterval(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  // ─── Fetch ────────────────────────────────────────────────────────────────

  private async poll(): Promise<void> {
    try {
      const token = localStorage.getItem("authToken");
      if (!token) return;

      const url = new URL(`${API_CONFIG.API_URL}/email-activity/recent`);
      if (this.lastCheckTimestamp) {
        url.searchParams.append("since", this.lastCheckTimestamp);
      }
      if (this.projectId) {
        url.searchParams.append("projectId", this.projectId);
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        if (response.status === 401) this.stop();
        return;
      }

      const result = await response.json();

      if (result.success && result.data) {
        const data: EmailActivityData = result.data;
        this.lastCheckTimestamp = data.timestamp;

        if (data.newTickets.length > 0 || data.stats.pendingEmails > 0) {
          this.notifySubscribers(data);
        }
      }
    } catch {
      // Network error — stay running, will retry on next interval
    }
  }

  private notifySubscribers(data: EmailActivityData): void {
    this.callbacks.forEach((cb) => {
      try {
        cb(data);
      } catch {
        /* ignore callback errors */
      }
    });
  }

  private notifyStatus(): void {
    this.statusCallbacks.forEach((cb) => {
      try {
        cb(this.isSuspended, this.suspendReason);
      } catch {
        /* ignore */
      }
    });
  }
}

// Export singleton instance
export const emailActivityPolling = new EmailActivityPollingService();
