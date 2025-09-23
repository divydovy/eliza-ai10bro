# Claude Code Session Context

## Project Overview
**Project**: Eliza AI Agent - Multi-platform Broadcast System
**Framework**: ElizaOS with custom plugins
**Main Character**: AI10BRO
**Location**: `/Users/davidlockie/Documents/Projects/Eliza/`

## Session: 2025-09-23

### Major Accomplishments

#### 1. Broadcast Quality Improvements
- **Reduced formulaic nature metaphors** from 100% to 20% occurrence
- **Added 5 style variations** to prevent repetitive patterns:
  - Direct news lead: "MIT just cracked the code for..."
  - Impact first: "Your electricity bills could drop 80% thanks to..."
  - Problem-solution: "The plastic crisis just met its match..."
  - Future vision: "By 2030, your home could regenerate its own energy..."
  - Nature metaphor (20% only): "Like fireflies creating light without heat..."
- **Result**: More diverse, newsworthy broadcasts focused on innovation

#### 2. Broadcast Automation Optimization
- **Increased generation frequency** from twice daily to every 4 hours
- **Cron schedule updated**:
  - Send broadcasts: Every hour (24/day per platform)
  - Create broadcasts: Every 4 hours at 0,4,8,12,16,20 (60/day total)
- **Pipeline balance**: 60 created vs 72 sent daily maintains buffer
- **Generated 66 pending broadcasts** to build sufficient pipeline

#### 3. Multi-Platform Broadcasting Confirmed
- **Verified all 3 platforms working**: Telegram, Bluesky, Farcaster
- **Round-robin distribution** ensures fair platform coverage
- **Platform-specific limits enforced**:
  - Telegram: 4096 chars
  - Farcaster: 320 chars
  - Bluesky: 300 chars
- **Smart truncation** preserves source URLs when cutting content

#### 4. Comprehensive Documentation
- **Created BROADCAST_SYSTEM.md** with full system documentation:
  - Architecture diagrams
  - Workflow explanations
  - Prompt engineering details
  - Credential configuration
  - Troubleshooting guide
  - Performance metrics
  - Quick start commands
- **Key learnings documented**:
  - Unified system prevents duplication
  - Content quality > quantity
  - Source quality determines output
  - Prompt variation essential for diversity

## Session: 2025-08-22

### Major Accomplishments

#### 1. Security Audit & Cleanup
- **Removed exposed API credentials** from git tracking
- **Enhanced .gitignore** with comprehensive security patterns
- **Removed from tracking**:
  - 5 character JSON files with embedded secrets
  - n8n-data/config with encryption key
- **Created SECURITY_AUDIT.md** documenting all exposed credentials
- **Note**: All API keys have been rotated and are no longer valid

#### 2. Dashboard System Fixes
- **Fixed GitHub sync error** - Action API wasn't running on port 3003
- **Added .env.broadcast loading** to broadcast-api-simple.js
- **Clarified statistics display**:
  - 344 documents have broadcasts
  - 541 total broadcasts (some docs have multiple)
  - 24% coverage clearly explained
- **Created DASHBOARD_METRICS_EXPLAINED.md** documenting the math

#### 3. Broadcast System Enhancement
- **Renamed "Process Queue" → "Send Next Broadcast"** for clarity
- **Fixed to send 1 broadcast at a time** (was sending 5)
- **Implemented REAL Telegram sending** (not just simulation)
- **Successfully sent 3 real broadcasts** to Telegram channel
- **Key finding**: Source credibility determines broadcast quality
  - "test" sources = poor quality
  - Real sources (Nature.com, etc.) = high quality

### Current System Status

#### Database Statistics
```
Total Documents:        1,460
Documents with broadcasts: 344 (24% coverage)
Total Broadcasts:         545 (sent)
Pending Broadcasts:         7 (all with real sources)
```

#### Services Running
- **Dashboard**: http://localhost:3002/broadcast-dashboard.html
- **Broadcast API**: Port 3002 (handles stats and config)
- **Action API**: Port 3003 (handles GitHub sync, broadcast sending)

#### GitHub Repository
- **Repo**: divydovy/eliza-ai10bro
- **Latest commit**: 091cbd2db (EOW: Fix broadcast system and enable real Telegram sending)
- **Branch**: main
- **Status**: Clean, all changes pushed

### Technical Architecture

#### Key Files Modified Today
1. **action-api-enhanced.js**
   - Fixed PROCESS_QUEUE to send single broadcasts
   - Integrated real Telegram sending
   - Fixed database column names (sent_at)

2. **broadcast-dashboard.html**
   - Added tooltips to all buttons
   - Improved statistics display with dynamic labels
   - Better CSS for tooltip visibility

3. **send-pending-to-telegram.js**
   - Added support for BROADCAST_ID env variable
   - Can now send specific broadcasts or batch

4. **broadcast-api-simple.js**
   - Added .env.broadcast loading
   - Fixed port configuration for action API

### Workflow Clarification

#### Button Functions
1. **📚 Sync GitHub** - Syncs documents from GitHub repos (1272 docs already synced)
2. **🧠 Import Obsidian** - Imports from Obsidian vault
3. **✨ Create Broadcasts** - Generates broadcasts from documents without them
4. **📤 Send Next Broadcast** - Sends 1 pending broadcast to Telegram/Twitter

#### Broadcast Pipeline
```
Documents → [Create Broadcasts] → Pending → [Send Next] → Telegram/Twitter
   1460 docs → generates messages → queue → actual posting
```

### Known Issues & Solutions

#### Issue: Session Coherence
- **Problem**: Cipher MCP not capturing Claude Code sessions
- **Current State**: Only 2 old test entries in cipher-sessions.db
- **Workaround**: Using CLAUDE.md and SESSION_MEMORY.md for persistence

#### Issue: Broadcast Quality
- **Problem**: Some broadcasts had "test" as source
- **Solution**: Only 1 test source remains, all pending have real sources
- **Quality indicator**: Real URLs = good content

### Environment Configuration

#### Required Files
- `.env` - Main environment variables (gitignored)
- `.env.broadcast` - Port configuration for services
- `characters/ai10bro.character.json` - Contains Telegram credentials

#### Port Assignments
- 3000: Eliza agent (when running)
- 3002: Broadcast API and dashboard
- 3003: Action trigger API

### Next Session TODOs

1. **Investigate Cipher MCP integration** - Why aren't sessions being captured?
2. **Process remaining 7 pending broadcasts** - All have good sources
3. **Create more broadcasts** from 1,116 documents without coverage
4. **Consider Twitter integration** - Currently only Telegram is active
5. **Monitor broadcast quality** - Ensure sources remain credible

### Quick Commands

```bash
# Start dashboard system
node broadcast-api-simple.js &
node action-api-enhanced.js &
open http://localhost:3002/broadcast-dashboard.html

# Send next broadcast
curl -X POST http://localhost:3003/trigger \
  -H "Content-Type: application/json" \
  -d '{"action":"PROCESS_QUEUE"}'

# Check broadcast stats
sqlite3 agent/data/db.sqlite \
  "SELECT status, COUNT(*) FROM broadcasts GROUP BY status;"

# Git operations with 1Password SSH
GIT_SSH_COMMAND="ssh -o IdentityAgent=~/.1password-agent.sock" \
  git push origin main
```

### Security Notes

- All exposed API keys have been rotated
- Character files are now gitignored
- Use environment variables, never hardcode secrets
- Check SECURITY_AUDIT.md for detailed cleanup steps

---

**Last Updated**: 2025-08-22 18:45 UTC
**Session Duration**: ~7 hours
**Key Achievement**: Broadcast system now fully operational with real Telegram posting!