
import { config } from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Get directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const envPaths = [
    path.resolve(__dirname, '../../../../.env'), // Load root .env
    path.resolve(__dirname, '../../.env')        // Load local .env
];

console.log('🔍 Loading environment configuration...');
let envLoaded = false;
for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
        console.log(`   Loading ${envPath}`);
        config({ path: envPath, override: true });
        envLoaded = true;
    }
}

if (!envLoaded) {
    console.warn('⚠️  No .env file found. Using process environment only.');
}

const REQUIRED_VARS = {
    'Common': ['PORT'],
    'Slack': ['SLACK_CLIENT_ID', 'SLACK_CLIENT_SECRET'],
    'Notion': ['NOTION_CLIENT_ID', 'NOTION_CLIENT_SECRET'],
    'GitHub': ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET']
};

const OPTIONAL_VARS = {
    'Slack': ['SLACK_BOT_TOKEN', 'SLACK_REDIRECT_URI'],
    'Notion': ['NOTION_API_KEY', 'NOTION_REDIRECT_URI'],
    'GitHub': ['GITHUB_TOKEN', 'GITHUB_REDIRECT_URI']
};

interface VerificationResult {
    provider: string;
    status: 'ok' | 'missing_config' | 'partial_config';
    details: string[];
}

function verifyProvider(name: string, required: string[], optional: string[]): VerificationResult {
    const missing: string[] = [];
    const present: string[] = [];

    // Check required
    for (const v of required) {
        if (!process.env[v]) {
            missing.push(v);
        } else {
            present.push(v);
        }
    }

    // Check optional
    const presentOptional: string[] = [];
    for (const v of optional) {
        if (process.env[v]) {
            presentOptional.push(v);
        }
    }

    let status: 'ok' | 'missing_config' | 'partial_config' = 'ok';
    if (missing.length === required.length) {
        status = 'missing_config';
    } else if (missing.length > 0) {
        status = 'partial_config';
    }

    const details = [];
    if (status === 'ok') {
        details.push(`✅ All required variables present`);
    } else {
        details.push(`❌ Missing required: ${missing.join(', ')}`);
    }

    if (presentOptional.length > 0) {
        details.push(`ℹ️  Optional configured: ${presentOptional.join(', ')}`);
    }

    // Validate connection string format if present
    if (name === 'Slack' && process.env.SLACK_BOT_TOKEN) {
        if (!process.env.SLACK_BOT_TOKEN.startsWith('xoxb-')) {
            details.push('⚠️  SLACK_BOT_TOKEN should start with "xoxb-"');
        }
    }

    return { provider: name, status, details };
}

async function verifyUrlEndpoint(port: string, provider: string) {
    const baseUrl = `http://localhost:${port}`;
    const testUserId = 'verify-script-user';

    try {
        // We can't really "fetch" if server isn't running, but this script is meant to be run
        // either standalone to check env config, OR potentially against a running server.
        // For now, let's just output what the URL *would* be based on config.

        let redirectUri = process.env[`${provider.toUpperCase()}_REDIRECT_URI`];
        if (!redirectUri) {
            redirectUri = `http://localhost:${port}/auth/${provider.toLowerCase()}/callback`;
            console.log(`   ℹ️  Using default redirect URI: ${redirectUri}`);
        } else {
            console.log(`   ℹ️  Using configured redirect URI: ${redirectUri}`);
        }

        return true;
    } catch (e) {
        return false;
    }
}

async function main() {
    console.log('\n========================================');
    console.log('🚀 Integration Verification Tool');
    console.log('========================================\n');

    const results: VerificationResult[] = [];

    // Verify Common
    results.push(verifyProvider('Common', REQUIRED_VARS.Common, []));

    // Verify Integrations
    results.push(verifyProvider('Slack', REQUIRED_VARS.Slack, OPTIONAL_VARS.Slack));
    results.push(verifyProvider('Notion', REQUIRED_VARS.Notion, OPTIONAL_VARS.Notion));
    results.push(verifyProvider('GitHub', REQUIRED_VARS.GitHub, OPTIONAL_VARS.GitHub));

    // Print Results
    for (const res of results) {
        console.log(`\n[${res.provider}]`);
        for (const detail of res.details) {
            console.log(`   ${detail}`);
        }
    }

    console.log('\n========================================');
    console.log('📋 Next Steps');
    console.log('========================================');

    const missing = results.filter(r => r.status !== 'ok');

    if (missing.length === 0) {
        console.log('✅ All integrations are configured! You can start the server.');
    } else {
        console.log('⚠️  Some integrations are missing configuration.');
        console.log('Please see INTEGRATION_SETUP.md for instructions on how to obtain these keys.');
        console.log('Add the missing keys to services/action/.env');
    }
}

main().catch(console.error);
