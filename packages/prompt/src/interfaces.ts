// Define interfaces for the PromptService
export interface IPromptService {
  extractStructuredData(content: string): Promise<StructuredData>;
  summarizeContent(content: string): Promise<string>;
}

export interface StructuredData {
  entities: Array<{
    type: string;
    value: string;
    confidence?: number;
  }>;
  summary: string;
  // Add more fields as needed
}
