import { WebSocketClient } from './WebSocketClient';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
export class EventService extends EventEmitter {
    constructor(options) {
        super();
        this.options = options;
        this.sessionId = uuidv4();
        this.isObserving = false;
        this.eventBuffer = [];
        this.maxBufferSize = 100;
        this.processQueue = [];
        this.isProcessing = false;
        this.isConnected = false;
        this.wsClient = new WebSocketClient({
            url: options.wsUrl,
            autoReconnect: options.autoReconnect ?? true,
        });
        this.setupEventListeners();
    }
    setupEventListeners() {
        this.wsClient.on('connected', () => {
            console.log('Connected to event service');
            this.isConnected = true;
            this.emit('connected');
            this.flushEventBuffer();
        });
        this.wsClient.on('disconnected', () => {
            console.log('Disconnected from event service');
            this.isConnected = false;
            this.emit('disconnected');
        });
        // Forward all WebSocket messages as events
        this.wsClient.on('message', (message) => {
            if (message.type) {
                this.emit(message.type, message.data);
            }
        });
        this.wsClient.on('error', (error) => {
            console.error('WebSocket error:', error);
            this.options.onError?.(error);
        });
        // Handle processed events from the server
        this.wsClient.on('message:event_processed', (message) => {
            this.options.onEventProcessed?.(message.data);
        });
    }
    startObserving() {
        if (this.isObserving)
            return;
        this.isObserving = true;
    }
    stopObserving() {
        this.isObserving = false;
        // Don't disconnect the WebSocket as it might be used by other components
    }
    async captureEvent(event) {
        const eventToSend = {
            id: uuidv4(),
            type: event.type,
            data: event.data,
            source: event.source,
            timestamp: event.timestamp || new Date().toISOString(),
            sessionId: this.sessionId,
        };
        // Add to buffer
        this.eventBuffer.push(eventToSend);
        // If buffer exceeds max size, remove oldest events
        if (this.eventBuffer.length > this.maxBufferSize) {
            this.eventBuffer.shift();
        }
        // Process the event
        await this.processEvent(eventToSend);
    }
    async processEvent(event) {
        // Add to processing queue
        this.processQueue.push(async () => {
            try {
                // Send to WebSocket if connected, otherwise buffer
                this.wsClient.send({
                    type: 'process_event',
                    data: event,
                });
            }
            catch (error) {
                console.error('Error processing event:', error);
                this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
            }
        });
        // Start processing if not already running
        this.processQueueIfNeeded();
    }
    async processQueueIfNeeded() {
        if (this.isProcessing || this.processQueue.length === 0)
            return;
        this.isProcessing = true;
        try {
            while (this.processQueue.length > 0) {
                const task = this.processQueue.shift();
                if (task) {
                    await task();
                }
            }
        }
        finally {
            this.isProcessing = false;
        }
    }
    flushEventBuffer() {
        if (!this.isObserving)
            return;
        const eventsToProcess = [...this.eventBuffer];
        this.eventBuffer = [];
        for (const event of eventsToProcess) {
            this.processEvent(event);
        }
    }
    getStatus() {
        return {
            isConnected: this.wsClient.connectionStatus === 'connected',
            isObserving: this.isObserving,
            bufferSize: this.eventBuffer.length,
            queueSize: this.processQueue.length,
        };
    }
    disconnect() {
        this.wsClient.disconnect();
        this.isObserving = false;
    }
}
//# sourceMappingURL=EventService.js.map