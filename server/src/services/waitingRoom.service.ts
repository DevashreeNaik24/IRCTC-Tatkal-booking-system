import { v4 as uuidv4 } from 'uuid';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { emitWaitingRoomUpdate } from '../config/socket';
import { RedisKeys } from './inventory.service';
import { admittedUsers, admissionQueueSize } from '../config/metrics';
import { loadLuaScript } from '../utils/loadLua';

const admitUserScript = loadLuaScript('admitUser.lua');

/** Registry of queues with waiting users, so admitBatch knows what to drain. */
export const ADMISSION_QUEUES_SET = 'admission:queues';
export const ADMISSION_COUNTER_KEY = 'admission:active_count';

const ACTIVE_QUEUE_TTL_SECONDS = 6 * 60 * 60; // 6h — a queue key is reused across the window

export interface QueueEntryResult {
  admitted: boolean;
  token?: string;
  position?: number;
  queueLength?: number;
}

export interface QueueStatus {
  position: number;
  queueLength: number;
  estimatedWaitSeconds: number;
}

/**
 * Place a user in the waiting room.
 * Runs the atomic `admitUser.lua`: admits immediately if under capacity,
 * otherwise places the user in the FIFO queue.
 */
export async function enterQueue(
  userId: number,
  trainId: number,
  journeyDate: string,
  travelClass: string
): Promise<QueueEntryResult> {
  const queueKey = RedisKeys.admissionQueue(trainId, journeyDate, travelClass);
  const token = uuidv4();

  // Register the queue so admitBatch can find it
  await redis.sadd(ADMISSION_QUEUES_SET, queueKey);
  await redis.expire(ADMISSION_QUEUES_SET, ACTIVE_QUEUE_TTL_SECONDS);

  const result = await redis.eval(
    admitUserScript,
    2,
    ADMISSION_COUNTER_KEY,
    queueKey,
    env.MAX_CONCURRENT_BOOKINGS,
    userId.toString(),
    token,
    env.ADMISSION_TOKEN_TTL_SECONDS
  ) as [number, number | string];

  const status = result[0];
  const data = result[1];

  if (status === 1) {
    // Admitted immediately — persist token mapping for pollToken
    await redis.set(
      `admission:user_token:${userId}:${queueKey}`,
      data as string,
      'EX',
      env.ADMISSION_TOKEN_TTL_SECONDS
    );
    admittedUsers.inc();
    logger.info({ userId, trainId, journeyDate, travelClass }, 'User admitted to booking path');
    return { admitted: true, token: data as string };
  }

  const position = (data as number) + 1; // Lua returns 0-indexed rank
  await updateQueueMetrics();
  logger.info({ userId, position, queueKey }, 'User queued in waiting room');
  return { admitted: false, position, queueLength: position };
}

/**
 * Check a user's current queue position and estimated wait.
 */
export async function checkPosition(
  userId: number,
  trainId: number,
  journeyDate: string,
  travelClass: string
): Promise<QueueStatus | null> {
  const queueKey = RedisKeys.admissionQueue(trainId, journeyDate, travelClass);
  const rank = await redis.zrank(queueKey, userId.toString());

  if (rank === null) {
    // Not in the queue — maybe already admitted
    return null;
  }

  const queueLength = await redis.zcard(queueKey);
  const batchesAhead = Math.ceil(rank / env.ADMISSION_BATCH_SIZE);
  const estimatedWaitSeconds = Math.ceil((batchesAhead * env.ADMISSION_INTERVAL_MS) / 1000);

  return {
    position: rank + 1,
    queueLength,
    estimatedWaitSeconds,
  };
}

/**
 * Poll for an admission token — the client calls this on an interval.
 * Returns the token once the user has been admitted by admitBatch.
 */
export async function pollToken(
  userId: number,
  trainId: number,
  journeyDate: string,
  travelClass: string
): Promise<{ admitted: boolean; token?: string; status?: QueueStatus | null }> {
  const queueKey = RedisKeys.admissionQueue(trainId, journeyDate, travelClass);
  const token = await redis.get(`admission:user_token:${userId}:${queueKey}`);

  if (token) {
    // Verify the token is still valid (not consumed/expired)
    const tokenData = await redis.get(RedisKeys.admissionToken(token));
    if (tokenData) {
      return { admitted: true, token };
    }
  }

  const status = await checkPosition(userId, trainId, journeyDate, travelClass);
  return { admitted: false, status };
}

/**
 * Validate that an admission token belongs to a user (used by tests/admin).
 * The admissionControl middleware performs its own inline validation.
 */
export async function validateToken(userId: number, token: string): Promise<boolean> {
  const tokenData = await redis.get(RedisKeys.admissionToken(token));
  if (!tokenData) return false;
  try {
    const parsed = JSON.parse(tokenData) as { userId: number };
    return parsed.userId === userId;
  } catch {
    return false;
  }
}

/**
 * Remove a user from the waiting queue voluntarily.
 */
export async function leaveQueue(
  userId: number,
  trainId: number,
  journeyDate: string,
  travelClass: string
): Promise<boolean> {
  const queueKey = RedisKeys.admissionQueue(trainId, journeyDate, travelClass);
  const removed = await redis.zrem(queueKey, userId.toString());
  await redis.del(`admission:user_token:${userId}:${queueKey}`);
  await updateQueueMetrics();
  logger.info({ userId, removed }, 'User left waiting room');
  return removed === 1;
}

/**
 * Promote the next batch of users from the waiting queues into the booking path.
 *
 * Runs periodically (ADMISSION_INTERVAL_MS). For each registered queue, pops
 * users FIFO while under MAX_CONCURRENT_BOOKINGS and grants each an
 * admission token. Guarded against overlapping runs.
 */
export async function admitBatch(): Promise<number> {
  let admitted = 0;

  try {
    const queueKeys = await redis.smembers(ADMISSION_QUEUES_SET);

    for (const queueKey of queueKeys) {
      // Drop stale queues (e.g. for past journey dates) from the registry
      const ttl = await redis.ttl(queueKey);
      if (ttl < 0) {
        await redis.srem(ADMISSION_QUEUES_SET, queueKey);
        continue;
      }

      while (true) {
        const activeCount = parseInt((await redis.get(ADMISSION_COUNTER_KEY)) || '0', 10);
        if (activeCount >= env.MAX_CONCURRENT_BOOKINGS) break;

        const popped = await redis.zpopmin(queueKey);
        if (popped.length === 0) break;

        const userIdStr = popped[0];
        const token = uuidv4();

        await redis.incr(ADMISSION_COUNTER_KEY);
        await redis.set(
          RedisKeys.admissionToken(token),
          JSON.stringify({ userId: Number(userIdStr), grantedAt: Date.now() }),
          'EX',
          env.ADMISSION_TOKEN_TTL_SECONDS
        );
        await redis.set(
          `admission:user_token:${userIdStr}:${queueKey}`,
          token,
          'EX',
          env.ADMISSION_TOKEN_TTL_SECONDS
        );

        admittedUsers.inc();
        admitted += 1;

        try {
          emitWaitingRoomUpdate(Number(userIdStr), { position: 0, estimatedWait: 0, admitted: true });
        } catch {
          // Socket layer not initialized
        }

        logger.info({ userId: Number(userIdStr), queueKey }, 'User admitted from waiting room batch');
      }
    }

    if (admitted > 0) {
      await updateQueueMetrics();
      logger.info({ admitted }, 'Waiting room batch admission complete');
    }
  } catch (err) {
    logger.error({ err }, 'Waiting room batch admission failed');
  }

  return admitted;
}

/**
 * Release an admission slot when a user finishes their booking flow
 * (payment succeeded / booking released). Guarded by the per-user cleanup
 * key so concurrent handlers can't double-decrement.
 */
export async function releaseAdmissionSlot(userId: number): Promise<void> {
  const cleanupKey = `admission:cleanup:${userId}`;
  const removed = await redis.del(cleanupKey);
  if (removed === 1) {
    const remaining = await redis.decr(ADMISSION_COUNTER_KEY);
    logger.debug({ userId, remaining }, 'Admission slot released');
  }
}

/**
 * Update the admission queue size gauge.
 */
export async function updateQueueMetrics(): Promise<void> {
  try {
    const queueKeys = await redis.smembers(ADMISSION_QUEUES_SET);
    let total = 0;
    for (const key of queueKeys) {
      total += await redis.zcard(key);
    }
    admissionQueueSize.set(total);
  } catch (err) {
    logger.error({ err }, 'Failed to update admission queue metrics');
  }
}