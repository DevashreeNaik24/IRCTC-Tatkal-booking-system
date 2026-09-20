import { Pool } from 'pg';
import { env } from './env';
import { logger } from './logger';

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected PostgreSQL pool error');
});

pool.on('connect', () => {
  logger.debug('PostgreSQL client connected');
});

/**
 * Test database connectivity.
 */
export async function testDbConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    logger.info('✅ PostgreSQL connection established');
    return true;
  } catch (err) {
    logger.error({ err }, '❌ PostgreSQL connection failed');
    return false;
  }
}

/**
 * Gracefully close the pool.
 */
export async function closeDb(): Promise<void> {
  await pool.end();
  logger.info('PostgreSQL pool closed');
}
