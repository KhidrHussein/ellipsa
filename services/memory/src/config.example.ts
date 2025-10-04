import path from 'path';
import { z } from 'zod';

// Environment variable schema using Zod for validation
const envSchema = z.object({
  // Server Configuration
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('4000'),
  
  // Database Configuration
  DB_CLIENT: z.enum(['sqlite3', 'pg']).default('sqlite3'),
  DB_HOST: z.string().optional(),
  DB_PORT: z.string().optional(),
  DB_USER: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  DB_NAME: z.string().default('ellipsa_memory'),
  
  // Neo4j Configuration
  NEO4J_URI: z.string().default('bolt://localhost:7687'),
  NEO4J_USERNAME: z.string().default('neo4j'),
  NEO4J_PASSWORD: z.string(),
  NEO4J_DATABASE: z.string().default('neo4j'),
  
  // ChromaDB Configuration
  CHROMA_HOST: z.string().default('localhost'),
  CHROMA_PORT: z.string().default('8000'),
  CHROMA_SSL: z.string().default('false'),
  
  // OpenAI Configuration (for embeddings)
  OPENAI_API_KEY: z.string(),
  
  // Logging
  LOG_LEVEL: z.enum([
    'error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'
  ]).default('info'),
});

type EnvConfig = z.infer<typeof envSchema>;

// Default configuration
export const config: EnvConfig = {
  NODE_ENV: 'development',
  PORT: '4000',
  
  DB_CLIENT: 'sqlite3',
  DB_NAME: 'ellipsa_memory',
  
  NEO4J_URI: 'bolt://localhost:7687',
  NEO4J_USERNAME: 'neo4j',
  NEO4J_PASSWORD: 'your_neo4j_password',
  NEO4J_DATABASE: 'neo4j',
  
  CHROMA_HOST: 'localhost',
  CHROMA_PORT: '8000',
  CHROMA_SSL: 'false',
  
  OPENAI_API_KEY: 'your_openai_api_key',
  
  LOG_LEVEL: 'info',
};

// Load environment variables from .env file in development
if (process.env.NODE_ENV !== 'production') {
  (async () => {
    try {
      const dotenv = await import('dotenv');
      const envPath = path.resolve(process.cwd(), '.env');
      dotenv.config({ path: envPath });
    } catch (error) {
      console.warn('Failed to load .env file:', error);
    }
  })();
}

// Parse and validate environment variables
try {
  const envVars = envSchema.parse({
    ...process.env,
    // Include any overrides here
  });
  
  // Merge with default config
  Object.assign(config, envVars);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('❌ Invalid environment variables:', error.errors);
    process.exit(1);
  }
  throw error;
}

// Export the configuration
export default config;
