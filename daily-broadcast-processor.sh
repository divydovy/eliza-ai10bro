#!/bin/bash

# Daily Broadcast Processor
# Run this with cron to automatically process new documents daily
# Example crontab entry (runs at 9 AM daily):
# 0 9 * * * /Users/davidlockie/Documents/Projects/Eliza/daily-broadcast-processor.sh >> /Users/davidlockie/Documents/Projects/Eliza/logs/daily-broadcast.log 2>&1

echo "================================================"
echo "Daily Broadcast Processing - $(date)"
echo "================================================"

cd /Users/davidlockie/Documents/Projects/Eliza

# Check if agent is running
if ! pm2 describe eliza-agent > /dev/null 2>&1; then
    echo "⚠️  Eliza agent not running. Starting it..."
    pm2 start agent/src/index.ts --name eliza-agent
    sleep 10
fi

# Process up to 100 new documents
echo "📦 Processing new documents..."
node batch-process-broadcasts.js 50 2

# Get stats
STATS=$(sqlite3 ./agent/data/db.sqlite "SELECT 
    (SELECT COUNT(*) FROM broadcasts WHERE status = 'pending') as pending,
    (SELECT COUNT(*) FROM broadcasts WHERE date(createdAt/1000, 'unixepoch') = date('now')) as today_created,
    (SELECT COUNT(*) FROM memories WHERE type = 'documents' AND id NOT IN (SELECT documentId FROM broadcasts WHERE documentId IS NOT NULL)) as unprocessed;")

IFS='|' read -r PENDING TODAY UNPROCESSED <<< "$STATS"

echo ""
echo "📊 Daily Summary:"
echo "   Broadcasts created today: $TODAY"
echo "   Pending broadcasts: $PENDING"
echo "   Unprocessed documents: $UNPROCESSED"

# Send pending broadcasts if any
if [ "$PENDING" -gt 0 ]; then
    echo ""
    echo "📤 Sending pending broadcasts..."
    node send-pending-broadcasts.js
fi

echo ""
echo "✅ Daily processing complete at $(date)"
echo "================================================"
echo ""