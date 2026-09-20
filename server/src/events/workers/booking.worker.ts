import { Worker } from 'bullmq';
import { bullRedis } from '../../config/redis';
import { logger } from '../../config/logger';
import { bookingQueue, wireQueueObservability } from '../eventBus';
import { JobName } from '../events';
import { persistBooking } from '../handlers/seatReserved.handler';
import { confirmBooking } from '../handlers/paymentSucceeded.handler';
import { failBooking, cancelBooking } from '../handlers/paymentFailed.handler';
import { promoteBooking } from '../handlers/waitlistPromoted.handler';
import { handleBookingConfirmed } from '../handlers/bookingConfirmed.handler';
import { handleSeatReleased } from '../handlers/seatReleased.handler';

/**
 * Booking lifecycle worker. Every handler is idempotent (guarded state
 * transitions / ON CONFLICT inserts), so replays and retries are safe.
 */
export function startBookingWorker(): Worker {
  const worker = new Worker(
    'booking',
    async (job) => {
      switch (job.name) {
        case JobName.PERSIST_BOOKING:
          return persistBooking(job.data);
        case JobName.CONFIRM_BOOKING:
          return confirmBooking(job.data);
        case JobName.FAIL_BOOKING:
          return failBooking(job.data);
        case JobName.CANCEL_BOOKING:
          return cancelBooking(job.data);
        case JobName.WAITLIST_PROMOTED:
          return promoteBooking(job.data);
        case JobName.BOOKING_CONFIRMED:
          return handleBookingConfirmed(job.data);
        case JobName.SEAT_RELEASED:
          return handleSeatReleased(job.data);
        default:
          logger.warn({ jobName: job.name }, 'Unknown booking job name');
          return;
      }
    },
    {
      connection: bullRedis,
      concurrency: 10,
      lockDuration: 30000,
    }
  );

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id, jobName: job.name }, 'Booking job completed');
  });
  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, jobName: job?.name, err }, 'Booking job failed');
  });

  wireQueueObservability(bookingQueue, 'booking');
  logger.info('Booking worker started');
  return worker;
}