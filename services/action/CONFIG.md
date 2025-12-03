# Action Service Environment Configuration

Add these variables to your `.env` file in `services/action/`:

```bash
# Server Configuration
PORT=4004
NODE_ENV=development

# Safety Configuration - Permissive Mode (block bad domains, allow rest)
ACTION_ALLOWLIST_MODE=permissive # or 'strict'
ACTION_ALLOWLIST=mail.google.com,calendar.google.com,slack.com,notion.so,github.com
ACTION_BLOCKLIST=  # Add malicious domains here, comma-separated
ACTION_REQUIRE_APPROVAL_DESTRUCTIVE=true  # Require approval for send, post, delete actions
ACTION_REQUIRE_APPROVAL_NEW_DOMAINS=true  # Require approval for first-time domains
ACTION_REQUIRE_APPROVAL_ALL=false  # Require approval for ALL actions (very restrictive)
ACTION_RATE_LIMIT_PER_MINUTE=20
ACTION_RATE_LIMIT_PER_HOUR=200
ACTION_RATE_LIMIT_ENABLED=true
ACTION_AUDIT_ENABLED=true
ACTION_AUDIT_RETENTION_DAYS=90

# Database
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ellipsa

# Gmail (existing)
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:4004/oauth2callback

# OpenAI
OPENAI_API_KEY=your-openai-api-key

# Service URLs
MEMORY_SERVICE_URL=http://localhost:3001
PROMPT_SERVICE_URL=http://localhost:3003

# Optional: Slack Integration
# SLACK_BOT_TOKEN=xoxb-your-token
# SLACK_CLIENT_ID=your-client-id
# SLACK_CLIENT_SECRET=your-client-secret

# Optional: Notion Integration
# NOTION_API_KEY=secret_your-key

# Optional: GitHub Integration
# GITHUB_TOKEN=ghp_your-token
```

## Configuration Modes

### Permissive Mode (Recommended for Development)
- **MODE**: `ACTION_ALLOWLIST_MODE=permissive`
- **Behavior**: Allow all domains except those in blocklist
- **New domains**: Require approval on first use
- **Use case**: Flexible development, easy testing

### Strict Mode (Recommended for Production)
- **MODE**: `ACTION_ALLOWLIST_MODE=strict`
- **Behavior**: Only allow domains in allowlist
- **New domains**: Blocked by default
- **Use case**: High-security production environments

## Approval Strategy

Based on user preferences, the system uses a **preview-based approval flow**:

1. **Destructive actions** (send_email, slack_message, etc.) show a preview
2. User can **approve**, **edit**, or **reject**
3. After repetitive approvals, the system learns patterns (future feature)

Example: Drafting an email
```
┌─────────────────────────────────┐
│  📧 Email Draft Ready           │
├─────────────────────────────────┤
│  To: alice@example.com          │
│  Subject: Follow-up on meeting  │
│                                 │
│  Hi Alice,                      │
│  ...                            │
│                                 │
│  [Edit] [Send] [Cancel]         │
└─────────────────────────────────┘
```

## Rate Limiting

Prevents abuse and accidental loops:
- **Per minute**: 20 actions (configurable)
- **Per hour**: 200 actions (configurable)
- Tracked per user ID
- Can be disabled in development

## Audit Logging

All actions are logged for security and debugging:
- Action plan
- Execution result
- Timestamp
- User ID
- Provenance (what triggered it)
- Retention: 90 days (configurable)
