# WordPress Publisher for AI10BRO

Automatically publishes quality Eliza broadcasts to the AI10BRO WordPress site as enriched Daily Insight articles.

## Quick Start

### 1. Set Up WordPress Authentication

Generate an Application Password in WordPress:

1. Go to http://localhost:8885/wp-admin
2. Navigate to **Users → Your Profile**
3. Scroll down to **Application Passwords**
4. Enter application name: `Eliza Agent`
5. Click **Add New Application Password**
6. Copy the generated password (it will look like: `xxxx xxxx xxxx xxxx xxxx xxxx`)

### 2. Configure Environment

Copy the example configuration:

```bash
cp .env.wordpress.example .env.wordpress
```

Edit `.env.wordpress` and add your credentials:

```bash
WP_BASE_URL=http://localhost:8885
WP_USERNAME=admin
WP_APP_PASSWORD=xxxx xxxx xxxx xxxx xxxx xxxx  # Paste the generated password here
WP_ALIGNMENT_THRESHOLD=0.20
```

### 3. Test the Connection

```bash
node publish-to-wordpress.js --dry-run --limit=1
```

This will:
- Check your credentials
- Find 1 quality broadcast (alignment >= 0.20)
- Generate a Daily Insight article
- Create it as a **DRAFT** in WordPress
- NOT publish it publicly

### 4. Review the Draft

1. Go to http://localhost:8885/wp-admin/edit.php?post_type=insight
2. Find your draft article
3. Review the content, formatting, and featured image
4. Make any necessary edits
5. Click **Publish** when ready

### 5. Publish For Real

Once you're satisfied with the test, publish real articles:

```bash
node publish-to-wordpress.js --limit=3
```

This will publish 3 articles immediately to the live site.

## How It Works

### Publishing Flow

```
Eliza Broadcasts (alignment >= 0.20)
         ↓
Fetch source document from database
         ↓
Generate 800-1200 word Daily Insight article
         ↓
Upload featured image to WordPress
         ↓
Create post via REST API
         ↓
Update broadcast: wordpress_published = true
```

### Article Generation

The script transforms a 400-600 character broadcast into a comprehensive Daily Insight:

**Broadcast (input):**
```
Breakthrough in isolating diverse phyllosphere methylotrophs using lanthanides.
All 344 strains nearly identical, part of Methylobacterium extorquens clade.
Despite low diversity, metabolic capabilities diverged greatly.

🔗 Source: https://doi.org/10.1101/2023.06.28.546956
```

**Daily Insight (output):**
- 800-1200 words
- 6-7 sections with H2 headings
- Accessible explanation of the technology
- Industry implications and context
- Future outlook
- Proper HTML formatting

### Bio Theme Mapping

The script automatically detects the bio theme from the source document and maps it to WordPress categories:

| Theme | WordPress Term ID |
|-------|-------------------|
| Biomimicry & Nature-Inspired Design | 2 |
| Synthetic Biology & Bioengineering | 3 |
| Advanced Materials | 4 |
| Clean Energy & Carbon Capture | 5 |
| Agriculture & Food Tech | 6 |
| Health & Medicine | 7 |
| AI & Computing | 8 |
| Innovation & Markets | 9 |
| Environmental Conservation | 10 |
| Space & Exploration | 11 |
| Manufacturing & Industry | 12 |

### Database Tracking

The script adds tracking columns to the `broadcasts` table:

```sql
wordpress_published      BOOLEAN   -- Was it published?
wordpress_post_id        INTEGER   -- WordPress post ID
wordpress_published_at   DATETIME  -- When published
wordpress_status         TEXT      -- 'draft', 'publish', 'error'
wordpress_error          TEXT      -- Error message if failed
```

This ensures:
- Broadcasts are only published once
- You can track publishing status
- Failed publishes are logged for debugging

## Usage

### Basic Commands

```bash
# Test mode - create 1 draft
node publish-to-wordpress.js --dry-run --limit=1

# Publish 5 articles
node publish-to-wordpress.js --limit=5

# Publish specific broadcast by ID
BROADCAST_ID=uuid-here node publish-to-wordpress.js

# Publish all quality broadcasts (be careful!)
node publish-to-wordpress.js --limit=100
```

### Configuration Options

**Environment Variables:**
```bash
WP_BASE_URL              # WordPress site URL
WP_USERNAME              # WordPress username
WP_APP_PASSWORD          # Application password
WP_ALIGNMENT_THRESHOLD   # Minimum alignment score (default: 0.20)
GEMINI_API_KEY           # For image generation (from .env)
```

**Command Line Flags:**
```bash
--dry-run     # Create drafts instead of publishing
--limit=N     # Process N broadcasts (default: 1)
```

### Automated Publishing

Add to crontab for automatic publishing every 2 hours:

```bash
crontab -e
```

Add this line:
```bash
0 */2 * * * cd /Users/davidlockie/Documents/Projects/Eliza && node publish-to-wordpress.js --limit=3 >> logs/wordpress-publish.log 2>&1
```

This will:
- Run every 2 hours (at :00)
- Publish up to 3 articles per run
- Log output to `logs/wordpress-publish.log`
- Result: 36 articles per day (3 × 12 runs)

## Quality Control

### What Gets Published

**Criteria:**
- ✅ Alignment score >= 0.20 (configurable)
- ✅ Not already published to WordPress
- ✅ Has source document available
- ✅ Broadcast status is 'pending' or 'sent'

**Article Quality Checks:**
- Word count should be 800-1200 words
- All sections should be present (hook, overview, context, why it matters, etc.)
- No AI-isms like "delve into" or "it's important to note"
- Specific data points and company names included
- Source URL properly linked

### Manual Review Recommended

For the first 10-20 articles, use `--dry-run` mode and manually review drafts before publishing. This helps you:

1. Verify article quality
2. Check bio theme detection accuracy
3. Ensure images are appropriate
4. Catch any formatting issues
5. Tune the alignment threshold

## Troubleshooting

### "WP_APP_PASSWORD not configured"

**Problem:** Missing WordPress authentication

**Solution:**
1. Generate Application Password in WordPress (see Quick Start #1)
2. Add to `.env.wordpress` file
3. Make sure there are no quotes around the password
4. Keep the spaces in the password (they're required)

### "Post creation failed: 401"

**Problem:** Invalid credentials

**Solution:**
1. Verify WordPress username is correct
2. Regenerate Application Password
3. Make sure you copied the entire password (with spaces)
4. Test in browser: `curl -u username:password http://localhost:8885/wp-json/wp/v2/users/me`

### "Post creation failed: 400"

**Problem:** Invalid post data

**Solution:**
1. Check bio theme term ID exists in WordPress
2. Verify featured image uploaded successfully
3. Check article HTML is valid (no unclosed tags)
4. Review error message for specific field issues

### "Image upload failed"

**Problem:** Featured image not found or upload error

**Solution:**
1. Check image file exists at path in broadcast.image_url
2. Verify image is valid PNG/JPG
3. Check WordPress media library permissions
4. Posts will still publish without images (not ideal but works)

### "Article too short" warning

**Problem:** Generated article < 800 words

**Solution:**
1. Source document may lack sufficient detail
2. Try publishing as draft for manual enrichment
3. Consider lowering alignment threshold (more selective sources)
4. Add manual context to improve generation

### No broadcasts found

**Problem:** No broadcasts meet criteria

**Solution:**
```bash
# Check how many quality broadcasts exist
sqlite3 agent/data/db.sqlite "
SELECT COUNT(*) FROM broadcasts
WHERE alignment_score >= 0.20
  AND (wordpress_published IS NULL OR wordpress_published = FALSE)
"

# Lower the threshold temporarily
WP_ALIGNMENT_THRESHOLD=0.15 node publish-to-wordpress.js --dry-run --limit=1

# Or generate more broadcasts first
node process-unprocessed-docs.js 20
```

## Integration with Existing System

### Current Broadcast Flow

```
GitHub Repos → documents → process-unprocessed-docs.js → broadcasts (Telegram/Bluesky)
```

### New WordPress Flow (Parallel)

```
broadcasts (alignment >= 0.20) → publish-to-wordpress.js → WordPress (ai10bro.com)
```

### Key Points

- **Non-Destructive:** WordPress publishing doesn't affect Telegram/Bluesky broadcasts
- **Selective:** Only high-quality broadcasts (>= 0.20) go to WordPress
- **Tracked:** Database tracks which broadcasts were published
- **Idempotent:** Safe to run multiple times, won't create duplicates
- **Parallel:** Telegram/Bluesky and WordPress run independently

## Performance

### Timing

- Article generation: ~2-5 seconds
- Image upload: ~1-3 seconds
- Post creation: ~1 second
- **Total per article: ~5-10 seconds**

### Capacity

- 1 article: ~5-10 seconds
- 10 articles: ~1-2 minutes
- 50 articles: ~5-8 minutes
- 100 articles: ~10-15 minutes

### Recommendations

- Start with `--limit=3` for cron jobs
- Increase to `--limit=5` once stable
- Avoid batch publishing 50+ articles at once (rate limiting)
- Stagger publishing throughout the day

## Monitoring

### Check Publishing Status

```bash
# Count published articles
sqlite3 agent/data/db.sqlite "
SELECT wordpress_status, COUNT(*)
FROM broadcasts
WHERE wordpress_published = 1
GROUP BY wordpress_status
"

# Recent publishes
sqlite3 agent/data/db.sqlite "
SELECT
  id,
  alignment_score,
  wordpress_post_id,
  wordpress_status,
  datetime(wordpress_published_at) as published
FROM broadcasts
WHERE wordpress_published = 1
ORDER BY wordpress_published_at DESC
LIMIT 10
"

# Failed publishes
sqlite3 agent/data/db.sqlite "
SELECT id, wordpress_error
FROM broadcasts
WHERE wordpress_status = 'error'
"
```

### WordPress Analytics

Check published posts:
```bash
curl http://localhost:8885/wp-json/wp/v2/insight?per_page=10&_fields=id,title,link,date
```

View site stats (requires plugin):
```bash
curl http://localhost:8885/wp-json/ai10bro/v1/stats
```

## Next Steps

### Phase 1: Manual Testing (This Week)

1. ✅ Set up authentication
2. ✅ Test with `--dry-run`
3. ✅ Review 5-10 draft articles
4. ✅ Publish first batch manually
5. ✅ Monitor for issues

### Phase 2: Automation (Next Week)

1. Set up cron job for automated publishing
2. Monitor daily for first week
3. Adjust alignment threshold based on quality
4. Fine-tune article generation prompts
5. Add social media auto-posting (optional)

### Phase 3: Enhancement (Future)

1. Integrate LLM for better article generation
2. Add internal linking automation
3. Implement entity extraction and tagging
4. Create Deep Dive articles (manual curation)
5. Build WordPress → social media workflow

## Support

**Documentation:**
- `WORDPRESS_INTEGRATION_SPEC.md` - Complete technical specification
- `ELIZA_AGENT_GUIDE.md` (in WordPress project) - Content strategy guide
- `AI10BRO_WEBSITE_BRIEF.md` - Full website requirements

**Useful Commands:**
```bash
# View WordPress posts
open http://localhost:8885/wp-admin/edit.php?post_type=insight

# View published site
open http://localhost:8885

# Check logs
tail -f logs/wordpress-publish.log

# Database queries
sqlite3 agent/data/db.sqlite
```

**Common Issues:**
- Authentication problems → Regenerate Application Password
- Article quality → Lower threshold or enrich source documents
- No broadcasts found → Generate more broadcasts first
- Image issues → Check file paths and WordPress permissions

---

**Last Updated:** 2025-12-11
**Status:** Ready for testing
**Next:** Generate WordPress Application Password and run first test
