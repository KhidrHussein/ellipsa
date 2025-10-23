// Re-export interfaces
export * from './interfaces';

// Export any additional types here
export interface StructuredData {
  entities: Array<{
    type: string;
    value: string;
    confidence?: number;
  }>;
  summary: string;
  [key: string]: any;
}
