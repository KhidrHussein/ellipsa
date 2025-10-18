// Type definitions for @ellipsa/shared
declare module '@ellipsa/shared' {
  import { z } from 'zod';

  export const EntitySchema: z.ZodObject<{
    id: z.ZodString;
    canonical_name: z.ZodString;
    aliases: z.ZodArray<z.ZodString, 'many'>;
    type: z.ZodString;
    metadata: z.ZodRecord<z.ZodString, z.ZodAny>;
    relationship_strength: z.ZodOptional<z.ZodNumber>;
    default_persona: z.ZodOptional<z.ZodString>;
    created_at: z.ZodOptional<z.ZodString>;
    last_seen_at: z.ZodOptional<z.ZodString>;
  }>;
  export type Entity = z.infer<typeof EntitySchema>;

  export const TaskSchema: z.ZodObject<{
    id: z.ZodString;
    text: z.ZodString;
    owner: z.ZodString;
    due_ts: z.ZodOptional<z.ZodString>;
    status: z.ZodDefault<z.ZodString>;
    linked_entities: z.ZodArray<z.ZodString, 'many'>;
    origin_event_id: z.ZodOptional<z.ZodString>;
    actionability_score: z.ZodOptional<z.ZodNumber>;
  }>;
  export type Task = z.infer<typeof TaskSchema>;

  export const EventSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodString;
    start_ts: z.ZodString;
    end_ts: z.ZodOptional<z.ZodString>;
    participants: z.ZodArray<z.ZodString, 'many'>;
    source_app: z.ZodOptional<z.ZodString>;
    summary_text: z.ZodString;
    action_items: z.ZodArray<z.ZodType<Task, any, any>, 'many'>;
    tone_summary: z.ZodOptional<z.ZodAny>;
    confidence_score: z.ZodOptional<z.ZodNumber>;
    provenance: z.ZodArray<z.ZodString, 'many'>;
  }>;
  export type Event = z.infer<typeof EventSchema>;

  export type TranscriptionSegment = {
    start: number;
    end: number;
    text: string;
    confidence: number;
  };

  export type Transcription = {
    text: string;
    language: string;
    segments: TranscriptionSegment[];
  };

  export type Ingest = {
    agent_id: string;
    session_id: string;
    segment_ts: string;
    audio_ref?: string;
    screenshot_ref?: string;
    active_window?: string;
    meta?: Record<string, any>;
    transcription?: Transcription;
  };
}
