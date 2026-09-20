import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

/**
 * Lightweight bot protection middleware.
 *
 * - Honeypot field check: rejects if hidden field is filled
 * - Timing check: rejects submissions faster than humanly possible
 * - User-Agent validation: rejects obviously automated requests
 */
export function botProtectionMiddleware(req: Request, res: Response, next: NextFunction): void {
  // 1. Honeypot check — hidden form field that should be empty
  if (req.body?.website || req.body?.hp_field) {
    logger.warn({ ip: req.ip }, 'Bot detected: honeypot field filled');
    // Return 200 to avoid revealing detection to the bot
    res.status(200).json({ success: true, message: 'Booking submitted.' });
    return;
  }

  // 2. Timing check — form submission faster than 2 seconds is suspicious
  const formLoadedAt = req.body?._formLoadedAt;
  if (formLoadedAt) {
    const elapsed = Date.now() - parseInt(formLoadedAt, 10);
    if (elapsed < 2000) {
      logger.warn({ ip: req.ip, elapsed }, 'Bot detected: form submitted too quickly');
      res.status(200).json({ success: true, message: 'Booking submitted.' });
      return;
    }
  }

  // 3. User-Agent check — reject empty or common bot patterns
  const userAgent = req.headers['user-agent'] || '';
  const botPatterns = [
    /^$/,
    /curl/i,
    /wget/i,
    /python-requests/i,
    /scrapy/i,
    /bot(?!.*google)/i,
    /spider/i,
  ];

  // Only apply to reservation endpoints, not API testing tools
  if (req.path.includes('reservation')) {
    for (const pattern of botPatterns) {
      if (pattern.test(userAgent)) {
        logger.warn({ ip: req.ip, userAgent }, 'Bot detected: suspicious user-agent');
        res.status(403).json({
          success: false,
          message: 'Request blocked by security system.',
        });
        return;
      }
    }
  }

  next();
}
