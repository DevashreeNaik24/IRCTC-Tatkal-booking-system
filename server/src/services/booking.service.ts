import { pool } from '../config/db';
import { logger } from '../config/logger';

/**
 * Get all bookings for a specific user.
 */
export async function getBookingsByUser(userId: number) {
  const result = await pool.query(
    `SELECT b.*, t.train_number, t.train_name, t.source_station, t.source_code,
            t.destination_station, t.destination_code, t.departure_time, t.arrival_time
     FROM bookings b
     JOIN trains t ON t.id = b.train_id
     WHERE b.user_id = $1
     ORDER BY b.created_at DESC`,
    [userId]
  );
  return result.rows;
}

/**
 * Get a single booking by ID.
 */
export async function getBookingById(bookingId: string) {
  const result = await pool.query(
    `SELECT b.*, t.train_number, t.train_name, t.source_station, t.source_code,
            t.destination_station, t.destination_code, t.departure_time, t.arrival_time
     FROM bookings b
     JOIN trains t ON t.id = b.train_id
     WHERE b.id = $1`,
    [bookingId]
  );
  return result.rows[0] || null;
}

/**
 * Update booking status.
 */
export async function updateBookingStatus(bookingId: string, status: string, paymentId?: string) {
  const result = await pool.query(
    `UPDATE bookings SET status = $2, payment_id = COALESCE($3, payment_id), updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [bookingId, status, paymentId || null]
  );

  if (result.rows.length === 0) {
    throw new Error(`Booking ${bookingId} not found`);
  }

  logger.info({ bookingId, status }, 'Booking status updated');
  return result.rows[0];
}

/**
 * Guarded state-machine transition.
 *
 * Only applies the transition when the booking is currently in `fromStatus`.
 * Returns the updated row, or `null` if the guard failed (idempotent replay
 * protection — e.g. an expiry event arriving after payment already succeeded).
 */
export async function transitionBookingStatus(
  bookingId: string,
  fromStatus: string,
  toStatus: string,
  paymentId?: string,
  holdExpiresAt?: string | null
) {
  const result = await pool.query(
    `UPDATE bookings
     SET status = $2,
         payment_id = COALESCE($3, payment_id),
         hold_expires_at = COALESCE($4, hold_expires_at),
         updated_at = NOW()
     WHERE id = $1 AND status = $5
     RETURNING *`,
    [bookingId, toStatus, paymentId || null, holdExpiresAt ?? null, fromStatus]
  );

  if (result.rows.length === 0) {
    logger.warn({ bookingId, fromStatus, toStatus }, 'State transition guard failed (already transitioned?)');
    return null;
  }

  logger.info({ bookingId, fromStatus, toStatus }, 'Booking state transitioned');
  return result.rows[0];
}

/**
 * Get expired bookings that still have PENDING_PAYMENT status.
 */
export async function getExpiredBookings() {
  const result = await pool.query(
    `SELECT * FROM bookings
     WHERE status = 'PENDING_PAYMENT'
     AND hold_expires_at < NOW()
     ORDER BY hold_expires_at ASC
     LIMIT 100`
  );
  return result.rows;
}
