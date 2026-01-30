#!/bin/bash

# Verify LaunchD Full Automation Cycle
# Run this after 10am to verify all overnight services ran successfully

echo "═══════════════════════════════════════════════════════════════════"
echo "🔍 LAUNCHD AUTOMATION CYCLE VERIFICATION"
echo "═══════════════════════════════════════════════════════════════════"
echo "Date: $(date)"
echo ""

# Check LaunchD service statuses
echo "📋 LaunchD Service Status:"
echo "───────────────────────────────────────────────────────────────────"
launchctl list | grep "com.eliza" | while read -r pid status label; do
    if [ "$status" = "0" ]; then
        echo "✅ $label - Exit code: $status"
    else
        echo "❌ $label - Exit code: $status"
    fi
done
echo ""

# Check log files for errors
echo "📝 Log File Analysis (Last Run):"
echo "───────────────────────────────────────────────────────────────────"

check_log() {
    local log_file=$1
    local service_name=$2
    local expected_time=$3

    if [ -f "$log_file" ]; then
        local last_run=$(tail -1 "$log_file" 2>/dev/null | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' || echo "Unknown")
        local errors=$(grep -i "error\|failed\|fatal" "$log_file" 2>/dev/null | tail -3)

        if [ -z "$errors" ]; then
            echo "✅ $service_name ($expected_time) - Last run: $last_run - No errors"
        else
            echo "⚠️  $service_name ($expected_time) - Last run: $last_run - Errors found:"
            echo "$errors" | sed 's/^/    /'
        fi
    else
        echo "❓ $service_name ($expected_time) - Log file not found"
    fi
}

cd /Users/davidlockie/Documents/Projects/Eliza

check_log "logs/github-sync.log" "GitHub Sync" "2:00am"
check_log "logs/obsidian-import.log" "Obsidian Import" "2:30am"
check_log "logs/alignment-scoring.log" "Alignment Scoring" "3:00am"
check_log "logs/github-content-sync.log" "GitHub Content Sync" "3:30am"
check_log "logs/cleanup-unaligned.log" "Cleanup Unaligned" "3:50am"
check_log "logs/broadcast-creation.log" "Broadcast Creation" "4:00am"
check_log "logs/quality-checks.log" "Quality Checks" "8:00am"
check_log "logs/wordpress-deepdives.log" "WordPress Deep Dives" "10:00am"

echo ""

# Check database stats
echo "📊 Database Statistics:"
echo "───────────────────────────────────────────────────────────────────"
sqlite3 agent/data/db.sqlite << 'EOF'
SELECT 'Total Documents: ' || COUNT(*) FROM memories WHERE type = 'documents';
SELECT 'GitHub Documents: ' || COUNT(*) FROM memories WHERE type = 'documents' AND json_extract(content, '$.source') = 'github';
SELECT 'Broadcast-ready (≥12%): ' || COUNT(*) FROM memories WHERE type = 'documents' AND alignment_score >= 0.12;
SELECT 'Pending Broadcasts: ' || COUNT(*) FROM broadcasts WHERE status = 'pending';
SELECT 'Sent Broadcasts (last 24h): ' || COUNT(*) FROM broadcasts WHERE status = 'sent' AND createdAt > (unixepoch() - 86400) * 1000;
EOF
echo ""

# Check broadcast counts by platform
echo "📤 Broadcast Status by Platform:"
echo "───────────────────────────────────────────────────────────────────"
sqlite3 agent/data/db.sqlite << 'EOF'
SELECT
    client,
    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
    SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
FROM broadcasts
GROUP BY client
ORDER BY client;
EOF
echo ""

# Check for recent broadcasts created
echo "🆕 Broadcasts Created in Last 24 Hours:"
echo "───────────────────────────────────────────────────────────────────"
sqlite3 agent/data/db.sqlite << 'EOF'
SELECT
    client,
    COUNT(*) as count,
    datetime(MAX(createdAt)/1000, 'unixepoch') as last_created
FROM broadcasts
WHERE createdAt > (unixepoch() - 86400) * 1000
GROUP BY client;
EOF
echo ""

# Summary
echo "═══════════════════════════════════════════════════════════════════"
echo "📋 SUMMARY"
echo "═══════════════════════════════════════════════════════════════════"

# Count services with exit code 0
success_count=$(launchctl list | grep "com.eliza" | awk '{print $2}' | grep -c "^0$")
total_count=$(launchctl list | grep "com.eliza" | wc -l | tr -d ' ')

echo "✅ Services with exit code 0: $success_count/$total_count"

# Check if any logs have recent errors
error_count=$(grep -l "error\|failed\|fatal" logs/*.log 2>/dev/null | wc -l | tr -d ' ')
if [ "$error_count" -eq 0 ]; then
    echo "✅ No errors in log files"
else
    echo "⚠️  $error_count log files contain errors (review above)"
fi

# Check if broadcasts were created
broadcasts_created=$(sqlite3 agent/data/db.sqlite "SELECT COUNT(*) FROM broadcasts WHERE createdAt > (unixepoch() - 86400) * 1000")
if [ "$broadcasts_created" -gt 0 ]; then
    echo "✅ $broadcasts_created broadcasts created in last 24 hours"
else
    echo "⚠️  No broadcasts created in last 24 hours"
fi

echo ""
echo "Next steps:"
echo "1. Review any services with non-zero exit codes"
echo "2. Check log files for warnings/errors"
echo "3. Monitor next cycle (24 hours from now)"
echo "═══════════════════════════════════════════════════════════════════"
