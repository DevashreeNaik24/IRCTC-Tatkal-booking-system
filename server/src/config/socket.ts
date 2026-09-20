import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { redis, redisSub } from './redis';
import { logger } from './logger';

let io: Server;

/**
 * Initialize Socket.io server with Redis adapter for horizontal scaling.
 */
export function initSocketServer(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: ['http://localhost:5173', 'http://localhost:3000'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingInterval: 25000,
    pingTimeout: 20000,
    transports: ['websocket', 'polling'],
  });

  // Redis adapter for multi-instance broadcasting
  const pubClient = redis.duplicate();
  const subClient = redisSub.duplicate();
  io.adapter(createAdapter(pubClient, subClient));

  io.on('connection', (socket: Socket) => {
    logger.debug({ socketId: socket.id }, 'Client connected via Socket.io');

    // Join a train-specific room for targeted seat updates
    socket.on('join_train_room', (data: { trainId: number; journeyDate: string; travelClass: string }) => {
      const room = `train:${data.trainId}:${data.journeyDate}:${data.travelClass}`;
      socket.join(room);
      logger.debug({ socketId: socket.id, room }, 'Client joined train room');
    });

    socket.on('leave_train_room', (data: { trainId: number; journeyDate: string; travelClass: string }) => {
      const room = `train:${data.trainId}:${data.journeyDate}:${data.travelClass}`;
      socket.leave(room);
    });

    // Join user-specific room for personal notifications
    socket.on('join_user_room', (data: { userId: number }) => {
      socket.join(`user:${data.userId}`);
    });

    socket.on('disconnect', (reason) => {
      logger.debug({ socketId: socket.id, reason }, 'Client disconnected');
    });
  });

  logger.info('✅ Socket.io server initialized with Redis adapter');
  return io;
}

/**
 * Get the initialized Socket.io instance.
 */
export function getIO(): Server {
  if (!io) {
    throw new Error('Socket.io not initialized — call initSocketServer first');
  }
  return io;
}

/**
 * Emit a seat update event to all clients in a train room.
 */
export function emitSeatUpdate(trainId: number, journeyDate: string, travelClass: string, availableSeats: number) {
  const room = `train:${trainId}:${journeyDate}:${travelClass}`;
  getIO().to(room).emit('seat_update', {
    trainId,
    journeyDate,
    travelClass,
    availableSeats,
    timestamp: Date.now(),
  });
}

/**
 * Emit a booking status update to a specific user.
 */
export function emitBookingUpdate(userId: number, booking: Record<string, unknown>) {
  getIO().to(`user:${userId}`).emit('booking_update', {
    ...booking,
    timestamp: Date.now(),
  });
}

/**
 * Emit a waiting room update to a specific user.
 */
export function emitWaitingRoomUpdate(userId: number, data: { position: number; estimatedWait: number; admitted: boolean }) {
  getIO().to(`user:${userId}`).emit('waiting_room_update', {
    ...data,
    timestamp: Date.now(),
  });
}
