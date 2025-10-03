# Processor Service

The Processor Service is a core component of the Ellipsa platform that processes incoming data from various sources (audio, screenshots, clipboard, window data) and transforms it into structured events, tasks, and entities using AI-powered analysis.

## Features

- Process multiple input types: audio, screenshots, clipboard content, and window data
- Generate structured events, tasks, and entities
- Rate limiting and request validation
- Health monitoring and metrics
- Integration with the Prompt Service for AI-powered processing

## API Endpoints

### POST /processor/v1/ingest

Process incoming data and generate structured events.

**Request Body:**
```json
{
  "audio_ref": "string | null",
  "screenshot_ref": "string | null",
  "active_window": "string",
  "segment_ts": "string",
  "meta": {
    "clipboard_content": "string | null",
    "window_title": "string | null",
    "application_name": "string | null"
  }
}
```

**Response:**
```json
{
  "success": true,
  "ingest_id": "string",
  "event_id": "string",
  "task_count": 0,
  "entity_count": 0,
  "timestamp": "2025-09-30T17:25:12.000Z"
}
```

### GET /processor/v1/events

Get all processed events (for debugging).

**Response:**
```json
{
  "success": true,
  "events": [],
  "count": 0,
  "timestamp": "2025-09-30T17:25:12.000Z"
}
```

### GET /processor/v1/health

Check the health of the service and its dependencies.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-09-30T17:25:12.000Z",
  "event_count": 0,
  "version": "0.1.0",
  "services": {
    "prompt_service": {
      "url": "http://localhost:4003",
      "status": "healthy"
    }
  }
}
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Port to run the server on | `4002` |
| `PROMPT_SERVICE_URL` | URL of the Prompt Service | `http://localhost:4003` |
| `LOG_LEVEL` | Logging level | `info` |
| `RATE_LIMIT_WINDOW_MS` | Rate limiting window in milliseconds | `60000` (1 minute) |
| `RATE_LIMIT_MAX_REQUESTS` | Maximum requests per window | `100` |

## Development

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Create a `.env` file with the required environment variables.

3. Start the development server:
   ```bash
   pnpm dev
   ```

4. Build for production:
   ```bash
   pnpm build
   ```

## Testing

Run tests:
```bash
pnpm test
```

## Deployment

The service is designed to be deployed as a containerized application. A `Dockerfile` is provided for containerization.

## Monitoring

The service exposes the following metrics:
- Request count and duration
- Error rates
- Queue length (if using a message queue in production)
- Dependency health status

## License

Proprietary - © 2025 Ellipsa
