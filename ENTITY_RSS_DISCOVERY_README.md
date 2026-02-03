# Entity RSS Discovery System

**Automated content source discovery from tracked biotech entities**

## Overview

When you track a biotech company, research lab, or VC firm in the `tracked_entities` database, this system automatically discovers their RSS feeds and adds them to the news scraper pipeline.

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Track Entity (ai10bro-platform)                             │
│    └─ Add company/lab/VC with website URL                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. Discover RSS Feeds (discover-entity-rss-feeds.js)           │
│    ├─ Crawl entity homepage for RSS links                      │
│    ├─ Test common RSS URL patterns                             │
│    ├─ Validate: XML format, recent posts (6 months)            │
│    ├─ Score biotech relevance (keywords in content)            │
│    └─ Store best feed → tracked_entities.rss_feed              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. Sync to News Scraper (sync-entity-feeds-to-config.js)       │
│    ├─ Read entities with RSS feeds from database               │
│    ├─ Convert to news source format                            │
│    ├─ Add to gdelt-obsidian/search_config.yml                  │
│    └─ Group by type (company/lab/vc)                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. News Scraper (GitHub Actions)                               │
│    └─ Runs every 6 hours, imports entity content                │
└─────────────────────────────────────────────────────────────────┘
```

## RSS Discovery Features

### Smart Discovery
- **Homepage Parsing**: Finds `<link rel="alternate">` RSS tags in HTML
- **Common Patterns**: Tests `/feed`, `/rss`, `/blog/feed`, `/news/rss`, etc.
- **Multiple Protocols**: Supports RSS 2.0, Atom, and RSS 1.0

### Validation & Scoring
- **Format Validation**: Ensures valid XML and parseable feed structure
- **Recency Check**: Only accepts feeds with posts in last 6 months
- **Relevance Scoring**: Scores biotech relevance by keyword matches in content
- **Best Feed Selection**: Picks highest relevance score, then most recent posts

### Biotech Relevance Keywords
Scored keywords include:
- Synthetic biology, CRISPR, gene editing
- Fermentation, biomanufacturing, protein engineering
- Cultivated meat, precision fermentation, cellular agriculture
- FDA approval, clinical trial, therapeutic
- (50+ keywords total)

## Usage

### Step 1: Discover RSS Feeds

**Dry Run** (test without database updates):
```bash
node discover-entity-rss-feeds.js --dry-run
```

**Live Run** (updates database):
```bash
node discover-entity-rss-feeds.js
```

**Filter by Entity Type**:
```bash
# Companies only
node discover-entity-rss-feeds.js --entity-type=company

# Labs only
node discover-entity-rss-feeds.js --entity-type=lab

# VCs only
node discover-entity-rss-feeds.js --entity-type=vc
```

**Example Output**:
```
📡 Ginkgo Bioworks (company)
   🔍 Checking homepage: https://ginkgobioworks.com
   ✅ Found RSS link tag: https://ginkgobioworks.com/blog/feed/
   🔎 Testing 8 potential feeds...
   🧪 Testing: https://ginkgobioworks.com/blog/feed/
   ✅ VALID: 23 items, 8 recent, relevance: 15
   🎯 BEST FEED: https://ginkgobioworks.com/blog/feed/ (relevance: 15)
   💾 Saved to database

📊 DISCOVERY SUMMARY
Total entities processed: 67
✅ RSS feeds discovered: 42
❌ Failed to find feeds: 18
⏭️  Skipped (already have feed): 7
```

### Step 2: Sync to News Scraper

**Dry Run** (preview changes):
```bash
node sync-entity-feeds-to-config.js --dry-run
```

**Live Run** (updates search_config.yml):
```bash
node sync-entity-feeds-to-config.js
```

**Example Output**:
```
🔄 Syncing entity RSS feeds to search_config.yml

Found 42 entities with RSS feeds

Entities by type:
  Companies: 28
  Labs: 10
  VCs: 4

✅ Adding Ginkgo Bioworks (company): https://ginkgobioworks.com/blog/feed/
✅ Adding Twist Bioscience (company): https://twistbioscience.com/blog/feed/
✅ Adding Broad Institute (lab): https://broadinstitute.org/news/rss.xml
...

📊 Summary:
  New feeds added: 42
  Skipped (already exist): 0
  Total feeds in config: 69

✅ Updated /Users/davidlockie/Documents/Projects/gdelt-obsidian/search_config.yml
```

### Step 3: Commit and Deploy

```bash
cd /Users/davidlockie/Documents/Projects/gdelt-obsidian
git diff search_config.yml  # Review changes
git add search_config.yml
git commit -m "Add RSS feeds from 42 tracked entities"
git push origin master
```

News scraper will pick up new feeds on next run (every 6 hours).

## Database Schema

**tracked_entities.rss_feed** column stores discovered feed URL:
```sql
CREATE TABLE tracked_entities (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,  -- company, lab, vc
    website TEXT,
    rss_feed TEXT,       -- AUTO-DISCOVERED
    focus_area TEXT,
    confidence TEXT,     -- high, medium, low
    -- ... other fields
);
```

## Maintenance

### Re-run Discovery
If an entity's website changes or adds a blog:
```bash
# Clear existing feed and re-discover
sqlite3 agent/data/db.sqlite "UPDATE tracked_entities SET rss_feed = NULL WHERE name = 'Ginkgo Bioworks'"
node discover-entity-rss-feeds.js --entity-type=company
```

### Manual Feed Addition
If discovery fails but you know the RSS URL:
```bash
sqlite3 agent/data/db.sqlite "UPDATE tracked_entities SET rss_feed = 'https://example.com/feed' WHERE name = 'Company Name'"
node sync-entity-feeds-to-config.js
```

### Remove Dead Feeds
If a feed goes offline:
```bash
sqlite3 agent/data/db.sqlite "UPDATE tracked_entities SET rss_feed = NULL WHERE name = 'Company Name'"
node sync-entity-feeds-to-config.js  # Will regenerate config without that feed
```

## Performance

- **Discovery**: ~2-3 seconds per entity (rate limited)
- **67 entities**: ~3-4 minutes total
- **Success Rate**: Typically 50-70% (many companies don't have RSS)
- **False Positives**: Rare (~2%) - non-biotech content filtered by relevance score

## Scheduling

### Option 1: Manual (Current)
Run discovery after adding new entities to database:
```bash
node discover-entity-rss-feeds.js
node sync-entity-feeds-to-config.js
cd /Users/davidlockie/Documents/Projects/gdelt-obsidian && git commit -am "Add entity feeds" && git push
```

### Option 2: Automated (Future)
Add to cron (weekly):
```bash
# Every Sunday at 3am - discover and sync entity RSS feeds
0 3 * * 0 cd /Users/davidlockie/Documents/Projects/Eliza && node discover-entity-rss-feeds.js && node sync-entity-feeds-to-config.js && cd /Users/davidlockie/Documents/Projects/gdelt-obsidian && git commit -am "Update entity RSS feeds" && git push
```

## Benefits

1. **Automatic Discovery**: No manual RSS hunting for each entity
2. **Scalable**: Add 100 entities → automatically get ~50-70 RSS feeds
3. **Quality Control**: Only adds feeds with recent, biotech-relevant content
4. **Entity-Aware**: Content automatically linked to tracked companies/labs
5. **Fresh Content**: Company blogs often announce milestones before press releases

## Troubleshooting

**No feeds discovered?**
- Check entity.website is correct
- Many companies don't have RSS (especially small startups)
- Try manually checking their blog/news section

**Low relevance scores?**
- Company blog may be marketing-focused (not technical)
- Adjust BIOTECH_KEYWORDS in discover-entity-rss-feeds.js

**Feed validation fails?**
- Feed may be behind authentication
- Feed may use non-standard format
- Add manual override in database

**Duplicate feeds in config?**
- Sync script checks for duplicates by URL
- If entity feed matches existing feed, it's skipped

## Future Enhancements

- [ ] Support authenticated feeds (API keys, login)
- [ ] Multi-language feed detection
- [ ] Podcast/video feed discovery
- [ ] Social media integration (Twitter/LinkedIn company feeds)
- [ ] Automatic dead feed removal
- [ ] Feed quality monitoring (track post frequency, relevance drift)
- [ ] Entity mention detection in feed content

---

**Status**: ✅ Implemented and ready for use
**Last Updated**: 2026-02-03
**Scripts**: `discover-entity-rss-feeds.js`, `sync-entity-feeds-to-config.js`
