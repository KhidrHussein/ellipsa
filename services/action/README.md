# Action Service

The Action Service is a core component of the Ellipsa platform, responsible for processing emails, managing conversations, and integrating with various AI services.

## Features

- **Email Processing**: Fetch, process, and manage emails from Gmail
- **AI-Powered Summarization**: Automatically summarize emails using AI
- **Smart Responses**: Generate context-aware email responses
- **Memory Integration**: Store and retrieve conversation history and context
- **Task Management**: Track and manage email-related tasks

## Prerequisites

- Node.js 18+
- PostgreSQL
- Neo4j
- Chroma DB
- Gmail API credentials
- OpenAI API key

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Server
PORT=4004
NODE_ENV=development

# Database
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ellipsa
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
CHROMA_URL=http://localhost:8000

# Gmail API
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:4004/oauth2callback
GOOGLE_ACCESS_TOKEN=your-access-token
GOOGLE_REFRESH_TOKEN=your-refresh-token

# OpenAI
OPENAI_API_KEY=your-openai-api-key
```

## Installation

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Start the development server:
   ```bash
   pnpm dev
   ```

3. Build for production:
   ```bash
   pnpm build
   ```

## API Endpoints

### Email

- `GET /api/email/:id` - Get email by ID
- `POST /api/email/sweep` - Perform an email sweep with filters
- `GET /api/email/summary/:id` - Get email summary
- `POST /api/email/draft` - Draft a response to an email
- `POST /api/email/send` - Send an email

## Architecture

The service follows a clean architecture with the following layers:

- **Controllers**: Handle HTTP requests and responses
- **Services**: Contain business logic and orchestration
- **Repositories**: Handle data access and storage
- **Models**: Define data structures and validation

## Dependencies

- **Express**: Web framework
- **TypeScript**: Type-safe JavaScript
- **Knex**: SQL query builder
- **Neo4j**: Graph database
- **Chroma**: Vector database
- **OpenAI**: AI model integration
- **Gmail API**: Email integration

## Development

### Running Tests

```bash
pnpm test
```

### Linting

```bash
pnpm lint
```

### Type Checking

```bash
pnpm typecheck
```

## Deployment

1. Build the application:
   ```bash
   pnpm build
   ```

2. Start the production server:
   ```bash
   NODE_ENV=production node dist/server.js
   ```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License.
