/// <reference types="node" />

export interface EmailAddress {
  name?: string;
  address: string;
}

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  size: number;
  content: Uint8Array;
  contentId?: string;
}

export interface EmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  date: Date;
  text?: string;
  html?: string;
  attachments?: EmailAttachment[];
  labels?: string[];
  isRead: boolean;
  inReplyTo?: string;
  references?: string[];
  metadata?: Record<string, unknown>;
  // Extended fields
  headers?: Record<string, string>;
  hasAttachments?: boolean;
  snippet?: string;
}

export interface EmailSummary {
  id: string;
  threadId: string;
  subject: string;
  from: EmailAddress;
  date: Date;
  summary: string;
  actionRequired: boolean;
  priority: 'high' | 'medium' | 'low';
  categories: string[];
  metadata?: Record<string, unknown>;
}

export interface DraftResponse {
  threadId?: string;
  to: EmailAddress[];
  from?: EmailAddress;
  subject: string;
  emailId?: string;
  body?: string;
  text?: string;
  html?: string;
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  inReplyTo?: string;
  references?: string[];
  attachments?: EmailAttachment[];
  isDraft?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface EmailSweepOptions {
  // Existing options
  maxResults?: number;
  labelIds?: string[];
  includeSpamTrash?: boolean;
  includeRead?: boolean;
  minImportance?: 'high' | 'medium' | 'low';
  
  // Additional options specific to this interface
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
