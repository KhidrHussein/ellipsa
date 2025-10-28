import { EmailMessage, EmailSummary, DraftResponse } from '../types';

export interface IEmailMemoryService {
  // Core email operations
  storeEmail(email: EmailMessage): Promise<void>;
  getEmail(id: string): Promise<EmailMessage | null>;
  searchEmails(query: string): Promise<EmailSummary[]>;
  
  // Email management
  storeEmailSummary(emailId: string, summary: string): Promise<void>;
  updateEmailStatus(emailId: string, status: string): Promise<void>;
  getConversationHistory(threadId: string): Promise<EmailMessage[]>;
  
  // Draft operations
  createDraft(draft: any): Promise<DraftResponse>;
  
  // Internal state management (exposed for testing)
  readonly entities: Map<string, any>;
  readonly events: Map<string, any>;
  readonly emails: Map<string, EmailMessage>;
  readonly drafts: Map<string, any>;
}
