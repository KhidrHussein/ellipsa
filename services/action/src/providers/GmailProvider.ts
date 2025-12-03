import { Action, StepResult } from '../schemas/action.schema.js';
import {
    IActionProvider,
    ExecutionContext,
    ProviderResult,
    ValidationResult,
    ActionCapability,
} from '../core/ActionProvider.interface.js';
import { GmailEmailService } from '../email/services/GmailEmailService.js';
import { DraftResponse } from '../email/types/email.types.js';

/**
 * GmailProvider handles email actions via Gmail API
 * Wraps the existing GmailEmailService
 */
export class GmailProvider implements IActionProvider {
    readonly name = 'gmail';
    private emailService: GmailEmailService | null = null;

    constructor(emailService?: GmailEmailService) {
        if (emailService) {
            this.emailService = emailService;
        }
    }

    async initialize(emailService?: GmailEmailService): Promise<void> {
        if (emailService) {
            this.emailService = emailService;
            console.log('[GmailProvider] Initialized with EmailService');
        }
    }

    supports(action: Action): boolean {
        return [
            'send_email',
            'draft_email',
            'mark_email_read',
        ].includes(action.op);
    }

    validate(action: Action): ValidationResult {
        if (!this.emailService) {
            return {
                allowed: false,
                reason: 'Gmail provider not initialized',
            };
        }

        if (!this.supports(action)) {
            return {
                allowed: false,
                reason: `Gmail provider does not support action: ${action.op}`,
            };
        }

        return { allowed: true };
    }

    async execute(actions: Action[], context: ExecutionContext): Promise<ProviderResult> {
        if (!this.emailService) {
            throw new Error('Gmail provider not initialized');
        }

        const results: StepResult[] = [];

        for (const action of actions) {
            const actionStart = Date.now();

            try {
                const result = await this.executeAction(action, context);
                result.duration_ms = Date.now() - actionStart;
                results.push(result);

                console.log(`[GmailProvider] ${action.op}: ${result.status} (${result.duration_ms}ms)`);

                if (result.status === 'failed' && !context.continueOnError) {
                    break;
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error(`[GmailProvider] Error executing ${action.op}:`, errorMessage);

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
        switch (action.op) {
            case 'send_email':
                return await this.sendEmail(action);

            case 'draft_email':
                return await this.draftEmail(action);

            case 'mark_email_read':
                return await this.markEmailRead(action);

            default:
                throw new Error(`Unsupported action: ${action.op}`);
        }
    }

    private async sendEmail(action: Action): Promise<StepResult> {
        if (!this.emailService) throw new Error('Service not initialized');

        const args = action.args as any;
        if (!args.to || !args.subject || !args.body) {
            throw new Error('Missing required arguments: to, subject, body');
        }

        const draft: DraftResponse = {
            to: args.to.map((email: string) => ({ address: email })),
            subject: args.subject,
            text: args.body,
            cc: args.cc?.map((email: string) => ({ address: email })),
            bcc: args.bcc?.map((email: string) => ({ address: email })),
            inReplyTo: args.threadId, // Using threadId as inReplyTo for simplicity if provided
        };

        const result = await this.emailService.sendEmail(draft);

        if (!result.success) {
            throw new Error('Failed to send email');
        }

        return {
            op: action.op,
            status: 'success',
            output: {
                messageId: result.messageId,
                to: args.to,
                subject: args.subject,
            },
        };
    }

    private async draftEmail(action: Action): Promise<StepResult> {
        // For now, draft_email just prepares the object, but GmailEmailService doesn't have a "save draft" method exposed
        // The design says "draft email via webmail" or "return draft".
        // We will just return the draft object as success for now, or we could implement saveDraft in GmailEmailService later.
        // Re-reading GmailEmailService, it has `draftResponse` but that generates a draft from context.
        // It doesn't seem to have a `createDraft` method that calls the Gmail API to save a draft.
        // However, `MemoryServiceClient` has `createDraft`.
        // Let's assume for this phase we just return the constructed draft.

        const args = action.args as any;
        return {
            op: action.op,
            status: 'success',
            output: {
                draft: {
                    to: args.to,
                    subject: args.subject,
                    body: args.context?.additionalContext || '',
                },
                note: 'Draft created in memory (not saved to Gmail yet)',
            },
        };
    }

    private async markEmailRead(action: Action): Promise<StepResult> {
        if (!this.emailService) throw new Error('Service not initialized');

        const args = action.args as any;
        if (!args.emailId) {
            throw new Error('Missing required argument: emailId');
        }

        await this.emailService.markAsRead(args.emailId);

        return {
            op: action.op,
            status: 'success',
            output: {
                emailId: args.emailId,
                markedRead: true,
            },
        };
    }

    getCapabilities(): ActionCapability[] {
        return [
            {
                op: 'send_email',
                provider: this.name,
                description: 'Send an email via Gmail API',
                argsSchema: {
                    to: 'string[]',
                    subject: 'string',
                    body: 'string',
                    cc: 'string[] (optional)',
                    bcc: 'string[] (optional)',
                },
                requiresApproval: true,
                destructive: false, // Sending email is not destructive per se, but requires approval
                category: 'email',
            },
            {
                op: 'draft_email',
                provider: this.name,
                description: 'Draft an email',
                argsSchema: {
                    to: 'string[]',
                    subject: 'string (optional)',
                    context: 'object (optional)',
                },
                requiresApproval: false,
                destructive: false,
                category: 'email',
            },
            {
                op: 'mark_email_read',
                provider: this.name,
                description: 'Mark an email as read',
                argsSchema: {
                    emailId: 'string',
                },
                requiresApproval: false,
                destructive: false,
                category: 'email',
            },
        ];
    }
}
