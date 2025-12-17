import { Knex } from 'knex';
import { z, type ZodType } from 'zod';
import { BaseModel } from './BaseModel';

// Draft Schema
export const DraftSchema = z.object({
    id: z.string().uuid().optional(),
    thread_id: z.string().optional(),
    to: z.array(z.any()).default([]), // Store as JSON
    cc: z.array(z.any()).default([]), // Store as JSON
    bcc: z.array(z.any()).default([]), // Store as JSON
    subject: z.string().default(''),
    body: z.string().default(''),
    html: z.string().optional(),
    in_reply_to: z.string().optional(),
    references: z.array(z.string()).default([]),
    email_id: z.string().optional(),
    attachments: z.array(z.any()).default([]), // Store as JSON
    status: z.enum(['draft', 'sent', 'failed']).default('draft'),
    metadata: z.record(z.unknown()).default({}),
    created_at: z.date().or(z.string()).optional(),
    updated_at: z.date().or(z.string()).optional(),
    deleted_at: z.date().or(z.string()).nullable().optional(),
});

export type Draft = z.infer<typeof DraftSchema>;
type DraftInput = Omit<Draft, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>;
type DraftUpdate = Partial<Omit<Draft, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>>;

export class DraftModel extends BaseModel<Draft, DraftInput, DraftUpdate> {
    constructor(db: Knex) {
        super('drafts', DraftSchema as unknown as ZodType<Draft>, db, true);
    }

    // Add any draft-specific methods here if needed
    async findByThreadId(threadId: string): Promise<Draft | null> {
        return this.findOne({ thread_id: threadId });
    }
}
