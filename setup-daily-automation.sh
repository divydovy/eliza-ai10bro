#!/bin/bash

echo "🤖 Setting up daily broadcast automation"
echo ""

# Get the full path to the script
SCRIPT_PATH="/Users/davidlockie/Documents/Projects/Eliza/daily-broadcast-processor.sh"
LOG_PATH="/Users/davidlockie/Documents/Projects/Eliza/logs/daily-broadcast.log"

# Check if script exists
if [ ! -f "$SCRIPT_PATH" ]; then
    echo "❌ Daily processor script not found at: $SCRIPT_PATH"
    exit 1
fi

# Create logs directory if it doesn't exist
mkdir -p "$(dirname "$LOG_PATH")"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "daily-broadcast-processor.sh"; then
    echo "⚠️  Daily broadcast processor already scheduled in crontab"
    echo ""
    echo "Current schedule:"
    crontab -l | grep "daily-broadcast-processor.sh"
else
    # Add to crontab (runs at 9 AM daily)
    (crontab -l 2>/dev/null; echo "0 9 * * * $SCRIPT_PATH >> $LOG_PATH 2>&1") | crontab -
    echo "✅ Added daily broadcast processor to crontab"
    echo "   Scheduled to run daily at 9:00 AM"
fi

echo ""
echo "📋 Current cron jobs:"
crontab -l | grep -v "^#" | grep -v "^$"

echo ""
echo "📝 To modify the schedule, run: crontab -e"
echo "📖 To view logs, run: tail -f $LOG_PATH"
echo "❌ To remove automation, run: crontab -l | grep -v 'daily-broadcast-processor.sh' | crontab -"
echo ""
echo "✅ Setup complete!"