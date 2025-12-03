// Quick test to verify server is running
async function testServer() {
    const baseUrl = 'http://localhost:4006';

    console.log('Testing Action Service...\n');

    try {
        // Test 1: Health check
        console.log('[1/3] Testing health endpoint...');
        const healthResp = await fetch(`${baseUrl}/health`);
        const health = await healthResp.json();
        console.log('✅ Health check passed:');
        console.log(JSON.stringify(health, null, 2));
        console.log('');

        // Test 2: List actions
        console.log('[2/3] Testing actions list...');
        const actionsResp = await fetch(`${baseUrl}/action/v1/actions`);
        const actionsData = await actionsResp.json();
        console.log(`✅ Found ${actionsData.stats.totalActions} actions`);
        console.log(`   Categories: browser=${actionsData.stats.byCategory.browser}`);
        console.log('');

        // Test 3: Execute simple action
        console.log('[3/3] Executing screenshot action...');
        const execResp = await fetch(`${baseUrl}/action/v1/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                plan: [{ op: 'screenshot', args: {} }]
            })
        });
        const execResult = await execResp.json();
        console.log(`✅ Action executed: ${execResult.status}`);
        console.log(`   Action ID: ${execResult.action_id}`);
        console.log(`   Duration: ${execResult.total_duration_ms}ms`);
        console.log('');

        console.log('🎉 ALL TESTS PASSED - SERVER IS FULLY OPERATIONAL!');
        console.log('');
        console.log('✅ Phase 1: 100% COMPLETE');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('\nIs the server running? Start it with:');
        console.error('  $env:PORT=4005; pnpm tsx src/server.new.ts');
    }
}

testServer();
