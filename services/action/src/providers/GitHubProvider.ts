import { Octokit } from '@octokit/rest';
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
 * GitHubProvider handles GitHub repository integrations
 * Requires GITHUB_TOKEN environment variable OR user token
 */
export class GitHubProvider implements IActionProvider {
    readonly name = 'github';
    private octokit: Octokit | null = null;
    private initialized = false;
    private tokenService?: TokenService;

    constructor(tokenService?: TokenService) {
        this.tokenService = tokenService;
    }

    async initialize(): Promise<void> {
        const token = process.env.GITHUB_TOKEN;

        if (token) {
            this.octokit = new Octokit({ auth: token });
            this.initialized = true;
            console.log('[GitHubProvider] Initialized with token');
        } else {
            console.log('[GitHubProvider] No GITHUB_TOKEN found, relying on user tokens');
            this.initialized = true;
        }
    }

    async cleanup(): Promise<void> {
        this.octokit = null;
        console.log('[GitHubProvider] Cleaned up');
    }

    supports(action: Action): boolean {
        return [
            'github_create_issue',
            'github_create_pr',
            'github_comment_issue',
            'github_close_issue',
        ].includes(action.op);
    }

    validate(action: Action): ValidationResult {
        if (!this.supports(action)) {
            return {
                allowed: false,
                reason: `GitHub provider does not support action: ${action.op}`,
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

                console.log(`[GitHubProvider] ${action.op}: ${result.status} (${result.duration_ms}ms)`);

                if (result.status === 'failed' && !context.continueOnError) {
                    break;
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error(`[GitHubProvider] Error executing ${action.op}:`, errorMessage);

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
        let octokit = this.octokit;

        // Try to get user token
        if (this.tokenService && context.userId) {
            const token = await this.tokenService.getToken(context.userId, 'github');
            if (token && token.accessToken) {
                octokit = new Octokit({ auth: token.accessToken });
            }
        }

        if (!octokit) {
            throw new Error('GitHub client not initialized and no user token found');
        }

        switch (action.op) {
            case 'github_create_issue':
                return await this.createIssue(octokit, action);

            case 'github_create_pr':
                return await this.createPR(octokit, action);

            case 'github_comment_issue':
                return await this.commentIssue(octokit, action);

            case 'github_close_issue':
                return await this.closeIssue(octokit, action);

            default:
                throw new Error(`Unsupported action: ${action.op}`);
        }
    }

    /**
     * Create a GitHub issue
     */
    private async createIssue(octokit: Octokit, action: Action): Promise<StepResult> {
        if (!('owner' in action.args) || !('repo' in action.args) || !('title' in action.args)) {
            throw new Error('Missing required arguments: owner, repo, title');
        }

        const owner = action.args.owner as string;
        const repo = action.args.repo as string;
        const title = action.args.title as string;
        const body = action.args.body as string;

        try {
            const response = await octokit.issues.create({
                owner,
                repo,
                title,
                body,
            });

            return {
                op: action.op,
                status: 'success',
                output: {
                    issueNumber: response.data.number,
                    url: response.data.html_url,
                },
            };
        } catch (error) {
            throw new Error(`Failed to create issue: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Create a Pull Request
     */
    private async createPR(octokit: Octokit, action: Action): Promise<StepResult> {
        if (!('owner' in action.args) || !('repo' in action.args) || !('title' in action.args) || !('head' in action.args) || !('base' in action.args)) {
            throw new Error('Missing required arguments: owner, repo, title, head, base');
        }

        const owner = action.args.owner as string;
        const repo = action.args.repo as string;
        const title = action.args.title as string;
        const head = action.args.head as string;
        const base = action.args.base as string;
        const body = action.args.body as string;

        try {
            const response = await octokit.pulls.create({
                owner,
                repo,
                title,
                head,
                base,
                body,
            });

            return {
                op: action.op,
                status: 'success',
                output: {
                    prNumber: response.data.number,
                    url: response.data.html_url,
                },
            };
        } catch (error) {
            throw new Error(`Failed to create PR: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Comment on an issue or PR
     */
    private async commentIssue(octokit: Octokit, action: Action): Promise<StepResult> {
        if (!('owner' in action.args) || !('repo' in action.args) || !('issueNumber' in action.args) || !('body' in action.args)) {
            throw new Error('Missing required arguments: owner, repo, issueNumber, body');
        }

        const owner = action.args.owner as string;
        const repo = action.args.repo as string;
        const issueNumber = action.args.issueNumber as number;
        const body = action.args.body as string;

        try {
            const response = await octokit.issues.createComment({
                owner,
                repo,
                issue_number: issueNumber,
                body,
            });

            return {
                op: action.op,
                status: 'success',
                output: {
                    commentId: response.data.id,
                    url: response.data.html_url,
                },
            };
        } catch (error) {
            throw new Error(`Failed to comment on issue: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Close an issue or PR
     */
    private async closeIssue(octokit: Octokit, action: Action): Promise<StepResult> {
        if (!('owner' in action.args) || !('repo' in action.args) || !('issueNumber' in action.args)) {
            throw new Error('Missing required arguments: owner, repo, issueNumber');
        }

        const owner = action.args.owner as string;
        const repo = action.args.repo as string;
        const issueNumber = action.args.issueNumber as number;

        try {
            const response = await octokit.issues.update({
                owner,
                repo,
                issue_number: issueNumber,
                state: 'closed',
            });

            return {
                op: action.op,
                status: 'success',
                output: {
                    issueNumber: response.data.number,
                    state: response.data.state,
                },
            };
        } catch (error) {
            throw new Error(`Failed to close issue: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    getCapabilities(): ActionCapability[] {
        return [
            {
                op: 'github_create_issue',
                provider: this.name,
                description: 'Create a new GitHub issue',
                argsSchema: {
                    owner: 'string (Repository owner/organization)',
                    repo: 'string (Repository name)',
                    title: 'string (Issue title)',
                    body: 'string (Optional: Issue description)',
                },
                requiresApproval: false,
                destructive: false,
                category: 'api',
            },
            {
                op: 'github_create_pr',
                provider: this.name,
                description: 'Create a new Pull Request',
                argsSchema: {
                    owner: 'string (Repository owner/organization)',
                    repo: 'string (Repository name)',
                    title: 'string (PR title)',
                    head: 'string (Source branch name)',
                    base: 'string (Target branch name)',
                    body: 'string (Optional: PR description)',
                },
                requiresApproval: false,
                destructive: false,
                category: 'api',
            },
            {
                op: 'github_comment_issue',
                provider: this.name,
                description: 'Comment on an issue or PR',
                argsSchema: {
                    owner: 'string (Repository owner)',
                    repo: 'string (Repository name)',
                    issueNumber: 'number (Issue or PR number)',
                    body: 'string (Comment text)',
                },
                requiresApproval: false,
                destructive: false,
                category: 'api',
            },
            {
                op: 'github_close_issue',
                provider: this.name,
                description: 'Close an issue or PR',
                argsSchema: {
                    owner: 'string (Repository owner)',
                    repo: 'string (Repository name)',
                    issueNumber: 'number (Issue or PR number)',
                },
                requiresApproval: false,
                destructive: false,
                category: 'api',
            },
        ];
    }
}
