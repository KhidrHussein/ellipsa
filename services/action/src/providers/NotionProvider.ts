import { Client } from '@notionhq/client';
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
 * NotionProvider handles Notion workspace integrations
 * Requires NOTION_API_KEY environment variable OR user token
 */
export class NotionProvider implements IActionProvider {
    readonly name = 'notion';
    private client: Client | null = null;
    private initialized = false;
    private tokenService?: TokenService;

    constructor(tokenService?: TokenService) {
        this.tokenService = tokenService;
    }

    async initialize(): Promise<void> {
        const apiKey = process.env.NOTION_API_KEY;

        if (apiKey) {
            this.client = new Client({ auth: apiKey });
            this.initialized = true;
            console.log('[NotionProvider] Initialized with API key');
        } else {
            console.log('[NotionProvider] No NOTION_API_KEY found, relying on user tokens');
            this.initialized = true;
        }
    }

    async cleanup(): Promise<void> {
        this.client = null;
        console.log('[NotionProvider] Cleaned up');
    }

    supports(action: Action): boolean {
        return [
            'notion_create_page',
            'notion_update_page',
            'notion_query_database',
            'notion_create_database_entry',
        ].includes(action.op);
    }

    validate(action: Action): ValidationResult {
        if (!this.supports(action)) {
            return {
                allowed: false,
                reason: `Notion provider does not support action: ${action.op}`,
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

                console.log(`[NotionProvider] ${action.op}: ${result.status} (${result.duration_ms}ms)`);

                if (result.status === 'failed' && !context.continueOnError) {
                    break;
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error(`[NotionProvider] Error executing ${action.op}:`, errorMessage);

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
            const token = await this.tokenService.getToken(context.userId, 'notion');
            if (token && token.accessToken) {
                client = new Client({ auth: token.accessToken });
            }
        }

        if (!client) {
            throw new Error('Notion client not initialized and no user token found');
        }

        switch (action.op) {
            case 'notion_create_page':
                return await this.createPage(client, action);

            case 'notion_update_page':
                return await this.updatePage(client, action);

            case 'notion_query_database':
                return await this.queryDatabase(client, action);

            case 'notion_create_database_entry':
                return await this.createDatabaseEntry(client, action);

            default:
                throw new Error(`Unsupported action: ${action.op}`);
        }
    }

    /**
     * Create a new page in Notion
     */
    private async createPage(client: Client, action: Action): Promise<StepResult> {
        if (!('parentId' in action.args) || !('title' in action.args)) {
            throw new Error('Missing required arguments: parentId, title');
        }

        const parentId = action.args.parentId as string;
        const title = action.args.title as string;
        const content = 'content' in action.args ? (action.args.content as any[]) : [];

        try {
            const response = await client.pages.create({
                parent: { page_id: parentId },
                properties: {
                    title: {
                        title: [{ text: { content: title } }],
                    },
                },
                children: content,
            });

            return {
                op: action.op,
                status: 'success',
                output: {
                    pageId: response.id,
                    url: (response as any).url,
                },
            };
        } catch (error) {
            throw new Error(`Failed to create Notion page: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Update a Notion page
     */
    private async updatePage(client: Client, action: Action): Promise<StepResult> {
        if (!('pageId' in action.args) || !('properties' in action.args)) {
            throw new Error('Missing required arguments: pageId, properties');
        }

        const pageId = action.args.pageId as string;
        const properties = action.args.properties as any;

        try {
            const response = await client.pages.update({
                page_id: pageId,
                properties,
            });

            return {
                op: action.op,
                status: 'success',
                output: {
                    pageId: response.id,
                },
            };
        } catch (error) {
            throw new Error(`Failed to update page: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Query a Notion database (using search API as databases.query may not be available)
     */
    private async queryDatabase(client: Client, action: Action): Promise<StepResult> {
        if (!('databaseId' in action.args)) {
            throw new Error('Missing required argument: databaseId');
        }

        const databaseId = action.args.databaseId as string;

        try {
            // Use search API to find pages in database
            const response = await client.search({
                filter: {
                    property: 'object',
                    value: 'page',
                },
            });

            // Filter results by database
            const pages = response.results.filter((page: any) =>
                page.parent?.type === 'database_id' &&
                page.parent?.database_id === databaseId
            );

            return {
                op: action.op,
                status: 'success',
                output: {
                    count: pages.length,
                    results: pages.map((page: any) => ({
                        id: page.id,
                        url: page.url,
                        properties: page.properties,
                    })),
                },
            };
        } catch (error) {
            throw new Error(`Failed to query database: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Create a database entry
     */
    private async createDatabaseEntry(client: Client, action: Action): Promise<StepResult> {
        if (!('databaseId' in action.args) || !('properties' in action.args)) {
            throw new Error('Missing required arguments: databaseId, properties');
        }

        const databaseId = action.args.databaseId as string;
        const properties = action.args.properties as any;

        try {
            const response = await client.pages.create({
                parent: { database_id: databaseId },
                properties,
            });

            return {
                op: action.op,
                status: 'success',
                output: {
                    pageId: response.id,
                    url: (response as any).url,
                },
            };
        } catch (error) {
            throw new Error(`Failed to create database entry: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    getCapabilities(): ActionCapability[] {
        return [
            {
                op: 'notion_create_page',
                provider: this.name,
                description: 'Create a new Notion page',
                argsSchema: {
                    parentId: 'string (parent page ID)',
                    title: 'string',
                    content: 'array (optional, page blocks)',
                },
                requiresApproval: false,
                destructive: false,
                category: 'api',
            },
            {
                op: 'notion_update_page',
                provider: this.name,
                description: 'Update a Notion page',
                argsSchema: {
                    pageId: 'string',
                    properties: 'object (properties to update)',
                },
                requiresApproval: false,
                destructive: false,
                category: 'api',
            },
            {
                op: 'notion_query_database',
                provider: this.name,
                description: 'Query a Notion database',
                argsSchema: {
                    databaseId: 'string',
                    filter: 'object (optional, query filter)',
                },
                requiresApproval: false,
                destructive: false,
                category: 'api',
            },
            {
                op: 'notion_create_database_entry',
                provider: this.name,
                description: 'Create a new database entry',
                argsSchema: {
                    databaseId: 'string',
                    properties: 'object (entry properties)',
                },
                requiresApproval: false,
                destructive: false,
                category: 'api',
            },
        ];
    }
}
