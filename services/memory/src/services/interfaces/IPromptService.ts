export interface ExtractionResult {
    summary: string;
    confidence?: number;
    sentiment?: string;
    topics?: string[];
    entities: Array<{
        type: string;
        value: string;
        label?: string;
        context?: string;
    }>;
    action_items?: Array<{
        text: string;
        priority: 'low' | 'medium' | 'high';
        due_date?: string;
        status?: string;
    }>;
    suggestions?: string[];
}

export interface IPromptService {
    extractStructuredData(content: string): Promise<ExtractionResult>;
    generate(prompt: string, options?: any): Promise<string>;
}
