// Type declarations for @ellipsa/shared module
declare module '@ellipsa/shared' {
  import { z } from 'zod';

  // Re-export zod for type inference
  export { z };

  // Entity
  export interface Entity {
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
  export interface Task {
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
  export interface Event {
    id: string;
    type: string;
    start_ts: string;
    end_ts?: string;
    participants: string[];
    source_app?: string;
    summary_text: string;
    action_items: Task[];
    tone_summary?: any;
    confidence_score?: number;
    provenance: string[];
  }

  // Ingest
  export interface Ingest {
    agent_id: string;
    session_id: string;
    segment_ts: string;
    event?: Event;  // Made optional
    media_type?: string;  // Made optional
    media_path?: string;  // Made optional
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
      [key: string]: any;  // Allow any additional properties
    };
  }

  // Export schemas as any to maintain compatibility
  export const EntitySchema: any;
  export const TaskSchema: any;
  export const EventSchema: any;
  export const IngestSchema: any;
}
