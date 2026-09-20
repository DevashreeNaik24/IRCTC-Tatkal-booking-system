import { v4 as uuidv4 } from 'uuid';
import { pool } from '../config/db';
import { redis } from '../config/redis';
import { logger } from '../config/logger';
import { RedisKeys } from './inventory.service';
import { getBookingById } from './booking.service';
import { isTatkalWindowOpen } from './tatkal.service';
import { BookingStatus } from '../types/booking.types';
import { paymentGatewayBreaker } from './circuitBreaker';
import { publish } from '../events/eventBus';
import { JobName } from '../events/events';
import { paymentSuccessTotal } from '../config/metrics';

export interface InitiatePaymentResult {
  paymentId: string;
  bookingId: string;
  amount: number;
  gatewayReference: string;
  holdExpiresAt: string | null;
}

export interface PaymentRow {
  id: string;
  booking_id: string;
  amount: string;
  currency: string;
  status: string;
  gateway_reference: string | null;
}

/**
 * Compute the fare for a booking — Tatkal fare during the window, base fare otherwise.
 */
async function getFare(trainId: number, travelClass: string): Promise<number> {
  const result = await pool.query(
    'SELECT base_fare, tatkal_fare FROM train_classes WHERE train_id = $1 AND travel_class = $2',
    [trainId, travelClass]
  );
  if (result.rows.length === 0) {
    throw new Error(`No fare configured for train ${trainId} class ${travelClass}`);
  }
  const fare = isTatkalWindowOpen() ? Number(result.rows[0].tatkal_fare) : Number(result.rows[0].base_fare);
  return fare;
}

/**
 * Initiate payment for a booking. Idempotent: an existing PENDING payment
 * for the booking is returned instead of creating a duplicate.
 */
export async function initiatePayment(bookingId: string, userId: number): Promise<InitiatePaymentResult> {
  const booking = await getBookingById(bookingId);
  if (!booking) {
    throw new Error('Booking not found');
  }
  if (booking.user_id !== userId) {
    throw new Error('Booking does not belong to this user');
  }
  if (booking.status !== BookingStatus.PENDING_PAYMENT && booking.status !== BookingStatus.WAITLIST_PROMOTED) {
    throw new Error(`Cannot pay for a booking in status ${booking.status}`);
  }

  // Idempotent — reuse an existing pending payment
  const existing = await pool.query(
    'SELECT id, amount, gateway_reference FROM payments WHERE booking_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT 1',
    [bookingId, 'PENDING']
  );
  if (existing.rows.length > 0) {
    logger.info({ bookingId, paymentId: existing.rows[0].id }, 'Reusing existing pending payment');
    return {
      paymentId: existing.rows[0].id,
      bookingId,
      amount: Number(existing.rows[0].amount),
      gatewayReference: existing.rows[0].gateway_reference,
      holdExpiresAt: booking.hold_expires_at ? new Date(booking.hold_expires_at).toISOString() : null,
    };
  }

  const amount = await getFare(booking.train_id, booking.travel_class);
  const gatewayReference = `mock_${uuidv4()}`;

  const result = await pool.query(
    `INSERT INTO payments (booking_id, amount, gateway_reference)
     VALUES ($1, $2, $3) RETURNING id, amount, gateway_reference`,
    [bookingId, amount, gatewayReference]
  );

  logger.info({ bookingId, paymentId: result.rows[0].id, amount }, 'Payment initiated (mock gateway)');

  return {
    paymentId: result.rows[0].id,
    bookingId,
    amount,
    gatewayReference: result.rows[0].gateway_reference,
    holdExpiresAt: booking.hold_expires_at ? new Date(booking.hold_expires_at).toISOString() : null,
  };
}

/**
 * Process a payment through the (simulated) gateway and drive the booking
 * state machine via the event bus. Idempotent — final payments are never
 * re-processed.
 */
export async function processPayment(paymentId: string, outcome: 'success' | 'failure'): Promise<PaymentRow> {
  const paymentResult = await pool.query(
    'SELECT * FROM payments WHERE id = $1',
    [paymentId]
  );
  if (paymentResult.rows.length === 0) {
    throw new Error('Payment not found');
  }
  const payment: PaymentRow = paymentResult.rows[0];

  // Idempotent — final states are terminal
  if (payment.status === 'SUCCESS' || payment.status === 'FAILED') {
    logger.info({ paymentId, status: payment.status }, 'Payment already finalized — ignoring replay');
    return payment;
  }

  // Call the gateway through the circuit breaker
  let declined: boolean;
  try {
    const res = await paymentGatewayBreaker.fire({ paymentId, outcome });
    declined = res.declined;
  } catch {
    declined = true; // breaker open — treat as declined
  }

  const finalStatus = declined ? 'FAILED' : 'SUCCESS';
  await pool.query(
    `UPDATE payments SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [paymentId, finalStatus]
  );

  if (finalStatus === 'SUCCESS') {
    paymentSuccessTotal.inc();
    await publish(JobName.CONFIRM_BOOKING, {
      bookingId: payment.booking_id,
      paymentId,
      amount: Number(payment.amount),
    });
    logger.info({ paymentId, bookingId: payment.booking_id }, 'Payment succeeded — booking confirmation queued');
  } else {
    await publish(JobName.FAIL_BOOKING, {
      bookingId: payment.booking_id,
      paymentId,
      reason: 'gateway_declined',
    });
    logger.info({ paymentId, bookingId: payment.booking_id }, 'Payment failed — seat release queued');
  }

  return { ...payment, status: finalStatus };
}

/**
 * Mock gateway webhook handler. In production this endpoint would receive
 * signed callbacks from the payment provider. Replays of the same
 * gatewayReference are idempotent.
 */
export async function handleGatewayWebhook(body: {
  gatewayReference: string;
  status: 'SUCCESS' | 'FAILED';
}): Promise<PaymentRow | null> {
  const { gatewayReference, status } = body;

  const result = await pool.query(
    'SELECT * FROM payments WHERE gateway_reference = $1',
    [gatewayReference]
  );
  if (result.rows.length === 0) {
    logger.warn({ gatewayReference }, 'Webhook for unknown gateway reference');
    return null;
  }

  const payment: PaymentRow = result.rows[0];
  if (payment.status === 'SUCCESS' || payment.status === 'FAILED') {
    logger.info({ gatewayReference, status: payment.status }, 'Webhook replay ignored');
    return payment;
  }

  return processPayment(payment.id, status === 'SUCCESS' ? 'success' : 'failure');
}

/**
 * Get payment status by ID.
 */
export async function getPaymentStatus(paymentId: string): Promise<PaymentRow | null> {
  const result = await pool.query('SELECT * FROM payments WHERE id = $1', [paymentId]);
  return result.rows[0] || null;
}

/**
 * Remove Redis hold keys for a booking (called on confirm/release paths).
 */
export async function clearBookingHolds(
  bookingId: string,
  userId: number,
  trainId: number,
  journeyDate: string,
  travelClass: string
): Promise<void> {
  const holdKey = RedisKeys.hold(bookingId);
  const userHoldKey = RedisKeys.userHold(userId, trainId, journeyDate, travelClass);
  await redis.del(holdKey);
  await redis.del(userHoldKey);
}