import { GmailEmailService } from './GmailEmailService.js';
import { EmailLLMService } from './EmailLLMService.js';
import { InMemoryService } from '../../services/InMemoryService.js';
import { EmailProcessingService } from './EmailProcessingService.js';
import { EmailDigestService } from './EmailDigestService.js';
import { IEmailService } from './EmailService.interface.js';
import { oauthService } from './OAuthService.js';
import { PromptClient, MemoryClient } from '@ellipsa/shared';

export interface EmailServices {
  emailService: IEmailService;
  processingService: EmailProcessingService;
  digestService: EmailDigestService;
}

export async function initializeEmailServices(): Promise<EmailServices | null> {
  // Check for required environment variables
  const requiredVars = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'OPENAI_API_KEY'
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  if (missingVars.length > 0) {
    console.error(`Missing required environment variables: ${missingVars.join(', ')}`);
    return null;
  }



  // ... (existing imports, but since I'm targeting a chunk, I don't need to repeat all unless they are in scope of change)

  try {
    // Initialize LLM service for email processing
    // NOTE: In production, PromptService URL might be from env
    const promptClient = new PromptClient(process.env.PROMPT_SERVICE_URL || 'http://localhost:4003');
    const llmService = new EmailLLMService(promptClient);

    const memoryClient = new MemoryClient(process.env.MEMORY_SERVICE_URL || 'http://localhost:4001');
    const memoryService = new InMemoryService(memoryClient);

    // Check if user is authenticated
    const isAuthenticated = await oauthService.isAuthenticated();
    if (!isAuthenticated) {
      console.error('User is not authenticated with Gmail. Please authenticate first.');
      return null;
    }

    // Initialize processing service first
    const processingService = new EmailProcessingService(
      promptClient as any, // 1st arg: promptService (PromptClient)
      memoryService as any, // 2nd arg: memoryService
      llmService // 3rd arg: emailLLMService
    );

    // Initialize Gmail service with the processing service
    const gmailService = await GmailEmailService.create(
      processingService,
      memoryService as any
    ) as IEmailService;

    const emailService: IEmailService = gmailService;

    // Initialize digest service with default schedule (9 AM daily)
    const digestService = new EmailDigestService(
      emailService,
      processingService,
      process.env.EMAIL_DIGEST_SCHEDULE || '0 9 * * *'
    );

    console.log('Email services initialized successfully');

    return {
      emailService,
      processingService,
      digestService
    };
  } catch (error) {
    console.error('Failed to initialize email services:', error);
    return null;
  }
}

// Helper function to get the OAuth URL for the Electron renderer
export async function getOAuthUrl(): Promise<string> {
  return await oauthService.getAuthUrl();
}

// Helper function to complete the OAuth flow
export async function completeOAuthFlow(code: string): Promise<boolean> {
  try {
    const tokens = await oauthService.getTokensFromCode(code);
    return tokens !== null;
  } catch (error) {
    console.error('Error completing OAuth flow:', error);
    return false;
  }
}

// Helper function to check authentication status
export async function isAuthenticated(): Promise<boolean> {
  return oauthService.isAuthenticated();
}

// Helper function to log out
export async function logout(): Promise<void> {
  await oauthService.clearTokens();
}
