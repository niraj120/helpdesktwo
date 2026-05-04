import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { API_CONFIG } from "../config/constants";

type SocketEvent =
  | "ticket-list-update"
  | "ticket-updated"
  | "notification"
  | string;

let _socket: Socket | null = null;

/**
 * Returns the shared Socket.IO singleton.
 * Creates it on first call; subsequent calls return the same instance.
 * The socket auto-reconnects if the browser tab regains focus.
 */
export const getSocket = (): Socket => {
  if (!_socket || _socket.disconnected) {
    const token = localStorage.getItem("authToken");
    _socket = io(API_CONFIG.BASE_URL, {
      auth: { token },
      // Use /api/socket.io so requests go through the existing nginx /api
      // proxy block instead of needing a separate /socket.io location.
      path: "/api/socket.io",
      // Start with polling so the handshake always succeeds regardless of
      // WebSocket availability at the proxy layer.
      transports: ["polling", "websocket"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });
  }
  return _socket;
};

export const disconnectSocket = (): void => {
  if (_socket) {
    _socket.disconnect();
    _socket = null;
  }
};

interface UseSocketOptions {
  /** Rooms to join on mount and leave on unmount */
  rooms?: string[];
  /** Events to listen to: { eventName: handler } */
  events?: Record<SocketEvent, (data: any) => void>;
}

const emitJoin = (socket: Socket, roomId: string) => {
  if (roomId === "all-tickets") {
    socket.emit("join-all-tickets");
  } else if (roomId.startsWith("project-tickets-")) {
    socket.emit("join-project-tickets", roomId.replace("project-tickets-", ""));
  } else if (roomId.startsWith("ticket-")) {
    socket.emit("join-ticket", roomId.replace("ticket-", ""));
  }
};

const emitLeave = (socket: Socket, roomId: string) => {
  if (roomId === "all-tickets") {
    socket.emit("leave-all-tickets");
  } else if (roomId.startsWith("project-tickets-")) {
    socket.emit(
      "leave-project-tickets",
      roomId.replace("project-tickets-", ""),
    );
  } else if (roomId.startsWith("ticket-")) {
    socket.emit("leave-ticket", roomId.replace("ticket-", ""));
  }
};

/**
 * Hook to connect to Socket.IO, join rooms, and listen for events.
 *
 * Design:
 * - ONE-TIME effect creates the socket and registers stable event wrappers
 *   that delegate to an always-current ref — handlers never go stale.
 * - SEPARATE rooms effect re-runs whenever rooms change (e.g. when
 *   currentProjectId resolves from context after first render). This fixes
 *   the production issue where context resolves async and the first emit
 *   was for the wrong / empty room.
 */
export const useSocket = ({
  rooms = [],
  events = {},
}: UseSocketOptions = {}) => {
  const socketRef = useRef<Socket | null>(null);
  // Always-current events ref so handlers never see stale closures
  const eventsRef = useRef(events);
  eventsRef.current = events;

  // --- One-time: create socket and register stable event wrappers ---
  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    // Build stable wrappers once; they delegate to eventsRef so they always
    // call the latest version of each handler without re-registering.
    const stableHandlers: Record<string, (data: any) => void> = {};
    Object.keys(eventsRef.current).forEach((event) => {
      stableHandlers[event] = (data: any) => eventsRef.current[event]?.(data);
      socket.on(event, stableHandlers[event]);
    });

    return () => {
      Object.keys(stableHandlers).forEach((event) => {
        socket.off(event, stableHandlers[event]);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Reactive rooms: re-runs when rooms list changes ---
  // Using rooms.join(",") as dep so the effect re-fires when the list
  // changes (e.g. currentProjectId loaded from context after first render).
  const roomsKey = rooms.join(",");
  useEffect(() => {
    const socket = socketRef.current ?? getSocket();
    socketRef.current = socket;

    const joinRooms = () => rooms.forEach((id) => emitJoin(socket, id));

    // Join immediately if already connected (buffered otherwise by socket.io)
    joinRooms();
    // Re-join on every reconnect
    socket.on("connect", joinRooms);

    return () => {
      socket.off("connect", joinRooms);
      rooms.forEach((id) => emitLeave(socket, id));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomsKey]);

  const emit = useCallback((event: string, ...args: any[]) => {
    socketRef.current?.emit(event, ...args);
  }, []);

  return { emit };
};
