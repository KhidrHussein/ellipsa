import { EmailMessage, EmailSummary, DraftResponse } from './index';

export interface EmailSweepOptions {
  // Existing options
  maxResults?: number;
  labelIds?: string[];
  includeSpamTrash?: boolean;
  includeRead?: boolean;
  minImportance?: 'high' | 'medium' | 'low';
  
  // New options for enhanced filtering
  unreadOnly?: boolean;
  label?: string;
  sender?: string;
  subject?: string;
  after?: Date;
  before?: Date;
  limit?: number;
}

export interface EmailSweepResult {
  processed: number;
  summaries: EmailSummary[];
  errors: Array<{ id: string; error: string }>;
  nextPageToken?: string;
}

export interface IEmailService {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getEmail(id: string): Promise<EmailMessage>;
  sendEmail(draft: DraftResponse): Promise<{ success: boolean; messageId?: string }>;
  performSweep(options: EmailSweepOptions): Promise<EmailSweepResult>;
  draftResponse(
    email: EmailMessage,
    context: {
      conversationHistory?: EmailMessage[];
      additionalContext?: string;
    }
  ): Promise<DraftResponse>;
}

export * from './index';
