import { Router } from 'express';
import { testDbConnection } from '../config/db';
import { testRedisConnection } from '../config/redis';
import { metricsRegistry } from '../config/metrics';

const router = Router();

/**
 * GET /health — liveness probe (always 200 once the process is up).
 */
router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /ready — readiness probe (checks Redis + PostgreSQL connectivity).
 */
router.get('/ready', async (_req, res) => {
  const [db, redis] = await Promise.all([testDbConnection(), testRedisConnection()]);
  if (!db || !redis) {
    res.status(503).json({ status: 'not_ready', db, redis });
    return;
  }
  res.json({ status: 'ready', db, redis });
});

/**
 * GET /metrics — Prometheus scrape endpoint (text exposition format).
 * Public by design so Prometheus can scrape it without auth.
 */
router.get('/metrics', async (_req, res) => {
  res.set('Content-Type', metricsRegistry.contentType);
  res.send(await metricsRegistry.metrics());
});

export default router;