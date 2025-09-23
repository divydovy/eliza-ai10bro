#!/bin/bash

# Hourly Broadcast Sender
# Sends 1 pending broadcast every hour using action API

cd /Users/davidlockie/Documents/Projects/Eliza

LOG_FILE="logs/broadcast-$(date +%Y%m%d).log"
mkdir -p logs

echo "[$(date)] Checking for pending broadcasts..." | tee -a "$LOG_FILE"

# Get pending count
PENDING=$(sqlite3 ./agent/data/db.sqlite "SELECT COUNT(*) FROM broadcasts WHERE status = 'pending';")

if [ "$PENDING" -gt 0 ]; then
    echo "[$(date)] Sending 1 broadcast (${PENDING} pending)..." | tee -a "$LOG_FILE"

    # Use action API to send one broadcast
    RESPONSE=$(curl -s -X POST http://localhost:3003/trigger \
        -H "Content-Type: application/json" \
        -d '{"action":"PROCESS_QUEUE"}')

    echo "[$(date)] Response: $RESPONSE" | tee -a "$LOG_FILE"

    # Log the broadcast that was sent
    SENT_ID=$(sqlite3 ./agent/data/db.sqlite "SELECT id FROM broadcasts WHERE status = 'sent' ORDER BY sent_at DESC LIMIT 1;")
    if [ -n "$SENT_ID" ]; then
        echo "[$(date)] Successfully sent broadcast: $SENT_ID" | tee -a "$LOG_FILE"
    fi
else
    echo "[$(date)] No pending broadcasts" | tee -a "$LOG_FILE"
fi

echo "[$(date)] Hourly broadcast check complete" | tee -a "$LOG_FILE"