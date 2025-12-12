# WordPress as Separate Client - Architecture Plan

## Executive Summary

**Current Implementation**: Post-processor that enriches existing 400-600 char broadcasts into 800-1200 word articles using templates.

**Target Architecture**: WordPress as a first-class client in the broadcast generation system, alongside Telegram, Bluesky, and Farcaster.

**Key Change**: WordPress broadcasts generated at document processing time with dedicated prompts, not at send time with templates.

---

## Current Multi-Platform Architecture

### Broadcast Generation Flow (process-unprocessed-docs.js)

```
Documents (memories table)
    ↓
Alignment Scoring (keyword-based, 0.08-0.30 range)
    ↓
LLM Generation (OpenRouter → Ollama fallback)
    ↓
Create broadcasts for EACH platform:
    - telegram (4096 chars)
    - farcaster (320 chars)
    - bluesky (300 chars)
    ↓
Store in broadcasts table (status: pending)
```

### Key Architecture Components

**1. Single Document → Multiple Platform-Specific Broadcasts**
- Each document generates 3 broadcasts (one per platform)
- Content adjusted for platform limits
- Same alignment score, same image_url
- All stored with `status = 'pending'`

**2. Platform-Specific Send Scripts**
- `send-pending-to-telegram.js`
- `send-pending-to-bluesky.js`
- `send-pending-to-farcaster.js`
- Each queries: `WHERE client = 'platform' AND status = 'pending' AND alignment_score >= 0.12`
- Just-in-time image generation if not already present
- Updates: `SET status = 'sent', sent_at = NOW()`

**3. Round-Robin Distribution**
- Action API enforces BROADCAST_ID in env
- Prevents race conditions between platforms
- Ensures fair distribution

---

## WordPress Client Integration Plan

### Phase 1: Add WordPress to Client List

**Location**: `process-unprocessed-docs.js:504-510`

```javascript
// CURRENT:
const platforms = ['telegram', 'farcaster', 'bluesky'];
const platformLimits = {
    telegram: 4096,
    farcaster: 320,
    bluesky: 300
};

// PROPOSED:
const platforms = ['telegram', 'farcaster', 'bluesky', 'wordpress'];
const platformLimits = {
    telegram: 4096,
    farcaster: 320,
    bluesky: 300,
    wordpress: 20000  // Large limit for full articles
};
```

### Phase 2: Create WordPress-Specific Prompts

**Create**: `wordpress-prompts.json`

```json
{
  "daily_insight": {
    "name": "Daily Insight",
    "target_length": "800-1200 words",
    "structure": {
      "hook": "1-2 sentences that grab attention",
      "overview": "What was discovered/invented/achieved",
      "context": "Why this matters in the larger picture",
      "details": "How it works, key innovations",
      "applications": "Real-world uses and implications",
      "outlook": "What comes next, future potential"
    },
    "prompt_template": "You are writing a Daily Insight article for AI10BRO, a bio-innovation news platform.\n\nTASK: Transform this research finding into an engaging 800-1200 word article.\n\nSOURCE DOCUMENT:\n{document_content}\n\nTREND CONTEXT:\n{trend_context}\n\nARTICLE STRUCTURE:\n1. HOOK (1-2 sentences)\n   - Start with the most compelling aspect\n   - Make readers want to learn more\n   - Example: \"Mushroom leather just reached price parity with cowhide—two years ahead of schedule.\"\n\n2. OVERVIEW (150-200 words)\n   - What was discovered/achieved\n   - Who did it (researchers, company, institution)\n   - Key breakthrough or innovation\n\n3. CONTEXT (150-200 words)\n   - Why this matters\n   - Market size and opportunity\n   - Connection to broader trends\n   - Previous limitations this overcomes\n\n4. DETAILS (300-400 words)\n   - How it works (technical but accessible)\n   - Key innovations or breakthroughs\n   - Specific data points and metrics\n   - What makes this different from prior work\n\n5. APPLICATIONS (200-300 words)\n   - Real-world uses\n   - Industry adoption potential\n   - Economic implications\n   - Specific companies or sectors that benefit\n\n6. OUTLOOK (100-150 words)\n   - What comes next\n   - Timeline for broader adoption\n   - Related developments to watch\n   - How this fits into larger goals\n\nWRITING STYLE:\n- Professional but accessible\n- Specific data and examples\n- Clear, direct language\n- No hype or hyperbole\n- Focus on practical implications\n\nAVOID:\n- AI-isms like \"delve into\", \"it's important to note\"\n- Excessive qualifiers (\"very\", \"extremely\", \"incredibly\")\n- Generic conclusions\n- Repetitive phrasing\n\nOUTPUT: Return ONLY the article body in HTML format with proper <p>, <h2>, and <h3> tags. Do NOT include a title (will be generated separately)."
  },
  "deep_dive": {
    "name": "Deep Dive",
    "target_length": "2000-4000 words",
    "structure": {
      "executive_summary": "2-3 paragraphs covering the key points",
      "background": "Historical context and prior art",
      "breakthrough": "Detailed explanation of the innovation",
      "technical_details": "How it works at a deeper level",
      "market_analysis": "Industry implications and economics",
      "expert_perspectives": "Quotes or insights from researchers",
      "future_implications": "Long-term potential and challenges",
      "conclusion": "Synthesis and takeaways"
    },
    "prompt_template": "[Deep Dive prompt - similar structure but more comprehensive]"
  }
}
```

### Phase 3: Modify Broadcast Generation Logic

**Location**: `process-unprocessed-docs.js:322-443`

**Current Logic**:
1. Generate single broadcast text (400-600 chars)
2. Apply to all platforms with truncation for limits

**Proposed Logic**:
```javascript
// After line 321 (where prompt is built):

// Determine if this is a WordPress-eligible document
const isWordPressEligible = alignmentScore >= 0.20 && textLength >= 500;

let generated;
let wordpressArticle = null;

if (isWordPressEligible) {
    // Generate BOTH short broadcast AND WordPress article

    // 1. Generate short broadcast for Telegram/Bluesky/Farcaster
    const shortPrompt = `[existing prompt for 400-600 char broadcast]`;
    generated = await generateBroadcastWithOpenRouter(shortPrompt);

    // 2. Generate WordPress article
    const wpPrompts = require('./wordpress-prompts.json');
    const wpPrompt = wpPrompts.daily_insight.prompt_template
        .replace('{document_content}', cleanContent)
        .replace('{trend_context}', trendConnection);

    const wpArticleRaw = await generateBroadcastWithOpenRouter(wpPrompt);

    // Extract title from first paragraph or generate one
    const titleMatch = wpArticleRaw.match(/<p>([^<]{50,120})[.!?]/);
    const title = titleMatch ? titleMatch[1] : generated.substring(0, 80);

    wordpressArticle = {
        title: title,
        content: wpArticleRaw,
        excerpt: generated.replace(/🔗 Source:.*$/, '').substring(0, 160)
    };

} else {
    // Just generate short broadcast
    generated = await generateBroadcastWithOpenRouter(prompt);
}
```

### Phase 4: Platform-Specific Broadcast Creation

**Location**: `process-unprocessed-docs.js:511-653`

```javascript
for (const platform of platforms) {
    let platformContent;
    const maxLength = platformLimits[platform];

    if (platform === 'wordpress' && wordpressArticle) {
        // Store full WordPress article
        platformContent = JSON.stringify({
            title: wordpressArticle.title,
            content: wordpressArticle.content,
            excerpt: wordpressArticle.excerpt,
            type: 'daily_insight'
        });
    } else if (platform === 'wordpress' && !wordpressArticle) {
        // Skip WordPress if document not eligible
        continue;
    } else {
        // Existing logic for short-form platforms
        platformContent = generated;
        if (platformContent.length > maxLength) {
            // [existing truncation logic]
        }
    }

    // Wrap content in JSON for storage
    const jsonContent = platform === 'wordpress'
        ? platformContent  // Already JSON
        : JSON.stringify({ text: platformContent });

    // [existing duplicate detection]

    // Create broadcast
    const broadcastId = crypto.randomUUID();
    db.prepare(`
        INSERT INTO broadcasts (
            id, documentId, client, content,
            status, alignment_score, image_url, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        broadcastId,
        doc.id,
        platform,
        jsonContent,
        'pending',
        alignmentScore,
        imageUrl,
        Date.now()
    );
}
```

### Phase 5: Create WordPress Send Script

**Create**: `send-pending-to-wordpress.js`

```javascript
#!/usr/bin/env node

const sqlite3 = require('better-sqlite3');
const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.wordpress' });

// Bio theme mapping (from ELIZA_AGENT_GUIDE.md)
const BIO_THEME_MAP = {
  'biomimicry': 2,
  'synbio': 3,
  'materials': 4,
  'energy': 5,
  'agtech': 6,
  'health': 7,
  'ai': 8,
  'innovation': 9,
  'environment': 10,
  'space': 11,
  'manufacturing': 12,
};

async function sendPendingBroadcasts() {
    const WP_BASE_URL = process.env.WP_BASE_URL;
    const WP_USERNAME = process.env.WP_USERNAME;
    const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD;

    if (!WP_APP_PASSWORD) {
        throw new Error('WP_APP_PASSWORD not configured');
    }

    const auth = Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString('base64');

    // Open database
    const dbPath = path.join(process.cwd(), 'agent/data/db.sqlite');
    const db = sqlite3(dbPath);

    // Get pending WordPress broadcasts
    let pendingBroadcasts;
    if (process.env.BROADCAST_ID) {
        pendingBroadcasts = db.prepare(`
            SELECT id, documentId, content, image_url, alignment_score
            FROM broadcasts
            WHERE id = ?
            AND status = 'pending'
            AND client = 'wordpress'
        `).all(process.env.BROADCAST_ID);
    } else {
        pendingBroadcasts = db.prepare(`
            SELECT id, documentId, content, image_url, alignment_score
            FROM broadcasts
            WHERE status = 'pending'
            AND client = 'wordpress'
            ORDER BY alignment_score DESC, createdAt ASC
            LIMIT 1
        `).all();
    }

    console.log(`📤 Found ${pendingBroadcasts.length} pending WordPress broadcasts`);

    for (const broadcast of pendingBroadcasts) {
        console.log(`\n📝 Publishing broadcast ${broadcast.id}...`);

        try {
            // Parse WordPress article content
            const article = JSON.parse(broadcast.content);

            // Get source document for metadata
            const doc = db.prepare(`
                SELECT content FROM memories WHERE id = ?
            `).get(broadcast.documentId);

            const docContent = JSON.parse(doc.content);

            // Extract bio theme
            const bioTheme = extractBioTheme(docContent);

            // Extract source URL
            const sourceUrl = extractSourceUrl(docContent);

            // Upload featured image if available
            let featuredMediaId = null;
            if (broadcast.image_url && fs.existsSync(broadcast.image_url)) {
                console.log(`   📷 Uploading featured image...`);
                featuredMediaId = await uploadImage(
                    broadcast.image_url,
                    article.title,
                    auth,
                    WP_BASE_URL
                );
                console.log(`   ✅ Image uploaded (ID: ${featuredMediaId})`);
            }

            // Create WordPress post
            console.log(`   📤 Creating WordPress post...`);
            const post = await createPost(
                article,
                bioTheme,
                broadcast.alignment_score,
                sourceUrl,
                featuredMediaId,
                auth,
                WP_BASE_URL
            );

            console.log(`   ✅ Post published: ${post.link}`);

            // Update broadcast status
            db.prepare(`
                UPDATE broadcasts
                SET status = 'sent', sent_at = ?
                WHERE id = ?
            `).run(Date.now(), broadcast.id);

        } catch (error) {
            console.error(`   ❌ Failed: ${error.message}`);
        }
    }

    db.close();
}

// Helper functions
function extractBioTheme(docContent) {
    // [Implementation from current publish-to-wordpress.js]
}

function extractSourceUrl(docContent) {
    // [Implementation from current publish-to-wordpress.js]
}

async function uploadImage(imagePath, title, auth, baseUrl) {
    // [Implementation from current publish-to-wordpress.js]
}

async function createPost(article, bioTheme, alignmentScore, sourceUrl, featuredMediaId, auth, baseUrl) {
    const postData = {
        title: article.title,
        content: article.content,
        excerpt: article.excerpt,
        status: 'publish',
        bio_theme: [BIO_THEME_MAP[bioTheme] || BIO_THEME_MAP['innovation']],
        featured_media: featuredMediaId || undefined,
        meta: {
            alignment_score: alignmentScore.toFixed(3),
            source_url: sourceUrl || '',
            is_featured: false
        }
    };

    const response = await fetch(`${baseUrl}/wp-json/wp/v2/insight`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(postData)
    });

    if (!response.ok) {
        throw new Error(`Post creation failed: ${response.status}`);
    }

    return response.json();
}

sendPendingBroadcasts().catch(console.error);
```

### Phase 6: Update Character Configuration

**Location**: `characters/ai10bro.character.json:3`

```json
{
    "clients": ["direct", "telegram", "bluesky", "wordpress"]
}
```

---

## Implementation Benefits

### 1. Consistent Quality
- WordPress articles generated by same LLM system as other broadcasts
- Same alignment scoring determines if article is created
- No template-based generation, all LLM-powered

### 2. Efficient Resource Usage
- Only generate WordPress articles for high-quality documents (>= 0.20)
- Reuse images across all platforms
- Single document processing run creates all broadcasts

### 3. Proper Integration
- WordPress follows same round-robin distribution as other platforms
- Same status tracking (`pending` → `sent`)
- Same error handling and retry logic
- Same cron scheduling

### 4. Content Variety
- Different prompts for different WordPress content types (Daily Insights, Deep Dives)
- Can add more content types without changing send logic
- Prompt variations prevent formulaic output

---

## Migration Path

### Step 1: Test WordPress Prompt Generation
```bash
# Create test script to validate WordPress article generation
node test-wordpress-prompt.js
```

### Step 2: Update process-unprocessed-docs.js
- Add WordPress to platforms list
- Add WordPress prompt logic
- Test with `--dry-run` flag

### Step 3: Create send-pending-to-wordpress.js
- Simplify from current version (remove article generation)
- Focus on sending pre-generated content
- Test with existing broadcasts

### Step 4: Update Cron Jobs
```bash
# Existing broadcast generation (unchanged)
0 */4 * * * node process-unprocessed-docs.js 10

# Add WordPress to hourly sends
0 * * * * curl -X POST localhost:3003/trigger -d '{"action":"PROCESS_QUEUE","client":"wordpress"}'
```

### Step 5: Deprecate Old Script
- Rename `publish-to-wordpress.js` → `publish-to-wordpress-legacy.js`
- Add deprecation notice
- Remove from docs

---

## Quality Thresholds

### Broadcast Creation Thresholds
- **Telegram/Bluesky/Farcaster**: >= 0.08 (core_alignment_minimum)
- **WordPress Daily Insights**: >= 0.20 (higher quality required)
- **WordPress Deep Dives**: >= 0.25 (manual curation + top quality)

### Send Thresholds (all platforms)
- **Quality filter**: >= 0.12 (prevents low-quality sends)
- **Applies to**: All platforms including WordPress

---

## Content Type Expansion

Future WordPress content types to add:

1. **Daily Insights** (800-1200 words) - AUTOMATED
2. **Deep Dives** (2000-4000 words) - SEMI-AUTOMATED
   - Higher alignment threshold (>= 0.25)
   - Manual review before publishing
   - More comprehensive research synthesis

3. **Weekly Roundups** - MANUAL
   - Curated collection of best Daily Insights
   - Editorial commentary
   - Trend analysis

4. **Expert Interviews** - MANUAL
   - Not generated from broadcasts
   - Separate content pipeline

---

## Success Metrics

### Technical Metrics
- WordPress broadcasts generated per day: 5-10
- Successful publish rate: >= 95%
- Average article word count: 900-1100
- Image inclusion rate: >= 90%

### Content Metrics
- Average alignment score: >= 0.22
- Bio theme distribution: All 11 themes represented
- Duplicate detection: < 1% false positives
- Source URL inclusion: >= 95%

---

## Next Steps

1. **Create wordpress-prompts.json** with Daily Insight prompt
2. **Update process-unprocessed-docs.js** to add WordPress client
3. **Create send-pending-to-wordpress.js** (simplified version)
4. **Test end-to-end** with 5 documents
5. **Update documentation** once confirmed working
6. **Set up cron job** for automated publishing

---

## Questions for User

1. Should WordPress articles be published immediately (`status: 'publish'`) or as drafts for review?
2. What alignment threshold for WordPress? Current suggestion: 0.20
3. Should we implement Deep Dives in Phase 1 or defer to Phase 2?
4. Preferred publishing schedule: Hourly like other platforms, or different cadence?
5. Should we keep legacy `publish-to-wordpress.js` for manual enrichment use cases?
