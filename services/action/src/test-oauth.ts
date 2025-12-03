
const BASE_URL = 'http://localhost:4007';

async function testOAuth() {
    console.log('🧪 Testing User OAuth...');

    const userId = 'test-user-oauth';

    // 1. Get Auth URL for Slack
    console.log('\n1. Getting Slack Auth URL...');
    const slackUrlRes = await fetch(`${BASE_URL}/auth/slack/url?userId=${userId}`);
    const slackUrlData = await slackUrlRes.json();
    console.log('Slack Auth URL:', slackUrlData.url);

    if (!slackUrlData.url || !slackUrlData.url.includes('slack.com')) {
        console.error('❌ Invalid Slack URL');
    } else {
        console.log('✅ Slack URL valid');
    }

    // 2. Simulate Callback (Mocking the flow since we can't actually login in headless)
    // Note: This part is tricky because we can't easily get a valid code without user interaction.
    // However, we can verify the endpoints exist and handle errors correctly.

    console.log('\n2. Testing Callback Endpoint (expecting error with invalid code)...');
    const callbackRes = await fetch(`${BASE_URL}/auth/slack/callback?code=invalid_code&state=${Buffer.from(JSON.stringify({ userId })).toString('base64')}`);
    const callbackText = await callbackRes.text();

    if (callbackText.includes('Authentication failed')) {
        console.log('✅ Callback handled invalid code correctly');
    } else {
        console.error('❌ Callback response unexpected:', callbackText);
    }

    // 3. Check Status
    console.log('\n3. Checking Auth Status...');
    const statusRes = await fetch(`${BASE_URL}/auth/status?userId=${userId}`);
    const statusData = await statusRes.json();
    console.log('Connected Providers:', statusData.connected);

    if (Array.isArray(statusData.connected)) {
        console.log('✅ Status endpoint working');
    } else {
        console.error('❌ Status endpoint failed');
    }
}

testOAuth().catch(console.error);
