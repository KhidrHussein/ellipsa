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

export interface AssistanceContext {
    transcript: string;
    screenContext?: string;
    activityType?: string;
    memoryBullets?: string[];
    recentHistory?: string[];
    image?: string; // Base64 image data
}

export interface AssistanceResponse {
    message: string;
    confidence: number;
    action_items?: Array<{
        text: string;
        priority?: 'low' | 'medium' | 'high';
    }>;
    suggested_responses?: string[];
    supporting_facts?: string[];
    clarifying_questions?: string[];
}

export interface ChatContext {
    message: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
    memoryContext?: string[];
    screenContext?: string;
}

export interface ChatResponse {
    message: string;
    actionPlan?: any; // JSON action plan for ActionService
    suggestedActions?: string[];
}

export interface IPromptService {
    extractStructuredData(content: string, model?: string, systemPrompt?: string): Promise<ExtractionResult>;
    generate(prompt: string, options?: any): Promise<string>;
    generateAssistance(context: AssistanceContext, systemPrompt?: string): Promise<AssistanceResponse>;
    generateChatResponse(context: ChatContext): Promise<ChatResponse>;
}
