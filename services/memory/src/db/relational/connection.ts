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
    connection = knex({
      client: cfg.client,
      connection: cfg.connection,
      pool: cfg.pool,
      useNullAsDefault: true,
      debug: process.env.NODE_ENV === 'development',
    });

    // Test the connection
    connection.raw('SELECT 1')
      .then(() => logger.info('Database connection established'))
      .catch((err) => {
        logger.error('Database connection failed:', err);
        process.exit(1);
      });
  }
  return connection;
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
