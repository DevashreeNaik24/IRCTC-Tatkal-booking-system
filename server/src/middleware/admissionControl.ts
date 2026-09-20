import { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { AuthRequest } from '../types/common.types';

/**
 * Admission control middleware — Virtual Waiting Room gate.
 *
 * Before the reservation endpoint, validates that the user holds a valid
 * admission token. Without a token, the user must enter the waiting room first.
 */
export async function admissionControlMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authReq = req as AuthRequest;
  if (!authReq.user) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }

  const admissionToken = req.headers['x-admission-token'] as string;

  if (!admissionToken) {
    // Check current system load — if below threshold, admit directly
    const currentBookings = await redis.get('admission:active_count');
    const activeCount = parseInt(currentBookings || '0', 10);

    if (activeCount < env.MAX_CONCURRENT_BOOKINGS) {
      // System not under pressure — skip waiting room
      next();
      return;
    }

    res.status(429).json({
      success: false,
      message: 'System is under high load. Please enter the waiting room first.',
      data: {
        requiresWaitingRoom: true,
        enterUrl: '/api/waiting-room/enter',
      },
    });
    return;
  }

  // Validate the admission token
  const tokenKey = `admission:token:${admissionToken}`;
  const tokenData = await redis.get(tokenKey);

  if (!tokenData) {
    res.status(403).json({
      success: false,
      message: 'Admission token is invalid or expired. Please re-enter the waiting room.',
      data: { requiresWaitingRoom: true },
    });
    return;
  }

  const parsed = JSON.parse(tokenData);
  if (parsed.userId !== authReq.user.id) {
    logger.warn(
      { userId: authReq.user.id, tokenUserId: parsed.userId },
      'Admission token user mismatch'
    );
    res.status(403).json({
      success: false,
      message: 'Admission token does not belong to this user.',
    });
    return;
  }

  // Token is valid — consume it (one-time use)
  await redis.del(tokenKey);

  // Set a per-user cleanup marker: when the booking flow finishes
  // (confirm/fail handlers) it is deleted and the counter decremented.
  // If it expires (user abandons the flow), the payment checker decrements.
  //
  // NOTE: the active-count increment happens when the token is GRANTED
  // (admitUser.lua / admitBatch), not here — incrementing again would
  // double-count every admitted user and skew the concurrency limiter.
  const cleanupKey = `admission:cleanup:${authReq.user.id}`;
  await redis.set(cleanupKey, '1', 'EX', env.PAYMENT_HOLD_TTL_SECONDS + 30);

  next();
}
