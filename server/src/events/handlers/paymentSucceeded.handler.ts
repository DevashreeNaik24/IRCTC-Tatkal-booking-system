import { logger } from '../../config/logger';
import { activeHolds } from '../../config/metrics';
import { emitBookingUpdate } from '../../config/socket';
import { getBookingById, transitionBookingStatus } from '../../services/booking.service';
import { clearBookingHolds } from '../../services/payment.service';
import { releaseAdmissionSlot } from '../../services/waitingRoom.service';
import { publish } from '../eventBus';
import { BookingConfirmedPayload, ConfirmBookingPayload, JobName } from '../events';
import { BookingStatus } from '../../types/booking.types';
import { formatDate } from '../../utils/format';
import { getTrainById } from '../../services/train.service';

/**
 * Payment succeeded → booking CONFIRMED.
 *
 * Guards on the PENDING_PAYMENT → CONFIRMED transition, so a replay of this
 * event (or a race with an expiry event) can never double-confirm.
 */
export async function confirmBooking(payload: ConfirmBookingPayload): Promise<void> {
  const { bookingId, paymentId, amount } = payload;

  const booking = await getBookingById(bookingId);
  if (!booking) {
    logger.warn({ bookingId }, 'Confirm event for unknown booking — skipping');
    return;
  }
  if (booking.status !== BookingStatus.PENDING_PAYMENT) {
    logger.info({ bookingId, status: booking.status }, 'Booking not pending payment — confirm skipped (idempotent)');
    return;
  }

  const updated = await transitionBookingStatus(bookingId, BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED, paymentId);
  if (!updated) return;

  const journeyDate = formatDate(booking.journey_date);

  // Seat is now confirmed — remove the hold keys and free the admission slot
  await clearBookingHolds(bookingId, booking.user_id, booking.train_id, journeyDate, booking.travel_class);
  activeHolds.dec();
  await releaseAdmissionSlot(booking.user_id);

  const train = await getTrainById(booking.train_id);
  const trainName = train?.train_name || '';

  logger.info({ bookingId, paymentId, amount }, 'Booking CONFIRMED');

  try {
    emitBookingUpdate(booking.user_id, {
      bookingId,
      pnr: booking.pnr,
      status: BookingStatus.CONFIRMED,
      paymentId,
      amount,
    });
  } catch {
    // Socket layer may not be initialized
  }

  const confirmedPayload: BookingConfirmedPayload = {
    bookingId,
    userId: booking.user_id,
    pnr: booking.pnr,
    trainName,
    passengerName: booking.passenger_name,
    paymentId,
    amount,
  };

  await publish(JobName.BOOKING_CONFIRMED, confirmedPayload as unknown as Record<string, unknown>);
}