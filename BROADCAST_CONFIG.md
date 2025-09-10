# Broadcast Configuration Guide

## Overview
The broadcast system now uses the character JSON file as the single source of truth for enabled clients, simplifying configuration management.

## Client Configuration

### Enabling/Disabling Broadcast Clients
Edit your character file (`characters/ai10bro.character.json`):

```json
{
  "clients": ["telegram", "bluesky"],  // Add/remove clients here
  ...
}
```

**Available broadcast clients:**
- `telegram` - Send to Telegram channels ✅ Working
- `twitter` (or `x`) - Send to X/Twitter ⚠️ Not configured
- `farcaster` - Send to Farcaster ⏳ Awaiting signer approval
- `bluesky` - Send to Bluesky ✅ Working

### Example Configurations

**Telegram only:**
```json
"clients": ["direct", "telegram"]
```

**Multiple platforms:**
```json
"clients": ["direct", "telegram", "twitter"]
```

**Disable all broadcasts:**
```json
"clients": ["direct"]
```

## Prioritization Settings

The `broadcast-config.json` file controls broadcast prioritization and limits:

```json
{
  "prioritization": {
    "recencyBias": true,      // Prioritize recent documents
    "recencyWindow": 7,        // Look back N days for recent content
    "recencyWindowUnit": "days"
  },
  "limits": {
    "maxBroadcastsPerRun": 5,     // Create up to N broadcasts per run
    "maxBroadcastsPerDocument": 2, // Max broadcasts per document
    "minTimeBetweenBroadcasts": 300000  // 5 minutes between sends
  },
  "qualityThresholds": {
    "minimum": 0.5,    // Minimum quality score to broadcast
    "preferred": 0.7   // Preferred quality threshold
  }
}
```

## How It Works

1. **Client Detection**: The system reads `clients` array from character file
2. **Mapping**: Maps client names to broadcast platforms (e.g., "twitter" → "twitter", "x" → "twitter")
3. **Filtering**: Only creates broadcasts for enabled and supported clients
4. **Prioritization**: Uses recency bias to focus on new content first
5. **Rate Limiting**: Respects time delays between broadcasts

## Commands

### Create Broadcasts (only for enabled clients)
```bash
node trigger-autobroadcast.js
```

### Send Prioritized Broadcasts
```bash
node send-prioritized-broadcasts.js
```

### Check Current Configuration
```bash
grep '"clients"' characters/ai10bro.character.json
```

## Migration from Old System

If you were using the old `broadcast-config.json` with `enabledClients`:
1. Check which clients were enabled in the old config
2. Add those clients to your character file's `clients` array
3. Remove the `enabledClients` section from `broadcast-config.json`

## Benefits

- **Single source of truth**: Character file controls all client settings
- **Cleaner configuration**: No duplicate client lists
- **Automatic sync**: Agent and broadcast system use same client list
- **Easier management**: Just edit one file to enable/disable platforms