
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

export class PromptClient extends ServiceClient {
    constructor(baseURL: string = 'http://localhost:4003') {
        super('PromptService', baseURL);
    }

    async draftEmail(request: DraftEmailRequest): Promise<DraftEmailResponse> {
        return this.request<DraftEmailResponse>({
            method: 'POST',
            url: '/prompt/v1/email/draft',
            data: request,
        });
    }

    async evaluateEmail(request: EvaluateEmailRequest): Promise<EvaluateEmailResponse> {
        return this.request<EvaluateEmailResponse>({
            method: 'POST',
            url: '/prompt/v1/email/evaluate',
            data: request,
        });
    }

    async generateBriefing(request: BriefingRequest): Promise<BriefingResponse> {
        return this.request<BriefingResponse>({
            method: 'POST',
            url: '/prompt/v1/briefing',
            data: request,
        });
    }

    async summarize(content: string): Promise<{ summary: string }> {
        return this.request<{ summary: string }>({
            method: 'POST',
            url: '/prompt/v1/summarize',
            data: { content }
        });
    }
}
