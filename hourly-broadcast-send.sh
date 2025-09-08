#!/bin/bash

# Hourly Broadcast Sender
# Sends 1 pending broadcast every hour

cd /Users/davidlockie/Documents/Projects/Eliza

echo "[$(date)] Checking for pending broadcasts..."

# Send 1 Telegram broadcast if any pending
PENDING_TELEGRAM=$(sqlite3 ./agent/data/db.sqlite "SELECT COUNT(*) FROM broadcasts WHERE status = 'pending' AND client = 'telegram';")

if [ "$PENDING_TELEGRAM" -gt 0 ]; then
    echo "[$(date)] Sending 1 Telegram broadcast (${PENDING_TELEGRAM} pending)..."
    LIMIT=1 node send-pending-broadcasts.js
fi

# Send 1 X broadcast if any pending (currently will fail due to auth)
PENDING_X=$(sqlite3 ./agent/data/db.sqlite "SELECT COUNT(*) FROM broadcasts WHERE status = 'pending' AND client = 'twitter';")

if [ "$PENDING_X" -gt 0 ]; then
    echo "[$(date)] Sending 1 X broadcast (${PENDING_X} pending)..."
    LIMIT=1 node send-x-broadcasts.js
fi

echo "[$(date)] Hourly broadcast check complete"