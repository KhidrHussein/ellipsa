import { EventEmitter } from 'events';
import { WebSocket as WS, type MessageEvent } from 'ws';
import { v4 as uuidv4 } from 'uuid';

type WebSocket = WS;

interface WebSocketClientOptions {
  url: string;
  autoReconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export class WebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private readonly url: string;
  private readonly autoReconnect: boolean;
  private readonly reconnectInterval: number;
  private readonly maxReconnectAttempts: number;
  private reconnectAttempts = 0;
  private isConnected = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private messageQueue: any[] = [];
  private sessionId: string = uuidv4();

  constructor(options: WebSocketClientOptions) {
    super();
    this.url = options.url;
    this.autoReconnect = options.autoReconnect ?? true;
    this.reconnectInterval = options.reconnectInterval ?? 5000;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 10;
  }

  connect(): void {
    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState === this.ws.OPEN) {
        return;
      }
    }

    this.ws = new WS(this.url);

    this.ws.on('open', () => {
      console.log('WebSocket connected');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.emit('connected');
      this.flushMessageQueue();
    });

    this.ws.on('message', (data: MessageEvent) => {
      try {
        const message = JSON.parse(data.toString());
        this.emit('message', message);
        if (message.type) {
          this.emit(`message:${message.type}`, message);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });

    this.ws.on('error', (error: Error) => {
      console.error('WebSocket error:', error);
      this.emit('error', error);
    });

    this.ws.on('close', (code: number, reason: string) => {
      console.log(`WebSocket closed: ${code} - ${reason}`);
      this.isConnected = false;
      this.emit('disconnected');
      
      if (this.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.scheduleReconnect();
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectAttempts++;
    const delay = this.reconnectInterval * Math.min(this.reconnectAttempts, 5); // Exponential backoff with max 5x
    
    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    this.reconnectTimeout = setTimeout(() => {
      console.log('Reconnecting...');
      this.connect();
    }, delay);
  }

  send(message: any): void {
    if (!this.isConnected || !this.ws) {
      this.messageQueue.push(message);
      return;
    }

    try {
      const messageWithMetadata = {
        ...message,
        metadata: {
          ...message.metadata,
          sessionId: this.sessionId,
          timestamp: new Date().toISOString(),
        },
      };
      
      this.ws.send(JSON.stringify(messageWithMetadata));
    } catch (error) {
      console.error('Error sending WebSocket message:', error);
      this.messageQueue.push(message);
    }
  }

  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.isConnected) {
      const message = this.messageQueue.shift();
      this.send(message);
    }
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.isConnected = false;
  }

  get connectionStatus(): 'connected' | 'connecting' | 'disconnected' {
    if (!this.ws) return 'disconnected';
    if (this.ws.readyState === WebSocket.OPEN) return 'connected';
    return 'connecting';
  }
}
