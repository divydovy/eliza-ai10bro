#!/bin/bash

# Setup Broadcast Cron Jobs

ELIZA_PATH="/Users/davidlockie/Documents/Projects/Eliza"

echo "Setting up broadcast cron jobs..."

# Create temp cron file
TEMP_CRON=$(mktemp)

# Add our jobs to temp file
cat > "$TEMP_CRON" << EOF
# Eliza Broadcast Automation
# Send broadcast every hour
0 * * * * $ELIZA_PATH/hourly-broadcast-send.sh
# Create new broadcasts twice daily (6 AM and 6 PM)
0 6,18 * * * cd $ELIZA_PATH && node process-unprocessed-docs.js 10
EOF

# Install the cron jobs
crontab "$TEMP_CRON"

# Clean up temp file
rm "$TEMP_CRON"

echo "✅ Cron jobs installed successfully!"
echo ""
echo "Schedule:"
echo "  - Send broadcasts: Every hour on the hour"
echo "  - Create broadcasts: 6 AM and 6 PM daily"
echo ""
echo "To view cron jobs: crontab -l"
echo "To edit cron jobs: crontab -e"
echo "To remove all cron jobs: crontab -r"