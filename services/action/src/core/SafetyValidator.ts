import { Action, ActionPlan } from '../schemas/action.schema';
import { ValidationResult } from './ActionProvider.interface';

/**
 * Safety configuration
 */
export interface SafetyConfig {
    allowlist: {
        domains: string[];
        mode: 'strict' | 'permissive'; // permissive = block bad, strict = allow only good
    };
    blocklist: {
        domains: string[]; // Known bad domains
        patterns: string[]; // Regex patterns for bad domains
    };
    approvalRequired: {
        destructive: boolean; // Require approval for destructive actions
        newDomains: boolean; // Require approval for first-time domains
        allActions: boolean; // Require approval for all actions
    };
    rateLimits: {
        actionsPerMinute: number;
        actionsPerHour: number;
        enabled: boolean;
    };
    audit: {
        enabled: boolean;
        retention: number; // days
    };
}

/**
 * Rate limit tracking
 */
interface RateLimitEntry {
    userId: string;
    actionType: string;
    timestamps: number[];
}

/**
 * SafetyValidator enforces security policies on actions
 * - Domain allowlist/blocklist
 * - Destructive action detection
 * - Rate limiting
 * - Approval requirements
 */
export class SafetyValidator {
    private rateLimitTracking: Map<string, RateLimitEntry> = new Map();
    private destructiveOps = new Set([
        'send_email',
        'slack_message',
        'notion_create_page',
        'create_calendar_event',
        'delete_file',
        'post_to_social',
    ]);

    constructor(private config: SafetyConfig) { }

    /**
     * Validate an entire action plan
     */
    async validate(plan: ActionPlan): Promise<ValidationResult> {
        const userId = plan.provenance?.user_id || 'anonymous';

        // Check rate limits if enabled
        if (this.config.rateLimits.enabled) {
            const rateLimitResult = await this.checkRateLimit(userId);
            if (!rateLimitResult.allowed) {
                return rateLimitResult;
            }
        }

        // Validate each action
        for (const action of plan.plan) {
            const result = await this.validateAction(action);
            if (!result.allowed) {
                return result;
            }

            // Aggregate approval requirements
            if (result.requiresApproval) {
                return {
                    allowed: true,
                    requiresApproval: true,
                    reason: `Action requires approval: ${result.reason}`,
                };
            }
        }

        // Check if approval required based on config
        if (this.config.approvalRequired.allActions) {
            return {
                allowed: true,
                requiresApproval: true,
                reason: 'All actions require approval (global policy)',
            };
        }

        return { allowed: true };
    }

    /**
     * Validate a single action
     */
    async validateAction(action: Action): Promise<ValidationResult> {
        // Check destructive actions
        if (this.isDestructive(action)) {
            if (this.config.approvalRequired.destructive) {
                return {
                    allowed: true,
                    requiresApproval: true,
                    reason: `Destructive action: ${action.op}`,
                };
            }
        }

        // Validate domains for URL-based actions
        if ('url' in action.args && typeof action.args.url === 'string') {
            const domainValidation = await this.validateDomain(action.args.url);
            if (!domainValidation.allowed) {
                return domainValidation;
            }
        }

        return { allowed: true };
    }

    /**
     * Validate domain against allowlist/blocklist
     */
    async validateDomain(url: string): Promise<ValidationResult> {
        try {
            const domain = new URL(url).hostname.toLowerCase();

            // Check blocklist first
            if (this.isBlocked(domain)) {
                return {
                    allowed: false,
                    reason: `Domain ${domain} is blocked for security reasons`,
                };
            }

            // In permissive mode, allow all except blocked
            if (this.config.allowlist.mode === 'permissive') {
                // Check if it's a new domain
                if (this.config.approvalRequired.newDomains && !this.isDomainKnown(domain)) {
                    return {
                        allowed: true,
                        requiresApproval: true,
                        reason: `New domain ${domain} - requires first-time approval`,
                    };
                }
                return { allowed: true };
            }

            // In strict mode, check allowlist
            if (this.config.allowlist.domains.includes(domain)) {
                return { allowed: true };
            }

            return {
                allowed: false,
                reason: `Domain ${domain} is not in allowlist`,
            };
        } catch (error) {
            return {
                allowed: false,
                reason: `Invalid URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
        }
    }

    /**
     * Check if domain is blocked
     */
    private isBlocked(domain: string): boolean {
        // Check exact match
        if (this.config.blocklist.domains.includes(domain)) {
            return true;
        }

        // Check patterns
        for (const pattern of this.config.blocklist.patterns) {
            try {
                const regex = new RegExp(pattern, 'i');
                if (regex.test(domain)) {
                    return true;
                }
            } catch (error) {
                console.error(`Invalid blocklist pattern: ${pattern}`, error);
            }
        }

        return false;
    }

    /**
     * Check if domain is known (previously approved)
     */
    private isDomainKnown(domain: string): boolean {
        // For now, consider allowlist domains as known
        // In production, this would check a database of approved domains
        return this.config.allowlist.domains.includes(domain);
    }

    /**
     * Check if action is destructive
     */
    private isDestructive(action: Action): boolean {
        return this.destructiveOps.has(action.op);
    }

    /**
     * Check rate limits for a user
     */
    async checkRateLimit(userId: string): Promise<ValidationResult> {
        const key = userId;
        const now = Date.now();

        // Get or create tracking entry
        let entry = this.rateLimitTracking.get(key);
        if (!entry) {
            entry = {
                userId,
                actionType: 'all',
                timestamps: [],
            };
            this.rateLimitTracking.set(key, entry);
        }

        // Remove old timestamps
        const oneMinuteAgo = now - 60 * 1000;
        const oneHourAgo = now - 60 * 60 * 1000;
        entry.timestamps = entry.timestamps.filter((ts) => ts > oneHourAgo);

        // Check per-minute limit
        const recentMinute = entry.timestamps.filter((ts) => ts > oneMinuteAgo);
        if (recentMinute.length >= this.config.rateLimits.actionsPerMinute) {
            return {
                allowed: false,
                reason: `Rate limit exceeded: ${this.config.rateLimits.actionsPerMinute} actions per minute`,
            };
        }

        // Check per-hour limit
        if (entry.timestamps.length >= this.config.rateLimits.actionsPerHour) {
            return {
                allowed: false,
                reason: `Rate limit exceeded: ${this.config.rateLimits.actionsPerHour} actions per hour`,
            };
        }

        // Record this action
        entry.timestamps.push(now);

        return { allowed: true };
    }

    /**
     * Add domain to allowlist
     */
    addToAllowlist(domain: string): void {
        if (!this.config.allowlist.domains.includes(domain)) {
            this.config.allowlist.domains.push(domain);
            console.log(`Added ${domain} to allowlist`);
        }
    }

    /**
     * Add domain to blocklist
     */
    addToBlocklist(domain: string): void {
        if (!this.config.blocklist.domains.includes(domain)) {
            this.config.blocklist.domains.push(domain);
            console.log(`Added ${domain} to blocklist`);
        }
    }

    /**
     * Get current configuration
     */
    getConfig(): SafetyConfig {
        return { ...this.config };
    }

    /**
     * Update configuration
     */
    updateConfig(updates: Partial<SafetyConfig>): void {
        this.config = { ...this.config, ...updates };
        console.log('Safety configuration updated');
    }
}
