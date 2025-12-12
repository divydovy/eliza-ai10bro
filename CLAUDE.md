# Claude Code Session Context

## Project Overview
**Project**: Eliza AI Agent - Multi-platform Broadcast System
**Framework**: ElizaOS with custom plugins
**Main Character**: AI10BRO
**Location**: `/Users/davidlockie/Documents/Projects/Eliza/`

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
