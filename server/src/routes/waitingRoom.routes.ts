import { Router } from 'express';
import {
  enterQueueHandler,
  queueStatusHandler,
  pollTokenHandler,
  leaveQueueHandler,
} from '../controllers/waitingRoom.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

router.post('/enter', enterQueueHandler);
router.get('/status', queueStatusHandler);
router.get('/token', pollTokenHandler);
router.delete('/leave', leaveQueueHandler);

export default router;