# WordPress Client Re-Architecture - Ready for Implementation

## Executive Summary

I've completed a comprehensive analysis of the current broadcast system and created a detailed plan to re-architect WordPress integration as a first-class client, as you requested.

**Current Status**: Architecture analysis complete, awaiting your approval to proceed with implementation.

---

## What I Discovered

### The Problem with Current Implementation

**What I Built (Initial Approach)**:
- Post-processor script that takes existing 400-600 char broadcasts
- Attempts to enrich them to 800-1200 words using simple templates
- Runs separately from main broadcast generation
- No LLM integration, no alignment scoring coordination

**What You Actually Want**:
- WordPress as a CLIENT in the broadcast generation system
- Generate WordPress broadcasts alongside Telegram/Bluesky at document processing time
- Use dedicated LLM prompts for different WordPress content types
- Leverage existing alignment scoring, image generation, round-robin distribution

**Why This Matters**:
Your vision is architecturally superior:
- ✅ Ensures consistent LLM quality across all platforms
- ✅ Coordinates alignment scoring and filtering
- ✅ Reuses images efficiently across platforms
- ✅ Maintains round-robin distribution fairness
- ✅ Enables multiple WordPress content types with different prompts

---

## Current Multi-Platform Architecture (Working Well)

I examined how Telegram, Bluesky, and Farcaster work:

```
Documents (1,460 total)
    ↓
process-unprocessed-docs.js:
    - Calculate alignment score (keyword-based, 0.08-0.30 range)
    - Generate LLM content via OpenRouter/Ollama
    - Create broadcasts for EACH platform:
        • telegram (4096 chars)
        • farcaster (320 chars)
        • bluesky (300 chars)
    - Store with status='pending'
    ↓
Hourly Cron Jobs:
    - send-pending-to-telegram.js   (runs :00)
    - send-pending-to-bluesky.js    (runs :40)
    - send-pending-to-farcaster.js  (disabled)
    - Each queries: WHERE client='X' AND status='pending' AND alignment_score >= 0.12
    - Just-in-time image generation if needed
    - Update: SET status='sent', sent_at=NOW()
```

**Key Principles**:
1. One document → multiple platform-specific broadcasts
2. All broadcasts created in single processing run
3. Content adjusted for each platform's limits/format
4. Separate send scripts for each platform
5. Round-robin distribution via Action API

---

## Proposed WordPress Integration (5 Phases)

### Phase 1: Add WordPress to Platforms List
```javascript
// In process-unprocessed-docs.js:504
const platforms = ['telegram', 'farcaster', 'bluesky', 'wordpress'];
const platformLimits = {
    telegram: 4096,
    farcaster: 320,
    bluesky: 300,
    wordpress: 20000  // Large limit for full articles
};
```

### Phase 2: Create WordPress Prompt Templates
New file: `wordpress-prompts.json`

**Daily Insight Prompt** (800-1200 words):
- Hook (1-2 sentences)
- Overview (150-200 words)
- Context (150-200 words)
- Details (300-400 words)
- Applications (200-300 words)
- Outlook (100-150 words)

**Deep Dive Prompt** (2000-4000 words):
- For Phase 2 or manual curation

### Phase 3: Modify Broadcast Generation
When processing documents:
1. Check if WordPress-eligible (alignment >= 0.20, length >= 500)
2. Generate SHORT broadcast for Telegram/Bluesky/Farcaster
3. Generate FULL article for WordPress using dedicated prompt
4. Store both in broadcasts table with appropriate client

### Phase 4: Create Simplified Send Script
New file: `send-pending-to-wordpress.js`

**What It Does**:
- Queries: `WHERE client='wordpress' AND status='pending'`
- Parses pre-generated article from broadcast.content
- Uploads featured image to WordPress
- Detects bio theme from source document
- Creates post via REST API
- Updates: `SET status='sent', sent_at=NOW()`

**What It DOESN'T Do**:
- ❌ Article generation (already done!)
- ❌ Alignment scoring (already done!)
- ❌ Template filling (LLM did this!)

### Phase 5: Update Configuration
```json
// characters/ai10bro.character.json
"clients": ["direct", "telegram", "bluesky", "wordpress"]
```

---

## Quality Thresholds Proposal

| Platform | Creation Threshold | Send Threshold |
|----------|-------------------|----------------|
| Telegram/Bluesky/Farcaster | >= 0.08 | >= 0.12 |
| WordPress Daily Insights | >= 0.20 | >= 0.12 |
| WordPress Deep Dives | >= 0.25 | Manual review |

**Rationale**:
- WordPress needs higher quality (longer form, represents brand)
- ~343 broadcasts currently meet 0.20 threshold (good pipeline)
- Deep Dives get manual review before publishing

---

## Documentation Created

1. **`WORDPRESS_CLIENT_ARCHITECTURE.md`** (5,800 words)
   - Complete technical specification
   - Phase-by-phase implementation guide
   - Detailed code examples for each change
   - WordPress prompt template
   - Migration path and testing strategy
   - Success metrics

2. **`CLAUDE.md`** (updated)
   - Session 2025-12-11 Part 2 entry
   - Architecture analysis documented
   - Files examined listed
   - Current status captured

3. **`WORDPRESS_REARCHITECTURE_SUMMARY.md`** (this file)
   - Executive summary for decision making
   - Questions requiring your input

---

## Questions for You (Need Answers to Proceed)

### 1. Publishing Mode
**Question**: Should WordPress posts be published immediately or as drafts?

**Options**:
- A) `status: 'publish'` - Articles go live immediately
- B) `status: 'draft'` - Articles require manual review before publishing

**Recommendation**: Start with drafts for first 10-20 articles to validate quality, then switch to auto-publish.

### 2. Alignment Threshold
**Question**: Confirm 0.20 for WordPress Daily Insights?

**Context**:
- Current broadcast distribution: 343 meet >= 0.20, 937 below
- This would generate 5-10 WordPress articles per day
- Higher threshold (0.25) would be 2-3 per day
- Lower threshold (0.15) would be 10-15 per day

**Recommendation**: 0.20 is good starting point.

### 3. Content Types in Phase 1
**Question**: Implement Deep Dives immediately or defer to Phase 2?

**Options**:
- A) Daily Insights only (simpler, faster to launch)
- B) Both Daily Insights + Deep Dives (more complete)

**Recommendation**: Daily Insights only for Phase 1. Deep Dives can be Phase 2 after validating system.

### 4. Publishing Schedule
**Question**: How often should WordPress check for pending broadcasts?

**Options**:
- A) Hourly (like other platforms) - Could be 5-10 articles/day
- B) Every 4 hours - 2-3 articles/day
- C) Daily at specific time - 1 article/day

**Recommendation**: Every 4 hours to start. Can increase once stable.

### 5. Legacy Script
**Question**: Keep `publish-to-wordpress.js` for manual use?

**Context**:
- Current script can manually enrich any broadcast
- Could be useful for special cases or backfilling
- Adds maintenance burden

**Recommendation**: Rename to `publish-to-wordpress-legacy.js`, add deprecation notice, but keep for manual overrides.

---

## Implementation Timeline

**If you approve**:
- Phase 1-2: 2 hours (prompts + config changes)
- Phase 3-4: 3 hours (broadcast generation + send script)
- Phase 5: 30 minutes (character config + testing)
- Testing: 2 hours (end-to-end validation with 10 documents)

**Total**: 6-8 hours to fully working system

**First milestone**: Generate and publish 1 WordPress article successfully
**Success criteria**: Article quality matches current test posts, automated end-to-end

---

## What Happens After Implementation

### Immediate Results
- Documents with alignment >= 0.20 will generate WordPress broadcasts
- Hourly/4-hourly cron will publish them to ai10bro.com
- Each document generates:
  - 1 Telegram broadcast (400-600 chars)
  - 1 Bluesky broadcast (300 chars)
  - 1 WordPress article (800-1200 words)
- All use LLM generation
- All share same featured image
- All tracked in same database

### Expected Output
- 5-10 WordPress articles per day (at 0.20 threshold)
- All professionally written with LLM
- All with featured images
- All properly categorized by bio theme
- All with source URLs

### Monitoring
```bash
# Check WordPress broadcast pipeline
sqlite3 agent/data/db.sqlite "
SELECT client, status, COUNT(*)
FROM broadcasts
WHERE client = 'wordpress'
GROUP BY status
"

# Check recent WordPress publishes
sqlite3 agent/data/db.sqlite "
SELECT id, alignment_score, datetime(createdAt/1000, 'unixepoch')
FROM broadcasts
WHERE client = 'wordpress' AND status = 'sent'
ORDER BY createdAt DESC
LIMIT 10
"
```

---

## Next Steps

**What I Need From You**:
1. Answers to the 5 questions above
2. Approval to proceed with implementation
3. Confirm you want to start with Daily Insights only

**What I'll Do Next**:
1. Create `wordpress-prompts.json` with your approved prompt
2. Modify `process-unprocessed-docs.js` to add WordPress client
3. Create simplified `send-pending-to-wordpress.js`
4. Test end-to-end with 10 documents
5. Set up cron job
6. Monitor first 24 hours of publishing

**Time to Decision**: This is a significant architectural change. Take time to review `WORDPRESS_CLIENT_ARCHITECTURE.md` for full technical details.

---

## Files for Your Review

1. **`WORDPRESS_CLIENT_ARCHITECTURE.md`** - Complete technical spec (MUST READ)
2. **`CLAUDE.md`** - Session documentation (updated)
3. **`WORDPRESS_REARCHITECTURE_SUMMARY.md`** - This summary

**Current WordPress Integration** (for comparison):
- `publish-to-wordpress.js` - Current post-processor (462 lines)
- `WORDPRESS_PUBLISHER_README.md` - User guide for current version
- `.env.wordpress` - Configuration (working credentials)

---

**Status**: ✅ Architecture analysis complete, awaiting your approval and answers to proceed with implementation.

**Last Updated**: 2025-12-11
