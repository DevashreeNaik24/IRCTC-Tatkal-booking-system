import { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { logger } from '../config/logger';

/**
 * Back-pressure middleware — Load shedding when the system is overloaded.
 *
 * Monitors BullMQ queue depth and rejects requests with HTTP 503
 * when the system is under excessive pressure.
 */
export async function backPressureMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Check booking queue depth
    const waitingCount = await redis.llen('bull:booking-queue:wait');
    const activeCount = await redis.llen('bull:booking-queue:active');
    const totalQueueDepth = waitingCount + activeCount;

    const threshold = env.MAX_QUEUE_DEPTH * env.BACKPRESSURE_THRESHOLD;

    if (totalQueueDepth > threshold) {
      logger.warn(
        { totalQueueDepth, threshold, maxQueue: env.MAX_QUEUE_DEPTH },
        'Back-pressure activated — shedding load'
      );

      const retryAfter = Math.ceil(Math.random() * 10) + 5; // 5–15 seconds jitter

      res.setHeader('Retry-After', retryAfter);
      res.status(503).json({
        success: false,
        message: 'System is experiencing high load. Please retry shortly.',
        retryAfter,
      });
      return;
    }

    next();
  } catch (err) {
    logger.error({ err }, 'Back-pressure check failed');
    // Fail open — don't block requests if we can't check
    next();
  }
}
