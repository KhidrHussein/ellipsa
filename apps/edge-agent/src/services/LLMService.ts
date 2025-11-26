import { ipcMain, ipcRenderer, IpcMain, IpcRenderer } from 'electron';

export interface StructuredData {
  type: string;
  data: Record<string, any>;
  entities?: Record<string, any>[];
  summary?: string;
  suggestions?: string[];
  requiresAction?: boolean;
  contextId?: string;
}

type ExtractionResult = StructuredData;

interface ScreenMetadata {
  windowTitle: string;
  appName: string;
  timestamp: string;
  url?: string;
}

interface ConversationContext {
  id: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
  }>;
  lastUpdated: number;
  contextWindow: number; // in milliseconds (e.g., 5 minutes)
}

class LLMServiceImpl {
  private ipc: IpcMain | IpcRenderer;
  private isMain: boolean;
  private activeContexts: Map<string, ConversationContext> = new Map();
  private readonly DEFAULT_CONTEXT_WINDOW = 5 * 60 * 1000; // 5 minutes

  constructor(isMain: boolean) {
    this.isMain = isMain;
    this.ipc = isMain ? ipcMain : ipcRenderer;
  }

  public async extractStructuredData(content: string, contextId?: string): Promise<ExtractionResult> {
    if (this.isMain) {
      // Get or create context
      const context = this.getOrCreateContext(contextId);
      
      // Add user message to context
      this.addMessageToContext(context, 'user', content);
      
      // Process with LLM (simplified for now)
      const result: ExtractionResult = {
        type: 'text',
        data: { content },
        summary: content.slice(0, 100) + '...',
        contextId: context.id,
        requiresAction: this.requiresAction(content)
      };
      
      // Generate a response if needed
      if (result.requiresAction) {
        const response = await this.generateResponse(context.id, content);
        result.suggestions = response.suggestions;
      }
      
      return result;
    } else {
      const ipcRenderer = this.ipc as IpcRenderer;
      return await ipcRenderer.invoke('llm:extract-structured-data', { content, contextId });
    }
  }

  public async generateSummary(content: string): Promise<string> {
    if (this.isMain) {
      // Simple summary implementation - can be enhanced with actual LLM call
      return content.length > 200 ? content.slice(0, 200) + '...' : content;
    } else {
      const ipcRenderer = this.ipc as IpcRenderer;
      return await ipcRenderer.invoke('llm:generate-summary', content);
    }
  }
  
  private getOrCreateContext(contextId?: string): ConversationContext {
    if (contextId && this.activeContexts.has(contextId)) {
      return this.activeContexts.get(contextId)!;
    }
    
    const newContext: ConversationContext = {
      id: contextId || `ctx_${Date.now()}`,
      messages: [],
      lastUpdated: Date.now(),
      contextWindow: this.DEFAULT_CONTEXT_WINDOW
    };
    
    this.activeContexts.set(newContext.id, newContext);
    this.cleanupOldContexts();
    return newContext;
  }
  
  private addMessageToContext(context: ConversationContext, role: 'user' | 'assistant' | 'system', content: string): void {
    context.messages.push({
      role,
      content,
      timestamp: Date.now()
    });
    context.lastUpdated = Date.now();
  }
  
  private cleanupOldContexts(): void {
    const now = Date.now();
    for (const [id, context] of this.activeContexts.entries()) {
      if (now - context.lastUpdated > context.contextWindow) {
        this.activeContexts.delete(id);
      }
    }
  }
  
  private requiresAction(content: string): boolean {
    // Simple heuristic to determine if a response is needed
    const questionWords = ['?', 'what', 'how', 'why', 'when', 'where', 'who', 'can you', 'could you', 'would you'];
    return questionWords.some(word => content.toLowerCase().includes(word));
  }
  
  public async generateResponse(contextId: string, message: string): Promise<{suggestions: string[]}> {
    const context = this.getOrCreateContext(contextId);
    this.addMessageToContext(context, 'user', message);
    
    // This is a placeholder - in a real implementation, this would call an LLM
    // For now, return some generic suggestions
    const response = {
      suggestions: [
        'I noticed you might need help. How can I assist you?',
        'Would you like me to explain what I see on your screen?',
        'I can help with that. What would you like to know?'
      ]
    };
    
    // Add assistant response to context
    this.addMessageToContext(context, 'assistant', response.suggestions[0]);
    
    return response;
  }

  public async processScreenContent(
    textContent: string,
    metadata: ScreenMetadata
  ): Promise<ExtractionResult> {
    const prompt = `Extract information from the following screen content:
Application: ${metadata.appName}
Window Title: ${metadata.windowTitle}
Timestamp: ${metadata.timestamp}

${textContent}

Extract:
1. Key information and entities
2. Actionable items
3. Important dates and times
4. The overall sentiment (positive, neutral, negative)`;

    return this.extractStructuredData(prompt);
  }

  public async processAudioTranscription(transcription: string): Promise<ExtractionResult> {
    const prompt = `Process the following audio transcription and extract structured information:

${transcription}

Extract:
1. Key topics and entities
2. Action items and tasks
3. Important dates and times
4. The overall sentiment`;

    return this.extractStructuredData(prompt);
  }
}

// Create a singleton instance
export const LLMService = new LLMServiceImpl(process.type === 'browser');

// Initialize the service with the appropriate implementation
export function initializeLLMService(isMain: boolean): void {
  // The singleton is already created, but we can reinitialize it if needed
  Object.assign(LLMService, new LLMServiceImpl(isMain));
}
