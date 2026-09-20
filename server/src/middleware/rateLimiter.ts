import { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { AuthRequest } from '../types/common.types';

/**
 * Multi-tier sliding window rate limiter using Redis.
 *
 * - Per-IP: general request rate limiting
 * - Per-user: tighter limits on reservation attempts
 * - Global: back-pressure when system is overloaded
 */
export function rateLimiter(type: 'ip' | 'user-reservation' = 'ip') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      let key: string;
      let limit: number;
      let windowSeconds: number;

      if (type === 'user-reservation') {
        const authReq = req as AuthRequest;
        if (!authReq.user) {
          next();
          return;
        }
        key = `ratelimit:user:${authReq.user.id}:reservation`;
        limit = env.RATE_LIMIT_PER_USER_RESERVATION;
        windowSeconds = env.RATE_LIMIT_WINDOW_SECONDS;
      } else {
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        key = `ratelimit:ip:${ip}`;
        limit = env.RATE_LIMIT_PER_IP;
        windowSeconds = env.RATE_LIMIT_WINDOW_SECONDS;
      }

      const now = Date.now();
      const windowStart = now - windowSeconds * 1000;

      // Sliding window using sorted set
      const pipeline = redis.pipeline();
      pipeline.zremrangebyscore(key, 0, windowStart); // Remove expired entries
      pipeline.zadd(key, now, `${now}:${Math.random()}`); // Add current request
      pipeline.zcard(key); // Count entries in window
      pipeline.expire(key, windowSeconds); // Set TTL on the key

      const results = await pipeline.exec();
      const count = (results?.[2]?.[1] as number) || 0;

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', limit);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - count));
      res.setHeader('X-RateLimit-Reset', Math.ceil((now + windowSeconds * 1000) / 1000));

      if (count > limit) {
        logger.warn({ key, count, limit, type }, 'Rate limit exceeded');
        res.status(429).json({
          success: false,
          message: 'Too many requests. Please try again later.',
          retryAfter: windowSeconds,
        });
        return;
      }

      next();
    } catch (err) {
      logger.error({ err }, 'Rate limiter error');
      // Fail open on Redis errors
      next();
    }
  };
}
