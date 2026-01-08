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
