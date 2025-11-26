import { EventEmitter } from 'events';
class MemoryClient extends EventEmitter {
    constructor() {
        super();
        this.events = new Map();
    }
    static getInstance() {
        if (!MemoryClient.instance) {
            MemoryClient.instance = new MemoryClient();
        }
        return MemoryClient.instance;
    }
    async storeEvent(event) {
        try {
            const eventId = `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const eventWithMeta = {
                ...event,
                timestamp: event.timestamp || Date.now(),
                metadata: {
                    ...event.metadata,
                    storedAt: new Date().toISOString()
                }
            };
            this.events.set(eventId, eventWithMeta);
            this.emit('eventStored', { id: eventId, ...eventWithMeta });
            return { success: true, id: eventId };
        }
        catch (error) {
            console.error('Error storing event:', error);
            return {
                success: false,
                error: error instanceof Error ? error : new Error('Unknown error')
            };
        }
    }
    async getEvent(id) {
        return this.events.get(id);
    }
    async getAllEvents() {
        return Array.from(this.events.values());
    }
    async clearEvents() {
        this.events.clear();
    }
}
export const memoryClient = MemoryClient.getInstance();
//# sourceMappingURL=MemoryClient.js.map