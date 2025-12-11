# Claude Code Session Context

## Project Overview
**Project**: Eliza AI Agent - Multi-platform Broadcast System
**Framework**: ElizaOS with custom plugins
**Main Character**: AI10BRO
**Location**: `/Users/davidlockie/Documents/Projects/Eliza/`

## Session: 2025-12-11

### Major Accomplishments

#### 1. WordPress Integration Complete (Build Phase)
- **Goal**: Enable automated publishing from Eliza agent to AI10BRO WordPress site
- **Status**: ✅ Build complete, ready for testing

**What Was Built:**

1. **`publish-to-wordpress.js`** - Complete WordPress publishing script
   - Queries broadcasts with alignment >= 0.20 (not yet published)
   - Fetches source document for full context
   - Generates 800-1200 word Daily Insight articles
   - Uploads featured images to WordPress media library
   - Creates posts via WordPress REST API
   - Tracks publishing status in database
   - Includes dry-run mode for testing
   - Error handling and retry logic
   - Comprehensive logging

2. **Database Schema Updates** - Added WordPress tracking columns
   - `wordpress_published` (BOOLEAN) - Published flag
   - `wordpress_post_id` (INTEGER) - WordPress post ID
   - `wordpress_published_at` (DATETIME) - Publish timestamp
   - `wordpress_status` (TEXT) - 'draft', 'publish', or 'error'
   - `wordpress_error` (TEXT) - Error message if failed

3. **Configuration Files**
   - `.env.wordpress.example` - Configuration template
   - `WORDPRESS_INTEGRATION_SPEC.md` - Complete technical specification (17KB)
   - `WORDPRESS_PUBLISHER_README.md` - Comprehensive user guide (13KB)

4. **Bio Theme Detection** - Automatic category mapping
   - Extracts bio theme from document YAML frontmatter or content
   - Maps to WordPress term IDs (2-12)
   - Fallback to keyword matching if metadata unavailable
   - Default to 'innovation' (ID 9) if uncertain

5. **Article Generation Framework**
   - Template for 800-1200 word Daily Insights
   - 6-section structure (hook, overview, context, why it matters, related, looking ahead)
   - Informative journalism tone (TechCrunch/Axios style)
   - HTML formatting with semantic tags
   - TODO: Integrate LLM for richer generation

**Publishing Flow:**
```
Eliza Broadcasts (alignment >= 0.20, not published)
    ↓
Fetch source document
    ↓
Generate 800-1200 word Daily Insight
    ↓
Upload featured image to WordPress
    ↓
Create post via REST API (draft or publish)
    ↓
Update broadcast: wordpress_published = true
```

**Key Features:**
- ✅ Quality threshold: Only publishes alignment >= 0.20
- ✅ Idempotent: Won't publish same broadcast twice
- ✅ Non-destructive: Doesn't affect Telegram/Bluesky broadcasts
- ✅ Dry-run mode: Test with drafts before going live
- ✅ Error tracking: Failed publishes logged for debugging
- ✅ Batch processing: `--limit=N` for controlled publishing
- ✅ Specific broadcast: `BROADCAST_ID=uuid` for single publish

**Usage:**
```bash
# Test mode (creates drafts)
node publish-to-wordpress.js --dry-run --limit=1

# Publish 5 articles
node publish-to-wordpress.js --limit=5

# Automated (cron): Publish 3 articles every 2 hours
0 */2 * * * cd /path/to/eliza && node publish-to-wordpress.js --limit=3
```

**Documentation Created:**
- `WORDPRESS_INTEGRATION_SPEC.md` - Full technical specification
  - Publishing flow architecture
  - REST API endpoints and authentication
  - Article generation prompt template
  - Database schema updates
  - Bio theme mapping
  - Error handling strategies
  - Quality criteria
  - Testing strategy

- `WORDPRESS_PUBLISHER_README.md` - Complete user guide
  - Quick start guide (5 steps)
  - How it works (flow diagrams)
  - Configuration options
  - Usage examples
  - Troubleshooting section
  - Performance metrics
  - Monitoring queries
  - Next steps roadmap

#### 2. Content Strategy Alignment
- **Source**: `ELIZA_AGENT_GUIDE.md` from WordPress project
- **Content Types Defined**:
  1. Daily Insights (800-1200 words) - Automated from Eliza
  2. Deep Dives (2000-4000 words) - Manual curation
  3. Company Profiles (future)
  4. Technology Explainers (future)
  5. Market Reports (quarterly)

- **Publishing Cadence**:
  - Daily Insights: 3-5 per day (automated)
  - Deep Dives: 1-2 per week (manual)
  - Target: 90-150 articles/month

- **11 Bio Themes** (from existing alignment system):
  1. Biomimicry & Nature-Inspired Design
  2. Synthetic Biology & Bioengineering
  3. Advanced Materials
  4. Clean Energy & Carbon Capture
  5. Agriculture & Food Tech
  6. Health & Medicine
  7. AI & Computing
  8. Innovation & Markets
  9. Environmental Conservation
  10. Space & Exploration
  11. Manufacturing & Industry

**Next Steps:**

1. **Testing Phase** (User action required):
   - Generate WordPress Application Password
   - Configure `.env.wordpress` with credentials
   - Run `node publish-to-wordpress.js --dry-run --limit=1`
   - Review draft article in WordPress
   - Test publish mode with `--limit=3`

2. **Automation Phase** (Once stable):
   - Add cron job for automated publishing
   - Monitor for first week
   - Adjust alignment threshold if needed
   - Fine-tune article generation

3. **Enhancement Phase** (Future):
   - Integrate LLM (Claude/Ollama) for better article generation
   - Add internal linking automation
   - Implement entity extraction
   - Create social media auto-posting workflow

**Integration Status:**
- ✅ WordPress site ready (http://localhost:8885)
- ✅ Custom theme installed with 11 bio themes
- ✅ Sample content (10 articles with AI images)
- ✅ REST API endpoints functional
- ✅ Publishing script complete
- ⏳ Awaiting WordPress credentials setup
- ⏳ First test publish pending

**Files Created:**
- `/Users/davidlockie/Documents/Projects/Eliza/publish-to-wordpress.js`
- `/Users/davidlockie/Documents/Projects/Eliza/.env.wordpress.example`
- `/Users/davidlockie/Documents/Projects/Eliza/WORDPRESS_INTEGRATION_SPEC.md`
- `/Users/davidlockie/Documents/Projects/Eliza/WORDPRESS_PUBLISHER_README.md`

**Commits**: Ready to commit (4 new files)

---

## Session: 2025-12-09

### Major Accomplishments

#### 1. Fixed Broadcast Deduplication System
- **Problem**: Same topics being broadcast 4 times within hours
  - Example: Carverr DNA barcodes sent 4x (10:00, 09:40, 09:00, 08:41)
  - Example: Antibiotic resistance research sent 4x
  - Root cause: 2 source documents about same topic × 2 platforms each
- **Investigation**:
  - Old deduplication: 100 chars, 80% similarity threshold
  - Carverr broadcasts only 55% similar (different AI wording)
  - "Genetic element" broadcasts from 2 different documents bypassing checks
- **Solution** (commit 131599254):
  - Increased comparison length: 100 → 200 characters
  - Lowered thresholds: 70% raw OR 75% normalized similarity
  - Added entity-based detection: 2+ shared entities + 50% similarity catches duplicates
  - Added 7-day time window (reduces overhead, only checks recent broadcasts)
  - Reduced comparison set: 100 → 50 recent broadcasts per platform
- **Testing**:
  - Carverr broadcasts now caught: 3 shared entities (Carverr, By, Biology Century)
  - Would prevent ~50% of duplicate broadcasts observed in last 2 days
- **Result**: Future broadcasts will be deduplicated even when AI generates different wordings

#### 2. PubMed Integration Deployed
- **Setup**: Daily biology paper fetching via GitHub Actions
- **Repository**: ai10bro-gdelt (existing repo, not new one)
- **Files Created**:
  - `pubmed_obsidian_poc.py` - Fetches papers via PubMed E-utilities API
  - `.github/workflows/pubmed-fetch.yml` - Runs daily at 6am UTC
- **Configuration**:
  - Target folder: `Papers/` (separate from `Notes/`)
  - Search terms: biomimicry, synthetic biology, bioengineering, bio-inspired design
  - Limit: 5 papers per term = ~25 papers/day
  - Source type: `pubmed` with 1.15x quality multiplier
- **Testing**: Successfully fetched 8 papers in 17 seconds
- **Impact**: Will add 10-25 curated research papers daily starting 2025-12-10

---

## Session: 2025-12-04

### Major Accomplishments

#### 1. Just-in-Time Image Generation System
- **Problem**: Needed on-demand image generation for broadcasts at send time
- **Implementation**:
  - Added image generation check in send scripts before sending
  - Uses Gemini V2 API via `generate-broadcast-image-v2.py`
  - Updates ALL broadcasts for same documentId with generated image (reuse)
  - Generation takes ~30 seconds per image
- **Benefits**:
  - Only generates images for quality broadcasts (>= 0.15 alignment score)
  - Efficient reuse across multiple platforms
  - No wasted generations for filtered broadcasts
- **Commits**: 087eccee7 (implementation), tested successfully with 2 broadcasts

#### 2. Fixed Critical Quality Control Bug
- **Problem**: Low-quality broadcast (score 0.144) sent without image, bypassing threshold
- **Root Cause**: BROADCAST_ID query path missing `alignment_score >= 0.15` filter
- **Investigation**:
  - Traced cron job → Action API → send scripts flow
  - Found two query paths: normal vs BROADCAST_ID (for specific broadcast)
  - BROADCAST_ID path used by cron was missing quality filter
- **Fix**: Added `AND alignment_score >= 0.15` to BROADCAST_ID queries in:
  - `send-pending-to-telegram.js:41`
  - `send-pending-to-bluesky.js:53`
- **Result**: Both query paths now enforce consistent quality threshold
- **Commit**: 9e8f0e41e

#### 3. Documentation Crisis Resolved
- **Problem**: User questioned 0.15 threshold - docs showed 0.8
- **Investigation Revealed**: Two completely different scoring systems documented
  - **OLD (OBSOLETE)**: Base score 0.5, range 0.5-1.0, threshold 0.8 (in BROADCAST_QUALITY_FLOW.md)
  - **NEW (CURRENT)**: Keyword-based, range 0.08-0.30+, threshold 0.15 (in alignment-keywords-refined.json)
- **Root Cause**: Documentation never updated when scoring system changed to keyword-based
- **Fixes**:
  - Created **BROADCAST_SEND_ARCHITECTURE.md** with correct keyword-based system documentation
  - Added deprecation warning to **BROADCAST_QUALITY_FLOW.md** (obsolete)
  - Documented actual score calculation algorithm and thresholds
  - Added current broadcast distribution stats (343 will send, 937 blocked)
- **Commits**: a96f5f573 (architecture doc), 5b5d345f1 (corrections)

### Current Broadcast Quality System

**Keyword-Based Scoring** (from alignment-keywords-refined.json):
```javascript
// For each document:
1. Count keyword matches across 11 weighted themes
   - biomimicry_nature (weight: 0.50)
   - biology_biotech (weight: 0.40)
   - environmental_conservation (weight: 0.35)
   - etc.

2. Calculate theme scores:
   theme_score = (matches / total_keywords) * theme.weight

3. Sum all theme scores

4. Apply source quality multiplier:
   - Obsidian: 4.0x
   - Premium sources (Nature.com, Science.org): 1.3x
   - Trusted sources: 1.15x
   - Industry sources: 1.1x
```

**Thresholds**:
- `core_alignment_minimum: 0.08` - Min to consider for broadcast creation
- **`quality_threshold: 0.15`** - Required to send to platforms
- Typical score range: 0.08-0.30 (without Obsidian multiplier)

**Current Distribution**:
- 343 pending broadcasts >= 0.15 (WILL send)
- 937 pending broadcasts < 0.15 (BLOCKED)
- Average: 0.136, Range: 0.086-0.199

### Key Technical Insights

#### Dual Query Path Architecture
Both send scripts have two query paths - both must enforce same quality controls:
1. **Normal Path**: `WHERE status = 'pending' AND alignment_score >= 0.15 LIMIT 1`
2. **BROADCAST_ID Path**: `WHERE id = ? AND alignment_score >= 0.15` (used by Action API/cron)

**Why Both Paths Exist**:
- Normal: Manual testing and fallback
- BROADCAST_ID: Action API enforces round-robin distribution, prevents race conditions

**Lesson**: When adding quality controls, must update ALL code paths, not just the obvious ones.

### Documentation Created/Updated
1. **BROADCAST_SEND_ARCHITECTURE.md** (NEW) - Comprehensive system documentation:
   - Cron → Action API → Send Scripts flow
   - Keyword-based scoring algorithm
   - Quality control thresholds
   - Just-in-time image generation
   - Troubleshooting guide

2. **BROADCAST_QUALITY_FLOW.md** (DEPRECATED) - Added warning that it documents obsolete system

### GitHub Repository
- **Repo**: divydovy/eliza-ai10bro
- **Latest commits**:
  - 5b5d345f1 - docs: Correct alignment score documentation
  - a96f5f573 - docs: Add comprehensive broadcast system architecture documentation
  - 9e8f0e41e - fix: Add alignment score filter to BROADCAST_ID query path
  - 087eccee7 - feat: Implement just-in-time image generation at send time
- **Branch**: main
- **Status**: Clean, all changes pushed

### System Health Status

**Working Components**:
- ✅ Just-in-time image generation (~30s per image, reuses across platforms)
- ✅ Quality threshold enforcement on BOTH query paths (>= 0.15)
- ✅ Telegram hourly sends at :00
- ✅ Bluesky hourly sends at :40
- ✅ Farcaster disabled (commented in cron)
- ✅ Eliza agent running (process 9980)

**Pending Statistics**:
- ~1,280 total pending broadcasts
- 343 meet quality threshold (will send)
- 937 below threshold (blocked)
- 0 broadcasts >= 0.8 (old threshold not applicable)

### Next Session TODOs

1. ~~Fix quality control bypass~~ ✅ DONE
2. ~~Document actual scoring system~~ ✅ DONE
3. **Monitor broadcast sends** - Verify only >= 0.15 broadcasts are sent
4. **Evaluate quality threshold** - Is 0.15 too low? Should it be higher?
5. **Consider regenerating low-quality broadcasts** - 937 blocked, could delete and recreate

---

## Session: 2025-12-03

### Major Accomplishments

#### 1. Fixed Ollama Constant Running Issue
- **Problem**: Ollama consuming CPU continuously (should batch process then idle)
- **Root Cause**: `BLUESKY_AUTO_POST=true` triggering infinite post generation loop
- **Solution**: Set `BLUESKY_AUTO_POST=false` and `BLUESKY_MONITOR_MENTIONS=false` in `.env`
- **Result**: Ollama now idles between cron-triggered broadcast batches
- **Architecture Decision**: Use cron-based batch processing instead of continuous loops
- **Commit**: 7b88fee69

#### 2. Resolved Bluesky Posting Issue (20 hours debugging)
- **Problem**: "Invalid URL" errors when posting from integrated client after auth success
- **Timeline**:
  - Initial attempts with @atproto/api v0.18.3 failed
  - Downgraded to v0.13.20, still failing in auto-posting
  - Standalone script testing worked perfectly
- **Root Cause**: Long-running BskyAgent in auto-posting loop corrupts internal state
- **Solution**:
  - Disabled auto-posting in integrated client (`BLUESKY_AUTO_POST=false`)
  - Use standalone script `send-pending-to-bluesky.js` for scheduled posts
  - Keep integrated client active for mention-response capability only
- **Verification**: Successfully posted test broadcast
  - Post URI: `at://did:plc:y7cmacgqwwrfv33ut7672uhr/app.bsky.feed.post/3m6zrknz6qa2w`
  - Test log: `/tmp/bluesky-manual-test.log`
- **Key Learning**: Fresh agent instances for scheduled tasks, persistent agents for real-time interaction
- **Commits**: 24cae5e60 (downgrade to v0.13.20), 7b88fee69 (disable auto-posting)

#### 3. Platform Rationalization
- **Removed Farcaster from broadcast loop**: No active Neynar signer
  - Requires paid subscription: $20-50/month for active signer
  - No free tier available for autoposting
- **Working Platforms**:
  - ✅ Telegram: Free, unlimited, working via both integrated client and standalone script
  - ✅ Bluesky: Free, open API, working via standalone script
- **Not Configured**:
  - ❌ Twitter/X: Requires $100/month minimum for API access
- **Decision**: Focus on free platforms (Telegram + Bluesky) for autoposting
- **Commit**: 58dafe36f

#### 4. Created Comprehensive System Documentation
- **Created LEARNINGS.md**: 400+ line system analysis and lessons learned
- **Content Includes**:
  - **Core Principles**: Batch processing > continuous polling, prompt variation prevents formulaic content, quality scoring prevents bad content
  - **5 Critical Failure Patterns**:
    1. Infinite loop pattern (fixed 3 times)
    2. Bluesky @atproto/api integration (20 hours debugging)
    3. Platform cost reality (paid subscriptions required)
    4. LLM output degradation (self-references, duplication)
    5. Timestamp format inconsistency (fixed 6 times)
  - **3 Success Patterns**: Unified architecture, round-robin distribution, multi-layer quality checks
  - **System Health Indicators**: Green/yellow/red state definitions
  - **Technical Debt**: 30+ background processes, 24 broadcast files (should be 7)
  - **Quick Reference**: Working files, platform status, cron schedule, database queries

### Current System Status

#### Platform Status
| Platform | Status | Method | Cost |
|----------|--------|--------|------|
| Telegram | ✅ Active | Integrated + Standalone | Free |
| Bluesky | ✅ Active | Standalone script only | Free |
| Farcaster | ❌ Disabled | N/A | $20-50/mo |
| Twitter/X | ❌ Not configured | N/A | $100/mo |

#### Cron Schedule (Working)
```bash
# Create broadcasts: Every 4 hours
0 */4 * * * node process-unprocessed-docs.js 10

# Send broadcasts: Every hour
0 * * * * curl -X POST localhost:3003/trigger -d '{"action":"PROCESS_QUEUE"}'
```

#### Working Files (Core 7)
1. `process-unprocessed-docs.js` - Main broadcast generator
2. `send-pending-broadcasts.js` - Multi-platform wrapper
3. `send-pending-to-telegram.js` - Telegram sender
4. `send-pending-to-bluesky.js` - Bluesky sender (standalone)
5. `broadcast-dashboard.html` - Web UI
6. `broadcast-api-simple.js` - Dashboard API
7. `action-api-enhanced.js` - Trigger endpoints

#### Technical Debt to Clean
- [ ] 30+ background processes accumulated (pnpm start instances)
- [ ] 17 redundant broadcast files to delete (24 total, should be 7)
- [ ] Verify Telegram mention-response working

#### GitHub Repository
- **Repo**: divydovy/eliza-ai10bro
- **Latest commits**:
  - 58dafe36f - Remove Farcaster from broadcast loop
  - 24cae5e60 - Downgrade @atproto/api to v0.13.20
  - 7b88fee69 - Disable auto-posting, use standalone scripts
- **Branch**: main
- **Status**: Clean, all changes pushed

### Key Learnings

#### What Worked
✅ **Cron + standalone scripts** - Predictable execution, fresh agent instances
✅ **Disabling auto-posting** - Prevents infinite loops and state corruption
✅ **Free platforms only** - Sustainable for autoposting without monthly costs
✅ **Documentation consolidation** - LEARNINGS.md captures patterns across 50+ commits

#### What Didn't Work
❌ **Continuous auto-posting loops** - Causes state corruption, infinite loops
❌ **Long-running BskyAgent instances** - Internal state gets corrupted over time
❌ **Paid platform integrations** - Not sustainable without revenue
❌ **Multiple competing scripts** - Technical debt accumulates rapidly

### Architecture Decision: Dual Client Strategy
- **Scheduled Posts**: Use standalone scripts with fresh agent instances
- **Real-time Interaction**: Use integrated clients for mention-response
- **Rationale**: Separates concerns, prevents state corruption, maintains responsiveness

### Next Session TODOs

1. **Clean up 30+ background processes** - Kill old pnpm start instances
2. **Delete 17 redundant broadcast files** - Keep only core 7 working files
3. **Verify Telegram mention-response** - Test integrated client interaction
4. **Increase document coverage** - Currently 24% (344/1460), target 50%
5. **Monitor broadcast quality** - Ensure alignment scores remain >= 0.15

### Quick Commands

```bash
# View current cron jobs
crontab -l

# Kill all background processes
killall node

# Test Bluesky standalone posting
LIMIT=1 node send-pending-to-bluesky.js

# Test Telegram standalone posting
LIMIT=1 node send-pending-to-telegram.js

# Check broadcast quality distribution
sqlite3 agent/data/db.sqlite "
SELECT
  CASE
    WHEN alignment_score >= 0.9 THEN 'Excellent'
    WHEN alignment_score >= 0.8 THEN 'Good'
    WHEN alignment_score >= 0.7 THEN 'Fair'
    ELSE 'Poor'
  END as quality,
  COUNT(*) as count
FROM broadcasts
GROUP BY quality;"

# Git operations with 1Password SSH
GIT_SSH_COMMAND="ssh -o IdentityAgent=~/.1password-agent.sock" \
  git push origin main
```

---

**Last Updated**: 2025-12-03 (Session continued from previous conversation)
**Session Duration**: ~4 hours
**Key Achievement**: Resolved Ollama resource issue and Bluesky posting after 20 hours of debugging! System now stable with cron-based batch processing.

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