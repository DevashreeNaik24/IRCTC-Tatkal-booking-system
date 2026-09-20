import { Request, Response } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { signup, login } from '../services/auth.service';
import { generateAccessToken, generateRefreshToken } from '../middleware/auth';
import { env } from '../config/env';
import { AuthRequest } from '../types/common.types';
import { logger } from '../config/logger';

const signupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  phone: z.string().regex(/^[0-9+\-\s]{10,15}$/, 'Invalid phone number').optional(),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export async function signupHandler(req: Request, res: Response): Promise<void> {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: parsed.error.errors[0].message });
    return;
  }

  try {
    const { user, accessToken, refreshToken } = await signup(parsed.data);
    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: { user, accessToken, refreshToken },
    });
  } catch (err) {
    res.status(409).json({ success: false, message: (err as Error).message });
  }
}

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: parsed.error.errors[0].message });
    return;
  }

  try {
    const { user, accessToken, refreshToken } = await login(parsed.data);
    res.json({
      success: true,
      message: 'Logged in successfully',
      data: { user, accessToken, refreshToken },
    });
  } catch (err) {
    res.status(401).json({ success: false, message: (err as Error).message });
  }
}

export async function refreshHandler(req: Request, res: Response): Promise<void> {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: parsed.error.errors[0].message });
    return;
  }

  try {
    const decoded = jwt.verify(parsed.data.refreshToken, env.JWT_SECRET) as { id: number };
    const user = { id: decoded.id, email: '', name: '' };
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    res.json({
      success: true,
      message: 'Tokens refreshed',
      data: { accessToken, refreshToken },
    });
  } catch {
    logger.warn('Invalid refresh token attempt');
    res.status(401).json({ success: false, message: 'Invalid or expired refresh token.' });
  }
}

export async function meHandler(req: AuthRequest, res: Response): Promise<void> {
  res.json({
    success: true,
    message: 'Authenticated user',
    data: { user: req.user },
  });
}