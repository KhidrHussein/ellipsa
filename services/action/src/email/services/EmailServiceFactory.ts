import { IEmailService } from './EmailService.interface';
import { EmailProcessingService } from './EmailProcessingService';
import { EmailDigestService } from './EmailDigestService';
import { EmailLLMService } from './EmailLLMService';
import { InMemoryService } from '../../services/InMemoryService';

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
    
    // Initialize in-memory service (replace with actual implementation later)
    const memoryService = new InMemoryService();
    
    // Initialize Gmail service
    const emailService = new GmailEmailService(
      process.env.GOOGLE_CLIENT_ID!,
      process.env.GOOGLE_CLIENT_SECRET!,
      process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4004/oauth2callback',
      process.env.GOOGLE_ACCESS_TOKEN || '',
      process.env.GOOGLE_REFRESH_TOKEN || ''
    );
    
    // Set up service dependencies
    emailService.setMemoryService(memoryService);
    emailService.setLLMService(llmService);
    
    // Initialize processing service
    const processingService = new EmailProcessingService(emailService, llmService, memoryService);
    
    // Initialize digest service (default schedule: 9 AM daily)
    const digestService = new EmailDigestService(
      emailService,
      processingService,
      process.env.EMAIL_DIGEST_SCHEDULE || '0 9 * * *' // 9 AM daily
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
