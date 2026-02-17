import { Server, Socket } from 'socket.io';

export const setupSocketHandlers = (io: Server) => {
  io.on('connection', (socket: Socket) => {
    console.log(`✅ Socket connected: ${socket.id}`);

    // Join a room for ticket updates
    socket.on('join-ticket', (ticketId: string) => {
      socket.join(`ticket-${ticketId}`);
      console.log(`Socket ${socket.id} joined ticket room: ticket-${ticketId}`);
    });

    // Leave a ticket room
    socket.on('leave-ticket', (ticketId: string) => {
      socket.leave(`ticket-${ticketId}`);
      console.log(`Socket ${socket.id} left ticket room: ticket-${ticketId}`);
    });

    // Join a room for project config updates (hierarchy config changes)
    socket.on('join-project-config', (projectId: string) => {
      socket.join(`project-config-${projectId}`);
      console.log(`Socket ${socket.id} joined project config room: project-config-${projectId}`);
    });

    // Leave a project config room
    socket.on('leave-project-config', (projectId: string) => {
      socket.leave(`project-config-${projectId}`);
      console.log(`Socket ${socket.id} left project config room: project-config-${projectId}`);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`❌ Socket disconnected: ${socket.id}`);
    });
  });
};

// Helper function to emit ticket updates
export const emitTicketUpdate = (io: Server, ticketId: string, data: any) => {
  io.to(`ticket-${ticketId}`).emit('ticket-updated', data);
};

// Helper function to emit hierarchy config updates to all connected clients watching a project
export const emitHierarchyConfigUpdate = (io: Server, projectId: string, data: any) => {
  io.to(`project-config-${projectId}`).emit('hierarchy-config-updated', data);
};

// Helper function to emit category tree updates to all connected clients watching a project
export const emitCategoryTreeUpdate = (io: Server, projectId: string, data: any) => {
  io.to(`project-config-${projectId}`).emit('category-tree-updated', data);
};
