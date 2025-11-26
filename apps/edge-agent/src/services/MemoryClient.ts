import { EventEmitter } from 'events';

export interface EventData {
  type: string;
  data?: any;
  timestamp?: number;
  metadata?: Record<string, any>;
}

export interface StoreEventResult {
  success: boolean;
  id?: string;
  error?: Error;
}

class MemoryClient extends EventEmitter {
  private events: Map<string, EventData> = new Map();
  private static instance: MemoryClient;

  private constructor() {
    super();
  }

  public static getInstance(): MemoryClient {
    if (!MemoryClient.instance) {
      MemoryClient.instance = new MemoryClient();
    }
    return MemoryClient.instance;
  }

  async storeEvent(event: EventData): Promise<StoreEventResult> {
    try {
      const eventId = `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const eventWithMeta = {
        ...event,
        timestamp: event.timestamp || Date.now(),
        metadata: {
          ...event.metadata,
          storedAt: new Date().toISOString()
        }
      };
      
      this.events.set(eventId, eventWithMeta);
      this.emit('eventStored', { id: eventId, ...eventWithMeta });
      
      return { success: true, id: eventId };
    } catch (error) {
      console.error('Error storing event:', error);
      return {
        success: false,
        error: error instanceof Error ? error : new Error('Unknown error')
      };
    }
  }

  async getEvent(id: string): Promise<EventData | undefined> {
    return this.events.get(id);
  }

  async getAllEvents(): Promise<EventData[]> {
    return Array.from(this.events.values());
  }

  async clearEvents(): Promise<void> {
    this.events.clear();
  }
}

export const memoryClient = MemoryClient.getInstance();
