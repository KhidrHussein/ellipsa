

const BASE_URL = process.env.ACTION_SERVICE_URL || 'http://localhost:4006';

async function testHistory() {
    console.log('🧪 Testing Action History...');

    // 1. Execute an action
    console.log('\n1. Executing action...');
    const actionPlan = {
        plan: [
            {
                op: 'wait',
                args: { ms: 100 }
            }
        ],
        provenance: {
            user_id: 'test-user',
            source: 'test-script',
            origin_event_id: 'evt_123'
        }
    };

    const execResponse = await fetch(`${BASE_URL}/action/v1/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(actionPlan)
    });

    const execResult = await execResponse.json();
    console.log('Execution Result:', execResult.status);
    const actionId = execResult.action_id;

    if (!actionId) {
        console.error('❌ Failed to get action ID');
        process.exit(1);
    }

    // 2. Query history
    console.log('\n2. Querying history...');
    // Wait a bit for async logging (though it's awaited in the code, good to be safe)
    await new Promise(r => setTimeout(r, 500));

    const historyResponse = await fetch(`${BASE_URL}/action/v1/history?userId=test-user`);
    const history = await historyResponse.json();

    console.log(`Found ${history.length} history entries`);
    const entry = history.find((e: any) => e.actionId === actionId);

    if (entry) {
        console.log('✅ Found executed action in history');
        console.log('Entry status:', entry.result.status);
    } else {
        console.error('❌ Action not found in history');
        console.log('History IDs:', history.map((e: any) => e.actionId));
    }

    // 3. Get specific action
    console.log('\n3. Getting specific action details...');
    const detailResponse = await fetch(`${BASE_URL}/action/v1/history/${actionId}`);
    const detail = await detailResponse.json();

    if (detail.actionId === actionId) {
        console.log('✅ Successfully retrieved action details');
        console.log('Provenance:', detail.provenance);
    } else {
        console.error('❌ Failed to retrieve action details');
    }

    // 4. Get stats
    console.log('\n4. Getting stats...');
    const statsResponse = await fetch(`${BASE_URL}/action/v1/stats?userId=test-user`);
    const stats = await statsResponse.json();

    console.log('Stats:', JSON.stringify(stats, null, 2));

    if (stats.total > 0 && stats.byStatus.completed > 0) {
        console.log('✅ Stats look correct');
    } else {
        console.error('❌ Stats look incorrect');
    }
}

testHistory().catch(console.error);
