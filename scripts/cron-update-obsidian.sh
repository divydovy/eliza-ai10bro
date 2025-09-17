#!/bin/bash

# Obsidian Import Script for LaunchAgent
# Runs the import-obsidian.js script with proper environment setup

set -e

# Change to project directory
cd /Users/davidlockie/Documents/Projects/Eliza

# Set up Node.js environment
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

# Use the correct Node.js version
nvm use 23.3.0

# Run the Obsidian import
echo "$(date): Starting Obsidian import..."
node import-obsidian.js
echo "$(date): Obsidian import completed"