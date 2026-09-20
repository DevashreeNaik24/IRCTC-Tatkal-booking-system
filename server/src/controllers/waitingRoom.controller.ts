import { Request, Response } from 'express';
import { z } from 'zod';
import { enterQueue, checkPosition, pollToken, leaveQueue } from '../services/waitingRoom.service';
import { AuthRequest } from '../types/common.types';
import { logger } from '../config/logger';

/**
 * Shared params for the waiting room endpoints.
 * `z.coerce` lets the same schema validate body JSON (numbers) and
 * query-string values (strings).
 */
const queueSchema = z.object({
  trainId: z.coerce.number().int().positive(),
  journeyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'journeyDate must be YYYY-MM-DD'),
  travelClass: z.enum(['SL', 'AC3', 'AC2', 'AC1', '2S', 'CC']),
});

type QueueParams = z.infer<typeof queueSchema>;

function parseQueueParams(source: unknown): { ok: true; data: QueueParams } | { ok: false; message: string } {
  const parsed = queueSchema.safeParse(source);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.errors[0].message };
  }
  return { ok: true, data: parsed.data };
}

/**
 * POST /api/waiting-room/enter — join the queue (or get admitted immediately
 * when under capacity).
 */
export async function enterQueueHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  if (!authReq.user) {
    res.status(401).json({ success: false, message: 'Authentication required.' });
    return;
  }

  const parsed = parseQueueParams(req.body);
  if (!parsed.ok) {
    res.status(400).json({ success: false, message: parsed.message });
    return;
  }

  try {
    const result = await enterQueue(
      authReq.user.id,
      parsed.data.trainId,
      parsed.data.journeyDate,
      parsed.data.travelClass
    );

    if (result.admitted) {
      res.json({
        success: true,
        message: 'Admitted to booking path.',
        data: { admitted: true, token: result.token },
      });
      return;
    }

    res.status(202).json({
      success: true,
      message: `Queued at position ${result.position}.`,
      data: { admitted: false, position: result.position, queueLength: result.queueLength },
    });
  } catch (err) {
    logger.error({ err, userId: authReq.user.id }, 'Failed to enter waiting room');
    res.status(500).json({ success: false, message: 'Failed to enter waiting room.' });
  }
}

/**
 * GET /api/waiting-room/status?trainId=&journeyDate=&travelClass=
 */
export async function queueStatusHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  if (!authReq.user) {
    res.status(401).json({ success: false, message: 'Authentication required.' });
    return;
  }

  const parsed = parseQueueParams(req.query);
  if (!parsed.ok) {
    res.status(400).json({ success: false, message: parsed.message });
    return;
  }

  try {
    const status = await checkPosition(
      authReq.user.id,
      parsed.data.trainId,
      parsed.data.journeyDate,
      parsed.data.travelClass
    );

    if (!status) {
      res.json({
        success: true,
        message: 'Not in queue (already admitted or never queued).',
        data: { inQueue: false },
      });
      return;
    }

    res.json({
      success: true,
      message: `Position ${status.position} of ${status.queueLength}.`,
      data: { inQueue: true, ...status },
    });
  } catch (err) {
    logger.error({ err, userId: authReq.user.id }, 'Failed to check queue position');
    res.status(500).json({ success: false, message: 'Failed to check queue position.' });
  }
}

/**
 * GET /api/waiting-room/token?trainId=&journeyDate=&travelClass=
 * Poll endpoint — returns the admission token once the user has been admitted.
 */
export async function pollTokenHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  if (!authReq.user) {
    res.status(401).json({ success: false, message: 'Authentication required.' });
    return;
  }

  const parsed = parseQueueParams(req.query);
  if (!parsed.ok) {
    res.status(400).json({ success: false, message: parsed.message });
    return;
  }

  try {
    const result = await pollToken(
      authReq.user.id,
      parsed.data.trainId,
      parsed.data.journeyDate,
      parsed.data.travelClass
    );

    if (result.admitted) {
      res.json({
        success: true,
        message: 'Admission granted.',
        data: { admitted: true, token: result.token },
      });
      return;
    }

    res.json({
      success: true,
      message: 'Still waiting.',
      data: { admitted: false, status: result.status },
    });
  } catch (err) {
    logger.error({ err, userId: authReq.user.id }, 'Failed to poll admission token');
    res.status(500).json({ success: false, message: 'Failed to poll admission token.' });
  }
}

/**
 * DELETE /api/waiting-room/leave?trainId=&journeyDate=&travelClass=
 * Voluntarily leave the queue (frees the spot for the next user).
 */
export async function leaveQueueHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  if (!authReq.user) {
    res.status(401).json({ success: false, message: 'Authentication required.' });
    return;
  }

  const parsed = parseQueueParams(req.query);
  if (!parsed.ok) {
    res.status(400).json({ success: false, message: parsed.message });
    return;
  }

  try {
    const removed = await leaveQueue(
      authReq.user.id,
      parsed.data.trainId,
      parsed.data.journeyDate,
      parsed.data.travelClass
    );
    res.json({
      success: true,
      message: removed ? 'Left the queue.' : 'Were not in the queue.',
      data: { removed },
    });
  } catch (err) {
    logger.error({ err, userId: authReq.user.id }, 'Failed to leave waiting room');
    res.status(500).json({ success: false, message: 'Failed to leave waiting room.' });
  }
}