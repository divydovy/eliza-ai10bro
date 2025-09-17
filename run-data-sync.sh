#!/bin/bash
cd /Users/davidlockie/Documents/Projects/Eliza

LOG_FILE="logs/sync-$(date +%Y%m%d).log"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting data sync..." >> $LOG_FILE

# Sync GitHub data
curl -s -X POST http://localhost:3003/trigger \
    -H "Content-Type: application/json" \
    -d '{"action":"SYNC_GITHUB"}' >> $LOG_FILE 2>&1

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Data sync completed" >> $LOG_FILE
