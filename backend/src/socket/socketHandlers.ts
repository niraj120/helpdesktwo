import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import config from "../config";
import { User } from "../models/User";
import { Ticket } from "../models/Ticket";

/**
 * Per-socket project scope, resolved once at connection time from the DB.
 * Mirrors utils/projectScope.ts (union of User.projects + Role.projects), so a
 * socket can only join rooms for projects the user can actually access.
 */
interface SocketScope {
  all: boolean; // super-admin → every project
  projectIds: Set<string>;
}

async function resolveSocketScope(userId: string): Promise<SocketScope | null> {
  const user = await User.findById(userId)
    .select("projects")
    .populate({ path: "role", select: "code name projects" })
    .lean();
  if (!user) return null;

  const role: any = (user as any).role;
  const isSuper =
    role?.code === "SUPER_ADMIN" || role?.name === "Super Admin";
  if (isSuper) return { all: true, projectIds: new Set() };

  const ids = new Set<string>();
  ((user as any).projects || []).forEach(
    (p: any) => p && ids.add(String(p._id || p)),
  );
  (role?.projects || []).forEach(
    (p: any) => p && ids.add(String(p._id || p)),
  );
  return { all: false, projectIds: ids };
}

function getScope(socket: Socket): SocketScope {
  return (
    (socket.data.scope as SocketScope) || { all: false, projectIds: new Set() }
  );
}

function canAccessProject(socket: Socket, projectId: string): boolean {
  const scope = getScope(socket);
  return scope.all || scope.projectIds.has(String(projectId));
}

/** Deny a room join without tearing down the connection. */
function denyJoin(socket: Socket, room: string, reason: string) {
  console.warn(
    `⛔ Socket ${socket.id} (user=${socket.data.userId}) denied join ${room}: ${reason}`,
  );
  socket.emit("room-join-denied", { room, reason });
}

export const setupSocketHandlers = (io: Server) => {
  // Authenticate EVERY socket connection. A missing or invalid token is
  // rejected outright — previously invalid tokens were allowed to connect
  // "without userId", which let anonymous clients join project rooms.
  io.use(async (socket: Socket, next) => {
    const token =
      socket.handshake.auth?.token || (socket.handshake.query?.token as string);
    if (!token) return next(new Error("UNAUTHORIZED: no token"));

    let decoded: any;
    try {
      decoded = jwt.verify(token, config.jwt.secret);
    } catch {
      return next(new Error("UNAUTHORIZED: invalid token"));
    }

    const userId = decoded.userId || decoded.id;
    if (!userId) return next(new Error("UNAUTHORIZED: no user in token"));

    const scope = await resolveSocketScope(userId);
    if (!scope) return next(new Error("UNAUTHORIZED: user not found"));

    socket.data.userId = String(userId);
    socket.data.scope = scope;
    next();
  });

  io.on("connection", (socket: Socket) => {
    console.log(
      `✅ Socket connected: ${socket.id} userId=${socket.data.userId}`,
    );

    // Personal notification room — always safe, it's the user's own id.
    socket.join(`user-${socket.data.userId}`);

    // Broad project ticket-list room — only for projects the user can access.
    socket.on("join-project-tickets", (projectId: string) => {
      if (!projectId) return;
      if (!canAccessProject(socket, projectId)) {
        return denyJoin(socket, `project-tickets-${projectId}`, "no project access");
      }
      socket.join(`project-tickets-${projectId}`);
    });

    socket.on("leave-project-tickets", (projectId: string) => {
      socket.leave(`project-tickets-${projectId}`);
    });

    // Global cross-project ticket list. This room receives EVERY project's
    // ticket events, so only users who can see all projects (super-admin) may
    // join. Multi-project non-admins should join their per-project rooms
    // instead (frontend follow-up).
    socket.on("join-all-tickets", () => {
      if (!getScope(socket).all) {
        return denyJoin(socket, "all-tickets", "not permitted (cross-project)");
      }
      socket.join("all-tickets");
    });

    socket.on("leave-all-tickets", () => {
      socket.leave("all-tickets");
    });

    // Single-ticket room — authorize against the ticket's OWN project, loaded
    // from the DB. Never trust the client's notion of which project it's in.
    socket.on("join-ticket", async (ticketId: string) => {
      if (!ticketId) return;
      try {
        const ticket = await Ticket.findById(ticketId).select("project").lean();
        if (!ticket) return denyJoin(socket, `ticket-${ticketId}`, "not found");
        if (!canAccessProject(socket, String((ticket as any).project))) {
          return denyJoin(socket, `ticket-${ticketId}`, "no project access");
        }
        socket.join(`ticket-${ticketId}`);
      } catch (e) {
        denyJoin(socket, `ticket-${ticketId}`, "lookup failed");
      }
    });

    socket.on("leave-ticket", (ticketId: string) => {
      socket.leave(`ticket-${ticketId}`);
    });

    // Project config room — project-scoped, same guard as ticket-list.
    socket.on("join-project-config", (projectId: string) => {
      if (!projectId) return;
      if (!canAccessProject(socket, projectId)) {
        return denyJoin(socket, `project-config-${projectId}`, "no project access");
      }
      socket.join(`project-config-${projectId}`);
    });

    socket.on("leave-project-config", (projectId: string) => {
      socket.leave(`project-config-${projectId}`);
    });

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
 * Emit an IVR call-list change to everyone watching this project's calls.
 *
 * Reuses the project ticket room: it is already authorized against project
 * access, and an IVR call belongs to the same project as its tickets, so a new
 * room would duplicate that check without adding anything.
 */
export const emitIvrCallUpdate = (
  io: Server,
  projectId: string,
  payload: {
    type: "new-call" | "call-updated";
    call: any;
  },
) => {
  io.to(`project-tickets-${projectId}`).emit("ivr-call-update", payload);
  io.to("all-tickets").emit("ivr-call-update", payload);
};

/**
 * Emit "something new arrived in the Service Requests area".
 *
 * The hub shows four tabs fed by different pipelines; an agent sitting on one
 * has no way of knowing the others moved. One event with an `area` lets the
 * hub badge whichever tab grew, instead of each tab inventing its own channel.
 */
export const emitSrActivity = (
  io: Server,
  projectId: string,
  payload: {
    area: "requests" | "email" | "ivr" | "leads";
    /** Human reference for the toast, e.g. a ticket or enquiry number. */
    ref?: string;
  },
) => {
  io.to(`project-tickets-${projectId}`).emit("sr-activity", payload);
  io.to("all-tickets").emit("sr-activity", payload);
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
