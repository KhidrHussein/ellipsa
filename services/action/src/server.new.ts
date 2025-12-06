import express, { Request, Response, NextFunction } from 'express';
import { config } from 'dotenv';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// New action infrastructure
import { ActionExecutor } from './core/ActionExecutor.js';
import { ActionRegistry } from './core/ActionRegistry.js';
import { SafetyValidator } from './core/SafetyValidator.js';
import { ActionHistoryService } from './core/ActionHistoryService.js';
import { BrowserProvider } from './providers/BrowserProvider.js';
import { WindowsProvider } from './providers/WindowsProvider.js';
import { SlackProvider } from './providers/SlackProvider.js';
import { CalendarProvider } from './providers/CalendarProvider.js';
import { NotionProvider } from './providers/NotionProvider.js';
import { GitHubProvider } from './providers/GitHubProvider.js';
import { GmailProvider } from './providers/GmailProvider.js';
import { TokenService } from './services/oauth/TokenService.js';
import { OAuthManager } from './services/oauth/OAuthManager.js';
import { SlackOAuthProvider } from './services/oauth/SlackOAuthProvider.js';
import { NotionOAuthProvider } from './services/oauth/NotionOAuthProvider.js';
import { GitHubOAuthProvider } from './services/oauth/GitHubOAuthProvider.js';
import { validateActionPlan, ActionPlan, ExecutionResult } from './schemas/action.schema.js';
import { loadSafetyConfig, getDevSafetyConfig } from './config/safety.config.js';

// Existing email services
import { GmailEmailService } from './email/services/GmailEmailService.js';
import { EmailProcessingService } from './email/services/EmailProcessingService.js';
import { IEmailMemoryService } from './email/services/IEmailMemoryService.js';
import { PromptService } from '@ellipsa/prompt';
import { createEmailRouter } from './email/routes.js';
import { createEmailAutomation } from './email/EmailAutomationService.js';
import { EmailMetrics } from './email/monitoring/EmailMetrics.js';
import { oauthService } from './email/services/OAuthService.js';
import type { EmailMessage, EmailSummary, DraftResponse, EmailAttachment } from './email/types/email.types.js';
import { Buffer } from 'buffer';
import { MemoryClient } from '@ellipsa/shared';

// Get directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const envPaths = [
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '../../.env')
];

let envLoaded = false;
for (const envPath of envPaths) {
    if (existsSync(envPath)) {
        console.log('[Server] Loading environment from:', envPath);
        config({ path: envPath, override: true });
        envLoaded = true;
        break;
    }
}

if (!envLoaded) {
    console.warn('[Server] No .env file found, using defaults');
    config(); // Try default .env
}

// ============================================================================
// In-Memory Email Service (for backward compatibility)
// ============================================================================

interface ExtendedEmailMessage extends EmailMessage {
    status?: string;
    metadata?: {
        status?: string;
        lastUpdated?: string;
        [key: string]: any;
    };
}

class MemoryServiceClient implements IEmailMemoryService {
    public readonly entities: Map<string, any> = new Map();
    public readonly events: Map<string, any> = new Map();
    public readonly emails: Map<string, ExtendedEmailMessage> = new Map();
    public readonly drafts: Map<string, DraftResponse> = new Map();

    async storeEmail(email: EmailMessage): Promise<void> {
        const processedEmail = {
            ...email,
            metadata: {},
            attachments: email.attachments?.map(attachment => ({
                ...attachment,
                content: attachment.content instanceof Buffer
                    ? new Uint8Array(attachment.content.buffer)
                    : attachment.content
            }))
        } as ExtendedEmailMessage;
        this.emails.set(email.id, processedEmail);
    }

    async storeEmailSummary(summary: EmailSummary): Promise<void> {
        const email = this.emails.get(summary.id);
        if (email) {
            email.metadata = email.metadata || {};
            email.metadata.summary = summary.summary;
            this.emails.set(summary.id, email);
        }
    }

    async getEmail(id: string): Promise<EmailMessage | null> {
        const email = this.emails.get(id);
        if (!email) return null;

        return {
            ...email,
            attachments: email.attachments?.map(attachment => ({
                ...attachment,
                content: attachment.content instanceof Uint8Array
                    ? Buffer.from(attachment.content.buffer)
                    : attachment.content
            }))
        };
    }

    async searchEmails(query: string): Promise<EmailSummary[]> {
        const queryLower = query.toLowerCase();
        return Array.from(this.emails.values())
            .filter(email =>
                email.subject?.toLowerCase().includes(queryLower) ||
                email.text?.toLowerCase().includes(queryLower) ||
                email.html?.toLowerCase().includes(queryLower)
            )
            .map(email => ({
                id: email.id,
                threadId: email.threadId,
                subject: email.subject,
                from: email.from,
                date: email.date,
                summary: email.text?.substring(0, 100) || '',
                actionRequired: false,
                priority: 'medium' as const,
                categories: [],
                metadata: email.metadata,
                isRead: email.isRead || false,
                snippet: email.text?.substring(0, 150) || ''
            }));
    }

    async createDraft(draft: any): Promise<DraftResponse> {
        const id = `draft-${Date.now()}`;
        const draftWithId = { ...draft, id };
        this.drafts.set(id, draftWithId);
        return draftWithId;
    }

    async getConversationHistory(threadId: string): Promise<EmailMessage[]> {
        return Array.from(this.emails.values())
            .filter(email => email.threadId === threadId)
            .sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));
    }

    async updateEmailStatus(emailId: string, status: string): Promise<void> {
        const email = this.emails.get(emailId);
        if (email) {
            email.status = status;
            email.metadata = email.metadata || {};
            email.metadata.status = status;
            email.metadata.lastUpdated = new Date().toISOString();
            this.emails.set(emailId, email);
        }
    }
}

// ============================================================================
// Services Interface
// ============================================================================

interface Services {
    // New action infrastructure
    actionExecutor: ActionExecutor;
    actionRegistry: ActionRegistry;
    safetyValidator: SafetyValidator;
    actionHistoryService: ActionHistoryService;
    tokenService: TokenService;
    oauthManager: OAuthManager;

    // Existing email services
    emailService: GmailEmailService;
    processingService: EmailProcessingService;
    memoryService: IEmailMemoryService;
    emailAutomationService: any;
    metrics: EmailMetrics;
}

let services: Services | null = null;

// ============================================================================
// Initialize Services
// ============================================================================

async function initializeServices(app: express.Express): Promise<Services> {
    console.log('[Server] Initializing services...');

    // Initialize action infrastructure
    const safetyConfig = process.env.NODE_ENV === 'production'
        ? loadSafetyConfig()
        : getDevSafetyConfig();

    console.log(`[Server] Safety mode: ${safetyConfig.allowlist.mode}`);
    console.log(`[Server] Approval for destructive: ${safetyConfig.approvalRequired.destructive}`);

    const safetyValidator = new SafetyValidator(safetyConfig);
    const actionRegistry = new ActionRegistry();

    // Initialize Memory Client
    const memoryClient = new MemoryClient(process.env.MEMORY_SERVICE_URL || 'http://localhost:4001');

    const actionHistoryService = new ActionHistoryService(memoryClient);
    const actionExecutor = new ActionExecutor(actionRegistry, safetyValidator, actionHistoryService);

    // Initialize OAuth infrastructure
    const tokenService = new TokenService();
    const oauthManager = new OAuthManager(tokenService);

    // Register Slack OAuth
    if (process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET) {
        oauthManager.registerProvider(new SlackOAuthProvider(
            process.env.SLACK_CLIENT_ID,
            process.env.SLACK_CLIENT_SECRET,
            process.env.SLACK_REDIRECT_URI || `http://localhost:${process.env.PORT || 4007}/auth/slack/callback`
        ));
    }

    // Register Notion OAuth
    if (process.env.NOTION_CLIENT_ID && process.env.NOTION_CLIENT_SECRET) {
        oauthManager.registerProvider(new NotionOAuthProvider(
            process.env.NOTION_CLIENT_ID,
            process.env.NOTION_CLIENT_SECRET,
            process.env.NOTION_REDIRECT_URI || `http://localhost:${process.env.PORT || 4007}/auth/notion/callback`
        ));
    }

    // Register GitHub OAuth
    if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
        oauthManager.registerProvider(new GitHubOAuthProvider(
            process.env.GITHUB_CLIENT_ID,
            process.env.GITHUB_CLIENT_SECRET,
            process.env.GITHUB_REDIRECT_URI || `http://localhost:${process.env.PORT || 4007}/auth/github/callback`
        ));
    }

    // Register providers
    console.log('[Server] Initializing BrowserProvider...');
    const browserProvider = new BrowserProvider();
    await browserProvider.initialize?.();
    actionRegistry.registerProvider(browserProvider);

    // Register Windows provider (only on Windows)
    if (process.platform === 'win32') {
        const windowsProvider = new WindowsProvider();
        await windowsProvider.initialize?.();
        actionRegistry.registerProvider(windowsProvider);
    } else {
        console.log('[Server] Skipping WindowsProvider (not on Windows)');
    }

    // Register API providers (conditionally based on env vars)
    console.log('[Server] Initializing SlackProvider...');
    const slackProvider = new SlackProvider();
    await slackProvider.initialize?.();
    if (process.env.SLACK_BOT_TOKEN) {
        actionRegistry.registerProvider(slackProvider);
    }

    console.log('[Server] Initializing NotionProvider...');
    const notionProvider = new NotionProvider();
    await notionProvider.initialize?.();
    if (process.env.NOTION_API_KEY) {
        actionRegistry.registerProvider(notionProvider);
    }

    console.log('[Server] Initializing GitHubProvider...');
    const githubProvider = new GitHubProvider();
    await githubProvider.initialize?.();
    if (process.env.GITHUB_TOKEN) {
        actionRegistry.registerProvider(githubProvider);
    }

    // Calendar provider uses OAuth from Gmail
    const calendarProvider = new CalendarProvider();

    // Initialize email services
    const metrics = new EmailMetrics();
    const promptService = new PromptService({
        apiKey: process.env.OPENAI_API_KEY || '',
        defaultModel: 'gpt-4',
    });

    const memoryService: IEmailMemoryService = new MemoryServiceClient();
    const processingService = new EmailProcessingService(promptService, memoryService);

    console.log('[Server] Initializing GmailEmailService...');
    const emailService = GmailEmailService.create(processingService, memoryService);

    // Initialize and register Gmail Provider
    console.log('[Server] Initializing GmailProvider...');
    const gmailProvider = new GmailProvider(emailService);
    actionRegistry.registerProvider(gmailProvider);

    // Initialize and register Calendar Provider (using Gmail's auth)
    // We need to wait for email service to be connected or just pass the client if available
    // For now, we'll try to get the auth client from email service
    try {
        // This might fail if not connected, but CalendarProvider handles lazy init
        // We'll just register it for now
        actionRegistry.registerProvider(calendarProvider);

        // Try to initialize if connected
        if (await emailService.isConnected()) {
            const authClient = await emailService.getAuthClient();
            await calendarProvider.initialize(authClient);
        }
    } catch (error) {
        console.warn('[Server] Failed to initialize Calendar provider with Gmail auth:', error);
    }

    const services: Services = {
        actionExecutor,
        actionRegistry,
        safetyValidator,
        actionHistoryService,
        tokenService,
        oauthManager,
        emailService,
        processingService,
        memoryService,
        emailAutomationService: null,
        metrics,
    };

    // Set up email routes
    const emailRouter = createEmailRouter(services.emailService, services.processingService);
    app.use('/api/emails', emailRouter);
    console.log('[Server] Email routes mounted at /api/emails');

    // OAuth callback route moved to startServer
    console.log('[Server] OAuth callback route configured');

    // OAuth URL endpoint
    app.get('/auth/url', async (req, res) => {
        try {
            const authUrl = await oauthService.getAuthUrl();
            res.json({ authUrl });
        } catch (error) {
            console.error('[Server] Error generating auth URL:', error);
            res.status(500).json({ error: 'Failed to generate authentication URL' });
        }
    });

    console.log('[Server] Services initialized successfully');
    return services;
}

// ============================================================================
// New Action Execution API
// ============================================================================

function setupActionRoutes(app: express.Express, services: Services) {
    /**
     * POST /action/v1/execute
     * Execute an action plan
     */
    app.post('/action/v1/execute', async (req: Request, res: Response) => {
        try {
            console.log('[Action API] Received action execution request');

            // Validate request body
            const actionPlan: ActionPlan = validateActionPlan(req.body);

            console.log(`[Action API] Executing plan with ${actionPlan.plan.length} steps`);

            // Execute the plan
            const result: ExecutionResult = await services.actionExecutor.execute(actionPlan, {
                userId: (req as any).user?.id || 'anonymous',
                timestamp: new Date(),
                headless: true,
                continueOnError: false,
            });

            console.log(`[Action API] Execution ${result.action_id}: ${result.status}`);

            // Return result
            res.json(result);
        } catch (error) {
            console.error('[Action API] Execution error:', error);

            if (error instanceof Error && error.name === 'ZodError') {
                return res.status(400).json({
                    error: 'Invalid action plan',
                    details: error.message,
                });
            }

            res.status(500).json({
                error: 'Action execution failed',
                message: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * GET /action/v1/actions
     * Get list of available actions
     */
    app.get('/action/v1/actions', (req: Request, res: Response) => {
        try {
            const actions = services.actionExecutor.getAvailableActions();
            const stats = services.actionRegistry.getStats();

            res.json({
                actions,
                stats,
            });
        } catch (error) {
            console.error('[Action API] Error getting actions:', error);
            res.status(500).json({ error: 'Failed to get available actions' });
        }
    });

    /**
     * POST /action/v1/validate
     * Validate an action plan without executing
     */
    app.post('/action/v1/validate', async (req: Request, res: Response) => {
        try {
            const actionPlan: ActionPlan = validateActionPlan(req.body);
            const validation = await services.actionExecutor.validatePlan(actionPlan);

            res.json(validation);
        } catch (error) {
            console.error('[Action API] Validation error:', error);

            if (error instanceof Error && error.name === 'ZodError') {
                return res.status(400).json({
                    error: 'Invalid action plan',
                    details: error.message,
                });
            }

            res.status(500).json({
                error: 'Action execution failed',
                message: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * GET /action/v1/history
     * Query action history
     */
    app.get('/action/v1/history', async (req: Request, res: Response) => {
        try {
            const filters = {
                userId: req.query.userId as string,
                status: req.query.status as any,
                actionType: req.query.actionType as string,
                limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
            };

            const history = await services.actionHistoryService.queryHistory(filters);
            res.json(history);
        } catch (error) {
            console.error('[Action API] Error getting history:', error);
            res.status(500).json({ error: 'Failed to get action history' });
        }
    });

    /**
     * GET /action/v1/history/:actionId
     * Get specific action details
     */
    app.get('/action/v1/history/:actionId', async (req: Request, res: Response) => {
        try {
            const action = await services.actionHistoryService.getAction(req.params.actionId);
            if (!action) {
                return res.status(404).json({ error: 'Action not found' });
            }
            res.json(action);
        } catch (error) {
            console.error('[Action API] Error getting action:', error);
            res.status(500).json({ error: 'Failed to get action details' });
        }
    });

    /**
     * DELETE /action/v1/history/:actionId
     * Delete action from history
     */
    app.delete('/action/v1/history/:actionId', async (req: Request, res: Response) => {
        try {
            const success = await services.actionHistoryService.deleteAction(req.params.actionId);
            if (!success) {
                return res.status(404).json({ error: 'Action not found' });
            }
            res.json({ success: true });
        } catch (error) {
            console.error('[Action API] Error deleting action:', error);
            res.status(500).json({ error: 'Failed to delete action' });
        }
    });

    /**
     * GET /action/v1/stats
     * Get action statistics
     */
    app.get('/action/v1/stats', async (req: Request, res: Response) => {
        try {
            const stats = await services.actionHistoryService.getStats(req.query.userId as string);
            res.json(stats);
        } catch (error) {
            console.error('[Action API] Error getting stats:', error);
            res.status(500).json({ error: 'Failed to get action stats' });
        }
    });

    /**
     * POST /telemetry/v1/event
     * Log telemetry event
     */
    app.post('/telemetry/v1/event', (req: Request, res: Response) => {
        const event = req.body;
        console.log('[Telemetry] Received event:', JSON.stringify(event, null, 2));
        // In a real app, we would send this to a telemetry service
        res.status(200).json({ status: 'received' });
    });


    /**
     * GET /auth/status
     * Get connected providers for user
     */
    app.get('/auth/status', async (req: Request, res: Response) => {
        try {
            const userId = req.query.userId as string;
            if (!userId) {
                return res.status(400).json({ error: 'userId required' });
            }
            const providers = await services.tokenService.getConnectedProviders(userId);
            res.json({ connected: providers });
        } catch (error) {
            console.error('[Auth API] Error getting status:', error);
            res.status(500).json({ error: 'Failed to get auth status' });
        }
    });

    /**
     * GET /auth/:provider/url
     * Get auth URL for provider
     */
    app.get('/auth/:provider/url', (req: Request, res: Response) => {
        try {
            const provider = req.params.provider;
            const userId = req.query.userId as string;
            if (!userId) {
                return res.status(400).json({ error: 'userId required' });
            }

            const url = services.oauthManager.getAuthUrl(provider, userId);
            res.json({ url });
        } catch (error) {
            console.error(`[Auth API] Error getting URL for ${req.params.provider}:`, error);
            res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to get auth URL' });
        }
    });

    /**
     * GET /auth/:provider/callback
     * Handle OAuth callback
     */
    app.get('/auth/:provider/callback', async (req: Request, res: Response) => {
        try {
            const provider = req.params.provider;
            const code = req.query.code as string;
            const state = req.query.state as string;

            if (!code || !state) {
                return res.status(400).send('Missing code or state');
            }

            const { userId } = await services.oauthManager.handleCallback(provider, code, state);

            res.send(`
                <html>
                    <body>
                        <h1>Successfully connected to ${provider}!</h1>
                        <p>You can close this window now.</p>
                        <script>
                            window.opener?.postMessage({ type: 'oauth_success', provider: '${provider}', userId: '${userId}' }, '*');
                            setTimeout(() => window.close(), 2000);
                        </script>
                    </body>
                </html>
            `);
        } catch (error) {
            console.error(`[Auth API] Error in ${req.params.provider} callback:`, error);
            res.status(500).send(`Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });

    console.log('[Server] Action routes mounted at /action/v1/*');
}

// ============================================================================
// Start Server
// ============================================================================

async function startServer() {
    const app = express();

    // Middleware
    app.use(express.json({ limit: '10mb' }));

    // CORS for development
    app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        if (req.method === 'OPTIONS') {
            return res.sendStatus(200);
        }
        next();
    });

    try {
        // Initialize all services
        services = await initializeServices(app);

        // Setup new action routes
        setupActionRoutes(app, services);

        // OAuth callback route
        app.get('/oauth2callback', async (req, res) => {
            console.log('[Server] Received OAuth callback request');
            const code = req.query.code as string;

            if (!code) {
                console.error('[Server] No authorization code in callback');
                return res.status(400).send('Authorization code is required');
            }

            try {
                const oauth2Client = oauthService.getClient();
                const { tokens } = await oauth2Client.getToken(code);
                oauth2Client.setCredentials(tokens);

                if (services?.emailService) {
                    await services.emailService.connect();

                    // Initialize automation if not already running
                    if (!services.emailAutomationService) {
                        const emailAutomationService = await createEmailAutomation({
                            emailService: services.emailService,
                            promptService: new PromptService({ apiKey: process.env.OPENAI_API_KEY || '', defaultModel: 'gpt-4' }),
                            memoryService: services.memoryService as any,
                            metrics: services.metrics,
                            checkInterval: 5 * 60 * 1000,
                            maxEmailsPerCheck: 10,
                        });
                        emailAutomationService.start();
                        services.emailAutomationService = emailAutomationService;
                    }
                }

                console.log('[Server] Gmail authenticated and email automation started');
                return res.send('Successfully authenticated! You can close this window.');
            } catch (error) {
                console.error('[Server] OAuth callback error:', error);
                return res.status(500).send('Authentication failed. Please try again.');
            }
        });

        // Health check endpoint
        app.get('/health', (req, res) => {
            const oauth2Client = oauthService.getClient();
            const status = {
                status: 'ok',
                timestamp: new Date().toISOString(),
                services: {
                    action: 'ready',
                    gmailConnected: oauth2Client.credentials.access_token !== undefined,
                },
                capabilities: {
                    totalProviders: services?.actionRegistry.getStats().totalProviders || 0,
                    totalActions: services?.actionRegistry.getStats().totalActions || 0,
                    byCategory: services?.actionRegistry.getStats().byCategory || {},
                },
            };
            res.json(status);
        });

        // Error handling middleware
        app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
            console.error('[Server] Unhandled error:', err);
            res.status(500).json({
                error: 'Internal server error',
                message: process.env.NODE_ENV === 'development' ? err.message : undefined,
            });
        });

        // Start listening
        const PORT = 4004; // Force port 4004 to match Google OAuth redirect URI
        app.listen(PORT, () => {
            console.log('========================================');
            console.log(`🚀 Action Service running on port ${PORT}`);
            console.log('========================================');
            console.log(`Health check: http://localhost:${PORT}/health`);
            console.log(`OAuth URL: http://localhost:${PORT}/auth/url`);
            console.log(`Action API: http://localhost:${PORT}/action/v1/execute`);
            console.log(`Available actions: http://localhost:${PORT}/action/v1/actions`);
            console.log('========================================');
        });

        // Handle shutdown gracefully
        process.on('SIGINT', async () => {
            console.log('\n[Server] Shutting down gracefully...');
            if (services) {
                const browserProvider = services.actionRegistry.getProvider('browser');
                if (browserProvider) {
                    await browserProvider.cleanup?.();
                }
            }
            process.exit(0);
        });

        return services;
    } catch (error) {
        console.error('[Server] Failed to initialize:', error);
        process.exit(1);
    }
}

// Only start if run directly
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
    startServer().catch(error => {
        console.error('[Server] Startup failed:', error);
        process.exit(1);
    });
}

export { startServer, services };
