import { useEffect } from "react";
import toast from "react-hot-toast";

/**
 * Global network-status notifier.
 *
 * Shows a top-right toast when the browser goes offline ("No internet
 * connection"), when it comes back ("Back online"), and — where the browser
 * supports the Network Information API (Chromium) — when the connection is
 * slow ("Slow internet connection").
 *
 * Renders nothing; it only wires up listeners. Relies on the <Toaster /> that
 * is already mounted in main.tsx (position: top-right).
 */
const OFFLINE_TOAST_ID = "network-offline";
const SLOW_TOAST_ID = "network-slow";

export default function NetworkStatusNotifier() {
  useEffect(() => {
    const showOffline = () => {
      toast.dismiss(SLOW_TOAST_ID);
      toast.error("No internet connection", {
        id: OFFLINE_TOAST_ID,
        duration: Infinity, // stays until we're back online
        icon: "📡",
      });
    };

    const showOnline = () => {
      // Replace the persistent offline toast with a brief "back online" one.
      toast.success("Back online", {
        id: OFFLINE_TOAST_ID,
        duration: 2500,
        icon: "✅",
      });
    };

    // Network Information API (Chromium only) — used for slow-connection hints.
    const conn: any =
      (typeof navigator !== "undefined" &&
        ((navigator as any).connection ||
          (navigator as any).mozConnection ||
          (navigator as any).webkitConnection)) ||
      null;

    const checkSlow = () => {
      // If fully offline, the offline toast already covers it.
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      if (!conn) return;
      const effectiveType: string | undefined = conn.effectiveType;
      const downlink: number | undefined = conn.downlink; // Mbps
      const rtt: number | undefined = conn.rtt; // ms
      const isSlow =
        effectiveType === "slow-2g" ||
        effectiveType === "2g" ||
        (typeof downlink === "number" && downlink > 0 && downlink < 0.5) ||
        (typeof rtt === "number" && rtt > 1200);
      if (isSlow) {
        toast("Slow internet connection — actions may be delayed", {
          id: SLOW_TOAST_ID,
          duration: 5000,
          icon: "🐢",
          className: "app-toast-warning",
        });
      }
    };

    // Initial state on mount.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      showOffline();
    } else {
      checkSlow();
    }

    window.addEventListener("offline", showOffline);
    window.addEventListener("online", showOnline);
    conn?.addEventListener?.("change", checkSlow);

    return () => {
      window.removeEventListener("offline", showOffline);
      window.removeEventListener("online", showOnline);
      conn?.removeEventListener?.("change", checkSlow);
    };
  }, []);

  return null;
}
