#!/bin/bash

# Load broadcast environment variables
if [ -f .env.broadcast ]; then
    export $(cat .env.broadcast | grep -v '^#' | xargs)
    echo "✅ Loaded broadcast configuration from .env.broadcast"
else
    echo "⚠️  No .env.broadcast file found, using defaults"
fi

echo "📊 Starting Broadcast System"
echo "   Dashboard API Port: ${BROADCAST_API_PORT:-3002}"
echo "   Action API Port: ${ELIZA_ACTION_PORT:-3003}"
echo ""

# Start or restart the broadcast API with environment variables
pm2 restart broadcast-api --update-env || pm2 start broadcast-api-simple.js --name broadcast-api

# Check if action API is running (part of eliza-agent)
if pm2 describe action-api > /dev/null 2>&1; then
    echo "✅ Action API is already running"
else
    echo "⚠️  Action API not found. Make sure eliza-agent is running."
fi

echo ""
echo "🚀 Broadcast System Started!"
echo "   Dashboard: http://localhost:${BROADCAST_API_PORT:-3002}/broadcast-dashboard.html"
echo "   Config API: http://localhost:${BROADCAST_API_PORT:-3002}/api/config"
echo "   Stats API: http://localhost:${BROADCAST_API_PORT:-3002}/api/broadcast-stats"