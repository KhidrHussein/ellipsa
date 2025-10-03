import express from "express";
import cors from "cors";
import { z } from "zod";
import { EntitySchema, EventSchema } from "@ellipsa/shared/dist/index.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// In-memory stores for MVP
const entities = new Map<string, z.infer<typeof EntitySchema>>();
const events: z.infer<typeof EventSchema>[] = [];

app.post("/memory/v1/events", (req, res) => {
  const parsed = EventSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const evt = parsed.data;
  events.push(evt);
  // naive: update last_seen for participants
  evt.participants.forEach((pid: string) => {
    const ent = entities.get(pid);
    if (ent) entities.set(pid, { ...ent, last_seen_at: evt.start_ts });
  });
  return res.status(201).json({ id: evt.id });
});

app.get("/memory/v1/entities/:id", (req, res) => {
  const ent = entities.get(req.params.id);
  if (!ent) return res.status(404).json({ error: "not_found" });
  return res.json({ entity: ent, summaries: [] });
});

app.get("/memory/v1/timeline", (req, res) => {
  const { start, end } = req.query as { start?: string; end?: string };
  let result = events;
  if (start) result = result.filter((e) => e.start_ts >= start);
  if (end) result = result.filter((e) => !e.end_ts || e.end_ts <= end);
  return res.json({ events: result.slice(-200) });
});

app.post("/memory/v1/entities", (req, res) => {
  const parsed = EntitySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  entities.set(parsed.data.id, parsed.data);
  return res.status(201).json({ id: parsed.data.id });
});

const PORT = process.env.PORT || 4001;
app.listen(PORT, () => console.log(`[memory] listening on ${PORT}`));
