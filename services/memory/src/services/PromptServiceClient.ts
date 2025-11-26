import { IPromptService, ExtractionResult } from './EventProcessingService';
import { logger } from '../utils/logger';

export class PromptServiceClient implements IPromptService {
    private baseUrl: string;
    private defaultModel: string;

    constructor(baseUrl: string, defaultModel: string = 'gpt-3.5-turbo') {
        this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
        this.defaultModel = defaultModel;
    }

    async extractStructuredData(content: string): Promise<ExtractionResult> {
        const prompt = `
      You are the "Ellipsa Edge Agent", an intelligent assistant that observes the user's screen and provides helpful, context-aware feedback.
      
      Analyze the following content captured from the user's screen and extract structured data.
      Focus on providing actionable advice, relevant context, and helpful suggestions based on what the user is doing.
      
      Content:
      ${content}
      
      Return a JSON object with the following structure:
      {
        "summary": "A helpful, conversational assessment of what the user is working on, including specific suggestions and recommendations. Write in the second person (e.g., 'You are working on...')",
        "confidence": 0.0 to 1.0,
        "sentiment": "positive", "neutral", or "negative",
        "topics": ["topic1", "topic2"],
        "entities": [
          { "type": "person|organization|location|event|document|concept|task|action_item|file|service|project|technology|other", "value": "Entity Name", "label": "Label", "context": "Context" }
        ],
        "action_items": [
          { "text": "Action item description", "priority": "low|medium|high", "due_date": "ISO date string (optional)" }
        ],
        "suggestions": [
          "Suggestion 1",
          "Suggestion 2"
        ]
      }
    `;

        try {
            const response = await this.callCompletion({
                messages: [
                    { role: 'system', content: 'You are the Ellipsa Edge Agent, a helpful AI assistant that observes user activity and provides intelligent, actionable feedback. You must always respond with valid JSON.' },
                    { role: 'user', content: prompt }
                ],
                response_format: { type: 'json_object' }
            });

            const result = JSON.parse(response);
            return {
                summary: result.summary || content.substring(0, 100),
                confidence: result.confidence,
                sentiment: result.sentiment,
                topics: result.topics || [],
                entities: result.entities || [],
                action_items: result.action_items || [],
                suggestions: result.suggestions || []
            };
        } catch (error) {
            logger.error('Error extracting structured data:', error);
            // Fallback to basic extraction
            return {
                summary: content.substring(0, 100),
                entities: [],
                action_items: [],
                suggestions: []
            };
        }
    }

    async generate(prompt: string, options?: any): Promise<string> {
        try {
            return await this.callCompletion({
                messages: [
                    { role: 'user', content: prompt }
                ],
                ...options
            });
        } catch (error) {
            logger.error('Error generating response:', error);
            return `Error generating response: ${error instanceof Error ? error.message : String(error)}`;
        }
    }

    private async callCompletion(payload: any): Promise<string> {
        const url = `${this.baseUrl}/prompt/v1/complete`;

        const body = {
            model: this.defaultModel,
            ...payload
        };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Prompt Service returned ${response.status}: ${errorText}`);
            }

            const data = await response.json();

            if (!data.choices || !data.choices[0] || !data.choices[0].message) {
                throw new Error('Invalid response format from Prompt Service');
            }

            return data.choices[0].message.content;
        } catch (error) {
            logger.error(`Failed to call Prompt Service at ${url}:`, error);
            throw error;
        }
    }
}
