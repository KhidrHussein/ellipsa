import { EmailMessage, EmailSummary, DraftResponse } from '../types';
import OpenAI from 'openai';

export class EmailLLMService {
  private openai: OpenAI;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('OpenAI API key is required');
    }
    this.openai = new OpenAI({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true // Only for development
    });
  }

  async summarizeEmail(email: EmailMessage): Promise<EmailSummary> {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an AI assistant that helps summarize emails. Extract key points, action items, and categorize the email.'
          },
          {
            role: 'user',
            content: `Summarize this email and extract key information:
              From: ${email.from.name} <${email.from.address}>
              Subject: ${email.subject}
              Date: ${email.date.toISOString()}
              \n${email.text || email.html?.substring(0, 1000) || 'No content'}"
            `
          }
        ],
        temperature: 0.3,
      });

      const summary = response.choices[0]?.message?.content || 'No summary available';
      
      // Parse the LLM response into a structured format
      return {
        id: email.id,
        threadId: email.threadId,
        subject: email.subject,
        from: email.from,
        date: email.date,
        summary,
        actionRequired: this.determineActionRequired(summary),
        priority: this.determinePriority(summary),
        categories: this.extractCategories(summary),
      };
    } catch (error) {
      console.error('Error summarizing email with LLM:', error);
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
      const conversationContext = context.conversationHistory
        ?.map(msg => `From: ${msg.from.name}
Date: ${msg.date.toISOString()}
${msg.text || ''}`)
        .join('\n\n---\n\n') || '';

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are an AI assistant helping to draft email responses. 
            Be concise, professional, and address all points from the original email.
            ${context.additionalContext ? '\nAdditional context: ' + context.additionalContext : ''}`
          },
          {
            role: 'user',
            content: `Draft a response to this email. Consider the following conversation history:
            
            ${conversationContext}
            
            ---
            
            Original email:
            From: ${email.from.name} <${email.from.address}>
            Subject: ${email.subject}
            Date: ${email.date.toISOString()}
            
            ${email.text || email.html?.substring(0, 2000) || 'No content'}`
          }
        ],
        temperature: 0.5,
      });

      const draftText = response.choices[0]?.message?.content || 'I am following up on your email...';
      
      return {
        threadId: email.threadId,
        to: [email.from],
        subject: email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
        body: draftText,
        inReplyTo: email.id,
        references: [...(context.conversationHistory?.map(e => e.id) || []), email.id],
      };
    } catch (error) {
      console.error('Error drafting response with LLM:', error);
      // Fallback to a simple response
      return {
        threadId: email.threadId,
        to: [email.from],
        subject: email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
        body: `Thank you for your email. I will get back to you soon.\n\nBest regards,\n[Your Name]`,
        inReplyTo: email.id,
      };
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
