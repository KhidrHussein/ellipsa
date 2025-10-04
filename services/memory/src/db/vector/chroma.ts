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
    // Check if collection exists
    const collections = await client.listCollections();
    const existing = collections.find(c => c.name === name);
    
    if (existing) {
      console.log(`Using existing collection: ${name}`);
      return await client.getCollection({ name, embeddingFunction: ef });
    }
    
    console.log(`Creating new collection: ${name}`);
    return await client.createCollection({
      name,
      metadata,
      embeddingFunction: ef,
    });
  } catch (error) {
    console.error(`Error getting/creating collection ${name}:`, error);
    throw error;
  }
}

export { ChromaClient } from 'chromadb';
