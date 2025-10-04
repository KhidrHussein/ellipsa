import { Knex } from 'knex';
import { z, type ZodType } from 'zod';
import { BaseModel, type PaginationOptions, type PaginatedResult } from './BaseModel';
import { Session } from 'neo4j-driver';
import { getEmbeddingFunction } from '../db/vector/chroma';
import type { BaseModel as BaseModelType } from './BaseModel';

// Event types based on the design document
export const EventType = z.enum([
  'meeting',
  'conversation',
  'email',
  'document_edit',
  'browser_activity',
  'system_event',
  'reminder',
  'task',
  'other',
]);

export type EventType = z.infer<typeof EventType>;

// Participant schema for events
export const ParticipantSchema = z.object({
  entity_id: z.string().uuid(),
  role: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

// Input schema for creating/updating events
export const EventInputSchema = z.object({
  // Required fields
  type: EventType,
  title: z.string(),
  start_time: z.union([z.string(), z.date()]),
  
  // Optional fields with defaults
  description: z.string().optional(),
  end_time: z.union([z.string(), z.date()]).optional(),
  participants: z.array(ParticipantSchema).default([]),
  source: z.string().optional(),
  source_id: z.string().optional(),
  metadata: z.record(z.any()).default({}),
  embedding: z.array(z.number()).optional(),
});

// Base schema with required fields
const BaseEventSchema = z.object({
  // Required fields
  id: z.string().uuid(),
  type: EventType,
  title: z.string(),
  start_time: z.union([z.string(), z.date()]),
  
  // Optional fields with defaults
  description: z.string().optional(),
  end_time: z.union([z.string(), z.date()]).optional(),
  participants: z.array(ParticipantSchema).default([]),
  source: z.string().optional(),
  source_id: z.string().optional(),
  metadata: z.record(z.any()).default({}),
  created_at: z.union([z.string(), z.date()]),
  updated_at: z.union([z.string(), z.date()]),
  embedding: z.array(z.number()).optional(),
});

// Full event schema with transformation to ensure metadata is always an object
export const EventSchema = BaseEventSchema.transform(data => ({
  ...data,
  metadata: data.metadata || {},
}));

// Type for the base event (before transformation)
type BaseEvent = z.infer<typeof BaseEventSchema>;

// Event types
type EventBaseInput = z.infer<typeof EventInputSchema>;
type EventBase = z.infer<typeof EventSchema>;

export type Event = EventBase;
export type EventInput = Omit<EventBaseInput, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>;
export type EventUpdate = Partial<Omit<EventBaseInput, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>>;

export function isEvent(data: unknown): data is Event {
  return EventSchema.safeParse(data).success;
}

export type Participant = z.infer<typeof ParticipantSchema>;

export class EventModel extends BaseModel<BaseEvent, EventInput, EventUpdate> {
  constructor(
    protected db: Knex,
    private neo4jSession: Session,
    private collection: any // ChromaDB collection
  ) {
    super('events', BaseEventSchema as unknown as ZodType<BaseEvent, any, any>, db);
  }

  /**
   * Create a new event with vector and graph data
   */
  async create(data: EventInput): Promise<Event> {
    // Generate embedding for the event title and description
    const textToEmbed = `${data.title} ${data.description || ''}`.trim();
    const embedding = await this.generateEmbedding(textToEmbed);
    
    // Create the event with the generated embedding
    const eventData = {
      ...data,
      embedding,
    };
    
    // Insert into the database
    const [result] = await this.db(this.tableName)
      .insert(eventData)
      .returning('*');
      
    return this.toEvent(result);
  }
  
  /**
   * Find all events with optional filtering
   */
  override async findAll(
    filters: Record<string, unknown> = {},
    options: PaginationOptions = {},
    trx?: Knex.Transaction
  ): Promise<PaginatedResult<Event>> {
    let query = trx ? trx(this.tableName) : this.db(this.tableName);
    
    // Apply time filters
    if (filters.startTime) {
      query = query.where('start_time', '>=', filters.startTime);
    }
    
    if (filters.endTime) {
      query = query.where('start_time', '<=', filters.endTime);
    }
    
    // Apply other filters
    Object.entries(filters).forEach(([key, value]) => {
      if (key !== 'startTime' && key !== 'endTime' && value !== undefined) {
        query = query.where(key, value);
      }
    });

    // Get total count for pagination
    const countResult = await query.clone().count('* as count').first();
    const totalCount = countResult ? parseInt(countResult.count as string, 10) : 0;

    // Apply pagination
    const page = options.page || 1;
    const pageSize = options.pageSize || 10;
    const totalPages = Math.ceil(totalCount / pageSize);

    query = query.offset((page - 1) * pageSize).limit(pageSize);

    // Apply sorting
    if (options.sortBy) {
      const sortOrder = options.sortOrder === 'desc' ? 'desc' : 'asc';
      query = query.orderBy(options.sortBy, sortOrder);
    } else {
      // Default sorting by start_time descending
      query = query.orderBy('start_time', 'desc');
    }

    const results = await query;
    
    return {
      data: results.map(result => this.toEvent(result)),
      pagination: {
        page,
        pageSize,
        totalItems: totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }
  
  /**
   * Find an event by ID
   */
  async findById(id: string): Promise<Event | null> {
    const result = await this.db(this.tableName).where({ id }).first();
    return result ? this.toEvent(result) : null;
  }
  
  /**
   * Update an event and its vector/graph representations
   */
  async update(
    id: string,
    data: Partial<Omit<EventInput, 'id' | 'created_at' | 'updated_at'>>
  ): Promise<Event | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    // If title or description changed, update the embedding
    const updatedData = { ...data };
    if (data.title || data.description) {
      const title = data.title || existing.title;
      const description = data.description || existing.description || '';
      const textToEmbed = `${title} ${description}`.trim();
      updatedData.embedding = await this.generateEmbedding(textToEmbed);
    }
    
    // Call the parent's update method
    const result = await super.update(id, updatedData);
    return result ? this.toEvent(result) : null;
  }

  /**
   * Delete an event and its vector/graph representations
   */
  async delete(id: string): Promise<boolean> {
    try {
      // Delete from the database
      const count = await this.db(this.tableName).where({ id }).del();
      
      // If you need to delete from vector/graph store, add that logic here
      // Example:
      // await this.collection.delete(id);
      
      return count > 0;
    } catch (error) {
      console.error('Error deleting event:', error);
      return false;
    }
  }

  /**
   * Convert a database record to the entity type
   */
  protected toEntity(data: unknown): Event {
    if (typeof data !== 'object' || data === null) {
      throw new Error('Invalid data type for Event');
    }
    
    const eventData = data as Record<string, any>;
    return {
      id: eventData.id,
      type: eventData.type,
      title: eventData.title,
      description: eventData.description,
      start_time: eventData.start_time,
      end_time: eventData.end_time,
      participants: eventData.participants || [],
      source: eventData.source,
      source_id: eventData.source_id,
      metadata: eventData.metadata || {},
      created_at: eventData.created_at,
      updated_at: eventData.updated_at,
      embedding: eventData.embedding,
    };
  }
  
  /**
   * Convert a database record to an Event object
   */
  private toEvent(data: unknown): Event {
    if (typeof data !== 'object' || data === null) {
      throw new Error('Invalid data type for Event');
    }
    
    const eventData = data as Record<string, any>;
    return this.toEntity({
      ...eventData,
      type: eventData.type,
      start_time: eventData.start_time,
      end_time: eventData.end_time,
      participants: eventData.participants || [],
      source: eventData.source,
      source_id: eventData.source_id,
      metadata: eventData.metadata || {},
      created_at: eventData.created_at,
      updated_at: eventData.updated_at,
      embedding: eventData.embedding,
    });
  }

  /**
   * Generate an embedding for the given text
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const embeddingFunction = await getEmbeddingFunction();
      const result = await embeddingFunction.generate([text]);
      return result[0];
    } catch (error) {
      console.error('Error generating embedding:', error);
      return [];
    }
  }
}