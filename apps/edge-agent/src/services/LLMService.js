import { ipcMain, ipcRenderer } from 'electron';
class LLMServiceImpl {
    constructor(isMain) {
        this.activeContexts = new Map();
        this.DEFAULT_CONTEXT_WINDOW = 5 * 60 * 1000; // 5 minutes
        this.isMain = isMain;
        this.ipc = isMain ? ipcMain : ipcRenderer;
    }
    async extractStructuredData(content, contextId) {
        if (this.isMain) {
            // Get or create context
            const context = this.getOrCreateContext(contextId);
            // Add user message to context
            this.addMessageToContext(context, 'user', content);
            // Process with LLM (simplified for now)
            const result = {
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
        }
        else {
            const ipcRenderer = this.ipc;
            return await ipcRenderer.invoke('llm:extract-structured-data', { content, contextId });
        }
    }
    async generateSummary(content) {
        if (this.isMain) {
            // Simple summary implementation - can be enhanced with actual LLM call
            return content.length > 200 ? content.slice(0, 200) + '...' : content;
        }
        else {
            const ipcRenderer = this.ipc;
            return await ipcRenderer.invoke('llm:generate-summary', content);
        }
    }
    getOrCreateContext(contextId) {
        if (contextId && this.activeContexts.has(contextId)) {
            return this.activeContexts.get(contextId);
        }
        const newContext = {
            id: contextId || `ctx_${Date.now()}`,
            messages: [],
            lastUpdated: Date.now(),
            contextWindow: this.DEFAULT_CONTEXT_WINDOW
        };
        this.activeContexts.set(newContext.id, newContext);
        this.cleanupOldContexts();
        return newContext;
    }
    addMessageToContext(context, role, content) {
        context.messages.push({
            role,
            content,
            timestamp: Date.now()
        });
        context.lastUpdated = Date.now();
    }
    cleanupOldContexts() {
        const now = Date.now();
        for (const [id, context] of this.activeContexts.entries()) {
            if (now - context.lastUpdated > context.contextWindow) {
                this.activeContexts.delete(id);
            }
        }
    }
    requiresAction(content) {
        // Simple heuristic to determine if a response is needed
        const questionWords = ['?', 'what', 'how', 'why', 'when', 'where', 'who', 'can you', 'could you', 'would you'];
        return questionWords.some(word => content.toLowerCase().includes(word));
    }
    async generateResponse(contextId, message) {
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
    async processScreenContent(textContent, metadata) {
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
    async processAudioTranscription(transcription) {
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
export function initializeLLMService(isMain) {
    // The singleton is already created, but we can reinitialize it if needed
    Object.assign(LLMService, new LLMServiceImpl(isMain));
}
//# sourceMappingURL=LLMService.js.map