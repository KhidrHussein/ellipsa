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
    database: string;
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
    client: process.env.DB_CLIENT || 'sqlite3',
    connection: {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : undefined,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'ellipsa_memory',
      filename: path.resolve(process.cwd(), 'data/ellipsa.db'), // For SQLite
    },
    pool: {
      min: 2,
      max: 10,
    },
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
    path: path.resolve(process.cwd(), 'data/chroma'),
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
