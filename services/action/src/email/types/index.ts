export interface EmailAddress {
  name?: string;
  address: string;
}

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  size: number;
  content: Buffer;
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
  body?: string;
  text?: string;
  html?: string;
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  inReplyTo?: string;
  references?: string[];
  attachments?: EmailAttachment[];
}

export interface EmailSweepOptions {
  // Pagination
  maxResults?: number;
  pageToken?: string;
  
  // Filtering
  labelIds?: string[];
  includeSpamTrash?: boolean;
  includeRead?: boolean;
  minImportance?: 'high' | 'medium' | 'low';
  
  // Search criteria
  unreadOnly?: boolean;
  label?: string;
  sender?: string;
  from?: string;  // Sender's email address to filter by
  subject?: string;
  after?: Date;
  before?: Date;
  
  // Aliases for backward compatibility
  limit?: number; // Alias for maxResults
}

export interface EmailSweepResult {
  processed: number;
  summaries: EmailSummary[];
  errors: Array<{ id: string; error: string }>;
  nextPageToken?: string;
}
