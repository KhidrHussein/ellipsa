declare module 'chromadb' {
  export interface ChromaClientConfig {
    path?: string;
    auth?: {
      provider: string;
      credentials: string;
    };
  }

  export interface Collection {
    name: string;
    id: string;
    metadata: Record<string, any>;
    count(): Promise<number>;
    add(
      ids: string | string[],
      embeddings?: number[][],
      metadatas?: Record<string, any>[],
      documents?: string[]
    ): Promise<void>;
    query(
      queryEmbeddings?: number[][],
      nResults?: number,
      where?: Record<string, any>,
      whereDocument?: Record<string, any>,
      include?: string[]
    ): Promise<{
      ids: string[][];
      distances: number[][];
      metadatas: Array<Record<string, any>[]>;
      documents: string[][];
    }>;
    delete(ids?: string[], where?: Record<string, any>): Promise<void>;
    update(
      ids: string[],
      embeddings?: number[][],
      metadatas?: Record<string, any>[],
      documents?: string[]
    ): Promise<void>;
    upsert(
      ids: string[],
      embeddings?: number[][],
      metadatas?: Record<string, any>[],
      documents?: string[]
    ): Promise<void>;
  }

  export interface IEmbeddingFunction {
    generate(texts: string[]): Promise<number[][]>;
  }

  export class ChromaClient {
    constructor(config?: ChromaClientConfig);
    
    listCollections(): Promise<{ name: string; id: string }[]>;
    
    createCollection(params: {
      name: string;
      metadata?: Record<string, any>;
      embeddingFunction?: IEmbeddingFunction;
    }): Promise<Collection>;
    
    getCollection(params: {
      name: string;
      embeddingFunction?: IEmbeddingFunction;
    }): Promise<Collection>;
    
    deleteCollection(name: string): Promise<void>;
    
    reset(): Promise<boolean>;
    
    heartbeat(): Promise<number>;
  }

  export class OpenAIEmbeddingFunction implements IEmbeddingFunction {
    constructor(config: {
      openai_api_key: string;
      openai_model?: string;
      openai_organization?: string;
    });
    
    generate(texts: string[]): Promise<number[][]>;
  }

  export function chromaClient(config?: ChromaClientConfig): ChromaClient;
}
