import { logger } from '../config/logger';
import { getIO } from '../config/socket';
import { NotificationPayload } from '../events/events';

/**
 * Notification stubs — in production these would call an email/SMS provider
 * (e.g. AWS SES, Twilio). They log the notification and fan it out to the
 * user's Socket.io room so the frontend can show a live toast.
 */
export async function sendNotification(payload: NotificationPayload): Promise<void> {
  const { userId, type, title, message, data } = payload;

  logger.info(
    { userId, type, title, message },
    `[notification:${type}] ${title} — ${message}`
  );

  // Socket.io fan-out (non-fatal if socket layer is unavailable, e.g. in tests)
  try {
    getIO().to(`user:${userId}`).emit('notification', {
      type,
      title,
      message,
      data: data || {},
      timestamp: Date.now(),
    });
  } catch {
    logger.debug('Socket.io not initialized — skipping notification fan-out');
  }
}

export const sendEmail = sendNotification;
export const sendSms = sendNotification;