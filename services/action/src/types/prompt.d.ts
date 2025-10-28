declare module '@ellipsa/prompt' {
  export interface PromptServiceOptions {
    apiKey: string;
    defaultModel?: string;
    temperature?: number;
    maxRetries?: number;
  }

  export interface TextGenerationOptions {
    prompt: string;
    maxTokens?: number;
    temperature?: number;
  }

  export class PromptService {
    constructor(options: PromptServiceOptions);
    
    extractStructuredData(content: string, model?: string): Promise<Record<string, unknown>>;
    
    summarizeContent(content: string, model?: string): Promise<string>;
    
    generateText(options: TextGenerationOptions): Promise<string>;
    
    extractEntities(content: string): Promise<Array<{type: string; value: string}>>;
  }
}
