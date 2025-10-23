import neo4j, { Driver, driver as createDriver, Session, auth, session as neo4jSession, int, SessionConfig } from 'neo4j-driver';
import { Neo4jConfig } from '../../config';
import config from '../../config';
import { logger } from '../../utils/logger';

let driverInstance: Driver | null = null;
let defaultSession: Session | null = null;
const MAX_RETRIES = 10;
const INITIAL_RETRY_DELAY = 2000; // 2 seconds

/**
 * Wait for a specified time
 */
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Check if Neo4j server is ready to accept connections
 */
async function isNeo4jReady(uri: string, authToken: any): Promise<boolean> {
  try {
    const tempDriver = createDriver(uri, authToken, {
      maxConnectionPoolSize: 1,
      connectionTimeout: 5000, // Shorter timeout for readiness check
      connectionAcquisitionTimeout: 5000,
    });
    
    const session = tempDriver.session({ database: 'system' });
    await session.run('CALL dbms.components()');
    await session.close();
    await tempDriver.close();
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get or create a Neo4j driver instance with retry logic
 */
export async function getDriver(cfg: Neo4jConfig = config.neo4j): Promise<Driver> {
  if (driverInstance) {
    try {
      await verifyConnection(driverInstance);
      return driverInstance;
    } catch (error) {
      logger.warn('Existing Neo4j connection failed, creating a new one...');
      await closeDriver(); // Close existing connection if it exists
    }
  }

  const authToken = auth.basic(cfg.username, cfg.password);
  let lastError: Error | null = null;
  let attempt = 0;
  
  while (attempt < MAX_RETRIES) {
    attempt++;
    const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
    
    try {
      // Wait for Neo4j to be ready
      if (!await isNeo4jReady(cfg.uri, authToken)) {
        logger.warn(`Neo4j not ready, waiting ${delay}ms before attempt ${attempt}...`);
        await wait(delay);
        continue;
      }

      // Create a new driver instance
      driverInstance = createDriver(
        cfg.uri,
        authToken,
        {
          maxConnectionPoolSize: 20,
          connectionTimeout: 60000, // Increased timeout
          connectionAcquisitionTimeout: 120000,
          maxTransactionRetryTime: 30000,
          disableLosslessIntegers: true,
        }
      );

      // Verify the connection
      await verifyConnection(driverInstance);
      logger.info('Successfully connected to Neo4j');
      
      // Set up driver cleanup on process exit
      process.on('exit', () => closeDriver().catch(console.error));
      
      return driverInstance;
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const remainingAttempts = MAX_RETRIES - attempt;
      
      if (remainingAttempts > 0) {
        logger.warn(`Attempt ${attempt} failed: ${lastError.message}. Retrying in ${delay}ms... (${remainingAttempts} attempts remaining)`);
        await wait(delay);
      }
    }
  }
  
  const errorMessage = `Failed to connect to Neo4j after ${MAX_RETRIES} attempts: ${lastError?.message}`;
  logger.error(errorMessage);
  throw new Error(errorMessage, { cause: lastError });
}

/**
 * Verify the Neo4j connection with more detailed error handling
 */
async function verifyConnection(driver: Driver): Promise<void> {
  const session = driver.session();
  try {
    const startTime = Date.now();
    const result = await session.run('CALL dbms.components() YIELD name, versions, edition UNWIND versions as version RETURN name, version, edition');
    const endTime = Date.now();
    
    if (result.records.length === 0) {
      throw new Error('No response from Neo4j server');
    }
    
    const record = result.records[0];
    const name = record.get('name');
    const version = record.get('version');
    const edition = record.get('edition');
    
    logger.info(`Connected to Neo4j ${name} v${version} (${edition}) in ${endTime - startTime}ms`);
    
    // Verify we can read and write
    const writeResult = await session.run('CREATE (n:HealthCheck {timestamp: $ts}) RETURN n', { ts: new Date().toISOString() });
    await session.run('MATCH (n:HealthCheck) DELETE n');
    
    if (!writeResult || !writeResult.summary) {
      throw new Error('Failed to verify write capability');
    }
    
    logger.debug('Neo4j read/write verification successful');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error during connection verification';
    logger.error(`Neo4j connection verification failed: ${errorMessage}`, { 
      error: error instanceof Error ? error.stack : String(error) 
    });
    throw error;
  } finally {
    try {
      await session.close();
    } catch (closeError) {
      logger.warn('Error closing Neo4j session during verification:', closeError);
    }
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
    defaultAccessMode: neo4jSession.READ,
    bookmarks: undefined,
    fetchSize: 1000,
    impersonatedUser: undefined,
    bookmarkManager: undefined
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
