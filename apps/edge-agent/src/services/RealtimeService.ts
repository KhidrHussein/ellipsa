import { EventEmitter } from 'events';
import { WebSocketClient } from './WebSocketClient';

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

export class RealtimeService extends EventEmitter {
  private static instance: RealtimeService;
  private wsClient: WebSocketClient;
  private isConnected = false;
  private messageQueue: RealtimeMessage[] = [];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectInterval = 3000;

  private constructor() {
    super();
    this.wsClient = new WebSocketClient({
      url: 'ws://localhost:4001',
      autoReconnect: true,
      reconnectInterval: this.reconnectInterval,
      maxReconnectAttempts: this.maxReconnectAttempts
    });

    this.initialize();
  }

  public static getInstance(): RealtimeService {
    if (!RealtimeService.instance) {
      RealtimeService.instance = new RealtimeService();
    }
    return RealtimeService.instance;
  }

  private initialize(): void {
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

    this.wsClient.on('message', (message: any) => {
      try {
        const parsed = typeof message === 'string' ? JSON.parse(message) : message;
        this.emit('message', parsed);
        
        // Emit specific message types
        if (parsed.type) {
          this.emit(parsed.type, parsed);
        }
      } catch (error) {
        console.error('[RealtimeService] Error processing message:', error);
      }
    });

    // Handle errors
    this.wsClient.on('error', (error: Error) => {
      console.error('[RealtimeService] WebSocket error:', error);
      this.emit('error', error);
    });
  }

  public sendMessage(
    type: MessageType, 
    content: any, 
    options: { id?: string; contextId?: string; source?: string; metadata?: Record<string, any> } = {}
  ): void {
    const message: RealtimeMessage = {
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
    } else {
      this.messageQueue.push(message);
      this.attemptReconnect();
    }
  }

  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.isConnected) {
      const message = this.messageQueue.shift();
      if (message) {
        this.wsClient.send(message);
      }
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`[RealtimeService] Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      setTimeout(() => {
        this.connect();
      }, this.reconnectInterval);
    } else {
      console.error('[RealtimeService] Max reconnection attempts reached');
      this.emit('reconnection_failed');
    }
  }

  public connect(): void {
    if (!this.isConnected) {
      this.wsClient.connect();
    }
  }

  public disconnect(): void {
    this.wsClient.disconnect();
    this.isConnected = false;
  }

  public getConnectionStatus(): boolean {
    return this.isConnected;
  }
}

export const realtimeService = RealtimeService.getInstance();
