import { useState, useEffect, useRef, useCallback } from "react";
import { getSocket } from "./useSocket";
import apiClient from "../utils/api";

export interface INotification {
  _id: string;
  recipientUserId: string;
  triggeredByUserId?: string;
  projectId?: string;
  triggerType: string;
  entityType: "ticket" | "kb_article" | "comment";
  entityId: string;
  title: string;
  body?: string;
  deepLinkUrl: string;
  isRead: boolean;
  readAt?: string;
  createdAt: string;
}

export interface UseNotificationsReturn {
  unreadCount: number;
  notifications: INotification[];
  loading: boolean;
  markOneRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  refetch: () => void;
}

export function useNotifications(): UseNotificationsReturn {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<INotification[]>([]);
  const [loading, setLoading] = useState(true);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await apiClient.get("/notifications/unread-count");
      setUnreadCount(res.data?.data?.count ?? 0);
    } catch {
      // non-fatal
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get("/notifications?limit=20");
      const items: INotification[] = res.data?.data ?? res.data?.items ?? [];
      setNotifications(items);
      // derive unread from fetched list
      setUnreadCount(items.filter((n) => !n.isRead).length);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, []);

  const refetch = useCallback(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Initial load
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Socket.IO listener for real-time notifications
  useEffect(() => {
    const socket = getSocket();

    const handler = (notif: INotification) => {
      setNotifications((prev) => [notif, ...prev].slice(0, 20));
      setUnreadCount((c) => c + 1);
    };

    socket.on("notification:new", handler);

    return () => {
      socket.off("notification:new", handler);
    };
  }, []);

  // Polling fallback when socket disconnects
  useEffect(() => {
    const socket = getSocket();

    const startPolling = () => {
      if (pollingRef.current) return;
      pollingRef.current = setInterval(fetchUnreadCount, 30000);
    };

    const stopPolling = () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };

    const onDisconnect = () => startPolling();
    const onConnect = () => {
      stopPolling();
      fetchNotifications(); // gap-fill on reconnect
    };

    socket.on("disconnect", onDisconnect);
    socket.on("connect", onConnect);

    // Start polling if socket is already disconnected
    if (!socket.connected) startPolling();

    return () => {
      socket.off("disconnect", onDisconnect);
      socket.off("connect", onConnect);
      stopPolling();
    };
  }, [fetchUnreadCount, fetchNotifications]);

  const markOneRead = useCallback(async (id: string) => {
    try {
      await apiClient.patch(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) =>
          n._id === id
            ? { ...n, isRead: true, readAt: new Date().toISOString() }
            : n,
        ),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // non-fatal
    }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await apiClient.post("/notifications/read-all");
      setNotifications((prev) =>
        prev.map((n) => ({
          ...n,
          isRead: true,
          readAt: new Date().toISOString(),
        })),
      );
      setUnreadCount(0);
    } catch {
      // non-fatal
    }
  }, []);

  return {
    unreadCount,
    notifications,
    loading,
    markOneRead,
    markAllRead,
    refetch,
  };
}
