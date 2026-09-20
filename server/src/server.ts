import http from 'http';
import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { env } from './config/env';
import { logger } from './config/logger';
import { closeDb } from './config/db';
import { closeRedis } from './config/redis';
import { initSocketServer } from './config/socket';
import { httpRequestDuration, httpRequestTotal } from './config/metrics';
import { Worker } from 'bullmq';
import { startWorkers, stopWorkers } from './events/workers';
import { closeQueues } from './events/eventBus';
import { startPaymentChecker, stopPaymentChecker } from './services/payment.checker';
import { admitBatch } from './services/waitingRoom.service';

import authRoutes from './routes/auth.routes';
import trainRoutes from './routes/train.routes';
import reservationRoutes from './routes/reservation.routes';
import paymentRoutes from './routes/payment.routes';
import bookingRoutes from './routes/booking.routes';
import waitingRoomRoutes from './routes/waitingRoom.routes';
import adminRoutes from './routes/admin.routes';
import healthRoutes from './routes/health.routes';

const app = express();
const server = http.createServer(app);

// ─── Security & parsing ───────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
  })
);
app.use(compression());
app.use(express.json({ limit: '100kb' }));

// ─── Request logging + HTTP metrics ───────────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    const route = (req.route?.path as string | undefined) || req.path;
    const labels = { method: req.method, route, status_code: res.statusCode.toString() };
    httpRequestDuration.observe(labels, durationSeconds);
    httpRequestTotal.inc(labels);

    const log = { method: req.method, path: req.path, status: res.statusCode, durationMs: Math.round(durationSeconds * 1000), ip: req.ip };
    if (res.statusCode >= 500) logger.error(log, 'Request failed');
    else if (res.statusCode >= 400) logger.warn(log, 'Request rejected');
    else logger.debug(log, 'Request completed');
  });
  next();
});

// ─── API routes ───────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/trains', trainRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/waiting-room', waitingRoomRoutes);
app.use('/api/admin', adminRoutes);

// Health/readiness/metrics live at the root (unauthenticated by design —
// these are what orchestrators and Prometheus probe).
app.use(healthRoutes);

// ─── 404 & error handling ─────────────────────────────────
app.use((req: Request, res: Response) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.path}` });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');
  res.status(500).json({ success: false, message: 'Internal server error.' });
});

// ─── Realtime (Socket.io) ─────────────────────────────────
initSocketServer(server);

// ─── Background systems ───────────────────────────────────
const workers: Worker[] = startWorkers();
startPaymentChecker();

const admissionTimer = setInterval(() => {
  void admitBatch();
}, env.ADMISSION_INTERVAL_MS);
admissionTimer.unref();

logger.info({ port: env.PORT, env: env.NODE_ENV }, 'IRCTC API starting');

server.listen(env.PORT, () => {
  logger.info(`🚀 Server listening on http://localhost:${env.PORT}`);
});

// ─── Graceful shutdown ────────────────────────────────────
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down gracefully…');
  clearInterval(admissionTimer);

  server.close();
  await stopWorkers(workers);
  await closeQueues();
  await stopPaymentChecker();
  await closeRedis();
  await closeDb();

  logger.info('Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// Fail fast if a background system dies hard
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception — exiting');
  process.exit(1);
});