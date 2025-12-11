# WordPress Integration Specification

## Overview

**Goal:** Automate content publishing from Eliza agent to WordPress site (ai10bro.com)

**Current State:**
- ✅ WordPress site built and running at http://localhost:8885
- ✅ Custom theme with 11 bio themes configured
- ✅ Sample content imported (10 articles with AI images)
- ✅ Eliza agent generating quality broadcasts (>= 0.15 alignment score)
- ⏳ Integration needed to connect the two systems

**Target State:**
- Eliza automatically publishes enriched articles to WordPress
- Threshold: alignment score >= 0.20 for auto-publish
- Output: 800-1200 word Daily Insights from broadcast content
- Featured images generated via Gemini V2 API
- Categories/tags mapped from alignment themes

---

## Content Types & Strategy

### From Content Guide (Image)

**1. Daily Insights (Primary - AUTOMATED)**
- **Format:** 800-1200 words
- **Source:** Eliza broadcasts (enriched from 400-600 chars)
- **Frequency:** 3-5 posts per day
- **Publishing:** Automated via `publish-to-wordpress.js`
- **Threshold:** alignment_score >= 0.20
- **Post Type:** `insight` (custom post type in WordPress)

**Structure Template:**
```markdown
# Hook (1-2 sentences)
Compelling opening that captures the breakthrough/innovation

## Overview (2-3 paragraphs)
What happened? Who did it? When?

## Context & Details (3-4 paragraphs)
- How does the technology work?
- What makes it novel/significant?
- Technical details (accessible, not academic)

## Why It Matters (2-3 paragraphs)
- Industry implications
- Potential impact on sustainability/bio sector
- Market context

## Related Developments (1-2 paragraphs)
- Internal links to similar AI10BRO articles
- Broader trend context

## Looking Ahead (1 paragraph)
Future outlook, next milestones, timeline

## Source & Further Reading
- Original source URL
- Related research/company links
```

**Tone:** Informative journalism (like TechCrunch, Axios, MIT Technology Review)
**Style:**
- Short paragraphs (2-4 sentences)
- H2/H3 subheadings for scannability
- Bullet lists for key points
- Natural keyword integration
- 2-4 internal links to related posts

**2. Deep Dives / Analysis (Manual Curation)**
- **Format:** 2,000-4,000 words
- **Source:** Manually selected high-impact topics
- **Frequency:** 1-2 per week
- **Publishing:** Manual creation in WordPress
- **Post Type:** `analysis` (custom post type)

**Examples:**
- "The Race to Carbon-Negative Concrete: 5 Technologies to Watch in 2025"
- "Q4 2025 Synthetic Biology Funding: $4.2B Across 87 Deals"
- "How Biomimicry Is Reshaping Materials Science: 10 Companies to Know"

**3. Future Content Types (Backlog)**
- Company Profiles (600-1000 words)
- Technology Explainers (800-1500 words)
- Market Reports (Quarterly, 3000-5000 words)

---

## WordPress Integration Architecture

### Publishing Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ ELIZA AGENT (Current Broadcast System)                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. process-unprocessed-docs.js                                 │
│     - Processes research documents                              │
│     - Creates broadcasts for Telegram/Bluesky (400-600 chars)  │
│     - Alignment scoring (0.08-0.30 range)                       │
│     - Status: 'pending' in broadcasts table                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ NEW: WORDPRESS PUBLISHER                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  2. publish-to-wordpress.js (NEW SCRIPT)                        │
│     - Query: broadcasts WHERE alignment_score >= 0.20           │
│              AND wordpress_published IS NULL                     │
│     - Fetch full source document from 'documents' table         │
│     - Generate rich 800-1200 word article                       │
│     - Generate featured image via Gemini V2                     │
│     - Upload image to WordPress media library                   │
│     - Map bio theme → WordPress category ID                     │
│     - Create post via WordPress REST API                        │
│     - Update broadcast: wordpress_published = true              │
│     - Update broadcast: wordpress_post_id = [wp_post_id]        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ WORDPRESS SITE (http://localhost:8885 → ai10bro.com)           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  3. WordPress REST API (/wp-json/wp/v2/insight)                 │
│     - Receives post data from Eliza                             │
│     - Creates post with featured image                          │
│     - Sets categories (bio themes), tags (entities)             │
│     - Status: 'publish' (or 'draft' for review)                 │
│     - Yoast SEO auto-generates meta tags                        │
│                                                                  │
│  4. Post-Publish Actions                                        │
│     - Sitemap updated automatically                             │
│     - RSS feed regenerated                                      │
│     - Social sharing (future: n8n workflow)                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Database Schema Updates

**Add columns to `broadcasts` table:**
```sql
ALTER TABLE broadcasts ADD COLUMN wordpress_published BOOLEAN DEFAULT FALSE;
ALTER TABLE broadcasts ADD COLUMN wordpress_post_id INTEGER;
ALTER TABLE broadcasts ADD COLUMN wordpress_published_at DATETIME;
ALTER TABLE broadcasts ADD COLUMN wordpress_status TEXT; -- 'draft', 'publish', 'error'
ALTER TABLE broadcasts ADD COLUMN wordpress_error TEXT; -- Error message if publish failed
```

### WordPress REST API Endpoints

**Authentication:** Application Password
- Generate in WordPress: Users → Profile → Application Passwords
- Store in `.env.wordpress`:
  ```
  WP_BASE_URL=http://localhost:8885
  WP_USERNAME=admin
  WP_APP_PASSWORD=xxxx xxxx xxxx xxxx xxxx xxxx
  ```

**Create Daily Insight Post:**
```javascript
POST {WP_BASE_URL}/wp-json/wp/v2/insight
Authorization: Basic base64(username:app_password)
Content-Type: application/json

{
  "title": "Carverr's DNA Barcodes Enable Farm-to-Table Food Tracing at Scale",
  "content": "<p>Full HTML article content...</p>",
  "excerpt": "First 160 characters for meta description and card previews",
  "status": "publish", // or "draft" for manual review
  "bio_theme": [3], // Array of term IDs (biomimicry = 3)
  "featured_media": 123, // Uploaded image ID
  "meta": {
    "_alignment_score": "0.26",
    "_source_url": "https://techcrunch.com/...",
    "_eliza_document_id": "uuid-here",
    "_read_time": "4 min read"
  }
}
```

**Upload Featured Image:**
```javascript
POST {WP_BASE_URL}/wp-json/wp/v2/media
Authorization: Basic base64(username:app_password)
Content-Type: multipart/form-data

file: [binary image data from Gemini V2]
title: "Featured image: DNA barcode technology"
alt_text: "Microscopic view of DNA double helix with digital barcode overlay"
```

**WordPress Category Mapping:**
```javascript
// Bio theme slug → WordPress term ID
const THEME_MAPPING = {
  'biomimicry': 3,
  'synbio': 4,
  'materials': 5,
  'energy': 6,
  'agtech': 7,
  'health': 8,
  'ai': 9,
  'innovation': 10,
  'environment': 11,
  'space': 12,
  'manufacturing': 13
};
```

---

## Implementation Plan

### Phase 1: Core Publishing (This Session)

**File to Create:** `publish-to-wordpress.js`

**Features:**
1. ✅ Query broadcasts with alignment >= 0.20 not yet published
2. ✅ Fetch full source document content
3. ✅ Generate 800-1200 word article using enhanced prompt
4. ✅ Generate featured image via Gemini V2 (reuse existing script)
5. ✅ Upload image to WordPress media library
6. ✅ Create WordPress post via REST API
7. ✅ Update broadcasts table with WordPress metadata
8. ✅ Error handling and retry logic
9. ✅ Logging for debugging

**Configuration:**
- Environment variables in `.env.wordpress`
- WordPress authentication
- Dry-run mode for testing
- Limit parameter (e.g., process 5 posts per run)

**CLI Usage:**
```bash
# Test mode (creates drafts only)
node publish-to-wordpress.js --dry-run --limit=1

# Production mode (publishes immediately)
node publish-to-wordpress.js --limit=5

# Process specific broadcast ID
BROADCAST_ID=uuid node publish-to-wordpress.js
```

### Phase 2: Automation (Next Session)

**Cron Integration:**
```bash
# Add to crontab: Publish to WordPress every 2 hours
0 */2 * * * cd /Users/davidlockie/Documents/Projects/Eliza && node publish-to-wordpress.js --limit=3 >> logs/wordpress-publish.log 2>&1
```

**Monitoring:**
- Dashboard widget showing WordPress publish stats
- Webhook notifications for publish failures
- Daily summary email (posts published, errors)

### Phase 3: Enhancements (Backlog)

**Auto-Posting to Social Media:**
- n8n workflow: WordPress new post → tweet → LinkedIn → Bluesky
- Or use Jetpack Publicize plugin (paid)

**Content Optimization:**
- Internal linking: Find related posts by bio_theme, auto-suggest links
- Entity extraction: Auto-tag company names, researcher names
- Image variations: Generate multiple sizes for responsive design

**Analytics Integration:**
- Track Eliza post → WP publish → traffic correlation
- Identify high-performing themes for content prioritization
- A/B test article structures (headline styles, length)

---

## Rich Article Generation

### Prompt Engineering

**Input:** Broadcast content (400-600 chars) + Full source document

**Output:** 800-1200 word Daily Insight article

**Prompt Template:**
```
You are AI10BRO, a science journalism AI specializing in bio/sustainability/tech innovations.

TASK: Transform this broadcast into a comprehensive 800-1200 word Daily Insight article.

BROADCAST:
{broadcast_content}

SOURCE DOCUMENT:
{full_document_text}

ARTICLE STRUCTURE:

1. HOOK (1-2 sentences)
Write a compelling opening that captures the breakthrough. Use one of these styles:
- Direct news lead: "[Company] just cracked the code for..."
- Impact first: "Your [x] could [outcome] thanks to..."
- Problem-solution: "The [problem] just met its match..."
- Future vision: "By [year], [outcome] could become reality..."

2. OVERVIEW (2-3 paragraphs, ~200 words)
- Who: Company/research institution
- What: The innovation/breakthrough
- When: Timeline/announcement date
- Where: Location/facility
- Key numbers/facts

3. CONTEXT & DETAILS (3-4 paragraphs, ~300 words)
- How does the technology work? (Accessible explanation)
- What makes it novel/significant?
- Technical details (avoid jargon, use analogies)
- Comparison to existing approaches

4. WHY IT MATTERS (2-3 paragraphs, ~200 words)
- Industry implications
- Potential impact on sustainability/bio sector
- Market opportunity/size
- Regulatory or policy context (if relevant)

5. RELATED DEVELOPMENTS (1-2 paragraphs, ~100 words)
- Mention similar innovations in the space
- Broader trend context
- Internal linking opportunities (mention other AI10BRO-covered companies/topics)

6. LOOKING AHEAD (1 paragraph, ~100 words)
- Future milestones
- Timeline to commercialization/scaling
- What to watch for

7. SOURCE & FURTHER READING
- Link to original source
- Related research papers or company pages

TONE: Informative journalism (like TechCrunch, Axios, MIT Technology Review)
- Not academic, not hype
- Credible but accessible
- Optimistic but grounded

STYLE:
- Short paragraphs (2-4 sentences each)
- H2 subheadings for each section
- H3 for subsections if needed
- Bullet lists for key points (sparingly)
- Natural keyword integration (bio theme terms)
- No fluff, no repetition

SEO REQUIREMENTS:
- Include primary keyword in first paragraph
- Use bio theme terminology naturally throughout
- Suggest 2-3 internal link opportunities (format: "As we covered in [topic]...")
- Meta description: Extract best 150-160 char summary for excerpt

OUTPUT FORMAT: HTML with <p>, <h2>, <h3>, <ul>, <li>, <strong>, <em> tags only.
DO NOT include title or meta tags (WordPress handles those).

Generate the article now:
```

### Example Transformation

**Input (Broadcast - 520 chars):**
```
Carverr Technologies has achieved a breakthrough in DNA-based food tracing that could finally bring true farm-to-table transparency. Their DNA barcode system now tracks products across 47 food processing facilities in real-time, using edible DNA markers that survive cooking, freezing, and processing. Early pilot programs show 99.8% accuracy in tracking salmon from Norwegian farms through Asian processing facilities to US supermarkets. The system costs just $0.003 per product, making it economically viable for mass adoption.

https://techcrunch.com/2025/01/15/carverr-dna-food-tracing
```

**Output (Daily Insight - 1,150 words):**
```html
<p>Carverr Technologies has achieved a breakthrough that could finally answer the question on every grocery shopper's mind: Where did this food actually come from?</p>

<h2>DNA Barcodes That Survive the Journey</h2>

<p>The San Francisco-based biotech has developed a DNA-based tracking system that follows food products from farm to supermarket shelf—through every processing facility, freezer, and cooking step along the way. Unlike traditional QR codes or RFID tags that can be swapped or removed, Carverr's DNA markers become part of the food itself.</p>

<p>The system is now operational across 47 food processing facilities, primarily tracking high-value products like seafood and organic produce. Early pilot programs report 99.8% accuracy, with DNA markers successfully traced through salmon that traveled from Norwegian fish farms through Asian processing facilities to US supermarkets—a journey involving multiple temperature changes, processing steps, and international borders.</p>

<p>The technology's killer feature: cost. At just $0.003 per product (about one-third of a cent), it's cheap enough for mass-market adoption. That's orders of magnitude less expensive than existing traceability solutions, which typically cost $0.05-0.20 per item.</p>

<h2>How Edible DNA Barcoding Works</h2>

<p>Carverr's approach uses synthetic DNA sequences as unique identifiers—essentially biological barcodes. Each batch of food gets tagged with a specific DNA sequence that corresponds to its origin: the farm, harvest date, processing facility, and supply chain route.</p>

<p>The DNA markers are encapsulated in food-grade protective shells that survive:</p>

<ul>
<li>Cooking temperatures up to 200°C (392°F)</li>
<li>Freezing down to -40°C</li>
<li>High-pressure processing</li>
<li>Chemical treatments (washing, sanitizing)</li>
<li>Months of storage</li>
</ul>

<p>To verify a product's origin, inspectors or retailers take a tiny sample (invisible to consumers), extract the DNA, and sequence it using portable sequencers. The entire verification process takes about 15 minutes—fast enough for real-time supply chain checks.</p>

<p>The DNA itself is completely safe to eat. It's the same type of molecule already present in all food (plants and animals are made of DNA), and the synthetic sequences are carefully designed to be non-functional, meaning they don't code for any proteins or have any biological activity.</p>

<h2>Why Food Traceability Matters Now</h2>

<p>Food fraud is a $40 billion annual problem globally. From mislabeled seafood (studies show 20-30% of fish is mislabeled) to counterfeit organic produce to undisclosed supply chain intermediaries, the current system relies heavily on trust and paper records that are easy to falsify.</p>

<p>Recent outbreaks have highlighted the vulnerability. When romaine lettuce or ground beef causes illness, health officials often struggle to pinpoint the exact source because supply chains are opaque. Products from multiple farms get mixed at processing facilities, making it nearly impossible to trace contamination back to a specific field or batch.</p>

<p>Consumers increasingly want to know not just where food comes from, but how it was produced. The organic certification market alone is worth $120 billion globally, but current verification methods are labor-intensive and vulnerable to fraud.</p>

<h3>The Sustainability Angle</h3>

<p>Beyond fraud prevention, DNA tracing enables verification of sustainability claims. Seafood products can be verified as sustainably caught, coffee as fair-trade, or beef as grass-fed—all with scientific certainty rather than relying on self-reported certifications.</p>

<p>For carbon footprint tracking, DNA barcoding provides ground truth data about supply chain distances and intermediaries, making it possible to calculate accurate product-level emissions.</p>

<h2>Market Adoption and Competition</h2>

<p>Carverr isn't the only company pursuing molecular traceability. Applied DNA Sciences has been using DNA markers for cotton and other materials, while Haelixa focuses on textile authentication. But Carverr appears first to achieve the price point and durability needed for mass-market food applications.</p>

<p>The company has raised $23 million in funding from Flagship Pioneering and SOSV, with pilots already running at major US seafood distributors and organic produce suppliers. Target customers include:</p>

<ul>
<li>Premium seafood suppliers (salmon, tuna, shellfish)</li>
<li>Organic produce distributors</li>
<li>Fair-trade coffee and chocolate companies</li>
<li>High-end meat producers (grass-fed beef, heritage pork)</li>
</ul>

<p>Regulatory approval is straightforward because the DNA molecules are considered "processing aids" rather than additives, falling under existing FDA frameworks. The EU has indicated similar classification.</p>

<h2>Looking Ahead: Blockchain for Biology</h2>

<p>Carverr plans to expand from 47 to 500 facilities by end of 2025, covering an estimated 15% of premium seafood and 8% of organic produce in North America. The company is also developing consumer-facing verification—imagine scanning a QR code at the grocery store and seeing your salmon's complete journey, verified by DNA analysis.</p>

<p>The longer-term vision: making supply chain transparency the default rather than the exception. As DNA sequencing technology continues to drop in price (following the same cost curve as computer chips), widespread verification becomes feasible. Within five years, DNA-based traceability could be standard across most packaged food.</p>

<p>For now, Carverr's breakthrough suggests we're moving from an era of "trust me" food sourcing to one of "verify scientifically." Whether that leads to meaningfully better food systems—or just more expensive verification overhead—depends on how the technology gets deployed and who controls access to the data.</p>

<h2>Source & Further Reading</h2>

<p><a href="https://techcrunch.com/2025/01/15/carverr-dna-food-tracing">Original report: TechCrunch</a></p>
<p>Related coverage: <a href="https://ai10bro.com/topic/biomimicry">Biomimicry innovations</a> | <a href="https://ai10bro.com/topic/agtech">AgTech developments</a></p>
```

---

## Quality Criteria

**Articles MUST include:**
- ✅ Compelling hook in first 1-2 sentences
- ✅ Factual accuracy (verified against source)
- ✅ Clear explanation of technology (accessible, not academic)
- ✅ Industry/market context (why it matters)
- ✅ Proper HTML formatting with semantic tags
- ✅ 2-3 internal link opportunities mentioned
- ✅ Suggested excerpt (150-160 chars)

**Articles MUST NOT include:**
- ❌ Repetitive content or fluff
- ❌ Overly academic language or jargon
- ❌ Unsubstantiated hype or speculation
- ❌ AI-isms like "It's important to note" or "delve into"
- ❌ Generic conclusions like "Only time will tell"

**Word Count Targets:**
- Minimum: 800 words
- Target: 900-1100 words
- Maximum: 1200 words
- If source lacks depth → research company/technology for additional context

---

## Error Handling

**Scenarios to handle:**

1. **WordPress API connection failure**
   - Retry 3x with exponential backoff
   - Log error with broadcast ID
   - Mark broadcast.wordpress_status = 'error'
   - Alert via webhook or email

2. **Image generation/upload failure**
   - Fall back to placeholder image
   - Or skip featured_media and publish text-only
   - Log for manual image addition later

3. **Article generation produces low-quality output**
   - Length < 800 words: Flag for manual review (draft status)
   - Missing key sections: Regenerate with stricter prompt
   - Contains AI-isms: Post-process to remove common patterns

4. **Duplicate content detection**
   - Check if similar article already exists in WordPress
   - Compare title similarity + bio_theme overlap
   - Skip publish if >80% title match found

5. **Authentication failure**
   - Check .env.wordpress credentials
   - Verify Application Password hasn't expired
   - Alert immediately (blocks all publishing)

**Logging:**
```
logs/wordpress-publish.log
logs/wordpress-errors.log
logs/gemini-image-generation.log
```

---

## Testing Strategy

### Phase 1: Local Testing

1. **Test WordPress REST API connection**
   ```bash
   curl -u admin:APP_PASSWORD http://localhost:8885/wp-json/wp/v2/insight
   ```

2. **Test image upload**
   ```bash
   node test-wordpress-image-upload.js
   ```

3. **Test article generation**
   - Input: Sample broadcast from database
   - Output: Validate HTML structure, word count, quality

4. **Test full publish flow (dry-run)**
   ```bash
   node publish-to-wordpress.js --dry-run --broadcast-id=UUID
   ```

5. **Test full publish flow (create draft)**
   ```bash
   node publish-to-wordpress.js --status=draft --limit=1
   ```

6. **Verify in WordPress**
   - Check post appears at http://localhost:8885/wp-admin
   - Verify featured image attached
   - Verify bio_theme category set correctly
   - Verify custom fields (alignment_score, source_url)

### Phase 2: Production Testing

1. **Gradual rollout**
   - Week 1: Publish 1 post/day as drafts (manual review)
   - Week 2: Publish 3 posts/day as drafts
   - Week 3: Auto-publish 1 post/day
   - Week 4: Auto-publish 3-5 posts/day

2. **Quality monitoring**
   - Manual review of first 20 published articles
   - User testing (readability, engagement)
   - SEO analysis (keyword targeting, internal links)

3. **Performance monitoring**
   - WordPress site performance under load
   - Database query optimization
   - Image CDN setup (Cloudflare Images)

---

## Success Metrics

**Technical:**
- 95%+ successful publish rate (no errors)
- <30 seconds average publish time per article
- 0 duplicate content issues
- 100% featured image attachment rate

**Content Quality:**
- 800-1200 word range maintained
- Manual review approval rate >90%
- Internal linking: 2-3 links per article
- SEO score: 70+ (Yoast/Rank Math)

**Business Impact:**
- 90-150 articles published/month (3-5/day automated)
- 50%+ traffic from organic search (within 6 months)
- Avg. 2min+ time on page
- <40% bounce rate

---

## Next Steps

**Immediate (This Session):**
1. ✅ Create `WORDPRESS_INTEGRATION_SPEC.md` (this document)
2. ⏳ Create `publish-to-wordpress.js` script
3. ⏳ Create `.env.wordpress` with credentials
4. ⏳ Test REST API connection
5. ⏳ Test image upload
6. ⏳ Publish first test article (draft mode)

**Next Session:**
- Add WordPress publish stats to dashboard
- Set up cron job for automated publishing
- Monitor first week of automated posts
- Adjust quality thresholds based on results

**Future:**
- Social media auto-posting (n8n workflow)
- Internal linking automation
- Entity extraction and auto-tagging
- Analytics integration

---

**Last Updated:** 2025-12-11
**Status:** Ready for implementation
**Owner:** AI10BRO Eliza Agent
