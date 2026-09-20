import { Request, Response } from 'express';
import { getBookingsByUser, getBookingById } from '../services/booking.service';
import { publish } from '../events/eventBus';
import { JobName } from '../events/events';
import { AuthRequest } from '../types/common.types';
import { logger } from '../config/logger';

/**
 * GET /api/bookings — all bookings for the authenticated user.
 */
export async function listBookingsHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  if (!authReq.user) {
    res.status(401).json({ success: false, message: 'Authentication required.' });
    return;
  }

  try {
    const bookings = await getBookingsByUser(authReq.user.id);
    res.json({
      success: true,
      message: `${bookings.length} booking(s) found`,
      data: { bookings },
    });
  } catch (err) {
    logger.error({ err, userId: authReq.user.id }, 'Failed to list bookings');
    res.status(500).json({ success: false, message: 'Failed to load bookings.' });
  }
}

/**
 * GET /api/bookings/:id — a single booking, ownership-checked.
 */
export async function getBookingHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  if (!authReq.user) {
    res.status(401).json({ success: false, message: 'Authentication required.' });
    return;
  }

  try {
    const booking = await getBookingById(req.params.id as string);
    if (!booking) {
      res.status(404).json({ success: false, message: 'Booking not found.' });
      return;
    }
    if (booking.user_id !== authReq.user.id) {
      res.status(403).json({ success: false, message: 'You do not own this booking.' });
      return;
    }
    res.json({ success: true, message: 'Booking found', data: { booking } });
  } catch (err) {
    logger.error({ err, bookingId: req.params.id }, 'Failed to load booking');
    res.status(500).json({ success: false, message: 'Failed to load booking.' });
  }
}

/**
 * POST /api/bookings/:id/cancel — queue an async cancellation.
 * The booking worker handles the state transition, seat release and
 * waitlist promotion (idempotent — non-cancellable states are skipped).
 */
export async function cancelBookingHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  if (!authReq.user) {
    res.status(401).json({ success: false, message: 'Authentication required.' });
    return;
  }

  const bookingId = req.params.id as string;

  try {
    const booking = await getBookingById(bookingId);
    if (!booking) {
      res.status(404).json({ success: false, message: 'Booking not found.' });
      return;
    }
    if (booking.user_id !== authReq.user.id) {
      res.status(403).json({ success: false, message: 'You do not own this booking.' });
      return;
    }

    await publish(JobName.CANCEL_BOOKING, { bookingId, reason: 'cancelled' });
    res.json({
      success: true,
      message: 'Cancellation requested — the seat will be released shortly.',
      data: { bookingId },
    });
  } catch (err) {
    logger.error({ err, bookingId }, 'Failed to queue cancellation');
    res.status(500).json({ success: false, message: 'Cancellation failed. Please try again.' });
  }
}