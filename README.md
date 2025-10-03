# ellipsa v0.1 (MVP)

Local-first AI Self prototype per `design.md`.

## Prereqs
- Node 20+
- pnpm 9+
- Docker (for Postgres + pgvector)

## Quick start
```bash
pnpm install
# start infra
docker compose -f infra/docker-compose.yml up -d
# run services (dev)
pnpm dev
```

Services:
- Memory: http://localhost:4001
- Processor: http://localhost:4002
- Prompt: http://localhost:4003
- Action: http://localhost:4004

Privacy: local-only by default. No telemetry.
