import { pool } from '../../config/db';
import { logger } from '../../config/logger';
import { activeHolds } from '../../config/metrics';
import { emitBookingUpdate } from '../../config/socket';
import { PersistBookingPayload } from '../events';
import { BookingStatus } from '../../types/booking.types';

/**
 * Persist a booking row from the reservation flow.
 *
 * Idempotent: `ON CONFLICT (id) DO NOTHING` means replays of the same
 * reservation event are no-ops.
 */
export async function persistBooking(payload: PersistBookingPayload): Promise<void> {
  const {
    bookingId,
    userId,
    trainId,
    journeyDate,
    travelClass,
    passengerName,
    passengerAge,
    passengerGender,
    pnr,
    status,
    holdExpiresAt,
    idempotencyKey,
  } = payload;

  await pool.query(
    `INSERT INTO bookings
      (id, user_id, train_id, journey_date, travel_class, passenger_name,
       passenger_age, passenger_gender, status, pnr, hold_expires_at, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (id) DO NOTHING`,
    [
      bookingId,
      userId,
      trainId,
      journeyDate,
      travelClass,
      passengerName,
      passengerAge,
      passengerGender,
      status,
      pnr,
      holdExpiresAt,
      idempotencyKey,
    ]
  );

  // Track active holds (only bookings that actually hold a seat)
  if (status === BookingStatus.PENDING_PAYMENT) {
    activeHolds.inc();
  }

  logger.info(
    { bookingId, pnr, userId, trainId, journeyDate, travelClass, status },
    'Booking persisted'
  );

  try {
    emitBookingUpdate(userId, {
      bookingId,
      pnr,
      trainId,
      journeyDate,
      travelClass,
      status,
      holdExpiresAt,
    });
  } catch {
    // Socket layer may not be initialized
  }
}