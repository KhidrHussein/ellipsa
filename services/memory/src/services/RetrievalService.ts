import { EventModel } from '../models/EventModel';
import { EntityModel } from '../models/EntityModel';
import { TaskModel } from '../models/TaskModel';
import { getEmbeddingFunction } from '../db/vector/chroma';

export interface RetrievalOptions {
  weights?: {
    semantic: number;
    temporal: number;
    relational: number;
  };
  entityContext?: string[];
  timeWindow?: {
    start: Date;
    end: Date;
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

export class RetrievalService {
  private embeddingFunction: any;

  constructor(
    private eventModel: EventModel,
    private entityModel: EntityModel,
    private taskModel: TaskModel
  ) {
    this.embeddingFunction = getEmbeddingFunction();
  }

  async retrieve(
    query: string,
    options: RetrievalOptions = {}
  ): Promise<RetrievalResult[]> {
    const {
      weights = { semantic: 0.4, temporal: 0.3, relational: 0.3 },
      entityContext = [],
      timeWindow,
      limit = 10,
    } = options;

    // 1. Generate query embedding
    const queryEmbedding = await this.embeddingFunction.generate([query]);

    // 2. Search across all collections (events, entities, tasks)
    const [eventResults, entityResults, taskResults] = await Promise.all([
      this.searchEvents(queryEmbedding[0], { timeWindow, limit: limit * 3 }),
      entityContext.length > 0
        ? this.searchEntities(queryEmbedding[0], { entityContext, limit: limit * 2 })
        : Promise.resolve([]),
      this.searchTasks(queryEmbedding[0], { limit: limit * 2 }),
    ]);

    // 3. Combine and score all results
    const allResults = [
      ...eventResults.map(r => ({ ...r, type: 'event' as const })),
      ...entityResults.map(r => ({ ...r, type: 'entity' as const })),
      ...taskResults.map(r => ({ ...r, type: 'task' as const })),
    ];

    // 4. Apply temporal decay and relationship scoring
    const now = Date.now();
    const scoredResults: RetrievalResult[] = allResults.map(result => {
      // Calculate temporal score (decay over time)
      const ageDays = result.metadata.timestamp
        ? (now - new Date(result.metadata.timestamp).getTime()) / (1000 * 60 * 60 * 24)
        : 0;
      const temporalScore = Math.exp(-0.1 * ageDays); // Decay factor of 0.1

      // Calculate relationship score (if entity context is provided)
      let relationalScore = 0;
      if (entityContext.length > 0 && result.metadata.related_entities?.length) {
        const relatedEntities = new Set(result.metadata.related_entities);
        const overlap = entityContext.filter(id => relatedEntities.has(id)).length;
        relationalScore = overlap / entityContext.length;
      }

      // Calculate final weighted score
      const finalScore =
        weights.semantic * result.score +
        weights.temporal * temporalScore +
        weights.relational * relationalScore;

      return {
        id: result.id,
        type: result.type,
        content: result.content,
        metadata: result.metadata,
        score: finalScore,
        breakdown: {
          semantic: result.score,
          temporal: temporalScore,
          relational: relationalScore,
        },
      };
    });

    // 5. Sort by final score and return top results
    return scoredResults
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private async searchEvents(
    queryEmbedding: number[],
    options: {
      timeWindow?: { start: Date; end: Date };
      limit: number;
    }
  ) {
    const { timeWindow, limit } = options;
    
    // Get all events with proper pagination options
    const events = await this.eventModel.findAll(
      {
        ...(timeWindow && {
          startTime: timeWindow.start,
          endTime: timeWindow.end,
        }),
      },
      { 
        pageSize: 100,
        page: 1
      }
    );

    // Calculate similarity scores
    const results = await Promise.all(
      events.data.map(async (event) => {
        const content = `${event.title}\n${event.description || ''}`;
        const embedding = event.embedding || await this.embeddingFunction.generate([content]);
        const similarity = this.cosineSimilarity(queryEmbedding, Array.isArray(embedding) ? embedding : embedding[0]);
        
        return {
          id: event.id as string,
          content,
          metadata: {
            ...event,
            timestamp: event.start_time,
            related_entities: event.participants?.map(p => p.entity_id) || [],
          },
          score: similarity,
        };
      })
    );

    return results
      .filter(r => r.id) // Filter out any results without IDs
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private async searchEntities(
    queryEmbedding: number[],
    options: {
      entityContext: string[];
      limit: number;
    }
  ) {
    const { entityContext, limit } = options;
    
    // Get entities with proper pagination options
    const entities = await this.entityModel.findAll(
      {},
      { 
        pageSize: 100,
        page: 1
      }
    );

    // Filter to only include entities in context
    const contextEntities = entities.data.filter(e => 
      e.id && entityContext.includes(e.id)
    );

    // Calculate similarity scores
    const results = await Promise.all(
      contextEntities.map(async (entity) => {
        const content = `${entity.name}\n${entity.description || ''}`;
        const embedding = entity.embedding || await this.embeddingFunction.generate([content]);
        const similarity = this.cosineSimilarity(queryEmbedding, Array.isArray(embedding) ? embedding : embedding[0]);
        
        return {
          id: entity.id as string,
          content,
          metadata: {
            ...entity,
            timestamp: entity.updated_at || entity.created_at,
            related_entities: [], // Would be populated with related entities
          },
          score: similarity,
        };
      })
    );

    return results
      .filter(r => r.id) // Filter out any results without IDs
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private async searchTasks(
    queryEmbedding: number[],
    options: { limit: number }
  ) {
    const { limit } = options;
    
    // Get all tasks with proper pagination options
    const tasks = await this.taskModel.findAll(
      {}, 
      { 
        pageSize: 100,
        page: 1
      }
    );

    // Calculate similarity scores
    const results = await Promise.all(
      tasks.data.map(async (task) => {
        const content = `${task.title}\n${task.description || ''}`;
        // Generate embedding for task content
        const embedding = await this.embeddingFunction.generate([content]);
        const similarity = this.cosineSimilarity(queryEmbedding, Array.isArray(embedding) ? embedding : embedding[0]);
        
        return {
          id: task.id as string,
          content,
          metadata: {
            ...task,
            timestamp: task.due_date || task.created_at,
            related_entities: task.assignee_id ? [task.assignee_id] : [],
          },
          score: similarity,
        };
      })
    );

    return results
      .filter(r => r.id) // Filter out any results without IDs
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }
}