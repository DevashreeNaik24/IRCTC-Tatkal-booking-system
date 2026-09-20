import { env } from '../config/env';
import { logger } from '../config/logger';

/**
 * Tatkal window gating — controls when bookings are allowed.
 */

let forceOpen = false;
let forceClosed = false;

/**
 * Check if the Tatkal booking window is currently open.
 */
export function isTatkalWindowOpen(): boolean {
  if (forceOpen) return true;
  if (forceClosed) return false;

  const now = new Date();
  const [openHour, openMin] = env.TATKAL_OPEN_TIME.split(':').map(Number);
  const [closeHour, closeMin] = env.TATKAL_CLOSE_TIME.split(':').map(Number);

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const openMinutes = openHour * 60 + openMin;
  const closeMinutes = closeHour * 60 + closeMin;

  return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
}

/**
 * Admin: Force the Tatkal window open (for demos/testing).
 */
export function forceOpenWindow(): void {
  forceOpen = true;
  forceClosed = false;
  logger.info('Tatkal window force-opened by admin');
}

/**
 * Admin: Force the Tatkal window closed.
 */
export function forceCloseWindow(): void {
  forceClosed = true;
  forceOpen = false;
  logger.info('Tatkal window force-closed by admin');
}

/**
 * Admin: Reset to time-based window control.
 */
export function resetWindow(): void {
  forceOpen = false;
  forceClosed = false;
  logger.info('Tatkal window reset to time-based control');
}

/**
 * Get current Tatkal window status.
 */
export function getWindowStatus() {
  return {
    isOpen: isTatkalWindowOpen(),
    openTime: env.TATKAL_OPEN_TIME,
    closeTime: env.TATKAL_CLOSE_TIME,
    forceOpen,
    forceClosed,
    serverTime: new Date().toISOString(),
  };
}
