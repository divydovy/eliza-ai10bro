#!/bin/bash

# Change to the project directory
cd "$(dirname "$0")/.."

# Run the update script
pnpm tsx scripts/update-obsidian-knowledge.ts characters/photomatt.character.json >> logs/obsidian-update.log 2>&1