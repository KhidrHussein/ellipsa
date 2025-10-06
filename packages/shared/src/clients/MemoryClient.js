// packages/shared/src/clients/MemoryClient.ts
import { ServiceClient } from './ServiceClient.js';
export class MemoryClient extends ServiceClient {
    constructor(baseURL = process.env.MEMORY_SERVICE_URL || 'http://localhost:3000') {
        super('MemoryService', baseURL);
    }
    async storeEvent(event) {
        return this.request({
            method: 'POST',
            url: '/events',
            data: {
                ...event,
                start_time: event.start_time instanceof Date ? event.start_time.toISOString() : event.start_time,
                end_time: event.end_time
                    ? (event.end_time instanceof Date ? event.end_time.toISOString() : event.end_time)
                    : undefined
            },
        });
    }
    async retrieveMemories(options) {
        return this.request({
            method: 'POST',
            url: '/retrieve',
            data: options,
        });
    }
    async getEntity(id) {
        return this.request({
            method: 'GET',
            url: `/entities/${id}`,
        });
    }
    async getEvent(id) {
        return this.request({
            method: 'GET',
            url: `/events/${id}`,
        });
    }
}
//# sourceMappingURL=MemoryClient.js.map