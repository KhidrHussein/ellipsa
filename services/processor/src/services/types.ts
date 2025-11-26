// Types for MemoryService

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
      start: Date | string;
      end: Date | string;
    };
    relatedTo?: string[];
  };
  limit?: number;
  weights?: {
    semantic?: number;
    temporal?: number;
    relational?: number;
  };
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
