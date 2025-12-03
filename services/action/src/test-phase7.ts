// Built-in fetch in Node 18+

const BASE_URL = process.env.ACTION_SERVICE_URL || 'http://localhost:4006';

async function testPhase7() {
    console.log('🧪 Testing Phase 7: Polish & Gaps...\n');

    // 1. Check Registered Providers (Should include 'gmail' and 'calendar')
    console.log('1. Checking Registered Providers...');
    try {
        const response = await fetch(`${BASE_URL}/action/v1/actions`);
        const data = await response.json();

        const providers = new Set(data.actions.map((a: any) => a.provider));
        console.log('   Providers found:', Array.from(providers).join(', '));

        if (providers.has('gmail')) console.log('   ✅ Gmail Provider registered');
        else console.error('   ❌ Gmail Provider MISSING');

        if (providers.has('calendar')) console.log('   ✅ Calendar Provider registered');
        else console.error('   ❌ Calendar Provider MISSING');

    } catch (error) {
        console.error('   ❌ Failed to fetch actions:', error);
    }

    // 2. Test Telemetry Endpoint
    console.log('\n2. Testing Telemetry Endpoint...');
    try {
        const response = await fetch(`${BASE_URL}/telemetry/v1/event`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'test_event',
                data: { foo: 'bar' },
                timestamp: new Date().toISOString()
            })
        });

        if (response.ok) {
            const result = await response.json();
            console.log('   ✅ Telemetry endpoint returned 200:', result);
        } else {
            console.error('   ❌ Telemetry endpoint failed:', response.status, response.statusText);
        }
    } catch (error) {
        console.error('   ❌ Failed to call telemetry endpoint:', error);
    }
}

testPhase7().catch(console.error);
