import { Router } from 'express';
import { createReservationHandler } from '../controllers/reservation.controller';
import { authMiddleware } from '../middleware/auth';
import { botProtectionMiddleware } from '../middleware/botProtection';
import { admissionControlMiddleware } from '../middleware/admissionControl';
import { rateLimiter } from '../middleware/rateLimiter';
import { idempotencyMiddleware } from '../middleware/idempotency';

const router = Router();

/**
 * POST /api/reservations — the Tatkal hot path.
 * Guard chain: auth → bot protection → admission control (waiting room) →
 * per-IP + per-user rate limits → idempotency → atomic Lua reservation.
 */
router.post(
  '/',
  authMiddleware,
  botProtectionMiddleware,
  admissionControlMiddleware,
  rateLimiter('ip'),
  rateLimiter('user-reservation'),
  idempotencyMiddleware,
  createReservationHandler
);

export default router;