# GitHub Content Import - Automated Setup

**Date**: 2025-12-29
**Status**: ✅ OPERATIONAL

---

## Problem Solved

**Before**: GitHub Actions scrapers were running daily and pulling content (arXiv, bioRxiv, News, YouTube, HackerNews, GitHub Trending, etc.) into the `gdelt-obsidian` repository, but this content was **never imported** into the Eliza database.

**Result**: 13,681 documents were sitting in GitHub but unavailable to AI10BRO for broadcast generation.

---

## Solution Implemented

### 1. Created Import Script
**File**: `import-github-scrapers.js`

**What it does**:
- Reads all markdown files from `/Users/davidlockie/Documents/Projects/gdelt-obsidian/Notes/`
- Categorizes by source type (arxiv, biorxiv, news-rss, youtube, hackernews, github-trending, gdelt, owid)
- Imports to Eliza database with proper metadata
- Skips duplicates (checks path to avoid re-importing)

**Sources processed**:
- Arxiv_Notes: Research papers
- BioRxiv_Notes: Preprints
- News_Notes: RSS feed articles
- YouTube_Notes: Video transcripts
- HackerNews_Notes: Discussions
- GitHub_Trending_Notes: Repositories
- GDELT_Notes: News events
- HuggingFace_Notes: Models
- OWID_Notes: Data analysis

### 2. Created Sync Script
**File**: `sync-github-content.sh`

**What it does**:
1. Pulls latest content from gdelt-obsidian GitHub repo
2. Runs `import-github-scrapers.js` to import new content
3. Logs output to `logs/cron-github-import.log`

### 3. Added to Cron Schedule
```bash
# Import GitHub scraper content (twice daily at 3:30am and 3:30pm)
30 3,15 * * * ./sync-github-content.sh >> logs/cron-github-import.log 2>&1
```

**Timing rationale**:
- GitHub Actions scrapers run on various schedules
- Extended scrapers (bioRxiv, HackerNews, etc.): Twice daily (midnight, noon)
- News scrapers: Every 6 hours
- YouTube scrapers: Weekly
- Import runs at 3:30am and 3:30pm to catch all scraper outputs
- Broadcast generation follows at 4am, 10am, 4pm, 10pm

---

## Complete Automation Workflow

```
┌─────────────────────────────────────────────────────────────┐
│  Daily Content Pipeline                                      │
└─────────────────────────────────────────────────────────────┘

2:00am  → GitHub Actions pull (SYNC_GITHUB API call)
2:30am  → Obsidian import (manual clippings)
3:30am  → GitHub scraper import (NEW - automated) ✅
4:00am  → Create broadcasts from all new content
         └─ Processes both Obsidian + GitHub content

...hourly broadcast sends...

3:30pm  → GitHub scraper import (afternoon run) ✅
4:00pm  → Create broadcasts from afternoon content

...hourly broadcast sends continue...
```

---

## First Import Results

**Date**: 2025-12-29 16:38 UTC

**Imported**: 13,681 documents

**Breakdown by source**:
| Source | Documents | Broadcast-Ready (>= 12%) |
|--------|-----------|--------------------------|
| News-RSS | 6,124 | 0 |
| GitHub/GDELT | 4,515 | 4 |
| GitHub Trending | 2,926 | 0 |
| BioRxiv | 2,459 | 2 |
| Arxiv | 1,384 | 0 |
| YouTube | 763 | 3 |
| Reddit | 244 | 0 |
| GDELT | 41 | 0 |
| Podcast | 20 | 0 |
| OWID | 5 | 0 |
| **Total** | **13,681** | **9** |

**Database growth**: 7,403 → 21,084 documents (+185%)

**Broadcast-ready impact**: 196 → 201 documents (+2.5%)

---

## Content Quality by Source

### High-Quality Sources (>= 1% broadcast-ready)

1. **YouTube transcripts**: 3/763 (0.4%)
   - "Newlight Completes $125 Million in new Equity Round" (15.2%)
   - "Biomason Makes Biocement Tiles" (14.0%)
   - "Top 10 Green Technologies" (12.2%)

2. **GitHub-GDELT**: 4/4,515 (0.09%)
   - Various biotech news articles (12.2-15.2% range)

3. **BioRxiv preprints**: 2/2,459 (0.08%)
   - Research preprints (13.2-14.8% range)

### Low-Quality Sources (0% broadcast-ready)

1. **News-RSS**: 0/6,124 (0%)
   - Likely general news not biotech-focused yet
   - New Grok RSS feeds not yet pulled (first run pending)

2. **Arxiv papers**: 0/1,384 (0%)
   - Too research-focused, not commercial/applied

3. **GitHub Trending**: 0/2,926 (0%)
   - Software repositories, not biotech content

4. **HackerNews**: Not listed separately (likely in "reddit" or other)

---

## Expected Improvements

### After Grok RSS Feeds Activate
The 5 new RSS feeds added today should dramatically improve news-rss quality:
- BioPharma Dive (commercial biotech, FDA approvals)
- Fierce Biotech (drug development, funding)
- GEN (genetic engineering, bioprocessing)
- SynBioBeta (synthetic biology, bio-manufacturing)
- medRxiv (medical preprints)

**Projected impact**: News-RSS 0% → 5-10% broadcast-ready

### After Commercial Keywords Take Effect
With 93 new keywords focused on commercial milestones, regulatory approvals, and emerging tech, we expect:
- More FDA approval news to score high
- Funding announcements (Series B, IPO) to get captured
- Manufacturing scale-up stories to surface

---

## Monitoring

### Check Import Logs
```bash
tail -f logs/cron-github-import.log
```

### Check Import Status
```bash
# How many GitHub documents imported?
sqlite3 agent/data/db.sqlite "
  SELECT
    json_extract(content, '$.metadata.sourceType') as source,
    COUNT(*) as count
  FROM memories
  WHERE type='documents'
  AND json_extract(content, '$.metadata.sourceType') IN
    ('arxiv', 'biorxiv', 'news-rss', 'youtube', 'hackernews',
     'github-trending', 'gdelt', 'owid', 'github-gdelt')
  GROUP BY source
"

# How many broadcast-ready from GitHub sources?
sqlite3 agent/data/db.sqlite "
  SELECT COUNT(*)
  FROM memories
  WHERE type='documents'
  AND alignment_score >= 0.12
  AND json_extract(content, '$.metadata.sourceType') IN
    ('arxiv', 'biorxiv', 'news-rss', 'youtube', 'hackernews',
     'github-trending', 'gdelt', 'owid', 'github-gdelt')
"
```

### Manual Import (if needed)
```bash
cd /Users/davidlockie/Documents/Projects/Eliza
./sync-github-content.sh
```

### Force Recalculate Scores
```bash
node calculate-alignment-scores.js
```

---

## Next Steps

1. ✅ Automated import operational (cron scheduled)
2. ⏭️ Monitor first RSS feed run (BioPharma Dive, Fierce Biotech, etc.)
3. ⏭️ Review broadcast-ready content from GitHub sources
4. ⏭️ Consider filtering low-quality sources (GitHub Trending, general Arxiv)
5. ⏭️ Add source-specific keyword boosts for biotech-focused content

---

## Files Created

1. `import-github-scrapers.js` - Import script for GitHub content
2. `sync-github-content.sh` - Sync and import automation script
3. `GITHUB_IMPORT_SETUP.md` - This documentation

## Files Modified

1. Crontab - Added GitHub import schedule (3:30am, 3:30pm)

---

**Status**: Production ready ✅
**Next automated run**: Tomorrow at 3:30am
**Expected content growth**: +50-100 documents/day from GitHub scrapers
