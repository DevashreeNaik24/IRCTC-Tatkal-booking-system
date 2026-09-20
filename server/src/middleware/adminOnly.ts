import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { AuthRequest } from '../types/common.types';

const adminEmails = env.ADMIN_EMAILS.split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

/**
 * Admin-only guard. In non-production environments every authenticated
 * request passes (convenient for demos/tests); in production the user's
 * email must be listed in ADMIN_EMAILS.
 */
export function adminOnlyMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthRequest;
  if (!authReq.user) {
    res.status(401).json({ success: false, message: 'Authentication required.' });
    return;
  }

  if (env.NODE_ENV === 'production' && !adminEmails.includes(authReq.user.email.toLowerCase())) {
    res.status(403).json({ success: false, message: 'Admin access required.' });
    return;
  }

  next();
}