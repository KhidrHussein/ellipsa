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
export declare class MemoryClient extends ServiceClient {
    constructor(baseURL?: string);
    storeEvent(event: MemoryEvent): Promise<{
        event_id: string;
    }>;
    retrieveMemories(options: RetrieveOptions): Promise<{
        results: RetrieveResult[];
    }>;
    retrieve(query: string, options?: Partial<RetrieveOptions>): Promise<RetrieveResult[]>;
    getTasks(filters?: {
        status?: string;
        limit?: number;
    }): Promise<{
        data: Task[];
    }>;
    getUserPreferences(userId?: string): Promise<{
        data: {
            preferences: any;
            userId: string;
        };
    }>;
    getEntity(id: string): Promise<{
        entity: Entity;
        recent_events: Event[];
    }>;
    getEvent(id: string): Promise<Event>;
    createTask(task: Partial<Task>): Promise<{
        task_id: string;
    }>;
    createDraft(draft: any): Promise<any>;
    getDraft(id: string): Promise<any>;
    getDrafts(status?: string): Promise<{
        data: any[];
    }>;
    updateDraft(id: string, updates: any): Promise<any>;
    deleteDraft(id: string): Promise<void>;
}
//# sourceMappingURL=MemoryClient.d.ts.map