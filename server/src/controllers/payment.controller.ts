import { Request, Response } from 'express';
import { z } from 'zod';
import {
  initiatePayment,
  processPayment,
  handleGatewayWebhook,
  getPaymentStatus,
} from '../services/payment.service';
import { AuthRequest } from '../types/common.types';
import { logger } from '../config/logger';

const simulateSchema = z.object({
  outcome: z.enum(['success', 'failure']).default('success'),
});

const webhookSchema = z.object({
  gatewayReference: z.string().min(1),
  status: z.enum(['SUCCESS', 'FAILED']),
});

/**
 * POST /api/payments/:bookingId/initiate
 * Create (or reuse) a pending payment for a booking.
 */
export async function initiatePaymentHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  if (!authReq.user) {
    res.status(401).json({ success: false, message: 'Authentication required.' });
    return;
  }

  try {
    const payment = await initiatePayment(req.params.bookingId as string, authReq.user.id);
    res.json({
      success: true,
      message: 'Payment initiated',
      data: { payment },
    });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.includes('not found') ? 404 : message.includes('belongs') ? 403 : 409;
    res.status(status).json({ success: false, message });
  }
}

/**
 * POST /api/payments/:bookingId/simulate
 * Demo helper: initiate payment if needed and drive the mock gateway to
 * success or failure. Mirrors what the real webhook would do.
 */
export async function simulatePaymentHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  if (!authReq.user) {
    res.status(401).json({ success: false, message: 'Authentication required.' });
    return;
  }

  const parsed = simulateSchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ success: false, message: parsed.error.errors[0].message });
    return;
  }

  try {
    const initiated = await initiatePayment(req.params.bookingId as string, authReq.user.id);
    const payment = await processPayment(initiated.paymentId, parsed.data.outcome);
    res.json({
      success: true,
      message: `Payment ${payment.status === 'SUCCESS' ? 'succeeded' : 'failed'}`,
      data: { payment },
    });
  } catch (err) {
    logger.error({ err, bookingId: req.params.bookingId }, 'Payment simulation failed');
    res.status(400).json({ success: false, message: (err as Error).message });
  }
}

/**
 * POST /api/payments/webhook
 * Mock gateway callback (no auth — in production this would verify a
 * provider signature).
 */
export async function webhookHandler(req: Request, res: Response): Promise<void> {
  const parsed = webhookSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: parsed.error.errors[0].message });
    return;
  }

  try {
    const payment = await handleGatewayWebhook(parsed.data);
    if (!payment) {
      res.status(404).json({ success: false, message: 'Unknown gateway reference.' });
      return;
    }
    res.json({ success: true, message: 'Webhook processed', data: { payment } });
  } catch (err) {
    logger.error({ err }, 'Webhook processing failed');
    res.status(500).json({ success: false, message: 'Webhook processing failed.' });
  }
}

/**
 * GET /api/payments/:paymentId/status
 */
export async function paymentStatusHandler(req: Request, res: Response): Promise<void> {
  try {
    const payment = await getPaymentStatus(req.params.paymentId as string);
    if (!payment) {
      res.status(404).json({ success: false, message: 'Payment not found.' });
      return;
    }
    res.json({ success: true, message: 'Payment status', data: { payment } });
  } catch (err) {
    logger.error({ err }, 'Payment status lookup failed');
    res.status(500).json({ success: false, message: 'Failed to load payment.' });
  }
}