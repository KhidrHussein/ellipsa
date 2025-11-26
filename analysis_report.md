# Ellipsa Codebase & Design Analysis Report

**Date:** 2025-11-26
**Version:** 0.1 (Analysis of v1 Design vs. Current Codebase)

## 1. Executive Summary
The **Ellipsa** project has a solid foundation with the core microservices architecture (Edge Agent, Processor, Memory, Action, Prompt) already in place. The **Memory** and **Processor** services are well-aligned with the design specifications. However, the **Action Service** is currently specialized for Email/Gmail interactions rather than the broader OS-level automation described in the design. The **Edge Agent** has the core capture capabilities (screen, audio) but the UI seems to be in the early stages (Floating Assistant).

## 2. Component Analysis

### 2.1 Edge Agent (`apps/edge-agent`)
*   **Status:** 🟡 **Partial / In Progress**
*   **Design Goal:** Floating button, local capture (ASR, OCR), local buffering.
*   **Implementation:**
    *   **Capture:** Implemented. `screenCapture.ts` and `asr.ts` exist for screen and audio capture.
    *   **UI:** `FloatingAssistant.ts` exists, representing the "Floating button overlay".
    *   **Gap:** The full "Timeline UI" and "Person Cards" described in the design (Section 9.4) were not explicitly found in the top-level component lists. The "Morning Briefing" logic also appears to be missing from the frontend.

### 2.2 Memory Service (`services/memory`)
*   **Status:** 🟢 **Strong Alignment**
*   **Design Goal:** Store structured objects (Entities, Events) in Vector + Graph + Relational DBs.
*   **Implementation:**
    *   **Models:** `EventModel.ts`, `EntityModel.ts`, `TaskModel.ts` are implemented and match the JSON schemas in the design.
    *   **Storage:** The code explicitly imports `knex` (Relational), `neo4j-driver` (Graph), and `chroma` (Vector), perfectly matching the "Hybrid storage pattern" (Section 6.2).
    *   **Gap:** `MemorySummary` model (for long-term distillation) was not seen as a standalone model file, though it might be handled logically within the service.

### 2.3 Processor Service (`services/processor`)
*   **Status:** 🟢 **Strong Alignment**
*   **Design Goal:** Convert raw captures into structured Events using ASR/OCR and LLMs.
*   **Implementation:**
    *   **Pipeline:** `server.ts` implements the `processInput` flow: Detect Type -> Process Audio/Image -> Call Prompt Service -> Parse JSON -> Store Event.
    *   **Integration:** Correctly calls `PromptService` and `MemoryService`.

### 2.4 Action Service (`services/action`)
*   **Status:** 🟡 **Divergent / Specialized**
*   **Design Goal:** "Execute actions on the user's machine... Playwright, accessibility APIs or OS scripting" (Section 3.1).
*   **Implementation:**
    *   **Current State:** The current implementation is heavily focused on **Email Automation** (`GmailEmailService`, `EmailProcessingService`).
    *   **Gap:** There is a lack of generic OS-level automation (opening apps, window management) or general browser automation outside of the specific Gmail context. The "Phase 1: Pragmatic MVP Automation" (Section 8.1) calling for OS-level scripting is not yet fully realized in this service.

### 2.5 Prompt Service (`services/prompt`)
*   **Status:** 🟢 **Functional**
*   **Design Goal:** Manage LLM prompt templates and provider interfaces.
*   **Implementation:** Basic structure exists (`server.ts`, `schemas`). It serves as the gateway to LLMs (OpenAI) as intended.

## 3. Data Model Alignment

| Design Entity | Code Implementation | Status | Notes |
| :--- | :--- | :--- | :--- |
| **Entity** | `EntityModel.ts` | ✅ Match | Includes canonical_name, metadata. |
| **Event** | `EventModel.ts` | ✅ Match | Includes start_time, participants, embedding. |
| **ActionItem** | `TaskModel.ts` | ✅ Match | Mapped to `tasks` in the processor logic. |
| **MemorySummary** | *Not found as file* | ❓ Missing | Likely needs to be implemented for "Cold lane" storage. |

## 4. Key Gaps & Recommendations

### 1. Generalize Action Service
**Gap:** The `action` service is currently a "Gmail Service".
**Recommendation:** Refactor `services/action` to have a modular architecture where `Email` is just one *provider*. Add a `DesktopAutomation` provider using libraries like `nut.js` or `active-window` (for OS control) and `playwright` (for general browser tasks) to fulfill the "Computer Use" vision.

### 2. Expand Frontend UI
**Gap:** Only `FloatingAssistant` is visible.
**Recommendation:** Build out the **Timeline View** and **Entity/Person Cards** in the Edge Agent renderer. These are critical for the "User-Centric UX" principle.

### 3. Implement Memory Consolidation
**Gap:** The "End-of-day consolidation job" (Section 5.5) and `MemorySummary` logic need to be verified.
**Recommendation:** Ensure there is a background job in `services/memory` that aggregates daily events into long-term summaries to prevent context window overflow in the LLM.

### 4. Telemetry & Security
**Gap:** Telemetry and advanced security (encryption at rest for local blobs) were not deeply inspected but are critical for the "Privacy" section.
**Recommendation:** Verify the "Local buffer" encryption in the Edge Agent.
