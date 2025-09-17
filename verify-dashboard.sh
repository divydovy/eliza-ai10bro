#!/bin/bash

echo "🔍 Dashboard Content Verification"
echo "================================"
echo ""

# Test dashboard HTML content
echo "✅ Checking HTML content features:"

# Check for Source Quality Metrics
if curl -s http://localhost:3001/broadcast-dashboard.html | grep -q "Source Quality Metrics"; then
    echo "   ✓ Source Quality Metrics section found"
else
    echo "   ✗ Source Quality Metrics section MISSING"
fi

# Check for Recently Imported Knowledge
if curl -s http://localhost:3001/broadcast-dashboard.html | grep -q "Recently Imported Knowledge"; then
    echo "   ✓ Recently Imported Knowledge section found"
else
    echo "   ✗ Recently Imported Knowledge section MISSING"
fi

# Check for Platform Status
if curl -s http://localhost:3001/broadcast-dashboard.html | grep -q "Platform Status"; then
    echo "   ✓ Platform Status section found"
else
    echo "   ✗ Platform Status section MISSING"
fi

# Check for Automation Schedule
if curl -s http://localhost:3001/broadcast-dashboard.html | grep -q "Automation Schedule"; then
    echo "   ✓ Automation Schedule section found"
else
    echo "   ✗ Automation Schedule section MISSING"
fi

# Check for Knowledge source types
echo ""
echo "✅ Checking Knowledge Source Types:"
for source in "github-gdelt" "github-youtube" "github-arxiv" "obsidian" "obsidian-web"; do
    if curl -s http://localhost:3001/broadcast-dashboard.html | grep -q "$source"; then
        echo "   ✓ Source type: $source found"
    else
        echo "   ✗ Source type: $source MISSING"
    fi
done

echo ""
echo "✅ Checking API Endpoints:"

# Test broadcast stats API
stats=$(curl -s http://localhost:3001/api/broadcast-stats)
if [ $? -eq 0 ]; then
    total_docs=$(echo $stats | jq -r '.totalDocuments')
    total_broadcasts=$(echo $stats | jq -r '.totalBroadcasts')
    pending=$(echo $stats | jq -r '.pendingBroadcasts')
    sent=$(echo $stats | jq -r '.sentBroadcasts')

    echo "   ✓ Broadcast Stats API: OK"
    echo "      - Total Documents: $total_docs"
    echo "      - Total Broadcasts: $total_broadcasts"
    echo "      - Pending: $pending"
    echo "      - Sent: $sent"
else
    echo "   ✗ Broadcast Stats API: FAILED"
fi

# Test health endpoint
if curl -s http://localhost:3001/health | jq -r '.status' | grep -q "healthy"; then
    echo "   ✓ Health Check: OK"
else
    echo "   ✗ Health Check: FAILED"
fi

# Test action API health
if curl -s http://localhost:3003/health | jq -r '.status' | grep -q "healthy"; then
    echo "   ✓ Action API Health: OK"
else
    echo "   ✗ Action API Health: FAILED"
fi

echo ""
echo "✅ Checking Dashboard Elements:"

# Count specific dashboard elements
knowledge_count=$(curl -s http://localhost:3001/broadcast-dashboard.html | grep -o "knowledge-item" | wc -l)
echo "   ✓ Knowledge item class references: $knowledge_count"

metric_count=$(curl -s http://localhost:3001/broadcast-dashboard.html | grep -o "metric-card" | wc -l)
echo "   ✓ Metric card class references: $metric_count"

platform_count=$(curl -s http://localhost:3001/broadcast-dashboard.html | grep -o "platform-" | wc -l)
echo "   ✓ Platform-related elements: $platform_count"

echo ""
echo "================================"
echo "Dashboard verification complete!"