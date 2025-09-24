#!/bin/bash

# Start broadcast services for Eliza AI10BRO
# This script starts both the broadcast API and action API services

cd /Users/davidlockie/Documents/Projects/Eliza

echo "Starting Eliza broadcast services..."

# Kill any existing processes
pkill -f "broadcast-api.js" 2>/dev/null
pkill -f "action-api-standalone.js" 2>/dev/null

sleep 2

# Start broadcast API (dashboard and stats)
echo "Starting broadcast API on port 3002..."
nohup node packages/plugin-dashboard/src/services/broadcast-api.js > logs/broadcast-api.log 2>&1 &
echo "Broadcast API PID: $!"

# Start action API (triggers and automation)
echo "Starting action API on port 3003..."
nohup node action-api-standalone.js > logs/action-api.log 2>&1 &
echo "Action API PID: $!"

sleep 3

# Verify services are running
if curl -s http://localhost:3002/health > /dev/null 2>&1; then
    echo "✅ Broadcast API is running"
else
    echo "❌ Broadcast API failed to start"
fi

if curl -s http://localhost:3003/health > /dev/null 2>&1; then
    echo "✅ Action API is running"
else
    echo "❌ Action API failed to start"
fi

echo ""
echo "Services started. You can now:"
echo "  - View dashboard at http://localhost:3002/broadcast-dashboard.html"
echo "  - Send broadcasts manually with: curl -X POST http://localhost:3003/trigger -H 'Content-Type: application/json' -d '{\"action\":\"SEND_TELEGRAM\"}'"
echo ""
echo "To schedule automatic broadcasts, run:"
echo "  crontab -e"
echo "And add:"
echo "  */30 * * * * curl -X POST http://localhost:3003/trigger -H 'Content-Type: application/json' -d '{\"action\":\"SEND_TELEGRAM\"}' 2>/dev/null"