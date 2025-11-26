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
declare class MemoryClient extends EventEmitter {
    private events;
    private static instance;
    private constructor();
    static getInstance(): MemoryClient;
    storeEvent(event: EventData): Promise<StoreEventResult>;
    getEvent(id: string): Promise<EventData | undefined>;
    getAllEvents(): Promise<EventData[]>;
    clearEvents(): Promise<void>;
}
export declare const memoryClient: MemoryClient;
export {};
//# sourceMappingURL=MemoryClient.d.ts.map