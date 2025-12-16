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
        console.log(`[NotionProvider] Constructed with TokenService: ${!!tokenService}`);
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
        console.log('[NotionProvider] executeAction called');
        console.log(`[NotionProvider] Has TokenService: ${!!this.tokenService}`);
        console.log(`[NotionProvider] Context userId: ${context.userId}`);

        let client = this.client;

        // Try to get user token
        if (this.tokenService && context.userId) {
            console.log(`[NotionProvider] Attempting to get token for user: ${context.userId}`);
            const token = await this.tokenService.getToken(context.userId, 'notion');
            console.log(`[NotionProvider] Token found: ${!!token}`);
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
        if (!('title' in action.args)) {
            throw new Error('Missing required argument: title');
        }

        // Type assertion needed because 'title' is shared with other actions (like GitHub issues)
        // causing TS to fail to narrow down to NotionCreatePageAction
        const args = action.args as any;

        let parentId = args.parentId as string | undefined;
        const title = args.title as string;
        let content = 'content' in args ? args.content : [];

        // Normalize content: if string, convert to paragraph block
        if (typeof content === 'string') {
            content = [
                {
                    object: 'block',
                    type: 'paragraph',
                    paragraph: {
                        rich_text: [{ type: 'text', text: { content: content } }],
                    },
                },
            ];
        }

        // Resolve parent ID (handle names vs UUIDs)
        if (parentId) {
            const originalId = parentId;
            parentId = await this.resolveParentId(client, parentId);

            if (!parentId) {
                throw new Error(`Could not find a parent page or database named '${originalId}'. Please ask the user to create it first, or provide the exact name of an existing page.`);
            }
        } else {
            throw new Error('Missing required argument: parentId. Please provide a valid Page ID, Database ID, or the specific name of a parent page.');
        }

        try {
            const response = await client.pages.create({
                parent: { page_id: parentId },
                properties: {
                    title: {
                        title: [{ text: { content: title } }],
                    },
                },
                children: content as any[],
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
     * Helper to resolve a parentId string to a valid UUID.
     * If it's already a UUID, returns it.
     * If it's a name, searches for it.
     */
    private async resolveParentId(client: Client, idOrName: string): Promise<string> {
        // Simple UUID regex check
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(idOrName)) {
            return idOrName;
        }

        console.log(`[NotionProvider] '${idOrName}' is not a UUID. Searching for page/database...`);

        try {
            const response = await client.search({
                query: idOrName,
                page_size: 1,
            });

            if (response.results.length > 0) {
                const match = response.results[0];
                console.log(`[NotionProvider] Found match for '${idOrName}': ${match.id} (${(match as any).object})`);
                return match.id;
            }

            console.log(`[NotionProvider] No match found for '${idOrName}'. Fetching available pages...`);

            // Fallback: Fetch available pages to give a helpful error
            const listResponse = await client.search({
                filter: { property: 'object', value: 'page' },
                page_size: 5,
                sort: { direction: 'descending', timestamp: 'last_edited_time' }
            });

            const availablePages = listResponse.results
                .map((p: any) => {
                    const title = p.properties?.title?.title?.[0]?.plain_text ||
                        p.properties?.Name?.title?.[0]?.plain_text ||
                        'Untitled';
                    return `"${title}"`;
                })
                .join(', ');

            throw new Error(`Could not find a parent page named '${idOrName}'. Available pages you can add to: ${availablePages || 'None found (check integration permissions)'}.`);

        } catch (error) {
            if (error instanceof Error && error.message.includes('Could not find')) {
                throw error;
            }
            console.error(`[NotionProvider] Search failed:`, error);
            throw new Error(`Failed to resolve parent '${idOrName}': ${error instanceof Error ? error.message : 'Unknown error'}`);
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

        let databaseId = action.args.databaseId as string;

        // Resolve database name to ID
        databaseId = await this.resolveParentId(client, databaseId);

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

        let databaseId = action.args.databaseId as string;
        const properties = action.args.properties as any;

        // Resolve database name to ID
        databaseId = await this.resolveParentId(client, databaseId);

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
                    parentId: 'string (Required: ID of the parent page or database)',
                    title: 'string (Title of the new page)',
                    content: 'array (Optional: content blocks)',
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
                    pageId: 'string (ID of the page to update)',
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
                    databaseId: 'string (ID of the database to query)',
                    filter: 'object (Optional: Notion filter object)',
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
                    databaseId: 'string (ID of the database)',
                    properties: 'object (Entry properties)',
                },
                requiresApproval: false,
                destructive: false,
                category: 'api',
            },
        ];
    }
}
