#!/bin/bash

echo "🚀 Starting Eliza Agent System (Telegram Focus)..."
echo "================================================"

# Change to project directory
cd /Users/davidlockie/Documents/Projects/Eliza

# Create logs directory if it doesn't exist
mkdir -p logs

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2 globally..."
    npm install -g pm2
fi

# Stop any existing processes
echo "🛑 Stopping any existing processes..."
pm2 stop all 2>/dev/null || true
pm2 delete all 2>/dev/null || true

# Start all services using ecosystem config
echo "🚀 Starting all services with PM2..."
pm2 start ecosystem.config.js

# Save PM2 configuration
echo "💾 Saving PM2 configuration..."
pm2 save

# Set up PM2 to start on system boot
echo "🔧 Setting up PM2 startup script..."
pm2 startup

# Wait a moment for services to start
sleep 5

# Show status
echo ""
echo "✅ All services started successfully!"
echo "================================================"
pm2 status

echo ""
echo "📊 Service URLs:"
echo "  - Agent API: http://localhost:3000"
echo "  - Web Client: http://localhost:5173"
echo "  - Broadcast Dashboard: http://localhost:3002/broadcast-dashboard.html"
echo "  - Broadcast API: http://localhost:3002/api/broadcast-stats"
echo ""
echo "📝 Useful commands:"
echo "  - View status: pm2 status"
echo "  - View logs: pm2 logs"
echo "  - View specific log: pm2 logs [app-name]"
echo "  - Restart all: pm2 restart all"
echo "  - Stop all: pm2 stop all"
echo "  - Monitor: pm2 monit"
echo ""
echo "🔄 Scheduled Actions:"
echo "  - SYNC_GITHUB: Every 6 hours"
echo "  - CREATE_KNOWLEDGE: Every 12 hours"
echo "  - PROCESS_QUEUE: Every 30 minutes"
echo "  - HEALTH_CHECK: Every 5 minutes"
echo ""
echo "📱 Telegram Bot: @ai10bro_bot"