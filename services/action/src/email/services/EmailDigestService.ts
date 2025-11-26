import { IEmailService } from './EmailService.interface';
import { EmailProcessingService } from './EmailProcessingService';
import { EmailSummary, DraftResponse, EmailSweepOptions } from '../types';
import { scheduleJob } from 'node-schedule';

export class EmailDigestService {
  private isRunning: boolean = false;

  constructor(
    private emailService: IEmailService,
    private processingService: EmailProcessingService,
    private schedule: string = '0 9 * * *' // 9 AM daily by default
  ) {}

  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('Email digest service is already running');
      return;
    }

    console.log(`Starting email digest service with schedule: ${this.schedule}`);
    this.isRunning = true;

    // Initial run
    await this.runDigest();
    
    // Schedule periodic runs
    scheduleJob(this.schedule, async () => {
      await this.runDigest();
    });
  }

  stop(): void {
    this.isRunning = false;
    console.log('Email digest service stopped');
  }

  private async runDigest(): Promise<void> {
    if (!this.isRunning) return;

    console.log('Running email digest...');
    const startTime = Date.now();
    
    try {
      // 1. Fetch unprocessed emails
      const options: EmailSweepOptions = {
        unreadOnly: true,
        labelIds: ['INBOX'],
        maxResults: 50,
        includeRead: false
      };

      const emails = await this.emailService.fetchEmails(options);
      console.log(`Found ${emails.length} new emails to process`);

      if (emails.length === 0) {
        console.log('No new emails to process');
        return;
      }

      // 2. Process and summarize emails
      const summaries: EmailSummary[] = [];
      const errors: Array<{id: string, error: string}> = [];

      for (const email of emails) {
        try {
          const summary = await this.processingService.processEmail(email);
          summaries.push(summary);
        } catch (error) {
          console.error(`Error processing email ${email.id}:`, error);
          errors.push({
            id: email.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // 3. Generate response drafts for emails that need them
      const drafts: Array<{summary: EmailSummary, draft: DraftResponse}> = [];
      
      for (const summary of summaries) {
        if (this.requiresResponse(summary)) {
          try {
            const email = await this.emailService.getMessage(summary.id);
            const draft = await this.emailService.draftResponse(email, {
              // Add any relevant conversation history or additional context here
              conversationHistory: [],
              additionalContext: 'Generated as part of daily email digest'
            });
            drafts.push({ summary, draft });
          } catch (error) {
            console.error(`Error creating draft for email ${summary.id}:`, error);
            errors.push({
              id: summary.id,
              error: 'Failed to create draft: ' + (error instanceof Error ? error.message : 'Unknown error')
            });
          }
        }
      }

      // 4. Generate and send digest
      const digest = this.generateDigest(summaries, drafts, errors);
      await this.sendDigest(digest, drafts);

      const duration = Math.round((Date.now() - startTime) / 1000);
      console.log(`Email digest completed in ${duration}s. Processed: ${summaries.length}, Drafts: ${drafts.length}, Errors: ${errors.length}`);

    } catch (error) {
      console.error('Error in email digest:', error);
      // Consider adding error notification here
    }
  }

  private requiresResponse(summary: EmailSummary): boolean {
    // Customize this logic based on your requirements
    return (
      summary.actionRequired || 
      summary.priority === 'high' || 
      (summary.priority === 'medium' && summary.categories.includes('action_required'))
    );
  }

  private generateDigest(
    summaries: EmailSummary[],
    drafts: Array<{summary: EmailSummary, draft: DraftResponse}>,
    errors: Array<{id: string, error: string}>
  ): string {
    const formatDate = (date: Date) => date.toLocaleString();
    
    const digest = [
      `# 📧 Email Digest - ${new Date().toLocaleDateString()}`,
      `**Generated at**: ${formatDate(new Date())}`,
      '',
      `## 📊 Summary`,
      `- 📥 **New Emails**: ${summaries.length}`,
      `- ✍️ **Drafts Created**: ${drafts.length}`,
      `- ❌ **Errors**: ${errors.length}`,
      '',
    ];

    if (summaries.length > 0) {
      digest.push('## 📨 New Emails', '');
      summaries.forEach((summary, index) => {
        const hasDraft = drafts.some(d => d.summary.id === summary.id);
        digest.push(
          `### ${index + 1}. ${summary.subject} ${hasDraft ? '✏️' : ''}`,
          `- **From**: ${summary.from.name || summary.from.address}`,
          `- **Date**: ${formatDate(summary.date)}`,
          `- **Priority**: ${summary.priority.toUpperCase()}`,
          `- **Categories**: ${summary.categories.join(', ') || 'None'}`,
          `- **Summary**: ${summary.summary}`,
          ''
        );
      });
    }

    if (drafts.length > 0) {
      digest.push('## 📝 Draft Responses', '');
      drafts.forEach(({ summary, draft }, index) => {
        digest.push(
          `### ${index + 1}. Re: ${summary.subject}`,
          `**To**: ${draft.to.map(r => r.name || r.address).join(', ')}`,
          `**Draft**:`,
          '```',
          draft.body || draft.text || draft.html || '(No content)',
          '```',
          ''
        );
      });
    }

    if (errors.length > 0) {
      digest.push('## ❌ Processing Errors', '');
      errors.forEach((error, index) => {
        digest.push(
          `${index + 1}. **Email ID**: ${error.id}`,
          `   **Error**: ${error.error}`,
          ''
        );
      });
    }

    return digest.join('\n');
  }

  private async sendDigest(
    digest: string, 
    drafts: Array<{draft: DraftResponse}>
  ): Promise<void> {
    try {
      // For now, just log the digest to console
      console.log('\n' + '='.repeat(80));
      console.log(digest);
      console.log('='.repeat(80) + '\n');

      // Here you would typically:
      // 1. Send the digest via email
      // 2. Store drafts in the database
      // 3. Send notifications if needed
      
      console.log(`Digest generated successfully. ${drafts.length} drafts created.`);
      
    } catch (error) {
      console.error('Error sending digest:', error);
      throw error;
    }
  }
}
