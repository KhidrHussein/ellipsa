export interface IPromptService {
    extractStructuredData(content: string): Promise<StructuredData>;
    summarizeContent(content: string): Promise<string>;
    generateText(options: {
        prompt: string;
        maxTokens?: number;
        temperature?: number;
    }): Promise<string>;
}
export interface StructuredData {
    entities: Array<{
        type: string;
        value: string;
        confidence?: number;
    }>;
    summary: string;
}
//# sourceMappingURL=interfaces.d.ts.map