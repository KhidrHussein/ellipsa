import { EmailMessage, EmailSummary, DraftResponse } from '../email/types.js';
import { MemoryClient } from '@ellipsa/shared';

export interface IMemoryService {
  storeEmail(email: EmailMessage): Promise<void>;
  getEmail(emailId: string): Promise<EmailMessage | null>;
  storeSummary(summary: Omit<EmailSummary, 'id'> & { id?: string }): Promise<void>;
  getSummary(threadId: string): Promise<EmailSummary | null>;
  createDraft(draft: DraftResponse): Promise<DraftResponse>;
  storeDraft(draft: DraftResponse): Promise<void>;
  getDraft(id: string): Promise<DraftResponse | null>;
  deleteDraft(id: string): Promise<void>;
  getDrafts(): Promise<DraftResponse[]>;
  getConversationHistory(threadId: string): Promise<EmailMessage[]>;
  updateEmailStatus(emailId: string, status: 'read' | 'unread' | 'archived' | 'deleted'): Promise<void>;
}

type StoredSummary = Omit<EmailSummary, 'id'> & { id: string };

export class InMemoryService implements IMemoryService {
  private emails: Map<string, EmailMessage> = new Map();
  private summaries: Map<string, StoredSummary> = new Map();
  private drafts: Map<string, DraftResponse> = new Map();
  private conversations: Map<string, EmailMessage[]> = new Map();
  private memoryClient?: MemoryClient;

  constructor(memoryClient?: MemoryClient) {
    this.memoryClient = memoryClient;
  }

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

  async createDraft(draft: DraftResponse): Promise<DraftResponse> {
    const id = draft.id || draft.threadId || `draft-${Date.now()}`;
    const draftWithId = { ...draft, id };

    if (this.memoryClient) {
      try {
        const payload = {
          ...draftWithId,
          thread_id: draftWithId.threadId,
          in_reply_to: draftWithId.inReplyTo,
          email_id: draftWithId.emailId,
        };
        await this.memoryClient.createDraft(payload);
        return draftWithId;
      } catch (error) {
        console.error('Failed to persist draft:', error);
        // Fallback or rethrow? For now fallback to Map is confusing if one succeeds and other fails.
        // Let's rely on memoryClient if present.
      }
    }

    this.drafts.set(id, draftWithId);
    return draftWithId;
  }

  // Alias for backward compatibility if needed, but prefer createDraft
  async storeDraft(draft: DraftResponse): Promise<void> {
    await this.createDraft(draft);
  }

  async getDraft(id: string): Promise<DraftResponse | null> {
    if (this.memoryClient) {
      try {
        const remoteDraft = await this.memoryClient.getDraft(id);
        if (remoteDraft) {
          return {
            ...remoteDraft,
            threadId: remoteDraft.thread_id || remoteDraft.threadId,
            inReplyTo: remoteDraft.in_reply_to || remoteDraft.inReplyTo,
            emailId: remoteDraft.email_id || remoteDraft.emailId,
          };
        }
      } catch (error) {
        // console.error('Failed to get remote draft:', error);
      }
    }
    const draft = this.drafts.get(id);
    return draft ? { ...draft } : null;
  }

  async deleteDraft(id: string): Promise<void> {
    if (this.memoryClient) {
      try {
        await this.memoryClient.deleteDraft(id);
      } catch (error) {
        console.error('Failed to delete remote draft:', error);
      }
    }
    this.drafts.delete(id);
  }

  async getDrafts(): Promise<DraftResponse[]> {
    if (this.memoryClient) {
      try {
        const response = await this.memoryClient.getDrafts();
        const results = (response as any).data || (Array.isArray(response) ? response : []);
        return results.map((d: any) => ({
          ...d,
          threadId: d.thread_id || d.threadId,
          inReplyTo: d.in_reply_to || d.inReplyTo,
          emailId: d.email_id || d.emailId,
        }));
      } catch (error) {
        console.error('Failed to get remote drafts:', error);
      }
    }
    return Array.from(this.drafts.values());
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
