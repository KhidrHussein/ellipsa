import { EventEmitter } from 'events';
interface WebSocketClientOptions {
    url: string;
    autoReconnect?: boolean;
    reconnectInterval?: number;
    maxReconnectAttempts?: number;
}
export declare class WebSocketClient extends EventEmitter {
    private ws;
    private readonly url;
    private readonly autoReconnect;
    private readonly reconnectInterval;
    private readonly maxReconnectAttempts;
    private reconnectAttempts;
    private isConnected;
    private reconnectTimeout;
    private messageQueue;
    private sessionId;
    constructor(options: WebSocketClientOptions);
    connect(): void;
    private scheduleReconnect;
    send(message: any): void;
    private flushMessageQueue;
    disconnect(): void;
    get connectionStatus(): 'connected' | 'connecting' | 'disconnected';
}
export {};
//# sourceMappingURL=WebSocketClient.d.ts.map