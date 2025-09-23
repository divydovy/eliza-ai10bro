# 📡 Broadcast System Documentation

## Overview
The Eliza Broadcast System is a fully automated multi-platform content distribution system that transforms knowledge documents into engaging social media broadcasts. It uses AI to generate contextual, mission-aligned content and distributes it across Telegram, Bluesky, and Farcaster.

## 🏗️ Architecture

### System Components
```
Documents (Knowledge Base)
    ↓
Process-Unprocessed-Docs (Ollama LLM)
    ↓
Broadcasts Database (SQLite)
    ↓
Action API (Round-Robin Distribution)
    ↓
Platform APIs (Telegram, Bluesky, Farcaster)
```

### Key Files
- `process-unprocessed-docs.js` - Main broadcast generation script
- `packages/plugin-dashboard/src/services/action-api.js` - Handles broadcast sending
- `packages/plugin-dashboard/src/services/broadcast-api.js` - Dashboard API
- `broadcast-dashboard.html` - Web interface for monitoring
- `hourly-broadcast-send.sh` - Cron job script for automated sending

## 🔄 Broadcast Flow

### 1. Document Ingestion
Documents are ingested from:
- GitHub repositories (via sync)
- Obsidian vault imports
- Direct document uploads

### 2. Broadcast Generation
```javascript
// Triggered every 4 hours via cron
node process-unprocessed-docs.js 10
```
- Filters documents for quality (>100 chars, no test/draft content)
- Uses Ollama (qwen2.5:14b model) for content generation
- Creates 3 broadcasts per document (one for each platform)
- Applies platform-specific character limits

### 3. Distribution
```bash
# Triggered hourly via cron
curl -X POST http://localhost:3003/trigger \
  -H "Content-Type: application/json" \
  -d '{"action":"PROCESS_QUEUE"}'
```
- Round-robin selection ensures fair platform distribution
- Sends 3 broadcasts per hour (1 per platform)
- Failed broadcasts revert to "pending" status

## 🎯 Prompt Engineering

### Current Prompt Structure (process-unprocessed-docs.js)
```javascript
const prompt = `You are AI10BRO, tracking breakthrough innovations...

STYLE VARIATIONS (randomly choose one approach):
A) Direct news lead: "MIT just cracked the code for..."
B) Impact first: "Your electricity bills could drop 80% thanks to..."
C) Problem-solution: "The plastic crisis just met its match..."
D) Future vision: "By 2030, your home could regenerate its own energy..."
E) Occasionally (20% of time) nature metaphor: "Like fireflies creating light without heat..."

KEY PRINCIPLES:
- Make it newsworthy - focus on what's NEW and WHY NOW
- Include specific numbers, timelines, or scale
- Connect to climate, health, equity, or regenerative systems
- Write like you're sharing exciting news with a friend
- Vary your openings - avoid formulaic patterns
```

### Quality Checks
1. **Length Enforcement**: Smart truncation preserves source URLs
2. **Quote Removal**: Prevents LLM from wrapping broadcasts in quotes
3. **Source Preservation**: Maintains links even when truncating
4. **Mission Alignment**: Content must align with sustainable/regenerative tech focus

## 🔑 Credentials Configuration

### Platform Requirements

| Platform | Configuration Location | Required Fields | Status |
|----------|----------------------|-----------------|---------|
| **Telegram** | `characters/ai10bro.character.json` | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | ✅ Active |
| **Bluesky** | `characters/ai10bro.character.json` | `BLUESKY_HANDLE`, `BLUESKY_APP_PASSWORD` | ✅ Active |
| **Farcaster** | `characters/ai10bro.character.json` | `FARCASTER_FID`, `SIGNER_UUID` | ✅ Active |

### Example Character File Structure
```json
{
  "name": "AI10BRO",
  "clients": ["telegram", "bluesky", "farcaster"],
  "settings": {
    "secrets": {
      "TELEGRAM_BOT_TOKEN": "your-bot-token",
      "TELEGRAM_CHAT_ID": "your-chat-id",
      "BLUESKY_HANDLE": "username.bsky.social",
      "BLUESKY_APP_PASSWORD": "app-specific-password",
      "FARCASTER_FID": "your-fid",
      "SIGNER_UUID": "your-signer-uuid"
    }
  }
}
```

## ⚙️ Automation Setup

### Current Schedule (via Crontab)
```bash
# Send broadcasts every hour
0 * * * * /Users/davidlockie/Documents/Projects/Eliza/hourly-broadcast-send.sh

# Create new broadcasts every 4 hours
0 0,4,8,12,16,20 * * * cd /Users/davidlockie/Documents/Projects/Eliza && node process-unprocessed-docs.js 10
```

### Setting Up Automation
```bash
# Quick setup
./setup-broadcast-cron.sh

# Manual crontab edit
crontab -e
```

### Rate Balancing
- **Creation**: 60 broadcasts/day (20 per platform)
- **Sending**: 72 broadcasts/day (24 per platform)
- **Buffer**: Maintains ~60 pending broadcasts

## 📊 Dashboard & Monitoring

### Starting the Dashboard
```bash
# Start both APIs
node packages/plugin-dashboard/src/services/broadcast-api.js &
node packages/plugin-dashboard/src/services/action-api.js &

# Access dashboard
open http://localhost:3002/broadcast-dashboard.html
```

### Dashboard Features
- Real-time statistics (documents, broadcasts, pending)
- Manual broadcast triggers
- Platform-specific counters
- Recent activity log
- GitHub sync status

### API Endpoints

| Endpoint | Port | Purpose |
|----------|------|---------|
| `/stats` | 3002 | Get broadcast statistics |
| `/config` | 3002 | Get/update configuration |
| `/trigger` | 3003 | Trigger actions (SYNC_GITHUB, CREATE_BROADCASTS, PROCESS_QUEUE) |

## 🐛 Troubleshooting

### Common Issues & Solutions

1. **1970s dates in dashboard**
   - Cause: Mixed timestamp formats (Unix ms vs SQLite datetime)
   - Solution: Check `broadcast-api.js` timestamp handling

2. **Broadcasts not sending**
   - Check API credentials in character file
   - Verify action-api.js is running on port 3003
   - Check logs in `logs/broadcast-*.log`

3. **Poor quality broadcasts**
   - Review source document quality
   - Check for test/draft content filtering
   - Verify Ollama model is running

4. **Platform-specific failures**
   - Telegram: Check bot token and chat ID
   - Bluesky: Verify app password (not main password)
   - Farcaster: Ensure signer UUID is valid

### Log Locations
```bash
logs/broadcast-YYYYMMDD.log  # Hourly send logs
agent-startup.log             # Agent initialization
broadcast-api.log             # Dashboard API logs
action-api.log               # Action trigger logs
```

## 📈 Performance Metrics

### Current System Performance
- **Document Coverage**: ~24% have broadcasts
- **Success Rate**: >95% for configured platforms
- **Generation Time**: ~2 seconds per broadcast
- **Platform Limits**:
  - Telegram: 4096 chars
  - Farcaster: 320 chars
  - Bluesky: 300 chars

## 🚀 Quick Start Commands

```bash
# Generate broadcasts manually
node process-unprocessed-docs.js 20

# Send one broadcast set manually
curl -X POST http://localhost:3003/trigger \
  -H "Content-Type: application/json" \
  -d '{"action":"PROCESS_QUEUE"}'

# Check pending broadcasts
sqlite3 ./agent/data/db.sqlite \
  "SELECT client, COUNT(*) FROM broadcasts WHERE status='pending' GROUP BY client;"

# View recent broadcasts
sqlite3 ./agent/data/db.sqlite \
  "SELECT datetime(sent_at/1000, 'unixepoch'), client, substr(json_extract(content, '$.text'), 1, 50)
   FROM broadcasts WHERE status='sent' ORDER BY sent_at DESC LIMIT 10;"
```

## 🔮 Future Enhancements

### Planned Features
- [ ] Twitter/X integration
- [ ] Dynamic prompt adjustment based on engagement
- [ ] A/B testing for broadcast styles
- [ ] Automated image generation for broadcasts
- [ ] Engagement tracking and analytics
- [ ] Multi-language support

### Optimization Opportunities
- Implement Redis for queue management
- Add WebSocket for real-time dashboard updates
- Create broadcast preview system
- Add scheduled posting for optimal times
- Implement retry logic with exponential backoff

## 📝 Key Learnings

1. **Unified System is Critical**: Having a single broadcast creation pipeline prevents duplication and ensures consistency

2. **Content Quality > Quantity**: Better to have fewer high-quality broadcasts than many low-quality ones

3. **Platform Limits Matter**: Each platform has different character limits and formatting requirements

4. **Round-Robin Distribution**: Ensures fair coverage across all platforms

5. **Source Quality Determines Output**: Documents with real sources and substantial content produce better broadcasts

6. **Prompt Variation is Essential**: Multiple style approaches prevent formulaic, repetitive content

7. **Automation Must Be Balanced**: Creation and sending rates should be nearly equal to maintain steady pipeline

8. **Credential Management**: Store platform credentials securely in character files, not in code

9. **Monitoring is Crucial**: Dashboard provides essential visibility into system health

10. **Graceful Failure Handling**: Failed broadcasts should revert to pending, not be lost

---

Last Updated: 2025-09-23
System Version: 1.0.0