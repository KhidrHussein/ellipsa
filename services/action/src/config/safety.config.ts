import { SafetyConfig } from '../core/SafetyValidator';

/**
 * Default blocklist of known malicious/dangerous domains
 * This is a minimal list - in production, integrate with threat intelligence feeds
 */
const DEFAULT_BLOCKLIST = [
    // Example malicious domains (add real threat intelligence)
    'phishing-site.com',
    'malware.example',
    'scam-site.net',
];

/**
 * Blocklist patterns (regex)
 */
const DEFAULT_BLOCKLIST_PATTERNS = [
    // Block common phishing patterns
    '.*-verify-(account|payment|identity).*',
    '.*-secure-login-.*',
    // Add more as needed
];

/**
 * Default allowlist for common safe domains
 * In permissive mode, these are auto-approved without user confirmation
 */
const DEFAULT_ALLOWLIST = [
    // Google services
    'mail.google.com',
    'calendar.google.com',
    'drive.google.com',
    'docs.google.com',
    'meet.google.com',

    // Microsoft services
    'outlook.office.com',
    'teams.microsoft.com',

    // Productivity tools
    'slack.com',
    'notion.so',
    'github.com',
    'gitlab.com',

    // Common domains
    'localhost',
    '127.0.0.1',
];

/**
 * Load safety configuration from environment variables
 */
export function loadSafetyConfig(): SafetyConfig {
    const mode = (process.env.ACTION_ALLOWLIST_MODE as 'strict' | 'permissive') || 'permissive';

    // Parse custom allowlist from environment
    const customAllowlist = process.env.ACTION_ALLOWLIST
        ? process.env.ACTION_ALLOWLIST.split(',').map((d) => d.trim().toLowerCase())
        : [];

    // Parse custom blocklist from environment
    const customBlocklist = process.env.ACTION_BLOCKLIST
        ? process.env.ACTION_BLOCKLIST.split(',').map((d) => d.trim().toLowerCase())
        : [];

    // Merge with defaults
    const allowlist = [...new Set([...DEFAULT_ALLOWLIST, ...customAllowlist])];
    const blocklist = [...new Set([...DEFAULT_BLOCKLIST, ...customBlocklist])];

    return {
        allowlist: {
            domains: allowlist,
            mode,
        },
        blocklist: {
            domains: blocklist,
            patterns: DEFAULT_BLOCKLIST_PATTERNS,
        },
        approvalRequired: {
            destructive: process.env.ACTION_REQUIRE_APPROVAL_DESTRUCTIVE !== 'false', // Default true
            newDomains: process.env.ACTION_REQUIRE_APPROVAL_NEW_DOMAINS !== 'false', // Default true
            allActions: process.env.ACTION_REQUIRE_APPROVAL_ALL === 'true', // Default false
        },
        rateLimits: {
            actionsPerMinute: parseInt(process.env.ACTION_RATE_LIMIT_PER_MINUTE || '20'),
            actionsPerHour: parseInt(process.env.ACTION_RATE_LIMIT_PER_HOUR || '200'),
            enabled: process.env.ACTION_RATE_LIMIT_ENABLED !== 'false', // Default true
        },
        audit: {
            enabled: process.env.ACTION_AUDIT_ENABLED !== 'false', // Default true
            retention: parseInt(process.env.ACTION_AUDIT_RETENTION_DAYS || '90'),
        },
    };
}

/**
 * Get a development-friendly configuration (less restrictive)
 */
export function getDevSafetyConfig(): SafetyConfig {
    return {
        allowlist: {
            domains: [...DEFAULT_ALLOWLIST, 'localhost', '127.0.0.1', 'example.com'],
            mode: 'permissive',
        },
        blocklist: {
            domains: [],
            patterns: [],
        },
        approvalRequired: {
            destructive: true, // Still require approval for destructive actions in dev
            newDomains: false, // Don't require approval for new domains in dev
            allActions: false,
        },
        rateLimits: {
            actionsPerMinute: 100,
            actionsPerHour: 1000,
            enabled: false, // Disable rate limiting in dev
        },
        audit: {
            enabled: true,
            retention: 7, // Keep logs for 7 days in dev
        },
    };
}

/**
 * Get a production configuration (more restrictive)
 */
export function getProdSafetyConfig(): SafetyConfig {
    const config = loadSafetyConfig();

    // Ensure strict settings in production
    return {
        ...config,
        approvalRequired: {
            ...config.approvalRequired,
            destructive: true, // Always require approval for destructive actions
        },
        rateLimits: {
            ...config.rateLimits,
            enabled: true, // Always enable rate limiting in production
        },
        audit: {
            ...config.audit,
            enabled: true, // Always enable audit logging in production
        },
    };
}
