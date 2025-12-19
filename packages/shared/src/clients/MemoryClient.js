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
    async retrieve(query, options = {}) {
        const result = await this.retrieveMemories({
            query,
            ...options
        });
        return result.results || [];
    }
    async getTasks(filters = {}) {
        const params = new URLSearchParams();
        if (filters.status)
            params.append('status', filters.status);
        if (filters.limit)
            params.append('limit', filters.limit.toString());
        return this.request({
            method: 'GET',
            url: `/tasks?${params.toString()}`,
        });
    }
    async getUserPreferences(userId) {
        return this.request({
            method: 'GET',
            url: '/user/preferences',
            headers: userId ? { 'x-user-id': userId } : undefined
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
    async createTask(task) {
        return this.request({
            method: 'POST',
            url: '/tasks',
            data: task,
        });
    }
    // Drafts
    async createDraft(draft) {
        return this.request({
            method: 'POST',
            url: '/drafts',
            data: draft,
        });
    }
    async getDraft(id) {
        return this.request({
            method: 'GET',
            url: `/drafts/${id}`,
        });
    }
    async getDrafts(status = 'draft') {
        return this.request({
            method: 'GET',
            url: `/drafts?status=${status}`,
        });
    }
    async updateDraft(id, updates) {
        return this.request({
            method: 'PUT',
            url: `/drafts/${id}`,
            data: updates,
        });
    }
    async deleteDraft(id) {
        return this.request({
            method: 'DELETE',
            url: `/drafts/${id}`,
        });
    }
}
//# sourceMappingURL=MemoryClient.js.map