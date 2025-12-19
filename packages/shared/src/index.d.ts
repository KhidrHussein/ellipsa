import { z } from "zod";
export { ServiceClient } from './clients/ServiceClient.js';
export { MemoryClient } from './clients/MemoryClient.js';
export { PromptClient } from './clients/PromptClient.js';
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
    id: string;
    canonical_name: string;
    type: string;
    aliases: string[];
    metadata: Record<string, any>;
    relationship_strength?: number | undefined;
    default_persona?: string | undefined;
    created_at?: string | undefined;
    last_seen_at?: string | undefined;
}, {
    id: string;
    canonical_name: string;
    type: string;
    aliases?: string[] | undefined;
    metadata?: Record<string, any> | undefined;
    relationship_strength?: number | undefined;
    default_persona?: string | undefined;
    created_at?: string | undefined;
    last_seen_at?: string | undefined;
}>;
export type Entity = z.infer<typeof EntitySchema>;
export declare const TaskSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    status: z.ZodDefault<z.ZodEnum<["pending", "in_progress", "completed", "failed"]>>;
    priority: z.ZodDefault<z.ZodEnum<["low", "medium", "high"]>>;
    due_date: z.ZodOptional<z.ZodString>;
    source: z.ZodOptional<z.ZodEnum<["user", "system", "chat", "email", "assistant"]>>;
    created_at: z.ZodOptional<z.ZodString>;
    updated_at: z.ZodOptional<z.ZodString>;
    metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    status: "pending" | "in_progress" | "completed" | "failed";
    metadata: Record<string, any>;
    title: string;
    priority: "low" | "medium" | "high";
    created_at?: string | undefined;
    description?: string | undefined;
    due_date?: string | undefined;
    source?: "user" | "system" | "chat" | "email" | "assistant" | undefined;
    updated_at?: string | undefined;
}, {
    id: string;
    title: string;
    status?: "pending" | "in_progress" | "completed" | "failed" | undefined;
    metadata?: Record<string, any> | undefined;
    created_at?: string | undefined;
    description?: string | undefined;
    priority?: "low" | "medium" | "high" | undefined;
    due_date?: string | undefined;
    source?: "user" | "system" | "chat" | "email" | "assistant" | undefined;
    updated_at?: string | undefined;
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
        title: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        status: z.ZodDefault<z.ZodEnum<["pending", "in_progress", "completed", "failed"]>>;
        priority: z.ZodDefault<z.ZodEnum<["low", "medium", "high"]>>;
        due_date: z.ZodOptional<z.ZodString>;
        source: z.ZodOptional<z.ZodEnum<["user", "system", "chat", "email", "assistant"]>>;
        created_at: z.ZodOptional<z.ZodString>;
        updated_at: z.ZodOptional<z.ZodString>;
        metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        status: "pending" | "in_progress" | "completed" | "failed";
        metadata: Record<string, any>;
        title: string;
        priority: "low" | "medium" | "high";
        created_at?: string | undefined;
        description?: string | undefined;
        due_date?: string | undefined;
        source?: "user" | "system" | "chat" | "email" | "assistant" | undefined;
        updated_at?: string | undefined;
    }, {
        id: string;
        title: string;
        status?: "pending" | "in_progress" | "completed" | "failed" | undefined;
        metadata?: Record<string, any> | undefined;
        created_at?: string | undefined;
        description?: string | undefined;
        priority?: "low" | "medium" | "high" | undefined;
        due_date?: string | undefined;
        source?: "user" | "system" | "chat" | "email" | "assistant" | undefined;
        updated_at?: string | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    id: string;
    type: string;
    metadata: Record<string, any>;
    content: string;
    start_time: string | Date;
    participants: {
        entity_id: string;
        metadata?: Record<string, any> | undefined;
        name?: string | undefined;
    }[];
    tasks: {
        id: string;
        status: "pending" | "in_progress" | "completed" | "failed";
        metadata: Record<string, any>;
        title: string;
        priority: "low" | "medium" | "high";
        created_at?: string | undefined;
        description?: string | undefined;
        due_date?: string | undefined;
        source?: "user" | "system" | "chat" | "email" | "assistant" | undefined;
        updated_at?: string | undefined;
    }[];
    end_time?: string | Date | undefined;
}, {
    id: string;
    type: string;
    content: string;
    start_time: string | Date;
    metadata?: Record<string, any> | undefined;
    end_time?: string | Date | undefined;
    participants?: {
        entity_id: string;
        metadata?: Record<string, any> | undefined;
        name?: string | undefined;
    }[] | undefined;
    tasks?: {
        id: string;
        title: string;
        status?: "pending" | "in_progress" | "completed" | "failed" | undefined;
        metadata?: Record<string, any> | undefined;
        created_at?: string | undefined;
        description?: string | undefined;
        priority?: "low" | "medium" | "high" | undefined;
        due_date?: string | undefined;
        source?: "user" | "system" | "chat" | "email" | "assistant" | undefined;
        updated_at?: string | undefined;
    }[] | undefined;
}>;
export type Event = z.infer<typeof EventSchema>;
export type PaginationOptions = {
    limit: number;
    offset: number;
    orderBy?: string;
    orderDirection?: 'asc' | 'desc';
};
export * from './prompts.js';
//# sourceMappingURL=index.d.ts.map