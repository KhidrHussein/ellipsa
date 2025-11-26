import { LLMService } from './LLMService';
import { EventService } from './EventService';
import { RealtimeService } from './RealtimeService';

export interface ScreenCaptureEvent {
  type: 'screen_capture';
  data: {
    id: string;
    textContent: string;
    metadata: {
      windowTitle: string;
      appName: string;
      timestamp: string;
      url?: string;
    };
  };
}

export class ResponsePipeline {
  private static instance: ResponsePipeline;
  private llmService: typeof LLMService;
  private eventService: EventService;
  private realtimeService: RealtimeService;
  private activeContextId: string | null = null;

  private constructor() {
    this.llmService = LLMService;
    this.eventService = new EventService({
      wsUrl: 'ws://localhost:4001',
      onEventProcessed: this.handleEventProcessed.bind(this),
      onError: (error) => console.error('EventService error:', error)
    });
    this.realtimeService = RealtimeService.getInstance();
    this.setupEventListeners();
  }

  public static getInstance(): ResponsePipeline {
    if (!ResponsePipeline.instance) {
      ResponsePipeline.instance = new ResponsePipeline();
    }
    return ResponsePipeline.instance;
  }

  private setupEventListeners(): void {
    // Listen for screen capture events
    this.eventService.on('screen_capture', this.handleScreenCapture.bind(this));
    
    // Listen for user messages from the UI
    this.realtimeService.on('user_message', (message: { text: string; contextId?: string }) => {
      this.handleUserMessage(message.text, message.contextId);
    });
  }

  private async handleScreenCapture(event: ScreenCaptureEvent): Promise<void> {
    const { textContent, metadata } = event.data;
    
    try {
      // Process the screen content with LLM
      const result = await this.llmService.extractStructuredData(
        textContent,
        this.activeContextId || undefined
      );

      // Update the active context if needed
      if (result.contextId) {
        this.activeContextId = result.contextId;
      }

      // If the LLM suggests a response is needed, send it to the UI
      if (result.suggestions && result.suggestions.length > 0) {
        this.realtimeService.sendMessage('suggestion', result.suggestions[0], {
          contextId: this.activeContextId || undefined,
          source: 'screen_analysis',
          metadata: {
            windowTitle: metadata.windowTitle,
            appName: metadata.appName,
            timestamp: new Date().toISOString()
          }
        });
      }
    } catch (error) {
      console.error('Error processing screen capture:', error);
      this.realtimeService.sendMessage('error', {
        message: 'Failed to process screen content',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async handleUserMessage(text: string, contextId?: string): Promise<void> {
    const targetContextId = contextId || this.activeContextId || 'default';
    
    try {
      // Process the user message with LLM
      const response = await this.llmService.generateResponse(
        targetContextId,
        text
      );

      // Send the response back to the UI
      this.realtimeService.sendMessage('assistant_message', 
        response.suggestions?.[0] || 'I\'m not sure how to respond to that.',
        {
          contextId: this.activeContextId || undefined,
          metadata: {
            timestamp: new Date().toISOString()
          }
        }
      );
    } catch (error) {
      console.error('Error processing user message:', error);
      this.realtimeService.sendMessage('error', {
        message: 'Failed to process your message',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private handleEventProcessed(event: any): void {
    console.log('Event processed:', event);
    // Additional processing if needed when an event is processed
  }

  public start(): void {
    console.log('Starting response pipeline');
    // Initialize WebSocket connection through the WebSocketClient
    (this.eventService as any).wsClient.connect();
  }

  public stop(): void {
    console.log('Stopping response pipeline');
    this.eventService.disconnect();
  }
}

// Export a singleton instance
export const responsePipeline = ResponsePipeline.getInstance();
