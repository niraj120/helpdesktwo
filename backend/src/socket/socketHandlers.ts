import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import config from "../config";

export const setupSocketHandlers = (io: Server) => {
  // Authenticate socket connections via token in handshake
  io.use((socket: Socket, next) => {
    const token =
      socket.handshake.auth?.token || (socket.handshake.query?.token as string);
    if (!token) {
      // Allow unauthenticated connections for legacy/public rooms — just no user room
      return next();
    }
    try {
      const decoded = jwt.verify(token, config.jwt.secret) as any;
      socket.data.userId = decoded.userId || decoded.id;
      next();
    } catch {
      // Invalid token — still allow connection but without userId
      next();
    }
  });

  io.on("connection", (socket: Socket) => {
    console.log(
      `✅ Socket connected: ${socket.id} userId=${socket.data.userId || "anon"}`,
    );

    // Auto-join personal user room so backend can push targeted notifications
    if (socket.data.userId) {
      socket.join(`user-${socket.data.userId}`);
    }

    // Join a broad project-scoped ticket-list room (all watchers of that project's list)
    socket.on("join-project-tickets", (projectId: string) => {
      socket.join(`project-tickets-${projectId}`);
      console.log(`Socket ${socket.id} joined project-tickets-${projectId}`);
    });

    socket.on("leave-project-tickets", (projectId: string) => {
      socket.leave(`project-tickets-${projectId}`);
    });

    // Join the generic "all-tickets" room (users watching the global list)
    socket.on("join-all-tickets", () => {
      socket.join("all-tickets");
      console.log(`Socket ${socket.id} joined all-tickets room`);
    });

    socket.on("leave-all-tickets", () => {
      socket.leave("all-tickets");
    });

    // Join a room for ticket updates
    socket.on("join-ticket", (ticketId: string) => {
      socket.join(`ticket-${ticketId}`);
      console.log(`Socket ${socket.id} joined ticket room: ticket-${ticketId}`);
    });

    // Leave a ticket room
    socket.on("leave-ticket", (ticketId: string) => {
      socket.leave(`ticket-${ticketId}`);
      console.log(`Socket ${socket.id} left ticket room: ticket-${ticketId}`);
    });

    // Join a room for project config updates (hierarchy config changes)
    socket.on("join-project-config", (projectId: string) => {
      socket.join(`project-config-${projectId}`);
      console.log(
        `Socket ${socket.id} joined project config room: project-config-${projectId}`,
      );
    });

    // Leave a project config room
    socket.on("leave-project-config", (projectId: string) => {
      socket.leave(`project-config-${projectId}`);
      console.log(
        `Socket ${socket.id} left project config room: project-config-${projectId}`,
      );
    });

    // Handle disconnection
    socket.on("disconnect", () => {
      console.log(`❌ Socket disconnected: ${socket.id}`);
    });
  });
};

// Helper function to emit ticket updates
export const emitTicketUpdate = (io: Server, ticketId: string, data: any) => {
  io.to(`ticket-${ticketId}`).emit("ticket-updated", data);
};

/**
 * Emit a new-ticket event to all clients watching this project's ticket list
 * AND to the global all-tickets room.
 */
export const emitTicketListUpdate = (
  io: Server,
  projectId: string,
  payload: {
    type: "new-ticket" | "ticket-updated" | "new-reply";
    ticket: any;
  },
) => {
  io.to(`project-tickets-${projectId}`).emit("ticket-list-update", payload);
  io.to("all-tickets").emit("ticket-list-update", payload);
};

/**
 * Emit a targeted notification to a specific user
 */
export const emitUserNotification = (
  io: Server,
  userId: string,
  payload: any,
) => {
  io.to(`user-${userId}`).emit("notification", payload);
};

// Helper function to emit hierarchy config updates to all connected clients watching a project
export const emitHierarchyConfigUpdate = (
  io: Server,
  projectId: string,
  data: any,
) => {
  io.to(`project-config-${projectId}`).emit("hierarchy-config-updated", data);
};

// Helper function to emit category tree updates to all connected clients watching a project
export const emitCategoryTreeUpdate = (
  io: Server,
  projectId: string,
  data: any,
) => {
  io.to(`project-config-${projectId}`).emit("category-tree-updated", data);
};
