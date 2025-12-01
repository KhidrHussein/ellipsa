# Frontend Integration Guide

This document details how the Edge Agent frontend (`apps/edge-agent`) integrates with the backend services.

## Backend Services Overview

The frontend communicates with several backend services. Ensure these are running before starting the frontend.

| Service | Port | Base URL | Description |
|---------|------|----------|-------------|
| **Memory Service** | `4001` | `http://localhost:4001` | Handles storage and retrieval of events, entities, and tasks. Also hosts the WebSocket server. |
| **Processor Service** | `4002` | `http://localhost:4002` | Processes raw inputs (audio, screenshots) into structured events. |
| **Prompt Service** | `4003` | `http://localhost:4003` | Provides LLM capabilities for text generation and analysis. |
| **Action Service** | `4004`* | `http://localhost:4004` | Manages email and other external actions. (*Note: Backend may default to 3000, ensure env var `PORT=4004` is set) |

## HTTP API Integrations

The frontend uses specialized clients to interact with these services. These are located in `src/services/`.

### Memory Client (`MemoryClient.ts`)
- **Purpose**: Storing and retrieving events.
- **Base URL**: `http://localhost:4001`
- **Key Methods**:
  - `storeEvent(event)`: POST `/events` - Stores a new event.
  - `retrieveEvents(query)`: GET `/events?query=...` - Searches for events.

### Processor Client (`ProcessorClient.ts`)
- **Purpose**: Sending audio and image data for processing.
- **Base URL**: `http://localhost:4002`
- **Key Methods**:
  - `processAudio(audioData, metadata)`: POST `/processor/v1/ingest` - Sends audio buffer for transcription and analysis.
  - `processScreenshot(imageData, metadata)`: POST `/process/image` - Sends screenshot for analysis.

### Action Client (`api.ts` - `ActionClient`)
- **Purpose**: Executing actions like sending emails.
- **Base URL**: `http://localhost:4004`
- **Key Methods**:
  - `executeAction(type, params)`: POST `/actions/execute`
  - `getAvailableActions()`: GET `/actions`

## WebSocket Integrations

Real-time communication is handled via WebSockets, primarily hosted by the Memory Service.

### Realtime Service (`RealtimeService.ts`)
- **URL**: `ws://localhost:4001`
- **Purpose**: Receiving real-time updates, transcriptions, and AI suggestions.
- **Key Events**:
  - `transcript`: Real-time audio transcription updates.
  - `suggestion`: AI-generated suggestions based on context.
  - `action`: Triggers for client-side actions.

### Event Service (`EventService.ts`)
- **URL**: `ws://localhost:4001` (Uses the same WebSocket server)
- **Purpose**: Streaming captured events (screen, audio) to the backend.
- **Flow**:
  1. Frontend captures event (e.g., screen change).
  2. `EventService` buffers and sends `process_event` message.
  3. Backend processes and broadcasts updates back via `RealtimeService`.

## Data Structures

### Event
```typescript
interface Event {
  id: string;
  type: string; // e.g., 'conversation', 'screen_activity'
  content: string;
  timestamp: string;
  metadata: Record<string, any>;
}
```

### Entity
```typescript
interface Entity {
  id: string;
  name: string;
  type: string; // e.g., 'person', 'topic'
  metadata: Record<string, any>;
}
```

## Environment Variables

Configure these in `apps/edge-agent/.env` (or build-time configuration):

```env
MEMORY_SERVICE_URL=http://localhost:4001
PROCESSOR_SERVICE_URL=http://localhost:4002
PROMPT_SERVICE_URL=http://localhost:4003
ACTION_SERVICE_URL=http://localhost:4004
```
