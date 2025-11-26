import { EventEmitter } from 'events';
interface EventServiceOptions {
    wsUrl: string;
    autoReconnect?: boolean;
    onEventProcessed?: (event: any) => void;
    onError?: (error: Error) => void;
}
export declare class EventService extends EventEmitter {
    private options;
    private wsClient;
    private sessionId;
    private isObserving;
    private eventBuffer;
    private readonly maxBufferSize;
    private processQueue;
    private isProcessing;
    private isConnected;
    constructor(options: EventServiceOptions);
    private setupEventListeners;
    startObserving(): void;
    stopObserving(): void;
    captureEvent(event: {
        type: string;
        data: any;
        source: 'screen' | 'audio' | 'user' | 'system';
        timestamp?: string;
    }): Promise<void>;
    private processEvent;
    private processQueueIfNeeded;
    private flushEventBuffer;
    getStatus(): {
        isConnected: boolean;
        isObserving: boolean;
        bufferSize: number;
        queueSize: number;
    };
    disconnect(): void;
}
export {};
//# sourceMappingURL=EventService.d.ts.map