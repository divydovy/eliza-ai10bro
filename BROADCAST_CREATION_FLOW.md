# Broadcast Creation Flow Documentation

## The SINGLE Source of Truth

**`process-unprocessed-docs.js`** is the ONLY script that actually generates broadcasts using Ollama/LLM.

## Script Hierarchy

```
Entry Points:
├── create-broadcasts.js (MAIN ENTRY POINT - wraps process-unprocessed-docs)
├── action-api-standalone.js → calls create-broadcasts.js
├── cron jobs → calls CREATE_BROADCASTS action
└── dashboard → calls CREATE_BROADCASTS action

Core Logic:
└── process-unprocessed-docs.js (THE ACTUAL GENERATOR)
    - Uses Ollama with qwen2.5:14b model
    - Contains the prompts and generation logic
    - Creates broadcasts for all 3 platforms
    - Handles truncation and formatting
```

## DO NOT CREATE ADDITIONAL BROADCAST GENERATION SCRIPTS!

All broadcast creation must go through this flow:
1. External trigger (cron/dashboard/API)
2. → `create-broadcasts.js` (unified entry point)
3. → `process-unprocessed-docs.js` (actual generation)

## Scripts to IGNORE/DELETE:
- create-new-broadcasts.js (obsolete wrapper)
- test-broadcast-generation.js (testing only)
- generate-platform-broadcasts.js (doesn't exist, referenced in error)

## How to Create Broadcasts

### Via Dashboard
Click "Create Broadcasts" button

### Via API
```bash
curl -X POST http://localhost:3003/trigger \
  -H "Content-Type: application/json" \
  -d '{"action":"CREATE_BROADCASTS"}'
```

### Via CLI
```bash
node create-broadcasts.js [limit]
```

### Via Cron
Already configured in `eliza-crontab-full`

---
Last updated: 2025-09-24
If confused about broadcast creation, refer to THIS document!