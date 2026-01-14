#!/bin/bash

# Use Node 23.3.0 directly (bypass nvm issues)
export PATH="/Users/davidlockie/.nvm/versions/node/v23.3.0/bin:$PATH"

# Start the agent
cd /Users/davidlockie/Documents/Projects/Eliza
exec pnpm start
