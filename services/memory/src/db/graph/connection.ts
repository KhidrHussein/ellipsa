import neo4j, { Driver, driver as createDriver, Session, auth, SessionConfig, AuthToken } from 'neo4j-driver';
import { Neo4jConfig } from '../../config';
import config from '../../config';
import { logger } from '../../utils/logger';

let driverInstance: Driver | null = null;
let defaultSession: Session | null = null;

/**
 * Get or create a Neo4j driver instance
 */
export function getDriver(cfg: Neo4jConfig = config.neo4j): Driver {
  if (!driverInstance) {
    try {
      // For Neo4j 4.0+, we need to provide authentication even if it's empty
      let authToken: AuthToken;
      
      if (cfg.username && cfg.password) {
        authToken = auth.basic(cfg.username, cfg.password);
      } else {
        // For no-auth or when using environment variables
        authToken = auth.basic('', '');
      }
        
      driverInstance = createDriver(
        cfg.uri,
        authToken,
        {
          maxConnectionPoolSize: 50,
          connectionTimeout: 30000, // 30 seconds
          connectionAcquisitionTimeout: 120000, // 2 minutes
          maxTransactionRetryTime: 30000, // 30 seconds
          disableLosslessIntegers: true,
        }
      );
      
      // Test the connection
      verifyConnection(driverInstance).catch(err => {
        logger.error('Failed to verify Neo4j connection:', err);
        throw err;
      });
    } catch (error) {
      logger.error('Failed to create Neo4j driver:', error);
      throw error;
    }
  }
  return driverInstance;
}

/**
 * Verify the Neo4j connection
 */
async function verifyConnection(driver: Driver): Promise<void> {
  const session = driver.session();
  try {
    await session.run('RETURN 1');
    logger.info('Neo4j connection established');
  } catch (error) {
    logger.error('Failed to connect to Neo4j:', error);
    throw error;
  } finally {
    await session.close();
  }
}

/**
 * Get a Neo4j session
 */
export function getSession(database?: string): Session {
  if (!driverInstance) {
    throw new Error('Driver not initialized. Call getDriver() first.');
  }
  
  const sessionConfig: SessionConfig = {
    database: database || config.neo4j.database,
    defaultAccessMode: neo4j.session.READ,
  };
  
  return driverInstance.session(sessionConfig);
}

/**
 * Get or create a default Neo4j session (singleton)
 */
export function getNeo4jSession(database?: string): Session {
  if (!defaultSession) {
    defaultSession = getSession(database);
    logger.info('Neo4j session created');
  }
  return defaultSession;
}

/**
 * Close the Neo4j driver and all sessions
 */
export async function closeDriver(): Promise<void> {
  try {
    // Close default session if it exists
    if (defaultSession) {
      await defaultSession.close();
      defaultSession = null;
      logger.info('Default Neo4j session closed');
    }

    // Close driver (this will close all remaining sessions)
    if (driverInstance) {
      await driverInstance.close();
      driverInstance = null;
      logger.info('Neo4j driver closed');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Error closing Neo4j connections: ${errorMessage}`);
    throw error;
  }
}

/**
 * Execute a read transaction
 */
export async function readTransaction<T>(
  callback: (session: Session) => Promise<T>,
  database?: string
): Promise<T> {
  const session = getSession(database);
  try {
    return await session.executeRead(async (tx) => {
      return await callback(session);
    });
  } finally {
    await session.close();
  }
}

/**
 * Execute a write transaction
 */
export async function writeTransaction<T>(
  callback: (session: Session) => Promise<T>,
  database?: string
): Promise<T> {
  const session = getSession(database);
  try {
    return await session.executeWrite(async (tx) => {
      return await callback(session);
    });
  } finally {
    await session.close();
  }
}
