import { getConnection } from './relational/connection.js';
import { getDriver, closeDriver } from './graph/connection.js';
import { getChromaClient, getOrCreateCollection } from './vector/chroma';
import config from '../config';
import { logger } from '../utils/logger';
import type { Driver, Session, Transaction } from 'neo4j-driver';

/**
 * Initialize all database connections and verify connectivity
 */
export async function initializeDatabases(): Promise<{
  knex: any; // Knex instance
  neo4jDriver: any; // Neo4j Driver instance
  chromaCollections: {
    entities: any;
    events: any;
  };
}> {
  try {
    logger.info('Initializing database connections...');
    
    // 1. Initialize relational database (PostgreSQL/SQLite)
    const knex = getConnection();
    
    // Run migrations
    logger.info('Running database migrations...');
    await knex.migrate.latest();
    
    // 2. Initialize Neo4j graph database
    const neo4jDriver = await getDriver();
    
    // Verify Neo4j connection and constraints
    await verifyNeo4jConstraints(neo4jDriver);
    
    // 3. Initialize ChromaDB vector store
    const chromaClient = getChromaClient();
    
    // Create or get collections
    logger.info('Initializing vector collections...');
    const [entitiesCollection, eventsCollection] = await Promise.all([
      getOrCreateCollection('entities', {
        description: 'Entities vector store for semantic search',
      }),
      getOrCreateCollection('events', {
        description: 'Events vector store for semantic search',
      }),
    ]);
    
    logger.info('Database initialization completed successfully');
    
    return {
      knex,
      neo4jDriver,
      chromaCollections: {
        entities: entitiesCollection,
        events: eventsCollection,
      },
    };
  } catch (error) {
    logger.error('Failed to initialize databases:', error);
    await closeConnections();
    throw error;
  }
}

/**
 * Verify and create necessary Neo4j constraints
 */
async function verifyNeo4jConstraints(driver: Driver): Promise<void> {
  const session = driver.session();
  
  try {
    // Create constraints for uniqueness
    const constraints = [
      {
        name: 'entity_id',
        label: 'Entity',
        property: 'id'
      },
      {
        name: 'event_id',
        label: 'Event',
        property: 'id'
      },
      {
        name: 'task_id',
        label: 'Task',
        property: 'id'
      }
    ];

    for (const constraint of constraints) {
      try {
        await session.writeTransaction((tx: Transaction) =>
          tx.run(`
            CREATE CONSTRAINT ${constraint.name} IF NOT EXISTS 
            FOR (n:${constraint.label}) REQUIRE n.${constraint.property} IS UNIQUE
          `)
        );
        logger.debug(`Created constraint ${constraint.name} on :${constraint.label}(${constraint.property})`);
      } catch (error) {
        logger.warn(`Failed to create constraint ${constraint.name}:`, error);
        throw error;
      }
    }
    
    logger.info('Neo4j constraints verified/created');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error setting up Neo4j constraints:', errorMessage);
    throw error;
  } finally {
    try {
      await session.close();
    } catch (closeError) {
      logger.warn('Error closing Neo4j session:', closeError);
    }
  }
}

/**
 * Close all database connections
 */
export async function closeConnections(): Promise<void> {
  try {
    // Close relational database connection
    const { closeConnection } = await import('./relational/connection.js');
    await closeConnection();
    
    // Close Neo4j driver
    const { closeDriver } = await import('./graph/connection.js');
    await closeDriver();
    
    // Note: ChromaDB client is stateless, no need to close
    
    logger.info('Database connections closed');
  } catch (error) {
    logger.error('Error closing database connections:', error);
    throw error;
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  logger.info('SIGINT received. Closing database connections...');
  await closeConnections();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received. Closing database connections...');
  await closeConnections();
  process.exit(0);
});