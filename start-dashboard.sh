#!/bin/bash

echo "🚀 Starting AI10bro Broadcast Dashboard..."
echo "==========================================="

# Check if port 3002 is already in use
if lsof -Pi :3002 -sTCP:LISTEN -t >/dev/null ; then
    echo "⚠️  Port 3002 is already in use. Trying port 3003..."
    export BROADCAST_API_PORT=3003
else
    export BROADCAST_API_PORT=3002
fi

# Start the API server
node broadcast-api-simple.js &
API_PID=$!

echo ""
echo "✅ Dashboard API started (PID: $API_PID)"
echo ""
echo "📊 Dashboard URL: http://localhost:$BROADCAST_API_PORT/broadcast-dashboard.html"
echo "🔌 API Endpoint: http://localhost:$BROADCAST_API_PORT/api/broadcast-stats"
echo ""
echo "Opening dashboard in browser..."
sleep 2

# Open the dashboard in the default browser
open "http://localhost:$BROADCAST_API_PORT/broadcast-dashboard.html"

echo ""
echo "Press Ctrl+C to stop the dashboard server"
echo ""

# Wait for the API server
wait $API_PID