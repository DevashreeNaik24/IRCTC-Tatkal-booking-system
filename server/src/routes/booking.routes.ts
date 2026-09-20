import { Router } from 'express';
import {
  listBookingsHandler,
  getBookingHandler,
  cancelBookingHandler,
} from '../controllers/booking.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

router.get('/', listBookingsHandler);
router.get('/:id', getBookingHandler);
router.post('/:id/cancel', cancelBookingHandler);

export default router;