# Broadcast System File Overview

## Active Files (Currently in Use)

### Core Services
- `broadcast-api.js` - Main dashboard API (port 3002)
- `action-api-standalone.js` - Trigger API for dashboard buttons (port 3003)
- `broadcast-dashboard.html` - Web dashboard interface

### Broadcast Generation
- `trigger-autobroadcast.js` - **PRIMARY** - Creates broadcasts using LLM when agent is running
- `packages/plugin-broadcast/` - Plugin that runs within agent for automatic broadcasting

### Broadcast Sending
- `send-pending-broadcasts.js` - Sends broadcasts to Telegram/Twitter

### Support Files
- `sync-github-direct.js` - Syncs documents from GitHub repos

## Deprecated/Test Files (Can be removed)
- `generate-broadcasts.js` - Old generation without LLM
- `generate-ai-broadcasts-local.js` - Attempted LLM integration (replaced by trigger-autobroadcast.js)
- `create-new-broadcasts.js` - Simple broadcast creator without generation
- `process-pending-broadcasts.js` - Old processor
- `test-*.js` files - Various test scripts
- `batch-process-broadcasts.js` - Batch processing (not needed)
- `broadcast-trigger-service.js` - Old trigger service
- `trigger-broadcast-generation.js` - Old trigger

## Key Improvements Made
1. **LLM Integration** - Broadcasts now use agent's LLM when available
2. **Quality Scoring** - Each broadcast gets scored 50-99% based on content
3. **Source URL Extraction** - Automatically adds source links
4. **Dynamic Endings** - No more generic "Track this breakthrough" endings
5. **Agent Dependency** - Broadcast generation requires agent to be running

## Workflow
1. Agent starts → AutoBroadcastService initializes
2. Dashboard button clicked → action-api calls trigger-autobroadcast.js
3. trigger-autobroadcast.js checks agent is running
4. Uses LLM to generate high-quality broadcasts
5. Stores in database with quality scores
6. Send button → sends to Telegram/Twitter