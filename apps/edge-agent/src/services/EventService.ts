import { WebSocketClient } from './WebSocketClient';
import { ipcRenderer } from 'electron';
import { v4 as uuidv4 } from 'uuid';

interface EventServiceOptions {
  wsUrl: string;
  autoReconnect?: boolean;
  onEventProcessed?: (event: any) => void;
  onError?: (error: Error) => void;
}

export class EventService {
  private wsClient: WebSocketClient;
  private sessionId: string = uuidv4();
  private isObserving = false;
  private eventBuffer: any[] = [];
  private readonly maxBufferSize = 100;
  private processQueue: (() => Promise<void>)[] = [];
  private isProcessing = false;

  constructor(private options: EventServiceOptions) {
    this.wsClient = new WebSocketClient({
      url: options.wsUrl,
      autoReconnect: options.autoReconnect ?? true,
    });

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.wsClient.on('connected', () => {
      console.log('Connected to event service');
      this.flushEventBuffer();
    });

    this.wsClient.on('disconnected', () => {
      console.log('Disconnected from event service');
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
    this.wsClient.connect();
    
    // Start processing the queue if not already running
    this.processQueueIfNeeded();
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
        // Send to WebSocket if connected, otherwise buffer
        this.wsClient.send({
          type: 'process_event',
          data: event,
        });
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
