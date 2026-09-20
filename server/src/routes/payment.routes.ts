import { Router } from 'express';
import {
  initiatePaymentHandler,
  simulatePaymentHandler,
  webhookHandler,
  paymentStatusHandler,
} from '../controllers/payment.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Mock gateway callback — intentionally unauthenticated (in production this
// verifies a provider signature instead).
router.post('/webhook', webhookHandler);

router.post('/:bookingId/initiate', authMiddleware, initiatePaymentHandler);
router.post('/:bookingId/simulate', authMiddleware, simulatePaymentHandler);
router.get('/:paymentId/status', paymentStatusHandler);

export default router;