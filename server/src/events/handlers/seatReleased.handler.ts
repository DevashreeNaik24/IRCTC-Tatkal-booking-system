import { logger } from '../../config/logger';
import { SeatReleasedPayload } from '../events';

/**
 * A seat was explicitly released (e.g. cancellation or admin action).
 * Inventory increment and waitlist promotion were already performed
 * atomically inside releaseSeat.lua — this handler covers observability.
 */
export async function handleSeatReleased(payload: SeatReleasedPayload): Promise<void> {
  const { bookingId, trainId, journeyDate, travelClass, action, promotedBookingId, remainingSeats } = payload;

  logger.info(
    { bookingId, trainId, journeyDate, travelClass, action, promotedBookingId, remainingSeats },
    'Seat released'
  );
}