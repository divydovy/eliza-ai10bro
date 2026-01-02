# Content Import Architecture
**Last Updated**: 2026-01-02
**Status**: Two parallel import streams + automated cleanup

---

## Overview

AI10BRO uses two independent content import systems to gather knowledge:

1. **Obsidian Import** - Manual web clippings and RSS feeds
2. **GitHub Import** - Automated content scrapers (Arxiv, BioRxiv, HackerNews, etc.)

Both run on scheduled cron jobs and import directly into the Eliza database.

---

## System Architecture

```
┌─────────────────────────────────────────────────┐
│           CONTENT SOURCES                       │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌──────────────────┐    ┌──────────────────┐  │
│  │ Obsidian Vault   │    │ GitHub Repo      │  │
│  │ (iCloud sync)    │    │ (ai10bro-gdelt)  │  │
│  ├──────────────────┤    ├──────────────────┤  │
│  │ • Clippings      │    │ • Arxiv_Notes    │  │
│  │ • RSS feeds      │    │ • BioRxiv_Notes  │  │
│  │ • ReadItLater    │    │ • News_Notes     │  │
│  │ • Manual notes   │    │ • HackerNews     │  │
│  └────────┬─────────┘    │ • YouTube        │  │
│           │              │ • GitHub Trending│  │
│           │              └────────┬─────────┘  │
│           │                       │            │
│           │                       │            │
│  ┌────────▼───────────────────────▼─────────┐  │
│  │      SCHEDULED CRON JOBS                 │  │
│  ├──────────────────────────────────────────┤  │
│  │ plugin-obsidian  │  plugin-github        │  │
│  │ Daily @ 2:30am   │  Daily @ 2:00am       │  │
│  └────────┬───────────────────┬──────────────┘  │
│           │                   │                 │
│           └───────────┬───────┘                 │
│                       │                         │
│              ┌────────▼──────────┐              │
│              │ Eliza Database    │              │
│              │ (ALL content)     │              │
│              └────────┬──────────┘              │
│                       │                         │
│              ┌────────▼──────────┐              │
│              │ Alignment Scoring │              │
│              │ (Daily @ 3:00am)  │              │
│              └────────┬──────────┘              │
│                       │                         │
│              ┌────────▼──────────┐              │
│              │ Cleanup Unaligned │              │
│              │ (Daily @ 3:50am)  │              │
│              │ Converts <8% to   │              │
│              │ tombstone records │              │
│              └────────┬──────────┘              │
│                       │                         │
│              ┌────────▼──────────┐              │
│              │ Broadcast System  │              │
│              │ (>=12% alignment) │              │
│              └───────────────────┘              │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## Import Stream 1: Obsidian Vault

### Source
**Path**: `/Users/davidlockie/Library/Mobile Documents/iCloud~md~obsidian/Documents/AI10bro`

**Content Types**:
- Manual web clippings (via browser extension)
- RSS feed articles (synced via Obsidian plugins)
- ReadItLater queue
- Personal notes and annotations

### Configuration
**Plugin**: `@elizaos/plugin-obsidian`
**Character Setting**:
```json
"vaultPath": "/Users/davidlockie/Library/Mobile Documents/iCloud~md~obsidian/Documents/AI10bro"
```

### Sync Schedule
**Cron**: Daily at 2:30am
```bash
30 2 * * * curl -X POST http://localhost:3003/trigger \
  -H 'Content-Type: application/json' \
  -d '{"action":"IMPORT_OBSIDIAN"}' \
  >> logs/cron-obsidian-import.log 2>&1
```

**How It Works**:
1. Scans entire Obsidian vault for `.md` files
2. Calculates hash of each file's content
3. Compares hash to database records
4. Imports only new or changed files
5. Creates `documents` type memories in database

**Log File**: `logs/cron-obsidian-import.log`

---

## Import Stream 2: GitHub Repository

### Source
**Repository**: `https://github.com/divydovy/ai10bro-gdelt`
**Branch**: `master`
**Target Path**: `Notes/`

**Content Types**:
- Arxiv research papers
- BioRxiv preprints
- News articles (MIT Tech Review, Nature, etc.)
- HackerNews discussions
- YouTube video summaries
- GitHub trending repositories
- OWID data articles

### GitHub Actions Scrapers
**Location**: `~/Documents/Projects/gdelt-obsidian/.github/workflows/`

**Active Scrapers**:
1. `arxiv_scraper.yml` - Daily scientific papers
2. `extended-scrapers.yml` - Twice daily (BioRxiv, HackerNews, GitHub Trending, OWID)
3. `news-fetch.yml` - Every 6 hours (RSS from tech/science publications)
4. `youtube-fetch.yml` - Weekly video content
5. `pubmed-fetch.yml` - Medical research papers

**Disabled**:
- `gdelt-fetch.yml` - GDELT disabled due to BigQuery costs ($112/month)

### Configuration
**Plugin**: `@elizaos/plugin-github`
**Character Settings**:
```json
"GITHUB_TOKEN": "[token]",
"GITHUB_REPO_URL": "https://github.com/divydovy/ai10bro-gdelt",
"GITHUB_TARGET_PATH": "Notes"
```

### Sync Schedule
**Cron**: Daily at 2:00am (runs BEFORE Obsidian import)
```bash
0 2 * * * curl -X POST http://localhost:3003/trigger \
  -H 'Content-Type: application/json' \
  -d '{"action":"SYNC_GITHUB"}' \
  >> logs/cron-github-sync.log 2>&1
```

**How It Works**:
1. Authenticates to GitHub API using token
2. Recursively scans `Notes/` directory for `.md` files
3. Fetches file content from `master` branch
4. Calculates SHA hash of each file
5. Compares hash to database records
6. Imports only new or changed files
7. Creates `documents` type memories in database

**Log File**: `logs/cron-github-sync.log`

### Important Fix (2026-01-02)
**Problem**: GitHub provider was registered in `providers` array, causing it to run on EVERY Telegram message
**Fix**: Removed from providers array, keeping only as scheduled action
**File**: `packages/plugin-github/src/index.ts`

```typescript
providers: [
    // Removed githubProvider - GitHub sync should be scheduled, not called on every message
    // Use cron job to trigger SYNC_GITHUB action instead
]
```

---

## Manual Triggering

### Via Action API
Both import systems can be triggered manually via HTTP:

**Obsidian Import**:
```bash
curl -X POST http://localhost:3003/trigger \
  -H 'Content-Type: application/json' \
  -d '{"action":"IMPORT_OBSIDIAN"}'
```

**GitHub Import**:
```bash
curl -X POST http://localhost:3003/trigger \
  -H 'Content-Type: application/json' \
  -d '{"action":"SYNC_GITHUB"}'
```

### Via Telegram
Send message to bot:
```
IMPORT_OBSIDIAN
SYNC_GITHUB
```

---

## Monitoring

### Check Import Status
```bash
# Obsidian import logs
tail -f logs/cron-obsidian-import.log

# GitHub import logs
tail -f logs/cron-github-sync.log
```

### Database Queries
```sql
-- Count documents by type
SELECT COUNT(*) FROM memories WHERE type = 'documents';

-- Recent imports (last 24 hours)
SELECT content->>'title' as title,
       datetime(createdAt/1000, 'unixepoch') as imported
FROM memories
WHERE type = 'documents'
  AND createdAt > (strftime('%s','now') - 86400) * 1000
ORDER BY createdAt DESC;

-- Count by source
SELECT content->>'source' as source, COUNT(*) as count
FROM memories
WHERE type = 'documents'
GROUP BY source;
```

### Health Checks
```bash
# Check if cron jobs are scheduled
crontab -l | grep -E "OBSIDIAN|GITHUB"

# Check if action API is running
curl http://localhost:3003/health

# Verify last import timestamps
sqlite3 agent/data/db.sqlite \
  "SELECT MAX(datetime(createdAt/1000, 'unixepoch')) as last_import
   FROM memories WHERE type = 'documents'"
```

---

## Content Flow Timeline

```
2:00am - GitHub sync runs (automated scrapers → GitHub repo → Eliza DB)
         Imports: Arxiv, BioRxiv, News, HackerNews, YouTube, etc.

2:30am - Obsidian import runs (manual clippings → Eliza DB)
         Imports: Web clippings, RSS feeds, personal notes

3:00am - Alignment scoring runs (calculate relevance scores for ALL docs)
         Scores: 21,934 documents against mission keywords
         Obsidian minimum: 35% (ensures manual clippings always pass)

3:50am - Cleanup unaligned documents (converts <8% to tombstones)
         Removes: Content + embeddings (reclaims space)
         Keeps: Hash (prevents re-import)
         Result: Only aligned docs remain active

4:00am - Broadcast generation runs (create content from aligned docs)
         Threshold: >=12% alignment
         Platforms: Telegram, Bluesky, WordPress, Farcaster

Throughout day - Broadcasts sent on hourly/4-hour schedules
         Telegram: Hourly at :00
         Bluesky: Hourly at :40
         WordPress: Every 4 hours at :20
```

---

## Troubleshooting

### GitHub Sync Issues

**Problem**: "404: No commit found for the ref main"
**Solution**: Repository uses `master` branch, not `main`
**Fix Applied**: Changed `ref: 'main'` to `ref: 'master'` in `githubProvider.ts:126`

**Problem**: GitHub sync running on every Telegram message
**Solution**: Removed from providers array (providers run on every message)
**Fix Applied**: Keep only as scheduled action triggered by cron

**Problem**: "Skipping unchanged file" spam in logs
**Expected**: This is normal - only changed files are imported

### Obsidian Sync Issues

**Problem**: No new documents importing
**Check**: Verify Obsidian vault path is accessible and contains `.md` files

**Problem**: iCloud sync delays
**Solution**: Obsidian vault is on iCloud - sync delays may occur

---

## Performance Characteristics

### GitHub Import
- **Scan Time**: ~2-5 minutes (2000+ files)
- **Import Rate**: Only changed files
- **Typical Changes**: 10-50 files per day
- **Resource Usage**: Network I/O heavy

### Obsidian Import
- **Scan Time**: ~30 seconds (fewer files)
- **Import Rate**: Only changed files
- **Typical Changes**: 5-20 files per day
- **Resource Usage**: Disk I/O heavy (local vault)

---

## Future Enhancements

### Planned
- [ ] Add sync status to broadcast dashboard
- [ ] Implement incremental sync (track last sync timestamp)
- [ ] Add content source statistics
- [ ] Monitor GitHub Actions scraper health

### Under Consideration
- [ ] Re-enable GDELT sync with cost controls
- [ ] Add more RSS feed sources
- [ ] Implement content deduplication across sources
- [ ] Add webhook-based instant import (instead of scheduled)

---

## Related Files

**Plugin Source**:
- `packages/plugin-obsidian/src/` - Obsidian import logic
- `packages/plugin-github/src/` - GitHub import logic

**Configuration**:
- `characters/ai10bro.character.json` - Plugin settings (not version controlled)
- `crontab` - Scheduled import times

**Logs**:
- `logs/cron-obsidian-import.log` - Obsidian import history
- `logs/cron-github-sync.log` - GitHub sync history

**External Repos**:
- `~/Documents/Projects/gdelt-obsidian/` - GitHub Actions scrapers
- `https://github.com/divydovy/ai10bro-gdelt` - Content repository

---

**Document Maintainer**: AI10BRO Agent
**Review Frequency**: Update when architecture changes
