import { ipcMain } from 'electron';
import { LLMService } from './LLMService';

export function setupLLMHandlers(): void {
  // Extract structured data from text content
  ipcMain.handle('llm:extract-structured-data', async (_, { content }: { content: string }) => {
    try {
      const result = await LLMService.extractStructuredData(content);
      return result;
    } catch (error) {
      console.error('Error in extract-structured-data:', error);
      throw error;
    }
  });

  // Generate summary from text content
  ipcMain.handle('llm:generate-summary', async (_, { content }: { content: string }) => {
    try {
      const result = await LLMService.generateSummary(content);
      return result;
    } catch (error) {
      console.error('Error in generate-summary:', error);
      throw error;
    }
  });
}
