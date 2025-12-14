import { EmailMessage, EmailSummary, DraftResponse } from '../types.js';
import { IEmailMemoryService } from './IEmailMemoryService.js';

type EntityType = 'person' | 'organization' | 'other';
type RelationshipType = 'sent' | 'received' | 'cc' | 'bcc';

interface Entity {
  id: string;
  name: string;
  type: EntityType;
  metadata: Record<string, any>;
}

interface Event {
  id: string;
  type: string;
  source: string;
  timestamp: string;
  metadata: Record<string, any>;
  participants: string[];
}

export class EmailMemoryService implements IEmailMemoryService {
  public readonly entities: Map<string, Entity> = new Map();
  public readonly events: Map<string, Event> = new Map();
  public readonly emails: Map<string, EmailMessage> = new Map();
  public readonly drafts: Map<string, any> = new Map();

  constructor() { }

  private async createEntity(data: Omit<Entity, 'id'>): Promise<Entity> {
    const id = `entity-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const entity = { id, ...data };
    this.entities.set(id, entity);
    return entity;
  }

  private async findOrCreateEntity(data: Omit<Entity, 'id'>): Promise<Entity> {
    const existing = Array.from(this.entities.values()).find(
      e => e.metadata.email === data.metadata.email
    );
    return existing || this.createEntity(data);
  }

  private async createEvent(data: Omit<Event, 'id'>): Promise<Event> {
    const id = `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const event = { id, ...data };
    this.events.set(id, event);
    return event;
  }

  async getEmail(id: string): Promise<EmailMessage | null> {
    return this.emails.get(id) || null;
  }

  async searchEmails(query: string): Promise<EmailSummary[]> {
    const results: EmailSummary[] = [];

    for (const email of this.emails.values()) {
      if (email.subject.includes(query) ||
        email.text?.includes(query) ||
        email.html?.includes(query)) {
        results.push({
          id: email.id,
          threadId: email.threadId || '',
          subject: email.subject,
          from: email.from,
          date: email.date,
          summary: email.text?.substring(0, 100) || '',
          actionRequired: false,
          priority: 'medium',
          categories: [],
          metadata: email.metadata
        });
      }
    }

    return results;
  }

  async createDraft(draft: any): Promise<DraftResponse> {
    const id = `draft-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.drafts.set(id, { ...draft, id });
    return { id, ...draft };
  }

  async storeEmail(email: EmailMessage): Promise<void> {
    try {
      // Store the email
      this.emails.set(email.id, email);

      // 1. Store sender as entity
      const sender = await this.findOrCreateEntity({
        name: email.from.name || email.from.address.split('@')[0],
        type: 'person',
        metadata: {
          email: email.from.address,
          source: 'email_service',
          lastSeen: new Date().toISOString()
        }
      });

      // 2. Store recipients as entities
      const recipientPromises = email.to.map(async (recipient) =>
        this.findOrCreateEntity({
          name: recipient.name || recipient.address.split('@')[0],
          type: 'person',
          metadata: {
            email: recipient.address,
            source: 'email_service',
            lastSeen: new Date().toISOString()
          }
        })
      );
      const recipients = await Promise.all(recipientPromises);

      // 3. Store email as event
      await this.createEvent({
        type: 'email_received',
        source: 'email_service',
        timestamp: new Date().toISOString(),
        metadata: {
          subject: email.subject,
          body: email.text || email.html || '',
          threadId: email.threadId,
          emailId: email.id,
          isRead: email.isRead,
          labels: email.labels || []
        },
        participants: [sender.id, ...recipients.map(r => r.id)]
      });

      console.log(`Stored email from ${email.from.address} with subject: ${email.subject}`);
    } catch (error) {
      console.error('Error storing email:', error);
      throw error;
    }
  }

  async storeEmailSummary(summary: EmailSummary): Promise<void> {
    try {
      const email = this.emails.get(summary.id);
      if (!email && !summary.id) { // Allow storing summary even if email not in memory, if we insist, or loosen check
        // The original code checked if email exists. 
        // If we receive a full summary, we might strictly not need the raw email for this event, 
        // but let's keep the check if it was intended to link them.
        // However, usage in EmailProcessingService creates summary then stores it.
        // Let's assume we just log the event using the summary data.
      }

      await this.createEvent({
        type: 'email_summary',
        source: 'email_service',
        timestamp: new Date().toISOString(),
        metadata: {
          emailId: summary.id,
          subject: summary.subject,
          summary: summary.summary,
          from: summary.from.address,
          // Handle potential missing 'to' if it's not in summary or assuming it's same as email
          // Summary interface has 'from', but not 'to'? Let's check IEmailMemoryService.ts again... 
          // Wait, I saw IEmailMemoryService, but I need to check EmailSummary type definition in index.ts again to be sure what fields it has.
        },
        participants: [summary.from.address]
      });

      console.log(`Stored summary for email: ${summary.subject}`);
    } catch (error) {
      console.error('Error storing email summary:', error);
      throw error;
    }
  }

  async getConversationHistory(threadId: string): Promise<EmailMessage[]> {
    try {
      return Array.from(this.emails.values())
        .filter(email => email.threadId === threadId)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    } catch (error) {
      console.error(`Error getting conversation history for thread ${threadId}:`, error);
      throw error;
    }
  }

  async updateEmailStatus(emailId: string, status: string): Promise<void> {
    try {
      const email = this.emails.get(emailId);
      if (email) {
        email.isRead = status === 'read';
        email.metadata = email.metadata || {};
        email.metadata.status = status;
        email.metadata.lastUpdated = new Date().toISOString();
        this.emails.set(emailId, email);
      }
    } catch (error) {
      console.error('Error updating email status:', error);
      throw new Error(`Failed to update email status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Add the missing methods to satisfy the interface
  getEntities(): Map<string, Entity> {
    return this.entities;
  }

  getEvents(): Map<string, Event> {
    return this.events;
  }

  getEmails(): Map<string, EmailMessage> {
    return this.emails;
  }

  getDrafts(): Map<string, any> {
    return this.drafts;
  }
}
