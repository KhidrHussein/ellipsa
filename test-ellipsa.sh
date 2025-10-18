#!/bin/bash
# test-ellipsa.sh

# Start all services in the background
echo "Starting Ellipsa services..."
cd c:/Users/Hp/ellipsa

# Start Memory Service
pnpm --filter @ellipsa/memory dev &

# Start Processor Service
pnpm --filter @ellipsa/processor dev &

# Start Action Service
pnpm --filter @ellipsa/action dev &

# Start Prompt Service
pnpm --filter @ellipsa/prompt dev &

# Start Edge Agent
cd apps/edge-agent
pnpm dev &

echo "All services starting in the background..."
echo "Check the terminal windows for logs from each service."
echo "The Edge Agent window should appear in your taskbar."

# Wait for all background processes
wait