import neo4j, { Driver, driver as createDriver, Session, auth } from 'neo4j-driver';
import { Neo4jConfig } from '../../config';
import config from '../../config';

let driverInstance: Driver | null = null;

/**
 * Get or create a Neo4j driver instance
 */
export function getDriver(cfg: Neo4jConfig = config.neo4j): Driver {
  if (!driverInstance) {
    try {
      driverInstance = createDriver(
        cfg.uri,
        cfg.username ? 
          auth.basic(cfg.username, cfg.password) : 
          undefined,
        {
          maxConnectionPoolSize: 50,
          connectionTimeout: 30000, // 30 seconds
          connectionAcquisitionTimeout: 120000, // 2 minutes
          maxTransactionRetryTime: 30000, // 30 seconds
          disableLosslessIntegers: true,
        }
      );
      
      // Test the connection
      verifyConnection(driverInstance);
    } catch (error) {
      console.error('❌ Failed to create Neo4j driver:', error);
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
    console.log('✅ Neo4j connection established');
  } catch (error) {
    console.error('❌ Failed to connect to Neo4j:', error);
    throw error;
  } finally {
    await session.close();
  }
}

/**
 * Get a Neo4j session
 */
export function getSession(database?: string): Session {
  const driver = getDriver();
  return driver.session({
    database: database || config.neo4j.database,
    defaultAccessMode: 'WRITE',
  });
}

/**
 * Close the Neo4j driver
 */
export async function closeDriver(): Promise<void> {
  if (driverInstance) {
    await driverInstance.close();
    driverInstance = null;
    console.log('Neo4j driver closed');
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
    return await session.readTransaction(tx => 
      callback(session)
    );
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
    return await session.writeTransaction(tx => 
      callback(session)
    );
  } finally {
    await session.close();
  }
}
