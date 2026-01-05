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
          // logger.info('Raw WebSocket data received:', data.toString());
          const message = JSON.parse(data.toString()) as WebSocketMessage;
          if (message.type !== 'ping') {
            logger.info(`Received message type: ${message.type}`);
          }

          switch (message.type) {
            case 'process_event':
              await this.handleProcessEvent(ws, message);
              break;
            case 'user_message':
              await this.handleUserMessage(ws, message);
              break;
            case 'subscribe':
              // Handle subscription logic
              break;
            case 'process_session_audio':
              await this.handleProcessSessionAudio(ws, message);
              break;
            case 'process_audio':
              // Handle real-time audio chunks
              await this.handleProcessAudio(ws, message);
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

  public async handleUserMessage(ws: ExtendedWebSocket, message: WebSocketMessage): Promise<void> {
    const { content, metadata = {} } = message;
    const { id, contextId } = metadata;
    const messageId = id || `msg-${Date.now()}`;

    if (!content) {
      return this.sendError(ws, 'Missing content', { id: messageId });
    }

    try {
      // Process the user message
      const response = await this.eventProcessingService.processUserMessage(content, metadata);

      // Send response back to client
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({
          type: 'assistant_message',
          content: response.message,
          id: `resp-${Date.now()}`,
          timestamp: new Date().toISOString(),
          contextId: contextId,
          metadata: {
            actionPlan: response.actionPlan,
            suggestedActions: response.suggestedActions
          }
        }));
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error processing user message:', errorMessage);
      this.sendError(ws, `Failed to process message: ${errorMessage}`, {
        id: messageId
      });
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

      const result = await this.eventProcessingService.processEvent(content, eventData.metadata);

      // The result now contains { event, extraction }
      // We want to send the summary back to the user
      const summary = (result as any).extraction?.summary || 'Event processed successfully';

      // Send the result back to the client
      if (ws.readyState === 1) {
        // Check if we should notify the user (based on confidence/relevance)
        const shouldNotify = (result as any).event?.metadata?.shouldNotify !== false;

        if (shouldNotify) {
          const response = {
            type: 'assistant_message',
            data: {
              content: summary,
              id: eventId,
              timestamp: new Date().toISOString(),
              metadata: {
                eventId: (result as any).event?.id,
                entities: (result as any).extraction?.entities,
                action_items: (result as any).extraction?.action_items
              }
            }
          };

          logger.info(`Sending assistant_message for event ${eventId} (summary: ${summary.substring(0, 50)}...)`);
          ws.send(JSON.stringify(response));

          // Broadcast to other clients (if any)
          this.broadcast(
            {
              type: 'assistant_message',
              data: {
                summary: 'New event processed',
                ...response.data
              }
            },
            [ws.id] // Exclude sender
          );
        } else {
          logger.info(`Skipping notification for event ${eventId} (shouldNotify: ${shouldNotify}, confidence: ${(result as any).event?.metadata?.assistance_confidence})`);
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error processing event:', errorMessage);
      this.sendError(ws, `Failed to process event: ${errorMessage}`, {
        id: eventId
      });
    }
  }

  /**
   * Handle real-time audio chunks for transcription
   * This enables Ellipsa to hear spoken questions during Observe Mode
   */
  public async handleProcessAudio(ws: ExtendedWebSocket, message: WebSocketMessage): Promise<void> {
    const startTime = Date.now(); // START TIMING
    const { metadata = {} } = message;
    const audioData = (message.data as any)?.content;
    const userId = (message.data as any)?.user_id || 'user';
    const eventId = `audio-${Date.now()}`;

    if (!audioData) {
      // Silently ignore empty audio chunks
      return;
    }

    // === VOICE ACTIVITY DETECTION (VAD) ===
    // Check if audio has enough energy to be speech (not silence)
    try {
      const audioBuffer = Buffer.from(audioData, 'base64');

      // Simple energy-based VAD: check if audio has enough variation
      // WebM/Opus audio: sample a portion and check for activity
      const sampleSize = Math.min(1000, audioBuffer.length);
      let energy = 0;
      for (let i = 0; i < sampleSize; i++) {
        const sample = audioBuffer[i];
        energy += Math.abs(sample - 128); // Deviation from silence center
      }
      const avgEnergy = energy / sampleSize;

      // If average energy is too low, it's likely silence
      // Threshold tuned empirically - adjust if needed
      const SILENCE_THRESHOLD = 5;
      if (avgEnergy < SILENCE_THRESHOLD) {
        // Skip silent audio - don't waste API call
        return;
      }
    } catch (vadError) {
      // If VAD check fails, continue with transcription anyway
      logger.warn(`VAD check failed: ${vadError}`);
    }

    try {
      // Attempt transcription
      const transcriptionStart = Date.now();
      const transcript = await this.eventProcessingService.transcriptionService?.transcribe(audioData);
      const transcriptionTime = Date.now() - transcriptionStart;

      // === WHISPER HALLUCINATION FILTER ===
      // Filter out known Whisper hallucinations that occur on silence/noise
      const WHISPER_HALLUCINATIONS = [
        'thank you for watching',
        'thanks for watching',
        'see you next time',
        'bye bye',
        'goodbye',
        'please subscribe',
        'please like and subscribe',
        'don\'t forget to subscribe',
        'i\'ll see you in the next',
        'pissedconsumer',  // Common OCR contamination
      ];

      const lowerTranscript = transcript?.toLowerCase().trim() || '';
      const isHallucination = WHISPER_HALLUCINATIONS.some(h => lowerTranscript.includes(h));

      if (isHallucination) {
        // Skip - this is a known Whisper hallucination on silent audio
        logger.info(`[VAD] Filtered Whisper hallucination: "${transcript?.substring(0, 30)}..."`);
        return;
      }

      if (transcript && transcript.trim().length > 3) {
        // Only process if we got meaningful speech
        logger.info(`[TIMING] Transcription: ${transcriptionTime}ms | "${transcript.substring(0, 50)}..."`);

        // Process as audio event with the transcribed text
        const processStart = Date.now();
        const result = await this.eventProcessingService.processEvent(transcript, {
          ...metadata,
          source: 'transcribed', // Already transcribed, don't double-transcribe
          user_id: userId,
          type: 'realtime_audio'
        });
        const processTime = Date.now() - processStart;

        // BROADCAST THE RESPONSE
        const summary = (result as any).extraction?.summary || '';
        const confidence = (result as any).extraction?.confidence || 0;

        // Filter out useless fallback responses and Whisper hallucinations
        const isUselessResponse =
          summary.toLowerCase() === 'audio processed' ||
          summary.toLowerCase().startsWith('audio processed') ||
          summary.toLowerCase().includes('thank you for watching') ||
          summary.toLowerCase().includes('thanks for watching') ||
          summary.toLowerCase().includes('see you next time') ||
          summary.trim().length < 15; // Too short to be useful

        // Only send if we have a MEANINGFUL response (not fallback text)
        if (summary && summary.trim().length > 0 && confidence >= 0.3 && !isUselessResponse) {
          if (ws.readyState === 1) {
            const totalTime = Date.now() - startTime;
            const response = {
              type: 'assistant_message',
              data: {
                content: summary,
                id: eventId,
                timestamp: new Date().toISOString(),
                metadata: {
                  eventId: (result as any).event?.id,
                  entities: (result as any).extraction?.entities,
                  action_items: (result as any).extraction?.action_items,
                  isRealtimeAudio: true,
                  // Include timing metadata for debugging
                  timing: {
                    transcriptionMs: transcriptionTime,
                    processingMs: processTime,
                    totalMs: totalTime
                  }
                }
              }
            };

            // LOG FULL TIMING BREAKDOWN
            logger.info(`[TIMING] Real-time response ready:
  - Transcription: ${transcriptionTime}ms
  - Q&A Processing: ${processTime}ms
  - TOTAL: ${totalTime}ms
  - Confidence: ${confidence.toFixed(2)}`);

            ws.send(JSON.stringify(response));

            // Broadcast to other clients (Main process listener)
            this.broadcast(
              {
                type: 'assistant_message',
                data: {
                  summary: 'Real-time audio response',
                  ...response.data
                }
              },
              [ws.id] // Exclude sender
            );
          }
        }
      }
      // If no meaningful speech, just silently ignore (ambient noise, silence, etc.)

    } catch (error) {
      // Silently ignore transcription errors for chunks (they're often just noise)
      // Only log at debug level to avoid spamming logs
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (!errorMessage.includes('Invalid audio format')) {
        logger.warn(`Real-time audio chunk processing failed: ${errorMessage}`);
      }
    }
  }

  public async handleProcessSessionAudio(ws: ExtendedWebSocket, message: WebSocketMessage): Promise<void> {
    const { content, metadata = {} } = message;
    // content is filePath in this case, or inside data
    const filePath = (message.data as any)?.filePath || content;
    const { id } = metadata;
    const eventId = id || `sess-${Date.now()}`;

    try {
      const result = await this.eventProcessingService.processSessionAudio(filePath, metadata);

      // Notify
      // The result now contains { event, extraction }
      const summary = (result as any).extraction?.summary || 'Session processed';

      if (ws.readyState === 1) {
        const response = {
          type: 'assistant_message',
          data: {
            content: summary,
            id: eventId,
            timestamp: new Date().toISOString(),
            metadata: {
              eventId: (result as any).event?.id,
              entities: (result as any).extraction?.entities,
              action_items: (result as any).extraction?.action_items,
              isSessionSummary: true
            }
          }
        };

        logger.info(`Sending session summary for ${eventId}`);
        ws.send(JSON.stringify(response));
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error processing session audio:', errorMessage);
      this.sendError(ws, `Failed to process session: ${errorMessage}`, { id: eventId });
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
