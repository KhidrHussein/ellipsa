import { ServiceClient } from './ServiceClient.js';
export interface DraftEmailRequest {
    history?: string;
    context?: string;
    sender_name: string;
    sender_email: string;
    subject: string;
    email_content: string;
    model?: string;
}
export interface DraftEmailResponse {
    subject: string;
    body: string;
}
export interface EvaluateEmailRequest {
    subject: string;
    sender: string;
    summary: string;
    content_snippet: string;
    model?: string;
}
export interface EvaluateEmailResponse {
    action: 'REPLY' | 'TASK' | 'ARCHIVE' | 'NONE';
    reasoning: string;
    draftIntent?: string;
    suggestedTask?: {
        title: string;
        description: string;
        priority: 'high' | 'medium' | 'low';
        dueDate?: string;
    };
}
export interface BriefingRequest {
    focus: string;
    completed_count: number;
    pending_count: number;
    tomorrow_schedule: string;
    model?: string;
}
export interface BriefingResponse {
    briefing_content: string;
}
export declare class PromptClient extends ServiceClient {
    constructor(baseURL?: string);
    draftEmail(request: DraftEmailRequest): Promise<DraftEmailResponse>;
    evaluateEmail(request: EvaluateEmailRequest): Promise<EvaluateEmailResponse>;
    generateBriefing(request: BriefingRequest): Promise<BriefingResponse>;
    summarize(content: string): Promise<{
        summary: string;
    }>;
}
//# sourceMappingURL=PromptClient.d.ts.map