import knex, { Knex } from 'knex';
import { DatabaseConfig } from '../../config';
import config from '../../config';

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
    });

    // Test the connection
    connection.raw('SELECT 1')
      .then(() => console.log('✅ Database connection established'))
      .catch((err) => {
        console.error('❌ Database connection failed:', err);
        process.exit(1);
      });
  }
  return connection;
}

/**
 * Close the database connection
 */
export async function closeConnection(): Promise<void> {
  if (connection) {
    await connection.destroy();
    connection = null;
    console.log('Database connection closed');
  }
}

export { Knex } from 'knex';
