import { Server as NetServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { NextApiResponse } from 'next';

export type NextApiResponseServerIO = NextApiResponse & {
  socket: {
    server: NetServer & {
      io: SocketIOServer;
    };
  };
};

// Global variable to store the io instance
let io: SocketIOServer | null = null;

export const initSocket = (server: NetServer) => {
  if (!io) {
    console.log('Initializing Socket.IO server...');
    io = new SocketIOServer(server, {
      path: '/api/socketio',
      addTrailingSlash: false,
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    io.on('connection', (socket) => {
      console.log('Client connected:', socket.id);

      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
      });
    });
  }
  return io;
};

export const getIO = () => {
  if (!io) {
    console.log('Creating new Socket.IO server...');
    const server = new NetServer();
    io = initSocket(server);
  }
  return io;
};

export const setIO = (server: NetServer) => {
  if (!io) {
    io = initSocket(server);
  }
}; 