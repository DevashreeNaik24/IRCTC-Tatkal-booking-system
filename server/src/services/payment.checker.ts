import { redis, redisSub } from '../config/redis';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { publish } from '../events/eventBus';
import { JobName } from '../events/events';
import { paymentExpiryTotal } from '../config/metrics';
import { getExpiredBookings } from './booking.service';
import { releaseAdmissionSlot } from './waitingRoom.service';
import { RedisKeys } from './inventory.service';

const EXPIRED_CHANNEL = '__keyevent@0__:expired';

let fallbackTimer: NodeJS.Timeout | null = null;
let started = false;

/**
 * Handle an expired seat hold: the hold key's TTL elapsed without payment.
 * Publishing to the FAIL_BOOKING queue is idempotent — the booking worker
 * guards on the DB status transition, so replay/duplicate events are safe.
 */
export async function handleExpiredHold(bookingId: string): Promise<void> {
  paymentExpiryTotal.inc();
  logger.info({ bookingId }, 'Seat hold expired — releasing seat');
  await publish(JobName.FAIL_BOOKING, {
    bookingId,
    reason: 'payment_timeout',
  });
}

/**
 * Primary path: Redis keyspace notifications. When a `hold:*` key expires,
 * the hold's TTL is the payment deadline, so the seat must be released.
 * `admission:cleanup:*` expiries free an admission slot (user abandoned flow).
 */
async function subscribeToExpiryEvents(): Promise<void> {
  try {
    await redisSub.subscribe(EXPIRED_CHANNEL);
    redisSub.on('message', (channel, key) => {
      if (channel !== EXPIRED_CHANNEL) return;

      if (key.startsWith('hold:')) {
        const bookingId = key.slice('hold:'.length);
        void handleExpiredHold(bookingId).catch((err) =>
          logger.error({ err, bookingId }, 'Failed to handle expired hold')
        );
      } else if (key.startsWith('admission:cleanup:')) {
        // User abandoned the flow before finishing — free their slot
        const userId = Number(key.slice('admission:cleanup:'.length));
        redis.decr('admission:active_count').catch((err) =>
          logger.error({ err, userId }, 'Failed to decrement admission counter on cleanup expiry')
        );
      }
    });
    logger.info('Subscribed to Redis keyspace expiry events');
  } catch (err) {
    logger.error({ err }, 'Failed to subscribe to keyspace notifications — relying on polling fallback');
  }
}

/**
 * Fallback path: periodic reconciliation for missed events. Scans PG for
 * PENDING_PAYMENT bookings past their hold deadline whose Redis hold key is
 * already gone (the expiry event was missed) — releases them safely.
 */
export async function reconcileExpiredBookings(): Promise<void> {
  try {
    const expired = await getExpiredBookings();
    for (const booking of expired) {
      const holdKey = RedisKeys.hold(booking.id);
      const exists = await redis.exists(holdKey);

      if (exists === 0) {
        // Hold key gone — either the expiry event was missed or already handled.
        // The FAIL_BOOKING handler's DB guard makes this safe to re-issue.
        logger.debug({ bookingId: booking.id }, 'Reconciling missed hold expiry');
        await handleExpiredHold(booking.id);
      } else {
        // Hold still present but DB says expired — delete it to trigger release
        await redis.del(holdKey);
      }
    }
  } catch (err) {
    logger.error({ err }, 'Payment expiry reconciliation failed');
  }
}

/**
 * Start the hybrid payment checker:
 * 1. Keyspace-notification subscription (primary, low latency).
 * 2. Polling reconciliation every PAYMENT_CHECKER_INTERVAL_MS (fallback).
 */
export function startPaymentChecker(): void {
  if (started) return;
  started = true;

  void subscribeToExpiryEvents();

  fallbackTimer = setInterval(() => {
    void reconcileExpiredBookings();
  }, env.PAYMENT_CHECKER_INTERVAL_MS);
  fallbackTimer.unref();

  logger.info('Payment checker started (keyspace notifications + polling fallback)');
}

/**
 * Stop the payment checker (graceful shutdown / tests).
 */
export async function stopPaymentChecker(): Promise<void> {
  if (fallbackTimer) {
    clearInterval(fallbackTimer);
    fallbackTimer = null;
  }
  started = false;
  try {
    await redisSub.unsubscribe(EXPIRED_CHANNEL);
  } catch {
    // ignore
  }
  logger.info('Payment checker stopped');
}