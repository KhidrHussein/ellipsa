import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';
import path from 'path';

// Load environment variables from .env file
dotenvConfig({ path: path.resolve(process.cwd(), '.env') });

export interface DatabaseConfig {
  client: string;
  connection: {
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
    filename?: string; // For SQLite
  };
  pool?: {
    min: number;
    max: number;
  };
  migrations?: {
    tableName: string;
    directory: string;
  };
  useNullAsDefault?: boolean;
}

export interface Neo4jConfig {
  uri: string;
  username: string;
  password: string;
  database?: string;
}

export interface ChromaConfig {
  path?: string;
  host?: string;
  port?: number;
  ssl?: boolean;
}

export interface Config {
  port: number;
  env: string;
  database: DatabaseConfig;
  neo4j: Neo4jConfig;
  chroma: ChromaConfig;
  openaiApiKey?: string;
}

const isDev = process.env.NODE_ENV !== 'production';
const config: Config = {
  port: parseInt(process.env.PORT || '4001', 10),
  env: isDev ? 'development' : 'production',
  
  database: {
    client: process.env.DB_CLIENT || 'pg',
    connection: (() => {
      if (process.env.DB_CLIENT === 'pg') {
        return {
          host: process.env.PGHOST || 'localhost',
          port: parseInt(process.env.PGPORT || '5432', 10),
          user: process.env.PGUSER || 'ellipsa',
          password: process.env.PGPASSWORD || 'ellipsa',
          database: process.env.PGDATABASE || 'ellipsa',
        };
      } else {
        return {
          filename: process.env.DB_FILENAME || './data/ellipsa.db'
        };
      }
    })(),
    pool: process.env.DB_CLIENT !== 'pg' ? {
      min: 2,
      max: 10
    } : undefined,
    migrations: {
      tableName: 'knex_migrations',
      directory: path.resolve(process.cwd(), 'migrations'),
    },
    useNullAsDefault: true,
  },

  neo4j: {
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'password',
    database: process.env.NEO4J_DATABASE || 'neo4j',
  },

  chroma: {
    path: process.env.CHROMA_PATH ? path.resolve(process.cwd(), process.env.CHROMA_PATH) : undefined,
    host: process.env.CHROMA_HOST || 'localhost',
    port: process.env.CHROMA_PORT ? parseInt(process.env.CHROMA_PORT, 10) : 8000,
    ssl: process.env.CHROMA_SSL === 'true',
  },

  openaiApiKey: process.env.OPENAI_API_KEY,
};

// Export database configuration for Knex
export const database = config.database;

export { config };
export default config;
