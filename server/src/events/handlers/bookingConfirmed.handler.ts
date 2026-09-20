import { logger } from '../../config/logger';
import { sendNotification } from '../../services/notification.service';
import { BookingConfirmedPayload, NotificationPayload } from '../events';

/**
 * Booking confirmed — final fan-out: confirmation notification to the user.
 * Kept as its own event so it can be replayed independently of the
 * payment-succeeded processing.
 */
export async function handleBookingConfirmed(payload: BookingConfirmedPayload): Promise<void> {
  const { bookingId, userId, pnr, trainName, passengerName, amount } = payload;

  logger.info({ bookingId, userId, pnr, amount }, 'Booking confirmed — notifying user');

  const notification: NotificationPayload = {
    userId,
    type: 'booking_confirmed',
    title: 'Booking confirmed! 🎉',
    message: `${passengerName}, your ticket on ${trainName} is confirmed (PNR ${pnr}).`,
    data: { bookingId, pnr, trainName, amount },
  };

  await sendNotification(notification);
}