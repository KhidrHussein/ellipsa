import { z } from "zod";

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
export type Entity = z.infer<typeof EntitySchema>;

export const TaskSchema = z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().optional(),
    status: z.enum(['pending', 'in_progress', 'completed', 'failed']).default('pending'),
    priority: z.enum(['low', 'medium', 'high']).default('medium'),
    due_date: z.string().optional(),
    source: z.enum(['user', 'system', 'chat', 'email', 'assistant']).optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
    metadata: z.record(z.any()).default({})
});
export type Task = z.infer<typeof TaskSchema>;

export const EventSchema = z.object({
    id: z.string(),
    type: z.string(),
    title: z.string().optional(), // Added for Timeline display
    content: z.string().optional(), // Memory service uses content
    summary_text: z.string().optional(), // Processor uses summary_text
    metadata: z.record(z.any()).default({}).optional(),
    start_time: z.union([z.string(), z.date()]).optional(),
    end_time: z.union([z.string(), z.date()]).optional(),
    start_ts: z.string().optional(), // Processor
    end_ts: z.string().optional(), // Processor
    participants: z.array(z.union([z.string(), z.object({
        entity_id: z.string(),
        name: z.string().optional(),
        metadata: z.record(z.any()).optional()
    })])).default([]).optional(),
    tasks: z.array(TaskSchema).default([]).optional(),
    action_items: z.array(z.any()).optional(), // Processor
    source_app: z.string().optional(),
    tone_summary: z.any().optional(),
    confidence_score: z.number().optional(),
    provenance: z.array(z.string()).optional()
});
export type Event = z.infer<typeof EventSchema>;
