# Ellipsa Memory Service

The Memory Service is a core component of the Ellipsa platform, providing persistent storage and retrieval of entities, events, and tasks with support for vector similarity search and graph relationships.

## Features

- **Multi-model Storage**: Combines relational, graph, and vector databases for optimal data modeling
- **Entity Recognition**: Store and manage entities like people, organizations, and documents
- **Event Tracking**: Record and query temporal events with rich metadata
- **Task Management**: Track tasks with relationships to entities and events
- **Semantic Search**: Find similar content using vector embeddings
- **Graph Traversal**: Navigate relationships between different types of data

## Prerequisites

- Node.js 18+
- PostgreSQL (optional, SQLite is used by default)
- Neo4j (for graph database)
- ChromaDB (for vector search)
- OpenAI API key (for generating embeddings)

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Copy the example config file:
   ```bash
   cp src/config.example.ts src/config.ts
   ```
4. Update `src/config.ts` with your configuration

## Configuration

Create a `.env` file in the project root with the following variables:

```env
# Server Configuration
NODE_ENV=development
PORT=4000

# Database Configuration (SQLite by default)
DB_CLIENT=sqlite3
DB_NAME=ellipsa_memory

# OR for PostgreSQL
# DB_CLIENT=pg
# DB_HOST=localhost
# DB_PORT=5432
# DB_USER=your_user
# DB_PASSWORD=your_password
# DB_NAME=ellipsa_memory

# Neo4j Configuration
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your_neo4j_password
NEO4J_DATABASE=neo4j

# ChromaDB Configuration
CHROMA_HOST=localhost
CHROMA_PORT=8000
CHROMA_SSL=false

# OpenAI Configuration (for embeddings)
OPENAI_API_KEY=your_openai_api_key

# Logging
LOG_LEVEL=info
```

## Running Migrations

To create and run database migrations:

```bash
# Create a new migration
pnpm run migrate:make create_<table_name>_table

# Run pending migrations
pnpm run migrate:latest

# Rollback the latest migration
pnpm run migrate:rollback
```

## Development

Start the development server with hot-reload:

```bash
pnpm dev
```

## Testing

Run the test suite:

```bash
pnpm test
```

## Production

Build and start the production server:

```bash
pnpm build
pnpm start
```

## API Documentation

### Entities

- `POST /api/entities` - Create a new entity
- `GET /api/entities/:id` - Get an entity by ID
- `GET /api/entities` - List entities with filters
- `PUT /api/entities/:id` - Update an entity
- `DELETE /api/entities/:id` - Delete an entity
- `GET /api/entities/similar?text=...` - Find similar entities

### Events

- `POST /api/events` - Create a new event
- `GET /api/events/:id` - Get an event by ID
- `GET /api/events` - List events with filters
- `PUT /api/events/:id` - Update an event
- `DELETE /api/events/:id` - Delete an event

### Tasks

- `POST /api/tasks` - Create a new task
- `GET /api/tasks/:id` - Get a task by ID
- `GET /api/tasks` - List tasks with filters
- `PUT /api/tasks/:id` - Update a task
- `DELETE /api/tasks/:id` - Delete a task
- `POST /api/tasks/:id/complete` - Mark a task as completed

## Architecture

The Memory Service uses a multi-model architecture:

1. **Relational Database (PostgreSQL/SQLite)**:
   - Stores structured data with strong consistency
   - Handles transactions and complex queries

2. **Graph Database (Neo4j)**:
   - Manages relationships between entities
   - Enables powerful graph traversals

3. **Vector Database (ChromaDB)**:
   - Stores vector embeddings for semantic search
   - Enables similarity search across entities and events

## License

Proprietary - All rights reserved

## Contributing

Please follow the project's code style and submit pull requests for any improvements.
