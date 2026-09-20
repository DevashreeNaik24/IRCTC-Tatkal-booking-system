import { Worker } from 'bullmq';
import { bullRedis } from '../../config/redis';
import { logger } from '../../config/logger';
import { notificationQueue, wireQueueObservability } from '../eventBus';
import { JobName } from '../events';
import { sendNotification } from '../../services/notification.service';

/**
 * Notification worker — sends email/SMS stubs and socket fan-out.
 */
export function startNotificationWorker(): Worker {
  const worker = new Worker(
    'notification',
    async (job) => {
      switch (job.name) {
        case JobName.NOTIFY:
          return sendNotification(job.data);
        default:
          logger.warn({ jobName: job.name }, 'Unknown notification job name');
          return;
      }
    },
    {
      connection: bullRedis,
      concurrency: 5,
      lockDuration: 30000,
    }
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, jobName: job?.name, err }, 'Notification job failed');
  });

  wireQueueObservability(notificationQueue, 'notification');
  logger.info('Notification worker started');
  return worker;
}