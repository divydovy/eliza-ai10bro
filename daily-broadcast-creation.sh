#!/bin/bash

# Daily Broadcast Creation
# Creates new broadcasts from documents without them
# Runs once daily to generate fresh content

cd /Users/davidlockie/Documents/Projects/Eliza

echo "[$(date)] Starting daily broadcast creation..."

# Check if Ollama is running
if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "[$(date)] ❌ Ollama not running, skipping broadcast creation"
    exit 1
fi

# Get stats before creation
BEFORE=$(sqlite3 ./agent/data/db.sqlite "SELECT 
    (SELECT COUNT(*) FROM broadcasts) as total,
    (SELECT COUNT(*) FROM memories WHERE type = 'documents' AND id NOT IN (SELECT documentId FROM broadcasts WHERE documentId IS NOT NULL)) as unprocessed;")

echo "[$(date)] Before: $BEFORE"

# Create exactly 5 new broadcasts
echo "[$(date)] Creating 5 broadcasts from documents..."
LIMIT=5 node trigger-autobroadcast.js

# Get stats after creation
AFTER=$(sqlite3 ./agent/data/db.sqlite "SELECT 
    (SELECT COUNT(*) FROM broadcasts) as total,
    (SELECT COUNT(*) FROM broadcasts WHERE date(createdAt/1000, 'unixepoch') = date('now')) as today,
    (SELECT COUNT(*) FROM memories WHERE type = 'documents' AND id NOT IN (SELECT documentId FROM broadcasts WHERE documentId IS NOT NULL)) as unprocessed;")

echo "[$(date)] After: $AFTER"

IFS='|' read -r TOTAL TODAY UNPROCESSED <<< "$AFTER"

echo "[$(date)] 📊 Creation Summary:"
echo "   Total broadcasts: $TOTAL"
echo "   Created today: $TODAY"
echo "   Documents still unprocessed: $UNPROCESSED"
echo "[$(date)] Daily broadcast creation complete"