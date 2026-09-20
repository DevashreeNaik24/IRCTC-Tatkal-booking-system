import { Queue, QueueEvents, Job } from 'bullmq';
import { bullRedis } from '../config/redis';
import { logger } from '../config/logger';
import { queueDepth } from '../config/metrics';
import { JobName, JobNameType } from './events';

/**
 * Named queues per domain for isolation.
 * - booking:      all booking lifecycle mutations (persist, confirm, fail, release, promote)
 * - payment:      periodic payment-expiry reconciliation
 * - notification: user-facing notifications (email/SMS stubs, socket events)
 * - dead-letter:  failed jobs after max attempts (for replay/inspection)
 */
const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 10000 },
};

export const bookingQueue = new Queue('booking', {
  connection: bullRedis,
  defaultJobOptions,
});

export const paymentQueue = new Queue('payment', {
  connection: bullRedis,
  defaultJobOptions,
});

export const notificationQueue = new Queue('notification', {
  connection: bullRedis,
  defaultJobOptions,
});

export const deadLetterQueue = new Queue('dead-letter', {
  connection: bullRedis,
  defaultJobOptions,
});

const queueFor = (jobName: JobNameType): Queue => {
  switch (jobName) {
    case JobName.CHECK_PAYMENT_EXPIRY:
      return paymentQueue;
    case JobName.NOTIFY:
      return notificationQueue;
    default:
      return bookingQueue;
  }
};

/**
 * Publish an event/job to the appropriate queue.
 * All jobs are idempotent by construction — handlers guard on state transitions.
 */
export async function publish(
  jobName: JobNameType,
  payload: Record<string, unknown>,
  opts?: { delay?: number }
): Promise<Job | undefined> {
  const queue = queueFor(jobName);
  const job = await queue.add(jobName, payload, { delay: opts?.delay ?? 0 });
  updateQueueMetrics();
  logger.debug({ queue: queue.name, jobName, jobId: job.id }, 'Event published');
  return job;
}

/**
 * Update Prometheus gauges with current queue depths.
 */
export async function updateQueueMetrics(): Promise<void> {
  try {
    const [booking, payment, notification] = await Promise.all([
      bookingQueue.getJobCounts('waiting', 'active', 'delayed'),
      paymentQueue.getJobCounts('waiting', 'active', 'delayed'),
      notificationQueue.getJobCounts('waiting', 'active', 'delayed'),
    ]);
    const depth = (c: Record<string, number>) => (c.waiting || 0) + (c.active || 0) + (c.delayed || 0);
    queueDepth.set({ queue_name: 'booking' }, depth(booking));
    queueDepth.set({ queue_name: 'payment' }, depth(payment));
    queueDepth.set({ queue_name: 'notification' }, depth(notification));
  } catch (err) {
    logger.error({ err }, 'Failed to update queue metrics');
  }
}

/**
 * Wire dead-lettering + queue metrics for a worker's queue.
 * Failed jobs that exhaust their attempts are moved to the dead-letter queue
 * for inspection/replay, and the original job is removed.
 */
export function wireQueueObservability(queue: Queue, queueName: string): void {
  const events = new QueueEvents(queue.name, { connection: bullRedis.duplicate() });

  events.on('failed', async ({ jobId, failedReason }) => {
    const job = await queue.getJob(jobId);
    if (!job) return;
    const attempts = job.attemptsMade || 0;
    const maxAttempts = job.opts.attempts || defaultJobOptions.attempts;
    if (attempts >= maxAttempts) {
      logger.error({ queue: queueName, jobId, failedReason }, 'Job exhausted retries — moving to dead-letter queue');
      await deadLetterQueue.add(`dlq:${job.name}`, {
        originalQueue: queueName,
        originalJobId: jobId,
        payload: job.data,
        failedReason,
        failedAt: new Date().toISOString(),
      });
      await job.remove();
    }
  });

  // Periodically refresh queue depth gauges
  setInterval(() => { void updateQueueMetrics(); }, 10_000).unref();
}

/**
 * Graceful shutdown: drain all queues.
 */
export async function closeQueues(): Promise<void> {
  const queues = [bookingQueue, paymentQueue, notificationQueue, deadLetterQueue];
  await Promise.all(queues.map((q) => q.close()));
  logger.info('BullMQ queues closed');
}