# Action Service - Multi-Provider Architecture

## Overview

This is Phase 1 of the Action Service refactoring, transforming it from an email-only service into a comprehensive **Computer Use** system that can execute actions across multiple domains (browser, email, desktop, APIs).

## What's Been Implemented

### ✅ Core Infrastructure

- **[ActionExecutor](file:///c:/Users/Hp/ellipsa/services/action/src/core/ActionExecutor.ts)** - Orchestrates action execution across providers
- **[ActionRegistry](file:///c:/Users/Hp/ellipsa/services/action/src/core/ActionRegistry.ts)** - Manages provider registration and action lookup  
- **[SafetyValidator](file:///c:/Users/Hp/ellipsa/services/action/src/core/SafetyValidator.ts)** - Enforces security policies (allowlists, rate limits, approval)
- **[Action Schemas](file:///c:/Users/Hp/ellipsa/services/action/src/schemas/action.schema.ts)** - Unified Zod schemas for all action types
- **[Provider Interface](file:///c:/Users/Hp/ellipsa/services/action/src/core/ActionProvider.interface.ts)** - Base interface for all providers

### ✅ Providers

- **[BrowserProvider](file:///c:/Users/Hp/ellipsa/services/action/src/providers/BrowserProvider.ts)** - Playwright-based browser automation
  - `open_url` - Navigate to URL
  - `click` - Click element by selector
  - `type_text` - Type into input field
  - `wait` - Wait for milliseconds
  - `wait_for_selector` - Wait for element
  - `screenshot` - Capture screenshot

### ✅ Safety & Configuration

- **[Safety Config](file:///c:/Users/Hp/ellipsa/services/action/src/config/safety.config.ts)** - Permissive mode with blocklist
  - Blocks malicious domains
  - Allows all others (with optional first-time approval)
  - Rate limiting (20/min, 200/hour)
  - Audit logging enabled

### ✅ Server Integration

- **[server.new.ts](file:///c:/Users/Hp/ellipsa/services/action/src/server.new.ts)** - Integrated server with:
  - NEW: `POST /action/v1/execute` - Execute action plans
  - NEW: `GET /action/v1/actions` - List available actions
  - NEW: `POST /action/v1/validate` - Validate without executing
  - EXISTING: All email routes still work (`/api/emails/*`, `/oauth2callback`)

## API Usage

### Execute Actions

```bash
curl -X POST http://localhost:4004/action/v1/execute \
  -H "Content-Type: application/json" \
  -d '{
    "plan": [
      {"op": "open_url", "args": {"url": "https://mail.google.com"}},
      {"op": "screenshot", "args": {}}
    ]
  }'
```

### Get Available Actions

```bash
curl http://localhost:4004/action/v1/actions
```

### Validate Action Plan

```bash
curl -X POST http://localhost:4004/action/v1/validate \
  -H "Content-Type: application/json" \
  -d '{
    "plan": [
      {"op": "open_url", "args": {"url": "https://example.com"}}
    ]
  }'
```

## Testing

### Run Test Script

```bash
cd services/action
pnpm tsx src/test-actions.ts
```

This will:
1. Initialize the action system
2. Register providers
3. List available actions
4. Execute a test browser action (screenshot of example.com)
5. Test safety validation (blocked domain)

### Run Type Check

```bash
pnpm run typecheck
```

### Run Server

```bash
# Option 1: Use new server (recommended for testing)
pnpm tsx src/server.new.ts

# Option 2: Use existing server (email-only)
pnpm run dev
```

## Configuration

See [CONFIG.md](file:///c:/Users/Hp/ellipsa/services/action/CONFIG.md) for environment variables.

### Key Settings

```.env
# Permissive mode - block bad domains, allow rest
ACTION_ALLOWLIST_MODE=permissive

# Require approval for destructive actions (send, delete, post)
ACTION_REQUIRE_APPROVAL_DESTRUCTIVE=true

# Require approval for new domains (first time)
ACTION_REQUIRE_APPROVAL_NEW_DOMAINS=true

# Rate limit: 20 actions/min, 200/hour
ACTION_RATE_LIMIT_PER_MINUTE=20
ACTION_RATE_LIMIT_PER_HOUR=200
```

## Safety Features

### Permissive Mode (Current)

- ✅ **Allow by default** - All domains except blocklist
- ✅ **Blocklist** - Known malicious domains blocked
- ✅ **First-time approval** - New domains require user confirmation
- ✅ **Destructive approval** - Send/delete/post actions show preview

### Approval Flow (Email Example)

```
1. AI drafts email
2. Frontend shows preview:
   ┌─────────────────────────────┐
   │  To: alice@example.com      │
   │  Subject: Follow-up          │
   │  Body: Hi Alice, ...         │
   │                              │
   │  [Edit] [Send] [Cancel]      │
   └─────────────────────────────┘
3. User clicks Send → Email sent
4. System learns pattern for future automation
```

## File Structure

```
services/action/src/
├── core/
│   ├── ActionExecutor.ts          # Orchestrates execution
│   ├── ActionRegistry.ts          # Provider management
│   ├── SafetyValidator.ts         # Security policies
│   ├── ActionProvider.interface.ts # Base interface
│   └── index.ts                   # Exports
├── providers/
│   └── BrowserProvider.ts         # Playwright automation
├── schemas/
│   └── action.schema.ts           # Zod validation schemas
├── config/
│   └── safety.config.ts           # Safety configuration
├── email/                         # Existing email services (unchanged)
├── server.new.ts                  # NEW integrated server
├── server.ts                      # OLD email-only server
└── test-actions.ts                # Test script
```

## Next Steps

### Phase 1 Completion (In Progress)

- [x] Core infrastructure
- [x] BrowserProvider
- [x] Safety config (permissive mode)
- [x] Action schemas
- [x] Integrated server
- [ ] Test and debug TypeScript compilation
- [ ] Migrate from `server.ts` to `server.new.ts`
- [ ] Create approval UI in frontend

### Phase 2: Desktop Automation (Windows)

- [ ] WindowsProvider (PowerShell, UIA)
  - `open_app` - Launch application
  - `paste_text` - Clipboard operations
  - `press_keys` - Keyboard automation

### Phase 3: API Providers

- [ ] SlackProvider (send messages)
- [ ] CalendarProvider (create events)
- [ ] NotionProvider (create pages)
- [ ] GitHubProvider (create issues/PRs)

### Phase 4: Memory Integration

- [ ] Log actions to Memory Service
- [ ] Action history/provenance
- [ ] Undo capability (where possible)

### Phase 5: Frontend Integration

- [ ] Update ActionClient to use `/action/v1/execute`
- [ ] Build ActionApprovalModal component
- [ ] Build ActionHistory view
- [ ] Progressive autonomy tracking

## Migration Path

### Safe Migration Strategy

1. **Test new server**:
   ```bash
   PORT=4005 pnpm tsx src/server.new.ts
   ```

2. **Verify APIs work**:
   ```bash
   curl http://localhost:4005/health
   curl http://localhost:4005/action/v1/actions
   ```

3. **Test action execution**:
   ```bash
   pnpm tsx src/test-actions.ts
   ```

4. **When ready, swap servers**:
   ```bash
   mv src/server.ts src/server.backup.ts
   mv src/server.new.ts src/server.ts
   ```

5. **Rollback if needed**:
   ```bash
   mv src/server.backup.ts src/server.ts
   ```

### Backward Compatibility

- ✅ All email routes still work (`/api/emails/*`)
- ✅ Gmail OAuth flow unchanged
- ✅ Email automation continues as before
- ✅ No data migration required

## Architecture

```
┌─────────────────────────────────────────────┐
│              Frontend (Edge Agent)           │
│  ActionClient → /action/v1/execute          │
└─────────────────┬─────────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────────┐
│          Action Service (server.new.ts)      │
│  ┌──────────────────────────────────────┐  │
│  │         ActionExecutor               │  │
│  │  - Validates with SafetyValidator    │  │
│  │  - Routes to providers via Registry  │  │
│  │  - Aggregates results                │  │
│  └──────────────────────────────────────┘  │
│              ↓           ↓           ↓      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ Browser  │ │  Email   │ │ Desktop  │   │
│  │ Provider │ │ Provider │ │ Provider │   │
│  └──────────┘ └──────────┘ └──────────┘   │
└─────────────────────────────────────────────┘
```

## Troubleshooting

### TypeScript Errors

If you encounter TypeScript errors during `pnpm run typecheck`:

1. Make sure all dependencies are installed:
   ```bash
   pnpm install
   ```

2. Check that Playwright is installed:
   ```bash
   npx playwright install
   ```

3. Try building incrementally:
   ```bash
   npx tsc --noEmit src/schemas/action.schema.ts
   npx tsc --noEmit src/core/ActionExecutor.ts
   ```

### Import Errors

All imports use `.js` extensions for ES modules compatibility:
```typescript
import { ActionExecutor } from './core/ActionExecutor.js';
```

### Server Won't Start

1. Check environment variables:
   ```bash
   cat .env | grep ACTION_
   ```

2. Ensure required services are running:
   - Memory Service (port 3001)
   - Prompt Service (port 3003)

3. Start with minimal config:
   ```bash
   NODE_ENV=development pnpm tsx src/server.new.ts
   ```

## Documentation

- [Implementation Plan](file:///c:/Users/Hp/.gemini/antigravity/brain/40f8e719-c9d6-4652-a5bb-a17d0bcd910c/implementation_plan.md) - Full 6-week plan
- [Actions Analysis](file:///c:/Users/Hp/.gemini/antigravity/brain/40f8e719-c9d6-4652-a5bb-a17d0bcd910c/actions_analysis.md) - Gap analysis
- [Design Spec](file:///c:/Users/Hp/ellipsa/design.md) - Original vision (Section 8)
- [CONFIG.md](file:///c:/Users/Hp/ellipsa/services/action/CONFIG.md) - Environment configuration

## Support

For questions or issues:
1. Check the [Implementation Plan](file:///c:/Users/Hp/.gemini/antigravity/brain/40f8e719-c9d6-4652-a5bb-a17d0bcd910c/implementation_plan.md)
2. Review TypeScript errors with `pnpm run typecheck`
3. Test with `pnpm tsx src/test-actions.ts`
4. Check logs in the terminal

---

**Status**: Phase 1 infrastructure complete, ready for testing and debugging.
