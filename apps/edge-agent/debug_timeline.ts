
// Mock localStorage
const mockStorage = {
    getItem: (key: string) => 'user',
    setItem: () => { },
    removeItem: () => { },
    clear: () => { },
    key: () => null,
    length: 0
};
(global as any).localStorage = mockStorage;

import { memoryClient } from './src/services/api';

async function main() {
    console.log('Fetching ALL events...');
    try {
        const all = await memoryClient.getEvents({ limit: 100 });
        console.log('All Events Count:', all.data ? all.data.length : 0);
        if (all.data) {
            const types = all.data.map((e: any) => e.type);
            console.log('Event Types found:', Array.from(new Set(types)));
        }
    } catch (e) {
        console.log('Error fetching all:', e.message);
    }

    console.log('Fetching MEETING events...');
    try {
        const meetings = await memoryClient.getEvents({ type: 'meeting', limit: 10 });
        console.log('Meeting Events Count:', meetings.data ? meetings.data.length : 0);
    } catch (e) {
        console.log('Error fetching meetings:', e.message);
    }

    console.log('Fetching TASK events...');
    try {
        const tasks = await memoryClient.getEvents({ type: 'task', limit: 10 });
        console.log('Task Events Count:', tasks.data ? tasks.data.length : 0);
    } catch (e) {
        console.log('Error fetching tasks:' + e.message);
    }

    console.log('Fetching TASKS via getTasks()...');
    try {
        const tasks2 = await memoryClient.getTasks({ limit: 10 });
        console.log('getTasks Count:', tasks2.data ? tasks2.data.length : 0);
    } catch (e) {
        console.log('Error fetching tasks via getTasks:' + e.message);
    }
}

main();
