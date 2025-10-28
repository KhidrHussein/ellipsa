import { PromptService } from '@ellipsa/prompt';
import { EmailMessage, EmailSummary, DraftResponse } from '../types';
import { IEmailMemoryService } from './IEmailMemoryService';

export class EmailProcessingService {
  constructor(
    private promptService: PromptService,
    private memoryService: IEmailMemoryService
  ) {}

  async processEmail(email: EmailMessage): Promise<EmailSummary> {
    try {
      // 1. Store the raw email in memory
      await this.memoryService.storeEmail(email);

      // 2. Extract structured data
      const content = email.text || email.html || '';
      const [extractedData, summaryText] = await Promise.all([
        this.promptService.extractStructuredData(content),
        this.promptService.summarizeContent(content)
      ]);

      // 3. Create email summary
      const summary: EmailSummary = {
        id: email.id,
        threadId: email.threadId,
        subject: email.subject,
        from: email.from,
        date: email.date,
        summary: summaryText,
        actionRequired: this.determineActionRequired(extractedData, summaryText),
        priority: this.determinePriority(extractedData, summaryText),
        categories: this.extractCategories(extractedData, summaryText),
        metadata: {
          ...extractedData,
          source: 'email_processing',
          processedAt: new Date().toISOString()
        }
      };

      // 4. Store the summary
      await this.memoryService.storeEmailSummary(summary);
      return summary;
    } catch (error) {
      console.error('Error processing email:', error);
      throw new Error(`Failed to process email: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async draftResponse(
    email: EmailMessage,
    context: {
      conversationHistory?: EmailMessage[];
      additionalContext?: string;
    } = {}
  ): Promise<DraftResponse> {
    try {
      // 1. Get conversation history if not provided
      let conversationHistory = context.conversationHistory;
      if (!conversationHistory?.length) {
        conversationHistory = await this.memoryService.getConversationHistory(email.threadId);
      }

      // 2. Generate response using prompt service
      const prompt = this.createResponsePrompt(email, conversationHistory, context.additionalContext);
      const response = await this.promptService.generateText({
        prompt,
        maxTokens: 1000,
        temperature: 0.7
      });

      // 3. Create draft response
      const draft: DraftResponse = {
        threadId: email.threadId,
        to: [email.from],
        subject: email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
        body: response,
        inReplyTo: email.id,
        references: [email.id, ...(email.references || [])]
      };

      // 4. Update email status
      await this.memoryService.updateEmailStatus(email.id, 'drafted');
      return draft;
    } catch (error) {
      console.error('Error drafting response:', error);
      throw new Error(`Failed to draft response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private determineActionRequired(extractedData: any, summary: string): boolean {
    // Direct action indicators
    const actionKeywords = [
      'urgent', 'action required', 'please respond', 'follow up',
      'needs attention', 'your input needed', 'response requested',
      'please advise', 'your feedback', 'awaiting your', 'deadline', 'due by',
      'as soon as possible', 'asap', 'urgent action', 'immediate attention'
    ];

    // Question patterns that require a response
    const questionPatterns = [
      /(can you|could you|would you|please|kindly)\s+(let me know|update me|provide|share|send)/i,
      /(when|what|where|why|how|who|is|are|can|could|would|will|do|does|did|have|has|had)\s+(you|we|i|they)/i,
      /\?\s*$/
    ];

    // Check for direct action keywords
    const hasActionKeywords = actionKeywords.some(keyword => 
      summary.toLowerCase().includes(keyword) || 
      (extractedData && JSON.stringify(extractedData).toLowerCase().includes(keyword))
    );

    // Check for questions
    const hasQuestions = questionPatterns.some(pattern => 
      pattern.test(summary) || 
      (extractedData?.questions as string[] || []).length > 0
    );

    // Check for requests in the extracted data
    const hasExplicitRequest = extractedData?.requiresAction === true || 
                             extractedData?.actionItems?.length > 0 ||
                             extractedData?.nextSteps?.length > 0;

    return hasActionKeywords || hasQuestions || hasExplicitRequest;
  }

  private determinePriority(extractedData: any, summary: string): 'high' | 'medium' | 'low' {
    const summaryLower = summary.toLowerCase();
    
    // High priority indicators
    const highPriorityKeywords = [
      'urgent', 'asap', 'immediate attention', 'critical', 'important',
      'deadline', 'due today', 'time-sensitive', 'high priority', 'action required'
    ];

    // Low priority indicators
    const lowPriorityKeywords = [
      'when you have time', 'no rush', 'low priority', 'not urgent',
      'at your convenience', 'when possible', 'FYI', 'for your information'
    ];

    // Check extracted data for explicit priority
    if (extractedData?.priority) {
      const priority = String(extractedData.priority).toLowerCase();
      if (['high', 'medium', 'low'].includes(priority)) {
        return priority as 'high' | 'medium' | 'low';
      }
    }

    // Check for high priority indicators
    const hasHighPriority = highPriorityKeywords.some(keyword => 
      summaryLower.includes(keyword) ||
      (extractedData && JSON.stringify(extractedData).toLowerCase().includes(keyword))
    );

    // Check for low priority indicators
    const hasLowPriority = lowPriorityKeywords.some(keyword => 
      summaryLower.includes(keyword) ||
      (extractedData && JSON.stringify(extractedData).toLowerCase().includes(keyword))
    );

    // Determine priority based on indicators
    if (hasHighPriority) return 'high';
    if (hasLowPriority) return 'low';
    
    // Default to medium priority
    return 'medium';
  }

  private extractCategories(extractedData: any, summary: string): string[] {
    const categories = new Set<string>();
    const summaryLower = summary.toLowerCase();
    
    // Add categories from extracted data if available
    if (extractedData?.categories?.length) {
      extractedData.categories.forEach((cat: string) => 
        categories.add(cat.toLowerCase().trim())
      );
    }

    // Common email categories and their indicators
    const categoryPatterns: {[key: string]: (string | RegExp)[]} = {
      'meeting': [
        'meeting', 'calendar', 'schedule', 'appointment',
        /(let\'?s|can we|set up|schedule|have) a (meeting|call)/i,
        /(discuss|talk|chat) (about|regarding)/i
      ],
      'question': [
        'question', '?', 'wondering', 'curious', 'not sure', 'unsure',
        /can you (explain|clarify|help with)/i,
        /what (is|are|do|does|did|was|were|will|would)/i,
        /how (do|does|did|can|will|would)/i,
        /why (is|are|do|does|did|was|were|will|would)/i
      ],
      'action_item': [
        'action item', 'todo', 'task', 'next steps', 'follow up',
        'please', 'kindly', 'request', 'need you to', 'would like you to'
      ],
      'document': [
        'document', 'attachment', 'file', 'spreadsheet', 'presentation',
        'report', 'proposal', 'contract', 'agreement', 'invoice'
      ],
      'notification': [
        'notification', 'alert', 'update', 'reminder', 'announcement',
        'newsletter', 'digest', 'report', 'summary'
      ],
      'social': [
        'invitation', 'invite', 'rsvp', 'connect', 'follow', 'like', 'share',
        'comment', 'mention', 'message', 'friend', 'follower', 'connection'
      ],
      'purchase': [
        'order', 'purchase', 'receipt', 'invoice', 'payment', 'transaction',
        'subscription', 'renewal', 'billing', 'refund', 'confirmation #', 'order #'
      ]
    };

    // Check for each category
    for (const [category, patterns] of Object.entries(categoryPatterns)) {
      const hasMatch = patterns.some(pattern => {
        if (typeof pattern === 'string') {
          return summaryLower.includes(pattern);
        } else if (pattern instanceof RegExp) {
          return pattern.test(summary) || 
                 (extractedData && pattern.test(JSON.stringify(extractedData)));
        }
        return false;
      });

      if (hasMatch) {
        categories.add(category);
      }
    }

    // Add priority-based categories if not already present
    const priority = this.determinePriority(extractedData, summary);
    if (priority === 'high' && !categories.has('important')) {
      categories.add('important');
    }

    return Array.from(categories);
  }

  private createResponsePrompt(
    email: EmailMessage,
    conversationHistory: EmailMessage[],
    additionalContext?: string
  ): string {
    // Format the conversation history
    const history = conversationHistory
      .map((msg, index) => {
        const sender = msg.from?.name ? `${msg.from.name} <${msg.from.address}>` : msg.from?.address || 'Unknown';
        return `[${msg.date.toISOString()}] From: ${sender}
Subject: ${msg.subject || '(No subject)'}
${msg.text || ''}`;
      })
      .join('\n\n---\n\n');

    // Extract key information from the email
    const emailInfo = {
      subject: email.subject,
      from: email.from?.name ? `${email.from.name} <${email.from.address}>` : email.from?.address || 'Unknown',
      to: email.to?.map(addr => addr.name ? `${addr.name} <${addr.address}>` : addr.address).join(', '),
      date: email.date.toISOString(),
      cc: email.cc?.map(addr => addr.name ? `${addr.name} <${addr.address}>` : addr.address).join(', '),
      hasAttachments: email.attachments && email.attachments.length > 0 ? 'Yes' : 'No'
    };

    // Build the prompt
    return `You are an AI assistant helping to draft a professional email response. 
Please compose a thoughtful reply to the following email thread.

=== EMAIL DETAILS ===
Subject: ${emailInfo.subject}
From: ${emailInfo.from}
To: ${emailInfo.to}
Date: ${emailInfo.date}
${emailInfo.cc ? `CC: ${emailInfo.cc}\n` : ''}Has Attachments: ${emailInfo.hasAttachments}

=== CONVERSATION HISTORY ===
${history || 'No previous messages in this thread.'}

=== ADDITIONAL CONTEXT ===
${additionalContext || 'No additional context provided.'}

=== INSTRUCTIONS ===
1. Carefully read the entire conversation history to understand the context.
2. Identify all questions, requests, or action items that need to be addressed.
3. Consider the tone and style of the conversation.
4. Draft a response that is:
   - Professional and polite
   - Concise but thorough
   - Addresses all points from the email
   - Asks for clarification if anything is unclear
   - Suggests next steps or actions if appropriate
   - Matches the formality of the original email
5. If the email contains multiple questions or topics, structure your response with clear sections.
6. If the email is a notification that doesn't require a response, simply acknowledge receipt.
7. If you're unsure about something, ask clarifying questions.
8. Keep the response under 300 words unless more detail is necessary.

=== YOUR RESPONSE ===
[Write your email response below. Start with an appropriate greeting and end with a professional closing.]

`;
  }
}
