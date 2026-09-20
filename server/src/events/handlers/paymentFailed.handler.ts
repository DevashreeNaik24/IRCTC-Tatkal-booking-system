import { logger } from '../../config/logger';
import { activeHolds } from '../../config/metrics';
import { emitBookingUpdate } from '../../config/socket';
import { getBookingById, transitionBookingStatus } from '../../services/booking.service';
import { clearBookingHolds } from '../../services/payment.service';
import { releaseSeat } from '../../services/reservation.service';
import { releaseAdmissionSlot } from '../../services/waitingRoom.service';
import { publish } from '../eventBus';
import { FailBookingPayload, JobName, NotificationPayload } from '../events';
import { BookingStatus } from '../../types/booking.types';
import { formatDate } from '../../utils/format';
import { env } from '../../config/env';

/**
 * Payment failed or timed out → booking PAYMENT_EXPIRED, seat released.
 *
 * The release is atomic (releaseSeat.lua) and promotes the oldest waitlisted
 * booking in the same script — zero race window between freeing the seat and
 * handing it to the next user.
 */
export async function failBooking(payload: FailBookingPayload): Promise<void> {
  const { bookingId, paymentId, reason } = payload;

  const booking = await getBookingById(bookingId);
  if (!booking) {
    logger.warn({ bookingId }, 'Fail event for unknown booking — skipping');
    return;
  }
  if (booking.status !== BookingStatus.PENDING_PAYMENT) {
    logger.info(
      { bookingId, status: booking.status },
      'Booking not pending payment — release skipped (idempotent)'
    );
    return;
  }

  const updated = await transitionBookingStatus(
    bookingId,
    BookingStatus.PENDING_PAYMENT,
    BookingStatus.PAYMENT_EXPIRED,
    paymentId
  );
  if (!updated) return;

  const journeyDate = formatDate(booking.journey_date);

  // Free resources: holds, admission slot, active-holds gauge
  await clearBookingHolds(bookingId, booking.user_id, booking.train_id, journeyDate, booking.travel_class);
  activeHolds.dec();
  await releaseAdmissionSlot(booking.user_id);

  // Atomic release + waitlist promotion
  const released = await releaseSeat(
    booking.train_id,
    journeyDate,
    booking.travel_class,
    bookingId
  );

  if (released.promotedBookingId) {
    const holdExpiresAt = new Date(Date.now() + env.PAYMENT_HOLD_TTL_SECONDS * 1000).toISOString();
    await publish(JobName.WAITLIST_PROMOTED, {
      bookingId: released.promotedBookingId,
      trainId: booking.train_id,
      journeyDate,
      travelClass: booking.travel_class,
      holdExpiresAt,
    });
  }

  logger.info({ bookingId, reason, action: released.action }, 'Booking released after payment failure');

  try {
    emitBookingUpdate(booking.user_id, {
      bookingId,
      pnr: booking.pnr,
      status: BookingStatus.PAYMENT_EXPIRED,
      reason,
    });
  } catch {
    // Socket layer may not be initialized
  }

  const notification: NotificationPayload = {
    userId: booking.user_id,
    type: reason === 'payment_timeout' ? 'payment_expired' : 'payment_failed',
    title: reason === 'payment_timeout' ? 'Payment timed out' : 'Payment failed',
    message:
      reason === 'payment_timeout'
        ? `Your payment window expired and the seat was released.`
        : 'Your payment could not be completed. The seat has been released.',
    data: { bookingId, pnr: booking.pnr },
  };
  await publish(JobName.NOTIFY, notification as unknown as Record<string, unknown>);
}

/**
 * Explicit cancellation by the user (PENDING_PAYMENT, CONFIRMED or
 * WAITLISTED bookings). Releases the seat and promotes the waitlist.
 */
export async function cancelBooking(payload: FailBookingPayload): Promise<void> {
  const { bookingId, reason } = payload;

  const booking = await getBookingById(bookingId);
  if (!booking) {
    logger.warn({ bookingId }, 'Cancel event for unknown booking — skipping');
    return;
  }

  const cancellable = [
    BookingStatus.PENDING_PAYMENT,
    BookingStatus.CONFIRMED,
    BookingStatus.WAITLISTED,
    BookingStatus.WAITLIST_PROMOTED,
  ];
  if (!cancellable.includes(booking.status)) {
    logger.info({ bookingId, status: booking.status }, 'Booking not cancellable — skipping');
    return;
  }

  const updated = await transitionBookingStatus(bookingId, booking.status, BookingStatus.CANCELLED);
  if (!updated) return;

  const journeyDate = formatDate(booking.journey_date);

  // Only PENDING_PAYMENT / CONFIRMED / WAITLIST_PROMOTED holds hold a seat
  if (booking.status !== BookingStatus.WAITLISTED) {
    await clearBookingHolds(bookingId, booking.user_id, booking.train_id, journeyDate, booking.travel_class);
    activeHolds.dec();
    await releaseAdmissionSlot(booking.user_id);

    const released = await releaseSeat(booking.train_id, journeyDate, booking.travel_class, bookingId);
    if (released.promotedBookingId) {
      const holdExpiresAt = new Date(Date.now() + env.PAYMENT_HOLD_TTL_SECONDS * 1000).toISOString();
      await publish(JobName.WAITLIST_PROMOTED, {
        bookingId: released.promotedBookingId,
        trainId: booking.train_id,
        journeyDate,
        travelClass: booking.travel_class,
        holdExpiresAt,
      });
    }
  } else {
    // Waitlisted booking never held a seat — just remove from waitlist
    const { removeFromWaitlist } = await import('../../services/waitlist.service');
    await removeFromWaitlist(booking.train_id, journeyDate, booking.travel_class, bookingId);
  }

  logger.info({ bookingId, reason: reason || 'cancelled' }, 'Booking cancelled');

  try {
    emitBookingUpdate(booking.user_id, {
      bookingId,
      pnr: booking.pnr,
      status: BookingStatus.CANCELLED,
    });
  } catch {
    // Socket layer may not be initialized
  }
}