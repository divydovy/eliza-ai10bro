#!/bin/bash

# Sync and import GitHub scraper content
# Runs: Pull latest from GitHub, then import new content

echo "🔄 Starting GitHub content sync..."
echo "Timestamp: $(date)"

# Change to gdelt-obsidian directory
cd /Users/davidlockie/Documents/Projects/gdelt-obsidian || exit 1

# Pull latest content from GitHub
echo "📥 Pulling latest content from GitHub..."
GIT_SSH_COMMAND="ssh -o IdentityAgent=~/.1password-agent.sock" git pull origin master

# Check if pull was successful
if [ $? -eq 0 ]; then
    echo "✅ Git pull successful"
else
    echo "❌ Git pull failed"
    exit 1
fi

# Change to Eliza directory
cd /Users/davidlockie/Documents/Projects/Eliza || exit 1

# Run import script
echo "📚 Importing new documents..."
node import-github-scrapers.js

# Check import result
if [ $? -eq 0 ]; then
    echo "✅ Import complete"
    echo "🎉 GitHub content sync finished successfully"
else
    echo "❌ Import failed"
    exit 1
fi
