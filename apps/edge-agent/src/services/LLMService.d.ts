export interface StructuredData {
    type: string;
    data: Record<string, any>;
    entities?: Record<string, any>[];
    summary?: string;
    suggestions?: string[];
    requiresAction?: boolean;
    contextId?: string;
}
type ExtractionResult = StructuredData;
interface ScreenMetadata {
    windowTitle: string;
    appName: string;
    timestamp: string;
    url?: string;
}
declare class LLMServiceImpl {
    private ipc;
    private isMain;
    private activeContexts;
    private readonly DEFAULT_CONTEXT_WINDOW;
    constructor(isMain: boolean);
    extractStructuredData(content: string, contextId?: string): Promise<ExtractionResult>;
    generateSummary(content: string): Promise<string>;
    private getOrCreateContext;
    private addMessageToContext;
    private cleanupOldContexts;
    private requiresAction;
    generateResponse(contextId: string, message: string): Promise<{
        suggestions: string[];
    }>;
    processScreenContent(textContent: string, metadata: ScreenMetadata): Promise<ExtractionResult>;
    processAudioTranscription(transcription: string): Promise<ExtractionResult>;
}
export declare const LLMService: LLMServiceImpl;
export declare function initializeLLMService(isMain: boolean): void;
export {};
//# sourceMappingURL=LLMService.d.ts.map