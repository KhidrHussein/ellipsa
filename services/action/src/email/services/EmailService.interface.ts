import { EmailMessage, EmailSummary, DraftResponse, EmailSweepOptions, EmailSweepResult } from '../types';

export interface IEmailService {
  /**
   * Connect to the email service
   */
  connect(): Promise<void>;

  /**
   * Disconnect from the email service
   */
  disconnect(): Promise<void>;

  /**
   * Fetch emails based on the provided options
   */
  fetchEmails(options: EmailSweepOptions): Promise<EmailMessage[]>;

  /**
   * Get a single email by ID
   */
  getMessage(messageId: string): Promise<EmailMessage>;

  /**
   * Generate a summary of an email thread
   */
  summarizeEmail(email: EmailMessage): Promise<EmailSummary>;

  /**
   * Draft a response to an email
   */
  draftResponse(
    email: EmailMessage,
    context: {
      conversationHistory?: EmailMessage[];
      additionalContext?: string;
    }
  ): Promise<DraftResponse>;

  /**
   * Send an email
   */
  sendEmail(draft: DraftResponse): Promise<{ success: boolean; messageId?: string }>;

  /**
   * Perform an email sweep - fetch, summarize, and draft responses
   */
  performSweep(options?: EmailSweepOptions): Promise<EmailSweepResult>;

  /**
   * Mark an email as read
   * @param messageId The ID of the email to mark as read
   */
  markAsRead(messageId: string): Promise<void>;

  /**
   * Mark an email as read
   * @param messageId The ID of the email to mark as read
   */
  markAsRead(messageId: string): Promise<void>;

  /**
   * Get the current connection status
   */
  isConnected(): Promise<boolean>;
}
