import { Server } from 'socket.io';

/**
 * Singleton Socket.IO instance.
 * Call setIo(io) once in server.ts after creating the io server.
 * Call getIo() anywhere in controllers / services to emit events.
 */
let _io: Server | null = null;

export const setIo = (io: Server): void => {
  _io = io;
};

export const getIo = (): Server | null => {
  return _io;
};
