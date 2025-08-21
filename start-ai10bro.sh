#!/bin/bash

echo "🚀 Starting AI10BRO Agent with Broadcast System"
echo "=============================================="

# Check if required files exist
if [ ! -f "characters/ai10bro.character.json" ]; then
    echo "❌ AI10BRO character file not found!"
    echo "Expected: characters/ai10bro.character.json"
    exit 1
fi

if [ ! -f "broadcast-api-simple.js" ]; then
    echo "❌ Broadcast API script not found!"
    echo "Expected: broadcast-api-simple.js"
    exit 1
fi

# Build the project first
echo "📦 Building project..."
pnpm build

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

echo "✅ Build completed successfully"
echo ""

# Set environment variables for broadcast system
export BROADCAST_API_PORT=3002
export ELIZA_ACTION_PORT=3005

echo "🤖 Starting AI10BRO Agent..."
echo "   Agent Port: 3005"
echo "   Dashboard Port: 3002 (auto-started by plugin)"
echo ""
echo "📊 Access points:"
echo "   Dashboard: http://localhost:3002/broadcast-dashboard.html"
echo "   Agent API: http://localhost:3005"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Start the agent with AI10BRO character
# The AutoBroadcastService will automatically start the dashboard
pnpm start --characters="characters/ai10bro.character.json"