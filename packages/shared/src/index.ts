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
  text: z.string(),
  owner: z.string(),
  due_ts: z.string().optional(),
  status: z.string().default("open"),
  linked_entities: z.array(z.string()).default([]),
  origin_event_id: z.string().optional(),
  actionability_score: z.number().optional()
});
export type Task = z.infer<typeof TaskSchema>;

export const EventSchema = z.object({
  id: z.string(),
  type: z.string(),
  start_ts: z.string(),
  end_ts: z.string().optional(),
  participants: z.array(z.string()).default([]),
  source_app: z.string().optional(),
  summary_text: z.string(),
  action_items: z.array(TaskSchema).default([]),
  tone_summary: z.any().optional(),
  confidence_score: z.number().optional(),
  provenance: z.array(z.string()).default([])
});
export type Event = z.infer<typeof EventSchema>;

export const MemorySummarySchema = z.object({
  id: z.string(),
  scope: z.string(),
  scope_id: z.string(),
  period_start: z.string(),
  period_end: z.string(),
  summary_text: z.string(),
  embedding_id: z.string().optional()
});
export type MemorySummary = z.infer<typeof MemorySummarySchema>;

export const IngestSchema = z.object({
  agent_id: z.string(),
  session_id: z.string(),
  segment_ts: z.string(),
  audio_ref: z.string().optional(),
  screenshot_ref: z.string().optional(),
  active_window: z.string().optional(),
  meta: z.record(z.any()).optional()
});
export type Ingest = z.infer<typeof IngestSchema>;
