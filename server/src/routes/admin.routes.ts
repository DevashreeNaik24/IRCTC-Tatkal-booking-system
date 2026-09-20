import { Router } from 'express';
import {
  windowStatusHandler,
  openWindowHandler,
  closeWindowHandler,
  resetWindowHandler,
  metricsHandler,
  reconcilePaymentsHandler,
} from '../controllers/admin.controller';
import { authMiddleware } from '../middleware/auth';
import { adminOnlyMiddleware } from '../middleware/adminOnly';

const router = Router();

router.use(authMiddleware, adminOnlyMiddleware);

router.get('/window', windowStatusHandler);
router.post('/window/open', openWindowHandler);
router.post('/window/close', closeWindowHandler);
router.post('/window/reset', resetWindowHandler);
router.get('/metrics', metricsHandler);
router.post('/reconcile-payments', reconcilePaymentsHandler);

export default router;