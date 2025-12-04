# Broadcast Send Architecture & Quality Control

## Overview

This document explains the broadcast sending system architecture, the quality control mechanisms, and a critical bug fix applied on 2025-09-23.

## System Architecture

### Component Flow

```
┌─────────────┐
│ Cron Jobs   │ (hourly triggers)
└──────┬──────┘
       │
       ▼
┌─────────────────────────────┐
│ Action API (port 3003)      │
│ - Receives trigger requests │
│ - Selects next broadcast    │
│ - Uses round-robin          │
└──────────┬──────────────────┘
           │
           │ Sets BROADCAST_ID env var
           ▼
┌────────────────────────────────────┐
│ Send Scripts                       │
│ - send-pending-to-telegram.js     │
│ - send-pending-to-bluesky.js      │
│ - Query broadcasts by ID          │
│ - Just-in-time image generation   │
│ - Post to platform                │
└────────────────────────────────────┘
```

### Cron Schedule

From `/tmp/new_crontab.txt`:

```bash
# Send broadcasts to Telegram (every hour at :00)
0 * * * * cd /Users/davidlockie/Documents/Projects/Eliza && \
  curl -X POST http://localhost:3003/trigger \
  -H 'Content-Type: application/json' \
  -d '{"action":"SEND_TELEGRAM"}' >> logs/cron-telegram-send.log 2>&1

# Send broadcasts to Bluesky (every hour at :40)
40 * * * * cd /Users/davidlockie/Documents/Projects/Eliza && \
  curl -X POST http://localhost:3003/trigger \
  -H 'Content-Type: application/json' \
  -d '{"action":"SEND_BLUESKY"}' >> logs/cron-bluesky-send.log 2>&1

# Farcaster disabled (no credentials configured)
```

## Send Script Query Paths

Each send script (Telegram, Bluesky) has **TWO query paths**:

### Path 1: Normal Mode (No BROADCAST_ID)
Used when script runs standalone or manually:

```javascript
// Send only 1 pending broadcast per run for proper pacing
pendingBroadcasts = db.prepare(`
    SELECT id, documentId, content as message, client as platform, image_url
    FROM broadcasts
    WHERE status = 'pending'
    AND client = 'telegram'
    AND alignment_score >= 0.15
    ORDER BY createdAt ASC
    LIMIT 1
`).all();
```

### Path 2: Specific Broadcast Mode (BROADCAST_ID set)
Used when Action API triggers with specific broadcast:

```javascript
// Send a specific broadcast
pendingBroadcasts = db.prepare(`
    SELECT id, documentId, content as message, client as platform, image_url
    FROM broadcasts
    WHERE id = ?
    AND status IN ('pending', 'sending')
    AND client = 'telegram'
    AND alignment_score >= 0.15
`).all(process.env.BROADCAST_ID);
```

**Why Both Paths Exist:**
- **Path 1**: Used for manual testing and fallback
- **Path 2**: Used by Action API to enforce round-robin distribution and prevent race conditions

## Quality Control: Alignment Score

### Current System: Keyword-Based Scoring

The alignment score uses a **keyword-matching system** defined in `alignment-keywords-refined.json`:

**Score Calculation:**
```javascript
// For each document:
alignmentScore = 0;

// 1. Check theme keywords (weighted by importance)
for each theme in [biomimicry_nature, biology_biotech, etc.]:
    matchCount = keywords found in content
    themeScore = (matchCount / total_keywords) * theme.weight
    alignmentScore += themeScore

// 2. Apply source quality multiplier
if (source === 'obsidian') multiplier = 4.0
else if (premium source) multiplier = 1.3
else if (trusted source) multiplier = 1.15
else multiplier = 1.0

finalScore = alignmentScore * multiplier
```

**Score Range:**
- Typical range: 0.08 - 0.30 (without Obsidian multiplier)
- Obsidian documents: Can reach 1.0+ (with 4x multiplier)
- NOT 0.0-1.0 normalized scale

**Quality Thresholds** (from alignment-keywords-refined.json):
- `core_alignment_minimum: 0.08` - Minimum to consider documents for broadcast creation
- **`quality_threshold: 0.15`** - Required score for sending broadcasts to platforms
- Higher scores indicate stronger alignment with AI10BRO's biology/biomimicry focus

### Current Broadcast Distribution

```
Pending broadcasts (as of 2025-12-04):
- 343 broadcasts with score >= 0.15 (WILL send)
- 937 broadcasts with score < 0.15 (BLOCKED)
- Average pending score: 0.136
- Score range: 0.086 - 0.199
```

### Why Quality Filtering Matters

- **Biology-focused curation**: Only content matching AI10BRO's biomimicry mission
- **Source credibility**: Premium scientific sources (Nature, Science) get priority
- **Brand alignment**: Maintains focus on nature-inspired innovation

## The Bug (Fixed: 2025-09-23)

### Problem

A broadcast with alignment score 0.144 (below 0.15 threshold) was sent without an image:

```
Broadcast ID: 171ed0a0-b733-4650-adbc-217c5b877d36
Content: "Modern bridge safety protocols just got smarter..."
Alignment Score: 0.144 (BELOW THRESHOLD)
Status: sent (should have been filtered)
```

### Root Cause

The **BROADCAST_ID query path** (Path 2) was missing the alignment score filter:

**BEFORE (Broken):**
```javascript
if (process.env.BROADCAST_ID) {
    pendingBroadcasts = db.prepare(`
        SELECT id, documentId, content as message, client as platform, image_url
        FROM broadcasts
        WHERE id = ?
        AND status IN ('pending', 'sending')
        AND client = 'telegram'
        -- MISSING: AND alignment_score >= 0.15
    `).all(process.env.BROADCAST_ID);
}
```

When cron jobs triggered the Action API → Send Scripts flow, the BROADCAST_ID was set, activating Path 2, which bypassed quality control.

### The Fix

Added `AND alignment_score >= 0.15` to the BROADCAST_ID query path in both:
- `send-pending-to-telegram.js` (line 41)
- `send-pending-to-bluesky.js` (line 53)

**AFTER (Fixed):**
```javascript
if (process.env.BROADCAST_ID) {
    pendingBroadcasts = db.prepare(`
        SELECT id, documentId, content as message, client as platform, image_url
        FROM broadcasts
        WHERE id = ?
        AND status IN ('pending', 'sending')
        AND client = 'telegram'
        AND alignment_score >= 0.15  -- ✅ NOW ENFORCED
    `).all(process.env.BROADCAST_ID);
}
```

**Git Commit:**
```
Commit: 9e8f0e41e
Message: "fix: Add alignment score filter to BROADCAST_ID query path"
Files: send-pending-to-telegram.js, send-pending-to-bluesky.js
```

### Why Second Path Not Removed

The BROADCAST_ID path is **legitimately used** by the Action API:

1. **Round-Robin Distribution**: Action API selects next broadcast fairly across platforms
2. **Race Condition Prevention**: Single broadcast selected, then sent via specific ID
3. **Cron Integration**: Hourly cron jobs depend on this flow
4. **Manual Override Capability**: Allows sending specific broadcasts via `BROADCAST_ID=xxx node send-pending-to-telegram.js`

Removing it would break the entire automated hourly broadcast system.

## Just-in-Time Image Generation

### Overview

As of commit 087eccee7, images are generated **on-demand at send time** rather than batch processing:

```javascript
// Just-in-time image generation (if not already generated)
if (!broadcast.image_url &&
    process.env.ENABLE_IMAGE_GENERATION === 'true' &&
    process.env.GEMINI_API_KEY) {

    console.log(`   🎨 Generating image on-the-fly...`);

    // Use broadcast content for image prompt
    const textForImage = cleanMessage
        .replace(/\n\n🔗 Source:.*$/, '')
        .substring(0, 500);

    // Generate image using Python script (takes ~30 seconds)
    const { stdout } = await execPromise(
        `python3 generate-broadcast-image-v2.py "${broadcast.documentId}" "${textForImage.replace(/"/g, '\\"')}"`
    );

    // Update ALL broadcasts for this document with the image
    db.prepare(`
        UPDATE broadcasts
        SET image_url = ?
        WHERE documentId = ?
    `).run(imageUrl, broadcast.documentId);
}
```

### Benefits

- **Efficient**: Only generates images for broadcasts that will actually be sent
- **Reusable**: Once generated, all broadcasts for that document use the same image
- **Quality-Aligned**: Only quality broadcasts (>= 0.15) trigger generation

### Performance

- Image generation: ~30 seconds per document
- Subsequent broadcasts with same documentId: instant (reuses existing image)
- 2.8MB PNG files stored in project directory

## Current System Status

### Working Components
✅ Just-in-time image generation at send time
✅ Quality threshold enforcement on BOTH query paths
✅ Telegram hourly sends at :00
✅ Bluesky hourly sends at :40
✅ Farcaster disabled (no credentials)
✅ Eliza agent running (process 9980)

### Broadcast Statistics
- **Pending**: ~1,280 total (640 Telegram + 640 Bluesky)
- **Quality Filtered**: Only broadcasts with alignment_score >= 0.15 will send
- **With Images**: Generated on-demand as broadcasts are sent

## Testing Procedure

### Manual Test
```bash
# Enable image generation
export ENABLE_IMAGE_GENERATION=true
export GEMINI_API_KEY=your_key

# Send next pending broadcast (tests Path 1)
node send-pending-to-telegram.js
```

### Cron-Triggered Test
```bash
# Trigger via Action API (tests Path 2)
curl -X POST http://localhost:3003/trigger \
  -H "Content-Type: application/json" \
  -d '{"action":"SEND_TELEGRAM"}'
```

### Verify Quality Control
```bash
# Check that all sent broadcasts have score >= 0.15
sqlite3 agent/data/db.sqlite \
  "SELECT COUNT(*) FROM broadcasts
   WHERE status = 'sent'
   AND alignment_score < 0.15;"

# Should return: 0
```

## Troubleshooting

### Broadcast Sent Without Quality Filter

**Symptoms**: Broadcast with alignment_score < 0.15 was sent

**Check**:
1. Verify both query paths have `AND alignment_score >= 0.15`
2. Check if BROADCAST_ID was set in environment
3. Review cron logs: `tail -f logs/cron-telegram-send.log`

**Solution**: Apply fix from commit 9e8f0e41e

### Images Not Generating

**Symptoms**: Broadcasts sent without images despite `ENABLE_IMAGE_GENERATION=true`

**Check**:
1. Verify `GEMINI_API_KEY` is set
2. Check Python script exists: `generate-broadcast-image-v2.py`
3. Verify Gemini API quota not exceeded

**Solution**:
```bash
# Test image generation manually
python3 generate-broadcast-image-v2.py "test-doc-id" "test content"
```

## Related Files

- `send-pending-to-telegram.js` - Telegram sending with just-in-time images
- `send-pending-to-bluesky.js` - Bluesky sending with just-in-time images
- `packages/plugin-dashboard/src/services/action-api.js` - Action API that triggers sends
- `generate-broadcast-image-v2.py` - Gemini V2 image generation
- `/tmp/new_crontab.txt` - Cron schedule configuration
- `CLAUDE.md` - Session context and accomplishments

## Key Learnings

1. **Dual Query Paths**: Both paths must enforce identical quality controls
2. **Environment Variables**: Be cautious when different env vars trigger different code paths
3. **Quality First**: Never bypass quality filters, even for specific broadcast requests
4. **Action API Pattern**: Intermediary layer prevents race conditions and enables round-robin
5. **Just-in-Time Generation**: More efficient than batch processing for image generation

---

**Last Updated**: 2025-09-23
**Commit**: 9e8f0e41e
**Status**: All quality controls enforced consistently across both query paths
