import { IEmailService } from './services/EmailService.interface';
import { EmailProcessingService } from './services/EmailProcessingService';
import { PromptService } from '@ellipsa/prompt';
import { EmailMemoryService } from './services/EmailMemoryService';
import { EmailMetrics } from './monitoring/EmailMetrics';

export class EmailAutomationService {
  private intervalId?: NodeJS.Timeout;
  private isRunning: boolean = false;

  constructor(
    private emailService: IEmailService,
    private processingService: EmailProcessingService,
    private metrics: EmailMetrics,
    private config: {
      checkInterval: number;
      maxEmailsPerCheck: number;
      autoRespond: boolean;
    } = { 
      checkInterval: 5 * 60 * 1000, // 5 minutes
      maxEmailsPerCheck: 10,
      autoRespond: false
    }
  ) {}

  /**
   * Start the email automation service
   */
  async start() {
    if (this.isRunning) {
      console.warn('Email automation service is already running');
      return;
    }

    console.log('Starting email automation service...');
    this.isRunning = true;
    
    // Initial check
    await this.checkEmails();
    
    // Set up periodic checking
    this.intervalId = setInterval(
      () => this.checkEmails(), 
      this.config.checkInterval
    );
  }

  /**
   * Stop the email automation service
   */
  stop() {
    if (!this.isRunning) return;
    
    console.log('Stopping email automation service...');
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    
    this.isRunning = false;
  }

  /**
   * Check for new emails and process them
   */
  private async checkEmails() {
    const checkStartTime = Date.now();
    let processedCount = 0;
    let errorCount = 0;

    try {
      console.log('Checking for new emails...');
      
      // Connect to email service if not already connected
      try {
        await this.emailService.connect();
      } catch (error) {
        console.error('Failed to connect to email service:', error);
        this.metrics.recordError(error as Error);
        return;
      }
      
      // Fetch unread emails
      const emails = await this.emailService.fetchEmails({
        unreadOnly: true,
        maxResults: this.config.maxEmailsPerCheck
      });

      console.log(`Found ${emails.length} new emails to process`);

      // Process each email
      for (const email of emails) {
        const processStartTime = Date.now();
        
        try {
          // Process and summarize the email
          const summary = await this.processingService.processEmail(email);
          
          // If action is required, draft a response
          if (summary.actionRequired) {
            console.log(`Action required for email: ${email.subject}`);
            
            const conversationHistory = await this.processingService["memoryService"].getConversationHistory(email.threadId);
            
            const draft = await this.processingService.draftResponse(email, {
              conversationHistory,
              additionalContext: 'Please draft a helpful response.'
            });
            
            console.log(`Drafted response for: ${email.subject}`);
            
            if (this.config.autoRespond) {
              await this.emailService.sendEmail(draft);
              console.log(`Sent response for: ${email.subject}`);
            }
          }
          
          // Mark as read after processing
          await this.emailService.markAsRead?.(email.id);
          
          processedCount++;
          this.metrics.recordProcessingTime(Date.now() - processStartTime);
          
        } catch (error) {
          errorCount++;
          console.error(`Error processing email ${email.id}:`, error);
          this.metrics.recordError(error as Error);
        }
      }
      
      const totalTime = Date.now() - checkStartTime;
      console.log(`Processed ${processedCount} emails in ${totalTime}ms (${errorCount} errors)`);
      
    } catch (error) {
      console.error('Error in email check:', error);
      this.metrics.recordError(error as Error);
    }
  }
}

/**
 * Factory function to create and configure the EmailAutomationService
 */
export async function createEmailAutomation(config: {
  emailService: IEmailService;
  promptService: PromptService;
  memoryService: EmailMemoryService;
  metrics?: EmailMetrics;
  checkInterval?: number;
  maxEmailsPerCheck?: number;
  autoRespond?: boolean;
}) {
  const metrics = config.metrics || new EmailMetrics();
  
  const processingService = new EmailProcessingService(
    config.promptService,
    config.memoryService
  );

  return new EmailAutomationService(
    config.emailService,
    processingService,
    metrics,
    {
      checkInterval: config.checkInterval ?? 5 * 60 * 1000, // 5 minutes
      maxEmailsPerCheck: config.maxEmailsPerCheck ?? 10,
      autoRespond: config.autoRespond ?? false
    }
  );
}
