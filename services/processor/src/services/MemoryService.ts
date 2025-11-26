import axios from 'axios';

export * from './types.js';

export interface MemoryEvent {
  type: string;
  title?: string;
  content?: string;
  summary_text?: string;
  description?: string;
  metadata: Record<string, any>;
  start_time: Date | string;
  end_time?: Date | string;
  participants?: Array<{
    entity_id: string;
    name?: string;
    metadata?: Record<string, any>;
  }>;
  tasks?: Array<{
    text: string;
    owner?: string;
    due_ts?: string;
    status?: string;
    priority?: string;
  }>;
}

export interface RetrieveOptions {
  query: string;
  context?: {
    entities?: string[];
    timeWindow?: {
      start: Date;
      end: Date;
    };
  };
  weights?: {
    semantic: number;
    temporal: number;
    relational: number;
  };
  limit?: number;
}

export interface RetrievalResult {
  id: string;
  type: 'event' | 'entity' | 'task';
  content: string;
  metadata: Record<string, any>;
  score: number;
  breakdown: {
    semantic: number;
    temporal: number;
    relational: number;
  };
}

export class MemoryService {
  private baseURL: string;
  private defaultWeights = {
    semantic: 0.5,
    temporal: 0.3,
    relational: 0.2,
  };

  constructor(baseURL: string = 'http://localhost:4001') {
    this.baseURL = baseURL;
  }

  /**
   * Stores an event in the memory service
   * @param event The event to store
   * @returns The ID of the created event
   */
  async storeEvent(event: MemoryEvent): Promise<string> {
    try {
      const response = await axios.post(`${this.baseURL}/memory/v1/events`, event, {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      console.log(`[MemoryService] Stored event with ID: ${response.data.event_id}`);
      return response.data.event_id;
    } catch (error) {
      console.error('[MemoryService] Failed to store event:', error);
      throw error;
    }
  }

  /**
   * Retrieves relevant memories based on a query and optional context
   * @param query The search query
   * @param context Additional context for the search
   * @param limit Maximum number of results to return
   * @returns Array of relevant memories
   */
  async retrieveMemories(
    query: string,
    context: RetrieveOptions['context'] = {},
    limit = 10
  ): Promise<RetrievalResult[]> {
    try {
      const options: RetrieveOptions = {
        query,
        context,
        weights: this.defaultWeights,
        limit,
      };

      const response = await axios.post(`${this.baseURL}/memory/v1/retrieve`, options, {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      console.log(`[MemoryService] Retrieved ${response.data.results.length} memories`);
      return response.data.results;
    } catch (error) {
      console.error('[MemoryService] Failed to retrieve memories:', error);
      throw error;
    }
  }

  /**
   * Gets an event by its ID
   * @param eventId The ID of the event to retrieve
   * @returns The event details
   */
  async getEvent(eventId: string) {
    try {
      const response = await axios.get(`${this.baseURL}/memory/v1/events/${eventId}`, {
        timeout: 30000,
      });
      
      console.log(`[MemoryService] Retrieved event: ${eventId}`);
      return response.data;
    } catch (error) {
      console.error(`[MemoryService] Failed to get event ${eventId}:`, error);
      throw error;
    }
  }

  /**
   * Gets an entity by its ID
   * @param entityId The ID of the entity to retrieve
   * @returns The entity details
   */
  async getEntity(entityId: string) {
    try {
      const response = await axios.get(`${this.baseURL}/memory/v1/entities/${entityId}`, {
        timeout: 30000,
      });
      
      console.log(`[MemoryService] Retrieved entity: ${entityId}`);
      return response.data;
    } catch (error) {
      console.error(`[MemoryService] Failed to get entity ${entityId}:`, error);
      throw error;
    }
  }

  /**
   * Searches for events matching the query
   * @param query The search query
   * @param limit Maximum number of results to return
   * @returns Array of matching events
   */
  async searchEvents(query: string, limit = 10) {
    try {
      const results = await this.retrieveMemories(query, {}, limit);
      console.log(`[MemoryService] Found ${results.length} events matching query: ${query}`);
      return results;
    } catch (error) {
      console.error('[MemoryService] Failed to search events:', error);
      throw error;
    }
  }

  /**
   * Stores a conversation turn in the memory service
   * @param userId The ID of the user
   * @param message The message content
   * @param metadata Additional metadata
   * @returns The ID of the created event
   */
  async storeConversationTurn(
    userId: string,
    message: string,
    metadata: Record<string, any> = {}
  ): Promise<string> {
    const event: MemoryEvent = {
      type: 'conversation',
      title: 'Conversation',
      content: message,
      summary_text: message,
      metadata: {
        ...metadata,
        user_id: userId,
      },
      start_time: new Date(),
      participants: [
        {
          entity_id: userId,
          name: metadata.username || `user_${userId.slice(0, 8)}`,
          metadata: {
            type: 'user',
            ...(metadata.user_metadata || {})
          }
        },
      ],
    };

    return this.storeEvent(event);
  }

  /**
   * Check health of memory service
   */
  async health(): Promise<{ status: string; timestamp: string }> {
    try {
      const response = await axios.get(`${this.baseURL}/memory/v1/health`, {
        timeout: 5000,
      });
      return response.data;
    } catch (error) {
      console.error('[MemoryService] Health check failed:', error);
      throw error;
    }
  }
}