import axios from 'axios';
import { MemoryService } from './MemoryService.js';

interface GoalAlignmentConfig {
    promptServiceUrl: string;
    memoryServiceUrl: string;
    realtimeServiceUrl: string; // The backend or proxy URL for WebSocket emissions if applicable, or we use a direct mechanism
}

export class GoalAlignmentService {
    private promptServiceUrl: string;
    private memoryService: MemoryService;
    private lastFeedbackTime: number = 0;
    private feedbackCooldownMs: number = 60 * 60 * 1000; // 1 hour

    constructor(config: GoalAlignmentConfig) {
        this.promptServiceUrl = config.promptServiceUrl;
        this.memoryService = new MemoryService(config.memoryServiceUrl);
    }

    async checkAlignment(windowTitle: string, userFocus?: string) {
        // If no focus is set, or we're in cooldown, skip
        if (!userFocus) {
            console.log('[GoalAlignment] No focus set, skipping check.');
            return;
        }

        const now = Date.now();
        if (now - this.lastFeedbackTime < this.feedbackCooldownMs) {
            console.log('[GoalAlignment] In cooldown, skipping check.');
            return;
        }

        console.log(`[GoalAlignment] Checking alignment: "${windowTitle}" vs Focus: "${userFocus}"`);

        try {
            // Call LLM to check alignment
            const response = await axios.post(`${this.promptServiceUrl}/prompt/v1/complete`, {
                messages: [
                    {
                        role: 'system',
                        content: `You are a productivity assistant.
                        Input: A user's active window title and their stated primary focus.
                        Output: JSON with "aligned" (boolean), "feedback" (string, short friendly message), "type" ("reinforcement" | "nudge").
                        
                        Logic:
                        - Aligned: The window title suggests they are working on the focus.
                        - Misaligned: The window title suggests a distraction (social media, games, unrelated sites) AND is unrelated to the focus.
                        
                        If unclear or neutral (e.g., file explorer, system settings), assume aligned or silent (skip feedback).
                        Output INVALID if no feedback is needed.`
                    },
                    {
                        role: 'user',
                        content: JSON.stringify({ window: windowTitle, focus: userFocus })
                    }
                ],
                response_format: { type: 'json_object' }
            });

            const result = JSON.parse(response.data.choices[0].message.content);

            if (result.feedback && result.feedback !== 'INVALID') {
                await this.handleFeedback(result, windowTitle, userFocus);
                this.lastFeedbackTime = now;
            } else {
                console.log('[GoalAlignment] No feedback generated.');
            }

        } catch (error) {
            console.error('[GoalAlignment] Error checking alignment:', error);
        }
    }

    private async handleFeedback(result: any, windowTitle: string, focus: string) {
        console.log(`[GoalAlignment] Feedback: ${result.type.toUpperCase()} - ${result.feedback}`);

        // 1. Store in Memory
        await this.memoryService.storeEvent({
            type: 'goal_feedback',
            title: `Goal Feedback: ${result.type}`,
            content: result.feedback,
            start_time: new Date().toISOString(),
            participants: [{ name: 'Ellipsa', entity_id: 'ent_ellipsa', metadata: { role: 'assistant' } }],
            metadata: {
                alignment: result.aligned,
                window: windowTitle,
                focus: focus,
                type: result.type
            }
        });

        // 2. Send Realtime Notification (Nudge)
        // Since Processor -> Edge Agent communication for realtime isn't directly wired via a socket here (Agent connects to specific WS port), 
        // we might broadcast this via a webhook or if the processor runs the WS server, emit directly.
        // Assuming the Processor receives the ingest request, it can return this as a response payload or we rely on the memory/timeline to show it.
        // However, the plan said "Emit a goal_feedback event via RealtimeService". 
        // If this service runs in the Processor, and the WS server is in the Edge Agent or separate, we need a way to push.

        // For this MVP, we will rely on the Edge Agent polling the timeline or using the 'ingest' response if immediate feedback is needed.
        // BUT, better yet: The Edge Agent sends the window ingest. The response can contain the immediate feedback!

        // We will return the feedback to the caller (server.ts) to send back in the ingest response.
    }
}
