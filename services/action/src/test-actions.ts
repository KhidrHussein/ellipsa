#!/usr/bin/env tsx

/**
 * Test script to verify the action infrastructure works
 */

import { ActionRegistry } from './core/ActionRegistry.js';
import { SafetyValidator } from './core/SafetyValidator.js';
import { ActionExecutor } from './core/ActionExecutor.js';
import { BrowserProvider } from './providers/BrowserProvider.js';
import { getDevSafetyConfig } from './config/safety.config.js';
import { ActionPlan } from './schemas/action.schema.js';

async function main() {
    console.log('========================================');
    console.log('Testing Action Infrastructure');
    console.log('========================================\n');

    // 1. Initialize components
    console.log('1. Initializing components...');
    const safetyConfig = getDevSafetyConfig();
    const safetyValidator = new SafetyValidator(safetyConfig);
    const actionRegistry = new ActionRegistry();
    const actionExecutor = new ActionExecutor(actionRegistry, safetyValidator);

    // 2. Register providers
    console.log('2. Registering providers...');
    const browserProvider = new BrowserProvider();
    await browserProvider.initialize?.();
    actionRegistry.registerProvider(browserProvider);

    const stats = actionRegistry.getStats();
    console.log(`   - Providers registered: ${stats.totalProviders}`);
    console.log(`   - Total actions: ${stats.totalActions}`);
    console.log(`   - By category:`, stats.byCategory);

    // 3. List available actions
    console.log('\n3. Available actions:');
    const actions = actionRegistry.getAvailableActions();
    actions.forEach(action => {
        console.log(`   - ${action.op} (${action.category}): ${action.description}`);
    });

    // 4. Test action validation
    console.log('\n4. Testing action validation...');
    const testPlan: ActionPlan = {
        plan: [
            { op: 'open_url', args: { url: 'https://example.com' } },
            { op: 'screenshot', args: {} },
        ],
    };

    const validation = await actionExecutor.validatePlan(testPlan);
    console.log(`   - Validation result: ${validation.allowed ? 'ALLOWED' : 'DENIED'}`);
    if (validation.requiresApproval) {
        console.log(`   - Requires approval: ${validation.reason}`);
    }

    // 5. Test browser action execution
    console.log('\n5. Testing browser action execution...');
    console.log('   - Opening example.com and taking screenshot...');

    try {
        const result = await actionExecutor.execute(testPlan, {
            userId: 'test-user',
            timestamp: new Date(),
            headless: true,
            continueOnError: false,
        });

        console.log(`   - Action ID: ${result.action_id}`);
        console.log(`   - Status: ${result.status}`);
        console.log(`   - Duration: ${result.total_duration_ms}ms`);
        console.log(`   - Steps executed: ${result.steps.length}`);

        result.steps.forEach((step, idx) => {
            console.log(`     ${idx + 1}. ${step.op}: ${step.status}`);
            if (step.screenshot) {
                console.log(`        Screenshot captured (${step.screenshot.substring(0, 50)}...)`);
            }
        });
    } catch (error) {
        console.error('   - ERROR:', error instanceof Error ? error.message : error);
    }

    // 6. Test safety validation
    console.log('\n6. Testing safety validation...');
    const maliciousPlan: ActionPlan = {
        plan: [
            { op: 'open_url', args: { url: 'https://malware.example' } },
        ],
    };

    const maliciousValidation = await actionExecutor.validatePlan(maliciousPlan);
    console.log(`   - Blocked domain test: ${!maliciousValidation.allowed ? 'PASS' : 'FAIL'}`);
    if (!maliciousValidation.allowed) {
        console.log(`   - Reason: ${maliciousValidation.reason}`);
    }

    // Cleanup
    await browserProvider.cleanup?.();

    console.log('\n========================================');
    console.log('Test completed successfully!');
    console.log('========================================');
}

main().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
});
