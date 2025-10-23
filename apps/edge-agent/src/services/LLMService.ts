import { ipcMain, ipcRenderer, IpcMain, IpcRenderer } from 'electron';

export interface StructuredData {
  type: string;
  data: Record<string, any>;
  entities?: Record<string, any>[];
  summary?: string;
}

type ExtractionResult = StructuredData;

interface ScreenMetadata {
  windowTitle: string;
  appName: string;
  timestamp: string;
}

class LLMServiceImpl {
  private ipc: IpcMain | IpcRenderer;
  private isMain: boolean;

  constructor(isMain: boolean) {
    this.isMain = isMain;
    this.ipc = isMain ? ipcMain : ipcRenderer;
  }

  public async extractStructuredData(content: string): Promise<ExtractionResult> {
    if (this.isMain) {
      // Main process implementation
      return {
        type: 'text',
        data: { content },
        summary: content.slice(0, 100) + '...'
      };
    } else {
      // Renderer process - send to main process
      const ipcRenderer = this.ipc as IpcRenderer;
      return await ipcRenderer.invoke('llm:extract-structured-data', content);
    }
  }

  public async generateSummary(content: string): Promise<string> {
    if (this.isMain) {
      // Simple summary implementation
      return content.length > 200 ? content.slice(0, 200) + '...' : content;
    } else {
      const ipcRenderer = this.ipc as IpcRenderer;
      return await ipcRenderer.invoke('llm:generate-summary', content);
    }
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
