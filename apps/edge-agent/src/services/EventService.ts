import { WebSocketClient } from './WebSocketClient';
import { EventEmitter } from 'events';
import { ipcRenderer } from 'electron';
import { v4 as uuidv4 } from 'uuid';

interface EventServiceOptions {
  wsUrl: string;
  autoReconnect?: boolean;
  onEventProcessed?: (event: any) => void;
  onError?: (error: Error) => void;
}

type EventHandler = (data: any) => void;

export class EventService extends EventEmitter {
  private wsClient: WebSocketClient;
  private sessionId: string = uuidv4();
  private isObserving = false;
  private eventBuffer: any[] = [];
  private readonly maxBufferSize = 100;
  private processQueue: (() => Promise<void>)[] = [];
  private isProcessing = false;

  private isConnected = false;
  private options: EventServiceOptions; // Declare options property explicitly

  constructor(options: EventServiceOptions) {
    super();
    console.log('[EventService] Constructor called');
    this.options = options;
    this.wsClient = new WebSocketClient({
      url: options.wsUrl,
      autoReconnect: true,
    });

    this.setupEventListeners();
    console.log('[EventService] Calling wsClient.connect()');
    this.wsClient.connect();
  }

  private setupEventListeners(): void {
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
    this.wsClient.on('message', (message: any) => {
      if (message.type) {
        this.emit(message.type, message.data);
      }
    });

    this.wsClient.on('error', (error: Error) => {
      console.error('WebSocket error:', error);
      this.options.onError?.(error);
    });

    // Handle processed events from the server
    this.wsClient.on('message:event_processed', (message: any) => {
      this.options.onEventProcessed?.(message.data);
    });
  }

  public startObserving(): void {
    if (this.isObserving) return;

    this.isObserving = true;
  }

  public stopObserving(): void {
    this.isObserving = false;
    // Don't disconnect the WebSocket as it might be used by other components
  }

  public async captureEvent(event: {
    type: string;
    data: any;
    source: 'screen' | 'audio' | 'user' | 'system';
    timestamp?: string;
  }): Promise<void> {
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

  private async processEvent(event: any): Promise<void> {
    // Add to processing queue
    this.processQueue.push(async () => {
      try {
        // console.log('[EventService] Sending event to WebSocket:', event.type);

        // Flatten the structure for the backend
        const payload = {
          type: 'process_event',
          content: event.data?.content,
          metadata: {
            ...event.data?.metadata,
            source: event.source,
            id: event.id,
            timestamp: event.timestamp
          }
        };

        // console.log('[EventService] Payload:', JSON.stringify(payload, null, 2));
        this.wsClient.send(payload);
        // console.log('[EventService] Event sent successfully');
      } catch (error) {
        console.error('Error processing event:', error);
        this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    });

    // Start processing if not already running
    this.processQueueIfNeeded();
  }

  private async processQueueIfNeeded(): Promise<void> {
    if (this.isProcessing || this.processQueue.length === 0) return;

    this.isProcessing = true;

    try {
      while (this.processQueue.length > 0) {
        const task = this.processQueue.shift();
        if (task) {
          await task();
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private flushEventBuffer(): void {
    if (!this.isObserving) return;

    const eventsToProcess = [...this.eventBuffer];
    this.eventBuffer = [];

    for (const event of eventsToProcess) {
      this.processEvent(event);
    }
  }

  public getStatus(): {
    isConnected: boolean;
    isObserving: boolean;
    bufferSize: number;
    queueSize: number;
  } {
    return {
      isConnected: this.wsClient.connectionStatus === 'connected',
      isObserving: this.isObserving,
      bufferSize: this.eventBuffer.length,
      queueSize: this.processQueue.length,
    };
  }

  public disconnect(): void {
    this.wsClient.disconnect();
    this.isObserving = false;
  }
}
