import express, { Request, Response } from 'express';
import { config } from 'dotenv';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GmailEmailService } from './email/services/GmailEmailService.js';
import { EmailProcessingService } from './email/services/EmailProcessingService.js';
import { IEmailMemoryService } from './email/services/IEmailMemoryService.js';
import { EmailMemoryService } from './email/services/EmailMemoryService.js';
import { PromptService } from '@ellipsa/prompt';
import { createEmailRouter } from './email/routes.js';
import { createEmailAutomation } from './email/EmailAutomationService.js';
import { EmailMetrics } from './email/monitoring/EmailMetrics.js';
import { oauthService } from './email/services/OAuthService.js';
import type { EmailMessage, EmailSummary, DraftResponse, EmailAddress, EmailAttachment } from './email/types/email.types.js';
import { Buffer } from 'buffer';

// Get directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const envPaths = [
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env')
];

let envLoaded = false;
for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    console.log('Loading environment from:', envPath);
    config({ path: envPath, override: true });
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
  console.error('No .env file found in any of these locations:', envPaths);
  process.exit(1);
}

// Verify required environment variables
const requiredVars = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'];
const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('Missing required environment variables:', missingVars.join(', '));
  process.exit(1);
}

// Extended EmailMessage interface for internal use
interface ExtendedEmailMessage extends EmailMessage {
  status?: string;
  metadata?: {
    status?: string;
    lastUpdated?: string;
    [key: string]: any;
  };
}

// Memory service client that implements IEmailMemoryService
class MemoryServiceClient implements IEmailMemoryService {
  public readonly entities: Map<string, any> = new Map();
  public readonly events: Map<string, any> = new Map();
  public readonly emails: Map<string, ExtendedEmailMessage> = new Map();
  public readonly drafts: Map<string, DraftResponse> = new Map();

  async storeEmail(email: EmailMessage): Promise<void> {
    // Convert attachments content to Uint8Array if it's a Buffer
    const processedEmail = {
      ...email,
      metadata: {},
      attachments: email.attachments?.map(attachment => ({
        ...attachment,
        content: attachment.content instanceof Buffer 
          ? new Uint8Array(attachment.content.buffer)
          : attachment.content
      }))
    } as ExtendedEmailMessage;
    this.emails.set(email.id, processedEmail);
  }

  async storeEmailSummary(summary: EmailSummary): Promise<void> {
    const email = this.emails.get(summary.id);
    if (email) {
      email.metadata = email.metadata || {};
      email.metadata.summary = summary.summary;
      this.emails.set(summary.id, email);
    }
  }

  async getEmail(id: string): Promise<EmailMessage | null> {
    const email = this.emails.get(id);
    if (!email) return null;
    
    // Ensure attachments content is Uint8Array
    return {
      ...email,
      attachments: email.attachments?.map(attachment => ({
        ...attachment,
        content: attachment.content instanceof Uint8Array 
          ? Buffer.from(attachment.content.buffer)
          : attachment.content
      }))
    };
  }

  async searchEmails(query: string): Promise<EmailSummary[]> {
    const queryLower = query.toLowerCase();
    return Array.from(this.emails.values())
      .filter(email => 
        email.subject?.toLowerCase().includes(queryLower) || 
        email.text?.toLowerCase().includes(queryLower) ||
        email.html?.toLowerCase().includes(queryLower)
      )
      .map(email => ({
        id: email.id,
        threadId: email.threadId,
        subject: email.subject,
        from: email.from,
        date: email.date,
        summary: email.text?.substring(0, 100) || '',
        actionRequired: false,
        priority: 'medium',
        categories: [],
        metadata: email.metadata,
        isRead: email.isRead || false,
        snippet: email.text?.substring(0, 150) || ''
      }));
  }

  async createDraft(draft: any): Promise<DraftResponse> {
    const id = `draft-${Date.now()}`;
    const draftWithId = { ...draft, id };
    this.drafts.set(id, draftWithId);
    return draftWithId;
  }

  async getConversationHistory(threadId: string): Promise<EmailMessage[]> {
    return Array.from(this.emails.values())
      .filter(email => email.threadId === threadId)
      .sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));
  }

  async updateEmailStatus(emailId: string, status: string): Promise<void> {
    const email = this.emails.get(emailId);
    if (email) {
      email.status = status;
      email.metadata = email.metadata || {};
      email.metadata.status = status;
      email.metadata.lastUpdated = new Date().toISOString();
      this.emails.set(emailId, email);
    }
  }

  private convertAttachments(attachments?: EmailAttachment[]): Array<EmailAttachment & { content: Buffer }> | undefined {
    if (!attachments) return undefined;
    return attachments.map(attachment => ({
      ...attachment,
      content: Buffer.from(attachment.content.buffer)
    }));
  }
}

interface Services {
  emailService: GmailEmailService;
  processingService: EmailProcessingService;
  memoryService: IEmailMemoryService;
  emailAutomationService: any;
  metrics: EmailMetrics;
}

let services: Services | null = null;

async function initializeServices(app: express.Express): Promise<Services> {
  const metrics = new EmailMetrics();
  const promptService = new PromptService({
    apiKey: process.env.OPENAI_API_KEY || '',
    defaultModel: 'gpt-4',
  });
  const memoryService: IEmailMemoryService = new MemoryServiceClient();
  const processingService = new EmailProcessingService(promptService, memoryService);
  
  // Create Gmail service without initializing it yet
  const emailService = GmailEmailService.create(processingService, memoryService);
  
  // Create the services object
  const services: Services = {
    emailService,
    processingService,
    memoryService,
    emailAutomationService: null as any, // Will be set up after OAuth
    metrics,
  };
  
  // Set up routes
  const emailRouter = createEmailRouter(services.emailService, services.processingService);
  app.use('/api/emails', emailRouter);
  
  // OAuth callback route
  app.get('/oauth2callback', async (req, res) => {
    const code = req.query.code as string;
    
    if (!code) {
      return res.status(400).send('Authorization code is required');
    }
    
    try {
      const oauth2Client = oauthService.getClient();
      
      // Exchange the authorization code for tokens
      const { tokens } = await oauth2Client.getToken(code);
      
      // Store the tokens
      oauth2Client.setCredentials(tokens);
      
      // Now that we have tokens, initialize the Gmail service
      await emailService.connect();
      
      // Initialize email automation service after successful authentication
      const emailAutomationService = await createEmailAutomation({
        emailService,
        promptService,
        memoryService: memoryService as any, // Cast to any to avoid type issues
        metrics,
        checkInterval: 5 * 60 * 1000, // 5 minutes
        maxEmailsPerCheck: 10,
      });
      
      // Start the email automation service
      emailAutomationService.start();
      
      // Update the services object with the automation service
      services.emailAutomationService = emailAutomationService;
      
      console.log('Successfully authenticated with Gmail and started email automation');
      return res.send('Successfully authenticated! You can close this window and return to the application.');
    } catch (error) {
      console.error('Error during OAuth callback:', error);
      return res.status(500).send('Authentication failed. Please try again.');
    }
  });
  
  // Add a simple health check endpoint
  app.get('/health', (req, res) => {
    const oauth2Client = oauthService.getClient();
    const status = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      gmailConnected: oauth2Client.credentials.access_token !== undefined
    };
    res.json(status);
  });
  
  // Add a route to get the OAuth URL
  app.get('/auth/url', async (req, res) => {
    try {
      const authUrl = await oauthService.getAuthUrl();
      res.json({ authUrl });
    } catch (error) {
      console.error('Error generating auth URL:', error);
      res.status(500).json({ error: 'Failed to generate authentication URL' });
    }
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
  });

  return services;
}

// Start the server
async function startServer() {
  const app = express();
  
  // Parse JSON bodies
  app.use(express.json());
  
  try {
    const services = await initializeServices(app);
    
    // Start listening
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`OAuth URL: http://localhost:${PORT}/auth/url`);
    });
    
    return services;
  } catch (error) {
    console.error('Failed to initialize services:', error);
    process.exit(1);
  }
}

// Only start the server if this file is run directly
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  startServer().catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}
