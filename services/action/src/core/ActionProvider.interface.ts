import { Action, StepResult, Provenance } from '../schemas/action.schema';

/**
 * Execution context passed to providers
 */
export interface ExecutionContext {
    userId?: string;
    timestamp: Date;
    headless?: boolean; // For browser actions
    continueOnError?: boolean; // Continue executing steps even if one fails
    timeout?: number; // Global timeout in ms
    metadata?: Record<string, unknown>;
}

/**
 * Result from a provider's execution
 */
export interface ProviderResult {
    results: StepResult[];
    metadata?: Record<string, unknown>;
}

/**
 * Validation result from safety checks
 */
export interface ValidationResult {
    allowed: boolean;
    requiresApproval?: boolean;
    reason?: string;
    warnings?: string[];
}

/**
 * Action capability descriptor
 */
export interface ActionCapability {
    op: string;
    provider: string;
    description: string;
    argsSchema: Record<string, unknown>;
    requiresApproval: boolean;
    destructive: boolean;
    category: 'browser' | 'email' | 'desktop' | 'api';
}

/**
 * Base interface that all action providers must implement
 */
export interface IActionProvider {
    /**
     * Provider name
     */
    readonly name: string;

    /**
     * Check if this provider supports a given action
     */
    supports(action: Action): boolean;

    /**
     * Execute one or more actions
     */
    execute(actions: Action[], context: ExecutionContext): Promise<ProviderResult>;

    /**
     * Validate an action before execution
     */
    validate(action: Action): ValidationResult;

    /**
     * Get list of action capabilities this provider supports
     */
    getCapabilities(): ActionCapability[];

    /**
     * Initialize the provider (called once at startup)
     */
    initialize?(): Promise<void>;

    /**
     * Cleanup the provider (called on shutdown)
     */
    cleanup?(): Promise<void>;
}

/**
 * Action definition for registry
 */
export interface ActionDefinition {
    op: string;
    provider: string;
    description: string;
    argsSchema: Record<string, unknown>;
    requiresApproval: boolean;
    destructive: boolean;
    category: 'browser' | 'email' | 'desktop' | 'api';
    examples?: Array<{
        description: string;
        action: Action;
    }>;
}

/**
 * Approval request
 */
export interface ApprovalRequest {
    id: string;
    actions: Action[];
    provenance?: Provenance;
    requestedAt: Date;
    expiresAt: Date;
    status: 'pending' | 'approved' | 'rejected' | 'expired';
    preview?: {
        description: string;
        impact: string;
        warnings?: string[];
    };
}

/**
 * Approval response
 */
export interface ApprovalResponse {
    approvalId: string;
    approved: boolean;
    feedback?: string;
    respondedAt: Date;
}
