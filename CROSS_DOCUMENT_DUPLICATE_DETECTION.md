# Cross-Document Duplicate Detection

**Date**: 2026-01-26
**Status**: ✅ Implemented

## The Problem

We import the same news stories from multiple sources, creating duplicate documents in the database:

```
Document A: "Anglo American Platinum backs green hydrogen" (from TechCrunch)
Document B: "Anglo American Platinum invests in Hydrogenious" (from Reuters)
→ Same story, different sources → duplicate broadcasts
```

## The Solution

**Three-Layer Duplicate Detection**:

### Layer 1: Cross-Document Detection (NEW)
**When**: Before generating any broadcasts for a document
**Checks**: Has ANY client published similar content from a DIFFERENT document?
**Threshold**: >75% similarity to any broadcast in last 7 days
**Result**: Skip document entirely (no broadcasts generated for any platform)

```javascript
// Check across ALL clients, ALL documents
const recentBroadcasts = db.prepare(`
    SELECT id, documentId, client, content
    FROM broadcasts
    WHERE (status = 'pending' OR status = 'sent')
    AND createdAt > ? -- Last 7 days
    LIMIT 100
`).all(...);

for (const existing of recentBroadcasts) {
    if (existing.documentId === doc.id) continue; // Skip same doc

    if (similarity > 0.75) {
        // Already covered from different source → skip entirely
    }
}
```

### Layer 2: Per-Client Detection (Existing)
**When**: During broadcast generation for each platform
**Checks**: Has THIS client published similar content?
**Threshold**: >70% similarity within last 7 days
**Result**: Skip this platform only (other platforms can still publish)

```javascript
// Check per-client during broadcast generation
const existingBroadcasts = db.prepare(`
    SELECT id, content FROM broadcasts
    WHERE client = ? -- Only this client
    AND (status = 'pending' OR status = 'sent')
    ...
`).all(platform, ...);
```

### Layer 3: In-Run Duplicate Prevention (Existing)
**When**: During batch processing
**Checks**: Already generated in this run?
**Result**: Skip to prevent duplicates within same processing batch

## Why Both Layers?

### Cross-Document (Layer 1): Prevents Same Story from Multiple Sources
```
✅ BLOCKS:
- Document A (TechCrunch): "Anglo American invests..."
- Document B (Reuters): "Anglo American backs..." ← BLOCKED (75% similar to Document A broadcast)

✅ ALLOWS:
- Different editorial angles on SAME document across platforms
  - Telegram: "Company X raises $50M" (general audience)
  - BiologyInvestor: "Company X's Strategic $50M Round" (investor analysis)
```

### Per-Client (Layer 2): Prevents Repetition on Same Platform
```
✅ BLOCKS:
- Telegram broadcast about "CRISPR breakthrough"
- Another Telegram broadcast about same CRISPR breakthrough ← BLOCKED

✅ ALLOWS:
- Telegram: "CRISPR breakthrough" (general)
- BiologyInvestor: "CRISPR Breakthrough Investment Analysis" (investor lens)
```

## Implementation Locations

### 1. Main Pipeline
**File**: `process-unprocessed-docs.js`
**Lines**: 254-294 (cross-document), 690-741 (per-client)

### 2. Backfill Script
**File**: `backfill-biologyinvestor-broadcasts.js`
**Lines**: 158-216 (cross-document + per-client combined)

## Configuration

### Similarity Thresholds
- **Cross-document**: 75% (strict - different sources of same story)
- **Per-client**: 70% (slightly looser - same client variations)
- **Entity overlap**: 50% + 2 shared entities (for per-client)

### Time Window
- **7 days**: Only checks recent broadcasts (prevents old stories from blocking new developments)

### Content Comparison
- **First 300 chars**: Captures headline + key facts
- **Normalized**: Lowercase, remove punctuation, collapse whitespace
- **Levenshtein distance**: Character-level similarity metric

## Example Scenarios

### Scenario 1: Same Story, Multiple Sources ✅ PREVENTED
```
Day 1, 9am: Import "Ginkgo Bioworks raises $50M Series C" (TechCrunch)
            → Generate broadcasts: Telegram ✅, BiologyInvestor ✅

Day 1, 3pm: Import "Ginkgo secures $50M in new funding" (Reuters)
            → Cross-document check: 85% similar to TechCrunch article
            → SKIP ENTIRELY (no broadcasts generated)
```

### Scenario 2: Different Angles, Same Platform ✅ PREVENTED
```
Day 1: Telegram broadcasts "CRISPR breakthrough in gene therapy"
Day 2: Process another CRISPR article
       → Per-client check: 72% similar to yesterday's Telegram broadcast
       → Skip Telegram only
       → BiologyInvestor can still publish (different audience/angle)
```

### Scenario 3: Same Document, Multiple Platforms ✅ ALLOWED
```
Document: "Mammoth Biosciences raises $195M Series D"
→ Telegram: "Mammoth Biosciences raises $195M" (general audience)
→ BiologyInvestor: "Mammoth's $195M Series D: Strategic Analysis" (investor analysis)
→ Both allowed (same document, different editorial angles)
```

### Scenario 4: Old Story Re-emerges ✅ ALLOWED
```
Day 1: Broadcast "Company X clinical trial results"
Day 10: Same story resurfaces from new source
        → Cross-document check: Outside 7-day window
        → Allowed (news cycle moved on)
```

## Metrics to Monitor

### Before Implementation
```sql
-- Count broadcasts with >75% similarity to different documents
SELECT COUNT(*) FROM broadcasts b1
JOIN broadcasts b2 ON b1.id != b2.id AND b1.documentId != b2.documentId
WHERE similarity(b1.content, b2.content) > 0.75;
```

### After Implementation
```sql
-- Should be ~0 (cross-document duplicates prevented)
```

## Edge Cases

### False Positives (Over-blocking)
**Risk**: Generic content might match unrelated stories
**Mitigation**: 75% threshold is high (requires significant overlap)
**Example**: Two different "raises $50M" stories won't match unless companies/contexts similar

### False Negatives (Under-blocking)
**Risk**: Heavily rewritten versions might slip through
**Mitigation**: 300-char comparison captures key facts, not just headlines
**Example**: Even if Reuters rewrites TechCrunch's story completely, key facts (company, amount, round) will match

### Multi-Part Stories
**Risk**: Ongoing story with multiple updates might get blocked
**Mitigation**: 7-day window allows updates after news cycle passes
**Example**: "Company announces trial results" (Day 1) vs "Company trial shows 80% efficacy" (Day 8) - allowed

## Testing Commands

```bash
# Test cross-document detection
sqlite3 agent/data/db.sqlite "
  SELECT
    b1.id as broadcast1_id,
    b1.documentId as doc1,
    b2.id as broadcast2_id,
    b2.documentId as doc2,
    b1.client,
    json_extract(b1.content, '$.text') as content1_preview
  FROM broadcasts b1
  JOIN broadcasts b2 ON b1.documentId != b2.documentId
  WHERE b1.createdAt > (unixepoch() - 604800) * 1000
  LIMIT 10
"

# Check for potential duplicates in last 7 days
# (Manual verification - need to implement similarity function in SQL)
```

## Future Enhancements

1. **Semantic Similarity**: Use embeddings instead of Levenshtein (captures meaning, not just text)
2. **Entity-Based Detection**: Match on key entities (company names, people, amounts) even if text differs
3. **Update vs New Story**: Distinguish between "Company raises $50M" (Day 1) and "Company closes $50M round" (Day 3)
4. **Source Prioritization**: Prefer high-quality sources (Nature, Science) over low-quality if duplicate detected

## Related Documentation

- `CONTENT_IMPORT_ARCHITECTURE.md` - Import pipeline overview
- `MULTI_SITE_CONTENT_STRATEGY.md` - Content routing strategy
- `BIOLOGYINVESTOR_IMPLEMENTATION.md` - BiologyInvestor setup
