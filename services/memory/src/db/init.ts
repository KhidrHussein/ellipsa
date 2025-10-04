import { getConnection } from './relational/connection.js';
import { getDriver, closeDriver } from './graph/connection.js';
import { getChromaClient, getOrCreateCollection } from './vector/chroma.js';
import config from '../config.js';
import { logger } from '../utils/logger.js';
import { Transaction } from 'neo4j-driver';

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
    const neo4jDriver = getDriver();
    
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
async function verifyNeo4jConstraints(driver: any): Promise<void> {
  const session = driver.session();
  
  try {
    // Create constraints for uniqueness
    await session.writeTransaction((tx: Transaction) =>
      tx.run(`
        CREATE CONSTRAINT entity_id IF NOT EXISTS 
        FOR (e:Entity) REQUIRE e.id IS UNIQUE
      `)
    );
    
    await session.writeTransaction((tx: Transaction) =>
      tx.run(`
        CREATE CONSTRAINT event_id IF NOT EXISTS 
        FOR (e:Event) REQUIRE e.id IS UNIQUE
      `)
    );
    
    await session.writeTransaction((tx: Transaction) =>
      tx.run(`
        CREATE CONSTRAINT task_id IF NOT EXISTS 
        FOR (t:Task) REQUIRE t.id IS UNIQUE
      `)
    );
    
    logger.info('Neo4j constraints verified/created');
  } catch (error) {
    logger.error('Error setting up Neo4j constraints:', error);
    throw error;
  } finally {
    await session.close();
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