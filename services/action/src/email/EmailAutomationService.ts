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
          
          // Display email summary
          console.log('\n' + '='.repeat(80));
          console.log(`📧 Email Summary - ${email.subject}`);
          console.log('='.repeat(80));
          console.log(`📩 From: ${email.from.name} <${email.from.address}>`);
          console.log(`📅 Date: ${email.date.toLocaleString()}`);
          console.log(`🏷️  Priority: ${summary.priority.toUpperCase()}`);
          console.log(`🏷️  Categories: ${summary.categories.join(', ') || 'None'}`);
          console.log('\n📝 Summary:');
          console.log(summary.summary);
          
          if (summary.actionRequired) {
            console.log('\n🚨 ACTION REQUIRED: This email requires your attention!');
            
            const conversationHistory = await this.processingService["memoryService"].getConversationHistory(email.threadId);
            
            const draft = await this.processingService.draftResponse(email, {
              conversationHistory,
              additionalContext: 'Please draft a helpful response.'
            });
            
            console.log('\n📝 Drafted response:');
            console.log('-' .repeat(40));
            console.log(draft.body);
            console.log('-' .repeat(40));
            
            if (this.config.autoRespond) {
              await this.emailService.sendEmail(draft);
              console.log('\n✅ Response sent successfully!');
            } else {
              console.log('\n💡 Auto-response is disabled. Enable with AUTO_RESPOND=true');
            }
          } else {
            console.log('\nℹ️  No action required - marked as read.');
          }
          
          // Mark as read after processing
          await this.emailService.markAsRead?.(email.id);
          
          processedCount++;
          const processTime = Date.now() - processStartTime;
          this.metrics.recordProcessingTime(processTime);
          console.log(`\n⏱️  Processed in ${processTime}ms`);
          console.log('='.repeat(80) + '\n');
          
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
