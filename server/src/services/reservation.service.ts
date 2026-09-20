import { v4 as uuidv4 } from 'uuid';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { emitSeatUpdate } from '../config/socket';
import { RedisKeys } from './inventory.service';
import { CreateBookingInput, BookingStatus, ReservationResult, TravelClass } from '../types/booking.types';
import { reservationTotal, reservationDuration } from '../config/metrics';
import { bookingQueue } from '../events/eventBus';

import { loadLuaScript } from '../utils/loadLua';

// Load Lua scripts
const reserveSeatScript = loadLuaScript('reserveSeat.lua');
const releaseSeatScript = loadLuaScript('releaseSeat.lua');

/**
 * Generate a 10-digit PNR number.
 */
function generatePNR(): string {
  const num = Math.floor(1000000000 + Math.random() * 9000000000);
  return num.toString();
}

/**
 * Attempt to reserve a seat using the atomic Lua script.
 *
 * State machine: Available → Held (PENDING_PAYMENT) → Confirmed | Released | Waitlisted
 */
export async function reserveSeat(
  userId: number,
  input: CreateBookingInput,
  idempotencyKey: string
): Promise<ReservationResult> {
  const timer = reservationDuration.startTimer();
  const bookingId = uuidv4();
  const pnr = generatePNR();

  const inventoryKey = RedisKeys.inventory(input.trainId, input.journeyDate, input.travelClass);
  const holdKey = RedisKeys.hold(bookingId);

  try {
    // Execute atomic Lua reservation
    const result = await redis.eval(
      reserveSeatScript,
      2, // number of KEYS
      inventoryKey,
      holdKey,
      env.PAYMENT_HOLD_TTL_SECONDS,
      bookingId,
      userId.toString()
    ) as number[];

    const status = result[0];
    const remainingSeats = result[1];

    if (status === -1) {
      // User already has a hold
      reservationTotal.inc({ status: 'duplicate_hold', train_id: input.trainId.toString() });
      timer();
      return {
        success: false,
        status: 'error',
        message: 'You already have an active booking for this train/class/date.',
      };
    }

    if (status === -2) {
      // Inventory not initialized
      reservationTotal.inc({ status: 'error', train_id: input.trainId.toString() });
      timer();
      return {
        success: false,
        status: 'error',
        message: 'Inventory not available for this train/date/class.',
      };
    }

    if (status === 1) {
      // Successfully reserved
      const holdExpiresAt = new Date(Date.now() + env.PAYMENT_HOLD_TTL_SECONDS * 1000);

      // Enqueue background job to persist to PostgreSQL
      await bookingQueue.add('persist-booking', {
        bookingId,
        userId,
        ...input,
        pnr,
        status: BookingStatus.PENDING_PAYMENT,
        holdExpiresAt: holdExpiresAt.toISOString(),
        idempotencyKey,
      });

      // Emit real-time seat update
      emitSeatUpdate(input.trainId, input.journeyDate, input.travelClass, remainingSeats);

      reservationTotal.inc({ status: 'reserved', train_id: input.trainId.toString() });
      timer();

      logger.info(
        { bookingId, pnr, trainId: input.trainId, userId, remainingSeats },
        'Seat reserved successfully'
      );

      return {
        success: true,
        status: 'reserved',
        bookingId,
        pnr,
        remainingSeats,
        holdExpiresAt,
        message: `Seat reserved! Complete payment within ${env.PAYMENT_HOLD_TTL_SECONDS} seconds.`,
      };
    }

    // status === 0 — Sold out → add to waitlist
    const waitlistKey = RedisKeys.waitlist(input.trainId, input.journeyDate, input.travelClass);
    const score = Date.now();
    await redis.zadd(waitlistKey, score, bookingId);

    const position = await redis.zrank(waitlistKey, bookingId);

    // Enqueue waitlisted booking to persist
    await bookingQueue.add('persist-booking', {
      bookingId,
      userId,
      ...input,
      pnr,
      status: BookingStatus.WAITLISTED,
      holdExpiresAt: null,
      idempotencyKey,
    });

    reservationTotal.inc({ status: 'waitlisted', train_id: input.trainId.toString() });
    timer();

    logger.info(
      { bookingId, pnr, trainId: input.trainId, userId, position },
      'Booking waitlisted'
    );

    return {
      success: true,
      status: 'waitlisted',
      bookingId,
      pnr,
      waitlistPosition: (position || 0) + 1,
      message: `All seats sold out. You are #${(position || 0) + 1} on the waitlist.`,
    };
  } catch (err) {
    reservationTotal.inc({ status: 'error', train_id: input.trainId.toString() });
    timer();
    logger.error({ err, userId, input }, 'Reservation failed');
    throw err;
  }
}

/**
 * Release a seat and atomically promote from waitlist if applicable.
 */
export async function releaseSeat(
  trainId: number,
  journeyDate: string,
  travelClass: TravelClass,
  bookingId: string
): Promise<{ action: string; promotedBookingId?: string; remainingSeats: number }> {
  const inventoryKey = RedisKeys.inventory(trainId, journeyDate, travelClass);
  const waitlistKey = RedisKeys.waitlist(trainId, journeyDate, travelClass);

  const result = await redis.eval(
    releaseSeatScript,
    2,
    inventoryKey,
    waitlistKey,
    env.PAYMENT_HOLD_TTL_SECONDS
  ) as [number, string, number];

  const action = result[0] === 1 ? 'returned_to_pool' : 'waitlist_promoted';
  const promotedBookingId = result[1] !== 'none' ? result[1] : undefined;
  const remainingSeats = result[2];

  // Emit seat update
  emitSeatUpdate(trainId, journeyDate, travelClass, remainingSeats);

  logger.info(
    { action, promotedBookingId, remainingSeats, trainId, bookingId },
    'Seat released'
  );

  return { action, promotedBookingId, remainingSeats };
}
