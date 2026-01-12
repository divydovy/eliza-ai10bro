# Just-in-Time Image Generation Implementation

**Date**: 2026-01-12
**Status**: ✅ COMPLETE

## Overview

Migrated image generation from broadcast creation to just-in-time (JIT) generation during sending. This ensures images are only generated for broadcasts that will actually be sent, conserving Gemini API usage.

## Changes Made

### 1. Removed Image Generation from Broadcast Creation
**File**: `process-unprocessed-docs.js` (lines 455-478)

**Before**: Generated images immediately when creating broadcasts
**After**: Broadcasts created without images (image_url = null)

**Benefit**: No wasted Gemini API calls for broadcasts that get deleted during re-scoring

### 2. Added JIT Image Generation to Send Scripts

#### Telegram Sender ✅
**File**: `send-pending-to-telegram.js` (lines 79-111)
**Status**: Already implemented
- Checks if `broadcast.image_url` is null
- Generates image on-the-fly if `ENABLE_IMAGE_GENERATION=true`
- Updates ALL broadcasts for same document
- Continues without error if generation fails

#### Bluesky Sender ✅
**File**: `send-pending-to-bluesky.js` (lines 94-125)
**Status**: Already implemented
- Same JIT logic as Telegram
- Generates and shares images across all broadcasts

#### WordPress Sender ✅
**File**: `send-pending-to-wordpress.js` (lines 235-267)
**Status**: Newly added
- Generates images before uploading to WordPress
- Uses article title + excerpt for image prompt
- Updates all broadcasts for same document

#### Farcaster Sender ⏸️
**File**: `send-pending-to-farcaster.js`
**Status**: Not updated (service disabled)
- No cron job configured
- Doesn't fetch or use images
- Can be updated when service is re-enabled

## Architecture

### Image Generation Flow

```
1. Broadcast created (no image)
   ↓
2. Send script checks broadcast.image_url
   ↓
3. IF null AND ENABLE_IMAGE_GENERATION=true:
   a. Generate image via generate-broadcast-image-v2.py
   b. Save to /broadcasts/images/{documentId}.png
   c. Update ALL broadcasts for this documentId
   ↓
4. Send with image (or without if generation failed)
```

### Image Reuse

- One image per **document** (not per broadcast)
- Shared across all platforms: Telegram, Bluesky, WordPress
- Example: Document A generates 1 image used by 3 broadcasts (telegram + bluesky + wordpress)

### Conservative API Usage

**Before JIT**:
- Generated ~68 images for docs below 8% threshold (never sent)
- Generated images for ALL broadcasts at creation time
- Wasted API calls if broadcasts deleted during re-scoring

**After JIT**:
- Only generate when actually sending
- Skip generation if alignment drops below threshold
- No wasted calls for re-scored/deleted broadcasts

## Configuration

Images are only generated when BOTH conditions are true:

1. `ENABLE_IMAGE_GENERATION=true` in `.env`
2. `GEMINI_API_KEY` is set in `.env`

If either is missing, broadcasts send without images (text-only).

## Testing

To test JIT image generation:

```bash
# 1. Ensure config is set
grep "ENABLE_IMAGE_GENERATION\|GEMINI_API_KEY" .env

# 2. Create test broadcast without image
sqlite3 agent/data/db.sqlite "UPDATE broadcasts SET image_url = NULL WHERE id = 'some-broadcast-id'"

# 3. Send broadcast (will trigger JIT generation)
BROADCAST_ID=some-broadcast-id node send-pending-to-telegram.js

# 4. Verify image was generated and saved
sqlite3 agent/data/db.sqlite "SELECT image_url FROM broadcasts WHERE id = 'some-broadcast-id'"
```

## Cost Savings

**Estimated savings**: 11% reduction in Gemini API calls

- Before: 599 images generated (including 68 for <8% docs)
- After: ~531 images generated (only for sent broadcasts)
- Savings: 68 unnecessary calls eliminated

**Additional savings from re-scoring**:
- If 200 broadcasts deleted after re-scoring
- Before: Images already generated (wasted)
- After: Images never generated (saved)

## Future Enhancements

1. **Image Cache**: Check if image already exists before generating
2. **Retry Logic**: Retry failed image generations with exponential backoff
3. **Image Quality Tiers**: Generate lower quality images for lower-scoring docs
4. **Batch Generation**: Generate multiple images in parallel for bulk sends

## Files Modified

1. ✅ `process-unprocessed-docs.js` - Removed image generation
2. ✅ `send-pending-to-wordpress.js` - Added JIT image generation
3. ℹ️ `send-pending-to-telegram.js` - Already had JIT (no changes)
4. ℹ️ `send-pending-to-bluesky.js` - Already had JIT (no changes)
5. ⏸️ `send-pending-to-farcaster.js` - Not updated (service disabled)

## Verification

Run health check to verify system:
```bash
./check-automation-health.sh
```

Check image generation stats:
```bash
sqlite3 agent/data/db.sqlite "
SELECT
    COUNT(*) as total_broadcasts,
    SUM(CASE WHEN image_url IS NOT NULL THEN 1 ELSE 0 END) as with_images,
    COUNT(DISTINCT image_url) as unique_images
FROM broadcasts
"
```
