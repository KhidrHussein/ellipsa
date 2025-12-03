import { WebClient } from '@slack/web-api';
import { Action, StepResult } from '../schemas/action.schema.js';
import {
    IActionProvider,
    ExecutionContext,
    ProviderResult,
    ValidationResult,
    ActionCapability,
} from '../core/ActionProvider.interface.js';
import { TokenService } from '../services/oauth/TokenService.js';

/**
 * SlackProvider handles Slack workspace integrations
 * Requires SLACK_BOT_TOKEN environment variable OR user token
 */
export class SlackProvider implements IActionProvider {
    readonly name = 'slack';
    private client: WebClient | null = null;
    private initialized = false;
    private tokenService?: TokenService;

    constructor(tokenService?: TokenService) {
        this.tokenService = tokenService;
    }

    async initialize(): Promise<void> {
        const token = process.env.SLACK_BOT_TOKEN;

        if (token) {
            this.client = new WebClient(token);
            try {
                const auth = await this.client.auth.test();
                console.log(`[SlackProvider] Connected to workspace: ${auth.team} (Bot)`);
                this.initialized = true;
            } catch (error) {
                console.error('[SlackProvider] Failed to authenticate bot:', error instanceof Error ? error.message : 'Unknown error');
            }
        } else {
            console.log('[SlackProvider] No SLACK_BOT_TOKEN found, relying on user tokens');
            this.initialized = true; // Mark as initialized to allow execution with user tokens
        }
    }

    async cleanup(): Promise<void> {
        this.client = null;
        console.log('[SlackProvider] Cleaned up');
    }

    supports(action: Action): boolean {
        return [
            'slack_message',
            'slack_reply',
            'slack_dm',
        ].includes(action.op);
    }

    validate(action: Action): ValidationResult {
        if (!this.supports(action)) {
            return {
                allowed: false,
                reason: `Slack provider does not support action: ${action.op}`,
            };
        }
        return { allowed: true };
    }

    async execute(actions: Action[], context: ExecutionContext): Promise<ProviderResult> {
        const results: StepResult[] = [];

        for (const action of actions) {
            const actionStart = Date.now();

            try {
                const result = await this.executeAction(action, context);
                result.duration_ms = Date.now() - actionStart;
                results.push(result);

                console.log(`[SlackProvider] ${action.op}: ${result.status} (${result.duration_ms}ms)`);

                if (result.status === 'failed' && !context.continueOnError) {
                    break;
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error(`[SlackProvider] Error executing ${action.op}:`, errorMessage);

                results.push({
                    op: action.op,
                    status: 'failed',
                    error: errorMessage,
                    duration_ms: Date.now() - actionStart,
                });

                if (!context.continueOnError) {
                    break;
                }
            }
        }

        return { results };
    }

    private async executeAction(
        action: Action,
        context: ExecutionContext
    ): Promise<StepResult> {
        let client = this.client;

        // Try to get user token
        if (this.tokenService && context.userId) {
            const token = await this.tokenService.getToken(context.userId, 'slack');
            if (token && token.accessToken) {
                client = new WebClient(token.accessToken);
                // console.log(`[SlackProvider] Using user token for ${context.userId}`);
            }
        }

        if (!client) {
            throw new Error('Slack provider not initialized and no user token found');
        }

        switch (action.op) {
            case 'slack_message':
                return await this.sendMessage(client, action);

            case 'slack_reply':
                return await this.replyInThread(client, action);

            case 'slack_dm':
                return await this.sendDirectMessage(client, action);

            default:
                throw new Error(`Unsupported action: ${action.op}`);
        }
    }

    /**
     * Send a message to a Slack channel
     */
    private async sendMessage(client: WebClient, action: Action): Promise<StepResult> {
        if (!('channel' in action.args) || !('text' in action.args)) {
            throw new Error('Missing required arguments: channel, text');
        }

        const channel = action.args.channel as string;
        const text = action.args.text as string;
        const threadTs = 'threadTs' in action.args ? (action.args.threadTs as string) : undefined;

        try {
            const result = await client.chat.postMessage({
                channel,
                text,
                thread_ts: threadTs,
            });

            return {
                op: action.op,
                status: 'success',
                output: {
                    channel: result.channel,
                    ts: result.ts,
                    thread_ts: result.message?.thread_ts,
                },
            };
        } catch (error) {
            throw new Error(`Failed to send Slack message: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Reply in a Slack thread
     */
    private async replyInThread(client: WebClient, action: Action): Promise<StepResult> {
        if (!('channel' in action.args) || !('text' in action.args) || !('threadTs' in action.args)) {
            throw new Error('Missing required arguments: channel, text, threadTs');
        }

        const channel = action.args.channel as string;
        const text = action.args.text as string;
        const threadTs = action.args.threadTs as string;

        try {
            const result = await client.chat.postMessage({
                channel,
                text,
                thread_ts: threadTs,
            });

            return {
                op: action.op,
                status: 'success',
                output: {
                    channel: result.channel,
                    ts: result.ts,
                    thread_ts: result.message?.thread_ts,
                },
            };
        } catch (error) {
            throw new Error(`Failed to reply in thread: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Send a direct message to a user
     */
    private async sendDirectMessage(client: WebClient, action: Action): Promise<StepResult> {
        if (!('userId' in action.args) || !('text' in action.args)) {
            throw new Error('Missing required arguments: userId, text');
        }

        const userId = action.args.userId as string;
        const text = action.args.text as string;

        try {
            // Open a DM channel
            const dmChannel = await client.conversations.open({
                users: userId,
            });

            if (!dmChannel.channel?.id) {
                throw new Error('Failed to open DM channel');
            }

            // Send message
            const result = await client.chat.postMessage({
                channel: dmChannel.channel.id,
                text,
            });

            return {
                op: action.op,
                status: 'success',
                output: {
                    channel: result.channel,
                    ts: result.ts,
                    userId,
                },
            };
        } catch (error) {
            throw new Error(`Failed to send DM: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    getCapabilities(): ActionCapability[] {
        return [
            {
                op: 'slack_message',
                provider: this.name,
                description: 'Send a message to a Slack channel',
                argsSchema: {
                    channel: 'string (channel ID or name)',
                    text: 'string',
                    threadTs: 'string (optional, for threading)',
                },
                requiresApproval: false,
                destructive: false,
                category: 'api',
            },
            {
                op: 'slack_reply',
                provider: this.name,
                description: 'Reply in a Slack thread',
                argsSchema: {
                    channel: 'string',
                    text: 'string',
                    threadTs: 'string (thread timestamp)',
                },
                requiresApproval: false,
                destructive: false,
                category: 'api',
            },
            {
                op: 'slack_dm',
                provider: this.name,
                description: 'Send a direct message to a user',
                argsSchema: {
                    userId: 'string (Slack user ID)',
                    text: 'string',
                },
                requiresApproval: false,
                destructive: false,
                category: 'api',
            },
        ];
    }
}
