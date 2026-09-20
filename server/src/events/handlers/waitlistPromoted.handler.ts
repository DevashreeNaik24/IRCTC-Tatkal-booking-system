import { logger } from '../../config/logger';
import { activeHolds } from '../../config/metrics';
import { emitBookingUpdate } from '../../config/socket';
import { getBookingById, transitionBookingStatus } from '../../services/booking.service';
import { publish } from '../eventBus';
import { JobName, NotificationPayload, WaitlistPromotedPayload } from '../events';
import { BookingStatus } from '../../types/booking.types';

/**
 * A seat became available and was handed to the oldest waitlisted booking
 * (releaseSeat.lua already created the hold). Update the DB and tell the
 * user they now have a payment window.
 */
export async function promoteBooking(payload: WaitlistPromotedPayload): Promise<void> {
  const { bookingId, holdExpiresAt } = payload;

  const booking = await getBookingById(bookingId);
  if (!booking) {
    logger.warn({ bookingId }, 'Promote event for unknown booking — skipping');
    return;
  }

  // WAITLISTED → WAITLIST_PROMOTED (guarded, idempotent)
  const promoted = await transitionBookingStatus(bookingId, BookingStatus.WAITLISTED, BookingStatus.WAITLIST_PROMOTED);
  if (!promoted) {
    logger.info({ bookingId, status: booking.status }, 'Booking not waitlisted — promote skipped (idempotent)');
    return;
  }

  // WAITLIST_PROMOTED → PENDING_PAYMENT with a fresh hold deadline
  const updated = await transitionBookingStatus(
    bookingId,
    BookingStatus.WAITLIST_PROMOTED,
    BookingStatus.PENDING_PAYMENT,
    undefined,
    holdExpiresAt
  );
  if (!updated) return;

  // The Lua script already created the hold — track it in the gauge
  activeHolds.inc();

  logger.info({ bookingId, holdExpiresAt }, 'Waitlisted booking promoted to pending payment');

  try {
    emitBookingUpdate(booking.user_id, {
      bookingId,
      pnr: booking.pnr,
      status: BookingStatus.PENDING_PAYMENT,
      holdExpiresAt,
    });
  } catch {
    // Socket layer may not be initialized
  }

  const notification: NotificationPayload = {
    userId: booking.user_id,
    type: 'waitlist_promoted',
    title: 'Seat available — pay now!',
    message: 'A seat opened up and you have been promoted. Complete payment before the window expires.',
    data: { bookingId, pnr: booking.pnr, holdExpiresAt },
  };
  await publish(JobName.NOTIFY, notification as unknown as Record<string, unknown>);
}