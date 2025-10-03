# ellipsa — v1 Design & Integration Spec

**Version:** 0.1

**Purpose:** This document is a single-source-of-truth design and integration specification for the ellipsa v1 (Enthusiast MVP). It describes system architecture, data models, pipelines, UX contracts, component APIs, security/privacy constraints, developer interfaces, prompts/templates, telemetry, rollout plan, and implementation roadmap. Use this to coordinate work across frontend, backend, infra, ML, and product teams.

---

## Table of Contents
1. High-level product overview
2. System architecture & components
3. Data model & JSON schemas
4. Capture & processing pipeline
5. Memory store design (vector + graph + relational)
6. Retrieval, ranking and prompting strategy
7. Actions & automation layer
8. UX contracts & interaction flows
9. Privacy, security, and compliance
10. Infrastructure, hosting & deployment
11. APIs and SDK contracts (component-to-component)
12. Dev & QA plan (tests, monitoring, metrics)
13. Roadmap & milestones
14. Appendix: prompt templates, sample sequences, etc.

---

## 1. High-level product overview

**Vision:** a persistent "AI self" that lives on the user’s machine as a floating button/dock. It passively observes (when allowed), builds structured temporal memory about people, events, and commitments, and can perform computer actions on behalf of the user in a controlled, auditable fashion.

**Key principles:**
- Ambient, user-controlled presence (floating button).  
- Memory as structured, temporal knowledge (events & entities).  
- Distillation > verbatim storage (summaries + pointers).  
- Actionability & progressive autonomy (suggest-first → semi-automated).  
- Local-first defaults and strong privacy controls.

**Primary v1 capabilities:**
- Floating button overlay (toggle observe mode).  
- Meeting listening (ASR) and summarization.  
- Screen capture (OCR + window titling) to add context.  
- Relationship (entity) cards and timeline.  
- Controlled actions (draft email via webmail, calendar create, file search, paste).  

**Target audience:** AI enthusiasts (power users) willing to run a local desktop companion and grant elevated access for the novelty and power.

---

## 2. Core Principles
### 2.1 Design Philosophy

The design philosophy of AI Self emphasizes a balance between power, trust, and subtlety. From our discussions, three guiding pillars emerge:

Non-Invasive Presence: The AI is always available but never overwhelming. The floating button and simple overlays serve as opt-in entry points rather than intrusive pop-ups. Indicators are clear but minimal—users remain in control of when the AI observes or acts.

Conversational & Human-Centric Interaction: Interaction is as natural as speaking or jotting down a note. Responses and suggestions are concise, contextual, and tuned to the user’s prior tone. The AI Self should feel like a quiet extension of the user, not a separate entity.

Visual Identity & UX Coherence: The system favors minimal, monotone aesthetics (e.g., black & white, smooth cursive typography) to emphasize continuity and timelessness. The ellipsis motif (“…”) symbolizes ongoing thought, memory, and presence, and can double as a lightweight icon for the always-on button.

Progressive Autonomy: The AI Self grows in capability as user trust builds. Early experiences are transparent and confirmatory; over time, trusted workflows become automatic. The UX scaffolds this journey, making control explicit and autonomy a choice.

Together, these principles ensure that AI Self feels personal, trustworthy, and enduring, rather than experimental or temporary.

Persistent Memory: The system remembers everything across time, platforms, and modalities.

Chronology & Context: Events, interactions, and relationships are stored along a timeline with causal links.

Action Capability: The AI doesn’t just remind—it executes tasks on behalf of the user.

User-Centric UX: A non-invasive, always-available interface (the “AI Self button”).

Progressive Autonomy: Starts with opt-in confirmations, evolves to trusted, semi-autonomous execution.

Horizontal Foundation: One system that adapts to many domains, not verticalized niche tools.

## 3. System architecture & components

### 3.1 High-level components

- **Edge Agent (Desktop Companion)** — Electron-based app or native lightweight agent. Handles UI overlay (floating button), local capture (microphone, screen snapshots), local buffering, local policy enforcement, local storage, and local action execution via Playwright / OS automation. Runs on Windows/macOS/Linux.

- **Processor Service (Cloud / Local)** — Converts raw captures into structured Events: ASR, OCR, app-context parsing, and LLM-based summarization/extraction. Can be deployed as cloud service initially or optionally run in user's LAN for local-only mode.

- **Memory Service** — Stores structured objects (Entities, Events, ActionItems) in hybrid stores: Vector DB (semantic retrieval), Graph/Relational DB (relationships & indexes), encrypted blob store for raw captures (local-first). Provides retrieval APIs and consolidation jobs.

- **Action Service (Local + Controller)** — Responsible for executing actions on the user's machine. Exposes a local action executor that receives action plans and performs steps via Playwright, accessibility APIs or OS scripting.

- **Frontend UI** — Floating button overlay, timeline UI, person-cards, morning/ evening briefings, settings/privacy controls.

- **Prompt Service** — Manages LLM prompt templates, rate-limits, and provider interface (OpenAI, Anthropic, local LLM). Produces structured JSON responses.

- **Telemetry & Monitoring** — Collects anonymized metrics (with opt-in), error logs, and safety incidents. Local-first telemetry defaults to disabled for privacy-focused builds.

- **Security Layer** — Key management, encryption at rest/in transit, zero-knowledge mode option, audit logs.

### 3.2 Component interactions (sequence)

1. User toggles floating button to *observe mode*. Edge Agent starts capturing audio + periodic screenshots & window titles; buffers locally.
2. Edge Agent posts short segments to Processor (local or cloud) or performs local ASR/OCR if configured local-only.
3. Processor runs ASR/OCR and calls Prompt Service with transcripts & context to get a structured Event (JSON with summary, action_items, participants, tone, confidence).
4. Processor returns the Event to Memory Service; Memory Service stores embeddings in Vector DB, updates Graph DB.
5. UI displays post-meeting toast: asks user to verify low-confidence items or accept action items. User edits; edits are fed back to Memory Service.
6. When user asks the agent a question or triggers an action, the Prompt Service queries Memory Service (top-K retrieval), re-ranks results using temporal & relation weights, and constructs a prompt with distilled context for the LLM. LLM returns a response / draft / action plan.
7. For an action, Action Service executes (with approval) via local automation; Action Service reports provenance back to Memory Service.

(Sequence diagram in Appendix A).

---

## 4. Data model & JSON schemas

> Use canonical IDs prefixed by type (`ent_`, `evt_`, `task_`). Store JSON blobs and structured DB rows. Keep schema backwards compatible by adding fields, not renaming.

### 4.1 Primary objects

#### Entity
```json
{
  "id": "ent_alice_001",
  "canonical_name": "Alice Jones",
  "aliases": ["Alice J.", "alice@acme.com"],
  "type": "person",
  "metadata": {"org":"ACME","title":"VP Sales"},
  "relationship_strength": 0.72,
  "default_persona": "formal",
  "created_at": "2025-09-27T09:00:00Z",
  "last_seen_at": "2025-09-27T11:05:00Z"
}
```

#### Event
```json
{
  "id": "evt_20250927_001",
  "type": "meeting",
  "start_ts": "2025-09-27T09:05:00Z",
  "end_ts": "2025-09-27T09:40:00Z",
  "participants": ["ent_alice_001","ent_bob_002","ent_you"],
  "source_app": "zoom",
  "summary_text": "Alice expressed budget concerns; Bob promised updated forecast by 2025-10-02.",
  "action_items": [{"id":"task_42","text":"Request forecast from Bob","owner":"you","due_ts":"2025-10-02T00:00:00Z","status":"open"}],
  "tone_summary": {"valence":"concerned","confidence":0.86},
  "confidence_score": 0.83,
  "provenance": ["local_asr:segment_34","ocr:slide_2"]
}
```

#### ActionItem / Task
```json
{
  "id": "task_42",
  "text": "Request forecast from Bob",
  "owner": "you",
  "due_ts": "2025-10-02T00:00:00Z",
  "status": "open",
  "linked_entities": ["ent_bob_002"],
  "origin_event_id": "evt_20250927_001",
  "actionability_score": 0.9
}
```

#### Assertion / Fact
```json
{
  "id": "fact_7",
  "statement_text": "Alice Jones is VP Sales at ACME",
  "source_event_id": "evt_20250910_002",
  "confidence": 0.94,
  "last_verified_ts": "2025-09-27T09:02:00Z"
}
```

#### MemorySummary
```json
{
  "id": "ms_20250927_ent_alice_001",
  "scope": "entity",
  "scope_id": "ent_alice_001",
  "period_start": "2025-09-01T00:00:00Z",
  "period_end": "2025-09-27T00:00:00Z",
  "summary_text": "Alice has been concerned about budgets; promises were made to provide forecasts; interaction tone is increasingly urgent.",
  "embedding_id": "emb_..."
}
```

### 4.2 Indexing & retrieval keys
- Vector DB embedding per Event.summary_text and MemorySummary.  
- Graph edges: `entity -[INTERACTED_WITH {count, last_ts}]-> entity`, `entity -[PART_OF]-> event`, `event -[HAS_ACTION]-> task`.  
- Relational DB tables for quick lookups (events by date, tasks by status).  

---

## 5. Capture & processing pipeline

### 5.1 Edge Agent capture
- **Triggers:** user toggles observe mode or presses quick capture.  
- **Captured signals:** audio segments (configurable chunk size, default 10–30s), periodic screenshots (configurable cadence, default every 5–30s during observe sessions), active window title + URL, clipboard events (if allowed), explicit user pins.
- **Local buffer:** raw data stored in encrypted local buffer; retention default 7 days if not processed; user can change.
- **Filters:** edge filters remove obvious noise (silence <3s, non-human audio, screensaver windows) and remove sensitive domains (banking sites) if user toggles blocklist.

### 5.2 ASR + OCR
- **ASR Options:**
  - Local: open-source models (Whisper small/medium via local GPU/CPU), VOSK for low-resource, or an optional local tiny-ASR for offline.  
  - Cloud: provider ASR (OpenAI, Google Cloud Speech-to-Text) when user opts into cloud processing.
- **OCR:** Tesseract or cloud OCR for higher accuracy; use DOM scraping for browser content where possible (prefer DOM to reduce OCR errors).

### 5.3 App-context parsing
- Use heuristics to detect event type: if active window contains "zoom.us" or meet.google.com, classify as meeting. If active window contains "mail.google.com" or Outlook, classify as email. If Google Docs/Notion, classify as doc-edit. The Edge Agent tags events with `source_app`.

### 5.4 LLM-based extraction
- **Prompt Service** receives transcript + context + short state (participant hints, previous MemorySummary).  
- Use strict JSON output prompts: `{summary, participants[], action_items[], dates_mentioned[], tone, confidence}`.  
- If `confidence` < threshold (e.g., 0.6), mark Event for user verification.

### 5.5 Storage & consolidation
- Emit Event to Memory Service; Memory Service stores embedding and relational edges.  
- End-of-day consolidation job runs: groups events in sessions, creates MemorySummary objects, computes temporal embeddings, prunes according to lifecycle policy.

---

## 6. Memory store design (vector + graph + relational)

### 6.1 Storage components (recommended stack)
- **Vector DB:** `pgvector` (Postgres extension) for self-hosting convenience or `Milvus/Pinecone/Weaviate` for scalability.  
- **Graph DB:** `Neo4j` or `Postgres with edges table` for relationships. Use Neo4j if complex graph queries are needed.  
- **Relational DB:** `Postgres` for metadata, audit logs, indexes.  
- **Blob Store:** encrypted local file store for raw audio/screenshots; optional cloud blob store (S3) for sync.  

### 6.2 Hybrid storage pattern
- **Hot lane (local):** raw captures (encrypted), session buffer, recent Event objects (week).  
- **Warm lane (cloud optional):** summarized Event objects and embeddings, MemorySummary.  
- **Cold lane:** aggregated MemorySummary only, raw deleted unless user pinned.

### 6.3 Indexes & queries
- Composite index for events by `entity_id` + `start_ts`.  
- Vector index for semantic similarity on `summary_text` embeddings.  
- Graph edge indexes for fast neighbor queries (top contacts).  

---

## 7. Retrieval, ranking and prompting strategy

### 7.1 Two-stage retrieval
1. **Semantic retrieval (vector):** query embedding → top-N candidate MemorySummaries / Events.  
2. **Rerank:** apply score = `w_sem * sim + w_time * recency_score + w_rel * rel_strength + w_act * actionability`. Tunable weights per retrieval intent.

### 7.2 Temporal embeddings & recency score
- **Recency score:** exponential decay function `recency_score = exp(-λ * age_days)` where λ is tuned.  
- **Temporal embedding:** optional learned encoding of time (e.g., timestamp → sin/cos features + fed to small encoder) combined with semantic embedding; this allows time-aware nearest-neighbor search when needed.

### 7.3 Prompt construction
- Limit context tokens by sending distilled top-K MemorySummary bullet points and at most M event summaries (e.g., K=6, M=3).  
- Provide explicit chronology block in prompt: list events with dates and action items.  
- Provide system instruction: "When drafting an email, echo last 2 interactions with this person and suggested tone (formal/concise)."  

### 7.4 Prompt templates (see Appendix)
- Use JSON-only response templates to enforce structure.

---

## 8. Computer Use (Action Execution)

The AI Self must not only remind or suggest, but actually do things on the user’s behalf. Computer use is therefore a core capability. To balance feasibility and vision, we define two tracks:

### 8.1 Phase 1: Pragmatic MVP Automation (Now)

Focus: Safe, deterministic control over high-leverage apps

#### OS-Level Automation

Use accessibility APIs and scripting hooks (e.g., AppleScript/Automator on macOS, Windows UIA/PowerShell, Linux X11/Wayland automation).

Capabilities: open/close apps, navigate menus, type keystrokes, capture screenshots, copy/paste.

#### 8.1.2 Browser Automation

Headless browser (e.g., Puppeteer/Playwright) controlled by the agent.
Enables web actions where APIs aren’t available: log into portals, draft/send emails, update Notion boards, etc.

#### 8.1.3 Direct APIs Where Available

Gmail, Slack, Notion, Calendar, GitHub → use APIs for reliability when official integrations exist.
Hybrid approach: if API fails, fall back to UI/browser automation.

#### 8.1.4 Safety

Allowlist of applications/domains to start.
Confirm actions with the user for anything destructive (e.g., sending email, deleting files).

### 8.2 Phase 2: Frontier Computer Use Agents (Later)

Focus: General, human-like ability to see and act on the desktop

#### 8.2.1 OpenAI’s Computer Use API

Once public, integrates directly into the stack. The model “sees” the screen and can click/type just like a human.

#### 8.2.2 Alternative Models

Adept ACT-1 (if accessible), or open-source equivalents combining vision + action reinforcement.
Potential to run in a sandboxed VM for safety (agent experiments without touching the real OS first).

#### 8.2.3 Advantages Over Phase 1

No need to predefine workflows or app-specific logic.
Works universally across apps, even custom ones.
Enables “true AI self” that literally uses your computer as you do.

#### 8.2.4 Challenges

High compute cost (GPU inference).
Still brittle; needs fallback to Phase 1 automations for reliability.
Safety sandboxing critical to avoid mistakes.

#### 8.2.5 Integration with Memory + Chronology

Every action taken (API, script, or frontier agent) is logged into the Memory Layer with:
Timestamp (chronology).
Context (what triggered the action).
Outcome (success/failure, confirmation if required).
This builds a full “action history” → the user can review or undo actions.
Over time, the agent learns how the user prefers things done (tone in emails, favorite tools, workflow order).

#### 8.2.6 UX Implications

Always-On Button

When clicked, user can see:
What the agent is doing now.
Recent actions taken.
Suggested next actions.
Serves as a trust layer between user and automation.
Progressive Autonomy
Start: Agent asks permission before executing.
Later: User can toggle “auto-execute” for specific workflows (“Always send daily digest email at 9am”).

#### 8.2.6 Summary:

Phase 1 → deterministic automation (safe, shippable, illusion of AI self).
Phase 2 → frontier “computer use” agent (the vision: true AI self acting like you).
Both integrated into the same memory/chronology + UX, so the system evolves without breaking the foundation.

## 9. UX contracts & interaction flows

> Below are canonical UX flows. Each flow includes: triggers, expected backend interactions, UI states, and error handling.

### 9.1 Floating button behaviors
- **Single tap:** open chat/composer overlay.  
- **Long-press:** toggle observe mode.  
- **Swipe up:** open morning briefing.  
- **Visual states:** idle (grey), observing (pulsing red), action pending (blue dot with count), notification (badge).  

### 9.2 Observe session (meeting)
**Trigger:** user long-presses button or clicks "observe" before/after meeting starts.
**Flow:**
1. Edge Agent starts local buffer.  
2. ASR segments forwarded to Processor for live summarization (if local model available) or batched processing after meeting.  
3. After meeting, UI shows a non-intrusive toast: "Captured 3 items — review?" with Accept/Review/Discard.  
4. If user clicks Review, open timeline with Event summary, suggested action items with checkboxes.

**Error handling:** ASR failures -> show transcript with low confidence note; option to upload audio for cloud processing.

### 9.3 Morning briefing
**Trigger:** user swipes up or scheduled auto-run.
**Contents:** 3 top priorities, drafted emails, 1-sentence brief per meeting, outstanding tasks (top 5).  
**Backend:** MemoryService fetch (recency-weighted) → PromptService constructs short briefing text.

### 9.4 Person card
**Trigger:** inline card appears when user composes an email to someone or clicks entity in timeline.
**Contents:** last 3 interactions, tone history graph (sparkline), open promises, suggested openers, quick-actions (draft reply, schedule call, mark follow-up).  
**Backend:** re-rank memories for the person, build concise MemorySummary.

### 9.5 Action approval
- Actions must show a deterministic step list and the user must press "Approve".  
- For email sends: show draft in native editor with Send button pre-filled (user must click Send unless user has granted auto-send permission).  

---

## 10. Privacy, security, and compliance

### 10.1 Default policy
- **Local-first**: raw audio/screenshots stay on-device by default. Summaries may be uploaded only if user explicitly enables cloud sync.  
- **Visible indicator**: persistent visual cue when recording/observing.  
- **Granular controls**: per-app and per-domain toggles; per-contact exclusions; manual pinning.  

### 10.2 Data lifecycle & retention
- **Hot:** local raw for 7 days.  
- **Warm:** summaries + embeddings for 7–90 days.  
- **Cold:** summaries only beyond 90 days.  
- User-configurable retention and automatic purge.  

### 10.3 Encryption & key management
- **Local storage:** AES-256 encrypted, key derived from user password or OS keyring.  
- **Cloud storage (optional):** server-side encryption + TLS. Option for zero-knowledge where encryption keys never leave device (adds complexity for server features like search unless client-assisted search is implemented).  

### 10.4 Compliance
- Implement data access & deletion flows for GDPR.  
- Provide enterprise SSO/SCIM and audit trails.  
- Maintain explicit consent logs for recordings.

### 10.5 Security hardening
- Least privileged agents.  
- Sandboxing for automation tasks.  
- Signed updates for desktop agent.  
- Rate limit for action requests.

---

## 11. Infrastructure, hosting & deployment

### 11.1 Suggested infra stack
- **Edge Agent:** Electron or native builds (recommended: Electron for faster iteration).  
- **Processor Service:** Kubernetes cluster; containerized microservices for ASR, OCR, LLM prompt orchestration.  
- **Memory Service:** Postgres + pgvector (or Milvus), optional Neo4j for graph workloads; S3 for blobs.  
- **Prompt Service:** serverless or Fargate functions that call LLM provider(s).  
- **Action Service:** local executor; cloud controller only for telemetry & updates.  

### 11.2 Deployment considerations
- Provide both a cloud-enabled mode and a local-only mode (for privacy-conscious users).  
- CI/CD for desktop releases (code signing).  
- Monitoring: Prometheus + Grafana for infra metrics; Sentry for errors.

---

## 12. APIs and SDK contracts (component-to-component)

Design APIs as REST/HTTP + gRPC where latency matters. Use JSON for payloads.

### 12.1 Edge Agent ↔ Processor
**Endpoint:** `POST /processor/v1/ingest`  
**Payload:**
```json
{
  "agent_id":"agent_abc",
  "session_id":"sess_20250927_01",
  "segment_ts":"2025-09-27T09:05:10Z",
  "audio_ref":"local://buf/seg_12.wav",
  "screenshot_ref":"local://buf/shot_12.png",
  "active_window":"Zoom - Project X Meeting",
  "meta":{"participants_hint":["alice@acme.com"],"observe_mode":true}
}
```
**Response:** Accepted with `ingest_id`; Processor will later submit structured Event via Memory Service webhook.

### 12.2 Processor → Memory Service
**Endpoint:** `POST /memory/v1/events`  
**Payload:** Event JSON (see schema).  
**Response:** `201 Created` with event id.

### 12.3 Frontend UI ↔ Memory Service
- `GET /memory/v1/entities/{entity_id}` → returns entity + MemorySummary bullets.  
- `GET /memory/v1/timeline?start=...&end=...` → returns events for timeline.  
- `POST /memory/v1/tasks` → create task.

### 12.4 Prompt Service ↔ LLM Provider
- `POST /prompt/v1/complete` with `system_prompt`, `user_prompt`, `context_memory[]` (distilled) and `response_schema`.  
- Response is JSON (structured). Use retries and response schema validation.

### 12.5 Action Service API
**From UI (approve action):** `POST /action/v1/execute`  
**Payload:**
```json
{
  "agent_id":"agent_abc",
  "plan": [
    {"op":"open_url","args":{"url":"https://mail.google.com/..."}},
    {"op":"type_text","args":{"selector":"#compose","text":"Hello..."}},
    {"op":"click","args":{"selector":"#send"}}
  ],
  "provenance":{"origin_event_id":"evt_...","prompt_id":"prom_..."}
}
```
**Response:** immediate execution report and `action_id`. Edge agent returns execution logs and can undo if supported.

### 12.6 Telemetry API
- Minimal telemetry collection controlled by user. `POST /telemetry/v1/event` with anonymized usage metrics.

---

## 13. Dev & QA plan (tests, monitoring, metrics)

### 13.1 Unit & integration tests
- Processor tests: given transcript + context, ensure JSON extraction matches expected schema.  
- Memory tests: insertion + retrieval + re-rank correctness.  
- Action tests: simulated UI (headless) execution with Playwright to validate selectors.  

### 13.2 End-to-end tests
- Simulate observe session, run through ASR→Processor→Memory→Prompt→Action flow in staging.  
- Test undo flows and conflict resolution.

### 13.3 Monitoring & alerts
- Latency SLOs: end-to-end extraction < 8s for interactive snippets, < 30s for post-meeting batch.  
- Error rates & safety incidents tracked; automatic alerting for action failures.  

### 13.4 Key metrics (KPIs)
- Accept rate of generated drafts (email/meeting actions).  
- Average time saved per user/day (self-reported + approximated).  
- % of observe sessions enabled per DAU.  
- Memory quality: % edits, false positives rate.  

---

## 14. Roadmap & milestones

**Phase 0 (4–8 weeks):** prototype
- Edge floating button overlay.  
- Local buffer + minimal ASR (cloud or local).  
- Processor POC using remote LLM for summarization.  
- Timeline UI + person cards basics.  

**Phase 1 (3 months):** MVP for enthusiasts
- Localized ASR/OCR options.  
- Memory Service with vector + relational store.  
- Action primitives (browser automation via Playwright).  
- Morning/Evening briefings + person-cards.  

**Phase 2 (3–6 months):** trust & polish
- Temporal embeddings & consolidation jobs.  
- Fine-grained privacy controls & enterprise features.  
- Local-only mode hardened & signed builds.  

**Phase 3:** scale & productize
- Plugin system for power users.  
- Team-shared memories (permissions model).  
- More robust local LLM support and offline-first options.

---

## 15. Appendix

### 15.1 Sample prompt templates

**Summarizer / extractor** (system + user):
```
System: You are a summarizer. Output *ONLY* valid JSON with keys: summary, participants[], action_items[], dates_mentioned[], tone, confidence. Keep summary <= 3 sentences. For action_items return array of {text, owner, due_ts?}. Use ISO 8601 for dates.

User: Transcript: "<TRANSCRIPT>"
```

**Compose email (use memory)**
```
System: You are the user's writing persona. Key instructions: be concise, reflect user's previous tone with the recipient. Output JSON {draft_subject, draft_body_text, tone, references[]}.
User: Recipient entity id: ent_alice_001. Memory bullets: ["..."]. Instruction: "Draft a follow-up about the budget, remind them of promised numbers, be polite and concise."
```

### 15.2 Example sequences
- Observe session -> Event stored -> Post-meeting toast -> user approves -> Task created -> Reminder nudged -> user clicks suggested draft -> sends email (action).

### 15.3 Developer notes & implementation pitfalls
- **Selector fragility:** web UIs change; use robust selectors (ARIA labels or anchored DOM paths). Provide fallback to coordinate clicks for fragile pages.  
- **ASR errors:** low-quality audio or overlapping speech will reduce extraction accuracy. Build quick verification UX.  
- **Privacy churn:** make it trivially easy to disable or delete memories; early adopters will test boundaries.

---

### Contact & ownership
- Product Owner: [TBD]
- Backend Lead: [TBD]
- ML Lead: [TBD]
- Frontend Lead: [TBD]

---

*End of spec v0.1*


