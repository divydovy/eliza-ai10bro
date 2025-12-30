#!/bin/bash

# Sync and import GitHub scraper content
# Runs: Pull latest from GitHub, then import new content

echo "🔄 Starting GitHub content sync..."
echo "Timestamp: $(date)"

# Change to gdelt-obsidian directory
cd /Users/davidlockie/Documents/Projects/gdelt-obsidian || exit 1

# Fetch and reset to latest (more reliable than pull for automation)
echo "📥 Fetching latest content from GitHub..."
# Use gh CLI for authentication (works in cron without user interaction)
GIT_ASKPASS=/opt/homebrew/bin/gh git fetch origin master

# Check if fetch was successful
if [ $? -eq 0 ]; then
    echo "✅ Git fetch successful"

    # Reset to origin/master (discards any local changes)
    echo "🧹 Resetting to origin/master..."
    git reset --hard origin/master
    git clean -fd

    echo "✅ Sync complete"
else
    echo "❌ Git fetch failed"
    exit 1
fi

# Change to Eliza directory
cd /Users/davidlockie/Documents/Projects/Eliza || exit 1

# Load nvm and run import script
echo "📚 Importing new documents..."
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 23.3.0 > /dev/null 2>&1
node import-github-scrapers.js

# Check import result
if [ $? -eq 0 ]; then
    echo "✅ Import complete"
    echo "🎉 GitHub content sync finished successfully"
else
    echo "❌ Import failed"
    exit 1
fi
