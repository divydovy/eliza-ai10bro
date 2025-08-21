#!/bin/bash

echo "🚀 Checking for documents to broadcast..."
echo ""

# Check total documents
TOTAL_DOCS=$(sqlite3 agent/data/db.sqlite "SELECT COUNT(*) FROM memories WHERE json_extract(content, '$.text') IS NOT NULL;")
echo "📚 Total documents in database: $TOTAL_DOCS"

# Check pending broadcasts
PENDING=$(sqlite3 agent/data/db.sqlite "SELECT COUNT(*) FROM broadcasts WHERE status='pending';")
echo "📤 Pending broadcasts: $PENDING"

# Get sample documents
echo ""
echo "📄 Recent documents available for broadcast:"
sqlite3 agent/data/db.sqlite "
SELECT 
    substr(json_extract(content, '$.metadata.path'), 1, 50) as path,
    substr(json_extract(content, '$.text'), 1, 100) as preview,
    id
FROM memories 
WHERE json_extract(content, '$.text') IS NOT NULL
AND length(json_extract(content, '$.text')) > 100
AND id NOT IN (SELECT documentId FROM broadcasts)
ORDER BY createdAt DESC
LIMIT 5;
" | while IFS='|' read -r path preview id; do
    echo "  - $path"
    echo "    Preview: ${preview}..."
    echo "    ID: $id"
    echo ""
done

# Get first document ID for testing
FIRST_DOC=$(sqlite3 agent/data/db.sqlite "
SELECT id
FROM memories 
WHERE json_extract(content, '$.text') IS NOT NULL
AND length(json_extract(content, '$.text')) > 100
AND id NOT IN (SELECT documentId FROM broadcasts)
ORDER BY createdAt DESC
LIMIT 1;
")

if [ -n "$FIRST_DOC" ]; then
    echo "🎯 Triggering CREATE_MESSAGE for document: $FIRST_DOC"
    
    # Trigger the agent to create a broadcast message
    curl -X POST http://localhost:3000/7298724c-f4fa-0ff3-b2aa-3660e54108d4/message \
        -H "Content-Type: application/json" \
        -d "{\"text\":\"Please create a broadcast message about this document: $FIRST_DOC\",\"userId\":\"scheduler\",\"userName\":\"Broadcast Generator\",\"documentId\":\"$FIRST_DOC\"}" \
        --max-time 30
    
    echo ""
    echo ""
    
    # Check results after a delay
    sleep 3
    
    NEW_PENDING=$(sqlite3 agent/data/db.sqlite "SELECT COUNT(*) FROM broadcasts WHERE status='pending';")
    echo "📊 Updated pending broadcasts: $NEW_PENDING"
    
    if [ "$NEW_PENDING" -gt "$PENDING" ]; then
        echo "✅ Successfully created $((NEW_PENDING - PENDING)) new broadcast(s)!"
    else
        echo "⚠️ No new broadcasts created. The agent may need to be configured to handle CREATE_MESSAGE action."
    fi
else
    echo "❌ No documents found to broadcast"
fi