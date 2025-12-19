# Ellipsa Longitudinal Intelligence – Product Flows (Implementation-Oriented)

> Purpose of this document
>
> This file defines **concrete, buildable product flows** that exploit Ellipsa’s longitudinal intelligence (memory over time). It is intentionally **non-philosophical** and written to be consumed by:
>
> * AI coding IDEs
> * Product & UX design
> * Feature prioritization
>
> Assumption: Core architecture (observe mode, memory graph, action service) already exists.

---

## Terminology (Canonical)

* **Event** – Any captured interaction (meeting, doc edit, code session, email draft)
* **DecisionMemory** – A short record explaining *why* a decision was made
* **IntentSession** – A time-bounded session with an explicit goal
* **DeferredArtifact** – Any draft or work item abandoned without closure
* **CognitiveDebt** – An open loop with unresolved intent or decision

---

## 1. Decision Memory Loop

### Problem

Users reopen decisions because the reasoning behind them is lost.

### Trigger Signals

* Issue / task closed
* Draft deleted or abandoned
* PR closed without merge
* Task marked "won’t do"

### Flow

1. Ellipsa detects a decision-like action.
2. Ellipsa prompts (low-friction, optional):

   * "Why did you decide this? (1 sentence)"
3. User responds or ignores.
4. Ellipsa stores a `DecisionMemory` linked to:

   * Entities
   * Event
   * Timestamp

### Stored Object (Example)

```json
{
  "type": "DecisionMemory",
  "reason": "Didn’t align with pricing assumptions",
  "linked_event": "evt_123",
  "confidence": 0.8
}
```

### Retrieval Usage

* When user revisits related task
* When similar decision context appears

### UI Requirements

* Inline decision prompt
* "Why" tooltip on reopened tasks

---

## 2. Weekly Founder Debrief

### Problem

Users lack a truthful summary of progress vs activity.

### Trigger

* Scheduled (weekly)
* Manual invocation

### Flow

1. Ellipsa aggregates last 7 days of:

   * Events
   * DecisionMemories
   * Open tasks
2. Ellipsa generates a narrative summary:

   * What moved forward
   * What stalled
   * Decisions made implicitly
3. Ellipsa highlights unresolved threads.

### Output Structure

```json
{
  "progress": ["Onboarding implemented"],
  "stalls": ["Pricing decisions"],
  "implicit_decisions": ["Avoided public pricing"],
  "carryovers": ["Pricing model unresolved"]
}
```

### UI Requirements

* Weekly report view
* Text-first, minimal metrics

---

## 3. Intent Interruption (Session-Level)

### Problem

Users lose intent due to context switching.

### Trigger Signals

* Rapid tab switching
* Idle cursor
* Repeated rereads

### Flow

1. Ellipsa interrupts:

   * "What are you trying to achieve right now?"
2. User responds.
3. Ellipsa creates an `IntentSession`.

### Stored Object

```json
{
  "type": "IntentSession",
  "goal": "Finalize onboarding copy",
  "start_ts": "...",
  "end_ts": "..."
}
```

### Long-Term Use

* Detect intent collapse patterns
* Surface avoidance zones

### UI Requirements

* Inline intent capture
* Session breadcrumb

---

## 4. Deferred Thinking Resurrection

### Problem

Abandoned drafts accumulate cognitive debt.

### Trigger Signals

* Draft idle > threshold
* Long unsent message
* Doc with no edits for X days

### Flow

1. Ellipsa marks artifact as `DeferredArtifact`.
2. Ellipsa attaches inferred reason (if available).
3. On resurfacing, Ellipsa shows context:

   * Why it was paused

### Stored Object

```json
{
  "type": "DeferredArtifact",
  "artifact_ref": "doc_456",
  "pause_reason": "Unclear pricing logic"
}
```

### User Options

* Resume
* Kill (with reason)
* Explicitly defer

### UI Requirements

* Resume/Kill/Defer actions
* Context banner on resurfacing

---

## 5. Cognitive Debt Ledger

### Problem

Unclosed loops silently drain attention.

### Tracked Items

* DeferredArtifacts
* Unanswered questions
* Decisions deferred without reason

### Flow

1. Ellipsa maintains a private ledger.
2. Periodically prompts:

   * "Close or keep open?"
3. User explicitly resolves or defers.

### UI Requirements

* Ledger view
* "Keep open" affordance

---

## 6. Relationship Continuity

### Problem

Users forget relationship trajectory, not facts.

### Inputs

* Meetings
* Emails
* Docs
* Tone analysis

### Flow

1. Ellipsa tracks tone and promises.
2. Builds temporal relationship summary.
3. Before outreach, surfaces:

   * Tone shift
   * Open promises

### UI Requirements

* Person card
* Tone sparkline
* Promise indicator

---

## 7. Identity Drift Detection

### Problem

Users drift from stated goals unknowingly.

### Flow

1. Compare stated goals vs actual behavior.
2. Detect sustained mismatch.
3. Surface neutral notice.

### Output Example

```json
{
  "type": "DriftNotice",
  "from": "Pricing focus",
  "to": "Onboarding polish"
}
```

### UI Requirements

* Rare, high-signal notification
* Side-by-side summaries

---

## Cross-Cutting Design Rules

* Prefer **capture over inference** when cheap
* Ask only when confidence < threshold
* Always attach time and context
* Never automate without memory

---

## Implementation Notes

* All flows rely on existing memory graph
* No new heavy infra required
* Primary work is **intent surfacing + UX affordances**

---

End of document
