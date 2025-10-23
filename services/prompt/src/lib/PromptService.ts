import { OpenAI } from 'openai';
import { ExtractionResult, validateExtraction } from '../schemas/extraction';
import { EXTRACTION_PROMPT, FUNCTION_PROMPTS, SUMMARIZATION_PROMPT } from './prompts';

type ModelName = 'gpt-4' | 'gpt-3.5-turbo' | 'gpt-4-turbo';

interface PromptServiceOptions {
  apiKey: string;
  defaultModel?: ModelName;
  temperature?: number;
  maxRetries?: number;
}

export class PromptService {
  private openai: OpenAI;
  private defaultModel: ModelName;
  private temperature: number;
  private maxRetries: number;
  private requestCount = 0;

  constructor(options: PromptServiceOptions) {
    this.openai = new OpenAI({ apiKey: options.apiKey });
    this.defaultModel = options.defaultModel || 'gpt-4';
    this.temperature = options.temperature ?? 0.3;
    this.maxRetries = options.maxRetries ?? 3;
  }

  /**
   * Extract structured data from text using LLM
   */
  async extractStructuredData(
    content: string,
    model: ModelName = this.defaultModel
  ): Promise<ExtractionResult> {
    const prompt = EXTRACTION_PROMPT.replace('{content}', content);
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.openai.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: 'You are a precise information extraction system.' },
            { role: 'user', content: prompt }
          ],
          temperature: this.temperature,
          response_format: { type: 'json_object' },
        });

        const result = JSON.parse(response.choices[0]?.message?.content || '{}');
        return validateExtraction(result);
      } catch (error) {
        if (attempt === this.maxRetries) {
          console.error('Max retries reached, returning fallback result');
          return this.getFallbackExtraction(content);
        }
        console.warn(`Attempt ${attempt} failed, retrying...`, error);
      }
    }
    
    return this.getFallbackExtraction(content);
  }

  /**
   * Generate a summary of the content
   */
  async summarizeContent(
    content: string,
    model: ModelName = this.defaultModel
  ): Promise<string> {
    const prompt = SUMMARIZATION_PROMPT.replace('{content}', content);
    
    const response = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: 'You are a helpful assistant that summarizes content concisely.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2, // Lower temperature for more factual summaries
    });

    return response.choices[0]?.message?.content || '';
  }

  /**
   * Extract entities using function calling
   */
  async extractEntities(content: string): Promise<Array<{type: string, value: string}>> {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'Extract entities from the following text.' },
        { role: 'user', content }
      ],
      functions: [FUNCTION_PROMPTS.extract_entities],
      function_call: { name: 'extract_entities' },
    });

    const functionCall = response.choices[0]?.message?.function_call;
    if (functionCall?.name === 'extract_entities') {
      const args = JSON.parse(functionCall.arguments);
      return args.entities || [];
    }
    
    return [];
  }

  /**
   * Simple health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.openai.models.list();
      return true;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }

  /**
   * Get request count (for monitoring)
   */
  getRequestCount(): number {
    return this.requestCount;
  }

  private getFallbackExtraction(content: string): ExtractionResult {
    return {
      summary: content.slice(0, 200) + (content.length > 200 ? '...' : ''),
      action_items: [],
      entities: [],
      topics: [],
      confidence: 0.5
    };
  }
}
