#!/bin/bash

# Change to the project directory
cd "$(dirname "$0")/.."

# Create logs directory if it doesn't exist
mkdir -p logs

# Run the update script
pnpm tsx scripts/update-obsidian-knowledge.ts characters/ai10bro.character.json >> logs/obsidian-update.log 2>&1