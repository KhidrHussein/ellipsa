# Edge Agent

The frontend application for Ellipsa, built with Electron, React, and TypeScript.

## Getting Started

### Prerequisites
- Node.js (v18+)
- pnpm

### Running the Application

1. **Start Backend Services**:
   Ensure all backend services are running. From the root directory:
   ```bash
   pnpm run dev:all
   ```

2. **Start the Edge Agent**:
   In a new terminal, navigate to this directory and run:
   ```bash
   pnpm start
   ```

## Backend Integration

For detailed information on how the frontend integrates with backend services, see [FRONTEND_INTEGRATION.md](./FRONTEND_INTEGRATION.md).

## Development

- `pnpm run dev`: Build and start the app
- `pnpm run watch`: Watch for changes and rebuild
