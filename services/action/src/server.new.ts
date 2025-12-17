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
import { GoogleOAuthProvider } from './services/oauth/GoogleOAuthProvider.js';
import { validateActionPlan, ActionPlan, ExecutionResult } from './schemas/action.schema.js';
import { loadSafetyConfig, getDevSafetyConfig } from './config/safety.config.js';

// Existing email services
import { GmailEmailService } from './email/services/GmailEmailService.js';
import { EmailProcessingService } from './email/services/EmailProcessingService.js';
import { EmailLLMService } from './email/services/EmailLLMService.js';
import { IEmailMemoryService } from './email/services/IEmailMemoryService.js';
import { PromptService } from '@ellipsa/prompt';
import { createEmailRouter } from './email/routes.js';
import { createEmailAutomation } from './email/EmailAutomationService.js';
import { EmailMetrics } from './email/monitoring/EmailMetrics.js';
import { oauthService } from './email/services/OAuthService.js';
import type { EmailMessage, EmailSummary, DraftResponse, EmailAttachment } from './email/types/email.types.js';
import { Buffer } from 'buffer';
import { MemoryClient, PromptClient } from '@ellipsa/shared';
import { RoutineService } from './routines/RoutineService.js';

// Get directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
// Load environment variables
const envPaths = [
    path.resolve(__dirname, '../../../.env'), // Load root .env first
    path.resolve(__dirname, '../.env')        // Load local .env second (overrides root)
];

let envLoaded = false;
for (const envPath of envPaths) {
    if (existsSync(envPath)) {
        console.log('[Server] Loading environment from:', envPath);
        config({ path: envPath, override: true });
        envLoaded = true;
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

    async deleteDraft(id: string): Promise<void> {
        this.drafts.delete(id);
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
    routineService: RoutineService;
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
    const promptClient = new PromptClient(process.env.PROMPT_SERVICE_URL || 'http://localhost:4003');

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
            process.env.SLACK_REDIRECT_URI || `http://localhost:${process.env.PORT || 4004}/auth/slack/callback`
        ));
    }

    // Register Notion OAuth
    if (process.env.NOTION_CLIENT_ID && process.env.NOTION_CLIENT_SECRET) {
        oauthManager.registerProvider(new NotionOAuthProvider(
            process.env.NOTION_CLIENT_ID,
            process.env.NOTION_CLIENT_SECRET,
            process.env.NOTION_REDIRECT_URI || `http://localhost:${process.env.PORT || 4004}/auth/notion/callback`
        ));
    }



    // Register GitHub OAuth
    if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
        oauthManager.registerProvider(new GitHubOAuthProvider(
            process.env.GITHUB_CLIENT_ID,
            process.env.GITHUB_CLIENT_SECRET,
            process.env.GITHUB_REDIRECT_URI || `http://localhost:${process.env.PORT || 4004}/auth/github/callback`
        ));
    }

    // Register Google OAuth
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
        oauthManager.registerProvider(new GoogleOAuthProvider(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI || `http://localhost:${process.env.PORT || 4004}/auth/google/callback`
        ));
    }

    // Register providers
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
    const slackProvider = new SlackProvider(tokenService);
    await slackProvider.initialize?.();
    // Register unconditionally to support user OAuth tokens even if no global bot token
    actionRegistry.registerProvider(slackProvider);

    console.log('[Server] Initializing NotionProvider...');
    const notionProvider = new NotionProvider(tokenService); // Pass tokenService
    await notionProvider.initialize?.();
    // Register unconditionally to support user OAuth tokens even if no global API key
    actionRegistry.registerProvider(notionProvider);

    console.log('[Server] Initializing GitHubProvider...');
    const githubProvider = new GitHubProvider(tokenService); // Pass tokenService
    await githubProvider.initialize?.();
    // Register unconditionally to support user OAuth tokens even if no global API key
    actionRegistry.registerProvider(githubProvider);

    // Calendar provider uses OAuth from Gmail/TokenService
    // Pass TokenService for independent auth
    const calendarProvider = new CalendarProvider(tokenService);

    // Initialize email services
    const metrics = new EmailMetrics();
    const promptService = new PromptService({
        apiKey: process.env.OPENAI_API_KEY || '',
        defaultModel: 'gpt-4',
    });

    const memoryService: IEmailMemoryService = new MemoryServiceClient();

    // Initialize EmailLLMService
    const emailLLMService = new EmailLLMService(process.env.OPENAI_API_KEY || '');
    const processingService = new EmailProcessingService(promptService, memoryService, emailLLMService);

    console.log('[Server] Initializing GmailEmailService...');
    // Pass tokenService to GmailEmailService
    const emailService = GmailEmailService.create(processingService, memoryService, tokenService);

    // Initialize and register Gmail Provider
    console.log('[Server] Initializing GmailProvider...');
    const gmailProvider = new GmailProvider(emailService);
    actionRegistry.registerProvider(gmailProvider);

    // Register Calendar Provider
    // It will auto-initialize using TokenService when needed
    actionRegistry.registerProvider(calendarProvider);

    // Attempt early initialization if possible (optional)
    try {
        await calendarProvider.initialize();
    } catch (e) {
        // Expected if not authenticated yet
        console.log('[Server] Calendar provider waiting for authentication');
    }

    const routineService = new RoutineService(emailService, calendarProvider, memoryService, actionExecutor, memoryClient, promptClient, tokenService);

    // Start routines
    routineService.start();

    // Initialize & Start Email Automation
    console.log('[Server] Initializing EmailAutomationService...');
    const emailAutomationService = await createEmailAutomation({
        emailService,
        promptService,
        memoryService: memoryService as any, // Cast to any to satisfy type if needed (MemoryServiceClient vs EmailMemoryService)
        metrics,
        checkInterval: 10 * 60 * 1000, // 10 minutes
        maxEmailsPerCheck: 10,
        autoRespond: false // Set to true to enable auto-response
    });

    // Start the automation service immediately
    // It will handle connection internally
    emailAutomationService.start();

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
        emailAutomationService,
        metrics,
        routineService
    };

    // Set up email routes
    const emailRouter = createEmailRouter(services.emailService, services.processingService);
    app.use('/api/emails', emailRouter);
    console.log('[Server] Email routes mounted at /api/emails');

    // OAuth callback route moved to startServer
    console.log('[Server] OAuth callback route configured');

    // OAuth URL endpoint - LEGACY (Redirect to new flow)
    app.get('/auth/url', async (req, res) => {
        try {
            // Redirect to the new standard endpoint logic for google
            const url = services.oauthManager.getAuthUrl('google', 'user');
            res.json({ authUrl: url });
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
                userId: (req as any).user?.id || 'user', // Default to 'user' for local single-user mode
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

            // Check legacy Gmail service status
            if (services.emailService && await services.emailService.isConnected()) {
                if (!providers.includes('google')) {
                    providers.push('google');
                }
            }

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

    app.get('/auth/:provider/callback', async (req: Request, res: Response) => {
        try {
            const { provider } = req.params;
            const { code, state } = req.query;

            if (!code || !state) {
                return res.status(400).send('Missing code or state');
            }

            console.log(`[Auth API] Handling callback for ${provider}`);
            let { userId, token } = await services.oauthManager.handleCallback(provider, code as string, state as string);

            // SECURITY: If this is Google Login, verify identity and use email as userId
            if (provider === 'google') {
                const googleProvider = services.oauthManager.getProvider('google') as GoogleOAuthProvider;
                if (googleProvider && googleProvider.getUserProfile) {
                    try {
                        const profile = await googleProvider.getUserProfile(token);
                        console.log('[Auth API] Google Profile:', profile.email);

                        // Use sanitized email as the canonical User ID
                        const realUserId = profile.email.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();

                        // Delete the temporary token entry if the IDs differ
                        if (realUserId !== userId) {
                            console.log(`[Auth API] Upgrading temporary ID ${userId} to ${realUserId}`);
                            // We don't necessarily delete the old one to avoid race conditions, but we save the new one.
                            await services.tokenService.setToken(realUserId, provider, token);
                            userId = realUserId;
                        }
                    } catch (err) {
                        console.error('[Auth API] Failed to fetch user profile:', err);
                    }
                }
            }

            // Send HTML that attempts to open the deep link and provides a button
            const deepLink = `ellipsa://auth-success?userId=${userId}&provider=${provider}`;

            res.send(`
                <html>
                    <body style="font-family: sans-serif; background: #000; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh;">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                        </svg>
                        <h1>Authentication Successful!</h1>
                        <p style="color: #999; margin-bottom: 24px;">Please return to the Ellipsa app.</p>
                        <a href="${deepLink}" style="padding: 12px 24px; background: #fff; color: #000; text-decoration: none; border-radius: 6px; font-weight: bold;">Open Ellipsa</a>
                        <script>
                            setTimeout(function() {
                                window.location.href = "${deepLink}";
                            }, 500);
                        </script>
                    </body>
                </html>
            `);
        } catch (error) {
            console.error(`[Auth API] Callback error for ${req.params.provider}:`, error);
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

        // OAuth callback route - Legacy URI support for Google
        // Since GOOGLE_REDIRECT_URI is often set to /oauth2callback in .env and Cloud Console,
        // we handle the google provider callback here to avoid breaking existing configurations.
        app.get('/oauth2callback', async (req, res) => {
            try {
                const code = req.query.code as string;
                const state = req.query.state as string;

                if (!code) {
                    return res.status(400).send('Missing code');
                }

                if (!services) {
                    return res.status(500).send('Services not initialized');
                }

                // If no state is provided (legacy legacy flow), we can't easily use OAuthManager which requires state for userId
                // But the new flow initiated via getAuthUrl DOES provide state.
                if (state) {
                    const { userId } = await services.oauthManager.handleCallback('google', code, state);

                    const deepLink = `ellipsa://auth-success?userId=${userId}&provider=google`;
                    res.send(`
                        <html>
                            <body style="font-family: sans-serif; background: #000; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh;">
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                                </svg>
                                <h1>Authentication Successful!</h1>
                                <p style="color: #999; margin-bottom: 24px;">Please return to the Ellipsa app.</p>
                                <a href="${deepLink}" style="padding: 12px 24px; background: #fff; color: #000; text-decoration: none; border-radius: 6px; font-weight: bold;">Open Ellipsa</a>
                                <script>
                                    setTimeout(function() {
                                        window.location.href = "${deepLink}";
                                    }, 500);
                                </script>
                            </body>
                        </html>
                    `);
                } else {
                    res.status(400).send('State parameter missing. Please try connecting again from the application settings.');
                }
            } catch (error) {
                console.error('[Server] Error in legacy callback:', error);
                res.status(500).send(`Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
        try {
            const fs = require('fs');
            fs.writeFileSync(path.join(__dirname, '../startup_error.log'), `Startup failed: ${error.stack || error}\n`);
        } catch (e) {
            console.error('Failed to write error log:', e);
        }
        process.exit(1);
    });
}

export { startServer, services };
