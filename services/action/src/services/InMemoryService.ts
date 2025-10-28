import { EmailMessage, EmailSummary, DraftResponse } from '../email/types';

export interface IMemoryService {
  storeEmail(email: EmailMessage): Promise<void>;
  getEmail(emailId: string): Promise<EmailMessage | null>;
  storeSummary(summary: Omit<EmailSummary, 'id'> & { id?: string }): Promise<void>;
  getSummary(threadId: string): Promise<EmailSummary | null>;
  storeDraft(draft: DraftResponse): Promise<void>;
  getDraft(threadId: string): Promise<DraftResponse | null>;
  getConversationHistory(threadId: string): Promise<EmailMessage[]>;
  updateEmailStatus(emailId: string, status: 'read' | 'unread' | 'archived' | 'deleted'): Promise<void>;
}

type StoredSummary = Omit<EmailSummary, 'id'> & { id: string };

export class InMemoryService implements IMemoryService {
  private emails: Map<string, EmailMessage> = new Map();
  private summaries: Map<string, StoredSummary> = new Map();
  private drafts: Map<string, DraftResponse> = new Map();
  private conversations: Map<string, EmailMessage[]> = new Map();

  async storeEmail(email: EmailMessage): Promise<void> {
    this.emails.set(email.id, email);
    
    // Update conversation history using threadId
    const threadId = email.threadId;
    const conversation = this.conversations.get(threadId) || [];
    
    // Only add if not already in conversation
    if (!conversation.some(msg => msg.id === email.id)) {
      conversation.push(email);
      // Sort by date
      conversation.sort((a, b) => a.date.getTime() - b.date.getTime());
      this.conversations.set(threadId, conversation);
    }
  }

  async getEmail(emailId: string): Promise<EmailMessage | null> {
    return this.emails.get(emailId) || null;
  }

  async storeSummary(summary: Omit<EmailSummary, 'id'> & { id?: string }): Promise<void> {
    const storedSummary: StoredSummary = {
      ...summary,
      id: summary.id || summary.threadId,
    };
    this.summaries.set(summary.threadId, storedSummary);
  }

  async getSummary(threadId: string): Promise<EmailSummary | null> {
    const summary = this.summaries.get(threadId);
    return summary ? { ...summary } : null;
  }

  async storeDraft(draft: DraftResponse): Promise<void> {
    this.drafts.set(draft.threadId, { ...draft });
  }

  async getDraft(threadId: string): Promise<DraftResponse | null> {
    const draft = this.drafts.get(threadId);
    return draft ? { ...draft } : null;
  }

  async getConversationHistory(threadId: string): Promise<EmailMessage[]> {
    return [...(this.conversations.get(threadId) || [])];
  }

  async updateEmailStatus(emailId: string, status: 'read' | 'unread' | 'archived' | 'deleted'): Promise<void> {
    const email = this.emails.get(emailId);
    if (email) {
      // Update the email's read status
      (email as any).isRead = status === 'read';
      this.emails.set(emailId, email);
    }
  }

  // For testing/debugging
  clear(): void {
    this.emails.clear();
    this.summaries.clear();
    this.drafts.clear();
    this.conversations.clear();
  }
}
