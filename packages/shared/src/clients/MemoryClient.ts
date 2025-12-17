// packages/shared/src/clients/MemoryClient.ts
import { ServiceClient } from './ServiceClient.js';
import type { Event, Entity, Task } from '../index.js';

export interface MemoryEvent extends Omit<Event, 'id' | 'start_time' | 'end_time'> {
  id?: string;
  start_time: Date | string;
  end_time?: Date | string;
}

export interface RetrieveOptions {
  query: string;
  context?: {
    entities?: string[];
    timeWindow?: {
      start: Date | string;
      end: Date | string;
    };
  };
  weights?: {
    semantic?: number;
    temporal?: number;
    relational?: number;
  };
  limit?: number;
}

export interface RetrieveResult {
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

export class MemoryClient extends ServiceClient {
  constructor(baseURL: string = process.env.MEMORY_SERVICE_URL || 'http://localhost:3000') {
    super('MemoryService', baseURL);
  }

  async storeEvent(event: MemoryEvent): Promise<{ event_id: string }> {
    return this.request({
      method: 'POST',
      url: '/events',
      data: {
        ...event,
        start_time: event.start_time instanceof Date ? event.start_time.toISOString() : event.start_time,
        end_time: event.end_time
          ? (event.end_time instanceof Date ? event.end_time.toISOString() : event.end_time)
          : undefined
      },
    });
  }

  async retrieveMemories(options: RetrieveOptions): Promise<{ results: RetrieveResult[] }> {
    return this.request({
      method: 'POST',
      url: '/retrieve',
      data: options,
    });
  }

  async retrieve(query: string, options: Partial<RetrieveOptions> = {}): Promise<RetrieveResult[]> {
    const result = await this.retrieveMemories({
      query,
      ...options
    });
    return result.results || [];
  }

  async getTasks(filters: { status?: string; limit?: number } = {}): Promise<{ data: Task[] }> {
    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.limit) params.append('limit', filters.limit.toString());

    return this.request({
      method: 'GET',
      url: `/tasks?${params.toString()}`,
    });
  }

  async getUserPreferences(userId?: string): Promise<{ data: { preferences: any; userId: string } }> {
    return this.request({
      method: 'GET',
      url: '/user/preferences',
      headers: userId ? { 'x-user-id': userId } : undefined
    });
  }

  async getEntity(id: string): Promise<{
    entity: Entity;
    recent_events: Event[];
  }> {
    return this.request({
      method: 'GET',
      url: `/entities/${id}`,
    });
  }

  async getEvent(id: string): Promise<Event> {
    return this.request({
      method: 'GET',
      url: `/events/${id}`,
    });
  }

  async createTask(task: Partial<Task>): Promise<{ task_id: string }> {
    return this.request({
      method: 'POST',
      url: '/tasks',
      data: task,
    });
  }

  // Drafts
  async createDraft(draft: any): Promise<any> {
    return this.request({
      method: 'POST',
      url: '/drafts',
      data: draft,
    });
  }

  async getDraft(id: string): Promise<any> {
    return this.request({
      method: 'GET',
      url: `/drafts/${id}`,
    });
  }

  async getDrafts(status: string = 'draft'): Promise<{ data: any[] }> {
    return this.request({
      method: 'GET',
      url: `/drafts?status=${status}`,
    });
  }

  async updateDraft(id: string, updates: any): Promise<any> {
    return this.request({
      method: 'PUT',
      url: `/drafts/${id}`,
      data: updates,
    });
  }

  async deleteDraft(id: string): Promise<void> {
    return this.request({
      method: 'DELETE',
      url: `/drafts/${id}`,
    });
  }
}