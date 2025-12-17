import { EmailMessage, EmailSummary, DraftResponse } from '../types/email.types.js';
import { PromptClient } from '@ellipsa/shared';

export class EmailLLMService {
  private promptClient: PromptClient;

  constructor(promptClient: PromptClient) {
    this.promptClient = promptClient;
  }

  async summarizeEmail(email: EmailMessage): Promise<EmailSummary> {
    try {
      const content = `From: ${email.from.name} <${email.from.address}>
Subject: ${email.subject}
Date: ${email.date.toISOString()}
\n${email.text || email.html?.substring(0, 1000) || 'No content'}`;

      const { summary } = await this.promptClient.summarize(content);

      // Parse the LLM response into a structured format
      return {
        id: email.id,
        threadId: email.threadId,
        subject: email.subject,
        from: email.from,
        date: email.date,
        summary: summary || 'No summary available',
        actionRequired: this.determineActionRequired(summary || ''),
        priority: this.determinePriority(summary || ''),
        categories: this.extractCategories(summary || ''),
      };
    } catch (error) {
      console.error('Error summarizing email with PromptService:', error);
      // Fallback to a simple summary
      return {
        id: email.id,
        threadId: email.threadId,
        subject: email.subject,
        from: email.from,
        date: email.date,
        summary: email.text?.substring(0, 200) + (email.text && email.text.length > 200 ? '...' : '') || 'No content',
        actionRequired: false,
        priority: 'medium',
        categories: [],
      };
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
      const history = context.conversationHistory
        ?.map(msg => `From: ${msg.from.name}
Date: ${msg.date.toISOString()}
${msg.text || ''}`)
        .join('\n\n---\n\n') || '';

      const response = await this.promptClient.draftEmail({
        history,
        context: context.additionalContext,
        sender_name: email.from.name,
        sender_email: email.from.address,
        subject: email.subject,
        email_content: email.text || email.html?.substring(0, 2000) || 'No content',
      });

      return {
        threadId: email.threadId,
        to: [email.from],
        subject: response.subject || (email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`),
        body: response.body || 'I will follow up shortly.',
        inReplyTo: email.id,
        references: [...(context.conversationHistory?.map(e => e.id) || []), email.id],
      };
    } catch (error) {
      console.error('Error drafting response with PromptService:', error);
      // Fallback to a simple response
      return {
        threadId: email.threadId,
        to: [email.from],
        subject: email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
        body: `Thank you for your email. I will get back to you soon.\n\nBest regards,\nEllipsa`,
        inReplyTo: email.id,
      };
    }
  }


  async evaluateAction(email: EmailSummary, fullContent?: string): Promise<{
    action: 'REPLY' | 'ARCHIVE' | 'TASK' | 'NONE';
    reasoning: string;
    draftIntent?: string;
    suggestedTask?: {
      title: string;
      description: string;
      priority: 'high' | 'medium' | 'low';
      dueDate?: string;
    };
  }> {
    try {
      const response = await this.promptClient.evaluateEmail({
        subject: email.subject,
        sender: email.from.address,
        summary: email.summary,
        content_snippet: fullContent ? fullContent.substring(0, 500) : 'N/A'
      });

      return {
        action: response.action || 'NONE',
        reasoning: response.reasoning || 'No reasoning provided',
        draftIntent: response.draftIntent,
        suggestedTask: response.suggestedTask
      };
    } catch (error) {
      console.error('Error evaluating email action:', error);
      return { action: 'NONE', reasoning: 'Error during AI evaluation' };
    }
  }

  private determineActionRequired(summary: string): boolean {
    // Simple heuristic to determine if action is required
    const actionKeywords = ['action required', 'please respond', 'urgent', 'asap', 'deadline', 'follow up'];
    return actionKeywords.some(keyword =>
      summary.toLowerCase().includes(keyword)
    );
  }

  private determinePriority(summary: string): 'high' | 'medium' | 'low' {
    const highPriority = ['urgent', 'asap', 'immediately', 'important', 'deadline'];
    const lowPriority = ['when you have time', 'no rush', 'low priority'];

    if (highPriority.some(word => summary.toLowerCase().includes(word))) {
      return 'high';
    }
    if (lowPriority.some(word => summary.toLowerCase().includes(word))) {
      return 'low';
    }
    return 'medium';
  }

  private extractCategories(summary: string): string[] {
    // This is a simplified version - in a real app, you might use a more sophisticated approach
    const categories: string[] = [];

    const categoryKeywords: Record<string, string[]> = {
      'work': ['meeting', 'project', 'team', 'report', 'presentation'],
      'personal': ['family', 'friend', 'personal', 'birthday', 'holiday'],
      'finance': ['invoice', 'payment', 'bill', 'purchase', 'refund'],
      'shopping': ['order', 'purchase', 'shipping', 'delivery'],
      'travel': ['flight', 'hotel', 'booking', 'itinerary', 'trip'],
    };

    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some(keyword => summary.toLowerCase().includes(keyword))) {
        categories.push(category);
      }
    }

    return categories.length > 0 ? categories : ['uncategorized'];
  }
}
