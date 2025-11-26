import { EventEmitter } from 'events';
import { WebSocketClient } from './WebSocketClient';
export class RealtimeService extends EventEmitter {
    constructor() {
        super();
        this.isConnected = false;
        this.messageQueue = [];
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectInterval = 3000;
        this.wsClient = new WebSocketClient({
            url: 'ws://localhost:4001',
            autoReconnect: true,
            reconnectInterval: this.reconnectInterval,
            maxReconnectAttempts: this.maxReconnectAttempts
        });
        this.initialize();
    }
    static getInstance() {
        if (!RealtimeService.instance) {
            RealtimeService.instance = new RealtimeService();
        }
        return RealtimeService.instance;
    }
    initialize() {
        this.wsClient.on('connected', () => {
            console.log('[RealtimeService] Connected to WebSocket server');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.flushMessageQueue();
            this.emit('connected');
        });
        this.wsClient.on('disconnected', () => {
            console.log('[RealtimeService] Disconnected from WebSocket server');
            this.isConnected = false;
            this.emit('disconnected');
        });
        this.wsClient.on('message', (message) => {
            try {
                const parsed = typeof message === 'string' ? JSON.parse(message) : message;
                this.emit('message', parsed);
                // Emit specific message types
                if (parsed.type) {
                    this.emit(parsed.type, parsed);
                }
            }
            catch (error) {
                console.error('[RealtimeService] Error processing message:', error);
            }
        });
        // Handle errors
        this.wsClient.on('error', (error) => {
            console.error('[RealtimeService] WebSocket error:', error);
            this.emit('error', error);
        });
    }
    sendMessage(type, content, options = {}) {
        const message = {
            type,
            content,
            timestamp: Date.now(),
            id: options.id || Math.random().toString(36).substring(2, 11),
            contextId: options.contextId,
            source: options.source,
            metadata: options.metadata
        };
        if (this.isConnected) {
            this.wsClient.send(message);
        }
        else {
            this.messageQueue.push(message);
            this.attemptReconnect();
        }
    }
    flushMessageQueue() {
        while (this.messageQueue.length > 0 && this.isConnected) {
            const message = this.messageQueue.shift();
            if (message) {
                this.wsClient.send(message);
            }
        }
    }
    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`[RealtimeService] Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            setTimeout(() => {
                this.connect();
            }, this.reconnectInterval);
        }
        else {
            console.error('[RealtimeService] Max reconnection attempts reached');
            this.emit('reconnection_failed');
        }
    }
    connect() {
        if (!this.isConnected) {
            this.wsClient.connect();
        }
    }
    disconnect() {
        this.wsClient.disconnect();
        this.isConnected = false;
    }
    getConnectionStatus() {
        return this.isConnected;
    }
}
export const realtimeService = RealtimeService.getInstance();
//# sourceMappingURL=RealtimeService.js.map