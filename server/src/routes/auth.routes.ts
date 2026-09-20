import { Router } from 'express';
import {
  signupHandler,
  loginHandler,
  refreshHandler,
  meHandler,
} from '../controllers/auth.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.post('/signup', signupHandler);
router.post('/login', loginHandler);
router.post('/refresh', refreshHandler);
router.get('/me', authMiddleware, meHandler);

export default router;