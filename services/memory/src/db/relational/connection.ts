import knex, { Knex } from 'knex';
import { DatabaseConfig } from '../../config';
import config from '../../config';
import { logger } from '../../utils/logger';

let connection: Knex | null = null;

/**
 * Get or create a database connection
 */
export function getConnection(cfg: DatabaseConfig = config.database): Knex {
  if (!connection) {
    try {
      const isPg = cfg.client === 'pg';

      connection = knex({
        client: cfg.client,
        connection: cfg.connection,
        pool: cfg.pool || {
          min: 2,
          max: 10
        },
        useNullAsDefault: true,
        debug: false, // process.env.NODE_ENV === 'development',
      });

      // Test the connection with a database-specific query
      const testQuery = isPg ? 'SELECT 1' : 'SELECT 1 as test';

      connection.raw(testQuery)
        .then(() => {
          logger.info(`Successfully connected to ${isPg ? 'PostgreSQL' : 'SQLite'} database`);

          // For PostgreSQL, enable UUID extension if it doesn't exist
          if (isPg) {
            return connection!.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
              .then(() => logger.info('PostgreSQL UUID extension is ready'))
              .catch(err => logger.warn('Could not enable UUID extension:', err));
          }
        })
        .catch((err) => {
          logger.error('Database connection failed:', err);
          process.exit(1);
        });
    } catch (err) {
      logger.error('Failed to initialize database connection:', err);
      process.exit(1);
    }
  }
  return connection!;
}

/**
 * Get a Knex client instance
 */
export function getKnexClient(cfg: DatabaseConfig = config.database): Knex {
  return getConnection(cfg);
}

/**
 * Close the database connection
 */
export async function closeConnection(): Promise<void> {
  if (connection) {
    await connection.destroy();
    connection = null;
    logger.info('Database connection closed');
  }
}

export { Knex } from 'knex';
