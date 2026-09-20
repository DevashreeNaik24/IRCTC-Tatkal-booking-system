import { Worker } from 'bullmq';
import { bullRedis } from '../../config/redis';
import { logger } from '../../config/logger';
import { paymentQueue, wireQueueObservability } from '../eventBus';
import { JobName } from '../events';
import { reconcileExpiredBookings } from '../../services/payment.checker';

/**
 * Payment domain worker. The expiry checker normally runs on a timer
 * (see payment.checker.ts); this worker also accepts manual/admin-triggered
 * reconciliation jobs for on-demand sweeps.
 */
export function startPaymentWorker(): Worker {
  const worker = new Worker(
    'payment',
    async (job) => {
      switch (job.name) {
        case JobName.CHECK_PAYMENT_EXPIRY:
          return reconcileExpiredBookings();
        default:
          logger.warn({ jobName: job.name }, 'Unknown payment job name');
          return;
      }
    },
    {
      connection: bullRedis,
      concurrency: 2,
      lockDuration: 30000,
    }
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, jobName: job?.name, err }, 'Payment job failed');
  });

  wireQueueObservability(paymentQueue, 'payment');
  logger.info('Payment worker started');
  return worker;
}