import { IPromptService, StructuredData } from './interfaces';
interface PromptServiceOptions {
    apiKey: string;
    defaultModel?: string;
}
export declare class PromptService implements IPromptService {
    private options;
    constructor(options: PromptServiceOptions);
    /**
     * Extracts structured data from the provided content
     * @param content The content to extract data from
     * @returns A promise that resolves to the extracted structured data
     */
    extractStructuredData(content: string): Promise<StructuredData>;
    /**
     * Generates a summary of the provided content
     * @param content The content to summarize
     * @returns A promise that resolves to the generated summary
     */
    summarizeContent(content: string): Promise<string>;
    /**
     * Generates text based on the provided prompt and options
     * @param options The options for text generation
     * @returns A promise that resolves to the generated text
     */
    generateText(options: {
        prompt: string;
        maxTokens?: number;
        temperature?: number;
    }): Promise<string>;
}
export * from './interfaces';
//# sourceMappingURL=index.d.ts.map