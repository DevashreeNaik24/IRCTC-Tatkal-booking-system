import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url().default('postgresql://irctc:irctc_secret@localhost:5432/irctc_tatkal'),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Server
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Auth
  JWT_SECRET: z.string().min(16).default('change-this-to-a-secure-random-string-in-production'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Admin (comma-separated emails allowed to hit /api/admin/*)
  ADMIN_EMAILS: z.string().default('admin@irctc.dev'),

  // Tatkal window
  TATKAL_OPEN_TIME: z.string().regex(/^\d{2}:\d{2}$/).default('10:00'),
  TATKAL_CLOSE_TIME: z.string().regex(/^\d{2}:\d{2}$/).default('12:00'),

  // Payment
  PAYMENT_HOLD_TTL_SECONDS: z.coerce.number().min(30).default(120),
  PAYMENT_CHECKER_INTERVAL_MS: z.coerce.number().min(1000).default(5000),

  // Admission control
  ADMISSION_BATCH_SIZE: z.coerce.number().min(1).default(50),
  ADMISSION_INTERVAL_MS: z.coerce.number().min(1000).default(5000),
  ADMISSION_TOKEN_TTL_SECONDS: z.coerce.number().min(30).default(300),
  MAX_CONCURRENT_BOOKINGS: z.coerce.number().min(10).default(200),

  // Rate limiting
  RATE_LIMIT_PER_IP: z.coerce.number().default(60),
  RATE_LIMIT_PER_USER_RESERVATION: z.coerce.number().default(5),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().default(60),

  // Back-pressure
  MAX_QUEUE_DEPTH: z.coerce.number().default(10000),
  BACKPRESSURE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.8),

  // Logging
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
