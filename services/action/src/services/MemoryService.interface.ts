import { EmailMessage, EmailSummary, DraftResponse } from '../email/types';

export interface IMemoryService {
  /**
   * Store an email message in memory
   */
  storeEmail(email: EmailMessage): Promise<void>;

  /**
   * Get conversation history for a thread
   */
  getConversationHistory(threadId: string, limit?: number): Promise<EmailMessage[]>;

  /**
   * Store an email summary in memory
   */
  storeEmailSummary(summary: EmailSummary): Promise<void>;

  /**
   * Get the most recent email summaries
   */
  getRecentSummaries(limit?: number): Promise<EmailSummary[]>;

  /**
   * Update the status of an email (e.g., 'read', 'replied', 'archived')
   */
  updateEmailStatus(emailId: string, status: string): Promise<void>;
}
