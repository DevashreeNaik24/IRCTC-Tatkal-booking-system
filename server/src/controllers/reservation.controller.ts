import { Request, Response } from 'express';
import { z } from 'zod';
import { reserveSeat } from '../services/reservation.service';
import { isTatkalWindowOpen } from '../services/tatkal.service';
import { AuthRequest } from '../types/common.types';
import { logger } from '../config/logger';
import { reservationTotal } from '../config/metrics';

const bookingSchema = z.object({
  trainId: z.number().int().positive(),
  journeyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'journeyDate must be YYYY-MM-DD'),
  travelClass: z.enum(['SL', 'AC3', 'AC2', 'AC1', '2S', 'CC']),
  passengerName: z.string().min(2).max(100),
  passengerAge: z.number().int().min(1).max(150),
  passengerGender: z.enum(['M', 'F', 'O']),
});

/**
 * POST /api/reservations — the hot path.
 * Guarded by: auth → bot protection → admission control → rate limit → idempotency.
 */
export async function createReservationHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  if (!authReq.user) {
    res.status(401).json({ success: false, message: 'Authentication required.' });
    return;
  }

  const parsed = bookingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: parsed.error.errors[0].message });
    return;
  }

  // Tatkal window gating
  if (!isTatkalWindowOpen()) {
    res.status(403).json({
      success: false,
      message: 'Tatkal booking window is currently closed.',
      data: { requiresWindow: true },
    });
    return;
  }

  const idempotencyKey = (req.headers['idempotency-key'] as string) || '';

  try {
    const result = await reserveSeat(authReq.user.id, parsed.data, idempotencyKey);
    res.status(result.success ? 200 : 409).json({
      success: result.success,
      message: result.message,
      data: {
        bookingId: result.bookingId,
        pnr: result.pnr,
        status: result.status,
        remainingSeats: result.remainingSeats,
        waitlistPosition: result.waitlistPosition,
        holdExpiresAt: result.holdExpiresAt,
      },
    });
  } catch (err) {
    reservationTotal.inc({ status: 'controller_error', train_id: parsed.data.trainId.toString() });
    logger.error({ err, userId: authReq.user.id }, 'Reservation request failed');
    res.status(500).json({ success: false, message: 'Reservation failed. Please try again.' });
  }
}