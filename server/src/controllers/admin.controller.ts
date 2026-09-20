import { Request, Response } from 'express';
import {
  getWindowStatus,
  forceOpenWindow,
  forceCloseWindow,
  resetWindow,
} from '../services/tatkal.service';
import { metricsRegistry } from '../config/metrics';
import { publish } from '../events/eventBus';
import { JobName } from '../events/events';
import { logger } from '../config/logger';

/**
 * GET /api/admin/window — current Tatkal window state.
 */
export async function windowStatusHandler(_req: Request, res: Response): Promise<void> {
  res.json({
    success: true,
    message: 'Tatkal window status',
    data: getWindowStatus(),
  });
}

/**
 * POST /api/admin/window/open — force the window open (demos/testing).
 */
export async function openWindowHandler(_req: Request, res: Response): Promise<void> {
  forceOpenWindow();
  res.json({ success: true, message: 'Tatkal window forced open.', data: getWindowStatus() });
}

/**
 * POST /api/admin/window/close — force the window closed.
 */
export async function closeWindowHandler(_req: Request, res: Response): Promise<void> {
  forceCloseWindow();
  res.json({ success: true, message: 'Tatkal window forced closed.', data: getWindowStatus() });
}

/**
 * POST /api/admin/window/reset — return to time-based control.
 */
export async function resetWindowHandler(_req: Request, res: Response): Promise<void> {
  resetWindow();
  res.json({ success: true, message: 'Tatkal window reset to time-based control.', data: getWindowStatus() });
}

/**
 * GET /api/admin/metrics — Prometheus text exposition format.
 */
export async function metricsHandler(_req: Request, res: Response): Promise<void> {
  try {
    res.set('Content-Type', metricsRegistry.contentType);
    res.send(await metricsRegistry.metrics());
  } catch (err) {
    logger.error({ err }, 'Failed to export Prometheus metrics');
    res.status(500).json({ success: false, message: 'Failed to export metrics.' });
  }
}

/**
 * POST /api/admin/reconcile-payments — trigger an on-demand payment-expiry
 * sweep (the payment worker also runs this on a timer).
 */
export async function reconcilePaymentsHandler(_req: Request, res: Response): Promise<void> {
  try {
    await publish(JobName.CHECK_PAYMENT_EXPIRY, { triggeredBy: 'admin' });
    res.json({ success: true, message: 'Payment reconciliation job queued.' });
  } catch (err) {
    logger.error({ err }, 'Failed to queue payment reconciliation');
    res.status(500).json({ success: false, message: 'Failed to queue reconciliation.' });
  }
}