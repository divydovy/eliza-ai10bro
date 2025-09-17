#!/bin/bash

# Eliza Broadcast Automation Cron Setup
# This script sets up cron jobs for automated broadcast processing

ELIZA_PATH="/Users/davidlockie/Documents/Projects/Eliza"
LOG_DIR="$ELIZA_PATH/logs"

# Create logs directory if it doesn't exist
mkdir -p $LOG_DIR

# Create cron job script
cat > $ELIZA_PATH/run-broadcast-tasks.sh << 'EOF'
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
EOF

chmod +x $ELIZA_PATH/run-broadcast-tasks.sh

# Create data sync script
cat > $ELIZA_PATH/run-data-sync.sh << 'EOF'
#!/bin/bash
cd /Users/davidlockie/Documents/Projects/Eliza

LOG_FILE="logs/sync-$(date +%Y%m%d).log"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting data sync..." >> $LOG_FILE

# Sync GitHub data
curl -s -X POST http://localhost:3003/trigger \
    -H "Content-Type: application/json" \
    -d '{"action":"SYNC_GITHUB"}' >> $LOG_FILE 2>&1

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Data sync completed" >> $LOG_FILE
EOF

chmod +x $ELIZA_PATH/run-data-sync.sh

# Add cron jobs
echo "Setting up cron jobs..."

# Write crontab entries
(crontab -l 2>/dev/null; echo "# Eliza Broadcast Automation") | crontab -
(crontab -l 2>/dev/null; echo "# Send broadcasts every hour") | crontab -
(crontab -l 2>/dev/null; echo "0 * * * * $ELIZA_PATH/run-broadcast-tasks.sh") | crontab -
(crontab -l 2>/dev/null; echo "# Sync data daily at 3 AM") | crontab -
(crontab -l 2>/dev/null; echo "0 3 * * * $ELIZA_PATH/run-data-sync.sh") | crontab -

echo "✅ Cron jobs have been set up!"
echo ""
echo "Schedule:"
echo "  - Broadcasts: Every hour on the hour"
echo "  - Data sync: Daily at 3 AM"
echo ""
echo "To view cron jobs: crontab -l"
echo "To edit cron jobs: crontab -e"
echo "To remove all cron jobs: crontab -r"
echo ""
echo "Logs will be saved to: $LOG_DIR"