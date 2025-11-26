// @ts-nocheck
// Google APIs and Auth
import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';

// Import types from local modules
import type { 
  EmailMessage, 
  EmailSummary, 
  DraftResponse, 
  EmailSweepOptions, 
  EmailSweepResult, 
  EmailAddress,
  EmailAttachment
} from '../types';
import type { IEmailService } from './EmailService.interface';
import type { EmailProcessingService } from './EmailProcessingService';
import type { IEmailMemoryService } from './IEmailMemoryService';
import { oauthService } from './OAuthService';

// Type definitions for Gmail API
interface GmailMessagePart {
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: {
    data?: string;
    size?: number;
  };
  parts?: GmailMessagePart[];
}

interface GmailMessage {
  id?: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  payload?: {
    headers?: Array<{ name?: string; value?: string }>;
    parts?: GmailMessagePart[];
    body?: {
      data?: string;
      size?: number;
    };
    mimeType?: string;
    filename?: string;
  };
}

// Type for Gmail API response
type GmailApiResponse<T> = {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  config: any;
  request: any;
};

// Global type augmentation for Buffer
declare global {
  // eslint-disable-next-line no-var
  var Buffer: {
    from(str: string, encoding?: string): Buffer;
    // Add other Buffer methods as needed
  };
}

// Use global Buffer in Node.js environment
const Buffer = (() => {
  if (typeof globalThis.Buffer !== 'undefined') {
    return globalThis.Buffer;
  }
  // @ts-ignore - Dynamic require in Node.js
  if (typeof require === 'function') {
    try {
      // @ts-ignore - Dynamic require in Node.js
      return require('buffer').Buffer;
    } catch (e) {
      // Ignore error
    }
  }
  throw new Error('Buffer is not available in this environment');
})();

// Type for OAuth2Client with our custom methods
interface CustomOAuth2Client extends OAuth2Client {
  getAccessToken(): Promise<{
    token?: string | null;
    res?: any;
  }>;
}

// Mock the services if they don't exist
const emailProcessingService: Partial<EmailProcessingService> = {} as EmailProcessingService;
const emailMemoryService: Partial<IEmailMemoryService> = {} as IEmailMemoryService;
const mockOAuthService: typeof oauthService = {
  getClient: async () => ({} as CustomOAuth2Client),
  isAuthenticated: () => Promise.resolve(true),
  getAuthUrl: () => '',
  getTokens: () => Promise.resolve({}),
  revokeToken: () => Promise.resolve(),
  on: () => {},
  off: () => {}
};

// Use mock services if the real ones aren't available
const safeOAuthService = (oauthService as typeof oauthService) || mockOAuthService;

declare global {
  // eslint-disable-next-line no-var
  var Buffer: typeof globalThis.Buffer;
}

declare const console: {
  log: (...args: any[]) => void;
  error: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  info: (...args: any[]) => void;
  debug: (...args: any[]) => void;
};

interface GmailMessagePart {
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { data?: string; size?: number };
  parts?: GmailMessagePart[];
}

/**
 * Gmail implementation of the IEmailService interface
 */
export class GmailEmailService implements IEmailService {
  private gmail: gmail_v1.Gmail;
  private oAuth2Client: OAuth2Client;
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY_MS = 1000;

  // This helps TypeScript understand that this class implements IEmailService
  public static readonly IEmailService: new (...args: any[]) => IEmailService = GmailEmailService as any;

  /**
   * Static factory method to create a new instance of GmailEmailService
   */
  static create(
    processingService: EmailProcessingService,
    memoryService: IEmailMemoryService
  ): GmailEmailService {
    try {
      const oauth2Client = oauthService.getClient();
      
      // Verify we have the required scopes (just log a warning if not, don't fail)
      const requiredScopes = [
        'https://mail.google.com/',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/gmail.compose',
        'https://www.googleapis.com/auth/gmail.labels'
      ];

      const currentScopes = oauth2Client.credentials.scope?.split(' ') || [];
      const hasAllScopes = requiredScopes.every(scope => currentScopes.includes(scope));
      
      if (!hasAllScopes) {
        console.warn('Note: Missing required Gmail scopes. The service will connect when first used.');
      }

      return new GmailEmailService(oauth2Client, processingService, memoryService);
    } catch (error) {
      console.error('Failed to create GmailEmailService:', error);
      throw new Error(`Failed to create Gmail service: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private constructor(
    oauth2Client: OAuth2Client,
    private readonly processingService: EmailProcessingService,
    private readonly memoryService: IEmailMemoryService
  ) {
    this.oAuth2Client = oauth2Client;
    this.gmail = google.gmail({ version: 'v1', auth: this.oAuth2Client });
  }

  // IEmailService implementation
  private _isConnected = false;
  private connectionPromise: Promise<void> | null = null;

  private async ensureConnected(): Promise<void> {
    if (this._isConnected) return;
    
    if (!this.connectionPromise) {
      this.connectionPromise = this.connect();
    }
    
    await this.connectionPromise;
  }

  async connect(): Promise<void> {
    if (this._isConnected) return;
    
    try {
      // Verify the credentials are valid
      const response = await this.withRetry(async () => {
        return this.gmail.users.getProfile({ userId: 'me' });
      });
      
      if (!response.data.emailAddress) {
        throw new Error('Failed to get user profile');
      }
      
      console.log(`Connected to Gmail as ${response.data.emailAddress}`);
      this._isConnected = true;
    } catch (error) {
      this.connectionPromise = null; // Reset so we can retry
      console.error('Failed to connect to Gmail:', error);
      if (error instanceof Error && 
          (error.message.includes('invalid_grant') || 
           error.message.includes('No refresh token'))) {
        // Token has been revoked, expired, or not available
        throw new Error('Authentication token is invalid or has been revoked. Please re-authenticate.');
      }
      throw new Error(`Failed to connect to Gmail: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async disconnect(): Promise<void> {
    this._isConnected = false;
    this.connectionPromise = null;
  }

  async markAsRead(messageId: string): Promise<void> {
    await this.markMultipleAsRead([messageId]);
  }
  
  // Optional: Add a separate method for batch operations
  async markMultipleAsRead(messageIds: string[]): Promise<void> {
    if (messageIds.length === 0) return;
    
    await this.ensureConnected();
    
    try {
      await this.gmail.users.messages.batchModify({
        userId: 'me',
        requestBody: {
          ids: messageIds,
          removeLabelIds: ['UNREAD'],
        },
      });
    } catch (error) {
      console.error('Error marking emails as read:', error);
      throw new Error(`Failed to mark emails as read: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async isConnected(): Promise<boolean> {
    if (!this._isConnected) return false;
    
    try {
      await this.gmail.users.getProfile({ userId: 'me' });
      return true;
    } catch (error) {
      this._isConnected = false;
      return false;
    }
  }

  async getAuthClient(): Promise<OAuth2Client> {
    if (!(await this.isConnected())) {
      throw new Error('Not connected to Gmail. Please connect first.');
    }
    return this.oAuth2Client;
  }

  // Alias getMessage to maintain interface compatibility
  async getMessage(messageId: string): Promise<EmailMessage> {
    return this.getEmail(messageId);
  }

  async fetchEmails(options: EmailSweepOptions): Promise<EmailMessage[]> {
    try {
      // Ensure we have a valid token
      await this.ensureConnected();

      // Build Gmail search query
      const queryParts: string[] = [];
      
      // Handle unread only filter
      if (options.unreadOnly) {
        queryParts.push('is:unread');
      }
      
      if (options.labelIds?.length) {
        queryParts.push(options.labelIds.map(id => `label:${id}`).join(' OR '));
      }
      
      if (options.from) {
        queryParts.push(`from:${options.from}`);
      }
      
      if (options.after) {
        queryParts.push(`after:${Math.floor(options.after.getTime() / 1000)}`);
      }
      
      if (options.before) {
        queryParts.push(`before:${Math.floor(options.before.getTime() / 1000)}`);
      }

      const query = queryParts.join(' ');
      const messages: EmailMessage[] = [];
      let pageToken: string | undefined = options.pageToken;
      const maxResults = options.limit || options.maxResults || 50;
      let processedCount = 0;

      do {
        const response = await this.withRetry(async () => {
          return this.gmail.users.messages.list({
            userId: 'me',
            q: query,
            maxResults: Math.min(maxResults - processedCount, 100), // Gmail max is 100
            pageToken,
            includeSpamTrash: options.includeSpamTrash || false,
          });
        });

        const messageList = response.data.messages || [];
        
        // Process messages in parallel with a limit on concurrency
        const batch = await Promise.all(
          messageList.slice(0, maxResults - processedCount).map(async (msg: gmail_v1.Schema$Message) => {
            if (!msg.id) return null;
            try {
              const message = await this.withRetry(() => this.getEmail(msg.id!));
              return message;
            } catch (error) {
              console.error(`Error fetching email ${msg.id}:`, error);
              return null;
            }
          })
        );
        
        // Add successfully fetched messages to the result
        for (const result of batch) {
          if (result) {
            messages.push(result);
            processedCount++;
            
            // Stop if we've reached the limit
            if (processedCount >= maxResults) break;
          }
        }

        pageToken = response.data.nextPageToken as string | undefined;
        
        // Stop if we've reached the limit or there are no more pages
        if (processedCount >= maxResults || !pageToken) {
          break;
        }
        
      } while (true);

      return messages;
    } catch (error) {
      console.error('Error in fetchEmails:', error);
      throw new Error(`Failed to fetch emails: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async summarizeEmail(email: EmailMessage): Promise<EmailSummary> {
    return this.processingService.processEmail(email);
  }

  async performSweep(options: EmailSweepOptions): Promise<EmailSweepResult> {
    const result: EmailSweepResult = {
      processed: 0,
      errors: [],
      summaries: [],
    };

    try {
      const emails = await this.fetchEmails({
        ...options,
        maxResults: options.maxResults || options.limit || 10,
      });
      
      for (const email of emails) {
        try {
          const summary = await this.summarizeEmail(email);
          result.summaries.push(summary);
          result.processed++;
        } catch (error) {
          result.errors.push({
            id: email.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    } catch (error) {
      console.error('Error performing email sweep:', error);
      throw new Error(`Failed to perform email sweep: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  async draftResponse(
    email: EmailMessage,
    context: {
      conversationHistory?: EmailMessage[];
      additionalContext?: string;
    } = {}
  ): Promise<DraftResponse> {
    return this.processingService.draftResponse(email, context);
  }

  async sendEmail(draft: DraftResponse): Promise<{ success: boolean; messageId?: string }> {
    await this.ensureConnected();
    
    try {
      const message = this.createRawEmail({
        ...draft,
        body: draft.body || draft.text || draft.html || '',
        // Ensure attachments have all required fields
        attachments: draft.attachments?.map(att => ({
          ...att,
          // Ensure size is set, defaulting to content length if available
          size: att.size || (att.content ? att.content.length : 0)
        }))
      });
      
      const response = await this.withRetry(() => 
        this.gmail.users.messages.send({
          userId: 'me',
          requestBody: {
            raw: message,
          },
        })
      );

      // Update the email status in memory if this is a reply
      if (draft.inReplyTo) {
        await this.memoryService.updateEmailStatus(draft.inReplyTo, 'replied');
      }

      return {
        success: true,
        messageId: response.data.id || undefined,
      };
    } catch (error) {
      console.error('Error sending email:', error);
      return { success: false };
    }
  }

  // Helper method to send raw emails (used internally)
  private async sendRawEmail(email: Omit<EmailMessage, 'id' | 'date'>): Promise<{ id: string; threadId: string }> {
    const message = this.createRawEmail(email);
    const response = await this.withRetry(() => 
      this.gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: message },
      })
    );
    
    return {
      id: response.data.id || '',
      threadId: response.data.threadId || '',
    };
  }

  private async withRetry<T>(fn: () => Promise<T>, retries = GmailEmailService.MAX_RETRIES): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {  
      if (retries <= 0) {
        throw error;
      }
      
      // If it's an auth error, try to refresh the token
      if (error.code === 401) {
        await this.refreshAuthToken();
      }
      
      await new Promise(resolve => setTimeout(resolve, GmailEmailService.RETRY_DELAY_MS));
      return this.withRetry(fn, retries - 1);
    }
  }

  private async refreshAuthToken(): Promise<void> {
    const accessToken = await oauthService.getAccessToken();
    if (!accessToken) {
      throw new Error('Failed to refresh access token');
    }
  }

  private async getEmails(limit: number = 10, pageToken?: string): Promise<{ emails: EmailMessage[]; nextPageToken?: string }> {
    await this.ensureConnected();
    
    try {
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        maxResults: limit,
        pageToken,
      });

      if (!response.data) {
        throw new Error('No data received from Gmail API');
      }

      const emails = await Promise.all(response.data.messages!.map(async (msg: gmail_v1.Schema$Message) => {
        if (!msg.id) return null;
        try {
          return await this.getEmail(msg.id!);
        } catch (error) {
          console.error(`Error fetching email ${msg.id}:`, error);
          return null;
        }
      }));

      return {
        emails: emails.filter((email): email is EmailMessage => email !== null),
        nextPageToken: response.data.nextPageToken ?? undefined,
      };
    } catch (error) {
      console.error('Error fetching emails:', error);
      throw new Error(`Failed to fetch emails: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async getEmail(id: string): Promise<EmailMessage> {
    return this.withRetry(async () => {
      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id,
        format: 'full',
      });

      if (!response.data) {
        throw new Error('No data received from Gmail API');
      }

      return this.parseGmailMessage(response.data);
    });
  }

  private parseGmailMessage(message: gmail_v1.Schema$Message): EmailMessage {
    const headers = message.payload?.headers || [];
    const getHeader = (name: string): string => {
      const header = headers.find(h => h.name?.toLowerCase() === name.toLowerCase());
      return header?.value || '';
    };

    const from = this.parseEmailAddress(getHeader('From')) || { address: 'unknown@example.com' };
    const to = this.parseEmailAddresses(getHeader('To'));
    const cc = this.parseEmailAddresses(getHeader('Cc'));
    const bcc = this.parseEmailAddresses(getHeader('Bcc'));
    const subject = getHeader('Subject') || '(No subject)';
    const messageId = getHeader('Message-ID');
    const inReplyTo = getHeader('In-Reply-To');
    const references = getHeader('References')?.split(/\s+/) || [];

    // Process message parts
    const processPart = (part: GmailMessagePart, parentMimeType?: string): { 
      body: string; 
      html: string; 
      attachments: EmailAttachment[] 
    } => {
      const result = {
        body: '',
        html: '',
        attachments: [] as EmailAttachment[]
      };

      const mimeType = part.mimeType || parentMimeType || '';
      
      if (mimeType.startsWith('multipart/') && part.parts) {
        // Process each part of the multipart message
        for (const p of part.parts) {
          const partResult = processPart(p, mimeType);
          result.body = partResult.body || result.body;
          result.html = partResult.html || result.html;
          result.attachments.push(...partResult.attachments);
        }
        return result;
      }
      
      if (part.body?.data) {
        const content = Buffer.from(part.body.data, 'base64');
        
        if (mimeType === 'text/plain') {
          result.body = content.toString('utf-8');
        } else if (mimeType === 'text/html') {
          result.html = content.toString('utf-8');
        } else if (part.filename) {
          // Handle attachments
          result.attachments.push({
            filename: part.filename,
            mimeType: mimeType,
            size: part.body.size || 0,
            content: content,
            contentId: part.headers?.find(h => h.name?.toLowerCase() === 'content-id')?.value,
          });
        }
      }
      
      return result;
    };

    // Process the message
    let body = '';
    let html = '';
    let attachments: EmailAttachment[] = [];

    if (message.payload) {
      const result = processPart(message.payload as unknown as GmailMessagePart);
      body = result.body;
      html = result.html;
      attachments = result.attachments;
    }

    return {
      id: message.id || '',
      threadId: message.threadId || '',
      subject: subject,
      from: from,
      to: to,
      cc: cc.length > 0 ? cc : undefined,
      bcc: bcc.length > 0 ? bcc : undefined,
      date: new Date(parseInt(message.internalDate || '0')),
      text: body,
      html: html || undefined,
      isRead: !message.labelIds?.includes('UNREAD'),
      labels: message.labelIds || [],
      inReplyTo: inReplyTo || undefined,
      references: references.length > 0 ? references : undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
    };
  }

  private parseEmailAddress(address: string): EmailAddress | undefined {
    if (!address) return undefined;
    
    // Handle "Display Name <email@example.com>" format
    const match = address.match(/^(?:(.*?)\s*<)?([^>]+)>?$/);
    if (!match) return undefined;
    
    const [, name, email] = match;
    const emailValue = email?.trim();
    
    // If the email part is empty, return undefined
    if (!emailValue) return undefined;
    
    return {
      name: name ? name.trim() : undefined,
      address: emailValue.toLowerCase()
    };
  }

  private parseEmailAddresses(addresses: string | undefined | null): EmailAddress[] {
    if (!addresses) return [];
    
    // Split by comma but ignore commas inside quotes
    const addressList = addresses.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
    
    return addressList
      .map(addr => this.parseEmailAddress(addr.trim()))
      .filter((addr): addr is EmailAddress => addr !== undefined);
  }

  private createRawEmail(draft: DraftResponse): string {
    // Convert EmailAddress objects to string representation
    const formatAddress = (addr: EmailAddress): string => {
      return addr.name ? `"${addr.name}" <${addr.address}>` : addr.address;
    };

    const headers = [
      // Note: The 'from' field should come from the authenticated user's email
      // and not from the draft, as Gmail will override it anyway
      `To: ${draft.to.map(formatAddress).join(', ')}`,
      `Subject: ${draft.subject || '(No subject)'}`,
    ];

    // Add CC if present
    if (draft.cc && draft.cc.length > 0) {
      headers.push(`Cc: ${draft.cc.map(formatAddress).join(', ')}`);
    }

    // Add BCC if present
    if (draft.bcc && draft.bcc.length > 0) {
      headers.push(`Bcc: ${draft.bcc.map(formatAddress).join(', ')}`);
    }

    // Handle reply headers if this is a reply
    if (draft.inReplyTo) {
      headers.push(`In-Reply-To: ${draft.inReplyTo}`);
      headers.push(`References: ${draft.references ? draft.references.join(' ') : draft.inReplyTo}`);
    }

    // Set content type based on available content
    const hasHtml = !!draft.html;
    const hasText = !!draft.text || !!draft.body;
    
    let body = '';
    
    if (hasHtml && hasText) {
      // Multipart/alternative for both HTML and plain text
      const boundary = `_${Math.random().toString(36).substring(2, 11)}_`;
      const textContent = draft.text || draft.body || '';
      
      headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
      
      body = [
        `--${boundary}`,
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 7bit',
        '',
        textContent,
        `--${boundary}`,
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: 7bit',
        '',
        draft.html,
        `--${boundary}--`
      ].join('\r\n');
    } else if (hasHtml) {
      // HTML only
      headers.push('Content-Type: text/html; charset=UTF-8');
      headers.push('Content-Transfer-Encoding: 7bit');
      body = draft.html || '';
    } else {
      // Plain text only
      headers.push('Content-Type: text/plain; charset=UTF-8');
      headers.push('Content-Transfer-Encoding: 7bit');
      body = draft.text || draft.body || '';
    }

    // Join headers with CRLF and add an extra CRLF before the body
    const email = `${headers.join('\r\n')}\r\n\r\n${body}`;
    return Buffer.from(email).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
}