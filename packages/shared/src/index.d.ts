import { z } from "zod";
export { ServiceClient } from './clients/ServiceClient.js';
export { MemoryClient } from './clients/MemoryClient.js';
export type { MemoryEvent, RetrieveOptions, RetrieveResult } from './clients/MemoryClient.js';
export { logger } from './utils/logger.js';
export type { INotification, INotificationService } from './notification/INotificationService.js';
export declare const EntitySchema: z.ZodObject<{
    id: z.ZodString;
    canonical_name: z.ZodString;
    aliases: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    type: z.ZodString;
    metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodAny>>;
    relationship_strength: z.ZodOptional<z.ZodNumber>;
    default_persona: z.ZodOptional<z.ZodString>;
    created_at: z.ZodOptional<z.ZodString>;
    last_seen_at: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    metadata?: Record<string, any>;
    type?: string;
    id?: string;
    canonical_name?: string;
    aliases?: string[];
    relationship_strength?: number;
    default_persona?: string;
    created_at?: string;
    last_seen_at?: string;
}, {
    metadata?: Record<string, any>;
    type?: string;
    id?: string;
    canonical_name?: string;
    aliases?: string[];
    relationship_strength?: number;
    default_persona?: string;
    created_at?: string;
    last_seen_at?: string;
}>;
export type Entity = z.infer<typeof EntitySchema>;
export declare const TaskSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    status: z.ZodDefault<z.ZodEnum<["pending", "in_progress", "completed", "failed"]>>;
    priority: z.ZodDefault<z.ZodEnum<["low", "medium", "high"]>>;
    due_date: z.ZodOptional<z.ZodString>;
    created_at: z.ZodOptional<z.ZodString>;
    updated_at: z.ZodOptional<z.ZodString>;
    metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    status?: "failed" | "pending" | "in_progress" | "completed";
    title?: string;
    metadata?: Record<string, any>;
    id?: string;
    created_at?: string;
    description?: string;
    priority?: "low" | "medium" | "high";
    due_date?: string;
    updated_at?: string;
}, {
    status?: "failed" | "pending" | "in_progress" | "completed";
    title?: string;
    metadata?: Record<string, any>;
    id?: string;
    created_at?: string;
    description?: string;
    priority?: "low" | "medium" | "high";
    due_date?: string;
    updated_at?: string;
}>;
export type Task = z.infer<typeof TaskSchema>;
export declare const EventSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodString;
    content: z.ZodString;
    metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodAny>>;
    start_time: z.ZodUnion<[z.ZodString, z.ZodDate]>;
    end_time: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodDate]>>;
    participants: z.ZodDefault<z.ZodArray<z.ZodObject<{
        entity_id: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, "strip", z.ZodTypeAny, {
        metadata?: Record<string, any>;
        name?: string;
        entity_id?: string;
    }, {
        metadata?: Record<string, any>;
        name?: string;
        entity_id?: string;
    }>, "many">>;
    tasks: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        status: z.ZodDefault<z.ZodEnum<["pending", "in_progress", "completed", "failed"]>>;
        priority: z.ZodDefault<z.ZodEnum<["low", "medium", "high"]>>;
        due_date: z.ZodOptional<z.ZodString>;
        created_at: z.ZodOptional<z.ZodString>;
        updated_at: z.ZodOptional<z.ZodString>;
        metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, "strip", z.ZodTypeAny, {
        status?: "failed" | "pending" | "in_progress" | "completed";
        title?: string;
        metadata?: Record<string, any>;
        id?: string;
        created_at?: string;
        description?: string;
        priority?: "low" | "medium" | "high";
        due_date?: string;
        updated_at?: string;
    }, {
        status?: "failed" | "pending" | "in_progress" | "completed";
        title?: string;
        metadata?: Record<string, any>;
        id?: string;
        created_at?: string;
        description?: string;
        priority?: "low" | "medium" | "high";
        due_date?: string;
        updated_at?: string;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    metadata?: Record<string, any>;
    type?: string;
    id?: string;
    content?: string;
    start_time?: string | Date;
    end_time?: string | Date;
    participants?: {
        metadata?: Record<string, any>;
        name?: string;
        entity_id?: string;
    }[];
    tasks?: {
        status?: "failed" | "pending" | "in_progress" | "completed";
        title?: string;
        metadata?: Record<string, any>;
        id?: string;
        created_at?: string;
        description?: string;
        priority?: "low" | "medium" | "high";
        due_date?: string;
        updated_at?: string;
    }[];
}, {
    metadata?: Record<string, any>;
    type?: string;
    id?: string;
    content?: string;
    start_time?: string | Date;
    end_time?: string | Date;
    participants?: {
        metadata?: Record<string, any>;
        name?: string;
        entity_id?: string;
    }[];
    tasks?: {
        status?: "failed" | "pending" | "in_progress" | "completed";
        title?: string;
        metadata?: Record<string, any>;
        id?: string;
        created_at?: string;
        description?: string;
        priority?: "low" | "medium" | "high";
        due_date?: string;
        updated_at?: string;
    }[];
}>;
export type Event = z.infer<typeof EventSchema>;
export type PaginationOptions = {
    limit: number;
    offset: number;
    orderBy?: string;
    orderDirection?: 'asc' | 'desc';
};
//# sourceMappingURL=index.d.ts.map