# ellipsa v0.1 (MVP)

Local-first AI Self prototype per `design.md`.

## Prereqs
- Node 20+
- pnpm 9+
- Docker (for Postgres + pgvector)

## Quick Start
```bash
pnpm install

# Start infra (Databases)
docker compose -f infra/docker-compose.yml up -d

# Run all backend services
pnpm run dev:all

# Run the frontend (in a separate terminal)
cd apps/edge-agent
pnpm start
```

## Project Structure

- **apps/edge-agent**: The frontend Electron application. See [Frontend Integration Guide](apps/edge-agent/FRONTEND_INTEGRATION.md).
- **services/**: Backend services (Memory, Processor, Prompt, Action).

## Services
- Memory: http://localhost:4001
- Processor: http://localhost:4002
- Prompt: http://localhost:4003
- Action: http://localhost:4004

## Privacy
Local-only by default. No telemetry.
