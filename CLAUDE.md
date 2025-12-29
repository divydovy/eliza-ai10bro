# Claude Code Session Context

## Project Overview
**Project**: Eliza AI Agent - Multi-platform Broadcast System
**Framework**: ElizaOS with custom plugins
**Main Character**: AI10BRO
**Location**: `/Users/davidlockie/Documents/Projects/Eliza/`

## Session: 2025-12-15 Evening - Broadcast System Fixes & Content Optimization

### Critical Issues Resolved

#### 1. Broadcast Creation System - FIXED ✅
**Problem**: Broadcast creation broken for 5+ days (since Dec 10)
**Root Cause**: Path error in `action-api.js:39-42` - going up 5 levels instead of 4
**Fix**: Corrected path calculation to project root
**Verification**: Created 5 test broadcasts successfully
**File**: `packages/plugin-dashboard/src/services/action-api.js` (committed: 6becdbf59)

#### 2. Commercial Content Scoring - MAJOR BOOST ✅
**User Requirement**: "I WANT commercial. I'm actually less interested in research and more interested in what's actually possible right now."

**Changes**:
- Boosted `innovation_markets` weight: 0.02 → 0.35 (17.5x increase!)
- Added 30+ commercial keywords: announced, company, production, scale, FDA approved, commercialization, validates, milestone, etc.
- Added 15+ AI/robotics keywords: AI, prosthetic, bionic, neural interface, exoskeleton, etc.

**Result**: eXoZymes commercial announcement: 11.19% → 18.37% (64% increase!)
**File**: `alignment-keywords-refined.json` (committed: 6becdbf59)

#### 3. Broadcast Actionable Guidance ✅
**User Requirement**: "We should be saying how people can use this info (follow the research vs consider this material for your next project)"

**Implementation**: Updated broadcastPrompt to include:
- Research/early-stage: "Follow [researcher/lab/company]"
- Commercial/market-ready: "Consider [material/technology/platform] for your next project"

**File**: `characters/ai10bro.character.json` (NOT committed - contains secrets)

#### 4. LLM-Based Content Cleaning ✅
**Problem**: Web clipper pollution (navigation, ads, stock tickers making up 32-98% of content)

**Solution**: Created `llm-clean-obsidian-docs.js` using qwen2.5:32b
**Results**:
- Cleaned 35 Obsidian documents across 2 runs
- Noise reduction: 32-98% (one doc: 62,612 → 1,408 chars!)
- Remaining: 196 low-scoring Obsidian docs to clean

**Files Created**:
- `llm-clean-obsidian-docs.js` (production, 25 docs/run)
- `llm-clean-content.js` (original test, 10 docs)
- `clean-web-clippings.js` (regex-based, less effective)

#### 5. Sync Schedules Verified ✅
**Obsidian Import**: Daily at 2:30am - Working (imported 2 new docs manually)
**GitHub Sync**: Daily at 2:00am - Working (2,170 docs in database)
**Note**: Both failed Dec 3-15 when agent was down

### Outstanding Issues

#### ⚠️ Broadcasts Not Sending
**Status**: 1,425 pending broadcasts but none sent since Dec 13
- Telegram: 647 pending (cron: hourly at :00)
- Bluesky: 645 pending (cron: hourly at :40)
- WordPress: 16 pending (cron: every 4hrs at :20)
- Farcaster: 117 pending (no signer - $20-50/mo cost)

**Likely Cause**: Agent downtime (cron jobs couldn't reach API)
**Action Required**: Monitor next broadcast window to verify sends resume

#### ⚠️ GitHub Workers Stale (4-9 Months)
**Finding**: ALL GitHub scrapers dormant since Aug 2024
- arXiv, YouTube, News, HackerNews, GitHub Trending, OWID: All stale
- GDELT: Disabled May 30 (BigQuery costs)
- Impact: Manual Obsidian clipping is ONLY fresh content source

**Action Required**: Reactivate scrapers OR implement Grok-discovered channels

### Deliverables Created

#### 1. Grok Research Brief
**File**: `GITHUB_WORKERS_ANALYSIS_AND_GROK_BRIEF.md`

**Contents**:
- Entity discovery targets (companies, labs, researchers, VCs)
- 200+ keywords to discover (commercial + technical terms)
- Channel recommendations (SynBioBeta, BioCentury, bioRxiv, Twitter lists)
- Search query library (platform-specific)
- 10 specific questions for Grok
- 3-phase timeline

**Goal**: Automate 80%+ of content discovery, detect commercial milestones within 24hrs

#### 2. Session Handoff
**File**: `SESSION_HANDOFF_2025-12-15.md`
Complete technical handoff with monitoring action items

### System Status

**Database**: 7,401 documents (imported 2 new, cleaned 35)
**Broadcasts**:
- Created: 5 new test broadcasts
- Pending: 1,425 total (awaiting sends)
- Sent: 1,858 total (but none since Dec 13)

**Alignment Scores**:
- Recalculated: All 7,399 documents (twice)
- High scoring (>=30%): 166 documents
- Ready for broadcast (>=12%): 28 documents

**Model**: qwen2.5:32b (upgraded from 14b, 19GB download complete)

### Next Session Priorities

1. **IMMEDIATE**: Verify broadcasts START sending (check next hour)
2. Rescore cleaned documents (run `calculate-alignment-scores.js`)
3. Begin Grok research Phase 1
4. Decide on GitHub scrapers (reactivate vs replace)

---

## Session: 2025-12-15 Morning - BigQuery Cost Investigation

### Major Accomplishments

#### 1. BigQuery Usage Analysis - GOOD NEWS!
**User Concern**: Recent changes may have increased BigQuery costs beyond free tier
**Investigation Scope**: GitHub Actions workflows in gdelt-obsidian repository

**Key Finding**: **GDELT/BigQuery integration is already disabled!**

**Evidence**:
- File: `/Users/davidlockie/Documents/Projects/gdelt-obsidian/gdelt_obsidian_poc.py`
- Lines 1-422: Entirely commented out
- Line 425: Only active code is `print("GDELT script is currently disabled.")`
- **Current BigQuery cost: $0.00/month**

**Historical Context** (when it was active):
- **Query Pattern**: Daily at midnight UTC via `gdelt-fetch.yml` workflow
- **Scope**: 6 entities (carbon_capture, quantum_computing, sustainable_materials, ethical_ai, renewable_energy, sustainable_agriculture)
- **Per Query**: 50-200 GB processed per entity
- **Estimated Cost**: ~$112/month (600 GB/day × $6.25/TB)
- **Would exceed free tier** (1 TB/month) in ~3 days if re-enabled

**Active Workflows** (All FREE - no BigQuery):
1. `extended-scrapers.yml` - Twice daily (BioRxiv, Hacker News, Hugging Face, GitHub Trending, OWID)
2. `news-fetch.yml` - Every 6 hours (RSS feeds from MIT Tech Review, Nature, Science Daily, Wired, The Verge)
3. `youtube-fetch.yml` - Weekly (direct YouTube API, under quota)
4. `semantic-scholar-fetch.yml` - As needed (free academic API)
5. `arxiv_scraper.yml` - Daily (free arXiv API)

**Recommendation**: Keep GDELT disabled (current state). If needed later, implement weekly runs + reduced entities to stay under free tier.

### Investigation Process

1. **Located Repository**: `/Users/davidlockie/Documents/Projects/gdelt-obsidian`
2. **Examined Workflows**:
   - `gdelt-fetch.yml:45-48` - Authenticates to Google Cloud and runs GDELT script
   - All other workflows use free APIs/RSS feeds
3. **Analyzed Python Script**:
   - Lines 257-365: Complex BigQuery queries against `gdelt-bq.gdeltv2.events`
   - Lines 356-361: Cost estimation logic (bytes_processed × $6.25/TB)
   - Designed to process large date ranges with entity-focused queries
4. **Reviewed Configuration**:
   - `search_config.yml:203-226` - GDELT config entirely commented out
   - Rotation schedule, quotas, all disabled

### System Health Status

**Current State**: 🟢 GREEN - No BigQuery costs incurred

**Cost Breakdown**:
- BigQuery: **$0.00** (script disabled)
- GitHub Actions: **FREE** (within limits)
- All content gathering: **FREE** (RSS feeds, free APIs)

### Files Examined

1. `/Users/davidlockie/Documents/Projects/gdelt-obsidian/.github/workflows/gdelt-fetch.yml` - Daily workflow (runs placeholder)
2. `/Users/davidlockie/Documents/Projects/gdelt-obsidian/.github/workflows/extended-scrapers.yml` - Twice daily (no BigQuery)
3. `/Users/davidlockie/Documents/Projects/gdelt-obsidian/gdelt_obsidian_poc.py` - Commented out (425 lines)
4. `/Users/davidlockie/Documents/Projects/gdelt-obsidian/search_config.yml` - GDELT config disabled (lines 203-226)

---

## Session: 2025-12-12 - WordPress Integration Complete

### Major Accomplishments

#### 1. WordPress as First-Class Client (Complete Re-architecture)
**Problem**: Previous implementation treated WordPress as post-processor that enriched existing broadcasts
**Solution**: Re-architected to treat WordPress as first-class client in broadcast generation system

**Implementation**:
- Added `wordpress_insight` and `wordpress_deepdive` as separate clients
- Created dedicated LLM prompts for each content type (`wordpress-prompts.json`)
- Integrated into core broadcast generation (`process-unprocessed-docs.js`)
- WordPress articles generated alongside Telegram/Bluesky in single run
- Alignment thresholds: 0.20 (Insights), 0.25 (Deep Dives)
- Content lengths: 800-1200 words (Insights), 2000-4000 words (Deep Dives)

#### 2. WordPress Backfill System
**Challenge**: Existing high-quality documents already had broadcasts for other platforms
**Insight**: User suggested one-off backfill approach instead of changing core generation logic

**Implementation**:
- Created `backfill-wordpress-broadcasts.js` script
- Finds documents with alignment >= 0.20 that have broadcasts but missing WordPress
- Generates WordPress broadcasts for those documents
- Reuses existing images across platforms
- Fixed LLM JSON parsing (strips preambles like "Here is the article...")

**Results**:
- Successfully generated 20 WordPress Daily Insights
- Alignment scores: 119%-352% (exceptionally high quality)
- All stored as pending broadcasts ready for publishing

#### 3. Simplified WordPress Publisher
**File**: `send-pending-to-wordpress.js`

**What It Does**:
- Queries pending WordPress broadcasts (wordpress_insight or wordpress_deepdive)
- Parses pre-generated article from JSON
- Extracts bio theme from source document
- Extracts source URL
- Uploads featured image (if available)
- Creates WordPress post via REST API
- Marks broadcast as sent

**What It DOESN'T Do**:
- ❌ Generate articles (already done at broadcast creation)
- ❌ Calculate alignment scores (already done)
- ❌ Use templates (LLM generates full content)

#### 4. Testing and Validation
**Test 1**: Manual broadcast creation and publishing
- Created bio-concrete test broadcast (alignment: 0.707)
- Successfully published: http://localhost:8885/insights/bio-concrete-achieves-breakthrough-52-5-mpa-strength-while-sequestering-co2/

**Test 2**: Backfill-generated broadcast publishing
- Published "Bioengineering Breakthrough: Sustainable Alternative to Single-Use Plastics"
- URL: http://localhost:8885/insights/bioengineering-breakthrough-sustainable-alternative-to-single-use-plastics/
- Bio theme auto-detected: synbio
- Validated full end-to-end workflow

#### 5. Local Model Research
**Task**: Investigate better alternatives to qwen2.5:14b
**Result**: Created `LOCAL_MODEL_RECOMMENDATIONS_2025.md`

**Key Recommendations**:
1. **Qwen2.5 32B** (RECOMMENDED) - Best balance
   - Size: ~20 GB (2x current)
   - Context: 128K tokens (4x increase!)
   - Performance: GPT-4o equivalent
   - Pull: `ollama pull qwen2.5:32b`
   - Cost-benefit: 15 min effort, +50% quality, +11GB storage

2. **Llama 3.3 70B** - Highest quality (for Deep Dives)
   - Size: ~40-50 GB
   - Performance: Matches GPT-4
   - Use case: WordPress Deep Dives only

3. **DeepSeek V3** - State-of-the-art but experimental
   - Wait for stable Ollama integration

#### 6. Legacy Cleanup
**Deprecated Files**:
- `publish-to-wordpress.js` → `publish-to-wordpress-LEGACY.js`
- `publish-to-wordpress-test.js` → `publish-to-wordpress-test-LEGACY.js`
- Created `LEGACY_WORDPRESS_SCRIPTS_README.md` with deprecation notice

**Reason**: Avoid confusion and duplicate publishes from old post-processor approach

### Current System Status

#### WordPress Integration
**Status**: ✅ FULLY OPERATIONAL

**Database**:
- 19 pending WordPress Insights ready to publish
- 2 sent (bio-concrete + bioengineering tests)
- Pipeline fully stocked

**Cron Schedule**:
```bash
# Send WordPress Daily Insights (every 4 hours at :20)
20 */4 * * * cd /Users/davidlockie/Documents/Projects/Eliza && CLIENT=wordpress_insight node send-pending-to-wordpress.js >> logs/cron-wordpress-insights.log 2>&1
```
- Runs: 12:20am, 4:20am, 8:20am, 12:20pm, 4:20pm, 8:20pm
- Frequency: 6 articles per day
- Status: Active and running

#### Platform Status
| Platform | Status | Schedule | Method |
|----------|--------|----------|--------|
| Telegram | ✅ Active | Hourly at :00 | Integrated + Standalone |
| Bluesky | ✅ Active | Hourly at :40 | Standalone script |
| WordPress Insights | ✅ Active | Every 4 hours at :20 | Standalone script |
| WordPress Deep Dives | ⏸️  Manual | As needed | Manual review required |
| Farcaster | ❌ Disabled | N/A | No active signer ($20-50/mo) |

#### Broadcast Generation
**Frequency**: Every 4 hours at 0,4,8,12,16,20
**Command**: `node process-unprocessed-docs.js 10`
**Platforms Generated**: telegram, farcaster, bluesky, wordpress_insight, wordpress_deepdive
**Thresholds**:
- Telegram/Bluesky/Farcaster: >= 0.08
- WordPress Insights: >= 0.20
- WordPress Deep Dives: >= 0.25

### Architecture Benefits

#### 1. Unified Content Generation
- Single document processing run creates all broadcasts
- LLM generates platform-specific content with dedicated prompts
- WordPress gets full long-form generation, not enriched short-form

#### 2. Efficient Coordination
- Images generated once, reused across all platforms
- Alignment scoring coordinates all platforms
- Duplicate detection per-platform prevents redundancy

#### 3. Proper Separation
- Different clients for different content types (insight vs deepdive)
- Different schedules for different publishing cadences
- Different thresholds for different quality levels

#### 4. Backfill Pattern for New Platforms
- One-off backfill when adding new platforms
- Doesn't modify core generation logic
- Clean separation: `process-unprocessed-docs.js` for new, backfill for existing

### Files Modified/Created This Session

#### Created
1. `wordpress-prompts.json` - Prompt templates for Daily Insights and Deep Dives
2. `send-pending-to-wordpress.js` - Simplified WordPress publisher
3. `backfill-wordpress-broadcasts.js` - One-off backfill for existing documents
4. `fix-wordpress-json.js` - Utility to fix JSON encoding issues
5. `test-wordpress-generation.js` - Test script for broadcast creation
6. `WORDPRESS_CLIENT_ARCHITECTURE.md` - Complete technical specification
7. `WORDPRESS_REARCHITECTURE_SUMMARY.md` - Executive summary
8. `WORDPRESS_IMPLEMENTATION_COMPLETE.md` - Implementation checklist
9. `LOCAL_MODEL_RECOMMENDATIONS_2025.md` - Model upgrade research
10. `LEGACY_WORDPRESS_SCRIPTS_README.md` - Deprecation notice
11. `IMPLEMENTATION_COMPLETE.md` - Session summary (this will be removed in commit)

#### Modified
1. `process-unprocessed-docs.js` - Added WordPress clients to broadcast generation
2. `characters/ai10bro.character.json` - Added WordPress to clients array
3. `CLAUDE.md` - Updated with session documentation (this file)
4. Crontab - Added WordPress Insights publishing schedule

#### Deprecated
1. `publish-to-wordpress-LEGACY.js` - Old post-processor implementation
2. `publish-to-wordpress-test-LEGACY.js` - Old test script

### Technical Insights

#### WordPress Broadcast Structure
```json
{
  "title": "Article Title Here",
  "excerpt": "Brief 150-160 char summary...",
  "content": "<p>HTML content with H2/H3 tags...</p>",
  "type": "daily_insight",
  "publish_status": "publish"
}
```

#### LLM JSON Parsing Challenges
**Issue**: LLM often returns JSON with preambles or markdown code blocks
**Solution**: Strip common patterns before parsing:
```javascript
wpArticleRaw = wpArticleRaw.replace(/^Here is the article in the requested JSON format:\s*/i, '');
wpArticleRaw = wpArticleRaw.replace(/^```json\s*/, '').replace(/\s*```$/, '');
```

#### Backfill Query Pattern
```sql
SELECT DISTINCT m.id, m.content, m.alignment_score
FROM memories m
WHERE m.type = 'documents'
AND m.alignment_score >= 0.20
AND EXISTS (
    SELECT 1 FROM broadcasts b
    WHERE b.documentId = m.id
    AND b.client IN ('telegram', 'bluesky', 'farcaster')
)
AND NOT EXISTS (
    SELECT 1 FROM broadcasts b
    WHERE b.documentId = m.id
    AND b.client = 'wordpress_insight'
)
ORDER BY m.alignment_score DESC
```

### Next Session TODOs

1. ✅ WordPress integration complete
2. ⏭️ Monitor first 24 hours of automated publishing
3. ⏭️ Review article quality and adjust prompts if needed
4. ⏭️ Consider model upgrade (Qwen2.5 32B)
5. ⏭️ Generate WordPress Deep Dives manually for review
6. ⏭️ Build analytics to track WordPress performance

### Quick Commands

```bash
# Check WordPress broadcast status
sqlite3 agent/data/db.sqlite "SELECT status, COUNT(*) FROM broadcasts WHERE client = 'wordpress_insight' GROUP BY status"

# Manually publish next WordPress Insight
CLIENT=wordpress_insight node send-pending-to-wordpress.js

# Manually publish specific broadcast
BROADCAST_ID=uuid-here node send-pending-to-wordpress.js

# Generate broadcasts (includes WordPress)
node process-unprocessed-docs.js 10

# Backfill WordPress for existing documents
node backfill-wordpress-broadcasts.js

# Check cron logs
tail -f logs/cron-wordpress-insights.log

# View WordPress site
open http://localhost:8885/insights/

# Git operations with 1Password SSH
GIT_SSH_COMMAND="ssh -o IdentityAgent=~/.1password-agent.sock" git push origin main
```

### GitHub Repository
- **Repo**: divydovy/eliza-ai10bro
- **Branch**: main
- **Status**: Ready for EOW commit

---

**Last Updated**: 2025-12-12 13:30 UTC
**Session Duration**: ~2 hours
**Key Achievement**: WordPress now fully integrated as first-class client with automated publishing!

## Previous Sessions

### Session: 2025-12-04
See git history for broadcast quality improvements and image generation work.

### Session: 2025-12-03
See git history for Ollama optimization and Bluesky posting fixes.

### Session: 2025-09-23
See git history for broadcast automation and multi-platform setup.
