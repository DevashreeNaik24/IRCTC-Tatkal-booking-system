import bcrypt from 'bcryptjs';
import { pool } from '../config/db';
import { logger } from '../config/logger';
import { generateAccessToken, generateRefreshToken } from '../middleware/auth';
import { AuthUser } from '../types/common.types';

export interface SignupInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export async function signup(input: SignupInput) {
  const { name, email, password, phone } = input;

  // Check if user already exists
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    throw new Error('User with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const result = await pool.query(
    'INSERT INTO users (name, email, password_hash, phone) VALUES ($1, $2, $3, $4) RETURNING id, name, email',
    [name, email, passwordHash, phone || null]
  );

  const user: AuthUser = result.rows[0];
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  logger.info({ userId: user.id, email }, 'User registered');

  return { user, accessToken, refreshToken };
}

export async function login(input: LoginInput) {
  const { email, password } = input;

  const result = await pool.query(
    'SELECT id, name, email, password_hash FROM users WHERE email = $1',
    [email]
  );

  if (result.rows.length === 0) {
    throw new Error('Invalid email or password');
  }

  const user = result.rows[0];
  const isValid = await bcrypt.compare(password, user.password_hash);

  if (!isValid) {
    throw new Error('Invalid email or password');
  }

  const authUser: AuthUser = { id: user.id, email: user.email, name: user.name };
  const accessToken = generateAccessToken(authUser);
  const refreshToken = generateRefreshToken(authUser);

  logger.info({ userId: user.id }, 'User logged in');

  return { user: authUser, accessToken, refreshToken };
}
