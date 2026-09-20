import fs from 'fs';
import path from 'path';
import { pool } from '../config/db';
import { logger } from '../config/logger';

/**
 * Simple migration runner. Applies `migrations/*.sql` in filename order and
 * records each applied migration in `schema_migrations` so re-runs are no-ops.
 *
 * Run with: npm run migrate
 */

const migrationsDir = path.join(__dirname, '../migrations');

async function migrate(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let applied = 0;

  for (const file of files) {
    const { rows } = await pool.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
    if (rows.length > 0) {
      logger.debug({ file }, 'Migration already applied — skipping');
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      applied += 1;
      logger.info({ file }, 'Migration applied');
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error({ err, file }, 'Migration failed');
      throw err;
    } finally {
      client.release();
    }
  }

  logger.info(`Migrations complete (${applied} new, ${files.length} total)`);
}

migrate().then(
  () => pool.end().then(() => process.exit(0)),
  (err) => {
    logger.error({ err }, 'Migration script failed');
    process.exit(1);
  }
);