import { Worker } from 'bullmq';
import { startBookingWorker } from './booking.worker';
import { startPaymentWorker } from './payment.worker';
import { startNotificationWorker } from './notification.worker';
import { logger } from '../../config/logger';

/**
 * Start all workers. Returns the worker instances for graceful shutdown.
 */
export function startWorkers(): Worker[] {
  const workers = [
    startBookingWorker(),
    startPaymentWorker(),
    startNotificationWorker(),
  ];
  logger.info(`Started ${workers.length} BullMQ workers`);
  return workers;
}

/**
 * Gracefully stop all workers.
 */
export async function stopWorkers(workers: Worker[]): Promise<void> {
  await Promise.all(workers.map((w) => w.close()));
  logger.info('All workers stopped');
}