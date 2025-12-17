
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:4001/api/v1/events';

async function testIsolation() {
    console.log('--- Starting Isolation Test ---');

    // 1. Create Event for Alice
    console.log('1. Creating Alice Event...');
    const aliceRes = await fetch(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-ID': 'alice' },
        body: JSON.stringify({
            type: 'test',
            title: 'Alice Private Event',
            start_time: new Date().toISOString()
        })
    });
    if (!aliceRes.ok) throw new Error(`Failed to create Alice event: ${aliceRes.status}`);
    console.log('   -> Success');

    // 2. Create Event for Bob
    console.log('2. Creating Bob Event...');
    const bobRes = await fetch(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-ID': 'bob' },
        body: JSON.stringify({
            type: 'test',
            title: 'Bob Private Event',
            start_time: new Date().toISOString()
        })
    });
    if (!bobRes.ok) throw new Error(`Failed to create Bob event: ${bobRes.status}`);
    console.log('   -> Success');

    // 3. Verify Alice's View
    console.log('3. Verifying Alice View...');
    const aliceView = await fetch(`${BASE_URL}?limit=100`, {
        headers: { 'X-User-ID': 'alice' }
    });
    const aliceData: any = await aliceView.json();
    const aliceEvents = aliceData.data || [];

    const hasAliceEvent = aliceEvents.some((e: any) => e.title === 'Alice Private Event');
    const hasBobEvent = aliceEvents.some((e: any) => e.title === 'Bob Private Event');

    console.log(`   Alice sees Alice event: ${hasAliceEvent}`);
    console.log(`   Alice sees Bob event:   ${hasBobEvent}`);

    if (hasAliceEvent && !hasBobEvent) {
        console.log('   [PASS] Alice Isolation Verified');
    } else {
        console.error('   [FAIL] Alice View Incorrect');
    }

    // 4. Verify Bob's View
    console.log('4. Verifying Bob View...');
    const bobView = await fetch(`${BASE_URL}?limit=100`, {
        headers: { 'X-User-ID': 'bob' }
    });
    const bobData: any = await bobView.json();
    const bobEvents = bobData.data || [];

    const hasBobEvent2 = bobEvents.some((e: any) => e.title === 'Bob Private Event');
    const hasAliceEvent2 = bobEvents.some((e: any) => e.title === 'Alice Private Event');

    console.log(`   Bob sees Bob event:   ${hasBobEvent2}`);
    console.log(`   Bob sees Alice event: ${hasAliceEvent2}`);

    if (hasBobEvent2 && !hasAliceEvent2) {
        console.log('   [PASS] Bob Isolation Verified');
    } else {
        console.error('   [FAIL] Bob View Incorrect');
    }
}

testIsolation().catch(err => console.error(err));
