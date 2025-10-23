import WebSocket from 'ws';
import { logger } from '../utils/logger';

interface TestMessage {
  type: string;
  id?: string;
  eventId?: string;
  status?: string;
  data?: {
    id: string;
    type: string;
    title: string;
    description?: string;
    start_time: string;
    end_time?: string | null;
    participants?: Record<string, any>;
    source?: string | null;
    source_id?: string | null;
    metadata?: Record<string, any>;
    created_at: string;
    updated_at: string;
    embedding?: any;
  };
  error?: string;
  timestamp?: string;
}

// Use the same port as the running server
const TEST_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4001;
const WS_URL = `ws://localhost:${TEST_PORT}`;

describe('WebSocket Integration', () => {
  let ws: WebSocket | null = null;
  
  // Set a longer timeout for the tests (30 seconds)
  jest.setTimeout(30000);

  beforeAll(async () => {
    // Wait for the server to be ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Server not available within 10 seconds'));
      }, 10000);

      const checkServer = () => {
        const testWs = new WebSocket(WS_URL);
        
        testWs.on('open', () => {
          clearTimeout(timeout);
          testWs.close();
          resolve();
        });

        testWs.on('error', () => {
          console.log('Server not ready yet, retrying...');
          setTimeout(checkServer, 1000);
        });
      };

      checkServer();
    });
  });

  afterEach(() => {
    // Close WebSocket connection after each test
    if (ws) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      ws = null;
    }
  });

  test('should connect to WebSocket server', (done) => {
    ws = new WebSocket(WS_URL);

    ws.on('open', () => {
      logger.info('Connected to WebSocket server');
      done();
    });

    ws.on('error', (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('WebSocket error:', errorMessage);
      done(error instanceof Error ? error : new Error(errorMessage));
    });
  });

  test('should process event via WebSocket', (done) => {
    ws = new WebSocket(WS_URL);
    const testEvent = {
      type: 'process_event',
      content: 'Team meeting: We need to finish the report by Friday.',
      metadata: {
        id: 'test-' + Date.now(),
        source: 'test',
        timestamp: new Date().toISOString()
      }
    };

    ws.on('open', () => {
      logger.info('Sending test event to WebSocket server');
      ws?.send(JSON.stringify(testEvent));
    });

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString()) as TestMessage;
        logger.info('Received message:', message);
        if (message.type === 'event_processed') {
          expect(message.data).toHaveProperty('id');
          expect(message.data).toHaveProperty('type');
          expect(message.data).toHaveProperty('title');
          done();
        } else if (message.type === 'error') {
          done(new Error(`Received error from server: ${message.error}`));
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Error parsing WebSocket message:', errorMessage);
        done(error instanceof Error ? error : new Error(errorMessage));
      }
    });

    ws.on('error', (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('WebSocket error:', errorMessage);
      done(error instanceof Error ? error : new Error(errorMessage));
    });
  });
});
