import { z } from "zod";
export { ServiceClient } from './clients/ServiceClient.js';
export { MemoryClient } from './clients/MemoryClient.js';
export type { MemoryEvent, RetrieveOptions, RetrieveResult } from './clients/MemoryClient.js';
export { logger } from './utils/logger.js';
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
    type: string;
    id: string;
    metadata: Record<string, any>;
    canonical_name: string;
    aliases: string[];
    created_at?: string | undefined;
    last_seen_at?: string | undefined;
    relationship_strength?: number | undefined;
    default_persona?: string | undefined;
}, {
    type: string;
    id: string;
    canonical_name: string;
    created_at?: string | undefined;
    metadata?: Record<string, any> | undefined;
    last_seen_at?: string | undefined;
    aliases?: string[] | undefined;
    relationship_strength?: number | undefined;
    default_persona?: string | undefined;
}>;
export type Entity = z.infer<typeof EntitySchema>;
export declare const TaskSchema: z.ZodObject<{
    id: z.ZodString;
    description: z.ZodString;
    status: z.ZodDefault<z.ZodEnum<["pending", "in_progress", "completed", "failed"]>>;
    priority: z.ZodDefault<z.ZodEnum<["low", "medium", "high"]>>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    status: "pending" | "in_progress" | "completed" | "failed";
    id: string;
    description: string;
    priority: "low" | "medium" | "high";
    metadata?: Record<string, any> | undefined;
}, {
    id: string;
    description: string;
    status?: "pending" | "in_progress" | "completed" | "failed" | undefined;
    metadata?: Record<string, any> | undefined;
    priority?: "low" | "medium" | "high" | undefined;
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
        entity_id: string;
        metadata?: Record<string, any> | undefined;
        name?: string | undefined;
    }, {
        entity_id: string;
        metadata?: Record<string, any> | undefined;
        name?: string | undefined;
    }>, "many">>;
    tasks: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        description: z.ZodString;
        status: z.ZodDefault<z.ZodEnum<["pending", "in_progress", "completed", "failed"]>>;
        priority: z.ZodDefault<z.ZodEnum<["low", "medium", "high"]>>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, "strip", z.ZodTypeAny, {
        status: "pending" | "in_progress" | "completed" | "failed";
        id: string;
        description: string;
        priority: "low" | "medium" | "high";
        metadata?: Record<string, any> | undefined;
    }, {
        id: string;
        description: string;
        status?: "pending" | "in_progress" | "completed" | "failed" | undefined;
        metadata?: Record<string, any> | undefined;
        priority?: "low" | "medium" | "high" | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    type: string;
    id: string;
    metadata: Record<string, any>;
    start_time: string | Date;
    participants: {
        entity_id: string;
        metadata?: Record<string, any> | undefined;
        name?: string | undefined;
    }[];
    tasks: {
        status: "pending" | "in_progress" | "completed" | "failed";
        id: string;
        description: string;
        priority: "low" | "medium" | "high";
        metadata?: Record<string, any> | undefined;
    }[];
    content: string;
    end_time?: string | Date | undefined;
}, {
    type: string;
    id: string;
    start_time: string | Date;
    content: string;
    metadata?: Record<string, any> | undefined;
    end_time?: string | Date | undefined;
    participants?: {
        entity_id: string;
        metadata?: Record<string, any> | undefined;
        name?: string | undefined;
    }[] | undefined;
    tasks?: {
        id: string;
        description: string;
        status?: "pending" | "in_progress" | "completed" | "failed" | undefined;
        metadata?: Record<string, any> | undefined;
        priority?: "low" | "medium" | "high" | undefined;
    }[] | undefined;
}>;
export type Event = z.infer<typeof EventSchema>;
export type PaginationOptions = {
    limit: number;
    offset: number;
    orderBy?: string;
    orderDirection?: 'asc' | 'desc';
};
