#!/bin/bash
cd /Users/davidlockie/Documents/Projects/Eliza

# Log file with timestamp
LOG_FILE="logs/broadcast-$(date +%Y%m%d).log"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting broadcast task..." >> $LOG_FILE

# Send next broadcast (up to 5)
for i in {1..5}; do
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Sending broadcast $i..." >> $LOG_FILE
    curl -s -X POST http://localhost:3003/trigger \
        -H "Content-Type: application/json" \
        -d '{"action":"PROCESS_QUEUE"}' >> $LOG_FILE 2>&1
    sleep 30  # Wait 30 seconds between broadcasts
done

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Broadcast task completed" >> $LOG_FILE
