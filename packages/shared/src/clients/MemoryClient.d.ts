import { ServiceClient } from './ServiceClient.js';
import type { Event, Entity } from '../index.js';
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
    getEntity(id: string): Promise<{
        entity: Entity;
        recent_events: Event[];
    }>;
    getEvent(id: string): Promise<Event>;
}
