
import axios from 'axios';

async function verify() {
    const baseUrl = 'http://localhost:4001/api/v1';
    const eventId = `test-${Date.now()}`;

    console.log('1. Creating Test Event...');
    try {
        const res = await axios.post(`${baseUrl}/events`, {
            type: 'user_message',
            title: 'Verification Test Event',
            description: 'This is a test event to verify ChromaDB and Neo4j persistence.',
            start_time: new Date(),
            metadata: { verification_id: eventId }
        });
        console.log('Response Status:', res.status);
        console.log('Response Data:', JSON.stringify(res.data, null, 2));
        const createdId = res.data.id || res.data.data?.id;
        console.log('Event Created ID:', createdId);

        // Wait for async persistence
        await new Promise(r => setTimeout(r, 2000));

        // As we can't query Chroma/Neo4j directly easily without credentials/drivers setup here,
        // we will rely on the "Memory Retrieval" endpoint if available, or just success of creation for now.
        // Ideally, we would inspect the logs for "Added event to ChromaDB".

        console.log('2. Verifying Retrieval (if possible from logs)...');
        console.log('Check the service logs for:');
        console.log('"[EventModel] Added event to ChromaDB"');
        console.log('"[EventModel] Added event to Neo4j"');

    } catch (error: any) {
        console.error('Verification Failed:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
    }
}

verify();
