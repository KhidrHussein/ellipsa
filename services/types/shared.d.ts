// Type declarations for @ellipsa/shared module
declare module '@ellipsa/shared' {
  import { z } from 'zod';

  // Re-export zod for type inference
  export { z };

  // Entity
  export interface IEntity {
    id: string;
    canonical_name: string;
    aliases: string[];
    type: string;
    metadata: Record<string, any>;
    relationship_strength?: number;
    default_persona?: string;
    created_at?: string;
    last_seen_at?: string;
  }

  // Task
  export interface ITask {
    id: string;
    text: string;
    owner: string;
    due_ts?: string;
    status: string;
    linked_entities: string[];
    origin_event_id?: string;
    actionability_score?: number;
  }

  // Event
  export interface IEvent {
    id: string;
    type: string;
    start_ts: string;
    end_ts?: string;
    participants: string[];
    source_app?: string;
    summary_text: string;
    action_items: ITask[];
    tone_summary?: any;
    confidence_score?: number;
    provenance: string[];
  }

  // Ingest
  export interface IIngest {
    agent_id: string;
    session_id: string;
    segment_ts: string;
    event?: IEvent;
    media_type?: string;
    media_path?: string;
    transcription?: string | {
      text: string;
      language: string;
      segments: Array<{
        start: number;
        end: number;
        text: string;
        confidence: number;
      }>;
    };
    audio_ref?: string;
    meta?: {
      duration?: number;
      format?: string;
      sampleRate?: number;
      channels?: number;
      bitDepth?: number;
      [key: string]: any;
    };
  }

  // Export types
  export type Entity = IEntity;
  export type Task = ITask;
  export type Event = IEvent;
  export type Ingest = IIngest;

  // Export schemas
  export const EntitySchema: z.ZodObject<any>;
  export const TaskSchema: z.ZodObject<any>;
  export const EventSchema: z.ZodObject<any>;
  export const IngestSchema: z.ZodObject<any>;
}
