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
      transports: ["websocket", "polling"],
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

/**
 * Hook to connect to Socket.IO, join rooms, and listen for events.
 * Automatically join/leave on mount/unmount.
 */
export const useSocket = ({
  rooms = [],
  events = {},
}: UseSocketOptions = {}) => {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    // Helper: join all requested rooms (called on mount AND on every reconnect)
    const joinRooms = () => {
      rooms.forEach((roomId) => {
        if (roomId === "all-tickets") {
          socket.emit("join-all-tickets");
        } else if (roomId.startsWith("project-tickets-")) {
          socket.emit(
            "join-project-tickets",
            roomId.replace("project-tickets-", ""),
          );
        } else if (roomId.startsWith("ticket-")) {
          socket.emit("join-ticket", roomId.replace("ticket-", ""));
        }
      });
    };

    // Join now (or buffer until connected)
    joinRooms();
    // Re-join after every reconnect (server drops room membership on disconnect)
    socket.on("connect", joinRooms);

    // Register event listeners
    const registeredEvents = Object.entries(events);
    registeredEvents.forEach(([event, handler]) => {
      socket.on(event, handler);
    });

    return () => {
      socket.off("connect", joinRooms);

      // Leave rooms
      rooms.forEach((roomId) => {
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
      });

      // Remove listeners
      registeredEvents.forEach(([event, handler]) => {
        socket.off(event, handler);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = useCallback((event: string, ...args: any[]) => {
    socketRef.current?.emit(event, ...args);
  }, []);

  return { emit };
};
