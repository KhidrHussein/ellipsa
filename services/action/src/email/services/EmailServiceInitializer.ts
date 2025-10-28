import { GmailEmailService } from './GmailEmailService';
import { EmailLLMService } from './EmailLLMService';
import { InMemoryService } from '../../services/InMemoryService';
import { EmailProcessingService } from './EmailProcessingService';
import { EmailDigestService } from './EmailDigestService';
import { IEmailService } from './EmailService.interface';
import { oauthService } from './OAuthService';

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

  try {
    // Initialize LLM service for email processing
    const llmService = new EmailLLMService(process.env.OPENAI_API_KEY!);
    
    // Initialize in-memory service
    const memoryService = new InMemoryService();
    
    // Check if user is authenticated
    const isAuthenticated = await oauthService.isAuthenticated();
    if (!isAuthenticated) {
      console.error('User is not authenticated with Gmail. Please authenticate first.');
      return null;
    }
    
    // Initialize processing service first
    const processingService = new EmailProcessingService(
      llmService as any, // Temporary type assertion to fix compilation
      memoryService as any // Temporary type assertion to fix compilation
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
