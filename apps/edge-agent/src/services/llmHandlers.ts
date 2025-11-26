import { ipcMain } from 'electron';
import { LLMService } from './LLMService';

export function setupLLMHandlers(): void {
  // Extract structured data from text content with context support
  ipcMain.handle('llm:extract-structured-data', async (_, { content, contextId }: { content: string; contextId?: string }) => {
    try {
      const result = await LLMService.extractStructuredData(content, contextId);
      return result;
    } catch (error) {
      console.error('Error in extract-structured-data:', error);
      throw error;
    }
  });

  // Generate summary from text content
  ipcMain.handle('llm:generate-summary', async (_, content: string) => {
    try {
      const result = await LLMService.generateSummary(content);
      return result;
    } catch (error) {
      console.error('Error in generate-summary:', error);
      throw error;
    }
  });

  // Process screen content with metadata
  ipcMain.handle('llm:process-screen-content', async (_, { textContent, metadata }: { 
    textContent: string; 
    metadata: { 
      windowTitle: string; 
      appName: string; 
      timestamp: string; 
      url?: string 
    } 
  }) => {
    try {
      const result = await LLMService.processScreenContent(textContent, metadata);
      return result;
    } catch (error) {
      console.error('Error in process-screen-content:', error);
      throw error;
    }
  });

  // Generate response based on conversation context
  ipcMain.handle('llm:generate-response', async (_, { contextId, message }: { contextId: string; message: string }) => {
    try {
      const result = await LLMService.generateResponse(contextId, message);
      return result;
    } catch (error) {
      console.error('Error in generate-response:', error);
      throw error;
    }
  });
}
