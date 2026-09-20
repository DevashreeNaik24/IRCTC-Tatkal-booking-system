import { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis';
import { logger } from '../config/logger';

/**
 * Idempotency middleware — prevents duplicate booking operations.
 *
 * Uses the `Idempotency-Key` header to cache responses in Redis.
 * If the same key is received again within 24 hours, the cached response
 * is replayed without re-executing the handler.
 */
export function idempotencyMiddleware(req: Request, res: Response, next: NextFunction): void {
  const idempotencyKey = req.headers['idempotency-key'] as string;

  if (!idempotencyKey) {
    res.status(400).json({
      success: false,
      message: 'Idempotency-Key header is required for this endpoint.',
    });
    return;
  }

  const cacheKey = `idempotency:${idempotencyKey}`;

  redis.get(cacheKey)
    .then((cached) => {
      if (cached) {
        // Cache HIT — replay the stored response
        const { statusCode, body } = JSON.parse(cached);
        logger.info({ idempotencyKey }, 'Idempotency cache HIT — replaying response');
        res.setHeader('X-Idempotency-Replayed', 'true');
        res.status(statusCode).json(body);
        return;
      }

      // Cache MISS — intercept res.json to capture the response
      const originalJson = res.json.bind(res);
      res.json = function (body: any) {
        // Store in Redis with 24-hour TTL
        const payload = JSON.stringify({ statusCode: res.statusCode, body });
        redis.set(cacheKey, payload, 'EX', 86400).catch((err) => {
          logger.error({ err, idempotencyKey }, 'Failed to store idempotency response');
        });
        return originalJson(body);
      };

      next();
    })
    .catch((err) => {
      logger.error({ err }, 'Idempotency middleware Redis error');
      // On Redis failure, proceed without idempotency (fail-open)
      next();
    });
}
