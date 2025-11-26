import { z } from "zod";
// Export service clients
export { ServiceClient } from './clients/ServiceClient.js';
export { MemoryClient } from './clients/MemoryClient.js';
// Export utilities
export { logger } from './utils/logger.js';
// Existing schema exports
export const EntitySchema = z.object({
    id: z.string(),
    canonical_name: z.string(),
    aliases: z.array(z.string()).default([]),
    type: z.string(),
    metadata: z.record(z.any()).default({}),
    relationship_strength: z.number().optional(),
    default_persona: z.string().optional(),
    created_at: z.string().optional(),
    last_seen_at: z.string().optional()
});
export const TaskSchema = z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().optional(),
    status: z.enum(['pending', 'in_progress', 'completed', 'failed']).default('pending'),
    priority: z.enum(['low', 'medium', 'high']).default('medium'),
    due_date: z.string().optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
    metadata: z.record(z.any()).default({})
});
export const EventSchema = z.object({
    id: z.string(),
    type: z.string(),
    content: z.string(),
    metadata: z.record(z.any()).default({}),
    start_time: z.union([z.string(), z.date()]),
    end_time: z.union([z.string(), z.date()]).optional(),
    participants: z.array(z.object({
        entity_id: z.string(),
        name: z.string().optional(),
        metadata: z.record(z.any()).optional()
    })).default([]),
    tasks: z.array(TaskSchema).default([])
});
//# sourceMappingURL=index.js.map