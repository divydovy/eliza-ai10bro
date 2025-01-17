#!/bin/bash

# Run the TypeScript file using ts-node
NODE_OPTIONS='--loader ts-node/esm --no-warnings' node --experimental-specifier-resolution=node scripts/update-obsidian-knowledge.ts