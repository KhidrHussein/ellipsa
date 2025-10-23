import { z } from 'zod';

export const ActionItemSchema = z.object({
  text: z.string(),
  due: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  status: z.enum(['pending', 'in_progress', 'completed']).default('pending'),
  metadata: z.record(z.unknown()).optional(),
});

export const EntitySchema = z.object({
  type: z.string(),
  value: z.string(),
  label: z.string().optional(),
  context: z.string().optional(),
});

export const ExtractionSchema = z.object({
  summary: z.string(),
  action_items: z.array(ActionItemSchema).default([]),
  entities: z.array(EntitySchema).default([]),
  topics: z.array(z.string()).default([]),
  sentiment: z.enum(['positive', 'neutral', 'negative']).optional(),
  confidence: z.number().min(0).max(1).default(0.8),
});

export type ActionItem = z.infer<typeof ActionItemSchema>;
export type Entity = z.infer<typeof EntitySchema>;
export type ExtractionResult = z.infer<typeof ExtractionSchema>;

// Function to validate extraction results
export function validateExtraction(data: unknown): ExtractionResult {
  return ExtractionSchema.parse(data);
}
