import { EventEmitter } from 'events';
export type MessageType = 'status' | 'transcript' | 'action' | 'error' | 'suggestion' | 'assistant_message' | 'user_message';
export interface RealtimeMessage {
    type: MessageType;
    content: any;
    timestamp: number;
    id?: string;
    contextId?: string;
    source?: string;
    metadata?: Record<string, any>;
}
export declare class RealtimeService extends EventEmitter {
    private static instance;
    private wsClient;
    private isConnected;
    private messageQueue;
    private reconnectAttempts;
    private maxReconnectAttempts;
    private reconnectInterval;
    private constructor();
    static getInstance(): RealtimeService;
    private initialize;
    sendMessage(type: MessageType, content: any, options?: {
        id?: string;
        contextId?: string;
        source?: string;
        metadata?: Record<string, any>;
    }): void;
    private flushMessageQueue;
    private attemptReconnect;
    connect(): void;
    disconnect(): void;
    getConnectionStatus(): boolean;
}
export declare const realtimeService: RealtimeService;
//# sourceMappingURL=RealtimeService.d.ts.map