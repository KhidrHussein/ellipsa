import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

// Type definitions for WebSocket
declare const window: any;
// In context-isolated renderer, window exists but process might not be fully populated.
// In main process, window is undefined.
// We rely on webpack DefinePlugin to set process.type to 'renderer'
const isRenderer = typeof window !== 'undefined' && typeof window.document !== 'undefined';

// Use the browser's native WebSocket in the renderer, or the Node.js ws module in the main process
let WebSocketClass: any;

// Check if we are in a browser environment (renderer)
// We rely on webpack DefinePlugin to set process.type to 'renderer'
// const isRenderer = process.type === 'renderer'; // Already declared above

console.log('[WebSocketClient] Environment Check:', {
  isRenderer,
  typeofWindow: typeof window,
  typeofDocument: typeof window !== 'undefined' ? typeof window.document : 'undefined'
});

if (isRenderer) {
  WebSocketClass = window.WebSocket;
  console.log('[WebSocketClient] Using native WebSocket (Browser/Renderer)');
} else {
  try {
    console.log('[WebSocketClient] Using ws module (Node/Main)');
    // Use eval('require') to prevent webpack from bundling 'ws' for the renderer
    // This block should be dead code in the renderer build
    const req = eval('require');
    const WS = req('ws');
    WebSocketClass = WS;
  } catch (e) {
    console.warn('Failed to load ws module, falling back to global WebSocket if available', e);
    WebSocketClass = (global as any).WebSocket;
  }
}

// Type for the WebSocket instance
type WebSocketInstance = WebSocket | any;

interface WebSocketClientOptions {
  url: string;
  autoReconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export class WebSocketClient extends EventEmitter {
  private ws: WebSocketInstance | null = null;
  private readonly url: string;
  private readonly autoReconnect: boolean;
  private readonly reconnectInterval: number;
  private readonly maxReconnectAttempts: number;
  private reconnectAttempts = 0;
  private isConnected = false;
  private reconnectTimeout: any = null;
  private messageQueue: Array<{ data: any; callback?: (error?: Error) => void }> = [];
  private sessionId: string = uuidv4();

  constructor(options: WebSocketClientOptions) {
    super();
    console.log('[WebSocketClient] Constructor called');
    this.url = options.url;
    this.autoReconnect = options.autoReconnect ?? true;
    this.reconnectInterval = options.reconnectInterval ?? 5000;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 10;
  }

  connect(): void {
    if (this.ws) {
      if (this.ws.removeAllListeners) {
        this.ws.removeAllListeners();
      }
      if (this.ws.readyState === this.ws.OPEN || this.ws.readyState === 1) { // 1 = OPEN
        return;
      }
    }

    try {
      console.log(`[WebSocketClient] Connecting to ${this.url}...`);
      this.ws = new WebSocketClass(this.url);

      // Set up event listeners based on the environment
      if (isRenderer) {
        // Browser environment
        this.ws.onopen = () => this.handleOpen();
        this.ws.onmessage = (event: MessageEvent) => this.handleMessage(event);
        this.ws.onerror = (error: Event) => this.handleError(error);
        this.ws.onclose = (event: CloseEvent) => this.handleClose(event);
      } else {
        // Node.js environment
        console.log('[WebSocketClient] Setting up Node.js event listeners');
        this.ws.on('open', () => {
          console.log('[WebSocketClient] Node.js socket open event fired');
          this.handleOpen();
        });
        this.ws.on('message', (data: any) => this.handleMessage({ data }));
        this.ws.on('error', (error: Error) => {
          console.error('[WebSocketClient] Node.js socket error:', error);
          this.handleError(error);
        });
        this.ws.on('close', () => this.handleClose({ code: 1000, reason: '', wasClean: true } as CloseEvent));
      }
    } catch (error) {
      console.error('WebSocket connection error:', error);
      this.handleReconnect();
    }
  }

  private handleOpen(): void {
    console.log('WebSocket connected');
    this.isConnected = true;
    this.reconnectAttempts = 0;
    this.emit('connected');
    this.flushMessageQueue();
  }

  private handleMessage(event: { data: any }): void {
    try {
      let data;
      if (typeof event.data === 'string') {
        try {
          data = JSON.parse(event.data);
        } catch (e) {
          // If it's not JSON, use the raw data
          data = event.data;
        }
      } else if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
        // Handle binary data if needed
        data = event.data;
      } else {
        data = event.data;
      }

      this.emit('message', data);
    } catch (error) {
      console.error('Error processing message:', error);
      this.emit('error', error);
    }
  }

  private handleError(error: Event | Error): void {
    console.error('WebSocket error:', error);
    this.emit('error', error);
  }

  private handleClose(event: CloseEvent | { code: number; reason: string; wasClean: boolean }): void {
    console.log(`WebSocket closed: ${event.code} ${'reason' in event ? event.reason : ''}`.trim());
    this.isConnected = false;
    this.emit('disconnected', { code: event.code, reason: ('reason' in event ? event.reason : '') });

    if (this.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.handleReconnect();
    }
  }

  private handleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectAttempts++;

    // Cap the delay at 30 seconds
    const delay = Math.min(
      this.reconnectInterval * Math.pow(1.5, this.reconnectAttempts - 1),
      30000
    );

    console.log(`Attempting to reconnect in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      console.log('Reconnecting...');
      this.connect();
    }, delay);
  }

  public send(data: any, callback?: (error?: Error) => void): void {
    if (!this.ws) {
      console.error('[WebSocketClient] Cannot send: WebSocket instance is null');
      const error = new Error('WebSocket is not connected');
      if (callback) {
        callback(error);
      }
      return;
    }

    const message = typeof data === 'string' ? data : JSON.stringify(data);

    if (this.isConnected && (this.ws.readyState === this.ws.OPEN || this.ws.readyState === 1)) {
      try {
        if (isRenderer) {
          // Browser WebSocket doesn't have a callback, so we'll use a Promise
          // console.log(`[WebSocketClient] Sending message of size: ${message.length} bytes`);
          this.ws.send(message);
          if (callback) {
            callback();
          }
        } else {
          // Node.js WebSocket with callback
          // console.log(`[WebSocketClient] (Node) Sending message of size: ${message.length} bytes`);
          (this.ws as any).send(message, (error?: Error) => {
            if (error) {
              console.error('[WebSocketClient] Send error:', error);
            }
            if (error && callback) {
              callback(error);
            } else if (callback) {
              callback();
            }
          });
        }
      } catch (error) {
        console.error('Error sending message:', error);
        if (callback) {
          callback(error as Error);
        }
      }
    } else {
      console.log('WebSocket not ready, queuing message');
      this.messageQueue.push({ data: message, callback });
    }
  }

  private flushMessageQueue(): void {
    // Create a copy of the queue and clear it to prevent race conditions
    const queue = [...this.messageQueue];
    this.messageQueue = [];

    // Process each message in the queue
    queue.forEach(({ data, callback }) => {
      if (callback) {
        this.send(data, callback);
      } else {
        this.send(data);
      }
    });
  }

  public close(code: number = 1000, reason?: string): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      try {
        if (isRenderer) {
          // Browser WebSocket
          this.ws.close(code, reason);
        } else {
          // Node.js WebSocket
          (this.ws as any).close(code, reason);
        }
      } catch (error) {
        console.error('Error closing WebSocket:', error);
      } finally {
        this.ws = null;
      }
    }

    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.messageQueue = [];
  }

  get connectionStatus(): 'connected' | 'connecting' | 'disconnected' {
    if (!this.ws) return 'disconnected';
    if (this.ws.readyState === WebSocket.OPEN) return 'connected';
    return 'connecting';
  }

  /**
   * Alias for close() for backward compatibility
   * @param code - Close code (default: 1000)
   * @param reason - Close reason (optional)
   */
  public disconnect(code: number = 1000, reason?: string): void {
    this.close(code, reason);
  }
}
