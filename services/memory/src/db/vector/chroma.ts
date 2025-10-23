import { ChromaClient, type IEmbeddingFunction } from 'chromadb';
import { ChromaConfig } from '../../config';
import config from '../../config';
import { OpenAIEmbeddingFunction } from 'chromadb';

let chromaClient: ChromaClient | null = null;
let embeddingFunction: IEmbeddingFunction | null = null;

/**
 * Get or create a ChromaDB client
 */
export function getChromaClient(cfg: ChromaConfig = config.chroma): ChromaClient {
  if (!chromaClient) {
    try {
      if (cfg.path) {
        // Local persistent storage
        chromaClient = new ChromaClient({
          path: cfg.path,
        });
      } else {
        // Remote server
        const protocol = cfg.ssl ? 'https://' : 'http://';
        const url = `${protocol}${cfg.host}:${cfg.port}`;
        chromaClient = new ChromaClient({
          path: url,
        });
      }
      
      console.log('✅ ChromaDB client initialized');
    } catch (error) {
      console.error('❌ Failed to initialize ChromaDB client:', error);
      throw error;
    }
  }
  return chromaClient;
}

/**
 * Get or create an embedding function
 */
export function getEmbeddingFunction(apiKey: string = config.openaiApiKey || ''): IEmbeddingFunction {
  if (!embeddingFunction) {
    if (!apiKey) {
      throw new Error('OpenAI API key is required for embeddings');
    }
    
    try {
      embeddingFunction = new OpenAIEmbeddingFunction({
        openai_api_key: apiKey,
        openai_model: 'text-embedding-3-small',
      });
      
      console.log('✅ Embedding function initialized');
    } catch (error) {
      console.error('❌ Failed to initialize embedding function:', error);
      throw error;
    }
  }
  return embeddingFunction;
}

/**
 * Close the ChromaDB client
 */
export async function closeChromaClient(): Promise<void> {
  // Chroma client doesn't have a close method in the current version
  chromaClient = null;
  embeddingFunction = null;
  console.log('ChromaDB client closed');
}

/**
 * Get or create a collection
 */
export async function getOrCreateCollection(
  name: string,
  metadata: Record<string, any> = {},
  embeddingFunction?: IEmbeddingFunction
) {
  const client = getChromaClient();
  const ef = embeddingFunction || getEmbeddingFunction();
  
  try {
    // Try to get the existing collection first
    try {
      const collection = await client.getCollection({ name, embeddingFunction: ef });
      console.log(`Using existing collection: ${name}`);
      return collection;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // If collection doesn't exist, create it
      if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
        console.log(`Creating new collection: ${name}`);
        return await client.createCollection({
          name,
          metadata,
          embeddingFunction: ef,
        });
      }
      // If it's a different error, rethrow it
      throw error;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isChromaError = error instanceof Error && 'name' in error && error.name === 'ChromaUniqueError';
    
    // If we get a 'resource already exists' error, try to get the collection again
    if (errorMessage.includes('already exists') || isChromaError) {
      console.log(`Collection ${name} already exists, retrieving it`);
      return await client.getCollection({ name, embeddingFunction: ef });
    }
    console.error(`Error getting/creating collection ${name}:`, error);
    throw error;
  }
}

export { ChromaClient } from 'chromadb';
