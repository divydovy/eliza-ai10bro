#!/bin/bash

echo "════════════════════════════════════════════════════════════"
echo "AI10BRO AUTOMATION HEALTH CHECK"
echo "════════════════════════════════════════════════════════════"
echo ""

# Check LaunchD Services
echo "📋 LAUNCHD SERVICES"
echo "-----------------------------------------------------------"
launchctl list | grep -E "(eliza|ai10bro)" | while read -r pid status label; do
    if [ "$status" = "0" ]; then
        echo "✅ $label - Running (exit $status)"
    else
        echo "❌ $label - Failed (exit $status)"
    fi
done
echo ""

# Check Cron Jobs
echo "📋 CRON JOBS"
echo "-----------------------------------------------------------"
crontab -l | grep -v "^#" | grep -v "^$" | while read -r line; do
    # Extract the command description from comment above
    echo "⏰ $line"
done
echo ""

# Check Recent Logs for Errors (last hour)
echo "📋 RECENT LOG ERRORS (last hour)"
echo "-----------------------------------------------------------"
LOGS_DIR="/Users/davidlockie/Documents/Projects/Eliza/logs"
ERROR_COUNT=0

for log in "$LOGS_DIR"/*.log; do
    if [ -f "$log" ]; then
        LOG_NAME=$(basename "$log")
        # Check for recent errors (last 60 minutes)
        RECENT_ERRORS=$(find "$log" -mmin -60 -exec grep -i "error\|failed\|fatal" {} \; 2>/dev/null | wc -l | tr -d ' ')

        if [ "$RECENT_ERRORS" -gt 0 ]; then
            echo "⚠️  $LOG_NAME: $RECENT_ERRORS errors in last hour"
            ERROR_COUNT=$((ERROR_COUNT + RECENT_ERRORS))
            # Show last 3 errors
            grep -i "error\|failed\|fatal" "$log" | tail -3
            echo ""
        fi
    fi
done

if [ "$ERROR_COUNT" -eq 0 ]; then
    echo "✅ No errors found in recent logs"
fi
echo ""

# Check Background Processes
echo "📋 BACKGROUND PROCESSES"
echo "-----------------------------------------------------------"
ps aux | grep -E "(rescore|llm-score|sync-github|broadcast)" | grep -v grep | while read -r line; do
    echo "🔄 $line"
done || echo "✅ No background processes running"
echo ""

# Check Database Status
echo "📋 DATABASE HEALTH"
echo "-----------------------------------------------------------"
DB_PATH="/Users/davidlockie/Documents/Projects/Eliza/agent/data/db.sqlite"
if [ -f "$DB_PATH" ]; then
    TOTAL_DOCS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM memories WHERE type='documents'")
    PENDING_BROADCASTS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM broadcasts WHERE status='pending'")
    SENT_BROADCASTS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM broadcasts WHERE status='sent'")

    echo "✅ Documents: $TOTAL_DOCS"
    echo "✅ Pending broadcasts: $PENDING_BROADCASTS"
    echo "✅ Sent broadcasts: $SENT_BROADCASTS"
else
    echo "❌ Database not found"
fi
echo ""

# Check Last Run Times
echo "📋 LAST RUN TIMES (from logs)"
echo "-----------------------------------------------------------"
for log in "$LOGS_DIR"/cron-*.log; do
    if [ -f "$log" ]; then
        LOG_NAME=$(basename "$log" .log)
        LAST_RUN=$(tail -1 "$log" 2>/dev/null | grep -oE "[0-9]{4}-[0-9]{2}-[0-9]{2}" | tail -1)
        if [ -n "$LAST_RUN" ]; then
            echo "📅 $LOG_NAME: $LAST_RUN"
        fi
    fi
done
echo ""

echo "════════════════════════════════════════════════════════════"
echo "✅ Health check complete"
echo "════════════════════════════════════════════════════════════"
