import Redis from 'ioredis';
import { env } from './env';
import { logger } from './logger';

/**
 * Main Redis client for commands (inventory, holds, idempotency).
 */
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    const delay = Math.min(times * 200, 5000);
    logger.warn({ attempt: times, delay }, 'Redis reconnecting...');
    return delay;
  },
  enableReadyCheck: true,
  lazyConnect: false,
});

/**
 * Separate Redis client for BullMQ (BullMQ requires its own connection).
 */
export const bullRedis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // BullMQ requires this
  retryStrategy(times: number) {
    return Math.min(times * 200, 5000);
  },
});

/**
 * Subscriber client for keyspace notifications and pub/sub.
 */
export const redisSub = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    return Math.min(times * 200, 5000);
  },
});

redis.on('error', (err) => logger.error({ err }, 'Redis client error'));
redis.on('ready', () => logger.info('✅ Redis connection established'));

bullRedis.on('error', (err) => logger.error({ err }, 'BullMQ Redis error'));
redisSub.on('error', (err) => logger.error({ err }, 'Redis subscriber error'));

/**
 * Test Redis connectivity.
 */
export async function testRedisConnection(): Promise<boolean> {
  try {
    const pong = await redis.ping();
    if (pong === 'PONG') {
      logger.info('✅ Redis PING → PONG');
      return true;
    }
    return false;
  } catch (err) {
    logger.error({ err }, '❌ Redis connection failed');
    return false;
  }
}

/**
 * Gracefully close all Redis connections.
 */
export async function closeRedis(): Promise<void> {
  await Promise.all([
    redis.quit(),
    bullRedis.quit(),
    redisSub.quit(),
  ]);
  logger.info('Redis connections closed');
}
