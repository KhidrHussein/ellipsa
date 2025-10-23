import { Server as WebSocketServer, WebSocket as WS, RawData } from 'ws';

// Extend the WebSocket interface to include our custom properties
interface ExtendedWebSocket extends WS {
  isAlive: boolean;
  id: string;
}

declare module 'ws' {
  interface WebSocket {
    isAlive: boolean;
    id: string;
  }
}

// Using console for logging since logger is not available
const logger = {
  info: (...args: any[]) => console.log('[INFO]', ...args),
  error: (...args: any[]) => console.error('[ERROR]', ...args),
  warn: (...args: any[]) => console.warn('[WARN]', ...args)
};

import { EventProcessingService } from './EventProcessingService';

export interface WebSocketMessage {
  type: string;
  content?: string;
  metadata?: {
    id?: string;
    source?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export class WebSocketService {
  private wss: WebSocketServer;
  private clients = new Set<ExtendedWebSocket>();
  private eventProcessingService: EventProcessingService;
  private heartbeatInterval?: NodeJS.Timeout;
  constructor(server: any, eventProcessingService: EventProcessingService) {
    this.wss = new WebSocketServer({ server });
    this.eventProcessingService = eventProcessingService;
    this.setupWebSocket();
  }

  private setupWebSocket(): void {
    // Setup heartbeat
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach((ws) => {
        if (!ws.isAlive) {
          logger.warn(`Terminating inactive WebSocket connection: ${ws.id}`);
          ws.terminate();
          this.clients.delete(ws);
          return;
        }
        ws.isAlive = false;
        if (ws.readyState === 1) { // 1 = OPEN
          ws.ping();
        }
      });
    }, 30000);

    this.wss.on('connection', (ws: ExtendedWebSocket) => {
      ws.id = Math.random().toString(36).substring(2, 15);
      ws.isAlive = true;
      
      logger.info(`New WebSocket connection: ${ws.id}`);
      this.clients.add(ws);

// Add event listeners with proper type assertions
      (ws as WS).on('pong', () => {
        ws.isAlive = true;
      });

      // Handle errors
      (ws as WS).on('error', (error: Error) => {
        logger.error(`WebSocket error (${ws.id}):`, error);
        this.clients.delete(ws);
      });

      // Handle connection close
      (ws as WS).on('close', () => {
        logger.info(`WebSocket connection closed: ${ws.id}`);
        this.clients.delete(ws);
      });

      // Handle incoming messages
      (ws as WS).on('message', async (data: RawData) => {
        try {
          const message = JSON.parse(data.toString()) as WebSocketMessage;
          logger.info('Received message:', message);

          switch (message.type) {
            case 'process_event':
              await this.handleProcessEvent(ws, message);
              break;
            case 'subscribe':
              // Handle subscription logic
              break;
            default:
              this.sendError(ws, 'Unknown message type');
          }
        } catch (error) {
          logger.error('Error processing WebSocket message:', error);
          this.sendError(ws, 'Invalid message format');
        }
      });
    });
  }

  public broadcast(message: unknown, excludeIds: string[] = []): void {
    const data = JSON.stringify(message);
    this.clients.forEach(client => {
      if (client.readyState === 1 && !excludeIds.includes(client.id)) {
        client.send(data, (error?: Error) => {
          if (error) {
            logger.error('Error broadcasting message:', error);
            this.clients.delete(client);
          }
        });
      }
    });
  }

  public sendError(ws: ExtendedWebSocket, message: string, data: Record<string, unknown> = {}): void {
    const errorMessage = {
      type: 'error',
      error: message,
      ...data,
      timestamp: new Date().toISOString()
    };
    if (ws.readyState === 1) { // 1 = OPEN
      ws.send(JSON.stringify(errorMessage));
    }
  }

  public async handleProcessEvent(ws: ExtendedWebSocket, message: WebSocketMessage): Promise<void> {
    const { content, metadata = {} } = message;
    const { id } = metadata;
    const eventId = id || `ws-${Date.now()}`;

    if (!content) {
      return this.sendError(ws, 'Missing content', { id: eventId });
    }

    try {
      // Process the event using the event processing service
      const eventData = {
        content,
        metadata: {
          id: eventId,
          source: 'websocket',
          timestamp: new Date().toISOString(),
          ...metadata
        }
      };

      const result = await this.eventProcessingService.processEvent(JSON.stringify(eventData));

      // Send the result back to the client
      if (ws.readyState === 1) {
        const response = {
          type: 'event_processed',
          data: result,
          id: eventId,
          timestamp: new Date().toISOString()
        };
        
        ws.send(JSON.stringify(response));
        
        // Broadcast to other clients
        this.broadcast(
          {
            ...response,
            data: { summary: 'New event processed' } // Don't send full result to other clients
          },
          [ws.id] // Exclude sender
        );
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error processing event:', errorMessage);
      this.sendError(ws, `Failed to process event: ${errorMessage}`, {
        id: eventId
      });
    }
  }

  public async close(): Promise<void> {
    // Clear the heartbeat interval if it exists
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
    
    // Close all WebSocket connections
    for (const client of this.clients) {
      try {
        if (client.readyState === 1) { // 1 = OPEN
          client.terminate();
        }
      } catch (error) {
        logger.error(`Error terminating WebSocket client ${client.id}:`, error);
      }
    }
    this.clients.clear();
    
    // Close the WebSocket server
    return new Promise((resolve, reject) => {
      if (!this.wss) {
        resolve();
        return;
      }
      
      this.wss.close((error) => {
        if (error) {
          logger.error('Error closing WebSocket server:', error);
          reject(error);
        } else {
          logger.info('WebSocket server closed');
          resolve();
        }
      });
    });
  }
  }
