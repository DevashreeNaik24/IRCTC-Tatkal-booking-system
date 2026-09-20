import { Router } from 'express';
import {
  searchTrainsHandler,
  getTrainHandler,
  availabilityHandler,
  windowStatusHandler,
} from '../controllers/train.controller';

const router = Router();

// Static paths before /:id
router.get('/search', searchTrainsHandler);
router.get('/window', windowStatusHandler);

router.get('/:id/availability', availabilityHandler);
router.get('/:id', getTrainHandler);

export default router;